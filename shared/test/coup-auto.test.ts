import { describe, expect, it } from 'vitest';
import { initialCoupState, settleCoup } from '../src/games/coup/rules';
import { hiddenOf } from '../src/games/coup/table';
import { THREE, act, allPass, ctxOf, ids, table } from './coup-helpers';

const all = ctxOf(ids(3));
const without = (gone: string) => ctxOf(ids(3).filter((p) => p !== gone));

describe('Cúpi: automático de quem está ausente', () => {
  it('nada a fazer: devolve o mesmo objeto', () => {
    const s = table(THREE);
    expect(settleCoup(s, all)).toBe(s);
  });

  it('na vez do ausente: renda', () => {
    const s = settleCoup(table(THREE), without('p0'));
    expect(s.hands.p0!.coins).toBe(3);
    expect(s.turn).toBe('p1');
  });

  it('ausente com 10 moedas: golpe num alvo sorteado', () => {
    const s = settleCoup(table(THREE, { coins: { p0: 10 } }), without('p0'));
    expect(s.hands.p0!.coins).toBe(3);
    expect(s.phase).toBe('losing');
    expect(['p1', 'p2']).toContain(s.loss!.player);
  });

  it('na janela, ausente conta como "deixa" na hora; se só faltava ele, resolve sem esperar', () => {
    let s = act(table(THREE), 'p0', { type: 'act', kind: 'tax' }, all);
    s = settleCoup(s, without('p2'));
    expect(s.window!.passed).toEqual(['p2']);
    s = act(s, 'p1', { type: 'pass' }, without('p2'));
    expect(s.hands.p0!.coins).toBe(5);
  });

  it('ausente que perde carta: uma sorteada (e a vez dele, se vier, também é automática)', () => {
    const s = act(table(THREE, { coins: { p0: 7 } }), 'p0', { type: 'act', kind: 'coup', target: 'p1' }, all);
    const done = settleCoup(s, without('p1'));
    expect(hiddenOf(done, 'p1')).toHaveLength(1);
    expect(done.hands.p1!.coins).toBe(3);
    expect(done.turn).toBe('p2');
  });

  it('ausente na própria troca: fica com as que tinha', () => {
    const s = allPass(act(table(THREE), 'p0', { type: 'act', kind: 'exchange' }, all), all);
    expect(s.phase).toBe('exchange');
    const done = settleCoup(s, without('p0'));
    expect(hiddenOf(done, 'p0')).toEqual(['duke', 'captain']);
    expect(done.deck).toHaveLength(s.deck.length + 2);
    expect(done.turn).toBe('p1');
  });

  it('todo mundo ausente: a partida termina sozinha', () => {
    const started = act(initialCoupState(), 'p0', { type: 'start' }, ctxOf(ids(6)));
    const done = settleCoup(started, ctxOf([]));
    expect(done.phase).toBe('over');
    expect(done.out).toHaveLength(5);
    expect(done.wins[done.winner!]).toBe(1);
  });
});
