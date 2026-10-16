import { DIXIT_DEFAULT_TARGET } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { colorer, namer, othersAfter, phaseLabel, seatStatus } from '../src/games/dixit/status';
import { dixitRoom, dixitView, othersOf, play, revealed, started, stateOf, told, voting } from './dixit-fixtures';

const META = `meta ${DIXIT_DEFAULT_TARGET}`;

describe('pessoas', () => {
  it('nome de quem vê é "você"; os outros pelo assento', () => {
    const v = dixitView(started(3), 'p1');
    const name = namer(v);
    expect(name('p1')).toBe('você');
    expect(name('p0')).toBe('P0');
    expect(name('zz')).toBe('alguém');
    expect(colorer(v)('p0')).toBe(v.seats[0]!.color);
  });

  it('os outros em ordem a partir de quem vê', () => {
    expect(othersAfter(['p0', 'p1', 'p2', 'p3'], 'p2')).toEqual(['p3', 'p0', 'p1']);
    expect(othersAfter(['p0', 'p1'], null)).toEqual(['p0', 'p1']);
  });

  it('quem vê fora da lista: todos, na ordem original', () => {
    expect(othersAfter(['p0', 'p1', 'p2'], 'zz')).toEqual(['p0', 'p1', 'p2']);
  });
});

describe('status do assento', () => {
  it('narração, escolha e votação', () => {
    let room = started(4);
    const st = stateOf(room).storyteller!;
    const other = othersOf(room)[0]!;
    expect(seatStatus(dixitView(room, null).game, st)).toEqual({ text: 'narrando…', tone: 'act' });
    expect(seatStatus(dixitView(room, null).game, other)).toEqual({ text: 'esperando', tone: '' });
    room = told(4);
    expect(seatStatus(dixitView(room, null).game, othersOf(room)[0]!)).toEqual({ text: 'escolhendo…', tone: 'act' });
    room = voting(4);
    expect(seatStatus(dixitView(room, null).game, othersOf(room)[0]!)).toEqual({ text: 'votando…', tone: 'act' });
  });

  it('o narrador "contou" e quem confirmou a escolha está "pronto"', () => {
    let room = told(4);
    const [first, second] = othersOf(room) as [string, string];
    const st = stateOf(room).storyteller!;
    room = play(room, first, { type: 'submit', cardIds: stateOf(room).hands[first]!.slice(0, 1) });
    room = play(room, first, { type: 'confirm' });
    const g = dixitView(room, null).game;
    expect(seatStatus(g, st)).toEqual({ text: 'contou ✓', tone: 'ok' });
    expect(seatStatus(g, first)).toEqual({ text: 'pronto ✓', tone: 'ok' });
    expect(seatStatus(g, second)).toEqual({ text: 'escolhendo…', tone: 'act' });
  });

  it('quem confirmou o voto "votou"; o narrador espera', () => {
    let room = voting(4);
    const [first, second] = othersOf(room) as [string, string];
    const st = stateOf(room).storyteller!;
    // vota em uma carta que não é a dele
    const card = dixitView(room, first).game.table.find((c) => !c.mine)!.cardId;
    room = play(room, first, { type: 'vote', cardId: card });
    room = play(room, first, { type: 'confirm' });
    const g = dixitView(room, null).game;
    expect(seatStatus(g, first)).toEqual({ text: 'votou ✓', tone: 'ok' });
    expect(seatStatus(g, second)).toEqual({ text: 'votando…', tone: 'act' });
    expect(seatStatus(g, st)).toEqual({ text: 'esperando', tone: '' });
  });

  it('quem está fora da rodada "assiste"; sem texto no lobby e no fim de jogo', () => {
    const g = dixitView(told(4), null).game;
    const fora = { ...g, inRound: g.inRound.filter((p) => p !== 'p3') };
    expect(seatStatus(fora, 'p3')).toEqual({ text: 'assistindo', tone: '' });
    expect(seatStatus({ ...fora, phase: 'lobby' }, 'p3')).toEqual({ text: '', tone: '' });
    expect(seatStatus({ ...fora, phase: 'gameover' }, 'p3')).toEqual({ text: '', tone: '' });
  });

  it('na revelação ninguém tem texto', () => {
    const g = dixitView(revealed(4), null).game;
    expect(seatStatus(g, 'p0')).toEqual({ text: '', tone: '' });
  });
});

describe('rótulo da fase', () => {
  it('com contagem e meta', () => {
    expect(phaseLabel(dixitView(told(4), null).game)).toBe(`escolha · 0 de 3 · ${META}`);
    expect(phaseLabel(dixitView(revealed(4), null).game)).toBe(`revelação · ${META}`);
  });

  it('a contagem anda quando alguém confirma', () => {
    let room = told(4);
    const first = othersOf(room)[0]!;
    room = play(room, first, { type: 'submit', cardIds: stateOf(room).hands[first]!.slice(0, 1) });
    room = play(room, first, { type: 'confirm' });
    expect(phaseLabel(dixitView(room, null).game)).toBe(`escolha · 1 de 3 · ${META}`);
  });

  it('votação, lobby e fim de jogo', () => {
    expect(phaseLabel(dixitView(voting(4), null).game)).toBe(`votação · 0 de 3 · ${META}`);
    expect(phaseLabel(dixitView(dixitRoom(3), null).game)).toBe(`lobby · ${META}`);
    // fim de jogo: montar uma partida até a meta é custoso, então só troca a fase da view
    const g = dixitView(revealed(4), null).game;
    expect(phaseLabel({ ...g, phase: 'gameover' })).toBe(`fim de jogo · ${META}`);
  });
});
