import { SELF, env, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import type { HistoryResponse, RoundRecord } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { insertRound } from '../src/history-db';
import { newGameRoom, playRound } from './helpers';

async function history(game: string, before?: number): Promise<Response> {
  return SELF.fetch(`https://x/history/${game}${before === undefined ? '' : `?before=${before}`}`);
}

describe('GET /history/:game', () => {
  it('rodada de ITO revelada (sala comum, sem grupo) aparece no histórico do ITO', async () => {
    const code = await newGameRoom('ito');
    await playRound(code);
    let found: HistoryResponse | null = null;
    for (let i = 0; i < 20 && !found; i++) {
      const body = (await (await history('ito')).json()) as HistoryResponse;
      if (body.rounds.some((r) => r.roomCode === code)) found = body;
      else await new Promise((r) => setTimeout(r, 50));
    }
    expect(found?.game).toBe('ito');
    expect(found?.stats?.rounds).toBeGreaterThanOrEqual(1);
    const round = found!.rounds.find((r) => r.roomCode === code)!;
    expect(round.cards.map((c) => c.clue)).toContain('Paris');
  });

  it('grava a rodada revelada uma vez só (um novo commit não duplica)', async () => {
    const code = await newGameRoom('ito');
    const [a, b] = await playRound(code);
    const mine = async () =>
      ((await (await history('ito')).json()) as HistoryResponse).rounds.filter((r) => r.roomCode === code);
    const first = await mine();
    expect(first).toHaveLength(1);
    expect(first[0]!.mode).toBe('livre');
    expect(first[0]!.players.map((p) => p.name)).toEqual(['P0', 'P1']);
    expect(first[0]!.cards).toHaveLength(2);

    // alguém sai da sala: novo commit, mas a mesma revelação
    b!.client.ws.close(1000, 'tchau');
    await a!.client.state((v) => v.seats.some((s) => !s.connected));
    expect(await mine()).toHaveLength(1);
  });

  it('sala de Dixit não enfileira rodada para o histórico', async () => {
    const code = await newGameRoom('dixit');
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    await runInDurableObject(stub, async (_instance, state) => {
      expect((await state.storage.list({ prefix: 'pendingRound:' })).size).toBe(0);
    });
  });

  it('páginas seguintes vêm sem estatísticas; before inválido dá 400', async () => {
    const page = (await (await history('ito', Date.now() + 1)).json()) as HistoryResponse;
    expect(page.stats).toBeNull();
    for (const qs of ['?before=abc', '?before=-1', '?before=1.5', '?before=', '?before=99999999999999999999']) {
      const res = await SELF.fetch(`https://x/history/ito${qs}`);
      expect(res.status, qs).toBe(400);
      expect(await res.json()).toEqual({ error: 'bad_before' });
    }
    expect((await history('ito', 0)).status).toBe(200);
  });

  it('jogo sem histórico dá 404 no_history; jogo inexistente dá 404 not_found', async () => {
    const dixit = await history('dixit');
    expect(dixit.status).toBe(404);
    expect(await dixit.json()).toEqual({ error: 'no_history' });
    const xyz = await history('xyz');
    expect(xyz.status).toBe(404);
    expect(await xyz.json()).toEqual({ error: 'not_found' });
  });

  it('só GET lê o histórico', async () => {
    for (const method of ['PUT', 'DELETE', 'POST']) {
      expect((await SELF.fetch('https://x/history/ito', { method })).status, method).toBe(404);
    }
  });

  it('rotas de grupo não existem mais', async () => {
    expect((await SELF.fetch('https://x/groups', { method: 'POST', body: '{"name":"X"}' })).status).toBe(404);
    expect((await SELF.fetch('https://x/groups/abcdefghjk')).status).toBe(404);
    expect((await SELF.fetch('https://x/groups/abcdefghjk/rooms', { method: 'POST' })).status).toBe(404);
  });
});

function rec(playedAt: number): RoundRecord {
  return {
    id: crypto.randomUUID(),
    roomCode: 'ABCD',
    playedAt,
    mode: 'livre',
    level: 1,
    outcome: 'round_won',
    errors: 0,
    campaignId: null,
    theme: { titulo: 'Comidas', min: 'odeio', max: 'amo' },
    players: [{ name: 'Ana', color: '#8EC5FF' }],
    cards: [{ name: 'Ana', color: '#8EC5FF', value: 42, clue: 'pizza', error: false }],
  };
}

/** Rodadas de teste têm `played_at` pequeno; as de verdade têm `Date.now()`. Limpa só as pequenas. */
const clearSmallRounds = () => env.DB.prepare("DELETE FROM rounds WHERE game = 'ito' AND played_at < 1000000000000").run();

async function seed(n: number): Promise<void> {
  for (let t = 1; t <= n; t++) await insertRound(env.DB, 'ito', rec(t), `k${t}`);
}

const range = (from: number, to: number) => Array.from({ length: from - to + 1 }, (_, i) => from - i);

describe('GET /history/:game: paginação', () => {
  it('pagina de 20 em 20, com nextBefore', async () => {
    await clearSmallRounds();
    await seed(25);
    const p1 = (await (await history('ito', 26)).json()) as HistoryResponse;
    expect(p1.rounds.map((r) => r.playedAt)).toEqual(range(25, 6));
    expect(p1.nextBefore).toBe(6);
    expect(p1.stats).toBeNull();
    const p2 = (await (await history('ito', 6)).json()) as HistoryResponse;
    expect(p2.rounds.map((r) => r.playedAt)).toEqual(range(5, 1));
    expect(p2.nextBefore).toBeNull();
    await clearSmallRounds();
  });

  it('exatamente 20 rodadas: não há próxima página', async () => {
    await clearSmallRounds();
    await seed(20);
    const p1 = (await (await history('ito', 21)).json()) as HistoryResponse;
    expect(p1.rounds).toHaveLength(20);
    expect(p1.nextBefore).toBeNull();
    await clearSmallRounds();
  });
});

describe('histórico: falha no D1', () => {
  it('não perde a rodada: guarda no DO e o alarme grava de novo', async () => {
    const code = await newGameRoom('ito');
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
    await playRound(code);

    await runInDurableObject(stub, async (instance, state) => {
      expect((await state.storage.list({ prefix: 'pendingRound:' })).size).toBe(1);
      // Mesmo sem ninguém na sala (sem a varredura de 20 s dos sockets), o DO acorda em até 30 s para tentar de novo.
      const self = instance as unknown as { liveSocketCount(): number; scheduleAlarm(): Promise<void> };
      self.liveSocketCount = () => 0;
      await self.scheduleAlarm();
      const alarm = await state.storage.getAlarm();
      expect(alarm).not.toBeNull();
      expect(alarm! - Date.now()).toBeLessThanOrEqual(30_000);
      // D1 de volta.
      Object.defineProperty(instance, 'env', { configurable: true, value: env });
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);

    const body = (await (await history('ito')).json()) as HistoryResponse;
    expect(body.rounds.some((r) => r.roomCode === code)).toBe(true);
    await runInDurableObject(stub, async (_instance, state) => {
      expect((await state.storage.list({ prefix: 'pendingRound:' })).size).toBe(0);
    });
  });

  it('pendente deixado por servidor antigo (só groupId) vai para o histórico do ITO', async () => {
    const code = await newGameRoom('ito');
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    const record = { ...rec(Date.now()), roomCode: code };
    await runInDurableObject(stub, async (_instance, state) => {
      await state.storage.put(`pendingRound:${record.id}`, { groupId: 'g-antigo', key: 'chave-antiga', record });
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const body = (await (await history('ito')).json()) as HistoryResponse;
    expect(body.rounds.some((r) => r.id === record.id)).toBe(true);
  });
});
