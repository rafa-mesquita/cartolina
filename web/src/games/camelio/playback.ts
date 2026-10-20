import type { CamelioView } from '@cartolina/shared';

/**
 * Quantas views a fila aguenta antes de pular direto (sem animar). O destino da animação em curso
 * também está na fila: com uma animação rodando, a 3ª jogada que chega já faz a tela pular.
 */
export const MAX_BEHIND = 2;

export interface Playback {
  /** O que está desenhado. Durante a animação, a view de antes da jogada. */
  shown: CamelioView | null;
  /** Views que chegaram e ainda não foram desenhadas, em ordem. */
  queue: CamelioView[];
  /** Animação em curso: shown → queue[0]. */
  animating: boolean;
}

export const emptyPlayback: Playback = { shown: null, queue: [], animating: false };

/** `next` é a jogada seguinte de `prev` (mesma partida, uma jogada a mais, com `last`). */
export function isNextPlay(prev: CamelioView, next: CamelioView): boolean {
  return next.match === prev.match && next.playCount === prev.playCount + 1 && next.last !== null;
}

/** Chegou uma view do servidor. */
export function receive(p: Playback, v: CamelioView): Playback {
  if (!p.shown) return { shown: v, queue: [], animating: false };
  const tail = p.queue[p.queue.length - 1] ?? p.shown;
  const sameStep = v.match === tail.match && v.playCount === tail.playCount;
  if (sameStep) {
    if (p.queue.length === 0) return p.animating ? { ...p, queue: [v] } : { ...p, shown: v };
    return { ...p, queue: [...p.queue.slice(0, -1), v] };
  }
  const queue = [...p.queue, v];
  return queue.length > MAX_BEHIND ? { ...p, queue: [v] } : { ...p, queue };
}

/** Avança: desenha direto o que não dá pra animar; devolve o que animar agora (ou null). */
export function step(p: Playback): { playback: Playback; anim: { prev: CamelioView; next: CamelioView } | null } {
  let cur = p;
  while (!cur.animating && cur.queue.length > 0 && cur.shown) {
    const next = cur.queue[0]!;
    if (isNextPlay(cur.shown, next)) return { playback: { ...cur, animating: true }, anim: { prev: cur.shown, next } };
    cur = { ...cur, shown: next, queue: cur.queue.slice(1) };
  }
  return { playback: cur, anim: null };
}

/** A animação terminou (ou foi interrompida): a view de destino passa a ser a desenhada. */
export function finish(p: Playback): Playback {
  if (!p.animating) return p;
  const [next, ...rest] = p.queue;
  return { shown: next ?? p.shown, queue: rest, animating: false };
}
