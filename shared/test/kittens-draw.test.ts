import { describe, expect, it } from 'vitest';
import { settleKittens } from '../src/games/kittens/settle';
import { KITTENS_CHOICE_MS } from '../src/games/kittens/types';
import { kittensViewFor } from '../src/games/kittens/view';
import { T0, act, ctxOf, everyCard, ids, refuse, table } from './kittens-helpers';

const ctx = ctxOf(ids(3));

describe('comprar', () => {
  it('compra a de cima e passa a vez; só quem comprou vê a carta no diário', () => {
    const s = table({ hands: { p0: [], p1: [], p2: [] }, draw: ['pular-0', 'mico-0'] });
    const after = act(s, 'p0', { type: 'draw' }, ctx);
    expect(after.hands.p0).toEqual(['mico-0']);
    expect(after.draw).toEqual(['pular-0']);
    expect(after).toMatchObject({ current: 'p1', owed: 1 });
    expect(after.log.at(-1)).toEqual({ n: 0, ev: { t: 'draw', by: 'p0', card: 'mico-0' }, seenBy: ['p0'] });
  });

  it('sob ataque, comprar gasta só 1 dos turnos', () => {
    const s = table({ hands: { p0: [], p1: [], p2: [] }, draw: ['pular-0', 'mico-0'], owed: 2 });
    expect(act(s, 'p0', { type: 'draw' }, ctx)).toMatchObject({ current: 'p0', owed: 1 });
  });

  it('fora da vez não compra; quem já saiu também não', () => {
    const s = table({ hands: { p0: [], p1: [], p2: [] }, draw: ['mico-0'] });
    expect(refuse(s, 'p1', { type: 'draw' }, ctx)).toBe('not_your_turn');
    expect(refuse({ ...s, alive: ['p0', 'p1'] }, 'p2', { type: 'draw' }, ctx)).toBe('not_alive');
  });
});

describe('Tatubum sem Cafuné', () => {
  it('explode: a mão e o tatu saem do jogo e a vez passa com 1 turno', () => {
    const s = table({ hands: { p0: ['mico-0'], p1: [], p2: [] }, draw: ['pular-0', 'tatubum-0'], owed: 2 });
    const after = act(s, 'p0', { type: 'draw' }, ctx);
    expect(after.alive).toEqual(['p1', 'p2']);
    expect(after.hands.p0).toEqual([]);
    expect(after.out).toEqual(['tatubum-0', 'mico-0']);
    expect(after.draw).toEqual(['pular-0']);
    expect(after).toMatchObject({ phase: 'playing', current: 'p1', owed: 1 });
    expect(after.log.at(-1)!.ev).toEqual({ t: 'boom', by: 'p0' });
  });

  it('com 2 jogadores, quem sobra vence', () => {
    const s = table({ hands: { p0: [], p1: [] }, draw: ['tatubum-0'] });
    const after = act(s, 'p0', { type: 'draw' }, ctxOf(ids(2)));
    expect(after).toMatchObject({ phase: 'gameover', winner: 'p1', current: null, alive: ['p1'], pending: null, choice: null });
    expect(after.log.at(-1)!.ev).toEqual({ t: 'win', by: 'p1' });
  });
});

describe('Tatubum com Cafuné', () => {
  const START = table({ hands: { p0: ['cafune-0', 'mico-0'], p1: [], p2: [] }, draw: ['pular-0', 'quati-0', 'tatubum-0'] });
  /** Comprou o Tatubum: a escolha do Desarme está aberta (o Desarme ainda está na mão). */
  const bought = () => act(START, 'p0', { type: 'draw' }, ctx);
  /** Jogou o Desarme: falta escolher onde esconder o tatu. */
  const defusing = () => act(bought(), 'p0', { type: 'choose', card: 'cafune-0' }, ctx);

  it('comprar abre a escolha do Desarme: a carta continua na mão, o evento é público', () => {
    const after = bought();
    expect(after.hands.p0).toEqual(['cafune-0', 'mico-0']);
    expect(after.discard).toEqual([]);
    expect(after.draw).toEqual(['pular-0', 'quati-0']);
    expect(after.choice).toEqual({ kind: 'tatu', who: 'p0', tatu: 'tatubum-0', deadline: T0 + KITTENS_CHOICE_MS });
    expect(after.current).toBe('p0');
    expect(after.log.at(-1)).toEqual({ n: 0, ev: { t: 'tatu', by: 'p0' }, seenBy: null });
    expect(refuse(after, 'p0', { type: 'draw' }, ctx)).toBe('waiting_choice');
    expect(refuse(after, 'p0', { type: 'play', cards: ['mico-0'] }, ctx)).toBe('waiting_choice');
    expect(refuse(after, 'p1', { type: 'nope' }, ctx)).toBe('nothing_to_nope');
  });

  it('o tatu comprado sai das espiadas; o resto continua à mostra até o Desarme esconder o tatu', () => {
    const peeked = { ...START, peeks: { p0: ['tatubum-0', 'quati-0', 'pular-0'], p1: ['tatubum-0', 'quati-0'] } };
    const after = act(peeked, 'p0', { type: 'draw' }, ctx);
    expect(after.peeks).toEqual({ p0: ['quati-0', 'pular-0'], p1: ['quati-0'] });
    const used = act(after, 'p0', { type: 'choose', card: 'cafune-0' }, ctx);
    expect(used.peeks).toEqual(after.peeks);
    // Esconder o tatu (em qualquer lugar, até no fundo) apaga a espiada dos outros; quem escondeu sabe onde pôs (pedido
    // do Rafa, 2026-10-21): aqui, no fundo, que estava na espiada dele (o monte todo).
    expect(act(used, 'p0', { type: 'choose', position: 2 }, ctx).peeks).toEqual({ p0: ['quati-0', 'pular-0', 'tatubum-0'] });
    expect(act(used, 'p0', { type: 'choose', position: 'random' }, ctx).peeks).toEqual({});
  });

  it('jogar o Desarme: ele vai pro descarte e abre a escolha de onde esconder, com prazo novo', () => {
    const later = ctxOf(ids(3), { now: T0 + 12_000 });
    const after = act(bought(), 'p0', { type: 'choose', card: 'cafune-0' }, later);
    expect(after.hands.p0).toEqual(['mico-0']);
    expect(after.discard).toEqual(['cafune-0']);
    expect(after.choice).toEqual({ kind: 'cafune', who: 'p0', tatu: 'tatubum-0', deadline: T0 + 12_000 + KITTENS_CHOICE_MS });
    expect(after.current).toBe('p0');
    expect(after.log.at(-1)!.ev).toEqual({ t: 'cafune', by: 'p0' });
  });

  it('carta errada, que não é Desarme ou que não está na mão: bad_choice; outra pessoa: not_your_choice', () => {
    const s = bought();
    expect(refuse(s, 'p0', { type: 'choose', card: 'mico-0' }, ctx)).toBe('bad_choice');
    expect(refuse(s, 'p0', { type: 'choose', card: 'cafune-1' }, ctx)).toBe('bad_choice');
    expect(refuse(s, 'p0', { type: 'choose' }, ctx)).toBe('bad_choice');
    expect(refuse(s, 'p0', { type: 'choose', position: 0 }, ctx)).toBe('bad_choice');
    expect(refuse(s, 'p1', { type: 'choose', card: 'cafune-0' }, ctx)).toBe('not_your_choice');
  });

  it('com dois Desarmes na mão, vale qualquer um', () => {
    const s = table({ hands: { p0: ['cafune-0', 'cafune-1'], p1: [], p2: [] }, draw: ['pular-0', 'tatubum-0'] });
    const after = act(act(s, 'p0', { type: 'draw' }, ctx), 'p0', { type: 'choose', card: 'cafune-1' }, ctx);
    expect(after.hands.p0).toEqual(['cafune-0']);
    expect(after.discard).toEqual(['cafune-1']);
  });

  it('sem resposta, no fim do prazo o Desarme é usado e o tatu vai pra um lugar ao acaso; a vez passa', () => {
    const late = settleKittens(bought(), ctxOf(ids(3), { now: T0 + KITTENS_CHOICE_MS }));
    expect(late.choice).toBeNull();
    expect(late.hands.p0).toEqual(['mico-0']);
    expect(late.discard).toEqual(['cafune-0']);
    expect([...late.draw].sort()).toEqual(['pular-0', 'quati-0', 'tatubum-0']);
    expect(late).toMatchObject({ current: 'p1', owed: 1 });
    expect(late.log.slice(-2).map((e) => e.ev)).toEqual([
      { t: 'cafune', by: 'p0' },
      { t: 'hid', by: 'p0' },
    ]);
  });

  it('sem resposta na segunda etapa (onde esconder), o tatu também vai ao acaso', () => {
    const late = settleKittens(defusing(), ctxOf(ids(3), { now: T0 + KITTENS_CHOICE_MS }));
    expect(late.choice).toBeNull();
    expect([...late.draw].sort()).toEqual(['pular-0', 'quati-0', 'tatubum-0']);
    expect(late.current).toBe('p1');
  });

  it('o tatu da escolha não aparece na visão de ninguém', () => {
    for (const viewer of ['p0', 'p1', null]) {
      const v = kittensViewFor(bought(), viewer);
      expect(v.choice).toEqual({ kind: 'tatu', who: 'p0', deadline: T0 + KITTENS_CHOICE_MS });
      expect(JSON.stringify(v)).not.toContain('tatubum-0');
    }
  });

  it('quem cai de vez durante a escolha: Desarme usado, tatu volta pro monte e sai um tatu', () => {
    const s = table({ hands: { p0: ['cafune-0'], p1: [], p2: [], p3: [] }, draw: ['pular-0', 'tatubum-1', 'tatubum-2', 'tatubum-0'] });
    const holding = act(s, 'p0', { type: 'draw' }, ctxOf(ids(4)));
    expect(holding.choice).toMatchObject({ kind: 'tatu', who: 'p0' });
    const after = settleKittens(holding, ctxOf(['p1', 'p2', 'p3'], { now: T0 }));
    expect(after.alive).toEqual(['p1', 'p2', 'p3']);
    expect(after.choice).toBeNull();
    expect(after.discard).toEqual(['cafune-0']);
    expect(after.draw.filter((c) => c.startsWith('tatubum'))).toHaveLength(2); // vivos − 1
    expect(after.current).toBe('p1');
    for (const t of ['tatubum-0', 'tatubum-1', 'tatubum-2']) expect(after.draw.includes(t) || after.out.includes(t)).toBe(true);
    expect(after.log.slice(-3).map((e) => e.ev)).toEqual([{ t: 'cafune', by: 'p0' }, { t: 'hid', by: 'p0' }, { t: 'left', by: 'p0' }]);
  });

  it('outro jogador cai durante a escolha: o tatu em mãos conta (sai um tatu do monte)', () => {
    const s = table({ hands: { p0: ['cafune-0'], p1: [], p2: [] }, draw: ['mico-0', 'tatubum-1', 'tatubum-0'] });
    const holding = act(s, 'p0', { type: 'draw' }, ctx);
    const after = settleKittens(holding, ctxOf(['p0', 'p2'], { now: T0 }));
    expect(after.choice).toMatchObject({ kind: 'tatu', who: 'p0', tatu: 'tatubum-0' });
    expect(after.draw).toEqual(['mico-0']);
    expect(after.out).toContain('tatubum-1');
  });

  it('fim de jogo durante a escolha: o tatu em mãos vai pra fora do jogo e nenhuma carta some', () => {
    const s = table({ hands: { p0: ['cafune-0'], p1: ['mico-1'] }, draw: ['quati-0', 'tatubum-0'] });
    const holding = act(s, 'p0', { type: 'draw' }, ctxOf(['p0', 'p1']));
    const over = settleKittens(holding, ctxOf(['p0'], { now: T0 + 40_000 }));
    expect(over).toMatchObject({ phase: 'gameover', winner: 'p0', choice: null });
    expect(over.out).toContain('tatubum-0');
    expect(everyCard(over)).toEqual(everyCard(s));
  });

  it.each([
    [0, ['pular-0', 'quati-0', 'tatubum-0']],
    [1, ['pular-0', 'tatubum-0', 'quati-0']],
    [2, ['tatubum-0', 'pular-0', 'quati-0']],
  ])('esconde o tatu %i abaixo do topo e passa a vez', (position, draw) => {
    const after = act(defusing(), 'p0', { type: 'choose', position }, ctx);
    expect(after.draw).toEqual(draw);
    expect(after).toMatchObject({ choice: null, current: 'p1', owed: 1 });
    expect(after.log.at(-1)!.ev).toEqual({ t: 'hid', by: 'p0' });
  });

  it('aleatório põe em algum lugar; posição fora do monte ou de outra pessoa não vale', () => {
    const after = act(defusing(), 'p0', { type: 'choose', position: 'random' }, ctx);
    expect([...after.draw].sort()).toEqual(['pular-0', 'quati-0', 'tatubum-0']);
    expect(refuse(defusing(), 'p0', { type: 'choose', position: 3 }, ctx)).toBe('bad_choice');
    expect(refuse(defusing(), 'p0', { type: 'choose', position: -1 }, ctx)).toBe('bad_choice');
    expect(refuse(defusing(), 'p0', { type: 'choose', position: 0.5 }, ctx)).toBe('bad_choice');
    expect(refuse(defusing(), 'p0', { type: 'choose' }, ctx)).toBe('bad_choice');
    expect(refuse(defusing(), 'p1', { type: 'choose', position: 0 }, ctx)).toBe('not_your_choice');
  });

  it('sob ataque, o Cafuné gasta 1 turno e a vez continua', () => {
    const s = table({ hands: { p0: ['cafune-0'], p1: [], p2: [] }, draw: ['pular-0', 'tatubum-0'], owed: 2 });
    const used = act(act(s, 'p0', { type: 'draw' }, ctx), 'p0', { type: 'choose', card: 'cafune-0' }, ctx);
    const hid = act(used, 'p0', { type: 'choose', position: 0 }, ctx);
    expect(hid).toMatchObject({ current: 'p0', owed: 1 });
  });
});
