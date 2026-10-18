export const PLAYER_COLORS = [
  '#8EC5FF',
  '#FF8FAB',
  '#7EDDB5',
  '#C7B3FF',
  '#FFD07A',
  '#FFB38A',
  '#9EE6F0',
  '#E6B8E0',
  '#C9E27A',
  '#D9C2A0',
  '#F4877A',
  '#B59A7A',
  '#9C9CF0',
  '#ECE8E2',
  '#9FB5CC',
  '#F9E36B',
  '#A97AB0',
  '#A7A9AE',
] as const;

export type PlayerColor = (typeof PLAYER_COLORS)[number];

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;
export const NAME_MAX = 16;
export const CLUE_MAX = 40;

export function isPlayerColor(value: unknown): value is PlayerColor {
  return typeof value === 'string' && (PLAYER_COLORS as readonly string[]).includes(value);
}

/** Bots do modo teste se chamam `Bot <nome>` (`web/src/dev/bots.ts`); rodada com bot não entra no histórico. */
export function isBotName(name: string): boolean {
  return name.startsWith('Bot ');
}

export function cleanName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, ' ');
  const length = Array.from(name).length;
  return length >= 1 && length <= NAME_MAX ? name : null;
}

/** Mantém espaço no fim para não atrapalhar quem está digitando. */
export function cleanClue(raw: string): string {
  return Array.from(raw.replace(/\s+/g, ' ').trimStart()).slice(0, CLUE_MAX).join('');
}
