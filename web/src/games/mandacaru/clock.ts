import { useEffect, useState } from 'react';

/** Milissegundos que faltam (nunca negativo); `null` = relógio parado (sem prazo). */
export function timeLeft(endsAt: number | null, serverNow: number): number | null {
  return endsAt === null ? null : Math.max(0, endsAt - serverNow);
}

/** "4:12" (minutos:segundos), arredondando os segundos pra cima: 0,4 s ainda é "0:01". */
export function formatClock(ms: number): string {
  const s = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Intervalo de atualização do relógio do turno. */
const TICK_MS = 250;

/**
 * Relógio do turno (ou do descarte) na hora do servidor (`Date.now() + serverOffset`): o relógio do PC não muda o prazo.
 * Tique de 250 ms enquanto corre; para de acordar quando o prazo passa ou com `endsAt` null (relógio parado).
 * Se o prazo ou o `serverOffset` mudarem, rearma. Devolve os ms que faltam, ou `null` parado.
 */
export function useTurnClock(endsAt: number | null, serverOffset: number): number | null {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (endsAt === null || timeLeft(endsAt, Date.now() + serverOffset) === 0) return undefined;
    const id = setInterval(() => {
      setTick((t) => t + 1);
      if (timeLeft(endsAt, Date.now() + serverOffset) === 0) clearInterval(id);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [endsAt, serverOffset]);
  return timeLeft(endsAt, Date.now() + serverOffset);
}
