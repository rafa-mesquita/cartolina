import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoupLogEntry } from '@cartolina/shared';
import type { ConnStatus } from '../src/net/connection';
import { MOMENT_MS, momentsFrom, useMoments, type Moment } from '../src/games/coup/moments';

const ACT: CoupLogEntry = { t: 'act', actor: 'p0', kind: 'tax', target: null };
const CHALLENGE: CoupLogEntry = { t: 'challenge', by: 'p1', of: 'p0', claim: 'duke', had: false };
const CHALLENGE_TEVE: CoupLogEntry = { t: 'challenge', by: 'p2', of: 'p0', claim: 'duke', had: true };
const BLOCKED: CoupLogEntry = { t: 'blocked', actor: 'p0', kind: 'foreignAid', by: 'p1', as: 'duke' };
const OUT: CoupLogEntry = { t: 'out', player: 'p2' };

describe('momentsFrom', () => {
  it('ignora act/lose/resolved/start/block/win e pega dúvida, bloqueio que valeu e saída', () => {
    const log: CoupLogEntry[] = [
      { t: 'start', first: 'p0' },
      ACT,
      { t: 'block', by: 'p1', as: 'duke' },
      CHALLENGE,
      { t: 'lose', player: 'p0', card: 'duke' },
      { t: 'resolved', actor: 'p0', kind: 'tax', target: null, amount: 0 },
      BLOCKED,
      OUT,
      { t: 'win', player: 'p1' },
    ];
    expect(momentsFrom(log, 0)).toEqual<Moment[]>([
      { kind: 'challenge', by: 'p1', of: 'p0', claim: 'duke', had: false },
      { kind: 'blocked', by: 'p1', as: 'duke' },
      { kind: 'out', player: 'p2' },
    ]);
  });

  it('só olha de `from` em diante', () => {
    const log = [CHALLENGE, ACT, BLOCKED, OUT];
    expect(momentsFrom(log, 2).map((m) => m.kind)).toEqual(['blocked', 'out']);
    expect(momentsFrom(log, 4)).toEqual([]);
    expect(momentsFrom(log, 99)).toEqual([]);
  });

  it('a dúvida carrega se tinha a carta', () => {
    expect(momentsFrom([CHALLENGE_TEVE], 0)).toEqual([{ kind: 'challenge', by: 'p2', of: 'p0', claim: 'duke', had: true }]);
  });
});

describe('useMoments', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  type Props = { log: readonly CoupLogEntry[]; match: number; over: boolean; status?: ConnStatus };
  const hook = (initial: Props) => renderHook((p: Props) => useMoments(p.log, p.match, p.over, p.status ?? 'joined'), { initialProps: initial });

  it('o tempo de cada momento é 2,2 s', () => {
    expect(MOMENT_MS).toBe(2200);
  });

  it('na primeira visão não mostra nada, nem o que já estava no diário', () => {
    const { result } = hook({ log: [ACT, CHALLENGE], match: 1, over: false });
    expect(result.current).toBeNull();
  });

  it('mostra o primeiro, troca depois de 2,2 s e some no fim', () => {
    const { result, rerender } = hook({ log: [ACT], match: 1, over: false });
    rerender({ log: [ACT, CHALLENGE, BLOCKED], match: 1, over: false });
    expect(result.current).toMatchObject({ kind: 'challenge' });
    act(() => void vi.advanceTimersByTime(MOMENT_MS - 1));
    expect(result.current).toMatchObject({ kind: 'challenge' });
    act(() => void vi.advanceTimersByTime(1));
    expect(result.current).toMatchObject({ kind: 'blocked' });
    act(() => void vi.advanceTimersByTime(MOMENT_MS));
    expect(result.current).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('entradas que chegam com um momento na tela entram no fim da fila', () => {
    const { result, rerender } = hook({ log: [], match: 1, over: false });
    rerender({ log: [CHALLENGE], match: 1, over: false });
    act(() => void vi.advanceTimersByTime(1_000));
    rerender({ log: [CHALLENGE, ACT, OUT], match: 1, over: false });
    expect(result.current).toMatchObject({ kind: 'challenge' });
    act(() => void vi.advanceTimersByTime(1_200));
    expect(result.current).toMatchObject({ kind: 'out' });
  });

  it('uma entrada não vira momento duas vezes (rerender com o mesmo diário)', () => {
    const { result, rerender } = hook({ log: [], match: 1, over: false });
    rerender({ log: [OUT], match: 1, over: false });
    act(() => void vi.advanceTimersByTime(MOMENT_MS));
    expect(result.current).toBeNull();
    rerender({ log: [OUT], match: 1, over: false });
    expect(result.current).toBeNull();
  });

  it('partida nova limpa a fila e o diário recomeça do zero', () => {
    const { result, rerender } = hook({ log: [], match: 1, over: false });
    rerender({ log: [CHALLENGE, OUT], match: 1, over: false });
    expect(result.current).not.toBeNull();
    rerender({ log: [{ t: 'start', first: 'p0' }], match: 2, over: false });
    expect(result.current).toBeNull();
    act(() => void vi.advanceTimersByTime(MOMENT_MS * 3));
    expect(result.current).toBeNull();
    rerender({ log: [{ t: 'start', first: 'p0' }, BLOCKED], match: 2, over: false });
    expect(result.current).toMatchObject({ kind: 'blocked' });
  });

  it('fim da partida (over) limpa e não deixa o "fora" do último aparecer', () => {
    const { result, rerender } = hook({ log: [], match: 1, over: false });
    rerender({ log: [CHALLENGE], match: 1, over: false });
    expect(result.current).not.toBeNull();
    rerender({ log: [CHALLENGE, OUT, { t: 'win', player: 'p1' }], match: 1, over: true });
    expect(result.current).toBeNull();
    act(() => void vi.advanceTimersByTime(MOMENT_MS * 3));
    expect(result.current).toBeNull();
  });

  it('reconexão: o que aconteceu durante a queda não vira momento, nem a fila antiga fica na tela', () => {
    const dbl: CoupLogEntry[] = [CHALLENGE, CHALLENGE_TEVE, OUT];
    const antiga = [ACT, CHALLENGE]; // a visão velha é o mesmo objeto até chegar mensagem nova
    const { result, rerender } = hook({ log: [ACT], match: 1, over: false });
    rerender({ log: antiga, match: 1, over: false });
    expect(result.current).toMatchObject({ kind: 'challenge' });
    rerender({ log: antiga, match: 1, over: false, status: 'reconnecting' });
    act(() => void vi.advanceTimersByTime(30_000));
    expect(result.current).toBeNull();
    // volta: primeiro o status muda (joining, joined) com a visão velha, depois chega a visão nova
    rerender({ log: antiga, match: 1, over: false, status: 'joining' });
    rerender({ log: antiga, match: 1, over: false, status: 'joined' });
    expect(result.current).toBeNull();
    rerender({ log: [ACT, CHALLENGE, ...dbl], match: 1, over: false, status: 'joined' });
    expect(result.current).toBeNull();
    act(() => void vi.advanceTimersByTime(MOMENT_MS * 4));
    expect(result.current).toBeNull();
    // a visão seguinte já é normal: o que for novo aparece
    rerender({ log: [ACT, CHALLENGE, ...dbl, BLOCKED], match: 1, over: false, status: 'joined' });
    expect(result.current).toMatchObject({ kind: 'blocked' });
  });

  it('reconexão: momento que estava na fila antes da queda some quando a visão nova chega', () => {
    const antiga = [CHALLENGE, OUT];
    const { result, rerender } = hook({ log: [], match: 1, over: false });
    rerender({ log: antiga, match: 1, over: false });
    expect(result.current).toMatchObject({ kind: 'challenge' });
    rerender({ log: antiga, match: 1, over: false, status: 'reconnecting' });
    rerender({ log: antiga, match: 1, over: false, status: 'joined' });
    rerender({ log: [CHALLENGE, OUT, ACT], match: 1, over: false, status: 'joined' });
    expect(result.current).toBeNull();
  });
});
