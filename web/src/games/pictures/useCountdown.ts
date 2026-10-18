import { useEffect, useRef, useState } from 'react';

/** Segundos que faltam (inteiro, arredondado pra cima, nunca negativo). */
export const remainingSeconds = (endsAt: number, now: number): number => Math.max(0, Math.ceil((endsAt - now) / 1000));

/**
 * Segundos restantes da contagem (`null` sem contagem), na hora do servidor (`Date.now() + serverOffset`):
 * o relógio do PC não muda o prazo. Atualiza a cada 250 ms enquanto corre.
 */
export function useCountdown(endsAt: number | null, serverOffset: number): number | null {
  const [, setTick] = useState(0);
  const offset = useRef(serverOffset);
  offset.current = serverOffset;
  useEffect(() => {
    if (endsAt === null) return undefined;
    const id = setInterval(() => {
      setTick((t) => t + 1);
      // zerou: não precisa mais acordar
      if (remainingSeconds(endsAt, Date.now() + offset.current) === 0) clearInterval(id);
    }, 250);
    return () => clearInterval(id);
  }, [endsAt]);
  return endsAt === null ? null : remainingSeconds(endsAt, Date.now() + serverOffset);
}
