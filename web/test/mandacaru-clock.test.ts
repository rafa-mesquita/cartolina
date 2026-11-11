import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatClock, timeLeft, useTurnClock } from '../src/games/mandacaru/clock';

describe('Mandacaru: relógio', () => {
  it('timeLeft: null é relógio parado; passado é 0', () => {
    expect(timeLeft(null, 5_000)).toBeNull();
    expect(timeLeft(4_000, 5_000)).toBe(0);
    expect(timeLeft(10_000, 4_000)).toBe(6_000);
  });

  it('formatClock em minutos e segundos', () => {
    expect(formatClock(252_000)).toBe('4:12');
    expect(formatClock(300_000)).toBe('5:00');
    expect(formatClock(9_000)).toBe('0:09');
    expect(formatClock(0)).toBe('0:00');
    // arredonda pra cima: 0,4 s ainda mostra 0:01
    expect(formatClock(400)).toBe('0:01');
  });
});

describe('useTurnClock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });
  afterEach(() => vi.useRealTimers());

  it('parado (null) devolve null', () => {
    const { result } = renderHook(() => useTurnClock(null, 0));
    expect(result.current).toBeNull();
  });

  it('o tempo cai com a hora do servidor e para no 0', () => {
    const { result } = renderHook(() => useTurnClock(1_010_000, 2_000));
    expect(result.current).toBe(8_000);
    act(() => void vi.advanceTimersByTime(3_000));
    expect(result.current).toBe(5_000);
    act(() => void vi.advanceTimersByTime(10_000));
    expect(result.current).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
