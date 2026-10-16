import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SocketLike } from '../src/net/connection';
import { RoomScreen } from '../src/screens/RoomScreen';
import { createRoom, getRoomInfo, type RoomInfo } from '../src/net/api';
import { markJoined, saveProfile } from '../src/net/identity';
import { makeRoom, viewOf } from './fixtures';

vi.mock('../src/net/api', () => ({ getRoomInfo: vi.fn(), createRoom: vi.fn() }));

class FakeSocket implements SocketLike {
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  constructor(public url: string) {
    FakeSocket.all.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {}
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  receive(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
  drop(code: number) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
  joins() {
    return this.sent.filter((s) => s !== 'ping').map((s) => JSON.parse(s) as { t: string; name?: string; color?: string });
  }
}

const createSocket = (url: string) => new FakeSocket(url);
const last = () => FakeSocket.all[FakeSocket.all.length - 1]!;
const mocked = vi.mocked(getRoomInfo);
const info = (seats: RoomInfo['seats'] = []): RoomInfo => ({ exists: true, game: 'ito', phase: 'lobby', seats });

function renderRoom() {
  return render(<RoomScreen code="ABCD" createSocket={createSocket} />);
}

function welcomeAndState(playerId = 'p0') {
  act(() => {
    last().receive({ t: 'welcome', playerId, code: 'ABCD' });
    last().receive({ t: 'state', room: viewOf(makeRoom(2), playerId) });
  });
}

describe('RoomScreen', () => {
  beforeEach(() => {
    FakeSocket.all = [];
    mocked.mockReset();
    vi.mocked(createRoom).mockReset();
    window.location.hash = '';
  });

  it('carrega e depois diz que a sala não existe', async () => {
    mocked.mockResolvedValue(null);
    renderRoom();
    expect(screen.getByText('carregando…')).toBeTruthy();
    expect(await screen.findByText('sala não encontrada')).toBeTruthy();
  });

  it('falha de rede é diferente de sala inexistente e dá pra tentar de novo', async () => {
    mocked.mockRejectedValueOnce(new Error('network'));
    renderRoom();
    expect(await screen.findByText('não deu pra falar com o servidor')).toBeTruthy();
    expect(screen.queryByText('sala não encontrada')).toBeNull();
    mocked.mockResolvedValue(info());
    fireEvent.click(screen.getByRole('button', { name: 'tentar de novo' }));
    expect(await screen.findByLabelText('seu nome')).toBeTruthy();
    expect(mocked).toHaveBeenCalledTimes(2);
  });

  it('formulário -> entrar -> lobby', async () => {
    mocked.mockResolvedValue(info());
    renderRoom();
    fireEvent.change(await screen.findByLabelText('seu nome'), { target: { value: 'Ana' } });
    fireEvent.click(screen.getByRole('button', { name: 'porquinho' }));
    fireEvent.click(screen.getByRole('button', { name: 'entrar' }));
    expect(last().url).toContain('/rooms/ABCD/ws');
    act(() => last().open());
    expect(last().joins()).toEqual([expect.objectContaining({ t: 'join', name: 'Ana', color: '#FF8FAB' })]);
    welcomeAndState();
    expect(await screen.findByText('sala ABCD')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'começar' })).toBeTruthy();
    // a aba lembra com qual perfil entrou
    expect(JSON.parse(sessionStorage.getItem('cartolina.joined.ABCD')!)).toEqual({ name: 'Ana', color: '#FF8FAB' });
  });

  it('cor ocupada: mostra o erro e atualiza as cores ocupadas', async () => {
    mocked.mockResolvedValueOnce(info());
    renderRoom();
    fireEvent.change(await screen.findByLabelText('seu nome'), { target: { value: 'Ana' } });
    fireEvent.click(screen.getByRole('button', { name: 'entrar' }));
    act(() => last().open());
    mocked.mockResolvedValue(info([{ id: 'p9', name: 'Zé', color: '#8EC5FF', connected: true }]));
    act(() => last().receive({ t: 'error', code: 'color_taken', message: 'x' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Esse personagem já foi escolhido.');
    await waitFor(() => expect((screen.getByRole('button', { name: 'cavaleiro' }) as HTMLButtonElement).disabled).toBe(true));
    expect(mocked).toHaveBeenCalledTimes(2);
    // a cor selecionada (azul, a primeira) foi trocada pela primeira livre
    await waitFor(() => expect(screen.getByRole('button', { name: 'porquinho' }).getAttribute('aria-pressed')).toBe('true'));
  });

  it('fechamento 4000 mostra o aviso de outra aba', async () => {
    mocked.mockResolvedValue(info());
    renderRoom();
    fireEvent.change(await screen.findByLabelText('seu nome'), { target: { value: 'Ana' } });
    fireEvent.click(screen.getByRole('button', { name: 'entrar' }));
    act(() => last().open());
    welcomeAndState();
    await screen.findByText('sala ABCD');
    act(() => last().drop(4000));
    expect(await screen.findByText('você abriu a sala em outra aba')).toBeTruthy();
  });

  it('recarregou: entra sozinho com o perfil desta aba, não o da última aba que salvou', async () => {
    markJoined('ABCD', { name: 'Ana', color: '#8EC5FF' });
    saveProfile({ name: 'Outra aba', color: '#FF8FAB' });
    mocked.mockResolvedValue(info([{ id: 'p0', name: 'Ana', color: '#8EC5FF', connected: false }]));
    renderRoom();
    await waitFor(() => expect(FakeSocket.all.length).toBe(1));
    act(() => last().open());
    expect(last().joins()).toEqual([expect.objectContaining({ t: 'join', name: 'Ana', color: '#8EC5FF' })]);
    welcomeAndState();
    expect(await screen.findByText('sala ABCD')).toBeTruthy();
  });

  it('minha cor só fica livre se o assento com ela for meu (mesmo nome)', async () => {
    markJoined('ABCD', { name: 'Ana', color: '#8EC5FF' });
    mocked.mockResolvedValue(info([{ id: 'p9', name: 'Zé', color: '#8EC5FF', connected: true }]));
    renderRoom();
    await waitFor(() => expect(FakeSocket.all.length).toBe(1));
    act(() => last().open());
    act(() => last().receive({ t: 'error', code: 'color_taken', message: 'x' }));
    await screen.findByRole('alert');
    await waitFor(() => expect(mocked).toHaveBeenCalledTimes(2));
    await waitFor(() => expect((screen.getByRole('button', { name: 'cavaleiro' }) as HTMLButtonElement).disabled).toBe(true));
  });

  it('o assento com minha cor e meu nome não bloqueia minha cor', async () => {
    markJoined('ABCD', { name: 'Ana', color: '#8EC5FF' });
    mocked.mockResolvedValue(info([{ id: 'p0', name: 'Ana', color: '#8EC5FF', connected: false }]));
    renderRoom();
    await waitFor(() => expect(FakeSocket.all.length).toBe(1));
    act(() => last().open());
    act(() => last().receive({ t: 'error', code: 'room_full', message: 'x' }));
    await screen.findByRole('alert');
    await waitFor(() => expect(mocked).toHaveBeenCalledTimes(2));
    expect((screen.getByRole('button', { name: 'cavaleiro' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('sem perfil desta aba não entra sozinho, mesmo com perfil salvo em outra aba', async () => {
    saveProfile({ name: 'Outra aba', color: '#FF8FAB' });
    mocked.mockResolvedValue(info());
    renderRoom();
    const input = (await screen.findByLabelText('seu nome')) as HTMLInputElement;
    expect(input.value).toBe('Outra aba');
    expect(FakeSocket.all.length).toBe(0);
  });

  it('sala que acabou sem saber o jogo: oferece criar outra (ITO) e o histórico do ITO', async () => {
    mocked.mockResolvedValue(info());
    vi.mocked(createRoom).mockResolvedValue('WXYZ');
    markJoined('ABCD', { name: 'Ana', color: '#8EC5FF' });
    renderRoom();
    await waitFor(() => expect(FakeSocket.all).toHaveLength(1));
    act(() => last().drop(4004));
    expect(await screen.findByText('essa sala acabou')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'ver o histórico' }).getAttribute('href')).toBe('#/ito/historico');
    fireEvent.click(screen.getByRole('button', { name: 'criar sala nova' }));
    await waitFor(() => expect(createRoom).toHaveBeenCalledWith('ito'));
    await waitFor(() => expect(window.location.hash).toBe('#/sala/WXYZ'));
  });

  it('sala que acabou: cria outra do mesmo jogo e mostra o histórico', async () => {
    mocked.mockResolvedValue(info());
    vi.mocked(createRoom).mockResolvedValue('QRST');
    markJoined('ABCD', { name: 'Ana', color: '#8EC5FF' });
    renderRoom();
    await waitFor(() => expect(FakeSocket.all).toHaveLength(1));
    act(() => {
      last().open();
      last().receive({ t: 'welcome', playerId: 'p0', code: 'ABCD' });
      last().receive({ t: 'state', room: viewOf(makeRoom(2), 'p0') });
    });
    act(() => last().drop(4004));
    expect(await screen.findByText('essa sala acabou')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'ver o histórico' }).getAttribute('href')).toBe('#/ito/historico');
    fireEvent.click(screen.getByRole('button', { name: 'criar sala nova' }));
    await waitFor(() => expect(createRoom).toHaveBeenCalledWith('ito'));
    await waitFor(() => expect(window.location.hash).toBe('#/sala/QRST'));
  });

  it('sala de Diquisti que acabou: cria outra do Diquisti e não oferece histórico (não tem)', async () => {
    mocked.mockResolvedValue({ ...info(), game: 'dixit' });
    vi.mocked(createRoom).mockResolvedValue('QRST');
    markJoined('ABCD', { name: 'Ana', color: '#8EC5FF' });
    renderRoom();
    await waitFor(() => expect(FakeSocket.all).toHaveLength(1));
    act(() => last().drop(4004));
    expect(await screen.findByText('essa sala acabou')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'ver o histórico' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'criar sala nova' }));
    await waitFor(() => expect(createRoom).toHaveBeenCalledWith('dixit'));
  });
});
