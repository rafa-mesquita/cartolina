/** Sem ping há mais que isso, o socket é considerado morto (cliente pinga a cada 15 s). */
export const HEARTBEAT_TIMEOUT_MS = 45_000;
/** Enquanto houver sockets, o DO acorda pelo menos neste intervalo para varrer os mortos. */
export const SWEEP_INTERVAL_MS = 20_000;

export function isStale(lastPingAt: number | null, acceptedAt: number, now: number): boolean {
  return now - (lastPingAt ?? acceptedAt) > HEARTBEAT_TIMEOUT_MS;
}

export function nextWakeAt(roomAlarmAt: number, openSockets: number, now: number): number {
  return openSockets > 0 ? Math.min(roomAlarmAt, now + SWEEP_INTERVAL_MS) : roomAlarmAt;
}
