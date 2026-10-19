import { describe, expect, it } from 'vitest';
import { initialCoupState } from '../src/games/coup/rules';
import { coupActionSchema } from '../src/games/coup/schema';
import type { CoupState } from '../src/games/coup/types';
import { coup, coupNextDeadline, coupViewFor } from '../src/games/coup/view';
import { T0, THREE, act, allPass, ctxOf, ids, table, withLost } from './coup-helpers';

const ctx = ctxOf(ids(3));

describe('Cúpi: visão', () => {
  it('cada um vê só as próprias cartas viradas pra baixo; quem assiste não vê nenhuma', () => {
    const s = withLost(table(THREE), 'p2', 0);
    const v0 = coupViewFor(s, 'p0');
    expect(v0.myCards).toEqual(['duke', 'captain']);
    expect(v0.seats).toEqual([
      { id: 'p0', coins: 2, hidden: 2, revealed: [], out: false },
      { id: 'p1', coins: 2, hidden: 2, revealed: [], out: false },
      { id: 'p2', coins: 2, hidden: 1, revealed: ['ambassador'], out: false },
    ]);
    expect(coupViewFor(s, 'p1').myCards).toEqual(['contessa', 'assassin']);
    expect(coupViewFor(s, null).myCards).toEqual([]);
    expect(coupViewFor(s, 'p9').myCards).toEqual([]);
    expect(v0.deckSize).toBe(9);
    expect(v0.treasury).toBe(44);
  });

  it('nada de baralho nem carta alheia escondida na visão', () => {
    // A única Condessa fora do baralho está com p1; o baralho tem as outras duas.
    const s = table({ p0: ['duke', 'captain'], p1: ['contessa', 'assassin'], p2: ['ambassador', 'duke'] });
    const v = coupViewFor(s, 'p0');
    expect(Object.keys(v)).not.toContain('deck');
    expect(Object.keys(v)).not.toContain('hands');
    expect(Object.keys(v)).not.toContain('drawn');
    expect(JSON.stringify(v)).not.toContain('contessa');
  });

  it('as cartas compradas na troca só aparecem pra quem troca', () => {
    const s = allPass(act(table(THREE), 'p0', { type: 'act', kind: 'exchange' }, ctx), ctx);
    expect(coupViewFor(s, 'p0').myDrawn).toEqual(s.drawn);
    expect(coupViewFor(s, 'p0').can.keep).toBe(2);
    expect(coupViewFor(s, 'p1').myDrawn).toEqual([]);
    expect(coupViewFor(s, 'p1').can.keep).toBe(0);
  });

  it('o que dá pra fazer na sua vez depende das moedas', () => {
    expect(coupViewFor(table(THREE), 'p0').can.act).toEqual(['income', 'foreignAid', 'tax', 'steal', 'exchange']);
    expect(coupViewFor(table(THREE, { coins: { p0: 7 } }), 'p0').can.act).toEqual([
      'income',
      'foreignAid',
      'coup',
      'tax',
      'assassinate',
      'steal',
      'exchange',
    ]);
    expect(coupViewFor(table(THREE, { coins: { p0: 10 } }), 'p0').can.act).toEqual(['coup']);
    expect(coupViewFor(table(THREE), 'p1').can.act).toEqual([]);
  });

  it('na janela: o alvo pode bloquear, os outros só duvidar, e quem agiu nada', () => {
    const s = act(table(THREE), 'p0', { type: 'act', kind: 'steal', target: 'p1' }, ctx);
    expect(coupViewFor(s, 'p1').can).toEqual({
      act: [],
      challenge: true,
      block: ['captain', 'ambassador'],
      pass: true,
      lose: false,
      keep: 0,
    });
    expect(coupViewFor(s, 'p2').can).toMatchObject({ challenge: true, block: [], pass: true });
    expect(coupViewFor(s, 'p0').can).toMatchObject({ challenge: false, block: [], pass: false });
    const passed = act(s, 'p2', { type: 'pass' }, ctx);
    expect(coupViewFor(passed, 'p2').can.pass).toBe(false);
  });

  it('perdendo carta: só quem perde vê o botão; o motivo é público', () => {
    const s = act(table(THREE, { coins: { p0: 7 } }), 'p0', { type: 'act', kind: 'coup', target: 'p1' }, ctx);
    expect(coupViewFor(s, 'p1').can.lose).toBe(true);
    expect(coupViewFor(s, 'p2').can.lose).toBe(false);
    expect(coupViewFor(s, 'p2').loss).toEqual({ player: 'p1', reason: 'coup' });
  });

  it('no fim aparecem as cartas do vencedor', () => {
    const over: CoupState = { ...table(THREE), phase: 'over', turn: null, winner: 'p2' };
    expect(coupViewFor(over, 'p0').winnerCards).toEqual(['ambassador', 'duke']);
    expect(coupViewFor(table(THREE), 'p0').winnerCards).toEqual([]);
  });

  it('prazo só com a janela aberta', () => {
    expect(coupNextDeadline(table(THREE))).toBeNull();
    expect(coupNextDeadline(act(table(THREE), 'p0', { type: 'act', kind: 'tax' }, ctx))).toBe(T0 + 10_000);
    expect(coupNextDeadline(initialCoupState())).toBeNull();
  });

  it('o módulo junta regras, visão e prazo', () => {
    expect(coup.id).toBe('coup');
    expect(coup.initialState()).toEqual(initialCoupState());
    expect(coup.nextDeadline).toBe(coupNextDeadline);
  });
});

describe('Cúpi: schema das ações', () => {
  it('aceita as ações válidas', () => {
    for (const a of [
      { type: 'start' },
      { type: 'restart' },
      { type: 'act', kind: 'income' },
      { type: 'act', kind: 'steal', target: 'p1' },
      { type: 'pass' },
      { type: 'challenge' },
      { type: 'block', as: 'contessa' },
      { type: 'lose', card: 'duke' },
      { type: 'exchange', keep: ['duke', 'captain'] },
    ]) {
      expect(coupActionSchema.safeParse(a).success).toBe(true);
    }
  });

  it('o id da janela chega às regras (não é descartado)', () => {
    expect(coupActionSchema.parse({ type: 'pass', windowId: 3 })).toEqual({ type: 'pass', windowId: 3 });
    expect(coupActionSchema.parse({ type: 'challenge', windowId: 3 })).toEqual({ type: 'challenge', windowId: 3 });
    expect(coupActionSchema.parse({ type: 'block', as: 'duke', windowId: 3 })).toEqual({ type: 'block', as: 'duke', windowId: 3 });
    expect(coupActionSchema.safeParse({ type: 'pass', windowId: -1 }).success).toBe(false);
    expect(coupActionSchema.safeParse({ type: 'pass', windowId: 1.5 }).success).toBe(false);
  });

  it('recusa ação, personagem ou troca inválidos', () => {
    for (const a of [
      { type: 'act', kind: 'fly' },
      { type: 'act', kind: 'steal', target: '' },
      { type: 'block', as: 'king' },
      { type: 'lose' },
      { type: 'exchange', keep: [] },
      { type: 'exchange', keep: ['duke', 'duke', 'duke'] },
      { type: 'dance' },
    ]) {
      expect(coupActionSchema.safeParse(a).success).toBe(false);
    }
  });
});
