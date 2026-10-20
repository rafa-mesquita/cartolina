import type { CamelioFrom, CamelioRoomView } from '@cartolina/shared';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { JOIN_ERRORS, type GameConn } from '../../net/connection';
import { colorer, namer, othersAfter } from '../dixit/status';
import { useStageFit } from '../dixit/useStageFit';
import { useToast } from '../dixit/useToast';
import { Banner, hintLine, type Line } from './Banner';
import { seatSlots } from './layout';
import { narrate } from './narrate';
import { Ring } from './Ring';
import { Seat } from './Seat';
import { playCamelioSound } from './sounds';
import { TopBar } from './TopBar';
import { useCamelioSounds } from './useButtonSounds';
import { useDragPlay } from './useDragPlay';
import { usePlayback } from './usePlayback';
import './camelio.css';

const TOAST_MS = 2400;
/** Quanto a frase da última jogada fica no letreiro antes da dica da sua vez (ou do fim) entrar. */
const HOLD_MS = 1100;

interface Props {
  view: CamelioRoomView;
  conn: GameConn;
}

/** Jogada cuja frase está presa no letreiro. */
interface Hold {
  match: number;
  playCount: number;
}

/**
 * A mesa do Cama-Leão: palco 1440×900 escalado, topo, os outros num arco, o picadeiro, o letreiro e a sua mesa.
 * Tudo é desenhado a partir de `shown` (a fila de animação), nunca direto de `view.game`: durante a virada a mesa
 * fica parada na view de antes da jogada.
 */
export function CamelioTable({ view, conn }: Props) {
  const { shown, anim, done } = usePlayback(view.game);
  const { scale, width } = useStageFit();
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const { toast, say } = useToast(TOAST_MS);
  const name = useMemo(() => namer(view), [view]);
  const color = useMemo(() => colorer(view), [view]);
  const me = view.you;
  /** Quem vê joga esta partida (senão é espectador). */
  const playing = me !== null && shown.players.includes(me);
  const myTurn = playing && shown.phase === 'playing' && shown.turn === me;
  const seatOf = (p: string) => view.seats.find((s) => s.id === p);

  // O gesto: só com a mesa parada e a vez sua tanto no que está desenhado quanto no servidor.
  const live = view.game;
  const canPlay =
    anim === null && myTurn && !shown.paused && live.phase === 'playing' && !live.paused && live.turn === me && live.match === shown.match;
  const canReceive = (p: string) => shown.players.includes(p) && seatOf(p)?.connected === true;
  const gesture = useDragPlay({
    stageRef,
    scale,
    shown,
    canPlay,
    canReceive,
    onPlay: (from: CamelioFrom, to: string) => conn.sendAction({ type: 'play', from, to }),
    onDenied: () => {
      // clique durante a virada (ou de quem só assiste): só ignora
      if (anim || !playing || shown.phase !== 'playing') return;
      say(shown.paused ? 'Pausado: esperando a galera voltar.' : 'Não é a sua vez.');
    },
  });
  const { refused, takeDropFrom } = gesture;

  // Cliques baixinhos nos botões da mesa (e o áudio liberado no primeiro gesto).
  useCamelioSounds(rootRef);

  // Recusas do servidor (que não são de entrada na sala) viram aviso no palco; a carta esperando volta pro lugar.
  useEffect(
    () =>
      conn.onError((code, message) => {
        if (JOIN_ERRORS.has(code)) return;
        refused();
        say(message);
        playCamelioSound('error');
      }),
    [conn, say, refused],
  );
  // O aviso some com fade: o texto fica até a próxima troca.
  const [toastText, setToastText] = useState('');
  if (toast && toast.text !== toastText) setToastText(toast.text);

  // A frase de cada jogada que anima fica no letreiro até a vez seguinte começar de fato (a pausa tira na hora).
  const [hold, setHold] = useState<Hold | null>(null);
  const [seenAnim, setSeenAnim] = useState(anim?.id ?? null);
  if ((anim?.id ?? null) !== seenAnim) {
    setSeenAnim(anim?.id ?? null);
    if (anim) setHold({ match: anim.next.match, playCount: anim.next.playCount });
  }
  if (hold && shown.paused) setHold(null);
  // Levantar ou arrastar a carta já é a sua vez começando: o letreiro passa a guiar o gesto.
  const gestureNow = gesture.dragging ? 'dragging' : gesture.picked ? 'picked' : null;
  if (hold && gestureNow) setHold(null);
  // Na sua vez (ou no fim) a dica entra depois de a frase da jogada ficar um pouco no letreiro.
  const release = hold !== null && !anim && (shown.phase === 'over' || myTurn);
  useEffect(() => {
    if (!release) return undefined;
    const t = setTimeout(() => setHold(null), HOLD_MS);
    return () => clearTimeout(t);
  }, [release]);

  // Task 6: ainda sem a virada — a jogada nova entra direto na mesa. A Task 8 troca isto pelo playTurnAnim(...),
  // passando o `takeDropFrom()` como `dropFrom` quando a jogada é sua. Por enquanto pegar o ponto só tira o clone
  // do arrasto da mesa: ele some quando a view nova chega.
  useEffect(() => {
    if (!anim) return;
    if (anim.next.last?.by === me) takeDropFrom();
    done(anim.id);
  }, [anim, done, me, takeDropFrom]);

  // Som de "sua vez" uma vez por vez (e de novo na partida seguinte, como o prevTurn do protótipo).
  const prevTurn = useRef<{ match: number; turn: string | null } | null>(null);
  useEffect(() => {
    const prev = prevTurn.current;
    const again = prev !== null && prev.match === shown.match && prev.turn === shown.turn;
    if (myTurn && !again) playCamelioSound('turn');
    prevTurn.current = { match: shown.match, turn: shown.turn };
  }, [myTurn, shown.match, shown.turn]);

  const held = hold !== null && shown.last !== null && !shown.paused && hold.match === shown.match && hold.playCount === shown.playCount;
  const line: Line = held ? [narrate(shown.last, name)] : hintLine(shown, me, name, gestureNow);

  const others = othersAfter(shown.players, me);
  const slots = seatSlots(others.length, width);
  const stage = { width, transform: `translate(-50%, -50%) scale(${scale})` } as CSSProperties;
  const target = (p: string) => gesture.targeting && canReceive(p);

  return (
    <div className="camelio" ref={rootRef} data-button-sounds="">
      <div className={`cl-stage${gesture.dragging ? ' drag-on' : ''}`} style={stage} ref={stageRef} {...gesture.handlers}>
        <TopBar code={view.code} v={shown} />
        <div className="cl-seats">
          {others.map((p, i) => (
            <Seat
              key={p}
              pid={p}
              v={shown}
              name={name(p)}
              color={color(p)}
              off={!seatOf(p)?.connected}
              style={{ left: slots[i]!.x, top: slots[i]!.y }}
              target={target(p)}
              hover={gesture.hoverPid === p}
            />
          ))}
        </div>
        <Ring v={shown} can={gesture.ready} picked={gesture.picked} dimmed={gesture.dimmed} />
        <Banner line={line} />
        {playing && me !== null ? (
          <div className={`cl-mine${myTurn && !shown.paused ? ' myturn' : ''}`}>
            <Seat pid={me} v={shown} name={name(me)} color={color(me)} mine target={target(me)} hover={gesture.hoverPid === me} />
          </div>
        ) : (
          <div className="cl-watch">você está assistindo esta partida</div>
        )}
        <div className={`cl-toast${toast ? ' on' : ''}`} role="status" aria-live="polite">
          {toastText}
        </div>
      </div>
    </div>
  );
}
