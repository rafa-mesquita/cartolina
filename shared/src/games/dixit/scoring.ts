export interface ScoreInput {
  storyteller: string;
  storyCard: string;
  /** Quem participou da rodada (todos aparecem no resultado, mesmo com 0). */
  inRound: readonly string[];
  /** carta → dono */
  owners: Readonly<Record<string, string>>;
  /** votante → carta (só votos confirmados) */
  votes: Readonly<Record<string, string>>;
}

export interface ScoreResult {
  gained: Record<string, number>;
  found: string[];
}

/**
 * Regra da caixa. "Todos" e "ninguém" contam só quem votou.
 * - Todos ou ninguém acharam: narrador 0, cada votante 2.
 * - Senão: narrador e quem achou fazem 3.
 * - Bônus: cada não-narrador ganha +1 por voto recebido em carta sua.
 */
export function scoreRound(input: ScoreInput): ScoreResult {
  const gained: Record<string, number> = Object.fromEntries(input.inRound.map((p) => [p, 0]));
  const add = (player: string, points: number) => {
    gained[player] = (gained[player] ?? 0) + points;
  };
  const voters = Object.keys(input.votes);
  const found = voters.filter((v) => input.votes[v] === input.storyCard);
  if (found.length === 0 || found.length === voters.length) {
    for (const v of voters) add(v, 2);
  } else {
    add(input.storyteller, 3);
    for (const v of found) add(v, 3);
  }
  for (const card of Object.values(input.votes)) {
    const owner = input.owners[card];
    if (owner !== undefined && owner !== input.storyteller) add(owner, 1);
  }
  return { gained, found };
}
