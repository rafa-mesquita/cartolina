import { isItoRoomView, type RoomView } from '@cartolina/shared';
import type { ConnSnapshot, GameConn } from '../net/connection';
import { Table } from '../table/Table';
import { Lobby } from './Lobby';
import { Toasts } from './Toasts';

/** Sala de Dixit: a mesa chega no Plano D2. */
function DixitSoon() {
  return (
    <main className="screen">
      <section className="panel">
        <h2>a mesa do Dixit está sendo montada</h2>
        <p>Já dá pra criar a sala, mas a mesa chega em breve.</p>
      </section>
    </main>
  );
}

export function Game({ conn, snap, view }: { conn: GameConn; snap: ConnSnapshot; view: RoomView }) {
  return (
    <>
      {snap.status === 'reconnecting' && <div className="banner-reconnect" role="status">reconectando…</div>}
      {!isItoRoomView(view) ? (
        <DixitSoon />
      ) : view.game.phase === 'lobby' ? (
        <Lobby view={view} conn={conn} />
      ) : (
        <Table view={view} conn={conn} />
      )}
      <Toasts conn={conn} />
    </>
  );
}
