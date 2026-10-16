import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { DixitLobby } from '../src/games/dixit/DixitLobby';
import type { GameConn } from '../src/net/connection';
import { dixitRoom, dixitView } from './dixit-fixtures';

const conn = (): GameConn & { sendAction: Mock<GameConn['sendAction']> } => ({
  sendAction: vi.fn<GameConn['sendAction']>(),
  sendActivity: vi.fn(),
  sendCursor: vi.fn(),
  sendPing: vi.fn(),
  onFx: vi.fn(() => () => {}),
  onError: vi.fn(() => () => {}),
});

describe('lobby do Diquisti', () => {
  afterEach(() => {
    window.location.hash = '';
  });

  it('host escolhe a meta e começa com 3+', () => {
    const c = conn();
    render(<DixitLobby view={dixitView(dixitRoom(3), 'p0')} conn={c} />);
    fireEvent.click(screen.getByRole('button', { name: /15/ }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'setTarget', target: 15 });
    fireEvent.click(screen.getByRole('button', { name: 'começar' }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'start' });
  });

  it('com menos de 3, avisa em vez de começar', () => {
    const c = conn();
    render(<DixitLobby view={dixitView(dixitRoom(2), 'p0')} conn={c} />);
    expect(screen.queryByText(/precisa de pelo menos 3 pessoas/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'começar' }));
    expect(c.sendAction).not.toHaveBeenCalledWith({ type: 'start' });
    expect(screen.getByText(/precisa de pelo menos 3 pessoas/)).toBeTruthy();
  });

  it('quem não é host só espera', () => {
    render(<DixitLobby view={dixitView(dixitRoom(3), 'p1')} conn={conn()} />);
    expect(screen.queryByRole('button', { name: 'começar' })).toBeNull();
    expect(screen.getByText('esperando o host começar…')).toBeTruthy();
  });

  it('mostra o nome do jogo e quem está na mesa', () => {
    render(<DixitLobby view={dixitView(dixitRoom(3), 'p0')} conn={conn()} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('diquisti');
    expect(screen.getByText(/P0 \(você\) · host/)).toBeTruthy();
    expect(screen.getByText('P1')).toBeTruthy();
  });

  it('o botão das metas e o título têm nome legível (sem palavras coladas)', () => {
    render(<DixitLobby view={dixitView(dixitRoom(3), 'p0')} conn={conn()} />);
    expect(screen.getByRole('button', { name: '15 curta' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^diquisti sala ABCD/);
  });

  it('com gente faltando, "começar" não toca o clique (só o erro)', () => {
    const { rerender } = render(<DixitLobby view={dixitView(dixitRoom(2), 'p0')} conn={conn()} />);
    expect(screen.getByRole('button', { name: 'começar' }).getAttribute('data-sound')).toBe('none');
    rerender(<DixitLobby view={dixitView(dixitRoom(3), 'p0')} conn={conn()} />);
    expect(screen.getByRole('button', { name: 'começar' }).getAttribute('data-sound')).toBeNull();
  });

  it('a região de avisos fica sempre montada e só troca o texto', () => {
    let notify: (code: string, message: string) => void = () => {};
    const c = conn();
    c.onError = vi.fn<GameConn['onError']>((fn) => {
      notify = fn;
      return () => {};
    });
    render(<DixitLobby view={dixitView(dixitRoom(3), 'p0')} conn={c} />);
    const live = screen.getByRole('status');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent).toBe('');
    act(() => notify('not_host', 'Só o host pode.'));
    expect(screen.getByRole('status')).toBe(live);
    expect(live.textContent).toBe('Só o host pode.');
  });

  it('dá um jeito de voltar pro início', () => {
    window.location.hash = '#/sala/ABCD';
    render(<DixitLobby view={dixitView(dixitRoom(3), 'p1')} conn={conn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'voltar pro início' }));
    expect(window.location.hash).toBe('#/');
  });

  it('mostra a recusa do servidor, menos as de entrada na sala', () => {
    let notify: (code: string, message: string) => void = () => {};
    const c = conn();
    c.onError = vi.fn<GameConn['onError']>((fn) => {
      notify = fn;
      return () => {};
    });
    render(<DixitLobby view={dixitView(dixitRoom(3), 'p0')} conn={c} />);
    act(() => notify('color_taken', 'Essa cor já está em uso.'));
    expect(screen.queryByText('Essa cor já está em uso.')).toBeNull();
    act(() => notify('not_host', 'Só quem criou a sala pode fazer isso.'));
    expect(screen.getByText('Só quem criou a sala pode fazer isso.')).toBeTruthy();
  });

  it('carrega os controles de bots do Diquisti em dev', async () => {
    render(<DixitLobby view={dixitView(dixitRoom(3), 'p0')} conn={conn()} />);
    expect(await screen.findByRole('button', { name: /adicionar bot/ })).toBeTruthy();
  });
});
