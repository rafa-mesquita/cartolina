import type { PicturesRoundResult } from '@cartolina/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildRevealTimeline, frameAt, scoresBefore, type RevealEvent, type RevealFrame } from './reveal';
import { playPicturesSfx } from './sfx';

/** Evento mais velho que isso (ms) não toca mais: o navegador segurou o relógio (aba em segundo plano) e o salto não pode virar uma rajada de sons. */
const SOUND_MAX_AGE = 300;

/** O som de cada evento (o único lugar que liga evento a som). */
function onEvent(e: RevealEvent): void {
  if (e.kind === 'tape') playPicturesSfx('tape');
  else if (e.kind === 'photo') playPicturesSfx('shutter');
  else if (e.kind === 'plus') playPicturesSfx('plim');
}

/** Chave da revelação: a rodada e a ordem dos artistas (um re-render nunca recomeça; uma rodada nova sempre). */
export const revealKey = (r: PicturesRoundResult | null): string => (r ? `${r.round}:${r.order.join(',')}` : '');

/** Instante lido do relógio, preso à linha do tempo a que pertence (um instante velho nunca vale pra revelação nova). */
interface Tick {
  events: readonly RevealEvent[];
  t: number;
}

/** Quantos eventos já passaram em `t`. */
function passed(events: readonly RevealEvent[], t: number): number {
  let n = 0;
  while (n < events.length && events[n]!.at <= t) n++;
  return n;
}

/**
 * Relógio da revelação narrada (batida de 50 ms). A linha do tempo nasce uma vez por `revealKey(result)`;
 * `players` = quem jogou a rodada, `scores` = placar da visão (já com a rodada). Devolve o quadro atual e `skip`
 * (pula pro fim, sem tocar os sons do meio). O estado só muda quando passa um evento novo.
 */
export function useReveal(
  result: PicturesRoundResult | null,
  players: readonly string[],
  scores: Readonly<Record<string, number>>,
): { frame: RevealFrame | null; skip: () => void } {
  const key = revealKey(result);
  const [tick, setTick] = useState<Tick | null>(null);
  const skipped = useRef(false);
  const last = useRef(-1);
  const shown = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- a linha do tempo nasce uma vez por revelação (key)
  const events = useMemo(() => (result ? buildRevealTimeline(result, players) : null), [key]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- o placar de partida também é o do começo da revelação
  const before = useMemo(() => (result ? scoresBefore(scores, result) : {}), [key]);
  const t = events && tick?.events === events ? tick.t : 0;

  useEffect(() => {
    if (!events) return;
    const start = Date.now();
    skipped.current = false;
    last.current = -1;
    shown.current = 0;
    const end = events[events.length - 1]!.at;
    const id = setInterval(() => {
      const now = skipped.current ? Infinity : Date.now() - start;
      const n = passed(events, now);
      if (n !== shown.current) {
        shown.current = n;
        setTick({ events, t: now });
      }
      if (now >= end) clearInterval(id);
    }, 50);
    return () => clearInterval(id);
  }, [events]);

  useEffect(() => {
    if (!events) return;
    // Re-rodar é inofensivo: `last` impede repetir um evento. Os velhos (ou pulados) só avançam `last`, sem tocar.
    let i = last.current + 1;
    for (; i < events.length && events[i]!.at <= t; i++) {
      const e = events[i]!;
      if (!skipped.current && t - e.at < SOUND_MAX_AGE) onEvent(e);
    }
    last.current = i - 1;
  }, [t, events]);

  const skip = useCallback(() => {
    skipped.current = true;
    if (events) {
      shown.current = events.length;
      setTick({ events, t: Infinity });
    }
  }, [events]);

  return { frame: events ? frameAt(events, t, before) : null, skip };
}
