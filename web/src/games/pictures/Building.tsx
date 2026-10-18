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
  /** Hora do servidor menos a do PC (a contagem acelera o envio do rascunho). */
  serverOffset: number;
}

/** Recusas do "pronto": a bancada volta a mandar rascunho (outros erros não mexem no pedido). */
const READY_REFUSALS: ReadonlySet<string> = new Set(['empty_work', 'icons_too_few', 'wrong_kit', 'bad_work', 'bad_phase']);

/** Montagem: grade à esquerda; à direita a foto secreta, a bancada do kit e "estou pronto". */
export function Building({ view, conn, onZoom, onWarn, serverOffset }: Props) {
  const g = view.game, me = view.you;
  const kit = me !== null ? g.kits[me] : undefined;
  const secret = g.mySecret;
  const playing = me !== null && g.inRound.includes(me) && kit !== undefined && secret !== null;
  const ready = me !== null && g.ready.includes(me);
  const serverWork = me !== null && Object.hasOwn(g.works, me) ? g.works[me]! : null;
  // `sendAction` é método da conexão: chamar sempre pela conexão (solto, perde o `this`).
  const draft = useDraft(`${g.round}:${kit ?? ''}`, (a) => conn.sendAction(a), {
    ready,
    work: serverWork,
    countdownEndsAt: g.paused ? null : g.countdownEndsAt,
    serverOffset,
  });
  const [rebuild, setRebuild] = useState(0);
  const { release } = draft;

  // Recusa do "pronto" (ex.: obra vazia): a bancada volta a mandar rascunho.
  useEffect(() => conn.onError((code) => void (READY_REFUSALS.has(code) && release())), [conn, release]);
  /** Pronto na visão, ou pedido em voo (otimista: a bancada já esmaece e não aceita mexida). */
  const shownReady = ready || draft.held;

  function toggleReady() {
    if (draft.pending) return;
    if (ready) return draft.unready();
    const e = readyError(draft.local ?? serverWork ?? undefined);
    if (e) return onWarn(errorMessage(e));
    draft.markReady();
  }

  const left = (
    <>
      <PhotoGrid grid={g.grid} secret={playing ? secret : null} onPhoto={onZoom} onZoom={onZoom} zoomCursor />
      <p className="pc-grid-note">
        {g.round + 1 < g.rounds && 'As fotos secretas de cada rodada trocam na próxima. '}Remonte a sua foto secreta com o kit da rodada; os outros vão tentar adivinhar qual é.
      </p>
    </>
  );

  const secretId = secret ? g.grid[COORDS.indexOf(secret)] : undefined;
  const right = playing ? (
    <div className="pc-building">
      <button className="pc-secret-card" type="button" title="ver grande" data-sound="none" data-zoom-photo={secret} onClick={() => onZoom(secret)}>
        <span className="pc-tape" />
        <span className="mini">{secretId && <Photo id={secretId} />}</span>
        <span>
          <span className="lab">sua foto secreta</span>
          <span className="co">{secret}</span>
          <span className="shh">só você vê o contorno azul na grade</span>
        </span>
      </button>
      <KitBench kit={kit} round={g.round} rebuild={rebuild} work={() => draft.local ?? serverWork} onChange={draft.onChange} ready={shownReady} />
      <div className="pc-bench-foot">
        <span className="hint">
          {shownReady ? (
            'pronto ✓ — esperando os outros'
          ) : (
            <>
              kit da rodada: <b>{KIT_NAMES[kit]}</b>
            </>
          )}
        </span>
        <button className={`pc-btn-big${ready ? ' off' : ''}`} type="button" disabled={draft.pending} onClick={toggleReady}>
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
