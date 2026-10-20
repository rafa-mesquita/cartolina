import { describe, expect, it } from 'vitest';
import { CAMELIO_DECK, CAMELIO_DECK_SIZE, camelioBack, camelioCard, camelioCardIds } from '../src/games/camelio/deck';
import { CAMELIO_COLORS, type CamelioKind } from '../src/games/camelio/types';
import { C } from './camelio-helpers';

const ofKind = (kind: CamelioKind) => CAMELIO_DECK.filter((c) => c.kind === kind);

describe('baralho do Cama-Leão', () => {
  it('tem 72 cartas: 36 normais, 24 bicolores e 12 multicoloridas', () => {
    expect(CAMELIO_DECK_SIZE).toBe(72);
    expect(ofKind('normal')).toHaveLength(36);
    expect(ofKind('bicolor')).toHaveLength(24);
    expect(ofKind('multi')).toHaveLength(12);
  });

  it('o id é a posição no baralho', () => {
    CAMELIO_DECK.forEach((card, i) => expect(card.id).toBe(i));
    expect(camelioCardIds()).toEqual(Array.from({ length: 72 }, (_, i) => i));
  });

  it('cada cor tem normais 1, 1, 2, 2, 3, 4', () => {
    for (const color of CAMELIO_COLORS) {
      const spheres = ofKind('normal')
        .filter((c) => c.color === color)
        .map((c) => c.spheres);
      expect(spheres).toEqual([1, 1, 2, 2, 3, 4]);
    }
  });

  it('bicolores: 4 por par de cores vizinhas, A1 B1 A3 B3', () => {
    CAMELIO_COLORS.forEach((a, i) => {
      const b = CAMELIO_COLORS[(i + 1) % CAMELIO_COLORS.length]!;
      const cards = ofKind('bicolor').filter((c) => c.pair?.[0] === a && c.pair?.[1] === b);
      expect(cards.map((c) => [c.color, c.spheres])).toEqual([
        [a, 1],
        [b, 1],
        [a, 3],
        [b, 3],
      ]);
    });
  });

  it('todo verso de bicolor é ambíguo: as mesmas esferas existem nas duas cores do par', () => {
    for (const card of ofKind('bicolor')) {
      const twins = ofKind('bicolor').filter((c) => c.spheres === card.spheres && c.pair?.join() === card.pair?.join());
      expect(new Set(twins.map((c) => c.color))).toEqual(new Set(card.pair));
    }
  });

  it('multicoloridas: 1 e 2 esferas em cada cor', () => {
    for (const color of CAMELIO_COLORS) {
      expect(ofKind('multi').filter((c) => c.color === color).map((c) => c.spheres)).toEqual([1, 2]);
    }
  });

  it('cada cor soma 24 esferas', () => {
    for (const color of CAMELIO_COLORS) {
      const total = CAMELIO_DECK.filter((c) => c.color === color).reduce((n, c) => n + c.spheres, 0);
      expect(total).toBe(24);
    }
  });

  it('ids que os testes usam batem com o baralho', () => {
    expect(camelioCard(C.verde1)).toMatchObject({ kind: 'normal', color: 'verde', spheres: 1 });
    expect(camelioCard(C.verde2)).toMatchObject({ kind: 'normal', color: 'verde', spheres: 2 });
    expect(camelioCard(C.verde3)).toMatchObject({ kind: 'normal', color: 'verde', spheres: 3 });
    expect(camelioCard(C.amarelo2)).toMatchObject({ kind: 'normal', color: 'amarelo', spheres: 2 });
    expect(camelioCard(C.amarelo3)).toMatchObject({ kind: 'normal', color: 'amarelo', spheres: 3 });
    expect(camelioCard(C.vermelho1)).toMatchObject({ kind: 'normal', color: 'vermelho', spheres: 1 });
    expect(camelioCard(C.vermelho2)).toMatchObject({ kind: 'normal', color: 'vermelho', spheres: 2 });
    expect(camelioCard(C.vermelho2b)).toMatchObject({ kind: 'normal', color: 'vermelho', spheres: 2 });
    expect(camelioCard(C.vermelho3)).toMatchObject({ kind: 'normal', color: 'vermelho', spheres: 3 });
    expect(camelioCard(C.vermelho4)).toMatchObject({ kind: 'normal', color: 'vermelho', spheres: 4 });
    expect(camelioCard(C.azul1)).toMatchObject({ kind: 'normal', color: 'azul', spheres: 1 });
    expect(camelioCard(C.azul2)).toMatchObject({ kind: 'normal', color: 'azul', spheres: 2 });
    expect(camelioCard(C.azul3)).toMatchObject({ kind: 'normal', color: 'azul', spheres: 3 });
    expect(camelioCard(C.bicVermelho3)).toMatchObject({ kind: 'bicolor', color: 'vermelho', spheres: 3, pair: ['laranja', 'vermelho'] });
    expect(camelioCard(59)).toMatchObject({ kind: 'bicolor', color: 'verde', spheres: 3, pair: ['azul', 'verde'] });
    expect(camelioCard(71)).toMatchObject({ kind: 'multi', color: 'azul', spheres: 2, pair: null });
  });

  it('as cartas são congeladas (o baralho é compartilhado entre salas)', () => {
    expect(Object.isFrozen(CAMELIO_DECK)).toBe(true);
    expect(Object.isFrozen(camelioCard(0))).toBe(true);
    const bic = camelioCard(C.bicVermelho3);
    expect(Object.isFrozen(bic.pair)).toBe(true);
    const back = camelioBack(bic);
    if (back.kind !== 'bicolor') throw new Error('esperava bicolor');
    expect(Object.isFrozen(back.colors)).toBe(false);
    expect(back.colors).not.toBe(bic.pair);
  });

  it('carta desconhecida estoura', () => {
    expect(() => camelioCard(72)).toThrow();
    expect(() => camelioCard(-1)).toThrow();
  });
});

describe('verso da carta', () => {
  it('normal mostra só a cor', () => {
    expect(camelioBack(camelioCard(C.vermelho3))).toEqual({ kind: 'normal', color: 'vermelho' });
  });

  it('bicolor mostra as esferas e as duas cores', () => {
    expect(camelioBack(camelioCard(C.bicVermelho3))).toEqual({ kind: 'bicolor', spheres: 3, colors: ['laranja', 'vermelho'] });
  });

  it('multicolor mostra só as esferas', () => {
    expect(camelioBack(camelioCard(71))).toEqual({ kind: 'multi', spheres: 2 });
  });
});
