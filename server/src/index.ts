import { RoomDO } from './room-do';

export { RoomDO };

export const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_RE = new RegExp(`^[${ROOM_ALPHABET}]{4}$`);

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

export function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (b) => ROOM_ALPHABET[b % ROOM_ALPHABET.length]).join('');
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    if (request.method === 'POST' && url.pathname === '/rooms') {
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = randomCode();
        const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
        const res = await stub.fetch(`https://room/init?code=${code}`, { method: 'POST' });
        if (res.status === 201) return json({ code }, 201);
      }
      return json({ error: 'no_code' }, 503);
    }

    const match = url.pathname.match(/^\/rooms\/([^/]+)(\/ws)?$/);
    if (match) {
      const code = match[1]!.toUpperCase();
      if (!CODE_RE.test(code)) return json({ error: 'not_found' }, 404);
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      if (match[2]) return stub.fetch(request);
      const res = await stub.fetch('https://room/exists');
      return json(await res.json(), res.status);
    }

    return json({ error: 'not_found' }, 404);
  },
} satisfies ExportedHandler<Env>;
