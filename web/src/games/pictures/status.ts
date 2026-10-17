import type { KitId, PicturesView, SeatView } from '@cartolina/shared';

export const KIT_NAMES: Record<KitId, string> = {
  cubes: 'cubos coloridos', laces: 'cadarços', sticks: 'palitos e pedras',
  blocks: 'blocos', icons: 'símbolos', dots: 'pontos e linhas',
};

/** Rótulo do selinho de cada jogador, só a partir da visão. */
export function seatLabel(game: PicturesView, seat: SeatView): string {
  if (!seat.connected) return 'saiu';
  if (!game.inRound.includes(seat.id)) return 'esperando';
  if (game.phase === 'building') return game.ready.includes(seat.id) ? 'pronto ✓' : 'montando…';
  if (game.phase === 'guessing') return game.confirmed.includes(seat.id) ? 'confirmou ✓' : 'palpitando…';
  return '';
}

/** "1 pt" / "3 pts". */
export const pts = (n: number): string => `${n} ${n === 1 ? 'pt' : 'pts'}`;
