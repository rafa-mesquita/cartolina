import { summarizeKittensHistory, type KittensHistoryResponse } from '@cartolina/shared';
import { HISTORY_PAGE_SIZE } from './history-db';
import { allKittensMatches, listKittensMatches } from './kittens-history-db';

/** Uma página do histórico do Tatubum: 20 partidas, da mais nova pra mais velha; estatísticas só na primeira. */
export async function kittensHistoryPage(db: D1Database, before: number | null): Promise<KittensHistoryResponse> {
  // Uma a mais que a página só para saber se existe próxima.
  const rows = await listKittensMatches(db, before, HISTORY_PAGE_SIZE + 1);
  const matches = rows.slice(0, HISTORY_PAGE_SIZE);
  return {
    game: 'kittens',
    matches,
    // Lê até STATS_ROUNDS_CAP partidas: caro demais para repetir a cada "carregar mais".
    stats: before === null ? summarizeKittensHistory(await allKittensMatches(db)) : null,
    nextBefore: rows.length > HISTORY_PAGE_SIZE ? matches[matches.length - 1]!.playedAt : null,
  };
}
