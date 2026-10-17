import { COORDS, errorMessage, readyError, type Coord, type PicturesRoomView } from '@cartolina/shared';
import { useEffect, useState } from 'react';
import type { GameConn } from '../../net/connection';
import { KitBench } from './KitBench';
import { Photo } from './Photo';
import { PhotoGrid } from './PhotoGrid';
import { SplitLayout } from './SplitLayout';
import { KIT_NAMES } from './status';
import { useDraft } from './useDraft';

interface Props {
  view: PicturesRoomView;
  conn: GameConn;
  onZoom: (coord: Coord) => void;
  /** Aviso no palco (com o som de erro). */
  onWarn: (text: string) => void;
}

/** Montagem: grade à esquerda; à direita a foto secreta, a bancada do kit e "estou pronto". */
export function Building({ view, conn, onZoom, onWarn }: Props) {
  const g = view.game, me = view.you;
  const kit = me !== null ? g.kits[me] : undefined;
  const secret = g.mySecret;
  const playing = me !== null && g.inRound.includes(me) && kit !== undefined && secret !== null;
  const ready = me !== null && g.ready.includes(me);
  // `sendAction` é método da conexão: chamar sempre pela conexão (solto, perde o `this`).
  const draft = useDraft(`${g.round}:${kit ?? ''}`, (a) => conn.sendAction(a));
  const [rebuild, setRebuild] = useState(0);
  const { release } = draft;

  // Recusa do servidor (ex.: "pronto" com a obra vazia): a bancada volta a mandar rascunho.
  useEffect(() => conn.onError(() => release()), [conn, release]);

  const serverWork = me !== null && Object.hasOwn(g.works, me) ? g.works[me]! : null;

  function toggleReady() {
    if (ready) return draft.unready();
    const e = readyError(draft.local ?? serverWork ?? undefined);
    if (e) return onWarn(errorMessage(e));
    draft.markReady();
  }

  const left = (
    <>
      <PhotoGrid grid={g.grid} secret={playing ? secret : null} onPhoto={onZoom} onZoom={onZoom} zoomCursor />
      <p className="pc-grid-note">
        A grade é a mesma a partida toda. Remonte a sua foto secreta com o kit da rodada; os outros vão tentar adivinhar qual é.
      </p>
    </>
  );

  const secretId = secret ? g.grid[COORDS.indexOf(secret)] : undefined;
  const right = playing ? (
    <div className="pc-building">
      <button className="pc-secret-card" type="button" title="ver grande" data-sound="none" onClick={() => onZoom(secret)}>
        <span className="pc-tape" />
        <span className="mini">{secretId && <Photo id={secretId} />}</span>
        <span>
          <span className="lab">sua foto secreta</span>
          <span className="co">{secret}</span>
          <span className="shh">só você vê o contorno azul na grade</span>
        </span>
      </button>
      <KitBench kit={kit} round={g.round} rebuild={rebuild} work={() => draft.local ?? serverWork} onChange={draft.onChange} ready={ready} />
      <div className="pc-bench-foot">
        <span className="hint">
          {ready ? (
            'pronto ✓ — esperando os outros'
          ) : (
            <>
              kit da rodada: <b>{KIT_NAMES[kit]}</b>
            </>
          )}
        </span>
        <button className={`pc-btn-big${ready ? ' off' : ''}`} type="button" onClick={toggleReady}>
          {ready ? 'desmarcar pronto' : 'estou pronto'}
        </button>
      </div>
    </div>
  ) : (
    <div className="pc-banner">
      <h2>você está assistindo esta rodada</h2>
      <p className="sub">Quem está na mesa está remontando a própria foto secreta. Na próxima rodada você entra.</p>
    </div>
  );

  return <SplitLayout left={left} right={right} onResizeEnd={() => setRebuild((n) => n + 1)} />;
}
