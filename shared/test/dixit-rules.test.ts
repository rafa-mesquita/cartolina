import { describe, expect, it } from 'vitest';
import { DIXIT_DECK_SIZE } from '../src/games/dixit/deck';
import { applyDixitAction, cleanDixitClue, dixitDeckTooSmall, initialDixitState } from '../src/games/dixit/rules';
import { act, ctxOf, ids, others, revealed, started, told, voting } from './dixit-helpers';

describe('Dixit: lobby e início', () => {
  it('estado inicial é o lobby com meta 30', () => {
    expect(initialDixitState()).toMatchObject({ phase: 'lobby', target: 30, players: [], storyteller: null });
  });

  it('host troca a meta no lobby; outros não', () => {
    const ctx = ctxOf(ids(3));
    const s = act(initialDixitState(), 'p0', { type: 'setTarget', target: 15 }, ctx);
    expect(s.target).toBe(15);
    expect(applyDixitAction(s, 'p1', { type: 'setTarget', target: 30 }, ctx)).toEqual({ ok: false, error: 'not_host' });
  });

  it('precisa de 3 jogadores ativos', () => {
    const res = applyDixitAction(initialDixitState(), 'p0', { type: 'start' }, ctxOf(ids(2)));
    expect(res).toEqual({ ok: false, error: 'need_3_players' });
  });

  it('só o host começa', () => {
    expect(applyDixitAction(initialDixitState(), 'p1', { type: 'start' }, ctxOf(ids(3)))).toEqual({ ok: false, error: 'not_host' });
  });

  it('com 4 jogadores: 6 cartas cada, narrador sorteado, placar zerado', () => {
    const { state } = started(4);
    expect(state.phase).toBe('storytelling');
    expect(state.players).toEqual(ids(4));
    expect(state.inRound).toEqual(ids(4));
    for (const p of ids(4)) expect(state.hands[p]).toHaveLength(6);
    expect(state.deck).toHaveLength(DIXIT_DECK_SIZE - 24);
    expect(state.scores).toEqual({ p0: 0, p1: 0, p2: 0, p3: 0 });
    expect(ids(4)).toContain(state.storyteller);
    const all = [...state.deck, ...Object.values(state.hands).flat()];
    expect(new Set(all).size).toBe(DIXIT_DECK_SIZE);
  });

  it('com 3 jogadores: 7 cartas cada', () => {
    const { state } = started(3);
    for (const p of ids(3)) expect(state.hands[p]).toHaveLength(7);
  });

  it('baralho mínimo é jogadores × 7', () => {
    expect(dixitDeckTooSmall(10, 69)).toBe(true);
    expect(dixitDeckTooSmall(10, 70)).toBe(false);
    expect(dixitDeckTooSmall(10)).toBe(false);
  });

  it('voltar pro lobby mantém a meta; no lobby não dá', () => {
    const ctx = ctxOf(ids(3));
    const s = act(act(initialDixitState(15), 'p0', { type: 'start' }, ctx), 'p0', { type: 'lobby' }, ctx);
    expect(s).toEqual(initialDixitState(15));
    expect(applyDixitAction(s, 'p0', { type: 'lobby' }, ctx)).toEqual({ ok: false, error: 'bad_phase' });
  });

  it('limpa a dica: espaços e até 80 caracteres', () => {
    expect(cleanDixitClue('  uma   saudade\n')).toBe('uma saudade');
    expect(Array.from(cleanDixitClue('a'.repeat(200)))).toHaveLength(80);
  });
});

describe('Dixit: narração, escolha e votação', () => {
  it('só o narrador conta a dica, e com carta da própria mão', () => {
    const { state, ctx } = started(4);
    const st = state.storyteller!;
    const other = others(state)[0]!;
    expect(applyDixitAction(state, other, { type: 'tell', cardId: state.hands[other]![0]!, clue: 'x' }, ctx)).toEqual({
      ok: false,
      error: 'not_storyteller',
    });
    expect(applyDixitAction(state, st, { type: 'tell', cardId: 'd999', clue: 'x' }, ctx)).toEqual({ ok: false, error: 'unknown_card' });
  });

  it('contar a dica tira a carta da mão e abre a escolha', () => {
    const { state, ctx } = started(4);
    const st = state.storyteller!;
    const card = state.hands[st]![0]!;
    const s = act(state, st, { type: 'tell', cardId: card, clue: '  uma   saudade ' }, ctx);
    expect(s.phase).toBe('submitting');
    expect(s.storyCard).toBe(card);
    expect(s.clue).toBe('uma saudade');
    expect(s.hands[st]).toHaveLength(5);
    expect(s.hands[st]).not.toContain(card);
  });

  it('dica vazia vale (foi dada na call)', () => {
    const { state, ctx } = started(4);
    const st = state.storyteller!;
    expect(act(state, st, { type: 'tell', cardId: state.hands[st]![0]!, clue: '   ' }, ctx).clue).toBe('');
  });

  it('escolha: número certo de cartas, da própria mão, e dá pra trocar antes de confirmar', () => {
    const { state, ctx } = told(4);
    const st = state.storyteller!;
    const p = others(state)[0]!;
    const hand = state.hands[p]!;
    expect(applyDixitAction(state, st, { type: 'submit', cardIds: [state.hands[st]![0]!] }, ctx)).toEqual({
      ok: false,
      error: 'is_storyteller',
    });
    expect(applyDixitAction(state, p, { type: 'submit', cardIds: hand.slice(0, 2) }, ctx)).toEqual({ ok: false, error: 'wrong_count' });
    expect(applyDixitAction(state, p, { type: 'submit', cardIds: ['d999'] }, ctx)).toEqual({ ok: false, error: 'unknown_card' });
    const s = act(state, p, { type: 'submit', cardIds: [hand[0]!] }, ctx);
    expect(s.picks[p]).toEqual([hand[0]]);
    expect(act(s, p, { type: 'submit', cardIds: [hand[1]!] }, ctx).picks[p]).toEqual([hand[1]]);
  });

  it('confirmar sem escolher não dá; depois de confirmar não muda mais', () => {
    const { state, ctx } = told(4);
    const p = others(state)[0]!;
    expect(applyDixitAction(state, p, { type: 'confirm' }, ctx)).toEqual({ ok: false, error: 'nothing_chosen' });
    const s = act(act(state, p, { type: 'submit', cardIds: [state.hands[p]![0]!] }, ctx), p, { type: 'confirm' }, ctx);
    expect(s.confirmed).toEqual([p]);
    expect(applyDixitAction(s, p, { type: 'submit', cardIds: [s.hands[p]![1]!] }, ctx)).toEqual({
      ok: false,
      error: 'already_confirmed',
    });
  });

  it('com 3 jogadores cada um joga 2 cartas', () => {
    const { state, ctx } = told(3);
    const p = others(state)[0]!;
    expect(applyDixitAction(state, p, { type: 'submit', cardIds: [state.hands[p]![0]!] }, ctx)).toEqual({
      ok: false,
      error: 'wrong_count',
    });
    expect(act(state, p, { type: 'submit', cardIds: state.hands[p]!.slice(0, 2) }, ctx).picks[p]).toHaveLength(2);
  });

  it('quando todos confirmam, as cartas vão pra mesa e saem das mãos', () => {
    const { state } = voting(4);
    expect(state.phase).toBe('voting');
    expect(state.table).toHaveLength(4);
    expect(state.table).toContain(state.storyCard);
    for (const p of others(state)) {
      expect(state.hands[p]).toHaveLength(5);
      for (const c of state.picks[p]!) expect(state.table).toContain(c);
    }
    expect(state.confirmed).toEqual([]);
  });

  it('com 3 jogadores a mesa tem 5 cartas', () => {
    expect(voting(3).state.table).toHaveLength(5);
  });

  it('voto: só cartas da mesa, nunca a própria, narrador não vota', () => {
    const { state, ctx } = voting(4);
    const st = state.storyteller!;
    const p = others(state)[0]!;
    expect(applyDixitAction(state, st, { type: 'vote', cardId: state.table[0]! }, ctx)).toEqual({ ok: false, error: 'is_storyteller' });
    expect(applyDixitAction(state, p, { type: 'vote', cardId: 'd999' }, ctx)).toEqual({ ok: false, error: 'unknown_card' });
    expect(applyDixitAction(state, p, { type: 'vote', cardId: state.picks[p]![0]! }, ctx)).toEqual({ ok: false, error: 'own_card' });
    expect(act(state, p, { type: 'vote', cardId: state.storyCard! }, ctx).votes[p]).toBe(state.storyCard);
  });

  it('todos acharam: revelação com narrador 0 e os outros 2', () => {
    const { state } = revealed(4, (s) => s.storyCard!);
    const st = state.storyteller!;
    expect(state.phase).toBe('reveal');
    expect(state.scores[st]).toBe(0);
    for (const p of others(state)) expect(state.scores[p]).toBe(2);
    expect(state.result).toMatchObject({ storyteller: st, storyCard: state.storyCard, clue: 'saudade', table: state.table });
    expect(state.result!.found).toEqual(others(state));
    expect(state.discard).toEqual(state.table);
  });

  it('alguns acharam: narrador e quem achou fazem 3, com bônus', () => {
    const { state } = revealed(4, (s, p) => {
      const a = others(s)[0]!;
      return p === a ? s.storyCard! : s.picks[a]![0]!;
    });
    const [a, b, c] = others(state);
    expect(state.scores[state.storyteller!]).toBe(3);
    expect(state.scores[a!]).toBe(5);
    expect(state.scores[b!]).toBe(0);
    expect(state.scores[c!]).toBe(0);
    expect(state.result!.owners[state.storyCard!]).toBe(state.storyteller);
  });
});
