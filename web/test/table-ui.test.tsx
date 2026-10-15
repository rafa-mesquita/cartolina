import { act as rtlAct, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, type Mock } from 'vitest';
import type { GameConn } from '../src/net/connection';
import type { EngineSnapshot } from '../src/table/engine';
import { Hand } from '../src/table/Hand';
import { ReadyColumn } from '../src/table/ReadyColumn';
import { Table } from '../src/table/Table';
import { ThemePanel } from '../src/table/ThemePanel';
import { TopBar } from '../src/table/TopBar';
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

  it('revelação: animando mostra "revelando…"; depois, só a dica neutra (também pra quem assiste)', () => {
    let room = sortingRoom(2);
    room = act(room, 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
    room = act(room, 'p1', { type: 'place', cardId: 'p1:0', index: 1 });
    room = act(room, 'p0', { type: 'forceReveal' });
    const animating = { ...snap(['p0:0', 'p1:0']), revealing: true };
    const { rerender } = render(<ReadyColumn view={viewOf(room, 'p0')} snap={animating} conn={conn()} />);
    expect((screen.getByRole('button', { name: 'revelando…' }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<ReadyColumn view={viewOf(room, 'p0')} snap={snap(['p0:0', 'p1:0'])} conn={conn()} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('rodada revelada')).toBeTruthy();
    rerender(<ReadyColumn view={viewOf(room, null)} snap={snap(['p0:0', 'p1:0'])} conn={conn()} />);
    expect(screen.getByText('rodada revelada')).toBeTruthy();
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
    expect(screen.getByRole('alert').textContent).toBe('preenche o tema e os dois extremos');
  });

  it('erro some ao digitar e ao cancelar', () => {
    render(<ThemePanel view={viewOf(inTheme(), 'p0')} conn={conn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'escrever tema' }));
    fireEvent.click(screen.getByRole('button', { name: 'usar esse tema' }));
    fireEvent.change(screen.getByLabelText('tema'), { target: { value: 'P' } });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'usar esse tema' }));
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'cancelar' }));
    fireEvent.click(screen.getByRole('button', { name: 'escrever tema' }));
    expect(screen.queryByRole('alert')).toBeNull();
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

  it('selo da carta na mão é o meu personagem (sem inicial)', () => {
    const { container } = render(<Hand view={viewOf(sortingRoom(2), 'p0')} snap={snap([])} engine={null} conn={conn()} />);
    const badge = slot(container).querySelector('.badge')!;
    expect(badge.querySelector('svg')).not.toBeNull();
    expect(badge.textContent).toBe('');
  });

  const clueSends = (c: ReturnType<typeof conn>) => c.sendAction.mock.calls.filter(([a]) => a.type === 'clue');
  const typeClue = (value: string) => fireEvent.change(screen.getByPlaceholderText('escreve uma dica…'), { target: { value } });

  it('várias teclas dentro do debounce viram um envio só', () => {
    vi.useFakeTimers();
    try {
      const c = conn();
      render(<Hand view={viewOf(sortingRoom(2), 'p0')} snap={snap([])} engine={null} conn={c} />);
      typeClue('q');
      vi.advanceTimersByTime(100);
      typeClue('qu');
      vi.advanceTimersByTime(100);
      typeClue('quentinho');
      expect(clueSends(c)).toHaveLength(0);
      vi.advanceTimersByTime(400);
      expect(clueSends(c)).toEqual([[{ type: 'clue', cardId: 'p0:0', text: 'quentinho' }]]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('sair do campo manda a dica na hora, uma vez só', () => {
    vi.useFakeTimers();
    try {
      const c = conn();
      render(<Hand view={viewOf(sortingRoom(2), 'p0')} snap={snap([])} engine={null} conn={c} />);
      typeClue('frio');
      fireEvent.blur(screen.getByPlaceholderText('escreve uma dica…'));
      expect(clueSends(c)).toEqual([[{ type: 'clue', cardId: 'p0:0', text: 'frio' }]]);
      vi.advanceTimersByTime(1000);
      expect(clueSends(c)).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('desmontar com dica pendente manda a dica', () => {
    vi.useFakeTimers();
    try {
      const c = conn();
      const { unmount } = render(<Hand view={viewOf(sortingRoom(2), 'p0')} snap={snap([])} engine={null} conn={c} />);
      typeClue('morno');
      unmount();
      expect(clueSends(c)).toEqual([[{ type: 'clue', cardId: 'p0:0', text: 'morno' }]]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('dica igual à do servidor não é enviada', () => {
    vi.useFakeTimers();
    try {
      const room = act(sortingRoom(2), 'p0', { type: 'clue', cardId: 'p0:0', text: 'sol' });
      const c = conn();
      render(<Hand view={viewOf(room, 'p0')} snap={snap([])} engine={null} conn={c} />);
      typeClue('so');
      typeClue('sol');
      vi.advanceTimersByTime(400);
      fireEvent.blur(screen.getByPlaceholderText('escreve uma dica…'));
      expect(clueSends(c)).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('atividade "escrevendo" no máximo uma vez a cada 1,5 s', () => {
    vi.useFakeTimers();
    try {
      const c = conn();
      render(<Hand view={viewOf(sortingRoom(2), 'p0')} snap={snap([])} engine={null} conn={c} />);
      typeClue('a');
      typeClue('ab');
      vi.advanceTimersByTime(1000);
      typeClue('abc');
      expect(c.sendActivity).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(600);
      typeClue('abcd');
      expect(c.sendActivity).toHaveBeenCalledTimes(2);
      expect(c.sendActivity).toHaveBeenLastCalledWith('writing');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('TopBar', () => {
  const campaign = () => viewOf(act(act(makeRoom(2), 'p0', { type: 'setMode', mode: 'campanha' }), 'p0', { type: 'start' }), 'p0');

  it('vidas são uma imagem com rótulo', () => {
    render(<TopBar view={campaign()} />);
    expect(screen.getByRole('img', { name: '3 vidas' })).toBeTruthy();
  });

  it('copiar o link dá retorno; sem clipboard não quebra', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    try {
      render(<TopBar view={campaign()} />);
      await rtlAct(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'sala ABCD' }));
      });
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('#/sala/ABCD'));
      expect(screen.getByRole('button', { name: 'copiado!' })).toBeTruthy();
      Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
      render(<TopBar view={campaign()} />);
      await rtlAct(async () => {
        fireEvent.click(screen.getAllByRole('button', { name: 'sala ABCD' })[0]!);
      });
    } finally {
      Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    }
  });
});

describe('Table', () => {
  it('"revelar agora" só com todas as cartas na fila', () => {
    const c = conn();
    let room = sortingRoom(2);
    const { rerender } = render(<Table view={viewOf(room, 'p0')} conn={c} />);
    const btn = () => screen.getByRole('button', { name: 'revelar agora' }) as HTMLButtonElement;
    expect(btn().disabled).toBe(true);
    room = act(room, 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
    room = act(room, 'p1', { type: 'place', cardId: 'p1:0', index: 1 });
    rerender(<Table view={viewOf(room, 'p0')} conn={c} />);
    expect(btn().disabled).toBe(false);
    fireEvent.click(btn());
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'forceReveal' });
  });

  it('meu assento mostra meu status', () => {
    render(<Table view={viewOf(sortingRoom(2), 'p0')} conn={conn()} />);
    expect(screen.getByText('você')).toBeTruthy();
  });
});
