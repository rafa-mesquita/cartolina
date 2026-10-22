import type { CamelioMatchRecord, CamelioRecordPlay } from '@cartolina/shared';

/** "Ana", "Ana e Beto", "Ana, Beto e Caio". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

export const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** "Ana venceu" ou "Ana e Beto dividiram a vitória". */
export function winnersText(m: CamelioMatchRecord): string {
  const names = m.winners.map((i) => m.players[i]?.name ?? '?');
  return names.length > 1 ? `${joinNames(names)} dividiram a vitória` : `${names[0] ?? 'ninguém'} venceu`;
}

/** "chegou a 3 cores" ou "o monte acabou". */
export function reasonText(m: CamelioMatchRecord): string {
  return m.endReason === 'target' ? `chegou a ${m.target} cores` : 'o monte acabou';
}

/** Só os lances que importam: fechou, estourou, perdeu o ponto. */
export const keyPlays = (m: CamelioMatchRecord): { n: number; play: CamelioRecordPlay }[] =>
  m.plays.flatMap((play, i) => (play.outcome === 'none' ? [] : [{ n: i + 1, play }]));

/** O que aconteceu, do ponto de vista de quem recebeu: "Beto fechou o vermelho", "Caio estourou o azul (7)". */
export function outcomeText(m: CamelioMatchRecord, play: CamelioRecordPlay): string {
  const to = m.players[play.to]?.name ?? '?';
  const color = play.card.color;
  if (play.outcome === 'scored') return `${to} fechou o ${color}`;
  if (play.outcome === 'bust') return `${to} estourou o ${color} (${play.sum})`;
  return `${to} perdeu o ponto do ${color} (${play.sum})`;
}

/** Quem deu pra quem: "Ana deu pra Beto" ou "Ana ficou com a carta". */
export function givenText(m: CamelioMatchRecord, play: CamelioRecordPlay): string {
  const by = m.players[play.by]?.name ?? '?';
  if (play.by === play.to) return `${by} ficou com a carta`;
  return `${by} deu pra ${m.players[play.to]?.name ?? '?'}`;
}
