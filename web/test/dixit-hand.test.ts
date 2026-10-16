import { describe, expect, it } from 'vitest';
import { HAND_W, handX, insertIndex, moveCard, orderHand } from '../src/games/dixit/hand';

describe('ordem da mão', () => {
  it('mantém a ordem que a pessoa arrumou', () => {
    expect(orderHand(['c', 'a', 'b'], ['a', 'b', 'c'])).toEqual(['c', 'a', 'b']);
  });

  it('tira o que saiu da mão', () => {
    expect(orderHand(['c', 'a', 'b'], ['a', 'c'])).toEqual(['c', 'a']);
  });

  it('põe o que entrou no fim, na ordem da mão', () => {
    expect(orderHand(['b', 'a'], ['a', 'x', 'b', 'y'])).toEqual(['b', 'a', 'x', 'y']);
  });

  it('sem ordem anterior, usa a da mão', () => {
    expect(orderHand([], ['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('não duplica, nem com repetidos na ordem anterior ou na mão', () => {
    expect(orderHand(['a', 'b', 'a'], ['a', 'b', 'b'])).toEqual(['a', 'b']);
  });

  it('não mexe nos arrays recebidos', () => {
    const prev = ['b', 'a'];
    const hand = ['a', 'b', 'c'];
    orderHand(prev, hand);
    expect(prev).toEqual(['b', 'a']);
    expect(hand).toEqual(['a', 'b', 'c']);
  });
});

describe('mover carta', () => {
  it('pra frente', () => {
    expect(moveCard(['a', 'b', 'c', 'd'], 'a', 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('pra trás', () => {
    expect(moveCard(['a', 'b', 'c', 'd'], 'd', 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('o índice é limitado a 0…n-1', () => {
    expect(moveCard(['a', 'b', 'c'], 'b', -5)).toEqual(['b', 'a', 'c']);
    expect(moveCard(['a', 'b', 'c'], 'b', 99)).toEqual(['a', 'c', 'b']);
  });

  it('na mesma posição, nada muda', () => {
    expect(moveCard(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'b', 'c']);
  });

  it('id ausente devolve uma cópia igual', () => {
    const order = ['a', 'b'];
    const out = moveCard(order, 'z', 0);
    expect(out).toEqual(['a', 'b']);
    expect(out).not.toBe(order);
  });

  it('não mexe no array recebido', () => {
    const order = ['a', 'b', 'c'];
    moveCard(order, 'a', 2);
    expect(order).toEqual(['a', 'b', 'c']);
  });
});

describe('índice de soltura na mão', () => {
  it('no centro da mão com 5 cartas cai na do meio', () => {
    expect(insertIndex(420, 5)).toBe(2);
  });

  it('nas pontas', () => {
    expect(insertIndex(420 - 2 * 116, 5)).toBe(0);
    expect(insertIndex(420 + 2 * 116, 5)).toBe(4);
  });

  it('fora dos limites fica nas pontas', () => {
    expect(insertIndex(-500, 5)).toBe(0);
    expect(insertIndex(5000, 5)).toBe(4);
  });

  it('com uma carta é sempre 0', () => {
    expect(insertIndex(0, 1)).toBe(0);
    expect(insertIndex(420, 1)).toBe(0);
    expect(insertIndex(900, 1)).toBe(0);
  });

  it('com número par de cartas, o centro cai entre as duas do meio', () => {
    expect(insertIndex(420 - 40, 4)).toBe(1);
    expect(insertIndex(420 + 40, 4)).toBe(2);
  });

  it('soltar sobre o centro de cada carta devolve o índice dela', () => {
    for (let count = 1; count <= 8; count++) {
      for (let i = 0; i < count; i++) expect(insertIndex(handX(i, count), count)).toBe(i);
    }
  });

  it('a mão fica centrada na largura da mão', () => {
    const xs = [0, 1, 2, 3, 4, 5].map((i) => handX(i, 6));
    expect((xs[0]! + xs[5]!) / 2).toBeCloseTo(HAND_W / 2);
  });

  it('sem cartas devolve 0', () => {
    expect(insertIndex(420, 0)).toBe(0);
  });
});
