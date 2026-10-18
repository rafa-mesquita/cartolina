import { describe, expect, it } from 'vitest';
import { DIXIT_DECK_SIZE } from '../src/games/dixit/deck';
import {
  applyDixitAction,
  cleanDixitClue,
  dixitDeckTooSmall,
  dixitOnPresenceChange,
  initialDixitState,
  withDixitCounters,
} from '../src/games/dixit/rules';
import type { DixitState } from '../src/games/dixit/types';
import { act, ctxOf, deepFreeze, ids, others, revealed, started, told, voting } from './dixit-helpers';

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

describe('Dixit: fim da rodada e da partida', () => {
  it('próxima rodada: narrador seguinte na ordem e mãos cheias', () => {
    const { state, ctx } = revealed(4, (s) => s.storyCard!);
    const i = state.players.indexOf(state.storyteller!);
    const s = act(state, 'p0', { type: 'next' }, ctx);
    expect(s.phase).toBe('storytelling');
    expect(s.storyteller).toBe(state.players[(i + 1) % 4]);
    for (const p of ids(4)) expect(s.hands[p]).toHaveLength(6);
    expect(s).toMatchObject({ clue: '', storyCard: null, table: [], result: null, picks: {}, votes: {}, confirmed: [] });
    expect(s.scores).toEqual(state.scores);
  });

  it('só o host passa pra próxima, e só na revelação', () => {
    const { state, ctx } = revealed(4, (s) => s.storyCard!);
    expect(applyDixitAction(state, 'p1', { type: 'next' }, ctx)).toEqual({ ok: false, error: 'not_host' });
    expect(applyDixitAction(voting(4).state, 'p0', { type: 'next' }, ctx)).toEqual({ ok: false, error: 'bad_phase' });
  });

  it('baralho vazio: o descarte é embaralhado e vira baralho', () => {
    const { state, ctx } = revealed(4, (s) => s.storyCard!);
    const s = act({ ...state, deck: [] }, 'p0', { type: 'next' }, ctx);
    for (const p of ids(4)) expect(s.hands[p]).toHaveLength(6);
    expect(s.discard).toEqual([]);
    expect(s.deck).toEqual([]);
  });

  it('alguém chegou na meta: fim de jogo com vencedor', () => {
    const { state, ctx } = revealed(4, (s) => s.storyCard!);
    const s = act({ ...state, scores: { ...state.scores, p2: 30 } }, 'p0', { type: 'next' }, ctx);
    expect(s.phase).toBe('gameover');
    expect(s.winners).toEqual(['p2']);
  });

  it('empate no topo: todos os empatados vencem', () => {
    const { state, ctx } = revealed(4, (s) => s.storyCard!);
    const s = act({ ...state, scores: { p0: 3, p1: 31, p2: 12, p3: 31 } }, 'p0', { type: 'next' }, ctx);
    expect(s.winners).toEqual(['p1', 'p3']);
  });

  it('meta curta: 15 pontos', () => {
    const { state, ctx } = revealed(4, (s) => s.storyCard!);
    const s = act({ ...state, target: 15, scores: { ...state.scores, p1: 15 } }, 'p0', { type: 'next' }, ctx);
    expect(s.phase).toBe('gameover');
  });

  it('jogar de novo: placar zerado e mãos novas', () => {
    const { state, ctx } = revealed(4, (s) => s.storyCard!);
    const over = act({ ...state, scores: { ...state.scores, p2: 30 } }, 'p0', { type: 'next' }, ctx);
    expect(applyDixitAction(state, 'p0', { type: 'again' }, ctx)).toEqual({ ok: false, error: 'bad_phase' });
    const s = act(over, 'p0', { type: 'again' }, ctx);
    expect(s.phase).toBe('storytelling');
    expect(s.scores).toEqual({ p0: 0, p1: 0, p2: 0, p3: 0 });
    expect(s.winners).toEqual([]);
    for (const p of ids(4)) expect(s.hands[p]).toHaveLength(6);
  });

  it('destravar na narração: a vez passa pro próximo', () => {
    const { state, ctx } = started(4);
    const i = state.players.indexOf(state.storyteller!);
    const s = act(state, 'p0', { type: 'forceNext' }, ctx);
    expect(s.phase).toBe('storytelling');
    expect(s.storyteller).toBe(state.players[(i + 1) % 4]);
  });

  it('destravar na escolha: segue só com quem confirmou', () => {
    const start = told(4);
    const ctx = start.ctx;
    let state = start.state;
    const a = others(state)[0]!;
    state = act(state, a, { type: 'submit', cardIds: [state.hands[a]![0]!] }, ctx);
    state = act(state, a, { type: 'confirm' }, ctx);
    const s = act(state, 'p0', { type: 'forceNext' }, ctx);
    expect(s.phase).toBe('voting');
    expect(s.table).toHaveLength(2);
  });

  it('destravar na escolha sem ninguém confirmado: próximo narrador, carta volta pra mão', () => {
    const { state, ctx } = told(4);
    const old = state.storyteller!;
    const i = state.players.indexOf(old);
    const s = act(state, 'p0', { type: 'forceNext' }, ctx);
    expect(s.phase).toBe('storytelling');
    expect(s.storyteller).toBe(state.players[(i + 1) % 4]);
    expect(s.hands[old]).toHaveLength(6);
    expect(s.hands[old]).toContain(state.storyCard);
  });

  it('destravar na votação: revela com os votos confirmados', () => {
    const start = voting(4);
    const ctx = start.ctx;
    let state = start.state;
    const a = others(state)[0]!;
    state = act(state, a, { type: 'vote', cardId: state.storyCard! }, ctx);
    state = act(state, a, { type: 'confirm' }, ctx);
    const s = act(state, 'p0', { type: 'forceNext' }, ctx);
    expect(s.phase).toBe('reveal');
    expect(Object.keys(s.result!.votes)).toEqual([a]);
  });

  it('só o host destrava', () => {
    const { state, ctx } = started(4);
    expect(applyDixitAction(state, 'p1', { type: 'forceNext' }, ctx)).toEqual({ ok: false, error: 'not_host' });
  });
});

describe('Dixit: presença', () => {
  it('nada mudou: devolve o mesmo objeto', () => {
    for (const { state, ctx } of [started(4), told(4), voting(4), revealed(4, (s) => s.storyCard!)]) {
      expect(dixitOnPresenceChange(state, ctx)).toBe(state);
    }
    const lobby = initialDixitState();
    expect(dixitOnPresenceChange(lobby, ctxOf(ids(4)))).toBe(lobby);
  });

  it('narrador saiu antes de narrar: a vez passa pro próximo', () => {
    const { state } = started(4);
    const st = state.storyteller!;
    const i = state.players.indexOf(st);
    const s = dixitOnPresenceChange(state, ctxOf(ids(4).filter((p) => p !== st)));
    expect(s.storyteller).toBe(state.players[(i + 1) % 4]);
    expect(s.inRound).not.toContain(st);
  });

  it('quem entra durante a narração já recebe mão', () => {
    const { state } = started(4);
    const s = dixitOnPresenceChange(state, ctxOf([...ids(4), 'p9']));
    expect(s.players).toEqual([...ids(4), 'p9']);
    expect(s.inRound).toContain('p9');
    expect(s.hands.p9).toHaveLength(6);
    expect(s.scores.p9).toBe(0);
    expect(s.storyteller).toBe(state.storyteller);
  });

  it('jogador sai na escolha: a rodada segue sem ele', () => {
    const start = told(4);
    let state = start.state;
    const [a, b, c] = others(state);
    for (const p of [a!, b!]) {
      state = act(state, p, { type: 'submit', cardIds: [state.hands[p]![0]!] }, start.ctx);
      state = act(state, p, { type: 'confirm' }, start.ctx);
    }
    expect(state.phase).toBe('submitting');
    const s = dixitOnPresenceChange(state, ctxOf(ids(4).filter((p) => p !== c)));
    expect(s.phase).toBe('voting');
    expect(s.table).toHaveLength(3);
  });

  it('narrador sai depois de narrar: a rodada segue e ele pontua', () => {
    const start = told(4);
    const st = start.state.storyteller!;
    const ctx = ctxOf(ids(4).filter((p) => p !== st));
    let state = dixitOnPresenceChange(start.state, ctx);
    expect(state.phase).toBe('submitting');
    expect(state.storyteller).toBe(st);
    for (const p of others(state)) {
      state = act(state, p, { type: 'submit', cardIds: [state.hands[p]![0]!] }, ctx);
      state = act(state, p, { type: 'confirm' }, ctx);
    }
    expect(state.phase).toBe('voting');
    const [a, b, c] = others(state);
    for (const p of [a!, b!, c!]) {
      const cardId = p === a ? state.storyCard! : state.picks[a!]![0]!;
      state = act(state, p, { type: 'vote', cardId }, ctx);
      state = act(state, p, { type: 'confirm' }, ctx);
    }
    expect(state.phase).toBe('reveal');
    expect(state.scores[st]).toBe(3); // alguns acharam: o narrador pontua mesmo ausente
    expect(state.scores[a!]).toBe(5);
  });

  it('jogador sai na votação: revela sem ele', () => {
    const start = voting(4);
    let state = start.state;
    const [a, b, c] = others(state);
    for (const p of [a!, b!]) {
      state = act(state, p, { type: 'vote', cardId: state.storyCard! }, start.ctx);
      state = act(state, p, { type: 'confirm' }, start.ctx);
    }
    const s = dixitOnPresenceChange(state, ctxOf(ids(4).filter((p) => p !== c)));
    expect(s.phase).toBe('reveal');
    expect(Object.keys(s.result!.votes).sort()).toEqual([a, b].sort());
  });

  it('menos de 3 ativos: pausa, e volta sozinho quando a pessoa volta', () => {
    const start = told(3);
    const [a, b] = others(start.state);
    const paused = dixitOnPresenceChange(start.state, ctxOf(ids(3).filter((p) => p !== a)));
    expect(paused.paused).toBe(true);
    expect(applyDixitAction(paused, b!, { type: 'submit', cardIds: paused.hands[b!]!.slice(0, 2) }, start.ctx)).toEqual({
      ok: false,
      error: 'paused',
    });
    const back = dixitOnPresenceChange(paused, ctxOf(ids(3)));
    expect(back.paused).toBe(false);
    expect(back.phase).toBe('submitting');
  });

  it('quem entra na votação espera e joga a próxima rodada', () => {
    const start = voting(4);
    const withNew = ctxOf([...ids(4), 'p9']);
    let state = dixitOnPresenceChange(start.state, withNew);
    expect(state.inRound).not.toContain('p9');
    for (const p of others(state)) {
      state = act(state, p, { type: 'vote', cardId: state.storyCard! }, withNew);
      state = act(state, p, { type: 'confirm' }, withNew);
    }
    const next = act(state, 'p0', { type: 'next' }, withNew);
    expect(next.inRound).toContain('p9');
    expect(next.hands.p9).toHaveLength(6);
  });

  it('pausada com gente nova suficiente: o host destrava e recomeça', () => {
    const { state } = voting(3);
    const a = others(state)[0]!;
    const remaining = ids(3).filter((p) => p !== a);
    const paused = dixitOnPresenceChange(state, ctxOf(remaining));
    expect(paused.paused).toBe(true);
    expect(applyDixitAction(paused, 'p0', { type: 'forceNext' }, ctxOf(remaining))).toEqual({ ok: false, error: 'paused' });
    const ctx = ctxOf([...remaining, 'p9']);
    const s = act(paused, 'p0', { type: 'forceNext' }, ctx);
    expect(s.phase).toBe('storytelling');
    expect(s.paused).toBe(false);
    expect(s.inRound).toContain('p9');
    expect(s.inRound).not.toContain(a);
    for (const p of s.inRound) expect(s.hands[p]).toHaveLength(7);
    const all = [...s.deck, ...s.discard, ...Object.values(s.hands).flat()];
    expect(all).toHaveLength(DIXIT_DECK_SIZE);
    expect(new Set(all).size).toBe(DIXIT_DECK_SIZE);
  });

  it('baralho e descarte vazios: a mão de quem saiu volta pro jogo, sem perder nem duplicar carta', () => {
    const { state, ctx } = revealed(4, (s) => s.storyCard!);
    const total = [...state.deck, ...state.discard, ...Object.values(state.hands).flat()];
    const stuck = {
      ...state,
      deck: [],
      discard: [],
      players: [...state.players, 'p9'],
      scores: { ...state.scores, p9: 0 },
      hands: { ...state.hands, p9: [...state.deck, ...state.discard] },
    };
    const s = act(stuck, 'p0', { type: 'next' }, ctx);
    for (const p of s.inRound) expect(s.hands[p]).toHaveLength(6);
    expect(s.hands.p9).toEqual([]);
    const all = [...s.deck, ...s.discard, ...Object.values(s.hands).flat()];
    expect(all).toHaveLength(total.length);
    expect(new Set(all).size).toBe(total.length);
  });

  it('quem voltou mantém a mão enquanto o baralho dá conta', () => {
    const { state, ctx } = revealed(4, (s) => s.storyCard!);
    const withP9 = {
      ...state,
      players: [...state.players, 'p9'],
      scores: { ...state.scores, p9: 0 },
      hands: { ...state.hands, p9: ['d001'] },
      deck: state.deck.filter((c) => c !== 'd001'),
    };
    expect(act(withP9, 'p0', { type: 'next' }, ctx).hands.p9).toEqual(['d001']);
  });

  it('presença na narração sem mudança não gasta sorteio nem muda o estado', () => {
    const { state } = started(4);
    const ctx = {
      ...ctxOf(ids(4)),
      rng: (): number => {
        throw new Error('rng');
      },
    };
    expect(dixitOnPresenceChange(deepFreeze(state), ctx)).toBe(state);
  });

  it('recomeçar a rodada na escolha, com uma escolha confirmada na mão, não perde nem duplica carta', () => {
    const start = told(3);
    let state = start.state;
    const [a, b] = others(state);
    state = act(state, a!, { type: 'submit', cardIds: state.hands[a!]!.slice(0, 2) }, start.ctx);
    state = act(state, a!, { type: 'confirm' }, start.ctx);
    const remaining = ids(3).filter((p) => p !== b);
    const paused = dixitOnPresenceChange(state, ctxOf(remaining));
    expect(paused.paused).toBe(true);
    const s = act(paused, 'p0', { type: 'forceNext' }, ctxOf([...remaining, 'p9']));
    expect(s.phase).toBe('storytelling');
    const all = [...s.deck, ...s.discard, ...Object.values(s.hands).flat()];
    expect(all).toHaveLength(DIXIT_DECK_SIZE);
    expect(new Set(all).size).toBe(DIXIT_DECK_SIZE);
  });
});

describe('Dixit: erros e conferência', () => {
  it('contar a dica fora da narração: bad_phase', () => {
    const { state, ctx } = told(4);
    const st = state.storyteller!;
    expect(applyDixitAction(state, st, { type: 'tell', cardId: state.hands[st]![0]!, clue: 'x' }, ctx)).toEqual({
      ok: false,
      error: 'bad_phase',
    });
  });

  it('next, again e lobby por quem não é host: not_host', () => {
    const { state, ctx } = revealed(4, (s) => s.storyCard!);
    for (const type of ['next', 'again', 'lobby'] as const) {
      expect(applyDixitAction(state, 'p1', { type }, ctx)).toEqual({ ok: false, error: 'not_host' });
    }
  });

  it('dá pra trocar o voto antes de confirmar', () => {
    const { state, ctx } = voting(4);
    const p = others(state)[0]!;
    const free = state.table.filter((c) => !state.picks[p]!.includes(c));
    const s = act(act(state, p, { type: 'vote', cardId: free[0]! }, ctx), p, { type: 'vote', cardId: free[1]! }, ctx);
    expect(s.votes[p]).toBe(free[1]);
  });
});

describe('Dixit: contagem de partidas e rodadas (histórico)', () => {
  it('lobby começa na partida 0, rodada 0', () => {
    expect(initialDixitState()).toMatchObject({ match: 0, round: 0 });
  });

  it('começar abre a partida 1 na rodada 1', () => {
    expect(started(4).state).toMatchObject({ match: 1, round: 1 });
  });

  it('a próxima narração soma 1 na rodada; a partida continua', () => {
    const { state, ctx } = revealed(4, (s) => s.storyCard!);
    expect(act(state, 'p0', { type: 'next' }, ctx)).toMatchObject({ match: 1, round: 2 });
  });

  it('narração pulada pelo host também conta como narração nova', () => {
    const { state, ctx } = started(4);
    expect(act(state, 'p0', { type: 'forceNext' }, ctx).round).toBe(2);
  });

  it('jogar de novo: partida 2, rodada 1', () => {
    const { state, ctx } = revealed(4, (s) => s.storyCard!);
    const over = act({ ...state, scores: { ...state.scores, p2: 30 } }, 'p0', { type: 'next' }, ctx);
    expect(over.phase).toBe('gameover');
    expect(over).toMatchObject({ match: 1, round: 1 });
    expect(act(over, 'p0', { type: 'again' }, ctx)).toMatchObject({ match: 2, round: 1 });
  });

  it('rodada refeita pelo host (submitting sem confirmados) soma 1 na rodada', () => {
    const { state, ctx } = told(4);
    expect(state.phase).toBe('submitting');
    expect(act(state, 'p0', { type: 'forceNext' }, ctx)).toMatchObject({ phase: 'storytelling', match: 1, round: 2 });
  });

  it('presença que refaz a narração (storytelling) soma 1 na rodada', () => {
    const { state } = started(4);
    const s = dixitOnPresenceChange(state, ctxOf([...ids(4), 'p9']));
    expect(s).not.toBe(state);
    expect(s).toMatchObject({ phase: 'storytelling', match: 1, round: 2 });
  });

  it('voltar pro lobby zera os dois', () => {
    const { state, ctx } = started(4);
    expect(act(state, 'p0', { type: 'lobby' }, ctx)).toMatchObject({ match: 0, round: 0 });
  });
});

describe('withDixitCounters', () => {
  it('estado gravado antes do histórico: partida em andamento vira a 1 (rodada 0); lobby fica na 0', () => {
    const { match: _m, round: _r, ...old } = started(4).state;
    expect(withDixitCounters(old as DixitState)).toMatchObject({ match: 1, round: 0, phase: 'storytelling' });
    const { match: _m2, round: _r2, ...lobby } = initialDixitState();
    expect(withDixitCounters(lobby as DixitState)).toMatchObject({ match: 0, round: 0 });
  });

  it('estado só com match (sem round): mantém a partida e a rodada vira 0', () => {
    const { round: _r, ...partial } = started(4).state;
    expect(withDixitCounters({ ...partial, match: 3 } as DixitState)).toMatchObject({ match: 3, round: 0 });
  });

  it('estado antigo na revelação: partida 1, rodada 0', () => {
    const { match: _m, round: _r, ...old } = revealed(4, (s) => s.storyCard!).state;
    expect(withDixitCounters(old as DixitState)).toMatchObject({ match: 1, round: 0, phase: 'reveal' });
  });

  it('estado que já tem os campos volta o mesmo objeto', () => {
    const s = started(4).state;
    expect(withDixitCounters(s)).toBe(s);
  });
});
