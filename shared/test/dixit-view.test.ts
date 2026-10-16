import { describe, expect, it } from 'vitest';
import { dixit, dixitViewFor } from '../src/games/dixit/view';
import { act, others, revealed, started, told, voting } from './dixit-helpers';

describe('dixitViewFor', () => {
  it('cada um vê só a própria mão', () => {
    const { state } = started(4);
    const v = dixitViewFor(state, 'p1');
    expect(v.hand).toEqual(state.hands.p1);
    expect(v.handCounts).toEqual({ p0: 6, p1: 6, p2: 6, p3: 6 });
    expect(v.deckCount).toBe(state.deck.length);
    const json = JSON.stringify(v);
    for (const c of state.hands.p2!) expect(json).not.toContain(`"${c}"`);
    expect(json).not.toContain(`"${state.deck[0]}"`);
  });

  it('espectador não vê mão nenhuma', () => {
    expect(dixitViewFor(started(4).state, null).hand).toEqual([]);
  });

  it('na escolha: carta do narrador só pra ele; escolhas só de quem escolheu', () => {
    const start = told(4);
    const st = start.state.storyteller!;
    const [a, b] = others(start.state);
    const picked = act(start.state, a!, { type: 'submit', cardIds: [start.state.hands[a!]![0]!] }, start.ctx);
    const s = act(picked, a!, { type: 'confirm' }, start.ctx);
    expect(dixitViewFor(s, st).storyCard).toBe(s.storyCard);
    expect(dixitViewFor(s, a!).myPicks).toEqual(s.picks[a!]);
    const vb = dixitViewFor(s, b!);
    expect(vb.storyCard).toBeNull();
    expect(vb.myPicks).toEqual([]);
    expect(vb.confirmed).toEqual([a]);
    expect(vb.tableCount).toBe(2);
    expect(vb.table).toEqual([]);
    const json = JSON.stringify(vb);
    expect(json).not.toContain(`"${s.storyCard}"`);
    expect(json).not.toContain(`"${s.picks[a!]![0]}"`);
  });

  it('na votação: mesa sem dono, só o meu voto, sem resultado', () => {
    const start = voting(4);
    const [a, b] = others(start.state);
    const s = act(start.state, a!, { type: 'vote', cardId: start.state.storyCard! }, start.ctx);
    const va = dixitViewFor(s, a!);
    const vb = dixitViewFor(s, b!);
    expect(va.table.map((t) => t.cardId)).toEqual(s.table);
    expect(va.table.filter((t) => t.mine).map((t) => t.cardId)).toEqual(s.picks[a!]);
    expect(va.myVote).toBe(s.storyCard);
    expect(vb.myVote).toBeNull();
    expect(vb.storyCard).toBeNull();
    expect(vb.result).toBeNull();
    expect(vb).not.toHaveProperty('votes');
    expect(vb).not.toHaveProperty('picks');
    expect(vb).not.toHaveProperty('deck');
  });

  it('ids estranhos de espectador não caem no protótipo', () => {
    const { state } = voting(4);
    for (const id of ['__proto__', 'constructor', 'toString']) {
      const v = dixitViewFor(state, id);
      expect(v.hand).toEqual([]);
      expect(v.myPicks).toEqual([]);
      expect(v.myVote).toBeNull();
      expect(v.table.every((t) => !t.mine)).toBe(true);
    }
  });

  it('espectador na votação não vê a carta do narrador nem cartas suas', () => {
    const { state } = voting(4);
    const v = dixitViewFor(state, null);
    expect(v.storyCard).toBeNull();
    expect(v.table.length).toBeGreaterThan(0);
    expect(v.table.every((t) => !t.mine)).toBe(true);
  });

  it('o narrador na votação tem exatamente a própria carta marcada', () => {
    const { state } = voting(4);
    const v = dixitViewFor(state, state.storyteller!);
    expect(v.table.filter((t) => t.mine).map((t) => t.cardId)).toEqual([state.storyCard]);
  });

  it('na revelação: tudo aberto', () => {
    const { state } = revealed(4, (s) => s.storyCard!);
    const v = dixitViewFor(state, 'p1');
    expect(v.storyCard).toBe(state.storyCard);
    expect(v.result).toEqual(state.result);
  });

  it('o módulo junta regras e visão', () => {
    expect(dixit.id).toBe('dixit');
    expect(dixit.initialState().phase).toBe('lobby');
  });
});
