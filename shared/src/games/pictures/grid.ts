import { shuffle, type Rng } from '../../rng';
import { PICTURES_DECK, type PicturesPhoto } from './photos';

export const GRID_THEMES = 4;
export const GRID_PER_THEME = 4;

/** 4 temas sorteados × 4 fotos de cada, embaralhadas: a grade sempre tem fotos parecidas entre si. */
export function drawGrid(rng: Rng, deck: readonly PicturesPhoto[] = PICTURES_DECK): string[] {
  const byTheme = new Map<string, string[]>();
  for (const p of deck) byTheme.set(p.theme, [...(byTheme.get(p.theme) ?? []), p.id]);
  const themes = shuffle(
    rng,
    [...byTheme.keys()].filter((t) => byTheme.get(t)!.length >= GRID_PER_THEME),
  ).slice(0, GRID_THEMES);
  if (themes.length < GRID_THEMES) throw new Error('drawGrid: o baralho precisa de 4 temas com pelo menos 4 fotos');
  const picked = themes.flatMap((t) => shuffle(rng, byTheme.get(t)!).slice(0, GRID_PER_THEME));
  return shuffle(rng, picked);
}
