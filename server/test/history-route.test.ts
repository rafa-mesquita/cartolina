import { SELF, env, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import type { HistoryResponse, RoundRecord } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { insertRound } from '../src/history-db';
import { newGameRoom, playRound } from './helpers';

async function history(game: string, before?: number, headers: Record<string, string> = {}): Promise<Response> {
  return SELF.fetch(`https://x/history/${game}${before === undefined ? '' : `?before=${before}`}`, { headers });
}

/** Rodadas gravadas de uma sala, direto do D1 (o histórico compartilhado do ITO muda com outros testes). */
async function roundsOf(code: string): Promise<{ id: string; game: string; mode: string; players_json: string; cards_json: string }[]> {
  const { results } = await env.DB.prepare('SELECT id, game, mode, players_json, cards_json FROM rounds WHERE room_code = ?')
    .bind(code)
    .all<{ id: string; game: string; mode: string; players_json: string; cards_json: string }>();
  return results;
}

/** O DO grava no D1 depois de transmitir o estado: espera a rodada aparecer. */
async function waitForRounds(code: string, count = 1): Promise<Awaited<ReturnType<typeof roundsOf>>> {
  let rows = await roundsOf(code);
  for (let i = 0; i < 40 && rows.length < count; i++) {
    await new Promise((r) => setTimeout(r, 50));
    rows = await roundsOf(code);
  }
  return rows;
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
    const first = await waitForRounds(code);
    expect(first).toHaveLength(1);
    expect(first[0]!.game).toBe('ito');
    expect(first[0]!.mode).toBe('livre');
    expect((JSON.parse(first[0]!.players_json) as { name: string }[]).map((p) => p.name)).toEqual(['P0', 'P1']);
    expect(JSON.parse(first[0]!.cards_json)).toHaveLength(2);

    // alguém sai da sala: novo commit, mas a mesma revelação
    b!.client.ws.close(1000, 'tchau');
    await a!.client.state((v) => v.seats.some((s) => !s.connected));
    await new Promise((r) => setTimeout(r, 200)); // dá tempo de uma gravação indevida aparecer
    expect(await roundsOf(code)).toHaveLength(1);
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

  it('resposta de sucesso tem cache curto (primeira página e seguintes)', async () => {
    for (const res of [await history('ito'), await history('ito', Date.now() + 1)]) {
      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe('public, max-age=15');
    }
  });

  // Sem o bloco `ratelimits` no wrangler.jsonc (fallback do docs/deploy.md) não há limitador: pula.
  it.skipIf(!('HISTORY_LIMITER' in env))('o 61º pedido do mesmo IP no minuto dá 429', async () => {
    const ip = `test-${crypto.randomUUID()}`; // chave única: não depende do estado de outros testes
    const statuses: number[] = [];
    for (let i = 0; i < 61; i++) { // 60 é o limite do HISTORY_LIMITER no wrangler.jsonc
      statuses.push((await history('ito', 0, { 'CF-Connecting-IP': ip })).status);
    }
    expect(statuses.slice(0, 60).every((s) => s === 200)).toBe(true);
    expect(statuses[60]).toBe(429);
  });

  it('sem o header de IP nunca limita', async () => {
    for (let i = 0; i < 65; i++) expect((await history('ito', 0)).status).toBe(200);
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

    expect(await roundsOf(code)).toHaveLength(1);
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
    const rows = await roundsOf(code);
    expect(rows.map((r) => [r.id, r.game])).toEqual([[record.id, 'ito']]);
  });
});
