import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { feltPoint } from './geometry';
import { playDixitSound } from './sounds';
import type { Loose } from './useLooseSpots';

/** Tempos (ms) aprovados no protótipo. */
const ARRIVAL_MS = { seatFly: 680, settle: 380, seatSound: 560, settleSound: 260 };

const clamp = (v: number, a: number, b: number): number => Math.min(Math.max(v, a), b);

/** `setTimeout` que some da lista quando dispara e é cancelado ao desmontar. */
function useTimers() {
  const ids = useRef(new Set<number>());
  useEffect(() => {
    const set = ids.current;
    return () => {
      set.forEach((t) => clearTimeout(t));
      set.clear();
    };
  }, []);
  return useCallback((ms: number, fn: () => void) => {
    const id = window.setTimeout(() => {
      ids.current.delete(id);
      fn();
    }, ms);
    ids.current.add(id);
  }, []);
}

/**
 * Chegada das soltas novas (uma vez por carta): a dos outros voa do assento deles (`[data-seat]`, procurado
 * dentro da mesa), a sua só assenta; as duas tocam `land`. As que já estavam ao abrir (`quiet`) só aparecem.
 */
export function useLooseArrival(feltRef: RefObject<HTMLElement | null>, spots: Readonly<Record<string, Loose>>, you: string | null) {
  const landed = useRef(new Set<string>());
  const later = useTimers();

  useLayoutEffect(() => {
    const felt = feltRef.current;
    if (!felt) return;
    for (const k of [...landed.current]) if (!spots[k]) landed.current.delete(k);
    const els = new Map([...felt.querySelectorAll<HTMLElement>('[data-loose]')].map((el) => [el.dataset.loose!, el]));
    const root = felt.closest('.dixit') ?? felt.parentElement?.parentElement ?? null;
    const rect = felt.getBoundingClientRect();
    for (const [key, loose] of Object.entries(spots)) {
      const el = els.get(key);
      if (landed.current.has(key) || !el) continue;
      landed.current.add(key);
      if (loose.quiet) continue;
      const rz = loose.spot[2];
      const seat = loose.player !== you ? [...(root?.querySelectorAll<HTMLElement>('[data-seat]') ?? [])].find((s) => s.dataset.seat === loose.player) : undefined;
      let dx = 0, dy = 0, z = 70, spin = rz - 6;
      if (seat) {
        const s = seat.getBoundingClientRect();
        const fp = feltPoint(rect, s.left + s.width / 2, s.top + s.height / 2);
        if (fp) {
          dx = clamp(fp[0], -120, 1120) - loose.spot[0];
          dy = clamp(fp[1], -120, 640) - loose.spot[1];
        }
        z = 150;
        spin = rz - 30;
      }
      el.animate?.(
        [
          { transform: `translate(-50%,-100%) translate(${dx}px,${dy}px) translateZ(${z}px) rotateZ(${spin}deg) rotateX(calc(var(--tilt) * -.6))`, opacity: seat ? 0 : 1, offset: 0 },
          { opacity: 1, offset: 0.3 },
        ],
        { duration: seat ? ARRIVAL_MS.seatFly : ARRIVAL_MS.settle, easing: 'cubic-bezier(.2,.9,.3,1)' },
      );
      later(seat ? ARRIVAL_MS.seatSound : ARRIVAL_MS.settleSound, () => playDixitSound('land'));
    }
  }, [feltRef, spots, you, later]);
}
