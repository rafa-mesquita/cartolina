import type { PlayerColor } from '../../players';
import type { DixitPerson, DixitRoundRecord } from './record';
import type { DixitTarget } from './types';

// Pontos de partida (spec §3): ajuste aqui.
export const DIXIT_TOP_PEOPLE = 3;
export const DIXIT_FINDER_MIN_VOTES = 5;
export const DIXIT_FOOLER_MIN_ROUNDS = 5;
export const DIXIT_TELLER_MIN_TELLS = 3;
export const DIXIT_TOP_CARDS = 5;
export const DIXIT_CLUE_WALL_SIZE = 12;
export const DIXIT_IMPOSSIBLE_SIZE = 8;

/** Uma linha da partida aberta. */
export interface DixitMatchRound {
  id: string;
  round: number;
  playedAt: number;
  storyteller: DixitPerson;
  storyCard: string;
  clue: string;
}

export interface DixitMatchScore {
  name: string;
  color: PlayerColor;
  score: number;
}

/** Partida: as rodadas com o mesmo `matchId`. */
export interface DixitMatch {
  id: string;
  roomCode: string;
  /** Hora da 1ª rodada. */
  startedAt: number;
  target: DixitTarget;
  /** Alguém chegou na meta na última rodada. */
  finished: boolean;
  /** Maior placar das terminadas (empate: mais de um); vazio se não terminou. */
  winners: DixitPerson[];
  /** Placar da última rodada, do maior pro menor. */
  scores: DixitMatchScore[];
  /** Em ordem cronológica. */
  rounds: DixitMatchRound[];
}

export interface DixitWinsEntry {
  name: string;
  color: PlayerColor;
  wins: number;
}

/**
 * `rate` = `hits` ÷ `total`. Em "quem mais acha" e "melhor narrador" fica entre 0 e 1 (é uma fração).
 * Em "quem mais engana" é votos por rodada e pode passar de 1 (duas cartas na mesa, vários votos): não é porcentagem.
 */
export interface DixitRateEntry {
  name: string;
  color: PlayerColor;
  hits: number;
  total: number;
  rate: number;
}

export interface DixitCardCount {
  card: string;
  count: number;
}

export interface DixitClueEntry {
  roundId: string;
  card: string;
  clue: string;
  storyteller: DixitPerson;
  playedAt: number;
}

export interface DixitHistoryStats {
  /** Quem mais venceu (top 3). */
  mostWins: DixitWinsEntry[];
  /** Quem mais acha: votos na carta do narrador ÷ votos dados (mín. 5 votos). */
  bestFinders: DixitRateEntry[];
  /** Quem mais engana: votos na própria carta ÷ rodadas em que jogou sem narrar (mín. 5 rodadas); `rate` pode passar de 1. */
  bestFoolers: DixitRateEntry[];
  /** Melhor narrador: narrações em que alguns acharam, mas não todos ÷ narrações (mín. 3). */
  bestTellers: DixitRateEntry[];
  /** Mais escolhidas como carta do narrador (top 5). */
  favoriteCards: DixitCardCount[];
  /** Mais votadas sem ser a do narrador (top 5). */
  trickiestCards: DixitCardCount[];
  /** As 12 dicas escritas mais recentes. */
  clueWall: DixitClueEntry[];
  /** As 8 cartas do narrador mais recentes que ninguém achou (com pelo menos 1 voto). */
  impossibleCards: DixitClueEntry[];
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'pt-BR');
/** Comparação de texto igual à do SQLite (por código), pra ordem bater com o banco. */
const byCode = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const byTime = (a: DixitRoundRecord, b: DixitRoundRecord) => a.playedAt - b.playedAt || byCode(a.id, b.id);

/** `rounds`: as rodadas de uma partida, em ordem, pelo menos uma. */
function toMatch(rounds: readonly DixitRoundRecord[]): DixitMatch {
  const first = rounds[0]!;
  const last = rounds[rounds.length - 1]!;
  const scores = last.scores.map(({ name, color, score }) => ({ name, color, score })).sort((a, b) => b.score - a.score || byName(a, b));
  const top = scores[0]?.score ?? 0;
  const finished = scores.length > 0 && top >= last.target;
  return {
    id: first.matchId,
    roomCode: first.roomCode,
    startedAt: first.playedAt,
    target: last.target,
    finished,
    winners: finished ? scores.filter((s) => s.score === top).map(({ name, color }) => ({ name, color })) : [],
    scores,
    rounds: rounds.map((r) => ({ id: r.id, round: r.round, playedAt: r.playedAt, storyteller: r.storyteller, storyCard: r.storyCard, clue: r.clue })),
  };
}

/** Junta as rodadas por partida; a mais recente (pela 1ª rodada) primeiro, como o SQL da paginação. */
export function dixitMatches(rounds: readonly DixitRoundRecord[]): DixitMatch[] {
  const groups = new Map<string, DixitRoundRecord[]>();
  for (const r of [...rounds].sort(byTime)) {
    const group = groups.get(r.matchId);
    if (group) group.push(r);
    else groups.set(r.matchId, [r]);
  }
  return [...groups.values()].map(toMatch).sort((a, b) => b.startedAt - a.startedAt || byCode(b.id, a.id));
}

interface Tally {
  name: string;
  color: PlayerColor;
  hits: number;
  total: number;
}

function tally(map: Map<string, Tally>, p: DixitPerson, hits: number): void {
  const t = map.get(p.name) ?? { name: p.name, color: p.color, hits: 0, total: 0 };
  t.hits += hits;
  t.total += 1;
  map.set(p.name, t);
}

function ranking(map: Map<string, Tally>, min: number, colors: Map<string, PlayerColor>): DixitRateEntry[] {
  return [...map.values()]
    .filter((t) => t.total >= min)
    .map((t) => ({ name: t.name, color: colors.get(t.name) ?? t.color, hits: t.hits, total: t.total, rate: t.hits / t.total }))
    .sort((a, b) => b.rate - a.rate || b.total - a.total || byName(a, b))
    .slice(0, DIXIT_TOP_PEOPLE);
}

function topCards(counts: Map<string, number>): DixitCardCount[] {
  return [...counts.entries()]
    .map(([card, count]) => ({ card, count }))
    .sort((a, b) => b.count - a.count || byCode(a.card, b.card))
    .slice(0, DIXIT_TOP_CARDS);
}

const bump = (counts: Map<string, number>, card: string) => counts.set(card, (counts.get(card) ?? 0) + 1);

const clueEntry = (r: DixitRoundRecord): DixitClueEntry => ({
  roundId: r.id,
  card: r.storyCard,
  clue: r.clue,
  storyteller: r.storyteller,
  playedAt: r.playedAt,
});

/** As `n` rodadas mais recentes de `ordered` (cronológica) que passam em `pred`, da mais recente pra mais antiga. */
const latest = (ordered: readonly DixitRoundRecord[], pred: (r: DixitRoundRecord) => boolean, n: number): DixitClueEntry[] =>
  ordered.filter(pred).slice(-n).reverse().map(clueEntry);

/** Estatísticas da galera e cartas famosas. Pessoas são identificadas pelo nome, com o personagem mais recente. */
export function summarizeDixitHistory(rounds: readonly DixitRoundRecord[]): DixitHistoryStats {
  const ordered = [...rounds].sort(byTime);
  // Cor mais recente de qualquer aparição do nome (carta, voto, narração ou só no placar).
  const colors = new Map<string, PlayerColor>();
  const finders = new Map<string, Tally>();
  const foolers = new Map<string, Tally>();
  const tellers = new Map<string, Tally>();
  const favorites = new Map<string, number>();
  const tricky = new Map<string, number>();
  for (const r of ordered) {
    for (const p of [r.storyteller, ...r.cards.map((c) => c.owner), ...r.votes.map((v) => v.voter), ...r.scores]) colors.set(p.name, p.color);
    const found = r.votes.filter((v) => v.card === r.storyCard).length;
    tally(tellers, r.storyteller, r.votes.length > 0 && found > 0 && found < r.votes.length ? 1 : 0);
    bump(favorites, r.storyCard);
    for (const v of r.votes) {
      tally(finders, v.voter, v.card === r.storyCard ? 1 : 0);
      if (v.card !== r.storyCard) bump(tricky, v.card);
    }
    // Quem teve carta na mesa sem ser a do narrador: uma rodada, com os votos que as cartas dele receberam.
    const owners = new Map<string, DixitPerson>();
    for (const c of r.cards) if (c.card !== r.storyCard) owners.set(c.owner.name, c.owner);
    for (const owner of owners.values()) {
      const mine = new Set(r.cards.filter((c) => c.card !== r.storyCard && c.owner.name === owner.name).map((c) => c.card));
      tally(foolers, owner, r.votes.filter((v) => mine.has(v.card)).length);
    }
  }
  const wins = new Map<string, DixitWinsEntry>();
  for (const m of dixitMatches(ordered)) {
    for (const w of m.winners) {
      const e = wins.get(w.name) ?? { name: w.name, color: w.color, wins: 0 };
      e.wins++;
      wins.set(w.name, e);
    }
  }
  return {
    mostWins: [...wins.values()]
      .map((e) => ({ ...e, color: colors.get(e.name) ?? e.color }))
      .sort((a, b) => b.wins - a.wins || byName(a, b))
      .slice(0, DIXIT_TOP_PEOPLE),
    bestFinders: ranking(finders, DIXIT_FINDER_MIN_VOTES, colors),
    bestFoolers: ranking(foolers, DIXIT_FOOLER_MIN_ROUNDS, colors),
    bestTellers: ranking(tellers, DIXIT_TELLER_MIN_TELLS, colors),
    favoriteCards: topCards(favorites),
    trickiestCards: topCards(tricky),
    clueWall: latest(ordered, (r) => r.clue.trim() !== '', DIXIT_CLUE_WALL_SIZE),
    impossibleCards: latest(ordered, (r) => r.votes.length > 0 && r.votes.every((v) => v.card !== r.storyCard), DIXIT_IMPOSSIBLE_SIZE),
  };
}
