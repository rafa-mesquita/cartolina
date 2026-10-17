import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CatalogEntry } from '../src/games/catalog';

// Jogo que ainda não dá pra jogar (hoje não existe nenhum): o catálogo é trocado só aqui.
const soon: CatalogEntry = {
  id: 'dixit',
  name: 'Diquisti',
  tagline: 'uma imagem, uma frase',
  players: '3 a 10 pessoas',
  rules: ['regra'],
  playable: false,
  hasHistory: false,
  mobile: false,
};

vi.mock('../src/games/catalog', () => ({ CATALOG: [soon], catalogEntry: () => soon }));

describe('jogo que ainda não dá pra jogar', () => {
  afterEach(() => {
    window.location.hash = '';
  });

  it('a capa ganha o selo "em breve"', async () => {
    const { Home } = await import('../src/screens/Home');
    render(<Home />);
    expect(screen.getByText('em breve')).toBeTruthy();
  });

  it('a aba jogar avisa que tá chegando e não oferece criar sala', async () => {
    const { GamePage } = await import('../src/screens/GamePage');
    render(<GamePage game="dixit" tab="jogar" />);
    expect(screen.getByText(/Diquisti tá chegando/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'criar sala' })).toBeNull();
  });
});
