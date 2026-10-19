import { describe, expect, it } from 'vitest';
import {
  actError,
  alive,
  blockersOf,
  canBlock,
  canChallenge,
  coinsOf,
  hiddenOf,
  isAlive,
  nextAlive,
  treasury,
  without,
} from '../src/games/coup/table';
import type { CoupCharacter, CoupState, CoupWindow } from '../src/games/coup/types';

/** Mesa mínima: cada jogador com moedas e cartas [personagem, virada pra cima?]. */
function st(hands: Record<string, { coins?: number; cards: [CoupCharacter, boolean][] }>): CoupState {
  const players = Object.keys(hands);
  return {
    phase: 'turn',
    match: 1,
    players,
    hands: Object.fromEntries(
      players.map((p) => [
        p,
        { coins: hands[p]!.coins ?? 2, cards: hands[p]!.cards.map(([character, revealed]) => ({ character, revealed })) },
      ]),
    ),
    deck: [],
    turn: players[0]!,
    declared: null,
    block: null,
    window: null,
    loss: null,
    drawn: [],
    out: [],
    winner: null,
    wins: {},
    log: [],
  };
}

const three = () =>
  st({
    p0: { cards: [['duke', false], ['captain', false]] },
    p1: { cards: [['contessa', true], ['assassin', true]] },
    p2: { coins: 5, cards: [['ambassador', true], ['duke', false]] },
  });

const win = (kind: CoupWindow['kind']): CoupWindow => ({ kind, eligible: [], passed: [], endsAt: 0 });

describe('Cúpi: consultas da mesa', () => {
  it('cartas viradas pra baixo, vivos e moedas', () => {
    const s = three();
    expect(hiddenOf(s, 'p0')).toEqual(['duke', 'captain']);
    expect(hiddenOf(s, 'p2')).toEqual(['duke']);
    expect(hiddenOf(s, 'p9')).toEqual([]);
    expect(hiddenOf(s, '__proto__')).toEqual([]);
    expect(isAlive(s, 'p1')).toBe(false);
    expect(alive(s)).toEqual(['p0', 'p2']);
    expect(coinsOf(s, 'p2')).toBe(5);
    expect(coinsOf(s, 'p9')).toBe(0);
  });

  it('tesouro = 50 menos as moedas dos jogadores', () => {
    expect(treasury(three())).toBe(50 - 2 - 2 - 5);
  });

  it('próximo vivo pula quem saiu e dá a volta', () => {
    const s = three();
    expect(nextAlive(s, 'p0')).toBe('p2');
    expect(nextAlive(s, 'p2')).toBe('p0');
    expect(nextAlive(s, 'p1')).toBe('p2');
  });

  it('quem bloqueia: ajuda externa, qualquer outro vivo; extorquir/assassinar, só o alvo vivo; taxar, ninguém', () => {
    const s = st({
      p0: { cards: [['duke', false], ['captain', false]] },
      p1: { cards: [['contessa', false], ['assassin', false]] },
      p2: { cards: [['ambassador', true], ['duke', true]] },
      p3: { cards: [['captain', false], ['duke', false]] },
    });
    expect(blockersOf(s, { actor: 'p0', kind: 'foreignAid', target: null })).toEqual(['p1', 'p3']);
    expect(blockersOf(s, { actor: 'p0', kind: 'steal', target: 'p1' })).toEqual(['p1']);
    expect(blockersOf(s, { actor: 'p0', kind: 'assassinate', target: 'p2' })).toEqual([]);
    expect(blockersOf(s, { actor: 'p0', kind: 'tax', target: null })).toEqual([]);
  });

  it('por que a ação não vale', () => {
    const s = three();
    expect(actError(s, 'p0', 'income', null)).toBeNull();
    expect(actError(s, 'p0', 'income', 'p2')).toBe('bad_target');
    expect(actError(s, 'p0', 'steal', null)).toBe('bad_target');
    expect(actError(s, 'p0', 'steal', 'p0')).toBe('bad_target');
    expect(actError(s, 'p0', 'steal', 'p1')).toBe('bad_target');
    expect(actError(s, 'p0', 'steal', 'p2')).toBeNull();
    expect(actError(s, 'p0', 'assassinate', 'p2')).toBe('not_enough_coins');
    expect(actError(s, 'p2', 'assassinate', 'p0')).toBeNull();
    expect(actError(s, 'p2', 'coup', 'p0')).toBe('not_enough_coins');
    const rich = { ...s, hands: { ...s.hands, p0: { ...s.hands.p0!, coins: 10 } } };
    expect(actError(rich, 'p0', 'tax', null)).toBe('must_coup');
    expect(actError(rich, 'p0', 'coup', 'p2')).toBeNull();
  });

  it('dá pra duvidar: da ação que declara personagem e de bloqueio; não da ajuda externa nem na janela só de bloqueio', () => {
    const s = three();
    expect(canChallenge(s)).toBe(false);
    expect(canChallenge({ ...s, declared: { actor: 'p0', kind: 'tax', target: null }, window: win('action') })).toBe(true);
    expect(canChallenge({ ...s, declared: { actor: 'p0', kind: 'foreignAid', target: null }, window: win('action') })).toBe(false);
    expect(canChallenge({ ...s, declared: { actor: 'p0', kind: 'foreignAid', target: null }, window: win('block') })).toBe(true);
    expect(canChallenge({ ...s, declared: { actor: 'p0', kind: 'steal', target: 'p2' }, window: win('blockOnly') })).toBe(false);
  });

  it('dá pra bloquear: só quem bloqueia a ação, e não na janela do bloqueio', () => {
    const s = { ...three(), declared: { actor: 'p0', kind: 'steal' as const, target: 'p2' } };
    expect(canBlock({ ...s, window: win('action') }, 'p2')).toBe(true);
    expect(canBlock({ ...s, window: win('action') }, 'p0')).toBe(false);
    expect(canBlock({ ...s, window: win('blockOnly') }, 'p2')).toBe(true);
    expect(canBlock({ ...s, window: win('block') }, 'p2')).toBe(false);
    expect(canBlock(three(), 'p2')).toBe(false);
  });

  it('tira cópias de cartas (troca)', () => {
    expect(without(['duke', 'duke', 'captain'], ['duke'])).toEqual(['duke', 'captain']);
    expect(without(['duke', 'captain'], ['duke', 'duke'])).toBeNull();
    expect(without(['duke', 'captain'], [])).toEqual(['duke', 'captain']);
  });
});
