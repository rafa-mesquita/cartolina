import { describe, expect, it } from 'vitest';
import { settleKittens } from '../src/games/kittens/settle';
import type { KittensAction, KittensState } from '../src/games/kittens/types';
import { kittensViewFor } from '../src/games/kittens/view';
import { T0, act, ctxOf, ids, table } from './kittens-helpers';

/**
 * Espiar fica à mostra (pedido do Rafa, 2026-10-20): até as cartas saírem do monte ou o monte mudar de ordem. Cada um
 * pode ter a sua espiada; vale sempre `peeks[p] = draw.slice(-k).reverse()`.
 */
const ctx = ctxOf(ids(3));
const at = (ms: number) => ctxOf(ids(3), { now: T0 + ms });
/** Monte: o topo é o FIM do array. */
const DRAW = ['quati-9', 'mico-9', 'tatubum-0', 'pular-9', 'embaralhar-9'];

/** `by` joga `cards` e a janela de 5 s passa sem Nem vem! (a partir de `t` ms). */
function resolve(s: KittensState, by: string, action: KittensAction, t = 0): KittensState {
  return settleKittens(act(s, by, action, at(t)), at(t + 5000));
}

const mesa = (hands: Record<string, string[]>, opts: { draw?: string[]; current?: string } = {}) =>
  table({ hands, draw: opts.draw ?? DRAW, current: opts.current });

describe('Espiar fica à mostra', () => {
  it('a vez passa (comprando, Pular, Ataque) e a espiada continua; outro também espia', () => {
    const s = mesa({ p0: ['espiar-0', 'ataque-0'], p1: ['espiar-1'], p2: [] });
    const spied = resolve(s, 'p0', { type: 'play', cards: ['espiar-0'] });
    expect(spied.peeks).toEqual({ p0: ['embaralhar-9', 'pular-9', 'tatubum-0'] });
    const attacked = resolve(spied, 'p0', { type: 'play', cards: ['ataque-0'] }, 6000);
    expect(attacked).toMatchObject({ current: 'p1', owed: 2 });
    expect(attacked.peeks).toEqual(spied.peeks);
    const both = resolve(attacked, 'p1', { type: 'play', cards: ['espiar-1'] }, 12_000);
    expect(both.peeks).toEqual({ p0: ['embaralhar-9', 'pular-9', 'tatubum-0'], p1: ['embaralhar-9', 'pular-9', 'tatubum-0'] });
    // p1 compra a de cima: sai da espiada dos dois; o resto continua à mostra.
    const drawn = act(both, 'p1', { type: 'draw' }, at(18_000));
    expect(drawn).toMatchObject({ current: 'p1', owed: 1 });
    expect(drawn.peeks).toEqual({ p0: ['pular-9', 'tatubum-0'], p1: ['pular-9', 'tatubum-0'] });
    expect(kittensViewFor(drawn, 'p0')).toMatchObject({ peek: ['pular-9', 'tatubum-0'], peekers: ['p0', 'p1'] });
    expect(kittensViewFor(drawn, 'p2')).toMatchObject({ peek: null, peekers: ['p0', 'p1'] });
  });

  it('espiar de novo troca a própria espiada pelas 3 de cima de agora', () => {
    const s = { ...mesa({ p0: ['espiar-0'], p1: [], p2: [] }), peeks: { p0: ['embaralhar-9'] } };
    expect(resolve(s, 'p0', { type: 'play', cards: ['espiar-0'] }).peeks).toEqual({ p0: ['embaralhar-9', 'pular-9', 'tatubum-0'] });
  });

  it('par de Preguiça que puxa do monte: a carta sai das espiadas, sem apagar o resto', () => {
    const s = { ...mesa({ p0: ['preguica-0', 'preguica-1'], p1: [], p2: [] }), peeks: { p1: ['embaralhar-9', 'pular-9', 'tatubum-0'] } };
    const pulled = resolve(s, 'p0', { type: 'play', cards: ['preguica-0', 'preguica-1'], ask: 'tamandua' });
    expect(pulled.peeks).toEqual(s.peeks); // não achou no monte: nada muda
    const inDraw = { ...s, draw: ['quati-9', 'mico-9', 'tatubum-0', 'pular-9', 'tamandua-9'], peeks: { p1: ['tamandua-9', 'pular-9', 'tatubum-0'] } };
    const got = resolve(inDraw, 'p0', { type: 'play', cards: ['preguica-0', 'preguica-1'], ask: 'tamandua' });
    expect(got.hands.p0).toEqual(['tamandua-9']);
    expect(got.peeks).toEqual({ p1: ['pular-9', 'tatubum-0'] });
  });

  it('Feitiço: ficar com a de baixo não mexe no topo; pôr no topo apaga todas', () => {
    const s = { ...mesa({ p0: ['feitico-0'], p1: [], p2: [] }), peeks: { p1: ['embaralhar-9', 'pular-9'] } };
    const open = resolve(s, 'p0', { type: 'play', cards: ['feitico-0'] });
    expect(act(open, 'p0', { type: 'choose', keep: true }, at(6000)).peeks).toEqual(s.peeks);
    expect(act(open, 'p0', { type: 'choose', keep: false }, at(6000)).peeks).toEqual({});
    // Monte pequeno: a de baixo também estava na espiada (o monte todo) e sai dela.
    const small = { ...mesa({ p0: ['feitico-0'], p1: [], p2: [] }, { draw: ['quati-9', 'tatubum-0'] }), peeks: { p1: ['tatubum-0', 'quati-9'] } };
    const kept = act(resolve(small, 'p0', { type: 'play', cards: ['feitico-0'] }), 'p0', { type: 'choose', keep: true }, at(6000));
    expect(kept.peeks).toEqual({ p1: ['tatubum-0'] });
  });

  it('quem explode perde a espiada; fim de jogo, "jogar de novo" e lobby não têm espiada', () => {
    const s = { ...mesa({ p0: [], p1: [], p2: [] }, { draw: ['tatubum-1', 'mico-9', 'tatubum-0'] }), peeks: { p0: ['tatubum-0', 'mico-9'], p1: ['tatubum-0'] } };
    const boom = act(s, 'p0', { type: 'draw' }, ctx);
    expect(boom.alive).toEqual(['p1', 'p2']);
    expect(boom.peeks).toEqual({}); // p0 saiu; o tatu comprado saiu da espiada de p1, que ficou vazia
    const two = { ...mesa({ p0: [], p1: [] }, { draw: ['mico-9', 'tatubum-0'] }), peeks: { p1: ['tatubum-0', 'mico-9'] } };
    const over = act(two, 'p0', { type: 'draw' }, ctxOf(ids(2)));
    expect(over).toMatchObject({ phase: 'gameover', winner: 'p1', peeks: {} });
    expect(act(over, 'p0', { type: 'again' }, ctxOf(ids(2))).peeks).toEqual({});
    expect(act(over, 'p0', { type: 'lobby' }, ctxOf(ids(2))).peeks).toEqual({});
  });
});
