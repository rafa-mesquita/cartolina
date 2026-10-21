/**
 * Bots do Tatubum (modo teste): existem também no site no ar, pra completar a mesa quando tem pouca gente (o lobby
 * carrega o `BotControls` sob demanda, só pro host). Rodam no navegador de quem os pôs e entram pelo mesmo servidor
 * do site (`wsUrl`/`getRoomInfo` de `net/`, nada fixo de localhost). Cada bot abre o próprio WebSocket e joga como uma pessoa, olhando só a visão dele (sem trapaça).
 * Não são espertos de propósito: jogam umas cartas, às vezes dão Nem vem! e sempre terminam comprando.
 * Nunca faz ações de host (começar, jogar de novo, lobby): isso fica com a pessoa que está testando.
 */
import {
  KITTENS_BICHOS,
  PLAYER_COLORS,
  isKittensRoomView,
  kittensKindOf,
  kittensNopable,
  kittensNopeCooldownUntil,
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
const BICHOS: readonly KittensCardKind[] = KITTENS_BICHOS;

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
  as?: KittensCardKind;
}

/**
 * Par de `b` (com as cartas dadas): Preguiça pede um bicho; Tucano vai num adversário vivo (`opponents`, nunca vazio
 * aqui); `as` só no par de 2 Botos.
 */
function pairOf(cards: string[], b: KittensCardKind, rng: Rng, botos: boolean, opponents: readonly string[]): Play {
  return {
    cards,
    ...(botos ? { as: b } : {}),
    ...(b === 'preguica' ? { ask: pickOne(rng, BICHOS) } : {}),
    ...(b === 'tucano' ? { target: pickOne(rng, opponents) } : {}),
  };
}

/** Às cegas (Mau-olhado): de vez em quando arrisca 1 ou 2 fichas ao acaso (o servidor recusa se não formar jogada). */
function blindPlay(g: KittensView, me: string, mem: KittensBotMemory, rng: Rng): Play | null {
  if (mem.playedThisTurn >= 1 || !g.hand.length || rng() > 0.15) return null;
  const n = Math.min(g.hand.length, rng() < 0.7 ? 1 : 2);
  const tokens = [...g.hand].sort(() => rng() - 0.5).slice(0, n);
  const opponents = g.alive.filter((p) => p !== me);
  return { cards: tokens, target: pickOne(rng, opponents), ask: pickOne(rng, BICHOS), as: pickOne(rng, BICHOS) };
}

/** Uma jogada possível com a mão (ou null). */
function choosePlay(g: KittensView, me: string, mem: KittensBotMemory, rng: Rng): Play | null {
  if (g.blind.includes(me)) return blindPlay(g, me, mem, rng);
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
  // Tatu Latidor: solta sempre que pode (todos que tiverem Latidor se defendem, um de cada vez; ninguém tem, fica na frente).
  const bark = first('latido');
  if (bark && mem.playedThisTurn < 2 && rng() < 0.9) return { cards: [bark] };
  if (mem.playedThisTurn >= 2 || rng() > 0.5) return null;
  const options: Play[] = [];
  const spy = first('espiar');
  const shuffle = first('embaralhar');
  const skip = first('pular');
  const favor = first('favor');
  const curse = first('olhado');
  const spell = first('feitico');
  const opponents = g.alive.filter((p) => p !== me);
  if (spy && !g.peek) options.push({ cards: [spy] });
  if (shuffle && rng() < 0.4) options.push({ cards: [shuffle] });
  if (attack && rng() < 0.5) options.push({ cards: [attack] });
  if (skip && rng() < 0.25) options.push({ cards: [skip] });
  if (favor && targets.length) options.push({ cards: [favor], target: pickOne(rng, targets) });
  if (curse && opponents.length) options.push({ cards: [curse], target: pickOne(rng, opponents) });
  if (spell && rng() < 0.4) options.push({ cards: [spell] });
  const botos = byKind.get('boto') ?? [];
  for (const b of BICHOS) {
    const list = byKind.get(b) ?? [];
    // Par do bicho; sem par, um Boto completa.
    const pair = list.length >= 2 ? list.slice(0, 2) : list.length === 1 && botos.length ? [list[0]!, botos[0]!] : null;
    if (!pair) continue;
    // Par de Mico sem alvo: os outros descartam uma carta (só vale a pena se alguém tiver carta). Par de Tucano: às
    // vezes, num adversário vivo (a vez dele é pulada).
    if (b === 'mico' && !targets.length) continue;
    if (b === 'tucano' && rng() >= 0.5) continue;
    options.push(pairOf(pair, b, rng, false, opponents));
  }
  // Dois Botos: par do bicho que o bot quiser (nunca Mico sem ninguém com carta).
  if (botos.length >= 2) {
    const b = pickOne(rng, targets.length ? BICHOS : BICHOS.filter((x) => x !== 'mico'));
    options.push(pairOf(botos.slice(0, 2), b, rng, true, opponents));
  }
  // Trio de qualquer carta (menos Desarme: não troca 3 por 1) rouba um Desarme; o Boto completa um par de bicho.
  // Trio de Favor pede alvo com carta na mão: o alvo dá 3 cartas.
  for (const [k, list] of byKind) {
    if (k === 'cafune' || list.length < 3 || rng() >= 0.5) continue;
    if (k !== 'favor') options.push({ cards: list.slice(0, 3) });
    else if (targets.length) options.push({ cards: list.slice(0, 3), target: pickOne(rng, targets) });
  }
  if (botos.length && rng() < 0.3) {
    const two = BICHOS.find((b) => (byKind.get(b)?.length ?? 0) === 2);
    if (two) options.push({ cards: [...byKind.get(two)!, botos[0]!] });
  }
  // 4 bichos diferentes: o Boto conta como um bicho a mais.
  const distinct = BICHOS.filter((b) => byKind.get(b)?.length).map((b) => byKind.get(b)![0]!);
  if (botos.length) distinct.push(botos[0]!);
  if (distinct.length >= 4 && g.discard.length && rng() < 0.5) options.push({ cards: distinct.slice(0, 4) });
  return options.length ? pickOne(rng, options) : null;
}

/** Quanto a carta vale pra quem a segura (menor = descarta primeiro): bicho sozinho < bicho em par < ação < Nem vem! < Desarme. */
function keepValue(card: string, hand: readonly string[]): number {
  const k = kittensKindOf(card);
  if (k && BICHOS.includes(k)) return hand.filter((x) => kittensKindOf(x) === k).length >= 2 ? 1 : 0;
  switch (k) {
    case 'boto':
      return 1; // coringa: um pouco melhor que bicho sozinho
    case 'espiar':
    case 'embaralhar':
    case 'feitico':
      return 2;
    case 'favor':
    case 'pular':
    case 'olhado':
      return 3;
    case 'ataque':
    case 'latido':
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
 * Quanto falta (ms, hora do servidor) da espera de 2 s depois do último Nem vem! na carta no ar (pedido do Rafa,
 * 2026-10-21); 0 se não tem espera.
 */
export function kittensNopeWait(view: KittensRoomView, now: number): number {
  const until = kittensNopeCooldownUntil(view.game.pending);
  return until === null ? 0 : Math.max(0, until - now);
}

/**
 * O que o bot faz agora (ou null). `key` identifica a etapa, pra não agir duas vezes nela.
 * `mem` é mutada: guarda o Nem vem! já considerado e as jogadas do turno. `now` = hora do servidor.
 */
export function decideKittens(
  view: KittensRoomView,
  mem: KittensBotMemory,
  rng: Rng,
  now: number = Date.now(),
): { key: string; delay: number; action: GameAction } | null {
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
    // Nos 4 bichos diferentes são duas pegadas e no trio de Favor até 3 cartas a dar: `left` na chave faz o bot responder
    // cada uma. A pegada do fim do par de Mico usa a mesma escolha (`from: 'mico'`): a origem e as opções na chave a
    // separam de qualquer pegada anterior.
    const key =
      c.kind === 'cinco'
        ? `choice:cinco:${c.from ?? 'cinco'}:${c.deadline}:${c.left}:${c.options.join(',')}`
        : c.kind === 'favor'
          ? `choice:favor:${c.deadline}:${c.left}`
          : `choice:${c.kind}:${c.deadline}`;
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
    if (c.kind === 'quati' || c.kind === 'feitico') {
      // Quati: fica, a não ser que a de cima seja Tatubum (aí vai pro fundo). Feitiço: fica com a de baixo, a não ser
      // que seja Tatubum (aí vai pro topo).
      const keep = c.card === null || kittensKindOf(c.card) !== 'tatubum';
      return { key, delay: between(rng, 900, 1600), action: { type: 'choose', keep } };
    }
    if (c.kind === 'latido') {
      // Tatu Latidor (a vez dele na fila de defesa): joga o Desarme (às cegas, qualquer ficha: o servidor acha o Desarme).
      const card = g.blind.includes(me) ? g.hand[0] : g.hand.find((x) => kittensKindOf(x) === 'cafune');
      return card ? { key, delay: between(rng, 1200, 2200), action: { type: 'choose', card } } : null;
    }
    // 4 bichos diferentes ou a pegada do fim do par de Mico: Desarme, Nem vem! e Ataque primeiro.
    if (!c.options.length) return null;
    const pref: KittensCardKind[] = ['cafune', 'nemvem', 'ataque', 'pular', 'espiar'];
    const best = pref.map((k) => c.options.find((x) => kittensKindOf(x) === k)).find(Boolean) ?? pickOne(rng, c.options);
    return { key, delay: between(rng, 900, 1600), action: { type: 'choose', card: best } };
  }
  if (g.choice) return null;

  if (g.pending) {
    const p = g.pending;
    // 4 bichos diferentes: não aceita Nem vem!.
    if (!kittensNopable(p.play.kind)) return null;
    const key = `nope:${p.by}:${p.play.cards.join(',')}:${p.nopes.length}`;
    if (mem.noped === key) return null;
    // Na espera de 2 s depois de um Nem vem!, nem decide: a decisão desta etapa fica pra quando a espera acabar.
    if (kittensNopeWait(view, now) > 0) return null;
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
    // Vai junto o que o bot viu: se outro deu Nem vem! antes (dois juntos), o servidor recusa e a carta fica na mão;
    // a visão nova (outra chave) dá a ele a chance de decidir de novo.
    return { key, delay: between(rng, 800, 3400), action: { type: 'nope', at: p.nopes.length, on: p.play.cards[0]! } };
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
  /** Quando o bot volta a olhar a mesa depois da espera de 2 s do Nem vem! (um despertador só por espera). */
  private wakeAt: number | null = null;
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
    const now = Date.now() + snap.serverOffset;
    const d = decideKittens(snap.view, this.mem, mulberry32(seed), now);
    if (!d) {
      this.planned = null;
      // Espera de 2 s do Nem vem!: volta a olhar quando ela acabar (nenhum estado novo chega sozinho).
      const wait = kittensNopeWait(snap.view, now);
      if (wait > 0 && this.wakeAt !== now + wait) {
        this.wakeAt = now + wait;
        this.later(wait + 50, () => {
          this.wakeAt = null;
          this.react();
        });
      }
      return;
    }
    if (this.planned === d.key) return;
    this.planned = d.key;
    this.later(d.delay, () => {
      const snapNow = this.conn?.getSnapshot();
      const viewNow = snapNow?.view;
      if (!snapNow || !viewNow || !isKittensRoomView(viewNow)) return;
      // decide de novo com a visão atual (a etapa pode ter mudado enquanto esperava), sem sujar a memória
      const again = decideKittens(viewNow, { ...before }, mulberry32(seed), Date.now() + snapNow.serverOffset);
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
