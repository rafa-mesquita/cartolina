import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CamelioView } from '@cartolina/shared';
import { usePlayback } from '../src/games/camelio/usePlayback';
import { camelioView, playTurn, started } from './camelio-fixtures';

function views(n: number): CamelioView[] {
  let room = started(2);
  const out = [camelioView(room, 'p0').game];
  for (let i = 1; i < n; i++) {
    room = playTurn(room);
    out.push(camelioView(room, 'p0').game);
  }
  return out;
}

describe('usePlayback', () => {
  it('mostra a primeira view sem animar e anima as jogadas seguintes uma depois da outra', () => {
    const v = views(3) as [CamelioView, CamelioView, CamelioView];
    const { result, rerender } = renderHook(({ view }) => usePlayback(view), { initialProps: { view: v[0] } });
    expect(result.current.shown).toBe(v[0]);
    expect(result.current.anim).toBeNull();

    rerender({ view: v[1] });
    expect(result.current.shown).toBe(v[0]);
    expect(result.current.anim).toEqual({ prev: v[0], next: v[1] });

    rerender({ view: v[2] });
    expect(result.current.anim).toEqual({ prev: v[0], next: v[1] });

    act(() => result.current.done());
    expect(result.current.shown).toBe(v[1]);
    expect(result.current.anim).toEqual({ prev: v[1], next: v[2] });

    act(() => result.current.done());
    expect(result.current.shown).toBe(v[2]);
    expect(result.current.anim).toBeNull();
  });

  it('re-render com a mesma view não reinicia nada', () => {
    const v = views(2) as [CamelioView, CamelioView];
    const { result, rerender } = renderHook(({ view }) => usePlayback(view), { initialProps: { view: v[0] } });
    rerender({ view: v[1] });
    const anim = result.current.anim;
    rerender({ view: v[1] });
    expect(result.current.anim).toBe(anim);
  });
});
