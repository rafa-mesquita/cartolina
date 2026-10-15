import { describe, expect, it } from 'vitest';
import { allMineInRow, backsOf, cardsOf, handCards, initialOf, isHost, isPlaying, readyCount, seatStatus } from '../src/game/derive';
import { act, makeRoom, sortingRoom, viewOf } from './fixtures';

describe('derive', () => {
  it('host e participação', () => {
    const room = sortingRoom(2);
    expect(isHost(viewOf(room, 'p0'))).toBe(true);
    expect(isHost(viewOf(room, 'p1'))).toBe(false);
    expect(isPlaying(viewOf(room, 'p1'))).toBe(true);
    expect(isPlaying(viewOf(room, null))).toBe(false);
  });

  it('mão: lugar de cada carta minha', () => {
    let room = sortingRoom(2);
    room = act(room, 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
    const view = viewOf(room, 'p0');
    expect(handCards(view, view.game.row, new Set()).map((h) => h.place)).toEqual(['row']);
    expect(handCards(view, [], new Set()).map((h) => h.place)).toEqual(['hand']);
    expect(handCards(view, [], new Set(['p0:0'])).map((h) => h.place)).toEqual(['drag']);
    expect(handCards(view, [], new Set())[0]?.card.value).not.toBeNull();
  });

  it('costas no assento somem quando a carta está na fila ou sendo carregada', () => {
    const view = viewOf(sortingRoom(2), 'p0');
    expect(backsOf(view, 'p1', [], new Set())).toEqual([true]);
    expect(backsOf(view, 'p1', ['p1:0'], new Set())).toEqual([false]);
    expect(backsOf(view, 'p1', [], new Set(['p1:0']))).toEqual([false]);
  });

  it('status do assento', () => {
    let room = sortingRoom(2);
    const seat = (r = room) => viewOf(r, 'p0').seats[1]!;
    expect(seatStatus(viewOf(room, 'p0'), seat(), undefined)).toBe('pensando');
    expect(seatStatus(viewOf(room, 'p0'), seat(), 'writing')).toBe('escrevendo…');
    expect(seatStatus(viewOf(room, 'p0'), seat(), 'dragging')).toBe('arrastando…');
    room = act(room, 'p1', { type: 'place', cardId: 'p1:0', index: 0 });
    room = act(room, 'p1', { type: 'ready', ready: true });
    expect(seatStatus(viewOf(room, 'p0'), seat(room), 'writing')).toBe('pronto ✓');
    const off = { ...seat(room), connected: false };
    expect(seatStatus(viewOf(room, 'p0'), off, undefined)).toBe('desconectado');
  });

  it('quem entrou depois do início assiste', () => {
    const room = sortingRoom(2);
    const view = viewOf(room, 'p0');
    const spectator = { id: 'p9', name: 'Zé', color: '#C9E27A' as const, connected: true };
    expect(seatStatus(view, spectator, undefined)).toBe('assistindo');
  });

  it('contagem de prontos considera só participantes conectados', () => {
    let room = sortingRoom(3);
    room = act(room, 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
    room = act(room, 'p0', { type: 'ready', ready: true });
    expect(readyCount(viewOf(room, 'p0'))).toEqual({ ready: 1, total: 3 });
  });

  it('todas as minhas cartas na fila', () => {
    const view = viewOf(sortingRoom(2), 'p0');
    expect(allMineInRow(view, [])).toBe(false);
    expect(allMineInRow(view, ['p0:0'])).toBe(true);
    expect(allMineInRow(viewOf(makeRoom(2), 'p0'), [])).toBe(false);
  });

  it('cardsOf ordena por id e initialOf pega a primeira letra', () => {
    const view = viewOf(sortingRoom(2), 'p0');
    expect(cardsOf(view, 'p1').map((c) => c.id)).toEqual(['p1:0']);
    expect(initialOf('  ana')).toBe('A');
    expect(initialOf('😀x')).toBe('😀');
  });
});
