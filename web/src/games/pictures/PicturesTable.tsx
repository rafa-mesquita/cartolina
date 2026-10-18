import { COORDS, type Coord, type PicturesRoomView } from '@cartolina/shared';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { JOIN_ERRORS, type GameConn } from '../../net/connection';
import { confetti } from '../../table/confetti';
import { colorer, namer } from '../dixit/status';
import { useStageFit } from '../dixit/useStageFit';
import { useToast } from '../dixit/useToast';
import { Building } from './Building';
import { Gallery } from './Gallery';
import { GameOver } from './GameOver';
import { PhotoGrid, type PhotoMark } from './PhotoGrid';
import { PhotoZoom } from './PhotoZoom';
import { RevealStage } from './RevealStage';
import { RoundScore } from './RoundScore';
import { SplitLayout } from './SplitLayout';
import { playPicturesSound } from './sounds';
import { TopBar, type SealPlus } from './TopBar';
import { usePicturesSounds } from './useButtonSounds';
import { useReveal } from './useReveal';
import { useTableSounds } from './useTableSounds';
import { useWheelOpen, wheelPhoto } from './useWheelZoom';
import './pictures.css';

const TOAST_MS = 2400;
/** Botão do host travado no máximo isso (ms), se nem visão nova nem recusa chegarem. */
const UNLOCK_MS = 4000;
/** Confete de papel picado nas cores do álbum. */
const CONFETTI = ['#2f5aa8', '#f2a541', '#fbf7ef', '#d3bf99', '#3b6d11', '#c8644f'];

interface Props {
  view: PicturesRoomView;
  conn: GameConn;
  /** Hora do servidor menos a do PC (a contagem não depende do relógio local). */
  serverOffset: number;
}

/** A mesa do Retratim: palco 1440×900 escalado, topo, e a tela da fase (montagem, palpites, revelação, fim). */
export function PicturesTable({ view, conn, serverOffset }: Props) {
  const g = view.game;
  const host = view.hostId !== null && view.hostId === view.you;
  const { scale, width } = useStageFit();
  const rootRef = useRef<HTMLDivElement>(null);
  const { toast, say } = useToast(TOAST_MS);
  const [zoomAt, setZoomAt] = useState<number | null>(null);
  // O host clicou em "próxima rodada" / "jogar de novo" / "voltar pro lobby": travado até chegar uma visão nova.
  const [sentFor, setSentFor] = useState<PicturesRoomView | null>(null);
  const busy = sentFor === view;
  // O divisor mudou de tamanho (a foto em voo pousa direto no lugar novo).
  const [resized, setResized] = useState(0);
  const confettiRef = useRef<HTMLCanvasElement>(null);
  const name = useMemo(() => namer(view), [view]);
  const color = useMemo(() => colorer(view), [view]);
  const me = view.you;

  const result = g.phase === 'reveal' ? g.result : null;
  const { frame, skip } = useReveal(result, g.inRound, g.scores);
  const revealing = result !== null && frame !== null && !frame.done;
  const plus: SealPlus[] = revealing ? frame.plus.map((x) => ({ ...x, id: `${frame.artistIndex}:${x.player}` })) : [];

  // Fim de jogo: confete e (pra quem venceu) o som de vitória, só na troca de fase (abrir a mesa já no fim não toca).
  const prevPhase = useRef(g.phase);
  const won = me !== null && g.winners.includes(me);
  useEffect(() => {
    const from = prevPhase.current;
    prevPhase.current = g.phase;
    if (from === g.phase || g.phase !== 'gameover') return undefined;
    if (won) playPicturesSound('win');
    return confetti(confettiRef.current, CONFETTI);
    // Só na troca de fase: `won` é o do render em que a fase mudou (de propósito fora da lista).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.phase]);

  // Cliques baixinhos nos botões da mesa, e os sons que vêm só da mudança da visão (pronto/confirmou, rodada nova).
  usePicturesSounds(rootRef);
  useTableSounds(g);

  const warn = useCallback(
    (text: string) => {
      say(text);
      playPicturesSound('error');
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

  // Destrava se o servidor recusar (ex.: gente de menos) ou, por garantia, se nada chegar em alguns segundos.
  useEffect(() => {
    if (!busy) return undefined;
    const t = window.setTimeout(() => setSentFor(null), UNLOCK_MS);
    const off = conn.onError(() => setSentFor(null));
    return () => {
      clearTimeout(t);
      off();
    };
  }, [busy, conn]);
  const hostSend = (type: 'next' | 'again' | 'lobby') => {
    if (busy) return;
    setSentFor(view);
    conn.sendAction({ type });
  };

  // No fim de jogo a grade some: a foto ampliada fecha junto.
  if (g.phase === 'gameover' && zoomAt !== null) setZoomAt(null);

  const openZoom = useCallback((coord: Coord) => setZoomAt(COORDS.indexOf(coord)), []);
  const closeZoom = useCallback(() => setZoomAt(null), []);
  // Rodinha pra cima numa foto (grade, cartão da secreta, placar) amplia; pra baixo, o próprio zoom fecha.
  useWheelOpen(rootRef, (t) => {
    const c = g.phase === 'gameover' ? null : wheelPhoto(t);
    if (c === null) return false;
    openZoom(c);
    return true;
  });

  const stage = { width, transform: `translate(-50%, -50%) scale(${scale})` } as CSSProperties;

  // Revelação: as fotos já reveladas voltam pra grade com o bichinho do artista; a da vez fica "fora" da grade.
  let revealMarks: Partial<Record<Coord, PhotoMark[]>> | undefined;
  let lifted: Coord | null = null;
  if (result && frame) {
    revealMarks = {};
    const settled = frame.done ? result.order : result.order.slice(0, Math.max(0, frame.artistIndex));
    for (const a of settled) {
      const c = result.secrets[a];
      if (c) (revealMarks[c] ??= []).push({ id: a, name: name(a), color: color(a) });
    }
    const cur = result.order[frame.artistIndex];
    if (!frame.done && frame.photoShown && cur !== undefined) lifted = result.secrets[cur] ?? null;
  }
  return (
    <div className="pictures" ref={rootRef} data-button-sounds="">
      <div className="pc-stage" style={stage}>
        <TopBar
          view={view}
          serverOffset={serverOffset}
          host={host}
          onHurry={() => conn.sendAction({ type: 'hurry' })}
          scores={revealing ? frame.scoresSoFar : undefined}
          plus={plus}
        />
        {g.phase === 'building' ? (
          <Building view={view} conn={conn} onZoom={openZoom} onWarn={warn} serverOffset={serverOffset} />
        ) : g.phase === 'guessing' ? (
          <Gallery key={g.round} view={view} conn={conn} zoomOpen={zoomAt !== null} onZoom={openZoom} />
        ) : g.phase === 'reveal' && result && frame ? (
          <SplitLayout
            onResizeEnd={() => setResized((n) => n + 1)}
            left={
              <>
                <PhotoGrid grid={g.grid} secret={null} onPhoto={openZoom} onZoom={openZoom} marks={revealMarks} lifted={lifted} />
                <p className="pc-grid-note">As fotos secretas desta rodada trocam na próxima.</p>
              </>
            }
            right={
              frame.done ? (
                <RoundScore
                  result={result}
                  players={g.players}
                  scores={g.scores}
                  round={g.round}
                  rounds={g.rounds}
                  me={me}
                  name={name}
                  color={color}
                  host={host}
                  busy={busy}
                  onNext={() => hostSend('next')}
                />
              ) : (
                <RevealStage result={result} frame={frame} inRound={g.inRound} players={g.players} grid={g.grid} me={me} name={name} color={color} resized={resized} onSkip={skip} />
              )
            }
          />
        ) : g.phase === 'gameover' ? (
          <GameOver
            players={g.players}
            scores={g.scores}
            winners={g.winners}
            me={me}
            name={name}
            color={color}
            host={host}
            busy={busy}
            onAgain={() => hostSend('again')}
            onLobby={() => hostSend('lobby')}
          />
        ) : null}
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
      <canvas className="pc-confetti" ref={confettiRef} />
    </div>
  );
}
