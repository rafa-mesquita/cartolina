import { describe, expect, it } from 'vitest';
import { CLUE_MAX, PLAYER_COLORS, cleanClue, cleanName, isPlayerColor } from '../src/players';

describe('players', () => {
  it('tem 10 cores distintas', () => {
    expect(PLAYER_COLORS).toHaveLength(10);
    expect(new Set(PLAYER_COLORS).size).toBe(10);
  });

  it('isPlayerColor aceita só cores da paleta', () => {
    expect(isPlayerColor('#8EC5FF')).toBe(true);
    expect(isPlayerColor('#000000')).toBe(false);
    expect(isPlayerColor(3)).toBe(false);
  });

  it('cleanName apara espaços e limita a 16 caracteres', () => {
    expect(cleanName('  Ana   Paula ')).toBe('Ana Paula');
    expect(cleanName('   ')).toBeNull();
    expect(cleanName('a'.repeat(17))).toBeNull();
    expect(cleanName('a'.repeat(16))).toBe('a'.repeat(16));
  });

  it('cleanClue colapsa espaços e corta no limite', () => {
    expect(cleanClue('  Paris   e   Roma')).toBe('Paris e Roma');
    expect(cleanClue('x'.repeat(100))).toHaveLength(CLUE_MAX);
    expect(cleanClue('Paris ')).toBe('Paris ');
  });
});
