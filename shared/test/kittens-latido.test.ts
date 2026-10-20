import { describe, expect, it } from 'vitest';
import { settleKittens } from '../src/games/kittens/settle';
import { KITTENS_CHOICE_MS, type KittensState } from '../src/games/kittens/types';
import { kittensViewFor } from '../src/games/kittens/view';
import { T0, act, ctxOf, everyCard, ids, refuse, table } from './kittens-helpers';

const ctx = ctxOf(ids(3));
const at = (ms: number) => ctxOf(ids(3), { now: T0 + ms });
const DRAW = ['mico-9', 'tatubum-0', 'pular-9', 'tatubum-1'];
const DEADLINE = T0 + 5000 + KITTENS_CHOICE_MS;

/** p0 joga o Latidor `latido-0` e a janela de 5 s passa sem Nem vem!. */
function barked(opts: { hands: Record<string, string[]>; front?: Record<string, string[]>; draw?: string[] }): KittensState {
  const s = table({ hands: opts.hands, front: opts.front, draw: opts.draw ?? DRAW });
  return settleKittens(act(s, 'p0', { type: 'play', cards: ['latido-0'] }, ctx), at(5000));
}

describe('Tatu Latidor', () => {
  it('ninguém mais tem o outro: o Latidor fica na frente de quem jogou (à vista) e a vez continua', () => {
    const s = barked({ hands: { p0: ['latido-0', 'mico-0'], p1: ['cafune-1'], p2: [] } });
    expect(s.front).toEqual({ p0: ['latido-0'] });
    expect(s.discard).toEqual([]);
    expect(s).toMatchObject({ choice: null, current: 'p0', owed: 1 });
    expect(s.log.at(-1)).toEqual({ n: 2, ev: { t: 'barked', by: 'p0', target: null }, seenBy: null });
    expect(kittensViewFor(s, 'p2').front).toEqual({ p0: ['latido-0'], p1: [], p2: [] });
  });

  it('o outro está na mão de alguém com Desarme: ele tem que jogar o Desarme (escolha pública)', () => {
    const s = barked({ hands: { p0: ['latido-0'], p1: ['mico-1', 'latido-1', 'cafune-1'], p2: ['cafune-2'] } });
    expect(s.choice).toEqual({ kind: 'latido', who: 'p1', deadline: DEADLINE });
    expect(s.log.at(-1)!.ev).toEqual({ t: 'barked', by: 'p0', target: 'p1' });
    expect(kittensViewFor(s, 'p2').choice).toEqual(s.choice);
    expect(refuse(s, 'p0', { type: 'draw' }, at(5000))).toBe('waiting_choice');
    expect(refuse(s, 'p2', { type: 'choose', card: 'cafune-2' }, at(5000))).toBe('not_your_choice');
    expect(refuse(s, 'p1', { type: 'choose', card: 'mico-1' }, at(5000))).toBe('bad_choice');
    expect(refuse(s, 'p1', { type: 'choose' }, at(5000))).toBe('bad_choice');
    const saved = act(s, 'p1', { type: 'choose', card: 'cafune-1' }, at(6000));
    // Os dois Latidores e o Desarme vão pro descarte; a vez continua com quem jogou.
    expect(saved.hands.p1).toEqual(['mico-1']);
    expect(saved.discard).toEqual(['latido-0', 'cafune-1', 'latido-1']);
    expect(saved).toMatchObject({ choice: null, current: 'p0', owed: 1, alive: ['p0', 'p1', 'p2'] });
    expect(saved.log.at(-1)!.ev).toEqual({ t: 'cafune', by: 'p1' });
  });

  it('o outro está na frente de alguém: a mesma defesa, e o da frente vai pro descarte', () => {
    const s = barked({ hands: { p0: ['latido-0'], p1: ['cafune-1'], p2: [] }, front: { p1: ['latido-1'] } });
    expect(s.choice).toMatchObject({ kind: 'latido', who: 'p1' });
    const saved = act(s, 'p1', { type: 'choose', card: 'cafune-1' }, at(6000));
    expect(saved.front.p1).toEqual([]);
    expect(saved.discard).toEqual(['latido-0', 'cafune-1', 'latido-1']);
  });

  it('sem Desarme: explode na hora (mão e Latidor dele pra fora do jogo; sai um tatu do monte)', () => {
    const start = table({ hands: { p0: ['latido-0'], p1: ['mico-1', 'latido-1'], p2: [] }, draw: DRAW });
    const s = settleKittens(act(start, 'p0', { type: 'play', cards: ['latido-0'] }, ctx), at(5000));
    expect(s.alive).toEqual(['p0', 'p2']);
    expect(s.choice).toBeNull();
    expect(s.discard).toEqual(['latido-0']);
    expect(s.out).toEqual(['mico-1', 'latido-1', 'tatubum-0']);
    expect(s.draw.filter((c) => c.startsWith('tatubum'))).toHaveLength(1);
    expect(s.log.slice(-2).map((e) => e.ev)).toEqual([
      { t: 'barked', by: 'p0', target: 'p1' },
      { t: 'boom', by: 'p1' },
    ]);
    expect(s).toMatchObject({ current: 'p0', owed: 1 });
    expect(everyCard(s)).toEqual(everyCard(start));
  });

  it('sem Desarme e com o Latidor na frente: o da frente vai pra fora junto', () => {
    const s = barked({ hands: { p0: ['latido-0'], p1: ['mico-1'], p2: [] }, front: { p1: ['latido-1'] } });
    expect(s.alive).toEqual(['p0', 'p2']);
    expect(s.front.p1 ?? []).toEqual([]);
    expect(s.out).toEqual(expect.arrayContaining(['mico-1', 'latido-1']));
  });

  it('com 2 jogadores, quem explode pelo Latidor perde', () => {
    const s = table({ hands: { p0: ['latido-0'], p1: ['latido-1'] }, draw: ['tatubum-0'] });
    const done = settleKittens(act(s, 'p0', { type: 'play', cards: ['latido-0'] }, ctxOf(ids(2))), ctxOf(ids(2), { now: T0 + 5000 }));
    expect(done).toMatchObject({ phase: 'gameover', winner: 'p0', choice: null });
    expect(everyCard(done)).toEqual(everyCard(s));
  });

  it('prazo vencido: o Desarme vai sozinho', () => {
    const s = barked({ hands: { p0: ['latido-0'], p1: ['latido-1', 'cafune-1'], p2: [] } });
    const late = settleKittens(s, at(5000 + KITTENS_CHOICE_MS));
    expect(late.choice).toBeNull();
    expect(late.discard).toEqual(['latido-0', 'cafune-1', 'latido-1']);
    expect(late.alive).toEqual(['p0', 'p1', 'p2']);
  });

  it('Nem vem! cancela: o Latidor vai pro descarte e ninguém se defende', () => {
    const s = table({ hands: { p0: ['latido-0'], p1: ['latido-1', 'nemvem-1'], p2: [] }, draw: DRAW });
    const air = act(s, 'p0', { type: 'play', cards: ['latido-0'] }, ctx);
    const done = settleKittens(act(air, 'p1', { type: 'nope' }, at(1000)), at(6000));
    expect(done).toMatchObject({ choice: null, front: {}, alive: ['p0', 'p1', 'p2'] });
    expect(done.hands.p1).toEqual(['latido-1']);
    expect(done.discard).toEqual(['latido-0', 'nemvem-1']);
  });

  it('quem tem que se defender cai de vez: o Desarme vai sozinho e ele sai', () => {
    const s = barked({ hands: { p0: ['latido-0'], p1: ['latido-1', 'cafune-1', 'mico-1'], p2: [] } });
    const after = settleKittens(s, ctxOf(['p0', 'p2'], { now: T0 + 6000 }));
    expect(after.alive).toEqual(['p0', 'p2']);
    expect(after.choice).toBeNull();
    expect(after.discard).toEqual(['latido-0', 'cafune-1', 'latido-1']);
    expect(after.out).toEqual(expect.arrayContaining(['mico-1']));
  });

  it('quem sai com um Latidor na frente: ele vai pra fora do jogo', () => {
    const s = table({ hands: { p0: [], p1: ['mico-1'], p2: [] }, front: { p1: ['latido-1'] }, draw: DRAW });
    const after = settleKittens(s, ctxOf(['p0', 'p2'], { now: T0 }));
    expect(after.front.p1 ?? []).toEqual([]);
    expect(after.out).toEqual(expect.arrayContaining(['mico-1', 'latido-1']));
    expect(everyCard(after)).toEqual(everyCard(s));
  });

  it('quem jogou já tem o outro na frente: os dois ficam na frente dele', () => {
    const s = barked({ hands: { p0: ['latido-0'], p1: ['cafune-1'], p2: [] }, front: { p0: ['latido-1'] } });
    expect(s.front.p0).toEqual(['latido-1', 'latido-0']);
    expect(s.choice).toBeNull();
  });

  it('quem está cego (Mau-olhado) se defende mandando qualquer carta virada: o servidor acha o Desarme', () => {
    const s0 = barked({ hands: { p0: ['latido-0'], p1: ['mico-1', 'latido-1', 'cafune-1'], p2: [] } });
    const s = { ...s0, blind: ['p1'] };
    expect(refuse(s, 'p1', { type: 'choose', card: 'cafune-1' }, at(6000))).toBe('blind_pick');
    const saved = act(s, 'p1', { type: 'choose', card: '?0' }, at(6000));
    expect(saved.discard).toEqual(['latido-0', 'cafune-1', 'latido-1']);
    expect(saved.hands.p1).toEqual(['mico-1']);
  });
});
