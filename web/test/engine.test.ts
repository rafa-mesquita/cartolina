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
