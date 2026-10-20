import type { KittensState } from './types';

/**
 * Estado salvo antes das cartas novas (2026-10-20) não tem `front` nem `blind`: uma sala guardada no Durable Object no
 * meio de uma partida volta sem eles depois do deploy. Aqui eles entram vazios (ninguém tinha Latidor na frente nem
 * estava cego). Também a escolha do Favor de antes do trio de Favor (2026-10-20) não tem `left`: era sempre 1 carta.
 * Devolve o MESMO objeto quando o estado já está completo. Aplicado nas portas de entrada do motor
 * (`applyKittensAction`, `settleKittens`, `kittensViewFor`).
 */
export function kittensWithNewFields(state: KittensState): KittensState {
  const old = state as Partial<Pick<KittensState, 'front' | 'blind'>> & Omit<KittensState, 'front' | 'blind'>;
  const c = old.choice;
  const oldFavor = c?.kind === 'favor' && (c as Partial<typeof c>).left === undefined;
  if (old.front !== undefined && old.blind !== undefined && !oldFavor) return state;
  const choice = oldFavor ? { ...c, left: 1 } : c;
  return { ...old, front: old.front ?? {}, blind: old.blind ?? [], choice };
}
