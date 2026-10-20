/**
 * Bots do Cama-Leão SÓ PARA DESENVOLVIMENTO (importados via `import()` atrás de `import.meta.env.DEV` no lobby).
 * Cada bot abre o próprio WebSocket e joga como uma pessoa, olhando só a visão dele (sem trapaça): fecha 5 se puder,
 * dá a carta que estoura o líder, senão fica com a que não estoura (porta de `prototipo/cama-leao/bot.js`).
 * Nunca faz ações de host (começar, jogar de novo, lobby): isso fica com a pessoa que está testando.
 */
import {
  CAMELIO_DECK,
  CAMELIO_EXACT,
  PLAYER_COLORS,
  camelioBack,
  isCamelioRoomView,
  mulberry32,
  type CamelioBack,
  type CamelioCard,
  type CamelioFrom,
  type CamelioRoomView,
  type CamelioView,
  type GameAction,
} from '@cartolina/shared';
import { getRoomInfo } from '../net/api';
import { wsUrl } from '../net/config';
import { RoomConnection } from '../net/connection';
import { BOT_NAMES } from './bots';

/** Quanto esperar, depois de agir, antes de achar que a ação se perdeu e tentar de novo. */
const RETRY_MS = 4000;

type Rng = () => number;

const sameBack = (a: CamelioBack, b: CamelioBack): boolean => {
  if (a.kind === 'normal' && b.kind === 'normal') return a.color === b.color;
  if (a.kind === 'bicolor' && b.kind === 'bicolor') return a.spheres === b.spheres && a.colors[0] === b.colors[0] && a.colors[1] === b.colors[1];
  if (a.kind === 'multi' && b.kind === 'multi') return a.spheres === b.spheres;
  return false;
};

/** Soma da cor na mesa de `to` com a carta, e o que aconteceria. */
function outcomeOf(view: CamelioView, to: string, card: CamelioCard): { o: 'none' | 'scored' | 'bust' | 'lost'; sum: number } {
  const sum = (view.table[to] ?? []).filter((c) => c.color === card.color).reduce((n, c) => n + c.spheres, 0) + card.spheres;
  const already = (view.scored[to] ?? []).some((c) => c.color === card.color);
  if (already) return { o: sum >= CAMELIO_EXACT ? 'lost' : 'none', sum };
  return { o: sum === CAMELIO_EXACT ? 'scored' : sum > CAMELIO_EXACT ? 'bust' : 'none', sum };
}

/** Quanto vale pro bot `me` a carta `card` cair na mesa de `to`. */
function value(view: CamelioView, me: string, to: string, card: CamelioCard): number {
  const { o, sum } = outcomeOf(view, to, card);
  const pts = (p: string): number => view.points[p] ?? 0;
  const top = Math.max(...view.players.map(pts));
  const leader = pts(to) === top && top > 0;
  if (to === me) {
    if (o === 'scored') return pts(me) + 1 >= view.target ? 100 : 10;
    if (o === 'bust') return -6;
    if (o === 'lost') return -12;
    return 1 + sum / CAMELIO_EXACT; // perto de 5 sem passar é bom
  }
  if (o === 'scored') return pts(to) + 1 >= view.target ? -100 : -8;
  // Só vale a pena estourar/derrubar o líder; quem não lidera quase não compensa.
  if (o === 'bust') return leader ? 7 : 0.5;
  if (o === 'lost') return leader ? 10 : 1.5;
  return 0;
}

/** Cartas que podem estar atrás do verso do topo (as que estão à vista ficam de fora). */
function behind(view: CamelioView): CamelioCard[] {
  const top = view.top;
  if (!top) return [];
  const seen = new Set<number>(
    [view.open, ...Object.values(view.table).flat(), ...Object.values(view.scored).flat()].flatMap((c) => (c ? [c.id] : [])),
  );
  const options = CAMELIO_DECK.filter((c) => !seen.has(c.id) && sameBack(camelioBack(c), top));
  return options.length ? options : CAMELIO_DECK.filter((c) => sameBack(camelioBack(c), top));
}

/**
 * A jogada do bot `me` (de onde pegar e pra quem dar) olhando só a visão, ou null se não há jogada.
 * `active`: quem pode receber carta agora (jogadores da partida com o assento conectado).
 */
export function chooseCamelioPlay(view: CamelioView, me: string, active: readonly string[], rng: Rng): { from: CamelioFrom; to: string } | null {
  if (view.phase !== 'playing' || view.paused) return null;
  const targets = view.players.filter((p) => active.includes(p));
  const deckCards = view.top ? behind(view) : [];
  let best: { from: CamelioFrom; to: string; score: number } | null = null;
  for (const to of targets) {
    const plays: { from: CamelioFrom; v: number }[] = [];
    if (view.open) plays.push({ from: 'open', v: value(view, me, to, view.open) });
    if (deckCards.length) plays.push({ from: 'deck', v: deckCards.reduce((n, c) => n + value(view, me, to, c), 0) / deckCards.length });
    for (const p of plays) {
      const score = p.v + rng() * 0.5; // um pouco de sorte pra não jogar sempre igual
      if (!best || score > best.score) best = { from: p.from, to, score };
    }
  }
  return best ? { from: best.from, to: best.to } : null;
}

/** O que o bot faz agora (ou null). `key` identifica a jogada, pra não agir duas vezes nela. */
export function decideCamelio(view: CamelioRoomView, rng: Rng): { key: string; delay: number; action: GameAction } | null {
  const g = view.game, me = view.you;
  if (!me || g.phase !== 'playing' || g.paused || g.turn !== me || !g.players.includes(me)) return null;
  const active = view.seats.filter((s) => s.connected).map((s) => s.id);
  const play = chooseCamelioPlay(g, me, active, rng);
  if (!play) return null;
  return {
    key: `${g.match}:${g.playCount}`,
    // dá tempo das telas animarem a jogada anterior
    delay: 1800 + rng() * 1000,
    action: { type: 'play', from: play.from, to: play.to },
  };
}

class CamelioBot {
  name: string | null = null;
  color: string | null = null;
  private conn: RoomConnection | null = null;
  private unsub: (() => void) | null = null;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private stopped = false;
  private retrying = false;
  /** Etapa que o bot já agendou (limpa quando ele não tem mais nada a fazer). */
  private planned: string | null = null;
  private tried = new Set<string>();
  constructor(
    readonly code: string,
    private taken: () => { names: string[]; colors: string[] },
    private onGone: (bot: CamelioBot) => void,
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
    if (snap.status !== 'joined' || !snap.view || !isCamelioRoomView(snap.view)) return;
    // a mesma semente nas duas decisões (agendar e enviar): o sorteio não muda de ideia no meio da espera
    const seed = Math.floor(Math.random() * 2 ** 32);
    const d = decideCamelio(snap.view, mulberry32(seed));
    if (!d) {
      this.planned = null;
      return;
    }
    if (this.planned === d.key) return;
    this.planned = d.key;
    this.later(d.delay, () => {
      const now = this.conn?.getSnapshot().view;
      if (!now || !isCamelioRoomView(now)) return;
      // decide de novo com a visão atual (a vez pode ter mudado enquanto esperava)
      const again = decideCamelio(now, mulberry32(seed));
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

const registry = new Set<CamelioBot>();
let version = 0;
const listeners = new Set<() => void>();
const emit = () => {
  version++;
  listeners.forEach((fn) => fn());
};

export function subscribeCamelioBots(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
/** Muda sempre que a lista de bots muda (para useSyncExternalStore). */
export const camelioBotsVersion = (): number => version;
export const camelioBotsIn = (code: string): number => [...registry].filter((b) => b.code === code).length;

export function addCamelioBot(code: string): void {
  const bot: CamelioBot = new CamelioBot(
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

export function removeAllCamelioBots(): void {
  registry.forEach((b) => b.stop());
  registry.clear();
  emit();
}
