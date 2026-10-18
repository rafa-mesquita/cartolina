import { CW, FH, FW, NAT_STEP, ROW_S, ROW_X0, ROW_X1, ROW_Y } from './constants';

export interface GapSpec {
  owner: string;
  index: number;
}

export type RowEntry =
  | { kind: 'card'; id: string; x: number; slot: number }
  | { kind: 'gap'; owner: string; x: number; slot: number };

/** Posições x (coordenadas do feltro) das cartas e buracos, centradas e comprimidas se não couberem. */
export function rowEntries(row: readonly string[], gaps: readonly GapSpec[]): RowEntry[] {
  const n = row.length;
  const clamped = gaps.map((g) => ({ owner: g.owner, index: Math.max(0, Math.min(g.index, n)) }));
  const items: Array<{ kind: 'card'; id: string } | { kind: 'gap'; owner: string }> = [];
  for (let i = 0; i <= n; i++) {
    for (const g of clamped) if (g.index === i) items.push({ kind: 'gap', owner: g.owner });
    if (i < n) items.push({ kind: 'card', id: row[i]! });
  }
  const m = items.length;
  const w = CW * ROW_S;
  const step = m > 1 ? Math.min(NAT_STEP, (ROW_X1 - ROW_X0 - w) / (m - 1)) : 0;
  const x0 = FW / 2 - (w + step * (m - 1)) / 2 + w / 2;
  return items.map((it, slot) => ({ ...it, x: x0 + slot * step, slot }));
}

/** Índice de inserção (entre as cartas visíveis) para um ponto x do feltro. */
export function insertIndex(entries: readonly RowEntry[], lx: number): number {
  let n = 0;
  for (const e of entries) if (e.kind === 'card' && e.x < lx) n++;
  return n;
}

export type Intent =
  /** `after`: carta logo antes da minha na fila (ordem do servidor, já com a intenção anterior); null = primeira. */
  | { kind: 'place'; cardId: string; index: number; after: string | null; at: number }
  | { kind: 'return'; cardId: string; at: number };

export const INTENT_TTL_MS = 1500;

/** Fila que este cliente mostra: a do servidor + minha intenção pendente − cartas em voo. */
export function effectiveRow(serverRow: readonly string[], pending: Intent | null, inFlight: ReadonlySet<string>): string[] {
  let row = [...serverRow];
  if (pending) {
    row = row.filter((id) => id !== pending.cardId);
    if (pending.kind === 'place') {
      // Ancorada no vizinho: colocações concorrentes antes dela não a deslocam.
      const anchor = pending.after === null ? -1 : row.indexOf(pending.after);
      const at = anchor >= 0 ? anchor + 1 : Math.min(pending.index, row.length);
      row.splice(at, 0, pending.cardId);
    }
  }
  return row.filter((id) => !inFlight.has(id));
}

export function intentSettled(serverRow: readonly string[], pending: Intent, now: number): boolean {
  if (now - pending.at > INTENT_TTL_MS) return true;
  if (pending.kind === 'return') return !serverRow.includes(pending.cardId);
  // Bate pelo vizinho (colocações concorrentes antes da minha) OU pelo índice (alguém mexeu na minha âncora).
  const pos = serverRow.indexOf(pending.cardId);
  return pos >= 0 && (pos === pending.index || (pos === 0 ? null : serverRow[pos - 1]) === pending.after);
}

/**
 * Converte "índice entre as cartas que eu vejo" para o índice que o servidor espera em `place`.
 * Anda para trás até a primeira carta visível que o servidor também conhece (cartas pendentes só existem aqui).
 */
export function toServerIndex(visible: readonly string[], server: readonly string[], cardId: string, index: number): number {
  const base = server.filter((id) => id !== cardId);
  for (let i = Math.min(index, visible.length) - 1; i >= 0; i--) {
    const pos = base.indexOf(visible[i]!);
    if (pos >= 0) return pos + 1;
  }
  return 0;
}

/** Inverso de `toServerIndex`: onde abrir o buraco de um arrasto remoto na fila que eu vejo (logo após a última carta anterior). */
export function toVisibleIndex(visible: readonly string[], server: readonly string[], cardId: string, index: number): number {
  const before = new Set(server.filter((id) => id !== cardId).slice(0, index));
  let pos = 0;
  visible.forEach((id, i) => {
    if (before.has(id)) pos = i + 1;
  });
  return pos;
}

/**
 * Cursor que os outros recebem. `overMine`: o mouse está sobre a minha área (mão, avatar, "tô pronto"), que fica
 * por cima da beirada de baixo da mesa. Aí vai como "na mão" (os outros veem a seta no meu assento): mandado como
 * posição da mesa, caía em cima da mão de quem olha, e os cursores de todo mundo se juntavam ali.
 */
export function cursorFromLocal(lx: number, ly: number, overMine = false): { zone: 'table' | 'hand'; x: number; y: number } {
  const inside = !overMine && lx > -60 && lx < FW + 60 && ly > -60 && ly < FH + 60;
  if (!inside) return { zone: 'hand', x: 0, y: 0 };
  const clamp = (v: number) => Math.max(-1, Math.min(2, v));
  return { zone: 'table', x: clamp(lx / FW), y: clamp(ly / FH) };
}

export function inRowZone(lx: number, ly: number): boolean {
  return lx > -40 && lx < FW + 40 && ly > ROW_Y - 150 && ly < FH + 50;
}
