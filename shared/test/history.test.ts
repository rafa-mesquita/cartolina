import { describe, expect, it } from 'vitest';
import {
  PLAYER_COLORS,
  cleanGroupName,
  createRoom,
  joinRoom,
  mulberry32,
  pendingRecord,
  revealKey,
  roomAction,
  summarizeHistory,
  type ItoAction,
  type Room,
  type RoundRecord,
} from '../src/index';

const GROUP = { id: 'g-1', slug: 'abcdefghjk', name: 'Galera' };

function play(room: Room, id: string, action: ItoAction, now = 100): Room {
  const res = roomAction(room, id, action, mulberry32(7), now);
  if (!res.ok) throw new Error(res.error);
  return res.room;
}

function revealedRoom(mode: 'livre' | 'campanha' = 'livre', group: typeof GROUP | null = GROUP): Room {
  let room = createRoom('ABCD', 0, group);
  for (const [i, name] of ['Ana', 'Bia'].entries()) {
    const res = joinRoom(room, { token: `t${i}`, name, color: PLAYER_COLORS[i]! }, `p${i}`, 0);
    if (!res.ok) throw new Error(res.error);
    room = res.room;
  }
  room = play(room, 'p0', { type: 'setMode', mode });
  room = play(room, 'p0', { type: 'start' }, 50);
  room = play(room, 'p0', { type: 'beginRound' });
  room = play(room, 'p0', { type: 'clue', cardId: 'p0:0', text: '  Paris ' });
  room = play(room, 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
  room = play(room, 'p1', { type: 'place', cardId: 'p1:0', index: 1 });
  return play(room, 'p0', { type: 'forceReveal' });
}

/** Da fase de tema até a revelação, com as cartas em ordem crescente (sem erro) ou decrescente (com erro). */
function dealAndReveal(room: Room, dir: 'asc' | 'desc'): Room {
  let r = play(room, 'p0', { type: 'beginRound' });
  const cards = Object.values(r.game.cards).sort((a, b) => (dir === 'asc' ? a.value - b.value : b.value - a.value));
  for (const [index, card] of cards.entries()) r = play(r, card.owner, { type: 'place', cardId: card.id, index });
  return play(r, 'p0', { type: 'forceReveal' });
}

describe('cleanGroupName', () => {
  it('limpa espaços e limita a 40 caracteres', () => {
    expect(cleanGroupName('  Galera   da call ')).toBe('Galera da call');
    expect(cleanGroupName('   ')).toBeNull();
    expect(cleanGroupName('x'.repeat(41))).toBeNull();
    expect(cleanGroupName('😀'.repeat(40))).toBe('😀'.repeat(40));
  });
});

describe('pendingRecord', () => {
  it('monta o registro da rodada revelada de uma sala de grupo', () => {
    const room = revealedRoom();
    const pending = pendingRecord(room, 1234, 'r-1');
    expect(pending).not.toBeNull();
    const r = pending!.record;
    expect(r).toMatchObject({ id: 'r-1', roomCode: 'ABCD', playedAt: 1234, mode: 'livre', level: 1, campaignId: null });
    expect(['round_won', 'round_lost']).toContain(r.outcome);
    expect(r.theme.titulo).toBeTruthy();
    expect(r.players).toEqual([
      { name: 'Ana', color: PLAYER_COLORS[0] },
      { name: 'Bia', color: PLAYER_COLORS[1] },
    ]);
    expect(r.cards.map((c) => c.name)).toEqual(['Ana', 'Bia']);
    expect(r.cards[0]!.clue).toBe('Paris');
    expect(r.errors).toBe(r.cards.filter((c) => c.error).length);
    expect(pending!.key).toBe(revealKey(room.game));
  });

  it('não grava de novo a mesma revelação', () => {
    const room = revealedRoom();
    const key = pendingRecord(room, 1, 'r')!.key;
    expect(pendingRecord({ ...room, recordedRevealKey: key }, 2, 'r2')).toBeNull();
  });

  it('sala avulsa ou fora da revelação não grava', () => {
    expect(pendingRecord(revealedRoom('livre', null), 1, 'r')).toBeNull();
    expect(pendingRecord(createRoom('ABCD', 0, GROUP), 1, 'r')).toBeNull();
  });

  it('campanha usa o início da partida como id da campanha', () => {
    const r = pendingRecord(revealedRoom('campanha'), 1, 'r')!.record;
    expect(r.campaignId).toBe('ABCD-50');
  });

  it('campanha sem início conhecido fica sem campaignId (não inventa)', () => {
    const room = { ...revealedRoom('campanha'), runStartedAt: null };
    expect(pendingRecord(room, 1, 'r')!.record.campaignId).toBeNull();
  });

  it('a chave da rodada seguinte difere, então ela volta a ser gravada', () => {
    const first = revealedRoom();
    const key1 = pendingRecord(first, 1, 'r1')!.key;
    let room: Room = { ...first, recordedRevealKey: key1 };
    expect(pendingRecord(room, 2, 'r2')).toBeNull();
    room = play(room, 'p0', { type: 'next' });
    room = dealAndReveal(room, 'asc');
    const second = pendingRecord(room, 3, 'r3');
    expect(second).not.toBeNull();
    expect(second!.key).not.toBe(key1);
  });

  it('a chave inclui nível, vidas e tema', () => {
    const room = revealedRoom('campanha');
    const g = room.game;
    expect(revealKey(g)!.startsWith(`${g.level}|${g.lives}|${g.theme!.titulo}|`)).toBe(true);
  });

  it('o id da campanha sobrevive a repetir o nível; voltar ao lobby e começar gera outro', () => {
    let room = createRoom('ABCD', 0, GROUP);
    for (const [i, name] of ['Ana', 'Bia'].entries()) {
      const res = joinRoom(room, { token: `t${i}`, name, color: PLAYER_COLORS[i]! }, `p${i}`, 0);
      if (!res.ok) throw new Error(res.error);
      room = res.room;
    }
    room = play(room, 'p0', { type: 'setMode', mode: 'campanha' });
    room = play(room, 'p0', { type: 'start' }, 50);
    room = dealAndReveal(room, 'desc');
    expect(room.game.outcome).toBe('level_failed');
    const first = pendingRecord(room, 1, 'a')!;
    expect(first.record.campaignId).toBe('ABCD-50');
    expect(first.record.errors).toBe(1);

    room = play({ ...room, recordedRevealKey: first.key }, 'p0', { type: 'next' });
    room = dealAndReveal(room, 'asc');
    const second = pendingRecord(room, 2, 'b')!;
    expect(second.record.level).toBe(1);
    expect(second.record.campaignId).toBe('ABCD-50');
    expect(second.key).not.toBe(first.key);

    room = play(room, 'p0', { type: 'lobby' });
    room = play(room, 'p0', { type: 'start' }, 70);
    room = dealAndReveal(room, 'asc');
    expect(pendingRecord(room, 3, 'c')!.record.campaignId).toBe('ABCD-70');
  });

  it('errors acompanha as cartas gravadas', () => {
    let room = createRoom('ABCD', 0, GROUP);
    for (const [i, name] of ['Ana', 'Bia'].entries()) {
      const res = joinRoom(room, { token: `t${i}`, name, color: PLAYER_COLORS[i]! }, `p${i}`, 0);
      if (!res.ok) throw new Error(res.error);
      room = res.room;
    }
    room = play(room, 'p0', { type: 'start' }, 50);
    room = dealAndReveal(room, 'desc');
    const wrong = room.game.reveal!.find((e) => e.error)!;
    const trimmed = { ...room, seats: room.seats.filter((s) => s.id !== wrong.owner) };
    const r = pendingRecord(trimmed, 1, 'r')!.record;
    expect(r.cards).toHaveLength(1);
    expect(r.errors).toBe(0);
    expect(r.errors).toBe(r.cards.filter((c) => c.error).length);
  });
});

function rec(over: Partial<RoundRecord>): RoundRecord {
  return {
    id: Math.random().toString(36),
    roomCode: 'ABCD',
    playedAt: 0,
    mode: 'livre',
    level: 1,
    outcome: 'round_won',
    errors: 0,
    campaignId: null,
    theme: { titulo: 'Comidas', min: 'odeio', max: 'amo' },
    players: [],
    cards: [],
    ...over,
  };
}

const card = (name: string, error = false) => ({ name, color: PLAYER_COLORS[0], value: 10, clue: 'x', error });

describe('summarizeHistory', () => {
  it('sem rodadas tudo zera', () => {
    expect(summarizeHistory([])).toEqual({
      rounds: 0,
      livreRounds: 0,
      livreWins: 0,
      campaigns: 0,
      campaignsWon: 0,
      bestStreak: 0,
      sharpest: null,
      topThemes: [],
    });
  });

  it('conta vitórias no livre, campanhas e a maior sequência sem erro em ordem cronológica', () => {
    const s = summarizeHistory([
      rec({ playedAt: 3, errors: 1, outcome: 'round_lost' }),
      rec({ playedAt: 1 }),
      rec({ playedAt: 2 }),
      rec({ playedAt: 4 }),
      rec({ playedAt: 5, mode: 'campanha', outcome: 'won' }),
      rec({ playedAt: 6, mode: 'campanha', outcome: 'lost', errors: 2 }),
    ]);
    expect(s.rounds).toBe(6);
    expect(s.livreRounds).toBe(4);
    expect(s.livreWins).toBe(3);
    expect(s.campaigns).toBe(2);
    expect(s.campaignsWon).toBe(1);
    expect(s.bestStreak).toBe(2);
  });

  it('level_failed e level_cleared não contam como campanha; só won/lost', () => {
    const c = (outcome: RoundRecord['outcome'], playedAt: number) =>
      rec({ playedAt, mode: 'campanha', outcome, errors: outcome === 'level_failed' ? 1 : 0 });
    const s = summarizeHistory([c('level_failed', 1), c('level_cleared', 2), c('won', 3), c('level_failed', 4), c('lost', 5)]);
    expect(s.campaigns).toBe(2);
    expect(s.campaignsWon).toBe(1);
    expect(s.livreRounds).toBe(0);
  });

  it('mais certeiro precisa de pelo menos 3 cartas', () => {
    const s = summarizeHistory([
      rec({ cards: [card('Ana'), card('Ana'), card('Ana', true), card('Bia'), card('Bia')] }),
      rec({ cards: [card('Ana'), card('Caio'), card('Caio'), card('Caio')] }),
    ]);
    expect(s.sharpest).toMatchObject({ name: 'Caio', cards: 3, correct: 3, accuracy: 1 });
  });

  it('temas mais jogados (top 5, empate em ordem alfabética)', () => {
    const t = (titulo: string) => rec({ theme: { titulo, min: 'a', max: 'b' } });
    const s = summarizeHistory([t('B'), t('A'), t('B'), t('C'), t('D'), t('E'), t('F')]);
    expect(s.topThemes).toEqual([
      { titulo: 'B', count: 2 },
      { titulo: 'A', count: 1 },
      { titulo: 'C', count: 1 },
      { titulo: 'D', count: 1 },
      { titulo: 'E', count: 1 },
    ]);
  });
});
