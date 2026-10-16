import { summarizeHistory, type HistoryResponse } from '@cartolina/shared';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { PHONE_TEXT } from '../src/screens/PhoneNotice';
import { PHONE_QUERY } from '../src/lib/device';
import { GamePage } from '../src/screens/GamePage';
import { Home } from '../src/screens/Home';
import { getHistory } from '../src/net/api';

vi.mock('../src/net/api', () => ({
  getRoomInfo: vi.fn(() => new Promise(() => {})),
  createRoom: vi.fn(),
  getHistory: vi.fn(),
}));

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

function historyResponse(): HistoryResponse {
  return { game: 'ito', rounds: [], stats: summarizeHistory([]), nextBefore: null };
}

describe('aviso no celular', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.location.hash = '';
  });

  it('no celular, a sala mostra o aviso em vez do jogo', () => {
    phone(true);
    window.location.hash = '#/sala/ABCD';
    render(<App />);
    expect(screen.getByText(PHONE_TEXT)).toBeTruthy();
    expect(screen.queryByText('carregando…')).toBeNull();
  });

  it('no celular, a estante continua e a página do DITU troca "criar sala" pelo aviso', () => {
    phone(true);
    const { unmount } = render(<Home />);
    expect(screen.getByRole('link', { name: /DITU/ })).toBeTruthy();
    // a linha do código fica de fora: a sala não abre no celular (como na aba jogar)
    expect(screen.queryByText('tem um código?')).toBeNull();
    expect(screen.queryByRole('button', { name: 'entrar' })).toBeNull();
    expect(screen.queryByText(PHONE_TEXT)).toBeNull();
    unmount();
    render(<GamePage game="ito" tab="jogar" />);
    expect(screen.queryByRole('button', { name: 'criar sala' })).toBeNull();
    expect(screen.getByText(PHONE_TEXT)).toBeTruthy();
  });

  it('no celular, a aba de histórico continua funcionando', async () => {
    phone(true);
    vi.mocked(getHistory).mockResolvedValue(historyResponse());
    render(<GamePage game="ito" tab="historico" />);
    expect(await screen.findByText(/Nenhuma partida ainda/)).toBeTruthy();
    expect(screen.queryByText(PHONE_TEXT)).toBeNull();
  });

  it('no computador, a estante mostra a linha do código', () => {
    phone(false);
    render(<Home />);
    expect(screen.getByText('tem um código?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'entrar' })).toBeTruthy();
  });

  it('no computador, a página do DITU mantém "criar sala"', () => {
    phone(false);
    render(<GamePage game="ito" tab="jogar" />);
    expect(screen.getByRole('button', { name: 'criar sala' })).toBeTruthy();
    expect(screen.queryByText(PHONE_TEXT)).toBeNull();
  });

  it('usa só a detecção de toque: janela estreita de computador não é celular', () => {
    phone(false);
    render(<GamePage game="ito" tab="jogar" />);
    const query = vi.mocked(window.matchMedia).mock.calls[0]?.[0];
    expect(query).toBe(PHONE_QUERY);
    expect(PHONE_QUERY).toBe('(hover: none) and (pointer: coarse)');
  });

  it('sem matchMedia (navegador velho, jsdom): conta como computador', () => {
    vi.stubGlobal('matchMedia', undefined);
    render(<GamePage game="ito" tab="jogar" />);
    expect(screen.getByRole('button', { name: 'criar sala' })).toBeTruthy();
  });
});
