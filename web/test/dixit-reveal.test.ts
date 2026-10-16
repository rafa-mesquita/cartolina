import { scoreRound } from '@cartolina/shared';
import type { DixitRoundResult } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { buildRevealTimeline, captionText, frameAt, fooledParts, reasons, scoresDuring, summaryParts } from '../src/games/dixit/reveal';

const name = (id: string) => ({ n: 'Nina', a: 'Ana', b: 'Bia', c: 'Caio' })[id] ?? id;
const jogadores = ['n', 'a', 'b', 'c'];
const base = {
  storyteller: 'n',
  storyCard: 'c0',
  clue: 'luar',
  table: ['ca', 'c0', 'cb', 'cc'],
  owners: { c0: 'n', ca: 'a', cb: 'b', cc: 'c' },
};
/** Resultado com pontos e "quem achou" calculados pela regra de verdade (`scoreRound`). */
const resultado = (votes: Record<string, string>, extra: Partial<DixitRoundResult> = {}): DixitRoundResult => ({
  ...base,
  ...scoreRound({ ...base, inRound: jogadores, votes }),
  votes,
  ...extra,
});
const some = resultado({ a: 'c0', b: 'ca', c: 'c0' });
const none = resultado({ a: 'cb', b: 'ca', c: 'ca' });
const all = resultado({ a: 'c0', b: 'c0', c: 'c0' });
const noVotes = resultado({});

describe('resultados de teste', () => {
  it('batem com o que a regra calcula', () => {
    expect(some.gained).toEqual({ n: 3, a: 4, b: 0, c: 3 });
    expect(none.gained).toEqual({ n: 0, a: 4, b: 3, c: 2 });
    expect(all.gained).toEqual({ n: 0, a: 2, b: 2, c: 2 });
  });
});

describe('frases', () => {
  it('quem achou', () => {
    expect(captionText(summaryParts(some, name))).toBe('Ana e Caio acharam a carta do narrador');
    expect(captionText(summaryParts(none, name))).toBe('ninguém achou a carta do narrador');
    expect(captionText(summaryParts(all, name))).toBe('todo mundo achou: a dica foi fácil demais');
  });

  it('um só achou (singular) e três nomes na lista', () => {
    const um = resultado({ a: 'c0', b: 'ca', c: 'cb' });
    expect(captionText(summaryParts(um, name))).toBe('Ana achou a carta do narrador');
    const tres: DixitRoundResult = { ...some, found: ['a', 'b', 'c'] };
    expect(captionText(summaryParts({ ...tres, votes: { ...some.votes, d: 'cb' } }, name))).toBe('Ana, Bia e Caio acharam a carta do narrador');
  });

  it('ninguém votou', () => {
    expect(captionText(summaryParts(noVotes, name))).toBe('ninguém votou');
  });

  it('quem enganou', () => {
    expect(captionText(fooledParts(none, name))).toBe('a carta de Ana enganou 2 pessoas · a carta de Bia enganou 1 pessoa');
    expect(captionText(fooledParts(all, name))).toBe('nenhuma carta enganou ninguém');
  });

  it('singular, e "sua carta" quando o dono é quem está vendo', () => {
    expect(captionText(fooledParts(some, name))).toBe('a carta de Ana enganou 1 pessoa');
    expect(captionText(fooledParts(none, name, 'a'))).toBe('a sua carta enganou 2 pessoas · a carta de Bia enganou 1 pessoa');
    expect(captionText(fooledParts(none, (id) => (id === 'b' ? 'você' : name(id)), 'b'))).toBe('a carta de Ana enganou 2 pessoas · a sua carta enganou 1 pessoa');
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

describe('motivos × regra', () => {
  const cenarios: [string, DixitRoundResult][] = [
    ['alguns acharam', some],
    ['ninguém achou', none],
    ['todos acharam', all],
    ['alguém não votou', resultado({ a: 'c0', b: 'ca' })],
    ['alguém não votou e ninguém achou', resultado({ a: 'cb', b: 'ca' })],
    ['todos os que votaram acharam, um não votou', resultado({ a: 'c0', b: 'c0' })],
    ['ninguém votou', noVotes],
  ];
  it.each(cenarios)('a soma dos motivos é o que a regra deu: %s', (_nome, r) => {
    for (const p of jogadores) {
      const soma = reasons(r, p).reduce((acc, m) => acc + m.points, 0);
      expect(soma, `jogador ${p}`).toBe(r.gained[p]);
    }
  });

  it('ninguém votou: o narrador não pontua e diz por quê', () => {
    expect(reasons(noVotes, 'n')).toEqual([{ points: 0, text: 'ninguém votou: quem narra não pontua' }]);
  });
});

describe('linha do tempo', () => {
  const ev = buildRevealTimeline(some, jogadores, name);

  it('holofote primeiro, votos, donos, pulos e fim, em ordem crescente de tempo', () => {
    expect(ev[0]!.kind).toBe('spot');
    expect(ev.filter((e) => e.kind === 'vote')).toHaveLength(3);
    expect(ev.filter((e) => e.kind === 'owner')).toHaveLength(4);
    expect(ev.filter((e) => e.kind === 'hop')).toHaveLength(3 + 4 + 3);
    expect(ev[ev.length - 1]!.kind).toBe('done');
    for (let i = 1; i < ev.length; i++) expect(ev[i]!.at).toBeGreaterThan(ev[i - 1]!.at);
  });

  it('quando o narrador é quem vê, a legenda diz "sua carta"', () => {
    const meu = buildRevealTimeline(some, jogadores, (id) => (id === 'n' ? 'você' : name(id)), 'n');
    expect(captionText(frameAt(meu, meu[0]!.at).caption!.parts)).toBe('esta era a sua carta, que você narrou “luar”');
    const outro = buildRevealTimeline(some, jogadores, name, 'a');
    expect(captionText(frameAt(outro, outro[0]!.at).caption!.parts)).toBe('esta era a carta de Nina, que narrou “luar”');
  });

  it('sem dica, a legenda não deixa espaço nem aspas', () => {
    const semDica = buildRevealTimeline({ ...some, clue: '' }, jogadores, name);
    expect(captionText(frameAt(semDica, semDica[0]!.at).caption!.parts)).toBe('esta era a carta de Nina, que narrou');
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
