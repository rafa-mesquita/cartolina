import { SELF } from 'cloudflare:test';
import type { DixitRoomView } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { joined, type TestClient } from './helpers';

async function newDixitRoom(): Promise<string> {
  const res = await SELF.fetch('https://x/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ game: 'dixit' }),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { code: string }).code;
}

/** Barreira sem fx.ping (o Dixit não repassa ping): uma ação inválida volta como erro, em ordem. */
async function errorBarrier(client: TestClient): Promise<void> {
  client.send({ t: 'action', action: { type: 'nada' } });
  expect((await client.next('error')).code).toBe('bad_action');
}

describe('Dixit no servidor', () => {
  it('GET /rooms/:code diz que a sala é de Dixit', async () => {
    const code = await newDixitRoom();
    const body = await (await SELF.fetch(`https://x/rooms/${code}`)).json();
    expect(body).toMatchObject({ exists: true, game: 'dixit', phase: 'lobby' });
  });

  it('ação do ITO em sala de Dixit dá bad_action', async () => {
    const code = await newDixitRoom();
    const [a] = await joined(code, 1);
    a!.client.send({ t: 'action', action: { type: 'beginRound' } });
    expect((await a!.client.next('error')).code).toBe('bad_action');
  });

  it('não repassa ping nem cursor', async () => {
    const code = await newDixitRoom();
    const [a, b] = await joined(code, 2);
    a!.client.send({ t: 'fx.ping', x: 0.5, y: 0.5 });
    a!.client.send({ t: 'fx.cursor', zone: 'table', x: 0.5, y: 0.5, drag: null });
    a!.client.send({ t: 'fx.activity', activity: 'thinking' });
    await errorBarrier(a!.client);
    await errorBarrier(b!.client);
    expect(b!.client.inbox.some((m) => m.t === 'fx.ping' || m.t === 'fx.cursor')).toBe(false);
    expect(a!.client.inbox.some((m) => m.t === 'fx.ping')).toBe(false);
    // status continua sendo repassado no Dixit
    expect(b!.client.inbox.some((m) => m.t === 'fx.activity')).toBe(true);
  });

  it('joga uma rodada com 3 pessoas até a revelação', async () => {
    const code = await newDixitRoom();
    const players = await joined(code, 3);
    players[0]!.client.send({ t: 'action', action: { type: 'start' } });
    const views = await Promise.all(
      players.map((p) => p.client.state<DixitRoomView>((r) => r.game.phase === 'storytelling')),
    );
    const tellerId = views[0]!.game.storyteller!;
    const teller = players.find((p) => p.id === tellerId)!;
    const tellerView = views[players.indexOf(teller)]!;
    teller.client.send({ t: 'action', action: { type: 'tell', cardId: tellerView.game.hand[0]!, clue: 'saudade' } });

    const rest = players.filter((p) => p.id !== tellerId);
    for (const p of rest) {
      const v = await p.client.state<DixitRoomView>((r) => r.game.phase === 'submitting');
      expect(v.game.clue).toBe('saudade');
      expect(v.game.storyCard).toBeNull();
      p.client.send({ t: 'action', action: { type: 'submit', cardIds: v.game.hand.slice(0, 2) } });
      p.client.send({ t: 'action', action: { type: 'confirm' } });
    }
    for (const p of rest) {
      const v = await p.client.state<DixitRoomView>((r) => r.game.phase === 'voting');
      expect(v.game.table).toHaveLength(5);
      const target = v.game.table.find((t) => !t.mine)!;
      p.client.send({ t: 'action', action: { type: 'vote', cardId: target.cardId } });
      p.client.send({ t: 'action', action: { type: 'confirm' } });
    }
    const done = await teller.client.state<DixitRoomView>((r) => r.game.phase === 'reveal');
    expect(done.game.result?.storyteller).toBe(tellerId);
    expect(Object.keys(done.game.result!.votes)).toHaveLength(2);
  });
});
