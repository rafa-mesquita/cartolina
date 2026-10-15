import { summarizeHistory, type GroupResponse, type RoundRecord } from '@cartolina/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from '../src/net/api';
import { loadGroups, rememberGroup } from '../src/net/identity';
import { GroupPage } from '../src/screens/GroupPage';
import { Home } from '../src/screens/Home';

vi.mock('../src/net/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/net/api')>();
  return { ...actual, createGroup: vi.fn(), getGroup: vi.fn(), createGroupRoom: vi.fn() };
});

afterEach(() => {
  vi.mocked(api.createGroup).mockReset();
  vi.mocked(api.getGroup).mockReset();
  vi.mocked(api.createGroupRoom).mockReset();
});

describe('Home: grupos', () => {
  it('cria grupo, lembra dele e vai para a página do grupo', async () => {
    const spy = vi.mocked(api.createGroup).mockResolvedValue({ slug: 'abcdefghjk', name: 'Galera' });
    render(<Home />);
    fireEvent.change(screen.getByLabelText('nome do grupo'), { target: { value: ' Galera ' } });
    fireEvent.click(screen.getByRole('button', { name: 'criar grupo' }));
    await waitFor(() => expect(window.location.hash).toBe('#/g/abcdefghjk'));
    expect(spy).toHaveBeenCalledWith('Galera');
    expect(loadGroups()[0]).toEqual({ slug: 'abcdefghjk', name: 'Galera' });
    spy.mockReset();
    window.location.hash = '';
  });

  it('nome vazio mostra erro', () => {
    render(<Home />);
    fireEvent.click(screen.getByRole('button', { name: 'criar grupo' }));
    expect(screen.getByText('Dá um nome pro grupo (até 40 letras).')).toBeTruthy();
  });

  it('lista os grupos lembrados como links', () => {
    rememberGroup({ slug: 'abcdefghjk', name: 'Galera' });
    render(<Home />);
    expect(screen.getByRole('link', { name: 'Galera' }).getAttribute('href')).toBe('#/g/abcdefghjk');
  });
});

const ROUND = (id: string, playedAt: number, over: Partial<RoundRecord> = {}): RoundRecord => ({
  id,
  roomCode: 'KXQ7',
  playedAt,
  mode: 'livre',
  level: 1,
  outcome: 'round_lost',
  errors: 1,
  campaignId: null,
  theme: { titulo: 'Lugares que você quer visitar', min: 'nunca iria', max: 'sonho de vida' },
  players: [
    { name: 'Ana', color: '#8EC5FF' },
    { name: 'Bia', color: '#FF8FAB' },
  ],
  cards: [
    { name: 'Ana', color: '#8EC5FF', value: 60, clue: 'Paris', error: false },
    { name: 'Bia', color: '#FF8FAB', value: 12, clue: 'Cracolândia', error: true },
  ],
  ...over,
});

function response(rounds: RoundRecord[], nextBefore: number | null): GroupResponse {
  return { group: { slug: 'abcdefghjk', name: 'Galera', createdAt: 0 }, rounds, stats: summarizeHistory(rounds), nextBefore };
}

describe('GroupPage', () => {
  it('mostra números, partidas e expande a fila revelada', async () => {
    const spy = vi.mocked(api.getGroup).mockResolvedValue(response([ROUND('r1', 2000)], null));
    render(<GroupPage slug="abcdefghjk" />);
    expect(await screen.findByRole('heading', { name: 'Galera' })).toBeTruthy();
    expect(screen.getByText('rodadas').parentElement!.textContent).toContain('1');
    const head = screen.getByRole('button', { name: /Lugares que você quer visitar/ });
    expect(head.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(head);
    expect(head.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Cracolândia')).toBeTruthy();
    expect(screen.getByText('Paris')).toBeTruthy();
    expect(loadGroups()[0]).toEqual({ slug: 'abcdefghjk', name: 'Galera' });
    spy.mockReset();
  });

  it('carrega mais partidas com o cursor', async () => {
    const spy = vi
      .mocked(api.getGroup)
      .mockResolvedValueOnce(response([ROUND('r2', 3000)], 3000))
      // páginas seguintes vêm sem estatísticas: a página mantém as da primeira
      .mockResolvedValueOnce({
        ...response([ROUND('r1', 1000, { theme: { titulo: 'Comidas', min: 'a', max: 'b' } })], null),
        stats: null,
      } as unknown as GroupResponse);
    render(<GroupPage slug="abcdefghjk" />);
    fireEvent.click(await screen.findByRole('button', { name: 'carregar mais' }));
    expect(await screen.findByRole('button', { name: /Comidas/ })).toBeTruthy();
    expect(spy).toHaveBeenLastCalledWith('abcdefghjk', 3000);
    expect(screen.queryByRole('button', { name: 'carregar mais' })).toBeNull();
    expect(screen.getByText('rodadas').parentElement!.textContent).toContain('1');
    spy.mockReset();
  });

  it('cria sala do grupo e vai pra ela', async () => {
    const g = vi.mocked(api.getGroup).mockResolvedValue(response([], null));
    const c = vi.mocked(api.createGroupRoom).mockResolvedValue('KXQ7');
    render(<GroupPage slug="abcdefghjk" />);
    fireEvent.click(await screen.findByRole('button', { name: 'criar sala do grupo' }));
    await waitFor(() => expect(window.location.hash).toBe('#/sala/KXQ7'));
    expect(screen.getByText('Nenhuma partida ainda. Crie uma sala do grupo e bora jogar!')).toBeTruthy();
    g.mockReset();
    c.mockReset();
    window.location.hash = '';
  });

  it('grupo inexistente', async () => {
    const spy = vi.mocked(api.getGroup).mockResolvedValue(null);
    render(<GroupPage slug="abcdefghjk" />);
    expect(await screen.findByText('grupo não encontrado')).toBeTruthy();
    spy.mockReset();
  });
});
