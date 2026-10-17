import { dixitMatches } from '@cartolina/shared';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MatchList } from '../src/games/dixit/history/MatchList';
import { formatDate } from '../src/games/dixit/history/format';
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

describe('partidas do Diquisti: detalhes', () => {
  it('numera as rodadas pela posição na partida, não pelo round gravado', () => {
    const matches = dixitMatches(SAMPLE);
    // a 2ª rodada da m1 foi gravada como round 3
    expect(matches.find((m) => m.id === 'm1')!.rounds.map((r) => r.round)).toEqual([1, 3]);
    render(<MatchList matches={matches} onOpen={vi.fn()} />);
    const m1 = heads()[1]!;
    fireEvent.click(m1);
    expect([...bodyOf(m1).querySelectorAll('.dxh-round .n')].map((n) => n.textContent)).toEqual(['1', '2']);
  });

  it('clicar de novo fecha a partida', () => {
    render(<MatchList matches={dixitMatches(SAMPLE)} onOpen={vi.fn()} />);
    const m1 = heads()[1]!;
    fireEvent.click(m1);
    fireEvent.click(m1);
    expect(m1.getAttribute('aria-expanded')).toBe('false');
    expect(bodyOf(m1).hidden).toBe(true);
    expect(within(bodyOf(m1)).queryByRole('heading', { hidden: true })).toBeNull();
  });

  it('o corpo existe fechado (o aria-controls aponta pra ele), escondido e sem conteúdo', () => {
    render(<MatchList matches={dixitMatches(SAMPLE)} onOpen={vi.fn()} />);
    for (const head of heads()) {
      const body = bodyOf(head);
      expect(body).toBeTruthy();
      expect(body.hidden).toBe(true);
      expect(body.childElementCount).toBe(0);
    }
    fireEvent.click(heads()[0]!);
    expect(bodyOf(heads()[0]!).hidden).toBe(false);
  });

  it('o cabeçalho mostra os personagens e diz os nomes dos jogadores pro leitor de tela', () => {
    render(<MatchList matches={dixitMatches(SAMPLE)} onOpen={vi.fn()} />);
    const m1 = heads()[1]!;
    expect(m1.querySelectorAll('.dxh-faces .critter')).toHaveLength(3);
    expect(screen.getByRole('button', { name: `${formatDate(1_000)} · meta 30 · 2 rodadas · Ana venceu · Ana, Bia e Caio` })).toBe(m1);
  });

  it('"não terminou" usa a classe unfinished', () => {
    render(<MatchList matches={dixitMatches(SAMPLE)} onOpen={vi.fn()} />);
    const [m2, m1] = heads();
    expect(m2!.querySelector('.dxh-outcome')!.classList.contains('unfinished')).toBe(true);
    expect(m2!.querySelector('.dxh-outcome')!.classList.contains('open')).toBe(false);
    expect(m1!.querySelector('.dxh-outcome')!.classList.contains('unfinished')).toBe(false);
  });

  it('dica com HTML aparece como texto', () => {
    render(<MatchList matches={dixitMatches(SAMPLE)} onOpen={vi.fn()} />);
    const m2 = heads()[0]!;
    fireEvent.click(m2);
    const cap = within(bodyOf(m2)).getByText('“<b>oi</b>”');
    expect(cap.childElementCount).toBe(0);
  });
});
