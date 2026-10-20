import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { addCamelioBot } from '../src/dev/camelioBots';
import { CamelioLobby } from '../src/games/camelio/CamelioLobby';
import type { ConnSnapshot, GameConn } from '../src/net/connection';
import { Game } from '../src/screens/Game';
import { camelioRoom, camelioView } from './camelio-fixtures';

// O bot de verdade abriria um WebSocket: aqui só conta quem pediu.
vi.mock('../src/dev/camelioBots', async (original) => ({
  ...(await original<typeof import('../src/dev/camelioBots')>()),
  addCamelioBot: vi.fn(),
}));

const conn = (): GameConn & { sendAction: Mock<GameConn['sendAction']> } => ({
  sendAction: vi.fn<GameConn['sendAction']>(),
  sendActivity: vi.fn(),
  sendCursor: vi.fn(),
  sendPing: vi.fn(),
  onFx: vi.fn(() => () => {}),
  onError: vi.fn(() => () => {}),
});

const lobbyView = (n: number, me: string) => camelioView(camelioRoom(n), me);

describe('lobby do Cama-Leão', () => {
  afterEach(() => {
    window.location.hash = '';
    vi.clearAllMocks();
  });

  it('host com 2 conectados começa', () => {
    const c = conn();
    render(<CamelioLobby view={lobbyView(2, 'p0')} conn={c} />);
    fireEvent.click(screen.getByRole('button', { name: 'começar' }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'start' });
  });

  it('com 1 só, avisa em vez de começar', () => {
    const c = conn();
    render(<CamelioLobby view={lobbyView(1, 'p0')} conn={c} />);
    expect(screen.queryByText(/precisa de pelo menos 2 pessoas/)).toBeNull();
    expect(screen.getByRole('button', { name: 'começar' }).getAttribute('data-sound')).toBe('none');
    fireEvent.click(screen.getByRole('button', { name: 'começar' }));
    expect(c.sendAction).not.toHaveBeenCalled();
    expect(screen.getByText(/precisa de pelo menos 2 pessoas \(tem 1\)/)).toBeTruthy();
  });

  it('quem não é host só espera', () => {
    render(<CamelioLobby view={lobbyView(2, 'p1')} conn={conn()} />);
    expect(screen.queryByRole('button', { name: 'começar' })).toBeNull();
    expect(screen.getByText('esperando o host começar…')).toBeTruthy();
  });

  it('mostra o nome do jogo, o código da sala e quem está na mesa', () => {
    render(<CamelioLobby view={lobbyView(2, 'p0')} conn={conn()} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Cama-Leão\s*sala ABCD/);
    expect(screen.getByText(/P0 \(você\) · host/)).toBeTruthy();
    expect(screen.getByText('P1')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'copiar link da sala' })).toBeTruthy();
  });

  it('copiar o link avisa que copiou', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<CamelioLobby view={lobbyView(2, 'p0')} conn={conn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'copiar link da sala' }));
    });
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('ABCD'));
    expect(screen.getByRole('button', { name: 'link copiado!' })).toBeTruthy();
  });

  it('dá um jeito de voltar pro início', () => {
    window.location.hash = '#/sala/ABCD';
    render(<CamelioLobby view={lobbyView(2, 'p1')} conn={conn()} />);
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
    render(<CamelioLobby view={lobbyView(2, 'p0')} conn={c} />);
    const live = screen.getByRole('status', { name: '' });
    expect(live.textContent).toBe('');
    act(() => notify('color_taken', 'Essa cor já está em uso.'));
    expect(screen.queryByText('Essa cor já está em uso.')).toBeNull();
    act(() => notify('not_host', 'Só quem criou a sala pode fazer isso.'));
    expect(screen.getByText('Só quem criou a sala pode fazer isso.')).toBeTruthy();
  });

  it('o host vê o botão de pôr bot e ele chama o bot do Cama-Leão', async () => {
    render(<CamelioLobby view={lobbyView(2, 'p0')} conn={conn()} />);
    const add = await screen.findByRole('button', { name: /adicionar bot/ });
    expect((add as HTMLButtonElement).disabled).toBe(false);
    act(() => fireEvent.click(add));
    expect(addCamelioBot).toHaveBeenCalledWith('ABCD');
  });

  it('quem não é host não vê os bots', async () => {
    render(<CamelioLobby view={lobbyView(2, 'p1')} conn={conn()} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(screen.queryByRole('button', { name: /adicionar bot/ })).toBeNull();
  });
});

describe('rota da sala de Cama-Leão', () => {
  const snap = (view: ReturnType<typeof lobbyView>): ConnSnapshot => ({ status: 'joined', playerId: view.you, view, joinError: null, serverOffset: 0 });

  it('no lobby da sala de Cama-Leão mostra o lobby', async () => {
    const view = lobbyView(2, 'p0');
    render(<Game conn={conn()} snap={snap(view)} view={view} />);
    expect(await screen.findByRole('button', { name: 'começar' })).toBeTruthy();
  });
});
