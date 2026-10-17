import { describe, expect, it } from 'vitest';
import { FH, FW, ROW_Y } from '../src/table/constants';
import { rowEntries } from '../src/table/rowLayout';
import { canPick, deskCursor, posFromY, slotTargets } from '../src/table/phone/phoneRowLogic';
import { act, sortingRoom, viewOf } from './fixtures';

describe('alvos "aqui" da fila em pé', () => {
  it('carta da mão: um alvo em cada espaço, com o índice do servidor', () => {
    expect(slotTargets(['a', 'b'], 'h')).toEqual([
      { pos: 0, index: 0 },
      { pos: 1, index: 1 },
      { pos: 2, index: 2 },
    ]);
  });

  it('carta da fila: some o alvo antes e depois dela (não mudaria nada) e o índice ignora ela', () => {
    // fila a b c, movendo b: posições 1 e 2 são "ficar onde está"
    expect(slotTargets(['a', 'b', 'c'], 'b')).toEqual([
      { pos: 0, index: 0 },
      { pos: 3, index: 2 },
    ]);
  });

  it('mover a primeira e a última carta', () => {
    expect(slotTargets(['a', 'b', 'c'], 'a')).toEqual([
      { pos: 2, index: 1 },
      { pos: 3, index: 2 },
    ]);
    expect(slotTargets(['a', 'b', 'c'], 'c')).toEqual([
      { pos: 0, index: 0 },
      { pos: 1, index: 1 },
    ]);
  });

  it('o índice é do servidor: carta pendente só minha (h) não conta', () => {
    // vejo a h b, mas o servidor só tem a b (h é minha intenção pendente): entre h e b vale "depois do a" = 1; no fim = 2.
    expect(slotTargets(['a', 'h', 'b'], 'x', ['a', 'b'])).toEqual([
      { pos: 0, index: 0 },
      { pos: 1, index: 1 },
      { pos: 2, index: 1 },
      { pos: 3, index: 2 },
    ]);
    // movendo uma carta que já está na fila: o índice ignora ela e a pendente
    expect(slotTargets(['a', 'h', 'b'], 'a', ['a', 'b'])).toEqual([
      { pos: 2, index: 0 },
      { pos: 3, index: 1 },
    ]);
  });

  it('fila vazia: um alvo só', () => {
    expect(slotTargets([], 'h')).toEqual([{ pos: 0, index: 0 }]);
  });
});

describe('quem pode pegar o quê', () => {
  it('na escolha: minha carta da mão sim; carta da fila de qualquer um sim; carta da mão dos outros não', () => {
    let room = sortingRoom(2);
    room = act(room, 'p1', { type: 'place', cardId: 'p1:0', index: 0 });
    const v = viewOf(room, 'p0');
    expect(canPick(v, 'p0:0')).toBe(true);
    expect(canPick(v, 'p1:0')).toBe(true);
  });

  it('carta da mão dos outros não; fora da escolha, ou assistindo, ninguém pega nada', () => {
    expect(canPick(viewOf(sortingRoom(2), 'p0'), 'p1:0')).toBe(false);
    const watching = viewOf(sortingRoom(2), null);
    expect(canPick(watching, 'p0:0')).toBe(false);
    let room = sortingRoom(2);
    room = act(room, 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
    room = act(room, 'p1', { type: 'place', cardId: 'p1:0', index: 1 });
    room = act(room, 'p0', { type: 'forceReveal' });
    expect(canPick(viewOf(room, 'p0'), 'p0:0')).toBe(false);
  });
});

describe('cursor equivalente pra quem está no PC', () => {
  it('é o ponto do vão na fila deitada, normalizado pelo feltro', () => {
    const gap = rowEntries(['a', 'b'], [{ owner: '_', index: 1 }]).find((e) => e.kind === 'gap')!;
    expect(deskCursor(['a', 'h', 'b'], 'h', 1)).toEqual({ zone: 'table', x: gap.x / FW, y: ROW_Y / FH });
  });
});

describe('posição pelo dedo', () => {
  const rects = [
    { top: 0, bottom: 40 },
    { top: 50, bottom: 90 },
    { top: 100, bottom: 140 },
  ];
  // A fila em pé é invertida (100 no topo, 1 embaixo): a posição conta as faixas com o meio ABAIXO do dedo.
  it('abaixo do meio da última faixa = 0 (o lado do 1); acima de todas = n (o lado do 100)', () => {
    expect(posFromY(500, rects)).toBe(0);
    expect(posFromY(95, rects)).toBe(1);
    expect(posFromY(30, rects)).toBe(2);
    expect(posFromY(5, rects)).toBe(3);
  });
});