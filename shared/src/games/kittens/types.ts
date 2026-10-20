import type { KittensCardKind } from './cards';

export const KITTENS_MIN_PLAYERS = 2;
export const KITTENS_MAX_PLAYERS = 8;
/** Janela do Nem vem! (decisão do usuário, 2026-10-19): sempre corre, mesmo se ninguém tiver Nem vem!. */
export const KITTENS_NOPE_MS = 5_000;
/** Prazo das escolhas pessoais (Desarme, Favor/Mico, 5 diferentes, Quati); depois o servidor escolhe. */
export const KITTENS_CHOICE_MS = 30_000;
/** Quantas entradas do diário ficam no estado. */
export const KITTENS_LOG_SIZE = 30;

export type KittensPhase = 'lobby' | 'playing' | 'gameover';

/** O que uma jogada faz: carta de ação sozinha ou combo. */
export type KittensPlayKind = 'ataque' | 'pular' | 'favor' | 'embaralhar' | 'espiar' | 'par' | 'trio' | 'cinco';

export interface KittensPlay {
  kind: KittensPlayKind;
  cards: string[];
  /** Favor e par de Mico. */
  target: string | null;
  /** Par de Preguiça: o bicho pedido. */
  ask: KittensCardKind | null;
}

/** Carta no ar: resolve em `resolvesAt`; cada Nem vem! empurra o prazo (spec §4.2). */
export interface KittensPending {
  by: string;
  play: KittensPlay;
  nopes: { by: string; card: string }[];
  resolvesAt: number;
}

export type KittensChoice =
  /** Quem desarmou escolhe onde o `tatu` volta no monte. */
  | { kind: 'cafune'; who: string; tatu: string; deadline: number }
  /** `who` (o alvo do Favor ou do par de Mico) escolhe uma carta da mão pra dar pra `to`. */
  | { kind: 'favor'; who: string; to: string; deadline: number }
  /** `who` escolhe uma carta de `options` (o descarte de antes da jogada de 5 diferentes). */
  | { kind: 'cinco'; who: string; options: string[]; deadline: number }
  /** Par de Quati: `who` vê a carta de cima do monte e decide se ela fica ou vai pro fundo. */
  | { kind: 'quati'; who: string; deadline: number };

/** Escolha como os jogadores veem: sem o id do tatu escondido; a carta de cima do Quati só pra quem escolhe. */
export type KittensChoiceView =
  | { kind: 'cafune'; who: string; deadline: number }
  /** `card` = a carta de cima, só pra quem escolhe (null pros outros). */
  | { kind: 'quati'; who: string; deadline: number; card: string | null }
  | Extract<KittensChoice, { kind: 'favor' | 'cinco' }>;

/** Espiar: as 3 de cima, a do topo primeiro, só pra `who`. */
export interface KittensPeek {
  who: string;
  cards: string[];
}

/** Evento do diário. A `card` de um evento só aparece pra quem está no `seenBy` da entrada. */
export type KittensEvent =
  | { t: 'play'; by: string; play: KittensPlayKind; target: string | null; ask: KittensCardKind | null }
  | { t: 'nope'; by: string }
  /** A carta no ar resolveu; `canceled` = Nem vem! ímpar, ou quem jogou/alvo saiu antes. */
  | { t: 'resolved'; by: string; play: KittensPlayKind; canceled: boolean }
  | { t: 'draw'; by: string; card: string | null }
  /** Comprou um Tatubum e usou o Cafuné. */
  | { t: 'cafune'; by: string }
  | { t: 'hid'; by: string }
  | { t: 'boom'; by: string }
  /** Caiu e não voltou em 30 s. */
  | { t: 'left'; by: string }
  | { t: 'gave'; from: string; to: string; card: string | null }
  | { t: 'picked'; by: string; card: string | null }
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
  current: string | null;
  /** Turnos que `current` ainda deve, contando o atual. */
  owed: number;
  pending: KittensPending | null;
  choice: KittensChoice | null;
  peek: KittensPeek | null;
  log: KittensLogEntry[];
  /** Número da próxima entrada do diário. */
  seq: number;
  winner: string | null;
}

export type KittensAction =
  | { type: 'start' }
  | { type: 'play'; cards: string[]; target?: string; ask?: KittensCardKind }
  | { type: 'nope' }
  | { type: 'draw' }
  /** Desarme: `position` (0 = topo, tamanho do monte = fundo, ou 'random'); Favor/Mico e 5 diferentes: `card`; Quati: `keep`. */
  | { type: 'choose'; card?: string; position?: number | 'random'; keep?: boolean }
  | { type: 'again' }
  | { type: 'lobby' };

export interface KittensView {
  phase: KittensPhase;
  players: string[];
  alive: string[];
  current: string | null;
  owed: number;
  /** Sua mão (vazia pra espectador). */
  hand: string[];
  handCounts: Record<string, number>;
  drawCount: number;
  tatusInDraw: number;
  discard: string[];
  out: string[];
  pending: KittensPending | null;
  choice: KittensChoiceView | null;
  /** As 3 de cima, só pra quem espiou. */
  peek: string[] | null;
  peekBy: string | null;
  log: { n: number; ev: KittensEvent }[];
  winner: string | null;
}
