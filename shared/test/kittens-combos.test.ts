import { describe, expect, it } from 'vitest';
import { settleKittens } from '../src/games/kittens/settle';
import { KITTENS_CHOICE_MS, type KittensAction } from '../src/games/kittens/types';
import { T0, act, ctxOf, ids, refuse, table } from './kittens-helpers';

const ctx = ctxOf(ids(3));
const at = (ms: number) => ctxOf(ids(3), { now: T0 + ms });
const hands = () => ({
  p0: ['favor-0', 'capivara-0', 'capivara-1', 'capivara-2', 'mico-0', 'quati-0', 'tamandua-0', 'preguica-0'],
  p1: ['ataque-5', 'pular-5'],
  p2: ['espiar-5'],
});

/** p0 joga `action` e a janela de 5 s passa sem Nem vem!. */
function resolved(action: KittensAction, discard: string[] = []) {
  const s = act(table({ hands: hands(), discard, draw: ['pular-9', 'mico-9'] }), 'p0', action, ctx);
  return settleKittens(s, at(5000));
}

describe('Favor', () => {
  const favor: KittensAction = { type: 'play', cards: ['favor-0'], target: 'p1' };

  it('o alvo escolhe o que dar; só os dois veem qual carta', () => {
    const s = resolved(favor);
    expect(s.choice).toEqual({ kind: 'favor', who: 'p1', to: 'p0', deadline: T0 + 5000 + KITTENS_CHOICE_MS });
    expect(refuse(s, 'p0', { type: 'draw' }, at(5000))).toBe('waiting_choice');
    expect(refuse(s, 'p0', { type: 'choose', card: 'ataque-5' }, at(5000))).toBe('not_your_choice');
    expect(refuse(s, 'p1', { type: 'choose', card: 'mico-0' }, at(5000))).toBe('bad_choice');
    expect(refuse(s, 'p1', { type: 'choose' }, at(5000))).toBe('bad_choice');
    const given = act(s, 'p1', { type: 'choose', card: 'pular-5' }, at(5000));
    expect(given.hands.p1).toEqual(['ataque-5']);
    expect(given.hands.p0).toContain('pular-5');
    expect(given).toMatchObject({ choice: null, current: 'p0', owed: 1 });
    expect(given.log.at(-1)).toMatchObject({ ev: { t: 'gave', from: 'p1', to: 'p0', card: 'pular-5' }, seenBy: ['p1', 'p0'] });
  });

  it('sem resposta, no fim do prazo vai uma carta ao acaso', () => {
    const late = settleKittens(resolved(favor), at(5000 + KITTENS_CHOICE_MS));
    expect(late.choice).toBeNull();
    expect(late.hands.p1).toHaveLength(1);
    expect(late.hands.p0).toHaveLength(8);
  });
});

describe('combos', () => {
  it('par: rouba uma carta ao acaso; só os dois veem qual', () => {
    const s = resolved({ type: 'play', cards: ['capivara-0', 'capivara-1'], target: 'p1' });
    expect(s.hands.p1).toHaveLength(1);
    const stolen = s.hands.p0!.find((c) => c === 'ataque-5' || c === 'pular-5');
    expect(stolen).toBeDefined();
    expect(s.log.at(-1)).toMatchObject({ ev: { t: 'stole', from: 'p1', to: 'p0', card: stolen }, seenBy: ['p1', 'p0'] });
  });

  it('trio: pede pelo nome; se o alvo tiver, entrega; se não, nada', () => {
    const trio = ['capivara-0', 'capivara-1', 'capivara-2'];
    const got = resolved({ type: 'play', cards: trio, target: 'p1', ask: 'pular' });
    expect(got.hands.p1).toEqual(['ataque-5']);
    expect(got.hands.p0).toContain('pular-5');
    expect(got.log.at(-1)!.ev).toEqual({ t: 'asked', from: 'p1', to: 'p0', ask: 'pular', card: 'pular-5' });
    const none = resolved({ type: 'play', cards: trio, target: 'p1', ask: 'favor' });
    expect(none.hands.p1).toEqual(['ataque-5', 'pular-5']);
    expect(none.log.at(-1)!.ev).toEqual({ t: 'asked', from: 'p1', to: 'p0', ask: 'favor', card: null });
  });

  it('5 diferentes: escolhe do descarte de antes da jogada', () => {
    const cinco: KittensAction = { type: 'play', cards: ['capivara-0', 'mico-0', 'quati-0', 'tamandua-0', 'preguica-0'] };
    const s = resolved(cinco, ['ataque-7', 'espiar-7']);
    expect(s.choice).toEqual({ kind: 'cinco', who: 'p0', options: ['ataque-7', 'espiar-7'], deadline: T0 + 5000 + KITTENS_CHOICE_MS });
    expect(refuse(s, 'p0', { type: 'choose', card: 'mico-0' }, at(5000))).toBe('bad_choice');
    const picked = act(s, 'p0', { type: 'choose', card: 'espiar-7' }, at(5000));
    expect(picked.discard).not.toContain('espiar-7');
    expect(picked.hands.p0).toContain('espiar-7');
    expect(picked.choice).toBeNull();
    expect(picked.log.at(-1)!.ev).toEqual({ t: 'picked', by: 'p0', card: 'espiar-7' });
    const late = settleKittens(s, at(5000 + KITTENS_CHOICE_MS));
    expect(late.choice).toBeNull();
    expect(late.hands.p0!.filter((c) => c === 'ataque-7' || c === 'espiar-7')).toHaveLength(1);
  });

  it('5 diferentes com o descarte vazio: nada acontece', () => {
    const s = resolved({ type: 'play', cards: ['capivara-0', 'mico-0', 'quati-0', 'tamandua-0', 'preguica-0'] });
    expect(s.choice).toBeNull();
    expect(s.current).toBe('p0');
  });
});

describe('Cafuné sem resposta', () => {
  it('no fim do prazo o tatu vai pra um lugar ao acaso e a vez passa', () => {
    const s = act(table({ hands: { p0: ['cafune-0'], p1: [], p2: [] }, draw: ['mico-0', 'tatubum-0'] }), 'p0', { type: 'draw' }, ctx);
    expect(settleKittens(s, at(KITTENS_CHOICE_MS - 1))).toBe(s);
    const late = settleKittens(s, at(KITTENS_CHOICE_MS));
    expect(late.choice).toBeNull();
    expect([...late.draw].sort()).toEqual(['mico-0', 'tatubum-0']);
    expect(late.current).toBe('p1');
  });
});
