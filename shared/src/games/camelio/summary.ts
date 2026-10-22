import type { PlayerColor } from '../../players';
import type { CamelioMatchRecord, CamelioPerson } from './record';

/** Uma pessoa na galera: vitórias (dividida conta pra cada um) em quantas partidas. */
export interface CamelioGaleraEntry {
  name: string;
  color: PlayerColor;
  wins: number;
  matches: number;
}

/** Quem tem o título (todos os empatados no máximo, em ordem alfabética) e quantas vezes. */
export interface CamelioTitle {
  holders: CamelioPerson[];
  count: number;
}

/** Estatísticas da galera (só na primeira página do histórico). */
export interface CamelioStats {
  galera: CamelioGaleraEntry[];
  /** Mais vitórias. */
  domador: CamelioTitle | null;
  /** Mais estouros ou pontos perdidos causados nos outros (`by != to`, `bust`/`lost`). */
  sabotador: CamelioTitle | null;
  /** Mais estouros ou pontos perdidos na própria mesa (`by == to`, `bust`/`lost`). */
  palhaco: CamelioTitle | null;
  /** Mais vezes deu 5 de bandeja pros outros (`by != to`, `scored`). */
  papaiNoel: CamelioTitle | null;
}

interface Tally {
  name: string;
  color: PlayerColor;
  matches: number;
  wins: number;
  sabotador: number;
  palhaco: number;
  papaiNoel: number;
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'pt-BR');

function title(tallies: readonly Tally[], count: (t: Tally) => number): CamelioTitle | null {
  const max = Math.max(0, ...tallies.map(count));
  if (max === 0) return null;
  const holders = tallies
    .filter((t) => count(t) === max)
    .sort(byName)
    .map((t) => ({ name: t.name, color: t.color }));
  return { holders, count: max };
}

/** A galera e os quatro títulos. Pessoas pelo nome, com a cor da partida mais recente em que apareceram. */
export function summarizeCamelioHistory(matches: readonly CamelioMatchRecord[]): CamelioStats {
  const ordered = [...matches].sort((a, b) => a.playedAt - b.playedAt);
  const tallies = new Map<string, Tally>();
  const tallyOf = (p: CamelioPerson): Tally => {
    const t = tallies.get(p.name) ?? { name: p.name, color: p.color, matches: 0, wins: 0, sabotador: 0, palhaco: 0, papaiNoel: 0 };
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
    for (const w of new Set(m.winners)) {
      const who = m.players[w];
      if (who) tallyOf(who).wins++;
    }
    for (const x of m.plays) {
      const who = m.players[x.by];
      if (!who) continue;
      const bad = x.outcome === 'bust' || x.outcome === 'lost';
      if (x.by !== x.to && bad) tallyOf(who).sabotador++;
      else if (x.by === x.to && bad) tallyOf(who).palhaco++;
      else if (x.by !== x.to && x.outcome === 'scored') tallyOf(who).papaiNoel++;
    }
  }
  const all = [...tallies.values()];
  return {
    galera: all
      .map((t) => ({ name: t.name, color: t.color, wins: t.wins, matches: t.matches }))
      .sort((a, b) => b.wins - a.wins || a.matches - b.matches || byName(a, b)),
    domador: title(all, (t) => t.wins),
    sabotador: title(all, (t) => t.sabotador),
    palhaco: title(all, (t) => t.palhaco),
    papaiNoel: title(all, (t) => t.papaiNoel),
  };
}
