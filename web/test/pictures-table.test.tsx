import { act as rtlAct, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { playSound } from '../src/brand/sounds';
import { PicturesTable } from '../src/games/pictures/PicturesTable';
import { randomWork } from '../src/games/pictures/random';
import type { GameConn } from '../src/net/connection';
import { guessing, picturesView, play, started, stateOf } from './pictures-fixtures';

vi.mock('../src/brand/sounds', () => ({ playSound: vi.fn() }));
// Os blocos carregam o three.js sob demanda: aqui não precisa (ninguém monta blocos na rodada 0 com 3).
vi.mock('../src/games/pictures/kits/blocks', () => ({ blocks: { build: () => ({ destroy() {} }), show() {} } }));

type Conn = GameConn & { sendAction: Mock<GameConn['sendAction']>; onError: Mock<GameConn['onError']> };

/** Conexões criadas no teste: no fim, toda ação tem que ter ido pela conexão (é método; solto, perde o `this`). */
const conns: Conn[] = [];
const conn = (): Conn => {
  const c: Conn = {
    sendAction: vi.fn<GameConn['sendAction']>(),
    sendActivity: vi.fn(),
    sendCursor: vi.fn(),
    sendPing: vi.fn(),
    onFx: vi.fn(() => () => {}),
    onError: vi.fn<GameConn['onError']>(() => () => {}),
  };
  conns.push(c);
  return c;
};

/** Avisa todos os ouvintes de erro registrados na conexão falsa (mesa e bancada). */
const fail = (c: Conn, code: string, message: string) =>
  rtlAct(() => {
    for (const [listener] of c.onError.mock.calls) listener(code, message);
  });

/** Pinta a casa `i` dos cubos (o kit acha a casa pelo ponto do ponteiro). */
function paintCube(container: HTMLElement, i: number) {
  const cell = container.querySelector<HTMLElement>(`.pc-kc-cell[data-i="${i}"]`)!;
  const real = document.elementFromPoint;
  document.elementFromPoint = () => cell;
  try {
    fireEvent.pointerDown(cell, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });
  } finally {
    document.elementFromPoint = real;
  }
}

const realGetContext = HTMLCanvasElement.prototype.getContext;
beforeEach(() => {
  vi.useFakeTimers();
  // cadarços e palitos desenham em canvas: um contexto falso que aceita tudo
  const ctx = new Proxy({} as Record<PropertyKey, unknown>, {
    get: (t, k) => (k in t ? t[k] : (t[k] = vi.fn())),
    set: (t, k, v) => ((t[k] = v), true),
  });
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx) as unknown as typeof realGetContext;
});
afterEach(() => {
  for (const c of conns.splice(0)) expect(c.sendAction.mock.contexts.every((t) => t === c)).toBe(true);
  HTMLCanvasElement.prototype.getContext = realGetContext;
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('mesa do Retratim: montagem', () => {
  it('mostra a foto secreta da visão, a grade de 16 fotos, o kit e "estou pronto"', () => {
    const room = started(3);
    const { container } = render(<PicturesTable view={picturesView(room, 'p0')} conn={conn()} serverOffset={0} />);
    expect(screen.getByText('sua foto secreta')).toBeTruthy();
    const secret = stateOf(room).secrets.p0!;
    expect(container.querySelector('.pc-secret-card .co')!.textContent).toBe(secret);
    expect(container.querySelectorAll('.pc-grid .pc-photo')).toHaveLength(16);
    expect(container.querySelector(`.pc-photo[data-coord="${secret}"]`)!.classList.contains('secret')).toBe(true);
    expect(container.querySelectorAll('.pc-photo.secret')).toHaveLength(1);
    expect(container.querySelector('.pc-info .kit')!.textContent).toBe('cubos coloridos');
    expect(container.querySelector('.pc-bench .pc-kc')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'estou pronto' })).toBeTruthy();
  });

  it('"estou pronto" sem mexer não manda nada e avisa no palco', () => {
    const c = conn();
    render(<PicturesTable view={picturesView(started(3), 'p0')} conn={c} serverOffset={0} />);
    fireEvent.click(screen.getByRole('button', { name: 'estou pronto' }));
    expect(c.sendAction).not.toHaveBeenCalled();
    expect(screen.getByText('Monte alguma coisa antes de ficar pronto.')).toBeTruthy();
    expect(vi.mocked(playSound)).toHaveBeenCalledWith('error');
  });

  it('recusa do servidor vira aviso no palco (erro de entrada na sala não)', () => {
    const c = conn();
    render(<PicturesTable view={picturesView(started(3), 'p0')} conn={c} serverOffset={0} />);
    fail(c, 'room_full', 'A sala está cheia.');
    expect(screen.queryByText('A sala está cheia.')).toBeNull();
    fail(c, 'empty_work', 'Monte alguma coisa antes de ficar pronto.');
    expect(screen.getByText('Monte alguma coisa antes de ficar pronto.')).toBeTruthy();
  });

  it('mexer manda o rascunho; "estou pronto" manda ready com a obra local', () => {
    const c = conn();
    const { container } = render(<PicturesTable view={picturesView(started(3), 'p0')} conn={c} serverOffset={0} />);
    paintCube(container, 5);
    expect(c.sendAction).toHaveBeenCalledTimes(1);
    expect(c.sendAction.mock.calls[0]![0]).toMatchObject({ type: 'draft', work: { kit: 'cubes' } });
    paintCube(container, 6);
    fireEvent.click(screen.getByRole('button', { name: 'estou pronto' }));
    expect(c.sendAction).toHaveBeenCalledTimes(2);
    const ready = c.sendAction.mock.calls[1]![0] as { type: string; on: boolean; work: { cells: unknown[] } };
    expect(ready).toMatchObject({ type: 'ready', on: true });
    expect(ready.work.cells[5]).toBe(0);
    expect(ready.work.cells[6]).toBe(0);
    vi.advanceTimersByTime(5000);
    expect(c.sendAction).toHaveBeenCalledTimes(2);
  });

  it('o eco do servidor não recria a bancada (a obra local fica)', () => {
    const c = conn();
    let room = started(3);
    const { container, rerender } = render(<PicturesTable view={picturesView(room, 'p0')} conn={c} serverOffset={0} />);
    paintCube(container, 3);
    const sheet = container.querySelector('.pc-bench-sheet');
    room = play(room, 'p0', c.sendAction.mock.calls[0]![0]);
    rerender(<PicturesTable view={picturesView(room, 'p0')} conn={c} serverOffset={0} />);
    expect(container.querySelector('.pc-bench-sheet')).toBe(sheet);
    expect(container.querySelector('.pc-kc-cell[data-i="3"]')!.classList.contains('pc-kc-cube')).toBe(true);
  });

  it('pronto: bancada a 60% e sem interação; "desmarcar pronto" manda ready desligado', () => {
    const c = conn();
    let room = started(3);
    room = play(room, 'p0', { type: 'ready', on: true, work: { kit: 'cubes', cells: [0, ...Array<null>(15).fill(null)] } });
    const { container } = render(<PicturesTable view={picturesView(room, 'p0')} conn={c} serverOffset={0} />);
    expect(container.querySelector('.pc-bench')!.classList.contains('ready')).toBe(true);
    expect(screen.getByText('pronto ✓ — esperando os outros')).toBeTruthy();
    // reconectou já pronto: a bancada abre com a obra do servidor
    expect(container.querySelector('.pc-kc-cell[data-i="0"]')!.classList.contains('pc-kc-cube')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'desmarcar pronto' }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'ready', on: false });
  });

  it('selinhos: quem está montando e quem está pronto', () => {
    let room = started(3);
    room = play(room, 'p1', { type: 'ready', on: true, work: randomWork('laces') });
    const { container } = render(<PicturesTable view={picturesView(room, 'p0')} conn={conn()} serverOffset={0} />);
    const seal = (p: string) => container.querySelector(`.pc-seal[data-p="${p}"] .stt`)!.textContent;
    expect(seal('p0')).toBe('montando…');
    expect(seal('p1')).toBe('pronto ✓');
  });

  it('só o host vê "apressar" (manda hurry); com a contagem correndo, some e aparece o relógio', () => {
    const c = conn();
    const room = started(3);
    const { rerender } = render(<PicturesTable view={picturesView(room, 'p0')} conn={c} serverOffset={0} />);
    fireEvent.click(screen.getByRole('button', { name: 'apressar' }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'hurry' });

    rerender(<PicturesTable view={picturesView(room, 'p1')} conn={c} serverOffset={0} />);
    expect(screen.queryByRole('button', { name: 'apressar' })).toBeNull();

    vi.setSystemTime(1_000_000);
    const hurried = play(room, 'p0', { type: 'hurry' }, 1_000_000);
    // relógio do PC 5 s atrasado em relação ao servidor: a contagem vale a hora do servidor
    rerender(<PicturesTable view={picturesView(hurried, 'p0')} conn={c} serverOffset={5000} />);
    expect(screen.queryByRole('button', { name: 'apressar' })).toBeNull();
    expect(screen.getByRole('timer').textContent).toBe('faltam 0:25');
    rtlAct(() => vi.advanceTimersByTime(20_000));
    expect(screen.getByRole('timer').textContent).toBe('faltam 0:05');
    expect(screen.getByRole('timer').classList.contains('hurry')).toBe(true);
  });

  it('clicar numa foto abre o zoom; ← → passam, a sua tem o selo, Esc fecha', () => {
    const room = started(3);
    const secret = stateOf(room).secrets.p0!;
    const { container } = render(<PicturesTable view={picturesView(room, 'p0')} conn={conn()} serverOffset={0} />);
    fireEvent.click(container.querySelector('.pc-photo[data-coord="A1"]')!);
    expect(screen.getByRole('dialog', { name: 'foto A1' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(screen.getByRole('dialog', { name: 'foto B1' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(screen.getByRole('dialog', { name: 'foto D4' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    // o cartão da secreta abre a secreta, com o selo "sua foto"
    fireEvent.click(container.querySelector('.pc-secret-card')!);
    expect(screen.getByRole('dialog', { name: `foto ${secret}` })).toBeTruthy();
    expect(screen.getByText('sua foto')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'fechar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('o divisor solto recria a bancada com a obra local (sem mandar nada)', () => {
    const c = conn();
    const { container } = render(<PicturesTable view={picturesView(started(3), 'p0')} conn={c} serverOffset={0} />);
    paintCube(container, 9);
    const before = container.querySelector('.pc-bench-sheet');
    const divider = screen.getByRole('separator', { name: 'divisor' });
    fireEvent.pointerDown(divider, { button: 0, clientX: 700, pointerId: 7 });
    fireEvent.pointerMove(divider, { clientX: 600, pointerId: 7 });
    fireEvent.pointerUp(divider, { clientX: 600, pointerId: 7 });
    const after = container.querySelector('.pc-bench-sheet');
    expect(after).not.toBe(before);
    expect(container.querySelector('.pc-kc-cell[data-i="9"]')!.classList.contains('pc-kc-cube')).toBe(true);
    expect(c.sendAction).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('retratim:lado-direito')).not.toBeNull();
  });
});

describe('mesa do Retratim: outras fases (por enquanto)', () => {
  it('no palpite mostra o aviso da fase e a grade, sem bancada', () => {
    const { container } = render(<PicturesTable view={picturesView(guessing(3), 'p0')} conn={conn()} serverOffset={0} />);
    expect(screen.getByText('hora dos palpites')).toBeTruthy();
    expect(container.querySelectorAll('.pc-grid .pc-photo')).toHaveLength(16);
    expect(container.querySelector('.pc-bench')).toBeNull();
    expect(container.querySelector(`.pc-seal[data-p="p1"] .stt`)!.textContent).toBe('palpitando…');
  });
});
