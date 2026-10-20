import type { z } from 'zod';
import type { GameModule } from '../game';
import { MAX_PLAYERS, MIN_PLAYERS } from '../players';
import { camelioActionSchema } from './camelio/schema';
import { CAMELIO_MAX_PLAYERS, CAMELIO_MIN_PLAYERS, type CamelioAction, type CamelioState, type CamelioView } from './camelio/types';
import { camelio } from './camelio/view';
import { dixitActionSchema } from './dixit/schema';
import { DIXIT_MIN_PLAYERS, type DixitAction, type DixitState, type DixitView } from './dixit/types';
import { dixit } from './dixit/view';
import { kittensActionSchema } from './kittens/schema';
import { KITTENS_MAX_PLAYERS, KITTENS_MIN_PLAYERS, type KittensAction, type KittensState, type KittensView } from './kittens/types';
import { kittens } from './kittens/view';
import { ito } from './ito/rules';
import { itoActionSchema } from './ito/schema';
import type { ItoAction, ItoState, ItoView } from './ito/types';
import { picturesActionSchema } from './pictures/schema';
import { PICTURES_MAX_PLAYERS, PICTURES_MIN_PLAYERS, type PicturesAction, type PicturesState, type PicturesView } from './pictures/types';
import { pictures } from './pictures/view';

export const GAME_IDS = ['ito', 'dixit', 'pictures', 'kittens', 'camelio'] as const;
export type GameId = (typeof GAME_IDS)[number];
export type GameState = ItoState | DixitState | PicturesState | KittensState | CamelioState;
export type GameView = ItoView | DixitView | PicturesView | KittensView | CamelioView;
export type GameAction = ItoAction | DixitAction | PicturesAction | KittensAction | CamelioAction;

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
  pictures: defineGame({
    id: 'pictures',
    module: pictures,
    actionSchema: picturesActionSchema,
    minPlayers: PICTURES_MIN_PLAYERS,
    maxPlayers: PICTURES_MAX_PLAYERS,
    // Cursor em cima de uma foto entregaria o palpite.
    liveCursors: false,
    // O histórico do Retratim (com o museu) vem no Plano R4.
    recordsHistory: false,
  }),
  kittens: defineGame({
    id: 'kittens',
    module: kittens,
    actionSchema: kittensActionSchema,
    minPlayers: KITTENS_MIN_PLAYERS,
    maxPlayers: KITTENS_MAX_PLAYERS,
    // Cursor em cima de uma carta da mão entregaria a jogada.
    liveCursors: false,
    // O histórico do Tatubum vem num plano próprio.
    recordsHistory: false,
  }),
  camelio: defineGame({
    id: 'camelio',
    module: camelio,
    actionSchema: camelioActionSchema,
    minPlayers: CAMELIO_MIN_PLAYERS,
    maxPlayers: CAMELIO_MAX_PLAYERS,
    // Tudo é aberto na mesa (só o topo do monte é segredo, e o cursor não entrega nada).
    liveCursors: true,
    // O histórico do Cama-Leão vem no Plano C4.
    recordsHistory: false,
  }),
};

export function isGameId(value: unknown): value is GameId {
  return typeof value === 'string' && (GAME_IDS as readonly string[]).includes(value);
}
