import type { PlayerColor } from '../../players';
import type { KittensMatchRecord, KittensPerson } from './record';

/** Quantos aparecem em cada quadro da galera, fechado. */
export const KITTENS_TOP_PEOPLE = 3;
/** Até quantos cada quadro da galera mostra aberto (pedido do Rafa, 2026-11-12). */
export const KITTENS_BOARD_TOP = 10;
/** Mínimo de partidas (com a contagem de alvo) pra entrar no quadro do alvo preferido (pedido do Rafa, 2026-11-12). */
export const KITTENS_TARGET_MIN_MATCHES = 7;
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
  /** Só no alvo preferido: magias com alvo mandadas nas partidas dele (`rate` = `count` ÷ `total`). */
  total?: number;
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
  /**
   * Alvo preferido (pedidos do Rafa, 2026-11-09 e 2026-11-12): `count` = vezes que foi alvo de magia, `total` = magias
   * com alvo mandadas nas partidas dele, `rate` = a % (`count` ÷ `total`); ordem pela %. Só com
   * `KITTENS_TARGET_MIN_MATCHES` partidas ou mais. `matches` conta só as partidas
   * gravadas com essa estatística (desde 2026-11-09). Resposta de servidor antigo não tem.
   */
  targeted?: KittensStatEntry[];
}

interface Tally {
  name: string;
  color: PlayerColor;
  matches: number;
  wins: number;
  first: number;
  nopes: number;
  targeted: number;
  /** Partidas gravadas com a contagem de alvo (as de antes de 2026-11-09 não têm). */
  targetMatches: number;
  /** Magias com alvo mandadas nessas partidas (em qualquer um). */
  targetPool: number;
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'pt-BR');

/**
 * Top 10 (`KITTENS_BOARD_TOP`; a tela mostra 3 e abre o resto) de quem tem pelo menos `min` partidas e `count` > 0 (ninguém aparece com zero). Desempate:
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
    .slice(0, KITTENS_BOARD_TOP);
}

/**
 * As estatísticas da galera. Pessoas são identificadas pelo nome (como no Diquisti), com o bichinho da partida mais
 * recente em que apareceram.
 */
export function summarizeKittensHistory(matches: readonly KittensMatchRecord[]): KittensStats {
  const ordered = [...matches].sort((a, b) => a.playedAt - b.playedAt);
  const tallies = new Map<string, Tally>();
  const tallyOf = (p: KittensPerson): Tally => {
    const t = tallies.get(p.name) ?? { name: p.name, color: p.color, matches: 0, wins: 0, first: 0, nopes: 0, targeted: 0, targetMatches: 0, targetPool: 0 };
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
    const pool = m.perPlayer.reduce((n, x) => n + (x.targeted ?? 0), 0);
    for (const x of m.perPlayer) {
      const t = tallyOf(x.who);
      t.nopes += x.nopes;
      if (x.targeted !== undefined) {
        t.targeted += x.targeted;
        t.targetMatches++;
        t.targetPool += pool;
      }
    }
  }
  const all = [...tallies.values()];
  return {
    bestRate: board(all, (t) => t.wins, 'rate', KITTENS_RATE_MIN_MATCHES),
    mostWins: board(all, (t) => t.wins, 'count', 1),
    firstOut: board(all, (t) => t.first, 'count'),
    nopeKings: board(all, (t) => t.nopes, 'rate'),
    targeted: all
      .filter((t) => t.targetMatches >= KITTENS_TARGET_MIN_MATCHES && t.targeted > 0)
      .map((t) => ({ name: t.name, color: t.color, count: t.targeted, matches: t.targetMatches, total: t.targetPool, rate: t.targeted / t.targetPool }))
      .sort((a, b) => b.rate - a.rate || b.count - a.count || byName(a, b))
      .slice(0, KITTENS_BOARD_TOP),
  };
}
