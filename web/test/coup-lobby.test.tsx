import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { CoupLobby } from '../src/games/coup/CoupLobby';
import type { ConnSnapshot, GameConn } from '../src/net/connection';
import { Game } from '../src/screens/Game';
import { coupLobbyRoom, coupRoom, viewOf } from './coup-fixtures';

const conn = (): GameConn & { sendAction: Mock<GameConn['sendAction']> } => ({
  sendAction: vi.fn<GameConn['sendAction']>(),
  sendActivity: vi.fn(),
  sendCursor: vi.fn(),
  sendPing: vi.fn(),
  onFx: vi.fn(() => () => {}),
  onError: vi.fn(() => () => {}),
});

describe('lobby do Cúpi', () => {
  afterEach(() => {
    window.location.hash = '';
  });

  it('anfitrião com 2 conectados começa', () => {
    const c = conn();
    render(<CoupLobby view={viewOf(coupLobbyRoom(2), 'p0')} conn={c} />);
    fireEvent.click(screen.getByRole('button', { name: 'começar' }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'start' });
  });

  it('sozinho, avisa em vez de começar', () => {
    const c = conn();
    render(<CoupLobby view={viewOf(coupLobbyRoom(1), 'p0')} conn={c} />);
    expect(screen.queryByText(/precisa de pelo menos 2 pessoas/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'começar' }));
    expect(c.sendAction).not.toHaveBeenCalled();
    expect(screen.getByText(/precisa de pelo menos 2 pessoas \(tem 1\)/)).toBeTruthy();
  });

  it('com gente faltando, "começar" não toca o clique (só o erro)', () => {
    const { rerender } = render(<CoupLobby view={viewOf(coupLobbyRoom(1), 'p0')} conn={conn()} />);
    expect(screen.getByRole('button', { name: 'começar' }).getAttribute('data-sound')).toBe('none');
    rerender(<CoupLobby view={viewOf(coupLobbyRoom(2), 'p0')} conn={conn()} />);
    expect(screen.getByRole('button', { name: 'começar' }).getAttribute('data-sound')).toBeNull();
  });

  it('quem não é anfitrião só espera', () => {
    render(<CoupLobby view={viewOf(coupLobbyRoom(3), 'p1')} conn={conn()} />);
    expect(screen.queryByRole('button', { name: 'começar' })).toBeNull();
    expect(screen.getByText('esperando o anfitrião começar…')).toBeTruthy();
  });

  it('mostra o nome do jogo, o código da sala e quem está na mesa', () => {
    render(<CoupLobby view={viewOf(coupLobbyRoom(3), 'p0')} conn={conn()} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('CÚPI');
    expect(screen.getByText('CUPI')).toBeTruthy();
    expect(screen.getByText(/Ana \(você\) · anfitrião/)).toBeTruthy();
    expect(screen.getByText('Beto')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'copiar link da sala' })).toBeTruthy();
  });

  it('o "como jogar" traz as 4 linhas do catálogo', () => {
    const { container } = render(<CoupLobby view={viewOf(coupLobbyRoom(2), 'p0')} conn={conn()} />);
    expect(screen.getByRole('heading', { name: 'como jogar' })).toBeTruthy();
    expect(container.querySelectorAll('.cp-rules li')).toHaveLength(4);
  });

  it('com 6 na sala, avisa que a mesa está cheia', () => {
    const { rerender } = render(<CoupLobby view={viewOf(coupLobbyRoom(5), 'p0')} conn={conn()} />);
    expect(screen.queryByText('a mesa está cheia (6)')).toBeNull();
    rerender(<CoupLobby view={viewOf(coupLobbyRoom(6), 'p0')} conn={conn()} />);
    expect(screen.getByText('a mesa está cheia (6)')).toBeTruthy();
  });

  it('copiar o link avisa que copiou', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<CoupLobby view={viewOf(coupLobbyRoom(2), 'p0')} conn={conn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'copiar link da sala' }));
    });
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('CUPI'));
    expect(screen.getByRole('button', { name: 'link copiado!' })).toBeTruthy();
  });

  it('sem clipboard, mostra o link pra copiar na mão', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('x')) }, configurable: true });
    render(<CoupLobby view={viewOf(coupLobbyRoom(2), 'p0')} conn={conn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'copiar link da sala' }));
    });
    expect((screen.getByLabelText('link da sala') as HTMLInputElement).value).toContain('CUPI');
  });

  it('dá um jeito de voltar pro início', () => {
    window.location.hash = '#/sala/CUPI';
    render(<CoupLobby view={viewOf(coupLobbyRoom(2), 'p1')} conn={conn()} />);
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
    render(<CoupLobby view={viewOf(coupLobbyRoom(2), 'p0')} conn={c} />);
    const live = screen.getByRole('status');
    expect(live.textContent).toBe('');
    act(() => notify('color_taken', 'Essa cor já está em uso.'));
    expect(screen.queryByText('Essa cor já está em uso.')).toBeNull();
    act(() => notify('not_host', 'Só quem criou a sala pode fazer isso.'));
    expect(live.textContent).toBe('Só quem criou a sala pode fazer isso.');
  });

  it('o controle de bots ainda ignora o Cúpi (a entrada vem na Task 6)', async () => {
    render(<CoupLobby view={viewOf(coupLobbyRoom(2), 'p0')} conn={conn()} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole('button', { name: /adicionar bot/ })).toBeNull();
  });
});

describe('rota da sala de Cúpi', () => {
  const snap = (view: ReturnType<typeof viewOf>): ConnSnapshot => ({ status: 'joined', playerId: view.you, view, joinError: null, serverOffset: 0 });

  it('no lobby mostra o lobby; começada, a mesa', async () => {
    const lobby = viewOf(coupLobbyRoom(2), 'p0');
    const { rerender } = render(<Game conn={conn()} snap={snap(lobby)} view={lobby} />);
    expect(await screen.findByRole('button', { name: 'começar' })).toBeTruthy();
    const playing = viewOf(coupRoom(2), 'p0');
    rerender(<Game conn={conn()} snap={snap(playing)} view={playing} />);
    expect(await screen.findByRole('heading', { name: 'diário' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'começar' })).toBeNull();
  });
});
