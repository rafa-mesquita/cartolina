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
  it('ninguém mais tem Latidor: o jogado fica na frente de quem jogou (à vista) e a vez continua', () => {
    const s = barked({ hands: { p0: ['latido-0', 'mico-0'], p1: ['cafune-1'], p2: [] } });
    expect(s.front).toEqual({ p0: ['latido-0'] });
    expect(s.discard).toEqual([]);
    expect(s).toMatchObject({ choice: null, current: 'p0', owed: 1 });
    expect(s.log.at(-1)).toEqual({ n: 2, ev: { t: 'barked', by: 'p0', target: null }, seenBy: null });
    expect(kittensViewFor(s, 'p2').front).toEqual({ p0: ['latido-0'], p1: [], p2: [] });
  });

  it('outro Latidor na mão de alguém com Desarme: ele tem que jogar o Desarme (escolha pública)', () => {
    const s = barked({ hands: { p0: ['latido-0'], p1: ['mico-1', 'latido-1', 'cafune-1'], p2: ['cafune-2'] } });
    expect(s.choice).toEqual({ kind: 'latido', who: 'p1', by: 'p0', deadline: DEADLINE });
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

  it('outro Latidor na frente de alguém: a mesma defesa, e o da frente vai pro descarte', () => {
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

  it('quem jogou já tem outro na frente: os dois ficam na frente dele (quem jogou não é alvo de si mesmo)', () => {
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

describe('Tatu Latidor: todos que têm se defendem (pedido do Rafa, 2026-10-21)', () => {
  const ctx4 = ctxOf(ids(4));
  const at4 = (ms: number) => ctxOf(ids(4), { now: T0 + ms });
  const DRAW4 = ['mico-9', 'tatubum-0', 'pular-9', 'tatubum-1', 'tatubum-2'];
  const targets = (s: KittensState) => s.log.flatMap((e) => (e.ev.t === 'barked' ? [e.ev.target] : []));

  /** `by` joga o Latidor `latido-0` numa mesa de 4 e a janela de 5 s passa sem Nem vem!. */
  function barked4(by: string, hands: Record<string, string[]>, front: Record<string, string[]> = {}): KittensState {
    const s = table({ hands, front, draw: DRAW4, current: by });
    return settleKittens(act(s, by, { type: 'play', cards: ['latido-0'] }, ctx4), at4(5000));
  }

  it('um de cada vez, na ordem dos assentos a partir de quem jogou; a vez continua com quem jogou', () => {
    const start = table({
      hands: { p0: ['latido-2', 'cafune-0'], p1: ['latido-1', 'cafune-1', 'mico-1'], p2: ['latido-0'], p3: ['cafune-3'] },
      front: { p3: ['latido-3'] },
      draw: DRAW4,
      current: 'p2',
    });
    const s = settleKittens(act(start, 'p2', { type: 'play', cards: ['latido-0'] }, ctx4), at4(5000));
    // p2 jogou: primeiro o p3, depois o p0, por último o p1.
    expect(s.choice).toEqual({ kind: 'latido', who: 'p3', by: 'p2', deadline: T0 + 5000 + KITTENS_CHOICE_MS });
    expect(targets(s)).toEqual(['p3']);
    expect(refuse(s, 'p0', { type: 'choose', card: 'cafune-0' }, at4(5500))).toBe('not_your_choice');
    expect(refuse(s, 'p2', { type: 'draw' }, at4(5500))).toBe('waiting_choice');

    const s1 = act(s, 'p3', { type: 'choose', card: 'cafune-3' }, at4(6000));
    expect(s1.choice).toEqual({ kind: 'latido', who: 'p0', by: 'p2', deadline: T0 + 6000 + KITTENS_CHOICE_MS });
    expect(s1.front.p3).toEqual([]);
    expect(targets(s1)).toEqual(['p3', 'p0']);

    const s2 = act(s1, 'p0', { type: 'choose', card: 'cafune-0' }, at4(7000));
    expect(s2.choice).toEqual({ kind: 'latido', who: 'p1', by: 'p2', deadline: T0 + 7000 + KITTENS_CHOICE_MS });

    // O p1 não responde: o Desarme vai sozinho e a fila acaba.
    const done = settleKittens(s2, at4(7000 + KITTENS_CHOICE_MS));
    expect(done).toMatchObject({ choice: null, current: 'p2', owed: 1, alive: ['p0', 'p1', 'p2', 'p3'] });
    expect(done.discard).toEqual(['latido-0', 'cafune-3', 'latido-3', 'cafune-0', 'latido-2', 'cafune-1', 'latido-1']);
    expect(done.hands.p1).toEqual(['mico-1']);
    expect(targets(done)).toEqual(['p3', 'p0', 'p1']);
    expect(Object.values(done.stats).map((x) => x.defuses)).toEqual([1, 1, 1]);
    expect(everyCard(done)).toEqual(everyCard(start));
  });

  it('um Desarme basta: todos os Latidores dele (mão e frente) vão pro descarte, e o outro Desarme fica', () => {
    const s = barked4('p0', { p0: ['latido-0'], p1: ['latido-1', 'cafune-1', 'latido-2', 'cafune-2'], p2: [], p3: [] }, { p1: ['latido-3'] });
    expect(s.choice).toMatchObject({ kind: 'latido', who: 'p1' });
    const saved = act(s, 'p1', { type: 'choose', card: 'cafune-1' }, at4(6000));
    expect(saved.hands.p1).toEqual(['cafune-2']);
    expect(saved.front.p1).toEqual([]);
    expect(saved.discard).toEqual(['latido-0', 'cafune-1', 'latido-3', 'latido-1', 'latido-2']);
    expect(saved).toMatchObject({ choice: null, current: 'p0' });
  });

  it('quem não tem Desarme explode no meio e a fila segue (antes e depois de uma defesa)', () => {
    const start = table({
      hands: { p0: ['latido-0'], p1: ['mico-1', 'latido-1'], p2: ['latido-2', 'cafune-2'], p3: ['quati-3', 'latido-3'] },
      draw: DRAW4,
    });
    const s = settleKittens(act(start, 'p0', { type: 'play', cards: ['latido-0'] }, ctx4), at4(5000));
    // p1 sem Desarme explode na hora (um tatu sai do monte) e o p2 já ganha a escolha.
    expect(s.alive).toEqual(['p0', 'p2', 'p3']);
    expect(s.out).toEqual(['mico-1', 'latido-1', 'tatubum-0']);
    expect(s.choice).toEqual({ kind: 'latido', who: 'p2', by: 'p0', deadline: T0 + 5000 + KITTENS_CHOICE_MS });
    expect(s.log.slice(-3).map((e) => e.ev)).toEqual([
      { t: 'barked', by: 'p0', target: 'p1' },
      { t: 'boom', by: 'p1' },
      { t: 'barked', by: 'p0', target: 'p2' },
    ]);
    // p2 se defende; o p3, sem Desarme, explode logo depois e a fila acaba.
    const done = act(s, 'p2', { type: 'choose', card: 'cafune-2' }, at4(6000));
    expect(done).toMatchObject({ choice: null, current: 'p0', owed: 1, phase: 'playing', alive: ['p0', 'p2'] });
    expect(done.discard).toEqual(['latido-0', 'cafune-2', 'latido-2']);
    expect(done.out).toEqual(['mico-1', 'latido-1', 'tatubum-0', 'quati-3', 'latido-3', 'tatubum-1']);
    expect(done.exits).toEqual([
      { player: 'p1', how: 'boom' },
      { player: 'p3', how: 'boom' },
    ]);
    expect(everyCard(done)).toEqual(everyCard(start));
  });

  it('as explosões acabam a partida: quem jogou ganha e ninguém mais se defende', () => {
    const start = table({ hands: { p0: ['latido-0'], p1: ['latido-1'], p2: ['latido-2', 'mico-2'] }, draw: ['tatubum-0', 'tatubum-1'] });
    const done = settleKittens(act(start, 'p0', { type: 'play', cards: ['latido-0'] }, ctx), at(5000));
    expect(done).toMatchObject({ phase: 'gameover', winner: 'p0', choice: null, alive: ['p0'] });
    expect(done.log.slice(-5).map((e) => e.ev)).toEqual([
      { t: 'barked', by: 'p0', target: 'p1' },
      { t: 'boom', by: 'p1' },
      { t: 'barked', by: 'p0', target: 'p2' },
      { t: 'boom', by: 'p2' },
      { t: 'win', by: 'p0' },
    ]);
    expect(everyCard(done)).toEqual(everyCard(start));
  });

  it('explodindo pelo prazo da defesa também acaba a partida no meio da fila', () => {
    // p1 tem Desarme mas o perde (não acontece no jogo: a mão não muda na escolha); aqui forçamos pra cobrir o caminho.
    const s0 = barked({ hands: { p0: ['latido-0'], p1: ['latido-1', 'cafune-1'], p2: ['latido-2'] } });
    expect(s0.choice).toMatchObject({ kind: 'latido', who: 'p1' });
    const s = { ...s0, hands: { ...s0.hands, p1: ['latido-1'] }, out: [...s0.out, 'cafune-1'] };
    const late = settleKittens(s, at(5000 + KITTENS_CHOICE_MS));
    expect(late.alive).toEqual(['p0']);
    expect(late).toMatchObject({ phase: 'gameover', winner: 'p0', choice: null });
  });

  it('quem está na fila e cai de vez sai, e a fila não espera por ele', () => {
    const s = barked({ hands: { p0: ['latido-0'], p1: ['latido-1', 'cafune-1'], p2: ['latido-2', 'cafune-2'] } });
    expect(s.choice).toMatchObject({ kind: 'latido', who: 'p1' });
    const gone = settleKittens(s, ctxOf(['p0', 'p1'], { now: T0 + 6000 }));
    expect(gone.alive).toEqual(['p0', 'p1']);
    expect(gone.choice).toMatchObject({ kind: 'latido', who: 'p1' });
    const done = act(gone, 'p1', { type: 'choose', card: 'cafune-1' }, ctxOf(['p0', 'p1'], { now: T0 + 7000 }));
    expect(done).toMatchObject({ choice: null, current: 'p0' });
    expect(done.out).toEqual(expect.arrayContaining(['latido-2', 'cafune-2']));
  });

  it('quem tem que se defender cai de vez: o Desarme vai sozinho e o próximo da fila ganha a escolha', () => {
    const s = barked({ hands: { p0: ['latido-0'], p1: ['latido-1', 'cafune-1'], p2: ['latido-2', 'cafune-2'] } });
    const after = settleKittens(s, ctxOf(['p0', 'p2'], { now: T0 + 6000 }));
    expect(after.alive).toEqual(['p0', 'p2']);
    expect(after.choice).toEqual({ kind: 'latido', who: 'p2', by: 'p0', deadline: T0 + 6000 + KITTENS_CHOICE_MS });
    expect(after.discard).toEqual(['latido-0', 'cafune-1', 'latido-1']);
  });
});

describe('par de Latidores', () => {
  const pair = (target?: string) => ({ type: 'play' as const, cards: ['latido-0', 'latido-1'], ...(target ? { target } : {}) });
  const hands = () => ({ p0: ['latido-0', 'latido-1', 'mico-0'], p1: ['mico-1', 'cafune-1', 'latido-2'], p2: ['cafune-2', 'latido-3'] });

  it('pede um adversário vivo; o Boto não completa', () => {
    const s = table({ hands: { ...hands(), p0: ['latido-0', 'latido-1', 'boto-0'] }, draw: DRAW });
    expect(refuse(s, 'p0', pair(), ctx)).toBe('bad_target');
    expect(refuse(s, 'p0', pair('p0'), ctx)).toBe('bad_target');
    expect(refuse(s, 'p0', { type: 'play', cards: ['latido-0', 'boto-0'] }, ctx)).toBe('bad_combo');
    expect(act(s, 'p0', pair('p2'), ctx).pending!.play).toEqual({ kind: 'par', cards: ['latido-0', 'latido-1'], target: 'p2', ask: null, as: 'latido' });
  });

  it('o alvo joga um Desarme (só ele, sem fila); os Latidores dele ficam e a vez continua', () => {
    const s = settleKittens(act(table({ hands: hands(), draw: DRAW }), 'p0', pair('p2'), ctx), at(5000));
    expect(s.choice).toEqual({ kind: 'latido', who: 'p2', by: 'p0', deadline: DEADLINE, pair: true });
    expect(s.log.at(-1)!.ev).toEqual({ t: 'barked', by: 'p0', target: 'p2', pair: true });
    const saved = act(s, 'p2', { type: 'choose', card: 'cafune-2' }, at(6000));
    expect(saved.hands.p2).toEqual(['latido-3']);
    expect(saved.hands.p1).toEqual(['mico-1', 'cafune-1', 'latido-2']);
    expect(saved.discard).toEqual(['latido-0', 'latido-1', 'cafune-2']);
    expect(saved).toMatchObject({ choice: null, current: 'p0', owed: 1, alive: ['p0', 'p1', 'p2'] });
  });

  it('alvo sem Desarme (com ou sem Latidor) explode na hora; prazo vencido, o Desarme vai sozinho', () => {
    const s = settleKittens(act(table({ hands: { ...hands(), p2: ['pular-2'] }, draw: DRAW }), 'p0', pair('p2'), ctx), at(5000));
    expect(s.alive).toEqual(['p0', 'p1']);
    expect(s.choice).toBeNull();
    expect(s.hands.p1).toContain('latido-2');
    const slow = settleKittens(act(table({ hands: hands(), draw: DRAW }), 'p0', pair('p1'), ctx), at(5000));
    const late = settleKittens(slow, at(5000 + KITTENS_CHOICE_MS));
    expect(late.choice).toBeNull();
    expect(late.hands.p1).toEqual(['mico-1', 'latido-2']);
    expect(late.alive).toEqual(['p0', 'p1', 'p2']);
  });

  it('com 2 jogadores, o alvo sem Desarme explode e a partida acaba', () => {
    const two = ctxOf(ids(2));
    const s = table({ hands: { p0: ['latido-0', 'latido-1'], p1: ['mico-1'] }, draw: DRAW });
    const done = settleKittens(act(s, 'p0', pair('p1'), two), ctxOf(ids(2), { now: T0 + 5000 }));
    expect(done.phase).toBe('gameover');
    expect(done.winner).toBe('p0');
  });
});
