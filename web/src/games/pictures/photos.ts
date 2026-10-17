import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { PICTURES_DECK, PICTURES_THEMES, type PicturesTheme } from '@cartolina/shared';

/* Fotos provisórias: ícone do tema sobre cor, variando por foto. A foto real, quando existir, ganha. */

/** Cor-base e família de ícones (Tabler Icons, sem o prefixo `ti-`) de cada tema. */
export const PHOTO_THEMES: Record<PicturesTheme, { hue: number; icons: readonly string[] }> = {
  bichos: { hue: 28, icons: ['dog', 'cat', 'fish', 'butterfly', 'feather', 'paw'] },
  casa: { hue: 200, icons: ['armchair', 'lamp', 'cup', 'bed', 'key', 'clock'] },
  comida: { hue: 8, icons: ['pizza', 'apple', 'bread', 'ice-cream', 'coffee', 'cheese'] },
  lugares: {
    hue: 260,
    icons: ['building-lighthouse', 'building-church', 'building-bridge', 'tent', 'building-castle', 'home'],
  },
  transporte: { hue: 220, icons: ['car', 'bike', 'plane', 'bus', 'sailboat', 'train'] },
  natureza: { hue: 110, icons: ['tree', 'mountain', 'flower', 'leaf', 'sun', 'cloud-rain'] },
  gente: { hue: 330, icons: ['hand-stop', 'walk', 'run', 'swimming', 'yoga', 'hand-finger'] },
};

export interface PhotoPlaceholder {
  theme: PicturesTheme;
  /** Nome do ícone no Tabler Icons, sem o prefixo (classe `ti ti-<icon>`). */
  icon: string;
  /** Fundo: `hsl(hue sat% light%)`. */
  hue: number;
  sat: number;
  light: number;
  /** Altura do ícone em % da altura da foto. */
  size: number;
  /** Giro do ícone em graus. */
  rot: number;
  /** Deslocamento do ícone em % do próprio tamanho. */
  dx: number;
  dy: number;
  /** Legenda no canto: "tema · número". */
  label: string;
}

const hash = (s: string): number => {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
};
const byId = new Map(PICTURES_DECK.map((p) => [p.id, p]));

/** Tema da foto (id fora do baralho cai no primeiro tema). */
export function photoTheme(id: string): PicturesTheme {
  return byId.get(id)?.theme ?? PICTURES_THEMES[0];
}

/** Como desenhar a foto provisória `id` (pura: o mesmo id dá sempre o mesmo desenho). */
export function photoPlaceholder(id: string): PhotoPlaceholder {
  const theme = photoTheme(id), t = PHOTO_THEMES[theme], h = hash(id);
  return {
    theme,
    icon: t.icons[h % t.icons.length]!,
    hue: t.hue,
    sat: 30 + ((h >> 9) % 25),
    light: 62 + ((h >> 4) % 18),
    size: 46 + ((h >> 13) % 26),
    rot: ((h >> 17) % 31) - 15,
    dx: ((h >> 21) % 30) - 15,
    dy: ((h >> 25) % 20) - 10,
    label: `${theme} · ${id.slice(1)}`,
  };
}

/** Ids que têm foto real em `web/public/pictures/fotos/<id>.webp` (o script do Plano R3 preenche). */
export const PICTURES_PHOTOS_READY: ReadonlySet<string> = new Set<string>();

/** Endereço da foto real, ou `null` se ela ainda não existe (aí vale a provisória, sem pedir nada ao servidor). */
export function photoSrc(id: string): string | null {
  return PICTURES_PHOTOS_READY.has(id) ? `${import.meta.env.BASE_URL}pictures/fotos/${id}.webp` : null;
}
