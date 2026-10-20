import {
  PLAYER_COLORS,
  createRoom,
  isKittensRoomView,
  joinRoom,
  mulberry32,
  roomAction,
  roomView,
  type GameAction,
  type KittensRoomView,
  type Room,
} from '@cartolina/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMesa, type Mesa } from '../src/games/kittens/mesa';

/** jsdom não desenha: contexto 2D de mentira e `toDataURL` fixo (como em kittens-art.test.ts). */
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
  document.body.innerHTML = '';
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

function viewOf(room: Room, me: string | null): KittensRoomView {
  const v = roomView(room, me);
  if (!isKittensRoomView(v)) throw new Error('esperava sala de Tatubum');
  return v;
}

function mount(): { root: HTMLElement; mesa: Mesa; sent: GameAction[] } {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const sent: GameAction[] = [];
  const mesa = createMesa(root, { send: (a) => sent.push(a), now: () => Date.now(), seed: 7 });
  return { root, mesa, sent };
}

const toMesa = (v: KittensRoomView) => ({ view: v.game, you: v.you, hostId: v.hostId, seats: v.seats });
const buttonByText = (root: HTMLElement, text: string) =>
  [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text);

describe('mesa do Tatubum', () => {
  it('desenha a mão e os assentos e manda COMPRAR pro servidor', () => {
    const { root, mesa, sent } = mount();
    mesa.update(toMesa(viewOf(started(3), 'p0')));
    expect(root.querySelectorAll('#hand .card')).toHaveLength(8);
    const seats = [...root.querySelectorAll<HTMLElement>('.seat')];
    expect(seats.map((s) => s.dataset.p)).toEqual(['p1', 'p2']);
    expect(seats.map((s) => s.querySelector('.who')?.textContent)).toEqual(['P1', 'P2']);
    expect(root.querySelector('.seat .order.next')?.textContent).toBe('PRÓXIMO');
    expect(root.querySelector('#turn')?.textContent).toContain('SUA VEZ');

    buttonByText(root, 'COMPRAR')!.click();
    expect(sent).toEqual([{ type: 'draw' }]);
    mesa.destroy();
  });

  it('nomes vão escapados pro HTML', () => {
    let room = started(2);
    room = { ...room, seats: room.seats.map((s) => (s.id === 'p1' ? { ...s, name: '<b>x</b>' } : s)) };
    const { root, mesa } = mount();
    mesa.update(toMesa(viewOf(room, 'p0')));
    expect(root.querySelector('.seat .who')?.innerHTML).toBe('&lt;b&gt;x&lt;/b&gt;');
    mesa.destroy();
  });

  it('quem assiste não tem mão nem botões', () => {
    const { root, mesa } = mount();
    mesa.update(toMesa(viewOf(started(3), null)));
    expect(root.querySelectorAll('#hand .card')).toHaveLength(0);
    expect(root.querySelector('#hand')?.textContent).toContain('ASSISTINDO');
    expect(buttonByText(root, 'COMPRAR')).toBeUndefined();
    expect(root.querySelectorAll('.seat')).toHaveLength(3);
    mesa.destroy();
  });

  it('erro do servidor vira o toast da mesa', () => {
    const { root, mesa } = mount();
    mesa.update(toMesa(viewOf(started(2), 'p0')));
    mesa.error('Não é a sua vez.');
    expect(root.querySelector('#toast')?.textContent).toBe('Não é a sua vez.');
    vi.advanceTimersByTime(2300);
    expect(root.querySelector('#toast')?.textContent).toBe('');
    mesa.destroy();
  });

  it('entrando no meio da partida, o diário aparece sem repetir as animações', () => {
    let room = started(2);
    const res = roomAction(room, 'p0', { type: 'draw' }, mulberry32(1), 0);
    if (!res.ok) throw new Error(res.error);
    room = res.room;
    const { root, mesa } = mount();
    mesa.update(toMesa(viewOf(room, 'p1')));
    expect(root.querySelector('#log')?.textContent).toContain('P0 comprou uma carta');
    expect(root.querySelector('#caption')?.textContent).not.toContain('Distribuindo');
    mesa.destroy();
  });

  it('a fila de efeitos roda a distribuição e a compra sem erro', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    let room = started(2);
    const { root, mesa } = mount();
    mesa.update(toMesa(viewOf(room, 'p0')));
    await vi.advanceTimersByTimeAsync(3000);
    expect(root.querySelector('#caption')?.textContent).toContain('Sua vez');
    const res = roomAction(room, 'p0', { type: 'draw' }, mulberry32(1), 0);
    if (!res.ok) throw new Error(res.error);
    room = res.room;
    mesa.update(toMesa(viewOf(room, 'p0')));
    await vi.advanceTimersByTimeAsync(3000);
    const log = root.querySelector('#log')?.textContent ?? '';
    expect(log).toMatch(/Você comprou|comprou o TATUBUM|EXPLODIU/);
    expect(root.querySelectorAll('#hand .card.arriving')).toHaveLength(0);
    expect(errors).not.toHaveBeenCalled();
    mesa.destroy();
    errors.mockRestore();
  });

  it('destroy limpa timers, listeners e o DOM', () => {
    const { root, mesa, sent } = mount();
    mesa.update(toMesa(viewOf(started(3), 'p0')));
    mesa.error('oi');
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    mesa.destroy();
    expect(vi.getTimerCount()).toBe(0);
    expect(root.innerHTML).toBe('');
    // teclado (espaço = comprar) não chega mais na mesa
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(sent).toEqual([]);
    // update depois do destroy não quebra nem desenha
    mesa.update(toMesa(viewOf(started(3), 'p0')));
    expect(root.innerHTML).toBe('');
  });
});
