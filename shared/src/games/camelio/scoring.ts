import { camelioCard } from './deck';
import { CAMELIO_EXACT, type CamelioColor, type CamelioOutcome } from './types';

/** Soma das esferas da cor `color` (pela cor de verdade, frente da carta). */
export function camelioSphereSum(ids: readonly number[], color: CamelioColor): number {
  return ids.reduce((n, id) => {
    const card = camelioCard(id);
    return card.color === color ? n + card.spheres : n;
  }, 0);
}

/** Cores com ponto, na ordem em que aparecem na área de pontos. */
export function camelioScoredColors(scored: readonly number[]): CamelioColor[] {
  return [...new Set(scored.map((id) => camelioCard(id).color))];
}

/** Pontos = cores distintas na área de pontos (no máximo 1 por cor). */
export const camelioPoints = (scored: readonly number[]): number => camelioScoredColors(scored).length;

/** Esferas na área de jogo, sem as cores já pontuadas (desempate no fim do monte). */
export function camelioSpheresInPlay(table: readonly number[], scored: readonly number[]): number {
  const done = camelioScoredColors(scored);
  return table.reduce((n, id) => {
    const card = camelioCard(id);
    return done.includes(card.color) ? n : n + card.spheres;
  }, 0);
}

export interface CamelioPlayResolution {
  table: number[];
  scored: number[];
  /** Cartas que saem da mesa pro descarte. */
  discarded: number[];
  outcome: CamelioOutcome;
  /** Esferas da cor na área de jogo logo depois da carta. */
  sum: number;
}

/**
 * Põe `cardId` na área de jogo e resolve só a cor dela (spec §2.3):
 * cor nova com 5 exato fecha; cor nova acima de 5 estoura; cor já pontuada chegando a 5 ou mais perde o ponto.
 */
export function resolveCamelioPlay(table: readonly number[], scored: readonly number[], cardId: number): CamelioPlayResolution {
  const { color } = camelioCard(cardId);
  const ofColor = (id: number) => camelioCard(id).color === color;
  const next = [...table, cardId];
  const sum = camelioSphereSum(next, color);
  const already = scored.some(ofColor);
  const rest = next.filter((id) => !ofColor(id));
  const same = next.filter(ofColor);
  if (already && sum >= CAMELIO_EXACT) {
    return { table: rest, scored: scored.filter((id) => !ofColor(id)), discarded: [...same, ...scored.filter(ofColor)], outcome: 'lost', sum };
  }
  if (!already && sum === CAMELIO_EXACT) {
    return { table: rest, scored: [...scored, ...same], discarded: [], outcome: 'scored', sum };
  }
  if (!already && sum > CAMELIO_EXACT) {
    return { table: rest, scored: [...scored], discarded: same, outcome: 'bust', sum };
  }
  return { table: next, scored: [...scored], discarded: [], outcome: 'none', sum };
}

/** Fim do monte: mais pontos; empate → mais esferas em jogo; empate → todos os empatados (vitória dividida). */
export function camelioDeckEndWinners(
  players: readonly string[],
  table: Readonly<Record<string, readonly number[]>>,
  scored: Readonly<Record<string, readonly number[]>>,
): string[] {
  const keyOf = (p: string): [number, number] => {
    const s = scored[p] ?? [];
    return [camelioPoints(s), camelioSpheresInPlay(table[p] ?? [], s)];
  };
  let best: string[] = [];
  let top: [number, number] | null = null;
  for (const p of players) {
    const key = keyOf(p);
    if (top === null || key[0] > top[0] || (key[0] === top[0] && key[1] > top[1])) {
      top = key;
      best = [p];
    } else if (key[0] === top[0] && key[1] === top[1]) {
      best.push(p);
    }
  }
  return best;
}

export interface CamelioStanding {
  player: string;
  points: number;
  /** Esferas na área de jogo, sem as cores já pontuadas. */
  spheres: number;
  /** 1 = primeiro; empatados (pontos e esferas) dividem a posição. */
  place: number;
}

/** Placar do fim (spec §2.4): mais pontos, depois mais esferas em jogo; a ordem dos assentos desempata só a exibição. */
export function camelioStandings(
  players: readonly string[],
  table: Readonly<Record<string, readonly number[]>>,
  scored: Readonly<Record<string, readonly number[]>>,
): CamelioStanding[] {
  const rows = players.map((player) => {
    const s = scored[player] ?? [];
    return { player, points: camelioPoints(s), spheres: camelioSpheresInPlay(table[player] ?? [], s), place: 0 };
  });
  rows.sort((a, b) => b.points - a.points || b.spheres - a.spheres);
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    r.place = prev && prev.points === r.points && prev.spheres === r.spheres ? prev.place : i + 1;
  });
  return rows;
}
