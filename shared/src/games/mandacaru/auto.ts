import type { GameContext } from '../../game';
import { randomInt, type Rng } from '../../rng';
import { geometry, pips } from './board';
import { houseSpots, logged, roadSpots, type MandacaruResult } from './build';
import { discard, moveCarcara, randomCards, startSeven, steal, victims } from './carcara';
import { buildRoad, checkWin, passTurn, placeHouse, placeRoad, rollDice } from './turn';
import { MANDACARU_DISCARD_MS, MANDACARU_TURN_MS, type MandacaruState } from './types';

/** Teto de passos automáticos por chamada (a mesa vazia congela; isto é só uma rede contra laço infinito). */
const AUTO_STEPS = 1000;

const away = (ctx: GameContext, player: string): boolean => !ctx.active.includes(player);
const late = (state: MandacaruState, ctx: GameContext): boolean => state.turnEndsAt !== null && ctx.now >= state.turnEndsAt;
const pick = <T>(rng: Rng, items: readonly T[]): T => items[randomInt(rng, items.length)]!;
/** Jogada automática recusada (não deveria acontecer): fica parado em vez de quebrar a sala. */
const or = (res: MandacaruResult, state: MandacaruState): MandacaruState => (res.ok ? res.state : state);

/** Canto livre que mais rende (soma das chances dos números em volta); empate = sorteado. */
function bestHouse(state: MandacaruState, player: string, rng: Rng): number | null {
  const g = geometry();
  const spots = houseSpots(state, player, true);
  if (spots.length === 0) return null;
  const score = (v: number) => g.vertices[v]!.hexes.reduce((n, h) => n + pips(state.layout?.hexes[h]?.number ?? null), 0);
  const top = Math.max(...spots.map(score));
  return pick(rng, spots.filter((v) => score(v) === top));
}

/** Terreno do Carcará automático: um com casa/vila de outro e nenhuma sua; senão qualquer outro. */
function carcaraTarget(state: MandacaruState, player: string, rng: Rng): number {
  const g = geometry();
  const others = g.hexes.map((_, h) => h).filter((h) => h !== state.carcara);
  const good = others.filter((h) => {
    const owners = g.hexes[h]!.corners.map((v) => state.buildings[v]?.owner).filter((o) => o !== undefined);
    return owners.some((o) => o !== player) && !owners.includes(player);
  });
  return pick(rng, good.length > 0 ? good : others);
}

/** Descarte: quem está ausente, ou todos quando o prazo acabou, descarta cartas sorteadas. */
function autoDiscard(state: MandacaruState, ctx: GameContext): MandacaruState {
  const expired = state.discardEndsAt !== null && ctx.now >= state.discardEndsAt;
  let s = state;
  for (const p of Object.keys(state.discards)) {
    if (!expired && !away(ctx, p)) continue;
    s = or(discard(s, p, randomCards(ctx.rng, s.hands[p]!.res, s.discards[p]!)), s);
  }
  return s;
}

/**
 * Fase principal: quem está ausente (fora quem está na vez) conta como "não" na oferta aberta, se ainda não
 * respondeu, e perde a proposta dele. Devolve o mesmo objeto se não há o que mudar.
 */
function tradeAway(state: MandacaruState, ctx: GameContext): MandacaruState {
  const gone = state.players.filter((p) => p !== state.turn && away(ctx, p));
  if (gone.length === 0) return state;
  const offer = state.offer;
  const silent = offer === null ? [] : gone.filter((p) => !offer.accepted.includes(p) && !offer.rejected.includes(p));
  const proposals = state.proposals.filter((x) => !gone.includes(x.from));
  if (silent.length === 0 && proposals.length === state.proposals.length) return state;
  return {
    ...state,
    offer: offer === null || silent.length === 0 ? offer : { ...offer, rejected: [...offer.rejected, ...silent] },
    proposals: proposals.length === state.proposals.length ? state.proposals : proposals,
  };
}

/** Com o relógio parado (mesa vazia) e alguém de volta: prazos novos a partir de agora. */
function resumeClock(state: MandacaruState, ctx: GameContext): MandacaruState {
  if (state.turnEndsAt !== null) return state;
  const discardEndsAt = state.phase === 'discard' && state.discardEndsAt === null ? ctx.now + MANDACARU_DISCARD_MS : state.discardEndsAt;
  return { ...state, turnEndsAt: ctx.now + MANDACARU_TURN_MS, discardEndsAt };
}

/**
 * Mesa vazia (nenhum jogador da partida ativo): nada anda. Se um prazo já venceu, o relógio para (prazos
 * null), senão o alarme acordaria no passado sem parar; volta com `resumeClock` quando alguém chega.
 */
function frozen(state: MandacaruState, ctx: GameContext): MandacaruState {
  const turnOver = late(state, ctx);
  const discardOver = state.phase === 'discard' && state.discardEndsAt !== null && ctx.now >= state.discardEndsAt;
  if (!turnOver && !discardOver) return state;
  return { ...state, turnEndsAt: null, discardEndsAt: null };
}

/**
 * Um passo: fecha o prazo do descarte e joga por quem está ausente ou estourou os 5 min do turno.
 * Devolve o mesmo objeto se não há o que fazer.
 */
function settleOnce(state: MandacaruState, ctx: GameContext): MandacaruState {
  if (state.phase === 'lobby' || state.phase === 'over') return state;
  if (!state.players.some((p) => !away(ctx, p))) return frozen(state, ctx);
  const resumed = resumeClock(state, ctx);
  if (resumed !== state) return resumed;
  if (state.phase === 'discard') return autoDiscard(state, ctx);
  const p = state.turn;
  if (p === null) return state;
  if (state.phase === 'main') {
    const traded = tradeAway(state, ctx);
    if (traded !== state) return traded;
  }
  const timeout = late(state, ctx);
  if (!timeout && !away(ctx, p)) return state;
  // O diário marca o estouro do prazo uma vez por vez: no passo que termina a vez.
  const ending = (s: MandacaruState) => (timeout ? logged(s, { t: 'timeout', player: p }) : s);
  switch (state.phase) {
    case 'setup': {
      const house = state.setup!.house;
      if (house === null) {
        const v = bestHouse(state, p, ctx.rng);
        return v === null ? state : or(placeHouse(state, p, v), state);
      }
      const spots = roadSpots(state, p, house);
      return spots.length === 0 ? state : or(placeRoad(ending(state), p, pick(ctx.rng, spots), ctx), state);
    }
    case 'roll':
      return rollDice(state, p, ctx, startSeven);
    case 'carcara':
      return or(moveCarcara(state, p, carcaraTarget(state, p, ctx.rng), ctx), state);
    case 'steal': {
      const who = victims(state, state.carcara, p);
      return who.length === 0 ? { ...state, phase: state.afterCarcara } : or(steal(state, p, pick(ctx.rng, who), ctx), state);
    }
    case 'mutirao': {
      const spots = roadSpots(state, p);
      return spots.length === 0 ? { ...state, phase: 'main', mutiraoLeft: 0 } : or(buildRoad(state, p, pick(ctx.rng, spots)), state);
    }
    case 'main':
      return passTurn(ending(state), ctx);
  }
}

/**
 * Fecha prazos e joga pelos ausentes até não haver o que fazer. Roda depois de cada ação e a cada `tick` da sala
 * (presença e alarme no prazo). Devolve o MESMO objeto quando nada muda (o servidor compara referência).
 */
export function settleMandacaru(input: MandacaruState, ctx: GameContext): MandacaruState {
  let state = input;
  for (let i = 0; i < AUTO_STEPS; i++) {
    const next = checkWin(settleOnce(state, ctx));
    if (next === state) return state;
    state = next;
  }
  return state;
}
