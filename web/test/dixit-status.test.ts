import { describe, expect, it } from 'vitest';
import { colorer, namer, othersAfter, phaseLabel, seatStatus } from '../src/games/dixit/status';
import { dixitView, othersOf, revealed, started, stateOf, told, voting } from './dixit-fixtures';

describe('pessoas', () => {
  it('nome de quem vê é "você"; os outros pelo assento', () => {
    const v = dixitView(started(3), 'p1');
    const name = namer(v);
    expect(name('p1')).toBe('você');
    expect(name('p0')).toBe('P0');
    expect(name('zz')).toBe('alguém');
    expect(colorer(v)('p0')).toBe(v.seats[0]!.color);
  });

  it('os outros em ordem a partir de quem vê', () => {
    expect(othersAfter(['p0', 'p1', 'p2', 'p3'], 'p2')).toEqual(['p3', 'p0', 'p1']);
    expect(othersAfter(['p0', 'p1'], null)).toEqual(['p0', 'p1']);
  });
});

describe('status do assento', () => {
  it('narração, escolha e votação', () => {
    let room = started(4);
    const st = stateOf(room).storyteller!;
    const other = othersOf(room)[0]!;
    expect(seatStatus(dixitView(room, null).game, st)).toEqual({ text: 'narrando…', tone: 'act' });
    expect(seatStatus(dixitView(room, null).game, other)).toEqual({ text: 'esperando', tone: '' });
    room = told(4);
    expect(seatStatus(dixitView(room, null).game, othersOf(room)[0]!)).toEqual({ text: 'escolhendo…', tone: 'act' });
    room = voting(4);
    expect(seatStatus(dixitView(room, null).game, othersOf(room)[0]!)).toEqual({ text: 'votando…', tone: 'act' });
  });

  it('rótulo da fase com contagem e meta', () => {
    expect(phaseLabel(dixitView(told(4), null).game)).toBe('escolha · 0 de 3 · meta 30');
    expect(phaseLabel(dixitView(revealed(4), null).game)).toBe('revelação · meta 30');
  });
});
