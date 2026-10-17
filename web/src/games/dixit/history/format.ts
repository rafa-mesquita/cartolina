import type { DixitMatch } from '@cartolina/shared';

const dateFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
export const formatDate = (ms: number): string => dateFmt.format(new Date(ms));

/** "Ana", "Ana e Bia", "Ana, Bia e Caio". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

export function matchOutcome(m: Pick<DixitMatch, 'finished' | 'winners'>): string {
  if (!m.finished || m.winners.length === 0) return 'não terminou';
  const names = joinNames(m.winners.map((w) => w.name));
  return m.winners.length === 1 ? `${names} venceu` : `${names} venceram`;
}

export const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export function matchMeta(m: { target: number; rounds: readonly unknown[] }): string {
  return `meta ${m.target} · ${plural(m.rounds.length, 'rodada', 'rodadas')}`;
}

export const percent = (rate: number): string => `${Math.round(rate * 100)}%`;

/** Dica entre aspas; vazia é a dica falada na call. */
export const clueText = (clue: string): string => (clue.trim() ? `“${clue}”` : 'falada na call');
