import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWindowClock, windowLeft } from '../src/games/coup/clock';

describe('windowLeft', () => {
  it('é o que falta, nunca negativo', () => {
    expect(windowLeft(10_000, 4_000)).toBe(6_000);
    expect(windowLeft(10_000, 10_000)).toBe(0);
    expect(windowLeft(10_000, 12_500)).toBe(0);
  });
});

describe('useWindowClock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });
  afterEach(() => vi.useRealTimers());

  it('sem janela devolve null', () => {
    const { result } = renderHook(() => useWindowClock(null, 0));
    expect(result.current).toBeNull();
  });

  it('com janela aberta o tempo cai e, ao passar o prazo, expired vira true', () => {
    const { result } = renderHook(() => useWindowClock(1_010_000, 0));
    expect(result.current).toEqual({ msLeft: 10_000, expired: false });
    act(() => void vi.advanceTimersByTime(4_000));
    expect(result.current).toEqual({ msLeft: 6_000, expired: false });
    act(() => void vi.advanceTimersByTime(5_900));
    expect(result.current!.msLeft).toBe(100);
    expect(result.current!.expired).toBe(false);
    act(() => void vi.advanceTimersByTime(100));
    expect(result.current).toEqual({ msLeft: 0, expired: true });
  });

  it('o serverOffset desloca a conta (relógio do PC atrasado/adiantado)', () => {
    // o servidor está 3 s à frente do PC: restam 7 s, não 10
    const { result } = renderHook(() => useWindowClock(1_010_000, 3_000));
    expect(result.current).toEqual({ msLeft: 7_000, expired: false });
    act(() => void vi.advanceTimersByTime(7_000));
    expect(result.current).toEqual({ msLeft: 0, expired: true });
  });

  it('atualiza a cada 100 ms e para de acordar depois de expirar', () => {
    let renders = 0;
    renderHook(() => {
      renders++;
      return useWindowClock(1_000_500, 0);
    });
    const antes = renders;
    for (let i = 0; i < 3; i++) act(() => void vi.advanceTimersByTime(100)); // um quadro por 100 ms
    expect(renders - antes).toBe(3);
    act(() => void vi.advanceTimersByTime(2_000));
    const depois = renders;
    act(() => void vi.advanceTimersByTime(5_000));
    expect(renders).toBe(depois);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('janela que já nasce vencida não arma relógio', () => {
    const { result } = renderHook(() => useWindowClock(999_000, 0));
    expect(result.current).toEqual({ msLeft: 0, expired: true });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uma correção do serverOffset rearma o relógio (até depois de expirar)', () => {
    const { result, rerender } = renderHook(({ o }) => useWindowClock(1_001_000, o), { initialProps: { o: 0 } });
    act(() => void vi.advanceTimersByTime(1_500));
    expect(result.current).toEqual({ msLeft: 0, expired: true });
    expect(vi.getTimerCount()).toBe(0);
    // o servidor estava 5 s atrás do que se pensava: a janela ainda tem 4,5 s
    rerender({ o: -5_000 });
    expect(result.current).toEqual({ msLeft: 4_500, expired: false });
    act(() => void vi.advanceTimersByTime(1_000));
    expect(result.current).toEqual({ msLeft: 3_500, expired: false });
  });

  it('janela nova (outro endsAt) rearma o relógio', () => {
    const { result, rerender } = renderHook(({ e }) => useWindowClock(e, 0), { initialProps: { e: 1_001_000 as number | null } });
    act(() => void vi.advanceTimersByTime(1_500));
    expect(result.current!.expired).toBe(true);
    rerender({ e: 1_011_500 });
    expect(result.current).toEqual({ msLeft: 10_000, expired: false });
    act(() => void vi.advanceTimersByTime(2_000));
    expect(result.current!.msLeft).toBe(8_000);
    rerender({ e: null });
    expect(result.current).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
