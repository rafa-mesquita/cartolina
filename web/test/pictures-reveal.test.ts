import type { PicturesRoundResult } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { REVEAL_MS, buildRevealTimeline, frameAt, scoresBefore, workPoints } from '../src/games/pictures/reveal';
import { picturesView, revealed } from './pictures-fixtures';

const T = REVEAL_MS;
const work = { kit: 'cubes' as const, cells: Array.from({ length: 16 }, (_, i) => (i === 0 ? 0 : null)) };

/** a, b e c jogam; a e b montaram. b acertou a de a; ninguém acertou a de b (c errou, a não palpitou). */
const res: PicturesRoundResult = {
  round: 2,
  order: ['a', 'b'],
  secrets: { a: 'B2', b: 'C3', c: 'A1' },
  kits: { a: 'cubes', b: 'cubes', c: 'cubes' },
  works: { a: work, b: work },
  guesses: { b: { a: 'B2' }, c: { a: 'D4', b: 'A1' } },
  correct: { a: ['b'], b: [] },
  gained: { a: 1, b: 1, c: 0 },
};
const players = ['a', 'b', 'c'];
const final = { a: 5, b: 3, c: 2 };
const before = scoresBefore(final, res);

describe('linha do tempo da revelação', () => {
  const ev = buildRevealTimeline(res, players);

  it('passos em ordem, com os tempos do plano', () => {
    expect(ev.map((e) => e.kind)).toEqual([
      'grow', 'tape', 'tape', 'photo', 'mark', 'points', 'plus', 'plus',
      'out', 'grow', 'tape', 'tape', 'photo', 'mark', 'points',
      'done',
    ]);
    const at = (i: number) => ev[i]!.at;
    expect(at(0)).toBe(T.start);
    expect(at(1)).toBe(T.start + T.grow); // a primeira fitinha logo depois de a obra crescer
    expect(at(2) - at(1)).toBe(T.tapes / 3); // fitinhas espalhadas no 1,2 s
    expect(at(3)).toBe(T.start + T.grow + T.tapes);
    expect(at(4) - at(3)).toBe(T.photo);
    expect(at(5) - at(4)).toBe(T.mark);
    expect(at(8) - at(5)).toBe(T.points);
    expect(at(9) - at(8)).toBe(T.out);
    expect(ev.at(-1)!.at - at(14)).toBe(T.points + T.end);
    for (let i = 1; i < ev.length; i++) expect(ev[i]!.at).toBeGreaterThanOrEqual(ev[i - 1]!.at);
  });

  it('as fitinhas vêm de todo mundo menos o artista; sem palpite vira fitinha vazia', () => {
    const tapes = ev.filter((e) => e.kind === 'tape');
    expect(tapes.map((e) => [e.artistIndex, e.guesser, e.coord])).toEqual([
      [0, 'b', 'B2'], [0, 'c', 'D4'],
      [1, 'a', null], [1, 'c', 'A1'],
    ]);
  });

  it('pontos: o artista ganha 1 por acerto, quem acertou ganha 1', () => {
    expect(workPoints(res, 'a')).toEqual([{ player: 'a', n: 1 }, { player: 'b', n: 1 }]);
    expect(workPoints(res, 'b')).toEqual([]);
  });

  it('o quadro anda passo a passo', () => {
    const grow = ev[0]!.at, photo = ev[3]!.at, mark = ev[4]!.at, plus = ev[6]!.at;
    expect(frameAt(ev, 0, before)).toMatchObject({ artistIndex: -1, step: null, done: false });
    expect(frameAt(ev, grow, before)).toMatchObject({ artistIndex: 0, step: 'grow', tapes: [], photoShown: false });
    expect(frameAt(ev, photo - 1, before)).toMatchObject({ step: 'tapes', tapes: [{ guesser: 'b', coord: 'B2' }, { guesser: 'c', coord: 'D4' }], photoShown: false });
    expect(frameAt(ev, photo, before)).toMatchObject({ step: 'photo', photoShown: true, marked: false });
    expect(frameAt(ev, mark, before)).toMatchObject({ step: 'mark', marked: true });
    expect(frameAt(ev, plus, before).plus).toEqual([{ player: 'a', n: 1 }]);
    const out = frameAt(ev, ev[8]!.at, before);
    expect(out).toMatchObject({ artistIndex: 0, leaving: true });
    // a obra seguinte começa limpa
    expect(frameAt(ev, ev[9]!.at, before)).toMatchObject({ artistIndex: 1, step: 'grow', leaving: false, tapes: [], photoShown: false, marked: false, plus: [] });
  });

  it('scoresSoFar começa no placar de antes e sobe até o final', () => {
    expect(before).toEqual({ a: 4, b: 2, c: 2 });
    expect(frameAt(ev, ev[5]!.at - 1, before).scoresSoFar).toEqual(before);
    expect(ev[6]!.at).toBe(ev[5]!.at); // o primeiro adesivo sai junto com o passo dos pontos
    expect(frameAt(ev, ev[6]!.at, before).scoresSoFar).toEqual({ a: 5, b: 2, c: 2 });
    expect(frameAt(ev, ev[7]!.at, before).scoresSoFar).toEqual(final);
    const end = frameAt(ev, ev.at(-1)!.at, before);
    expect(end.done).toBe(true);
    expect(end.scoresSoFar).toEqual(final);
    expect(frameAt(ev, Infinity, before)).toMatchObject({ done: true, scoresSoFar: final });
  });

  it('order vazio: só o done ("ninguém montou nada nesta rodada")', () => {
    const empty: PicturesRoundResult = { ...res, order: [], works: {}, guesses: {}, correct: {}, gained: { a: 0, b: 0, c: 0 } };
    const e = buildRevealTimeline(empty, players);
    expect(e).toEqual([{ at: T.empty, kind: 'done' }]);
    expect(frameAt(e, T.empty - 1, { a: 1 })).toMatchObject({ artistIndex: -1, done: false });
    expect(frameAt(e, T.empty, { a: 1 })).toMatchObject({ done: true, scoresSoFar: { a: 1 } });
  });

  it('com a regra de verdade (revealed(3)): no fim, o placar é o da visão', () => {
    const g = picturesView(revealed(3), 'p0').game;
    const r = g.result!;
    const e = buildRevealTimeline(r, g.inRound);
    expect(e.filter((x) => x.kind === 'grow')).toHaveLength(r.order.length);
    expect(frameAt(e, Infinity, scoresBefore(g.scores, r)).scoresSoFar).toEqual(g.scores);
  });
});
