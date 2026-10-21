import { kittensKindOf } from './cards';
import { KITTENS_LOG_SIZE, type KittensEvent, type KittensExitHow, type KittensPlayerStats, type KittensState } from './types';

/** Soma 1 no contador `key` de `p` (Nem vem! dados ou Desarmes usados), pro histórico. */
export function counted(state: KittensState, p: string, key: keyof KittensPlayerStats): KittensState {
  const mine = Object.hasOwn(state.stats, p) ? state.stats[p]! : { nopes: 0, defuses: 0 };
  return { ...state, stats: { ...state.stats, [p]: { ...mine, [key]: mine[key] + 1 } } };
}

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

/**
 * A vez vai pra `next` com `owed` turnos. As espiadas ficam (pedido do Rafa, 2026-10-20): o Espiar fica à mostra até as
 * cartas saírem do monte ou o monte mudar de ordem.
 */
export function passTo(state: KittensState, next: string | null, owed: number): KittensState {
  return { ...state, current: next, owed };
}

/** Gasta 1 turno de quem está na vez (comprar, Pular, Cafuné); acabaram os turnos, passa a vez. */
export function spendTurn(state: KittensState): KittensState {
  if (state.owed > 1) return { ...state, owed: state.owed - 1 };
  return passTo(state, nextAlive(state, state.current!), 1);
}

/**
 * `cards` saíram do monte sem mexer na ordem do resto (compradas do topo, puxadas do meio, a de cima indo pro fundo):
 * saem de todas as espiadas. O que sobra de cada espiada continua sendo o topo do monte, na ordem. Espiada que fica
 * vazia some. Devolve o MESMO estado quando nenhuma espiada tinha essas cartas.
 */
export function unpeek(s: KittensState, cards: readonly string[]): KittensState {
  const gone = new Set(cards);
  if (!Object.values(s.peeks).some((xs) => xs.some((c) => gone.has(c)))) return s;
  const kept = Object.entries(s.peeks).map(([p, xs]) => [p, xs.filter((c) => !gone.has(c))] as const);
  return { ...s, peeks: Object.fromEntries(kept.filter(([, xs]) => xs.length > 0)) };
}

/**
 * O monte mudou de ordem perto do topo (Embaralhar, Desarme escondendo o tatu, Feitiço pondo a de baixo no topo): ninguém
 * vê mais nada. No Desarme apaga de todos mesmo se o tatu foi pro fundo: apagar só às vezes contaria onde ele foi.
 */
export function clearPeeks(s: KittensState): KittensState {
  return Object.keys(s.peeks).length === 0 ? s : { ...s, peeks: {} };
}

/** `p` saiu da partida: a espiada dele some. */
export function dropPeek(s: KittensState, p: string): KittensState {
  if (!Object.hasOwn(s.peeks, p)) return s;
  return { ...s, peeks: Object.fromEntries(Object.entries(s.peeks).filter(([x]) => x !== p)) };
}

/** O tatu que alguém comprou e ainda não voltou pro monte (escolhendo o Desarme ou onde esconder), ou null. */
export function heldTatu(choice: KittensState['choice']): string | null {
  return choice?.kind === 'tatu' || choice?.kind === 'cafune' ? choice.tatu : null;
}

export function tatusIn(cards: readonly string[]): number {
  return cards.filter((c) => kittensKindOf(c) === 'tatubum').length;
}

/**
 * Sobrou 1 vivo (ou ninguém): fim de jogo. Nenhuma carta some: a carta no ar e os Nem vem! vão pro descarte, e o tatu
 * que estava sendo escondido (Cafuné) vai pra fora do jogo. Ninguém continua cego (as cartas na frente ficam onde estão).
 */
export function checkWin(state: KittensState): KittensState {
  if (state.alive.length > 1) return state;
  const winner = state.alive[0] ?? null;
  const { pending, choice } = state;
  const held = heldTatu(choice);
  const ended: KittensState = {
    ...state,
    phase: 'gameover',
    winner,
    current: null,
    owed: 0,
    discard: pending ? [...state.discard, ...pending.play.cards, ...pending.nopes.map((n) => n.card)] : state.discard,
    out: held !== null ? [...state.out, held] : state.out,
    blind: [],
    pending: null,
    choice: null,
    peeks: {},
  };
  return winner === null ? ended : logged(ended, { t: 'win', by: winner });
}

/**
 * `p` sai da partida (explodiu ou caiu de vez): a mão, as cartas na frente dele (Tatu Latidor) e `extraOut` (ex.: o tatu
 * que explodiu) vão pra fora do jogo, e ele deixa de estar cego. Se o monte ficou com mais tatus (contando o que está
 * sendo escondido) que vivos − 1 (quem caiu de vez), um tatu sai também (e sai das espiadas). A espiada de `p` some.
 * Se era a vez de `p`, a vez passa pro próximo vivo com 1 turno (os turnos devidos se perdem). `how` entra na fila de
 * saídas (`exits`) do histórico.
 */
export function eliminate(state: KittensState, p: string, how: KittensExitHow, extraOut: string[] = []): KittensState {
  const alive = state.alive.filter((x) => x !== p);
  let draw = state.draw;
  let out = [...state.out, ...extraOut, ...(state.hands[p] ?? []), ...(state.front[p] ?? [])];
  let removed: string | null = null;
  // O tatu que alguém comprou (decidindo o Desarme ou escondendo) ainda não voltou pro monte, mas conta.
  const held = heldTatu(state.choice) !== null ? 1 : 0;
  if (tatusIn(draw) > 0 && tatusIn(draw) + held > alive.length - 1) {
    const i = draw.findIndex((c) => kittensKindOf(c) === 'tatubum');
    removed = draw[i]!;
    out = [...out, removed];
    draw = draw.filter((_, k) => k !== i);
  }
  const front = (state.front[p]?.length ?? 0) > 0 ? { ...state.front, [p]: [] } : state.front;
  const blind = state.blind.includes(p) ? state.blind.filter((x) => x !== p) : state.blind;
  // A espiada de quem sai some; o tatu tirado do monte sai das espiadas dos outros (a ordem do resto não muda).
  const exits = [...state.exits, { player: p, how }];
  const base: KittensState = { ...state, alive, draw, out, front, blind, exits, hands: { ...state.hands, [p]: [] } };
  let next = unpeek(dropPeek(base, p), removed !== null ? [removed] : []);
  if (state.current === p) next = passTo(next, nextAlive(next, p), 1);
  return checkWin(next);
}

/** Passa `card` da mão de `from` pra de `to` (no fim da mão: quem está cego não sabe qual ficha é a nova). */
export function moveCard(s: KittensState, from: string, to: string, card: string): KittensState {
  return { ...s, hands: { ...s.hands, [from]: s.hands[from]!.filter((c) => c !== card), [to]: [...s.hands[to]!, card] } };
}

/** `p` comprou (do monte, pelo Tamanduá ou ficando com a carta do Feitiço): se estava cego, volta a ver a mão. */
export function cure(s: KittensState, p: string): KittensState {
  return s.blind.includes(p) ? logged({ ...s, blind: s.blind.filter((x) => x !== p) }, { t: 'cured', by: p }) : s;
}
