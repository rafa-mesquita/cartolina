import { SELF } from 'cloudflare:test';
import type { PicturesRoomView } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { joined, newGameRoom } from './helpers';

const isBuilding = (r: PicturesRoomView) => r.game.phase === 'building';

describe('Retratim no servidor', () => {
  it('POST /rooms { game: "pictures" } cria a sala e o GET conta que é de Retratim', async () => {
    const code = await newGameRoom('pictures');
    const body = await (await SELF.fetch(`https://x/rooms/${code}`)).json();
    expect(body).toMatchObject({ exists: true, game: 'pictures', phase: 'lobby' });
  });

  it('o histórico do Retratim ainda não existe (vem no Plano R4)', async () => {
    const res = await SELF.fetch('https://x/history/pictures');
    expect(res.status).toBe(404);
  });

  it('começa com 3: cada um vê a própria coordenada e kits diferentes; rascunho alheio não vaza', async () => {
    const code = await newGameRoom('pictures');
    const players = await joined(code, 3);
    players[0]!.client.send({ t: 'action', action: { type: 'start' } });
    const views = await Promise.all(players.map((p) => p.client.state<PicturesRoomView>(isBuilding)));
    for (const v of views) {
      expect(v.game.mySecret).toMatch(/^[A-D][1-4]$/);
      expect(v.game.grid).toHaveLength(16);
    }
    expect(new Set(Object.values(views[0]!.game.kits)).size).toBe(3);
    expect(views[0]!.game.kits[players[0]!.id]).toBe('cubes');

    const cubes = { kit: 'cubes', cells: [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5] };
    players[0]!.client.send({ t: 'action', action: { type: 'draft', work: cubes } });
    players[0]!.client.send({ t: 'action', action: { type: 'ready', on: true } });
    const seen = await players[1]!.client.state<PicturesRoomView>((r) => r.game.ready.includes(players[0]!.id));
    expect(seen.game.works).toEqual({});
    const mine = await players[0]!.client.state<PicturesRoomView>((r) => r.game.ready.includes(players[0]!.id));
    expect(mine.game.works[players[0]!.id]).toEqual(cubes);
  });

  it('a mensagem state leva a hora do servidor', async () => {
    const code = await newGameRoom('pictures');
    const [p] = await joined(code, 1);
    const msg = await p!.client.next('state');
    expect(typeof msg.now).toBe('number');
    expect(Math.abs(msg.now! - Date.now())).toBeLessThan(5000);
  });

  it('kit errado volta como erro em português', async () => {
    const code = await newGameRoom('pictures');
    const players = await joined(code, 3);
    players[0]!.client.send({ t: 'action', action: { type: 'start' } });
    await players[0]!.client.state<PicturesRoomView>(isBuilding);
    players[0]!.client.send({ t: 'action', action: { type: 'draft', work: { kit: 'icons', ids: [0, 1] } } });
    const err = await players[0]!.client.next('error');
    expect(err).toMatchObject({ code: 'wrong_kit', message: 'Esse não é o seu kit nesta rodada.' });
  });
});
