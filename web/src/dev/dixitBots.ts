/**
 * Bots do Diquisti SÓ PARA DESENVOLVIMENTO (importados via `import()` atrás de `import.meta.env.DEV`).
 * Cada bot abre o próprio WebSocket e joga como uma pessoa: narra, escolhe e vota com atrasos humanos.
 * Nunca faz ações de host (começar, próxima rodada): isso fica com a pessoa que está testando.
 */
import { PLAYER_COLORS, dixitPicksPerPlayer, isDixitRoomView, shuffle, type DixitRoomView, type GameAction } from '@cartolina/shared';
import { getRoomInfo } from '../net/api';
import { wsUrl } from '../net/config';
import { RoomConnection } from '../net/connection';
import { BOT_NAMES } from './bots';

const CLUES = ['saudade', 'um sonho que esqueci', 'silêncio', 'voltar pra casa', 'o primeiro dia', 'coragem', 'quase', 'segredo', 'domingo à tarde', 'a última página', 'eco', 'infância', 'maré', 'promessa', 'longe demais', 'antes de dormir'];
/** Quanto esperar, depois de agir, antes de achar que a ação se perdeu e tentar de novo. */
const RETRY_MS = 4000;

type Rng = () => number;
const pickOne = <T>(rng: Rng, arr: readonly T[]): T => arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))]!;

/**
 * O que o bot faz agora (ou null). `key` identifica a etapa, pra não agir duas vezes nela.
 * Narrador: às vezes manda dica vazia, que é a dica "falada na call".
 */
export function decideDixit(view: DixitRoomView, rng: Rng): { key: string; delay: number; actions: GameAction[] } | null {
  const g = view.game, me = view.you;
  if (!me || g.paused || !g.inRound.includes(me)) return null;
  const key = `${g.phase}:${g.storyteller}:${g.clue}:${g.table.length}`;
  if (g.phase === 'storytelling' && g.storyteller === me && g.hand.length) {
    const clue = rng() < 0.15 ? '' : pickOne(rng, CLUES);
    return { key, delay: 2500 + rng() * 2700, actions: [{ type: 'tell', cardId: pickOne(rng, g.hand), clue }] };
  }
  if (g.phase === 'submitting' && g.storyteller !== me && !g.confirmed.includes(me)) {
    const cardIds = shuffle(rng, g.hand).slice(0, dixitPicksPerPlayer(g.inRound.length));
    return { key, delay: 1400 + rng() * 3800, actions: [{ type: 'submit', cardIds }, { type: 'confirm' }] };
  }
  if (g.phase === 'voting' && g.storyteller !== me && !g.confirmed.includes(me)) {
    const options = g.table.filter((t) => !t.mine).map((t) => t.cardId);
    if (!options.length) return null;
    return { key, delay: 1800 + rng() * 4400, actions: [{ type: 'vote', cardId: pickOne(rng, options) }, { type: 'confirm' }] };
  }
  return null;
}

class DixitBot {
  name: string | null = null;
  color: string | null = null;
  private conn: RoomConnection | null = null;
  private unsub: (() => void) | null = null;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private stopped = false;
  private retrying = false;
  /** Etapa que o bot já agendou (limpa quando ele não tem mais nada a fazer, pra a mesma etapa poder voltar em outra rodada). */
  private planned: string | null = null;
  private tried = new Set<string>();
  constructor(
    readonly code: string,
    private taken: () => { names: string[]; colors: string[] },
    private onGone: (bot: DixitBot) => void,
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
    if (snap.status !== 'joined' || !snap.view || !isDixitRoomView(snap.view)) return;
    const d = decideDixit(snap.view, Math.random);
    if (!d) {
      this.planned = null;
      return;
    }
    if (this.planned === d.key) return;
    this.planned = d.key;
    this.later(d.delay, () => {
      const now = this.conn?.getSnapshot().view;
      if (!now || !isDixitRoomView(now)) return;
      // decide de novo com a visão atual (a etapa pode ter mudado enquanto esperava)
      const again = decideDixit(now, Math.random);
      if (again?.key !== d.key) return;
      again.actions.forEach((a) => this.conn?.sendAction(a));
      // se a ação se perdeu e a etapa não andou, tenta de novo
      this.later(RETRY_MS, () => {
        if (this.planned !== d.key) return;
        this.planned = null;
        this.react();
      });
    });
  };
}

const registry = new Set<DixitBot>();
let version = 0;
const listeners = new Set<() => void>();
const emit = () => {
  version++;
  listeners.forEach((fn) => fn());
};

export function subscribeDixitBots(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
/** Muda sempre que a lista de bots muda (para useSyncExternalStore). */
export const dixitBotsVersion = (): number => version;
export const dixitBotsIn = (code: string): number => [...registry].filter((b) => b.code === code).length;

export function addDixitBot(code: string): void {
  const bot: DixitBot = new DixitBot(
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

export function removeAllDixitBots(): void {
  registry.forEach((b) => b.stop());
  registry.clear();
  emit();
}
