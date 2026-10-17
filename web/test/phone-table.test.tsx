import { act as rtlAct, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ItoRoomView, RoomView } from '@cartolina/shared';
import { playSound } from '../src/brand/sounds';
import { PHONE_LAYOUT_QUERY } from '../src/lib/device';
import type { ConnSnapshot, FxEvent, GameConn } from '../src/net/connection';
import { Game } from '../src/screens/Game';
import { PhoneTable } from '../src/table/phone/PhoneTable';
import { act, makeRoom, revealedItoView, sortingRoom, viewOf } from './fixtures';

vi.mock('../src/brand/sounds', async (importOriginal) => ({ ...(await importOriginal<typeof import('../src/brand/sounds')>()), playSound: vi.fn() }));

type Conn = GameConn & {
  sendAction: Mock<GameConn['sendAction']>;
  fx(e: FxEvent): void;
  error(code: string): void;
};

/** Conexão falsa: guarda os ouvintes de `fx` e de erro pra disparar no teste. */
function conn(): Conn {
  const fxs: Array<(e: FxEvent) => void> = [];
  const errs: Array<(code: string, message: string) => void> = [];
  return {
    sendAction: vi.fn<GameConn['sendAction']>(),
    sendActivity: vi.fn(),
    sendCursor: vi.fn(),
    sendPing: vi.fn(),
    onFx: vi.fn((fn: (e: FxEvent) => void) => {
      fxs.push(fn);
      return () => void fxs.splice(fxs.indexOf(fn), 1);
    }),
    onError: vi.fn((fn: (code: string, message: string) => void) => {
      errs.push(fn);
      return () => void errs.splice(errs.indexOf(fn), 1);
    }),
    fx: (e) => rtlAct(() => fxs.forEach((f) => f(e))),
    error: (code) => rtlAct(() => errs.forEach((f) => f(code, 'recusado'))),
  } as Conn;
}

const handCard = (id: string) => document.querySelector<HTMLButtonElement>(`.p-hnum[data-card="${id}"]`)!;
const strip = (id: string) => document.querySelector(`.p-strip[data-card="${id}"]`);
const heres = () => screen.getAllByRole('button', { name: /^colocar aqui/ });

afterEach(() => {
  vi.mocked(playSound).mockClear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('mesa do celular', () => {
  it('tema: o host dá as cartas; os outros esperam', () => {
    const room = act(makeRoom(2), 'p0', { type: 'start' });
    const { unmount } = render(<PhoneTable view={viewOf(room, 'p0')} conn={conn()} />);
    expect(screen.getByRole('button', { name: 'dar as cartas' })).toBeTruthy();
    expect(screen.getAllByText(room.game.theme!.titulo).length).toBeGreaterThan(0);
    unmount();
    render(<PhoneTable view={viewOf(room, 'p1')} conn={conn()} />);
    expect(screen.getByText('o host tá escolhendo o tema…')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'dar as cartas' })).toBeNull();
  });

  it('topo: sala, bichinho e status de cada assento', () => {
    const c = conn();
    render(<PhoneTable view={viewOf(sortingRoom(2), 'p0')} conn={c} />);
    expect(screen.getByRole('button', { name: 'sala ABCD' })).toBeTruthy();
    expect(document.querySelectorAll('.p-seat')).toHaveLength(2);
    expect(screen.getAllByText('pensando')).toHaveLength(2);
    c.fx({ t: 'fx.activity', from: 'p1', activity: 'writing' });
    expect(screen.getByText('escrevendo…')).toBeTruthy();
  });

  it('colocar por toque: escolhe a carta na mão e toca no "aqui"', () => {
    const c = conn();
    render(<PhoneTable view={viewOf(sortingRoom(2), 'p0')} conn={c} />);
    expect(screen.queryAllByRole('button', { name: /^colocar aqui/ })).toHaveLength(0);
    fireEvent.click(handCard('p0:0'));
    fireEvent.click(heres()[0]!);
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'place', cardId: 'p0:0', index: 0 });
    expect(playSound).toHaveBeenCalledWith('card');
    // intenção pendente: a faixa aparece antes do servidor responder
    expect(strip('p0:0')).toBeTruthy();
    expect(screen.queryAllByRole('button', { name: /^colocar aqui/ })).toHaveLength(0);
  });

  it('servidor recusou (not_owner): a faixa pendente some', () => {
    const c = conn();
    render(<PhoneTable view={viewOf(sortingRoom(2), 'p0')} conn={c} />);
    fireEvent.click(handCard('p0:0'));
    fireEvent.click(heres()[0]!);
    expect(strip('p0:0')).toBeTruthy();
    c.error('not_owner');
    expect(strip('p0:0')).toBeNull();
  });

  it('a intenção some quando o servidor confirma', () => {
    const c = conn();
    let room = sortingRoom(2);
    const { rerender } = render(<PhoneTable view={viewOf(room, 'p0')} conn={c} />);
    fireEvent.click(handCard('p0:0'));
    fireEvent.click(heres()[0]!);
    room = act(room, 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
    rerender(<PhoneTable view={viewOf(room, 'p0')} conn={c} />);
    expect(strip('p0:0')).toBeTruthy();
    // tirada da fila por outra via: sem intenção presa, ela some também aqui
    room = act(room, 'p0', { type: 'return', cardId: 'p0:0' });
    rerender(<PhoneTable view={viewOf(room, 'p0')} conn={c} />);
    expect(strip('p0:0')).toBeNull();
  });

  it('tocar de novo ou fora da fila desseleciona; tocar outra carta troca', () => {
    let room = sortingRoom(2);
    room = act(room, 'p1', { type: 'place', cardId: 'p1:0', index: 0 });
    render(<PhoneTable view={viewOf(room, 'p0')} conn={conn()} />);
    fireEvent.click(handCard('p0:0'));
    expect(handCard('p0:0').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(handCard('p0:0'));
    expect(handCard('p0:0').getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(handCard('p0:0'));
    fireEvent.click(strip('p1:0')!);
    expect(handCard('p0:0').getAttribute('aria-pressed')).toBe('false');
    expect(strip('p1:0')!.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(document.querySelector('.p-seats')!);
    expect(strip('p1:0')!.getAttribute('aria-pressed')).toBe('false');
  });

  it('"voltar pra mão" manda return e a faixa sai na hora', () => {
    const c = conn();
    const room = act(sortingRoom(2), 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
    render(<PhoneTable view={viewOf(room, 'p0')} conn={c} />);
    fireEvent.click(strip('p0:0')!);
    fireEvent.click(screen.getByRole('button', { name: 'voltar pra mão' }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'return', cardId: 'p0:0' });
    expect(strip('p0:0')).toBeNull();
  });

  it('a dica pendente vai antes do place', () => {
    const c = conn();
    render(<PhoneTable view={viewOf(sortingRoom(2), 'p0')} conn={c} />);
    fireEvent.click(screen.getByRole('button', { name: '✎ dica' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'gato' } });
    fireEvent.click(handCard('p0:0'));
    fireEvent.click(heres()[0]!);
    expect(c.sendAction.mock.calls.map(([a]) => a)).toEqual([
      { type: 'clue', cardId: 'p0:0', text: 'gato' },
      { type: 'place', cardId: 'p0:0', index: 0 },
    ]);
  });

  it('arrasto de outra pessoa abre um vão; quando solta, o vão some com som', () => {
    const c = conn();
    let room = sortingRoom(2);
    room = act(room, 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
    render(<PhoneTable view={viewOf(room, 'p0')} conn={c} />);
    expect(document.querySelector('.p-gap')).toBeNull();
    c.fx({ t: 'fx.cursor', from: 'p1', zone: 'table', x: 0.5, y: 0.5, drag: { cardId: 'p1:0', index: 0 } });
    const gap = document.querySelector('.p-gap');
    expect(gap).toBeTruthy();
    // o vão fica antes da minha faixa (índice 0 do servidor)
    expect(gap!.compareDocumentPosition(strip('p0:0')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    c.fx({ t: 'fx.cursor', from: 'p1', zone: 'table', x: 0.5, y: 0.5, drag: null });
    expect(document.querySelector('.p-gap')).toBeNull();
    expect(playSound).toHaveBeenCalledWith('slide');
  });

  it('arrasto de outra pessoa expira em 6 s sem notícia', () => {
    vi.useFakeTimers();
    const c = conn();
    render(<PhoneTable view={viewOf(sortingRoom(2), 'p0')} conn={c} />);
    c.fx({ t: 'fx.cursor', from: 'p1', zone: 'table', x: 0.5, y: 0.5, drag: { cardId: 'p1:0', index: 0 } });
    expect(document.querySelector('.p-gap')).toBeTruthy();
    rtlAct(() => void vi.advanceTimersByTime(7000));
    expect(document.querySelector('.p-gap')).toBeNull();
  });

  it('"tô pronto" manda ready quando minha carta está na fila', () => {
    const c = conn();
    const room = act(sortingRoom(2), 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
    render(<PhoneTable view={viewOf(room, 'p0')} conn={c} />);
    fireEvent.click(screen.getByRole('button', { name: 'tô pronto' }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'ready', ready: true });
  });

  it('host: "revelar agora" só com tudo na fila; "pular rodada" pede confirmação', () => {
    const c = conn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    try {
      let room = sortingRoom(2);
      const { rerender } = render(<PhoneTable view={viewOf(room, 'p0')} conn={c} />);
      const reveal = () => screen.getByRole('button', { name: 'revelar agora' }) as HTMLButtonElement;
      expect(reveal().disabled).toBe(true);
      room = act(room, 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
      room = act(room, 'p1', { type: 'place', cardId: 'p1:0', index: 1 });
      rerender(<PhoneTable view={viewOf(room, 'p0')} conn={c} />);
      fireEvent.click(reveal());
      expect(c.sendAction).toHaveBeenCalledWith({ type: 'forceReveal' });
      fireEvent.click(screen.getByRole('button', { name: 'pular rodada' }));
      expect(confirm).toHaveBeenCalledWith('Pular esta rodada? As cartas voltam e um tema novo é sorteado.');
      expect(c.sendAction).toHaveBeenCalledWith({ type: 'next' });
    } finally {
      confirm.mockRestore();
    }
  });

  it('quem não é host não vê os controles do host', () => {
    render(<PhoneTable view={viewOf(sortingRoom(2), 'p1')} conn={conn()} />);
    expect(screen.queryByRole('button', { name: 'revelar agora' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'pular rodada' })).toBeNull();
  });

  it('revelação: montada já revelada, o resultado aparece direto', () => {
    vi.useFakeTimers();
    render(<PhoneTable view={revealedItoView()} conn={conn()} />);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(document.querySelectorAll('.p-num')).toHaveLength(2);
  });

  it('revelação ao vivo: o resultado só aparece depois da sequência', () => {
    vi.useFakeTimers();
    const c = conn();
    let room = sortingRoom(2);
    room = act(room, 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
    room = act(room, 'p1', { type: 'place', cardId: 'p1:0', index: 1 });
    const { rerender } = render(<PhoneTable view={viewOf(room, 'p0')} conn={c} />);
    room = act(room, 'p0', { type: 'forceReveal' });
    rerender(<PhoneTable view={viewOf(room, 'p0')} conn={c} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect((screen.getByRole('button', { name: 'revelando…' }) as HTMLButtonElement).disabled).toBe(true);
    rtlAct(() => void vi.advanceTimersByTime(750));
    expect(document.querySelectorAll('.p-num')).toHaveLength(1);
    rtlAct(() => void vi.advanceTimersByTime(620 + 620 + 500));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(document.querySelectorAll('.p-num')).toHaveLength(2);
  });
});

describe('Game escolhe a mesa pelo layout', () => {
  const snap = (view: RoomView): ConnSnapshot => ({ status: 'joined', playerId: view.you, view, joinError: null });
  const media = (matching: string[]) =>
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({ matches: matching.includes(query), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );

  it('celular: fila em pé, sem o feltro do computador', () => {
    media([PHONE_LAYOUT_QUERY]);
    const view: ItoRoomView = viewOf(sortingRoom(2), 'p0');
    render(<Game conn={conn()} snap={snap(view)} view={view} />);
    expect(screen.getByRole('group', { name: 'fila de cartas' })).toBeTruthy();
    expect(document.querySelector('.felt')).toBeNull();
  });

  it('computador: o feltro de sempre', () => {
    media([]);
    const view: ItoRoomView = viewOf(sortingRoom(2), 'p0');
    render(<Game conn={conn()} snap={snap(view)} view={view} />);
    expect(document.querySelector('.felt')).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'fila de cartas' })).toBeNull();
  });
});
