import { shuffle, type Rng } from '../../rng';
import { kittensCardId, type KittensCardKind } from './cards';

/** Um pacote: tudo menos Tatubum, Desarme e Tatu Latidor; as cartas do original + as novas de 2026-10-20. */
export const KITTENS_PACK: Partial<Record<KittensCardKind, number>> = {
  nemvem: 5,
  ataque: 4,
  pular: 4,
  favor: 4,
  embaralhar: 4,
  espiar: 5,
  olhado: 2,
  feitico: 2,
  capivara: 4,
  mico: 4,
  quati: 4,
  tamandua: 4,
  preguica: 4,
  // Tucano: pedido do Rafa, 2026-10-21.
  tucano: 4,
  boto: 4,
};
export const KITTENS_PACK_SIZE = 58;
/** Tatu Latidor: sempre 2 na partida, qualquer que seja o número de jogadores (fora dos pacotes). */
export const KITTENS_LATIDOS = 2;
/** Cartas do baralho na mão inicial, além do Cafuné de cada um. */
export const KITTENS_HAND_START = 7;
/**
 * Desarmes (`cafune`) que vão pro monte além do de cada um, como no original: 2 com até 4 jogadores, 1 com 5
 * (pedido do Rafa, 2026-10-21: fiel ao original). De 6 a 8 o original não tem regra: 1, seguindo a tendência.
 */
export function kittensExtraCafunes(players: number): number {
  return players <= 4 ? 2 : 1;
}

/** Com 8 a mão inicial gasta 56 cartas: a partir de 6 jogadores entram 2 pacotes. */
export function kittensPacksFor(players: number): number {
  return players >= 6 ? 2 : 1;
}

/** As cartas dos pacotes mais os 2 Tatus Latidores (sem Tatubum e Cafuné), numeradas por tipo. */
export function kittensBaseDeck(players: number): string[] {
  const packs = kittensPacksFor(players);
  const cards: string[] = [];
  for (const [kind, count] of Object.entries(KITTENS_PACK) as [KittensCardKind, number][]) {
    for (let i = 0; i < count * packs; i++) cards.push(kittensCardId(kind, i));
  }
  for (let i = 0; i < KITTENS_LATIDOS; i++) cards.push(kittensCardId('latido', i));
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
    Array.from({ length: n + kittensExtraCafunes(n) }, (_, i) => kittensCardId('cafune', i)),
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
