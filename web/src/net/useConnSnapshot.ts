import { useSyncExternalStore } from 'react';
import type { ConnSnapshot, RoomConnection } from './connection';

const noopSubscribe = () => () => {};
const getNull = () => null;

export function useConnSnapshot(conn: RoomConnection | null): ConnSnapshot | null {
  return useSyncExternalStore(conn ? conn.subscribe : noopSubscribe, conn ? conn.getSnapshot : getNull);
}
