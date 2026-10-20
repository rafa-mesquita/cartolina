/**
 * Bots do Tatubum SÓ PARA DESENVOLVIMENTO (importados via `import()` atrás de `import.meta.env.DEV`).
 * Cada bot abre o próprio WebSocket e joga como uma pessoa, olhando só a visão dele (sem trapaça).
 * Não são espertos de propósito: jogam umas cartas, às vezes dão Nem vem! e sempre terminam comprando.
 * Nunca faz ações de host (começar, jogar de novo, lobby): isso fica com a pessoa que está testando.
 */
import {
  PLAYER_COLORS,
  isKittensRoomView,
  kittensKindOf,
  mulberry32,
  type GameAction,
  type KittensCardKind,
  type KittensRoomView,
  type KittensView,
} from '@cartolina/shared';
import { getRoomInfo } from '../net/api';
import { wsUrl } from '../net/config';
import { RoomConnection } from '../net/connection';
import { BOT_NAMES } from './bots';

/** Quanto esperar, depois de agir, antes de achar que a ação se perdeu e tentar de novo. */
const RETRY_MS = 4000;

type Rng = () => number;
const BICHOS: readonly KittensCardKind[] = ['capivara', 'mico', 'quati', 'tamandua', 'preguica'];

/** O que o bot já decidiu (ele mesmo guarda; vive enquanto a partida dura). */
export interface KittensBotMemory {
  /** Chave do Nem vem! que ele já considerou (dá ou não, decide uma vez só por carta no ar). */
  noped: string | null;
  /** Chave do turno em andamento e quantas jogadas ele já fez nele. */
  turnKey: string | null;
  playedThisTurn: number;
}

export const newKittensMemory = (): KittensBotMemory => ({ noped: null, turnKey: null, playedThisTurn: 0 });

const pickOne = <T>(rng: Rng, arr: readonly T[]): T => arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))]!;
const between = (rng: Rng, a: number, b: number): number => a + rng() * (b - a);

/** Quem recebe a vez depois de `from` (pra saber se um Ataque no ar é contra o bot). */
function nextAlive(g: KittensView, from: string): string | null {
  const i = g.players.indexOf(from);
  for (let k = 1; k <= g.players.length; k++) {
    const p = g.players[(i + k) % g.players.length]!;
    if (p !== from && g.alive.includes(p)) return p;
  }
  return null;
}

interface Play {
  cards: string[];
  target?: string;
  ask?: KittensCardKind;
}

/** Uma jogada possível com a mão (ou null). */
function choosePlay(g: KittensView, me: string, mem: KittensBotMemory, rng: Rng): Play | null {
  const byKind = new Map<KittensCardKind, string[]>();
  for (const c of g.hand) {
    const k = kittensKindOf(c);
    if (k) byKind.set(k, [...(byKind.get(k) ?? []), c]);
  }
  const first = (k: KittensCardKind): string | undefined => byKind.get(k)?.[0];
  const targets = g.alive.filter((p) => p !== me && (g.handCounts[p] ?? 0) > 0);
  const topId = g.peek?.[0];
  const top = topId ? kittensKindOf(topId) : null;
  // Espiou e o de cima é tatu: foge.
  if (top === 'tatubum') {
    for (const k of ['ataque', 'pular', 'embaralhar'] as const) {
      const c = first(k);
      if (c) return { cards: [c] };
    }
    const quati = byKind.get('quati');
    if (quati && quati.length >= 2) return { cards: quati.slice(0, 2) };
    const tamandua = byKind.get('tamandua');
    if (tamandua && tamandua.length >= 2) return { cards: tamandua.slice(0, 2) };
  }
  const attack = first('ataque');
  if (g.owed >= 2 && attack && rng() < 0.8) return { cards: [attack] };
  if (mem.playedThisTurn >= 2 || rng() > 0.5) return null;
  const options: Play[] = [];
  const spy = first('espiar');
  const shuffle = first('embaralhar');
  const skip = first('pular');
  const favor = first('favor');
  if (spy && !g.peek) options.push({ cards: [spy] });
  if (shuffle && rng() < 0.4) options.push({ cards: [shuffle] });
  if (attack && rng() < 0.5) options.push({ cards: [attack] });
  if (skip && rng() < 0.25) options.push({ cards: [skip] });
  if (favor && targets.length) options.push({ cards: [favor], target: pickOne(rng, targets) });
  for (const b of BICHOS) {
    const list = byKind.get(b) ?? [];
    if (list.length < 2) continue;
    const pair = list.slice(0, 2);
    if (b === 'mico') {
      // Sem alvo: os outros descartam uma carta (só vale a pena se alguém tiver carta).
      if (targets.length) options.push({ cards: pair });
    } else if (b === 'preguica') {
      options.push({ cards: pair, ask: pickOne(rng, BICHOS) });
    } else {
      options.push({ cards: pair });
    }
  }
  // Trio de qualquer carta (menos Desarme: não troca 3 por 1) rouba um Desarme.
  for (const [k, list] of byKind) if (k !== 'cafune' && list.length >= 3 && rng() < 0.5) options.push({ cards: list.slice(0, 3) });
  const distinct = BICHOS.filter((b) => byKind.get(b)?.length);
  if (distinct.length === 5 && g.discard.length && rng() < 0.5) options.push({ cards: distinct.map((b) => byKind.get(b)![0]!) });
  return options.length ? pickOne(rng, options) : null;
}

/** Quanto a carta vale pra quem a segura (menor = descarta primeiro): bicho sozinho < bicho em par < ação < Nem vem! < Desarme. */
function keepValue(card: string, hand: readonly string[]): number {
  const k = kittensKindOf(card);
  if (k && BICHOS.includes(k)) return hand.filter((x) => kittensKindOf(x) === k).length >= 2 ? 1 : 0;
  switch (k) {
    case 'espiar':
    case 'embaralhar':
      return 2;
    case 'favor':
    case 'pular':
      return 3;
    case 'ataque':
      return 4;
    case 'nemvem':
      return 5;
    default:
      return 6; // Desarme (e o que vier): a última coisa a largar
  }
}

/** Par de Mico: a carta menos valiosa da mão (empate: sorteia), nunca o Desarme se houver outra. */
export function leastValuable(hand: readonly string[], rng: Rng): string {
  const lowest = Math.min(...hand.map((c) => keepValue(c, hand)));
  return pickOne(rng, hand.filter((c) => keepValue(c, hand) === lowest));
}

/**
 * O que o bot faz agora (ou null). `key` identifica a etapa, pra não agir duas vezes nela.
 * `mem` é mutada: guarda o Nem vem! já considerado e as jogadas do turno.
 */
export function decideKittens(view: KittensRoomView, mem: KittensBotMemory, rng: Rng): { key: string; delay: number; action: GameAction } | null {
  const g = view.game, me = view.you;
  if (!me || g.phase !== 'playing' || !g.alive.includes(me)) return null;

  if (g.choice?.kind === 'mico') {
    // Par de Mico: quem ainda está na espera descarta a carta que menos faz falta.
    if (!g.choice.waiting.includes(me) || !g.hand.length) return null;
    return {
      key: `choice:mico:${g.choice.deadline}`,
      delay: between(rng, 1000, 2000),
      action: { type: 'choose', card: leastValuable(g.hand, rng) },
    };
  }

  if (g.choice && g.choice.who === me) {
    const c = g.choice;
    // Nos 5 diferentes são duas pegadas: `left` na chave faz o bot responder a segunda também.
    const key = c.kind === 'cinco' ? `choice:cinco:${c.deadline}:${c.left}` : `choice:${c.kind}:${c.deadline}`;
    if (c.kind === 'tatu') {
      // Comprou o Tatubum: joga o Desarme depois de uma pausa dramática.
      const cafune = g.hand.find((x) => kittensKindOf(x) === 'cafune');
      return cafune ? { key, delay: between(rng, 1200, 2200), action: { type: 'choose', card: cafune } } : null;
    }
    if (c.kind === 'cafune') {
      // Às vezes deixa o tatu bem em cima pro próximo.
      const position = rng() < 0.35 ? 0 : Math.floor(rng() * (g.drawCount + 1));
      return { key, delay: between(rng, 1100, 2200), action: { type: 'choose', position } };
    }
    if (c.kind === 'favor') {
      if (!g.hand.length) return null;
      const cheap = g.hand.filter((x) => BICHOS.includes(kittensKindOf(x) as KittensCardKind));
      return { key, delay: between(rng, 1000, 2000), action: { type: 'choose', card: pickOne(rng, cheap.length ? cheap : g.hand) } };
    }
    if (c.kind === 'quati') {
      // Fica, a não ser que a de cima seja Tatubum: aí vai pro fundo.
      const keep = c.card === null || kittensKindOf(c.card) !== 'tatubum';
      return { key, delay: between(rng, 900, 1600), action: { type: 'choose', keep } };
    }
    if (!c.options.length) return null;
    const pref: KittensCardKind[] = ['cafune', 'nemvem', 'ataque', 'pular', 'espiar'];
    const best = pref.map((k) => c.options.find((x) => kittensKindOf(x) === k)).find(Boolean) ?? pickOne(rng, c.options);
    return { key, delay: between(rng, 900, 1600), action: { type: 'choose', card: best } };
  }
  if (g.choice) return null;

  if (g.pending) {
    const p = g.pending;
    const key = `nope:${p.by}:${p.play.cards.join(',')}:${p.nopes.length}`;
    if (mem.noped === key) return null;
    mem.noped = key;
    if (!g.hand.some((x) => kittensKindOf(x) === 'nemvem')) return null;
    const valendo = p.nopes.length % 2 === 0;
    // Não corta a própria jogada enquanto ela está valendo.
    if (valendo && p.by === me) return null;
    const contraMim = p.play.target === me || (p.play.kind === 'ataque' && nextAlive(g, p.by) === me);
    // Sem motivo, a mesa inteira junta dá Nem vem! em ~30% das jogadas (com 7 bots, não em quase todas).
    let chance = 0.3 / Math.max(1, g.alive.length - 2);
    if (valendo && contraMim) chance = 0.7;
    if (!valendo && p.by === me) chance = 0.55;
    if (rng() > chance) return null;
    return { key, delay: between(rng, 800, 3400), action: { type: 'nope' } };
  }

  if (g.current !== me) return null;
  const turnKey = `${g.drawCount}:${g.owed}`;
  if (mem.turnKey !== turnKey) {
    mem.turnKey = turnKey;
    mem.playedThisTurn = 0;
  }
  const key = `turn:${g.drawCount}:${g.owed}:${g.hand.length}`;
  const play = choosePlay(g, me, mem, rng);
  if (play) {
    mem.playedThisTurn += 1;
    return { key, delay: between(rng, 1000, 1900), action: { type: 'play', ...play } };
  }
  return { key, delay: between(rng, 900, 1700), action: { type: 'draw' } };
}

class KittensBot {
  name: string | null = null;
  color: string | null = null;
  private conn: RoomConnection | null = null;
  private unsub: (() => void) | null = null;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private stopped = false;
  private retrying = false;
  private mem = newKittensMemory();
  /** Etapa que o bot já agendou (limpa quando ele não tem mais nada a fazer). */
  private planned: string | null = null;
  private tried = new Set<string>();
  constructor(
    readonly code: string,
    private taken: () => { names: string[]; colors: string[] },
    private onGone: (bot: KittensBot) => void,
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
    if (snap.status !== 'joined' || !snap.view || !isKittensRoomView(snap.view)) return;
    // a mesma semente nas duas decisões (agendar e enviar): o sorteio não muda de ideia no meio da espera
    const seed = Math.floor(Math.random() * 2 ** 32);
    const before = { ...this.mem };
    const d = decideKittens(snap.view, this.mem, mulberry32(seed));
    if (!d) {
      this.planned = null;
      return;
    }
    if (this.planned === d.key) return;
    this.planned = d.key;
    this.later(d.delay, () => {
      const now = this.conn?.getSnapshot().view;
      if (!now || !isKittensRoomView(now)) return;
      // decide de novo com a visão atual (a etapa pode ter mudado enquanto esperava), sem sujar a memória
      const again = decideKittens(now, { ...before }, mulberry32(seed));
      if (again?.key !== d.key) return;
      this.conn?.sendAction(again.action);
      // se a ação se perdeu e a etapa não andou, tenta de novo
      this.later(RETRY_MS, () => {
        if (this.planned !== d.key) return;
        this.planned = null;
        this.react();
      });
    });
  };
}

const registry = new Set<KittensBot>();
let version = 0;
const listeners = new Set<() => void>();
const emit = () => {
  version++;
  listeners.forEach((fn) => fn());
};

export function subscribeKittensBots(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
/** Muda sempre que a lista de bots muda (para useSyncExternalStore). */
export const kittensBotsVersion = (): number => version;
export const kittensBotsIn = (code: string): number => [...registry].filter((b) => b.code === code).length;

export function addKittensBot(code: string): void {
  const bot: KittensBot = new KittensBot(
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

export function removeAllKittensBots(): void {
  registry.forEach((b) => b.stop());
  registry.clear();
  emit();
}
