/**
 * Bots do Cúpi SÓ PARA DESENVOLVIMENTO (o teste `import.meta.env.DEV` no `BotControls` tira este módulo do build de produção).
 * Cada bot abre o próprio WebSocket e joga como uma pessoa: age só pelo que a visão dele mostra (nunca espia o estado).
 * Nunca faz ações de anfitrião (começar, jogar de novo): isso fica com a pessoa que está testando.
 * Porta de `prototipo/coup/bots.js`. Os nomes começam com "Bot ", então a partida não vai pro histórico.
 */
import {
  COUP_CLAIM,
  COUP_TARGETED,
  PLAYER_COLORS,
  isCoupRoomView,
  mulberry32,
  type CoupActionKind,
  type CoupCharacter,
  type CoupRoomView,
  type GameAction,
} from '@cartolina/shared';
import { getRoomInfo } from '../net/api';
import { wsUrl } from '../net/config';
import { RoomConnection } from '../net/connection';
import { BOT_NAMES } from './bots';

/** Quanto esperar, depois de agir, antes de achar que a ação se perdeu e tentar de novo. */
const RETRY_MS = 4000;
/** Depois de tantas tentativas na mesma etapa o bot troca a semente do sorteio (a ação pode ter sido recusada). */
const TRIES_PER_SEED = 2;
/** Tentativas no total numa mesma etapa; passou disso, o bot desiste dela. */
export const MAX_TRIES = 6;

/** Fica com as melhores, nesta ordem de preferência. */
const PREF: readonly CoupCharacter[] = ['duke', 'captain', 'assassin', 'contessa', 'ambassador'];
/** Peso de uma ação que é blefe (a honesta pesa 3). */
const BLUFF = 0.6;
const HONEST = 3;
/** Chance de duvidar, antes dos fatores. */
const DOUBT = 0.15;
/** Chance de blefar um bloqueio: sendo o alvo; numa ajuda externa. */
const BLOCK_BLUFF_TARGET = 0.25;
const BLOCK_BLUFF_AID = 0.1;
/** Com tantas moedas ou mais (e golpe à mão), o golpe sai em 70% das vezes. */
const COUP_AT = 7;
const COUP_CHANCE = 0.7;
/** Chance de não responder na janela (deixa o tempo correr). */
const QUIET = 0.15;

type Rng = () => number;
const pickOne = <T>(rng: Rng, arr: readonly T[]): T => arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))]!;
const count = <T>(arr: readonly T[], x: T): number => arr.filter((y) => y === x).length;
const between = (rng: Rng, lo: number, hi: number): number => lo + rng() * (hi - lo);
/** Os candidatos que empatam na maior nota (o sorteio desempata). */
function best<T>(list: readonly T[], score: (x: T) => number): T[] {
  const top = Math.max(...list.map(score));
  return list.filter((x) => score(x) === top);
}

export interface CoupDecision {
  key: string;
  delay: number;
  actions: GameAction[];
}

/** Perde a carta de que tem mais cópias; empate, ao acaso. */
function chooseLoss(view: CoupRoomView, rng: Rng): GameAction {
  const mine = view.game.myCards;
  return { type: 'lose', card: pickOne(rng, best([...new Set(mine)], (c) => count(mine, c))) };
}

/** Fica com as melhores, na ordem de preferência. */
function chooseExchange(view: CoupRoomView): GameAction {
  const g = view.game;
  const pool = [...g.myCards, ...g.myDrawn].sort((a, b) => PREF.indexOf(a) - PREF.indexOf(b));
  return { type: 'exchange', keep: pool.slice(0, g.can.keep) };
}

/** Extorquir: quem tem mais moedas. Golpe e assassinato: mais cartas viradas pra baixo, depois mais moedas. */
function chooseTarget(view: CoupRoomView, kind: CoupActionKind, rng: Rng): string | null {
  const seats = view.game.can.targets.flatMap((id) => view.game.seats.filter((s) => s.id === id));
  if (seats.length === 0) return null;
  const score = kind === 'steal' ? (s: (typeof seats)[number]) => s.coins : (s: (typeof seats)[number]) => s.hidden * 100 + s.coins;
  return pickOne(rng, best(seats, score)).id;
}

function chooseAct(view: CoupRoomView, rng: Rng): GameAction | null {
  const g = view.game;
  const usable = g.can.act.filter((k) => !COUP_TARGETED[k] || g.can.targets.length > 0);
  if (usable.length === 0) return null;
  const targeted = (kind: CoupActionKind): GameAction => {
    const target = chooseTarget(view, kind, rng);
    return target === null ? { type: 'act', kind } : { type: 'act', kind, target };
  };
  // com 10+ moedas o golpe é obrigatório; com 7+, sai em 70% das vezes
  if (usable.length === 1 && usable[0] === 'coup') return targeted('coup');
  const myCoins = g.seats.find((s) => s.id === view.you)?.coins ?? 0;
  if (usable.includes('coup') && myCoins >= COUP_AT && rng() < COUP_CHANCE) return targeted('coup');
  // honestas (sem personagem, ou com personagem que tem na mão) pesam 3; blefes pesam 0,6
  const weighted = usable.map((kind) => {
    const claim = COUP_CLAIM[kind];
    return { kind, w: claim === null || g.myCards.includes(claim) ? HONEST : BLUFF };
  });
  let roll = rng() * weighted.reduce((sum, x) => sum + x.w, 0);
  let chosen = weighted[weighted.length - 1]!.kind;
  for (const x of weighted) {
    roll -= x.w;
    if (roll < 0) {
      chosen = x.kind;
      break;
    }
  }
  return COUP_TARGETED[chosen] ? targeted(chosen) : { type: 'act', kind: chosen };
}

/** Reação a uma janela: bloqueia, duvida ou deixa (ou fica quieto: ação vazia). Sempre com `windowId`. */
function chooseReaction(view: CoupRoomView, rng: Rng): GameAction | null {
  const g = view.game, me = view.you;
  const w = g.window, d = g.declared;
  if (!w || !d) return null;
  const windowId = w.id;
  if (g.can.block.length) {
    const owned = g.can.block.find((c) => g.myCards.includes(c));
    if (owned) return { type: 'block', as: owned, windowId };
    const chance = d.target === me ? BLOCK_BLUFF_TARGET : d.kind === 'foreignAid' ? BLOCK_BLUFF_AID : 0;
    if (rng() < chance) return { type: 'block', as: pickOne(rng, g.can.block), windowId };
  }
  if (g.can.challenge) {
    const claim = w.kind === 'block' ? g.block?.as : COUP_CLAIM[d.kind];
    let p = DOUBT;
    if (claim && count(g.myCards, claim) >= 2) p *= 3;
    if (w.kind === 'action' && d.target === me && d.kind === 'assassinate' && g.myCards.length === 1) p *= 2;
    if (rng() < Math.min(p, 0.95)) return { type: 'challenge', windowId };
  }
  // 15% das vezes não responde: deixa o tempo da janela correr
  if (rng() < QUIET) return null;
  return { type: 'pass', windowId };
}

/** A chave da etapa (partida, tamanho do diário, janela) pra quem joga; null pra quem assiste. Sem sorteio. */
export function coupStepKey(view: CoupRoomView): string | null {
  const g = view.game;
  if (!view.you || !g.players.includes(view.you)) return null;
  return `${g.match}:${g.log.length}:${g.window?.id ?? '-'}`;
}

/**
 * O que o bot faz agora (ou null). `key` identifica a etapa, pra não agir duas vezes nela.
 * Uma decisão com `actions` vazias é "ficar quieto nesta janela": o bot não manda nada e o tempo corre.
 * Ordem dos sorteios: a escolha primeiro (alvo, bloquear, duvidar, "não responde"), o atraso por último.
 */
export function decideCoup(view: CoupRoomView, rng: Rng): CoupDecision | null {
  const key = coupStepKey(view);
  if (key === null) return null;
  const g = view.game;
  const can = g.can;
  if (can.lose) return { key, actions: [chooseLoss(view, rng)], delay: between(rng, 900, 2000) };
  if (can.keep > 0) return { key, actions: [chooseExchange(view)], delay: between(rng, 900, 2000) };
  if (can.act.length) {
    const act = chooseAct(view, rng);
    return act ? { key, actions: [act], delay: between(rng, 1200, 3000) } : null;
  }
  if (can.pass) {
    const reaction = chooseReaction(view, rng);
    return { key, actions: reaction ? [reaction] : [], delay: between(rng, 1500, 7000) };
  }
  return null;
}

/** Sorteio estável pra (etapa, bot): a mesma etapa dá sempre a mesma decisão, em qualquer visão dela. */
export function coupKeyRng(key: string, me: string, salt = 0): Rng {
  let h = 2166136261;
  for (const ch of `${key}|${me}${salt ? `#${salt}` : ''}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return mulberry32(h >>> 0);
}

/**
 * `decideCoup` com o sorteio preso à etapa: o bot decide ao agendar e de novo ao disparar,
 * e não "muda de ideia" (ex.: ficar quieto, depois responder) só porque o sorteio girou.
 */
export function decideCoupStable(view: CoupRoomView, tries = 0): CoupDecision | null {
  const key = coupStepKey(view);
  if (key === null) return null;
  return decideCoup(view, coupKeyRng(key, view.you!, saltFor(tries)));
}

/** Semente da tentativa: igual nas primeiras `TRIES_PER_SEED` tentativas da etapa; depois, outra. */
export const saltFor = (tries: number): number => Math.floor(tries / TRIES_PER_SEED);

class CoupBot {
  name: string | null = null;
  color: string | null = null;
  private conn: RoomConnection | null = null;
  private unsub: (() => void) | null = null;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private stopped = false;
  private retrying = false;
  /** Etapa que o bot já agendou (limpa quando ele não tem mais nada a fazer, pra a mesma etapa poder voltar em outra partida). */
  private planned: string | null = null;
  /** Quantas vezes o bot mandou ação na etapa `triesKey` (zera quando a etapa muda). */
  private tries = 0;
  private triesKey: string | null = null;
  private tried = new Set<string>();
  constructor(
    readonly code: string,
    private taken: () => { names: string[]; colors: string[] },
    private onGone: (bot: CoupBot) => void,
  ) {}

  start(): void {
    void getRoomInfo(this.code)
      .catch(() => null)
      .then((info) => {
        if (this.stopped) return;
        const seats = info?.seats ?? [];
        const other = this.taken();
        const names = new Set([...other.names, ...seats.map((s) => s.name)]);
        this.name = BOT_NAMES.find((n) => !names.has(n)) ?? `Bot ${1 + Math.floor(Math.random() * 99)}`;
        [...other.colors, ...seats.map((s) => s.color)].forEach((c) => this.tried.add(c));
        this.color = this.nextColor();
        this.conn = new RoomConnection({ url: wsUrl(this.code), token: crypto.randomUUID(), name: this.name, color: this.color });
        this.unsub = this.conn.subscribe(this.react);
        this.conn.start();
      });
  }

  stop(): void {
    this.stopped = true;
    this.timers.forEach((t) => clearTimeout(t));
    this.timers.clear();
    this.unsub?.();
    this.unsub = null;
    this.conn?.stop();
  }

  private later(ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (!this.stopped) fn();
    }, ms);
    this.timers.add(t);
  }

  private nextColor(): string {
    const c = PLAYER_COLORS.find((x) => !this.tried.has(x)) ?? PLAYER_COLORS[0];
    this.tried.add(c);
    return c;
  }

  private onJoinFailed(error: string | null): void {
    if (this.retrying) return;
    if (error !== 'color_taken' || this.tried.size >= PLAYER_COLORS.length) {
      this.stop();
      this.onGone(this);
      return;
    }
    this.retrying = true;
    this.later(100 + Math.random() * 300, () => {
      this.retrying = false;
      this.color = this.nextColor();
      this.conn?.retryJoin(this.name ?? BOT_NAMES[0]!, this.color);
    });
  }

  private react = (): void => {
    if (this.stopped || !this.conn) return;
    const snap = this.conn.getSnapshot();
    if (snap.status === 'join_failed') return this.onJoinFailed(snap.joinError);
    if (snap.status !== 'joined' || !snap.view || !isCoupRoomView(snap.view)) return;
    const step = coupStepKey(snap.view);
    if (step !== this.triesKey) {
      this.triesKey = step;
      this.tries = 0;
    }
    const d = decideCoupStable(snap.view, this.tries);
    if (!d) {
      this.planned = null;
      return;
    }
    if (this.planned === d.key) return;
    this.planned = d.key;
    // ficar quieto nesta janela: não agenda nada, o tempo corre
    if (d.actions.length === 0) return;
    this.later(d.delay, () => {
      const now = this.conn?.getSnapshot().view;
      if (!now || !isCoupRoomView(now)) return;
      // decide de novo com a visão atual (a janela pode ter mudado enquanto esperava): só manda se a etapa é a mesma
      const again = decideCoupStable(now, this.tries);
      if (again?.key !== d.key) return;
      again.actions.forEach((a) => this.conn?.sendAction(a));
      this.tries++;
      // se a ação se perdeu (ou foi recusada) e a etapa não andou, tenta de novo, com outra semente depois de 2 tentativas;
      // passou de `MAX_TRIES`, desiste da etapa (`planned` fica, então não repete pra sempre)
      this.later(RETRY_MS, () => {
        if (this.planned !== d.key || this.tries >= MAX_TRIES) return;
        this.planned = null;
        this.react();
      });
    });
  };
}

const registry = new Set<CoupBot>();
let version = 0;
const listeners = new Set<() => void>();
const emit = () => {
  version++;
  listeners.forEach((fn) => fn());
};

export function subscribeCoupBots(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
/** Muda sempre que a lista de bots muda (para useSyncExternalStore). */
export const coupBotsVersion = (): number => version;
export const coupBotsIn = (code: string): number => [...registry].filter((b) => b.code === code).length;

export function addCoupBot(code: string): void {
  const bot: CoupBot = new CoupBot(
    code,
    () => {
      const others = [...registry].filter((b) => b !== bot && b.code === code);
      return {
        names: others.flatMap((b) => (b.name ? [b.name] : [])),
        colors: others.flatMap((b) => (b.color ? [b.color] : [])),
      };
    },
    (b) => {
      registry.delete(b);
      emit();
    },
  );
  registry.add(bot);
  emit();
  bot.start();
}

export function removeAllCoupBots(): void {
  registry.forEach((b) => b.stop());
  registry.clear();
  emit();
}
