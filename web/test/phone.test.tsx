import { summarizeHistory, type GroupResponse } from '@cartolina/shared';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { PHONE_TEXT } from '../src/screens/PhoneNotice';
import { PHONE_QUERY } from '../src/lib/device';
import { Home } from '../src/screens/Home';
import { GroupPage } from '../src/screens/GroupPage';
import { getGroup } from '../src/net/api';

vi.mock('../src/net/api', () => ({
  getRoomInfo: vi.fn(() => new Promise(() => {})),
  createRoom: vi.fn(),
  createGroup: vi.fn(),
  getGroup: vi.fn(),
  createGroupRoom: vi.fn(),
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

function groupResponse(): GroupResponse {
  return { group: { slug: 'abcdefghjk', name: 'Galera', createdAt: 0 }, rounds: [], stats: summarizeHistory([]), nextBefore: null };
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

  it('no celular, a tela inicial troca "criar sala" pelo aviso (grupos continuam)', () => {
    phone(true);
    render(<Home />);
    expect(screen.queryByRole('button', { name: 'criar sala' })).toBeNull();
    expect(screen.getByText(PHONE_TEXT)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'criar grupo' })).toBeTruthy();
  });

  it('no celular, a página do grupo troca "criar sala do grupo" pelo aviso (histórico continua)', async () => {
    phone(true);
    vi.mocked(getGroup).mockResolvedValue(groupResponse());
    render(<GroupPage slug="abcdefghjk" />);
    expect(await screen.findByRole('heading', { name: 'Galera' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'criar sala do grupo' })).toBeNull();
    expect(screen.getByText(PHONE_TEXT)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'copiar link do grupo' })).toBeTruthy();
  });

  it('no computador, a página do grupo mantém "criar sala do grupo"', async () => {
    phone(false);
    vi.mocked(getGroup).mockResolvedValue(groupResponse());
    render(<GroupPage slug="abcdefghjk" />);
    expect(await screen.findByRole('button', { name: 'criar sala do grupo' })).toBeTruthy();
    expect(screen.queryByText(PHONE_TEXT)).toBeNull();
  });

  it('no computador, nada muda', () => {
    phone(false);
    render(<Home />);
    expect(screen.getByRole('button', { name: 'criar sala' })).toBeTruthy();
    expect(screen.queryByText(PHONE_TEXT)).toBeNull();
  });

  it('usa só a detecção de toque: janela estreita de computador não é celular', () => {
    phone(false);
    render(<Home />);
    const query = vi.mocked(window.matchMedia).mock.calls[0]?.[0];
    expect(query).toBe(PHONE_QUERY);
    expect(PHONE_QUERY).toBe('(hover: none) and (pointer: coarse)');
  });

  it('sem matchMedia (navegador velho, jsdom): conta como computador', () => {
    vi.stubGlobal('matchMedia', undefined);
    render(<Home />);
    expect(screen.getByRole('button', { name: 'criar sala' })).toBeTruthy();
  });
});
