import { CLUE_MAX, PLAYER_COLORS, type ClientMessage, type ItoAction, type Room } from '@cartolina/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BotPlayer, CLUE_BUCKETS, clueFor, curvePoint, targetIndex } from '../src/dev/bots';
import type { SocketLike } from '../src/net/connection';
import type { RoomInfo } from '../src/net/api';
import { act, sortingRoom, viewOf } from './fixtures';

/** rng que devolve a sequência dada (e repete o último valor). */
function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)]!;
}

describe('bots: helpers puros', () => {
  it('clueFor escolhe a frase pela faixa do valor', () => {
    const first = () => 0;
    expect(clueFor(1, first)).toBe('quase nada');
    expect(clueFor(20, first)).toBe('quase nada');
    expect(clueFor(21, first)).toBe('pouquinho');
    expect(clueFor(40, first)).toBe('pouquinho');
    expect(clueFor(41, first)).toBe('meio termo');
    expect(clueFor(60, first)).toBe('meio termo');
    expect(clueFor(61, first)).toBe('bastante');
    expect(clueFor(80, first)).toBe('bastante');
    expect(clueFor(81, first)).toBe('muito!!');
    expect(clueFor(100, first)).toBe('muito!!');
  });

  it('clueFor varia dentro da faixa e respeita o limite de pista', () => {
    for (const bucket of CLUE_BUCKETS) {
      expect(bucket.phrases.length).toBeGreaterThan(1);
      for (const p of bucket.phrases) expect(Array.from(p).length).toBeLessThanOrEqual(CLUE_MAX);
    }
    expect(CLUE_BUCKETS[0]!.phrases).toContain(clueFor(5, () => 0.999));
    expect(CLUE_BUCKETS[4]!.phrases).toContain(clueFor(95, () => 0.6));
  });

  it('targetIndex sem ruído é a proporção do valor', () => {
    const calm = () => 0.9; // >= 0.25: sem ruído
    expect(targetIndex(50, 4, calm)).toBe(2);
    expect(targetIndex(1, 4, calm)).toBe(0);
    expect(targetIndex(100, 4, calm)).toBe(4);
    expect(targetIndex(70, 0, calm)).toBe(0);
  });

  it('targetIndex com ruído anda ±1 e fica dentro da fila', () => {
    expect(targetIndex(50, 4, seq(0.1, 0.9))).toBe(3);
    expect(targetIndex(50, 4, seq(0.1, 0.1))).toBe(1);
    expect(targetIndex(100, 4, seq(0.1, 0.9))).toBe(4);
    expect(targetIndex(1, 4, seq(0.1, 0.1))).toBe(0);
    for (let i = 0; i < 500; i++) {
      const len = i % 7;
      const v = targetIndex(1 + (i % 100), len, Math.random);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(len);
    }
  });

  it('curvePoint começa e termina nos extremos; bend entorta o meio', () => {
    const from = { x: 0.1, y: 0.2 };
    const to = { x: 0.7, y: 0.6 };
    expect(curvePoint(from, to, 0, 0.3)).toEqual(from);
    const end = curvePoint(from, to, 1, 0.3);
    expect(end.x).toBeCloseTo(0.7);
    expect(end.y).toBeCloseTo(0.6);
    const straight = curvePoint(from, to, 0.5, 0);
    expect(straight.x).toBeCloseTo(0.4);
    expect(straight.y).toBeCloseTo(0.4);
    const bent = curvePoint(from, to, 0.5, 0.3);
    expect(Math.hypot(bent.x - 0.4, bent.y - 0.4)).toBeGreaterThan(0.01);
  });
});

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: string[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  constructor(public onSend: (msg: ClientMessage) => void) {}
  send(data: string) {
    this.sent.push(data);
    if (data !== 'ping') this.onSend(JSON.parse(data) as ClientMessage);
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  receive(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
  messages(): ClientMessage[] {
    return this.sent.filter((s) => s !== 'ping').map((s) => JSON.parse(s) as ClientMessage);
  }
}

/** Servidor de mentira: o bot é p1 de uma rodada já distribuída; aplica as ações e devolve o estado. */
function fakeServer(room: Room, opts: { rejectFirstJoin?: boolean } = {}) {
  const state = { room, socket: null as FakeSocket | null, joins: 0 };
  const push = () => state.socket!.receive({ t: 'state', room: viewOf(state.room, 'p1') });
  const createSocket = () => {
    const s = new FakeSocket((msg) => {
      if (msg.t === 'join') {
        state.joins++;
        if (opts.rejectFirstJoin && state.joins === 1) {
          queueMicrotask(() => s.receive({ t: 'error', code: 'color_taken', message: 'x' }));
          return;
        }
        queueMicrotask(() => {
          s.receive({ t: 'welcome', playerId: 'p1', code: 'ABCD' });
          push();
        });
      } else if (msg.t === 'action') {
        queueMicrotask(() => {
          state.room = act(state.room, 'p1', msg.action);
          push();
        });
      }
    });
    state.socket = s;
    return s;
  };
  const info = async (): Promise<RoomInfo> => ({
    exists: true,
    phase: 'lobby',
    seats: [{ id: 'p0', name: 'P0', color: PLAYER_COLORS[0], connected: true }],
  });
  return { state, push, createSocket, info };
}

const actions = (s: FakeSocket): ItoAction[] =>
  s.messages().flatMap((m) => (m.t === 'action' ? [m.action] : []));

describe('BotPlayer', () => {
  const bots: BotPlayer[] = [];
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    bots.splice(0).forEach((b) => b.stop());
    vi.useRealTimers();
  });

  async function boot(server: ReturnType<typeof fakeServer>, rng: () => number = () => 0.5) {
    const bot = new BotPlayer({ code: 'ABCD', createSocket: server.createSocket, getInfo: server.info, rng });
    bots.push(bot);
    bot.start();
    await vi.advanceTimersByTimeAsync(0);
    server.state.socket!.open();
    await vi.advanceTimersByTimeAsync(0);
    return bot;
  }

  it('entra com nome de bot e a primeira cor livre', async () => {
    const server = fakeServer(sortingRoom(2));
    await boot(server);
    const join = server.state.socket!.messages()[0];
    expect(join).toMatchObject({ t: 'join', name: 'Bot Bia', color: PLAYER_COLORS[1] });
  });

  it('cor ocupada na hora de entrar: tenta a próxima', async () => {
    const server = fakeServer(sortingRoom(2), { rejectFirstJoin: true });
    await boot(server);
    await vi.advanceTimersByTimeAsync(1_000);
    const joins = server.state.socket!.messages().filter((m) => m.t === 'join');
    expect(joins).toHaveLength(2);
    expect(joins[1]).toMatchObject({ color: PLAYER_COLORS[2] });
  });

  it('na ordenação: escreve pista, arrasta a carta até a fila, solta e fica pronto', async () => {
    const server = fakeServer(sortingRoom(2));
    await boot(server);
    await vi.advanceTimersByTimeAsync(20_000);
    const msgs = server.state.socket!.messages();
    const card = 'p1:0';
    const value = sortingRoom(2).game.cards[card]!.value;

    const writing = msgs.findIndex((m) => m.t === 'fx.activity' && m.activity === 'writing');
    const clue = msgs.findIndex((m) => m.t === 'action' && m.action.type === 'clue');
    const firstDrag = msgs.findIndex((m) => m.t === 'fx.cursor' && m.zone === 'table' && m.drag?.cardId === card);
    const place = msgs.findIndex((m) => m.t === 'action' && m.action.type === 'place');
    const release = msgs.findIndex((m, i) => i > place && m.t === 'fx.cursor' && m.drag === null);
    const ready = msgs.findIndex((m) => m.t === 'action' && m.action.type === 'ready');

    expect(writing).toBeGreaterThan(0);
    expect(clue).toBeGreaterThan(writing);
    expect(firstDrag).toBeGreaterThan(clue);
    expect(place).toBeGreaterThan(firstDrag);
    expect(release).toBeGreaterThan(place);
    expect(ready).toBeGreaterThan(release);

    expect(msgs[clue]).toMatchObject({ action: { type: 'clue', cardId: card, text: clueFor(value, () => 0.5) } });
    expect(msgs[ready]).toMatchObject({ action: { type: 'ready', ready: true } });
    // vários quadros de arrasto (animação ~30 Hz), todos dentro do feltro
    const dragFrames = msgs.filter((m) => m.t === 'fx.cursor' && m.drag?.cardId === card && m.zone === 'table');
    expect(dragFrames.length).toBeGreaterThan(10);
    expect(server.state.room.game.row).toContain(card);
    expect(server.state.room.game.ready).toContain('p1');
    // pronto uma vez só
    expect(actions(server.state.socket!).filter((a) => a.type === 'ready')).toHaveLength(1);
  });

  it('fica pronto de novo depois de alguém mexer na fila', async () => {
    const server = fakeServer(sortingRoom(2));
    await boot(server);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(server.state.room.game.ready).toContain('p1');

    server.state.room = act(server.state.room, 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
    server.push();
    expect(server.state.room.game.ready).toEqual([]);
    await vi.advanceTimersByTimeAsync(1_400);
    expect(actions(server.state.socket!).filter((a) => a.type === 'ready')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(actions(server.state.socket!).filter((a) => a.type === 'ready')).toHaveLength(2);
    expect(server.state.room.game.ready).toContain('p1');
    // não mexe na carta dos outros nem em ações de host
    expect(actions(server.state.socket!).every((a) => ['clue', 'place', 'ready'].includes(a.type))).toBe(true);
  });

  it('às vezes empurra a própria carta uma posição antes de ficar pronto', async () => {
    // p0 já pôs a carta: a fila do bot terá 2 cartas e dá pra empurrar
    const server = fakeServer(act(sortingRoom(2), 'p0', { type: 'place', cardId: 'p0:0', index: 0 }));
    await boot(server, () => 0.1); // < 0.15: empurra
    await vi.advanceTimersByTimeAsync(30_000);
    const acts = actions(server.state.socket!);
    const places = acts.filter((a) => a.type === 'place');
    expect(places).toHaveLength(2);
    expect(places.every((a) => a.type === 'place' && a.cardId === 'p1:0')).toBe(true);
    const lastPlace = acts.lastIndexOf(places[1]!);
    expect(acts.findIndex((a) => a.type === 'ready')).toBeGreaterThan(lastPlace);
    expect(server.state.room.game.ready).toContain('p1');
  });

  it('parado: move o cursor de vez em quando pelo feltro', async () => {
    const room = sortingRoom(2);
    const server = fakeServer({ ...room, game: { ...room.game, phase: 'reveal' } });
    await boot(server);
    await vi.advanceTimersByTimeAsync(10_000);
    const cursors = server.state.socket!.messages().filter((m) => m.t === 'fx.cursor');
    expect(cursors.length).toBeGreaterThan(10);
    expect(cursors.every((m) => m.t === 'fx.cursor' && m.zone === 'table' && m.drag === null)).toBe(true);
    expect(actions(server.state.socket!)).toEqual([]);
  });

  it('stop encerra a conexão e todos os timers', async () => {
    const server = fakeServer(sortingRoom(2));
    const bot = await boot(server);
    await vi.advanceTimersByTimeAsync(3_000);
    bot.stop();
    expect(vi.getTimerCount()).toBe(0);
    const before = server.state.socket!.sent.length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(server.state.socket!.sent.length).toBe(before);
  });
});
