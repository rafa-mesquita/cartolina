import { isDixitRoomView, isItoRoomView, type RoomView } from '@cartolina/shared';
import { DixitLobby } from '../games/dixit/DixitLobby';
import { DixitTable } from '../games/dixit/DixitTable';
import type { ConnSnapshot, GameConn } from '../net/connection';
import { Table } from '../table/Table';
import { Lobby } from './Lobby';
import { Toasts } from './Toasts';

export function Game({ conn, snap, view }: { conn: GameConn; snap: ConnSnapshot; view: RoomView }) {
  const reconnecting = snap.status === 'reconnecting' && (
    <div className="banner-reconnect" role="status">
      reconectando…
    </div>
  );
  if (isDixitRoomView(view)) {
    // Sala de Diquisti (id interno `dixit`): a mesa tem os próprios avisos (toast no palco).
    return (
      <>
        {reconnecting}
        {view.game.phase === 'lobby' ? <DixitLobby view={view} conn={conn} /> : <DixitTable view={view} conn={conn} status={snap.status} />}
      </>
    );
  }
  if (!isItoRoomView(view)) return null;
  return (
    <>
      {reconnecting}
      {view.game.phase === 'lobby' ? <Lobby view={view} conn={conn} /> : <Table view={view} conn={conn} />}
      <Toasts conn={conn} />
    </>
  );
}
