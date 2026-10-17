import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmptyHistory } from '../src/games/dixit/history/EmptyHistory';
import * as api from '../src/net/api';

vi.mock('../src/net/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/net/api')>();
  return { ...actual, createRoom: vi.fn() };
});

describe('histórico do Diquisti vazio', () => {
  beforeEach(() => {
    vi.mocked(api.createRoom).mockReset();
  });
  afterEach(() => {
    window.location.hash = '';
  });

  it('convida a jogar e cria a sala do Diquisti', async () => {
    vi.mocked(api.createRoom).mockResolvedValue('DXQ7');
    render(<EmptyHistory />);
    expect(screen.getByText('Ainda não tem partida de Diquisti. Bora jogar a primeira!')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'criar sala' }));
    await waitFor(() => expect(window.location.hash).toBe('#/sala/DXQ7'));
    expect(api.createRoom).toHaveBeenCalledWith('dixit');
  });

  it('falha ao criar: avisa e o botão continua', async () => {
    vi.mocked(api.createRoom).mockRejectedValue(new Error('create_failed_500'));
    render(<EmptyHistory />);
    fireEvent.click(screen.getByRole('button', { name: 'criar sala' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Não deu pra criar a sala. Tenta de novo.');
    expect(screen.getByRole('button', { name: 'criar sala' })).toBeTruthy();
  });

  it('pedidos demais (429): pede calma', async () => {
    vi.mocked(api.createRoom).mockRejectedValue(new Error('create_failed_429'));
    render(<EmptyHistory />);
    fireEvent.click(screen.getByRole('button', { name: 'criar sala' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Calma! Tenta de novo em um minutinho.');
  });
});
