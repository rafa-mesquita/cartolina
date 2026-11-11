import { describe, expect, it } from 'vitest';
import { mandacaruActionSchema } from '../src/games/mandacaru/schema';

const R = { wood: 1, brick: 0, leather: 0, beans: 0, stone: 0 };

describe('Mandacaru: schema das ações', () => {
  it('aceita as ações válidas', () => {
    for (const a of [
      { type: 'start' },
      { type: 'place_house', vertex: 53 },
      { type: 'place_road', edge: 71 },
      { type: 'discard', cards: R },
      { type: 'move_carcara', hex: 18 },
      { type: 'steal', from: 'abc' },
      { type: 'play_chuva', resources: ['wood', 'stone'] },
      { type: 'offer', give: R, want: { ...R, wood: 0, stone: 1 } },
      { type: 'respond', offerId: 3, accept: true },
      { type: 'close_deal', with: 'x', source: 'proposal', id: 4 },
      { type: 'feira', give: 'wood', want: 'beans', count: 2 },
      { type: 'end_turn' },
    ]) {
      expect(mandacaruActionSchema.safeParse(a).success, JSON.stringify(a)).toBe(true);
    }
  });

  it('recusa lugar fora do tabuleiro, recurso inventado e números quebrados', () => {
    for (const a of [
      { type: 'place_house', vertex: 54 },
      { type: 'place_road', edge: -1 },
      { type: 'move_carcara', hex: 19 },
      { type: 'play_atravessador', resource: 'ouro' },
      { type: 'discard', cards: { ...R, wood: 1.5 } },
      { type: 'feira', give: 'wood', want: 'beans', count: 0 },
      { type: 'close_deal', with: 'x', source: 'offer' },
      { type: 'voar' },
    ]) {
      expect(mandacaruActionSchema.safeParse(a).success, JSON.stringify(a)).toBe(false);
    }
  });
});
