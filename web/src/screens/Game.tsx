import { isDixitRoomView, isItoRoomView, type DixitPhase, type RoomView } from '@cartolina/shared';
import { useEffect, useRef } from 'react';
import { DixitLobby } from '../games/dixit/DixitLobby';
import { DixitTable } from '../games/dixit/DixitTable';
import { useLayout } from '../lib/device';
import type { ConnSnapshot, GameConn } from '../net/connection';
import { PhoneTable } from '../table/phone/PhoneTable';
import { Table } from '../table/Table';
import { Lobby } from './Lobby';
import { Toasts } from './Toasts';

export function Game({ conn, snap, view }: { conn: GameConn; snap: ConnSnapshot; view: RoomView }) {
  // Fase do Diquisti no último render: a mesa monta já na 1ª rodada (o lobby é outra tela) e precisa saber
  // que veio do lobby pra tocar o "plim" de quem narra.
  const dixitPhase = isDixitRoomView(view) ? view.game.phase : undefined;
  const lastDixitPhase = useRef<DixitPhase | undefined>(dixitPhase);
  useEffect(() => {
    lastDixitPhase.current = dixitPhase;
  });
  // Celular em pé (tela estreita): o DITU usa a mesa em pé.
  const layout = useLayout();
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
        {view.game.phase === 'lobby' ? <DixitLobby view={view} conn={conn} /> : <DixitTable view={view} conn={conn} status={snap.status} fromPhase={lastDixitPhase.current} />}
      </>
    );
  }
  if (!isItoRoomView(view)) return null;
  return (
    <>
      {reconnecting}
      {view.game.phase === 'lobby' ? (
        <Lobby view={view} conn={conn} />
      ) : layout === 'phone' ? (
        <PhoneTable view={view} conn={conn} />
      ) : (
        <Table view={view} conn={conn} />
      )}
      <Toasts conn={conn} />
    </>
  );
}
