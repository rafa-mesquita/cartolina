import type { Rng } from '@cartolina/shared';

/** Palco desenhado em 1440×900; a largura real cresce com a janela (ver `fitStage`). */
export const STAGE_W = 1440;
export const STAGE_H = 900;
/** Feltro em coordenadas locais (px antes do 3D). */
export const FELT_W = 1000;
export const FELT_H = 560;
export const CARD_W = 118;
export const CARD_H = 177;
export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

export type Pt = readonly [number, number];
/** Ponto no feltro com giro: [x, y, giro em graus]. */
export type Spot = readonly [number, number, number];

/** Escala e largura do palco: a altura manda; a largura cresce até a da janela (sem faixas vazias). */
export function fitStage(winW: number, winH: number): { scale: number; width: number } {
  let scale = winH / STAGE_H;
  let width = winW / scale;
  if (width < STAGE_W) {
    scale = winW / STAGE_W;
    width = STAGE_W;
  }
  return { scale, width: Math.round(width) };
}

/** `n` casas igualmente espaçadas na borda do feltro: começa embaixo à esquerda e sobe (sentido horário). */
export function trackPoints(n: number): Pt[] {
  const x0 = 34, y0 = 34, x1 = FELT_W - 34, y1 = FELT_H - 34, R = 40;
  const w = x1 - x0 - 2 * R, h = y1 - y0 - 2 * R, q = (Math.PI * R) / 2;
  const seg: { len: number; at: (t: number) => Pt }[] = [
    { len: h, at: (t) => [x0, y1 - R - t * h] },
    { len: q, at: (t) => [x0 + R - R * Math.cos((t * Math.PI) / 2), y0 + R - R * Math.sin((t * Math.PI) / 2)] },
    { len: w, at: (t) => [x0 + R + t * w, y0] },
    { len: q, at: (t) => [x1 - R + R * Math.sin((t * Math.PI) / 2), y0 + R - R * Math.cos((t * Math.PI) / 2)] },
    { len: h, at: (t) => [x1, y0 + R + t * h] },
    { len: q, at: (t) => [x1 - R + R * Math.cos((t * Math.PI) / 2), y1 - R + R * Math.sin((t * Math.PI) / 2)] },
    { len: w, at: (t) => [x1 - R - t * w, y1] },
    { len: q, at: (t) => [x0 + R - R * Math.sin((t * Math.PI) / 2), y1 - R + R * Math.cos((t * Math.PI) / 2)] },
  ];
  const total = seg.reduce((a, s) => a + s.len, 0);
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    let d = (i / n) * total + 18;
    for (const s of seg) {
      if (d <= s.len) {
        out.push(s.at(d / s.len));
        break;
      }
      d -= s.len;
    }
  }
  return out;
}

/** Onde cada peão fica: casa = pontos (no máximo a última); quem divide a casa se espalha num círculo. */
export function pawnSpots(players: readonly string[], scores: Readonly<Record<string, number>>, cells: readonly Pt[]): Record<string, Pt> {
  const last = cells.length - 1;
  const byCell = new Map<number, string[]>();
  for (const p of players) {
    const k = Math.min(Math.max(scores[p] ?? 0, 0), last);
    byCell.set(k, [...(byCell.get(k) ?? []), p]);
  }
  const out: Record<string, Pt> = {};
  for (const [k, group] of byCell) {
    const [x, y] = cells[k]!;
    const m = group.length;
    group.forEach((p, j) => {
      const ang = (j / m) * Math.PI * 2;
      const rad = m > 1 ? 13 + m : 0;
      out[p] = [x + Math.cos(ang) * rad, y + 10 + Math.sin(ang) * rad * 0.5];
    });
  }
  return out;
}

/** Ponto de baixo, no centro, de cada carta na mesa: uma fileira até 5, duas de 6 em diante. */
export function tableSlots(n: number): Pt[] {
  const G = 22;
  const rows = n <= 5 ? [n] : [Math.ceil(n / 2), Math.floor(n / 2)];
  const ys = rows.length === 1 ? [395] : [262, 478];
  const out: Pt[] = [];
  rows.forEach((cnt, ri) => {
    const tot = cnt * CARD_W + (cnt - 1) * G;
    for (let i = 0; i < cnt; i++) out.push([FELT_W / 2 - tot / 2 + CARD_W / 2 + i * (CARD_W + G), ys[ri]!]);
  });
  return out;
}

/** Centro do assento `i` de `k` (os outros jogadores) num arco acima da mesa; abre com a largura extra. */
export function seatArc(i: number, k: number, width: number): Pt {
  const cx = width / 2;
  if (k === 1) return [cx, 120];
  const rx = 655 + (width - STAGE_W) * 0.42;
  const t = ((168 - (i / (k - 1)) * 156) * Math.PI) / 180;
  return [cx + rx * Math.cos(t), 392 - 272 * Math.sin(t)];
}

const LOOSE_X = [250, 750] as const;
const LOOSE_Y = [250, 480] as const;
/** Quantos lugares sorteia por carta solta; fica o que está mais longe das outras. */
const LOOSE_TRIES = 14;
/** Giro máximo, em graus, pra cada lado. */
const LOOSE_TILT = 24;
/** O eixo y pesa mais na distância por causa da inclinação do feltro. */
const LOOSE_Y_WEIGHT = 1.4;

/**
 * Lugar de uma carta solta no feltro na fase de escolha. [x, y] é o mesmo ponto de `tableSlots`
 * (embaixo, no centro da carta) e o terceiro valor é o giro em graus. Fica longe das já usadas.
 */
export function looseSpot(used: readonly Pt[], rng: Rng): Spot {
  const between = (a: number, b: number): number => a + rng() * (b - a);
  let best: Pt = [0, 0];
  let bestD = -1;
  for (let t = 0; t < LOOSE_TRIES; t++) {
    const c: Pt = [between(...LOOSE_X), between(...LOOSE_Y)];
    // Sem cartas usadas todo candidato vale igual (fica o primeiro).
    const d = used.length ? Math.min(...used.map((u) => Math.hypot(u[0] - c[0], (u[1] - c[1]) * LOOSE_Y_WEIGHT))) : 1;
    if (d > bestD) {
      bestD = d;
      best = c;
    }
  }
  return [best[0], best[1], between(-LOOSE_TILT, LOOSE_TILT)];
}
