import { describe, expect, it } from 'vitest';
import { dixitMatchId, dixitRevealKey, pendingDixitRecord } from '../src/games/dixit/record';
import { dixitOnPresenceChange, initialDixitState } from '../src/games/dixit/rules';
import type { DixitAction } from '../src/games/dixit/types';
import { pendingHistoryRecord } from '../src/history';
import { mulberry32 } from '../src/rng';
import { createRoom, dixitStateOf, roomAction, type Room } from '../src/room';
import { act, ctxOf, ids, others, revealed, started, voting } from './dixit-helpers';
import { NAMES, colorOf, playToReveal, roomOf } from './dixit-history-helpers';

function playRoom(room: Room, id: string, action: DixitAction, now: number): Room {
  const res = roomAction(room, id, action, mulberry32(7), now);
  if (!res.ok) throw new Error(res.error);
  return res.room;
}

describe('pendingDixitRecord', () => {
  it('monta o registro da rodada revelada com nomes e personagens da hora', () => {
    const { state } = revealed(4, (s) => s.storyCard!);
    const res = state.result!;
    const pending = pendingDixitRecord(roomOf(state), 1234, 'r-1')!;
    const r = pending.record;
    expect(pending.key).toBe('ABCD-50-1|1');
    expect(r).toMatchObject({
      id: 'r-1',
      matchId: 'ABCD-50-1',
      roomCode: 'ABCD',
      playedAt: 1234,
      target: 30,
      round: 1,
      clue: 'saudade',
      storyCard: res.storyCard,
    });
    expect(r.storyteller).toEqual({ name: NAMES[res.storyteller], color: colorOf(res.storyteller) });
    expect(r.cards.map((c) => c.card)).toEqual(res.table);
    expect(r.cards.find((c) => c.card === res.storyCard)!.owner.name).toBe(NAMES[res.storyteller]);
    expect(r.cards.map((c) => c.owner.name)).toEqual(res.table.map((c) => NAMES[res.owners[c]!]));
    expect(r.cards.map((c) => c.owner.color)).toEqual(res.table.map((c) => colorOf(res.owners[c]!)));
    expect(r.votes).toHaveLength(3);
    expect(r.votes.every((v) => v.card === res.storyCard)).toBe(true);
    expect(r.votes.map((v) => v.voter.name)).toEqual(Object.keys(res.votes).map((p) => NAMES[p]));
    expect(r.scores.map((s) => s.name)).toEqual(['Ana', 'Bia', 'Caio', 'Duda']);
    expect(r.scores.map((s) => s.score)).toEqual(ids(4).map((p) => state.scores[p]));
    expect(r.scores.map((s) => s.gained)).toEqual(ids(4).map((p) => res.gained[p]));
  });

  it('numa rodada seguinte o placar é o acumulado, não só os pontos da rodada', () => {
    const { state, ctx } = revealed(4, (s) => s.storyCard!);
    const second = playToReveal(act(state, 'p0', { type: 'next' }, ctx), ctx);
    const pending = pendingDixitRecord(roomOf(second), 1, 'r-2')!;
    expect(pending.key).toBe('ABCD-50-1|2');
    const { scores } = pending.record;
    expect(scores.map((x) => x.score)).toEqual(ids(4).map((p) => second.scores[p]));
    expect(scores.map((x) => x.gained)).toEqual(ids(4).map((p) => second.result!.gained[p] ?? 0));
    expect(scores.some((x) => x.score !== x.gained)).toBe(true);
  });

  it('dica falada na call fica vazia', () => {
    const { state } = revealed(4, (s) => s.storyCard!);
    const room = roomOf({ ...state, result: { ...state.result!, clue: '' } });
    expect(pendingDixitRecord(room, 1, 'r')!.record.clue).toBe('');
  });

  it('quem saiu no meio aparece no placar, sem voto', () => {
    const { state: v } = voting(4);
    const leaver = others(v).at(-1)!;
    const staying = ctxOf(ids(4).filter((p) => p !== leaver));
    let s = dixitOnPresenceChange(v, staying);
    for (const p of others(s).filter((p) => p !== leaver)) {
      s = act(s, p, { type: 'vote', cardId: s.storyCard! }, staying);
      s = act(s, p, { type: 'confirm' }, staying);
    }
    expect(s.phase).toBe('reveal');
    const r = pendingDixitRecord(roomOf(s), 1, 'r')!.record;
    expect(r.votes.map((x) => x.voter.name)).not.toContain(NAMES[leaver]);
    expect(r.scores.map((x) => x.name)).toContain(NAMES[leaver]);
  });

  it('rodada destravada pelo host sem nenhum voto também grava (sem votos)', () => {
    const { state, ctx } = voting(4);
    const s = act(state, 'p0', { type: 'forceNext' }, ctx);
    expect(s.phase).toBe('reveal');
    expect(pendingDixitRecord(roomOf(s), 1, 'r')!.record.votes).toEqual([]);
  });

  it('fora da revelação, sala no lobby ou sala do DITU: nada a gravar', () => {
    expect(pendingDixitRecord(roomOf(started(4).state), 1, 'r')).toBeNull();
    expect(pendingDixitRecord(roomOf(initialDixitState()), 1, 'r')).toBeNull();
    expect(pendingDixitRecord(createRoom('ABCD', 0), 1, 'r')).toBeNull();
  });

  it('rodada com bot (modo teste) não vai pro histórico: narrador, quem jogou e votou, ou só no placar', () => {
    const asBot = (room: Room, playerId: string): Room => ({
      ...room,
      seats: room.seats.map((s) => (s.id === playerId ? { ...s, name: `Bot ${s.name}` } : s)),
    });
    const { state } = revealed(4, (s) => s.storyCard!);
    const room = roomOf(state);
    expect(pendingDixitRecord(room, 1, 'r')).not.toBeNull();
    expect(pendingDixitRecord(asBot(room, state.result!.storyteller), 1, 'r')).toBeNull();
    expect(pendingDixitRecord(asBot(room, others(state)[0]!), 1, 'r')).toBeNull();

    // Quem saiu antes de votar só aparece no placar (e na carta que jogou).
    const { state: v } = voting(4);
    const leaver = others(v).at(-1)!;
    const staying = ctxOf(ids(4).filter((p) => p !== leaver));
    let s = dixitOnPresenceChange(v, staying);
    for (const p of others(s).filter((p) => p !== leaver)) {
      s = act(s, p, { type: 'vote', cardId: s.storyCard! }, staying);
      s = act(s, p, { type: 'confirm' }, staying);
    }
    expect(s.result!.votes[leaver]).toBeUndefined();
    expect(pendingDixitRecord(asBot(roomOf(s), leaver), 1, 'r')).toBeNull();
  });

  it('não grava de novo a mesma revelação', () => {
    const room = roomOf(revealed(4, (s) => s.storyCard!).state);
    const key = pendingDixitRecord(room, 1, 'r')!.key;
    expect(pendingDixitRecord({ ...room, recordedRevealKey: key }, 2, 'r2')).toBeNull();
  });
});

describe('chave da revelação e id da partida', () => {
  it('muda a cada rodada e a cada partida (próxima, jogar de novo, outra sessão)', () => {
    const { state, ctx } = revealed(4, (s) => s.storyCard!);
    expect(dixitRevealKey(roomOf(state))).toBe('ABCD-50-1|1');
    const second = playToReveal(act(state, 'p0', { type: 'next' }, ctx), ctx);
    expect(dixitRevealKey(roomOf(second))).toBe('ABCD-50-1|2');
    const over = act({ ...second, scores: { ...second.scores, p1: 30 } }, 'p0', { type: 'next' }, ctx);
    const again = playToReveal(act(over, 'p0', { type: 'again' }, ctx), ctx);
    expect(dixitRevealKey(roomOf(again))).toBe('ABCD-50-2|1');
    expect(dixitRevealKey(roomOf(again, { runStartedAt: 90 }))).toBe('ABCD-90-2|1');
  });

  it('voltar pro lobby e começar de novo gera outra partida (o início da sessão muda)', () => {
    let room = roomOf(initialDixitState(), { runStartedAt: null });
    room = playRoom(room, 'p0', { type: 'start' }, 100);
    const first = dixitMatchId(room, dixitStateOf(room)!);
    room = playRoom(room, 'p0', { type: 'lobby' }, 200);
    room = playRoom(room, 'p0', { type: 'start' }, 300);
    expect(first).toBe('ABCD-100-1');
    expect(dixitMatchId(room, dixitStateOf(room)!)).toBe('ABCD-300-1');
  });

  it('sessão sem início gravado usa 0 no id da partida', () => {
    const room = roomOf(started(4).state, { runStartedAt: null });
    expect(dixitMatchId(room, dixitStateOf(room)!)).toBe('ABCD-0-1');
  });

  it('fora da revelação não tem chave', () => {
    expect(dixitRevealKey(roomOf(started(4).state))).toBeNull();
  });
});

describe('pendingHistoryRecord', () => {
  it('sala de Diquisti na revelação: pendente do Diquisti', () => {
    const pending = pendingHistoryRecord(roomOf(revealed(4, (s) => s.storyCard!).state), 1, 'r');
    expect(pending?.game).toBe('dixit');
    expect(pending?.key).toBe('ABCD-50-1|1');
    expect(pending?.record.id).toBe('r');
  });

  it('sala fora da revelação: nada', () => {
    expect(pendingHistoryRecord(createRoom('ABCD', 0), 1, 'r')).toBeNull();
  });
});
