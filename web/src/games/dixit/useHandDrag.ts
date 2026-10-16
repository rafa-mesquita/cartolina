import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { HAND_W, dropInHand, insertIndex } from './handOrder';
import { playDixitSound } from './sounds';

/** O que o feltro mostra enquanto uma carta é arrastada: pode soltar, está em cima, ou falta a dica. */
export type DropState = 'ready' | 'over' | 'no' | null;

/** Carta sendo arrastada: deslocamento em px do palco e o índice onde cairia na mão. */
export interface HandDrag {
  id: string;
  dx: number;
  dy: number;
  /** Onde as outras abrem espaço (o lugar de origem quando está em cima do feltro). */
  at: number;
  /** Índice da carta na mão visível quando o arrasto começou. */
  from: number;
}

export interface HandDragOptions {
  ids: readonly string[];
  away: readonly string[];
  canPlay: boolean;
  blocked: boolean;
  onPlay: (id: string, at: { x: number; y: number } | null) => void;
  onBlocked: () => void;
  onReorder: (order: string[]) => void;
  onZoom: (id: string) => void;
  onDropState: (s: DropState) => void;
}

interface Track {
  id: string;
  pointerId: number;
  x0: number;
  y0: number;
  /** px da tela por px do palco. */
  scale: number;
  from: number;
  at: number;
  over: boolean;
  moved: boolean;
}

/** Quanto o ponteiro anda (px do palco) antes de o clique virar arrasto. */
const DRAG_START = 6;

const overFelt = (x: number, y: number): boolean => !!document.elementFromPoint?.(x, y)?.closest('.dx-felt');

/**
 * Arrastar e soltar da mão (pointer events): arrastar dentro da mão troca a ordem; soltar no feltro joga a
 * carta (ou avisa que falta a dica); clique sem arrastar amplia; `Enter` joga (ou amplia fora da vez).
 * `pointercancel`/`lostpointercapture` devolvem a carta pro lugar sem jogar.
 */
export function useHandDrag(handRef: RefObject<HTMLElement | null>, o: HandDragOptions) {
  const [drag, setDrag] = useState<HandDrag | null>(null);
  const track = useRef<Track | null>(null);
  const dropRef = useRef<DropState>(null);
  /** O `click` que vem depois de um arrasto não amplia a carta. */
  const swallowClick = useRef(false);
  const onDropStateRef = useRef(o.onDropState);
  useEffect(() => {
    onDropStateRef.current = o.onDropState;
  });
  // Mão sumiu no meio do arrasto: o feltro não pode ficar aceso.
  useEffect(
    () => () => {
      if (dropRef.current) onDropStateRef.current(null);
    },
    [],
  );

  const setDrop = (s: DropState) => {
    if (dropRef.current === s) return;
    dropRef.current = s;
    o.onDropState(s);
  };
  const awaySet = new Set(o.away);
  const visible = o.ids.filter((id) => !awaySet.has(id));
  const idle: DropState = o.canPlay && !o.blocked ? 'ready' : null;

  const onPointerDown = (e: PointerEvent<HTMLElement>, id: string) => {
    if (e.button !== 0 || (e.target as Element).closest('.dx-zoom')) return;
    const from = visible.indexOf(id);
    if (from < 0) return;
    swallowClick.current = false;
    const width = handRef.current?.getBoundingClientRect().width ?? 0;
    track.current = { id, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, scale: width / HAND_W || 1, from, at: from, over: false, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const t = track.current;
    if (!t || e.pointerId !== t.pointerId) return;
    const dx = (e.clientX - t.x0) / t.scale, dy = (e.clientY - t.y0) / t.scale;
    if (!t.moved) {
      if (Math.hypot(dx, dy) < DRAG_START) return;
      t.moved = true;
      playDixitSound('pick');
      setDrop(idle);
    }
    t.over = o.canPlay && overFelt(e.clientX, e.clientY);
    if (t.over) setDrop(o.blocked ? 'no' : 'over');
    else {
      setDrop(idle);
      const left = handRef.current?.getBoundingClientRect().left ?? 0;
      t.at = insertIndex((e.clientX - left) / t.scale, visible.length);
    }
    setDrag({ id: t.id, dx, dy, at: t.over ? t.from : t.at, from: t.from });
  };

  const end = (e: PointerEvent<HTMLElement>, cancel: boolean) => {
    const t = track.current;
    if (!t || e.pointerId !== t.pointerId) return;
    track.current = null;
    if (!t.moved) return; // clique simples: o `click` amplia
    swallowClick.current = true;
    setDrag(null);
    setDrop(null);
    if (cancel) return;
    if (t.over) {
      if (o.blocked) o.onBlocked();
      else o.onPlay(t.id, { x: e.clientX, y: e.clientY });
      return;
    }
    const next = dropInHand(o.ids, o.away, t.id, t.at);
    if (next.some((id, i) => id !== o.ids[i])) o.onReorder(next);
    playDixitSound('land');
  };

  const onClick = (id: string) => {
    if (swallowClick.current) {
      swallowClick.current = false;
      return;
    }
    o.onZoom(id);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>, id: string) => {
    if (e.key !== 'Enter' || e.target !== e.currentTarget) return;
    e.preventDefault();
    if (o.blocked) o.onBlocked();
    else if (o.canPlay) o.onPlay(id, null);
    else o.onZoom(id);
  };

  return {
    drag,
    /** Props de ponteiro, clique e teclado de cada carta da mão. */
    cardProps: (id: string) => ({
      onPointerDown: (e: PointerEvent<HTMLElement>) => onPointerDown(e, id),
      onPointerMove,
      onPointerUp: (e: PointerEvent<HTMLElement>) => end(e, false),
      onPointerCancel: (e: PointerEvent<HTMLElement>) => end(e, true),
      onLostPointerCapture: (e: PointerEvent<HTMLElement>) => end(e, true),
      onClick: () => onClick(id),
      onKeyDown: (e: KeyboardEvent<HTMLElement>) => onKeyDown(e, id),
    }),
  };
}
