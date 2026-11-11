/**
 * Artes do Mandacaru geradas no Google Flow (xilogravura de cordel colorida à mão), em `web/public/mandacaru/`.
 * Todas relativas à base do site (`import.meta.env.BASE_URL`), pra funcionar no GitHub Pages.
 *
 * `ResIcon` e `CordelIcon` usam a imagem quando `RES_ART` / `CORDEL_ART` têm a entrada; sem entrada, caem no desenho SVG.
 */
import type { CordelKind, Resource, Terrain } from '@cartolina/shared';
import type { CSSProperties } from 'react';

const art = (file: string) => `${import.meta.env.BASE_URL}mandacaru/${file}`;

/** Pintura armorial da caatinga (16:9, meio vazio): fundo da mesa e do lobby. */
export const FUNDO_ART = art('fundo.webp');
/**
 * Estilo da raiz `.mandacaru` (mesa e lobby): a pintura entra pela variável `--mc-fundo` do CSS.
 * Endereço ABSOLUTO: um `url()` relativo dentro de variável do CSS resolve pela pasta do `.css` (no site publicado,
 * `assets/`), não pela página — o fundo dava 404 no GitHub Pages, onde `BASE_URL` é relativa.
 */
const absolute = (url: string) => (typeof document === 'undefined' ? url : new URL(url, document.baseURI).href);
export const FUNDO_STYLE = { '--mc-fundo': `url("${absolute(FUNDO_ART)}")` } as CSSProperties;

/** Cada terreno (quadrado 512×512), recortado no hexágono. */
export const TERRAIN_ART: Record<Terrain, string> = {
  forest: art('terrenos/forest.webp'),
  hills: art('terrenos/hills.webp'),
  pasture: art('terrenos/pasture.webp'),
  fields: art('terrenos/fields.webp'),
  mountains: art('terrenos/mountains.webp'),
  desert: art('terrenos/desert.webp'),
};

/** Peças sem fundo: Carcará, casa, vila e a barraca da feira. */
export const PIECE_ART = {
  carcara: art('pecas/carcara.webp'),
  casa: art('pecas/casa.webp'),
  vila: art('pecas/vila.webp'),
  feira: art('pecas/feira.webp'),
} as const;

/** Proporção (largura / altura) das peças, pra desenhar sem esperar a imagem carregar. */
export const PIECE_RATIO = { carcara: 379 / 384, casa: 384 / 292, vila: 384 / 312, feira: 384 / 382 } as const;

/** Recursos (sem fundo, recortados rente; não são quadrados: desenhe com `object-fit: contain`), `recursos/<id>.webp`. */
export const RES_ART: Partial<Record<Resource, string>> = {
  wood: art('recursos/wood.webp'),
  brick: art('recursos/brick.webp'),
  leather: art('recursos/leather.webp'),
  beans: art('recursos/beans.webp'),
  stone: art('recursos/stone.webp'),
};

/** Chave da arte de um cordel: o tipo, ou `point-1..5` pros Pontos (na ordem de `POINT_NAMES`). */
export type CordelArtId = Exclude<CordelKind, 'point'> | `point-${1 | 2 | 3 | 4 | 5}`;

/**
 * Cordéis (quadrados, cena cheia como capa de folheto), `cordeis/<id>.webp`. Os Pontos seguem `POINT_NAMES`:
 * point-1 Igrejinha, point-2 Açude, point-3 Cisterna, point-4 Escola, point-5 Casa de Farinha.
 */
export const CORDEL_ART: Partial<Record<CordelArtId, string>> = {
  vaqueiro: art('cordeis/vaqueiro.webp'),
  mutirao: art('cordeis/mutirao.webp'),
  chuva: art('cordeis/chuva.webp'),
  atravessador: art('cordeis/atravessador.webp'),
  'point-1': art('cordeis/point-1.webp'),
  'point-2': art('cordeis/point-2.webp'),
  'point-3': art('cordeis/point-3.webp'),
  'point-4': art('cordeis/point-4.webp'),
  'point-5': art('cordeis/point-5.webp'),
};

/** A arte de um cordel, se já existe. `point` = índice do Ponto em `POINT_NAMES` (0 = Igrejinha). */
export function cordelArtUrl(kind: CordelKind, point = 0): string | undefined {
  if (kind !== 'point') return CORDEL_ART[kind];
  const n = Math.min(5, Math.max(1, Math.floor(point) + 1)) as 1 | 2 | 3 | 4 | 5;
  return CORDEL_ART[`point-${n}`];
}

/** Todas as artes conhecidas (pra pré-carregar). */
export function allArtUrls(): string[] {
  return [FUNDO_ART, ...Object.values(TERRAIN_ART), ...Object.values(PIECE_ART), ...Object.values(RES_ART), ...Object.values(CORDEL_ART)].filter(
    (u): u is string => typeof u === 'string',
  );
}

let preloaded = false;
/** Baixa as artes uma vez (quando o lobby ou a mesa monta), pra o tabuleiro não aparecer sem os terrenos. */
export function preloadMandacaruArt(): void {
  if (preloaded || typeof Image === 'undefined') return;
  preloaded = true;
  for (const u of allArtUrls()) {
    const img = new Image();
    img.decoding = 'async';
    img.src = u;
  }
}
