import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GaleraBoards } from '../src/games/dixit/history/GaleraBoards';
import { ANA, BIA, CAIO, EMPTY_STATS } from './dixit-history-fixtures';

describe('quadros da galera', () => {
  it('quatro quadros com o top 3, em ordem, e o detalhe de cada um', () => {
    render(
      <GaleraBoards
        stats={{
          ...EMPTY_STATS,
          mostWins: [{ ...ANA, wins: 3 }, { ...BIA, wins: 1 }],
          bestFinders: [{ ...BIA, hits: 4, total: 5, rate: 0.8 }],
          bestFoolers: [{ ...CAIO, hits: 7, total: 5, rate: 1.4 }],
          bestTellers: [{ ...ANA, hits: 2, total: 3, rate: 2 / 3 }],
        }}
      />,
    );
    expect(screen.getByRole('heading', { name: 'a galera' })).toBeTruthy();
    const wins = within(screen.getByRole('region', { name: 'quem mais venceu' })).getAllByRole('listitem');
    expect(wins).toHaveLength(2);
    expect(within(wins[0]!).getByText('Ana')).toBeTruthy();
    expect(within(wins[0]!).getByText('3 vitórias')).toBeTruthy();
    expect(within(wins[1]!).getByText('1 vitória')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'quem mais acha' })).getByText('80% · achou 4 de 5 votos')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'quem mais engana' })).getByText('7 votos em 5 rodadas')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'melhor narrador' })).getByText('67% · 2 de 3 narrações')).toBeTruthy();
  });

  it('quadro com 3 pessoas mostra a ordem, cada uma com o personagem', () => {
    render(<GaleraBoards stats={{ ...EMPTY_STATS, mostWins: [{ ...BIA, wins: 4 }, { ...ANA, wins: 2 }, { ...CAIO, wins: 1 }] }} />);
    const wins = within(screen.getByRole('region', { name: 'quem mais venceu' })).getAllByRole('listitem');
    expect(wins.map((li) => li.querySelector('b')!.textContent)).toEqual(['Bia', 'Ana', 'Caio']);
    for (const li of wins) expect(li.querySelector('.critter')).toBeTruthy();
  });

  it('quadro vazio junto com quadros cheios: só o vazio pede mais rodadas', () => {
    render(<GaleraBoards stats={{ ...EMPTY_STATS, mostWins: [{ ...ANA, wins: 1 }], bestFoolers: [{ ...CAIO, hits: 1, total: 5, rate: 0.2 }] }} />);
    expect(screen.getAllByText('jogue mais umas rodadas')).toHaveLength(2);
    expect(within(screen.getByRole('region', { name: 'quem mais acha' })).getByText('jogue mais umas rodadas')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'melhor narrador' })).getByText('jogue mais umas rodadas')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'quem mais venceu' })).queryByText('jogue mais umas rodadas')).toBeNull();
    // singular nos dois números
    expect(within(screen.getByRole('region', { name: 'quem mais engana' })).getByText('1 voto em 5 rodadas')).toBeTruthy();
  });

  it('cada quadro tem um título de nível 3 que dá nome à região', () => {
    render(<GaleraBoards stats={EMPTY_STATS} />);
    const titles = screen.getAllByRole('heading', { level: 3 });
    expect(titles.map((h) => h.textContent)).toEqual(['quem mais venceu', 'quem mais acha', 'quem mais engana', 'melhor narrador']);
    for (const h of titles) {
      const region = h.closest('section')!;
      expect(region.getAttribute('aria-labelledby')).toBe(h.id);
      expect(region.hasAttribute('aria-label')).toBe(false);
    }
    const outer = screen.getByRole('heading', { level: 2, name: 'a galera' });
    expect(outer.closest('section')!.getAttribute('aria-labelledby')).toBe(outer.id);
  });

  it('quadro sem ninguém no mínimo pede mais rodadas', () => {
    render(<GaleraBoards stats={EMPTY_STATS} />);
    expect(screen.getAllByText('jogue mais umas rodadas')).toHaveLength(4);
  });
});
