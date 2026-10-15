import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from '../src/net/api';
import { loadGroups, rememberGroup } from '../src/net/identity';
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
