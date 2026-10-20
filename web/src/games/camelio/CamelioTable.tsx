import type { CamelioFrom, CamelioRoomView } from '@cartolina/shared';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { JOIN_ERRORS, type ConnStatus, type GameConn } from '../../net/connection';
import { colorer, namer, othersAfter } from '../dixit/status';
import { useStageFit } from '../dixit/useStageFit';
import { useToast } from '../dixit/useToast';
import { playTurnAnim } from './anim';
import { Banner, hintLine, type Line } from './Banner';
import { EndCard } from './EndCard';
import { seatSlots, stackLayout } from './layout';
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
/** O host clicou em "jogar de novo"/"voltar pro lobby": travado até a view mudar, um erro ou este tempo. */
const UNLOCK_MS = 4000;
/** Folga entre o cartaz do fim e o que ele não pode cobrir (conta o contorno dourado, 5px). */
const END_GAP = 12;

interface Props {
  view: CamelioRoomView;
  conn: GameConn;
  /** Estado da conexão: fora de `joined` (o "reconectando…") a jogada se perderia, então o gesto fica travado. */
  status?: ConnStatus;
}

/** Jogada cuja frase está presa no letreiro. */
interface Hold {
  match: number;
  playCount: number;
}

/**
 * Põe o cartaz do fim na faixa livre entre os assentos (embaixo das pilhas) e a sua mesa (porta do `placeEnd`).
 * Se não couber, encosta embaixo e cobre só a parte de baixo das pilhas; se nem assim, encolhe. Nunca cobre os
 * personagens nem passa do topo da sua mesa. Recolhido ("ver a mesa"), fica por cima do letreiro.
 */
function placeEnd(stage: HTMLElement, el: HTMLElement) {
  el.style.setProperty('--s', '1');
  const H = el.offsetHeight; // sem o scale (offset ignora transform)
  if (!H) return; // sem layout (jsdom)
  let top: number;
  let s = 1;
  const banner = stage.querySelector<HTMLElement>('.cl-banner');
  if (el.classList.contains('mini') && banner) {
    top = banner.offsetTop + (banner.offsetHeight - H) / 2;
  } else {
    const seats = stage.querySelector<HTMLElement>('.cl-seats');
    const mine = stage.querySelector<HTMLElement>('.cl-mine, .cl-watch');
    let low = 0;
    let heads = 0;
    for (const seat of seats?.querySelectorAll<HTMLElement>('.seat') ?? []) {
      const y = seats!.offsetTop + seat.offsetTop;
      const head = seat.querySelector<HTMLElement>('.head');
      low = Math.max(low, y + seat.offsetHeight);
      heads = Math.max(heads, y + (head ? head.offsetTop + head.offsetHeight : 0));
    }
    const hi = (mine?.offsetTop ?? stage.offsetHeight) - END_GAP;
    const lo = low + END_GAP;
    const hard = heads + END_GAP;
    if (H <= hi - lo) top = lo + (hi - lo - H) / 2;
    else if (H <= hi - hard) top = hi - H;
    else {
      s = Math.max(0.3, (hi - hard) / H);
      top = hard;
    }
  }
  el.style.top = `${Math.round(top)}px`;
  el.style.setProperty('--s', String(s));
}

/**
 * A mesa do Cama-Leão: palco 1440×900 escalado, topo, os outros num arco, o picadeiro, o letreiro e a sua mesa.
 * Tudo é desenhado a partir de `shown` (a fila de animação), nunca direto de `view.game`: durante a virada a mesa
 * fica parada na view de antes da jogada.
 */
export function CamelioTable({ view, conn, status = 'joined' }: Props) {
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

  // O gesto: só conectado, com a mesa parada e a vez sua tanto no que está desenhado quanto no servidor.
  const live = view.game;
  const online = status === 'joined';
  const canPlay =
    online && anim === null && myTurn && !shown.paused && live.phase === 'playing' && !live.paused && live.turn === me && live.match === shown.match;
  const canReceive = (p: string) => shown.players.includes(p) && seatOf(p)?.connected === true;
  const gesture = useDragPlay({
    stageRef,
    scale,
    shown,
    canPlay,
    canReceive,
    onPlay: (from: CamelioFrom, to: string) => conn.sendAction({ type: 'play', from, to }),
    onDenied: () => {
      // clique durante a virada, de quem só assiste ou reconectando (o aviso do Game.tsx já está na tela): só ignora
      if (!online || anim || !playing || shown.phase !== 'playing') return;
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

  // A virada: a mesa fica parada em `shown` (a view de antes) enquanto a anim imperativa roda por cima no palco.
  // Escala e nomes por ref (um resize ou um nome novo não reiniciam a virada).
  const scaleRef = useRef(scale);
  const nameRef = useRef(name);
  useLayoutEffect(() => {
    scaleRef.current = scale;
    nameRef.current = name;
  });
  /** O que a anim pôs no letreiro, por animação. */
  const [said, setSaid] = useState<{ id: number; text: string } | null>(null);
  /** O ponto da soltura vale uma vez: guardado por animação (o StrictMode roda o efeito duas vezes). */
  const dropRef = useRef<{ id: number; drop: ReturnType<typeof takeDropFrom> } | null>(null);
  /** A virada em curso (pra parar quando chega partida nova). */
  const running = useRef<{ id: number; stop: () => void } | null>(null);
  const animId = anim?.id ?? null;
  useLayoutEffect(() => {
    if (!anim) return undefined;
    const { id, prev, next } = anim;
    const stage = stageRef.current;
    if (!stage) {
      done(id);
      return undefined;
    }
    if (dropRef.current?.id !== id) dropRef.current = { id, drop: next.last?.by === me ? takeDropFrom() : null };
    let vivo = true;
    const h = playTurnAnim(stage, prev, next, {
      nameOf: (p) => nameRef.current(p),
      say: (text) => setSaid({ id, text }),
      sound: playCamelioSound,
      dropFrom: dropRef.current.drop,
      layout: (pid, n) => stackLayout(pid === me, n),
      scale: scaleRef.current,
    });
    const stop = () => {
      vivo = false;
      h.stop();
    };
    running.current = { id, stop };
    void h.done.then(() => {
      if (!vivo) return;
      vivo = false;
      done(id);
    });
    return () => {
      stop();
      if (running.current?.id === id) running.current = null;
    };
    // Uma vez por animação: `anim` é o mesmo objeto enquanto o id não muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animId]);
  // Partida nova no meio da virada: para e segue direto pro estado atual.
  const liveMatch = view.game.match;
  useLayoutEffect(() => {
    if (!anim || liveMatch === anim.prev.match) return;
    running.current?.stop();
    done(anim.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveMatch, animId]);

  // Som de "sua vez" uma vez por vez (e de novo na partida seguinte, como o prevTurn do protótipo).
  const prevTurn = useRef<{ match: number; turn: string | null } | null>(null);
  useEffect(() => {
    const prev = prevTurn.current;
    const again = prev !== null && prev.match === shown.match && prev.turn === shown.turn;
    if (myTurn && !again) playCamelioSound('turn');
    prevTurn.current = { match: shown.match, turn: shown.turn };
  }, [myTurn, shown.match, shown.turn]);

  // Fim de partida: som uma vez por partida (espectador não ouve), botões do host travados até a resposta.
  const over = shown.phase === 'over';
  const endSounded = useRef<number | null>(null);
  useEffect(() => {
    if (!over || endSounded.current === shown.match) return;
    endSounded.current = shown.match;
    if (playing && me !== null) playCamelioSound(shown.winners.includes(me) ? 'win' : 'lose');
  }, [over, shown.match, shown.winners, playing, me]);
  const host = view.hostId !== null && view.hostId === me;
  const [sentFor, setSentFor] = useState<CamelioRoomView | null>(null);
  const busy = sentFor === view;
  useEffect(() => {
    if (!busy) return undefined;
    const t = window.setTimeout(() => setSentFor(null), UNLOCK_MS);
    const off = conn.onError(() => setSentFor(null));
    return () => {
      clearTimeout(t);
      off();
    };
  }, [busy, conn]);
  const hostSend = (type: 'again' | 'lobby') => {
    if (busy) return;
    setSentFor(view);
    conn.sendAction({ type });
  };
  // O cartaz na faixa entre os assentos e a sua mesa: medido a cada redesenho, ao recolher/abrir e quando a Rye chega.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    const el = stage?.querySelector<HTMLElement>('.cl-end');
    if (!over || !stage || !el) return undefined;
    const place = () => placeEnd(stage, el);
    place();
    const mo = typeof MutationObserver === 'undefined' ? null : new MutationObserver(place);
    mo?.observe(el, { attributes: true, attributeFilter: ['class'] });
    let alive = true;
    void document.fonts?.ready.then(() => {
      if (alive) place();
    });
    return () => {
      alive = false;
      mo?.disconnect();
    };
  }, [over, shown, width, view.seats]);

  const held = hold !== null && shown.last !== null && !shown.paused && hold.match === shown.match && hold.playCount === shown.playCount;
  // Durante a virada o letreiro é da anim (a frase da jogada); depois ela fica presa (mesmo texto, sem piscar).
  const line: Line = anim
    ? [said?.id === anim.id ? said.text : narrate(anim.next.last, name)]
    : held
      ? [narrate(shown.last, name)]
      : hintLine(shown, me, name, gestureNow);

  const others = othersAfter(shown.players, me);
  const slots = seatSlots(others.length, width);
  const stage = { width, transform: `translate(-50%, -50%) scale(${scale})` } as CSSProperties;
  const target = (p: string) => anim === null && gesture.targeting && canReceive(p);

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
        <Ring v={shown} can={anim === null && gesture.ready} picked={anim ? null : gesture.picked} dimmed={gesture.dimmed} />
        <Banner line={line} />
        {playing && me !== null ? (
          <div className={`cl-mine${myTurn && !shown.paused ? ' myturn' : ''}`}>
            <Seat pid={me} v={shown} name={name(me)} color={color(me)} mine target={target(me)} hover={gesture.hoverPid === me} />
          </div>
        ) : (
          <div className="cl-watch">você está assistindo esta partida</div>
        )}
        {over && (
          <EndCard
            key={shown.match}
            v={shown}
            you={me}
            name={name}
            color={color}
            host={host}
            busy={busy}
            onAgain={() => hostSend('again')}
            onLobby={() => hostSend('lobby')}
          />
        )}
        <div className={`cl-toast${toast ? ' on' : ''}`} role="status" aria-live="polite">
          {toastText}
        </div>
      </div>
    </div>
  );
}
