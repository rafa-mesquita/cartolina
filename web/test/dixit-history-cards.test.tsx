import { dixitMatches, summarizeDixitHistory } from '@cartolina/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HistoryCard } from '../src/games/dixit/history/HistoryCard';
import { famousItems, matchGroupKey, matchItems } from '../src/games/dixit/history/groups';
import { ANA, BIA, SAMPLE } from './dixit-history-fixtures';

describe('itens de carta do histórico', () => {
  it('faixas de cartas famosas: selo, dica, quem narrou e o rótulo da carta ampliada', () => {
    const items = famousItems(summarizeDixitHistory(SAMPLE));
    expect(items.favoritas.map((i) => i.card)).toEqual(['d001', 'd005', 'd009']);
    expect(items.favoritas[0]).toEqual({ card: 'd001', badge: '1×', label: 'favorita dos narradores · escolhida 1 vez' });
    expect(items.enganaram.map((i) => i.card)).toEqual(['d002', 'd006', 'd007']);
    expect(items.enganaram[0]).toEqual({ card: 'd002', badge: '1 voto', label: 'enganou 1 voto' });
    expect(items.mural.map((i) => i.card)).toEqual(['d009', 'd001']);
    expect(items.mural[1]).toEqual({ card: 'd001', clue: 'luar', teller: ANA, label: '“luar” · Ana narrou' });
    expect(items.impossiveis).toEqual([{ card: 'd005', clue: '', teller: BIA, label: 'ninguém achou · falada na call · Bia narrou' }]);
  });

  it('partida: uma carta por rodada, numerada pela ordem', () => {
    const m1 = dixitMatches(SAMPLE).find((m) => m.id === 'm1')!;
    expect(matchItems(m1).map((i) => i.label)).toEqual(['rodada 1 · Ana narrou · “luar”', 'rodada 2 · Bia narrou · falada na call']);
    expect(matchGroupKey('m1')).toBe('partida:m1');
  });
});

describe('HistoryCard', () => {
  it('mostra a carta com selo; clicar abre a carta ampliada daquela faixa', () => {
    const onOpen = vi.fn();
    render(<HistoryCard card="d007" group="mural" index={2} label="“luar” · Ana narrou" badge="3×" onOpen={onOpen} />);
    const btn = screen.getByRole('button', { name: '“luar” · Ana narrou' });
    expect(btn.dataset.cardId).toBe('d007');
    expect(btn.dataset.group).toBe('mural');
    expect(btn.dataset.index).toBe('2');
    expect(screen.getByText('3×')).toBeTruthy();
    fireEvent.click(btn);
    expect(onOpen).toHaveBeenCalledWith('mural', 2);
  });
});
