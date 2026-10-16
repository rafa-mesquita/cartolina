/** Cartas do baralho. Provisório: 84 (como a caixa); o script da arte atualiza este número. */
export const DIXIT_DECK_SIZE = 84;

/** Ids estáveis das cartas: d001, d002, … (a arte fica em web/public/dixit/cards/<id>.webp). */
export function dixitCardIds(size: number = DIXIT_DECK_SIZE): string[] {
  return Array.from({ length: size }, (_, i) => `d${String(i + 1).padStart(3, '0')}`);
}
