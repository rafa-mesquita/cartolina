import type { PicturesView, SeatView } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { KIT_NAMES, pts, seatLabel } from '../src/games/pictures/status';

function view(over: Partial<PicturesView> = {}): PicturesView {
  return {
    phase: 'building', players: ['p0', 'p1', 'p2'], inRound: ['p0', 'p1', 'p2'], scores: {},
    round: 1, rounds: 3, grid: [], kits: {}, ready: [], confirmed: [], countdownEndsAt: null,
    paused: false, winners: [], mySecret: null, works: {}, myGuesses: {}, result: null,
    ...over,
  };
}

function seat(id: string, connected = true): SeatView {
  return { id, name: id.toUpperCase(), color: '#e0b84a' as SeatView['color'], connected };
}

describe('seatLabel', () => {
  it('desconectado: saiu, em qualquer fase', () => {
    expect(seatLabel(view(), seat('p0', false))).toBe('saiu');
    expect(seatLabel(view({ phase: 'guessing' }), seat('p0', false))).toBe('saiu');
  });

  it('fora da rodada: esperando', () => {
    expect(seatLabel(view({ inRound: ['p1', 'p2'] }), seat('p0'))).toBe('esperando');
  });

  it('montagem: montando… / pronto ✓', () => {
    expect(seatLabel(view(), seat('p0'))).toBe('montando…');
    expect(seatLabel(view({ ready: ['p0'] }), seat('p0'))).toBe('pronto ✓');
  });

  it('palpite: palpitando… / confirmou ✓', () => {
    expect(seatLabel(view({ phase: 'guessing' }), seat('p0'))).toBe('palpitando…');
    expect(seatLabel(view({ phase: 'guessing', confirmed: ['p0'] }), seat('p0'))).toBe('confirmou ✓');
  });

  it('revelação, fim de jogo e lobby: sem rótulo', () => {
    expect(seatLabel(view({ phase: 'reveal' }), seat('p0'))).toBe('');
    expect(seatLabel(view({ phase: 'gameover' }), seat('p0'))).toBe('');
    expect(seatLabel(view({ phase: 'lobby' }), seat('p0'))).toBe('');
  });
});

describe('pts', () => {
  it('singular e plural', () => {
    expect(pts(1)).toBe('1 pt');
    expect(pts(0)).toBe('0 pts');
    expect(pts(3)).toBe('3 pts');
  });
});

describe('KIT_NAMES', () => {
  it('tem os 6 kits com nome', () => {
    expect(Object.keys(KIT_NAMES).sort()).toEqual(['blocks', 'cubes', 'dots', 'icons', 'laces', 'sticks']);
    expect(KIT_NAMES.icons).toBe('símbolos');
  });
});
