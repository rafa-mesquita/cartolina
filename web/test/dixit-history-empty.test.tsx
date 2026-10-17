import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmptyHistory } from '../src/games/dixit/history/EmptyHistory';
import * as api from '../src/net/api';
import { PHONE_TEXT } from '../src/screens/PhoneNotice';

vi.mock('../src/net/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/net/api')>();
  return { ...actual, createRoom: vi.fn() };
});

/** Promessa que o teste resolve quando quiser. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function phone(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

describe('histórico do Diquisti vazio', () => {
  beforeEach(() => {
    vi.mocked(api.createRoom).mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.location.hash = '';
  });

  it('convida a jogar e cria a sala do Diquisti', async () => {
    vi.mocked(api.createRoom).mockResolvedValue('DXQ7');
    render(<EmptyHistory />);
    expect(screen.getByRole('heading', { name: 'Ainda não tem partida de Diquisti. Bora jogar a primeira!' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'criar sala' }));
    await waitFor(() => expect(window.location.hash).toBe('#/sala/DXQ7'));
    expect(api.createRoom).toHaveBeenCalledWith('dixit');
    expect(api.createRoom).toHaveBeenCalledTimes(1);
  });

  it('enquanto cria, o botão mostra "criando…" e fica desabilitado', async () => {
    const d = deferred<string>();
    vi.mocked(api.createRoom).mockReturnValue(d.promise);
    render(<EmptyHistory />);
    fireEvent.click(screen.getByRole('button', { name: 'criar sala' }));
    const busy = await screen.findByRole('button', { name: 'criando…' });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    await act(async () => d.resolve('DXQ7'));
  });

  it('falha ao criar: avisa e o botão continua; tentar de novo tira o aviso', async () => {
    vi.mocked(api.createRoom).mockRejectedValue(new Error('create_failed_500'));
    render(<EmptyHistory />);
    fireEvent.click(screen.getByRole('button', { name: 'criar sala' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Não deu pra criar a sala. Tenta de novo.');
    expect(screen.getByRole('button', { name: 'criar sala' })).toBeTruthy();

    const d = deferred<string>();
    vi.mocked(api.createRoom).mockReturnValue(d.promise);
    fireEvent.click(screen.getByRole('button', { name: 'criar sala' }));
    await screen.findByRole('button', { name: 'criando…' });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(api.createRoom).toHaveBeenCalledTimes(2);
    await act(async () => d.resolve('DXQ7'));
  });

  it('pedidos demais (429): pede calma', async () => {
    vi.mocked(api.createRoom).mockRejectedValue(new Error('create_failed_429'));
    render(<EmptyHistory />);
    fireEvent.click(screen.getByRole('button', { name: 'criar sala' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Calma! Tenta de novo em um minutinho.');
  });

  it('no celular, o aviso toma o lugar do botão e nenhuma sala é criada', () => {
    phone(true);
    render(<EmptyHistory />);
    expect(screen.getByText(PHONE_TEXT)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'criar sala' })).toBeNull();
    expect(api.createRoom).not.toHaveBeenCalled();
  });
});
