export const DIXIT_MIN_PLAYERS = 3;
export const DIXIT_TARGETS = [15, 30] as const;
export type DixitTarget = (typeof DIXIT_TARGETS)[number];
/** Meta da caixa original. */
export const DIXIT_DEFAULT_TARGET: DixitTarget = 30;
export const DIXIT_CLUE_MAX = 80;

export type DixitPhase = 'lobby' | 'storytelling' | 'submitting' | 'voting' | 'reveal' | 'gameover';

/** O que aconteceu na rodada revelada (para animar e mostrar). */
export interface DixitRoundResult {
  storyteller: string;
  storyCard: string;
  clue: string;
  /** Cartas na ordem em que apareceram na votação. */
  table: string[];
  /** carta → dono */
  owners: Record<string, string>;
  /** votante → carta (só votos confirmados) */
  votes: Record<string, string>;
  /** Pontos ganhos nesta rodada por quem participou. */
  gained: Record<string, number>;
  /** Quem achou a carta do narrador. */
  found: string[];
}

export interface DixitState {
  phase: DixitPhase;
  target: DixitTarget;
  /** Todos da partida: ordem dos assentos no início; quem entra depois vai pro fim. */
  players: string[];
  /** Quem participa da rodada atual (ativos quando ela começou). */
  inRound: string[];
  scores: Record<string, number>;
  storyteller: string | null;
  deck: string[];
  discard: string[];
  hands: Record<string, string[]>;
  clue: string;
  storyCard: string | null;
  /** jogador → cartas escolhidas na etapa de escolha. */
  picks: Record<string, string[]>;
  /** votante → carta. */
  votes: Record<string, string>;
  /** Quem já confirmou na etapa atual (escolha ou votação). */
  confirmed: string[];
  /** Ordem embaralhada das cartas na votação. */
  table: string[];
  result: DixitRoundResult | null;
  winners: string[];
  /** Menos de 3 ativos na rodada: ninguém joga até voltar gente. */
  paused: boolean;
  /** Partida da sala: 0 no lobby, +1 a cada `start` e `again` (identifica a partida no histórico). */
  match: number;
  /** Narrações começadas nesta partida: zera na partida nova e soma 1 a cada narração (chave da revelação no histórico). */
  round: number;
}

export type DixitAction =
  | { type: 'setTarget'; target: DixitTarget }
  | { type: 'start' }
  | { type: 'tell'; cardId: string; clue: string }
  | { type: 'submit'; cardIds: string[] }
  | { type: 'vote'; cardId: string }
  | { type: 'confirm' }
  | { type: 'forceNext' }
  | { type: 'next' }
  | { type: 'again' }
  | { type: 'lobby' };

export interface DixitTableCard {
  cardId: string;
  /** A carta é de quem está vendo. */
  mine: boolean;
}

export interface DixitView {
  phase: DixitPhase;
  target: DixitTarget;
  players: string[];
  inRound: string[];
  scores: Record<string, number>;
  storyteller: string | null;
  clue: string;
  paused: boolean;
  winners: string[];
  /** Só na revelação e no fim de jogo. */
  result: DixitRoundResult | null;
  /** Sua mão (vazia para espectador). */
  hand: string[];
  handCounts: Record<string, number>;
  deckCount: number;
  /** Carta do narrador: só ele vê antes da revelação. */
  storyCard: string | null;
  myPicks: string[];
  myVote: string | null;
  confirmed: string[];
  /** Quantas cartas já estão na mesa (narrador + quem confirmou a escolha). */
  tableCount: number;
  /** Cartas na votação/revelação, sem dono. */
  table: DixitTableCard[];
}
