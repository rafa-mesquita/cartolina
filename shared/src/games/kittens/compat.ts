import type { KittensState } from './types';

/**
 * Estado salvo antes das cartas novas (2026-10-20) não tem `front` nem `blind`: uma sala guardada no Durable Object no
 * meio de uma partida volta sem eles depois do deploy. Aqui eles entram vazios (ninguém tinha Latidor na frente nem
 * estava cego). Devolve o MESMO objeto quando o estado já está completo. Aplicado nas portas de entrada do motor
 * (`applyKittensAction`, `settleKittens`, `kittensViewFor`).
 */
export function kittensWithNewFields(state: KittensState): KittensState {
  const old = state as Partial<Pick<KittensState, 'front' | 'blind'>> & Omit<KittensState, 'front' | 'blind'>;
  if (old.front !== undefined && old.blind !== undefined) return state;
  return { ...old, front: old.front ?? {}, blind: old.blind ?? [] };
}
