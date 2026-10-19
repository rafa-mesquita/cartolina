import { shuffle, type Rng } from '../../rng';
import { kittensCardId, type KittensCardKind } from './cards';

/** Um pacote: tudo menos Tatubum e Cafuné, nas quantidades do jogo original. */
export const KITTENS_PACK: Partial<Record<KittensCardKind, number>> = {
  nemvem: 5,
  ataque: 4,
  pular: 4,
  favor: 4,
  embaralhar: 4,
  espiar: 5,
  capivara: 4,
  mico: 4,
  quati: 4,
  tamandua: 4,
  preguica: 4,
};
export const KITTENS_PACK_SIZE = 46;
/** Cartas do baralho na mão inicial, além do Cafuné de cada um. */
export const KITTENS_HAND_START = 7;
/** Cafunés que vão pro monte além do de cada um (sempre 2: decisão de 2026-10-19). */
export const KITTENS_EXTRA_CAFUNES = 2;

/** Com 8 a mão inicial gasta 56 cartas: a partir de 6 jogadores entram 2 pacotes. */
export function kittensPacksFor(players: number): number {
  return players >= 6 ? 2 : 1;
}

/** As cartas dos pacotes (sem Tatubum e Cafuné), numeradas por tipo. */
export function kittensBaseDeck(players: number): string[] {
  const packs = kittensPacksFor(players);
  const cards: string[] = [];
  for (const [kind, count] of Object.entries(KITTENS_PACK) as [KittensCardKind, number][]) {
    for (let i = 0; i < count * packs; i++) cards.push(kittensCardId(kind, i));
  }
  return cards;
}

export interface KittensDeal {
  hands: Record<string, string[]>;
  /** Monte embaralhado: o topo é o FIM do array. */
  draw: string[];
}

/** Preparação (spec §2): 1 Cafuné + 7 cartas pra cada um; no monte, o resto + 2 Cafunés + (n − 1) Tatubuns. */
export function kittensDeal(rng: Rng, players: readonly string[]): KittensDeal {
  const n = players.length;
  const pool = shuffle(rng, kittensBaseDeck(n));
  // Cafunés embaralhados: se `cafune-i` fosse sempre do assento i, um Cafuné roubado (par/Favor) se denunciaria
  // quando jogado, e só os dois envolvidos podem saber qual carta trocou de mão (spec §4.3).
  const cafunes = shuffle(
    rng,
    Array.from({ length: n + KITTENS_EXTRA_CAFUNES }, (_, i) => kittensCardId('cafune', i)),
  );
  const hands: Record<string, string[]> = {};
  players.forEach((p, i) => {
    hands[p] = [cafunes[i]!, ...pool.slice(i * KITTENS_HAND_START, (i + 1) * KITTENS_HAND_START)];
  });
  const rest = pool.slice(n * KITTENS_HAND_START);
  const extras = cafunes.slice(n);
  const tatus = Array.from({ length: n - 1 }, (_, i) => kittensCardId('tatubum', i));
  return { hands, draw: shuffle(rng, [...rest, ...extras, ...tatus]) };
}
