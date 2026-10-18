import { COORDS, type Coord } from '@cartolina/shared';
import { useEffect, useRef, type RefObject } from 'react';

/** O resto do mesmo giro que abriu o zoom não fecha na hora (como no Diquisti). */
export const WHEEL_GRACE_MS = 350;

/** A coordenada de uma foto ampliável pela rodinha (`data-zoom-photo`) embaixo do ponteiro, ou null. */
export function wheelPhoto(target: Element): Coord | null {
  const c = target.closest('[data-zoom-photo]')?.getAttribute('data-zoom-photo');
  return c && (COORDS as readonly string[]).includes(c) ? (c as Coord) : null;
}

/** Depois de um giro que rolou uma lista, a rodinha só abre zoom num gesto novo (parada de pelo menos isso, em ms). */
export const WHEEL_GESTURE_MS = 300;

/** A lista rolável (na vertical) mais próxima de `target`, sem passar de `stop`; null se nada rola ali. */
export function scrollerOf(target: Element, stop: Element): HTMLElement | null {
  for (let n: Element | null = target; n && n !== stop; n = n.parentElement) {
    if (!(n instanceof HTMLElement) || n.scrollHeight <= n.clientHeight) continue;
    const oy = getComputedStyle(n).overflowY;
    if (oy === 'auto' || oy === 'scroll') return n;
  }
  return null;
}

/**
 * Rodinha pra cima em cima de algo ampliável: `open(alvo)` tenta abrir e diz se abriu (só aí a rolagem é barrada).
 * Fica quieta dentro da bancada (os kits usam a rodinha pra girar), com algum zoom já aberto, no meio de um arraste,
 * ou se alguém de dentro já cuidou do giro (`defaultPrevented`). Numa lista rolável (galeria, placar) a rodinha rola
 * primeiro: só abre com a lista no topo e num gesto novo (o embalo de quem estava rolando não abre zoom).
 * Ouvinte nativo: o `onWheel` do React é passivo e não deixa barrar a rolagem.
 */
export function useWheelOpen(ref: RefObject<HTMLElement | null>, open: (target: Element) => boolean): void {
  const latest = useRef(open);
  latest.current = open;
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let scrolledAt = -Infinity;
    const onWheel = (e: WheelEvent) => {
      if (e.defaultPrevented || !(e.target instanceof Element)) return;
      const table = el.closest('.pictures') ?? el;
      const scroller = scrollerOf(e.target, table);
      if (scroller) {
        const now = Date.now(), last = scrolledAt;
        scrolledAt = now;
        if (e.deltaY >= 0 || scroller.scrollTop > 0 || now - last < WHEEL_GESTURE_MS) return;
      }
      if (e.deltaY >= 0) return;
      if (e.target.closest('.pc-bench, .pc-zoom')) return;
      if (table.querySelector('.pc-zoom, .pc-gallery.dragging')) return;
      if (latest.current(e.target)) {
        e.preventDefault();
        scrolledAt = -Infinity;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [ref]);
}

/** Rodinha pra baixo no zoom aberto fecha (menos nos primeiros {@link WHEEL_GRACE_MS} ms depois de abrir). */
export function useWheelClose(ref: RefObject<HTMLElement | null>, onClose: () => void): void {
  const opened = useRef(Date.now());
  const latest = useRef(onClose);
  latest.current = onClose;
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY <= 0 || Date.now() - opened.current <= WHEEL_GRACE_MS) return;
      e.preventDefault();
      latest.current();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [ref]);
}
