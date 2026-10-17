import { act as rtlAct, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi, type Mock } from 'vitest';
import type { ItoRoomView, RoomView } from '@cartolina/shared';
import { playSound } from '../src/brand/sounds';
import { PHONE_LAYOUT_QUERY } from '../src/lib/device';
import type { ConnSnapshot, FxEvent, GameConn } from '../src/net/connection';
import { Game } from '../src/screens/Game';
import { PhoneTable } from '../src/table/phone/PhoneTable';
import { act, makeRoom, revealedItoView, sortingRoom, viewOf } from './fixtures';

vi.mock('../src/brand/sounds', async (importOriginal) => ({ ...(await importOriginal<typeof import('../src/brand/sounds')>()), playSound: vi.fn() }));

type Conn = GameConn & {
  sendAction: Mock<GameConn['sendAction']>;
  fx(e: FxEvent): void;
  error(code: string): void;
};

/** Conexão falsa: guarda os ouvintes de `fx` e de erro pra disparar no teste. */
function conn(): Conn {
  const fxs: Array<(e: FxEvent) => void> = [];
  const errs: Array<(code: string, message: string) => void> = [];
  return {
    sendAction: vi.fn<GameConn['sendAction']>(),
    sendActivity: vi.fn(),
    sendCursor: vi.fn(),
    sendPing: vi.fn(),
    onFx: vi.fn((fn: (e: FxEvent) => void) => {
      fxs.push(fn);
      return () => void fxs.splice(fxs.indexOf(fn), 1);
    }),
    onError: vi.fn((fn: (code: string, message: string) => void) => {
      errs.push(fn);
      return () => void errs.splice(errs.indexOf(fn), 1);
    }),
    fx: (e) => rtlAct(() => fxs.forEach((f) => f(e))),
    error: (code) => rtlAct(() => errs.forEach((f) => f(code, 'recusado'))),
  } as Conn;
}

const handCard = (id: string) => document.querySelector<HTMLButtonElement>(`.p-hnum[data-card="${id}"]`)!;
const strip = (id: string) => document.querySelector(`.p-strip[data-card="${id}"]`);
const heres = () => screen.getAllByRole('button', { name: /^colocar aqui/ });

// jsdom antigo não tem PointerEvent: sem ele o `fireEvent` perde clientY/pointerType.
beforeAll(() => {
  if (typeof globalThis.PointerEvent === 'undefined') {
    class PolyPointerEvent extends MouseEvent {
      pointerType: string;
      pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerType = init.pointerType ?? 'mouse';
        this.pointerId = init.pointerId ?? 1;
      }
    }
    (globalThis as unknown as { PointerEvent: unknown }).PointerEvent = PolyPointerEvent;
  }
});

afterEach(() => {
  vi.mocked(playSound).mockClear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('mesa do celular', () => {
  it('tema: o host dá as cartas; os outros esperam', () => {
    const room = act(makeRoom(2), 'p0', { type: 'start' });
    const { unmount } = render(<PhoneTable view={viewOf(room, 'p0')} conn={conn()} />);
    expect(screen.getByRole('button', { name: 'dar as cartas' })).toBeTruthy();
    expect(screen.getAllByText(room.game.theme!.titulo).length).toBeGreaterThan(0);
    unmount();
    render(<PhoneTable view={viewOf(room, 'p1')} conn={conn()} />);
    expect(screen.getByText('o host tá escolhendo o tema…')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'dar as cartas' })).toBeNull();
  });

  it('topo: sala, bichinho e status de cada assento', () => {
    const c = conn();
    render(<PhoneTable view={viewOf(sortingRoom(2), 'p0')} conn={c} />);
    expect(screen.getByRole('button', { name: 'sala ABCD' })).toBeTruthy();
    expect(document.querySelectorAll('.p-seat')).toHaveLength(2);
    expect(screen.getAllByText('pensando')).toHaveLength(2);
    c.fx({ t: 'fx.activity', from: 'p1', activity: 'writing' });
    expect(screen.getByText('escrevendo…')).toBeTruthy();
  });

  it('colocar por toque: escolhe a carta na mão e toca no "aqui"', () => {
    const c = conn();
    render(<PhoneTable view={viewOf(sortingRoom(2), 'p0')} conn={c} />);
    expect(screen.queryAllByRole('button', { name: /^colocar aqui/ })).toHaveLength(0);
    fireEvent.click(handCard('p0:0'));
    fireEvent.click(heres()[0]!);
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'place', cardId: 'p0:0', index: 0 });
    expect(playSound).toHaveBeenCalledWith('card');
    // intenção pendente: a faixa aparece antes do servidor responder
    expect(strip('p0:0')).toBeTruthy();
    expect(screen.queryAllByRole('button', { name: /^colocar aqui/ })).toHaveLength(0);
  });

  it('servidor recusou (not_owner): a faixa pendente some', () => {
    const c = conn();
    render(<PhoneTable view={viewOf(sortingRoom(2), 'p0')} conn={c} />);
    fireEvent.click(handCard('p0:0'));
    fireEvent.click(heres()[0]!);
    expect(strip('p0:0')).toBeTruthy();
    c.error('not_owner');
    expect(strip('p0:0')).toBeNull();
  });

  it.each(['unknown_card', 'bad_phase'])('servidor recusou (%s): a faixa pendente some', (code) => {
    const c = conn();
    render(<PhoneTable view={viewOf(sortingRoom(2), 'p0')} conn={c} />);
    fireEvent.click(handCard('p0:0'));
    fireEvent.click(heres()[0]!);
    expect(strip('p0:0')).toBeTruthy();
    c.error(code);
    expect(strip('p0:0')).toBeNull();
  });

  it('outro erro do servidor (não de posse/fase): a faixa pendente fica', () => {
    const c = conn();
    render(<PhoneTable view={viewOf(sortingRoom(2), 'p0')} conn={c} />);
    fireEvent.click(handCard('p0:0'));
    fireEvent.click(heres()[0]!);
    c.error('rate_limited');
    expect(strip('p0:0')).toBeTruthy();
  });

  it('a seleção não passa pra próxima rodada (os ids das cartas se repetem)', () => {
    const c = conn();
    let room = sortingRoom(2);
    const { rerender } = render(<PhoneTable view={viewOf(room, 'p0')} conn={c} />);
    fireEvent.click(handCard('p0:0'));
    expect(handCard('p0:0').getAttribute('aria-pressed')).toBe('true');
    room = act(room, 'p0', { type: 'next' });
    expect(room.game.phase).not.toBe('sorting');
    rerender(<PhoneTable view={viewOf(room, 'p0')} conn={c} />);
    room = act(room, 'p0', { type: 'beginRound' });
    expect(room.game.phase).toBe('sorting');
    rerender(<PhoneTable view={viewOf(room, 'p0')} conn={c} />);
    expect(handCard('p0:0').getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryAllByRole('button', { name: /^colocar aqui/ })).toHaveLength(0);
  });

  it('arrasto que atravessa a revelação: soltar não manda place', () => {
    const c = conn();
    let room = sortingRoom(2);
    room = act(room, 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
    room = act(room, 'p1', { type: 'place', cardId: 'p1:0', index: 1 });
    // Fila de 0 a 400; a faixa do p1 (a maior, em cima) em 0..40: soltar em y=5, acima dela, põe a minha depois dela (índice 1).
    const box = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 300, height: bottom - top, width: 300, x: 0, y: top, toJSON() {} }) as DOMRect;
    const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.classList.contains('p-row')) return box(0, 400);
      if (this.getAttribute('data-card') === 'p1:0') return box(0, 40);
      return box(500, 540);
    });
    try {
      const { rerender } = render(<PhoneTable view={viewOf(room, 'p0')} conn={c} />);
      fireEvent.pointerDown(strip('p0:0')!, { pointerType: 'mouse', button: 0, clientX: 0, clientY: 60 });
      fireEvent.pointerMove(window, { pointerType: 'mouse', clientX: 0, clientY: 5 });
      expect(c.sendCursor).toHaveBeenLastCalledWith(expect.objectContaining({ drag: { cardId: 'p0:0', index: 1 } }));
      expect(document.querySelector('.p-gap')).toBeTruthy();
      room = act(room, 'p0', { type: 'forceReveal' });
      rerender(<PhoneTable view={viewOf(room, 'p0')} conn={c} />);
      // fora da escolha, meu arrasto não abre vão nem apaga a faixa
      expect(document.querySelector('.p-gap')).toBeNull();
      expect(document.querySelector('.p-strip.carried')).toBeNull();
      fireEvent.pointerUp(window, { pointerType: 'mouse', clientX: 0, clientY: 5 });
      expect(c.sendAction).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'place' }));
    } finally {
      spy.mockRestore();
    }
  });

  it('a intenção some quando o servidor confirma', () => {
    const c = conn();
    let room = sortingRoom(2);
    const { rerender } = render(<PhoneTable view={viewOf(room, 'p0')} conn={c} />);
    fireEvent.click(handCard('p0:0'));
    fireEvent.click(heres()[0]!);
    room = act(room, 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
    rerender(<PhoneTable view={viewOf(room, 'p0')} conn={c} />);
    expect(strip('p0:0')).toBeTruthy();
    // tirada da fila por outra via: sem intenção presa, ela some também aqui
    room = act(room, 'p0', { type: 'return', cardId: 'p0:0' });
    rerender(<PhoneTable view={viewOf(room, 'p0')} conn={c} />);
    expect(strip('p0:0')).toBeNull();
  });

  it('duas colocações seguidas (a 2ª "depois da 1ª") antes do servidor responder: ordem e índice certos', () => {
    const c = conn();
    let room = sortingRoom(3);
    room = act(room, 'p1', { type: 'place', cardId: 'p1:0', index: 0 });
    room = act(room, 'p2', { type: 'place', cardId: 'p2:0', index: 1 });
    const { rerender } = render(<PhoneTable view={viewOf(room, 'p0')} conn={c} />);
    // Ordem da fila (do 1 ao 100) = a tela de baixo pra cima.
    const order = () => Array.from(document.querySelectorAll('.p-strip')).map((el) => el.getAttribute('data-card')).reverse();
    // A: a minha no fim (o "aqui" de cima).
    fireEvent.click(handCard('p0:0'));
    fireEvent.click(heres()[0]!);
    expect(order()).toEqual(['p1:0', 'p2:0', 'p0:0']);
    // B: a do p1 logo depois da minha, que o servidor ainda nem conhece.
    fireEvent.click(strip('p1:0')!);
    fireEvent.click(heres()[0]!);
    expect(c.sendAction.mock.calls.map(([a]) => a)).toEqual([
      { type: 'place', cardId: 'p0:0', index: 2 },
      { type: 'place', cardId: 'p1:0', index: 2 },
    ]);
    // A continua no lugar e B vem depois dela.
    expect(order()).toEqual(['p2:0', 'p0:0', 'p1:0']);
    // O servidor confirma só A: B segue pendente, depois de A.
    room = act(room, 'p0', { type: 'place', cardId: 'p0:0', index: 2 });
    rerender(<PhoneTable view={viewOf(room, 'p0')} conn={c} />);
    expect(order()).toEqual(['p2:0', 'p0:0', 'p1:0']);
    // Aplicando as duas na ordem, o servidor chega na mesma fila.
    room = act(room, 'p0', { type: 'place', cardId: 'p1:0', index: 2 });
    rerender(<PhoneTable view={viewOf(room, 'p0')} conn={c} />);
    expect(room.game.row).toEqual(['p2:0', 'p0:0', 'p1:0']);
    expect(order()).toEqual(['p2:0', 'p0:0', 'p1:0']);
  });

  it('cada intenção expira sozinha, sem resposta do servidor', () => {
    vi.useFakeTimers();
    const c = conn();
    let room = sortingRoom(3);
    room = act(room, 'p1', { type: 'place', cardId: 'p1:0', index: 0 });
    render(<PhoneTable view={viewOf(room, 'p0')} conn={c} />);
    fireEvent.click(handCard('p0:0'));
    fireEvent.click(heres()[0]!);
    rtlAct(() => void vi.advanceTimersByTime(1000));
    fireEvent.click(strip('p1:0')!);
    fireEvent.click(heres()[0]!);
    expect(c.sendAction).toHaveBeenLastCalledWith({ type: 'place', cardId: 'p1:0', index: 1 });
    expect(strip('p0:0')).toBeTruthy();
    // A passou do prazo (1,5 s) e sai; B (mais nova) não segura A na tela.
    rtlAct(() => void vi.advanceTimersByTime(600));
    expect(strip('p0:0')).toBeNull();
    expect(strip('p1:0')).toBeTruthy();
  });

  it('tocar de novo ou fora da fila desseleciona; tocar outra carta troca', () => {
    let room = sortingRoom(2);
    room = act(room, 'p1', { type: 'place', cardId: 'p1:0', index: 0 });
    render(<PhoneTable view={viewOf(room, 'p0')} conn={conn()} />);
    fireEvent.click(handCard('p0:0'));
    expect(handCard('p0:0').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(handCard('p0:0'));
    expect(handCard('p0:0').getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(handCard('p0:0'));
    fireEvent.click(strip('p1:0')!);
    expect(handCard('p0:0').getAttribute('aria-pressed')).toBe('false');
    expect(strip('p1:0')!.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(document.querySelector('.p-seats')!);
    expect(strip('p1:0')!.getAttribute('aria-pressed')).toBe('false');
  });

  it('"voltar pra mão" manda return e a faixa sai na hora', () => {
    const c = conn();
    const room = act(sortingRoom(2), 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
    render(<PhoneTable view={viewOf(room, 'p0')} conn={c} />);
    fireEvent.click(strip('p0:0')!);
    fireEvent.click(screen.getByRole('button', { name: 'voltar pra mão' }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'return', cardId: 'p0:0' });
    expect(strip('p0:0')).toBeNull();
  });

  describe('arrastar com o dedo', () => {
    const box = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 300, height: bottom - top, width: 300, x: 0, y: top, toJSON() {} }) as DOMRect;
    // Fila de 0 a 400; barra de baixo (mão) de 400 a 600; a faixa do p0 em 0..40.
    const layout = () =>
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
        if (this.classList.contains('p-row')) return box(0, 400);
        if (this.classList.contains('p-foot')) return box(400, 600);
        if (this.classList.contains('p-strip') && this.getAttribute('data-card') === 'p0:0') return box(0, 40);
        return box(450, 530);
      });

    it('carta da mão puxada pra cima na hora (sem segurar) vai pra fila', () => {
      const c = conn();
      const spy = layout();
      try {
        render(<PhoneTable view={viewOf(sortingRoom(2), 'p0')} conn={c} />);
        fireEvent.pointerDown(handCard('p0:0'), { pointerType: 'touch', clientX: 100, clientY: 480 });
        fireEvent.pointerMove(window, { pointerType: 'touch', clientX: 102, clientY: 450 });
        fireEvent.pointerMove(window, { pointerType: 'touch', clientX: 102, clientY: 100 });
        expect(document.querySelector('.p-gap')).toBeTruthy();
        expect(document.querySelector('.p-hand-drop')).toBeNull(); // carta da mão: a mão não vira alvo
        fireEvent.pointerUp(window, { pointerType: 'touch', clientX: 102, clientY: 100 });
        expect(c.sendAction).toHaveBeenCalledWith({ type: 'place', cardId: 'p0:0', index: 0 });
        expect(strip('p0:0')).toBeTruthy();
      } finally {
        spy.mockRestore();
      }
    });

    it('faixa minha arrastada de lado e solta sobre a mão volta pra mão', () => {
      const c = conn();
      const room = act(sortingRoom(2), 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
      const spy = layout();
      try {
        render(<PhoneTable view={viewOf(room, 'p0')} conn={c} />);
        fireEvent.pointerDown(strip('p0:0')!, { pointerType: 'touch', clientX: 100, clientY: 20 });
        fireEvent.pointerMove(window, { pointerType: 'touch', clientX: 140, clientY: 24 });
        expect(document.querySelector('.p-strip.carried')).toBeTruthy();
        expect(document.querySelector('.p-hand-drop')).toBeNull();
        fireEvent.pointerMove(window, { pointerType: 'touch', clientX: 140, clientY: 480 });
        expect(document.querySelector('.p-hand-drop')).toBeTruthy();
        expect(screen.getByText('solta aqui pra voltar pra mão')).toBeTruthy();
        expect(document.querySelector('.p-gap')).toBeNull();
        fireEvent.pointerUp(window, { pointerType: 'touch', clientX: 140, clientY: 480 });
        expect(c.sendAction).toHaveBeenCalledWith({ type: 'return', cardId: 'p0:0' });
        expect(c.sendAction).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'place' }));
        expect(c.sendCursor).toHaveBeenLastCalledWith(expect.objectContaining({ drag: null }));
        expect(strip('p0:0')).toBeNull();
        expect(document.querySelector('.p-hand-drop')).toBeNull();
      } finally {
        spy.mockRestore();
      }
    });

    it('a altura do dedo na fila invertida dá o índice do servidor: em cima = maior, embaixo = menor', () => {
      const c = conn();
      let room = sortingRoom(3);
      room = act(room, 'p1', { type: 'place', cardId: 'p1:0', index: 0 });
      room = act(room, 'p2', { type: 'place', cardId: 'p2:0', index: 1 });
      // Servidor: p1:0, p2:0. Na tela: p2:0 em cima (0..40), p1:0 embaixo (50..90).
      const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
        if (this.classList.contains('p-row')) return box(0, 400);
        if (this.classList.contains('p-foot')) return box(400, 600);
        if (this.getAttribute('data-card') === 'p2:0' && this.classList.contains('p-strip')) return box(0, 40);
        if (this.getAttribute('data-card') === 'p1:0' && this.classList.contains('p-strip')) return box(50, 90);
        return box(450, 530);
      });
      try {
        render(<PhoneTable view={viewOf(room, 'p0')} conn={c} />);
        const dragIndex = () => (c.sendCursor as Mock).mock.calls.at(-1)![0].drag?.index;
        fireEvent.pointerDown(handCard('p0:0'), { pointerType: 'mouse', button: 0, clientX: 100, clientY: 480 });
        fireEvent.pointerMove(window, { pointerType: 'mouse', clientX: 100, clientY: 5 });
        expect(dragIndex()).toBe(2); // acima de tudo: fim do servidor
        fireEvent.pointerMove(window, { pointerType: 'mouse', clientX: 100, clientY: 200 });
        expect(dragIndex()).toBe(0); // embaixo de tudo, logo acima da mão: começo do servidor
        fireEvent.pointerMove(window, { pointerType: 'mouse', clientX: 100, clientY: 45 });
        expect(dragIndex()).toBe(1); // entre as duas
        fireEvent.pointerUp(window, { pointerType: 'mouse', clientX: 100, clientY: 45 });
        expect(c.sendAction).toHaveBeenCalledWith({ type: 'place', cardId: 'p0:0', index: 1 });
        // E a faixa pendente aparece entre as duas na tela.
        expect(Array.from(document.querySelectorAll('.p-strip')).map((el) => el.getAttribute('data-card'))).toEqual(['p2:0', 'p0:0', 'p1:0']);
      } finally {
        spy.mockRestore();
      }
    });

    it('faixa de outra pessoa solta sobre a mão não volta (só o dono devolve)', () => {
      const c = conn();
      const room = act(sortingRoom(2), 'p1', { type: 'place', cardId: 'p1:0', index: 0 });
      const spy = layout();
      try {
        render(<PhoneTable view={viewOf(room, 'p0')} conn={c} />);
        fireEvent.pointerDown(strip('p1:0')!, { pointerType: 'mouse', button: 0, clientX: 100, clientY: 20 });
        fireEvent.pointerMove(window, { pointerType: 'mouse', clientX: 100, clientY: 480 });
        expect(document.querySelector('.p-hand-drop')).toBeNull();
        fireEvent.pointerUp(window, { pointerType: 'mouse', clientX: 100, clientY: 480 });
        expect(c.sendAction).not.toHaveBeenCalled();
        expect(strip('p1:0')).toBeTruthy();
      } finally {
        spy.mockRestore();
      }
    });
  });

  it('a dica pendente vai antes do place', () => {
    const c = conn();
    render(<PhoneTable view={viewOf(sortingRoom(2), 'p0')} conn={c} />);
    fireEvent.click(screen.getByRole('button', { name: /^dica do \d+$/ }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'gato' } });
    fireEvent.click(handCard('p0:0'));
    fireEvent.click(heres()[0]!);
    expect(c.sendAction.mock.calls.map(([a]) => a)).toEqual([
      { type: 'clue', cardId: 'p0:0', text: 'gato' },
      { type: 'place', cardId: 'p0:0', index: 0 },
    ]);
  });

  it('arrasto de outra pessoa abre um vão; quando solta, o vão some com som', () => {
    const c = conn();
    let room = sortingRoom(2);
    room = act(room, 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
    render(<PhoneTable view={viewOf(room, 'p0')} conn={c} />);
    expect(document.querySelector('.p-gap')).toBeNull();
    c.fx({ t: 'fx.cursor', from: 'p1', zone: 'table', x: 0.5, y: 0.5, drag: { cardId: 'p1:0', index: 0 } });
    const gap = document.querySelector('.p-gap');
    expect(gap).toBeTruthy();
    // índice 0 do servidor = antes da minha carta na fila: na tela, embaixo da minha faixa
    expect(gap!.compareDocumentPosition(strip('p0:0')!) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    c.fx({ t: 'fx.cursor', from: 'p1', zone: 'table', x: 0.5, y: 0.5, drag: null });
    expect(document.querySelector('.p-gap')).toBeNull();
    expect(playSound).toHaveBeenCalledWith('slide');
  });

  it('arrasto de outra pessoa expira em 6 s sem notícia', () => {
    vi.useFakeTimers();
    const c = conn();
    render(<PhoneTable view={viewOf(sortingRoom(2), 'p0')} conn={c} />);
    c.fx({ t: 'fx.cursor', from: 'p1', zone: 'table', x: 0.5, y: 0.5, drag: { cardId: 'p1:0', index: 0 } });
    expect(document.querySelector('.p-gap')).toBeTruthy();
    rtlAct(() => void vi.advanceTimersByTime(7000));
    expect(document.querySelector('.p-gap')).toBeNull();
  });

  it('"tô pronto" manda ready quando minha carta está na fila', () => {
    const c = conn();
    const room = act(sortingRoom(2), 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
    render(<PhoneTable view={viewOf(room, 'p0')} conn={c} />);
    fireEvent.click(screen.getByRole('button', { name: 'tô pronto' }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'ready', ready: true });
  });

  it('host: "revelar agora" só com tudo na fila; "pular rodada" pede confirmação', () => {
    const c = conn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    try {
      let room = sortingRoom(2);
      const { rerender } = render(<PhoneTable view={viewOf(room, 'p0')} conn={c} />);
      const reveal = () => screen.getByRole('button', { name: 'revelar agora' }) as HTMLButtonElement;
      expect(reveal().disabled).toBe(true);
      room = act(room, 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
      room = act(room, 'p1', { type: 'place', cardId: 'p1:0', index: 1 });
      rerender(<PhoneTable view={viewOf(room, 'p0')} conn={c} />);
      fireEvent.click(reveal());
      expect(c.sendAction).toHaveBeenCalledWith({ type: 'forceReveal' });
      fireEvent.click(screen.getByRole('button', { name: 'pular rodada' }));
      expect(confirm).toHaveBeenCalledWith('Pular esta rodada? As cartas voltam e um tema novo é sorteado.');
      expect(c.sendAction).toHaveBeenCalledWith({ type: 'next' });
    } finally {
      confirm.mockRestore();
    }
  });

  it('quem não é host não vê os controles do host', () => {
    render(<PhoneTable view={viewOf(sortingRoom(2), 'p1')} conn={conn()} />);
    expect(screen.queryByRole('button', { name: 'revelar agora' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'pular rodada' })).toBeNull();
  });

  it('revelação: montada já revelada, o resultado aparece direto', () => {
    vi.useFakeTimers();
    render(<PhoneTable view={revealedItoView()} conn={conn()} />);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(document.querySelectorAll('.p-num')).toHaveLength(2);
  });

  it('revelação ao vivo: o resultado só aparece depois da sequência', () => {
    vi.useFakeTimers();
    const c = conn();
    let room = sortingRoom(2);
    room = act(room, 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
    room = act(room, 'p1', { type: 'place', cardId: 'p1:0', index: 1 });
    const { rerender } = render(<PhoneTable view={viewOf(room, 'p0')} conn={c} />);
    room = act(room, 'p0', { type: 'forceReveal' });
    rerender(<PhoneTable view={viewOf(room, 'p0')} conn={c} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect((screen.getByRole('button', { name: 'revelando…' }) as HTMLButtonElement).disabled).toBe(true);
    rtlAct(() => void vi.advanceTimersByTime(750));
    expect(document.querySelectorAll('.p-num')).toHaveLength(1);
    rtlAct(() => void vi.advanceTimersByTime(620 + 620 + 500));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(document.querySelectorAll('.p-num')).toHaveLength(2);
  });
});

describe('esconder a barra de baixo (sua mão)', () => {
  const KEY = 'cartolina:mao-escondida';
  const fold = () => screen.getByRole('button', { name: /sua mão$/ });

  it('o botão esconde a mão e os controles do host; o "tô pronto" e o som ficam', () => {
    render(<PhoneTable view={viewOf(sortingRoom(2), 'p0')} conn={conn()} />);
    expect(fold().getAttribute('aria-label')).toBe('esconder sua mão');
    expect(fold().getAttribute('aria-expanded')).toBe('true');
    expect(fold().textContent).toContain('esconder');
    fireEvent.click(fold());
    expect(fold().getAttribute('aria-label')).toBe('mostrar sua mão');
    expect(fold().getAttribute('aria-expanded')).toBe('false');
    expect(fold().textContent).toContain('sua mão');
    expect(document.querySelector('.p-hand')).toBeNull();
    expect(document.querySelector('.p-foot')!.classList.contains('p-folded')).toBe(true);
    expect(screen.queryByRole('button', { name: 'revelar agora' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'pular rodada' })).toBeNull();
    expect(screen.getByRole('button', { name: 'tô pronto' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /som/ })).toBeTruthy();
    fireEvent.click(fold());
    expect(handCard('p0:0')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'revelar agora' })).toBeTruthy();
    expect(fold().getAttribute('aria-expanded')).toBe('true');
  });

  it('lembra a escolha na aba (sessionStorage), mesmo recarregando no meio da rodada', () => {
    const { unmount } = render(<PhoneTable view={viewOf(sortingRoom(2), 'p0')} conn={conn()} />);
    fireEvent.click(fold());
    expect(sessionStorage.getItem(KEY)).toBe('1');
    unmount();
    render(<PhoneTable view={viewOf(sortingRoom(2), 'p0')} conn={conn()} />);
    expect(fold().getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('.p-hand')).toBeNull();
    fireEvent.click(fold());
    expect(sessionStorage.getItem(KEY)).toBe('0');
  });

  it('sem sessionStorage (bloqueado), começa aberta e o botão funciona', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    try {
      render(<PhoneTable view={viewOf(sortingRoom(2), 'p0')} conn={conn()} />);
      expect(fold().getAttribute('aria-expanded')).toBe('true');
      fireEvent.click(fold());
      expect(fold().getAttribute('aria-expanded')).toBe('false');
    } finally {
      get.mockRestore();
      set.mockRestore();
    }
  });

  it('abre sozinha quando uma rodada nova dá as cartas', () => {
    const c = conn();
    let room = act(sortingRoom(2), 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
    const { rerender } = render(<PhoneTable view={viewOf(room, 'p0')} conn={c} />);
    fireEvent.click(fold());
    // Outra pessoa mexe na fila: continua escondida.
    room = act(room, 'p1', { type: 'place', cardId: 'p1:0', index: 1 });
    rerender(<PhoneTable view={viewOf(room, 'p0')} conn={c} />);
    expect(fold().getAttribute('aria-expanded')).toBe('false');
    room = act(room, 'p0', { type: 'next' });
    rerender(<PhoneTable view={viewOf(room, 'p0')} conn={c} />);
    room = act(room, 'p0', { type: 'beginRound' });
    expect(room.game.phase).toBe('sorting');
    rerender(<PhoneTable view={viewOf(room, 'p0')} conn={c} />);
    expect(fold().getAttribute('aria-expanded')).toBe('true');
    expect(handCard('p0:0')).toBeTruthy();
  });

  it('escolher a carta, esconder a mão e tocar no "aqui": a seleção não se perde', () => {
    const c = conn();
    render(<PhoneTable view={viewOf(sortingRoom(2), 'p0')} conn={c} />);
    fireEvent.click(handCard('p0:0'));
    fireEvent.click(fold());
    fireEvent.click(heres()[0]!);
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'place', cardId: 'p0:0', index: 0 });
  });

  it('fora da escolha não tem o botão (não há mão)', () => {
    render(<PhoneTable view={revealedItoView()} conn={conn()} />);
    expect(screen.queryByRole('button', { name: /sua mão$/ })).toBeNull();
  });

  it('escondida, a barra ainda devolve a carta solta sobre ela, e abre pra mostrar a carta de volta', () => {
    const c = conn();
    const room = act(sortingRoom(2), 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
    const box = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 300, height: bottom - top, width: 300, x: 0, y: top, toJSON() {} }) as DOMRect;
    const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.classList.contains('p-row')) return box(0, 500);
      if (this.classList.contains('p-foot')) return box(500, 560); // a alça fininha
      if (this.classList.contains('p-strip') && this.getAttribute('data-card') === 'p0:0') return box(400, 440);
      return box(600, 640);
    });
    try {
      render(<PhoneTable view={viewOf(room, 'p0')} conn={c} />);
      fireEvent.click(fold());
      fireEvent.pointerDown(strip('p0:0')!, { pointerType: 'mouse', button: 0, clientX: 100, clientY: 420 });
      fireEvent.pointerMove(window, { pointerType: 'mouse', clientX: 100, clientY: 530 });
      expect(document.querySelector('.p-foot.p-hand-drop')).toBeTruthy();
      expect(screen.getByText('solta aqui pra voltar pra mão')).toBeTruthy();
      fireEvent.pointerUp(window, { pointerType: 'mouse', clientX: 100, clientY: 530 });
      expect(c.sendAction).toHaveBeenCalledWith({ type: 'return', cardId: 'p0:0' });
      expect(fold().getAttribute('aria-expanded')).toBe('true');
      expect(handCard('p0:0')).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });
});

describe('Game escolhe a mesa pelo layout', () => {
  const snap = (view: RoomView): ConnSnapshot => ({ status: 'joined', playerId: view.you, view, joinError: null });
  const media = (matching: string[]) =>
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({ matches: matching.includes(query), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );

  it('celular: fila em pé, sem o feltro do computador', () => {
    media([PHONE_LAYOUT_QUERY]);
    const view: ItoRoomView = viewOf(sortingRoom(2), 'p0');
    render(<Game conn={conn()} snap={snap(view)} view={view} />);
    expect(screen.getByRole('group', { name: 'fila de cartas' })).toBeTruthy();
    expect(document.querySelector('.felt')).toBeNull();
  });

  it('computador: o feltro de sempre', () => {
    media([]);
    const view: ItoRoomView = viewOf(sortingRoom(2), 'p0');
    render(<Game conn={conn()} snap={snap(view)} view={view} />);
    expect(document.querySelector('.felt')).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'fila de cartas' })).toBeNull();
  });
});
