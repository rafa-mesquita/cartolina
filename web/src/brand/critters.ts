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
  '#F4877A': {
    name: 'galo',
    draw: (c) =>
      `<path d="M22 15 Q21 4 28 8 Q31 -1 36 7 Q43 3 42 15 Z" fill="#E0567A" ${S}/>${base(c)}${eyes(31)}` +
      `<path d="M27 36 L37 36 L32 43 Z" fill="#FFD07A" ${S}/>` +
      `<path d="M29.5 43 Q29.5 50 32 50 Q34.5 50 34.5 43" fill="#E0567A" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`,
  },
  '#B59A7A': {
    name: 'coruja',
    draw: (c) =>
      `<path d="M12 21 L14 6 L25 14 Z" fill="${c}" ${S}/><path d="M52 21 L50 6 L39 14 Z" fill="${c}" ${S}/>${base(c, 36)}` +
      `<circle cx="23" cy="33" r="8" fill="${PAPER}" stroke="${INK}" stroke-width="2"/>` +
      `<circle cx="41" cy="33" r="8" fill="${PAPER}" stroke="${INK}" stroke-width="2"/>` +
      `<circle cx="23.5" cy="34" r="3.4" fill="${INK}"/><circle cx="40.5" cy="34" r="3.4" fill="${INK}"/>` +
      `<path d="M29.5 41 L34.5 41 L32 46 Z" fill="#FFD07A" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>` +
      `<path d="M25 51 l2.5 2.5 l2.5 -2.5 M34 51 l2.5 2.5 l2.5 -2.5" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
  '#9C9CF0': {
    name: 'mago',
    draw: (c) =>
      `<circle cx="32" cy="38" r="18" fill="#FFE3C8" ${S}/>` +
      `<path d="M16 40 Q19 60 32 62 Q45 60 48 40 Q40 47 32 45 Q24 47 16 40 Z" fill="${PAPER}" ${S}/>${eyes(36, 26, 38, 2.5)}` +
      `<path d="M17 23 L32 -6 L47 23 Z" fill="${c}" ${S}/><ellipse cx="32" cy="23" rx="19" ry="4.5" fill="${c}" ${S}/>` +
      `<path d="M32 4.5 L33.3 7.7 L36.8 8 L34.1 10.2 L35 13.6 L32 11.7 L29 13.6 L29.9 10.2 L27.2 8 L30.7 7.7 Z" fill="#FFD07A" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>`,
  },
  '#ECE8E2': {
    name: 'panda',
    draw: (c) =>
      `<circle cx="15" cy="16" r="7.5" fill="${INK}"/><circle cx="49" cy="16" r="7.5" fill="${INK}"/>${base(c, 36)}` +
      `<ellipse cx="24" cy="32" rx="5.5" ry="7.5" fill="${INK}" transform="rotate(-25 24 32)"/>` +
      `<ellipse cx="40" cy="32" rx="5.5" ry="7.5" fill="${INK}" transform="rotate(25 40 32)"/>` +
      `<circle cx="24.5" cy="31" r="2" fill="${PAPER}"/><circle cx="39.5" cy="31" r="2" fill="${PAPER}"/>` +
      `<ellipse cx="32" cy="40" rx="3.2" ry="2.3" fill="${INK}"/>${smile(44, 3.5)}${blush(42)}`,
  },
  '#9FB5CC': {
    name: 'pinguim',
    draw: (c) =>
      `${base(c)}<path d="M17 37 Q17 24 26 25 Q31 26 32 30 Q33 26 38 25 Q47 24 47 37 Q47 54 32 56 Q17 54 17 37 Z" fill="${PAPER}" stroke="${INK}" stroke-width="2"/>` +
      `${eyes(34, 26, 38)}<path d="M28 39 L36 39 L32 44 Z" fill="#FFB38A" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>${blush(43)}`,
  },
  '#F9E36B': {
    name: 'abelha',
    draw: (c) =>
      `<ellipse cx="11" cy="26" rx="8" ry="6" fill="${PAPER}" stroke="${INK}" stroke-width="2"/>` +
      `<ellipse cx="53" cy="26" rx="8" ry="6" fill="${PAPER}" stroke="${INK}" stroke-width="2"/>` +
      `<path d="M25 14 Q22 6 18 5 M39 14 Q42 6 46 5" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>` +
      `<circle cx="18" cy="5" r="2.6" fill="${INK}"/><circle cx="46" cy="5" r="2.6" fill="${INK}"/>${base(c, 36)}` +
      `<path d="M13 45 Q32 50 51 45 L49 51 Q32 55 15 51 Z" fill="${INK}"/>${eyes(32)}${smile(39)}`,
  },
  '#A97AB0': {
    name: 'vampiro',
    draw: (c) =>
      `<path d="M8 30 L17 52 L32 45 L47 52 L56 30 L46 40 L32 33 L18 40 Z" fill="${c}" ${S}/>` +
      `<circle cx="32" cy="36" r="19" fill="#EDE6F2" ${S}/>` +
      `<path d="M13 35 Q13 16 32 16 Q51 16 51 35 Q45 25 32 31 Q19 25 13 35 Z" fill="${INK}"/>${eyes(38, 25, 39, 2.5)}` +
      `<path d="M27 44 Q32 47.5 37 44" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>` +
      `<path d="M29 45.2 L30 48.5 L31.2 45.8 Z M32.8 45.8 L34 48.5 L35 45.2 Z" fill="${PAPER}" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>${blush(43)}`,
  },
  '#A7A9AE': {
    name: 'lobo',
    draw: (c) =>
      `<path d="M11 24 L15 3 L28 15 Z" fill="${c}" ${S}/><path d="M53 24 L49 3 L36 15 Z" fill="${c}" ${S}/>` +
      `<path d="M16 11 L17 7 L22 13 Z M48 11 L47 7 L42 13 Z" fill="#7F8288"/>${base(c, 36)}` +
      `<path d="M19 40 Q32 57 45 40 Q38 44 32 43 Q26 44 19 40 Z" fill="${PAPER}" stroke="${INK}" stroke-width="2"/>` +
      `<ellipse cx="32" cy="42" rx="3.4" ry="2.4" fill="${INK}"/>${eyes(32)}` +
      `<path d="M19 26 L27 28.5 M45 26 L37 28.5" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`,
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
