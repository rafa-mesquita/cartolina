import type { Activity, ItoCardView, RoomView, SeatView } from '@cartolina/shared';

export type CardPlace = 'hand' | 'row' | 'drag';

export interface HandCard {
  card: ItoCardView;
  place: CardPlace;
}

export type SeatStatus = 'desconectado' | 'assistindo' | 'pronto ✓' | 'escrevendo…' | 'arrastando…' | 'pensando';

export function isHost(view: RoomView): boolean {
  return view.you !== null && view.hostId === view.you;
}

export function isPlaying(view: RoomView): boolean {
  return view.you !== null && view.game.players.includes(view.you);
}

export function cardsOf(view: RoomView, owner: string): ItoCardView[] {
  return Object.values(view.game.cards)
    .filter((c) => c.owner === owner)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Lugar de cada carta minha. `dragging` = carta que EU arrasto (ou voltando pra minha mão).
 * Carta minha carregada por outra pessoa (em `inFlight`, mas não `dragging`) continua "na mesa".
 */
export function handCards(view: RoomView, row: readonly string[], inFlight: ReadonlySet<string>, dragging: string | null): HandCard[] {
  if (!view.you) return [];
  return cardsOf(view, view.you).map((card) => ({
    card,
    place: dragging === card.id ? 'drag' : row.includes(card.id) || inFlight.has(card.id) ? 'row' : 'hand',
  }));
}

/** Uma entrada por carta do dono: `true` = ainda na mão (mostra costas), `false` = slot vazio. */
export function backsOf(view: RoomView, owner: string, row: readonly string[], inFlight: ReadonlySet<string>): boolean[] {
  return cardsOf(view, owner).map((c) => !row.includes(c.id) && !inFlight.has(c.id));
}

export function seatStatus(view: RoomView, seat: SeatView, activity: Activity | undefined): SeatStatus {
  if (!seat.connected) return 'desconectado';
  const { phase, players, ready } = view.game;
  if (phase !== 'lobby' && !players.includes(seat.id)) return 'assistindo';
  if (phase === 'sorting' && ready.includes(seat.id)) return 'pronto ✓';
  if (activity === 'writing') return 'escrevendo…';
  if (activity === 'dragging') return 'arrastando…';
  return 'pensando';
}

export function readyCount(view: RoomView): { ready: number; total: number } {
  const connected = new Set(view.seats.filter((s) => s.connected).map((s) => s.id));
  const players = view.game.players.filter((p) => connected.has(p));
  return { ready: players.filter((p) => view.game.ready.includes(p)).length, total: players.length };
}

export function allMineInRow(view: RoomView, row: readonly string[]): boolean {
  const mine = view.you ? cardsOf(view, view.you) : [];
  return mine.length > 0 && mine.every((c) => row.includes(c.id));
}

export function initialOf(name: string): string {
  return (Array.from(name.trim())[0] ?? '?').toUpperCase();
}
