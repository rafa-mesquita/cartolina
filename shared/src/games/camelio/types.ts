export const CAMELIO_MIN_PLAYERS = 2;
export const CAMELIO_MAX_PLAYERS = 6;
/** Esferas exatas de uma cor pra pontuar. */
export const CAMELIO_EXACT = 5;

/** Cores na ordem do círculo: as bicolores juntam cores vizinhas. */
export const CAMELIO_COLORS = ['verde', 'amarelo', 'laranja', 'vermelho', 'roxo', 'azul'] as const;
export type CamelioColor = (typeof CAMELIO_COLORS)[number];

export type CamelioKind = 'normal' | 'bicolor' | 'multi';

/** Uma carta, com a frente (cor de verdade e esferas). */
export interface CamelioCard {
  id: number;
  kind: CamelioKind;
  color: CamelioColor;
  spheres: number;
  /** Bicolor: as duas cores do verso (a de verdade é uma delas). Nas outras, null. */
  pair: [CamelioColor, CamelioColor] | null;
}

/** O que dá pra ver de uma carta virada pra baixo. */
export type CamelioBack =
  | { kind: 'normal'; color: CamelioColor }
  | { kind: 'bicolor'; spheres: number; colors: [CamelioColor, CamelioColor] }
  | { kind: 'multi'; spheres: number };

export type CamelioPhase = 'lobby' | 'playing' | 'over';
export type CamelioFrom = 'open' | 'deck';
export type CamelioOutcome = 'none' | 'scored' | 'bust' | 'lost';
export type CamelioEndReason = 'target' | 'deck';

/** Uma jogada: quem pegou, de onde, pra quem deu e o que aconteceu. */
export interface CamelioPlay {
  by: string;
  from: CamelioFrom;
  to: string;
  card: number;
  outcome: CamelioOutcome;
  color: CamelioColor;
  /** Esferas da cor na mesa de `to` logo depois da carta (antes de descartar ou guardar). */
  sum: number;
}

export interface CamelioState {
  phase: CamelioPhase;
  /** Quem joga a partida, na ordem dos assentos do começo. */
  players: string[];
  /** Ids das cartas; o topo é o último. */
  deck: number[];
  /** Carta aberta ao lado do monte. */
  open: number | null;
  discard: number[];
  /** O descarte já virou monte uma vez nesta partida. */
  reshuffled: boolean;
  /** Área de jogo de cada um. */
  table: Record<string, number[]>;
  /** Área de pontos de cada um (as cartas das cores fechadas). */
  scored: Record<string, number[]>;
  turn: string | null;
  /** Pontos (cores) pra ganhar: 4 com 2 jogadores, 3 com 3 a 6. */
  target: number;
  /** Menos de 2 jogadores da partida ativos: ninguém joga até voltar gente. */
  paused: boolean;
  /** Toda jogada da partida (animação e, no C4, histórico). */
  log: CamelioPlay[];
  winners: string[];
  endReason: CamelioEndReason | null;
  /** Partida da sala: 0 no lobby, +1 a cada `start` e `again`. */
  match: number;
}

export type CamelioAction =
  | { type: 'start' }
  | { type: 'play'; from: CamelioFrom; to: string }
  | { type: 'again' }
  | { type: 'lobby' };

export interface CamelioView {
  phase: CamelioPhase;
  players: string[];
  target: number;
  turn: string | null;
  paused: boolean;
  match: number;
  /** Carta aberta, com a frente. */
  open: CamelioCard | null;
  /** Só o verso do topo do monte (a frente nunca sai do servidor). */
  top: CamelioBack | null;
  deckCount: number;
  discardCount: number;
  reshuffled: boolean;
  table: Record<string, CamelioCard[]>;
  scored: Record<string, CamelioCard[]>;
  points: Record<string, number>;
  /** Última jogada (pra animar), ou null antes da primeira. */
  last: CamelioPlay | null;
  /** Quantas jogadas a partida já teve: muda a cada jogada, mesmo se a anterior for igual. Volta a 0 numa partida nova: pra animar, use `match` + `playCount`. */
  playCount: number;
  winners: string[];
  endReason: CamelioEndReason | null;
}
