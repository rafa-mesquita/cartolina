import type { PlayerColor } from '../../players';
import type { KittensMatchRecord, KittensPerson } from './record';

/** Quantos aparecem em cada quadro da galera. */
export const KITTENS_TOP_PEOPLE = 3;
/** Mínimo de partidas jogadas pra entrar num quadro. */
export const KITTENS_STATS_MIN_MATCHES = 3;
/** Mínimo de partidas pra entrar no quadro da % de vitórias (pedido do Rafa, 2026-10-28). */
export const KITTENS_RATE_MIN_MATCHES = 10;

/** Uma pessoa num quadro: `count` no total de `matches` partidas jogadas; `rate` = `count` ÷ `matches`. */
export interface KittensStatEntry {
  name: string;
  color: PlayerColor;
  count: number;
  matches: number;
  rate: number;
}

/** Estatísticas da galera (só na primeira página do histórico). */
export interface KittensStats {
  /** Maior % de vitórias (só com `KITTENS_RATE_MIN_MATCHES` partidas ou mais): `count` = vitórias; ordem pela % (`rate`). */
  bestRate: KittensStatEntry[];
  /** Mais vitórias no geral: `count` = vitórias; ordem pelo número de vitórias. */
  mostWins: KittensStatEntry[];
  /** Quem explode primeiro: `count` = vezes que foi o 1º a sair (explodiu ou caiu); ordem pelo número de vezes. */
  firstOut: KittensStatEntry[];
  /** Rei do Nem vem!: `count` = Nem vem! dados no total; ordem pela média por partida (`rate`). */
  nopeKings: KittensStatEntry[];
}

interface Tally {
  name: string;
  color: PlayerColor;
  matches: number;
  wins: number;
  first: number;
  nopes: number;
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'pt-BR');

/**
 * Top 3 de quem tem pelo menos `min` partidas e `count` > 0 (ninguém aparece com zero). Desempate:
 * `primary`, depois a outra medida (`rate` ↔ `count`, maior primeiro), depois o nome (ordem alfabética).
 */
function board(
  tallies: readonly Tally[],
  count: (t: Tally) => number,
  primary: 'rate' | 'count',
  min = KITTENS_STATS_MIN_MATCHES,
): KittensStatEntry[] {
  const second = primary === 'rate' ? 'count' : 'rate';
  return tallies
    .filter((t) => t.matches >= min && count(t) > 0)
    .map((t) => ({ name: t.name, color: t.color, count: count(t), matches: t.matches, rate: count(t) / t.matches }))
    .sort((a, b) => b[primary] - a[primary] || b[second] - a[second] || byName(a, b))
    .slice(0, KITTENS_TOP_PEOPLE);
}

/**
 * As estatísticas da galera. Pessoas são identificadas pelo nome (como no Diquisti), com o bichinho da partida mais
 * recente em que apareceram.
 */
export function summarizeKittensHistory(matches: readonly KittensMatchRecord[]): KittensStats {
  const ordered = [...matches].sort((a, b) => a.playedAt - b.playedAt);
  const tallies = new Map<string, Tally>();
  const tallyOf = (p: KittensPerson): Tally => {
    const t = tallies.get(p.name) ?? { name: p.name, color: p.color, matches: 0, wins: 0, first: 0, nopes: 0 };
    t.color = p.color;
    tallies.set(p.name, t);
    return t;
  };
  for (const m of ordered) {
    // Mesmo nome duas vezes na partida (não deveria acontecer): conta uma partida só.
    const seen = new Set<string>();
    for (const p of m.players) {
      const t = tallyOf(p);
      if (!seen.has(p.name)) t.matches++;
      seen.add(p.name);
    }
    tallyOf(m.winner).wins++;
    const first = m.exits[0];
    if (first) tallyOf(first.who).first++;
    for (const x of m.perPlayer) tallyOf(x.who).nopes += x.nopes;
  }
  const all = [...tallies.values()];
  return {
    bestRate: board(all, (t) => t.wins, 'rate', KITTENS_RATE_MIN_MATCHES),
    mostWins: board(all, (t) => t.wins, 'count', 1),
    firstOut: board(all, (t) => t.first, 'count'),
    nopeKings: board(all, (t) => t.nopes, 'rate'),
  };
}
