import {
  PLAYER_COLORS,
  createRoom,
  isKittensRoomView,
  joinRoom,
  mulberry32,
  roomAction,
  roomView,
  type KittensRoomView,
  type Room,
} from '@cartolina/shared';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { KittensTable } from '../src/games/kittens/KittensTable';
import type { GameConn } from '../src/net/connection';

/** jsdom não desenha: contexto 2D de mentira e `toDataURL` fixo (como em kittens-mesa.test.ts). */
const realGetContext = HTMLCanvasElement.prototype.getContext;
const realToDataURL = HTMLCanvasElement.prototype.toDataURL;
beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = function () {
    return {
      fillStyle: '#000000',
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      clearRect: vi.fn(),
      putImageData: vi.fn(),
      getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) })),
      createImageData: vi.fn((w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h })),
    } as unknown as CanvasRenderingContext2D;
  } as unknown as typeof realGetContext;
  HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,x';
  vi.useFakeTimers();
});
afterEach(() => {
  HTMLCanvasElement.prototype.getContext = realGetContext;
  HTMLCanvasElement.prototype.toDataURL = realToDataURL;
  vi.useRealTimers();
});

type Conn = GameConn & { sendAction: Mock<GameConn['sendAction']>; onError: Mock<GameConn['onError']> };
const off = vi.fn();
const conn = (): Conn => ({
  sendAction: vi.fn<GameConn['sendAction']>(),
  sendActivity: vi.fn(),
  sendCursor: vi.fn(),
  sendPing: vi.fn(),
  onFx: vi.fn(() => () => {}),
  onError: vi.fn<GameConn['onError']>(() => off),
});

/** Sala de Tatubum começada com `n` jogadores p0…; o p0 (host) é o da vez. */
function started(n = 3): Room {
  let room = createRoom('ABCD', 0, 'kittens');
  for (let i = 0; i < n; i++) {
    const res = joinRoom(room, { token: `t${i}`, name: `P${i}`, color: PLAYER_COLORS[i]! }, `p${i}`, 0);
    if (!res.ok) throw new Error(res.error);
    room = res.room;
  }
  const res = roomAction(room, 'p0', { type: 'start' }, mulberry32(7), 0);
  if (!res.ok) throw new Error(res.error);
  return res.room;
}

function viewOf(room: Room, me: string): KittensRoomView {
  const v = roomView(room, me);
  if (!isKittensRoomView(v)) throw new Error('esperava sala de Tatubum');
  return v;
}

const buttonByText = (root: HTMLElement, text: string) =>
  [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text);

describe('KittensTable (mesa ligada na sala)', () => {
  it('monta a mesa com a minha mão e COMPRAR vai pela conexão', () => {
    const c = conn();
    const { container, unmount } = render(<KittensTable view={viewOf(started(3), 'p0')} conn={c} serverOffset={0} />);
    expect(container.querySelector('.kittens .kt-mesa')).not.toBeNull();
    expect(container.querySelectorAll('#hand [data-id]')).toHaveLength(8);
    expect(container.querySelector('#turn')?.textContent).toContain('SUA VEZ');
    buttonByText(container, 'COMPRAR')!.click();
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'draw' });
    // método da conexão: chamado com o `this` certo
    expect(c.sendAction.mock.contexts[0]).toBe(c);
    unmount();
  });

  it('visão nova chega na mesa (a vez passa) e o erro do servidor vira toast', () => {
    const c = conn();
    let room = started(2);
    const { container, rerender, unmount } = render(<KittensTable view={viewOf(room, 'p1')} conn={c} serverOffset={0} />);
    expect(container.querySelector('#turn')?.textContent).toContain('vez de P0');
    expect(buttonByText(container, 'COMPRAR')).toBeUndefined();
    // p0 compra uma carta comum (semente fixa) e a vez passa pro p1
    const res = roomAction(room, 'p0', { type: 'draw' }, mulberry32(1), 0);
    if (!res.ok) throw new Error(res.error);
    room = res.room;
    expect(viewOf(room, 'p1').game.current).toBe('p1');
    rerender(<KittensTable view={viewOf(room, 'p1')} conn={c} serverOffset={0} />);
    expect(container.querySelector('#turn')?.textContent).toContain('SUA VEZ');
    act(() => {
      for (const [listener] of c.onError.mock.calls) listener('not_your_turn', 'Não é a sua vez.');
    });
    expect(container.querySelector('#toast')?.textContent).toBe('Não é a sua vez.');
    unmount();
  });

  it('desmontar destrói a mesa: sem DOM, sem timer e sem ouvinte de erro', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = conn();
    off.mockClear();
    const { container, unmount } = render(<KittensTable view={viewOf(started(3), 'p0')} conn={c} serverOffset={1234} />);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(container.innerHTML).toBe('');
    expect(off).toHaveBeenCalled();
    vi.advanceTimersByTime(10000);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
