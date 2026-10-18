import { KITS, type KitId } from './works';

export function kitFor(seat: number, round: number): KitId {
  return KITS[(seat + round) % KITS.length]!;
}

/** Kit de cada um que joga a rodada; o assento é a posição em `players` (fixa na partida). */
export function kitsForRound(players: readonly string[], inRound: readonly string[], round: number): Record<string, KitId> {
  return Object.fromEntries(
    players.flatMap((p, seat) => (inRound.includes(p) ? [[p, kitFor(seat, round)] as const] : [])),
  );
}
