/*
 * Sprites em pixel art do Tatubum, desenhados a partir de mapas de caracteres.
 * Cada letra é uma cor da paleta do sprite; 'k' é sempre o contorno escuro e '.' é transparente.
 * Arte provisória: a arte final das cartas vem do Flow (Plano T3).
 */
import type { KittensCardKind } from '@cartolina/shared';
import { critterSvg } from '../../brand/critters';

/** Sprite como mapa de caracteres: cada letra é uma cor da paleta; 'k' é o contorno e '.' é transparente. */
interface SpriteMap {
  pal: Record<string, string>;
  rows: string[];
}

export interface SpriteImage {
  url: string;
  w: number;
  h: number;
}

const K = '#2b1a10';

const SPRITES: Record<KittensCardKind, SpriteMap> = {
  tatubum: {
    pal: { b: '#a0703f', l: '#c8955a', y: '#f2c14e', o: '#e4572e', w: '#fff3c4' },
    rows: [
      '..........w.....',
      '.........yoy....',
      '........y.k.y...',
      '.........k......',
      '.....kkkkkk.....',
      '...kkbbkbbkkk...',
      '..kblbbkblbbbk..',
      '..kblbbkblbbbk..',
      '.kbblbbkblbbbbk.',
      '.kbblbbkblbbbbk.',
      '.kbblbbkblbbbbk.',
      '..kbbbbkbbbbbk..',
      '..kkbbbkbbbbkk..',
      '...kkkkkkkkkk...',
    ],
  },
  cafune: {
    pal: { p: '#ff8fab', d: '#e0567a', w: '#ffe1ea' },
    rows: [
      '................',
      '..kkk.....kkk...',
      '.kpppk...kpppk..',
      'kpwwppk.kpppppk.',
      'kpwpppppkppppdk.',
      'kpppppppppppddk.',
      'kppppppppppdddk.',
      '.kpppppppppddk..',
      '..kpppppppddk...',
      '...kpppppddk....',
      '....kpppddk.....',
      '.....kppdk......',
      '......kdk.......',
      '.......k........',
    ],
  },
  nemvem: {
    pal: { s: '#f2c79a', d: '#d9a06a', r: '#e4572e' },
    rows: [
      '.....k.k.k......',
      '....kskskskk....',
      '....kskskskdk...',
      '..k.kskskskdk...',
      '.ksk.kssssssk...',
      '.kssksssssssk...',
      '..ksssssssssk...',
      '...kssssssssk...',
      '...kssssssddk...',
      '....kssssddk....',
      '....ksssdddk....',
      '....kkkkkkkk....',
      '..rrrrrrrrrrrr..',
      '..rrrrrrrrrrrr..',
    ],
  },
  ataque: {
    pal: { w: '#d9e2ec', g: '#9aa8b8', y: '#f2c14e', r: '#c0392b' },
    rows: [
      '.............kk.',
      '............kwk.',
      '...........kwgk.',
      '..........kwgk..',
      '.........kwgk...',
      '........kwgk....',
      '...k...kwgk.....',
      '...kk.kwgk......',
      '....kkwgk.......',
      '.....kkk........',
      '....kykkk.......',
      '...kyk..kk......',
      '..krk...........',
      '.krk............',
      '.kk.............',
    ],
  },
  pular: {
    pal: { a: '#5aa0e6', d: '#2f6db0' },
    rows: [
      '................',
      '..kk....kk......',
      '..kak...kak.....',
      '..kaak..kaak....',
      '..kaaak.kaaak...',
      '..kaaaakkaaaak..',
      '..kaaaadkaaaadk.',
      '..kaaadkkaaadk..',
      '..kaadk.kaadk...',
      '..kadk..kadk....',
      '..kdk...kdk.....',
      '..kk....kk......',
    ],
  },
  favor: {
    pal: { y: '#f2c14e', d: '#c9962c', r: '#e4572e' },
    rows: [
      '....kk....kk....',
      '...krrk..krrk...',
      '....krrkkrrk....',
      '.kkkkkkkkkkkkkk.',
      '.kyyyyyrryyyyyk.',
      '.kyyyyyrryyyddk.',
      '.kkkkkkkkkkkkkk.',
      '..kyyyyrryyydk..',
      '..kyyyyrryyydk..',
      '..kyyyyrryyydk..',
      '..kyyyyrryyydk..',
      '..kddddrrddddk..',
      '..kkkkkkkkkkkk..',
    ],
  },
  embaralhar: {
    pal: { w: '#f4e9d0', v: '#8e5cc4', p: '#c9a8ee' },
    rows: [
      '.kkkkkkk........',
      '.kwwwwwk........',
      '.kwvvkkkkkk.....',
      '.kwvvkwwwwwk....',
      '.kwwwkwvvkkkkkk.',
      '.kkkkkwvvkwwwwwk',
      '.....kwwwkwppppk',
      '.....kkkkkwppppk',
      '.........kwppppk',
      '.........kwwwwwk',
      '.........kkkkkkk',
    ],
  },
  espiar: {
    pal: { w: '#f4e9d0', t: '#2f8f8f', d: '#1d5c5c', s: '#ffffff' },
    rows: [
      '................',
      '.....kkkkkk.....',
      '...kkwwwwwwkk...',
      '..kwwwwkkwwwwk..',
      '.kwwwkkttkkwwwk.',
      'kwwwkttttttkwwwk',
      'kwwwkttskdtkwwwk',
      'kwwwkttkkdtkwwwk',
      '.kwwwkttddkwwwk.',
      '..kwwwkkkkwwwk..',
      '...kkwwwwwwkk...',
      '.....kkkkkk.....',
    ],
  },
  capivara: {
    pal: { b: '#8a5a3a', l: '#b07a52', n: '#3b2412' },
    rows: [
      '....kk....kk....',
      '...kbbk..kbbk...',
      '..kbbbbkkbbbbk..',
      '.kbbbbbbbbbbbbk.',
      '.kbbkbbbbbbkbbk.',
      '.kbbbbbbbbbbbbk.',
      '.kbbbbbbbbbbbbk.',
      '.kbbbbllllbbbbk.',
      '..kbbllllllbbk..',
      '..kbblnllnlbbk..',
      '...kbllllllbk...',
      '....kkkkkkkk....',
    ],
  },
  mico: {
    pal: { o: '#f08a24', y: '#f7b955', f: '#6b3a2a', e: '#f2c14e' },
    rows: [
      '...oo.oooo.oo...',
      '..oyoooooooyoo..',
      '.oooookkkkooooo.',
      '.ooookffffkoooo.',
      'oooookfkkfkooooo',
      'ooyookffffkooyoo',
      '.ooookfkkfkoooo.',
      '.oooookffkooooo.',
      '..oooookkooooo..',
      '...oooooooooo...',
      '....oo....oo....',
    ],
  },
  quati: {
    pal: { b: '#9a6b45', w: '#e8d5b5', d: '#5a3a22' },
    rows: [
      '..kk........kk..',
      '.kbbk......kbbk.',
      '.kbbbkkkkkkbbbk.',
      '..kbbbbbbbbbbk..',
      '..kbwkbbbbkwbk..',
      '..kbwwkbbkwwbk..',
      '...kbbbbbbbbk...',
      '....kbbddbbk....',
      '.....kbwwbk.....',
      '......kwwk......',
      '.......kk.......',
    ],
  },
  tamandua: {
    pal: { g: '#8c8478', w: '#e8e0d0', d: '#3b342c' },
    rows: [
      '................',
      '.........kk.....',
      '........kggk....',
      '.......kggggkk..',
      '......kgggkgggk.',
      'kkkkkkggggggggk.',
      'kgggggggggggggk.',
      '.kkkkkggwwgggk..',
      '......kdwwddk...',
      '.......kdddk....',
      '........kkk.....',
    ],
  },
  preguica: {
    pal: { g: '#a8977a', w: '#d9ccb0', d: '#4a3a26' },
    rows: [
      '....kkkkkkkk....',
      '..kkggggggggkk..',
      '.kggggggggggggk.',
      '.kgwwwwggwwwwgk.',
      'kggwddwggwddwggk',
      'kggwdkwggwkdwggk',
      'kgggwwggggwwgggk',
      'kggggggkkggggggk',
      '.kggggggggggggk.',
      '.kgggkggggkgggk.',
      '..kggkkkkkkggk..',
      '...kkggggggkk...',
      '.....kkkkkk.....',
    ],
  },
};

/** Tatu-bola dos assentos (de lado, como a referência do Rafa); `b`/`l` mudam com a cor do jogador. */
const SEAT_TATU = [
  '.......kkkkkkk......',
  '.....kkbbbkbbbkk....',
  '....kbblbbkblbbbk...',
  '.kk.kbblbbkblbbbbk..',
  'kpk.kbblbbkblbbbbbk.',
  '.kkkkbblbbkblbbbbbk.',
  'kllkebblbbkblbbbbbkk',
  'klllbbblbbkblbbbbbbk',
  'pllkbbbbbbkbbbbbbbbk',
  '.kkkbkkbbbbbkkbbbbkk',
  '....kk.kk...kk.kk...',
];

/** Cor de destaque e frase curta de cada carta (a frase é a dica do fundo da carta e do painel de regras). */
export const CARD_STYLE: Record<KittensCardKind, { band: string; hint: string }> = {
  tatubum: { band: '#e4572e', hint: 'BUM!' },
  cafune: { band: '#ff8fab', hint: 'desarma o tatu' },
  nemvem: { band: '#e4572e', hint: 'cancela a jogada' },
  ataque: { band: '#c0392b', hint: 'o próximo joga 2' },
  pular: { band: '#3f7fd0', hint: 'pula sem comprar' },
  favor: { band: '#d9a52c', hint: 'pede uma carta' },
  embaralhar: { band: '#8e5cc4', hint: 'mistura o monte' },
  espiar: { band: '#2f8f8f', hint: 'vê as 3 de cima' },
  capivara: { band: '#3b8a4a', hint: 'par: roda' },
  mico: { band: '#3b8a4a', hint: 'par: me dá uma' },
  quati: { band: '#3b8a4a', hint: 'par: vê a de cima' },
  tamandua: { band: '#3b8a4a', hint: 'par: compra 2' },
  preguica: { band: '#3b8a4a', hint: 'par: puxa um bicho' },
};

function render(rows: readonly string[], pal: Record<string, string>): SpriteImage {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '.' || ch === ' ') return;
      const col = ch === 'k' ? K : pal[ch];
      if (!col) return;
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    });
  });
  return { url: c.toDataURL(), w, h };
}

/** Clareia (t > 0) ou escurece (t < 0) uma cor #rrggbb. */
export function shade(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(t > 0 ? v + (255 - v) * t : v * (1 + t));
  const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

const cache = new Map<string, unknown>();
function cached<T>(key: string, make: () => T): T {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key) as T;
}

/**
 * Bichinho do site em pixel art: desenha o SVG do personagem numa grade pequena (GRID×GRID), corta a
 * transparência pela metade e encaixa cada pixel na cor mais próxima da paleta do próprio desenho.
 */
const GRID = 26;
type Rgb = [number, number, number];
const hexes = (svg: string) => [...new Set((svg.match(/#[0-9a-fA-F]{6}/g) ?? []).map((h) => h.toLowerCase()))];
const rgb = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/**
 * Encaixa cada pixel (RGBA) na cor mais próxima da paleta; quase transparente vira transparente.
 * Pura (mexe só no array), pra testar sem canvas.
 */
export function snapToPalette(d: Uint8ClampedArray, palette: readonly Rgb[]): void {
  if (!palette.length) return;
  for (let i = 0; i < d.length; i += 4) {
    const alpha = d[i + 3]!;
    if (alpha < 110) {
      d[i + 3] = 0;
      continue;
    }
    // Desfaz a mistura com o transparente antes de procurar a cor mais próxima.
    const a = alpha / 255;
    const r = d[i]! / a, g = d[i + 1]! / a, b = d[i + 2]! / a;
    let best = palette[0]!;
    let dist = Infinity;
    for (const p of palette) {
      const dd = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2;
      if (dd < dist) {
        dist = dd;
        best = p;
      }
    }
    d[i] = best[0];
    d[i + 1] = best[1];
    d[i + 2] = best[2];
    d[i + 3] = 255;
  }
}

function pixelize(svgText: string): Promise<string> {
  return new Promise((resolve) => {
    // viewBox maior que o 64×64 original: chapéus, antenas e orelhas saem do círculo.
    const svg = svgText.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ').replace('viewBox="0 0 64 64"', 'viewBox="-4 -8 72 72" width="72" height="72"');
    const palette = hexes(svg).map(rgb);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = GRID;
      c.height = GRID;
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0, GRID, GRID);
      const data = g.getImageData(0, 0, GRID, GRID);
      snapToPalette(data.data, palette);
      g.putImageData(data, 0, 0);
      resolve(c.toDataURL());
    };
    img.onerror = () => resolve('');
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}

export const Sprites = {
  /** Bichinho do site (pela cor do jogador) em pixel art: Promise da URL da imagem (com cache). */
  critter(color: string): Promise<string> {
    return cached('critter:' + color, () => pixelize(critterSvg(color)));
  },
  style: CARD_STYLE,
  /** Sprite da carta do tipo `kind`: { url, w, h }. */
  card(kind: KittensCardKind): SpriteImage {
    return cached('card:' + kind, () => render(SPRITES[kind].rows, SPRITES[kind].pal));
  },
  /** Tatu do assento na cor do jogador (cinza pra quem explodiu). */
  tatu(color: string): SpriteImage {
    return cached('tatu:' + color, () =>
      render(SEAT_TATU, { b: color, l: shade(color, 0.35), p: '#e8a0a0', e: '#111' }),
    );
  },
  shade,
};
