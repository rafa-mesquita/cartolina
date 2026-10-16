import type { DixitRoundResult } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { buildRevealTimeline, captionText, frameAt, fooledParts, reasons, scoresDuring, summaryParts } from '../src/games/dixit/reveal';

const name = (id: string) => ({ n: 'Nina', a: 'Ana', b: 'Bia', c: 'Caio' })[id] ?? id;
const base: Omit<DixitRoundResult, 'votes' | 'gained' | 'found'> = {
  storyteller: 'n',
  storyCard: 'c0',
  clue: 'luar',
  table: ['ca', 'c0', 'cb', 'cc'],
  owners: { c0: 'n', ca: 'a', cb: 'b', cc: 'c' },
};
const some: DixitRoundResult = { ...base, votes: { a: 'c0', b: 'ca', c: 'c0' }, gained: { n: 3, a: 4, b: 0, c: 3 }, found: ['a', 'c'] };
const none: DixitRoundResult = { ...base, votes: { a: 'cb', b: 'ca', c: 'ca' }, gained: { n: 0, a: 4, b: 3, c: 2 }, found: [] };
const all: DixitRoundResult = { ...base, votes: { a: 'c0', b: 'c0', c: 'c0' }, gained: { n: 0, a: 2, b: 2, c: 2 }, found: ['a', 'b', 'c'] };

describe('frases', () => {
  it('quem achou', () => {
    expect(captionText(summaryParts(some, name))).toBe('Ana e Caio acharam a carta do narrador');
    expect(captionText(summaryParts(none, name))).toBe('ninguém achou a carta do narrador');
    expect(captionText(summaryParts(all, name))).toBe('todo mundo achou: a dica foi fácil demais');
  });

  it('quem enganou', () => {
    expect(captionText(fooledParts(none, name))).toBe('a carta de Ana enganou 2 pessoas · a carta de Bia enganou 1 pessoa');
    expect(captionText(fooledParts(all, name))).toBe('nenhuma carta enganou ninguém');
  });
});

describe('motivos dos pontos', () => {
  it('alguns acharam', () => {
    expect(reasons(some, 'n')).toEqual([{ points: 3, text: 'alguém achou a carta, mas não todos' }]);
    expect(reasons(some, 'a')).toEqual([{ points: 3, text: 'achou a carta do narrador' }, { points: 1, text: 'enganou 1 pessoa' }]);
    expect(reasons(some, 'b')).toEqual([{ points: 0, text: 'não achou a carta do narrador' }]);
  });

  it('ninguém e todos acharam; quem não votou', () => {
    expect(reasons(none, 'n')).toEqual([{ points: 0, text: 'ninguém achou a carta: quem narra não pontua' }]);
    expect(reasons(all, 'b')).toEqual([{ points: 2, text: 'todo mundo achou: +2 pra quem votou' }]);
    const partial: DixitRoundResult = { ...some, votes: { a: 'c0', b: 'ca' }, gained: { n: 3, a: 4, b: 0, c: 0 }, found: ['a'] };
    expect(reasons(partial, 'c')).toEqual([{ points: 0, text: 'não votou' }]);
  });
});

describe('linha do tempo', () => {
  const ev = buildRevealTimeline(some, ['n', 'a', 'b', 'c'], name);

  it('holofote primeiro, votos, donos, pulos e fim, em ordem crescente de tempo', () => {
    expect(ev[0]!.kind).toBe('spot');
    expect(ev.filter((e) => e.kind === 'vote')).toHaveLength(3);
    expect(ev.filter((e) => e.kind === 'owner')).toHaveLength(4);
    expect(ev.filter((e) => e.kind === 'hop')).toHaveLength(3 + 4 + 3);
    expect(ev[ev.length - 1]!.kind).toBe('done');
    for (let i = 1; i < ev.length; i++) expect(ev[i]!.at).toBeGreaterThanOrEqual(ev[i - 1]!.at);
  });

  it('quadro no começo, no holofote e no fim', () => {
    const f0 = frameAt(ev, 0);
    expect(f0).toMatchObject({ caption: null, spot: false, storyMarked: false, votes: [], owners: [], done: false });
    const f1 = frameAt(ev, ev[0]!.at);
    expect(f1.spot).toBe(true);
    expect(captionText(f1.caption!.parts)).toBe('esta era a carta de Nina, que narrou “luar”');
    const end = frameAt(ev, Infinity);
    expect(end).toMatchObject({ spot: false, storyMarked: true, done: true, caption: null });
    expect(end.votes).toHaveLength(3);
    expect(end.owners).toEqual(base.table);
    expect(end.hops).toEqual({ n: 3, a: 4, c: 3 });
  });

  it('placar durante a revelação: os pontos novos entram pulo a pulo', () => {
    const scores = { n: 13, a: 14, b: 9, c: 3 };
    expect(scoresDuring(scores, some, frameAt(ev, 0))).toEqual({ n: 10, a: 10, b: 9, c: 0 });
    expect(scoresDuring(scores, some, frameAt(ev, Infinity))).toEqual(scores);
    expect(scoresDuring(scores, null, null)).toEqual(scores);
  });
});
