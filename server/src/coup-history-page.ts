import type { CoupHistoryResponse } from '@cartolina/shared';
import { listCoupMatches } from './coup-history-db';
import { HISTORY_PAGE_SIZE } from './history-db';

/** Uma página do histórico do Cúpi: 20 partidas, da mais nova pra mais velha. */
export async function coupHistoryPage(db: D1Database, before: number | null): Promise<CoupHistoryResponse> {
  // Uma a mais que a página só para saber se existe próxima.
  const rows = await listCoupMatches(db, before, HISTORY_PAGE_SIZE + 1);
  const matches = rows.slice(0, HISTORY_PAGE_SIZE);
  return {
    game: 'coup',
    matches,
    stats: null,
    nextBefore: rows.length > HISTORY_PAGE_SIZE ? matches[matches.length - 1]!.playedAt : null,
  };
}
