import { COUP_CHARACTERS, type CoupCharacter } from '@cartolina/shared';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { characterArtUrl } from '../src/games/coup/art';
import { CardBack, CardFace } from '../src/games/coup/CardFace';

describe('characterArtUrl', () => {
  it('aponta pra arte do Flow de cada personagem, relativa à base do site', () => {
    for (const c of COUP_CHARACTERS) {
      expect(characterArtUrl(c)).toBe(`${import.meta.env.BASE_URL}coup/cartas/${c}.webp`);
    }
  });

  it('recusa id desconhecido (não vira caminho de URL)', () => {
    expect(() => characterArtUrl('../../segredo' as CoupCharacter)).toThrow(RangeError);
    expect(() => characterArtUrl('king' as CoupCharacter)).toThrow(RangeError);
  });
});

describe('preloadCharacterArt', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('baixa as 5 artes uma vez só', async () => {
    const srcs: string[] = [];
    vi.stubGlobal(
      'Image',
      class {
        decoding = '';
        set src(v: string) {
          srcs.push(v);
        }
      },
    );
    vi.resetModules();
    const { preloadCharacterArt } = await import('../src/games/coup/art');
    preloadCharacterArt();
    preloadCharacterArt();
    expect(srcs).toHaveLength(5);
    expect(srcs.map((s) => s.replace(/^.*\/coup\/cartas\//, ''))).toEqual(COUP_CHARACTERS.map((c) => `${c}.webp`));
  });
});

describe('CardFace', () => {
  it('mostra a arte (alt = nome) com o nome na faixa de baixo', () => {
    const { container } = render(<CardFace card="duke" size="l" />);
    const img = screen.getByRole('img', { name: 'Duque' }) as HTMLImageElement;
    expect(img.getAttribute('src')).toMatch(/\/coup\/cartas\/duke\.webp$/);
    expect(img.getAttribute('alt')).toBe('Duque');
    expect(img.getAttribute('draggable')).toBe('false');
    expect(img.getAttribute('decoding')).toBe('async');
    const card = container.querySelector('.cp-card')!;
    expect(card.className).toBe('cp-card face l');
    expect(card.getAttribute('title')).toBeNull();
    const band = card.querySelector('em')!;
    expect(band.textContent).toBe('Duque');
    // o leitor de tela lê o alt; a faixa é só visual
    expect(band.getAttribute('aria-hidden')).toBe('true');
    expect(card.querySelector('i')).toBeNull();
  });

  it('perdida: classe dead, nome no title e alt dizendo que foi perdida', () => {
    const { container } = render(<CardFace card="contessa" size="m" dead />);
    const card = container.querySelector('.cp-card')!;
    expect(card.classList.contains('dead')).toBe(true);
    expect(card.getAttribute('title')).toBe('Condessa (perdida)');
    expect(screen.getByRole('img', { name: 'Condessa (perdida)' }).getAttribute('src')).toMatch(/\/coup\/cartas\/contessa\.webp$/);
    expect(card.querySelector('em')!.textContent).toBe('Condessa');
  });

  it('pequena (oponentes): só a arte, sem faixa; o nome vai no title e no alt', () => {
    const { container } = render(<CardFace card="captain" size="s" dead />);
    const card = container.querySelector('.cp-card')!;
    expect(card.className).toBe('cp-card face s dead');
    expect(card.querySelector('em')).toBeNull();
    expect(card.getAttribute('title')).toBe('Capitão (perdida)');
    expect(screen.getByRole('img', { name: 'Capitão (perdida)' })).toBeTruthy();
  });

  it('o verso continua sem arte de personagem (escondido do leitor de tela)', () => {
    const { container } = render(<CardBack size="s" />);
    expect(container.querySelector('.cp-card.back')!.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('img')).toBeNull();
  });
});
