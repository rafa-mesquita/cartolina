import { SELF } from 'cloudflare:test';
import type { MandacaruRoomView } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { joined, newGameRoom } from './helpers';

const playing = (r: MandacaruRoomView) => r.game.phase === 'setup';

describe('Mandacaru no servidor', () => {
  it('POST /rooms { game: "mandacaru" } cria a sala', async () => {
    const code = await newGameRoom('mandacaru');
    const body = await (await SELF.fetch(`https://x/rooms/${code}`)).json();
    expect(body).toMatchObject({ exists: true, game: 'mandacaru', phase: 'lobby' });
  });

  it('o histórico do Mandacaru ainda não existe (vem no M3)', async () => {
    const res = await SELF.fetch('https://x/history/mandacaru');
    expect(res.status).toBe(404);
  });

  it('começa com 3: todos veem o mesmo tabuleiro e só as próprias cartas', async () => {
    const code = await newGameRoom('mandacaru');
    const players = await joined(code, 3);
    players[0]!.client.send({ t: 'action', action: { type: 'start' } });
    const views = await Promise.all(players.map((p) => p.client.state<MandacaruRoomView>(playing)));
    for (const v of views) {
      expect(v.game.layout!.hexes).toHaveLength(19);
      expect(v.game.myRes).not.toBeNull();
      expect(v.game).not.toHaveProperty('deck');
    }
    expect(views[0]!.game.layout).toEqual(views[1]!.game.layout);
    const turn = views[0]!.game.turn;
    const me = views.find((v) => v.you === turn)!;
    expect(me.game.can.placeHouse.length).toBeGreaterThan(0);
  });

  it('casa fora do lugar volta erro em português', async () => {
    const code = await newGameRoom('mandacaru');
    const players = await joined(code, 3);
    players[0]!.client.send({ t: 'action', action: { type: 'start' } });
    const view = await players[0]!.client.state<MandacaruRoomView>(playing);
    const p = players.find((x) => x.id === view.game.turn)!;
    // na preparação a casa vem antes da estrada
    p.client.send({ t: 'action', action: { type: 'place_road', edge: 0 } });
    const err = await p.client.next('error');
    expect(err).toMatchObject({ code: 'bad_phase', message: 'Agora não dá pra fazer isso.' });
  });
});
