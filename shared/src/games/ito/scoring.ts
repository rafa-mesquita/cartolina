import { CAMPAIGN_LEVELS, type ItoCard, type ItoMode, type ItoOutcome, type RevealEntry } from './types';

export function computeReveal(row: string[], cards: Record<string, ItoCard>): RevealEntry[] {
  let max = 0;
  return row.map((cardId) => {
    const card = cards[cardId]!;
    const error = card.value < max;
    max = Math.max(max, card.value);
    return { cardId, owner: card.owner, value: card.value, error };
  });
}

export function resolveOutcome(
  mode: ItoMode,
  level: number,
  livesBefore: number,
  errors: number,
): { lives: number; outcome: ItoOutcome } {
  if (mode === 'livre') {
    return { lives: livesBefore, outcome: errors === 0 ? 'round_won' : 'round_lost' };
  }
  const lives = Math.max(0, livesBefore - errors);
  if (lives === 0) return { lives, outcome: 'lost' };
  if (level >= CAMPAIGN_LEVELS) return { lives, outcome: 'won' };
  return { lives, outcome: 'level_cleared' };
}
