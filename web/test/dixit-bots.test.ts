import { describe, expect, it } from 'vitest';
import { decideDixit } from '../src/dev/dixitBots';
import { dixitView, othersOf, started, stateOf, told, voting } from './dixit-fixtures';

const rng = () => 0.5;

describe('decisão do bot do Diquisti', () => {
  it('narra quando é a vez dele', () => {
    const room = started(4);
    const st = stateOf(room).storyteller!;
    const d = decideDixit(dixitView(room, st), rng)!;
    expect(d.actions).toHaveLength(1);
    expect(d.actions[0]).toMatchObject({ type: 'tell' });
    expect(stateOf(room).hands[st]).toContain((d.actions[0] as { cardId: string }).cardId);
  });

  it('às vezes narra com dica vazia (a dica falada na call)', () => {
    const room = started(4);
    const d = decideDixit(dixitView(room, stateOf(room).storyteller!), () => 0)!;
    expect(d.actions[0]).toMatchObject({ type: 'tell', clue: '' });
  });

  it('escolhe o número certo de cartas e confirma (2 com 3 jogadores)', () => {
    const room = told(3);
    const p = othersOf(room)[0]!;
    const d = decideDixit(dixitView(room, p), rng)!;
    expect(d.actions[0]).toMatchObject({ type: 'submit' });
    expect((d.actions[0] as { cardIds: string[] }).cardIds).toHaveLength(2);
    expect(d.actions[1]).toEqual({ type: 'confirm' });
  });

  it('vota numa carta que não é a sua e confirma', () => {
    const room = voting(4);
    const p = othersOf(room)[0]!;
    const v = dixitView(room, p);
    const d = decideDixit(v, rng)!;
    const card = (d.actions[0] as { cardId: string }).cardId;
    expect(v.game.table.find((t) => t.cardId === card)?.mine).toBe(false);
    expect(d.actions[1]).toEqual({ type: 'confirm' });
  });

  it('não faz nada quando não é com ele', () => {
    const room = started(4);
    const other = othersOf(room)[0]!;
    expect(decideDixit(dixitView(room, other), rng)).toBeNull();
  });

  it('o narrador não joga carta nem vota fora da vez', () => {
    const st = stateOf(told(4)).storyteller!;
    expect(decideDixit(dixitView(told(4), st), rng)).toBeNull();
    expect(decideDixit(dixitView(voting(4), st), rng)).toBeNull();
  });
});
