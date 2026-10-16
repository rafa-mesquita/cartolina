import { cleanGroupName, summarizeHistory, type GroupResponse, type RoomGroup } from '@cartolina/shared';
import { CODE_RE, SLUG_RE, randomCode } from './codes';
import { allowedOrigin } from './guard';
import { allRounds, createGroup, findGroup, listRounds, type GroupRow } from './history-db';
import { RoomDO } from './room-do';

export { RoomDO };

const PAGE_SIZE = 20;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
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

async function createRoomFor(env: Env, group: RoomGroup | null): Promise<Response> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    const res = await stub.fetch(`https://room/init?code=${code}`, { method: 'POST', body: JSON.stringify({ group }) });
    if (res.status === 201) return json({ code }, 201);
  }
  return json({ error: 'no_code' }, 503);
}

/** Lê o cursor `before`: ausente → null (primeira página); inválido → undefined. */
function parseBefore(raw: string | null): number | null | undefined {
  if (raw === null) return null;
  if (!/^\d+$/.test(raw)) return undefined;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : undefined;
}

async function getGroupPage(env: Env, group: GroupRow, before: number | null): Promise<GroupResponse> {
  // Uma a mais que a página só para saber se existe próxima.
  const fetched = await listRounds(env.DB, group.id, before, PAGE_SIZE + 1);
  const rounds = fetched.slice(0, PAGE_SIZE);
  return {
    group: { slug: group.slug, name: group.name, createdAt: group.created_at },
    rounds,
    // Estatísticas só na primeira página: leem até STATS_ROUNDS_CAP rodadas, caro demais para repetir a cada "ver mais".
    stats: before === null ? summarizeHistory(await allRounds(env.DB, group.id)) : null,
    nextBefore: fetched.length > PAGE_SIZE ? rounds[rounds.length - 1]!.playedAt : null,
  };
}

async function handle(request: Request, env: Env, rawOrigin: string | null, origin: string | null): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });

  if (request.method === 'POST' && url.pathname === '/rooms') return createRoomFor(env, null);

  if (request.method === 'POST' && url.pathname === '/groups') {
    const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
    const name = typeof body?.name === 'string' ? cleanGroupName(body.name) : null;
    if (!name) return json({ error: 'bad_group_name' }, 400);
    const group = await createGroup(env.DB, name, Date.now());
    return json({ slug: group.slug, name: group.name }, 201);
  }

  const groupMatch = url.pathname.match(/^\/groups\/([^/]+)(\/rooms)?$/);
  if (groupMatch) {
    const slug = groupMatch[1]!;
    const wantsRoom = Boolean(groupMatch[2]);
    if (request.method !== (wantsRoom ? 'POST' : 'GET')) return json({ error: 'not_found' }, 404);
    if (!SLUG_RE.test(slug)) return json({ error: 'not_found' }, 404);
    const before = wantsRoom ? null : parseBefore(url.searchParams.get('before'));
    if (before === undefined) return json({ error: 'bad_before' }, 400);
    const group = await findGroup(env.DB, slug);
    if (!group) return json({ error: 'not_found' }, 404);
    if (wantsRoom) return createRoomFor(env, { id: group.id, slug: group.slug, name: group.name });
    return json(await getGroupPage(env, group, before));
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
