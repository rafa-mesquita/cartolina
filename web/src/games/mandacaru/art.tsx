/**
 * Desenho do estilo D do Mandacaru (porte de `prototipo/hexa/art.js`) em componentes SVG puros, sem estado.
 * A geometria do shared (`mandacaruGeometry()`) usa unidade = raio do hexágono; aqui tudo é multiplicado por `R`.
 * Os ids das `<defs>` têm o prefixo `mc-` pra não colidir com as defs das outras mesas.
 */
import { mandacaruGeometry, type CordelKind, type HexTile, type PortKind, type Resource, type Terrain } from '@cartolina/shared';
import type { ReactNode } from 'react';
import { PIECE_ART, PIECE_RATIO, RES_ART, TERRAIN_ART, cordelArtUrl } from './assets';

export const R = 58;
const SQ3 = Math.sqrt(3);
export const INK = '#4a2e1f';
export const LINE = '#5b3a29';
export const RED = '#b8321f';
/** Cores dos jogadores na ordem dos assentos (`view.game.players`): vermelho, azul, roxo, branco. */
export const PLAYER_TINTS = ['#b8321f', '#2f6fa8', '#7b4a9a', '#f4efe3'] as const;

export const FILL: Record<Terrain, string> = { forest: '#8f9c6c', pasture: '#d4b878', fields: '#9db35a', hills: '#c8643b', mountains: '#aaa49a', desert: '#e8cd96' };
export const RIM: Record<Terrain, string> = { forest: '#67724a', pasture: '#a98c4f', fields: '#728a35', hills: '#963f22', mountains: '#7c766c', desert: '#bf9f62' };

export type IconKind = 'catingueira' | 'bode' | 'feijao' | 'pote' | 'lajedo' | 'rachado' | 'causo' | 'chapeu' | 'igreja' | 'enxada' | 'chuva' | 'saco';
export const TERRAIN_ICON: Record<Terrain, IconKind> = { forest: 'catingueira', pasture: 'bode', fields: 'feijao', hills: 'pote', mountains: 'lajedo', desert: 'rachado' };
export const RES_ICON: Record<Resource, IconKind> = { wood: 'catingueira', brick: 'pote', leather: 'bode', beans: 'feijao', stone: 'lajedo' };
export const CORDEL_ICON: Record<CordelKind, IconKind> = { vaqueiro: 'chapeu', point: 'igreja', mutirao: 'enxada', chuva: 'chuva', atravessador: 'saco' };

export interface IconStyle {
  ink: string;
  fill: string;
  fill2: string;
  sw: number;
}
/** Ícones na tinta do tabuleiro. */
export const STYLE: IconStyle = { ink: INK, fill: '#5f7a3a', fill2: '#fbf1dc', sw: 3.6 };
/** Ícones de xilogravura (creme sobre o bloco escuro do folheto de cordel). */
export const WOODCUT: IconStyle = { ink: '#fbf1dc', fill: '#fbf1dc', fill2: '#2a1c13', sw: 3.8 };

export interface Pt {
  x: number;
  y: number;
}

/** Coordenada da geometria (unidade = raio) em pixels. */
export const at = (o: Pt): Pt => ({ x: o.x * R, y: o.y * R });

/** Os 6 cantos de um hexágono em pé de centro (cx, cy) em pixels. */
export function corners(cx: number, cy: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 90);
    pts.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) });
  }
  return pts;
}

/** Caminho do hexágono, encolhido por `k` em volta de (cx, cy). */
export function hexPath(pts: Pt[], k = 1, cx = 0, cy = 0): string {
  return 'M' + pts.map((p) => `${(cx + (p.x - cx) * k).toFixed(1)},${(cy + (p.y - cy) * k).toFixed(1)}`).join(' L') + ' Z';
}

/** Hexágono em pé numa caixa 1×1 (a largura dele é √3/2 da altura). */
const HEX_CLIP = (() => {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 90);
    pts.push(`${(0.5 + 0.5 * Math.cos(a)).toFixed(4)},${(0.5 + 0.5 * Math.sin(a)).toFixed(4)}`);
  }
  return `M${pts.join(' L')} Z`;
})();

/** Defs do tabuleiro: sombra chapada, sombra suave, grão, terra rachada, recorte do hexágono e luz de sol. Uma vez por SVG. */
export function BoardDefs() {
  return (
    <defs>
      <filter id="mc-som" x="-10%" y="-10%" width="120%" height="130%">
        <feDropShadow dx="0" dy="3" stdDeviation="0" floodColor={LINE} floodOpacity=".9" />
      </filter>
      <filter id="mc-sombra" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#2a1c13" floodOpacity=".45" />
      </filter>
      <pattern id="mc-grao" width="12" height="12" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="3" r=".9" fill={LINE} opacity=".18" />
        <circle cx="8" cy="9" r=".9" fill="#fff" opacity=".25" />
        <circle cx="9" cy="2" r=".7" fill={LINE} opacity=".12" />
      </pattern>
      <pattern id="mc-racha" width="70" height="60" patternUnits="userSpaceOnUse">
        <rect width="70" height="60" fill="#d9a56c" />
        <path
          d="M0 18 L16 22 L24 10 L40 14 L52 4 M16 22 L20 38 L8 50 M20 38 L38 42 L50 30 L70 34 M38 42 L42 60 M50 30 L52 4 M52 30 L62 50 L70 52"
          fill="none"
          stroke="#a86d3c"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </pattern>
      {/* recorte do hexágono em pé, em unidades da caixa da imagem (quadrada, da altura do hexágono) */}
      <clipPath id="mc-hexclip" clipPathUnits="objectBoundingBox">
        <path d={HEX_CLIP} />
      </clipPath>
      <linearGradient id="mc-sol" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity=".28" />
        <stop offset=".55" stopColor="#fff" stopOpacity="0" />
        <stop offset="1" stopColor={LINE} stopOpacity=".12" />
      </linearGradient>
    </defs>
  );
}

/** Um ícone na caixa 100×100 (centro 50,50), sem o `<svg>` em volta. */
export function IconShape({ kind, s = STYLE }: { kind: IconKind; s?: IconStyle }): ReactNode {
  const st = { stroke: s.ink, strokeWidth: s.sw, strokeLinejoin: 'round', strokeLinecap: 'round' } as const;
  const thin = { ...st, strokeWidth: s.sw * 0.7 };
  const f = s.fill;
  const f2 = s.fill2;
  switch (kind) {
    case 'catingueira':
      // Árvore seca retorcida da caatinga, com folhinhas miúdas.
      return (
        <>
          <path
            d="M50 90 Q45 72 52 60 Q58 48 47 38 M52 60 Q66 52 72 36 M47 38 Q38 30 27 32 M47 38 Q50 25 58 16 M72 36 Q79 30 86 32 M27 32 Q20 28 17 19 M58 16 Q63 12 66 6"
            fill="none"
            stroke={s.ink}
            strokeWidth={s.sw * 1.5}
            strokeLinecap="round"
          />
          <g fill={f}>
            <circle cx="17" cy="17" r="4" />
            <circle cx="66" cy="6" r="4" />
            <circle cx="87" cy="31" r="4" />
            <circle cx="27" cy="31" r="3.5" />
            <circle cx="72" cy="35" r="3.5" />
            <circle cx="58" cy="15" r="3.5" />
          </g>
          <path d="M30 90 H70" fill="none" {...st} />
        </>
      );
    case 'bode':
      return (
        <>
          <path d="M26 48 L19 41" fill="none" {...st} />
          <ellipse cx="46" cy="55" rx="22" ry="13" fill={f2} {...st} />
          <path d="M34 66 V84 M42 67 V84 M54 67 V84 M61 65 V84" fill="none" {...st} />
          <path d="M64 50 Q66 38 76 36 Q86 38 86 46 Q84 54 76 56 Q68 56 64 50 Z" fill={f2} {...st} />
          <path d="M74 37 Q70 24 60 22 M80 37 Q80 26 72 20" fill="none" {...st} />
          <path d="M80 55 L79 66" fill="none" {...st} />
          <circle cx="79" cy="44" r="2.6" fill={s.ink} />
        </>
      );
    case 'feijao':
      return (
        <>
          <path d="M50 90 V40 M50 62 Q36 58 30 46 M50 54 Q64 50 70 38" fill="none" {...st} />
          <path d="M50 40 Q38 30 44 16 Q56 24 50 40 Z M30 46 Q16 42 16 28 Q30 30 30 46 Z M70 38 Q84 36 86 22 Q72 22 70 38 Z" fill={f} {...st} />
          <path d="M50 70 Q30 72 22 88 Q40 86 50 72 Z" fill={f2} {...st} />
          <path d="M50 66 Q70 66 80 82 Q62 82 50 68 Z" fill={f2} {...st} />
        </>
      );
    case 'pote':
      return (
        <>
          <path d="M36 22 H64 V30 Q82 42 80 62 Q76 86 50 88 Q24 86 20 62 Q18 42 36 30 Z" fill={f2} {...st} />
          <path d="M32 22 H68" fill="none" {...st} />
          <path d="M26 54 Q50 62 74 54" fill="none" {...thin} />
          <path d="M28 64 Q50 72 72 64" fill="none" {...thin} />
        </>
      );
    case 'lajedo':
      return (
        <>
          <path d="M8 84 Q10 58 34 56 Q46 40 64 48 Q88 50 92 84 Z" fill={f} {...st} />
          <path d="M40 56 Q48 46 58 50 M64 62 Q72 58 80 64 M22 70 Q28 66 34 70" fill="none" {...thin} />
          <path d="M58 48 Q60 30 74 28 Q84 32 82 46" fill={f2} {...st} />
        </>
      );
    case 'rachado':
      return (
        <>
          <circle cx="74" cy="24" r="11" fill={f2} {...st} />
          <path d="M8 58 L28 52 L44 62 L62 52 L92 60 M28 52 L24 40 M44 62 L42 84 M62 52 L70 40 M62 52 L76 82 M44 62 L24 82" fill="none" {...st} />
        </>
      );
    case 'causo':
      return (
        <>
          <rect x="22" y="14" width="56" height="72" rx="6" fill={f2} {...st} />
          <path d="M50 30 L56 44 L70 44 L59 53 L63 68 L50 59 L37 68 L41 53 L30 44 L44 44 Z" fill={f} {...st} strokeWidth={s.sw * 0.6} />
        </>
      );
    case 'chapeu':
      // Chapéu de couro do vaqueiro, com a meia-lua na frente.
      return (
        <>
          <path d="M8 64 Q50 86 92 64 Q86 56 74 58 Q74 28 50 26 Q26 28 26 58 Q14 56 8 64 Z" fill={f2} {...st} />
          <path d="M27 54 Q50 64 73 54" fill="none" {...st} />
          <path d="M44 42 Q50 34 56 42 Q50 39 44 42 Z" fill={s.ink} {...st} strokeWidth={s.sw * 0.6} />
          <path d="M30 34 L38 44 M70 34 L62 44" fill="none" {...st} strokeWidth={s.sw * 0.6} />
        </>
      );
    case 'igreja':
      return (
        <>
          <path d="M16 86 V52 L36 36 L56 52 V86 Z" fill={f2} {...st} />
          <path d="M56 86 V34 L68 20 L80 34 V86 Z" fill={f2} {...st} />
          <path d="M68 6 V16 M63 10 H73" fill="none" {...st} />
          <path d="M29 86 V72 Q36 62 43 72 V86" fill="none" {...st} />
          <circle cx="68" cy="46" r="5" fill="none" {...st} />
          <path d="M8 86 H92" fill="none" {...st} />
        </>
      );
    case 'enxada':
      return (
        <>
          <path d="M22 88 L70 24 M78 88 L30 24" fill="none" {...st} strokeWidth={s.sw * 1.3} />
          <path d="M60 16 L84 30 L78 38 L58 26 Z" fill={f2} {...st} />
          <path d="M40 16 L16 30 L22 38 L42 26 Z" fill={f2} {...st} />
          <path d="M14 90 H86" fill="none" {...st} />
        </>
      );
    case 'chuva':
      return (
        <>
          <path d="M26 56 Q12 56 12 43 Q12 30 28 30 Q32 14 50 14 Q64 14 68 27 Q88 25 88 42 Q88 56 72 56 Z" fill={f2} {...st} />
          <path d="M30 66 L25 76 M50 66 L45 76 M70 66 L65 76 M40 82 L35 92 M60 82 L55 92" fill="none" {...st} />
        </>
      );
    case 'saco':
      return (
        <>
          <path d="M38 28 L30 14 H70 L62 28 Q88 44 84 68 Q80 90 50 90 Q20 90 16 68 Q12 44 38 28 Z" fill={f2} {...st} />
          <path d="M36 30 H64" fill="none" {...st} />
          <circle cx="50" cy="62" r="12" fill="none" {...st} />
          <path d="M50 54 V70" fill="none" {...thin} />
        </>
      );
  }
}

/** Um ícone solto (com o `<svg>`), do tamanho pedido. */
export function SvgIcon({ kind, size = 40, s = STYLE, title }: { kind: IconKind; size?: number; s?: IconStyle; title?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden={title ? undefined : true} role={title ? 'img' : undefined} aria-label={title}>
      <IconShape kind={kind} s={s} />
    </svg>
  );
}

/** Imagem de arte do Flow no lugar de um ícone (decorativa: o nome vem do texto em volta). */
function ArtImg({ src, size, width = size, className }: { src: string; size: number; width?: number; className: string }) {
  return <img className={className} src={src} width={width} height={size} alt="" aria-hidden="true" draggable={false} />;
}

/** Ícone de um recurso (madeira, barro, couro, feijão, pedra): a arte do Flow se já existe (`RES_ART`), senão o desenho. */
export function ResIcon({ kind, size = 40, s = STYLE }: { kind: Resource; size?: number; s?: IconStyle }) {
  const src = RES_ART[kind];
  // os recursos são recortados rente e mais largos que altos: a caixa é mais larga, pra não encolherem
  if (src) return <ArtImg src={src} size={size} width={Math.round(size * 1.25)} className="mc-art-res" />;
  return <SvgIcon kind={RES_ICON[kind]} size={size} s={s} />;
}

/** Um recurso dentro de um SVG, na caixa (x, y, size): a arte se já existe, senão o desenho. */
export function ResShape({ kind, x, y, size }: { kind: Resource; x: number; y: number; size: number }) {
  const src = RES_ART[kind];
  if (src) return <image href={src} x={x} y={y} width={size} height={size} preserveAspectRatio="xMidYMid meet" />;
  return (
    <g transform={`translate(${x},${y}) scale(${size / 100})`}>
      <IconShape kind={RES_ICON[kind]} />
    </g>
  );
}

/**
 * Ícone de um cordel: a arte do Flow (cena quadrada que enche o bloco do folheto) se já existe (`CORDEL_ART`), senão a
 * xilogravura creme pra pôr sobre o bloco escuro. `point` = qual Ponto (índice em `POINT_NAMES`; 0 = Igrejinha).
 */
export function CordelIcon({ kind, size = 40, s = WOODCUT, point = 0 }: { kind: CordelKind; size?: number; s?: IconStyle; point?: number }) {
  const src = cordelArtUrl(kind, point);
  if (src) return <ArtImg src={src} size={size} className="mc-art-cordel" />;
  return <SvgIcon kind={CORDEL_ICON[kind]} size={size} s={s} />;
}

/** Logo: o mandacaru com a florzinha. */
export function MandacaruLogo({ size = 46 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <path
        d="M44 86 V26 Q44 18 50 18 Q56 18 56 26 V86 Z M44 58 H34 Q28 58 28 52 V38 Q28 33 32 33 Q36 33 36 38 V50 H44 M56 50 H64 V34 Q64 29 68 29 Q72 29 72 34 V50 Q72 58 66 58 H56"
        fill="#5f7a3a"
        stroke={INK}
        strokeWidth="3.6"
        strokeLinejoin="round"
      />
      <circle cx="50" cy="16" r="4.5" fill="#e0582a" stroke={INK} strokeWidth="2" />
      <path d="M14 86 H86" stroke={INK} strokeWidth="3.6" strokeLinecap="round" />
    </svg>
  );
}

/** Chance de um número sair (em 36): quantas bolinhas a ficha mostra. */
const pipCount = (n: number) => 6 - Math.abs(7 - n);

/** Lado da caixa da arte do terreno: a altura do hexágono de dentro (0,88 do raio). */
const TILE_ART = 2 * R * 0.88;

/**
 * Um terreno: peça com borda em relevo na cor do terreno, a arte do Flow recortada no hexágono (`mc-hexclip`, das
 * `BoardDefs`), luz por cima e contorno marrom fino. (cx, cy) em pixels.
 */
export function Hex({ tile, cx, cy }: { tile: HexTile; cx: number; cy: number }) {
  const pts = corners(cx, cy);
  const inner = hexPath(pts, 0.88, cx, cy - 2);
  return (
    <g data-terrain={tile.terrain}>
      <g filter="url(#mc-som)">
        <path d={hexPath(pts, 0.97, cx, cy)} fill={RIM[tile.terrain]} stroke={LINE} strokeWidth="2.5" />
      </g>
      <path d={inner} fill={FILL[tile.terrain]} />
      <image
        href={TERRAIN_ART[tile.terrain]}
        x={cx - TILE_ART / 2}
        y={cy - 2 - TILE_ART / 2}
        width={TILE_ART}
        height={TILE_ART}
        preserveAspectRatio="xMidYMid slice"
        clipPath="url(#mc-hexclip)"
      />
      <path d={inner} fill="url(#mc-sol)" />
      <path d={inner} fill="none" stroke={LINE} strokeWidth="1.6" strokeOpacity=".7" />
    </g>
  );
}

/** Os terrenos de um anel de raio `radius` em volta do centro (coordenadas axiais). */
const DIRS: [number, number][] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
function ring(radius: number): { q: number; r: number }[] {
  const out: { q: number; r: number }[] = [];
  let q = DIRS[4]![0] * radius;
  let r = DIRS[4]![1] * radius;
  for (let side = 0; side < 6; side++) {
    for (let step = 0; step < radius; step++) {
      out.push({ q, r });
      q += DIRS[side]![0];
      r += DIRS[side]![1];
    }
  }
  return out;
}

/** O anel 3 (fora da ilha): terra rachada no lugar do mar. */
export function Border() {
  return (
    <g>
      {ring(3).map(({ q, r }) => {
        const x = R * SQ3 * (q + r / 2);
        const y = R * 1.5 * r;
        return <path key={`${q},${r}`} d={hexPath(corners(x, y), 1.01, x, y)} fill="url(#mc-racha)" />;
      })}
    </g>
  );
}

/** Ficha do número: disco creme com aro terracota; 6 e 8 em vermelho; bolinhas de chance. (cx, cy) = centro do terreno. */
export function NumberToken({ number, cx, cy }: { number: number; cx: number; cy: number }) {
  const red = number === 6 || number === 8;
  const c = red ? RED : INK;
  const n = pipCount(number);
  return (
    <g>
      <g filter="url(#mc-som)">
        <circle cx={cx} cy={cy + 10} r="21" fill="#fbf1dc" stroke={LINE} strokeWidth="2.5" />
      </g>
      <circle cx={cx} cy={cy + 10} r="17" fill="none" stroke="#c8643b" strokeWidth="1.5" />
      <text x={cx} y={cy + 17} textAnchor="middle" fontFamily="Bree Serif" fontSize="20" fill={c}>
        {number}
      </text>
      {Array.from({ length: n }, (_, i) => (
        <circle key={i} cx={cx + (i - (n - 1) / 2) * 5} cy={cy + 25} r="1.8" fill={c} />
      ))}
    </g>
  );
}

/** Onde fica a barraca da feira `i` da geometria: a 0,55 R pra fora do meio do lado, e as duas pontas (a, b). */
export function portPlacement(i: number): { x: number; y: number; a: Pt; b: Pt } {
  const g = mandacaruGeometry();
  const p = g.ports[i]!;
  const a = at(g.vertices[p.vertices[0]]!);
  const b = at(g.vertices[p.vertices[1]]!);
  const c = at(g.hexes[p.hex]!);
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const len = Math.hypot(mx - c.x, my - c.y);
  return { x: mx + ((mx - c.x) / len) * 0.55 * R, y: my + ((my - c.y) / len) * 0.55 * R, a, b };
}

/** Altura da barraca da feira (arte do Flow) no tabuleiro. */
const FEIRA_H = 46;

/** Feira: a barraca (arte do Flow) com o selo da taxa embaixo e a estradinha de terra até as duas pontas do lado. */
export function Port({ kind, x, y, a, b }: { kind: PortKind; x: number; y: number; a: Pt; b: Pt }) {
  const w = FEIRA_H * PIECE_RATIO.feira;
  return (
    <g data-feira={kind}>
      <path d={`M${a.x},${a.y} L${x},${y} L${b.x},${b.y}`} fill="none" stroke="#7a4a2a" strokeWidth="5" strokeLinecap="round" strokeDasharray="1 8" />
      <image href={PIECE_ART.feira} x={x - w / 2} y={y - 38} width={w} height={FEIRA_H} filter="url(#mc-sombra)" />
      <g filter="url(#mc-som)">
        <rect x={x - 22} y={y + 3} width="44" height="21" rx="4" fill="#fbf1dc" stroke={LINE} strokeWidth="2" />
      </g>
      {kind === 'generic' ? (
        <text x={x} y={y + 19} textAnchor="middle" fontFamily="Bree Serif" fontSize="14" fill={INK}>
          3:1
        </text>
      ) : (
        <>
          <text x={x - 9} y={y + 19} textAnchor="middle" fontFamily="Bree Serif" fontSize="13" fill={INK}>
            2:1
          </text>
          <ResShape kind={kind} x={x + 2} y={y + 4} size={19} />
        </>
      )}
    </g>
  );
}

/** Estrada entre dois pontos em pixels. */
export function Road({ a, b, color }: { a: Pt; b: Pt; color: string }) {
  return (
    <g>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={LINE} strokeWidth="12" strokeLinecap="round" />
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth="7" strokeLinecap="round" />
    </g>
  );
}

/**
 * Peça de construção: a arte do Flow em pé sobre uma ficha redonda na cor do dono (contorno marrom e sombra chapada).
 * A ficha sobra em volta e embaixo da arte, então a cor lê de longe até no branco e no vermelho (a casa tem parede
 * branca e telhado vermelho). (x, y) = o canto do tabuleiro.
 */
function Building(p: { x: number; y: number; color: string; href: string; ratio: number; h: number; r: number }) {
  const w = p.h * p.ratio;
  return (
    <g transform={`translate(${p.x},${p.y})`}>
      <g filter="url(#mc-som)">
        <circle className="mc-base" cx="0" cy="3" r={p.r} fill={p.color} stroke={LINE} strokeWidth="2.6" />
      </g>
      <circle cx="0" cy="3" r={p.r - 4.5} fill="none" stroke={LINE} strokeWidth="1" strokeOpacity=".35" />
      <image href={p.href} x={-w / 2} y={-p.h / 2 - 3} width={w} height={p.h} />
    </g>
  );
}

/** Casa de taipa (arte do Flow) sobre a ficha na cor do jogador. */
export function House({ x, y, color }: { x: number; y: number; color: string }) {
  return <Building x={x} y={y} color={color} href={PIECE_ART.casa} ratio={PIECE_RATIO.casa} h={25} r={19} />;
}

/** Vila (casario com a igrejinha, arte do Flow) sobre a ficha maior na cor do jogador. */
export function City({ x, y, color }: { x: number; y: number; color: string }) {
  return <Building x={x} y={y} color={color} href={PIECE_ART.vila} ratio={PIECE_RATIO.vila} h={35} r={24} />;
}

/** Carcará (arte do Flow, pousado no galho) com a sombra no chão. (x, y) = onde ficam os pés. */
export function Carcara({ x, y, k = 1 }: { x: number; y: number; k?: number }) {
  const h = 74;
  const w = h * PIECE_RATIO.carcara;
  return (
    <g transform={`translate(${x},${y}) scale(${k})`} data-peca-arte="carcara">
      <ellipse cx="0" cy="30" rx="18" ry="4.5" fill={LINE} opacity=".35" />
      <image href={PIECE_ART.carcara} x={-w / 2} y={-40} width={w} height={h} filter="url(#mc-sombra)" />
    </g>
  );
}

const DICE_PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[30, 30], [70, 70]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[30, 30], [70, 30], [30, 70], [70, 70]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[30, 26], [70, 26], [30, 50], [70, 50], [30, 74], [70, 74]],
};

/** Os pontos de uma face do dado (caixa 100×100; a cor vem do `fill` de quem desenha). */
export function DiceFace({ n }: { n: number }) {
  return (
    <>
      {(DICE_PIPS[n] ?? []).map(([x, y]) => (
        <circle key={`${x},${y}`} cx={x} cy={y} r="9" />
      ))}
    </>
  );
}
