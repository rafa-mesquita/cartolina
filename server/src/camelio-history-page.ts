import { summarizeCamelioHistory, type CamelioHistoryResponse } from '@cartolina/shared';
import { allCamelioMatches, listCamelioMatches } from './camelio-history-db';
import { HISTORY_PAGE_SIZE } from './history-db';

/** Uma página do histórico do Cama-Leão: 20 partidas, da mais nova pra mais velha; estatísticas só na primeira. */
export async function camelioHistoryPage(db: D1Database, before: number | null): Promise<CamelioHistoryResponse> {
  // Uma a mais que a página só para saber se existe próxima.
  const rows = await listCamelioMatches(db, before, HISTORY_PAGE_SIZE + 1);
  const matches = rows.slice(0, HISTORY_PAGE_SIZE);
  return {
    game: 'camelio',
    matches,
    // Lê até STATS_ROUNDS_CAP partidas: caro demais para repetir a cada "carregar mais".
    stats: before === null ? summarizeCamelioHistory(await allCamelioMatches(db)) : null,
    nextBefore: rows.length > HISTORY_PAGE_SIZE ? matches[matches.length - 1]!.playedAt : null,
  };
}
