import type { Coord } from './types';

export interface PicturesScoreInput {
  /** Quem tem obra na rodada. */
  artists: readonly string[];
  /** Quem joga a rodada (palpita). */
  guessers: readonly string[];
  secrets: Readonly<Record<string, Coord>>;
  /** palpiteiro → artista → coordenada */
  guesses: Readonly<Record<string, Readonly<Record<string, Coord>>>>;
}

export interface PicturesScoreResult {
  gained: Record<string, number>;
  /** artista → quem acertou a obra dele */
  correct: Record<string, string[]>;
}

/** Regra do original: +1 por acerto; o artista ganha +1 por cada pessoa que acertou a obra dele. */
export function scorePicturesRound({ artists, guessers, secrets, guesses }: PicturesScoreInput): PicturesScoreResult {
  const gained: Record<string, number> = Object.fromEntries([...artists, ...guessers].map((p) => [p, 0]));
  const correct: Record<string, string[]> = {};
  for (const artist of artists) {
    const secret = Object.hasOwn(secrets, artist) ? secrets[artist] : undefined;
    const right =
      secret === undefined
        ? []
        : guessers.filter(
            (g) => g !== artist && Object.hasOwn(guesses, g) && Object.hasOwn(guesses[g]!, artist) && guesses[g]![artist] === secret,
          );
    correct[artist] = right;
    gained[artist] = (gained[artist] ?? 0) + right.length;
    for (const g of right) gained[g] = (gained[g] ?? 0) + 1;
  }
  return { gained, correct };
}
