import type { Coord } from './types';

export interface PicturesScoreInput {
  /** Quem tem obra na rodada. */
  artists: readonly string[];
  /** Quem joga a rodada (palpita). */
  guessers: readonly string[];
  secrets: Record<string, Coord>;
  /** palpiteiro → artista → coordenada */
  guesses: Record<string, Record<string, Coord>>;
}

export interface PicturesScoreResult {
  gained: Record<string, number>;
  /** artista → quem acertou a obra dele */
  correct: Record<string, string[]>;
}

/** Regra do original: +1 por acerto; o artista ganha +1 por cada pessoa que acertou a obra dele. */
export function scorePicturesRound({ artists, guessers, secrets, guesses }: PicturesScoreInput): PicturesScoreResult {
  const gained: Record<string, number> = {};
  for (const p of [...artists, ...guessers]) gained[p] = 0;
  const correct: Record<string, string[]> = {};
  for (const artist of artists) {
    const secret = secrets[artist];
    const right = secret === undefined ? [] : guessers.filter((g) => g !== artist && guesses[g]?.[artist] === secret);
    correct[artist] = right;
    gained[artist] = (gained[artist] ?? 0) + right.length;
    for (const g of right) gained[g] = (gained[g] ?? 0) + 1;
  }
  return { gained, correct };
}
