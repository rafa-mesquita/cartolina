import { summarizeDixitHistory } from '@cartolina/shared';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FamousCards } from '../src/games/dixit/history/FamousCards';
import { famousItems } from '../src/games/dixit/history/groups';
import { EMPTY_STATS, SAMPLE } from './dixit-history-fixtures';

const cardsIn = (region: HTMLElement) => within(region).getAllByRole('button').map((b) => b.getAttribute('data-card-id'));

describe('cartas famosas', () => {
  it('quatro faixas com as pinturas, os selos, as dicas e quem narrou', () => {
    render(<FamousCards items={famousItems(summarizeDixitHistory(SAMPLE))} onOpen={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'cartas famosas' })).toBeTruthy();
    const fav = screen.getByRole('region', { name: 'favoritas dos narradores' });
    expect(cardsIn(fav)).toEqual(['d001', 'd005', 'd009']);
    expect(within(fav).getAllByText('1×')).toHaveLength(3);
    const tricky = screen.getByRole('region', { name: 'as que mais enganaram' });
    expect(cardsIn(tricky)).toEqual(['d002', 'd006', 'd007']);
    expect(within(tricky).getAllByText('1 voto')).toHaveLength(3);
    const wall = screen.getByRole('region', { name: 'mural de dicas' });
    expect(cardsIn(wall)).toEqual(['d009', 'd001']);
    expect(within(wall).getByText('“luar”')).toBeTruthy();
    expect(within(wall).getByText('Ana')).toBeTruthy();
    const impossible = screen.getByRole('region', { name: 'cartas impossíveis' });
    expect(cardsIn(impossible)).toEqual(['d005']);
    expect(within(impossible).getByText('falada na call')).toBeTruthy();
    expect(within(impossible).getByText('Bia')).toBeTruthy();
  });

  it('dica com HTML aparece como texto', () => {
    render(<FamousCards items={famousItems(summarizeDixitHistory(SAMPLE))} onOpen={vi.fn()} />);
    const wall = screen.getByRole('region', { name: 'mural de dicas' });
    expect(within(wall).getByText('“<b>oi</b>”')).toBeTruthy();
    expect(wall.querySelector('b')).toBeNull();
  });

  it('clicar numa carta abre a carta ampliada daquela faixa', () => {
    const onOpen = vi.fn();
    render(<FamousCards items={famousItems(summarizeDixitHistory(SAMPLE))} onOpen={onOpen} />);
    fireEvent.click(within(screen.getByRole('region', { name: 'mural de dicas' })).getAllByRole('button')[1]!);
    expect(onOpen).toHaveBeenCalledWith('mural', 1);
  });

  it('faixa vazia avisa', () => {
    render(<FamousCards items={famousItems(EMPTY_STATS)} onOpen={vi.fn()} />);
    expect(screen.getAllByText('ainda nenhuma carta aqui')).toHaveLength(4);
  });
});
