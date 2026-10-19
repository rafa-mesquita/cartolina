import { describe, expect, it } from 'vitest';
import { camelioCard } from '../src/games/camelio/deck';
import { initialCamelioState } from '../src/games/camelio/rules';
import { camelioActionSchema } from '../src/games/camelio/schema';
import { camelio, camelioViewFor } from '../src/games/camelio/view';
import { act, C, ctxOf, ids, playing } from './camelio-helpers';

describe('visão do Cama-Leão', () => {
  it('o topo do monte só mostra o verso', () => {
    const v = camelioViewFor(playing(3, { deck: [C.verde1, C.vermelho3], open: C.azul1 }), 'p1');
    expect(v.top).toEqual({ kind: 'normal', color: 'vermelho' });
    expect(v.deckCount).toBe(2);
    expect(v.open).toEqual(camelioCard(C.azul1));
  });

  it('a frente do topo e a ordem do monte nunca saem', () => {
    const s = act(initialCamelioState(), 'p0', { type: 'start' }, ctxOf(ids(3)));
    const v = camelioViewFor(s, 'p0');
    expect(v).not.toHaveProperty('deck');
    expect(v).not.toHaveProperty('discard');
    expect(v.top).not.toHaveProperty('id');
    const topCard = camelioCard(s.deck[s.deck.length - 1]!);
    if (topCard.kind !== 'normal') expect(JSON.stringify(v.top)).not.toContain(`"color":"${topCard.color}"`);
  });

  it('mesas e pontos abertos pra todo mundo, com as cartas inteiras', () => {
    const s = playing(3, {
      table: { p0: [C.vermelho3], p1: [], p2: [C.azul1] },
      scored: { p0: [], p1: [C.amarelo2, C.amarelo3], p2: [] },
    });
    for (const viewer of ['p0', 'p1', null]) {
      const v = camelioViewFor(s, viewer);
      expect(v.table.p0).toEqual([camelioCard(C.vermelho3)]);
      expect(v.table.p2).toEqual([camelioCard(C.azul1)]);
      expect(v.scored.p1).toEqual([camelioCard(C.amarelo2), camelioCard(C.amarelo3)]);
      expect(v.points).toEqual({ p0: 0, p1: 1, p2: 0 });
    }
  });

  it('última jogada e contagem de jogadas', () => {
    const s0 = playing(3);
    expect(camelioViewFor(s0, 'p0')).toMatchObject({ last: null, playCount: 0 });
    const s1 = act(s0, 'p0', { type: 'play', from: 'open', to: 'p1' }, ctxOf(ids(3)));
    expect(camelioViewFor(s1, 'p0')).toMatchObject({ last: { by: 'p0', to: 'p1', from: 'open', card: C.azul1 }, playCount: 1 });
  });

  it('monte vazio no fim: sem topo', () => {
    const s = playing(3, { phase: 'over', deck: [], turn: null, winners: ['p0'], endReason: 'deck' });
    expect(camelioViewFor(s, 'p0')).toMatchObject({ top: null, deckCount: 0, winners: ['p0'], endReason: 'deck' });
  });

  it('o módulo junta as peças', () => {
    expect(camelio.id).toBe('camelio');
    expect(camelio.initialState()).toEqual(initialCamelioState());
  });
});

describe('schema das ações do Cama-Leão', () => {
  it('aceita as ações certas', () => {
    for (const a of [{ type: 'start' }, { type: 'again' }, { type: 'lobby' }, { type: 'play', from: 'open', to: 'p1' }, { type: 'play', from: 'deck', to: 'p0' }]) {
      expect(camelioActionSchema.safeParse(a).success).toBe(true);
    }
  });

  it('recusa as erradas', () => {
    for (const a of [
      { type: 'play', from: 'mao', to: 'p1' },
      { type: 'play', from: 'open', to: '' },
      { type: 'play', from: 'open' },
      { type: 'play', to: 'p1' },
      { type: 'tell' },
    ]) {
      expect(camelioActionSchema.safeParse(a).success).toBe(false);
    }
  });
});
