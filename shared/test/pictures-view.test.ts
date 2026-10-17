import { describe, expect, it } from 'vitest';
import { picturesActionSchema } from '../src/games/pictures/schema';
import { picturesNextDeadline, picturesViewFor } from '../src/games/pictures/view';
import { PICTURES_COUNTDOWN_MS } from '../src/games/pictures/types';
import { initialPicturesState, settlePictures } from '../src/games/pictures/rules';
import { T0, act, ctxOf, drafted, rightGuess, sampleWork, started, toGuessingPhase, toRevealPhase } from './pictures-helpers';

describe('Retratim: o que cada um vê', () => {
  it('montagem: só a sua coordenada e o seu rascunho; kits e prontos de todos', () => {
    const { state, ctx } = started(3);
    const s = drafted(state, ['p0', 'p1'], ctx);
    const v = picturesViewFor(s, 'p0');
    expect(v.mySecret).toBe(s.secrets.p0);
    expect(Object.keys(v.works)).toEqual(['p0']);
    expect(v.kits).toEqual(s.kits);
    expect(JSON.stringify(v)).not.toContain('"secrets"');
    expect(v.result).toBeNull();
    expect(v.rounds).toBe(6);
  });

  it('espectador não vê coordenada nem obra na montagem', () => {
    const { state, ctx } = started(3);
    const v = picturesViewFor(drafted(state, ['p0'], ctx), null);
    expect(v.mySecret).toBeNull();
    expect(v.works).toEqual({});
  });

  it('palpite: vê as obras de todos, só os próprios palpites, e nenhuma coordenada alheia', () => {
    const { state, ctx } = started(3);
    let s = toGuessingPhase(state, ctx);
    s = act(s, 'p1', { type: 'guess', artist: 'p0', coord: 'A1' }, ctx);
    const v = picturesViewFor(s, 'p0');
    expect(Object.keys(v.works)).toEqual(['p0', 'p1', 'p2']);
    expect(v.myGuesses).toEqual({});
    expect(picturesViewFor(s, 'p1').myGuesses).toEqual({ p0: 'A1' });
    expect(v.result).toBeNull();
  });

  it('revelação: tudo aparece no resultado', () => {
    const { state, ctx } = started(3);
    const s = toRevealPhase(toGuessingPhase(state, ctx), ctx, rightGuess);
    const v = picturesViewFor(s, 'p2');
    expect(v.result?.secrets).toEqual(state.secrets);
    expect(v.result?.order).toEqual(['p0', 'p1', 'p2']);
  });
});

describe('Retratim: prazo pro servidor acordar', () => {
  it('só enquanto a contagem corre e a mesa não está pausada', () => {
    expect(picturesNextDeadline(initialPicturesState())).toBeNull();
    const { state, ctx } = started(4);
    expect(picturesNextDeadline(state)).toBeNull();
    const hurried = act(state, 'p0', { type: 'hurry' }, ctx);
    expect(picturesNextDeadline(hurried)).toBe(T0 + PICTURES_COUNTDOWN_MS);
    expect(picturesNextDeadline(settlePictures(hurried, ctxOf(['p0', 'p1'])))).toBeNull();
  });
});

describe('Retratim: schema das ações', () => {
  const ok = (a: unknown) => picturesActionSchema.safeParse(a).success;

  it('aceita as ações do jogo', () => {
    expect(ok({ type: 'start' })).toBe(true);
    expect(ok({ type: 'draft', work: sampleWork('blocks') })).toBe(true);
    expect(ok({ type: 'ready', on: false })).toBe(true);
    expect(ok({ type: 'guess', artist: 'p1', coord: 'D4' })).toBe(true);
    expect(ok({ type: 'guess', artist: 'p1', coord: null })).toBe(true);
    for (const type of ['confirm', 'hurry', 'next', 'again', 'lobby']) expect(ok({ type })).toBe(true);
  });

  it('recusa coordenada fora da grade, obra malformada e ação de outro jogo', () => {
    expect(ok({ type: 'guess', artist: 'p1', coord: 'E1' })).toBe(false);
    expect(ok({ type: 'draft', work: { kit: 'cubes', cells: [] } })).toBe(false);
    expect(ok({ type: 'ready' })).toBe(false);
    expect(ok({ type: 'tell', cardId: 'd001', clue: '' })).toBe(false);
  });
});
