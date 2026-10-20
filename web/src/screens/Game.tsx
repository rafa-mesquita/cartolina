import { isCoupRoomView, isDixitRoomView, isItoRoomView, isPicturesRoomView, type DixitPhase, type RoomView } from '@cartolina/shared';
import { lazy, Suspense, useEffect, useRef } from 'react';
import { DixitLobby } from '../games/dixit/DixitLobby';
import { DixitTable } from '../games/dixit/DixitTable';
import { useLayout } from '../lib/device';
import type { ConnSnapshot, GameConn } from '../net/connection';
import { PhoneTable } from '../table/phone/PhoneTable';
import { Table } from '../table/Table';
import { Lobby } from './Lobby';
import { Toasts } from './Toasts';

// Retratim (kits de fotos, ícones do Tabler, sons) vira um chunk à parte: quem só joga ITO/Diquisti não baixa nada disso.
const PicturesLobby = lazy(() => import('../games/pictures/PicturesLobby').then((m) => ({ default: m.PicturesLobby })));
const PicturesTable = lazy(() => import('../games/pictures/PicturesTable').then((m) => ({ default: m.PicturesTable })));

// O Cúpi também fica num chunk à parte (CSS, sons e a mesa só baixam pra quem entra numa sala dele).
const CoupLobby = lazy(() => import('../games/coup/CoupLobby').then((m) => ({ default: m.CoupLobby })));
const CoupTable = lazy(() => import('../games/coup/CoupTable').then((m) => ({ default: m.CoupTable })));

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
  if (isPicturesRoomView(view)) {
    // Sala de Retratim (id interno `pictures`): como o Diquisti, a mesa tem os próprios avisos.
    return (
      <>
        {reconnecting}
        <Suspense fallback={null}>
          {view.game.phase === 'lobby' ? <PicturesLobby view={view} conn={conn} /> : <PicturesTable view={view} conn={conn} serverOffset={snap.serverOffset} />}
        </Suspense>
      </>
    );
  }
  if (isCoupRoomView(view)) {
    // Sala de Cúpi (id interno `coup`): mesa com os próprios avisos; serve computador e celular.
    return (
      <>
        {reconnecting}
        <Suspense fallback={null}>
          {view.game.phase === 'lobby' ? <CoupLobby view={view} conn={conn} /> : <CoupTable view={view} conn={conn} serverOffset={snap.serverOffset} />}
        </Suspense>
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
