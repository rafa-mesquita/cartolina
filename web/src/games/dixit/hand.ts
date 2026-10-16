/** Ordem local da mão: mantém a ordem que a pessoa arrumou, tira o que saiu e põe o que entrou no fim. */
export function orderHand(prev: readonly string[], hand: readonly string[]): string[] {
  const inHand = new Set(hand);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of prev) {
    if (inHand.has(id) && !seen.has(id)) {
      out.push(id);
      seen.add(id);
    }
  }
  for (const id of hand) {
    if (!seen.has(id)) {
      out.push(id);
      seen.add(id);
    }
  }
  return out;
}

/** Move `id` para a posição `toIndex` (limitada a 0…n-1). Sem `id` na lista, devolve uma cópia igual. */
export function moveCard(order: readonly string[], id: string, toIndex: number): string[] {
  const from = order.indexOf(id);
  if (from < 0) return [...order];
  const rest = order.filter((_, i) => i !== from);
  const to = Math.min(Math.max(toIndex, 0), rest.length);
  rest.splice(to, 0, id);
  return rest;
}

/** Largura da mão, em px do palco. */
export const HAND_W = 840;
/** Distância entre os centros de duas cartas vizinhas da mão. */
export const HAND_STEP = 116;

/** Posição x do centro da carta `i` numa mão de `count` cartas, dentro da mão (0…HAND_W). */
export function handX(i: number, count: number): number {
  return HAND_W / 2 + (i - (count - 1) / 2) * HAND_STEP;
}

/** Índice onde a carta arrastada cai na mão: `x` em px do palco dentro da mão (conta inversa de `handX`). */
export function insertIndex(x: number, count: number): number {
  if (count <= 0) return 0;
  const i = Math.round((x - HAND_W / 2) / HAND_STEP + (count - 1) / 2);
  return Math.min(Math.max(i, 0), count - 1);
}
