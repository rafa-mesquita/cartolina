import { describe, expect, it } from 'vitest';
import { camelioOnPresenceChange, initialCamelioState } from '../src/games/camelio/rules';
import type { CamelioState } from '../src/games/camelio/types';
import { ctxOf, deepFreeze, ids, playing } from './camelio-helpers';

const presence = (state: CamelioState, active: string[]) =>
  camelioOnPresenceChange(deepFreeze(state), ctxOf(active));

describe('presença no Cama-Leão', () => {
  it('nada mudou: devolve o mesmo objeto', () => {
    const s = playing(3);
    expect(presence(s, ids(3))).toBe(s);
  });

  it('lobby e fim de jogo não mudam', () => {
    const lobby = initialCamelioState();
    expect(presence(lobby, [])).toBe(lobby);
    const over = playing(3, { phase: 'over', turn: null, winners: ['p0'], endReason: 'target' });
    expect(presence(over, ['p0'])).toBe(over);
  });

  it('quem estava na vez saiu: a vez passa pro próximo ativo', () => {
    expect(presence(playing(3), ['p1', 'p2'])).toMatchObject({ turn: 'p1', paused: false });
    expect(presence(playing(3), ['p2'])).toMatchObject({ turn: 'p0', paused: true });
  });

  it('saiu quem não estava na vez: só a mesa dele fica apagada (nada muda nas regras)', () => {
    const s = playing(3);
    expect(presence(s, ['p0', 'p1'])).toBe(s);
  });

  it('menos de 2 ativos pausa; voltando gente, despausa', () => {
    const paused = presence(playing(3), ['p0']);
    expect(paused).toMatchObject({ paused: true, turn: 'p0' });
    expect(presence(paused, ['p0', 'p1'])).toMatchObject({ paused: false, turn: 'p0' });
  });

  it('despausa sem quem estava na vez: a vez passa', () => {
    const paused = presence(playing(3), ['p1']);
    expect(paused).toMatchObject({ paused: true, turn: 'p0' });
    expect(presence(paused, ['p1', 'p2'])).toMatchObject({ paused: false, turn: 'p1' });
  });

  it('quem entra no meio não entra na partida', () => {
    const s = playing(3);
    expect(presence(s, ['p0', 'p1', 'p2', 'p3'])).toBe(s);
  });

  it('ninguém da partida ativo: pausa, e a vez não some', () => {
    expect(presence(playing(3), [])).toMatchObject({ paused: true, turn: 'p0', phase: 'playing' });
    expect(presence(playing(3), ['p9'])).toMatchObject({ paused: true, turn: 'p0', phase: 'playing' });
  });

  it('a vez dá a volta na mesa', () => {
    expect(presence(playing(3, { turn: 'p2' }), ['p0', 'p1'])).toMatchObject({ turn: 'p0' });
    expect(presence(playing(3, { turn: 'p1' }), ['p0', 'p2'])).toMatchObject({ turn: 'p2' });
  });

  it('é idempotente: a segunda chamada com a mesma presença devolve o mesmo objeto', () => {
    for (const act of [['p1', 'p2'], ['p0']]) {
      const a = presence(playing(3), act);
      expect(presence(a, act)).toBe(a);
    }
  });

  it('quem sai e volta não recupera a vez', () => {
    const a = presence(playing(3), ['p1', 'p2']);
    expect(a.turn).toBe('p1');
    expect(presence(a, ids(3))).toBe(a);
  });
});
