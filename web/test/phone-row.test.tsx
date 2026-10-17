import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ItoRoomView } from '@cartolina/shared';
import { PhoneRow } from '../src/table/phone/PhoneRow';
import { act, makeRoom, sortingRoom, viewOf } from './fixtures';

function placedView() {
  let room = sortingRoom(3);
  room = act(room, 'p0', { type: 'clue', cardId: 'p0:0', text: 'gato' });
  room = act(room, 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
  room = act(room, 'p1', { type: 'clue', cardId: 'p1:0', text: 'chuva' });
  room = act(room, 'p1', { type: 'place', cardId: 'p1:0', index: 1 });
  return viewOf(room, 'p0') as ItoRoomView;
}

/** Revelação de 2 cartas; `wrong` procura um sorteio com carta fora de ordem. */
function revealedView(wrong: boolean): ItoRoomView {
  for (let seed = 1; seed < 60; seed++) {
    for (const order of [[0, 1], [1, 0]] as const) {
      let room = act(act(makeRoom(2), 'p0', { type: 'start' }, seed), 'p0', { type: 'beginRound' }, seed);
      room = act(room, `p${order[0]}`, { type: 'clue', cardId: `p${order[0]}:0`, text: `dica${order[0]}` }, seed);
      room = act(room, `p${order[0]}`, { type: 'place', cardId: `p${order[0]}:0`, index: 0 }, seed);
      room = act(room, `p${order[1]}`, { type: 'clue', cardId: `p${order[1]}:0`, text: `dica${order[1]}` }, seed);
      room = act(room, `p${order[1]}`, { type: 'place', cardId: `p${order[1]}:0`, index: 1 }, seed);
      room = act(room, 'p0', { type: 'forceReveal' }, seed);
      const view = viewOf(room, 'p0') as ItoRoomView;
      if ((view.game.reveal ?? []).some((e) => e.error) === wrong) return view;
    }
  }
  throw new Error('sem sorteio');
}

const base = (view: ItoRoomView) => ({
  view,
  row: view.game.row,
  selected: null as string | null,
  gaps: [] as Array<{ owner: string; pos: number }>,
  carried: new Set<string>(),
  shown: 0,
  onPick: vi.fn(),
  onTarget: vi.fn(),
  onReturn: vi.fn(),
});

describe('fila em pé', () => {
  it('mostra as faixas em ordem, do 1 (topo) ao 100 (embaixo), com a dica', () => {
    const view = placedView();
    render(<PhoneRow {...base(view)} />);
    const strips = screen.getAllByRole('button', { name: /gato|chuva/ });
    expect(strips.map((s) => s.textContent)).toEqual([expect.stringContaining('gato'), expect.stringContaining('chuva')]);
    expect(screen.getByText('1', { selector: 'b' })).toBeTruthy();
    expect(screen.getByText('100', { selector: 'b' })).toBeTruthy();
    const ends = document.querySelectorAll('.p-end');
    expect(ends[0]?.textContent).toContain(view.game.theme!.min);
    expect(ends[1]?.textContent).toContain(view.game.theme!.max);
  });

  it('tocar numa faixa avisa quem foi tocado', () => {
    const p = base(placedView());
    render(<PhoneRow {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /chuva/ }));
    expect(p.onPick).toHaveBeenCalledWith('p1:0');
  });

  it('sem carta selecionada: nenhum "aqui"', () => {
    render(<PhoneRow {...base(placedView())} />);
    expect(screen.queryAllByRole('button', { name: 'aqui' })).toHaveLength(0);
  });

  it('com carta selecionada: aparecem os "aqui" com o índice do servidor', () => {
    const p = { ...base(placedView()), selected: 'p2:0' };
    render(<PhoneRow {...p} />);
    const here = screen.getAllByRole('button', { name: 'aqui' });
    expect(here).toHaveLength(3);
    fireEvent.click(here[2]!);
    expect(p.onTarget).toHaveBeenCalledWith(2);
  });

  it('minha carta da fila selecionada: dá pra voltar pra mão', () => {
    const p = { ...base(placedView()), selected: 'p0:0' };
    render(<PhoneRow {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'voltar pra mão' }));
    expect(p.onReturn).toHaveBeenCalledWith('p0:0');
  });

  it('carta de outra pessoa selecionada: sem "voltar pra mão"', () => {
    render(<PhoneRow {...base(placedView())} selected="p1:0" />);
    expect(screen.queryByRole('button', { name: 'voltar pra mão' })).toBeNull();
  });

  it('vão de arrasto e carta carregada', () => {
    const view = placedView();
    const { container } = render(<PhoneRow {...base(view)} gaps={[{ owner: 'p1', pos: 1 }]} carried={new Set(['p1:0'])} />);
    expect(container.querySelectorAll('.p-gap')).toHaveLength(1);
    expect(container.querySelector('[data-card="p1:0"]')?.classList.contains('carried')).toBe(true);
  });
});

describe('fila em pé na revelação', () => {
  it('só as cartas já viradas mostram o número', () => {
    const view = revealedView(false);
    const [first, second] = view.game.reveal!;
    const { container } = render(<PhoneRow {...base(view)} shown={1} />);
    const a = container.querySelector(`[data-card="${first!.cardId}"]`)!;
    const b = container.querySelector(`[data-card="${second!.cardId}"]`)!;
    expect(within(a as HTMLElement).getByText(String(first!.value))).toBeTruthy();
    expect(b.querySelector('.p-num')).toBeNull();
  });

  it('carta fora de ordem ganha o ✕ quando vira', () => {
    const view = revealedView(true);
    const entries = view.game.reveal!;
    const { container } = render(<PhoneRow {...base(view)} shown={entries.length} />);
    const wrong = entries.filter((e) => e.error);
    expect(container.querySelectorAll('.p-x')).toHaveLength(wrong.length);
    expect(container.querySelector(`[data-card="${wrong[0]!.cardId}"]`)?.classList.contains('err')).toBe(true);
  });

  it('antes de virar, sem número nem ✕', () => {
    const { container } = render(<PhoneRow {...base(revealedView(true))} shown={0} />);
    expect(container.querySelectorAll('.p-num')).toHaveLength(0);
    expect(container.querySelectorAll('.p-x')).toHaveLength(0);
  });
});
