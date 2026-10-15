import type { RoomSummary } from '@cartolina/shared';
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
