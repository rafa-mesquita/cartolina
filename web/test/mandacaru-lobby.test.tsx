import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { MandacaruLobby } from '../src/games/mandacaru/MandacaruLobby';
import type { ConnSnapshot, GameConn } from '../src/net/connection';
import { Game } from '../src/screens/Game';
import { mandacaruStateOf } from '@cartolina/shared';
import { playMandacaruSound } from '../src/games/mandacaru/sounds';
import { mandacaruLobbyRoom, mandacaruRoom, viewOf } from './mandacaru-fixtures';

vi.mock('../src/games/mandacaru/sounds', () => ({
  playMandacaruSound: vi.fn(),
  installMandacaruAudioUnlock: vi.fn(() => () => {}),
}));

const conn = (): GameConn & { sendAction: Mock<GameConn['sendAction']> } => ({
  sendAction: vi.fn<GameConn['sendAction']>(),
  sendActivity: vi.fn(),
  sendCursor: vi.fn(),
  sendPing: vi.fn(),
  onFx: vi.fn(() => () => {}),
  onError: vi.fn(() => () => {}),
});

describe('lobby do Mandacaru', () => {
  afterEach(() => {
    window.location.hash = '';
  });

  it('com 2 pessoas, "começar" fica desabilitado e avisa quantas precisa', () => {
    const c = conn();
    render(<MandacaruLobby view={viewOf(mandacaruLobbyRoom(2), 'p0')} conn={c} />);
    const start = screen.getByRole('button', { name: 'começar' }) as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    expect(screen.getByText(/precisa de 3 a 4 pessoas/)).toBeTruthy();
    fireEvent.click(start);
    expect(c.sendAction).not.toHaveBeenCalled();
  });

  it('com 3, o anfitrião começa', () => {
    const c = conn();
    render(<MandacaruLobby view={viewOf(mandacaruLobbyRoom(3), 'p0')} conn={c} />);
    expect(screen.queryByText(/precisa de 3 a 4 pessoas/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'começar' }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'start' });
  });

  it('"começar" trava depois do clique (clique duplo manda um start só) e destrava com recusa', () => {
    let notify: (code: string, message: string) => void = () => {};
    const c = conn();
    c.onError = vi.fn<GameConn['onError']>((fn) => {
      notify = fn;
      return () => {};
    });
    render(<MandacaruLobby view={viewOf(mandacaruLobbyRoom(3), 'p0')} conn={c} />);
    const start = screen.getByRole('button', { name: 'começar' }) as HTMLButtonElement;
    fireEvent.click(start);
    fireEvent.click(start);
    expect(c.sendAction).toHaveBeenCalledTimes(1);
    expect(start.disabled).toBe(true);
    act(() => notify('need_3_players', 'Precisa de 3.'));
    expect(start.disabled).toBe(false);
    fireEvent.click(start);
    expect(c.sendAction).toHaveBeenCalledTimes(2);
  });

  it('quem não é anfitrião não vê "começar"', () => {
    render(<MandacaruLobby view={viewOf(mandacaruLobbyRoom(3), 'p1')} conn={conn()} />);
    expect(screen.queryByRole('button', { name: 'começar' })).toBeNull();
    expect(screen.getByText('esperando o anfitrião começar…')).toBeTruthy();
  });

  it('mostra o nome, a frase, o código da sala e quem está na mesa', () => {
    render(<MandacaruLobby view={viewOf(mandacaruLobbyRoom(3), 'p0')} conn={conn()} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Mandacaru');
    expect(screen.getByText('faça a caatinga florir')).toBeTruthy();
    expect(screen.getByText('MAND')).toBeTruthy();
    expect(screen.getByText(/Ana \(você\) · anfitrião/)).toBeTruthy();
    expect(screen.getByText('Beto')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'copiar link da sala' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /som:/ })).toBeTruthy();
  });

  it('o "como jogar" traz as linhas do catálogo', () => {
    const { container } = render(<MandacaruLobby view={viewOf(mandacaruLobbyRoom(3), 'p0')} conn={conn()} />);
    expect(screen.getByRole('heading', { name: 'como jogar' })).toBeTruthy();
    expect(container.querySelectorAll('.mc-rules li')).toHaveLength(4);
  });

  it('com 4 na sala, avisa que a mesa está cheia', () => {
    const { rerender } = render(<MandacaruLobby view={viewOf(mandacaruLobbyRoom(3), 'p0')} conn={conn()} />);
    expect(screen.queryByText(/a mesa está cheia/)).toBeNull();
    rerender(<MandacaruLobby view={viewOf(mandacaruLobbyRoom(4), 'p0')} conn={conn()} />);
    expect(screen.getByText(/a mesa está cheia \(4\)/)).toBeTruthy();
  });

  it('copiar o link avisa que copiou', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<MandacaruLobby view={viewOf(mandacaruLobbyRoom(3), 'p0')} conn={conn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'copiar link da sala' }));
    });
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('MAND'));
    expect(screen.getByRole('button', { name: 'link copiado!' })).toBeTruthy();
  });

  it('dá um jeito de voltar pro início', () => {
    window.location.hash = '#/sala/MAND';
    render(<MandacaruLobby view={viewOf(mandacaruLobbyRoom(3), 'p1')} conn={conn()} />);
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
    render(<MandacaruLobby view={viewOf(mandacaruLobbyRoom(3), 'p0')} conn={c} />);
    const live = screen.getByRole('status');
    expect(live.textContent).toBe('');
    act(() => notify('color_taken', 'Essa cor já está em uso.'));
    expect(live.textContent).toBe('');
    act(() => notify('not_host', 'Só quem criou a sala pode fazer isso.'));
    expect(live.textContent).toBe('Só quem criou a sala pode fazer isso.');
  });
});

describe('rota da sala de Mandacaru', () => {
  const snap = (view: ReturnType<typeof viewOf>): ConnSnapshot => ({ status: 'joined', playerId: view.you, view, joinError: null, serverOffset: 0 });

  it('no lobby mostra o lobby; começada, a mesa', async () => {
    const lobby = viewOf(mandacaruLobbyRoom(3), 'p0');
    const { rerender } = render(<Game conn={conn()} snap={snap(lobby)} view={lobby} />);
    expect(await screen.findByRole('button', { name: 'começar' })).toBeTruthy();
    const playing = viewOf(mandacaruRoom(3, 1), 'p0');
    rerender(<Game conn={conn()} snap={snap(playing)} view={playing} />);
    expect(await screen.findByRole('button', { name: /rolar os dados/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'começar' })).toBeNull();
  });

  it('vindo do lobby, quem joga primeiro ouve "sua vez" já na primeira visão da mesa', async () => {
    const started = mandacaruRoom(3, 1);
    const first = mandacaruStateOf(started)!.turn!;
    const lobby = viewOf(mandacaruLobbyRoom(3), first);
    const { rerender } = render(<Game conn={conn()} snap={snap(lobby)} view={lobby} />);
    await screen.findByRole('heading', { name: 'na mesa' });
    vi.mocked(playMandacaruSound).mockClear();
    const playing = viewOf(started, first);
    rerender(<Game conn={conn()} snap={snap(playing)} view={playing} />);
    await screen.findByRole('button', { name: /rolar os dados/ });
    expect(vi.mocked(playMandacaruSound).mock.calls.map((x) => x[0])).toContain('turn');
  });

  it('abrindo a mesa no meio da partida (sem lobby antes), a vez não toca', async () => {
    const started = mandacaruRoom(3, 1);
    const first = mandacaruStateOf(started)!.turn!;
    vi.mocked(playMandacaruSound).mockClear();
    const playing = viewOf(started, first);
    render(<Game conn={conn()} snap={snap(playing)} view={playing} />);
    await screen.findByRole('button', { name: /rolar os dados/ });
    expect(vi.mocked(playMandacaruSound).mock.calls.map((x) => x[0])).not.toContain('turn');
  });
});
