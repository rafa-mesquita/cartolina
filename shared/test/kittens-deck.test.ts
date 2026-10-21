import { describe, expect, it } from 'vitest';
import { KITTENS_CARD_KINDS, KITTENS_CARD_NAMES, kittensCardId, kittensKindOf, kittensTokenIndex } from '../src/games/kittens/cards';
import { KITTENS_LATIDOS, KITTENS_PACK_SIZE, kittensBaseDeck, kittensDeal, kittensPacksFor } from '../src/games/kittens/deck';
import { mulberry32 } from '../src/rng';

const count = (cards: readonly string[], kind: string) => cards.filter((c) => kittensKindOf(c) === kind).length;
const ps = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

describe('cartas do Tatubum', () => {
  it('o id carrega o tipo', () => {
    expect(kittensCardId('ataque', 3)).toBe('ataque-3');
    expect(kittensKindOf('ataque-3')).toBe('ataque');
    expect(kittensKindOf('mico-0')).toBe('mico');
    expect(kittensKindOf('boto-1')).toBe('boto');
    expect(kittensKindOf('tucano-2')).toBe('tucano');
    expect(kittensKindOf('xadrez-1')).toBeNull();
    expect(kittensKindOf('ataque')).toBeNull();
    expect(kittensKindOf('?0')).toBeNull();
    expect(KITTENS_CARD_KINDS).toHaveLength(18);
  });

  it('as cartas novas têm nome em português', () => {
    expect([KITTENS_CARD_NAMES.latido, KITTENS_CARD_NAMES.olhado, KITTENS_CARD_NAMES.feitico, KITTENS_CARD_NAMES.boto, KITTENS_CARD_NAMES.tucano]).toEqual([
      'Tatu Latidor',
      'Mau-olhado',
      'Feitiço',
      'Boto',
      'Tucano',
    ]);
  });

  it('fichas do Mau-olhado', () => {
    expect(['?0', '?12', '?x', '0', 'ataque-0', '?'].map(kittensTokenIndex)).toEqual([0, 12, null, null, null, null]);
  });
});

describe('baralho', () => {
  it('um pacote tem 56 cartas (as 46 do original + 2 Mau-olhado, 2 Feitiço, 2 Boto e 4 Tucanos); os 2 Latidores entram uma vez só', () => {
    const deck = kittensBaseDeck(5);
    expect(KITTENS_PACK_SIZE).toBe(56);
    expect(deck).toHaveLength(KITTENS_PACK_SIZE + KITTENS_LATIDOS);
    expect(count(deck, 'nemvem')).toBe(5);
    expect(count(deck, 'ataque')).toBe(4);
    expect(count(deck, 'pular')).toBe(4);
    expect(count(deck, 'favor')).toBe(4);
    expect(count(deck, 'embaralhar')).toBe(4);
    expect(count(deck, 'espiar')).toBe(5);
    for (const bicho of ['capivara', 'mico', 'quati', 'tamandua', 'preguica', 'tucano']) expect(count(deck, bicho)).toBe(4);
    expect(count(deck, 'olhado')).toBe(2);
    expect(count(deck, 'feitico')).toBe(2);
    expect(count(deck, 'boto')).toBe(2);
    expect(count(deck, 'latido')).toBe(2);
    expect(count(deck, 'tatubum')).toBe(0);
    expect(count(deck, 'cafune')).toBe(0);
    expect(new Set(deck).size).toBe(deck.length);
  });

  it('2 pacotes a partir de 6 jogadores, mas sempre só 2 Latidores', () => {
    expect([2, 5, 6, 8].map(kittensPacksFor)).toEqual([1, 1, 2, 2]);
    const deck = kittensBaseDeck(6);
    expect(deck).toHaveLength(2 * KITTENS_PACK_SIZE + KITTENS_LATIDOS);
    expect(count(deck, 'latido')).toBe(2);
    expect(count(deck, 'boto')).toBe(4);
    expect(count(deck, 'tucano')).toBe(8);
    expect(new Set(deck).size).toBe(deck.length);
  });

  // Desarmes extras no monte como no original: 2 com até 4 jogadores, 1 a partir de 5.
  it.each([
    // monte = pacotes × 56 + 2 Latidores − 7 por jogador + Desarmes extras + (n − 1) tatus
    [2, 47, 2],
    [4, 35, 2],
    [5, 28, 1],
    [6, 78, 1],
    [8, 66, 1],
  ])('com %i jogadores: 1 Desarme + 7 na mão; monte com %i cartas, %i Desarme(s) e n − 1 tatus', (n, drawSize, extras) => {
    const players = ps(n);
    const { hands, draw } = kittensDeal(mulberry32(7), players);
    for (const p of players) {
      expect(hands[p]).toHaveLength(8);
      expect(count(hands[p]!, 'cafune')).toBe(1);
      expect(count(hands[p]!, 'tatubum')).toBe(0);
    }
    expect(draw).toHaveLength(drawSize);
    expect(count(draw, 'tatubum')).toBe(n - 1);
    expect(count(draw, 'cafune')).toBe(extras);
    const all = [...Object.values(hands).flat(), ...draw];
    expect(new Set(all).size).toBe(all.length);
  });

  it('os Cafunés são embaralhados: o id não diz de quem era (um Cafuné roubado não se denuncia)', () => {
    const players = ps(4);
    const { hands, draw } = kittensDeal(mulberry32(1), players);
    const cafunesOf = (cards: readonly string[]) => cards.filter((c) => kittensKindOf(c) === 'cafune');
    expect(cafunesOf(hands.p0!)).toHaveLength(1);
    // Com alguma semente o p0 não fica com o cafune-0.
    expect([1, 2, 3, 4, 5].some((seed) => cafunesOf(kittensDeal(mulberry32(seed), players).hands.p0!)[0] !== 'cafune-0')).toBe(true);
    for (const p of players) expect(cafunesOf(hands[p]!)).toHaveLength(1);
    expect(cafunesOf(draw)).toHaveLength(2);
    const all = [...players.flatMap((p) => cafunesOf(hands[p]!)), ...cafunesOf(draw)].sort();
    expect(all).toEqual(Array.from({ length: 6 }, (_, i) => `cafune-${i}`));
  });

  it('mesma semente, mesma distribuição', () => {
    expect(kittensDeal(mulberry32(3), ps(4))).toEqual(kittensDeal(mulberry32(3), ps(4)));
  });
});
