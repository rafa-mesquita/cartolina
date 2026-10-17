import type { KitId, Work } from './works';

export const PICTURES_MIN_PLAYERS = 3;
export const PICTURES_MAX_PLAYERS = 6;
/** Cada um usa cada um dos 6 kits uma vez. */
export const PICTURES_ROUNDS = 6;
/** Tempo pra quem falta, depois que metade da mesa (arredondando pra cima) ficou pronta ou confirmou. */
export const PICTURES_COUNTDOWN_MS = 30_000;

/** Coordenadas da grade, linha por linha: índice = linha × 4 + coluna (A1 é o canto de cima à esquerda). */
export const COORDS = [
  'A1', 'B1', 'C1', 'D1',
  'A2', 'B2', 'C2', 'D2',
  'A3', 'B3', 'C3', 'D3',
  'A4', 'B4', 'C4', 'D4',
] as const;
export type Coord = (typeof COORDS)[number];

export type PicturesPhase = 'lobby' | 'building' | 'guessing' | 'reveal' | 'gameover';

/** O que aconteceu na rodada revelada (para animar e mostrar). */
export interface PicturesRoundResult {
  round: number;
  /** Artistas com obra, na ordem dos assentos: a ordem da revelação. */
  order: string[];
  secrets: Record<string, Coord>;
  kits: Record<string, KitId>;
  works: Record<string, Work>;
  /** palpiteiro → artista → coordenada (valem os colados quando a fase fechou, confirmados ou não). */
  guesses: Record<string, Record<string, Coord>>;
  /** artista → quem acertou a obra dele */
  correct: Record<string, string[]>;
  /** Pontos ganhos nesta rodada. */
  gained: Record<string, number>;
}

export interface PicturesState {
  phase: PicturesPhase;
  /** Todos da partida, na ordem dos assentos no "começar" (o assento define o kit). Quem entra depois espera a próxima. */
  players: string[];
  /** Quem joga a rodada atual (ativos quando ela começou). */
  inRound: string[];
  scores: Record<string, number>;
  /** Rodada atual, de 0 a PICTURES_ROUNDS - 1. */
  round: number;
  /** 16 ids de foto, na ordem de COORDS. Fixa a partida toda. */
  grid: string[];
  /** Fichas que sobraram no saquinho (as tiradas saem pela partida inteira). */
  bag: Coord[];
  /** jogador → coordenada secreta da rodada (pode repetir entre jogadores). */
  secrets: Record<string, Coord>;
  /** jogador → kit da rodada. */
  kits: Record<string, KitId>;
  /** jogador → último rascunho recebido (na montagem) ou obra congelada (depois). Sem entrada = obra em branco. */
  works: Record<string, Work>;
  /** Montagem: quem está pronto. */
  ready: string[];
  /** palpiteiro → artista → coordenada */
  guesses: Record<string, Record<string, Coord>>;
  /** Palpite: quem confirmou. */
  confirmed: string[];
  /** Fim da contagem de 30 s da fase atual (ms), ou null se não disparou. */
  countdownEndsAt: number | null;
  result: PicturesRoundResult | null;
  winners: string[];
  /** Menos de 3 ativos na rodada: a fase não fecha até voltar gente. */
  paused: boolean;
}

export type PicturesAction =
  | { type: 'start' }
  | { type: 'draft'; work: Work }
  | { type: 'ready'; on: boolean }
  | { type: 'guess'; artist: string; coord: Coord | null }
  | { type: 'confirm' }
  | { type: 'hurry' }
  | { type: 'next' }
  | { type: 'again' }
  | { type: 'lobby' };

export interface PicturesView {
  phase: PicturesPhase;
  players: string[];
  inRound: string[];
  scores: Record<string, number>;
  round: number;
  rounds: number;
  grid: string[];
  kits: Record<string, KitId>;
  ready: string[];
  confirmed: string[];
  countdownEndsAt: number | null;
  paused: boolean;
  winners: string[];
  /** Sua coordenada secreta (null pra espectador). */
  mySecret: Coord | null;
  /** Montagem: só a sua. Do palpite em diante: todas. */
  works: Record<string, Work>;
  /** Seus palpites (artista → coordenada). */
  myGuesses: Record<string, Coord>;
  /** Só na revelação e no fim de jogo. */
  result: PicturesRoundResult | null;
}
