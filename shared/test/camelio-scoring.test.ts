import { describe, expect, it } from 'vitest';
import {
  camelioDeckEndWinners,
  camelioPoints,
  camelioScoredColors,
  camelioSpheresInPlay,
  camelioSphereSum,
  resolveCamelioPlay,
} from '../src/games/camelio/scoring';
import { C } from './camelio-helpers';

describe('somas', () => {
  it('soma as esferas de uma cor, pela cor de verdade', () => {
    expect(camelioSphereSum([C.vermelho3, C.azul1, C.bicVermelho2], 'vermelho')).toBe(5);
    expect(camelioSphereSum([C.vermelho3, C.azul1], 'azul')).toBe(1);
    expect(camelioSphereSum([], 'verde')).toBe(0);
  });

  it('pontos = cores distintas na área de pontos', () => {
    expect(camelioPoints([])).toBe(0);
    expect(camelioPoints([C.vermelho3, C.vermelho2, C.azul2, C.azul3])).toBe(2);
    expect(camelioScoredColors([C.vermelho3, C.vermelho2, C.azul2, C.azul3])).toEqual(['vermelho', 'azul']);
  });

  it('esferas em jogo não contam as cores já pontuadas', () => {
    expect(camelioSpheresInPlay([C.vermelho2b, C.azul1, C.azul3], [C.vermelho3, C.vermelho2])).toBe(4);
  });
});

describe('resolveCamelioPlay', () => {
  it('nada acontece abaixo de 5', () => {
    expect(resolveCamelioPlay([], [], C.vermelho3)).toEqual({
      table: [C.vermelho3],
      scored: [],
      discarded: [],
      outcome: 'none',
      sum: 3,
    });
  });

  it('5 exato numa cor nova fecha: as cartas da cor vão pra área de pontos', () => {
    expect(resolveCamelioPlay([C.vermelho3, C.azul1], [], C.vermelho2)).toEqual({
      table: [C.azul1],
      scored: [C.vermelho3, C.vermelho2],
      discarded: [],
      outcome: 'scored',
      sum: 5,
    });
  });

  it('bicolor e multicolor contam pela cor de verdade', () => {
    expect(resolveCamelioPlay([C.vermelho3], [], C.bicVermelho2).outcome).toBe('scored');
  });

  it('passou de 5 numa cor nova estoura: as cartas da cor vão pro descarte', () => {
    expect(resolveCamelioPlay([C.vermelho4, C.azul1], [], C.vermelho2)).toEqual({
      table: [C.azul1],
      scored: [],
      discarded: [C.vermelho4, C.vermelho2],
      outcome: 'bust',
      sum: 6,
    });
  });

  it('cor já pontuada chegando a 5 exato perde o ponto e descarta tudo dela', () => {
    expect(resolveCamelioPlay([C.vermelho1, C.azul1], [C.vermelho3, C.vermelho2, C.azul2, C.azul3], C.vermelho4)).toEqual({
      table: [C.azul1],
      scored: [C.azul2, C.azul3],
      discarded: [C.vermelho1, C.vermelho4, C.vermelho3, C.vermelho2],
      outcome: 'lost',
      sum: 5,
    });
  });

  it('cor já pontuada passando de 5 também perde o ponto', () => {
    const res = resolveCamelioPlay([C.vermelho2b], [C.vermelho3, C.vermelho2], C.vermelho4);
    expect(res.outcome).toBe('lost');
    expect(res.sum).toBe(6);
    expect(res.scored).toEqual([]);
    expect(res.table).toEqual([]);
  });

  it('cor já pontuada abaixo de 5 é segura', () => {
    expect(resolveCamelioPlay([], [C.vermelho3, C.vermelho2], C.vermelho2b)).toEqual({
      table: [C.vermelho2b],
      scored: [C.vermelho3, C.vermelho2],
      discarded: [],
      outcome: 'none',
      sum: 2,
    });
  });

  it('não muda os arrays recebidos', () => {
    const table: readonly number[] = Object.freeze([C.vermelho4]);
    const scored: readonly number[] = Object.freeze([] as number[]);
    expect(() => resolveCamelioPlay(table, scored, C.vermelho2)).not.toThrow();
  });
});

describe('vencedores no fim do monte', () => {
  const players = ['p0', 'p1', 'p2'];

  it('ganha quem tem mais pontos', () => {
    const scored = { p0: [C.vermelho3, C.vermelho2], p1: [], p2: [C.vermelho3, C.vermelho2, C.azul2, C.azul3] };
    expect(camelioDeckEndWinners(players, { p0: [], p1: [], p2: [] }, scored)).toEqual(['p2']);
  });

  it('empate em pontos: mais esferas em jogo', () => {
    const scored = { p0: [C.vermelho3, C.vermelho2], p1: [C.azul2, C.azul3], p2: [] };
    const table = { p0: [C.verde1], p1: [C.verde3], p2: [] };
    expect(camelioDeckEndWinners(players, table, scored)).toEqual(['p1']);
  });

  it('empate em tudo: vitória dividida', () => {
    const scored = { p0: [C.vermelho3, C.vermelho2], p1: [C.azul2, C.azul3], p2: [] };
    const table = { p0: [C.verde3], p1: [C.amarelo3], p2: [] };
    expect(camelioDeckEndWinners(players, table, scored)).toEqual(['p0', 'p1']);
  });
});
