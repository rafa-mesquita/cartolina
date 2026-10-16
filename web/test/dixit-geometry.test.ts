import { mulberry32 } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { FELT_H, FELT_W, STAGE_W, fitStage, looseSpot, pawnSpots, seatArc, tableSlots, trackPoints, type Pt } from '../src/games/dixit/geometry';

describe('trilha de casas', () => {
  it('31 casas (0…30) dentro do feltro, todas diferentes', () => {
    const cells = trackPoints(31);
    expect(cells).toHaveLength(31);
    for (const [x, y] of cells) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(FELT_W);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(FELT_H);
    }
    expect(new Set(cells.map(([x, y]) => `${Math.round(x)},${Math.round(y)}`)).size).toBe(31);
  });

  it('a casa 0 fica embaixo à esquerda e a trilha sobe pela esquerda', () => {
    const [c0, c1] = trackPoints(31);
    expect(c0![0]).toBeLessThan(100);
    expect(c0![1]).toBeGreaterThan(FELT_H / 2);
    expect(c1![1]).toBeLessThan(c0![1]);
  });
});

describe('peões', () => {
  const cells = trackPoints(31);
  it('cada um na casa dos seus pontos (máximo na última casa)', () => {
    const spots = pawnSpots(['a', 'b'], { a: 3, b: 99 }, cells);
    expect(spots.a![0]).toBeCloseTo(cells[3]![0]);
    expect(spots.b![0]).toBeCloseTo(cells[30]![0]);
  });

  it('quem divide a casa se espalha', () => {
    const spots = pawnSpots(['a', 'b', 'c'], { a: 0, b: 0, c: 0 }, cells);
    const xs = new Set(['a', 'b', 'c'].map((p) => Math.round(spots[p]![0])));
    expect(xs.size).toBeGreaterThan(1);
  });
});

describe('cartas na mesa', () => {
  it('até 5 cartas: uma fileira centrada', () => {
    const s = tableSlots(5);
    expect(new Set(s.map(([, y]) => y)).size).toBe(1);
    expect(s.reduce((n, [x]) => n + x, 0) / 5).toBeCloseTo(FELT_W / 2);
  });

  it('6 a 10 cartas: duas fileiras', () => {
    expect(new Set(tableSlots(6).map(([, y]) => y)).size).toBe(2);
    expect(tableSlots(10)).toHaveLength(10);
  });
});

describe('assentos e palco', () => {
  it('o arco é simétrico e abre com a largura', () => {
    const [x0] = seatArc(0, 5, STAGE_W);
    const [x4] = seatArc(4, 5, STAGE_W);
    expect(x0 + x4).toBeCloseTo(STAGE_W);
    expect(seatArc(0, 5, 1900)[0]).toBeLessThan(seatArc(0, 5, STAGE_W)[0] + (1900 - STAGE_W) / 2);
    expect(seatArc(0, 1, STAGE_W)).toEqual([STAGE_W / 2, 120]);
  });

  it('palco: a altura manda e a largura cresce até a janela', () => {
    expect(fitStage(1900, 900)).toEqual({ scale: 1, width: 1900 });
    expect(fitStage(1440, 450)).toEqual({ scale: 0.5, width: 2880 });
    expect(fitStage(720, 900)).toEqual({ scale: 0.5, width: 1440 });
  });
});

describe('cartas soltas no feltro', () => {
  const dist = (a: Pt, b: Pt): number => Math.hypot(a[0] - b[0], (a[1] - b[1]) * 1.4);

  it('sempre dentro dos limites (x 250–750, y 250–480, giro ±24°), com ou sem cartas usadas', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rng = mulberry32(seed);
      const used: Pt[] = [];
      for (let k = 0; k < 6; k++) {
        const [x, y, rz] = looseSpot(used, rng);
        expect(x).toBeGreaterThanOrEqual(250);
        expect(x).toBeLessThan(750);
        expect(y).toBeGreaterThanOrEqual(250);
        expect(y).toBeLessThan(480);
        expect(rz).toBeGreaterThanOrEqual(-24);
        expect(rz).toBeLessThan(24);
        used.push([x, y]);
      }
    }
  });

  it('mesma semente, mesmo resultado', () => {
    const used: Pt[] = [[400, 300], [600, 400]];
    expect(looseSpot(used, mulberry32(7))).toEqual(looseSpot(used, mulberry32(7)));
    expect(looseSpot(used, mulberry32(7))).not.toEqual(looseSpot(used, mulberry32(8)));
  });

  it('sem cartas usadas, fica o primeiro candidato sorteado', () => {
    const rng = mulberry32(3);
    const x = 250 + rng() * 500;
    const y = 250 + rng() * 230;
    const [sx, sy] = looseSpot([], mulberry32(3));
    expect(sx).toBeCloseTo(x);
    expect(sy).toBeCloseTo(y);
  });

  it('com cartas usadas, escolhe um lugar pelo menos tão longe delas quanto o primeiro sorteado', () => {
    const used: Pt[] = [[350, 300], [500, 350], [650, 300], [450, 440], [600, 440]];
    const longe = (p: Pt): number => Math.min(...used.map((u) => dist(u, p)));
    for (let seed = 1; seed <= 100; seed++) {
      const rng = mulberry32(seed);
      const primeiro: Pt = [250 + rng() * 500, 250 + rng() * 230];
      const [x, y] = looseSpot(used, mulberry32(seed));
      expect(longe([x, y])).toBeGreaterThanOrEqual(longe(primeiro) - 1e-9);
    }
  });
});
