import { describe, expect, it } from 'vitest';
import { KITTENS_CARD_KINDS, KITTENS_CARD_NAMES, kittensCardId, kittensKindOf, kittensTokenIndex } from '../src/games/kittens/cards';
import {
  KITTENS_PACK_SIZE,
  kittensBaseDeck,
  kittensCafuneCut,
  kittensDeal,
  kittensExtraCafunes,
  kittensLatidoCards,
  kittensLatidos,
  kittensPackCards,
  kittensPacksFor,
  kittensDrawStart,
} from '../src/games/kittens/deck';
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
    expect(KITTENS_CARD_KINDS).toHaveLength(22);
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
  it('um pacote tem 58 cartas (as 46 do original + 2 Mau-olhado, 2 Feitiço, 4 Botos e 4 Tucanos); Latidores fora dos pacotes: 2, 3 e depois n − 1', () => {
    expect(KITTENS_PACK_SIZE).toBe(58);
    // A partida abre 2 pacotes; o primeiro entra inteiro.
    const pack = kittensPackCards(5).filter((c) => Number(c.slice(c.lastIndexOf('-') + 1)) < (c.startsWith('nemvem') || c.startsWith('espiar') ? 5 : c.startsWith('olhado') || c.startsWith('feitico') ? 2 : 4));
    expect(pack).toHaveLength(KITTENS_PACK_SIZE);
    expect(count(kittensPackCards(5), 'latido')).toBe(0);
    expect([2, 3, 4, 5, 6, 7, 8].map(kittensLatidos)).toEqual([2, 3, 3, 4, 5, 6, 7]);
    expect(kittensLatidoCards(3)).toEqual(['latido-0', 'latido-1', 'latido-2']);
    const deck = [...pack, ...kittensLatidoCards(5)];
    expect(deck).toHaveLength(KITTENS_PACK_SIZE + 4);
    expect(count(deck, 'nemvem')).toBe(5);
    expect(count(deck, 'ataque')).toBe(4);
    expect(count(deck, 'pular')).toBe(4);
    expect(count(deck, 'favor')).toBe(4);
    expect(count(deck, 'embaralhar')).toBe(4);
    expect(count(deck, 'espiar')).toBe(5);
    for (const bicho of ['capivara', 'mico', 'quati', 'tamandua', 'preguica', 'tucano']) expect(count(deck, bicho)).toBe(4);
    expect(count(deck, 'olhado')).toBe(2);
    expect(count(deck, 'feitico')).toBe(2);
    expect(count(deck, 'boto')).toBe(4);
    expect(count(deck, 'latido')).toBe(4);
    expect(count(deck, 'tatubum')).toBe(0);
    expect(count(deck, 'cafune')).toBe(0);
    expect(new Set(deck).size).toBe(deck.length);
  });

  it('a partida abre 1 pacote com 2 ou 3 jogadores, 2 com 4 ou 5 e 3 de 6 a 8 (o último só em parte); os Latidores continuam n − 1', () => {
    expect([2, 3, 4, 5, 6, 7, 8].map(kittensPacksFor)).toEqual([1, 1, 2, 2, 3, 3, 3]);
    const deck = kittensBaseDeck(6);
    expect(deck).toHaveLength(3 * KITTENS_PACK_SIZE + 5);
    expect(count(deck, 'latido')).toBe(5);
    expect(count(deck, 'boto')).toBe(12);
    expect(count(deck, 'tucano')).toBe(12);
    expect(new Set(deck).size).toBe(deck.length);
  });

  // Monte depois da distribuição (pedidos do Rafa, 2026-11-07): 40 de 2 a 5 jogadores e o de antes de 6 a 8, qualquer que
  // seja o corte de Desarmes; os extras como no original (2 com até 4 jogadores, 1 a partir de 5).
  it.each([
    [2, 40, 2],
    [3, 40, 2],
    [4, 40, 2],
    [5, 40, 1],
    [6, 85, 1],
    [7, 80, 1],
    [8, 75, 1],
  ])('com %i jogadores: 1 Desarme + 7 na mão, sem Latidor; monte com %i cartas, até %i Desarme(s), os Latidores e n − 1 tatus', (n, drawSize, extras) => {
    expect(kittensDrawStart(n)).toBe(drawSize);
    const players = ps(n);
    const cuts = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const { hands, draw } = kittensDeal(mulberry32(seed), players);
      const cut = extras - count(draw, 'cafune');
      cuts.add(cut);
      for (const p of players) {
        expect(hands[p]).toHaveLength(8);
        expect(count(hands[p]!, 'cafune')).toBe(1);
        expect(count(hands[p]!, 'tatubum')).toBe(0);
        expect(count(hands[p]!, 'latido')).toBe(0);
      }
      expect(draw).toHaveLength(drawSize);
      // Com 2 pacotes o primeiro entra inteiro: nenhum tipo fica com menos cartas que o normal.
      const all1 = [...Object.values(hands).flat(), ...draw];
      if (kittensPacksFor(n) >= 2) {
        expect(count(all1, 'nemvem')).toBeGreaterThanOrEqual(5);
        expect(count(all1, 'boto')).toBeGreaterThanOrEqual(4);
      }
      expect(count(draw, 'tatubum')).toBe(n - 1);
      expect(count(draw, 'latido')).toBe(kittensLatidos(n));
      const all = [...Object.values(hands).flat(), ...draw];
      expect(new Set(all).size).toBe(all.length);
    }
    // Pedido do Rafa (2026-11-06): normal, −1 ou −2, nunca tirando da mão inicial (com 1 extra, normal ou −1).
    expect([...cuts].sort()).toEqual(extras === 2 ? [0, 1, 2] : [0, 1]);
  });

  it('o corte de Desarmes é sorteado de 0 até o que o monte tem, no máximo 2', () => {
    for (const [n, top] of [[2, 2], [4, 2], [5, 1], [8, 1]] as const) {
      expect(kittensCafuneCut(() => 0, n)).toBe(0);
      expect(kittensCafuneCut(() => 0.999, n)).toBe(top);
    }
  });

  it('os Latidores vão embaralhados no monte (não ficam todos juntos no fundo nem no topo)', () => {
    const { draw } = kittensDeal(mulberry32(7), ps(4));
    const where = draw.flatMap((c, i) => (kittensKindOf(c) === 'latido' ? [i] : []));
    expect(where).toHaveLength(3);
    expect(where).not.toEqual([0, 1, 2]);
    expect(where).not.toEqual([draw.length - 3, draw.length - 2, draw.length - 1]);
  });

  it('a distribuição sai dos pacotes abertos: tudo que não é Desarme nem tatu está em kittensBaseDeck, sem repetir', () => {
    const players = ps(5);
    const { hands, draw } = kittensDeal(mulberry32(7), players);
    const all = [...Object.values(hands).flat(), ...draw];
    expect(new Set(all).size).toBe(all.length);
    const cafunes = all.filter((c) => kittensKindOf(c) === 'cafune');
    expect(cafunes.length).toBeGreaterThanOrEqual(5);
    expect(cafunes.length).toBeLessThanOrEqual(5 + kittensExtraCafunes(5));
    expect(all.filter((c) => kittensKindOf(c) === 'tatubum')).toHaveLength(4);
    const base = new Set(kittensBaseDeck(5));
    for (const c of all) if (kittensKindOf(c) !== 'cafune' && kittensKindOf(c) !== 'tatubum') expect(base.has(c)).toBe(true);
  });

  it('os Cafunés são embaralhados: o id não diz de quem era (um Cafuné roubado não se denuncia)', () => {
    const players = ps(4);
    const { hands, draw } = kittensDeal(mulberry32(1), players);
    const cafunesOf = (cards: readonly string[]) => cards.filter((c) => kittensKindOf(c) === 'cafune');
    expect(cafunesOf(hands.p0!)).toHaveLength(1);
    // Com alguma semente o p0 não fica com o cafune-0.
    expect([1, 2, 3, 4, 5].some((seed) => cafunesOf(kittensDeal(mulberry32(seed), players).hands.p0!)[0] !== 'cafune-0')).toBe(true);
    for (const p of players) expect(cafunesOf(hands[p]!)).toHaveLength(1);
    expect(cafunesOf(draw).length).toBeLessThanOrEqual(2);
    const all = [...players.flatMap((p) => cafunesOf(hands[p]!)), ...cafunesOf(draw)];
    expect(new Set(all).size).toBe(all.length);
  });

  it('mesma semente, mesma distribuição', () => {
    expect(kittensDeal(mulberry32(3), ps(4))).toEqual(kittensDeal(mulberry32(3), ps(4)));
  });
});
