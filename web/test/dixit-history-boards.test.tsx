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

  it('quadro sem ninguém no mínimo pede mais rodadas', () => {
    render(<GaleraBoards stats={EMPTY_STATS} />);
    expect(screen.getAllByText('jogue mais umas rodadas')).toHaveLength(4);
  });
});
