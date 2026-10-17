import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { PicturesLobby } from '../src/games/pictures/PicturesLobby';
import type { ConnSnapshot, GameConn } from '../src/net/connection';
import { Game } from '../src/screens/Game';
import { picturesRoom, picturesView, started } from './pictures-fixtures';

const conn = (): GameConn & { sendAction: Mock<GameConn['sendAction']> } => ({
  sendAction: vi.fn<GameConn['sendAction']>(),
  sendActivity: vi.fn(),
  sendCursor: vi.fn(),
  sendPing: vi.fn(),
  onFx: vi.fn(() => () => {}),
  onError: vi.fn(() => () => {}),
});

describe('lobby do Retratim', () => {
  afterEach(() => {
    window.location.hash = '';
  });

  it('host com 3+ conectados começa', () => {
    const c = conn();
    render(<PicturesLobby view={picturesView(picturesRoom(3), 'p0')} conn={c} />);
    fireEvent.click(screen.getByRole('button', { name: 'começar' }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'start' });
  });

  it('com menos de 3, avisa em vez de começar', () => {
    const c = conn();
    render(<PicturesLobby view={picturesView(picturesRoom(2), 'p0')} conn={c} />);
    expect(screen.queryByText(/precisa de pelo menos 3 pessoas/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'começar' }));
    expect(c.sendAction).not.toHaveBeenCalled();
    expect(screen.getByText(/precisa de pelo menos 3 pessoas \(tem 2\)/)).toBeTruthy();
  });

  it('com gente faltando, "começar" não toca o clique (só o erro)', () => {
    const { rerender } = render(<PicturesLobby view={picturesView(picturesRoom(2), 'p0')} conn={conn()} />);
    expect(screen.getByRole('button', { name: 'começar' }).getAttribute('data-sound')).toBe('none');
    rerender(<PicturesLobby view={picturesView(picturesRoom(3), 'p0')} conn={conn()} />);
    expect(screen.getByRole('button', { name: 'começar' }).getAttribute('data-sound')).toBeNull();
  });

  it('quem não é host só espera', () => {
    render(<PicturesLobby view={picturesView(picturesRoom(3), 'p1')} conn={conn()} />);
    expect(screen.queryByRole('button', { name: 'começar' })).toBeNull();
    expect(screen.getByText('esperando o host começar…')).toBeTruthy();
  });

  it('mostra o nome do jogo, o código da sala e quem está na mesa', () => {
    render(<PicturesLobby view={picturesView(picturesRoom(3), 'p0')} conn={conn()} />);
    const title = screen.getByRole('heading', { level: 1 }).textContent ?? '';
    expect(title).toMatch(/^Retratim sala ABCD/);
    expect(screen.getByText(/P0 \(você\) · host/)).toBeTruthy();
    expect(screen.getByText('P1')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'copiar link da sala' })).toBeTruthy();
  });

  it('copiar o link avisa que copiou', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<PicturesLobby view={picturesView(picturesRoom(3), 'p0')} conn={conn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'copiar link da sala' }));
    });
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('ABCD'));
    expect(screen.getByRole('button', { name: 'link copiado!' })).toBeTruthy();
  });

  it('dá um jeito de voltar pro início', () => {
    window.location.hash = '#/sala/ABCD';
    render(<PicturesLobby view={picturesView(picturesRoom(3), 'p1')} conn={conn()} />);
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
    render(<PicturesLobby view={picturesView(picturesRoom(3), 'p0')} conn={c} />);
    const live = screen.getByRole('status');
    expect(live.textContent).toBe('');
    act(() => notify('color_taken', 'Essa cor já está em uso.'));
    expect(screen.queryByText('Essa cor já está em uso.')).toBeNull();
    act(() => notify('not_host', 'Só quem criou a sala pode fazer isso.'));
    expect(screen.getByRole('status')).toBe(live);
    expect(live.textContent).toBe('Só quem criou a sala pode fazer isso.');
  });

  it('o controle de bots ainda ignora o Retratim (a entrada vem na Task 10)', async () => {
    render(<PicturesLobby view={picturesView(picturesRoom(3), 'p0')} conn={conn()} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole('button', { name: /adicionar bot/ })).toBeNull();
  });
});

describe('rota da sala de Retratim', () => {
  const snap = (view: ReturnType<typeof picturesView>): ConnSnapshot => ({ status: 'joined', playerId: view.you, view, joinError: null, serverOffset: 0 });

  it('no lobby mostra o lobby; começada, a mesa', () => {
    const lobby = picturesView(picturesRoom(3), 'p0');
    const { rerender } = render(<Game conn={conn()} snap={snap(lobby)} view={lobby} />);
    expect(screen.getByRole('button', { name: 'começar' })).toBeTruthy();
    const playing = picturesView(started(3), 'p0');
    rerender(<Game conn={conn()} snap={snap(playing)} view={playing} />);
    expect(screen.queryByRole('button', { name: 'começar' })).toBeNull();
    expect(screen.getByText('mesa em construção')).toBeTruthy();
  });
});
