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
export const ptsWord = (n: number): string => (n === 1 ? 'pt' : 'pts');
export const pts = (n: number): string => `${n} ${ptsWord(n)}`;

/** Um leve giro por jogador (álbum colado à mão), sempre o mesmo pelo assento: o do cartão e o da fitinha. */
const TILTS = [-0.7, 0.5, -0.3, 0.8, -0.5, 0.3];
const TAPE_ROTS = [-7, -4, -9, -5, -8, -3];
const nth = (players: readonly string[], p: string) => Math.max(0, players.indexOf(p));
export const tiltOf = (players: readonly string[], p: string): number => TILTS[nth(players, p) % TILTS.length]!;
export const tapeRotOf = (players: readonly string[], p: string): number => TAPE_ROTS[nth(players, p) % TAPE_ROTS.length]!;

/** "Ana", "Ana e Bia", "Ana, Bia e Caio". */
export function listNames(ids: readonly string[], name: (id: string) => string): string {
  const ns = ids.map(name);
  return ns.length <= 1 ? ns.join('') : `${ns.slice(0, -1).join(', ')} e ${ns[ns.length - 1]}`;
}
