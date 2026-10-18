import { randomInt, shuffle, type Rng } from '../../rng';
import { PICTURES_DECK, type PicturesPhoto } from './photos';
import { COORDS, type Coord } from './types';

export const GRID_THEMES = 8;
export const GRID_PER_THEME = 2;

/** 8 temas sorteados × 2 fotos de cada, embaralhadas: a grade sempre tem duplas parecidas (16 fotos). */
export function drawGrid(rng: Rng, deck: readonly PicturesPhoto[] = PICTURES_DECK): string[] {
  const byTheme = new Map<string, string[]>();
  for (const p of deck) byTheme.set(p.theme, [...(byTheme.get(p.theme) ?? []), p.id]);
  const themes = shuffle(
    rng,
    [...byTheme.keys()].filter((t) => byTheme.get(t)!.length >= GRID_PER_THEME),
  ).slice(0, GRID_THEMES);
  if (themes.length < GRID_THEMES) {
    throw new Error(`drawGrid: o baralho precisa de ${GRID_THEMES} temas com pelo menos ${GRID_PER_THEME} fotos`);
  }
  const picked = themes.flatMap((t) => shuffle(rng, byTheme.get(t)!).slice(0, GRID_PER_THEME));
  return shuffle(rng, picked);
}

/**
 * Troca das fotos usadas (decisão do usuário, 2026-10-17): cada coordenada de `coords` (repetidas contam uma vez)
 * recebe uma foto aleatória do baralho, de qualquer tema (as duplas não se mantêm). A foto nova nunca é uma de `shown`
 * (as que já apareceram na partida); se acabarem as nunca usadas, vale qualquer uma fora da grade de agora.
 * Devolve a grade nova e `shown` com as que entraram.
 */
export function refreshGrid(
  rng: Rng,
  grid: readonly string[],
  shown: readonly string[],
  coords: readonly Coord[],
  deck: readonly PicturesPhoto[] = PICTURES_DECK,
): { grid: string[]; shown: string[] } {
  const next = [...grid];
  const seen = new Set(shown);
  const added: string[] = [];
  // Na ordem da grade (não na dos jogadores): o sorteio não depende de quem tirou qual ficha.
  for (const c of COORDS.filter((k) => coords.includes(k))) {
    const fresh = deck.filter((p) => !seen.has(p.id) && !next.includes(p.id));
    const pool = fresh.length > 0 ? fresh : deck.filter((p) => !next.includes(p.id));
    if (pool.length === 0) continue; // baralho do tamanho da grade: não tem o que trocar
    const id = pool[randomInt(rng, pool.length)]!.id;
    next[COORDS.indexOf(c)] = id;
    if (!seen.has(id)) {
      seen.add(id);
      added.push(id);
    }
  }
  return { grid: next, shown: [...shown, ...added] };
}
