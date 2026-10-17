import { dixitMatches, summarizeDixitHistory, type DixitHistoryResponse } from '@cartolina/shared';
import { allDixitRounds, dixitRoundsOfMatches, listDixitMatchIds } from './dixit-history-db';
import { HISTORY_PAGE_SIZE } from './history-db';

/** Uma página do histórico do Diquisti: 20 partidas inteiras; estatísticas e cartas famosas só na primeira. */
export async function dixitHistoryPage(db: D1Database, before: number | null): Promise<DixitHistoryResponse> {
  // Uma a mais que a página só para saber se existe próxima.
  const refs = await listDixitMatchIds(db, before, HISTORY_PAGE_SIZE + 1);
  const page = refs.slice(0, HISTORY_PAGE_SIZE);
  const rounds = await dixitRoundsOfMatches(db, page.map((m) => m.matchId));
  return {
    game: 'dixit',
    matches: dixitMatches(rounds),
    // Lê até STATS_ROUNDS_CAP rodadas: caro demais para repetir a cada "carregar mais".
    stats: before === null ? summarizeDixitHistory(await allDixitRounds(db)) : null,
    nextBefore: refs.length > HISTORY_PAGE_SIZE ? page[page.length - 1]!.startedAt : null,
  };
}
