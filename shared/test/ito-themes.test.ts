import { describe, expect, it } from 'vitest';
import { THEMES, THEME_LIMITS, cleanTheme, pickTheme } from '../src/games/ito/themes';
import { mulberry32 } from '../src/rng';

describe('THEMES', () => {
  it('tem pelo menos 100 temas válidos e únicos', () => {
    expect(THEMES.length).toBeGreaterThanOrEqual(100);
    expect(new Set(THEMES.map((t) => t.titulo)).size).toBe(THEMES.length);
    for (const t of THEMES) {
      expect(cleanTheme(t)).toEqual(t);
    }
  });
});

describe('pickTheme', () => {
  it('não repete temas já usados', () => {
    const rng = mulberry32(9);
    let used: number[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < THEMES.length; i++) {
      const res = pickTheme(rng, used);
      expect(seen.has(res.theme.titulo)).toBe(false);
      seen.add(res.theme.titulo);
      used = res.used;
    }
    expect(used).toHaveLength(THEMES.length);
  });

  it('recomeça quando todos foram usados', () => {
    const all = THEMES.map((_, i) => i);
    const res = pickTheme(mulberry32(1), all);
    expect(res.used).toHaveLength(1);
  });
});

describe('cleanTheme', () => {
  it('apara espaços', () => {
    expect(cleanTheme({ titulo: '  Pizzas ', min: ' ruim', max: 'boa ' })).toEqual({
      titulo: 'Pizzas',
      min: 'ruim',
      max: 'boa',
    });
  });

  it('rejeita campos vazios ou longos demais', () => {
    expect(cleanTheme({ titulo: '', min: 'a', max: 'b' })).toBeNull();
    expect(cleanTheme({ titulo: 'x'.repeat(THEME_LIMITS.titulo + 1), min: 'a', max: 'b' })).toBeNull();
    expect(cleanTheme({ titulo: 'ok', min: 'x'.repeat(THEME_LIMITS.extremo + 1), max: 'b' })).toBeNull();
    expect(cleanTheme({ titulo: 'ok', min: 'a', max: '  ' })).toBeNull();
  });
});
