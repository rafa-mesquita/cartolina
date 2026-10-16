import { isItoRoomView, type RoomView } from '@cartolina/shared';
import { goHome } from '../lib/router';
import type { ConnSnapshot, GameConn } from '../net/connection';
import { Table } from '../table/Table';
import { Lobby } from './Lobby';
import { Toasts } from './Toasts';

/** Sala de Diquisti (id interno `dixit`): a mesa chega no Plano D2. */
function DixitSoon() {
  return (
    <main className="screen">
      <h1 className="logo">
        cartolina<span>~</span>
      </h1>
      <section className="panel">
        <h2>a mesa do Diquisti está sendo montada</h2>
        <p>Essa sala é de Diquisti: a mesa ainda está sendo montada.</p>
        <button className="btn" type="button" onClick={goHome}>
          voltar pro início
        </button>
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
