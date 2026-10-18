import type { PicturesAction, Work, WorkOf } from '@cartolina/shared';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { remainingSeconds, useCountdown } from '../src/games/pictures/useCountdown';
import { useDraft, type DraftServer } from '../src/games/pictures/useDraft';

/** Obra de cubos com `n` casas pintadas (só pra distinguir uma mexida da outra). */
const cubes = (n: number): WorkOf<'cubes'> => ({ kit: 'cubes', cells: Array.from({ length: 16 }, (_, i) => (i < n ? 0 : null)) });

const IDLE: DraftServer = { ready: false, work: null, countdownEndsAt: null, serverOffset: 0 };

/** `view(...)` simula a chegada de uma visão (o que o servidor diz sobre mim); `rekey` troca rodada/kit. */
function setup(key = '0:cubes', server: Partial<DraftServer> = {}) {
  const send = vi.fn<(a: PicturesAction) => void>();
  let props = { k: key, s: { ...IDLE, ...server } };
  const hook = renderHook(({ k, s }) => useDraft(k, send, s), { initialProps: props });
  const view = (s: Partial<DraftServer>) => {
    props = { k: props.k, s: { ...IDLE, ...s } };
    hook.rerender(props);
  };
  const rekey = (k: string) => {
    props = { ...props, k };
    hook.rerender(props);
  };
  const drafts = () => send.mock.calls.map(([a]) => a).filter((a) => a.type === 'draft');
  return { send, hook, view, rekey, drafts, d: () => hook.result.current };
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
    const { send, view, d } = setup();
    act(() => d().onChange(cubes(1)));
    act(() => d().onChange(cubes(2)));
    act(() => d().onChange(cubes(3)));
    send.mockClear();
    act(() => d().markReady());
    act(() => d().markReady()); // clique duplo: um ready só
    expect(d().pending).toBe(true);
    view({ ready: true, work: cubes(3) });
    expect(d().pending).toBe(false);
    expect(d().held).toBe(true);
    act(() => vi.advanceTimersByTime(5000));
    expect(send.mock.calls).toEqual([[{ type: 'ready', on: true, work: cubes(3) }]]);
  });

  it('pronto sem ter mexido manda ready sem obra (o servidor usa a que já tem)', () => {
    const { send, d } = setup();
    act(() => d().markReady());
    expect(send).toHaveBeenCalledWith({ type: 'ready', on: true });
  });

  it('depois de pronto, mexer não envia; desmarcar manda ready desligado e volta a enviar', () => {
    const { send, view, d } = setup();
    act(() => d().onChange(cubes(1)));
    act(() => d().markReady());
    view({ ready: true, work: cubes(1) });
    send.mockClear();
    act(() => d().onChange(cubes(2)));
    act(() => vi.advanceTimersByTime(5000));
    expect(send).not.toHaveBeenCalled();
    act(() => d().unready());
    expect(send).toHaveBeenLastCalledWith({ type: 'ready', on: false });
    view({ ready: false, work: cubes(1) });
    // a mexida feita no "pronto" não chegou lá: vai agora
    act(() => vi.advanceTimersByTime(2000));
    expect(send).toHaveBeenLastCalledWith({ type: 'draft', work: cubes(2) });
    act(() => vi.advanceTimersByTime(5000));
    act(() => d().onChange(cubes(3)));
    expect(send).toHaveBeenLastCalledWith({ type: 'draft', work: cubes(3) });
  });

  it('recusado pelo servidor (release), volta a enviar sem mandar nada na hora', () => {
    const { send, d } = setup();
    act(() => d().markReady());
    send.mockClear();
    act(() => d().release());
    expect(send).not.toHaveBeenCalled();
    expect(d().pending).toBe(false);
    act(() => d().onChange(cubes(1)));
    expect(send).toHaveBeenCalledWith({ type: 'draft', work: cubes(1) });
  });

  it('trocar de rodada/kit descarta o pendente e zera a obra', () => {
    const { send, rekey, d } = setup();
    act(() => d().onChange(cubes(1)));
    act(() => d().onChange(cubes(2)));
    expect(send).toHaveBeenCalledTimes(1);
    rekey('1:laces');
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

describe('useDraft: envio que se perdeu', () => {
  it('"pronto" perdido (nenhuma visão me marca pronto): depois de 1,5 s a mexida volta a sair', () => {
    const { drafts, d } = setup();
    act(() => d().onChange(cubes(1)));
    act(() => d().markReady());
    act(() => vi.advanceTimersByTime(1000));
    act(() => d().onChange(cubes(2)));
    act(() => vi.advanceTimersByTime(400));
    expect(drafts()).toEqual([{ type: 'draft', work: cubes(1) }]);
    expect(d().pending).toBe(true);
    act(() => vi.advanceTimersByTime(200)); // passou 1,5 s sem visão me marcando pronto: solta
    expect(d().pending).toBe(false);
    expect(d().held).toBe(false);
    act(() => d().onChange(cubes(3)));
    act(() => vi.advanceTimersByTime(2000));
    expect(drafts().at(-1)).toEqual({ type: 'draft', work: cubes(3) });
  });

  it('visão sem a minha obra mais recente (queda, reconexão): reenvia, respeitando o espaçamento', () => {
    const { view, drafts, d } = setup();
    act(() => d().onChange(cubes(1)));
    view({ work: cubes(1) });
    act(() => vi.advanceTimersByTime(2500));
    act(() => d().onChange(cubes(2))); // sai na hora, mas o socket estava fechado: perdido
    expect(drafts()).toHaveLength(2);
    view({ work: cubes(1) }); // reconectou: o servidor ainda tem a 1
    expect(drafts()).toHaveLength(2);
    act(() => vi.advanceTimersByTime(2000));
    expect(drafts()).toHaveLength(3);
    expect(drafts().at(-1)).toEqual({ type: 'draft', work: cubes(2) });
    view({ work: cubes(2) });
    act(() => vi.advanceTimersByTime(10_000));
    expect(drafts()).toHaveLength(3);
  });

  it('a obra da visão com as chaves noutra ordem conta como a mesma (não reenvia)', () => {
    const { view, drafts, d } = setup();
    act(() => d().onChange(cubes(1)));
    const { cells } = cubes(1);
    view({ work: { cells, kit: 'cubes' } as Work });
    act(() => vi.advanceTimersByTime(10_000));
    expect(drafts()).toHaveLength(1);
  });
});

describe('useDraft: contagem correndo', () => {
  it('o envio pendente sai até 300 ms depois da mexida', () => {
    vi.setSystemTime(100_000);
    const { view, drafts, d } = setup('0:cubes', { countdownEndsAt: 130_000 });
    act(() => d().onChange(cubes(1)));
    view({ work: cubes(1), countdownEndsAt: 130_000 }); // eco
    act(() => vi.advanceTimersByTime(100));
    act(() => d().onChange(cubes(2))); // sem contagem ficaria pra 102 000
    expect(drafts()).toHaveLength(1);
    act(() => vi.advanceTimersByTime(300));
    expect(drafts().at(-1)).toEqual({ type: 'draft', work: cubes(2) });
  });

  it('contagem que começa com um envio pendente adianta o envio', () => {
    vi.setSystemTime(100_000);
    const { view, drafts, d } = setup();
    act(() => d().onChange(cubes(1)));
    act(() => vi.advanceTimersByTime(100));
    act(() => d().onChange(cubes(2))); // ficaria pra 102 000
    view({ work: cubes(1), countdownEndsAt: 130_000 });
    act(() => vi.advanceTimersByTime(300));
    expect(drafts().at(-1)).toEqual({ type: 'draft', work: cubes(2) });
  });

  it('nunca depois de 300 ms antes do fim (na hora do servidor)', () => {
    vi.setSystemTime(100_000);
    // servidor 5 s adiantado: a contagem acaba às 100 450 do PC
    const { drafts, d } = setup('0:cubes', { countdownEndsAt: 105_450, serverOffset: 5000 });
    act(() => d().onChange(cubes(1)));
    act(() => vi.advanceTimersByTime(100));
    act(() => d().onChange(cubes(2)));
    expect(drafts()).toHaveLength(1);
    act(() => vi.advanceTimersByTime(50)); // 100 150 = fim − 300
    expect(drafts().at(-1)).toEqual({ type: 'draft', work: cubes(2) });
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

describe('useCountdown', () => {
  it('conta na hora do servidor e para de acordar quando zera', () => {
    vi.setSystemTime(50_000);
    const hook = renderHook(() => useCountdown(52_000, 1000));
    expect(hook.result.current).toBe(1);
    expect(vi.getTimerCount()).toBe(1);
    act(() => vi.advanceTimersByTime(1500));
    expect(hook.result.current).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
