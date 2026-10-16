import type { DixitRoundResult } from '@cartolina/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildRevealTimeline, frameAt, type RevealEvent, type RevealFrame } from './reveal';
import { playDixitSound } from './sounds';

function soundOf(e: RevealEvent, r: DixitRoundResult, me: string | null): void {
  if (e.kind === 'spot') playDixitSound('join');
  else if (e.kind === 'vote') playDixitSound('flip', e.index);
  else if (e.kind === 'owner') playDixitSound('slide');
  else if (e.kind === 'hop') playDixitSound('click');
  else if (e.kind === 'done' && me && (r.gained[me] ?? 0) > 0) playDixitSound('win');
}

/** Instante lido do relógio, preso à linha do tempo a que pertence (um instante velho nunca vale pra revelação nova). */
interface Tick {
  events: readonly RevealEvent[];
  t: number;
}

/**
 * Relógio da revelação narrada. `key` muda a cada revelação nova (e só aí a linha do tempo é refeita:
 * os nomes das legendas ficam os do começo). Devolve o quadro atual e `skip` (pula pro fim, sem tocar os sons do meio).
 */
export function useReveal(
  result: DixitRoundResult | null,
  key: string,
  order: readonly string[],
  name: (id: string) => string,
  me: string | null,
): { frame: RevealFrame | null; skip: () => void } {
  const [tick, setTick] = useState<Tick | null>(null);
  const skipped = useRef(false);
  const last = useRef(-1);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- a linha do tempo nasce uma vez por revelação (key)
  const events = useMemo(() => (result && key ? buildRevealTimeline(result, order, name, me) : null), [key]);
  const t = events && tick?.events === events ? tick.t : 0;

  useEffect(() => {
    if (!events) return;
    const start = Date.now();
    skipped.current = false;
    last.current = -1;
    const end = events[events.length - 1]!.at;
    const id = setInterval(() => {
      const now = skipped.current ? Infinity : Date.now() - start;
      setTick({ events, t: now });
      if (now >= end) clearInterval(id);
    }, 50);
    return () => clearInterval(id);
  }, [events]);

  useEffect(() => {
    if (!events || !result) return;
    let i = last.current + 1;
    for (; i < events.length && events[i]!.at <= t; i++) {
      const e = events[i]!;
      if (!skipped.current || e.kind === 'done') soundOf(e, result, me);
    }
    last.current = i - 1;
    // `result` e `me` só alimentam o som; não precisam reiniciar nada.
  }, [t, events, result, me]);

  const skip = useCallback(() => {
    skipped.current = true;
    if (events) setTick({ events, t: Infinity });
  }, [events]);

  return { frame: events ? frameAt(events, t) : null, skip };
}
