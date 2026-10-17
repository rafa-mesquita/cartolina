import { SELF, env, runInDurableObject } from 'cloudflare:test';
import { GAMES, type DixitHistoryResponse, type DixitRoomView } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { newGameRoom, playDixitRound } from './helpers';

const rowsOf = async (code: string) =>
  (await env.DB.prepare('SELECT id, match_id, clue FROM dixit_rounds WHERE room_code = ?').bind(code).all<{ id: string; match_id: string; clue: string }>())
    .results;

/** O DO grava no D1 depois de transmitir o estado: espera a rodada aparecer. */
async function waitForRows(code: string): Promise<Awaited<ReturnType<typeof rowsOf>>> {
  let rows = await rowsOf(code);
  for (let i = 0; i < 40 && rows.length === 0; i++) {
    await new Promise((r) => setTimeout(r, 50));
    rows = await rowsOf(code);
  }
  return rows;
}

async function pendingCount(code: string): Promise<number> {
  const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
  let size = 0;
  await runInDurableObject(stub, async (_instance, state) => {
    size = (await state.storage.list({ prefix: 'pendingRound:' })).size;
  });
  return size;
}

describe('histórico do Diquisti no servidor', () => {
  it('o registro diz que o Diquisti grava histórico', () => {
    expect(GAMES.dixit.recordsHistory).toBe(true);
  });

  it('rodada revelada grava uma vez só, esvazia a fila do DO e aparece em GET /history/dixit', async () => {
    const code = await newGameRoom('dixit');
    const { players, tellerId } = await playDixitRound(code, 'saudade');
    const rows = await waitForRows(code);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.clue).toBe('saudade');
    expect(rows[0]!.match_id).toMatch(new RegExp(`^${code}-\\d+-1$`));

    // alguém sai: novo commit, mas a mesma revelação
    const leaver = players.find((p) => p.id !== tellerId)!;
    const other = players.find((p) => p !== leaver)!;
    leaver.client.ws.close(1000, 'tchau');
    await other.client.state<DixitRoomView>((v) => v.seats.some((s) => !s.connected));
    await new Promise((r) => setTimeout(r, 200)); // dá tempo de uma gravação indevida aparecer
    expect(await rowsOf(code)).toHaveLength(1);
    for (let i = 0; i < 20 && (await pendingCount(code)) > 0; i++) await new Promise((r) => setTimeout(r, 50));
    expect(await pendingCount(code)).toBe(0);

    const res = await SELF.fetch('https://x/history/dixit');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-cache');
    const body = (await res.json()) as DixitHistoryResponse;
    expect(body.game).toBe('dixit');
    expect(body.stats).not.toBeNull();
    const match = body.matches.find((m) => m.roomCode === code)!;
    expect(match.finished).toBe(false);
    expect(match.rounds.map((r) => r.clue)).toEqual(['saudade']);
    expect(match.scores.map((s) => s.name).sort()).toEqual(['P0', 'P1', 'P2']);
  });

  it('páginas seguintes vêm sem estatísticas; before inválido dá 400', async () => {
    const page = (await (await SELF.fetch(`https://x/history/dixit?before=${Date.now() + 1}`)).json()) as DixitHistoryResponse;
    expect(page.game).toBe('dixit');
    expect(page.stats).toBeNull();
    const bad = await SELF.fetch('https://x/history/dixit?before=abc');
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: 'bad_before' });
  });
});
