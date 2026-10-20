import { StrictMode, createElement, type ReactNode } from 'react';
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

const three = () => views(3) as [CamelioView, CamelioView, CamelioView];
const strict = ({ children }: { children: ReactNode }) => createElement(StrictMode, null, children);

describe('usePlayback', () => {
  it('mostra a primeira view sem animar e anima as jogadas seguintes uma depois da outra', () => {
    const v = three();
    const { result, rerender } = renderHook(({ view }) => usePlayback(view), { initialProps: { view: v[0] } });
    expect(result.current.shown).toBe(v[0]);
    expect(result.current.anim).toBeNull();

    rerender({ view: v[1] });
    expect(result.current.shown).toBe(v[0]);
    expect(result.current.anim).toMatchObject({ prev: v[0], next: v[1] });

    rerender({ view: v[2] });
    expect(result.current.anim).toMatchObject({ prev: v[0], next: v[1] });

    act(() => result.current.done());
    expect(result.current.shown).toBe(v[1]);
    expect(result.current.anim).toMatchObject({ prev: v[1], next: v[2] });

    act(() => result.current.done());
    expect(result.current.shown).toBe(v[2]);
    expect(result.current.anim).toBeNull();
  });

  it('re-render com a mesma view não reinicia nada', () => {
    const v = three();
    const { result, rerender } = renderHook(({ view }) => usePlayback(view), { initialProps: { view: v[0] } });
    rerender({ view: v[1] });
    const anim = result.current.anim;
    rerender({ view: v[1] });
    expect(result.current.anim).toBe(anim);
  });

  it('cada animação tem um id novo, igual enquanto ela dura', () => {
    const v = three();
    const { result, rerender } = renderHook(({ view }) => usePlayback(view), { initialProps: { view: v[0] } });
    rerender({ view: v[1] });
    const first = result.current.anim!;
    rerender({ view: v[2] });
    expect(result.current.anim!.id).toBe(first.id);
    act(() => result.current.done(first.id));
    expect(result.current.anim!.id).toBeGreaterThan(first.id);
  });

  it('done(id) repetido não pula a próxima animação', () => {
    const v = three();
    const { result, rerender } = renderHook(({ view }) => usePlayback(view), { initialProps: { view: v[0] } });
    rerender({ view: v[1] });
    rerender({ view: v[2] });
    const first = result.current.anim!;
    act(() => {
      result.current.done(first.id);
      result.current.done(first.id);
    });
    expect(result.current.shown).toBe(v[1]);
    expect(result.current.anim).toMatchObject({ prev: v[1], next: v[2] });
  });

  it('done(idAntigo) é ignorado; done() sem nada animando também', () => {
    const v = three();
    const { result, rerender } = renderHook(({ view }) => usePlayback(view), { initialProps: { view: v[0] } });
    act(() => result.current.done());
    expect(result.current.shown).toBe(v[0]);
    rerender({ view: v[1] });
    rerender({ view: v[2] });
    const first = result.current.anim!;
    act(() => result.current.done(first.id));
    const second = result.current.anim!;
    act(() => result.current.done(first.id));
    expect(result.current.anim).toBe(second);
    expect(result.current.shown).toBe(v[1]);
    act(() => result.current.done(second.id));
    expect(result.current.shown).toBe(v[2]);
    expect(result.current.anim).toBeNull();
  });

  it('em StrictMode: v0 → v1 → v2 com done(anim.id) chamado em dobro', () => {
    const v = three();
    const { result, rerender } = renderHook(({ view }) => usePlayback(view), {
      initialProps: { view: v[0] },
      wrapper: strict,
    });
    rerender({ view: v[1] });
    rerender({ view: v[2] });
    expect(result.current.anim).toMatchObject({ prev: v[0], next: v[1] });
    const first = result.current.anim!;
    act(() => {
      result.current.done(first.id);
      result.current.done(first.id);
    });
    expect(result.current.shown).toBe(v[1]);
    const second = result.current.anim!;
    expect(second).toMatchObject({ prev: v[1], next: v[2] });
    act(() => {
      result.current.done(second.id);
      result.current.done(second.id);
    });
    expect(result.current.shown).toBe(v[2]);
    expect(result.current.anim).toBeNull();
  });
});
