import type { RoomView } from '@cartolina/shared';
import type { ConnSnapshot, GameConn } from '../net/connection';
import { Lobby } from './Lobby';
import { Toasts } from './Toasts';

export function Game({ conn, snap, view }: { conn: GameConn; snap: ConnSnapshot; view: RoomView }) {
  return (
    <>
      {snap.status === 'reconnecting' && <div className="banner-reconnect" role="status">reconectando…</div>}
      {view.game.phase === 'lobby' ? (
        <Lobby view={view} conn={conn} />
      ) : (
        <main className="screen">
          <p className="hint">mesa em construção (fase {view.game.phase})</p>
        </main>
      )}
      <Toasts conn={conn} />
    </>
  );
}
