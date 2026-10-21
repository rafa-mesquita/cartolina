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
/**
 * Tatu Latidor: 1 por jogador na partida (pedido do Rafa, 2026-10-21; antes eram sempre 2), fora dos pacotes. Nenhum
 * vem na mão inicial: vão todos pro monte.
 */
export function kittensLatidos(players: number): number {
  return players;
}
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

/** As cartas dos pacotes (sem Tatubum, Cafuné e Tatu Latidor), numeradas por tipo: de onde sai a mão inicial. */
export function kittensPackCards(players: number): string[] {
  const packs = kittensPacksFor(players);
  const cards: string[] = [];
  for (const [kind, count] of Object.entries(KITTENS_PACK) as [KittensCardKind, number][]) {
    for (let i = 0; i < count * packs; i++) cards.push(kittensCardId(kind, i));
  }
  return cards;
}

/** Os Tatus Latidores da partida (1 por jogador), numerados. */
export function kittensLatidoCards(players: number): string[] {
  return Array.from({ length: kittensLatidos(players) }, (_, i) => kittensCardId('latido', i));
}

/** Todas as cartas da partida menos Tatubum e Cafuné: os pacotes mais os Tatus Latidores. */
export function kittensBaseDeck(players: number): string[] {
  return [...kittensPackCards(players), ...kittensLatidoCards(players)];
}

export interface KittensDeal {
  hands: Record<string, string[]>;
  /** Monte embaralhado: o topo é o FIM do array. */
  draw: string[];
}

/**
 * Preparação (spec §2): 1 Cafuné + 7 cartas dos pacotes pra cada um (nenhum Latidor na mão inicial: pedido do Rafa,
 * 2026-10-21); no monte, embaralhados, o resto dos pacotes + os Latidores (1 por jogador) + os Cafunés extras + (n − 1)
 * Tatubuns. Tamanho do monte = pacotes × 58 − 7n + n + Cafunés extras + (n − 1).
 */
export function kittensDeal(rng: Rng, players: readonly string[]): KittensDeal {
  const n = players.length;
  const pool = shuffle(rng, kittensPackCards(n));
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
  return { hands, draw: shuffle(rng, [...rest, ...kittensLatidoCards(n), ...extras, ...tatus]) };
}
