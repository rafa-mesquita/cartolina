import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent, type RefObject } from 'react';
import type { CamelioFrom, CamelioView } from '@cartolina/shared';
import { backHtml, frontHtml } from './cardArt';
import { playCamelioSound } from './sounds';

/**
 * O gesto do Cama-Leão (porta do clique e do arrasto do protótipo, `prototipo/cama-leao/index.html` 660–850).
 *
 * Clique: clicar na aberta ou no monte levanta a carta (clicar de novo solta); com ela levantada, clicar numa mesa
 * joga. Arrasto (o gesto principal): `pointerdown` na carta arma; ele só começa depois de 6 px (antes disso, soltar
 * é um clique normal). Movimento e soltura ficam no `window` (a mesa pode ser redesenhada no meio). Durante o arrasto
 * o clone anda sem React; o destaque da mesa de baixo só muda o estado quando troca de mesa.
 *
 * Rede (diferença 4 do plano): ao soltar numa mesa a jogada vai pro servidor e o clone fica parado onde caiu
 * (`pending`). Ele some quando quem anima pega o ponto da soltura (`takeDropFrom`), quando a mesa desenhada passa
 * da jogada (a fila pulou) ou numa partida nova; volta voando (200 ms) se vier recusa (`refused`) ou 4 s sem eco.
 */

const DRAG_START_PX = 6;
const CARD_W = 92;
const CARD_H = CARD_W * 1.44;
/** Sem eco do servidor nesse tempo, a carta volta pro lugar. */
const PENDING_MS = 4000;
const BACK_MS = 200;

export interface DropFrom {
  x: number;
  y: number;
  from: CamelioFrom;
}

interface Opts {
  /** O palco (`.cl-stage`): é nele que o clone mora e é dele a escala. */
  stageRef: RefObject<HTMLElement | null>;
  /** Escala do palco (só se não der pra medir). */
  scale: number;
  /** A view desenhada. */
  shown: CamelioView;
  /** Pode jogar agora: sua vez em `shown` e no servidor, partida rolando, sem pausa, nada animando. */
  canPlay: boolean;
  /** `p` pode receber carta (joga a partida e está conectado). */
  canReceive: (p: string) => boolean;
  /** Manda a jogada pro servidor. */
  onPlay: (from: CamelioFrom, to: string) => void;
  /** Clicou na carta sem poder jogar (a mesa decide se avisa). */
  onDenied: () => void;
}

interface Drag {
  from: CamelioFrom;
  pointerId: number;
  x0: number;
  y0: number;
  started: boolean;
  src: HTMLElement;
  clone: HTMLElement | null;
  /** Canto de cima do clone, no palco. */
  pos: { x: number; y: number };
}

interface Pending {
  from: CamelioFrom;
  to: string;
  /** Onde o clone caiu (null no clique: a virada nasce no monte/aberta). */
  pos: { x: number; y: number } | null;
  clone: HTMLElement | null;
  match: number;
  /** `shown.playCount` na hora de mandar. */
  playCount: number;
  timer: ReturnType<typeof setTimeout>;
}

export interface DragPlay {
  /** Carta levantada pelo clique. */
  picked: CamelioFrom | null;
  /** Arrasto em curso (os alvos aparecem, o cursor vira mãozinha fechada). */
  dragging: boolean;
  /** Mesa sob o ponteiro que pode receber (`.hover`). */
  hoverPid: string | null;
  /** Monte/aberta com a carta apagada (`.dragging`): o clone está viajando, voltando ou esperando o servidor. */
  dimmed: CamelioFrom | null;
  /** Mostra as mesas que podem receber (`.target`). */
  targeting: boolean;
  /** Pode começar um gesto (pode jogar e não há jogada esperando o servidor). */
  ready: boolean;
  /** Handlers pra pôr no palco (delegação, como no protótipo). */
  handlers: {
    onPointerDown: (e: PointerEvent<HTMLElement>) => void;
    onClick: (e: MouseEvent<HTMLElement>) => void;
    onMouseOver: (e: MouseEvent<HTMLElement>) => void;
    onMouseLeave: () => void;
  };
  /** O servidor recusou: a carta esperando volta pro lugar. */
  refused: () => void;
  /** Pra quem anima a jogada sua: o ponto da soltura (e o clone some). Vale uma vez. */
  takeDropFrom: () => DropFrom | null;
}

const fromOf = (el: Element | null): CamelioFrom | null => {
  const v = el instanceof HTMLElement ? el.dataset.pile : undefined;
  return v === 'deck' || v === 'open' ? v : null;
};

export function useDragPlay({ stageRef, scale, shown, canPlay, canReceive, onPlay, onDenied }: Opts): DragPlay {
  const [picked, setPicked] = useState<CamelioFrom | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hoverPid, setHoverPid] = useState<string | null>(null);
  const [dimmed, setDimmed] = useState<CamelioFrom | null>(null);
  const [busy, setBusy] = useState(false);

  const drag = useRef<Drag | null>(null);
  const pending = useRef<Pending | null>(null);
  /** O clone que está voltando pro lugar (some no fim do voo). */
  const flying = useRef<HTMLElement | null>(null);
  /** Engole o clique que o navegador dispara depois de um arrasto de verdade. */
  const suppressClick = useRef(false);

  const ready = canPlay && !busy;
  // O que os ouvintes do window leem (sempre o do último render).
  const latest = useRef({ ready, scale, shown, canReceive, onPlay, picked });
  latest.current = { ready, scale, shown, canReceive, onPlay, picked };

  /** Palco e a escala medida (rect / offsetWidth), como no anim.ts. */
  const frame = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return null;
    const r = stage.getBoundingClientRect();
    const measured = r.width / (stage.offsetWidth || r.width);
    const s = Number.isFinite(measured) && measured > 0 ? measured : latest.current.scale > 0 ? latest.current.scale : 1;
    return { stage, r, s };
  }, [stageRef]);

  const toStage = useCallback(
    (x: number, y: number) => {
      const f = frame();
      if (!f) return { x, y };
      return { x: (x - f.r.left) / f.s, y: (y - f.r.top) / f.s };
    },
    [frame],
  );

  /** Onde está (no palco) o canto de cima da carta do monte/aberta. */
  const srcPos = useCallback(
    (from: CamelioFrom) => {
      const f = frame();
      const card = f?.stage.querySelector(`[data-pile="${from}"] .lift > .card`);
      if (!f || !card) return null;
      const c = card.getBoundingClientRect();
      return { x: (c.left - f.r.left) / f.s, y: (c.top - f.r.top) / f.s };
    },
    [frame],
  );

  const seatUnder = useCallback((x: number, y: number): string | null => {
    const el = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(x, y) : null;
    const seat = el?.closest<HTMLElement>('.seat[data-pid]');
    const pid = seat?.dataset.pid;
    return pid && stageRef.current?.contains(seat) && latest.current.canReceive(pid) ? pid : null;
  }, [stageRef]);

  /** O clone volta voando pro lugar em 200 ms e some; a origem fica apagada até lá. */
  const flyBack = useCallback(
    (clone: HTMLElement, from: CamelioFrom) => {
      if (flying.current && flying.current !== clone) flying.current.remove();
      const finish = () => {
        clone.remove();
        if (flying.current === clone) flying.current = null;
        if (!drag.current?.started && !pending.current) setDimmed(null);
      };
      const to = srcPos(from);
      if (!to || typeof clone.animate !== 'function') {
        finish();
        return;
      }
      flying.current = clone;
      clone.classList.remove('snap');
      const a = clone.animate([{ transform: clone.style.transform }, { transform: `translate(${to.x}px,${to.y}px)` }], {
        duration: BACK_MS,
        easing: 'cubic-bezier(.3,.7,.4,1)',
        fill: 'forwards',
      });
      const tilt = clone.firstElementChild;
      if (tilt instanceof HTMLElement) {
        tilt.animate([{ transform: 'rotate(-4deg) scale(1.06)' }, { transform: 'none' }], { duration: BACK_MS, easing: 'ease-out', fill: 'forwards' });
      }
      a.onfinish = finish;
      a.oncancel = finish;
    },
    [srcPos],
  );

  /** Tira o arrasto do estado (o clone fica por conta de quem chamou). */
  const endDrag = useCallback(() => {
    const d = drag.current;
    drag.current = null;
    setHoverPid(null);
    setDragging(false);
    if (d?.src.hasPointerCapture?.(d.pointerId)) {
      try {
        d.src.releasePointerCapture(d.pointerId);
      } catch {
        /* já foi */
      }
    }
    return d;
  }, []);

  /** Solta fora, Esc, pointercancel, fim da vez: a carta volta pro lugar. */
  const cancelDrag = useCallback(() => {
    const d = endDrag();
    if (!d?.started || !d.clone) return;
    flyBack(d.clone, d.from);
  }, [endDrag, flyBack]);

  /** O arrasto acabou sem soltura de verdade (botão solto fora da janela, janela perdeu o foco). */
  const abortDrag = useCallback(() => {
    const d = drag.current;
    if (!d) return;
    if (d.started) cancelDrag();
    else endDrag();
  }, [cancelDrag, endDrag]);

  /** A jogada esperando o servidor acabou; `back`: a carta volta voando (recusa, sem eco). */
  const clearPending = useCallback(
    (back: boolean) => {
      const p = pending.current;
      if (!p) return;
      pending.current = null;
      clearTimeout(p.timer);
      setBusy(false);
      if (!p.clone) return;
      if (back) flyBack(p.clone, p.from);
      else {
        p.clone.remove();
        if (!drag.current?.started && !flying.current) setDimmed(null);
      }
    },
    [flyBack],
  );

  const send = useCallback(
    (from: CamelioFrom, to: string, clone: HTMLElement | null, pos: { x: number; y: number } | null) => {
      const { shown: v, onPlay: play } = latest.current;
      if (pending.current) clearPending(false);
      pending.current = {
        from,
        to,
        pos,
        clone,
        match: v.match,
        playCount: v.playCount,
        timer: setTimeout(() => clearPending(true), PENDING_MS),
      };
      setBusy(true);
      play(from, to);
    },
    [clearPending],
  );

  const moveDrag = useCallback(
    (d: Drag, x: number, y: number) => {
      const p = toStage(x, y);
      d.pos = { x: p.x - CARD_W / 2, y: p.y - CARD_H / 2 };
      if (d.clone) d.clone.style.transform = `translate(${d.pos.x}px,${d.pos.y}px)`;
      setHoverPid(seatUnder(x, y)); // o React ignora o mesmo valor: só redesenha quando troca de mesa
    },
    [seatUnder, toStage],
  );

  const startDrag = useCallback(
    (d: Drag, x: number, y: number) => {
      const stage = stageRef.current;
      if (!stage) return;
      if (flying.current) {
        flying.current.remove();
        flying.current = null;
      }
      d.started = true;
      suppressClick.current = true;
      const v = latest.current.shown;
      const clone = document.createElement('div');
      clone.className = 'drag-clone snap';
      const art = d.from === 'deck' ? (v.top ? backHtml(v.top, CARD_W) : '') : v.open ? frontHtml(v.open, CARD_W) : '';
      clone.innerHTML = `<div class="tilt">${art}</div>`;
      const p = toStage(x, y);
      const p0 = srcPos(d.from) ?? { x: p.x - CARD_W / 2, y: p.y - CARD_H / 2 };
      clone.style.transform = `translate(${p0.x}px,${p0.y}px)`;
      d.pos = p0;
      stage.appendChild(clone);
      d.clone = clone;
      setPicked(null);
      setDimmed(d.from);
      setDragging(true);
      playCamelioSound('pick');
      // a carta desliza até ficar centrada no ponteiro e depois gruda nele
      clone.getBoundingClientRect();
      moveDrag(d, x, y);
      setTimeout(() => clone.classList.remove('snap'), 120);
    },
    [moveDrag, srcPos, stageRef, toStage],
  );

  // Movimento, soltura, cancelamento e Esc no window (uma vez; o resto vem de `latest`).
  useEffect(() => {
    const onMove = (e: globalThis.PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      if (e.buttons === 0) {
        abortDrag(); // o pointerup se perdeu (soltou fora da janela)
        return;
      }
      if (!d.started) {
        if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < DRAG_START_PX) return;
        if (!latest.current.ready) {
          endDrag(); // a vez acabou antes de começar: nada a arrastar
          return;
        }
        startDrag(d, e.clientX, e.clientY);
        return;
      }
      moveDrag(d, e.clientX, e.clientY);
    };
    const onUp = (e: globalThis.PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      if (!d.started) {
        endDrag(); // não passou dos 6 px: o click que vem a seguir é o gesto do clique
        return;
      }
      const to = latest.current.ready ? seatUnder(e.clientX, e.clientY) : null;
      if (!to || !d.clone) {
        cancelDrag();
        return;
      }
      endDrag();
      // o clone fica parado onde caiu até o servidor responder; a origem segue apagada
      d.clone.classList.remove('snap');
      send(d.from, to, d.clone, { ...d.pos });
    };
    const onCancel = (e: globalThis.PointerEvent) => {
      if (drag.current && e.pointerId === drag.current.pointerId) abortDrag();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (drag.current?.started) {
        cancelDrag();
        return;
      }
      if (latest.current.picked) {
        setPicked(null);
        setHoverPid(null);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('blur', abortDrag);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('blur', abortDrag);
      window.removeEventListener('keydown', onKey);
    };
  }, [abortDrag, cancelDrag, endDrag, moveDrag, seatUnder, send, startDrag]);

  // A vez acabou (ou começou uma animação, pausa…): a carta levantada solta e o arrasto volta pro lugar.
  useEffect(() => {
    if (canPlay) return;
    setPicked(null);
    setHoverPid(null);
    abortDrag();
  }, [canPlay, abortDrag]);

  // A jogada esperando o servidor: a mesa desenhada passou dela (a fila pulou) ou é outra partida → some.
  const { match, playCount } = shown;
  useEffect(() => {
    const p = pending.current;
    if (p && (match !== p.match || playCount > p.playCount)) clearPending(false);
  }, [match, playCount, clearPending]);

  // Partida nova: nada de voo, tudo some.
  const lastMatch = useRef(match);
  useEffect(() => {
    if (lastMatch.current === match) return;
    lastMatch.current = match;
    const d = endDrag();
    d?.clone?.remove();
    flying.current?.remove();
    flying.current = null;
    setPicked(null);
    setDimmed(null);
  }, [match, endDrag]);

  // Desmontou: limpa clones e o relógio.
  useEffect(
    () => () => {
      drag.current?.clone?.remove();
      flying.current?.remove();
      const p = pending.current;
      if (p) {
        clearTimeout(p.timer);
        p.clone?.remove();
      }
    },
    [],
  );

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    suppressClick.current = false; // um clique novo começa aqui
    if (e.button !== 0 || drag.current) return;
    const target = e.target as Element;
    const src = target.closest<HTMLElement>('[data-pile]');
    const from = fromOf(src);
    if (!src || !from || !target.closest('.lift')) return; // só a carta em si (não a legenda)
    if (!ready || !(from === 'deck' ? shown.top : shown.open)) return; // fora da vez o clique avisa
    drag.current = { from, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, started: false, src, clone: null, pos: { x: 0, y: 0 } };
    try {
      src.setPointerCapture(e.pointerId);
    } catch {
      /* sem captura, o window ainda escuta */
    }
  };

  /** Clica na aberta ou no monte: levanta a carta (clicar de novo solta). */
  const pick = (from: CamelioFrom) => {
    if (!ready) {
      if (!busy) onDenied();
      return;
    }
    if (from === 'deck' && !shown.top) return;
    if (from === 'open' && !shown.open) return;
    setPicked((cur) => (cur === from ? null : from));
    playCamelioSound('pick');
  };

  /** Clica numa mesa com a carta levantada: joga. */
  const dropOn = (p: string) => {
    if (!picked || !ready || !canReceive(p)) return;
    setPicked(null);
    setHoverPid(null);
    send(picked, p, null, null);
  };

  const onClick = (e: MouseEvent<HTMLElement>) => {
    const target = e.target as Element;
    if (target.closest('.cl-top, .cl-end')) return;
    // o clique que o navegador manda no fim de um arrasto de verdade não é um clique
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    const from = fromOf(target.closest('[data-pile]'));
    if (from) {
      pick(from);
      return;
    }
    const pid = target.closest<HTMLElement>('.seat[data-pid]')?.dataset.pid;
    if (pid) dropOn(pid);
  };

  const onMouseOver = (e: MouseEvent<HTMLElement>) => {
    if (drag.current) return; // no arrasto quem cuida do destaque é o pointermove
    const pid = (e.target as Element).closest<HTMLElement>('.seat[data-pid]')?.dataset.pid ?? null;
    setHoverPid(picked && pid && canReceive(pid) ? pid : null);
  };
  const onMouseLeave = () => {
    if (!drag.current) setHoverPid(null);
  };

  const refused = useCallback(() => clearPending(true), [clearPending]);

  const takeDropFrom = useCallback((): DropFrom | null => {
    const p = pending.current;
    if (!p) return null;
    const drop = p.pos ? { ...p.pos, from: p.from } : null;
    // a carta da virada nasce no mesmo quadro em que o clone sai
    clearPending(false);
    return drop;
  }, [clearPending]);

  const shownPicked = ready ? picked : null;
  return {
    picked: shownPicked,
    dragging: dragging && canPlay,
    hoverPid: (shownPicked || dragging) && canPlay ? hoverPid : null,
    dimmed,
    targeting: canPlay && (shownPicked !== null || dragging),
    ready,
    handlers: { onPointerDown, onClick, onMouseOver, onMouseLeave },
    refused,
    takeDropFrom,
  };
}
