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

  it('ao recomeçar, exclui o último usado mesmo nos extremos do sorteio', () => {
    const last = THEMES.length - 1;
    const endsWith = (k: number) => [...THEMES.map((_, i) => i).filter((i) => i !== k), k];
    expect(pickTheme(() => 0, endsWith(0)).used[0]).not.toBe(0);
    expect(pickTheme(() => 0.999999, endsWith(last)).used[0]).not.toBe(last);
  });

  it('ao recomeçar, nunca repete o último tema usado', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const k = seed % THEMES.length;
      const all = THEMES.map((_, i) => i).filter((i) => i !== k);
      all.push(k);
      const res = pickTheme(mulberry32(seed), all);
      expect(res.theme).not.toBe(THEMES[k]);
      expect(res.used).toHaveLength(1);
      expect(res.used[0]).not.toBe(k);
    }
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

  it('colapsa espaços internos e quebras de linha', () => {
    expect(cleanTheme({ titulo: 'a\n\n b', min: 'x', max: 'y' })).toEqual({ titulo: 'a b', min: 'x', max: 'y' });
  });

  it('mede o tamanho em code points, não em unidades UTF-16', () => {
    const titulo = '😀'.repeat(THEME_LIMITS.titulo);
    expect(cleanTheme({ titulo, min: 'x', max: 'y' })).toEqual({ titulo, min: 'x', max: 'y' });
    expect(cleanTheme({ titulo: titulo + '😀', min: 'x', max: 'y' })).toBeNull();
  });

  it('rejeita campos vazios ou longos demais', () => {
    expect(cleanTheme({ titulo: '', min: 'a', max: 'b' })).toBeNull();
    expect(cleanTheme({ titulo: 'x'.repeat(THEME_LIMITS.titulo + 1), min: 'a', max: 'b' })).toBeNull();
    expect(cleanTheme({ titulo: 'ok', min: 'x'.repeat(THEME_LIMITS.extremo + 1), max: 'b' })).toBeNull();
    expect(cleanTheme({ titulo: 'ok', min: 'a', max: '  ' })).toBeNull();
  });
});
