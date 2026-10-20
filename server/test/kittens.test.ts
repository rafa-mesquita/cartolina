import { SELF } from 'cloudflare:test';
import type { KittensRoomView } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { joined, newGameRoom } from './helpers';

const isPlaying = (r: KittensRoomView) => r.game.phase === 'playing';

describe('Tatubum no servidor', () => {
  it('POST /rooms { game: "kittens" } cria a sala e o GET conta que é de Tatubum', async () => {
    const code = await newGameRoom('kittens');
    const body = await (await SELF.fetch(`https://x/rooms/${code}`)).json();
    expect(body).toMatchObject({ exists: true, game: 'kittens', phase: 'lobby' });
  });

  it('o histórico do Tatubum ainda não existe', async () => {
    const res = await SELF.fetch('https://x/history/kittens');
    expect(res.status).toBe(404);
  });

  it('começa com 2: cada um vê só a própria mão de 8 cartas', async () => {
    const code = await newGameRoom('kittens');
    const players = await joined(code, 2);
    players[0]!.client.send({ t: 'action', action: { type: 'start' } });
    const views = await Promise.all(players.map((p) => p.client.state<KittensRoomView>(isPlaying)));
    for (const v of views) {
      expect(v.game.hand).toHaveLength(8);
      expect(v.game.handCounts).toEqual({ [players[0]!.id]: 8, [players[1]!.id]: 8 });
      // Quem começa é sorteado (pode ser qualquer um dos dois), mas todos veem o mesmo.
      expect(players.map((p) => p.id)).toContain(v.game.current);
    }
    expect(views[1]!.game.current).toBe(views[0]!.game.current);
    expect(views[0]!.game.hand).not.toEqual(views[1]!.game.hand);
  });

  it('comprar fora da vez volta erro em português', async () => {
    const code = await newGameRoom('kittens');
    const players = await joined(code, 2);
    players[0]!.client.send({ t: 'action', action: { type: 'start' } });
    const v = await players[1]!.client.state<KittensRoomView>(isPlaying);
    // Quem começa é sorteado: tenta comprar quem NÃO está na vez.
    const waiting = players.find((p) => p.id !== v.game.current)!;
    waiting.client.send({ t: 'action', action: { type: 'draw' } });
    const err = await waiting.client.next('error');
    expect(err).toMatchObject({ code: 'not_your_turn', message: 'Não é a sua vez.' });
  });
});
