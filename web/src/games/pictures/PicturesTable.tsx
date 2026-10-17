import { COORDS, type Coord, type PicturesRoomView } from '@cartolina/shared';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { installButtonSounds } from '../../brand/buttonSounds';
import { playSound } from '../../brand/sounds';
import { JOIN_ERRORS, type GameConn } from '../../net/connection';
import { useStageFit } from '../dixit/useStageFit';
import { useToast } from '../dixit/useToast';
import { Building } from './Building';
import { Gallery } from './Gallery';
import { PhotoGrid } from './PhotoGrid';
import { PhotoZoom } from './PhotoZoom';
import { SplitLayout } from './SplitLayout';
import { TopBar } from './TopBar';
import './pictures.css';

const TOAST_MS = 2400;

interface Props {
  view: PicturesRoomView;
  conn: GameConn;
  /** Hora do servidor menos a do PC (a contagem não depende do relógio local). */
  serverOffset: number;
}

/** Fases que ainda não têm tela (revelação e fim chegam na próxima etapa). */
const SOON: Record<string, { title: string; sub: string }> = {
  reveal: { title: 'revelação', sub: 'A revelação narrada chega numa próxima etapa.' },
  gameover: { title: 'fim de jogo', sub: 'O placar final chega numa próxima etapa.' },
};

/** A mesa do Retratim: palco 1440×900 escalado, topo, e a tela da fase (montagem por enquanto). */
export function PicturesTable({ view, conn, serverOffset }: Props) {
  const g = view.game;
  const host = view.hostId !== null && view.hostId === view.you;
  const { scale, width } = useStageFit();
  const rootRef = useRef<HTMLDivElement>(null);
  const { toast, say } = useToast(TOAST_MS);
  const [zoomAt, setZoomAt] = useState<number | null>(null);

  // Os sons próprios do Retratim chegam depois; por ora os botões da mesa usam o clique do site.
  useEffect(() => (rootRef.current ? installButtonSounds(rootRef.current) : undefined), []);

  const warn = useCallback(
    (text: string) => {
      say(text);
      playSound('error');
    },
    [say],
  );
  // Recusas do servidor (que não são de entrada na sala) viram aviso no palco.
  useEffect(
    () =>
      conn.onError((code, message) => {
        if (!JOIN_ERRORS.has(code)) warn(message);
      }),
    [conn, warn],
  );

  // No fim de jogo a grade some: a foto ampliada fecha junto.
  if (g.phase === 'gameover' && zoomAt !== null) setZoomAt(null);

  const openZoom = useCallback((coord: Coord) => setZoomAt(COORDS.indexOf(coord)), []);
  const closeZoom = useCallback(() => setZoomAt(null), []);

  const stage = { width, transform: `translate(-50%, -50%) scale(${scale})` } as CSSProperties;
  const soon = SOON[g.phase];
  return (
    <div className="pictures" ref={rootRef} data-button-sounds="">
      <div className="pc-stage" style={stage}>
        <TopBar view={view} serverOffset={serverOffset} host={host} onHurry={() => conn.sendAction({ type: 'hurry' })} />
        {g.phase === 'building' ? (
          <Building view={view} conn={conn} onZoom={openZoom} onWarn={warn} />
        ) : g.phase === 'guessing' ? (
          <Gallery key={g.round} view={view} conn={conn} zoomOpen={zoomAt !== null} onZoom={openZoom} onWarn={warn} />
        ) : (
          soon && (
            <SplitLayout
              left={g.phase === 'gameover' ? null : <PhotoGrid grid={g.grid} secret={null} onPhoto={openZoom} onZoom={openZoom} />}
              right={
                <div className="pc-banner">
                  <h2>{soon.title}</h2>
                  <p className="sub">{soon.sub}</p>
                </div>
              }
            />
          )
        )}
        {zoomAt !== null && (
          <PhotoZoom
            grid={g.grid}
            index={zoomAt}
            secret={g.phase === 'building' || g.phase === 'guessing' ? g.mySecret : null}
            onIndex={setZoomAt}
            onClose={closeZoom}
          />
        )}
        <div role="status" aria-live="polite">
          {toast && (
            <div key={toast.id} className="pc-toast">
              {toast.text}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
