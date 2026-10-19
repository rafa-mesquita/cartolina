import type { GameModule } from '../../game';
import { applyCoupAction, initialCoupState, settleCoup } from './rules';
import { actError, alive, canBlock, canChallenge, hiddenOf, own, treasury } from './table';
import {
  COUP_ACTION_KINDS,
  COUP_BLOCKERS,
  COUP_TARGETED,
  type CoupAction,
  type CoupCan,
  type CoupSeat,
  type CoupState,
  type CoupView,
} from './types';

const NOTHING: CoupCan = { act: [], challenge: false, block: [], pass: false, lose: false, keep: 0 };

/** O que `me` pode fazer agora (a mesa mostra só esses botões; as regras conferem de novo). */
function canFor(state: CoupState, me: string | null): CoupCan {
  if (me === null) return NOTHING;
  switch (state.phase) {
    case 'turn': {
      if (state.turn !== me) return NOTHING;
      const someone = alive(state).find((p) => p !== me) ?? null;
      return { ...NOTHING, act: COUP_ACTION_KINDS.filter((k) => actError(state, me, k, COUP_TARGETED[k] ? someone : null) === null) };
    }
    case 'reaction': {
      const w = state.window!;
      if (!w.eligible.includes(me) || w.passed.includes(me)) return NOTHING;
      return {
        ...NOTHING,
        pass: true,
        challenge: canChallenge(state),
        block: canBlock(state, me) ? [...COUP_BLOCKERS[state.declared!.kind]] : [],
      };
    }
    case 'losing':
      return { ...NOTHING, lose: state.loss?.player === me };
    case 'exchange':
      return { ...NOTHING, keep: state.turn === me ? hiddenOf(state, me).length : 0 };
    default:
      return NOTHING;
  }
}

function seatOf(state: CoupState, id: string): CoupSeat {
  const hand = own(state.hands, id);
  const cards = hand?.cards ?? [];
  return {
    id,
    coins: hand?.coins ?? 0,
    hidden: cards.filter((c) => !c.revealed).length,
    revealed: cards.filter((c) => c.revealed).map((c) => c.character),
    out: state.out.includes(id),
  };
}

/**
 * Única fronteira de segredo do Cúpi: cartas viradas pra baixo dos outros, o baralho e as compradas na troca
 * nunca saem daqui. A visão compartilha arrays/objetos com o estado (é serializada no socket); quem consome não deve mutar.
 */
export function coupViewFor(state: CoupState, viewerId: string | null): CoupView {
  const me = viewerId !== null && state.players.includes(viewerId) ? viewerId : null;
  return {
    phase: state.phase,
    match: state.match,
    players: state.players,
    seats: state.players.map((id) => seatOf(state, id)),
    turn: state.turn,
    declared: state.declared,
    block: state.block,
    window: state.window,
    loss: state.loss ? { player: state.loss.player, reason: state.loss.reason } : null,
    deckSize: state.deck.length,
    treasury: treasury(state),
    out: state.out,
    winner: state.winner,
    winnerCards: state.phase === 'over' && state.winner !== null ? hiddenOf(state, state.winner) : [],
    wins: state.wins,
    log: state.log,
    myCards: me !== null ? hiddenOf(state, me) : [],
    myDrawn: me !== null && state.phase === 'exchange' && state.turn === me ? state.drawn : [],
    can: canFor(state, me),
  };
}

/** O Cúpi só tem prazo com a janela de reação aberta. */
export function coupNextDeadline(state: CoupState): number | null {
  return state.phase === 'reaction' && state.window !== null ? state.window.endsAt : null;
}

export const coup: GameModule<CoupState, CoupAction, CoupView> = {
  id: 'coup',
  initialState: () => initialCoupState(),
  applyAction: applyCoupAction,
  viewFor: coupViewFor,
  onPresenceChange: settleCoup,
  nextDeadline: coupNextDeadline,
};
