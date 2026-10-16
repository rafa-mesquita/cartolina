import { dixitPicksPerPlayer, type DixitRoomView } from '@cartolina/shared';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type WheelEvent } from 'react';
import { installButtonSounds } from '../../brand/buttonSounds';
import type { ConnStatus, GameConn } from '../../net/connection';
import { loadTiltPref, saveTiltPref } from '../../net/identity';
import { confetti } from '../../table/confetti';
import { ActionPanel, type PanelActions } from './ActionPanel';
import { Brushes } from './Brushes';
import { CardViewer } from './CardViewer';
import { DixitTopBar } from './DixitTopBar';
import { Felt } from './Felt';
import { ROMAN } from './geometry';
import { Hand } from './Hand';
import { orderHand } from './handOrder';
import { RevealCaption } from './RevealCaption';
import { RoundBoard } from './RoundBoard';
import { scoresDuring } from './reveal';
import { Seats } from './Seats';
import { playDixitSound } from './sounds';
import { colorer, namer } from './status';
import type { DropState } from './useHandDrag';
import { usePlays } from './usePlays';
import { useReveal } from './useReveal';
import { useStageFit } from './useStageFit';
import './dixit.css';

const CONFETTI = ['#F2A541', '#F6EAD2', '#D1495B', '#00798C'];
const TOAST_MS = 2200;

/**
 * A mesa do Diquisti: junta topo, feltro, assentos, mão, painel, revelação e carta ampliada, e manda as
 * jogadas pro servidor. Jogar é arrastar a carta da mão pro feltro (ou Enter numa carta focada).
 */
export function DixitTable({ view, conn, status = 'joined' }: { view: DixitRoomView; conn: GameConn; status?: ConnStatus }) {
  const g = view.game, me = view.you;
  const host = view.hostId !== null && view.hostId === me;
  const { scale, width } = useStageFit();
  const rootRef = useRef<HTMLDivElement>(null);
  const confettiRef = useRef<HTMLCanvasElement>(null);
  const [tilt, setTilt] = useState(loadTiltPref);
  /** Ordem da mão que a pessoa arrumou (local; some ao recarregar). */
  const [handOrder, setHandOrder] = useState<string[]>([]);
  const [clue, setClue] = useState('');
  const [spoken, setSpoken] = useState(false);
  const [needClueTick, setNeedClueTick] = useState(0);
  const [dropState, setDropState] = useState<DropState>(null);
  const [viewer, setViewer] = useState<{ kind: 'hand' | 'table'; ids: string[]; index: number } | null>(null);
  const [boardHidden, setBoardHidden] = useState(false);
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const toastSeq = useRef(0);
  const name = useMemo(() => namer(view), [view]);
  const color = useMemo(() => colorer(view), [view]);

  const say = (text: string) => setToast({ text, id: ++toastSeq.current });
  const plays = usePlays({
    view,
    conn,
    status,
    onError: (message) => {
      say(message);
      playDixitSound('error');
    },
  });

  // Fase ou narrador novos: zera o que era da fase na tela (no próprio render, sem efeito).
  const phaseKey = `${g.phase}|${g.storyteller ?? ''}`;
  const [seenKey, setSeenKey] = useState(phaseKey);
  if (seenKey !== phaseKey) {
    setSeenKey(phaseKey);
    setClue('');
    setSpoken(false);
    setBoardHidden(false);
    setViewer(null);
  }

  const revealKey = g.phase === 'reveal' && g.result ? `${g.result.storyCard}:${g.result.table.join(',')}` : '';
  const { frame, skip } = useReveal(g.phase === 'reveal' ? g.result : null, revealKey, g.inRound, name, me);
  const revealDone = g.phase !== 'reveal' || !!frame?.done;
  const scores = scoresDuring(g.scores, g.phase === 'reveal' ? g.result : null, frame);
  const gained: Record<string, number> = frame && g.result ? Object.fromEntries(Object.keys(frame.hops).map((p) => [p, g.result!.gained[p] ?? 0])) : {};

  const iAmTeller = me !== null && g.storyteller === me;
  const confirmed = me !== null && g.confirmed.includes(me);
  const playing = me !== null && g.inRound.includes(me);
  const need = dixitPicksPerPlayer(g.inRound.length);
  const clueReady = spoken || clue.trim() !== '';
  const blocked = plays.telling && !clueReady;
  const away = plays.away;
  const hand = orderHand(handOrder, g.hand);

  // Botões da mesa com o clique mais baixo do Diquisti (o listener do documento fica quieto aqui dentro).
  useEffect(() => {
    const root = rootRef.current;
    return root ? installButtonSounds(root, (s) => playDixitSound(s)) : undefined;
  }, []);

  // Sons e confete de fase (só nas trocas; ao abrir a mesa no meio da partida, nada).
  const prevPhase = useRef(g.phase);
  const won = me !== null && g.winners.includes(me);
  useEffect(() => {
    const from = prevPhase.current;
    prevPhase.current = g.phase;
    if (from === g.phase) return undefined;
    if (g.phase === 'storytelling' && iAmTeller) playDixitSound('join');
    if (g.phase === 'gameover') {
      playDixitSound(won ? 'win' : 'lose');
      return confetti(confettiRef.current, CONFETTI);
    }
    return undefined;
    // Só na troca de fase: `iAmTeller` e `won` são os do render em que a fase mudou (de propósito fora da lista).
  }, [g.phase]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  function openViewer(kind: 'hand' | 'table', id: string) {
    const ids = kind === 'hand' ? hand.filter((c) => !away.includes(c)) : g.table.map((t) => t.cardId);
    const index = ids.indexOf(id);
    if (index >= 0) setViewer({ kind, ids, index });
  }

  function unpend(cardId: string) {
    plays.unpend(cardId);
    playDixitSound('card');
  }

  function clickTable(cardId: string) {
    if (g.phase !== 'voting') return openViewer('table', cardId);
    if (!playing) return say('Você está assistindo esta rodada.');
    if (iAmTeller) return say('Quem narra não vota.');
    if (confirmed) return say('Você já confirmou o voto.');
    if (g.table.find((t) => t.cardId === cardId)?.mine) return say('Não dá pra votar na própria carta.');
    playDixitSound('pick');
    conn.sendAction({ type: 'vote', cardId });
  }

  // Rodinha pra cima numa carta (da mão ou da mesa, virada pra cima) amplia; pra baixo, a própria carta ampliada fecha.
  function onWheel(e: WheelEvent<HTMLDivElement>) {
    if (viewer || e.deltaY >= 0) return;
    const el = (e.target as Element).closest<HTMLElement>('[data-card-id][data-zoom]');
    if (!el?.dataset.cardId || el.getAttribute('aria-disabled') === 'true') return;
    openViewer(el.dataset.zoom === 'hand' ? 'hand' : 'table', el.dataset.cardId);
  }

  const actions: PanelActions = {
    confirmVote: () => conn.sendAction({ type: 'confirm' }),
    next: () => conn.sendAction({ type: 'next' }),
    again: () => conn.sendAction({ type: 'again' }),
    lobby: () => conn.sendAction({ type: 'lobby' }),
  };

  const stageStyle = { width, transform: `translate(-50%, -50%) scale(${scale})`, '--tilt': tilt ? '38deg' : '0deg' } as CSSProperties;
  return (
    <div className="dixit" ref={rootRef} data-button-sounds="" onWheel={onWheel}>
      <div className="dx-stage" style={stageStyle}>
        <Brushes width={width} />
        <DixitTopBar
          view={view}
          name={name}
          color={color}
          tilt={tilt}
          onTilt={() => {
            saveTiltPref(!tilt);
            setTilt(!tilt);
          }}
          host={host}
          onForce={() => conn.sendAction({ type: 'forceNext' })}
        />
        <Felt
          view={view}
          name={name}
          color={color}
          frame={frame}
          scores={scores}
          dropState={dropState}
          pending={plays.pending}
          dropPoints={plays.dropPoints}
          clueReady={clueReady}
          onCard={clickTable}
          onZoom={(id) => openViewer('table', id)}
          canUnpend={!plays.sent}
          onUnpend={unpend}
        />
        <Seats view={view} width={width} name={name} gained={gained} floatKey={revealKey} />
        <Hand
          ids={hand}
          away={away}
          canPlay={plays.canPlay}
          blocked={blocked}
          onPlay={(id, at) => plays.play(id, at, spoken ? '' : clue)}
          onBlocked={() => {
            setNeedClueTick((t) => t + 1);
            playDixitSound('error');
          }}
          onReorder={setHandOrder}
          onZoom={(id) => openViewer('hand', id)}
          onDropState={setDropState}
        />
        <ActionPanel
          view={view}
          need={need}
          pending={plays.pending.length}
          revealDone={revealDone}
          host={host}
          name={name}
          clue={clue}
          onClue={setClue}
          spoken={spoken}
          onSpoken={setSpoken}
          needClueTick={needClueTick}
          actions={actions}
        />
        <RevealCaption caption={frame && !frame.done ? frame.caption : null} onSkip={skip} />
        {g.phase === 'reveal' &&
          revealDone &&
          g.result &&
          (boardHidden ? (
            <button className="dx-pill dx-board-pill" type="button" onClick={() => setBoardHidden(false)}>
              placar da rodada ▸
            </button>
          ) : (
            <RoundBoard
              result={g.result}
              players={g.inRound}
              scores={g.scores}
              target={g.target}
              name={name}
              color={color}
              host={host}
              onNext={actions.next}
              onHide={() => setBoardHidden(true)}
            />
          ))}
        {toast && (
          <div key={toast.id} className="dx-toast" role="status">
            {toast.text}
          </div>
        )}
        {viewer && (
          <CardViewer
            ids={viewer.ids}
            index={viewer.index}
            label={(id, i) => {
              const owner = g.result?.owners[id];
              const base = viewer.kind === 'hand' ? `sua mão · ${i + 1} de ${viewer.ids.length}` : `carta ${ROMAN[i]}`;
              return viewer.kind === 'table' && owner && (g.phase === 'gameover' || (g.phase === 'reveal' && revealDone)) ? `${base} · de ${name(owner)}` : base;
            }}
            onIndex={(index) => setViewer((cur) => (cur ? { ...cur, index } : cur))}
            onClose={() => setViewer(null)}
          />
        )}
      </div>
      <canvas className="dx-confetti" ref={confettiRef} />
    </div>
  );
}
