import { SELF } from 'cloudflare:test';
import type { CamelioRoomView } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { joined, newGameRoom } from './helpers';

const isPlaying = (r: CamelioRoomView) => r.game.phase === 'playing';

describe('Cama-Leão no servidor', () => {
  it('POST /rooms { game: "camelio" } cria a sala e o GET conta que é de Cama-Leão', async () => {
    const code = await newGameRoom('camelio');
    const body = await (await SELF.fetch(`https://x/rooms/${code}`)).json();
    expect(body).toMatchObject({ exists: true, game: 'camelio', phase: 'lobby' });
  });

  it('o histórico do Cama-Leão ainda não existe (vem no Plano C4)', async () => {
    const res = await SELF.fetch('https://x/history/camelio');
    expect(res.status).toBe(404);
  });

  it('dois jogadores: começa, joga e a vez passa; o topo do monte só mostra o verso', async () => {
    const code = await newGameRoom('camelio');
    const players = await joined(code, 2);
    players[0]!.client.send({ t: 'action', action: { type: 'start' } });
    const views = await Promise.all(players.map((p) => p.client.state<CamelioRoomView>(isPlaying)));
    const v = views[0]!;
    expect(v.game.deckCount).toBe(71);
    expect(v.game.target).toBe(4);
    expect(v.game.top).not.toBeNull();
    expect(v.game.top).not.toHaveProperty('id');
    expect(v.game).not.toHaveProperty('deck');

    const turn = v.game.turn!;
    const me = players.find((p) => p.id === turn)!;
    const other = players.find((p) => p.id !== turn)!;
    me.client.send({ t: 'action', action: { type: 'play', from: 'open', to: other.id } });
    const after = await other.client.state<CamelioRoomView>((r) => r.game.playCount === 1);
    expect(after.game.turn).toBe(other.id);
    expect(after.game.last).toMatchObject({ by: me.id, to: other.id, from: 'open', outcome: 'none' });
    expect(after.game.table[other.id]).toHaveLength(1);
  });

  it('jogar fora da vez volta como erro em português', async () => {
    const code = await newGameRoom('camelio');
    const players = await joined(code, 2);
    players[0]!.client.send({ t: 'action', action: { type: 'start' } });
    const v = await players[0]!.client.state<CamelioRoomView>(isPlaying);
    const waiting = players.find((p) => p.id !== v.game.turn)!;
    waiting.client.send({ t: 'action', action: { type: 'play', from: 'deck', to: waiting.id } });
    const err = await waiting.client.next('error');
    expect(err).toMatchObject({ code: 'not_your_turn', message: 'Não é a sua vez.' });
  });

  it('dois jogadores jogam até o fim, e o host joga de novo', async () => {
    const code = await newGameRoom('camelio');
    const players = await joined(code, 2);
    const host = players[0]!;
    host.client.send({ t: 'action', action: { type: 'start' } });
    const started = await Promise.all(players.map((p) => p.client.state<CamelioRoomView>(isPlaying)));

    // O host acompanha o estado; quem tem a vez compra do monte pra si mesmo.
    let view = started[0]!;
    for (let n = 0; n < 200 && view.game.phase === 'playing'; n++) {
      const actor = players.find((p) => p.id === view.game.turn)!;
      actor.client.send({ t: 'action', action: { type: 'play', from: 'deck', to: actor.id } });
      view = await host.client.state<CamelioRoomView>((r) => r.game.playCount === n + 1 || r.game.phase === 'over');
    }

    expect(view.game.phase).toBe('over');
    expect(view.game.winners.length).toBeGreaterThan(0);
    expect(['target', 'deck']).toContain(view.game.endReason);
    expect(view.game.turn).toBeNull();

    host.client.send({ t: 'action', action: { type: 'again' } });
    const novo = await host.client.state<CamelioRoomView>(
      (r) => r.game.phase === 'playing' && r.game.match === 2 && r.game.playCount === 0,
    );
    expect(novo.game.match).toBe(2);
  });
});
