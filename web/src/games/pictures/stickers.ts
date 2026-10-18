import { COORDS, type Coord } from '@cartolina/shared';

/** Quanto o ponteiro anda (px de tela) antes de um clique no adesivo virar arraste. */
export const DRAG_THRESHOLD = 4;

/**
 * Onde um adesivo solto em `el` (o elemento embaixo do ponteiro) vai parar: numa foto da grade → a coordenada dela;
 * em qualquer outro lugar (a moldura da obra, o fundo, fora da grade) → null, que tira o palpite.
 */
export function dropTarget(el: Element | null): Coord | null {
  const photo = el?.closest<HTMLElement>('.pc-grid .pc-photo[data-coord]');
  const c = photo?.dataset.coord;
  return c !== undefined && (COORDS as readonly string[]).includes(c) ? (c as Coord) : null;
}

/** O palpite que um adesivo em `from` solto em `to` manda, ou undefined quando nada muda (soltou onde já estava). */
export function stickerMove(from: Coord | null, to: Coord | null): { coord: Coord | null } | undefined {
  return from === to ? undefined : { coord: to };
}
