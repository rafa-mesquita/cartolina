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

/** Índice onde a carta arrastada cai na mão: `x` em px do palco dentro da mão de 840 px, cartas a cada 116 px centradas em 420. */
export function insertIndex(x: number, count: number): number {
  if (count <= 0) return 0;
  const i = Math.round((x - 420) / 116 + (count - 1) / 2);
  return Math.min(Math.max(i, 0), count - 1);
}
