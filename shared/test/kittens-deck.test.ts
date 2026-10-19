import { describe, expect, it } from 'vitest';
import { KITTENS_CARD_KINDS, kittensCardId, kittensKindOf } from '../src/games/kittens/cards';
import { KITTENS_PACK_SIZE, kittensBaseDeck, kittensDeal, kittensPacksFor } from '../src/games/kittens/deck';
import { mulberry32 } from '../src/rng';

const count = (cards: readonly string[], kind: string) => cards.filter((c) => kittensKindOf(c) === kind).length;
const ps = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

describe('cartas do Tatubum', () => {
  it('o id carrega o tipo', () => {
    expect(kittensCardId('ataque', 3)).toBe('ataque-3');
    expect(kittensKindOf('ataque-3')).toBe('ataque');
    expect(kittensKindOf('mico-0')).toBe('mico');
    expect(kittensKindOf('xadrez-1')).toBeNull();
    expect(kittensKindOf('ataque')).toBeNull();
    expect(KITTENS_CARD_KINDS).toHaveLength(13);
  });
});

describe('baralho', () => {
  it('um pacote tem 46 cartas, nas quantidades do original, sem Tatubum nem Cafuné', () => {
    const deck = kittensBaseDeck(5);
    expect(deck).toHaveLength(KITTENS_PACK_SIZE);
    expect(count(deck, 'nemvem')).toBe(5);
    expect(count(deck, 'ataque')).toBe(4);
    expect(count(deck, 'pular')).toBe(4);
    expect(count(deck, 'favor')).toBe(4);
    expect(count(deck, 'embaralhar')).toBe(4);
    expect(count(deck, 'espiar')).toBe(5);
    for (const bicho of ['capivara', 'mico', 'quati', 'tamandua', 'preguica']) expect(count(deck, bicho)).toBe(4);
    expect(count(deck, 'tatubum')).toBe(0);
    expect(count(deck, 'cafune')).toBe(0);
    expect(new Set(deck).size).toBe(deck.length);
  });

  it('2 pacotes a partir de 6 jogadores', () => {
    expect([2, 5, 6, 8].map(kittensPacksFor)).toEqual([1, 1, 2, 2]);
    const deck = kittensBaseDeck(6);
    expect(deck).toHaveLength(2 * KITTENS_PACK_SIZE);
    expect(new Set(deck).size).toBe(deck.length);
  });

  it.each([
    [2, 35],
    [5, 17],
    [6, 57],
    [8, 45],
  ])('com %i jogadores: 1 Cafuné + 7 na mão; monte com %i cartas, 2 Cafunés e n − 1 tatus', (n, drawSize) => {
    const players = ps(n);
    const { hands, draw } = kittensDeal(mulberry32(7), players);
    for (const p of players) {
      expect(hands[p]).toHaveLength(8);
      expect(count(hands[p]!, 'cafune')).toBe(1);
      expect(count(hands[p]!, 'tatubum')).toBe(0);
    }
    expect(draw).toHaveLength(drawSize);
    expect(count(draw, 'tatubum')).toBe(n - 1);
    expect(count(draw, 'cafune')).toBe(2);
    const all = [...Object.values(hands).flat(), ...draw];
    expect(new Set(all).size).toBe(all.length);
  });

  it('os Cafunés são embaralhados: o id não diz de quem era (um Cafuné roubado não se denuncia)', () => {
    const players = ps(4);
    const { hands, draw } = kittensDeal(mulberry32(1), players);
    const cafunesOf = (cards: readonly string[]) => cards.filter((c) => kittensKindOf(c) === 'cafune');
    expect(cafunesOf(hands.p0!)).toHaveLength(1);
    expect(cafunesOf(hands.p0!)[0]).not.toBe('cafune-0');
    for (const p of players) expect(cafunesOf(hands[p]!)).toHaveLength(1);
    expect(cafunesOf(draw)).toHaveLength(2);
    const all = [...players.flatMap((p) => cafunesOf(hands[p]!)), ...cafunesOf(draw)].sort();
    expect(all).toEqual(Array.from({ length: 6 }, (_, i) => `cafune-${i}`));
  });

  it('mesma semente, mesma distribuição', () => {
    expect(kittensDeal(mulberry32(3), ps(4))).toEqual(kittensDeal(mulberry32(3), ps(4)));
  });
});
