import type { RoomView } from '@cartolina/shared';
import type { ConnSnapshot, GameConn } from '../net/connection';
import { Table } from '../table/Table';
import { Lobby } from './Lobby';
import { Toasts } from './Toasts';

export function Game({ conn, snap, view }: { conn: GameConn; snap: ConnSnapshot; view: RoomView }) {
  return (
    <>
      {snap.status === 'reconnecting' && <div className="banner-reconnect" role="status">reconectando…</div>}
      {view.game.phase === 'lobby' ? <Lobby view={view} conn={conn} /> : <Table view={view} conn={conn} />}
      <Toasts conn={conn} />
    </>
  );
}
