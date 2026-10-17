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
  it('mostra as faixas do 100 (topo) ao 1 (embaixo), com a dica; a ordem do leitor de tela é a mesma da tela', () => {
    const view = placedView(); // servidor: gato (menor), chuva
    render(<PhoneRow {...base(view)} />);
    const strips = screen.getAllByRole('button', { name: /gato|chuva/ });
    expect(strips.map((s) => s.textContent)).toEqual([expect.stringContaining('chuva'), expect.stringContaining('gato')]);
    expect(screen.getByText('1', { selector: 'b' })).toBeTruthy();
    expect(screen.getByText('100', { selector: 'b' })).toBeTruthy();
    const ends = document.querySelectorAll('.p-end');
    expect(ends[0]?.textContent).toContain('100');
    expect(ends[0]?.textContent).toContain(view.game.theme!.max);
    expect(ends[1]?.textContent).toContain(view.game.theme!.min);
    // DOM = tela: rótulo do 100, faixas do maior pro menor, rótulo do 1.
    const order = Array.from(document.querySelectorAll('.p-row > .p-end, .p-row > .p-strip')).map((el) =>
      el.classList.contains('p-end') ? el.querySelector('b')!.textContent : el.getAttribute('data-card'),
    );
    expect(order).toEqual(['100', 'p1:0', 'p0:0', '1']);
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

  it('"aqui" diz onde fica, de cima pra baixo: acima de qual carta ou embaixo de tudo (o menor)', () => {
    render(<PhoneRow {...base(placedView())} selected="p2:0" />);
    const names = screen.getAllByRole('button', { name: /colocar aqui/ }).map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual(['colocar aqui, acima de chuva', 'colocar aqui, acima de gato', 'colocar aqui, embaixo de tudo (menor)']);
    expect(screen.getAllByRole('button', { name: /colocar aqui/ })[0]!.textContent).toBe('aqui');
  });

  it('"aqui" na tela: o de cima vai pro fim do servidor e o de baixo pro começo', () => {
    const p = { ...base(placedView()), selected: 'p2:0' };
    render(<PhoneRow {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'colocar aqui, acima de chuva' }));
    expect(p.onTarget).toHaveBeenLastCalledWith(2);
    fireEvent.click(screen.getByRole('button', { name: 'colocar aqui, acima de gato' }));
    expect(p.onTarget).toHaveBeenLastCalledWith(1);
    fireEvent.click(screen.getByRole('button', { name: 'colocar aqui, embaixo de tudo (menor)' }));
    expect(p.onTarget).toHaveBeenLastCalledWith(0);
    // E cada "aqui" fica na tela entre as faixas certas.
    const order = Array.from(document.querySelectorAll('.p-row > .p-strip, .p-row > .p-here')).map(
      (el) => el.getAttribute('data-card') ?? el.getAttribute('aria-label')!.replace('colocar aqui, ', ''),
    );
    expect(order).toEqual(['acima de chuva', 'p1:0', 'acima de gato', 'p0:0', 'embaixo de tudo (menor)']);
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
    // Na tela (de cima pra baixo): aqui, p1:0, aqui, p2:0, p0:0 (os colados na p0:0 somem).
    const here = screen.getAllByRole('button', { name: /colocar aqui/ });
    expect(here).toHaveLength(2);
    fireEvent.click(here[1]!); // entre p2:0 e p1:0 → antes de p1:0 no servidor
    expect(p.onTarget).toHaveBeenCalledWith(0);
    fireEvent.click(here[0]!); // no topo, acima de p1:0
    expect(p.onTarget).toHaveBeenLastCalledWith(1);
  });

  it('com carta selecionada: aparecem os "aqui" com o índice do servidor', () => {
    const p = { ...base(placedView()), selected: 'p2:0' };
    render(<PhoneRow {...p} />);
    const here = screen.getAllByRole('button', { name: /colocar aqui/ });
    expect(here).toHaveLength(3);
    fireEvent.click(here[0]!); // o de cima: o fim do servidor
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
    // posição 1 = logo depois da 1ª carta da fila: na tela, acima dela e abaixo da 2ª
    const order = Array.from(container.querySelectorAll('.p-row > .p-strip, .p-row > .p-gap')).map((el) => el.getAttribute('data-card') ?? 'gap');
    expect(order).toEqual(['p1:0', 'gap', 'p0:0']);
    expect(container.querySelector('[data-card="p1:0"]')?.classList.contains('carried')).toBe(true);
  });

  it('vão na posição 0 fica embaixo de tudo; na última, em cima de tudo', () => {
    const view = placedView();
    const order = (pos: number) => {
      const { container, unmount } = render(<PhoneRow {...base(view)} gaps={[{ owner: 'p2', pos }]} />);
      const out = Array.from(container.querySelectorAll('.p-row > .p-strip, .p-row > .p-gap')).map((el) => el.getAttribute('data-card') ?? 'gap');
      unmount();
      return out;
    };
    expect(order(0)).toEqual(['p1:0', 'p0:0', 'gap']);
    expect(order(2)).toEqual(['gap', 'p1:0', 'p0:0']);
  });
});

describe('rolagem da fila em pé', () => {
  /** Simula uma fila que rola: `content` de altura num contêiner de `box`. */
  function sizes(content: { h: number }, box = 300) {
    const sh = vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockImplementation(function (this: Element) {
      return this.classList.contains('p-row') ? content.h : 0;
    });
    const ch = vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(function (this: Element) {
      return this.classList.contains('p-row') ? box : 0;
    });
    return () => {
      sh.mockRestore();
      ch.mockRestore();
    };
  }
  const list = () => document.querySelector<HTMLElement>('.p-row')!;

  it('começa rolada pro pé (o lado do 1, perto da mão)', () => {
    const restore = sizes({ h: 900 });
    try {
      render(<PhoneRow {...base(placedView())} />);
      expect(list().scrollTop).toBe(900);
    } finally {
      restore();
    }
  });

  it('no pé, continua no pé quando a fila cresce; rolada pra cima, não pula', () => {
    const content = { h: 900 };
    const restore = sizes(content);
    try {
      const view = placedView();
      const { rerender } = render(<PhoneRow {...base(view)} />);
      list().scrollTop = 600; // 600 + 300 = 900: no pé
      content.h = 960; // entrou um vão (ou uma faixa)
      rerender(<PhoneRow {...base(view)} gaps={[{ owner: 'p2', pos: 1 }]} />);
      expect(list().scrollTop).toBe(960);
      list().scrollTop = 100; // a pessoa subiu pra olhar o lado do 100
      content.h = 900;
      rerender(<PhoneRow {...base(view)} />);
      expect(list().scrollTop).toBe(100);
    } finally {
      restore();
    }
  });

  it('o listRef de fora continua recebendo o contêiner que rola', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(<PhoneRow {...base(placedView())} listRef={ref} />);
    expect(ref.current).toBe(list());
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
