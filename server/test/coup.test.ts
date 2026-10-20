import { SELF } from 'cloudflare:test';
import type { CoupRoomView } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { joined, newGameRoom } from './helpers';

const playing = (r: CoupRoomView) => r.game.phase === 'turn';

describe('Cúpi no servidor', () => {
  it('POST /rooms { game: "coup" } cria a sala e o GET conta que é de Cúpi', async () => {
    const code = await newGameRoom('coup');
    const body = await (await SELF.fetch(`https://x/rooms/${code}`)).json();
    expect(body).toMatchObject({ exists: true, game: 'coup', phase: 'lobby' });
  });

  it('o histórico do Cúpi responde', async () => {
    const res = await SELF.fetch('https://x/history/coup');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ game: 'coup' });
  });

  it('começa com 2: cada um vê só as próprias cartas e a mesma vez', async () => {
    const code = await newGameRoom('coup');
    const players = await joined(code, 2);
    players[0]!.client.send({ t: 'action', action: { type: 'start' } });
    const views = await Promise.all(players.map((p) => p.client.state<CoupRoomView>(playing)));
    for (const v of views) {
      expect(v.game.myCards).toHaveLength(2);
      expect(v.game.seats.map((s) => s.hidden)).toEqual([2, 2]);
      expect(v.game.deckSize).toBe(11);
    }
    expect(views[0]!.game.turn).toBe(views[1]!.game.turn);
  });

  it('jogar fora da vez volta erro em português', async () => {
    const code = await newGameRoom('coup');
    const players = await joined(code, 2);
    players[0]!.client.send({ t: 'action', action: { type: 'start' } });
    const view = await players[0]!.client.state<CoupRoomView>(playing);
    const other = players.find((p) => p.id !== view.game.turn)!;
    other.client.send({ t: 'action', action: { type: 'act', kind: 'income' } });
    const err = await other.client.next('error');
    expect(err).toMatchObject({ code: 'not_your_turn', message: 'Não é a sua vez.' });
  });
});
