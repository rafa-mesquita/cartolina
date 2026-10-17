import type { z } from 'zod';
import type { GameModule } from '../game';
import { MAX_PLAYERS, MIN_PLAYERS } from '../players';
import { dixitActionSchema } from './dixit/schema';
import { DIXIT_MIN_PLAYERS, type DixitAction, type DixitState, type DixitView } from './dixit/types';
import { dixit } from './dixit/view';
import { ito } from './ito/rules';
import { itoActionSchema } from './ito/schema';
import type { ItoAction, ItoState, ItoView } from './ito/types';

export const GAME_IDS = ['ito', 'dixit'] as const;
export type GameId = (typeof GAME_IDS)[number];
export type GameState = ItoState | DixitState;
export type GameView = ItoView | DixitView;
export type GameAction = ItoAction | DixitAction;

export interface GameEntry {
  id: GameId;
  module: GameModule<GameState, GameAction, GameView>;
  /** Valida a ação recebida pelo WebSocket antes de chegar nas regras. */
  actionSchema: z.ZodTypeAny;
  minPlayers: number;
  maxPlayers: number;
  /** Cursores e ping ao vivo. No Dixit, cursor em cima de uma carta entregaria o voto. */
  liveCursors: boolean;
  /** Rodadas reveladas vão para o histórico do jogo (`GET /history/:game`). */
  recordsHistory: boolean;
}

/** Amarra regras e schema do MESMO jogo (o compilador recusa par trocado) e apaga os tipos uma vez só. */
function defineGame<S extends GameState, A extends GameAction, V extends GameView>(entry: {
  id: GameId;
  module: GameModule<S, A, V>;
  actionSchema: z.ZodType<A, z.ZodTypeDef, unknown>;
  minPlayers: number;
  maxPlayers: number;
  liveCursors: boolean;
  recordsHistory: boolean;
}): GameEntry {
  return entry as unknown as GameEntry;
}

export const GAMES: Record<GameId, GameEntry> = {
  ito: defineGame({
    id: 'ito',
    module: ito,
    actionSchema: itoActionSchema,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    liveCursors: true,
    recordsHistory: true,
  }),
  dixit: defineGame({
    id: 'dixit',
    module: dixit,
    actionSchema: dixitActionSchema,
    minPlayers: DIXIT_MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    liveCursors: false,
    recordsHistory: true,
  }),
};

export function isGameId(value: unknown): value is GameId {
  return typeof value === 'string' && (GAME_IDS as readonly string[]).includes(value);
}
