import { act as rtlAct, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi, type Mock } from 'vitest';
import type { GameConn } from '../src/net/connection';
import { ClueSheet, type ClueSheetHandle } from '../src/table/phone/ClueSheet';
import { PhoneHand } from '../src/table/phone/PhoneHand';
import { act, sortingRoom, viewOf } from './fixtures';

const conn = (): GameConn & { sendAction: Mock<GameConn['sendAction']>; sendActivity: Mock<GameConn['sendActivity']> } => ({
  sendAction: vi.fn<GameConn['sendAction']>(),
  sendActivity: vi.fn<GameConn['sendActivity']>(),
  sendCursor: vi.fn(),
  sendPing: vi.fn(),
  onFx: vi.fn(() => () => {}),
  onError: vi.fn(() => () => {}),
});

describe('mão do celular', () => {
  it('mostra o meu número; toque seleciona; "✎ dica" abre o painel', () => {
    const view = viewOf(sortingRoom(2), 'p0');
    const onPick = vi.fn();
    const onEdit = vi.fn();
    render(<PhoneHand view={view} row={[]} selected={null} onPick={onPick} onEdit={onEdit} />);
    const mine = view.game.cards['p0:0']!;
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${mine.value}`) }));
    expect(onPick).toHaveBeenCalledWith('p0:0');
    fireEvent.click(screen.getByRole('button', { name: '✎ dica' }));
    expect(onEdit).toHaveBeenCalledWith('p0:0');
  });

  it('nome acessível do botão do número traz o número e o estado da dica', () => {
    const view = viewOf(sortingRoom(2), 'p0');
    const mine = view.game.cards['p0:0']!;
    const { rerender } = render(<PhoneHand view={view} row={[]} selected={null} onPick={vi.fn()} onEdit={vi.fn()} />);
    expect(screen.getByRole('button', { name: `${mine.value}, sem dica` })).toBeTruthy();
    const withClue = act(sortingRoom(2), 'p0', { type: 'clue', cardId: 'p0:0', text: 'gato' });
    rerender(<PhoneHand view={viewOf(withClue, 'p0')} row={[]} selected="p0:0" onPick={vi.fn()} onEdit={vi.fn()} />);
    const btn = screen.getByRole('button', { name: `${mine.value}, gato` });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('carta já na fila aparece esmaecida e sem editar dica', () => {
    const room = act(sortingRoom(2), 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
    render(<PhoneHand view={viewOf(room, 'p0')} row={['p0:0']} selected={null} onPick={vi.fn()} onEdit={vi.fn()} />);
    expect(screen.getByText('tá na fila ↑')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '✎ dica' })).toBeNull();
    expect(screen.getByRole('button', { name: /na fila/ })).toBeTruthy();
  });
});

describe('painel da dica', () => {
  it('escreve com debounce e manda na hora ao tocar "ok"', () => {
    vi.useFakeTimers();
    try {
      const c = conn();
      const onClose = vi.fn();
      render(<ClueSheet view={viewOf(sortingRoom(2), 'p0')} cardId="p0:0" conn={c} onClose={onClose} />);
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'gato' } });
      expect(c.sendAction).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'ok' }));
      expect(c.sendAction).toHaveBeenCalledWith({ type: 'clue', cardId: 'p0:0', text: 'gato' });
      expect(onClose).toHaveBeenCalled();
      rtlAct(() => void vi.advanceTimersByTime(1000));
      expect(c.sendAction).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('manda sozinho depois de 350 ms parado', () => {
    vi.useFakeTimers();
    try {
      const c = conn();
      render(<ClueSheet view={viewOf(sortingRoom(2), 'p0')} cardId="p0:0" conn={c} onClose={vi.fn()} />);
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'gato' } });
      rtlAct(() => void vi.advanceTimersByTime(349));
      expect(c.sendAction).not.toHaveBeenCalled();
      rtlAct(() => void vi.advanceTimersByTime(2));
      expect(c.sendAction).toHaveBeenCalledWith({ type: 'clue', cardId: 'p0:0', text: 'gato' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('não manda dica igual à do servidor', () => {
    const c = conn();
    const room = act(sortingRoom(2), 'p0', { type: 'clue', cardId: 'p0:0', text: 'gato' });
    render(<ClueSheet view={viewOf(room, 'p0')} cardId="p0:0" conn={c} onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'gato' } });
    fireEvent.click(screen.getByRole('button', { name: 'ok' }));
    expect(c.sendAction).not.toHaveBeenCalled();
  });

  it('manda "escrevendo" no máximo a cada 1,5 s', () => {
    vi.useFakeTimers();
    try {
      const c = conn();
      render(<ClueSheet view={viewOf(sortingRoom(2), 'p0')} cardId="p0:0" conn={c} onClose={vi.fn()} />);
      const box = screen.getByRole('textbox');
      fireEvent.change(box, { target: { value: 'g' } });
      fireEvent.change(box, { target: { value: 'ga' } });
      expect(c.sendActivity).toHaveBeenCalledTimes(1);
      expect(c.sendActivity).toHaveBeenCalledWith('writing');
      rtlAct(() => void vi.advanceTimersByTime(1600));
      fireEvent.change(box, { target: { value: 'gat' } });
      expect(c.sendActivity).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('é um diálogo com o foco no campo; tocar fora fecha e manda o pendente', () => {
    const c = conn();
    const onClose = vi.fn();
    const { container } = render(<ClueSheet view={viewOf(sortingRoom(2), 'p0')} cardId="p0:0" conn={c} onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: 'dica da carta' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('textbox'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'gato' } });
    fireEvent.click(container.querySelector('.p-sheet-veil')!);
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'clue', cardId: 'p0:0', text: 'gato' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('tocar dentro do painel não fecha', () => {
    const onClose = vi.fn();
    render(<ClueSheet view={viewOf(sortingRoom(2), 'p0')} cardId="p0:0" conn={conn()} onClose={onClose} />);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Esc fecha, mandando antes o pendente', () => {
    const c = conn();
    const onClose = vi.fn();
    render(<ClueSheet view={viewOf(sortingRoom(2), 'p0')} cardId="p0:0" conn={c} onClose={onClose} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'gato' } });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'clue', cardId: 'p0:0', text: 'gato' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('flush pela ref manda o pendente antes de a carta ir pra fila', () => {
    const c = conn();
    const ref = createRef<ClueSheetHandle>();
    render(<ClueSheet ref={ref} view={viewOf(sortingRoom(2), 'p0')} cardId="p0:0" conn={c} onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'gato' } });
    rtlAct(() => ref.current!.flush());
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'clue', cardId: 'p0:0', text: 'gato' });
  });

  it('com a carta na fila não manda dica (o servidor recusaria)', () => {
    const c = conn();
    const room = act(sortingRoom(2), 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
    render(<ClueSheet view={viewOf(room, 'p0')} cardId="p0:0" conn={c} onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'gato' } });
    fireEvent.click(screen.getByRole('button', { name: 'ok' }));
    expect(c.sendAction).not.toHaveBeenCalled();
  });
});
