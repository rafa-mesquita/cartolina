import {
  PLAYER_COLORS,
  createRoom,
  isKittensRoomView,
  joinRoom,
  mulberry32,
  roomAction,
  roomView,
  type GameAction,
  type KittensRoomView,
  type KittensState,
  type Room,
} from '@cartolina/shared';
import { render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { KittensTable } from '../src/games/kittens/KittensTable';
import { createMesa, type Mesa, type MesaLayout } from '../src/games/kittens/mesa';
import { PHONE_LAYOUT_QUERY } from '../src/lib/device';
import type { GameConn } from '../src/net/connection';

/** jsdom não desenha: contexto 2D de mentira e `toDataURL` fixo (como em kittens-mesa.test.ts). */
const realGetContext = HTMLCanvasElement.prototype.getContext;
const realToDataURL = HTMLCanvasElement.prototype.toDataURL;
beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = function () {
    return {
      fillStyle: '#000000',
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      clearRect: vi.fn(),
      putImageData: vi.fn(),
      getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) })),
      createImageData: vi.fn((w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h })),
    } as unknown as CanvasRenderingContext2D;
  } as unknown as typeof realGetContext;
  HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,x';
  vi.useFakeTimers();
});
afterEach(() => {
  HTMLCanvasElement.prototype.getContext = realGetContext;
  HTMLCanvasElement.prototype.toDataURL = realToDataURL;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

/** `matchMedia` falso: só as queries de `matching` batem (como em coup-phone.test.tsx). */
const media = (matching: string[]) =>
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: matching.includes(query), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );

/** Sala de Tatubum começada com `n` jogadores p0…; o p0 (host) é o da vez. */
function started(n = 3): Room {
  let room = createRoom('ABCD', 0, 'kittens');
  for (let i = 0; i < n; i++) {
    const res = joinRoom(room, { token: `t${i}`, name: `P${i}`, color: PLAYER_COLORS[i]! }, `p${i}`, 0);
    if (!res.ok) throw new Error(res.error);
    room = res.room;
  }
  const res = roomAction(room, 'p0', { type: 'start' }, mulberry32(7), 0);
  if (!res.ok) throw new Error(res.error);
  return { ...res.room, game: { ...(res.room.game as KittensState), current: 'p0' } };
}

function viewOf(room: Room, me: string | null): KittensRoomView {
  const v = roomView(room, me);
  if (!isKittensRoomView(v)) throw new Error('esperava sala de Tatubum');
  return v;
}

/** Partida no meio (o p0 já comprou), vista por `me`, com a vez no p1 e nada no ar (sem animação na primeira visão). */
function midGame(me: string): KittensRoomView {
  const res = roomAction(started(3), 'p0', { type: 'draw' }, mulberry32(1), 0);
  if (!res.ok) throw new Error(res.error);
  const v = viewOf(res.room, me);
  v.game = { ...v.game, current: 'p1', owed: 1, alive: ['p0', 'p1', 'p2'], pending: null, choice: null, peek: null };
  return v;
}

function mount(layout: MesaLayout = 'phone'): { root: HTMLElement; mesa: Mesa; sent: GameAction[] } {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const sent: GameAction[] = [];
  const mesa = createMesa(root, { send: (a) => sent.push(a), now: () => Date.now(), seed: 7, layout });
  return { root, mesa, sent };
}

const toMesa = (v: KittensRoomView) => ({ view: v.game, you: v.you, hostId: v.hostId, seats: v.seats });
const buttonByText = (root: HTMLElement, text: string) =>
  [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text);
const stageOf = (root: HTMLElement) => root.querySelector<HTMLElement>('#stage')!;
const handCard = (root: HTMLElement, id: string) => root.querySelector<HTMLElement>(`#hand .kt-card[data-id="${id}"]`)!;

/** Encosta o dedo numa carta (pointerdown) e solta depois de `ms` (sem mexer). */
function press(el: HTMLElement, ms: number): void {
  el.dispatchEvent(new MouseEvent('pointerdown', { button: 0, bubbles: true }));
  vi.advanceTimersByTime(ms);
  window.dispatchEvent(new MouseEvent('pointerup'));
}

type Conn = GameConn & { sendAction: Mock<GameConn['sendAction']> };
const conn = (): Conn => ({
  sendAction: vi.fn<GameConn['sendAction']>(),
  sendActivity: vi.fn(),
  sendCursor: vi.fn(),
  sendPing: vi.fn(),
  onFx: vi.fn(() => () => {}),
  onError: vi.fn(() => () => {}),
});

describe('Tatubum no celular em pé', () => {
  it('a mesa no celular ganha kt-phone, sem a escala fixa de 1440×900 (no computador, não)', () => {
    media([PHONE_LAYOUT_QUERY]);
    const view = viewOf(started(3), 'p0');
    const phone = render(createElement(KittensTable, { view, conn: conn(), serverOffset: 0 }));
    const stage = stageOf(phone.container);
    expect(stage.classList.contains('kt-phone')).toBe(true);
    expect(stage.style.transform).toMatch(/^scale\(/);
    expect(stage.style.height).not.toBe('');
    // os assentos ficam numa fileira (sem posição no arco) e sem as setinhas da vez
    const seat = phone.container.querySelector<HTMLElement>('.kt-seat')!;
    expect(seat.style.left).toBe('');
    expect(phone.container.querySelector('.turnflow')).toBeNull();
    phone.unmount();

    media([]);
    const desk = render(createElement(KittensTable, { view, conn: conn(), serverOffset: 0 }));
    const deskStage = stageOf(desk.container);
    expect(deskStage.classList.contains('kt-phone')).toBe(false);
    expect(deskStage.style.transform).toMatch(/^translate\(-50%, -50%\) scale\(/);
    expect(desk.container.querySelector<HTMLElement>('.kt-seat')!.style.left).not.toBe('');
    desk.unmount();
  });

  it('o layout troca na mesma mesa quando a tela muda (setLayout)', () => {
    media([]);
    const view = viewOf(started(3), 'p0');
    const c = conn();
    const { container, rerender, unmount } = render(createElement(KittensTable, { view, conn: c, serverOffset: 0 }));
    const mesaEl = container.querySelector('.kt-mesa');
    expect(stageOf(container).classList.contains('kt-phone')).toBe(false);
    media([PHONE_LAYOUT_QUERY]);
    rerender(createElement(KittensTable, { view, conn: c, serverOffset: 0 }));
    // a mesma mesa (não foi recriada), agora em pé
    expect(container.querySelector('.kt-mesa')).toBe(mesaEl);
    expect(stageOf(container).classList.contains('kt-phone')).toBe(true);
    expect(container.querySelectorAll('#hand [data-id]')).toHaveLength(8);
    media([]);
    rerender(createElement(KittensTable, { view, conn: c, serverOffset: 0 }));
    expect(stageOf(container).classList.contains('kt-phone')).toBe(false);
    expect(stageOf(container).style.height).toBe('');
    unmount();
  });

  it('setLayout direto no motor: volta pro computador com o arco dos assentos', () => {
    const { root, mesa } = mount('phone');
    mesa.update(toMesa(viewOf(started(3), 'p0')));
    expect(root.querySelector<HTMLElement>('.kt-seat')!.style.left).toBe('');
    mesa.setLayout('desktop');
    expect(stageOf(root).classList.contains('kt-phone')).toBe(false);
    expect(root.querySelector<HTMLElement>('.kt-seat')!.style.left).not.toBe('');
    mesa.setLayout('phone');
    expect(stageOf(root).classList.contains('kt-phone')).toBe(true);
    mesa.destroy();
  });

  it('tocar numa carta seleciona; tocar e segurar abre o zoom com a explicação (sem selecionar)', () => {
    const { root, mesa } = mount();
    const v = viewOf(started(3), 'p0');
    mesa.update(toMesa(v));
    const id = v.game.hand[0]!;
    // toque curto: seleciona
    press(handCard(root, id), 100);
    expect(handCard(root, id).classList.contains('sel')).toBe(true);
    expect(root.querySelector('#viewer')?.textContent).toBe('');
    // toque longo noutra carta: zoom (folha com fundo escuro), a seleção não muda
    const other = v.game.hand[1]!;
    press(handCard(root, other), 450);
    expect(handCard(root, other).classList.contains('sel')).toBe(false);
    const viewer = root.querySelector<HTMLElement>('#viewer')!;
    expect(viewer.querySelector('.vtext h3')?.textContent).toBeTruthy();
    expect(viewer.textContent).toContain('toque pra fechar');
    expect(stageOf(root).classList.contains('kt-dim')).toBe(true);
    // tocar na folha fecha
    vi.advanceTimersByTime(1000);
    viewer.click();
    expect(viewer.textContent).toBe('');
    expect(stageOf(root).classList.contains('kt-dim')).toBe(false);
    mesa.destroy();
  });

  it('mexer o dedo antes dos 400 ms cancela o toque longo', () => {
    const { root, mesa } = mount();
    const v = viewOf(started(3), 'p0');
    mesa.update(toMesa(v));
    handCard(root, v.game.hand[0]!).dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 10, clientY: 10, bubbles: true }));
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 10, clientY: 40 }));
    vi.advanceTimersByTime(600);
    expect(root.querySelector('#viewer')?.textContent).toBe('');
    window.dispatchEvent(new MouseEvent('pointerup', { clientX: 10, clientY: 40 }));
    mesa.destroy();
  });

  it('tocar num adversário escolhe o alvo (Mau-olhado)', () => {
    const v = midGame('p1');
    v.game.hand = ['olhado-90', ...v.game.hand];
    const { root, mesa, sent } = mount();
    mesa.update(toMesa(v));
    press(handCard(root, 'olhado-90'), 50);
    buttonByText(root, 'JOGAR MAU-OLHADO')!.click();
    expect(sent).toEqual([]);
    const p2 = root.querySelector<HTMLElement>('.kt-seat[data-p="p2"]')!;
    expect(p2.classList.contains('targetable')).toBe(true);
    p2.click();
    expect(sent).toEqual([{ type: 'play', cards: ['olhado-90'], target: 'p2' }]);
    mesa.destroy();
  });

  it('fora do modo alvo, tocar num adversário mostra o que no computador fica nas dicas (cego, espiada, Latidor)', () => {
    const v = midGame('p1');
    v.game.blind = ['p2'];
    v.game.peekers = ['p2'];
    v.game.front = { p0: [], p1: [], p2: ['latido-0'] };
    const { root, mesa } = mount();
    mesa.update(toMesa(v));
    root.querySelector<HTMLElement>('.kt-seat[data-p="p2"]')!.click();
    const text = root.querySelector('#viewer')?.textContent ?? '';
    expect(text).toContain('P2');
    expect(text).toContain('cartas');
    expect(text).toContain('cego');
    expect(text).toContain('Espiou');
    expect(text).toContain('TATU LATIDOR');
    expect(stageOf(root).classList.contains('kt-dim')).toBe(true);
    // o fundo escuro fecha
    root.querySelector<HTMLElement>('#scrim')!.click();
    expect(root.querySelector('#viewer')?.textContent).toBe('');
    mesa.destroy();
  });

  it('o diário vira folha: a tira mostra a última linha e abre; FECHAR, o fundo e Esc fecham', () => {
    const { root, mesa } = mount();
    mesa.update(toMesa(midGame('p0')));
    const strip = root.querySelector<HTMLElement>('#lastline')!;
    expect(strip.textContent).toContain('comprou');
    expect(strip.getAttribute('aria-expanded')).toBe('false');
    expect(stageOf(root).classList.contains('kt-logopen')).toBe(false);
    strip.click();
    expect(stageOf(root).classList.contains('kt-logopen')).toBe(true);
    expect(stageOf(root).classList.contains('kt-dim')).toBe(true);
    expect(strip.getAttribute('aria-expanded')).toBe('true');
    root.querySelector<HTMLElement>('#log .kt-close')!.click();
    expect(stageOf(root).classList.contains('kt-logopen')).toBe(false);
    expect(stageOf(root).classList.contains('kt-dim')).toBe(false);
    // o botão DIÁRIO da barra de cima abre e fecha
    root.querySelector<HTMLElement>('#diary')!.click();
    expect(stageOf(root).classList.contains('kt-logopen')).toBe(true);
    root.querySelector<HTMLElement>('#scrim')!.click();
    expect(stageOf(root).classList.contains('kt-logopen')).toBe(false);
    root.querySelector<HTMLElement>('#diary')!.click();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(stageOf(root).classList.contains('kt-logopen')).toBe(false);
    mesa.destroy();
  });

  it('no computador o diário não vira folha (sem FECHAR) e a tira não abre nada', () => {
    const { root, mesa } = mount('desktop');
    mesa.update(toMesa(midGame('p0')));
    expect(root.querySelector('#log .kt-close')).toBeNull();
    root.querySelector<HTMLElement>('#lastline')!.click();
    expect(stageOf(root).classList.contains('kt-logopen')).toBe(false);
    mesa.destroy();
  });

  it('as faixas da sua vez (turnos do Ataque, cego) ficam por cima da mesa (fora da mão e sem linha própria)', () => {
    const v = midGame('p0');
    v.game = { ...v.game, current: 'p0', owed: 3 };
    const { root, mesa } = mount();
    mesa.update(toMesa(v));
    expect(root.querySelector('#table #banners .kt-owedtag')?.textContent).toContain('FALTAM 3 TURNOS');
    expect(root.querySelector('#hand .kt-owedtag')).toBeNull();
    mesa.destroy();
  });

  it('o palco fica na escala 1 (letra de pixel nítida) e vira compacto (kt-short) na tela baixa', () => {
    vi.stubGlobal('innerWidth', 390);
    vi.stubGlobal('innerHeight', 844);
    const { root, mesa } = mount();
    mesa.update(toMesa(viewOf(started(3), 'p0')));
    expect(stageOf(root).style.transform).toBe('scale(1)');
    expect(stageOf(root).style.width).toBe('390px');
    expect(stageOf(root).classList.contains('kt-short')).toBe(false);
    // o Safari com as barras: ~660 de altura
    vi.stubGlobal('innerHeight', 664);
    window.dispatchEvent(new Event('resize'));
    expect(stageOf(root).style.transform).toBe('scale(1)');
    expect(stageOf(root).classList.contains('kt-short')).toBe(true);
    // nem o compacto cabe: aí encolhe
    vi.stubGlobal('innerHeight', 560);
    window.dispatchEvent(new Event('resize'));
    expect(stageOf(root).style.transform).toBe(`scale(${560 / 640})`);
    // no computador, nada de kt-short
    mesa.setLayout('desktop');
    expect(stageOf(root).classList.contains('kt-short')).toBe(false);
    mesa.destroy();
  });

  it('as cartas da mão não se cobrem no celular (a mão rola pro lado)', () => {
    const { root, mesa } = mount();
    const v = viewOf(started(3), 'p0');
    mesa.update(toMesa(v));
    const lefts = [...root.querySelectorAll<HTMLElement>('#hand .kt-card')].map((c) => parseFloat(c.style.left));
    expect(lefts).toHaveLength(8);
    for (let i = 1; i < lefts.length; i++) expect(lefts[i]! - lefts[i - 1]!).toBeGreaterThanOrEqual(112);
    mesa.destroy();
  });

  it('tocar, segurar e arrastar de lado muda a ordem da mão (a carta levanta e a mão não rola)', () => {
    const { root, mesa } = mount();
    const v = viewOf(started(3), 'p0');
    mesa.update(toMesa(v));
    const first = v.game.hand[0]!;
    const hand = root.querySelector<HTMLElement>('#hand')!;
    // jsdom não tem layout: o dedo solto "em cima da mão" e todas as cartas à esquerda dele
    const efp = vi.fn(() => [hand]);
    Object.defineProperty(document, 'elementsFromPoint', { value: efp, configurable: true });
    const card = handCard(root, first);
    card.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 20, clientY: 700, bubbles: true }));
    // antes de levantar, o dedo de lado é rolagem (o navegador decide)
    const early = new Event('touchmove', { bubbles: true, cancelable: true });
    card.dispatchEvent(early);
    expect(early.defaultPrevented).toBe(false);
    vi.advanceTimersByTime(450);
    expect(handCard(root, first).classList.contains('lifted')).toBe(true);
    // levantada: o dedo de lado arrasta a carta (a rolagem da mão é barrada)
    const late = new Event('touchmove', { bubbles: true, cancelable: true });
    card.dispatchEvent(late);
    expect(late.defaultPrevented).toBe(true);
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 300, clientY: 700 }));
    window.dispatchEvent(new MouseEvent('pointerup', { clientX: 300, clientY: 700 }));
    const order = [...root.querySelectorAll<HTMLElement>('#hand .kt-card')].map((c) => c.dataset.id);
    expect(order[order.length - 1]).toBe(first);
    expect(order).toHaveLength(8);
    // nada de zoom nem seleção
    expect(root.querySelector('#viewer')?.textContent).toBe('');
    expect(root.querySelector('#hand .kt-card.sel')).toBeNull();
    delete (document as { elementsFromPoint?: unknown }).elementsFromPoint;
    mesa.destroy();
  });

  it('a mão não é redesenhada debaixo do dedo: a visão nova entra quando solta', () => {
    const { root, mesa } = mount();
    const v = viewOf(started(3), 'p0');
    mesa.update(toMesa(v));
    const id = v.game.hand[0]!;
    const card = handCard(root, id);
    card.dispatchEvent(new MouseEvent('pointerdown', { button: 0, bubbles: true }));
    mesa.update(toMesa({ ...v, game: { ...v.game, hand: [...v.game.hand, 'ataque-90'] } }));
    // a mesma carta continua lá (o toque longo não se perde) e a nova ainda não entrou
    expect(handCard(root, id)).toBe(card);
    expect(root.querySelector('#hand [data-id="ataque-90"]')).toBeNull();
    vi.advanceTimersByTime(450);
    expect(card.classList.contains('lifted')).toBe(true);
    window.dispatchEvent(new MouseEvent('pointerup'));
    expect(root.querySelector('#hand [data-id="ataque-90"]')).not.toBeNull();
    // soltou sem mexer: zoom
    expect(root.querySelector('#viewer .vtext h3')?.textContent).toBeTruthy();
    mesa.destroy();
  });

  it('no celular as dicas dizem "toque" (no computador, "clique")', () => {
    const v = midGame('p1');
    v.game.hand = ['olhado-90', ...v.game.hand];
    const phone = mount();
    phone.mesa.update(toMesa(v));
    press(handCard(phone.root, 'olhado-90'), 50);
    buttonByText(phone.root, 'JOGAR MAU-OLHADO')!.click();
    expect(phone.root.querySelector('#actions')?.textContent).toContain('toque num adversário');
    phone.mesa.destroy();
    document.body.innerHTML = '';

    const desk = mount('desktop');
    desk.mesa.update(toMesa(v));
    handCard(desk.root, 'olhado-90').dispatchEvent(new MouseEvent('pointerdown', { button: 0, bubbles: true }));
    window.dispatchEvent(new MouseEvent('pointerup'));
    buttonByText(desk.root, 'JOGAR MAU-OLHADO')!.click();
    expect(desk.root.querySelector('#actions')?.textContent).toContain('clique num adversário');
    desk.mesa.destroy();
  });

  it('o zoom do Desarme e o Favor falam em tocar; a galeria explica os toques', () => {
    const v = midGame('p1');
    v.game.hand = ['cafune-90', ...v.game.hand];
    const { root, mesa } = mount();
    mesa.update(toMesa(v));
    press(handCard(root, 'cafune-90'), 450);
    const text = root.querySelector('#viewer')?.textContent ?? '';
    expect(text).toContain('toque nele');
    expect(text).not.toContain('clique');
    vi.advanceTimersByTime(1000);
    root.querySelector<HTMLElement>('#viewer')!.click();
    root.querySelector<HTMLElement>('#cards')!.click();
    const how = root.querySelector('#gallery .kt-how')?.textContent ?? '';
    expect(how).toContain('toque e segure');
    expect(how).toContain('mudar a ordem da mão');
    mesa.destroy();
  });

  it('efeito num adversário fora da tela: a fileira dos adversários rola até ele', async () => {
    // jsdom não tem layout: a fileira mostra 0–390 e o assento do p2 está em 500–600 (fora, à direita)
    const real = Element.prototype.getBoundingClientRect;
    const rect = (l: number, w: number) => ({ left: l, right: l + w, top: 0, bottom: 100, width: w, height: 100, x: l, y: 0, toJSON: () => ({}) }) as DOMRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this.id === 'seats') return rect(0, 390);
      const seat = this.closest('.kt-seat') as HTMLElement | null;
      if (seat?.dataset.p === 'p2') return rect(500 - (seat.parentElement?.scrollLeft ?? 0), 100);
      return real.call(this);
    };
    try {
      const { root, mesa } = mount();
      // p0 e p1 compram (a vez chega no p2); depois o p2 compra e a carta voa pro assento dele
      const step = (room: Room, p: string): Room => {
        const res = roomAction(room, p, { type: 'draw' }, mulberry32(3), 0);
        if (!res.ok) throw new Error(res.error);
        return res.room;
      };
      const before = step(step(started(3), 'p0'), 'p1');
      mesa.update(toMesa(viewOf(before, 'p0')));
      await vi.advanceTimersByTimeAsync(5000);
      const seats = root.querySelector<HTMLElement>('#seats')!;
      seats.scrollLeft = 0;
      mesa.update(toMesa(viewOf(step(before, 'p2'), 'p0')));
      await vi.advanceTimersByTimeAsync(50);
      expect(seats.scrollLeft).toBeGreaterThanOrEqual(210);
      mesa.destroy();
    } finally {
      Element.prototype.getBoundingClientRect = real;
    }
  });

  it('o quadro do descarte: tocar numa carta explica o que ela faz', () => {
    const v = midGame('p1');
    v.game.discard = ['ataque-7', 'favor-7'];
    const { root, mesa } = mount();
    mesa.update(toMesa(v));
    root.querySelector<HTMLElement>('#eye')!.click();
    const info = () => root.querySelector('#pile .pinfo')?.textContent ?? '';
    expect(info()).toContain('Toque numa carta');
    root.querySelector<HTMLElement>('#pile .kt-card[data-id="ataque-7"]')!.click();
    expect(info()).toContain('ATAQUE');
    mesa.destroy();
  });
});
