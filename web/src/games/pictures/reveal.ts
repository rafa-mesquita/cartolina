import type { Coord, PicturesRoundResult } from '@cartolina/shared';

/** Passo da obra que está sendo revelada. */
export type RevealStep = 'grow' | 'tapes' | 'photo' | 'mark' | 'points';

export type RevealEvent =
  /** A obra anterior sai de cena (a próxima entra no `grow`). */
  | { at: number; kind: 'out'; artistIndex: number }
  | { at: number; kind: 'grow'; artistIndex: number }
  | { at: number; kind: 'tape'; artistIndex: number; guesser: string; coord: Coord | null; index: number }
  | { at: number; kind: 'photo'; artistIndex: number; coord: Coord }
  | { at: number; kind: 'mark'; artistIndex: number }
  | { at: number; kind: 'points'; artistIndex: number }
  /** Um adesivo "+n" saindo do selinho de `player`. */
  | { at: number; kind: 'plus'; artistIndex: number; player: string; n: number; index: number }
  | { at: number; kind: 'done' };

export interface RevealTape {
  guesser: string;
  coord: Coord | null;
}

/** O que aparece num instante da revelação. */
export interface RevealFrame {
  /** Obra da vez (índice em `result.order`); -1 antes da primeira. */
  artistIndex: number;
  step: RevealStep | null;
  /** A obra da vez está saindo de cena (fade antes da próxima). */
  leaving: boolean;
  /** Fitinhas de palpite já coladas na obra da vez. */
  tapes: RevealTape[];
  /** A foto verdadeira da obra da vez já saiu da grade. */
  photoShown: boolean;
  /** As fitinhas da obra da vez já ganharam ✓ / cinza. */
  marked: boolean;
  /** Adesivos "+n" da obra da vez já mostrados. */
  plus: { player: string; n: number }[];
  /** Placar até aqui: começa no de antes da rodada e chega no final no `done`. */
  scoresSoFar: Record<string, number>;
  done: boolean;
}

/** Tempos (ms): os passos do plano, as pausas do protótipo. */
export const REVEAL_MS = { start: 300, out: 380, grow: 900, tapes: 1200, photo: 1200, mark: 800, points: 1000, plusGap: 220, plusSpread: 700, end: 500, empty: 2400 };

/** Quem pontua com a obra de `artist`, na ordem dos adesivos: o artista (+1 por acerto) e depois cada um que acertou (+1). */
export function workPoints(r: PicturesRoundResult, artist: string): { player: string; n: number }[] {
  const right = r.correct[artist] ?? [];
  return right.length ? [{ player: artist, n: right.length }, ...right.map((g) => ({ player: g, n: 1 }))] : [];
}

/**
 * Sequência da revelação narrada; `players` = quem jogou a rodada (todos palpitam em todas as obras, menos na própria).
 * `order` vazio ("ninguém montou nada nesta rodada"): só o `done`, depois de uma pausa pra ler o aviso.
 */
export function buildRevealTimeline(r: PicturesRoundResult, players: readonly string[]): RevealEvent[] {
  const T = REVEAL_MS;
  if (r.order.length === 0) return [{ at: T.empty, kind: 'done' }];
  const ev: RevealEvent[] = [];
  let t = T.start;
  r.order.forEach((artist, k) => {
    if (k > 0) {
      ev.push({ at: t, kind: 'out', artistIndex: k - 1 });
      t += T.out;
    }
    ev.push({ at: t, kind: 'grow', artistIndex: k });
    t += T.grow;
    const guessers = players.filter((p) => p !== artist);
    const step = T.tapes / (guessers.length + 1);
    guessers.forEach((g, index) => {
      const own = Object.hasOwn(r.guesses, g) ? r.guesses[g]! : {};
      const coord = Object.hasOwn(own, artist) ? own[artist]! : null;
      ev.push({ at: Math.round(t + index * step), kind: 'tape', artistIndex: k, guesser: g, coord, index });
    });
    t += T.tapes;
    ev.push({ at: t, kind: 'photo', artistIndex: k, coord: r.secrets[artist]! });
    t += T.photo;
    ev.push({ at: t, kind: 'mark', artistIndex: k });
    t += T.mark;
    ev.push({ at: t, kind: 'points', artistIndex: k });
    const pts = workPoints(r, artist);
    const gap = Math.min(T.plusGap, T.plusSpread / Math.max(1, pts.length));
    pts.forEach(({ player, n }, index) => ev.push({ at: Math.round(t + index * gap), kind: 'plus', artistIndex: k, player, n, index }));
    t += T.points;
  });
  t += T.end;
  ev.push({ at: t, kind: 'done' });
  return ev;
}

/** Placar de antes da rodada (o da visão já vem com os pontos dela). */
export function scoresBefore(scores: Readonly<Record<string, number>>, r: PicturesRoundResult): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [p, s] of Object.entries(scores)) out[p] = s - (r.gained[p] ?? 0);
  return out;
}

/**
 * O quadro no instante `t` (ms desde o começo; `Infinity` = pulou pro fim). `before` = placar de antes da rodada
 * (`scoresBefore`). Supõe `events` em ordem crescente de `at` (como `buildRevealTimeline` entrega).
 */
export function frameAt(events: readonly RevealEvent[], t: number, before: Readonly<Record<string, number>>): RevealFrame {
  const f: RevealFrame = { artistIndex: -1, step: null, leaving: false, tapes: [], photoShown: false, marked: false, plus: [], scoresSoFar: { ...before }, done: false };
  for (const e of events) {
    if (e.at > t) break;
    switch (e.kind) {
      case 'out':
        f.leaving = true;
        break;
      case 'grow':
        Object.assign(f, { artistIndex: e.artistIndex, step: 'grow', leaving: false, tapes: [], photoShown: false, marked: false, plus: [] });
        break;
      case 'tape':
        f.step = 'tapes';
        f.tapes.push({ guesser: e.guesser, coord: e.coord });
        break;
      case 'photo':
        f.step = 'photo';
        f.photoShown = true;
        break;
      case 'mark':
        f.step = 'mark';
        f.marked = true;
        break;
      case 'points':
        f.step = 'points';
        break;
      case 'plus':
        f.plus.push({ player: e.player, n: e.n });
        f.scoresSoFar[e.player] = (f.scoresSoFar[e.player] ?? 0) + e.n;
        break;
      case 'done':
        f.done = true;
        f.step = null;
        f.leaving = false;
        break;
    }
  }
  return f;
}
