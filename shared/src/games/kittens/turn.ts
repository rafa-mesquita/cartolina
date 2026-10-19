import { kittensKindOf } from './cards';
import { KITTENS_LOG_SIZE, type KittensEvent, type KittensState } from './types';

/** Acrescenta ao diário (só as últimas KITTENS_LOG_SIZE ficam). `seenBy`: quem vê a carta do evento (null = todos). */
export function logged(state: KittensState, ev: KittensEvent, seenBy: string[] | null = null): KittensState {
  return { ...state, log: [...state.log, { n: state.seq, ev, seenBy }].slice(-KITTENS_LOG_SIZE), seq: state.seq + 1 };
}

/** Próximo vivo depois de `from`, na ordem dos assentos (`from` pode já ter saído). */
export function nextAlive(state: KittensState, from: string): string | null {
  const order = state.players;
  const start = order.indexOf(from);
  for (let k = 1; k <= order.length; k++) {
    const p = order[(start + k) % order.length]!;
    if (p !== from && state.alive.includes(p)) return p;
  }
  return null;
}

/** A vez vai pra `next` com `owed` turnos; o Espiar de quem jogava some. */
export function passTo(state: KittensState, next: string | null, owed: number): KittensState {
  return { ...state, current: next, owed, peek: null };
}

/** Gasta 1 turno de quem está na vez (comprar, Pular, Cafuné); acabaram os turnos, passa a vez. */
export function spendTurn(state: KittensState): KittensState {
  if (state.owed > 1) return { ...state, owed: state.owed - 1, peek: null };
  return passTo(state, nextAlive(state, state.current!), 1);
}

export function tatusIn(cards: readonly string[]): number {
  return cards.filter((c) => kittensKindOf(c) === 'tatubum').length;
}

/** Sobrou 1 vivo (ou ninguém): fim de jogo. */
export function checkWin(state: KittensState): KittensState {
  if (state.alive.length > 1) return state;
  const winner = state.alive[0] ?? null;
  const ended: KittensState = { ...state, phase: 'gameover', winner, current: null, owed: 0, pending: null, choice: null, peek: null };
  return winner === null ? ended : logged(ended, { t: 'win', by: winner });
}

/**
 * `p` sai da partida (explodiu ou caiu de vez): a mão (e `extraOut`, ex.: o tatu que explodiu) vai pra fora do jogo.
 * Se o monte ficou com mais tatus (contando o que está sendo escondido) que vivos − 1 (quem caiu de vez), um tatu
 * sai também. Se era a vez de `p`, a vez passa pro próximo vivo com 1 turno (os turnos devidos se perdem).
 */
export function eliminate(state: KittensState, p: string, extraOut: string[] = []): KittensState {
  const alive = state.alive.filter((x) => x !== p);
  let draw = state.draw;
  let peek = state.peek;
  let out = [...state.out, ...extraOut, ...(state.hands[p] ?? [])];
  // O tatu que alguém está escondendo (Cafuné) ainda não voltou pro monte, mas conta.
  const held = state.choice?.kind === 'cafune' ? 1 : 0;
  if (tatusIn(draw) > 0 && tatusIn(draw) + held > alive.length - 1) {
    const i = draw.findIndex((c) => kittensKindOf(c) === 'tatubum');
    out = [...out, draw[i]!];
    draw = draw.filter((_, k) => k !== i);
    peek = null; // o topo do monte pode ter mudado: o Espiar de quem joga ficaria desatualizado
  }
  let next: KittensState = { ...state, alive, draw, out, peek, hands: { ...state.hands, [p]: [] } };
  if (state.current === p) next = passTo(next, nextAlive(next, p), 1);
  return checkWin(next);
}
