import { describe, expect, it } from 'vitest';
import type { GameContext } from '../src/game';
import { applyItoAction, initialItoState } from '../src/games/ito/rules';
import type { ItoAction, ItoState } from '../src/games/ito/types';
import { mulberry32 } from '../src/rng';

export function ctx(active: string[], hostId: string | null = active[0] ?? null, seed = 1): GameContext {
  return { hostId, active, rng: mulberry32(seed) };
}

export function act(state: ItoState, playerId: string, action: ItoAction, c: GameContext): ItoState {
  const res = applyItoAction(state, playerId, action, c);
  if (!res.ok) throw new Error(`ação recusada: ${res.error}`);
  return res.state;
}

export function errorOf(state: ItoState, playerId: string, action: ItoAction, c: GameContext): string {
  const res = applyItoAction(state, playerId, action, c);
  if (res.ok) throw new Error('esperava erro');
  return res.error;
}

/** Leva um jogo de `players` até a fase de ordenação. */
export function toSorting(players: string[], mode: 'livre' | 'campanha' = 'livre'): ItoState {
  const c = ctx(players);
  let s = initialItoState();
  s = act(s, players[0]!, { type: 'setMode', mode }, c);
  s = act(s, players[0]!, { type: 'start' }, c);
  return act(s, players[0]!, { type: 'beginRound' }, c);
}

describe('lobby', () => {
  it('começa no lobby, modo livre, 3 vidas', () => {
    const s = initialItoState();
    expect(s.phase).toBe('lobby');
    expect(s.mode).toBe('livre');
    expect(s.lives).toBe(3);
  });

  it('só o host muda o modo', () => {
    const c = ctx(['a', 'b']);
    expect(errorOf(initialItoState(), 'b', { type: 'setMode', mode: 'campanha' }, c)).toBe('not_host');
    expect(act(initialItoState(), 'a', { type: 'setMode', mode: 'campanha' }, c).mode).toBe('campanha');
  });

  it('precisa de 2 jogadores ativos para começar', () => {
    expect(errorOf(initialItoState(), 'a', { type: 'start' }, ctx(['a']))).toBe('not_enough_players');
  });

  it('start vai para a fase de tema com os ativos como jogadores', () => {
    const s = act(initialItoState(), 'a', { type: 'start' }, ctx(['a', 'b', 'c']));
    expect(s.phase).toBe('theme');
    expect(s.players).toEqual(['a', 'b', 'c']);
    expect(s.theme).not.toBeNull();
    expect(s.usedThemes).toHaveLength(1);
    expect(s.level).toBe(1);
  });

  it('não dá pra começar fora do lobby', () => {
    const c = ctx(['a', 'b']);
    const s = act(initialItoState(), 'a', { type: 'start' }, c);
    expect(errorOf(s, 'a', { type: 'start' }, c)).toBe('bad_phase');
  });
});

describe('tema', () => {
  const c = ctx(['a', 'b']);
  const inTheme = () => act(initialItoState(), 'a', { type: 'start' }, c);

  it('host sorteia outro tema sem repetir', () => {
    const s0 = inTheme();
    const s1 = act(s0, 'a', { type: 'rerollTheme' }, ctx(['a', 'b'], 'a', 99));
    expect(s1.theme?.titulo).not.toBe(s0.theme?.titulo);
    expect(s1.usedThemes).toHaveLength(2);
  });

  it('host define tema próprio (limpo)', () => {
    const s = act(inTheme(), 'a', { type: 'customTheme', theme: { titulo: ' Pizzas ', min: 'ruim', max: 'boa' } }, c);
    expect(s.theme).toEqual({ titulo: 'Pizzas', min: 'ruim', max: 'boa' });
  });

  it('rejeita tema inválido e não-host', () => {
    expect(errorOf(inTheme(), 'a', { type: 'customTheme', theme: { titulo: '', min: 'a', max: 'b' } }, c)).toBe('bad_theme');
    expect(errorOf(inTheme(), 'b', { type: 'rerollTheme' }, c)).toBe('not_host');
  });
});

describe('distribuição', () => {
  it('modo livre: 1 carta por jogador, valores únicos de 1 a 100', () => {
    const s = toSorting(['a', 'b', 'c', 'd']);
    expect(s.phase).toBe('sorting');
    const cards = Object.values(s.cards);
    expect(cards).toHaveLength(4);
    expect(new Set(cards.map((x) => x.value)).size).toBe(4);
    for (const card of cards) {
      expect(card.value).toBeGreaterThanOrEqual(1);
      expect(card.value).toBeLessThanOrEqual(100);
      expect(card.clue).toBe('');
    }
    expect(cards.map((x) => x.owner).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(s.row).toEqual([]);
  });

  it('campanha nível 1 dá 1 carta por jogador', () => {
    const s = toSorting(['a', 'b'], 'campanha');
    expect(Object.values(s.cards)).toHaveLength(2);
  });

  it('10 jogadores no nível 3 recebem 30 cartas únicas', () => {
    const players = Array.from({ length: 10 }, (_, i) => `p${i}`);
    const c = ctx(players);
    let s = toSorting(players, 'campanha');
    s = { ...s, phase: 'theme', level: 3 };
    s = act(s, 'p0', { type: 'beginRound' }, c);
    const values = Object.values(s.cards).map((x) => x.value);
    expect(values).toHaveLength(30);
    expect(new Set(values).size).toBe(30);
  });
});
