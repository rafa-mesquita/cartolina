import { COORDS, type Coord } from '@cartolina/shared';
import { useEffect, useRef, type RefObject } from 'react';

/** O resto do mesmo giro que abriu o zoom não fecha na hora (como no Diquisti). */
export const WHEEL_GRACE_MS = 350;

/** A coordenada de uma foto ampliável pela rodinha (`data-zoom-photo`) embaixo do ponteiro, ou null. */
export function wheelPhoto(target: Element): Coord | null {
  const c = target.closest('[data-zoom-photo]')?.getAttribute('data-zoom-photo');
  return c && (COORDS as readonly string[]).includes(c) ? (c as Coord) : null;
}

/**
 * Rodinha pra cima em cima de algo ampliável: `open(alvo)` tenta abrir e diz se abriu (só aí a rolagem é barrada).
 * Fica quieta dentro da bancada (os kits usam a rodinha pra girar), com algum zoom já aberto, ou se alguém de dentro
 * já cuidou do giro (`defaultPrevented`). Ouvinte nativo: o `onWheel` do React é passivo e não deixa barrar a rolagem.
 */
export function useWheelOpen(ref: RefObject<HTMLElement | null>, open: (target: Element) => boolean): void {
  const latest = useRef(open);
  latest.current = open;
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const onWheel = (e: WheelEvent) => {
      if (e.defaultPrevented || e.deltaY >= 0 || !(e.target instanceof Element)) return;
      if (e.target.closest('.pc-bench, .pc-zoom')) return;
      if ((el.closest('.pictures') ?? el).querySelector('.pc-zoom')) return;
      if (latest.current(e.target)) e.preventDefault();
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
