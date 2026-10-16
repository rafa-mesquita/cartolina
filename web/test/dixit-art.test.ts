import { dixitCardIds } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { CARD_BACK_SVG, REAL_ART, cardArtSvg, cardImageUrl } from '../src/games/dixit/art';

describe('cartas provisórias', () => {
  it('cada id gera sempre a mesma pintura', () => {
    expect(cardArtSvg('d007')).toBe(cardArtSvg('d007'));
  });

  it('o baralho todo é diferente entre si e é SVG válido (sem NaN/undefined)', () => {
    const all = dixitCardIds().map(cardArtSvg);
    expect(new Set(all).size).toBe(all.length);
    for (const svg of all) {
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).not.toMatch(/NaN|undefined/);
    }
  });

  it('verso e caminho da arte real', () => {
    expect(CARD_BACK_SVG).toContain('diquisti');
    expect(cardImageUrl('d001')).toMatch(/dixit\/cards\/d001\.webp$/);
    expect(REAL_ART).toBe(true); // as 90 cartas já estão em web/public/dixit/cards
  });
});
