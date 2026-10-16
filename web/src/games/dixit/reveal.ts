import type { DixitRoundResult } from '@cartolina/shared';

/** Pedaço de legenda; `em` = destaque (nome, dica). */
export interface Part {
  text: string;
  em?: boolean;
}
export interface Caption {
  step: 1 | 2 | 3 | 4;
  parts: Part[];
}
export type RevealEvent =
  | { at: number; kind: 'spot'; caption: Caption }
  | { at: number; kind: 'unspot'; caption: Caption }
  | { at: number; kind: 'caption'; caption: Caption }
  | { at: number; kind: 'vote'; voter: string; card: string; index: number }
  | { at: number; kind: 'owner'; card: string }
  | { at: number; kind: 'hop'; player: string }
  | { at: number; kind: 'done' };

/** O que aparece na mesa num instante da revelação. */
export interface RevealFrame {
  caption: Caption | null;
  /** Holofote na carta do narrador (passo 1). */
  spot: boolean;
  /** A carta do narrador já foi mostrada (fica destacada até o fim). */
  storyMarked: boolean;
  votes: { voter: string; card: string }[];
  /** Cartas cujo dono já apareceu. */
  owners: string[];
  /** Pulos de peão já dados, por jogador. */
  hops: Record<string, number>;
  done: boolean;
}

/** Tempos (ms) aprovados no protótipo. */
export const REVEAL_MS = { start: 400, spot: 2600, vote: 260, afterVotes: 500, summary: 2600, owner: 200, afterOwners: 400, fooled: 2800, hop: 190, betweenPlayers: 250, end: 500 };

type Name = (id: string) => string;

export const captionText = (parts: readonly Part[]): string => parts.map((p) => p.text).join('');

function listParts(ids: readonly string[], name: Name): Part[] {
  const out: Part[] = [];
  ids.forEach((id, i) => {
    if (i > 0) out.push({ text: i === ids.length - 1 ? ' e ' : ', ' });
    out.push({ text: name(id), em: true });
  });
  return out;
}

/** "A e B acharam a carta do narrador" / "ninguém votou" / "ninguém achou…" / "todo mundo achou…". */
export function summaryParts(r: DixitRoundResult, name: Name): Part[] {
  const n = r.found.length, voters = Object.keys(r.votes).length;
  if (voters === 0) return [{ text: 'ninguém votou' }];
  if (n === 0) return [{ text: 'ninguém achou a carta do narrador' }];
  if (n === voters) return [{ text: 'todo mundo achou: a dica foi fácil demais' }];
  return [...listParts(r.found, name), { text: ` ${n === 1 ? 'achou' : 'acharam'} a carta do narrador` }];
}

/** Quantas pessoas cada carta (que não é a do narrador) enganou, da que mais enganou pra menos. */
export function fooledCounts(r: DixitRoundResult): [string, number][] {
  const counts = new Map<string, number>();
  for (const card of Object.values(r.votes)) {
    const owner = r.owners[card];
    if (owner !== undefined && owner !== r.storyteller) counts.set(owner, (counts.get(owner) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

/** "a carta de X enganou 2 pessoas · …" (até 3). Se X é `me`: "a sua carta enganou…". */
export function fooledParts(r: DixitRoundResult, name: Name, me: string | null = null): Part[] {
  const top = fooledCounts(r).slice(0, 3);
  if (top.length === 0) return [{ text: 'nenhuma carta enganou ninguém' }];
  const out: Part[] = [];
  top.forEach(([p, k], i) => {
    if (i > 0) out.push({ text: ' · ' });
    if (p === me) out.push({ text: 'a ' }, { text: 'sua', em: true }, { text: ' carta' });
    else out.push({ text: 'a carta de ' }, { text: name(p), em: true });
    out.push({ text: ` enganou ${k} ${k === 1 ? 'pessoa' : 'pessoas'}` });
  });
  return out;
}

/** Por que `p` fez os pontos da rodada (regra da caixa). */
export function reasons(r: DixitRoundResult, p: string): { points: number; text: string }[] {
  const voters = Object.keys(r.votes), n = r.found.length, allOrNone = n === 0 || n === voters.length;
  const out: { points: number; text: string }[] = [];
  if (p === r.storyteller) {
    out.push(allOrNone
      ? { points: 0, text: voters.length === 0 ? 'ninguém votou: quem narra não pontua' : n === 0 ? 'ninguém achou a carta: quem narra não pontua' : 'todo mundo achou a carta: quem narra não pontua' }
      : { points: 3, text: 'alguém achou a carta, mas não todos' });
  } else if (r.votes[p] === undefined) out.push({ points: 0, text: 'não votou' });
  else if (allOrNone) out.push({ points: 2, text: n === 0 ? 'ninguém achou: +2 pra quem votou' : 'todo mundo achou: +2 pra quem votou' });
  else out.push(r.found.includes(p) ? { points: 3, text: 'achou a carta do narrador' } : { points: 0, text: 'não achou a carta do narrador' });
  const bonus = Object.values(r.votes).filter((c) => r.owners[c] === p && p !== r.storyteller).length;
  if (bonus) out.push({ points: bonus, text: `enganou ${bonus} ${bonus === 1 ? 'pessoa' : 'pessoas'}` });
  return out;
}

/**
 * Sequência da revelação narrada; `order` = ordem em que os peões andam (assentos).
 * Só quem está em `order` ganha pulos: passe todos os da rodada (`inRound`).
 * Se o narrador é `me`, a legenda diz "a sua carta, que você narrou".
 */
export function buildRevealTimeline(r: DixitRoundResult, order: readonly string[], name: Name, me: string | null = null): RevealEvent[] {
  const T = REVEAL_MS;
  const ev: RevealEvent[] = [];
  let t = T.start;
  const clue: Part[] = r.clue ? [{ text: ' ' }, { text: `“${r.clue}”`, em: true }] : [];
  const whose: Part[] = r.storyteller === me
    ? [{ text: 'esta era a ' }, { text: 'sua', em: true }, { text: ' carta, que você narrou' }]
    : [{ text: 'esta era a carta de ' }, { text: name(r.storyteller), em: true }, { text: ', que narrou' }];
  ev.push({ at: t, kind: 'spot', caption: { step: 1, parts: [...whose, ...clue] } });
  t += T.spot;
  ev.push({ at: t, kind: 'unspot', caption: { step: 2, parts: [{ text: 'os votos…' }] } });
  Object.entries(r.votes).forEach(([voter, card], index) => {
    t += T.vote;
    ev.push({ at: t, kind: 'vote', voter, card, index });
  });
  t += T.afterVotes;
  ev.push({ at: t, kind: 'caption', caption: { step: 2, parts: summaryParts(r, name) } });
  t += T.summary;
  ev.push({ at: t, kind: 'caption', caption: { step: 3, parts: [{ text: 'de quem era cada carta…' }] } });
  for (const card of r.table) {
    t += T.owner;
    ev.push({ at: t, kind: 'owner', card });
  }
  t += T.afterOwners;
  ev.push({ at: t, kind: 'caption', caption: { step: 3, parts: fooledParts(r, name, me) } });
  t += T.fooled;
  ev.push({ at: t, kind: 'caption', caption: { step: 4, parts: [{ text: 'os pontos da rodada…' }] } });
  for (const p of order) {
    const g = r.gained[p] ?? 0;
    if (!g) continue;
    for (let i = 0; i < g; i++) {
      t += T.hop;
      ev.push({ at: t, kind: 'hop', player: p });
    }
    t += T.betweenPlayers;
  }
  t += T.end;
  ev.push({ at: t, kind: 'done' });
  return ev;
}

/** O quadro no instante `t` (ms desde o começo da revelação; `Infinity` = pulou pro fim). Supõe `events` em ordem crescente de `at` (como `buildRevealTimeline` entrega). */
export function frameAt(events: readonly RevealEvent[], t: number): RevealFrame {
  const f: RevealFrame = { caption: null, spot: false, storyMarked: false, votes: [], owners: [], hops: {}, done: false };
  for (const e of events) {
    if (e.at > t) break;
    switch (e.kind) {
      case 'spot':
        f.spot = true;
        f.storyMarked = true;
        f.caption = e.caption;
        break;
      case 'unspot':
        f.spot = false;
        f.caption = e.caption;
        break;
      case 'caption':
        f.caption = e.caption;
        break;
      case 'vote':
        f.votes.push({ voter: e.voter, card: e.card });
        break;
      case 'owner':
        f.owners.push(e.card);
        break;
      case 'hop':
        f.hops[e.player] = (f.hops[e.player] ?? 0) + 1;
        break;
      case 'done':
        f.done = true;
        f.caption = null;
        break;
    }
  }
  return f;
}

/** Placar que os peões mostram: durante a revelação, os pontos novos entram pulo a pulo. */
export function scoresDuring(scores: Readonly<Record<string, number>>, r: DixitRoundResult | null, frame: RevealFrame | null): Record<string, number> {
  if (!r || !frame || frame.done) return { ...scores };
  const out: Record<string, number> = {};
  for (const [p, s] of Object.entries(scores)) out[p] = s - (r.gained[p] ?? 0) + (frame.hops[p] ?? 0);
  return out;
}
