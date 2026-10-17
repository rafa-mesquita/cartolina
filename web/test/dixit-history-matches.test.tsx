import { dixitMatches } from '@cartolina/shared';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MatchList } from '../src/games/dixit/history/MatchList';
import { SAMPLE } from './dixit-history-fixtures';

const heads = () => screen.getAllByRole('button').filter((b) => b.classList.contains('dxh-match-head'));
const bodyOf = (head: HTMLElement) => document.getElementById(head.getAttribute('aria-controls')!)!;

describe('partidas do Diquisti', () => {
  it('a mais recente primeiro: data, meta e rodadas, resultado', () => {
    render(<MatchList matches={dixitMatches(SAMPLE)} onOpen={vi.fn()} />);
    const [m2, m1] = heads();
    expect(m2!.textContent).toContain('não terminou');
    expect(m2!.textContent).toContain('meta 30 · 1 rodada');
    expect(m1!.textContent).toContain('Ana venceu');
    expect(m1!.textContent).toContain('meta 30 · 2 rodadas');
    expect(m1!.getAttribute('aria-expanded')).toBe('false');
  });

  it('abrir mostra o placar final e uma linha por rodada (narrador, carta, dica ou "falada na call")', () => {
    const onOpen = vi.fn();
    render(<MatchList matches={dixitMatches(SAMPLE)} onOpen={onOpen} />);
    const m1 = heads()[1]!;
    fireEvent.click(m1);
    expect(m1.getAttribute('aria-expanded')).toBe('true');
    const body = bodyOf(m1);
    expect(within(body).getByRole('heading', { name: 'placar final' })).toBeTruthy();
    expect(within(body).getByText('31')).toBeTruthy();
    expect(within(body).getByText('“luar”')).toBeTruthy();
    expect(within(body).getByText('falada na call')).toBeTruthy();
    expect(within(body).getByText('Bia narrou')).toBeTruthy();
    const cards = within(body).getAllByRole('button');
    expect(cards.map((c) => c.getAttribute('data-card-id'))).toEqual(['d001', 'd005']);
    fireEvent.click(cards[1]!);
    expect(onOpen).toHaveBeenCalledWith('partida:m1', 1);
  });

  it('partida que não terminou mostra o placar de onde parou; abrir outra fecha a primeira', () => {
    render(<MatchList matches={dixitMatches(SAMPLE)} onOpen={vi.fn()} />);
    const [m2, m1] = heads();
    fireEvent.click(m1!);
    fireEvent.click(m2!);
    expect(within(bodyOf(m2!)).getByRole('heading', { name: 'placar de onde parou' })).toBeTruthy();
    expect(m1!.getAttribute('aria-expanded')).toBe('false');
  });
});
