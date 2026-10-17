import { describe, expect, it } from 'vitest';
import { applyPicturesAction, initialPicturesState, settlePictures } from '../src/games/pictures/rules';
import { PICTURES_COUNTDOWN_MS, type PicturesState } from '../src/games/pictures/types';
import {
  T0,
  act,
  ctxOf,
  deepFreeze,
  drafted,
  ids,
  rightGuess,
  sampleWork,
  started,
  toGuessingPhase,
  toRevealPhase,
} from './pictures-helpers';

describe('Retratim: lobby e início', () => {
  it('estado inicial é o lobby vazio', () => {
    expect(initialPicturesState()).toMatchObject({ phase: 'lobby', players: [], round: 0, countdownEndsAt: null });
  });

  it('precisa de 3 ativos e só o host começa', () => {
    expect(applyPicturesAction(initialPicturesState(), 'p0', { type: 'start' }, ctxOf(ids(2)))).toEqual({ ok: false, error: 'need_3_players' });
    expect(applyPicturesAction(initialPicturesState(), 'p1', { type: 'start' }, ctxOf(ids(3)))).toEqual({ ok: false, error: 'not_host' });
  });

  it('com 4: montagem da rodada 0, grade de 16, uma ficha por pessoa, kits do rodízio, placar zerado', () => {
    const { state } = started(4);
    expect(state.phase).toBe('building');
    expect(state.round).toBe(0);
    expect(state.players).toEqual(ids(4));
    expect(state.inRound).toEqual(ids(4));
    expect(state.grid).toHaveLength(16);
    expect(state.bag).toHaveLength(48 - 4);
    expect(Object.keys(state.secrets)).toEqual(ids(4));
    expect(state.kits).toEqual({ p0: 'cubes', p1: 'laces', p2: 'sticks', p3: 'blocks' });
    expect(state.scores).toEqual({ p0: 0, p1: 0, p2: 0, p3: 0 });
  });

  it('voltar pro lobby zera tudo; no lobby não dá', () => {
    const { state, ctx } = started(3);
    expect(act(state, 'p0', { type: 'lobby' }, ctx)).toEqual(initialPicturesState());
    expect(applyPicturesAction(initialPicturesState(), 'p0', { type: 'lobby' }, ctx)).toEqual({ ok: false, error: 'bad_phase' });
  });
});

describe('Retratim: montagem', () => {
  it('rascunho do próprio kit fica guardado; kit errado, obra inválida e quem não joga são recusados', () => {
    const { state, ctx } = started(3);
    const s = act(state, 'p0', { type: 'draft', work: sampleWork('cubes') }, ctx);
    expect(s.works.p0).toEqual(sampleWork('cubes'));
    expect(applyPicturesAction(s, 'p0', { type: 'draft', work: sampleWork('laces') }, ctx)).toEqual({ ok: false, error: 'wrong_kit' });
    const four = { kit: 'cubes' as const, cells: [0, 0, 0, 0, ...Array<null>(12).fill(null)] };
    expect(applyPicturesAction(s, 'p0', { type: 'draft', work: four }, ctx)).toEqual({ ok: false, error: 'bad_work' });
    expect(applyPicturesAction(s, 'p9', { type: 'draft', work: sampleWork('cubes') }, ctx)).toEqual({ ok: false, error: 'not_player' });
  });

  it('pronto pede obra: sem rascunho, cubos incompletos e símbolos de menos são recusados', () => {
    const { state, ctx } = started(5);
    expect(applyPicturesAction(state, 'p0', { type: 'ready', on: true }, ctx)).toEqual({ ok: false, error: 'empty_work' });
    const partial = act(state, 'p0', { type: 'draft', work: { kit: 'cubes', cells: [0, ...Array<null>(15).fill(null)] } }, ctx);
    expect(applyPicturesAction(partial, 'p0', { type: 'ready', on: true }, ctx)).toEqual({ ok: false, error: 'cubes_incomplete' });
    expect(state.kits.p4).toBe('icons');
    const one = act(state, 'p4', { type: 'draft', work: { kit: 'icons', ids: [3] } }, ctx);
    expect(applyPicturesAction(one, 'p4', { type: 'ready', on: true }, ctx)).toEqual({ ok: false, error: 'icons_too_few' });
  });

  it('pronto trava o rascunho até desmarcar', () => {
    const { state, ctx } = started(4);
    let s = drafted(state, ['p0'], ctx);
    s = act(s, 'p0', { type: 'ready', on: true }, ctx);
    expect(applyPicturesAction(s, 'p0', { type: 'draft', work: sampleWork('cubes') }, ctx)).toEqual({ ok: false, error: 'already_ready' });
    expect(applyPicturesAction(s, 'p0', { type: 'ready', on: true }, ctx)).toEqual({ ok: false, error: 'already_ready' });
    s = act(s, 'p0', { type: 'ready', on: false }, ctx);
    expect(s.ready).toEqual([]);
    expect(act(s, 'p0', { type: 'draft', work: sampleWork('cubes') }, ctx).works.p0).toBeDefined();
  });

  it('com 4, a contagem de 30 s dispara no 2º pronto (metade arredondada pra cima)', () => {
    const { state, ctx } = started(4);
    let s = drafted(state, ['p0', 'p1'], ctx);
    s = act(s, 'p0', { type: 'ready', on: true }, ctx);
    expect(s.countdownEndsAt).toBeNull();
    s = act(s, 'p1', { type: 'ready', on: true }, ctx);
    expect(s.countdownEndsAt).toBe(T0 + PICTURES_COUNTDOWN_MS);
    expect(s.phase).toBe('building');
  });

  it('com 3, a contagem também pede 2 prontos', () => {
    const { state, ctx } = started(3);
    let s = drafted(state, ['p0', 'p1'], ctx);
    s = act(s, 'p0', { type: 'ready', on: true }, ctx);
    expect(s.countdownEndsAt).toBeNull();
    s = act(s, 'p1', { type: 'ready', on: true }, ctx);
    expect(s.countdownEndsAt).toBe(T0 + PICTURES_COUNTDOWN_MS);
  });

  it('com 5, pede 3 prontos', () => {
    const { state, ctx } = started(5);
    let s = drafted(state, ['p0', 'p1', 'p2'], ctx);
    s = act(s, 'p0', { type: 'ready', on: true }, ctx);
    s = act(s, 'p1', { type: 'ready', on: true }, ctx);
    expect(s.countdownEndsAt).toBeNull();
    s = act(s, 'p2', { type: 'ready', on: true }, ctx);
    expect(s.countdownEndsAt).toBe(T0 + PICTURES_COUNTDOWN_MS);
  });

  it('desmarcar pronto não para a contagem que já disparou', () => {
    const { state, ctx } = started(4);
    let s = drafted(state, ['p0', 'p1'], ctx);
    s = act(s, 'p0', { type: 'ready', on: true }, ctx);
    s = act(s, 'p1', { type: 'ready', on: true }, ctx);
    s = act(s, 'p1', { type: 'ready', on: false }, ctx);
    expect(s.countdownEndsAt).toBe(T0 + PICTURES_COUNTDOWN_MS);
  });

  it('todos prontos: vai pros palpites com as obras congeladas', () => {
    const { state, ctx } = started(3);
    const s = toGuessingPhase(state, ctx);
    expect(s.phase).toBe('guessing');
    expect(Object.keys(s.works)).toEqual(ids(3));
    expect(s.countdownEndsAt).toBeNull();
    expect(s.confirmed).toEqual([]);
  });

  it('acabou o tempo: fecha com o último rascunho de cada um; quem nunca mandou fica em branco', () => {
    const { state, ctx } = started(4);
    let s = drafted(state, ['p0', 'p1', 'p2'], ctx);
    s = act(s, 'p0', { type: 'ready', on: true }, ctx);
    s = act(s, 'p1', { type: 'ready', on: true }, ctx);
    const before = settlePictures(deepFreeze(s), ctxOf(ids(4), { now: T0 + PICTURES_COUNTDOWN_MS - 1 }));
    expect(before).toBe(s);
    const after = settlePictures(s, ctxOf(ids(4), { now: T0 + PICTURES_COUNTDOWN_MS }));
    expect(after.phase).toBe('guessing');
    expect(Object.keys(after.works).sort()).toEqual(['p0', 'p1', 'p2']);
  });

  it('host apressa: a contagem dispara na hora; só o host, só na montagem ou no palpite', () => {
    const { state, ctx } = started(4);
    const s = act(state, 'p0', { type: 'hurry' }, ctx);
    expect(s.countdownEndsAt).toBe(T0 + PICTURES_COUNTDOWN_MS);
    expect(act(s, 'p0', { type: 'hurry' }, ctx)).toBe(s);
    expect(applyPicturesAction(state, 'p1', { type: 'hurry' }, ctx)).toEqual({ ok: false, error: 'not_host' });
    expect(applyPicturesAction(initialPicturesState(), 'p0', { type: 'hurry' }, ctx)).toEqual({ ok: false, error: 'bad_phase' });
  });
});

describe('Retratim: palpites', () => {
  it('palpite em obra alheia fica guardado e pode trocar ou tirar até confirmar', () => {
    const { state, ctx } = started(3);
    let s = toGuessingPhase(state, ctx);
    s = act(s, 'p0', { type: 'guess', artist: 'p1', coord: 'B3' }, ctx);
    s = act(s, 'p0', { type: 'guess', artist: 'p2', coord: 'B3' }, ctx);
    expect(s.guesses.p0).toEqual({ p1: 'B3', p2: 'B3' });
    s = act(s, 'p0', { type: 'guess', artist: 'p1', coord: null }, ctx);
    expect(s.guesses.p0).toEqual({ p2: 'B3' });
    s = act(s, 'p0', { type: 'confirm' }, ctx);
    expect(applyPicturesAction(s, 'p0', { type: 'guess', artist: 'p1', coord: 'A1' }, ctx)).toEqual({ ok: false, error: 'already_confirmed' });
    expect(applyPicturesAction(s, 'p0', { type: 'confirm' }, ctx)).toEqual({ ok: false, error: 'already_confirmed' });
  });

  it('não dá pra palpitar na própria obra nem em obra em branco', () => {
    const { state, ctx } = started(4);
    let s = drafted(state, ['p0', 'p1', 'p2'], ctx);
    for (const p of ['p0', 'p1', 'p2']) s = act(s, p, { type: 'ready', on: true }, ctx);
    s = settlePictures(s, ctxOf(ids(4), { now: T0 + PICTURES_COUNTDOWN_MS }));
    expect(s.phase).toBe('guessing');
    expect(applyPicturesAction(s, 'p0', { type: 'guess', artist: 'p0', coord: 'A1' }, ctx)).toEqual({ ok: false, error: 'own_work' });
    expect(applyPicturesAction(s, 'p0', { type: 'guess', artist: 'p3', coord: 'A1' }, ctx)).toEqual({ ok: false, error: 'no_work' });
  });

  it('confirmar vale mesmo sem palpite; a contagem segue a regra da metade', () => {
    const { state, ctx } = started(4);
    let s = toGuessingPhase(state, ctx);
    s = act(s, 'p0', { type: 'confirm' }, ctx);
    expect(s.countdownEndsAt).toBeNull();
    s = act(s, 'p1', { type: 'confirm' }, ctx);
    expect(s.countdownEndsAt).toBe(T0 + PICTURES_COUNTDOWN_MS);
  });
});

describe('Retratim: revelação, rodadas e fim', () => {
  it('todos acertam tudo com 3: cada um ganha 4; ordem da revelação = assentos', () => {
    const { state, ctx } = started(3);
    const s = toRevealPhase(toGuessingPhase(state, ctx), ctx, rightGuess);
    expect(s.phase).toBe('reveal');
    expect(s.result!.order).toEqual(ids(3));
    expect(s.result!.gained).toEqual({ p0: 4, p1: 4, p2: 4 });
    expect(s.scores).toEqual({ p0: 4, p1: 4, p2: 4 });
    expect(s.result!.secrets).toEqual(state.secrets);
  });

  it('quando o tempo acaba, valem os palpites colados, mesmo sem confirmar', () => {
    const { state, ctx } = started(3);
    let s = toGuessingPhase(state, ctx);
    s = act(s, 'p1', { type: 'guess', artist: 'p0', coord: s.secrets.p0! }, ctx);
    s = act(s, 'p0', { type: 'confirm' }, ctx);
    s = act(s, 'p2', { type: 'confirm' }, ctx);
    s = settlePictures(s, ctxOf(ids(3), { now: T0 + PICTURES_COUNTDOWN_MS }));
    expect(s.phase).toBe('reveal');
    expect(s.result!.correct.p0).toEqual(['p1']);
    expect(s.result!.gained.p1).toBe(1);
  });

  it('obra em branco fica fora da revelação e não ganha ponto de artista', () => {
    const { state, ctx } = started(4);
    let s = drafted(state, ['p0', 'p1', 'p2'], ctx);
    for (const p of ['p0', 'p1', 'p2']) s = act(s, p, { type: 'ready', on: true }, ctx);
    s = settlePictures(s, ctxOf(ids(4), { now: T0 + PICTURES_COUNTDOWN_MS }));
    s = toRevealPhase(s, ctx, rightGuess);
    expect(s.result!.order).toEqual(['p0', 'p1', 'p2']);
    expect(s.result!.gained.p3).toBe(3);
  });

  it('próxima rodada: kits giram, grade fica, saquinho diminui; só o host', () => {
    const { state, ctx } = started(3);
    const s = toRevealPhase(toGuessingPhase(state, ctx), ctx, rightGuess);
    expect(applyPicturesAction(s, 'p1', { type: 'next' }, ctx)).toEqual({ ok: false, error: 'not_host' });
    const n = act(s, 'p0', { type: 'next' }, ctx);
    expect(n.phase).toBe('building');
    expect(n.round).toBe(1);
    expect(n.kits).toEqual({ p0: 'laces', p1: 'sticks', p2: 'blocks' });
    expect(n.grid).toEqual(state.grid);
    expect(n.bag).toHaveLength(48 - 6);
    expect(n.works).toEqual({});
    expect(n.scores).toEqual(s.scores);
  });

  it('depois da 6ª rodada: fim de jogo; empate dá vários vencedores; "jogar de novo" recomeça', () => {
    const start = started(3);
    const ctx = start.ctx;
    let state = start.state;
    for (let r = 0; r < 6; r++) {
      state = toRevealPhase(toGuessingPhase(state, ctx), ctx, rightGuess);
      state = act(state, 'p0', { type: 'next' }, ctx);
    }
    expect(state.phase).toBe('gameover');
    expect(state.scores).toEqual({ p0: 24, p1: 24, p2: 24 });
    expect(state.winners).toEqual(ids(3));
    const again = act(state, 'p0', { type: 'again' }, ctx);
    expect(again).toMatchObject({ phase: 'building', round: 0, scores: { p0: 0, p1: 0, p2: 0 } });
    expect(again.bag).toHaveLength(48 - 3);
  });
});

describe('Retratim: presença', () => {
  it('nada mudou: devolve o mesmo objeto (lobby, montagem e revelação)', () => {
    const lobby = initialPicturesState();
    expect(settlePictures(lobby, ctxOf(ids(3)))).toBe(lobby);
    const { state, ctx } = started(3);
    expect(settlePictures(state, ctx)).toBe(state);
    const rev = toRevealPhase(toGuessingPhase(state, ctx), ctx, rightGuess);
    expect(settlePictures(rev, ctxOf(['p0']))).toBe(rev);
  });

  it('menos de 3 ativos: pausa e cancela a contagem; voltou gente, segue', () => {
    const { state, ctx } = started(4);
    let s = drafted(state, ['p0', 'p1'], ctx);
    s = act(s, 'p0', { type: 'ready', on: true }, ctx);
    s = act(s, 'p1', { type: 'ready', on: true }, ctx);
    const paused = settlePictures(s, ctxOf(['p0', 'p1']));
    expect(paused).toMatchObject({ paused: true, countdownEndsAt: null, phase: 'building' });
    expect(settlePictures(paused, ctxOf(['p0', 'p1']))).toBe(paused);
    const back = settlePictures(paused, ctxOf(ids(4), { now: T0 + 5 }));
    expect(back.paused).toBe(false);
    expect(back.countdownEndsAt).toBe(T0 + 5 + PICTURES_COUNTDOWN_MS);
  });

  it('quem sai deixa de contar: se todos que ficaram estão prontos, fecha', () => {
    const { state, ctx } = started(4);
    let s = drafted(state, ['p0', 'p1', 'p2'], ctx);
    for (const p of ['p0', 'p1', 'p2']) s = act(s, p, { type: 'ready', on: true }, ctx);
    expect(s.phase).toBe('building');
    expect(settlePictures(s, ctxOf(['p0', 'p1', 'p2'])).phase).toBe('guessing');
  });

  it('quem chega no meio espera a próxima partida', () => {
    const { state, ctx } = started(3);
    let s = toRevealPhase(toGuessingPhase(state, ctx), ctx, rightGuess);
    s = act(s, 'p0', { type: 'next' }, ctxOf(ids(4)));
    expect(s.players).toEqual(ids(3));
    expect(s.inRound).toEqual(ids(3));
    expect(s.kits.p3).toBeUndefined();
    expect(applyPicturesAction(s, 'p3', { type: 'draft', work: sampleWork('cubes') }, ctxOf(ids(4)))).toEqual({ ok: false, error: 'not_player' });
  });
});
