import { cleanGroupName, summarizeHistory, type GroupResponse, type RoomGroup } from '@cartolina/shared';
import { CODE_RE, SLUG_RE, randomCode } from './codes';
import { allRounds, createGroup, findGroup, listRounds } from './history-db';
import { RoomDO } from './room-do';

export { RoomDO };

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const PAGE_SIZE = 20;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
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

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

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
      if (!SLUG_RE.test(slug)) return json({ error: 'not_found' }, 404);
      const group = await findGroup(env.DB, slug);
      if (!group) return json({ error: 'not_found' }, 404);
      if (groupMatch[2]) {
        if (request.method !== 'POST') return json({ error: 'not_found' }, 404);
        return createRoomFor(env, { id: group.id, slug: group.slug, name: group.name });
      }
      const beforeParam = url.searchParams.get('before');
      const before = beforeParam && /^\d+$/.test(beforeParam) ? Number(beforeParam) : null;
      const rounds = await listRounds(env.DB, group.id, before, PAGE_SIZE);
      const body: GroupResponse = {
        group: { slug: group.slug, name: group.name, createdAt: group.created_at },
        rounds,
        stats: summarizeHistory(await allRounds(env.DB, group.id)),
        nextBefore: rounds.length === PAGE_SIZE ? rounds[rounds.length - 1]!.playedAt : null,
      };
      return json(body);
    }

    const roomMatch = url.pathname.match(/^\/rooms\/([^/]+)(\/ws)?$/);
    if (roomMatch) {
      const code = roomMatch[1]!.toUpperCase();
      if (!CODE_RE.test(code)) return json({ error: 'not_found' }, 404);
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      if (roomMatch[2]) return stub.fetch(request);
      const res = await stub.fetch('https://room/exists');
      return json(await res.json(), res.status);
    }

    return json({ error: 'not_found' }, 404);
  },
} satisfies ExportedHandler<Env>;
