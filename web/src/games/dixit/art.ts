import { mulberry32, type Rng } from '@cartolina/shared';

/** Arte de verdade em `web/public/dixit/cards/` (gerada por `npm run dixit:cartas`). `false` volta para as pinturas provisórias em SVG. */
export const REAL_ART = true;

const CARD_ID = /^d\d{3}$/;
/** O id vem do servidor e entra em atributo SVG e em URL: só passa o formato `dNNN`. */
const safeId = (id: string): string => (CARD_ID.test(id) ? id : 'd000');

/** Relativo à base do site (funciona no GitHub Pages, em subpasta). */
export function cardImageUrl(id: string): string {
  return `${import.meta.env.BASE_URL}dixit/cards/${safeId(id)}.webp`;
}

const pick = <T>(r: Rng, arr: readonly T[]): T => arr[Math.floor(r() * arr.length)]!;
const SKIES: readonly (readonly [string, string, boolean])[] = [
  ['#14241f', '#30638e', true], ['#d1495b', '#f2a541', false], ['#8fb8de', '#f6ead2', false], ['#00798c', '#bfe0d4', false],
  ['#3a2a4a', '#c0607a', true], ['#1b2f2a', '#00798c', true], ['#f2a541', '#f6ead2', false],
];
const LANDS = ['#1b2f2a', '#2f5046', '#3d6b5c', '#5a4636', '#6b3a3a', '#24495a'];
const SIL = '#132420';
const ACC = ['#f2a541', '#d1495b', '#f6ead2', '#00798c'];

type Thing = (r: Rng, x: number, y: number, k: number, water: boolean) => string;
const tree: Thing = (_r, x, y, k) => { const h = 50 * k; return `<path d="M${x} ${y} l${-14 * k} 0 l${14 * k} ${-h} l${14 * k} ${h} Z" fill="${SIL}"/><path d="M${x} ${y - h * 0.45} l${-11 * k} 0 l${11 * k} ${-h * 0.7} l${11 * k} ${h * 0.7} Z" fill="${SIL}"/><rect x="${x - 2}" y="${y}" width="4" height="${8 * k}" fill="${SIL}"/>`; };
const house: Thing = (r, x, y, k) => { const w = 30 * k, h = 24 * k; return `<rect x="${x - w / 2}" y="${y - h}" width="${w}" height="${h}" fill="${SIL}"/><path d="M${x - w / 2 - 4} ${y - h} L${x} ${y - h - 18 * k} L${x + w / 2 + 4} ${y - h} Z" fill="${SIL}"/><rect x="${x - 4 * k}" y="${y - h + 6 * k}" width="${8 * k}" height="${8 * k}" fill="${pick(r, ACC)}"/>`; };
const door: Thing = (_r, x, y, k) => { const w = 22 * k, h = 44 * k; return `<path d="M${x - w / 2} ${y} V${y - h + w / 2} A${w / 2} ${w / 2} 0 0 1 ${x + w / 2} ${y - h + w / 2} V${y} Z" fill="#f2a541"/><path d="M${x - w / 2 - 3} ${y} V${y - h + w / 2} A${w / 2 + 3} ${w / 2 + 3} 0 0 1 ${x + w / 2 + 3} ${y - h + w / 2} V${y}" fill="none" stroke="${SIL}" stroke-width="3"/>`; };
const bird: Thing = (r, x, _y, k) => { let s = ''; for (let i = 0; i < 3; i++) { const bx = x + (r() - 0.5) * 60, by = 60 + r() * 80; s += `<path d="M${bx - 7 * k} ${by} q${3.5 * k} ${-5 * k} ${7 * k} 0 q${3.5 * k} ${-5 * k} ${7 * k} 0" fill="none" stroke="${SIL}" stroke-width="1.6"/>`; } return s; };
const balloon: Thing = (r, x, _y, k) => { const by = 70 + r() * 70; return `<path d="M${x} ${by + 16 * k} q-6 30 4 60" stroke="${SIL}" stroke-width=".8" fill="none"/><ellipse cx="${x}" cy="${by}" rx="${11 * k}" ry="${14 * k}" fill="${pick(r, ACC)}"/>`; };
const ladder: Thing = (_r, x, y, k) => { const h = 120 * k; let s = `<path d="M${x - 7} ${y} L${x - 4} ${y - h} M${x + 7} ${y} L${x + 4} ${y - h}" stroke="${SIL}" stroke-width="2"/>`; for (let i = 1; i < 9; i++) s += `<path d="M${x - 6.5 + i * 0.35} ${y - (i * h) / 9} h${13 - i * 0.7}" stroke="${SIL}" stroke-width="1.6"/>`; return s; };
const eye: Thing = (r, x, _y, k) => { const ey = 60 + r() * 60; return `<path d="M${x - 22 * k} ${ey} Q${x} ${ey - 16 * k} ${x + 22 * k} ${ey} Q${x} ${ey + 16 * k} ${x - 22 * k} ${ey} Z" fill="#f6ead2" opacity=".9"/><circle cx="${x}" cy="${ey}" r="${6 * k}" fill="${SIL}"/>`; };
const spiral: Thing = (r, x, _y, k) => { const sy = 70 + r() * 80; let d = `M${x} ${sy}`; for (let a = 0; a < 18; a++) { const R = a * 1.6 * k, t = a * 0.7; d += ` L${x + Math.cos(t) * R} ${sy + Math.sin(t) * R}`; } return `<path d="${d}" fill="none" stroke="#f6ead2" stroke-width="1.2" opacity=".85"/>`; };
const stairs: Thing = (_r, x, y, k) => { let d = `M${x - 30 * k} ${y}`; for (let i = 0; i < 6; i++) d += ` v${-9 * k} h${10 * k}`; return `<path d="${d} V${y} Z" fill="${SIL}"/>`; };
const island: Thing = (r, x, y, k, w) => { const iy = 80 + r() * 50; return `<path d="M${x - 26 * k} ${iy} h${52 * k} l${-14 * k} ${22 * k} l${-12 * k} ${10 * k} l${-12 * k} ${-12 * k} Z" fill="${SIL}"/>` + tree(r, x, iy, k * 0.45, w); };
const key: Thing = (r, x, _y, k) => { const ky = 70 + r() * 70; return `<circle cx="${x}" cy="${ky}" r="${7 * k}" fill="none" stroke="#f2a541" stroke-width="2.4"/><path d="M${x + 7 * k} ${ky} h${22 * k} v${6 * k} M${x + 22 * k} ${ky} v${5 * k}" stroke="#f2a541" stroke-width="2.4" fill="none"/>`; };
const fish: Thing = (r, x, _y, k) => { const fy = 60 + r() * 80; return `<path d="M${x - 16 * k} ${fy} Q${x} ${fy - 10 * k} ${x + 14 * k} ${fy} Q${x} ${fy + 10 * k} ${x - 16 * k} ${fy} Z M${x + 14 * k} ${fy} l${8 * k} ${-6 * k} v${12 * k} Z" fill="${pick(r, ACC)}"/>`; };
const lamp: Thing = (_r, x, y, k) => { const h = 60 * k; return `<path d="M${x} ${y} V${y - h}" stroke="${SIL}" stroke-width="2.4"/><circle cx="${x}" cy="${y - h}" r="${5 * k}" fill="#f2a541"/><circle cx="${x}" cy="${y - h}" r="${14 * k}" fill="#f2a541" opacity=".18"/>`; };
const boat: Thing = (_r, x, y, k, water) => { const by = water ? y + 34 : y; return `<path d="M${x - 18 * k} ${by} h${36 * k} l${-7 * k} ${8 * k} h${-22 * k} Z" fill="${SIL}"/><path d="M${x} ${by} V${by - 26 * k} L${x + 14 * k} ${by - 4 * k} Z" fill="#f6ead2"/>`; };
const THINGS: readonly Thing[] = [tree, house, door, bird, balloon, ladder, eye, spiral, stairs, island, key, fish, lamp, boat];

const cache = new Map<string, string>();
const n = (v: number) => Math.round(v * 10) / 10;

/** Pequena "pintura" provisória (SVG 200×300, retrato 2:3) gerada a partir do id da carta. */
export function cardArtSvg(rawId: string): string {
  const id = safeId(rawId);
  const hit = cache.get(id);
  if (hit) return hit;
  const r = mulberry32(Number(id.replace(/\D/g, '')) * 7919 + 17);
  const W = 200, H = 300, g = `dx-sky-${id}`;
  const [s1, s2, night] = pick(r, SKIES);
  let s = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s1}"/><stop offset="1" stop-color="${s2}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#${g})"/>`;
  if (night) for (let i = 0; i < 26; i++) s += `<circle cx="${n(r() * W)}" cy="${n(r() * H * 0.6)}" r="${n(r() * 1.3 + 0.3)}" fill="#f6ead2" opacity="${n(0.4 + r() * 0.6)}"/>`;
  const cx = 30 + r() * 140, cy = 36 + r() * 90, cr = 13 + r() * 18;
  const cc = night ? '#f6ead2' : pick(r, ['#f6ead2', '#f2a541', '#d1495b']);
  s += `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(cr)}" fill="${cc}"/>`;
  if (r() < 0.45) s += `<circle cx="${n(cx + cr * 0.45)}" cy="${n(cy - cr * 0.2)}" r="${n(cr * 0.9)}" fill="${s1}"/>`;
  if (r() < 0.3) s += `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(cr + 8)}" fill="none" stroke="${cc}" stroke-width=".8" opacity=".7"/>`;
  const water = r() < 0.35, groundY = 190 + r() * 50;
  for (let i = 0; i < 3; i++) {
    const y = groundY + i * 26 - 20 + r() * 20, c = LANDS[(i + Math.floor(r() * LANDS.length)) % LANDS.length]!;
    s += `<path d="M0 ${n(y)} Q ${n(50 + r() * 50)} ${n(y - 30 - r() * 50)} ${n(100 + r() * 20)} ${n(y - r() * 10)} T ${W} ${n(y - 10 + r() * 20)} L${W} ${H} L0 ${H} Z" fill="${c}" opacity="${n(0.85 + i * 0.05)}"/>`;
  }
  if (water) {
    s += `<rect x="0" y="${n(groundY + 30)}" width="${W}" height="${H}" fill="${s1}" opacity=".85"/>`;
    for (let i = 0; i < 6; i++) s += `<path d="M${n(r() * 160)} ${n(groundY + 45 + i * 9)} h${n(15 + r() * 30)}" stroke="#f6ead2" stroke-width=".8" opacity=".5"/>`;
  }
  const count = 2 + Math.floor(r() * 2);
  for (let i = 0; i < count; i++) s += pick(r, THINGS)(r, 20 + r() * 160, groundY - 5 + r() * 25, 0.7 + r() * 0.8, water);
  for (let i = 0; i < 90; i++) s += `<circle cx="${n(r() * W)}" cy="${n(r() * H)}" r=".6" fill="#000" opacity=".12"/>`;
  s += '</svg>';
  cache.set(id, s);
  return s;
}

const ring = (k: number) =>
  `<circle cx="100" cy="150" r="${58 - k * 13}" fill="none" stroke="${k % 2 ? '#2F5046' : '#F2A541'}" stroke-width="${k % 2 ? 6 : 0.9}" opacity="${k % 2 ? 1 : 0.55}" stroke-dasharray="90 40"/>`;

/** Verso provisório: verde-floresta, espirais em mostarda e "diquisti". */
export const CARD_BACK_SVG = `<svg viewBox="0 0 200 300" xmlns="http://www.w3.org/2000/svg"><rect width="200" height="300" fill="#1B2F2A"/><rect x="12" y="12" width="176" height="276" rx="6" fill="none" stroke="#F6EAD2" stroke-width=".8" opacity=".6"/>${[0, 1, 2, 3].map(ring).join('')}<text x="100" y="158" text-anchor="middle" font-family="DM Serif Display, serif" font-size="22" fill="#F6EAD2">diquisti</text></svg>`;
