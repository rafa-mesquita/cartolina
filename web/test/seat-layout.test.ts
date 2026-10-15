import { describe, expect, it } from 'vitest';
import { arrangeSeats } from '../src/table/seatLayout';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

describe('arrangeSeats', () => {
  it('ordem começa logo depois de mim e dá a volta', () => {
    expect(arrangeSeats(ids(4), 'p2').map((s) => s.id)).toEqual(['p3', 'p0', 'p1']);
  });

  it('1 ou 2 outros ficam no topo', () => {
    expect(arrangeSeats(ids(2), 'p0')).toEqual([{ id: 'p1', side: 'top', pos: 0.5 }]);
    expect(arrangeSeats(ids(3), 'p0').map((s) => s.side)).toEqual(['top', 'top']);
  });

  it('3 a 6 outros: um de cada lado', () => {
    expect(arrangeSeats(ids(4), 'p0').map((s) => s.side)).toEqual(['left', 'top', 'right']);
    expect(arrangeSeats(ids(7), 'p0').map((s) => s.side)).toEqual(['left', 'top', 'top', 'top', 'top', 'right']);
  });

  it('7 a 9 outros: dois de cada lado, esquerda de baixo pra cima', () => {
    const seats = arrangeSeats(ids(10), 'p0');
    expect(seats.map((s) => s.side)).toEqual(['left', 'left', 'top', 'top', 'top', 'top', 'top', 'right', 'right']);
    expect(seats[0]!.pos).toBeGreaterThan(seats[1]!.pos);
    expect(seats[7]!.pos).toBeLessThan(seats[8]!.pos);
  });

  it('posições no topo são equidistantes', () => {
    expect(arrangeSeats(ids(4), 'p0').filter((s) => s.side === 'top').map((s) => s.pos)).toEqual([0.5]);
    expect(arrangeSeats(ids(3), 'p0').map((s) => s.pos)).toEqual([1 / 3, 2 / 3]);
  });

  it('sem "eu" (espectador sem assento) mostra todos', () => {
    expect(arrangeSeats(ids(2), null).map((s) => s.id)).toEqual(['p0', 'p1']);
  });
});
