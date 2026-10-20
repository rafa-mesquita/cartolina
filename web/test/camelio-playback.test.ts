import { describe, expect, it } from 'vitest';
import type { CamelioView } from '@cartolina/shared';
import { MAX_BEHIND, emptyPlayback, finish, receive, step, type Playback } from '../src/games/camelio/playback';
import { camelioView, patchGame, playTurn, started } from './camelio-fixtures';

/** Views v0, v1, v2, v3… de jogadas seguidas da mesma partida. */
function views(n: number): CamelioView[] {
  let room = started(2);
  const out = [camelioView(room, 'p0').game];
  for (let i = 1; i < n; i++) {
    room = playTurn(room);
    out.push(camelioView(room, 'p0').game);
  }
  return out;
}

const at = (vs: CamelioView[], i: number): CamelioView => vs[i]!;

/** Começa a animar `prev → next` (o que a tela faria ao receber `next`). */
function animating(prev: CamelioView, next: CamelioView): Playback {
  return step(receive(receive(emptyPlayback, prev), next)).playback;
}

describe('fila de animação do Cama-Leão', () => {
  it('a primeira view é mostrada direto, sem nada pra animar', () => {
    const v = views(1);
    const p = receive(emptyPlayback, at(v, 0));
    expect(p.shown).toBe(at(v, 0));
    expect(step(p).anim).toBeNull();
    expect(p.animating).toBe(false);
  });

  it('uma jogada nova anima da view mostrada até a nova; shown só muda no finish', () => {
    const v = views(2);
    const p = receive(receive(emptyPlayback, at(v, 0)), at(v, 1));
    const { playback, anim } = step(p);
    expect(anim).toEqual({ prev: at(v, 0), next: at(v, 1) });
    expect(playback.animating).toBe(true);
    expect(playback.shown).toBe(at(v, 0));
    const done = finish(playback);
    expect(done.shown).toBe(at(v, 1));
    expect(done.animating).toBe(false);
  });

  it('jogada que chega durante a animação entra na fila e anima depois', () => {
    const v = views(3);
    let p = animating(at(v, 0), at(v, 1));
    p = receive(p, at(v, 2));
    expect(p.queue).toHaveLength(2);
    p = finish(p);
    expect(p.shown).toBe(at(v, 1));
    const { playback, anim } = step(p);
    expect(anim).toEqual({ prev: at(v, 1), next: at(v, 2) });
    expect(playback.animating).toBe(true);
  });

  it('view sem jogada nova durante a animação substitui o fim da fila', () => {
    const v = views(2);
    const p = animating(at(v, 0), at(v, 1));
    const fresh: CamelioView = { ...at(v, 1), paused: true };
    const q = receive(p, fresh);
    expect(q.queue).toEqual([fresh]);
    expect(q.shown).toBe(at(v, 0));
    expect(finish(q).shown).toBe(fresh);
  });

  it('view sem jogada nova com a fila crescida troca só a última', () => {
    const v = views(3);
    let p = animating(at(v, 0), at(v, 1));
    p = receive(p, at(v, 2));
    const fresh: CamelioView = { ...at(v, 2), paused: true };
    p = receive(p, fresh);
    expect(p.queue).toEqual([at(v, 1), fresh]);
  });

  it('sem animação, view sem jogada nova troca shown direto', () => {
    const v = views(1);
    const fresh: CamelioView = { ...at(v, 0), paused: true };
    const p = receive(receive(emptyPlayback, at(v, 0)), fresh);
    expect(p.shown).toBe(fresh);
    expect(p.queue).toEqual([]);
    expect(step(p).anim).toBeNull();
  });

  it('mais de MAX_BEHIND jogadas atrasadas: fila vira só a última e entra sem animar', () => {
    const v = views(MAX_BEHIND + 2);
    let p = animating(at(v, 0), at(v, 1));
    for (let i = 2; i < v.length; i++) p = receive(p, at(v, i));
    const last = at(v, v.length - 1);
    expect(p.queue).toEqual([last]);
    p = finish(p);
    expect(p.shown).toBe(last);
    const { playback, anim } = step(p);
    expect(anim).toBeNull();
    expect(playback.shown).toBe(last);
  });

  it('match diferente entra sem animar', () => {
    const [v0, v1] = views(2);
    const other: CamelioView = { ...v1!, match: v0!.match + 1, playCount: v0!.playCount + 1 };
    const { playback, anim } = step(receive(receive(emptyPlayback, v0!), other));
    expect(anim).toBeNull();
    expect(playback.shown).toBe(other);
    expect(playback.animating).toBe(false);
  });

  it('playCount pulando (reconectou) entra sem animar', () => {
    const v = views(4);
    const { playback, anim } = step(receive(receive(emptyPlayback, at(v, 0)), at(v, 3)));
    expect(anim).toBeNull();
    expect(playback.shown).toBe(at(v, 3));
  });

  it('partida nova com playCount voltando a 0 não anima', () => {
    const v = views(3);
    const fresh = camelioView(patchGame(started(2), { match: at(v, 2).match + 1 }), 'p0').game;
    const { playback, anim } = step(receive(receive(emptyPlayback, at(v, 2)), fresh));
    expect(anim).toBeNull();
    expect(playback.shown).toBe(fresh);
  });
});
