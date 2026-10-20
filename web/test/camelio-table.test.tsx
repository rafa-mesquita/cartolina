import { act as rtlAct, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { PLAYER_COLORS, joinRoom, type Room } from '@cartolina/shared';
import { CamelioTable } from '../src/games/camelio/CamelioTable';
import { playCamelioSound } from '../src/games/camelio/sounds';
import type { GameConn } from '../src/net/connection';
import { camelioView, started, stateOf, playTurn } from './camelio-fixtures';

vi.mock('../src/games/camelio/sounds', async (original) => ({
  ...(await original<typeof import('../src/games/camelio/sounds')>()),
  playCamelioSound: vi.fn(),
}));
vi.mock('../src/games/camelio/anim', () => ({
  playTurnAnim: vi.fn(() => ({ done: Promise.resolve(), stop: vi.fn() })),
}));

type Conn = GameConn & { sendAction: Mock<GameConn['sendAction']>; onError: Mock<GameConn['onError']> };

const conn = (): Conn => ({
  sendAction: vi.fn<GameConn['sendAction']>(),
  sendActivity: vi.fn(),
  sendCursor: vi.fn(),
  sendPing: vi.fn(),
  onFx: vi.fn(() => () => {}),
  onError: vi.fn<GameConn['onError']>(() => () => {}),
});

/** Avisa todos os ouvintes de erro registrados na conexão falsa. */
const fail = (c: Conn, code: string, message: string) =>
  rtlAct(() => {
    for (const [listener] of c.onError.mock.calls) listener(code, message);
  });

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('mesa do Cama-Leão', () => {
  it('com 3 jogadores: os 2 assentos dos outros, a sua mesa, o monte (71) e a carta aberta', () => {
    const { container } = render(<CamelioTable view={camelioView(started(3), 'p0')} conn={conn()} />);
    expect(screen.getByLabelText('mesa de P1')).toBeTruthy();
    expect(screen.getByLabelText('mesa de P2')).toBeTruthy();
    expect(screen.getByLabelText('sua mesa')).toBeTruthy();
    expect(screen.getByLabelText('monte').textContent).toContain('71');
    expect(screen.getByLabelText('carta aberta').querySelector('.lift > .card.front')).toBeTruthy();
    // os outros ficam no arco; o seu assento fica dentro da sua mesa
    expect(container.querySelectorAll('.cl-seats .seat[data-pid]')).toHaveLength(2);
    expect(container.querySelector('.cl-mine .seat[data-pid="p0"]')).toBeTruthy();
    expect(container.querySelector('.cl-info')!.textContent).toContain('monte 71');
  });

  it('a pilha mostra a soma certa (x/5) depois de uma jogada', () => {
    const room = started(3);
    const c = conn();
    const { container, rerender } = render(<CamelioTable view={camelioView(room, 'p0')} conn={c} />);
    const turn = stateOf(room).turn!;
    const next = camelioView(playTurn(room), 'p0');
    rerender(<CamelioTable view={next} conn={c} />);
    const table = next.game.table[turn]!;
    expect(table).toHaveLength(1);
    const color = table[table.length - 1]!.color;
    const sum = table.filter((x) => x.color === color).reduce((n, x) => n + x.spheres, 0);
    const el = container.querySelector(`.seat[data-pid="${turn}"] .stack[data-color="${color}"] .sum`);
    expect(el!.textContent).toBe(`${sum}/5`);
    expect(el!.classList.contains('hot')).toBe(sum === 4);
  });

  it('desconectado aparece apagado, com "caiu"', () => {
    const v = camelioView(started(3), 'p0');
    const view = { ...v, seats: v.seats.map((s) => (s.id === 'p2' ? { ...s, connected: false } : s)) };
    render(<CamelioTable view={view} conn={conn()} />);
    const seat = screen.getByLabelText('mesa de P2');
    expect(seat.classList.contains('off')).toBe(true);
    expect(seat.textContent).toContain('caiu');
    expect(screen.getByLabelText('mesa de P1').textContent).not.toContain('caiu');
  });

  it('espectador vê a mesa de todo mundo e "você está assistindo esta partida" no lugar da sua', () => {
    const res = joinRoom(started(3), { token: 't9', name: 'Zé', color: PLAYER_COLORS[5]! }, 'p9', 0);
    if (!res.ok) throw new Error(res.error);
    const room: Room = res.room;
    const { container } = render(<CamelioTable view={camelioView(room, 'p9')} conn={conn()} />);
    expect(screen.getByText('você está assistindo esta partida')).toBeTruthy();
    expect(screen.queryByLabelText('sua mesa')).toBeNull();
    expect(container.querySelectorAll('.cl-seats .seat[data-pid]')).toHaveLength(3);
    const turn = stateOf(room).turn!;
    expect(container.querySelector('.cl-banner')!.textContent).toBe(`vez de P${turn.slice(1)}`);
  });

  it('a vez de quem joga: holofote no assento e, se for a sua, a dica no letreiro e o som de "sua vez"', () => {
    const room = started(3);
    const turn = stateOf(room).turn!;
    const { container } = render(<CamelioTable view={camelioView(room, turn)} conn={conn()} />);
    expect(container.querySelector('.cl-mine')!.classList.contains('myturn')).toBe(true);
    expect(container.querySelector(`.cl-mine .seat[data-pid="${turn}"]`)!.classList.contains('turn')).toBe(true);
    expect(container.querySelector('.cl-banner')!.textContent).toContain('sua vez:');
    expect(vi.mocked(playCamelioSound)).toHaveBeenCalledWith('turn');
  });

  it('recusa do servidor vira aviso no palco (erro de entrada na sala não)', () => {
    const c = conn();
    render(<CamelioTable view={camelioView(started(3), 'p0')} conn={c} />);
    fail(c, 'room_full', 'A sala está cheia.');
    expect(screen.queryByText('A sala está cheia.')).toBeNull();
    fail(c, 'not_your_turn', 'Não é a sua vez.');
    expect(screen.getByText('Não é a sua vez.')).toBeTruthy();
    expect(vi.mocked(playCamelioSound)).toHaveBeenCalledWith('error');
  });
});
