import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { Home } from '../src/screens/Home';

vi.mock('../src/net/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/net/api')>();
  return { ...actual, createRoom: vi.fn(), getHistory: vi.fn(() => new Promise(() => {})), getRoomInfo: vi.fn(() => new Promise(() => {})) };
});

describe('estante de jogos', () => {
  afterEach(() => {
    window.location.hash = '';
  });

  it('uma capa por jogo, que leva pra página do jogo', () => {
    render(<Home />);
    expect(screen.getByRole('link', { name: /DITU/ }).getAttribute('href')).toBe('#/ito');
    expect(screen.getByRole('link', { name: /Diquisti/ }).getAttribute('href')).toBe('#/dixit');
    expect(screen.getByText('em breve')).toBeTruthy(); // selo na capa do Diquisti
    expect(screen.queryByText(/grupo/i)).toBeNull();
    expect(screen.queryByText(/Dixit/)).toBeNull();
  });

  it('entrar com código vai pra sala', () => {
    render(<Home />);
    fireEvent.change(screen.getByLabelText('código da sala'), { target: { value: 'kxq7' } });
    fireEvent.click(screen.getByRole('button', { name: 'entrar na sala' }));
    expect(window.location.hash).toBe('#/sala/KXQ7');
  });

  it('código inválido mostra erro', () => {
    render(<Home />);
    fireEvent.click(screen.getByRole('button', { name: 'entrar na sala' }));
    expect(screen.getByText('O código da sala tem 4 letras.')).toBeTruthy();
    expect(window.location.hash).toBe('');
  });

  it('App: #/ito abre a página do DITU; #/g/... abre o histórico do ITO com aviso', () => {
    window.location.hash = '#/ito';
    const { unmount } = render(<App />);
    expect(screen.getByRole('heading', { name: 'DITU' })).toBeTruthy();
    unmount();
    window.location.hash = '#/g/d3jj53e9xj';
    render(<App />);
    expect(screen.getByRole('tab', { name: 'histórico' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText(/grupos acabaram/)).toBeTruthy();
  });
});
