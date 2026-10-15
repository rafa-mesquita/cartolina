export type ItoMode = 'livre' | 'campanha';
export type ItoPhase = 'lobby' | 'theme' | 'sorting' | 'reveal';
/** Campanha: `level_failed` = errou com vida sobrando, o grupo repete o mesmo nível. */
export type ItoOutcome = 'round_won' | 'round_lost' | 'level_cleared' | 'level_failed' | 'won' | 'lost';

export interface Theme {
  titulo: string;
  min: string;
  max: string;
}

export interface ItoCard {
  id: string;
  owner: string;
  value: number;
  clue: string;
}

export interface RevealEntry {
  cardId: string;
  owner: string;
  value: number;
  error: boolean;
}

export interface ItoState {
  phase: ItoPhase;
  mode: ItoMode;
  /** Participantes da rodada atual, na ordem dos assentos. */
  players: string[];
  level: number;
  lives: number;
  theme: Theme | null;
  usedThemes: number[];
  cards: Record<string, ItoCard>;
  /** Ids das cartas na fila, da esquerda (1) para a direita (100). */
  row: string[];
  ready: string[];
  reveal: RevealEntry[] | null;
  outcome: ItoOutcome | null;
}

export type ItoAction =
  | { type: 'setMode'; mode: ItoMode }
  | { type: 'start' }
  | { type: 'rerollTheme' }
  | { type: 'customTheme'; theme: Theme }
  | { type: 'beginRound' }
  | { type: 'place'; cardId: string; index: number }
  | { type: 'return'; cardId: string }
  | { type: 'clue'; cardId: string; text: string }
  | { type: 'ready'; ready: boolean }
  | { type: 'forceReveal' }
  | { type: 'next' }
  | { type: 'lobby' };

export interface ItoCardView {
  id: string;
  owner: string;
  clue: string;
  /** `null` quando o número é segredo para quem está vendo. */
  value: number | null;
}

export interface ItoView extends Omit<ItoState, 'cards' | 'usedThemes'> {
  cards: Record<string, ItoCardView>;
}

export const CAMPAIGN_LIVES = 3;
export const CAMPAIGN_LEVELS = 3;
