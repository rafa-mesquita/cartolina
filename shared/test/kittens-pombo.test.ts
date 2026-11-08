import { describe, expect, it } from 'vitest';
import { KITTENS_BICHOS, kittensKindOf } from '../src/games/kittens/cards';
import { KITTENS_POMBO_CARDS } from '../src/games/kittens/combos';
import { settleKittens } from '../src/games/kittens/settle';
import type { KittensAction, KittensState } from '../src/games/kittens/types';
import { kittensViewFor } from '../src/games/kittens/view';
import { T0, act, ctxOf, ids, refuse, table } from './kittens-helpers';

/** Pombo-correio (pedido do Rafa, 2026-11-08). */
const at = (ms: number, seed = 1) => ctxOf(ids(3), { now: T0 + ms, seed });
const PAIR: KittensAction = { type: 'play', cards: ['pombo-0', 'pombo-1'] };
const DRAW = ['cafune-9', 'quati-9', 'mico-9', 'pular-9'];
const DISCARD = ['ataque-5', 'favor-5', 'espiar-5', 'nemvem-5', 'pular-5', 'mico-5', 'quati-5'];

function mailed(discard: string[] = DISCARD, seed = 1, extra: Partial<KittensState> = {}): KittensState {
  const s = { ...table({ hands: { p0: ['pombo-0', 'pombo-1', 'favor-0'], p1: ['ataque-1'], p2: ['espiar-2'] }, draw: DRAW, discard }), ...extra };
  return settleKittens(act(s, 'p0', PAIR, at(0, seed)), at(5000, seed));
}

describe('par de Pombo-correio', () => {
  it('é bicho da pool, com 4 cartas por pacote como os outros', () => {
    expect(KITTENS_BICHOS).toContain('pombo');
    expect(KITTENS_POMBO_CARDS).toBe(5);
  });

  it('5 cartas sorteadas do descarte de antes da jogada voltam pro monte, uma no topo; a vez continua', () => {
    const s = mailed();
    const back = DISCARD.filter((c) => !s.discard.includes(c));
    expect(back).toHaveLength(5);
    for (const c of back) expect(s.draw).toContain(c);
    expect(back).toContain(s.draw.at(-1));
    expect(s.draw).toHaveLength(DRAW.length + 5);
    // As cartas do próprio par vão pro descarte, não pro monte.
    expect(s.discard).toEqual(expect.arrayContaining(['pombo-0', 'pombo-1']));
    expect(s.draw).not.toContain('pombo-0');
    // As 2 que sobraram no descarte continuam lá.
    expect(s.discard.filter((c) => DISCARD.includes(c))).toHaveLength(2);
    expect(s).toMatchObject({ current: 'p0', owed: 1, choice: null, pending: null });
    // O monte de antes continua na mesma ordem relativa (as que voltaram entram entre elas).
    expect(s.draw.filter((c) => DRAW.includes(c))).toEqual(DRAW);
  });

  it('o diário diz os tipos que voltaram (públicos), em ordem alfabética, sem os ids e sem dizer qual foi pro topo', () => {
    const s = mailed();
    const ev = s.log.at(-1)!.ev;
    expect(s.log.at(-1)!.seenBy).toBeNull();
    const back = DISCARD.filter((c) => !s.discard.includes(c));
    expect(ev).toEqual({ t: 'mailed', by: 'p0', kinds: back.map((c) => kittensKindOf(c)!).sort() });
    for (const viewer of ['p0', 'p1', null]) {
      const json = JSON.stringify(kittensViewFor(s, viewer));
      for (const c of back) expect(json).not.toContain(`"${c}"`);
    }
  });

  it('a carta do topo e as posições mudam com o sorteio', () => {
    const tops = new Set<string>();
    const places = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const s = mailed(DISCARD, seed);
      tops.add(s.draw.at(-1)!);
      places.add(s.draw.join());
    }
    expect(tops.size).toBeGreaterThan(2);
    expect(places.size).toBeGreaterThan(10);
  });

  it('menos de 5 no descarte: vão todas; descarte vazio: nada acontece', () => {
    const few = mailed(['ataque-5', 'favor-5']);
    expect(few.discard.filter((c) => c === 'ataque-5' || c === 'favor-5')).toEqual([]);
    expect(few.draw).toHaveLength(DRAW.length + 2);
    const empty = mailed([]);
    expect(empty.draw).toEqual(DRAW);
    expect(empty.log.at(-1)!.ev).toEqual({ t: 'mailed', by: 'p0', kinds: [] });
  });

  it('o monte mudou de ordem: as espiadas de todos somem, como no Embaralhar', () => {
    const s = mailed(DISCARD, 1, { peeks: { p0: ['pular-9', 'mico-9'], p1: ['pular-9'] } });
    expect(s.peeks).toEqual({});
    // Descarte vazio: o monte não mudou, as espiadas ficam.
    const empty = mailed([], 1, { peeks: { p1: ['pular-9'] } });
    expect(empty.peeks).toEqual({ p1: ['pular-9'] });
  });

  it('Nem vem! cancela: nada volta pro monte', () => {
    const s = table({ hands: { p0: ['pombo-0', 'pombo-1'], p1: ['nemvem-1'], p2: [] }, draw: DRAW, discard: DISCARD });
    const air = act(s, 'p0', PAIR, at(0));
    const noped = settleKittens(act(air, 'p1', { type: 'nope' }, at(1000)), at(7000));
    expect(noped.draw).toEqual(DRAW);
    expect(noped.log.some((e) => e.ev.t === 'mailed')).toBe(false);
  });

  it('Boto completa o par, e fora dos bichos da partida o par não vale', () => {
    const s = table({ hands: { p0: ['pombo-0', 'boto-0'], p1: [], p2: [] }, draw: DRAW, discard: DISCARD });
    const air = act(s, 'p0', { type: 'play', cards: ['pombo-0', 'boto-0'] }, at(0));
    expect(air.pending!.play).toMatchObject({ kind: 'par', as: 'pombo' });
    const without = { ...s, bichos: KITTENS_BICHOS.filter((b) => b !== 'pombo') };
    expect(refuse(without, 'p0', { type: 'play', cards: ['pombo-0', 'boto-0'] }, at(0))).toMatch(/^bad_/);
  });
});
