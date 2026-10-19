import { CAMELIO_COLORS, type CamelioBack, type CamelioCard, type CamelioColor } from './types';

const NORMAL_SPHERES = [1, 1, 2, 2, 3, 4] as const;
const MULTI_SPHERES = [1, 2] as const;

/**
 * Distribuição inventada (a oficial do Camelio não foi achada; spec §2.1): 6 cores,
 * 36 normais + 24 bicolores + 12 multicoloridas. A ordem é fixa: o id é a posição.
 */
function buildDeck(): CamelioCard[] {
  const cards: CamelioCard[] = [];
  const add = (card: Omit<CamelioCard, 'id'>) => cards.push({ id: cards.length, ...card });
  for (const color of CAMELIO_COLORS) {
    for (const spheres of NORMAL_SPHERES) add({ kind: 'normal', color, spheres, pair: null });
  }
  CAMELIO_COLORS.forEach((a, i) => {
    const b: CamelioColor = CAMELIO_COLORS[(i + 1) % CAMELIO_COLORS.length]!;
    const faces: [CamelioColor, number][] = [
      [a, 1],
      [a, 2],
      [b, 2],
      [b, 3],
    ];
    for (const [color, spheres] of faces) add({ kind: 'bicolor', color, spheres, pair: [a, b] });
  });
  for (const color of CAMELIO_COLORS) {
    for (const spheres of MULTI_SPHERES) add({ kind: 'multi', color, spheres, pair: null });
  }
  return cards;
}

export const CAMELIO_DECK: readonly CamelioCard[] = buildDeck();
export const CAMELIO_DECK_SIZE = CAMELIO_DECK.length;

export function camelioCard(id: number): CamelioCard {
  const card = CAMELIO_DECK[id];
  if (!card) throw new Error(`carta do Cama-Leão desconhecida: ${id}`);
  return card;
}

export const camelioCardIds = (): number[] => CAMELIO_DECK.map((c) => c.id);

/** O que aparece com a carta virada pra baixo. */
export function camelioBack(card: CamelioCard): CamelioBack {
  switch (card.kind) {
    case 'normal':
      return { kind: 'normal', color: card.color };
    case 'bicolor':
      return { kind: 'bicolor', spheres: card.spheres, colors: [...card.pair!] };
    case 'multi':
      return { kind: 'multi', spheres: card.spheres };
  }
}
