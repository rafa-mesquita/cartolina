import { useEffect, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import type { GameConn } from '../../net/connection';
import { deskCursor, posFromY, slotTargets } from './phoneRowLogic';

const MOUSE_START_PX = 6;
const TOUCH_HOLD_MS = 220;
const TOUCH_SLOP_PX = 10;
const EDGE_PX = 56;
const EDGE_STEP_PX = 8;
/**
 * Depois de um arrasto o navegador ainda dispara `click` na carta (logo depois do `pointerup`, no mesmo gesto).
 * Engolimos esse clique por este tempo; 100 ms sobra pra ele chegar e é curto pra não pegar um toque de verdade.
 */
const CLICK_GUARD_MS = 100;

export interface PhoneDrag {
  /** Carta sendo arrastada por mim, ou null. */
  dragging: string | null;
  /** Posição visual do vão do meu arrasto (pra `PhoneRow.gaps`), ou null. */
  pos: number | null;
  /** Liga no `onPointerDown` das faixas e cartas da mão. */
  onPointerDown(e: ReactPointerEvent, cardId: string): void;
}

export interface PhoneDragOptions {
  container: RefObject<HTMLElement | null>;
  /** Fila mostrada (do servidor + minha intenção pendente). */
  row: readonly string[];
  /** Fila do servidor (`view.game.row`): dá o índice do `place` e o cursor do PC. */
  serverRow: readonly string[];
  canPick(cardId: string): boolean;
  conn: Pick<GameConn, 'sendCursor' | 'sendActivity'>;
  onDrop(cardId: string, index: number): void;
}

interface Press {
  cardId: string;
  pointerId: number;
  startX: number;
  startY: number;
  y: number;
  touch: boolean;
  active: boolean;
  /** Índice do servidor do alvo atual, ou null (sem alvo). */
  index: number | null;
  hold: number;
  raf: number;
}

/**
 * Cria os handlers uma única vez (identidade estável: `removeEventListener` recebe as mesmas funções do
 * `addEventListener`). Eles leem as opções mais recentes por `live`.
 */
function createController(live: MutableRefObject<PhoneDragOptions>, setDragging: (id: string | null) => void, setPos: (pos: number | null) => void) {
  let press: Press | null = null;
  /** Tira o guarda de clique de um arrasto anterior (se ainda estiver ativo). */
  let dropClickGuard: (() => void) | null = null;

  /** Alvo pela altura do dedo: posição visual (pra o vão) e índice do servidor (pra o `place`). */
  const targetFor = (cardId: string, y: number): { visual: number | null; index: number | null } => {
    const { container, row, serverRow } = live.current;
    const box = container.current;
    // Fora da fila (ex.: soltar sobre a barra da mão) não há alvo: a carta volta.
    if (box) {
      const r = box.getBoundingClientRect();
      if (y < r.top || y > r.bottom) return { visual: null, index: null };
    }
    const rects = box
      ? Array.from(box.querySelectorAll<HTMLElement>('[data-card]'))
          .filter((el) => el.dataset.card !== cardId && row.includes(el.dataset.card ?? ''))
          .map((el) => el.getBoundingClientRect())
      : [];
    // posFromY conta as faixas sem a arrastada: converte pra posição visual na fila com ela.
    const without = posFromY(y, rects);
    const at = row.indexOf(cardId);
    const visual = at >= 0 && without > at ? without + 1 : without;
    const hit = slotTargets(row, cardId, serverRow).find((t) => t.pos === visual);
    return { visual, index: hit ? hit.index : null };
  };

  /** Sem alvo, o cursor fica onde a carta está no servidor (ou no fim, se vem da mão). */
  const currentIndex = (serverRow: readonly string[], cardId: string) => {
    const at = serverRow.indexOf(cardId);
    return at >= 0 ? at : serverRow.length;
  };

  /** Recalcula o alvo; avisa o PC só quando ele muda. */
  const retarget = (s: Press) => {
    const { visual, index } = targetFor(s.cardId, s.y);
    setPos(index === null ? null : visual);
    if (index === s.index) return;
    s.index = index;
    const { conn, serverRow } = live.current;
    conn.sendCursor({ ...deskCursor(serverRow, s.cardId, index ?? currentIndex(serverRow, s.cardId)), drag: { cardId: s.cardId, index } });
  };

  /**
   * Segura o gesto de toque depois que o arrasto ativou. Fica registrado desde a montagem (`attach`), NÃO só aos
   * 220 ms: no iOS a possibilidade de cancelar a sequência de toques é decidida no `touchstart`, e um listener
   * não passivo que chega depois recebe `touchmove` com `cancelable=false`. Aí a faixa (`pan-y`) rola e vem
   * `pointercancel`, matando o arrasto.
   */
  const guardTouch = (e: TouchEvent) => {
    if (press?.touch && press.active && e.cancelable) e.preventDefault();
  };
  const blockMenu = (e: Event) => e.preventDefault();

  // Obs.: só `touch-action` e o `touchmove` acima impedem a rolagem; `preventDefault` num `pointermove` não faz nada.
  const onMove = (e: PointerEvent) => {
    const s = press;
    if (!s || e.pointerId !== s.pointerId) return;
    s.y = e.clientY;
    if (!s.active) {
      const moved = Math.hypot(e.clientX - s.startX, e.clientY - s.startY);
      if (s.touch) {
        if (moved > TOUCH_SLOP_PX) finish(false); // mexeu antes de segurar: é rolagem
        return;
      }
      if (moved < MOUSE_START_PX) return;
      activate();
    }
    retarget(s);
  };
  const onUp = (e: PointerEvent) => {
    if (press && e.pointerId === press.pointerId) finish(true);
  };
  const onCancel = (e: PointerEvent) => {
    if (press && e.pointerId === press.pointerId) finish(false);
  };

  const activate = () => {
    const s = press;
    if (!s || s.active) return;
    s.active = true;
    setDragging(s.cardId);
    live.current.conn.sendActivity('dragging');
    if (s.touch) window.addEventListener('contextmenu', blockMenu); // segurar abriria o menu do sistema
    if (typeof navigator !== 'undefined') navigator.vibrate?.(10);
    retarget(s); // o vão já aparece sob o dedo
    const edge = () => {
      const cur = press;
      const box = live.current.container.current;
      if (!cur || !box) return;
      const r = box.getBoundingClientRect();
      const before = box.scrollTop;
      // Só com o dedo dentro da fila (sobre a barra da mão não rola).
      if (cur.y >= r.top && cur.y <= r.bottom) {
        if (cur.y < r.top + EDGE_PX) box.scrollTop -= EDGE_STEP_PX;
        else if (cur.y > r.bottom - EDGE_PX) box.scrollTop += EDGE_STEP_PX;
      }
      if (box.scrollTop !== before) retarget(cur); // o conteúdo andou sob o dedo
      cur.raf = requestAnimationFrame(edge);
    };
    s.raf = requestAnimationFrame(edge);
  };

  function finish(drop: boolean) {
    const s = press;
    press = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('contextmenu', blockMenu);
    if (!s) return;
    clearTimeout(s.hold);
    cancelAnimationFrame(s.raf);
    if (!s.active) return;
    const { conn, serverRow, onDrop } = live.current;
    conn.sendCursor({ ...deskCursor(serverRow, s.cardId, s.index ?? currentIndex(serverRow, s.cardId)), drag: null });
    conn.sendActivity('thinking');
    setDragging(null);
    setPos(null);
    // Soltar o dedo/mouse na mesma carta gera um `click`: não deixa virar seleção.
    const swallow = (ev: Event) => ev.stopPropagation();
    window.addEventListener('click', swallow, true);
    const timer = setTimeout(() => dropClickGuard?.(), CLICK_GUARD_MS);
    dropClickGuard = () => {
      clearTimeout(timer);
      window.removeEventListener('click', swallow, true);
      dropClickGuard = null;
    };
    if (drop && s.index !== null) onDrop(s.cardId, s.index);
  }

  const onPointerDown = (e: ReactPointerEvent, cardId: string) => {
    if (!live.current.canPick(cardId) || (e.pointerType === 'mouse' && e.button !== 0)) return;
    // Um 2º dedo não derruba um arrasto ativo; uma pressão ainda não ativa é simplesmente trocada.
    if (press?.active && e.pointerId !== press.pointerId) return;
    dropClickGuard?.();
    if (press) finish(false);
    const touch = e.pointerType !== 'mouse';
    press = { cardId, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, y: e.clientY, touch, active: false, index: null, hold: 0, raf: 0 };
    if (touch) press.hold = window.setTimeout(activate, TOUCH_HOLD_MS);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  };

  return {
    onPointerDown,
    /** Registra o guarda de toque (ver `guardTouch`); devolve a função que o tira. */
    attach: () => {
      document.addEventListener('touchmove', guardTouch, { passive: false });
      return () => document.removeEventListener('touchmove', guardTouch);
    },
    dispose: () => {
      finish(false);
      dropClickGuard?.();
    },
  };
}

/** Arrastar uma carta (da mão ou da fila) com o dedo ou o mouse. Não chama `preventDefault` no `pointerdown`: toque curto segue sendo clique. */
export function usePhoneDrag(opts: PhoneDragOptions): PhoneDrag {
  const [dragging, setDragging] = useState<string | null>(null);
  const [pos, setPos] = useState<number | null>(null);
  const live = useRef(opts);
  useEffect(() => {
    live.current = opts;
  });
  const [ctl] = useState(() => createController(live, setDragging, setPos));
  useEffect(() => {
    const detach = ctl.attach();
    return () => {
      detach();
      ctl.dispose();
    };
  }, [ctl]);
  return { dragging, pos, onPointerDown: ctl.onPointerDown };
}
