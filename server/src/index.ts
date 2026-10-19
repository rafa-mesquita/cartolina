import { GAMES, isGameId, summarizeHistory, type GameId, type HistoryResponse, type HistoryResponseOf } from '@cartolina/shared';
import { CODE_RE, randomCode } from './codes';
import { dixitHistoryPage } from './dixit-history-page';
import { MAX_BODY_BYTES, TOO_LARGE, allowedOrigin, readSmallJson, underLimit, type Limiter } from './guard';
import { HISTORY_PAGE_SIZE, allRounds, listRounds } from './history-db';
import { RoomDO } from './room-do';

export { RoomDO };

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

/** CORS só para origens permitidas. 101 (upgrade de WebSocket) passa intacto: os headers dele são imutáveis. */
function withCors(res: Response, origin: string | null): Response {
  if (res.status === 101) return res;
  const out = new Response(res.body, res);
  out.headers.append('Vary', 'Origin');
  if (origin) {
    out.headers.set('Access-Control-Allow-Origin', origin);
    out.headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    out.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  }
  return out;
}

async function createRoomFor(env: Env, game: GameId): Promise<Response> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    const res = await stub.fetch(`https://room/init?code=${code}`, { method: 'POST', body: JSON.stringify({ game }) });
    if (res.status === 201) return json({ code }, 201);
  }
  return json({ error: 'no_code' }, 503);
}

/** Jogo pedido no corpo `{ game }`. Sem corpo (ou sem `game`) → ITO; jogo desconhecido → null. */
async function requestedGame(request: Request): Promise<GameId | null | typeof TOO_LARGE> {
  const body = await readSmallJson(request);
  if (body === TOO_LARGE) return TOO_LARGE;
  const game = (body as { game?: unknown } | null)?.game;
  if (game === undefined) return 'ito';
  return isGameId(game) ? game : null;
}

/** Cria a sala com o jogo pedido, ou responde 413/400. */
async function createRequestedRoom(request: Request, env: Env): Promise<Response> {
  const game = await requestedGame(request);
  if (game === TOO_LARGE) return json({ error: 'too_large' }, 413);
  if (game === null) return json({ error: 'bad_game' }, 400);
  return createRoomFor(env, game);
}

/** Lê o cursor `before`: ausente → null (primeira página); inválido → undefined. */
function parseBefore(raw: string | null): number | null | undefined {
  if (raw === null) return null;
  if (!/^\d+$/.test(raw)) return undefined;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : undefined;
}

/** Página do histórico do DITU (id `ito`): 20 rodadas; estatísticas só na primeira. */
async function getHistoryPage(env: Env, before: number | null): Promise<HistoryResponse> {
  // Uma a mais que a página só para saber se existe próxima.
  const fetched = await listRounds(env.DB, 'ito', before, HISTORY_PAGE_SIZE + 1);
  const rounds = fetched.slice(0, HISTORY_PAGE_SIZE);
  return {
    game: 'ito',
    rounds,
    // Estatísticas só na primeira página: leem até STATS_ROUNDS_CAP rodadas, caro demais para repetir a cada "ver mais".
    stats: before === null ? summarizeHistory(await allRounds(env.DB, 'ito')) : null,
    nextBefore: fetched.length > HISTORY_PAGE_SIZE ? rounds[rounds.length - 1]!.playedAt : null,
  };
}

/** Página do histórico no formato de cada jogo (jogo novo no registro sem caso aqui não compila). */
async function historyPageOf(env: Env, game: GameId, before: number | null): Promise<HistoryResponseOf<GameId>> {
  switch (game) {
    case 'ito':
      return getHistoryPage(env, before);
    case 'dixit':
      return dixitHistoryPage(env.DB, before);
    case 'pictures':
      // sem `recordsHistory` a rota já respondeu 404; o histórico do Retratim vem no R4
      throw new Error('o Retratim ainda não tem histórico');
    case 'camelio':
      // sem `recordsHistory` a rota já respondeu 404; o histórico do Cama-Leão vem no C4
      throw new Error('o Cama-Leão ainda não tem histórico');
    default: {
      const _never: never = game;
      throw new Error(`jogo sem página de histórico: ${String(_never)}`);
    }
  }
}

/** O binding pode não existir (removido do wrangler.jsonc se o plano não tiver): lê sem depender do tipo gerado. */
function limiterOf(env: Env, name: 'ROOM_LIMITER' | 'HISTORY_LIMITER'): Limiter | undefined {
  return (env as unknown as Partial<Record<typeof name, Limiter>>)[name];
}

const tooMany = () => json({ error: 'too_many' }, 429);

async function handle(request: Request, env: Env, rawOrigin: string | null, origin: string | null): Promise<Response> {
  const url = new URL(request.url);
  // Preflight com cache de 1 dia no navegador.
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Max-Age': '86400' } });
  // CORS só esconde a resposta: POST "simples" de outro site ainda executaria. Recusa antes de criar qualquer coisa.
  if (request.method === 'POST' && rawOrigin && !origin) return json({ error: 'forbidden_origin' }, 403);

  const ip = request.headers.get('CF-Connecting-IP');
  // Vale para todo POST; o `readSmallJson` cobre corpos sem Content-Length (chunked).
  if (request.method === 'POST' && Number(request.headers.get('Content-Length') ?? '0') > MAX_BODY_BYTES) {
    return json({ error: 'too_large' }, 413);
  }

  if (request.method === 'POST' && url.pathname === '/rooms') {
    if (!(await underLimit(limiterOf(env, 'ROOM_LIMITER'), ip))) return tooMany();
    return createRequestedRoom(request, env);
  }

  const historyMatch = url.pathname.match(/^\/history\/([^/]+)$/);
  if (historyMatch && request.method === 'GET') {
    const game = historyMatch[1]!;
    if (!isGameId(game)) return json({ error: 'not_found' }, 404);
    if (!GAMES[game].recordsHistory) return json({ error: 'no_history' }, 404);
    const before = parseBefore(url.searchParams.get('before'));
    if (before === undefined) return json({ error: 'bad_before' }, 400);
    // Público e caro na primeira página (lê até 5000 rodadas): limite por IP. Sem cache: a rodada recém-jogada tem que aparecer.
    if (!(await underLimit(limiterOf(env, 'HISTORY_LIMITER'), ip))) return tooMany();
    const page = await historyPageOf(env, game, before);
    return json(page, 200, { 'Cache-Control': 'no-cache' });
  }

  const roomMatch = url.pathname.match(/^\/rooms\/([^/]+)(\/ws)?$/);
  if (roomMatch) {
    const code = roomMatch[1]!.toUpperCase();
    if (!CODE_RE.test(code)) return json({ error: 'not_found' }, 404);
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    if (roomMatch[2]) {
      // Navegador de outro site tentando abrir o WebSocket: recusa. Sem Origin (scripts, testes) segue.
      if (rawOrigin && !origin) return json({ error: 'forbidden_origin' }, 403);
      return stub.fetch(request);
    }
    const res = await stub.fetch('https://room/exists');
    return json(await res.json(), res.status);
  }

  return json({ error: 'not_found' }, 404);
}

export default {
  async fetch(request, env): Promise<Response> {
    const rawOrigin = request.headers.get('Origin');
    const origin = allowedOrigin(rawOrigin, env.ALLOWED_ORIGINS);
    try {
      return withCors(await handle(request, env, rawOrigin, origin), origin);
    } catch (err) {
      console.error('erro no Worker', err);
      return withCors(json({ error: 'internal' }, 500), origin);
    }
  },
} satisfies ExportedHandler<Env>;
