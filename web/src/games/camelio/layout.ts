/** Geometria da mesa do Cama-Leão (porta de `seatFit`/`stackLayout`/`renderSeats` do protótipo). */

/** Largura de um assento dos outros, em px do palco. */
export const SEAT_W = 230;
/** Largura das cartas na sua mesa. */
export const MINE_W = 64;
/** Espaço das pilhas num assento: 230 − bordas (2 × 1,5) − padding (2 × 10). */
export const SEAT_INNER = SEAT_W - 3 - 20;

/** Carta (`w`), espaço entre pilhas (`gap`) e padding lateral somado de cada pilha (`pad`). */
export interface StackLayout {
  w: number;
  gap: number;
  pad: number;
}

/**
 * Maior carta (de 46 até 30) que deixa `n` pilhas lado a lado dentro do assento.
 * Primeiro com o espaçamento normal (gap 6, 4px de cada lado da pilha); se não der 30, aperta (gap 3, 1px).
 */
export function seatFit(n: number): StackLayout {
  for (const [gap, pad] of [
    [6, 8],
    [3, 2],
  ] as const) {
    const w = Math.min(46, Math.floor((SEAT_INNER - (n - 1) * gap) / n - pad));
    if (w >= 30) return { w, gap, pad };
  }
  return { w: 30, gap: 3, pad: 2 }; // não acontece com 6 cores (dá 30 exato)
}

/** Como ficam as pilhas de uma mesa com `n` cores: a sua (`mine`) tem tamanho fixo; os assentos se ajustam. */
export const stackLayout = (mine: boolean, n: number): StackLayout => (mine ? { w: MINE_W, gap: 14, pad: 8 } : seatFit(n));

/**
 * Os outros `count` assentos num arco na largura `width` do palco (os das pontas um pouco mais baixos).
 * Devolve o canto de cima-esquerda de cada assento (já arredondado), na ordem dos assentos.
 */
export function seatSlots(count: number, width: number): { x: number; y: number }[] {
  return Array.from({ length: count }, (_, i) => {
    const t = (i + 1) / (count + 1);
    const x = width * t;
    const y = 20 + 40 * (1 - Math.sin(Math.PI * t));
    return { x: Math.round(x - SEAT_W / 2), y: Math.round(y) };
  });
}
