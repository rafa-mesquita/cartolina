import type { KittensCardKind } from './cards';

export const KITTENS_MIN_PLAYERS = 2;
export const KITTENS_MAX_PLAYERS = 8;
/** Janela do Nem vem! (decisão do usuário, 2026-10-19): sempre corre, mesmo se ninguém tiver Nem vem!. */
export const KITTENS_NOPE_MS = 5_000;
/**
 * Espera entre um Nem vem! e o próximo na mesma carta no ar (pedido do Rafa, 2026-10-21): evita dois por engano.
 * Contada a partir do último Nem vem! aceito (= `pending.resolvesAt - KITTENS_NOPE_MS`); o primeiro não espera.
 */
export const KITTENS_NOPE_COOLDOWN_MS = 2_000;
/** Até quando o próximo Nem vem! na carta no ar tem que esperar (null: pode agora, sem nenhum Nem vem! ainda). */
export function kittensNopeCooldownUntil(pending: { nopes: readonly unknown[]; resolvesAt: number } | null | undefined): number | null {
  if (!pending || pending.nopes.length === 0) return null;
  return pending.resolvesAt - KITTENS_NOPE_MS + KITTENS_NOPE_COOLDOWN_MS;
}
/**
 * 4 bichos diferentes (pedido do Rafa, 2026-10-21): não leva Nem vem!. A carta fica no ar só o tempo de todo mundo ver
 * (sem contagem), e resolve.
 */
export const KITTENS_UNSTOPPABLE_MS = 1_500;
/** A jogada aceita Nem vem!? Só os 4 bichos diferentes (`cinco`, nome antigo dos 5 diferentes) não aceitam. */
export function kittensNopable(kind: KittensPlayKind): boolean {
  return kind !== 'cinco';
}
/** Prazo das escolhas pessoais (Desarme, Favor, descarte e pegada do Mico, 4 bichos diferentes, Quati, Latidor, Feitiço); depois o servidor escolhe. */
export const KITTENS_CHOICE_MS = 30_000;
/** Quantas entradas do diário ficam no estado. */
export const KITTENS_LOG_SIZE = 30;

export type KittensPhase = 'lobby' | 'playing' | 'gameover';

/** O que uma jogada faz: carta de ação sozinha ou combo. */
export type KittensPlayKind =
  | 'ataque'
  | 'pular'
  | 'favor'
  | 'embaralhar'
  | 'espiar'
  | 'latido'
  | 'olhado'
  | 'feitico'
  | 'par'
  | 'trio'
  | 'cinco';

export interface KittensPlay {
  kind: KittensPlayKind;
  cards: string[];
  /** Favor, trio de Favor, Mau-olhado e par de Tucano (o par de Mico não tem alvo). */
  target: string | null;
  /** Par de Preguiça: o bicho pedido. */
  ask: KittensCardKind | null;
  /**
   * Par: o bicho que o par vale (com Boto, o que ele faz as vezes; ex.: Boto + Quati = par de Quati). Trio: o tipo das
   * cartas iguais (`boto` se forem 3 Botos). `null` nas outras jogadas.
   */
  as: KittensCardKind | null;
}

/** Carta no ar: resolve em `resolvesAt`; cada Nem vem! empurra o prazo (spec §4.2). */
export interface KittensPending {
  by: string;
  play: KittensPlay;
  nopes: { by: string; card: string }[];
  resolvesAt: number;
}

export type KittensChoice =
  /** Comprou um Tatubum e tem Desarme: `who` joga o Desarme (o tatu fica na mão dele até voltar pro monte). */
  | { kind: 'tatu'; who: string; tatu: string; deadline: number }
  /** Quem desarmou escolhe onde o `tatu` volta no monte. */
  | { kind: 'cafune'; who: string; tatu: string; deadline: number }
  /**
   * `who` (o alvo do Favor) escolhe, uma de cada vez, `left` cartas da mão pra dar pra `to`: 1 no Favor sozinho; 3 no
   * trio de Favor (ou a mão toda, se tiver menos). Fecha quando dá todas ou a mão de `who` acaba.
   */
  | { kind: 'favor'; who: string; to: string; left: number; deadline: number }
  /**
   * `who` pega do descarte, uma de cada vez, `left` cartas de `options`: nos 5 diferentes, 2 do descarte de antes da
   * jogada; no fim do par de Mico (`from: 'mico'`; pedido do Rafa, 2026-10-20), 1 das cartas descartadas nele. `from`
   * só muda os textos da mesa.
   */
  | { kind: 'cinco'; who: string; options: string[]; left: number; deadline: number; from?: 'mico' }
  /**
   * Par de Mico: cada um de `waiting` descarta uma carta da própria mão, ao mesmo tempo. `by` = quem jogou o par;
   * `discarded` = o que já foi descartado nele (público), de onde `by` pega uma quando todos terminam.
   */
  | { kind: 'mico'; by: string; waiting: string[]; discarded: string[]; deadline: number }
  /** Par de Quati: `who` vê a carta de cima do monte e decide se ela fica ou vai pro fundo. */
  | { kind: 'quati'; who: string; deadline: number }
  /** Tatu Latidor: `who` (quem tinha o outro Latidor) joga um Desarme à mão pra não explodir. Pública. */
  | { kind: 'latido'; who: string; deadline: number }
  /** Feitiço: `who` vê a carta de BAIXO do monte e decide se fica com ela (como se comprasse) ou se ela vai pro topo. */
  | { kind: 'feitico'; who: string; deadline: number };

/** Escolha como os jogadores veem: sem o id do tatu escondido; a carta de cima do Quati e a de baixo do Feitiço só pra quem escolhe. */
export type KittensChoiceView =
  | { kind: 'tatu'; who: string; deadline: number }
  | { kind: 'cafune'; who: string; deadline: number }
  /** `card` = a carta de cima, só pra quem escolhe (null pros outros). */
  | { kind: 'quati'; who: string; deadline: number; card: string | null }
  /** `card` = a carta de baixo do monte, só pra quem escolhe (null pros outros). */
  | { kind: 'feitico'; who: string; deadline: number; card: string | null }
  | Extract<KittensChoice, { kind: 'favor' | 'cinco' | 'mico' | 'latido' }>;

/** Espiar no formato antigo (um só por vez, até 2026-10-20): só o `compat.ts` lê isso, de sala salva no meio da partida. */
export interface KittensPeek {
  who: string;
  cards: string[];
}

/** Evento do diário. A `card` de um evento só aparece pra quem está no `seenBy` da entrada. */
export type KittensEvent =
  | { t: 'play'; by: string; play: KittensPlayKind; target: string | null; ask: KittensCardKind | null; as: KittensCardKind | null }
  | { t: 'nope'; by: string }
  /** A carta no ar resolveu; `canceled` = Nem vem! ímpar, ou quem jogou/alvo saiu antes. */
  | { t: 'resolved'; by: string; play: KittensPlayKind; canceled: boolean }
  | { t: 'draw'; by: string; card: string | null }
  /** Comprou um Tatubum e tem Desarme: agora decide usá-lo (todos veem). */
  | { t: 'tatu'; by: string }
  /** Usou o Desarme (carta pro descarte) pra salvar o Tatubum que comprou ou pra se defender do Tatu Latidor. */
  | { t: 'cafune'; by: string }
  | { t: 'hid'; by: string }
  | { t: 'boom'; by: string }
  /** Caiu e não voltou em 30 s. */
  | { t: 'left'; by: string }
  | { t: 'gave'; from: string; to: string; card: string | null }
  | { t: 'picked'; by: string; card: string | null }
  /** Par de Mico: `by` descartou `card` (todos veem; o efeito da carta não vale). */
  | { t: 'discarded'; by: string; card: string }
  /** Par de Quati: a carta de cima foi pro fundo (`moved`) ou ficou. Ninguém vê qual era. */
  | { t: 'delayed'; by: string; moved: boolean }
  /** Par de Tamanduá: quantos Tatubuns comprados foram pro fundo. */
  | { t: 'buried'; by: string; tatus: number }
  /** Par de Preguiça: `from` = quem deu, ou null quando veio do monte; `card` null = ninguém tinha, nem o monte. */
  | { t: 'called'; by: string; ask: KittensCardKind; from: string | null; card: string | null }
  /** Roda de capivara: `from` passou `card` pra `to` (só os dois veem). */
  | { t: 'passed'; from: string; to: string; card: string | null }
  /** Trio: roubou o Desarme `card` de `from` (null quando ninguém tinha). */
  | { t: 'grabbed'; by: string; from: string | null; card: string | null }
  /** Tatu Latidor: latiu pra `target` (quem tinha o outro Latidor) ou, ninguém tendo, ficou na frente de `by` (`target` null). */
  | { t: 'barked'; by: string; target: string | null }
  /** Mau-olhado: `target` ficou cego (a mão embaralhada e escondida dele até comprar). */
  | { t: 'cursed'; by: string; target: string }
  /** `by` comprou e voltou a ver a própria mão. */
  | { t: 'cured'; by: string }
  /** Feitiço: `by` ficou com a carta de baixo do monte (`kept`) ou mandou ela pro topo. Ninguém vê qual era. */
  | { t: 'conjured'; by: string; kept: boolean }
  /** Par de Tucano: `by` acabou a vez sem comprar e a próxima vez de `target` vai ser pulada. */
  | { t: 'tucano'; by: string; target: string }
  /** A vez chegou em `who`, que tinha vez pulada (Tucano): o turno dele foi gasto sem ele jogar nem comprar. */
  | { t: 'skipped'; who: string }
  | { t: 'win'; by: string };

export interface KittensLogEntry {
  n: number;
  ev: KittensEvent;
  /** Quem vê a carta do evento; `null` = todos. */
  seenBy: string[] | null;
}

export interface KittensState {
  phase: KittensPhase;
  /** Todos da partida, na ordem dos assentos no "começar". Quem entra depois assiste. */
  players: string[];
  alive: string[];
  hands: Record<string, string[]>;
  /** Monte: o topo é o FIM do array. */
  draw: string[];
  discard: string[];
  /** Fora do jogo: Tatubuns que explodiram, mãos de quem saiu e tatus tirados do monte. */
  out: string[];
  /** Cartas na frente de cada jogador, à vista de todos (o Tatu Latidor que ninguém respondeu). Chave ausente = nada. */
  front: Record<string, string[]>;
  /**
   * Mau-olhado: quem está cego (público). A mão dele foi embaralhada no estado quando o olhado pegou, e ele a vê como
   * fichas `?0…`: a ficha `?i` é `hands[p][i]`. Cartas que chegam depois vão pro fim. Sai da lista quando ele compra.
   */
  blind: string[];
  current: string | null;
  /** Turnos que `current` ainda deve, contando o atual. */
  owed: number;
  pending: KittensPending | null;
  choice: KittensChoice | null;
  /**
   * Espiar (pedido do Rafa, 2026-10-20): o que cada um espiou e ainda está à mostra pra ele, a carta do topo primeiro.
   * Sempre vale `peeks[p] = draw.slice(-k).reverse()` (k = tamanho da espiada): carta comprada ou tirada do monte sai
   * das espiadas; o monte mudar de ordem perto do topo apaga todas, menos a de quem mexeu sabendo o que fez (Feitiço,
   * Desarme, Quati: pedido do Rafa, 2026-10-21), que pode passar de 3 cartas. Espiada vazia não fica. Chave ausente = nada.
   */
  peeks: Record<string, string[]>;
  /**
   * Par de Tucano (pedido do Rafa, 2026-10-21): quantas vezes de cada jogador ainda vão ser puladas (público; acumula).
   * Quando a vez chega em quem tem, um turno dele é gasto sozinho (`passTo`). Só vivos, sempre ≥ 1 (chave ausente = 0);
   * nunca de quem está na vez.
   */
  skips: Record<string, number>;
  log: KittensLogEntry[];
  /** Número da próxima entrada do diário. */
  seq: number;
  winner: string | null;
  /** Partidas da sala desde o lobby: sobe a cada "começar" e "jogar de novo" (entra no id da partida do histórico). */
  match: number;
  /** Quem saiu, na ordem (o vencedor não entra). Zera a cada partida. */
  exits: KittensExit[];
  /** Nem vem! e Desarmes de cada jogador nesta partida (chave ausente = nada ainda). Zera a cada partida. */
  stats: Record<string, KittensPlayerStats>;
}

/** Como alguém saiu da partida: explodiu (Tatubum, Tatu Latidor ou Feitiço) ou caiu e não voltou em 30 s. */
export type KittensExitHow = 'boom' | 'left';

export interface KittensExit {
  player: string;
  how: KittensExitHow;
}

/** Contadores da partida por jogador, pro histórico (públicos: tudo isso já aparece no diário). */
export interface KittensPlayerStats {
  /** Nem vem! dados (cada `nope` aceito). */
  nopes: number;
  /** Desarmes usados (contra o Tatubum comprado ou o Tatu Latidor, inclusive o jogado sozinho no fim do prazo). */
  defuses: number;
}

export type KittensAction =
  | { type: 'start' }
  /** `as`: par de 2 Botos, o bicho que o par vale. Quem está cego manda fichas (`?0`…) no lugar dos ids. */
  | { type: 'play'; cards: string[]; target?: string; ask?: KittensCardKind; as?: KittensCardKind }
  /**
   * `card`: qual Nem vem! usar (opcional; sem ela, o servidor usa um). Quem está cego tem que mandar uma ficha.
   * `at` e `on` (pedido do Rafa, 2026-10-20) dizem o que o jogador viu ao clicar: `at` = quantos Nem vem! já havia na
   * carta no ar (`pending.nopes.length`) e `on` = a primeira carta da jogada no ar (`pending.play.cards[0]`; os ids
   * são únicos). Se a mesa mudou nesse meio-tempo, o Nem vem! chegou atrasado: é recusado e a carta fica na mão.
   * Opcionais pra clientes antigos (sem eles, vale como antes).
   */
  | { type: 'nope'; card?: string; at?: number; on?: string }
  | { type: 'draw' }
  /**
   * Desarme: `card` (o Desarme a jogar, ao comprar um Tatubum ou contra o Tatu Latidor) e depois `position` (0 = topo,
   * tamanho do monte = fundo, ou 'random'); Favor, descarte do Mico e 5 diferentes: `card`; Quati e Feitiço: `keep`.
   */
  | { type: 'choose'; card?: string; position?: number | 'random'; keep?: boolean }
  | { type: 'again' }
  | { type: 'lobby' };

export interface KittensView {
  phase: KittensPhase;
  players: string[];
  alive: string[];
  current: string | null;
  owed: number;
  /** Sua mão (vazia pra espectador). Cego: fichas `?0`, `?1`, … no lugar das cartas. */
  hand: string[];
  handCounts: Record<string, number>;
  drawCount: number;
  tatusInDraw: number;
  discard: string[];
  out: string[];
  /** Cartas na frente de cada jogador (todos os jogadores aparecem; sem nada = []). */
  front: Record<string, string[]>;
  /** Quem está cego pelo Mau-olhado (a ordem das fichas não aparece). */
  blind: string[];
  pending: KittensPending | null;
  choice: KittensChoiceView | null;
  /** O que você espiou e ainda está à mostra (as de cima, a do topo primeiro; pode passar de 3); null se nada. */
  peek: string[] | null;
  /** Quem tem espiada à mostra agora (público; as cartas de cada um, só ele vê), na ordem dos assentos. */
  peekers: string[];
  /** Vezes que ainda vão ser puladas, por jogador (par de Tucano; público). Sem nada = chave ausente. */
  skips: Record<string, number>;
  log: { n: number; ev: KittensEvent }[];
  winner: string | null;
}
