import { dixitPicksPerPlayer, shuffle, type DixitView, type Rng } from '@cartolina/shared';

/**
 * Carta virada na mesa na fase de escolha. As suas têm a chave `${você}:${cardId}` (você sabe quais são);
 * as dos outros, `${jogador}:${k}` (só se sabe quantas são).
 */
export interface LooseKey {
  key: string;
  player: string;
  /** Só nas suas. */
  cardId?: string;
}

const ownKeys = (you: string, ids: readonly string[]): LooseKey[] => ids.map((cardId) => ({ key: `${you}:${cardId}`, player: you, cardId }));
const countKeys = (player: string, n: number): LooseKey[] => Array.from({ length: n }, (_, k) => ({ key: `${player}:${k}`, player }));

/**
 * Cartas viradas que já estão na mesa na fase de escolha: a do narrador, as de quem confirmou e as suas
 * que esperam a 2ª (`pending`, partida de 3). Na ordem de `inRound`.
 */
export function playedKeys(
  g: Pick<DixitView, 'inRound' | 'storyteller' | 'confirmed' | 'storyCard' | 'myPicks'>,
  you: string | null,
  pending: readonly string[],
): LooseKey[] {
  const per = dixitPicksPerPlayer(g.inRound.length);
  return g.inRound.flatMap((p) => {
    const teller = p === g.storyteller;
    if (p === you) return ownKeys(p, teller ? (g.storyCard ? [g.storyCard] : []) : g.confirmed.includes(p) ? g.myPicks : pending);
    return countKeys(p, teller ? 1 : g.confirmed.includes(p) ? per : 0);
  });
}

/** Todas as cartas da rodada já na votação (pra completar a mesa ao fechar a escolha): as suas pelas cartas da mesa. */
export function roundKeys(g: Pick<DixitView, 'inRound' | 'storyteller' | 'table'>, you: string | null): LooseKey[] {
  const per = dixitPicksPerPlayer(g.inRound.length);
  return g.inRound.flatMap((p) =>
    p === you
      ? ownKeys(
          p,
          g.table.filter((t) => t.mine).map((t) => t.cardId),
        )
      : countKeys(p, p === g.storyteller ? 1 : per),
  );
}

/**
 * Qual carta solta vira qual carta da votação (carta → chave da solta; a mesa já vem sorteada do servidor).
 * As suas vão pras casas das suas cartas, pelo id; as dos outros, sorteadas entre as que sobram.
 */
export function assignLoose(keys: readonly string[], table: readonly { cardId: string; mine: boolean }[], you: string | null, rng: Rng): Map<string, string> {
  const out = new Map<string, string>();
  const pool: string[] = [];
  for (const k of keys) {
    const cardId = you !== null && k.startsWith(`${you}:`) ? k.slice(you.length + 1) : null;
    if (cardId !== null && table.some((t) => t.cardId === cardId && t.mine) && !out.has(cardId)) out.set(cardId, k);
    else pool.push(k);
  }
  const others = shuffle(rng, pool);
  let r = 0;
  for (const t of table) {
    if (out.has(t.cardId)) continue;
    const k = others[r++];
    if (k === undefined) break;
    out.set(t.cardId, k);
  }
  return out;
}
