import { env } from 'cloudflare:test';
import type { DixitRoundRecord, RoundRecord } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { insertPending } from '../src/room-do';

// Sala PNDG, played_at 70_001–70_002 (faixa própria deste arquivo).
const ito = (): RoundRecord => ({
  id: crypto.randomUUID(),
  roomCode: 'PNDG',
  playedAt: 70_001,
  mode: 'livre',
  level: 1,
  outcome: 'round_won',
  errors: 0,
  campaignId: null,
  theme: { titulo: 'Comidas', min: 'odeio', max: 'amo' },
  players: [{ name: 'Ana', color: '#8EC5FF' }],
  cards: [{ name: 'Ana', color: '#8EC5FF', value: 42, clue: 'pizza', error: false }],
});

const dixit = (): DixitRoundRecord => ({
  id: crypto.randomUUID(),
  matchId: 'PNDG-1-1',
  roomCode: 'PNDG',
  playedAt: 70_002,
  target: 30,
  round: 1,
  storyteller: { name: 'Ana', color: '#8EC5FF' },
  clue: 'luar',
  storyCard: 'd001',
  cards: [{ card: 'd001', owner: { name: 'Ana', color: '#8EC5FF' } }],
  votes: [],
  scores: [{ name: 'Ana', color: '#8EC5FF', gained: 0, score: 0 }],
});

const idsIn = async (table: 'rounds' | 'dixit_rounds') =>
  (await env.DB.prepare(`SELECT id FROM ${table} WHERE room_code = 'PNDG'`).all<{ id: string }>()).results.map((r) => r.id);

describe('insertPending', () => {
  it('pendente do Diquisti vai pra dixit_rounds; do ITO e o antigo (só groupId) vão pra rounds do ITO', async () => {
    const d = dixit();
    const i = ito();
    const old = ito();
    await insertPending(env.DB, { game: 'dixit', key: 'kd', record: d });
    await insertPending(env.DB, { game: 'ito', key: 'ki', record: i });
    await insertPending(env.DB, { groupId: 'g-antigo', key: 'ko', record: old });
    expect(await idsIn('dixit_rounds')).toEqual([d.id]);
    expect((await idsIn('rounds')).sort()).toEqual([i.id, old.id].sort());
    await env.DB.prepare("DELETE FROM dixit_rounds WHERE room_code = 'PNDG'").run();
    await env.DB.prepare("DELETE FROM rounds WHERE room_code = 'PNDG'").run();
  });
});
