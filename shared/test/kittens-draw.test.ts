import { describe, expect, it } from 'vitest';
import { KITTENS_CHOICE_MS } from '../src/games/kittens/types';
import { T0, act, ctxOf, ids, refuse, table } from './kittens-helpers';

const ctx = ctxOf(ids(3));

describe('comprar', () => {
  it('compra a de cima e passa a vez; só quem comprou vê a carta no diário', () => {
    const s = table({ hands: { p0: [], p1: [], p2: [] }, draw: ['pular-0', 'mico-0'] });
    const after = act(s, 'p0', { type: 'draw' }, ctx);
    expect(after.hands.p0).toEqual(['mico-0']);
    expect(after.draw).toEqual(['pular-0']);
    expect(after).toMatchObject({ current: 'p1', owed: 1 });
    expect(after.log.at(-1)).toEqual({ n: 0, ev: { t: 'draw', by: 'p0', card: 'mico-0' }, seenBy: ['p0'] });
  });

  it('sob ataque, comprar gasta só 1 dos turnos', () => {
    const s = table({ hands: { p0: [], p1: [], p2: [] }, draw: ['pular-0', 'mico-0'], owed: 2 });
    expect(act(s, 'p0', { type: 'draw' }, ctx)).toMatchObject({ current: 'p0', owed: 1 });
  });

  it('fora da vez não compra; quem já saiu também não', () => {
    const s = table({ hands: { p0: [], p1: [], p2: [] }, draw: ['mico-0'] });
    expect(refuse(s, 'p1', { type: 'draw' }, ctx)).toBe('not_your_turn');
    expect(refuse({ ...s, alive: ['p0', 'p1'] }, 'p2', { type: 'draw' }, ctx)).toBe('not_alive');
  });
});

describe('Tatubum sem Cafuné', () => {
  it('explode: a mão e o tatu saem do jogo e a vez passa com 1 turno', () => {
    const s = table({ hands: { p0: ['mico-0'], p1: [], p2: [] }, draw: ['pular-0', 'tatubum-0'], owed: 2 });
    const after = act(s, 'p0', { type: 'draw' }, ctx);
    expect(after.alive).toEqual(['p1', 'p2']);
    expect(after.hands.p0).toEqual([]);
    expect(after.out).toEqual(['tatubum-0', 'mico-0']);
    expect(after.draw).toEqual(['pular-0']);
    expect(after).toMatchObject({ phase: 'playing', current: 'p1', owed: 1 });
    expect(after.log.at(-1)!.ev).toEqual({ t: 'boom', by: 'p0' });
  });

  it('com 2 jogadores, quem sobra vence', () => {
    const s = table({ hands: { p0: [], p1: [] }, draw: ['tatubum-0'] });
    const after = act(s, 'p0', { type: 'draw' }, ctxOf(ids(2)));
    expect(after).toMatchObject({ phase: 'gameover', winner: 'p1', current: null, alive: ['p1'], pending: null, choice: null });
    expect(after.log.at(-1)!.ev).toEqual({ t: 'win', by: 'p1' });
  });
});

describe('Tatubum com Cafuné', () => {
  const defusing = () =>
    act(
      table({ hands: { p0: ['cafune-0', 'mico-0'], p1: [], p2: [] }, draw: ['pular-0', 'quati-0', 'tatubum-0'] }),
      'p0',
      { type: 'draw' },
      ctx,
    );

  it('o Cafuné vai pro descarte e abre a escolha de onde esconder o tatu', () => {
    const after = defusing();
    expect(after.hands.p0).toEqual(['mico-0']);
    expect(after.discard).toEqual(['cafune-0']);
    expect(after.draw).toEqual(['pular-0', 'quati-0']);
    expect(after.choice).toEqual({ kind: 'cafune', who: 'p0', tatu: 'tatubum-0', deadline: T0 + KITTENS_CHOICE_MS });
    expect(after.current).toBe('p0');
    expect(after.log.at(-1)!.ev).toEqual({ t: 'cafune', by: 'p0' });
    expect(refuse(after, 'p0', { type: 'draw' }, ctx)).toBe('waiting_choice');
  });

  it.each([
    [0, ['pular-0', 'quati-0', 'tatubum-0']],
    [1, ['pular-0', 'tatubum-0', 'quati-0']],
    [2, ['tatubum-0', 'pular-0', 'quati-0']],
  ])('esconde o tatu %i abaixo do topo e passa a vez', (position, draw) => {
    const after = act(defusing(), 'p0', { type: 'choose', position }, ctx);
    expect(after.draw).toEqual(draw);
    expect(after).toMatchObject({ choice: null, current: 'p1', owed: 1 });
    expect(after.log.at(-1)!.ev).toEqual({ t: 'hid', by: 'p0' });
  });

  it('aleatório põe em algum lugar; posição fora do monte ou de outra pessoa não vale', () => {
    const after = act(defusing(), 'p0', { type: 'choose', position: 'random' }, ctx);
    expect([...after.draw].sort()).toEqual(['pular-0', 'quati-0', 'tatubum-0']);
    expect(refuse(defusing(), 'p0', { type: 'choose', position: 3 }, ctx)).toBe('bad_choice');
    expect(refuse(defusing(), 'p0', { type: 'choose' }, ctx)).toBe('bad_choice');
    expect(refuse(defusing(), 'p1', { type: 'choose', position: 0 }, ctx)).toBe('not_your_choice');
  });

  it('sob ataque, o Cafuné gasta 1 turno e a vez continua', () => {
    const s = table({ hands: { p0: ['cafune-0'], p1: [], p2: [] }, draw: ['pular-0', 'tatubum-0'], owed: 2 });
    const hid = act(act(s, 'p0', { type: 'draw' }, ctx), 'p0', { type: 'choose', position: 0 }, ctx);
    expect(hid).toMatchObject({ current: 'p0', owed: 1 });
  });
});
