import { randomInt, shuffle, type Rng } from '../../rng';
import { KITTENS_BICHOS, KITTENS_CLASSIC_BICHOS, kittensCardId, type KittensBicho, type KittensCardKind } from './cards';

/**
 * Um pacote, sem os bichos da partida (`KITTENS_BICHO_CARDS` de cada um): tudo menos Tatubum, Desarme e Tatu Latidor; as
 * cartas do original + as novas de 2026-10-20.
 */
export const KITTENS_PACK: Partial<Record<KittensCardKind, number>> = {
  nemvem: 5,
  ataque: 4,
  pular: 4,
  favor: 4,
  embaralhar: 4,
  espiar: 5,
  olhado: 2,
  feitico: 2,
  boto: 4,
};
/** Cartas de cada bicho da partida, por pacote. */
export const KITTENS_BICHO_CARDS = 4;
/** Quantos bichos da pool (`KITTENS_BICHOS`) entram em cada partida (pedido do Rafa, 2026-11-06). */
export const KITTENS_BICHOS_PER_MATCH = 6;
export const KITTENS_PACK_SIZE = 58;

/** Os bichos de uma partida, sorteados da pool, na ordem da pool. */
export function kittensDrawBichos(rng: Rng): KittensBicho[] {
  const drawn = new Set(shuffle(rng, KITTENS_BICHOS).slice(0, KITTENS_BICHOS_PER_MATCH));
  return KITTENS_BICHOS.filter((b) => drawn.has(b));
}
/**
 * Tatu Latidor, fora dos pacotes (pedido do Rafa, 2026-10-21): 2 com 2 jogadores, 3 com 3 e, a partir de 4, um a menos
 * que o número de jogadores. Nenhum vem na mão inicial: vão todos pro monte.
 */
export function kittensLatidos(players: number): number {
  return players <= 3 ? players : players - 1;
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

/**
 * Quantos Desarmes extras saem da partida (pedido do Rafa, 2026-11-06): cada partida sorteia 0, 1 ou 2, sem avisar ninguém
 * e só do monte (todo mundo continua começando com o seu). Com 5 ou mais só há 1 extra: 0 ou 1.
 */
export function kittensCafuneCut(rng: Rng, players: number): number {
  return randomInt(rng, Math.min(2, kittensExtraCafunes(players)) + 1);
}

/** Tamanho do monte logo depois da distribuição, com qualquer número de jogadores (pedido do Rafa, 2026-11-07). */
export const KITTENS_DRAW_START = 40;

/**
 * Tamanho do monte logo depois da distribuição: sempre `KITTENS_DRAW_START` (antes encolhia com mais gente, 44 com 3 e 32
 * com 5). Os pacotes completam o que faltar depois dos Latidores, dos Desarmes extras que sobraram do corte e dos Tatubuns.
 */
export function kittensDrawStart(_players: number): number {
  return KITTENS_DRAW_START;
}

/** Quantos pacotes a partida abre: o bastante pras mãos e pro monte, mesmo com o corte máximo de Desarmes. */
export function kittensPacksFor(players: number): number {
  const fixed = kittensLatidos(players) + kittensExtraCafunes(players) - Math.min(2, kittensExtraCafunes(players)) + players - 1;
  return Math.ceil((KITTENS_HAND_START * players + kittensDrawStart(players) - fixed) / KITTENS_PACK_SIZE);
}

/** As cartas de um pacote (o `copy`-ésimo, a partir de 0), numeradas por tipo sem repetir as dos outros pacotes. */
function packCopy(copy: number, bichos: readonly KittensBicho[]): string[] {
  const counts: [KittensCardKind, number][] = [
    ...(Object.entries(KITTENS_PACK) as [KittensCardKind, number][]),
    ...bichos.map((b): [KittensCardKind, number] => [b, KITTENS_BICHO_CARDS]),
  ];
  const cards: string[] = [];
  for (const [kind, count] of counts) {
    for (let i = 0; i < count; i++) cards.push(kittensCardId(kind, copy * count + i));
  }
  return cards;
}

/**
 * Todas as cartas dos pacotes que a partida abre (sem Tatubum, Cafuné e Tatu Latidor). Do último pacote só entra o que
 * falta pro monte (`kittensDeal`), então a partida usa um subconjunto destas.
 */
export function kittensPackCards(players: number, bichos: readonly KittensBicho[] = KITTENS_CLASSIC_BICHOS): string[] {
  return Array.from({ length: kittensPacksFor(players) }, (_, c) => packCopy(c, bichos)).flat();
}

/** Os Tatus Latidores da partida (1 por jogador), numerados. */
export function kittensLatidoCards(players: number): string[] {
  return Array.from({ length: kittensLatidos(players) }, (_, i) => kittensCardId('latido', i));
}

/** As cartas que podem estar na partida menos Tatubum e Cafuné: os pacotes abertos mais os Tatus Latidores. */
export function kittensBaseDeck(players: number, bichos: readonly KittensBicho[] = KITTENS_CLASSIC_BICHOS): string[] {
  return [...kittensPackCards(players, bichos), ...kittensLatidoCards(players)];
}

export interface KittensDeal {
  hands: Record<string, string[]>;
  /** Monte embaralhado: o topo é o FIM do array. */
  draw: string[];
}

/**
 * Preparação (spec §2): 1 Cafuné + 7 cartas dos pacotes pra cada um (nenhum Latidor na mão inicial: pedido do Rafa,
 * 2026-10-21); no monte, embaralhados, os Latidores (`kittensLatidos`) + os Cafunés extras que sobraram do sorteio
 * (`kittensCafuneCut`) + (n − 1) Tatubuns + cartas dos pacotes até o monte ter `kittensDrawStart(n)`. Os pacotes entram
 * inteiros e só o último é sorteado em parte: com 2 ou 3 jogadores basta 1 pacote, e alguns tipos ficam com menos cartas.
 */
export function kittensDeal(rng: Rng, players: readonly string[], bichos: readonly KittensBicho[] = KITTENS_CLASSIC_BICHOS): KittensDeal {
  const n = players.length;
  const packs = kittensPacksFor(n);
  // Cafunés embaralhados: se `cafune-i` fosse sempre do assento i, um Cafuné roubado (par/Favor) se denunciaria
  // quando jogado, e só os dois envolvidos podem saber qual carta trocou de mão (spec §4.3).
  const cafunes = shuffle(
    rng,
    Array.from({ length: n + kittensExtraCafunes(n) }, (_, i) => kittensCardId('cafune', i)),
  );
  const extras = cafunes.slice(n + kittensCafuneCut(rng, n));
  const tatus = Array.from({ length: n - 1 }, (_, i) => kittensCardId('tatubum', i));
  const fixed = [...kittensLatidoCards(n), ...extras, ...tatus];
  // Pacotes inteiros, menos o último, do qual só entra (ao acaso) o que falta pras mãos e pro monte.
  const need = KITTENS_HAND_START * n + kittensDrawStart(n) - fixed.length;
  const whole = Array.from({ length: packs - 1 }, (_, c) => packCopy(c, bichos)).flat();
  const last = shuffle(rng, packCopy(packs - 1, bichos)).slice(0, need - whole.length);
  const pool = shuffle(rng, [...whole, ...last]);
  const hands: Record<string, string[]> = {};
  players.forEach((p, i) => {
    hands[p] = [cafunes[i]!, ...pool.slice(i * KITTENS_HAND_START, (i + 1) * KITTENS_HAND_START)];
  });
  const rest = pool.slice(n * KITTENS_HAND_START);
  return { hands, draw: shuffle(rng, [...rest, ...fixed]) };
}
