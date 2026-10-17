/**
 * Bots do Retratim SÓ PARA DESENVOLVIMENTO (importados via `import()` atrás de `import.meta.env.DEV`).
 * Cada bot abre o próprio WebSocket e joga como uma pessoa: monta uma obra aleatória, fica pronto, palpita e confirma.
 * Nunca faz ações de host (começar, próxima, apressar, jogar de novo, lobby): isso fica com a pessoa que está testando.
 */
import { COORDS, PLAYER_COLORS, isPicturesRoomView, mulberry32, type GameAction, type PicturesRoomView } from '@cartolina/shared';
import { getRoomInfo } from '../net/api';
import { wsUrl } from '../net/config';
import { RoomConnection } from '../net/connection';
import { randomWork } from '../games/pictures/random';
import { BOT_NAMES } from './bots';

/** Quanto esperar, depois de agir, antes de achar que a ação se perdeu e tentar de novo. */
const RETRY_MS = 4000;
/** Espera dos bots "lentos": passa dos 30 s da contagem, pra ela aparecer na tela de quem testa. */
const SLOW_MS = 40_000;

type Rng = () => number;
const pickOne = <T>(rng: Rng, arr: readonly T[]): T => arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))]!;

/** Um bot em cada 4 é lento, sorteado por uma semente estável de (rodada, bot): não muda de ideia a cada visão. */
export function isSlowBot(round: number, me: string): boolean {
  let h = 2166136261;
  for (const ch of `${round}:${me}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return mulberry32(h >>> 0)() < 0.25;
}

/**
 * O que o bot faz agora (ou null). `key` identifica a etapa, pra não agir duas vezes nela.
 * Montagem: manda "pronto" com uma obra aleatória do kit dele (uma ação só).
 * Palpite: um `guess` por obra alheia, em coordenada aleatória (o bot não sabe o segredo), e `confirm`.
 */
export function decidePictures(view: PicturesRoomView, rng: Rng): { key: string; delay: number; actions: GameAction[] } | null {
  const g = view.game, me = view.you;
  if (!me || g.paused || !g.inRound.includes(me)) return null;
  const key = `${g.phase}:${g.round}`;
  if (g.phase === 'building' && !g.ready.includes(me)) {
    const kit = g.kits[me];
    if (!kit) return null;
    const delay = isSlowBot(g.round, me) ? SLOW_MS : 3000 + rng() * 6000;
    return { key, delay, actions: [{ type: 'ready', on: true, work: randomWork(kit) }] };
  }
  if (g.phase === 'guessing' && !g.confirmed.includes(me)) {
    const artists = Object.keys(g.works).filter((a) => a !== me && g.inRound.includes(a));
    const guesses: GameAction[] = artists.map((artist) => ({ type: 'guess', artist, coord: pickOne(rng, COORDS) }));
    return { key, delay: 4000 + rng() * 8000, actions: [...guesses, { type: 'confirm' }] };
  }
  return null;
}

class PicturesBot {
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
    private onGone: (bot: PicturesBot) => void,
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
    if (snap.status !== 'joined' || !snap.view || !isPicturesRoomView(snap.view)) return;
    const d = decidePictures(snap.view, Math.random);
    if (!d) {
      this.planned = null;
      return;
    }
    if (this.planned === d.key) return;
    this.planned = d.key;
    this.later(d.delay, () => {
      const now = this.conn?.getSnapshot().view;
      if (!now || !isPicturesRoomView(now)) return;
      // decide de novo com a visão atual (a etapa pode ter mudado enquanto esperava)
      const again = decidePictures(now, Math.random);
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

const registry = new Set<PicturesBot>();
let version = 0;
const listeners = new Set<() => void>();
const emit = () => {
  version++;
  listeners.forEach((fn) => fn());
};

export function subscribePicturesBots(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
/** Muda sempre que a lista de bots muda (para useSyncExternalStore). */
export const picturesBotsVersion = (): number => version;
export const picturesBotsIn = (code: string): number => [...registry].filter((b) => b.code === code).length;

export function addPicturesBot(code: string): void {
  const bot: PicturesBot = new PicturesBot(
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

export function removeAllPicturesBots(): void {
  registry.forEach((b) => b.stop());
  registry.clear();
  emit();
}
