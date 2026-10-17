import type { PicturesAction, WorkOf } from '@cartolina/shared';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { remainingSeconds } from '../src/games/pictures/useCountdown';
import { useDraft } from '../src/games/pictures/useDraft';

/** Obra de cubos com `n` casas pintadas (só pra distinguir uma mexida da outra). */
const cubes = (n: number): WorkOf<'cubes'> => ({ kit: 'cubes', cells: Array.from({ length: 16 }, (_, i) => (i < n ? 0 : null)) });

function setup(key = '0:cubes') {
  const send = vi.fn<(a: PicturesAction) => void>();
  const hook = renderHook(({ k }) => useDraft(k, send), { initialProps: { k: key } });
  return { send, hook, d: () => hook.result.current };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useDraft (rascunho da bancada)', () => {
  it('sem mexida, nada é enviado', () => {
    const { send, d } = setup();
    vi.advanceTimersByTime(10_000);
    expect(send).not.toHaveBeenCalled();
    expect(d().local).toBeNull();
    expect(d().touched).toBe(false);
  });

  it('5 mexidas em 1 s: a 1ª sai na hora e a última no fim dos 2 s', () => {
    const { send, d } = setup();
    for (let i = 1; i <= 5; i++) {
      act(() => d().onChange(cubes(i)));
      vi.advanceTimersByTime(200);
    }
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenLastCalledWith({ type: 'draft', work: cubes(1) });
    vi.advanceTimersByTime(1000);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith({ type: 'draft', work: cubes(5) });
    expect(d().touched).toBe(true);
    expect(d().local).toEqual(cubes(5));
    vi.advanceTimersByTime(10_000);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('"estou pronto" logo depois de mexer: só a ação ready com a obra mais recente, sem rascunho atrasado', () => {
    const { send, d } = setup();
    act(() => d().onChange(cubes(1)));
    act(() => d().onChange(cubes(2)));
    act(() => d().onChange(cubes(3)));
    send.mockClear();
    act(() => d().markReady());
    vi.advanceTimersByTime(5000);
    expect(send.mock.calls).toEqual([[{ type: 'ready', on: true, work: cubes(3) }]]);
  });

  it('pronto sem ter mexido manda ready sem obra (o servidor usa a que já tem)', () => {
    const { send, d } = setup();
    act(() => d().markReady());
    expect(send).toHaveBeenCalledWith({ type: 'ready', on: true });
  });

  it('depois de pronto, mexer não envia; desmarcar manda ready desligado e volta a enviar', () => {
    const { send, d } = setup();
    act(() => d().onChange(cubes(1)));
    act(() => d().markReady());
    send.mockClear();
    act(() => d().onChange(cubes(2)));
    vi.advanceTimersByTime(5000);
    expect(send).not.toHaveBeenCalled();
    act(() => d().unready());
    expect(send).toHaveBeenLastCalledWith({ type: 'ready', on: false });
    act(() => d().onChange(cubes(3)));
    expect(send).toHaveBeenLastCalledWith({ type: 'draft', work: cubes(3) });
  });

  it('recusado pelo servidor (release), volta a enviar sem mandar nada na hora', () => {
    const { send, d } = setup();
    act(() => d().markReady());
    send.mockClear();
    act(() => d().release());
    expect(send).not.toHaveBeenCalled();
    act(() => d().onChange(cubes(1)));
    expect(send).toHaveBeenCalledWith({ type: 'draft', work: cubes(1) });
  });

  it('trocar de rodada/kit descarta o pendente e zera a obra', () => {
    const { send, hook, d } = setup();
    act(() => d().onChange(cubes(1)));
    act(() => d().onChange(cubes(2)));
    expect(send).toHaveBeenCalledTimes(1);
    hook.rerender({ k: '1:laces' });
    expect(d().local).toBeNull();
    expect(d().touched).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(send).toHaveBeenCalledTimes(1);
    // chave nova: a primeira mexida sai na hora (o espaçamento é por rodada)
    const lace: WorkOf<'laces'> = { kit: 'laces', ropes: [] } as unknown as WorkOf<'laces'>;
    act(() => d().onChange(lace));
    expect(send).toHaveBeenLastCalledWith({ type: 'draft', work: lace });
  });

  it('desmontar cancela o envio pendente', () => {
    const { send, hook, d } = setup();
    act(() => d().onChange(cubes(1)));
    act(() => d().onChange(cubes(2)));
    hook.unmount();
    vi.advanceTimersByTime(5000);
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('remainingSeconds (contagem)', () => {
  it('arredonda pra cima e nunca fica negativo', () => {
    expect(remainingSeconds(30_000, 0)).toBe(30);
    expect(remainingSeconds(30_000, 29_001)).toBe(1);
    expect(remainingSeconds(30_000, 30_000)).toBe(0);
    expect(remainingSeconds(30_000, 99_000)).toBe(0);
  });
});
