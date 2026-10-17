import { COORDS, readyError, roomAction, mulberry32 } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { decidePictures, isSlowBot } from '../src/dev/picturesBots';
import { guessing, picturesView, play, revealed, started, stateOf } from './pictures-fixtures';

const rng = () => 0.5;
const HOST_ACTIONS = ['start', 'next', 'hurry', 'again', 'lobby'];

describe('decisão do bot do Retratim', () => {
  it('na montagem, manda pronto com uma obra válida do kit dele, numa ação só', () => {
    const room = started(3);
    const st = stateOf(room);
    const me = st.inRound[1]!;
    const d = decidePictures(picturesView(room, me), rng)!;
    expect(d.actions).toHaveLength(1);
    const a = d.actions[0] as { type: string; on: boolean; work: { kit: string } };
    expect(a).toMatchObject({ type: 'ready', on: true });
    expect(a.work.kit).toBe(st.kits[me]);
    expect(readyError(a.work as never)).toBeNull();
    // o servidor aceita a ação
    const res = roomAction(room, me, d.actions[0]!, mulberry32(1), 0);
    expect(res.ok).toBe(true);
  });

  it('espera de 3 a 9 s na montagem', () => {
    const room = started(3);
    const me = stateOf(room).inRound.find((p) => !isSlowBot(0, p))!;
    const lo = decidePictures(picturesView(room, me), () => 0)!.delay;
    const hi = decidePictures(picturesView(room, me), () => 0.999)!.delay;
    expect(lo).toBe(3000);
    expect(hi).toBeGreaterThan(8900);
    expect(hi).toBeLessThanOrEqual(9000);
  });

  it('um bot em cada 4 espera 40 s, e o sorteio é estável (mesma rodada, mesmo bot, mesma resposta)', () => {
    const ids = Array.from({ length: 400 }, (_, i) => `p${i}`);
    const slow = ids.filter((p) => isSlowBot(0, p));
    expect(slow.length).toBeGreaterThan(60);
    expect(slow.length).toBeLessThan(140);
    expect(ids.filter((p) => isSlowBot(0, p))).toEqual(slow);
    // muda de uma rodada pra outra
    expect(ids.filter((p) => isSlowBot(1, p))).not.toEqual(slow);
    // e a decisão acompanha o sorteio, qualquer que seja o rng dos atrasos
    const room = started(3);
    for (const me of stateOf(room).inRound) {
      const delays = [0, 0.3, 0.999].map((r) => decidePictures(picturesView(room, me), () => r)!.delay);
      if (isSlowBot(0, me)) expect(delays).toEqual([40_000, 40_000, 40_000]);
      else expect(Math.max(...delays)).toBeLessThanOrEqual(9000);
    }
  });

  it('já pronto, na montagem, não faz nada', () => {
    let room = started(3);
    const me = stateOf(room).inRound[0]!;
    const w = (decidePictures(picturesView(room, me), rng)!.actions[0] as unknown as { work: never }).work;
    room = play(room, me, { type: 'ready', on: true, work: w });
    expect(decidePictures(picturesView(room, me), rng)).toBeNull();
  });

  it('no palpite, dá um guess por obra alheia (coordenada válida) e confirma; espera de 4 a 12 s', () => {
    const room = guessing(4);
    const st = stateOf(room);
    const me = st.inRound[2]!;
    const d = decidePictures(picturesView(room, me), rng)!;
    const guesses = d.actions.slice(0, -1) as { type: string; artist: string; coord: string }[];
    expect(d.actions.at(-1)).toEqual({ type: 'confirm' });
    expect(guesses.map((g) => g.artist).sort()).toEqual(st.inRound.filter((p) => p !== me).sort());
    expect(guesses.every((g) => g.type === 'guess' && (COORDS as readonly string[]).includes(g.coord))).toBe(true);
    expect(decidePictures(picturesView(room, me), () => 0)!.delay).toBe(4000);
    expect(decidePictures(picturesView(room, me), () => 0.999)!.delay).toBeLessThanOrEqual(12_000);
    // o servidor aceita tudo
    let r = room;
    for (const a of d.actions) {
      const res = roomAction(r, me, a, mulberry32(1), 0);
      expect(res.ok).toBe(true);
      if (res.ok) r = res.room;
    }
    expect(stateOf(r).confirmed).toContain(me);
  });

  it('já confirmado, no palpite, não faz nada', () => {
    let room = guessing(3);
    const me = stateOf(room).inRound[0]!;
    room = play(room, me, { type: 'confirm' });
    expect(decidePictures(picturesView(room, me), rng)).toBeNull();
  });

  it('não faz nada na revelação, no lobby, de espectador nem com a mesa pausada', () => {
    const rev = revealed(3);
    expect(decidePictures(picturesView(rev, stateOf(rev).inRound[0]!), rng)).toBeNull();
    const room = started(3);
    expect(decidePictures(picturesView(room, null), rng)).toBeNull();
    expect(decidePictures(picturesView(room, 'ninguem'), rng)).toBeNull();
    const view = picturesView(room, stateOf(room).inRound[0]!);
    expect(decidePictures({ ...view, game: { ...view.game, paused: true } }, rng)).toBeNull();
  });

  it('nunca faz ação de host', () => {
    const rooms = [started(3), guessing(3), revealed(3)];
    for (const room of rooms)
      for (const p of stateOf(room).inRound) {
        const d = decidePictures(picturesView(room, p), rng);
        for (const a of d?.actions ?? []) expect(HOST_ACTIONS).not.toContain(a.type);
      }
  });
});
