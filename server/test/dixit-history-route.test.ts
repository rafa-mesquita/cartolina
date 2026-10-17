import { SELF, env, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { GAMES, type DixitHistoryResponse, type DixitRoomView, type DixitState, type Room } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { RoomDO } from '../src/room-do';
import { joined, newGameRoom, playDixitRound, type TestClient } from './helpers';

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

type Player = { client: TestClient; id: string; token: string };

const storytelling = (players: Player[]) =>
  Promise.all(players.map((p) => p.client.state<DixitRoomView>((r) => r.game.phase === 'storytelling')));

/** Da narração até a revelação (mesmo caminho do playDixitRound), com as visões da narração já recebidas. */
async function playFromStorytelling(players: Player[], views: DixitRoomView[], clue: string): Promise<void> {
  const tellerId = views[0]!.game.storyteller!;
  const ti = players.findIndex((p) => p.id === tellerId);
  players[ti]!.client.send({ t: 'action', action: { type: 'tell', cardId: views[ti]!.game.hand[0]!, clue } });
  const rest = players.filter((p) => p.id !== tellerId);
  for (const p of rest) {
    const v = await p.client.state<DixitRoomView>((r) => r.game.phase === 'submitting');
    p.client.send({ t: 'action', action: { type: 'submit', cardIds: v.game.hand.slice(0, 2) } });
    p.client.send({ t: 'action', action: { type: 'confirm' } });
  }
  for (const p of rest) {
    const v = await p.client.state<DixitRoomView>((r) => r.game.phase === 'voting');
    p.client.send({ t: 'action', action: { type: 'vote', cardId: v.game.table.find((t) => !t.mine)!.cardId } });
    p.client.send({ t: 'action', action: { type: 'confirm' } });
  }
  await Promise.all(players.map((p) => p.client.state<DixitRoomView>((r) => r.game.phase === 'reveal')));
}

describe('histórico do Diquisti: falha no D1', () => {
  it('a partida segue e a rodada é gravada depois, pelo alarme', async () => {
    const code = await newGameRoom('dixit');
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    // D1 fora do ar só para este DO: o INSERT lança até restaurarmos o binding.
    const downDb = {
      prepare: () => {
        throw new Error('d1 fora do ar');
      },
    };
    await runInDurableObject(stub, async (instance) => {
      const real = (instance as unknown as { env: Env }).env;
      Object.defineProperty(instance, 'env', {
        configurable: true,
        value: new Proxy(real, { get: (t, k, r) => (k === 'DB' ? downDb : Reflect.get(t, k, r)) }),
      });
    });
    const { players } = await playDixitRound(code, 'sem banco');

    // a partida não trava: o host passa pra próxima rodada
    players[0]!.client.send({ t: 'action', action: { type: 'next' } });
    await players[1]!.client.state<DixitRoomView>((r) => r.game.phase === 'storytelling');
    expect(await rowsOf(code)).toHaveLength(0);

    await runInDurableObject(stub, async (instance, state) => {
      expect((await state.storage.list({ prefix: 'pendingRound:' })).size).toBe(1);
      // D1 de volta.
      Object.defineProperty(instance, 'env', { configurable: true, value: env });
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);

    const rows = await rowsOf(code);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.clue).toBe('sem banco');
    expect(await pendingCount(code)).toBe(0);
  });
});

describe('histórico do Diquisti: sala gravada antes de match/round', () => {
  it('sala em andamento no formato antigo, lida do storage, continua gravando cada rodada', async () => {
    const code = await newGameRoom('dixit');
    const players = await joined(code, 3);
    players[0]!.client.send({ t: 'action', action: { type: 'start' } });
    const first = await storytelling(players);

    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    await runInDurableObject(stub, async (instance, state) => {
      // Formato de antes desta versão: o estado do Diquisti sem match/round.
      const stored = (await state.storage.get<Room>('room'))!;
      const { match: _match, round: _round, ...oldGame } = stored.game as DixitState;
      await state.storage.put('room', { ...stored, game: oldGame });
      // Uma instância nova sobre o mesmo storage é o que o runtime faz ao reiniciar o DO (ver room-do.test.ts);
      // os sockets continuam na instância de verdade, que passa a usar a sala como o reinício a leu.
      const restarted = new RoomDO(state, env);
      await state.blockConcurrencyWhile(async () => {});
      const loaded = (restarted as unknown as { room: Room }).room;
      expect((loaded.game as DixitState).match).toBe(1);
      expect((loaded.game as DixitState).round).toBe(0);
      (instance as unknown as { room: Room }).room = loaded;
    });

    await playFromStorytelling(players, first, 'antiga 1');
    expect((await waitForRows(code)).map((r) => r.clue)).toEqual(['antiga 1']);
    players[0]!.client.send({ t: 'action', action: { type: 'next' } });
    await playFromStorytelling(players, await storytelling(players), 'antiga 2');
    let rows = await rowsOf(code);
    for (let i = 0; i < 40 && rows.length < 2; i++) {
      await new Promise((r) => setTimeout(r, 50));
      rows = await rowsOf(code);
    }
    // chaves diferentes por rodada: as duas revelações entram, na mesma partida
    expect(rows.map((r) => r.clue).sort()).toEqual(['antiga 1', 'antiga 2']);
    expect(new Set(rows.map((r) => r.match_id)).size).toBe(1);
    expect(rows[0]!.match_id).toMatch(new RegExp(`^${code}-\\d+-1$`));
  });
});
