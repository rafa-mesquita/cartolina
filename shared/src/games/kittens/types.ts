import type { KittensCardKind } from './cards';

export const KITTENS_MIN_PLAYERS = 2;
export const KITTENS_MAX_PLAYERS = 8;
/** Janela do Nem vem! (decisão do usuário, 2026-10-19): sempre corre, mesmo se ninguém tiver Nem vem!. */
export const KITTENS_NOPE_MS = 5_000;
/** Prazo das escolhas pessoais (Cafuné, Favor, 5 diferentes); depois o servidor escolhe ao acaso. */
export const KITTENS_CHOICE_MS = 30_000;
/** Quantas entradas do diário ficam no estado. */
export const KITTENS_LOG_SIZE = 30;

export type KittensPhase = 'lobby' | 'playing' | 'gameover';

/** O que uma jogada faz: carta de ação sozinha ou combo. */
export type KittensPlayKind = 'ataque' | 'pular' | 'favor' | 'embaralhar' | 'espiar' | 'par' | 'trio' | 'cinco';

export interface KittensPlay {
  kind: KittensPlayKind;
  cards: string[];
  /** Favor, par e trio. */
  target: string | null;
  /** Trio: o tipo de carta pedido. */
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
  /** `who` (o alvo do Favor) escolhe uma carta da mão pra dar pra `to`. */
  | { kind: 'favor'; who: string; to: string; deadline: number }
  /** `who` escolhe uma carta de `options` (o descarte de antes da jogada de 5 diferentes). */
  | { kind: 'cinco'; who: string; options: string[]; deadline: number };

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
  | { t: 'stole'; from: string; to: string; card: string | null }
  | { t: 'asked'; from: string; to: string; ask: KittensCardKind; card: string | null }
  | { t: 'picked'; by: string; card: string | null }
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
  /** Cafuné: `position` (0 = topo, tamanho do monte = fundo, ou 'random'); Favor e 5 diferentes: `card`. */
  | { type: 'choose'; card?: string; position?: number | 'random' }
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
  choice: KittensChoice | null;
  /** As 3 de cima, só pra quem espiou. */
  peek: string[] | null;
  peekBy: string | null;
  log: { n: number; ev: KittensEvent }[];
  winner: string | null;
}
