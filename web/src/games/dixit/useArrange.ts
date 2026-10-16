import type { DixitPhase } from '@cartolina/shared';
import { useEffect, useRef, useState } from 'react';
import { playDixitSound } from './sounds';

/**
 * Arrumação ao fechar a escolha: `hold` (espera a última carta cair), `move` (as soltas deslizam pras casas
 * da votação) e `flip` (viram uma a uma). `null` fora dela (as cartas já estão no lugar, viradas pra cima).
 */
export type Step = 'hold' | 'move' | 'flip' | null;

/** Tempos (ms) aprovados no protótipo. */
export const ARRANGE_MS = {
  /** Espera da última carta, quando alguma ainda não estava na mesa. */
  lastLand: 750,
  /**
   * Espera mínima: as cartas da votação acabaram de montar nas posições soltas e precisam ser desenhadas lá
   * antes de deslizar (senão a transição não acontece).
   */
  minHold: 60,
  move: 820,
  flipStep: 120,
  flipSound: 300,
  /** Fim da virada da última carta (a partir do início da sua animação). */
  flipEnd: 900,
};

/**
 * Relógio da arrumação. A fase anterior fica no estado: ao passar da escolha pra votação, `hold` já vale neste
 * render. `hold` só começa a contar quando `setHoldMs` disser quanto esperar (quem monta as soltas é que sabe).
 */
export function useArrange(phase: DixitPhase, tableLen: number) {
  const [seen, setSeen] = useState(phase);
  const [stepState, setStep] = useState<Step>(null);
  const [holdMs, setHoldMs] = useState<number | null>(null);
  let step = stepState;
  if (seen !== phase) {
    step = seen === 'submitting' && phase === 'voting' ? 'hold' : null;
    setSeen(phase);
    setStep(step);
    setHoldMs(null);
  }
  // Quantas cartas viram: lido quando a virada começa (mudar no meio não toca de novo).
  const lenRef = useRef(tableLen);
  useEffect(() => {
    lenRef.current = tableLen;
  });

  useEffect(() => {
    if (stepState === 'hold') {
      if (holdMs === null) return undefined;
      const t = window.setTimeout(() => setStep('move'), Math.max(holdMs, ARRANGE_MS.minHold));
      return () => clearTimeout(t);
    }
    if (stepState === 'move') {
      const t = window.setTimeout(() => setStep('flip'), ARRANGE_MS.move);
      return () => clearTimeout(t);
    }
    if (stepState === 'flip') {
      const n = lenRef.current;
      const ts = Array.from({ length: n }, (_, i) => window.setTimeout(() => playDixitSound('flip', i), ARRANGE_MS.flipSound + ARRANGE_MS.flipStep * i));
      ts.push(window.setTimeout(() => setStep(null), ARRANGE_MS.flipEnd + ARRANGE_MS.flipStep * Math.max(n - 1, 0)));
      return () => ts.forEach((t) => clearTimeout(t));
    }
    return undefined;
  }, [stepState, holdMs]);

  return { step, setHoldMs };
}
