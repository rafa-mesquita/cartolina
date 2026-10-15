export type Point = readonly [number, number];
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

/** Homografia que leva os 4 pontos `src` aos 4 pontos `dst` (eliminação de Gauss com pivô parcial). */
export function solveH(src: readonly Point[], dst: readonly Point[]): Mat3 {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i]!;
    const [u, v] = dst[i]!;
    A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -x * v, -y * v]);
    b.push(v);
  }
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r]![c]!) > Math.abs(A[p]![c]!)) p = r;
    [A[c], A[p]] = [A[p]!, A[c]!];
    [b[c], b[p]] = [b[p]!, b[c]!];
    const pivot = A[c]!;
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const row = A[r]!;
      const f = row[c]! / pivot[c]!;
      if (!f) continue;
      for (let k = c; k < 8; k++) row[k] = row[k]! - f * pivot[k]!;
      b[r] = b[r]! - f * b[c]!;
    }
  }
  const h = b.map((v, i) => v / A[i]![i]!);
  return [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!, 1];
}

export function inv3(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    A / det,
    -(b * i - c * h) / det,
    (b * f - c * e) / det,
    B / det,
    (a * i - c * g) / det,
    -(a * f - c * d) / det,
    C / det,
    -(a * h - b * g) / det,
    (a * e - b * d) / det,
  ];
}

export function applyH(m: Mat3, x: number, y: number): [number, number] {
  const w = m[6] * x + m[7] * y + m[8];
  return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w];
}

/** `solveH` que devolve null quando os pontos são degenerados (pivô ~ 0 ou resultado não finito). */
export function solveHSafe(src: readonly Point[], dst: readonly Point[]): Mat3 | null {
  const H = solveH(src, dst);
  return H.every(Number.isFinite) && isRegular(H) ? H : null;
}

/** `inv3` que devolve null para matriz singular. */
export function inv3Safe(m: Mat3): Mat3 | null {
  if (!isRegular(m)) return null;
  const inv = inv3(m);
  return inv.every(Number.isFinite) ? inv : null;
}

function isRegular(m: Mat3): boolean {
  const [a, b, c, d, e, f, g, h, i] = m;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  return Number.isFinite(det) && Math.abs(det) >= 1e-12;
}
