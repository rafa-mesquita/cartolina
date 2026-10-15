import type { GroupResponse, RoomSummary } from '@cartolina/shared';
import { SERVER_URL } from './config';

export type RoomInfo = { exists: true } & RoomSummary;

export async function createRoom(fetcher: typeof fetch = fetch, base: string = SERVER_URL): Promise<string> {
  const res = await fetcher(`${base}/rooms`, { method: 'POST' });
  if (!res.ok) throw new Error(`create_failed_${res.status}`);
  return ((await res.json()) as { code: string }).code;
}

export async function getRoomInfo(code: string, fetcher: typeof fetch = fetch, base: string = SERVER_URL): Promise<RoomInfo | null> {
  const res = await fetcher(`${base}/rooms/${code}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`info_failed_${res.status}`);
  return (await res.json()) as RoomInfo;
}

export async function createGroup(name: string, fetcher: typeof fetch = fetch, base: string = SERVER_URL): Promise<{ slug: string; name: string }> {
  const res = await fetcher(`${base}/groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`group_create_failed_${res.status}`);
  return (await res.json()) as { slug: string; name: string };
}

export async function getGroup(
  slug: string,
  before: number | null = null,
  fetcher: typeof fetch = fetch,
  base: string = SERVER_URL,
): Promise<GroupResponse | null> {
  const qs = before === null ? '' : `?before=${before}`;
  const res = await fetcher(`${base}/groups/${slug}${qs}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`group_failed_${res.status}`);
  return (await res.json()) as GroupResponse;
}

export async function createGroupRoom(slug: string, fetcher: typeof fetch = fetch, base: string = SERVER_URL): Promise<string> {
  const res = await fetcher(`${base}/groups/${slug}/rooms`, { method: 'POST' });
  if (!res.ok) throw new Error(`create_failed_${res.status}`);
  return ((await res.json()) as { code: string }).code;
}
