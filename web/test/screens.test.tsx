import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, type Mock } from 'vitest';
import type { GameConn } from '../src/net/connection';
import { JoinForm } from '../src/screens/JoinForm';
import { Lobby } from '../src/screens/Lobby';
import { makeRoom, viewOf } from './fixtures';

function fakeConn(): GameConn & { sendAction: Mock<GameConn['sendAction']> } {
  return {
    sendAction: vi.fn<GameConn['sendAction']>(),
    sendActivity: vi.fn(),
    sendCursor: vi.fn(),
    sendPing: vi.fn(),
    onFx: vi.fn(() => () => {}),
    onError: vi.fn(() => () => {}),
  };
}

describe('JoinForm', () => {
  it('desabilita cores ocupadas e exige nome', () => {
    const onSubmit = vi.fn();
    render(<JoinForm takenColors={['#8EC5FF']} initial={null} busy={false} error={null} onSubmit={onSubmit} />);
    expect((screen.getByRole('button', { name: 'cor #8EC5FF' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'entrar' }));
    expect(screen.getByText('Escolha um nome de 1 a 16 letras.')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('envia nome limpo e a cor escolhida', () => {
    const onSubmit = vi.fn();
    render(<JoinForm takenColors={[]} initial={null} busy={false} error={null} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText('seu nome'), { target: { value: '  Ana  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'cor #FF8FAB' }));
    fireEvent.click(screen.getByRole('button', { name: 'entrar' }));
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Ana', color: '#FF8FAB' });
  });

  it('mostra o erro vindo do servidor', () => {
    render(<JoinForm takenColors={[]} initial={null} busy={false} error="color_taken" onSubmit={() => {}} />);
    expect(screen.getByText('Essa cor já foi escolhida.')).toBeTruthy();
  });
});

describe('Lobby', () => {
  it('host escolhe o modo e começa', () => {
    const conn = fakeConn();
    render(<Lobby view={viewOf(makeRoom(2), 'p0')} conn={conn} />);
    fireEvent.click(screen.getByRole('button', { name: /campanha/ }));
    expect(conn.sendAction).toHaveBeenCalledWith({ type: 'setMode', mode: 'campanha' });
    fireEvent.click(screen.getByRole('button', { name: 'começar' }));
    expect(conn.sendAction).toHaveBeenCalledWith({ type: 'start' });
  });

  it('host sozinho não consegue começar', () => {
    render(<Lobby view={viewOf(makeRoom(1), 'p0')} conn={fakeConn()} />);
    expect((screen.getByRole('button', { name: 'começar' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('quem não é host espera', () => {
    render(<Lobby view={viewOf(makeRoom(2), 'p1')} conn={fakeConn()} />);
    expect(screen.queryByRole('button', { name: 'começar' })).toBeNull();
    expect(screen.getByText('esperando o host começar…')).toBeTruthy();
  });
});
