import type { PlayerColor } from '@cartolina/shared';

/**
 * Personagens da cartolina~: um por cor de jogador. Desenhos em SVG (viewBox 64×64),
 * contorno de tinta e preenchimento chapado, no estilo da identidade. Gerados como
 * string para servir tanto ao React quanto ao motor imperativo da mesa.
 */

const INK = '#3B2F2F';
const PAPER = '#F6EEDD';
const S = `stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"`;

const eyes = (y = 32, a = 24, b = 40, r = 2.7) =>
  `<circle cx="${a}" cy="${y}" r="${r}" fill="${INK}"/><circle cx="${b}" cy="${y}" r="${r}" fill="${INK}"/>`;
const blush = (y = 39) =>
  `<ellipse cx="19" cy="${y}" rx="3.6" ry="2.1" fill="#E0567A" opacity=".35"/>` +
  `<ellipse cx="45" cy="${y}" rx="3.6" ry="2.1" fill="#E0567A" opacity=".35"/>`;
const smile = (y = 41, w = 4) =>
  `<path d="M${32 - w} ${y} Q32 ${y + 3.5} ${32 + w} ${y}" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`;
const base = (c: string, cy = 35, r = 23) => `<circle cx="32" cy="${cy}" r="${r}" fill="${c}" ${S}/>`;

interface Critter {
  /** Nome do personagem: só para leitores de tela (não aparece na interface). */
  name: string;
  draw: (color: string) => string;
}

export const CRITTERS: Record<PlayerColor, Critter> = {
  '#8EC5FF': {
    name: 'cavaleiro',
    draw: (c) =>
      `<path d="M32 11 C26 1 40 -3 45 6 C39 4 35 7 32 11 Z" fill="#FF8FAB" ${S}/>${base(c, 34, 24)}` +
      `<path d="M32 11 L32 25" ${S}/><rect x="13" y="27" width="38" height="10" rx="5" fill="${INK}"/>` +
      `<circle cx="24" cy="32" r="2" fill="${PAPER}"/><circle cx="40" cy="32" r="2" fill="${PAPER}"/>` +
      `<path d="M26 45 L26 50 M32 45 L32 51 M38 45 L38 50" ${S} stroke-linecap="round"/>`,
  },
  '#FF8FAB': {
    name: 'porquinho',
    draw: (c) =>
      `<path d="M13 20 L19 7 L27 18 Z" fill="${c}" ${S}/><path d="M51 20 L45 7 L37 18 Z" fill="${c}" ${S}/>${base(c)}${eyes(31)}` +
      `<ellipse cx="32" cy="41" rx="8.5" ry="6.2" fill="#FFC2D3" ${S}/>` +
      `<ellipse cx="29" cy="41" rx="1.5" ry="2.2" fill="${INK}"/><ellipse cx="35" cy="41" rx="1.5" ry="2.2" fill="${INK}"/>`,
  },
  '#7EDDB5': {
    name: 'dinossauro',
    draw: (c) =>
      `<path d="M19 15 L23 4 L28 13 Z M28 12 L33 1 L38 12 Z M38 13 L44 5 L46 16 Z" fill="#C9E27A" ${S}/>${base(c, 36)}${eyes(31)}${blush(38)}` +
      `<path d="M21 41 Q32 50 43 41" fill="none" stroke="${INK}" stroke-width="2.3" stroke-linecap="round"/>` +
      `<path d="M29.5 44.6 L32 48.4 L34.5 44.7" fill="${PAPER}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`,
  },
  '#C7B3FF': {
    name: 'polvo',
    draw: (c) =>
      `<path d="M10 37 A22 22 0 0 1 54 37 L54 46 Q51 53 47 46 Q43 53 39.5 46 Q36 53 32 46 Q28 53 24.5 46 Q21 53 17 46 Q13 53 10 46 Z" fill="${c}" ${S}/>` +
      `${eyes(31, 25, 39, 3.1)}${blush(37)}${smile(38, 3.5)}`,
  },
  '#FFD07A': {
    name: 'pintinho',
    draw: (c) =>
      `<path d="M27 14 C26 6 31 5 32 11 C33 4 39 6 37 14 Z" fill="${c}" ${S}/>${base(c)}${eyes(30)}${blush(38)}` +
      `<path d="M27 37 L37 37 L32 44 Z" fill="#FFB38A" ${S}/>`,
  },
  '#FFB38A': {
    name: 'raposa',
    draw: (c) =>
      `<path d="M11 24 L15 4 L28 15 Z" fill="${c}" ${S}/><path d="M53 24 L49 4 L36 15 Z" fill="${c}" ${S}/>` +
      `<path d="M16 12 L18 7 L22 13 Z M48 12 L46 7 L42 13 Z" fill="${PAPER}"/>${base(c, 36)}` +
      `<path d="M15 38 Q32 60 49 38 Q40 44 32 42 Q24 44 15 38 Z" fill="${PAPER}" ${S}/>${eyes(31)}` +
      `<ellipse cx="32" cy="43" rx="3.2" ry="2.3" fill="${INK}"/>`,
  },
  '#9EE6F0': {
    name: 'robô',
    draw: (c) =>
      `<path d="M32 12 L32 5" ${S}/><circle cx="32" cy="4" r="3.6" fill="#FF8FAB" ${S}/>` +
      `<rect x="5" y="28" width="6" height="11" rx="2" fill="${c}" ${S}/><rect x="53" y="28" width="6" height="11" rx="2" fill="${c}" ${S}/>` +
      `<rect x="10" y="12" width="44" height="42" rx="12" fill="${c}" ${S}/>` +
      `<rect x="18" y="25" width="10" height="10" rx="3" fill="${PAPER}" stroke="${INK}" stroke-width="2"/>` +
      `<rect x="36" y="25" width="10" height="10" rx="3" fill="${PAPER}" stroke="${INK}" stroke-width="2"/>` +
      `<rect x="21" y="28" width="4" height="4" rx="1" fill="${INK}"/><rect x="39" y="28" width="4" height="4" rx="1" fill="${INK}"/>` +
      `<rect x="22" y="41" width="20" height="7" rx="3" fill="${PAPER}" stroke="${INK}" stroke-width="2"/>` +
      `<path d="M27 41 L27 48 M32 41 L32 48 M37 41 L37 48" stroke="${INK}" stroke-width="1.6"/>`,
  },
  '#E6B8E0': {
    name: 'gatinho',
    draw: (c) =>
      `<path d="M11 25 L13 5 L28 15 Z" fill="${c}" ${S}/><path d="M53 25 L51 5 L36 15 Z" fill="${c}" ${S}/>` +
      `<path d="M15 13 L16 9 L21 14 Z M49 13 L48 9 L43 14 Z" fill="#FF8FAB"/>${base(c, 36)}${eyes(32)}` +
      `<path d="M30 38.5 L34 38.5 L32 41 Z" fill="#FF8FAB" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>` +
      `<path d="M27 43 Q29.5 46 32 43 Q34.5 46 37 43" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>` +
      `<path d="M10 37 L21 39 M10 43 L21 42 M54 37 L43 39 M54 43 L43 42" stroke="${INK}" stroke-width="1.7" stroke-linecap="round"/>`,
  },
  '#C9E27A': {
    name: 'sapo',
    draw: (c) =>
      `${base(c, 37, 22)}<circle cx="21" cy="19" r="9" fill="${c}" ${S}/><circle cx="43" cy="19" r="9" fill="${c}" ${S}/>` +
      `<circle cx="21" cy="19" r="5" fill="${PAPER}"/><circle cx="43" cy="19" r="5" fill="${PAPER}"/>` +
      `<circle cx="22" cy="20" r="2.6" fill="${INK}"/><circle cx="44" cy="20" r="2.6" fill="${INK}"/>${blush(41)}` +
      `<path d="M19 39 Q32 50 45 39" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`,
  },
  '#D9C2A0': {
    name: 'urso',
    draw: (c) =>
      `<circle cx="14" cy="16" r="8" fill="${c}" ${S}/><circle cx="50" cy="16" r="8" fill="${c}" ${S}/>` +
      `<circle cx="14" cy="16" r="3.6" fill="#B8996F"/><circle cx="50" cy="16" r="3.6" fill="#B8996F"/>${base(c, 36)}${eyes(31)}` +
      `<ellipse cx="32" cy="43" rx="9" ry="7" fill="${PAPER}" stroke="${INK}" stroke-width="2"/>` +
      `<ellipse cx="32" cy="40.5" rx="3.3" ry="2.4" fill="${INK}"/>` +
      `<path d="M29 45.5 Q32 47.8 35 45.5" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>`,
  },
};

const FALLBACK: Critter = { name: 'jogador', draw: (c) => `${base(c)}${eyes(31)}${smile()}` };

export function critterOf(color: string): Critter {
  return (CRITTERS as Record<string, Critter>)[color] ?? FALLBACK;
}

/** SVG completo (string) do personagem da cor; `overflow: visible` porque orelhas e antenas saem do círculo. */
export function critterSvg(color: string): string {
  return `<svg viewBox="0 0 64 64" overflow="visible" aria-hidden="true" focusable="false">${critterOf(color).draw(color)}</svg>`;
}
