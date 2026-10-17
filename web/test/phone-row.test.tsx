import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ItoRoomView } from '@cartolina/shared';
import { PhoneRow } from '../src/table/phone/PhoneRow';
import { act, revealedItoView, sortingRoom, viewOf } from './fixtures';

function placedView() {
  let room = sortingRoom(3);
  room = act(room, 'p0', { type: 'clue', cardId: 'p0:0', text: 'gato' });
  room = act(room, 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
  room = act(room, 'p1', { type: 'clue', cardId: 'p1:0', text: 'chuva' });
  room = act(room, 'p1', { type: 'place', cardId: 'p1:0', index: 1 });
  return viewOf(room, 'p0') as ItoRoomView;
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
    expect(screen.queryAllByRole('button', { name: /colocar aqui/ })).toHaveLength(0);
  });

  it('"aqui" diz onde fica: no começo ou depois de qual carta', () => {
    render(<PhoneRow {...base(placedView())} selected="p2:0" />);
    const names = screen.getAllByRole('button', { name: /colocar aqui/ }).map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual(['colocar aqui, no começo', 'colocar aqui, depois de gato', 'colocar aqui, depois de chuva']);
    expect(screen.getAllByRole('button', { name: /colocar aqui/ })[0]!.textContent).toBe('aqui');
  });

  it('faixa diz de quem é e se está selecionada', () => {
    render(<PhoneRow {...base(placedView())} selected="p1:0" />);
    const mine = screen.getByRole('button', { name: /gato/ });
    expect(mine.textContent).toContain('sua carta');
    expect(mine.getAttribute('aria-pressed')).toBe('false');
    const other = screen.getByRole('button', { name: /chuva/ });
    expect(other.textContent).toContain('de P1');
    expect(other.getAttribute('aria-pressed')).toBe('true');
  });

  it('o índice do "aqui" é do servidor, mesmo com minha carta pendente na fila mostrada', () => {
    const view = placedView(); // servidor: p0:0, p1:0
    // eu vejo p0:0, p2:0 (pendente, só minha), p1:0 e estou movendo p0:0
    const p = { ...base(view), row: ['p0:0', 'p2:0', 'p1:0'], selected: 'p0:0' };
    render(<PhoneRow {...p} />);
    const here = screen.getAllByRole('button', { name: /colocar aqui/ });
    expect(here).toHaveLength(2);
    fireEvent.click(here[0]!); // entre p2:0 e p1:0 → antes de p1:0 no servidor
    expect(p.onTarget).toHaveBeenCalledWith(0);
    fireEvent.click(here[1]!);
    expect(p.onTarget).toHaveBeenLastCalledWith(1);
  });

  it('com carta selecionada: aparecem os "aqui" com o índice do servidor', () => {
    const p = { ...base(placedView()), selected: 'p2:0' };
    render(<PhoneRow {...p} />);
    const here = screen.getAllByRole('button', { name: /colocar aqui/ });
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
    // o vão fica logo depois da 1ª faixa e antes da 2ª
    const order = Array.from(container.querySelectorAll('.p-row > .p-strip, .p-row > .p-gap')).map((el) => el.getAttribute('data-card') ?? 'gap');
    expect(order).toEqual(['p0:0', 'gap', 'p1:0']);
    expect(container.querySelector('[data-card="p1:0"]')?.classList.contains('carried')).toBe(true);
  });
});

describe('fila em pé na revelação', () => {
  it('só as cartas já viradas mostram o número', () => {
    const view = revealedItoView(false);
    const [first, second] = view.game.reveal!;
    const { container } = render(<PhoneRow {...base(view)} shown={1} />);
    const a = container.querySelector(`[data-card="${first!.cardId}"]`)!;
    const b = container.querySelector(`[data-card="${second!.cardId}"]`)!;
    expect(within(a as HTMLElement).getByText(String(first!.value))).toBeTruthy();
    expect(b.querySelector('.p-num')).toBeNull();
  });

  it('carta fora de ordem ganha o ✕ quando vira', () => {
    const view = revealedItoView(true);
    const entries = view.game.reveal!;
    const { container } = render(<PhoneRow {...base(view)} shown={entries.length} />);
    const wrong = entries.filter((e) => e.error);
    expect(container.querySelectorAll('.p-x')).toHaveLength(wrong.length);
    expect(container.querySelector(`[data-card="${wrong[0]!.cardId}"]`)?.classList.contains('err')).toBe(true);
  });

  it('antes de virar, sem número nem ✕', () => {
    const { container } = render(<PhoneRow {...base(revealedItoView(true))} shown={0} />);
    expect(container.querySelectorAll('.p-num')).toHaveLength(0);
    expect(container.querySelectorAll('.p-x')).toHaveLength(0);
  });
});
