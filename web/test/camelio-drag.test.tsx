import { act as rtlAct, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { Room } from '@cartolina/shared';
import { CamelioTable } from '../src/games/camelio/CamelioTable';
import type { GameConn } from '../src/net/connection';
import { camelioView, patchGame, play, started, stateOf } from './camelio-fixtures';

vi.mock('../src/games/camelio/sounds', async (original) => ({
  ...(await original<typeof import('../src/games/camelio/sounds')>()),
  playCamelioSound: vi.fn(),
}));
vi.mock('../src/games/camelio/anim', () => ({
  playTurnAnim: vi.fn(() => ({ done: Promise.resolve(), stop: vi.fn() })),
}));

type Conn = GameConn & { sendAction: Mock<GameConn['sendAction']> };
const conn = (): Conn => ({
  sendAction: vi.fn<GameConn['sendAction']>(),
  sendActivity: vi.fn(),
  sendCursor: vi.fn(),
  sendPing: vi.fn(),
  onFx: vi.fn(() => () => {}),
  onError: vi.fn<GameConn['onError']>(() => () => {}),
});

const tick = (ms: number) =>
  rtlAct(() => {
    vi.advanceTimersByTime(ms);
  });

/** Partida de 3 vista por quem tem a vez. */
function setup() {
  const room = started(3);
  const me = stateOf(room).turn!;
  const other = stateOf(room).players.find((p) => p !== me)!;
  const c = conn();
  const utils = render(<CamelioTable view={camelioView(room, me)} conn={c} />);
  const open = () => screen.getByLabelText('carta aberta');
  const card = () => open().querySelector('.lift > .card')!;
  const clone = () => utils.container.querySelector<HTMLElement>('.drag-clone');
  const seat = screen.getByLabelText(`mesa de P${other.slice(1)}`);
  const rerender = (r: Room) => utils.rerender(<CamelioTable view={camelioView(r, me)} conn={c} />);
  /** Aperta na carta aberta e anda `dx` px (6 ou mais começa o arrasto). */
  const press = (dx: number) => {
    fireEvent.pointerDown(card(), { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { pointerId: 1, buttons: 1, clientX: 100 + dx, clientY: 100 });
  };
  /** O que está "embaixo do ponteiro" passa a ser a mesa do outro (jsdom não faz layout). */
  const overSeat = () => Object.defineProperty(document, 'elementFromPoint', { value: () => seat.querySelector('.head'), configurable: true });
  return { room, me, other, c, utils, open, card, clone, seat, rerender, press, overSeat };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  Reflect.deleteProperty(document, 'elementFromPoint');
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('mesa do Cama-Leão: cancelamentos do gesto', () => {
  it('soltar com menos de 6 px vira clique: levanta a carta, sem clone', () => {
    const t = setup();
    t.press(5);
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 105, clientY: 100 });
    fireEvent.click(t.card());
    expect(t.clone()).toBeNull();
    expect(t.open().classList.contains('picked')).toBe(true);
    expect(t.c.sendAction).not.toHaveBeenCalled();
  });

  it('o clique que vem logo depois de um arrasto de verdade é engolido (só ele)', () => {
    const t = setup();
    t.press(30);
    expect(t.clone()).toBeTruthy();
    // soltou fora de qualquer mesa: volta pro lugar
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 130, clientY: 100 });
    expect(t.clone()).toBeNull();
    fireEvent.click(t.card());
    expect(t.open().classList.contains('picked')).toBe(false);
    // o clique seguinte já é clique
    fireEvent.click(t.card());
    expect(t.open().classList.contains('picked')).toBe(true);
    expect(t.c.sendAction).not.toHaveBeenCalled();
  });

  it.each([
    ['pointercancel', () => fireEvent.pointerCancel(window, { pointerId: 1 })],
    ['blur', () => fireEvent.blur(window)],
    ['pointermove com buttons: 0', () => fireEvent.pointerMove(window, { pointerId: 1, buttons: 0, clientX: 140, clientY: 100 })],
  ])('%s no meio do arrasto devolve a carta', (_name, cancel) => {
    const t = setup();
    t.overSeat();
    t.press(30);
    expect(t.clone()).toBeTruthy();
    expect(t.seat.classList.contains('hover')).toBe(true);
    cancel();
    expect(t.clone()).toBeNull();
    expect(t.open().classList.contains('dragging')).toBe(false);
    expect(t.seat.classList.contains('hover')).toBe(false);
    expect(t.utils.container.querySelector('.cl-stage')!.classList.contains('drag-on')).toBe(false);
    // o pointerup que chegasse depois não joga nada
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 140, clientY: 100 });
    expect(t.c.sendAction).not.toHaveBeenCalled();
  });

  it('pointercancel antes dos 6 px só desarma (o movimento seguinte não arrasta)', () => {
    const t = setup();
    t.press(2);
    fireEvent.pointerCancel(window, { pointerId: 1 });
    fireEvent.pointerMove(window, { pointerId: 1, buttons: 1, clientX: 140, clientY: 100 });
    expect(t.clone()).toBeNull();
  });

  it.each([
    ['a pausa', (r: Room) => patchGame(r, { paused: true })],
    ['a vez acabando', (r: Room) => patchGame(r, { turn: stateOf(r).players.find((p) => p !== stateOf(r).turn)! })],
  ])('%s no meio do arrasto devolve a carta e a soltura não manda nada', (_name, change) => {
    const t = setup();
    t.overSeat();
    t.press(30);
    expect(t.clone()).toBeTruthy();
    t.rerender(change(t.room));
    expect(t.clone()).toBeNull();
    expect(t.open().classList.contains('dragging')).toBe(false);
    fireEvent.pointerMove(window, { pointerId: 1, buttons: 1, clientX: 150, clientY: 60 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 150, clientY: 60 });
    expect(t.clone()).toBeNull();
    expect(t.c.sendAction).not.toHaveBeenCalled();
  });

  it('partida nova com o clone esperando o servidor: o clone some (e o relógio de 4 s não volta com ele)', () => {
    const t = setup();
    t.overSeat();
    t.press(30);
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 130, clientY: 100 });
    expect(t.c.sendAction).toHaveBeenCalledWith({ type: 'play', from: 'open', to: t.other });
    const waiting = t.clone()!;
    expect(waiting).toBeTruthy();
    const over = patchGame(t.room, { phase: 'over', turn: null, winners: ['p0'], endReason: 'target' });
    const fresh = play(over, 'p0', { type: 'again' });
    expect(stateOf(fresh).match).not.toBe(stateOf(t.room).match);
    t.rerender(fresh);
    expect(t.clone()).toBeNull();
    expect(waiting.parentNode).toBeNull();
    expect(t.open().classList.contains('dragging')).toBe(false);
    tick(5000);
    expect(t.clone()).toBeNull();
    expect(t.open().classList.contains('dragging')).toBe(false);
  });

  it('desmontar com o clone arrastando não deixa o clone pra trás', () => {
    const t = setup();
    t.press(30);
    const dragging = t.clone()!;
    expect(dragging).toBeTruthy();
    t.utils.unmount();
    expect(dragging.parentNode).toBeNull();
    // os ouvintes do window saíram junto
    fireEvent.pointerMove(window, { pointerId: 1, buttons: 1, clientX: 160, clientY: 100 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 160, clientY: 100 });
    expect(t.c.sendAction).not.toHaveBeenCalled();
  });

  it('desmontar com o clone esperando o servidor e o relógio de 4 s ligado não deixa clone nem timer', () => {
    const t = setup();
    t.overSeat();
    t.press(30);
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 130, clientY: 100 });
    const waiting = t.clone()!;
    expect(waiting).toBeTruthy();
    tick(150); // o "snap" do clone (120 ms) já passou: o que sobra é o relógio de 4 s
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    t.utils.unmount();
    expect(waiting.parentNode).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
