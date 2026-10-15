export type Side = 'left' | 'top' | 'right';

export interface SeatSlot {
  id: string;
  side: Side;
  /** 0–1 ao longo do lado: no topo, da esquerda pra direita; nas laterais, de cima pra baixo. */
  pos: number;
}

/**
 * Eu fico embaixo; os outros seguem em sentido horário a partir da minha esquerda:
 * lateral esquerda (de baixo pra cima), topo (esquerda → direita), lateral direita (de cima pra baixo).
 */
export function arrangeSeats(seatIds: readonly string[], me: string | null): SeatSlot[] {
  const i = me ? seatIds.indexOf(me) : -1;
  const others = i >= 0 ? [...seatIds.slice(i + 1), ...seatIds.slice(0, i)] : [...seatIds];
  const n = others.length;
  const perSide = n >= 7 ? 2 : n >= 3 ? 1 : 0;
  const top = n - 2 * perSide;
  const sidePos = (j: number, fromBottom: boolean) => {
    if (perSide === 1) return 0.5;
    const order = fromBottom ? [0.68, 0.32] : [0.32, 0.68];
    return order[j]!;
  };
  const slots: SeatSlot[] = [];
  let k = 0;
  for (let j = 0; j < perSide; j++) slots.push({ id: others[k++]!, side: 'left', pos: sidePos(j, true) });
  for (let j = 0; j < top; j++) slots.push({ id: others[k++]!, side: 'top', pos: (j + 1) / (top + 1) });
  for (let j = 0; j < perSide; j++) slots.push({ id: others[k++]!, side: 'right', pos: sidePos(j, false) });
  return slots;
}
