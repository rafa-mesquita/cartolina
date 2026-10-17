import { describe, expect, it } from 'vitest';
import { ICON_COUNT, ICON_NAMES, KITS, isBlankWork, readyError, workError, workSchema, type Work } from '../src/games/pictures/works';
import { sampleWork } from './pictures-helpers';

const parse = (w: unknown) => workSchema.safeParse(w).success;

describe('Retratim: obras dos kits', () => {
  it('são 6 kits, na ordem do rodízio', () => {
    expect(KITS).toEqual(['cubes', 'laces', 'sticks', 'blocks', 'icons', 'dots']);
  });

  it('a obra de exemplo de cada kit passa no schema, na regra e pode ficar pronta', () => {
    for (const kit of KITS) {
      const work = sampleWork(kit);
      expect(parse(work)).toBe(true);
      expect(workError(work)).toBeNull();
      expect(readyError(work)).toBeNull();
    }
  });

  it('os 19 símbolos têm nome, sem repetir', () => {
    expect(ICON_NAMES).toHaveLength(ICON_COUNT);
    expect(new Set(ICON_NAMES).size).toBe(ICON_COUNT);
  });

  it('cubos: 16 casas, cores de 0 a 7, no máximo 3 de cada cor', () => {
    expect(parse({ kit: 'cubes', cells: Array(15).fill(null) })).toBe(false);
    expect(parse({ kit: 'cubes', cells: [8, ...Array(15).fill(null)] })).toBe(false);
    const four: Work = { kit: 'cubes', cells: [0, 0, 0, 0, ...Array(12).fill(null)] };
    expect(parse(four)).toBe(true);
    expect(workError(four)).toBe('bad_work');
  });

  it('cubos: cor negativa ou fracionária numa casa é recusada', () => {
    expect(parse({ kit: 'cubes', cells: [-1, ...Array(15).fill(null)] })).toBe(false);
    expect(parse({ kit: 'cubes', cells: [1.5, ...Array(15).fill(null)] })).toBe(false);
  });

  it('cubos com casa vazia podem ficar prontos', () => {
    const partial: Work = { kit: 'cubes', cells: [0, 1, ...Array(14).fill(null)] };
    expect(workError(partial)).toBeNull();
    expect(readyError(partial)).toBeNull();
    expect(readyError({ kit: 'cubes', cells: [null, null, null, 3, ...Array(12).fill(null)] })).toBeNull();
    expect(readyError({ kit: 'cubes', cells: Array(16).fill(null) })).toBe('empty_work');
  });

  it('cadarços: pontos dentro da folha, de 2 a 60 por cadarço', () => {
    expect(parse({ kit: 'laces', long: [[0, 0]], short: [[0, 0], [1, 1]] })).toBe(false);
    expect(parse({ kit: 'laces', long: [[0, 0], [1.2, 0]], short: [[0, 0], [1, 1]] })).toBe(false);
    expect(parse({ kit: 'laces', long: Array(61).fill([0.5, 0.5]), short: [[0, 0], [1, 1]] })).toBe(false);
  });

  it('cadarços: exatamente 60 pontos ainda passa', () => {
    expect(parse({ kit: 'laces', long: Array(60).fill([0.5, 0.5]), short: [[0, 0], [1, 1]] })).toBe(true);
  });

  it('palitos e pedras: sempre 4 + 4; peça fora da folha (guardada de lado) é aceita até 1,5', () => {
    const base = sampleWork('sticks');
    expect(parse({ ...base, sticks: base.kit === 'sticks' ? base.sticks.slice(0, 3) : [] })).toBe(false);
    expect(parse({ kit: 'sticks', sticks: Array(4).fill({ x: 1.4, y: -0.4, rot: 0 }), stones: Array(4).fill({ x: 0, y: 0, rot: 0 }) })).toBe(true);
    expect(parse({ kit: 'sticks', sticks: Array(4).fill({ x: 2, y: 0, rot: 0 }), stones: Array(4).fill({ x: 0, y: 0, rot: 0 }) })).toBe(false);
  });

  it('blocos: uma posição por forma (6) e a câmera do artista', () => {
    expect(parse({ kit: 'blocks', pieces: [], camera: { theta: 0, phi: 1 } })).toBe(false);
    const base = sampleWork('blocks');
    expect(parse({ ...base, camera: { theta: 0, phi: 2 } })).toBe(false);
  });

  it('símbolos: ids de 0 a 18, até 5, sem repetir; pronto só com 2 ou mais', () => {
    expect(parse({ kit: 'icons', ids: [19] })).toBe(false);
    expect(parse({ kit: 'icons', ids: [0, 1, 2, 3, 4, 5] })).toBe(false);
    const repeated: Work = { kit: 'icons', ids: [3, 3] };
    expect(workError(repeated)).toBe('bad_work');
    expect(readyError({ kit: 'icons', ids: [7] })).toBe('icons_too_few');
  });

  it('símbolos: com 2 cartas já pode ficar pronto', () => {
    expect(readyError({ kit: 'icons', ids: [4, 9] })).toBeNull();
  });

  it('pontos e linhas: até 5 pontos e 10 linhas; linha entre pontos que existem, sem repetir', () => {
    expect(parse({ kit: 'dots', points: Array(6).fill([0.5, 0.5]), lines: [] })).toBe(false);
    const pts: [number, number][] = [[0, 0], [1, 1], [0.5, 0.5]];
    expect(workError({ kit: 'dots', points: pts, lines: [[0, 3]] })).toBe('bad_work');
    expect(workError({ kit: 'dots', points: pts, lines: [[1, 1]] })).toBe('bad_work');
    expect(workError({ kit: 'dots', points: pts, lines: [[0, 1], [1, 0]] })).toBe('bad_work');
    expect(workError({ kit: 'dots', points: pts, lines: [[0, 1], [1, 2], [0, 2]] })).toBeNull();
  });

  it('sem rascunho não dá pra ficar pronto', () => {
    expect(readyError(undefined)).toBe('empty_work');
  });

  it('obra em branco: cubos, símbolos e pontos sem nada', () => {
    expect(isBlankWork({ kit: 'cubes', cells: Array<null>(16).fill(null) })).toBe(true);
    expect(isBlankWork({ kit: 'cubes', cells: [0, ...Array<null>(15).fill(null)] })).toBe(false);
    expect(isBlankWork({ kit: 'icons', ids: [] })).toBe(true);
    expect(isBlankWork({ kit: 'icons', ids: [3] })).toBe(false);
    expect(isBlankWork({ kit: 'dots', points: [], lines: [] })).toBe(true);
    expect(isBlankWork({ kit: 'dots', points: [[0.5, 0.5]], lines: [] })).toBe(false);
  });

  it('obra em branco: palitos e pedras todos guardados de lado', () => {
    const away = { x: 1.4, y: -0.4, rot: 0 };
    const aside: Work = { kit: 'sticks', sticks: Array(4).fill(away), stones: Array(4).fill(away) };
    expect(isBlankWork(aside)).toBe(true);
    const wide = { x: 1.4, y: 0.5, rot: 0 };
    expect(isBlankWork({ kit: 'sticks', sticks: Array(4).fill(wide), stones: Array(4).fill(wide) })).toBe(true);
    expect(isBlankWork({ ...aside, sticks: [{ x: 0.5, y: 0.5, rot: 0 }, away, away, away] })).toBe(false);
    expect(isBlankWork({ ...aside, stones: [away, away, away, { x: 0, y: 1, rot: 0 }] })).toBe(false);
  });

  it('laços e blocos nunca são em branco', () => {
    expect(isBlankWork(sampleWork('laces'))).toBe(false);
    expect(isBlankWork(sampleWork('blocks'))).toBe(false);
  });

  it('obra em branco não pode ficar pronta', () => {
    expect(readyError({ kit: 'cubes', cells: Array<null>(16).fill(null) })).toBe('empty_work');
    expect(readyError({ kit: 'icons', ids: [] })).toBe('empty_work');
    expect(readyError({ kit: 'dots', points: [], lines: [] })).toBe('empty_work');
  });
});
