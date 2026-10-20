import { KITTENS_MAX_PLAYERS, PLAYER_COLORS, createRoom, isKittensRoomView, joinRoom, roomView, type KittensRoomView } from '@cartolina/shared';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { addKittensBot } from '../src/dev/kittensBots';
import { KittensLobby } from '../src/games/kittens/KittensLobby';
import type { GameConn } from '../src/net/connection';

// O bot de verdade abriria um WebSocket: aqui só conta quem pediu.
vi.mock('../src/dev/kittensBots', async (original) => ({
  ...(await original<typeof import('../src/dev/kittensBots')>()),
  addKittensBot: vi.fn(),
}));

/** jsdom não desenha: o fundo do cerrado ganha um contexto 2D que aceita tudo. */
const realGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = vi.fn(
  () =>
    new Proxy({} as Record<PropertyKey, unknown>, {
      get: (t, k) => (k in t ? t[k] : (t[k] = vi.fn(() => ({ data: new Uint8ClampedArray(4) })))),
      set: (t, k, v) => ((t[k] = v), true),
    }),
) as unknown as typeof realGetContext;

const conn = (): GameConn => ({
  sendAction: vi.fn(),
  sendActivity: vi.fn(),
  sendCursor: vi.fn(),
  sendPing: vi.fn(),
  onFx: vi.fn(() => () => {}),
  onError: vi.fn(() => () => {}),
});

/** Sala de Tatubum no lobby com `n` pessoas p0… (p0 é o host). */
function lobby(n: number, me: string): KittensRoomView {
  let room = createRoom('ABCD', 0, 'kittens');
  for (let i = 0; i < n; i++) {
    const res = joinRoom(room, { token: `t${i}`, name: `P${i}`, color: PLAYER_COLORS[i]! }, `p${i}`, 0);
    if (!res.ok) throw new Error(res.error);
    room = res.room;
  }
  const v = roomView(room, me);
  if (!isKittensRoomView(v)) throw new Error('esperava sala de Tatubum');
  return v;
}

afterAll(() => {
  HTMLCanvasElement.prototype.getContext = realGetContext;
});
afterEach(() => {
  vi.clearAllMocks();
});

describe('lobby do Tatubum: bots (também no site no ar)', () => {
  it('o host vê o botão de pôr bot e ele chama o bot do Tatubum', async () => {
    render(<KittensLobby view={lobby(2, 'p0')} conn={conn()} />);
    const add = await screen.findByRole('button', { name: /adicionar bot/ });
    expect((add as HTMLButtonElement).disabled).toBe(false);
    act(() => fireEvent.click(add));
    expect(addKittensBot).toHaveBeenCalledWith('ABCD');
  });

  it('quem não é host não vê os bots', async () => {
    render(<KittensLobby view={lobby(2, 'p1')} conn={conn()} />);
    // espera o que é lazy ter chance de chegar
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(screen.queryByRole('button', { name: /adicionar bot/ })).toBeNull();
    expect(screen.getByText('esperando o host começar…')).toBeTruthy();
  });

  it(`com a mesa cheia (${KITTENS_MAX_PLAYERS}), não dá pra pôr mais bot`, async () => {
    render(<KittensLobby view={lobby(KITTENS_MAX_PLAYERS, 'p0')} conn={conn()} />);
    const add = await screen.findByRole('button', { name: /adicionar bot/ });
    expect((add as HTMLButtonElement).disabled).toBe(true);
  });
});
