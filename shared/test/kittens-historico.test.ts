import { describe, expect, it } from 'vitest';
import { kittensWithNewFields } from '../src/games/kittens/compat';
import { initialKittensState } from '../src/games/kittens/rules';
import { settleKittens } from '../src/games/kittens/settle';
import { KITTENS_CHOICE_MS, type KittensState } from '../src/games/kittens/types';
import { T0, act, ctxOf, deepFreeze, ids, refuse, started, table } from './kittens-helpers';

const ctx = ctxOf(ids(3));
const at = (ms: number) => ctxOf(ids(3), { now: T0 + ms });
const zero = { nopes: 0, defuses: 0 };

describe('contadores do histórico: partida, saídas, Nem vem! e Desarmes', () => {
  it('"começar" conta a partida 1 e zera saídas e contadores (todos com zero)', () => {
    const { state } = started(3);
    expect(state).toMatchObject({ match: 1, exits: [], stats: { p0: zero, p1: zero, p2: zero } });
    expect(initialKittensState()).toMatchObject({ match: 0, exits: [], stats: {} });
  });

  it('"jogar de novo" soma 1 na partida e zera o resto; "lobby" volta a 0', () => {
    const { state, ctx: c } = started(2);
    const over: KittensState = {
      ...state,
      phase: 'gameover',
      alive: ['p0'],
      current: null,
      winner: 'p0',
      exits: [{ player: 'p1', how: 'boom' }],
      stats: { p0: { nopes: 2, defuses: 1 }, p1: { nopes: 0, defuses: 1 } },
    };
    const again = act(over, 'p0', { type: 'again' }, c);
    expect(again).toMatchObject({ phase: 'playing', match: 2, exits: [], stats: { p0: zero, p1: zero } });
    expect(act(over, 'p0', { type: 'lobby' }, c)).toMatchObject({ phase: 'lobby', match: 0, exits: [], stats: {} });
  });

  it('comprar Tatubum sem Desarme: explodiu, entra nas saídas', () => {
    const s = act(table({ hands: { p0: ['mico-0'], p1: [], p2: [] }, draw: ['tatubum-1', 'mico-9', 'tatubum-0'] }), 'p0', { type: 'draw' }, ctx);
    expect(s.alive).toEqual(['p1', 'p2']);
    expect(s.exits).toEqual([{ player: 'p0', how: 'boom' }]);
  });

  it('com 2, o último a explodir fica nas saídas e o vencedor não', () => {
    const c2 = ctxOf(ids(2));
    const s = act(table({ hands: { p0: ['mico-0'], p1: [] }, draw: ['mico-9', 'tatubum-0'] }), 'p0', { type: 'draw' }, c2);
    expect(s).toMatchObject({ phase: 'gameover', winner: 'p1', exits: [{ player: 'p0', how: 'boom' }] });
  });

  it('Tatu Latidor em quem não tem Desarme: explodiu', () => {
    const start = table({ hands: { p0: ['latido-0'], p1: ['mico-1', 'latido-1'], p2: [] }, draw: ['mico-9', 'tatubum-0', 'tatubum-1'] });
    const s = settleKittens(act(start, 'p0', { type: 'play', cards: ['latido-0'] }, ctx), at(5000));
    expect(s.exits).toEqual([{ player: 'p1', how: 'boom' }]);
  });

  it('Feitiço: ficar com um Tatubum sem Desarme é explodir', () => {
    const start = table({ hands: { p0: ['feitico-0', 'mico-0'], p1: [], p2: [] }, draw: ['tatubum-0', 'pular-9', 'tatubum-1'] });
    const s0 = settleKittens(act(start, 'p0', { type: 'play', cards: ['feitico-0'] }, ctx), at(5000));
    const s = act(s0, 'p0', { type: 'choose', keep: true }, at(6000));
    expect(s.exits).toEqual([{ player: 'p0', how: 'boom' }]);
  });

  it('caiu e não voltou em 30 s: "caiu", na ordem em que saíram', () => {
    const start = table({ hands: { p0: ['mico-0'], p1: [], p2: [] }, draw: ['tatubum-1', 'mico-9', 'tatubum-0'] });
    const boom = act(start, 'p0', { type: 'draw' }, ctx);
    const s = settleKittens(deepFreeze(boom), ctxOf(['p0', 'p1'], { now: T0 + 1000 }));
    expect(s).toMatchObject({ phase: 'gameover', winner: 'p1' });
    expect(s.exits).toEqual([
      { player: 'p0', how: 'boom' },
      { player: 'p2', how: 'left' },
    ]);
  });

  it('Nem vem! aceito conta pra quem deu; recusado não conta', () => {
    const start = table({ hands: { p0: ['ataque-0'], p1: ['nemvem-1', 'nemvem-2'], p2: [] }, draw: ['mico-9'] });
    const air = act(start, 'p0', { type: 'play', cards: ['ataque-0'] }, ctx);
    const noped = act(air, 'p1', { type: 'nope', at: 0 }, at(1000));
    expect(noped.stats.p1).toEqual({ nopes: 1, defuses: 0 });
    // Atrasado (viu 0 Nem vem! na carta no ar): recusado, não conta.
    expect(refuse(noped, 'p1', { type: 'nope', at: 0 }, at(1500))).toBe('nope_late');
    expect(act(noped, 'p1', { type: 'nope', at: 1 }, at(2000)).stats.p1).toEqual({ nopes: 2, defuses: 0 });
  });

  it('Desarme contra o Tatubum comprado conta, jogado à mão ou sozinho no fim do prazo', () => {
    const start = table({ hands: { p0: ['cafune-0'], p1: [], p2: [] }, draw: ['mico-9', 'tatubum-0'] });
    const drew = act(start, 'p0', { type: 'draw' }, ctx);
    expect(drew.stats.p0 ?? zero).toEqual(zero);
    expect(act(drew, 'p0', { type: 'choose', card: 'cafune-0' }, at(1000)).stats.p0).toEqual({ nopes: 0, defuses: 1 });
    const auto = settleKittens(deepFreeze(drew), at(KITTENS_CHOICE_MS));
    expect(auto.choice).toBeNull();
    expect(auto.stats.p0).toEqual({ nopes: 0, defuses: 1 });
  });

  it('Desarme contra o Tatu Latidor conta, jogado à mão ou sozinho no fim do prazo', () => {
    const start = table({ hands: { p0: ['latido-0'], p1: ['latido-1', 'cafune-1'], p2: [] }, draw: ['mico-9', 'tatubum-0', 'tatubum-1'] });
    const barked = settleKittens(act(start, 'p0', { type: 'play', cards: ['latido-0'] }, ctx), at(5000));
    expect(barked.choice).toMatchObject({ kind: 'latido', who: 'p1' });
    expect(act(barked, 'p1', { type: 'choose', card: 'cafune-1' }, at(6000)).stats.p1).toEqual({ nopes: 0, defuses: 1 });
    const auto = settleKittens(deepFreeze(barked), at(5000 + KITTENS_CHOICE_MS));
    expect(auto.choice).toBeNull();
    expect(auto.stats.p1).toEqual({ nopes: 0, defuses: 1 });
  });
});

describe('sala salva antes do histórico', () => {
  /** Sem `match`, `exits` nem `stats`. */
  function old(s: KittensState): KittensState {
    const { match: _m, exits: _e, stats: _s, ...rest } = s;
    void _m;
    void _e;
    void _s;
    return deepFreeze(rest as KittensState);
  }

  it('completa: partida 0, contadores vazios e saídas refeitas pelo diário (quem sumiu dele vem antes)', () => {
    const s: KittensState = {
      ...table({ hands: { p0: [], p1: [], p2: [], p3: [] } }),
      phase: 'gameover',
      alive: ['p0'],
      current: null,
      winner: 'p0',
      log: [
        { n: 40, ev: { t: 'left', by: 'p2' }, seenBy: null },
        { n: 41, ev: { t: 'boom', by: 'p3' }, seenBy: null },
        { n: 42, ev: { t: 'win', by: 'p0' }, seenBy: null },
      ],
    };
    const full = kittensWithNewFields(old(s));
    expect(full).toMatchObject({ match: 0, stats: {} });
    expect(full.exits).toEqual([
      { player: 'p1', how: 'boom' },
      { player: 'p2', how: 'left' },
      { player: 'p3', how: 'boom' },
    ]);
    // Lobby antigo: nada a refazer.
    expect(kittensWithNewFields(old(initialKittensState()))).toMatchObject({ match: 0, exits: [], stats: {} });
    // Estado completo: o mesmo objeto.
    expect(kittensWithNewFields(full)).toBe(full);
  });

  it('a partida segue normalmente: quem sai entra no fim das saídas e os contadores começam do zero', () => {
    const s: KittensState = {
      ...table({ hands: { p0: ['mico-0'], p1: [], p2: [] }, draw: ['mico-9', 'tatubum-0'] }),
      alive: ['p0', 'p1'],
      log: [{ n: 3, ev: { t: 'boom', by: 'p2' }, seenBy: null }],
    };
    const after = act(old(s), 'p0', { type: 'draw' }, ctx);
    expect(after).toMatchObject({ phase: 'gameover', winner: 'p1', match: 0 });
    expect(after.exits).toEqual([
      { player: 'p2', how: 'boom' },
      { player: 'p0', how: 'boom' },
    ]);
  });
});
