import { z } from 'zod';

/** Ordem do rodízio: na rodada r, o assento i usa KITS[(i + r) % 6]. */
export const KITS = ['cubes', 'laces', 'sticks', 'blocks', 'icons', 'dots'] as const;
export type KitId = (typeof KITS)[number];

export const CUBE_CELLS = 16;
export const CUBE_COLORS = 8;
export const CUBES_PER_COLOR = 3;
export const LACE_MAX_POINTS = 60;
export const STICKS = 4;
export const STONES = 4;
/** Ordem fixa das peças do kit de blocos: a obra guarda uma posição por forma, nessa ordem. */
export const BLOCK_SHAPES = ['cube', 'brick', 'plank', 'pillar', 'roof', 'arch'] as const;
export const ICON_COUNT = 19;
export const ICONS_MIN = 2;
export const ICONS_MAX = 5;
export const DOTS_MAX = 5;
export const DOT_LINES_MAX = 10;

/** Posição relativa à folha 4:3 (0–1). */
const unit = z.number().min(0).max(1);
/** Peça solta: fora de 0–1 ela está guardada de lado e não aparece na obra. */
const loose = z.number().min(-0.5).max(1.5);
/** Giro em graus. */
const degrees = z.number().min(-3600).max(3600);
const point = z.tuple([unit, unit]);
const placed = z.object({ x: loose, y: loose, rot: degrees });

const cubesWork = z.object({
  kit: z.literal('cubes'),
  /** Linha por linha; cada casa é uma cor (0–7) ou vazia. */
  cells: z.array(z.number().int().min(0).max(CUBE_COLORS - 1).nullable()).length(CUBE_CELLS),
});

const lacesWork = z.object({
  kit: z.literal('laces'),
  long: z.array(point).min(2).max(LACE_MAX_POINTS),
  short: z.array(point).min(2).max(LACE_MAX_POINTS),
});

const sticksWork = z.object({
  kit: z.literal('sticks'),
  sticks: z.array(placed).length(STICKS),
  stones: z.array(placed).length(STONES),
});

const blocksWork = z.object({
  kit: z.literal('blocks'),
  /** Uma por forma, na ordem de BLOCK_SHAPES. `y` é a altura que a montagem calculou (quem mostra não reempilha). */
  pieces: z
    .array(
      z.object({
        x: z.number().min(-6).max(6),
        y: z.number().min(0).max(20),
        z: z.number().min(-6).max(6),
        rot: degrees,
        lay: z.boolean(),
      }),
    )
    .length(BLOCK_SHAPES.length),
  /** Câmera em radianos: θ gira em volta da mesa, φ inclina (0 = de cima). Faz parte da obra. */
  camera: z.object({ theta: z.number().min(-100).max(100), phi: z.number().min(0).max(1.6) }),
});

const iconsWork = z.object({
  kit: z.literal('icons'),
  /** Cartas escolhidas, na ordem em que ficam lado a lado. */
  ids: z.array(z.number().int().min(0).max(ICON_COUNT - 1)).max(ICONS_MAX),
});

const dotIndex = z.number().int().min(0).max(DOTS_MAX - 1);
const dotsWork = z.object({
  kit: z.literal('dots'),
  points: z.array(point).max(DOTS_MAX),
  lines: z.array(z.tuple([dotIndex, dotIndex])).max(DOT_LINES_MAX),
});

export const workSchema = z.discriminatedUnion('kit', [cubesWork, lacesWork, sticksWork, blocksWork, iconsWork, dotsWork]);
export type Work = z.infer<typeof workSchema>;
export type WorkOf<K extends KitId> = Extract<Work, { kit: K }>;

/** Falha a compilação se um kit ficar sem schema (ou sobrar schema sem kit). */
type Assert<T extends true> = T;
export type WorkKitsMatch = Assert<Work['kit'] extends KitId ? (KitId extends Work['kit'] ? true : false) : false>;

/** Regra da obra que o schema não pega (o formato já veio validado). `null` = obra válida. */
export function workError(work: Work): 'bad_work' | null {
  switch (work.kit) {
    case 'cubes': {
      const count = new Map<number, number>();
      for (const c of work.cells) if (c !== null) count.set(c, (count.get(c) ?? 0) + 1);
      return [...count.values()].some((n) => n > CUBES_PER_COLOR) ? 'bad_work' : null;
    }
    case 'icons':
      return new Set(work.ids).size === work.ids.length ? null : 'bad_work';
    case 'dots': {
      const seen = new Set<string>();
      for (const [a, b] of work.lines) {
        if (a === b || a >= work.points.length || b >= work.points.length) return 'bad_work';
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        if (seen.has(key)) return 'bad_work';
        seen.add(key);
      }
      return null;
    }
    default:
      return null;
  }
}

/**
 * Obra em branco = não mostra nada, vale como "nunca mandou rascunho" (fica fora da galeria e sem ponto de artista).
 * Palito/pedra com x ou y fora de 0–1 está guardado de lado. Laços e blocos nunca são em branco: a corda e a mesa sempre aparecem.
 */
export function isBlankWork(work: Work): boolean {
  switch (work.kit) {
    case 'cubes':
      return work.cells.every((c) => c === null);
    case 'icons':
      return work.ids.length === 0;
    case 'dots':
      return work.points.length === 0;
    case 'sticks':
      return ![...work.sticks, ...work.stones].some((q) => q.x >= 0 && q.x <= 1 && q.y >= 0 && q.y <= 1);
    default:
      return false;
  }
}

/** Por que essa obra ainda não pode ficar "pronta" (`null` = pode). Quando o tempo acaba, vale como está. */
export function readyError(work: Work | undefined): 'empty_work' | 'icons_too_few' | null {
  if (work === undefined || isBlankWork(work)) return 'empty_work';
  if (work.kit === 'icons' && work.ids.length < ICONS_MIN) return 'icons_too_few';
  return null;
}
