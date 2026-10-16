import { dixitPicksPerPlayer, type DixitView, type Rng } from '@cartolina/shared';

/** Carta virada na mesa na fase de escolha: chave `${jogador}:${k}`. */
export interface LooseKey {
  key: string;
  player: string;
}

const keysOf = (player: string, n: number): LooseKey[] => Array.from({ length: n }, (_, k) => ({ key: `${player}:${k}`, player }));

/**
 * Cartas viradas que já estão na mesa na fase de escolha: a do narrador, as de quem confirmou e as suas
 * que esperam a 2ª (`pending`, partida de 3). Na ordem de `inRound`.
 */
export function playedKeys(g: Pick<DixitView, 'inRound' | 'storyteller' | 'confirmed'>, you: string | null, pending: number): LooseKey[] {
  const per = dixitPicksPerPlayer(g.inRound.length);
  return g.inRound.flatMap((p) => keysOf(p, p === g.storyteller ? 1 : g.confirmed.includes(p) ? per : p === you ? pending : 0));
}

/** Todas as cartas da rodada, como se todo mundo tivesse jogado (pra completar a mesa ao fechar a escolha). */
export function allKeys(g: Pick<DixitView, 'inRound' | 'storyteller'>): LooseKey[] {
  const per = dixitPicksPerPlayer(g.inRound.length);
  return g.inRound.flatMap((p) => keysOf(p, p === g.storyteller ? 1 : per));
}

/**
 * Qual carta solta vira qual carta da votação (carta → chave da solta; a mesa já vem sorteada do servidor).
 * As suas vão pras casas das suas cartas (você sabe onde as soltou); as dos outros, sorteadas entre as que sobram.
 */
export function assignLoose(keys: readonly string[], table: readonly { cardId: string; mine: boolean }[], you: string | null, rng: Rng): Map<string, string> {
  const isMine = (k: string) => you !== null && k.startsWith(`${you}:`);
  const mineKeys = keys.filter(isMine);
  const mineCards = table.filter((t) => t.mine);
  // Se as contas não batem (não devia), sorteia tudo junto.
  const matched = mineKeys.length === mineCards.length;
  const pool = matched ? keys.filter((k) => !isMine(k)) : [...keys];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const out = new Map<string, string>();
  if (matched) mineCards.forEach((t, i) => out.set(t.cardId, mineKeys[i]!));
  let r = 0;
  for (const t of table) {
    if (out.has(t.cardId)) continue;
    const k = pool[r++];
    if (k === undefined) break;
    out.set(t.cardId, k);
  }
  return out;
}
