import type { GameId, HistoryResponse, RoomSummary } from '@cartolina/shared';
import { SERVER_URL } from './config';

export type RoomInfo = { exists: true } & RoomSummary;

export async function createRoom(game: GameId, fetcher: typeof fetch = fetch, base: string = SERVER_URL): Promise<string> {
  const res = await fetcher(`${base}/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ game }),
  });
  if (!res.ok) throw new Error(`create_failed_${res.status}`);
  return ((await res.json()) as { code: string }).code;
}

export async function getRoomInfo(code: string, fetcher: typeof fetch = fetch, base: string = SERVER_URL): Promise<RoomInfo | null> {
  const res = await fetcher(`${base}/rooms/${code}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`info_failed_${res.status}`);
  return (await res.json()) as RoomInfo;
}

/** Histórico do jogo; `null` quando o jogo não tem histórico (404). */
export async function getHistory(
  game: GameId,
  before: number | null = null,
  fetcher: typeof fetch = fetch,
  base: string = SERVER_URL,
): Promise<HistoryResponse | null> {
  const qs = before === null ? '' : `?before=${before}`;
  const res = await fetcher(`${base}/history/${game}${qs}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`history_failed_${res.status}`);
  return (await res.json()) as HistoryResponse;
}
