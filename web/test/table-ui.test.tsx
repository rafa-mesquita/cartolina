import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, type Mock } from 'vitest';
import type { GameConn } from '../src/net/connection';
import type { EngineSnapshot } from '../src/table/engine';
import { Hand } from '../src/table/Hand';
import { ReadyColumn } from '../src/table/ReadyColumn';
import { ThemePanel } from '../src/table/ThemePanel';
import { act, makeRoom, sortingRoom, viewOf } from './fixtures';

const conn = (): GameConn & { sendAction: Mock<GameConn['sendAction']> } => ({
  sendAction: vi.fn<GameConn['sendAction']>(),
  sendActivity: vi.fn(),
  sendCursor: vi.fn(),
  sendPing: vi.fn(),
  onFx: vi.fn(() => () => {}),
  onError: vi.fn(() => () => {}),
});
const snap = (row: string[], inFlight: string[] = [], dragging: string | null = null): EngineSnapshot => ({
  row,
  inFlight: new Set(inFlight),
  dragging,
  revealing: false,
});

describe('ReadyColumn', () => {
  it('pede pra colocar as cartas antes', () => {
    render(<ReadyColumn view={viewOf(sortingRoom(2), 'p0')} snap={snap([])} conn={conn()} />);
    expect((screen.getByRole('button', { name: 'tô pronto' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('bota suas cartas na fila')).toBeTruthy();
  });

  it('marca e desmarca pronto', () => {
    const c = conn();
    let room = sortingRoom(2);
    render(<ReadyColumn view={viewOf(room, 'p0')} snap={snap(['p0:0'])} conn={c} />);
    fireEvent.click(screen.getByRole('button', { name: 'tô pronto' }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'ready', ready: true });
    room = act(act(room, 'p0', { type: 'place', cardId: 'p0:0', index: 0 }), 'p0', { type: 'ready', ready: true });
    render(<ReadyColumn view={viewOf(room, 'p0')} snap={snap(['p0:0'])} conn={c} />);
    fireEvent.click(screen.getByRole('button', { name: 'pronto ✓' }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'ready', ready: false });
  });

  it('quem não joga a rodada assiste', () => {
    render(<ReadyColumn view={viewOf(sortingRoom(2), null)} snap={snap([])} conn={conn()} />);
    expect(screen.getByText('você tá assistindo essa rodada')).toBeTruthy();
  });
});

describe('ThemePanel', () => {
  const inTheme = () => act(makeRoom(2), 'p0', { type: 'start' });

  it('host sorteia, escreve tema e dá as cartas', () => {
    const c = conn();
    render(<ThemePanel view={viewOf(inTheme(), 'p0')} conn={c} />);
    fireEvent.click(screen.getByRole('button', { name: 'sortear outro' }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'rerollTheme' });
    fireEvent.click(screen.getByRole('button', { name: 'escrever tema' }));
    fireEvent.change(screen.getByLabelText('tema'), { target: { value: 'Pizzas' } });
    fireEvent.change(screen.getByLabelText('1 ='), { target: { value: 'ruim' } });
    fireEvent.change(screen.getByLabelText('100 ='), { target: { value: 'divina' } });
    fireEvent.click(screen.getByRole('button', { name: 'usar esse tema' }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'customTheme', theme: { titulo: 'Pizzas', min: 'ruim', max: 'divina' } });
    fireEvent.click(screen.getByRole('button', { name: 'dar as cartas' }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'beginRound' });
  });

  it('tema próprio incompleto mostra erro', () => {
    render(<ThemePanel view={viewOf(inTheme(), 'p0')} conn={conn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'escrever tema' }));
    fireEvent.click(screen.getByRole('button', { name: 'usar esse tema' }));
    expect(screen.getByText('preenche o tema e os dois extremos')).toBeTruthy();
  });

  it('quem não é host não vê o painel', () => {
    const { container } = render(<ThemePanel view={viewOf(inTheme(), 'p1')} conn={conn()} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('Hand', () => {
  const slot = (container: HTMLElement) => container.querySelector<HTMLElement>('[data-hand-slot="p0:0"]')!;

  it('carta na mão, na fila, carregada por outra pessoa e arrastada por mim', () => {
    const view = viewOf(sortingRoom(2), 'p0');
    const { container, rerender } = render(<Hand view={view} snap={snap([])} engine={null} conn={conn()} />);
    expect(slot(container).className).not.toMatch(/away|dragging/);
    rerender(<Hand view={view} snap={snap(['p0:0'])} engine={null} conn={conn()} />);
    expect(slot(container).classList.contains('away')).toBe(true);
    // outra pessoa carregando minha carta da fila: continua "na mesa"
    rerender(<Hand view={view} snap={snap([], ['p0:0'])} engine={null} conn={conn()} />);
    expect(slot(container).classList.contains('away')).toBe(true);
    expect(slot(container).classList.contains('dragging')).toBe(false);
    rerender(<Hand view={view} snap={snap([], ['p0:0'], 'p0:0')} engine={null} conn={conn()} />);
    expect(slot(container).classList.contains('dragging')).toBe(true);
  });

  it('dica é enviada com debounce', () => {
    vi.useFakeTimers();
    const c = conn();
    render(<Hand view={viewOf(sortingRoom(2), 'p0')} snap={snap([])} engine={null} conn={c} />);
    fireEvent.change(screen.getByPlaceholderText('escreve uma dica…'), { target: { value: 'quentinho' } });
    expect(c.sendActivity).toHaveBeenCalledWith('writing');
    expect(c.sendAction).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'clue', cardId: 'p0:0', text: 'quentinho' });
    vi.useRealTimers();
  });
});
