import { useEffect, useRef, useState } from 'react';

/** Milissegundos que faltam na janela (nunca negativo). */
export const windowLeft = (endsAt: number, serverNow: number): number => Math.max(0, endsAt - serverNow);

/** Intervalo de atualização do relógio da janela (a barra dos 10 s anda a cada 100 ms). */
const TICK_MS = 100;

/**
 * Relógio da janela aberta, na hora do servidor (`Date.now() + serverOffset`): o relógio do PC não muda o prazo.
 * Atualiza a cada 100 ms enquanto corre e para de acordar quando o prazo passa. `null` sem janela (`endsAt` null).
 * `expired` = o prazo passou: a visão não tem relógio, então a mesa esconde os botões da janela até o servidor fechá-la.
 */
export function useWindowClock(endsAt: number | null, serverOffset: number): { msLeft: number; expired: boolean } | null {
  const [, setTick] = useState(0);
  const offset = useRef(serverOffset);
  offset.current = serverOffset;
  useEffect(() => {
    // sem janela, ou já vencida: não precisa acordar
    if (endsAt === null || windowLeft(endsAt, Date.now() + offset.current) === 0) return undefined;
    const id = setInterval(() => {
      setTick((t) => t + 1);
      if (windowLeft(endsAt, Date.now() + offset.current) === 0) clearInterval(id);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [endsAt]);
  if (endsAt === null) return null;
  const msLeft = windowLeft(endsAt, Date.now() + serverOffset);
  return { msLeft, expired: msLeft === 0 };
}
