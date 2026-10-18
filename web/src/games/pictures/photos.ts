import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { PICTURES_DECK, PICTURES_THEME_NAMES, PICTURES_THEMES, type PicturesTheme } from '@cartolina/shared';
import { PICTURES_PHOTOS_READY } from './photos-ready';

export { PICTURES_PHOTOS_READY };

/* Foto provisória (quando falta a real): ícone sobre cor, variando por foto. A foto real, quando existe, fica por cima. */

/** Ícones (Tabler Icons, sem o prefixo `ti-`) de alguns temas. Tema fora daqui usa o genérico. */
const THEME_ICONS: Partial<Record<PicturesTheme, readonly string[]>> = {
  cachorro: ['dog', 'paw'],
  caneca: ['mug', 'cup'],
  gato: ['cat', 'paw'],
  pizza: ['pizza'],
  farol: ['building-lighthouse'],
  bicicleta: ['bike'],
  arvore: ['tree', 'trees'],
  praia: ['beach', 'umbrella'],
  floresta: ['trees', 'tree'],
  'chao-da-mata': ['mushroom', 'leaf'],
  bola: ['ball-football'],
  campo: ['soccer-field'],
  calcados: ['shoe'],
  bandeirinha: ['flag'],
  aniversario: ['cake', 'gift'],
  festa: ['balloon', 'gift', 'confetti'],
  fogo: ['flame', 'campfire'],
  neve: ['snowflake'],
  'no-cabide': ['hanger'],
  janela: ['window'],
  trem: ['train'],
  onibus: ['bus'],
  sinalizacao: ['traffic-lights'],
  abajur: ['lamp', 'lamp-2'],
  esgrima: ['swords'],
  'roupa-dobrada': ['shirt'],
  escolar: ['bus'],
  pao: ['bread', 'baguette'],
  gelado: ['ice-cream', 'ice-cream-2'],
  fazenda: ['horse'],
  relogio: ['clock', 'alarm'],
};

/** Ícone genérico (tema sem ícone próprio). */
export const PHOTO_FALLBACK_ICONS: readonly string[] = ['photo'];

/** Cor-base e família de ícones de cada tema (a cor gira pelo círculo, um tema longe do vizinho). */
export const PHOTO_THEMES: Record<PicturesTheme, { hue: number; icons: readonly string[] }> = Object.fromEntries(
  PICTURES_THEMES.map((theme, i) => [theme, { hue: Math.round(i * 137.5) % 360, icons: THEME_ICONS[theme] ?? PHOTO_FALLBACK_ICONS }]),
) as Record<PicturesTheme, { hue: number; icons: readonly string[] }>;

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

/** Nome do tema da foto, pra mostrar (`alt`, legenda). */
export function photoThemeName(id: string): string {
  return PICTURES_THEME_NAMES[photoTheme(id)];
}

/** Como desenhar a foto provisória `id` (pura: o mesmo id dá sempre o mesmo desenho). */
export function photoPlaceholder(id: string): PhotoPlaceholder {
  const theme = photoTheme(id), t = PHOTO_THEMES[theme], h = hash(id);
  // O `>>` com sinal é proposital: com o bit alto ligado, os valores saem negativos (fora das faixas "de nome"),
  // e é exatamente esse o visual aprovado no protótipo. Não trocar por `>>>`.
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
    label: `${PICTURES_THEME_NAMES[theme]} · ${id.slice(1)}`,
  };
}

/** Tamanho da foto real: miniatura 480×360 (grade, galeria) ou cheia 1200×900 (zoom, revelação). */
export type PhotoSize = 'thumb' | 'full';

/** Endereço da foto real, ou `null` se ela não existe (aí vale a provisória, sem pedir nada ao servidor). */
export function photoSrc(id: string, size: PhotoSize): string | null {
  if (!PICTURES_PHOTOS_READY.has(id)) return null;
  return `${import.meta.env.BASE_URL}pictures/fotos/${id}${size === 'thumb' ? '-thumb' : ''}.webp`;
}

/** Já pedidas pelo `preloadPhoto` (cada uma uma vez só; guardar a `Image` segura o pedido até o fim). */
const preloaded = new Map<string, HTMLImageElement>();

/** Pede a foto cheia de antemão (a que vai voar na revelação), pra ela chegar pronta. */
export function preloadPhoto(id: string): void {
  const src = photoSrc(id, 'full');
  if (!src || preloaded.has(src) || typeof Image === 'undefined') return;
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  preloaded.set(src, img);
}
