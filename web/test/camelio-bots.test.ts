import { camelioActionSchema, mulberry32, type Room } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { chooseCamelioPlay, decideCamelio } from '../src/dev/camelioBots';
import { camelioRoom, camelioView, patchGame, play, started, stateOf } from './camelio-fixtures';

/** Sala com `n` jogadores começada e com a vez de `who`. */
const turnOf = (room: Room, who: string) => patchGame(room, { turn: who });

describe('decideCamelio', () => {
  it('não faz nada fora da vez', () => {
    const room = started(3);
    const turn = stateOf(room).turn!;
    const other = stateOf(room).players.find((p) => p !== turn)!;
    expect(decideCamelio(camelioView(room, other), mulberry32(1))).toBeNull();
  });

  it('não faz nada no lobby nem pra quem não joga', () => {
    expect(decideCamelio(camelioView(camelioRoom(2), 'p0'), mulberry32(1))).toBeNull();
    expect(decideCamelio(camelioView(started(2), null), mulberry32(1))).toBeNull();
  });

  it('não faz nada pausado nem no fim da partida', () => {
    const room = started(2);
    const turn = stateOf(room).turn!;
    expect(decideCamelio(camelioView(patchGame(room, { paused: true }), turn), mulberry32(1))).toBeNull();
    expect(decideCamelio(camelioView(patchGame(room, { phase: 'over' }), turn), mulberry32(1))).toBeNull();
  });

  it('na vez, joga uma jogada válida num jogador conectado, com chave e espera de 1,8 a 2,8 s', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const room = started(4);
      const turn = stateOf(room).turn!;
      const view = camelioView(room, turn);
      const d = decideCamelio(view, mulberry32(seed));
      expect(d).not.toBeNull();
      expect(camelioActionSchema.safeParse(d!.action).success).toBe(true);
      expect(d!.action.type).toBe('play');
      if (d!.action.type !== 'play') continue;
      expect(view.seats.find((s) => s.id === (d!.action as { to: string }).to)?.connected).toBe(true);
      expect(d!.key).toBe(`${view.game.match}:${view.game.playCount}`);
      expect(d!.delay).toBeGreaterThanOrEqual(1800);
      expect(d!.delay).toBeLessThanOrEqual(2800);
      // a jogada que ele escolheu o servidor aceita
      expect(() => play(room, turn, d!.action)).not.toThrow();
    }
  });

  it('a chave muda a cada jogada da partida', () => {
    const room = started(2);
    const turn = stateOf(room).turn!;
    const first = decideCamelio(camelioView(room, turn), mulberry32(1))!;
    const next = play(room, turn, { type: 'play', from: 'open', to: turn });
    const nextTurn = stateOf(next).turn!;
    const second = decideCamelio(camelioView(next, nextTurn), mulberry32(1))!;
    expect(second.key).not.toBe(first.key);
  });

  it('nunca dá carta pra jogador desconectado', () => {
    const room = started(3);
    const turn = stateOf(room).turn!;
    const gone = stateOf(room).players.find((p) => p !== turn)!;
    const view = camelioView(room, turn);
    const dropped = { ...view, seats: view.seats.map((s) => (s.id === gone ? { ...s, connected: false } : s)) };
    for (let seed = 1; seed <= 30; seed++) {
      const d = decideCamelio(dropped, mulberry32(seed));
      expect((d?.action as { to?: string } | undefined)?.to).not.toBe(gone);
    }
  });

  it('pode fechar 5 na própria mesa: fica com a carta aberta', () => {
    const room = turnOf(patchGame(started(2), { open: 20, table: { p0: [], p1: [22] } }), 'p1');
    const d = decideCamelio(camelioView(room, 'p1'), mulberry32(3));
    expect(d?.action).toEqual({ type: 'play', from: 'open', to: 'p1' });
  });

  it('não dá a quem fecharia 5 na mesa dele', () => {
    // p0 tem vermelho 3 na mesa; a carta aberta é vermelho 2: dar pra p0 fecharia o ponto dele
    const room = turnOf(patchGame(started(2), { open: 20, table: { p0: [22], p1: [] } }), 'p1');
    const view = camelioView(room, 'p1').game;
    for (let seed = 1; seed <= 30; seed++) {
      const play = chooseCamelioPlay(view, 'p1', ['p0', 'p1'], mulberry32(seed));
      expect(play?.from === 'open' && play.to === 'p0').toBe(false);
    }
  });
});
