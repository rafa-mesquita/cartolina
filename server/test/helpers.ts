import { SELF } from 'cloudflare:test';
import { HEARTBEAT_PONG, type ClientMessage, type ItoRoomView, type RoomView, type ServerMessage } from '@cartolina/shared';

export async function newRoomCode(): Promise<string> {
  const res = await SELF.fetch('https://x/rooms', { method: 'POST' });
  if (res.status !== 201) throw new Error(`criar sala falhou: ${res.status}`);
  return ((await res.json()) as { code: string }).code;
}

export interface TestClient {
  ws: WebSocket;
  send(msg: ClientMessage): void;
  next<T extends ServerMessage['t']>(t: T): Promise<Extract<ServerMessage, { t: T }>>;
  /** Padrão ITO (a maioria dos testes); salas de Dixit usam `state<DixitRoomView>(…)`. */
  state<V extends RoomView = ItoRoomView>(pred: (room: V) => boolean): Promise<V>;
  inbox: ServerMessage[];
  /** Respostas de texto puro (ex.: "pong") que não são mensagens JSON do protocolo. */
  raw: string[];
  /** Resolve quando o servidor (ou nós) fecha o socket. */
  closed: Promise<{ code: number; reason: string }>;
}

/**
 * Barreira de ordenação: o DO processa as mensagens de um socket em ordem, então quando o
 * próprio fx.ping volta, tudo que foi enviado antes já foi processado e transmitido.
 */
export async function barrier(client: TestClient): Promise<void> {
  client.send({ t: 'fx.ping', x: 0, y: 0 });
  await client.next('fx.ping');
}

export async function connect(code: string): Promise<TestClient> {
  const res = await SELF.fetch(`https://x/rooms/${code}/ws`, { headers: { Upgrade: 'websocket' } });
  if (res.status !== 101 || !res.webSocket) throw new Error(`upgrade falhou: ${res.status}`);
  const ws = res.webSocket;
  ws.accept();
  const inbox: ServerMessage[] = [];
  const raw: string[] = [];
  const closed = new Promise<{ code: number; reason: string }>((resolve) => {
    ws.addEventListener('close', (event) => {
      resolve({ code: event.code, reason: event.reason });
      // Responde o close como um navegador faria, para o DO ver o handshake completo (webSocketClose/handleGone).
      try {
        ws.close();
      } catch {
        // já fechado
      }
    });
  });
  let wake: (() => void) | null = null;
  ws.addEventListener('message', (event) => {
    const data = event.data as string;
    if (data === HEARTBEAT_PONG) {
      raw.push(data);
      wake?.();
      return;
    }
    inbox.push(JSON.parse(data) as ServerMessage);
    wake?.();
  });

  async function waitFor<M extends ServerMessage>(match: (m: ServerMessage) => m is M, label: string): Promise<M> {
    const deadline = Date.now() + 3000;
    for (;;) {
      const i = inbox.findIndex(match);
      if (i >= 0) return inbox.splice(i, 1)[0] as M;
      if (Date.now() > deadline) throw new Error(`timeout esperando ${label}; inbox: ${JSON.stringify(inbox)}`);
      await new Promise<void>((resolve) => {
        wake = resolve;
        setTimeout(resolve, 50);
      });
    }
  }

  return {
    ws,
    inbox,
    raw,
    closed,
    send: (msg) => ws.send(JSON.stringify(msg)),
    next: (t) => waitFor((m): m is Extract<ServerMessage, { t: typeof t }> => m.t === t, t),
    async state<V extends RoomView = ItoRoomView>(pred: (room: V) => boolean): Promise<V> {
      for (;;) {
        const m = await waitFor((x): x is Extract<ServerMessage, { t: 'state' }> => x.t === 'state', 'state');
        const room = m.room as V;
        if (pred(room)) return room;
      }
    },
  };
}

export const COLORS = ['#8EC5FF', '#FF8FAB', '#7EDDB5', '#C7B3FF'] as const;

export async function joined(code: string, n: number): Promise<{ client: TestClient; id: string; token: string }[]> {
  const out: { client: TestClient; id: string; token: string }[] = [];
  for (let i = 0; i < n; i++) {
    const client = await connect(code);
    const token = crypto.randomUUID();
    client.send({ t: 'join', token, name: `P${i}`, color: COLORS[i]! });
    const welcome = await client.next('welcome');
    out.push({ client, id: welcome.playerId, token });
  }
  return out;
}

export async function newGroup(name = 'Galera'): Promise<string> {
  const res = await SELF.fetch('https://x/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (res.status !== 201) throw new Error(`criar grupo falhou: ${res.status}`);
  return ((await res.json()) as { slug: string }).slug;
}

export async function newGroupRoom(name = 'Galera'): Promise<{ slug: string; code: string }> {
  const slug = await newGroup(name);
  const res = await SELF.fetch(`https://x/groups/${slug}/rooms`, { method: 'POST' });
  if (res.status !== 201) throw new Error(`criar sala do grupo falhou: ${res.status}`);
  return { slug, code: ((await res.json()) as { code: string }).code };
}

/** Dois jogadores jogam uma rodada livre até a revelação (host força a revelação). */
export async function playRound(code: string): Promise<{ client: TestClient; id: string; token: string }[]> {
  const players = await joined(code, 2);
  const [a, b] = players;
  a!.client.send({ t: 'action', action: { type: 'start' } });
  await a!.client.state((r) => r.game.phase === 'theme');
  a!.client.send({ t: 'action', action: { type: 'beginRound' } });
  const ra = await a!.client.state((r) => r.game.phase === 'sorting');
  const cardA = Object.values(ra.game.cards).find((c) => c.owner === a!.id)!;
  const cardB = Object.values(ra.game.cards).find((c) => c.owner === b!.id)!;
  a!.client.send({ t: 'action', action: { type: 'clue', cardId: cardA.id, text: 'Paris' } });
  a!.client.send({ t: 'action', action: { type: 'place', cardId: cardA.id, index: 0 } });
  await b!.client.state((r) => r.game.row.length === 1);
  b!.client.send({ t: 'action', action: { type: 'place', cardId: cardB.id, index: 1 } });
  await a!.client.state((r) => r.game.row.length === 2);
  a!.client.send({ t: 'action', action: { type: 'forceReveal' } });
  await a!.client.state((r) => r.game.phase === 'reveal');
  return players;
}
