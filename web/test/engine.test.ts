import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TableEngine, type EngineDom } from '../src/table/engine';
import { PLAYER_COLORS, joinRoom, type Room } from '@cartolina/shared';
import { act, sortingRoom, viewOf } from './fixtures';

function dom(): EngineDom {
  const make = () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    return el;
  };
  return { wrap: make(), felt: make(), row: make(), overlay: make(), cursors: make(), tip: make(), markers: [make(), make(), make(), make()] };
}

const handlers = () => ({ place: vi.fn(), ret: vi.fn(), cursor: vi.fn(), activity: vi.fn(), ping: vi.fn(), revealDone: vi.fn() });

describe('TableEngine (fumaça)', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('mostra a fila do servidor e avisa assinantes', () => {
    let room = sortingRoom(2);
    room = act(room, 'p1', { type: 'place', cardId: 'p1:0', index: 0 });
    const d = dom();
    const engine = new TableEngine(d, handlers());
    const spy = vi.fn();
    engine.subscribe(spy);
    engine.update(viewOf(room, 'p0'));
    expect(engine.getSnapshot().row).toEqual(['p1:0']);
    expect(spy).toHaveBeenCalled();
    expect(d.row.querySelectorAll('.rcard')).toHaveLength(1);
    engine.destroy();
  });

  it('nova rodada tira as cartas antigas da fila', () => {
    let room = sortingRoom(2);
    room = act(room, 'p1', { type: 'place', cardId: 'p1:0', index: 0 });
    const engine = new TableEngine(dom(), handlers());
    engine.update(viewOf(room, 'p0'));
    room = act(room, 'p0', { type: 'next' });
    engine.update(viewOf(room, 'p0'));
    expect(engine.getSnapshot().row).toEqual([]);
    engine.destroy();
  });

  it('participante vê qualquer carta da fila como movível; quem assiste não', () => {
    let room = sortingRoom(2);
    room = act(room, 'p1', { type: 'place', cardId: 'p1:0', index: 0 });
    const d = dom();
    const engine = new TableEngine(d, handlers());
    engine.update(viewOf(room, 'p0'));
    expect(d.row.querySelector('.rcard')!.classList.contains('movable')).toBe(true);
    engine.update(viewOf(room, null));
    expect(d.row.querySelector('.rcard')!.classList.contains('movable')).toBe(false);
    engine.destroy();
  });

  it('marcadores degenerados (colineares) não viram homografia: arrasto não começa', () => {
    let frameCb: FrameRequestCallback | null = null;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frameCb = cb;
      return 1;
    });
    const d = dom();
    d.markers.forEach((el, i) => {
      const x = i * 100;
      el.getBoundingClientRect = () => ({ left: x, top: 0, width: 0, height: 0, right: x, bottom: 0, x, y: 0, toJSON: () => ({}) });
    });
    const h = handlers();
    const engine = new TableEngine(d, h);
    engine.update(viewOf(sortingRoom(2), 'p0'));
    (frameCb as FrameRequestCallback | null)?.(performance.now() + 16);
    const down = new MouseEvent('pointerdown', { clientX: 450, clientY: 700, button: 0, cancelable: true });
    engine.beginHandDrag('p0:0', down as unknown as PointerEvent);
    expect(down.defaultPrevented).toBe(false);
    engine.destroy();
  });

  it('rollback volta para a fila do servidor', () => {
    const engine = new TableEngine(dom(), handlers());
    engine.update(viewOf(sortingRoom(2), 'p0'));
    engine.rollback();
    expect(engine.getSnapshot().row).toEqual([]);
    engine.destroy();
  });
});

describe('TableEngine (arrasto e remotos)', () => {
  let frameCb: FrameRequestCallback | null = null;
  let clock = 0;
  const frame = (advanceMs = 16) => {
    clock += advanceMs;
    frameCb?.(clock);
  };

  /** Marcadores nos cantos do feltro → homografia identidade (tela = feltro). */
  function domWithH(): EngineDom {
    const d = dom();
    const pts = [
      [0, 0],
      [900, 0],
      [0, 480],
      [900, 480],
    ] as const;
    d.markers.forEach((el, i) => {
      const [x, y] = pts[i]!;
      el.getBoundingClientRect = () => ({ left: x, top: y, width: 0, height: 0, right: x, bottom: y, x, y, toJSON: () => ({}) });
    });
    return d;
  }

  const pointer = (type: string, x: number, y: number) => new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true });
  const gapsShown = (d: EngineDom) => [...d.row.querySelectorAll<HTMLElement>('.gap')].filter((g) => g.style.display !== 'none').length;

  /** p0 e p1 com suas cartas na fila; p0 (eu) começa a arrastar a própria carta da fila e para sobre a fila. */
  function draggingFromRow() {
    let room = sortingRoom(2);
    room = act(room, 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
    room = act(room, 'p1', { type: 'place', cardId: 'p1:0', index: 1 });
    const d = domWithH();
    const h = handlers();
    const engine = new TableEngine(d, h);
    engine.update(viewOf(room, 'p0'));
    frame();
    const mine = d.row.querySelector<HTMLElement>('.rcard.mine')!;
    mine.dispatchEvent(pointer('pointerdown', 400, 318));
    window.dispatchEvent(pointer('pointermove', 450, 330));
    frame();
    return { room, d, h, engine };
  }

  beforeEach(() => {
    clock = performance.now();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frameCb = cb;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    frameCb = null;
    document.body.innerHTML = '';
    document.body.className = '';
  });

  it('revelação no meio do meu arrasto devolve a carta à fila sem mandar `return`', () => {
    const { room, d, h, engine } = draggingFromRow();
    expect(engine.getSnapshot().inFlight.has('p0:0')).toBe(true);
    expect(gapsShown(d)).toBe(1);
    engine.update(viewOf(act(room, 'p0', { type: 'forceReveal' }), 'p0'));
    expect(h.ret).not.toHaveBeenCalled();
    expect(h.place).not.toHaveBeenCalled();
    expect(engine.getSnapshot().row).toEqual(['p0:0', 'p1:0']);
    expect(engine.getSnapshot().inFlight.size).toBe(0);
    expect(document.body.classList.contains('grabbing')).toBe(false);
    expect(d.overlay.children).toHaveLength(0);
    engine.destroy();
  });

  it('anfitrião pula a rodada no meio do meu arrasto: some o buraco e o cursor de agarrar', () => {
    const { room, d, h, engine } = draggingFromRow();
    expect(document.body.classList.contains('grabbing')).toBe(true);
    let next = act(room, 'p0', { type: 'next' });
    engine.update(viewOf(next, 'p0'));
    expect(document.body.classList.contains('grabbing')).toBe(false);
    expect(h.activity).toHaveBeenLastCalledWith('thinking');
    next = act(next, 'p0', { type: 'beginRound' });
    engine.update(viewOf(next, 'p0'));
    frame();
    expect(gapsShown(d)).toBe(0);
    expect(engine.getSnapshot().row).toEqual([]);
    engine.destroy();
  });

  it('buraco de arrasto remoto some quando a rodada acaba', () => {
    let room = sortingRoom(2);
    room = act(room, 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
    const d = domWithH();
    const engine = new TableEngine(d, handlers());
    engine.update(viewOf(room, 'p0'));
    frame();
    engine.remoteCursor({ from: 'p1', zone: 'table', x: 0.5, y: 0.66, drag: { cardId: 'p1:0', index: 0 } });
    frame();
    expect(gapsShown(d)).toBe(1);
    room = act(room, 'p0', { type: 'next' });
    engine.update(viewOf(room, 'p0'));
    room = act(room, 'p0', { type: 'beginRound' });
    engine.update(viewOf(room, 'p0'));
    frame();
    expect(gapsShown(d)).toBe(0);
    expect(engine.getSnapshot().inFlight.size).toBe(0);
    engine.destroy();
  });

  it('revelação → nova distribuição sem o estado intermediário: cartas viradas não sobrevivem (ids se repetem)', () => {
    let room = sortingRoom(2);
    room = act(room, 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
    room = act(room, 'p1', { type: 'place', cardId: 'p1:0', index: 1 });
    room = act(room, 'p0', { type: 'forceReveal' });
    const d = domWithH();
    const engine = new TableEngine(d, handlers());
    engine.update(viewOf(room, 'p0'));
    const old = [...d.row.querySelectorAll('.rcard')];
    expect(old).toHaveLength(2);
    room = act(act(room, 'p0', { type: 'next' }), 'p0', { type: 'beginRound' });
    room = act(room, 'p1', { type: 'place', cardId: 'p1:0', index: 0 });
    engine.update(viewOf(room, 'p0'));
    expect(engine.getSnapshot().row).toEqual(['p1:0']);
    const shown = [...d.row.querySelectorAll<HTMLElement>('.rcard')].filter((el) => el.style.display !== 'none');
    expect(shown.filter((el) => !old.includes(el))).toHaveLength(1);
    engine.destroy();
  });

  it('remoto que solta e pega de novo reaproveita o overlay em espera', () => {
    const d = domWithH();
    const engine = new TableEngine(d, handlers());
    engine.update(viewOf(sortingRoom(2), 'p0'));
    frame();
    const drag = { cardId: 'p1:0', index: null };
    engine.remoteCursor({ from: 'p1', zone: 'table', x: 0.5, y: 0.3, drag });
    engine.remoteCursor({ from: 'p1', zone: 'table', x: 0.5, y: 0.3, drag: null });
    engine.remoteCursor({ from: 'p1', zone: 'table', x: 0.5, y: 0.3, drag });
    frame(1000);
    frame();
    expect(d.overlay.children).toHaveLength(1);
    expect(engine.getSnapshot().inFlight.has('p1:0')).toBe(true);
    engine.destroy();
  });

  it('remoto que sai da sala no meio do arrasto não deixa carta presa em voo', () => {
    const room = sortingRoom(2);
    const d = domWithH();
    const engine = new TableEngine(d, handlers());
    engine.update(viewOf(room, 'p0'));
    frame();
    engine.remoteCursor({ from: 'p1', zone: 'table', x: 0.5, y: 0.3, drag: { cardId: 'p1:0', index: null } });
    expect(engine.getSnapshot().inFlight.has('p1:0')).toBe(true);
    const view = viewOf(room, 'p0');
    engine.update({ ...view, seats: view.seats.filter((s) => s.id !== 'p1') });
    frame(1000);
    frame();
    expect(engine.getSnapshot().inFlight.size).toBe(0);
    expect(d.overlay.children).toHaveLength(0);
    engine.destroy();
  });
});

describe('TableEngine (qualquer participante move cartas da fila; só o dono tira da mesa)', () => {
  let frameCb: FrameRequestCallback | null = null;
  let clock = 0;
  const frame = (advanceMs = 16) => {
    clock += advanceMs;
    frameCb?.(clock);
  };
  const rect = (x: number, y: number) => () => ({ left: x, top: y, width: 0, height: 0, right: x, bottom: y, x, y, toJSON: () => ({}) });
  const pointer = (type: string, x: number, y: number) => new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true });
  const gapsShown = (d: EngineDom) => [...d.row.querySelectorAll<HTMLElement>('.gap')].filter((g) => g.style.display !== 'none').length;

  /** Fila do servidor [p0:0, p1:0]; homografia identidade (tela = feltro). */
  function rowOfTwo(me = 'p0', tweak: (room: Room) => Room = (r) => r) {
    let room = sortingRoom(2);
    room = act(room, 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
    room = act(room, 'p1', { type: 'place', cardId: 'p1:0', index: 1 });
    room = tweak(room);
    const d = dom();
    const corners = [
      [0, 0],
      [900, 0],
      [0, 480],
      [900, 480],
    ] as const;
    d.markers.forEach((el, i) => {
      el.getBoundingClientRect = rect(corners[i]![0], corners[i]![1]);
    });
    const h = handlers();
    const engine = new TableEngine(d, h);
    engine.update(viewOf(room, me));
    frame();
    return { room, d, h, engine };
  }

  /** Agarra a carta da fila (minha: `.mine`; alheia: a outra) e arrasta até (x, y). */
  function dragTo(d: EngineDom, mine: boolean, x: number, y: number) {
    const el = d.row.querySelector<HTMLElement>(mine ? '.rcard.mine' : '.rcard:not(.mine)')!;
    el.dispatchEvent(pointer('pointerdown', 450, 318));
    window.dispatchEvent(pointer('pointermove', 455, 325));
    frame();
    window.dispatchEvent(pointer('pointermove', x, y));
    frame();
  }

  beforeEach(() => {
    clock = performance.now();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frameCb = cb;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    frameCb = null;
    document.body.innerHTML = '';
    document.body.className = '';
  });

  it('participante arrasta carta alheia e solta em outro lugar da fila → place com o índice do servidor', () => {
    const { room, d, h, engine } = rowOfTwo();
    dragTo(d, false, 455, 325);
    expect(engine.getSnapshot().dragging).toBe('p1:0');
    expect(engine.getSnapshot().row).toEqual(['p0:0']);
    window.dispatchEvent(pointer('pointermove', 100, 330));
    frame();
    window.dispatchEvent(pointer('pointerup', 100, 330));
    expect(h.place).toHaveBeenCalledWith('p1:0', 0);
    expect(h.ret).not.toHaveBeenCalled();
    expect(engine.getSnapshot().row).toEqual(['p1:0', 'p0:0']);
    expect(engine.getSnapshot().dragging).toBeNull();
    engine.update(viewOf(act(room, 'p0', { type: 'place', cardId: 'p1:0', index: 0 }), 'p0'));
    expect(engine.getSnapshot().row).toEqual(['p1:0', 'p0:0']);
    expect(engine.getSnapshot().inFlight.size).toBe(0);
    engine.destroy();
  });

  it('carta assentando em pé nunca afunda no feltro (metade de baixo não é cortada)', () => {
    const { d, engine } = rowOfTwo();
    dragTo(d, false, 100, 330);
    window.dispatchEvent(pointer('pointerup', 100, 330));
    const el = d.row.querySelector<HTMLElement>('.rcard:not(.mine)')!;
    let worst = Infinity;
    for (let i = 0; i < 90; i++) {
      frame();
      const t = el.style.transform;
      const z = Number(/translate3d\([^,]+,[^,]+,([-\d.]+)px\)/.exec(t)![1]);
      const rx = Number(/rotateX\(([-\d.]+)deg\)/.exec(t)![1]);
      const s = Number(/scale\(([-\d.]+)\)/.exec(t)![1]);
      const dip = ((120 * s) / 2) * Math.sin((Math.abs(rx) * Math.PI) / 180);
      worst = Math.min(worst, z - dip);
    }
    expect(worst).toBeGreaterThanOrEqual(0);
    engine.destroy();
  });

  it('não-dono solta fora da fila: sem return, a carta volta pro lugar e aparece a dica', () => {
    const { d, h, engine } = rowOfTwo();
    dragTo(d, false, 450, 40);
    window.dispatchEvent(pointer('pointerup', 450, 40));
    expect(h.ret).not.toHaveBeenCalled();
    expect(h.place).not.toHaveBeenCalled();
    expect(engine.getSnapshot().row).toEqual(['p0:0', 'p1:0']);
    expect(engine.getSnapshot().inFlight.size).toBe(0);
    expect(d.overlay.children).toHaveLength(0);
    expect(gapsShown(d)).toBe(0);
    expect(d.tip.textContent).toBe('só P1 pode tirar essa carta da mesa');
    expect(document.body.classList.contains('grabbing')).toBe(false);
    engine.destroy();
  });

  it('blur ou pointercancel no meio do arrasto da fila nunca manda return (minha ou alheia)', () => {
    const { d, h, engine } = rowOfTwo();
    dragTo(d, true, 450, 40);
    expect(engine.getSnapshot().inFlight.has('p0:0')).toBe(true);
    window.dispatchEvent(new Event('blur'));
    expect(engine.getSnapshot().row).toEqual(['p0:0', 'p1:0']);
    dragTo(d, false, 450, 40);
    expect(engine.getSnapshot().inFlight.has('p1:0')).toBe(true);
    window.dispatchEvent(pointer('pointercancel', 450, 40));
    expect(h.ret).not.toHaveBeenCalled();
    expect(h.place).not.toHaveBeenCalled();
    expect(engine.getSnapshot().row).toEqual(['p0:0', 'p1:0']);
    expect(engine.getSnapshot().inFlight.size).toBe(0);
    expect(engine.getSnapshot().dragging).toBeNull();
    engine.destroy();
  });

  it('dono solta fora da fila → return, e a carta conta como "minha em arrasto" até pousar na mão', () => {
    const { d, h, engine } = rowOfTwo();
    const slot = document.createElement('div');
    slot.dataset.handSlot = 'p0:0';
    slot.getBoundingClientRect = rect(450, 620);
    document.body.appendChild(slot);
    dragTo(d, true, 450, 40);
    window.dispatchEvent(pointer('pointerup', 450, 40));
    expect(h.ret).toHaveBeenCalledWith('p0:0');
    expect(engine.getSnapshot().row).toEqual(['p1:0']);
    expect(engine.getSnapshot().dragging).toBe('p0:0');
    frame(2000);
    expect(engine.getSnapshot().dragging).toBeNull();
    expect(engine.getSnapshot().inFlight.size).toBe(0);
    engine.destroy();
  });

  it('espectador não arrasta nada da fila', () => {
    const { d, engine } = rowOfTwo('p9', (room) => {
      const res = joinRoom(room, { token: 't9', name: 'P9', color: PLAYER_COLORS[5]! }, 'p9', 0);
      if (!res.ok) throw new Error(res.error);
      return res.room;
    });
    dragTo(d, false, 450, 40);
    expect(engine.getSnapshot().inFlight.size).toBe(0);
    expect(engine.getSnapshot().dragging).toBeNull();
    expect(d.tip.textContent).toBe('você tá assistindo essa rodada');
    engine.destroy();
  });

  it('remoto carrega uma carta minha que está na fila: overlay + buraco, e pousa quando o servidor já a tem', () => {
    const { room, d, engine } = rowOfTwo();
    engine.remoteCursor({ from: 'p1', zone: 'table', x: 0.6, y: 0.66, drag: { cardId: 'p0:0', index: 1 } });
    frame();
    expect(d.overlay.children).toHaveLength(1);
    expect(gapsShown(d)).toBe(1);
    expect(engine.getSnapshot().inFlight.has('p0:0')).toBe(true);
    expect(engine.getSnapshot().row).toEqual(['p1:0']);
    expect(engine.getSnapshot().dragging).toBeNull();
    engine.update(viewOf(act(room, 'p1', { type: 'place', cardId: 'p0:0', index: 1 }), 'p0'));
    engine.remoteCursor({ from: 'p1', zone: 'table', x: 0.6, y: 0.66, drag: null });
    expect(d.overlay.children).toHaveLength(0);
    expect(gapsShown(d)).toBe(0);
    expect(engine.getSnapshot().row).toEqual(['p1:0', 'p0:0']);
    expect(engine.getSnapshot().inFlight.size).toBe(0);
    engine.destroy();
  });

  it('remoto não pega carta alheia que não está na fila', () => {
    const { d, engine } = rowOfTwo('p0', (room) => act(room, 'p0', { type: 'return', cardId: 'p0:0' }));
    engine.remoteCursor({ from: 'p1', zone: 'table', x: 0.5, y: 0.3, drag: { cardId: 'p0:0', index: null } });
    expect(d.overlay.children).toHaveLength(0);
    expect(engine.getSnapshot().inFlight.size).toBe(0);
    engine.destroy();
  });
});

describe('TableEngine (revisão: robustez e custo por quadro)', () => {
  let frameCb: FrameRequestCallback | null = null;
  let clock = 0;
  const frame = (advanceMs = 16) => {
    clock += advanceMs;
    frameCb?.(clock);
  };
  const frames = (n: number) => {
    for (let i = 0; i < n; i++) frame();
  };
  const rect = (x: number, y: number) => () => ({ left: x, top: y, width: 0, height: 0, right: x, bottom: y, x, y, toJSON: () => ({}) });
  const pointer = (type: string, x: number, y: number) => new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true });
  const gapsShown = (d: EngineDom) => [...d.row.querySelectorAll<HTMLElement>('.gap')].filter((g) => g.style.display !== 'none').length;

  /** Âncora (assento ou vaga da mão) com posição fixa na tela. */
  function anchor(attr: 'seatAnchor' | 'handSlot', value: string, x: number, y: number) {
    const el = document.createElement('div');
    el.dataset[attr] = value;
    el.getBoundingClientRect = vi.fn(rect(x, y));
    document.body.appendChild(el);
    return el;
  }

  /** Motor com homografia identidade (tela = feltro) já mostrando `room` como `me`. */
  function table(room: Room, me = 'p0') {
    const d = dom();
    const corners = [
      [0, 0],
      [900, 0],
      [0, 480],
      [900, 480],
    ] as const;
    d.markers.forEach((el, i) => {
      el.getBoundingClientRect = rect(corners[i]![0], corners[i]![1]);
    });
    const h = handlers();
    const engine = new TableEngine(d, h);
    engine.update(viewOf(room, me));
    frame();
    return { d, h, engine };
  }

  /** Todos os participantes põem a própria carta, na ordem dos assentos. */
  function fullRow(n: number): Room {
    let room = sortingRoom(n);
    for (let i = 0; i < n; i++) room = act(room, `p${i}`, { type: 'place', cardId: `p${i}:0`, index: i });
    return room;
  }

  const cardEl = (d: EngineDom, id: string) => d.row.querySelector<HTMLElement>(`[data-card="${id}"]`)!;

  function grab(d: EngineDom, id: string, x: number, y: number) {
    cardEl(d, id).dispatchEvent(pointer('pointerdown', 450, 318));
    window.dispatchEvent(pointer('pointermove', 455, 325));
    frame();
    window.dispatchEvent(pointer('pointermove', x, y));
    frames(3);
  }

  function drop(d: EngineDom, id: string, x: number, y: number) {
    grab(d, id, x, y);
    window.dispatchEvent(pointer('pointerup', x, y));
  }

  beforeEach(() => {
    clock = performance.now();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frameCb = cb;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    frameCb = null;
    document.body.innerHTML = '';
    document.body.className = '';
  });

  it('índice do place conta com a minha intenção pendente (servidor termina em [B,D,C,A])', () => {
    let room = fullRow(4); // [A,B,C,D] = [p0:0, p1:0, p2:0, p3:0]
    const { d, h, engine } = table(room);
    drop(d, 'p0:0', 880, 330); // A pro fim, ainda sem resposta do servidor
    expect(h.place).toHaveBeenLastCalledWith('p0:0', 3);
    expect(engine.getSnapshot().row).toEqual(['p1:0', 'p2:0', 'p3:0', 'p0:0']);
    drop(d, 'p2:0', 535, 330); // C entre D e A
    const second = h.place.mock.calls[1] as [string, number];
    expect(second[0]).toBe('p2:0');
    // Duas intenções na fila: A não volta pro começo enquanto o servidor não responde.
    expect(engine.getSnapshot().row).toEqual(['p1:0', 'p3:0', 'p2:0', 'p0:0']);
    room = act(room, 'p0', { type: 'place', cardId: 'p0:0', index: 3 });
    engine.update(viewOf(room, 'p0')); // servidor confirmou só A
    expect(engine.getSnapshot().row).toEqual(['p1:0', 'p3:0', 'p2:0', 'p0:0']);
    room = act(room, 'p0', { type: 'place', cardId: 'p2:0', index: second[1] });
    expect(room.game.row).toEqual(['p1:0', 'p3:0', 'p2:0', 'p0:0']);
    engine.update(viewOf(room, 'p0'));
    expect(engine.getSnapshot().row).toEqual(['p1:0', 'p3:0', 'p2:0', 'p0:0']);
    engine.destroy();
  });

  it('âncoras são lidas uma vez por quadro (cursor remoto e carta voltando pro mesmo assento)', () => {
    const seat = anchor('seatAnchor', 'p1', 800, 100);
    const { engine } = table(sortingRoom(2));
    engine.remoteCursor({ from: 'p1', zone: 'hand', x: 0, y: 0, drag: { cardId: 'p1:0', index: null } });
    engine.remoteCursor({ from: 'p1', zone: 'hand', x: 0, y: 0, drag: null });
    frame(1000); // sem estado novo: espera e manda pra casa (assento de p1)
    const read = seat.getBoundingClientRect as ReturnType<typeof vi.fn>;
    read.mockClear();
    frame();
    expect(read).toHaveBeenCalledTimes(1);
    engine.destroy();
  });

  it('mesa parada não reescreve estilos de cartas nem da dica', () => {
    const { d, engine } = table(fullRow(2));
    frames(300);
    const card = cardEl(d, 'p1:0');
    const cardWrites = vi.spyOn(card.style, 'transform', 'set');
    const tipWrites = vi.spyOn(d.tip.style, 'transform', 'set');
    frames(5);
    expect(cardWrites).not.toHaveBeenCalled();
    expect(tipWrites).not.toHaveBeenCalled();
    engine.destroy();
  });

  it('buraco de remoto com carta em espera não vaza pra próxima rodada', () => {
    let room = act(sortingRoom(2), 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
    const { d, engine } = table(room);
    engine.remoteCursor({ from: 'p1', zone: 'table', x: 0.3, y: 0.66, drag: { cardId: 'p1:0', index: 0 } });
    engine.remoteCursor({ from: 'p1', zone: 'table', x: 0.3, y: 0.66, drag: null });
    frame();
    expect(gapsShown(d)).toBe(1);
    room = act(room, 'p0', { type: 'next' });
    engine.update(viewOf(room, 'p0'));
    frame();
    expect(gapsShown(d)).toBe(0);
    engine.destroy();
  });

  it('pointerdown da rodada anterior não vira arrasto na rodada nova', () => {
    let room = sortingRoom(2);
    anchor('handSlot', 'p0:0', 450, 620);
    const { h, engine } = table(room);
    engine.beginHandDrag('p0:0', pointer('pointerdown', 450, 620) as unknown as PointerEvent);
    room = act(room, 'p0', { type: 'next' });
    engine.update(viewOf(room, 'p0'));
    room = act(room, 'p0', { type: 'beginRound' });
    engine.update(viewOf(room, 'p0'));
    window.dispatchEvent(pointer('pointermove', 450, 300));
    expect(engine.getSnapshot().inFlight.size).toBe(0);
    expect(h.activity).not.toHaveBeenCalledWith('dragging');
    engine.destroy();
  });

  it('revelação trocada no meio cancela os timers antigos: revealDone uma vez só', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let room = fullRow(2);
    const { h, engine } = table(room);
    room = act(room, 'p0', { type: 'forceReveal' });
    const view = viewOf(room, 'p0');
    engine.update(view);
    vi.advanceTimersByTime(800);
    engine.update({ ...view, game: { ...view.game, reveal: [...view.game.reveal!].reverse() } });
    vi.advanceTimersByTime(10_000);
    expect(h.revealDone).toHaveBeenCalledTimes(1);
    expect(engine.getSnapshot().revealing).toBe(false);
    engine.destroy();
  });

  it('remoto que desconecta no meio do arrasto solta a carta na hora', () => {
    const room = sortingRoom(2);
    const { engine } = table(room);
    engine.remoteCursor({ from: 'p1', zone: 'table', x: 0.5, y: 0.3, drag: { cardId: 'p1:0', index: null } });
    expect(engine.getSnapshot().inFlight.has('p1:0')).toBe(true);
    const view = viewOf(room, 'p0');
    engine.update({ ...view, seats: view.seats.map((s) => (s.id === 'p1' ? { ...s, connected: false } : s)) });
    frame();
    expect(engine.getSnapshot().inFlight.size).toBe(0);
    engine.destroy();
  });

  it('estado novo depois de um drop remoto fora da fila manda a carta pra casa sem esperar', () => {
    let room = sortingRoom(2);
    const { d, engine } = table(room);
    engine.remoteCursor({ from: 'p1', zone: 'table', x: 0.5, y: 0.3, drag: { cardId: 'p1:0', index: null } });
    engine.remoteCursor({ from: 'p1', zone: 'table', x: 0.5, y: 0.3, drag: null });
    room = act(room, 'p0', { type: 'clue', cardId: 'p0:0', text: 'oi' });
    engine.update(viewOf(room, 'p0'));
    frame();
    expect(engine.getSnapshot().inFlight.size).toBe(0);
    expect(d.overlay.children).toHaveLength(0);
    engine.destroy();
  });

  it('pegar da mão uma carta minha que ainda está voltando reaproveita o overlay', () => {
    anchor('handSlot', 'p0:0', 450, 620);
    const { d, h, engine } = table(fullRow(2));
    drop(d, 'p0:0', 450, 40); // dono tira da mesa → voa pra mão
    expect(h.ret).toHaveBeenCalledWith('p0:0');
    expect(d.overlay.children).toHaveLength(1);
    const flying = d.overlay.firstElementChild;
    engine.beginHandDrag('p0:0', pointer('pointerdown', 450, 200) as unknown as PointerEvent);
    window.dispatchEvent(pointer('pointermove', 470, 220));
    frame();
    expect(d.overlay.children).toHaveLength(1);
    expect(d.overlay.firstElementChild).toBe(flying);
    expect(engine.getSnapshot().dragging).toBe('p0:0');
    frame(3000);
    expect(d.overlay.children).toHaveLength(1); // preso ao arrasto, não pousa sozinho
    engine.destroy();
  });

  it('carta morrendo (rodada anterior) ignora pointerdown', () => {
    let room = fullRow(2);
    room = act(room, 'p0', { type: 'forceReveal' });
    const { d, engine } = table(room);
    const old = cardEl(d, 'p0:0');
    room = act(act(room, 'p0', { type: 'next' }), 'p0', { type: 'beginRound' });
    room = act(room, 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
    engine.update(viewOf(room, 'p0')); // pulou o `theme`: distribuição nova
    old.dispatchEvent(pointer('pointerdown', 450, 318));
    window.dispatchEvent(pointer('pointermove', 470, 330));
    expect(engine.getSnapshot().inFlight.size).toBe(0);
    engine.destroy();
  });

  it('quem sai da sala leva junto o elemento do buraco', () => {
    const room = act(sortingRoom(2), 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
    const { d, engine } = table(room);
    engine.remoteCursor({ from: 'p1', zone: 'table', x: 0.3, y: 0.66, drag: { cardId: 'p1:0', index: 0 } });
    expect(d.row.querySelectorAll('.gap')).toHaveLength(1);
    const view = viewOf(room, 'p0');
    engine.update({ ...view, seats: view.seats.filter((s) => s.id !== 'p1') });
    expect(d.row.querySelectorAll('.gap')).toHaveLength(0);
    engine.destroy();
  });

  it('destroy no meio do arrasto avisa os outros; chamadas depois do destroy não fazem nada', () => {
    const room = fullRow(2);
    const { d, h, engine } = table(room);
    grab(d, 'p0:0', 450, 40);
    engine.destroy();
    expect(h.cursor).toHaveBeenLastCalledWith(expect.objectContaining({ drag: null }));
    expect(h.activity).toHaveBeenLastCalledWith('thinking');
    expect(document.body.classList.contains('grabbing')).toBe(false);
    engine.update(viewOf(room, 'p0'));
    engine.remoteCursor({ from: 'p1', zone: 'table', x: 0.5, y: 0.3, drag: { cardId: 'p1:0', index: null } });
    engine.remotePing('p1', 0.5, 0.5);
    expect(d.row.children).toHaveLength(0);
    expect(d.overlay.children).toHaveLength(0);
    expect(d.cursors.children).toHaveLength(0);
  });
});
