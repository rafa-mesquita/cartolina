import type { CursorFx, ItoRoomView } from '@cartolina/shared';
import { isPlaying } from '../../game/derive';
import { FH, FW, ROW_Y } from '../constants';
import { rowEntries, toServerIndex } from '../rowLayout';

/** Um espaço "aqui" na fila em pé: `pos` = posição visual (0 = antes da 1ª faixa); `index` = índice do `place` no servidor. */
export interface SlotTarget {
  pos: number;
  index: number;
}

/**
 * Espaços onde `movingId` pode cair. `row` é a fila mostrada (com minhas intenções pendentes); `serverRow` é a
 * ordem do servidor (com minhas intenções já aplicadas, o `placeBase`), que dá o índice do `place` (igual ao
 * computador, via `toServerIndex`). O índice ignora a própria carta.
 * Se ela já está na fila, os espaços colados nela (antes e depois) somem: soltar ali não muda nada.
 */
export function slotTargets(row: readonly string[], movingId: string, serverRow: readonly string[] = row): SlotTarget[] {
  const at = row.indexOf(movingId);
  const others = row.filter((id) => id !== movingId);
  const out: SlotTarget[] = [];
  for (let pos = 0; pos <= row.length; pos++) {
    if (at >= 0 && (pos === at || pos === at + 1)) continue;
    const visibleIndex = row.slice(0, pos).filter((id) => id !== movingId).length;
    out.push({ pos, index: toServerIndex(others, serverRow, movingId, visibleIndex) });
  }
  return out;
}

/**
 * Pode pegar a carta agora? Só na escolha e só quem joga a rodada. Carta da fila: qualquer um move.
 * Carta fora da fila: só o dono (a mão é dele).
 */
export function canPick(view: ItoRoomView, cardId: string): boolean {
  if (view.game.phase !== 'sorting' || !isPlaying(view)) return false;
  const card = view.game.cards[cardId];
  if (!card) return false;
  return view.game.row.includes(cardId) || card.owner === view.you;
}

/** `index` é o índice do servidor (o mesmo do `place`). Onde estaria o vão na fila deitada do PC (pra quem está no computador ver o arrasto do celular no lugar certo). */
export function deskCursor(row: readonly string[], cardId: string, index: number): { zone: 'table'; x: number; y: number } {
  const base = row.filter((id) => id !== cardId);
  const gap = rowEntries(base, [{ owner: '_', index }]).find((e) => e.kind === 'gap');
  return { zone: 'table', x: (gap?.x ?? FW / 2) / FW, y: ROW_Y / FH };
}

/**
 * Cursor "estacionado": o mesmo que o PC manda com o mouse fora da mesa (`cursorFromLocal`). Lá a seta vai pro
 * assento de quem joga em vez de ficar na fila. O celular manda este ao soltar: como o `keepalive` da conexão
 * reenvia o último cursor a cada 2 s, qualquer outro deixaria a seta presa sobre a fila nos PCs.
 */
export const PARKED_CURSOR: CursorFx = Object.freeze({ zone: 'hand', x: 0, y: 0, drag: null });

/** Posição visual (0..n) pelo y do dedo: conta quantas faixas têm o meio acima dele. */
export function posFromY(y: number, rects: ReadonlyArray<{ top: number; bottom: number }>): number {
  let n = 0;
  for (const r of rects) if ((r.top + r.bottom) / 2 < y) n++;
  return n;
}
