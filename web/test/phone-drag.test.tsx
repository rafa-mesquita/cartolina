import { act as rtlAct, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi, type Mock } from 'vitest';
import type { GameConn } from '../src/net/connection';
import { deskCursor } from '../src/table/phone/phoneRowLogic';
import { usePhoneDrag } from '../src/table/phone/usePhoneDrag';

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

afterEach(() => vi.useRealTimers());

const rect = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 300, height: bottom - top, width: 300, x: 0, y: top, toJSON() {} }) as DOMRect;
const SPOTS: Record<string, DOMRect> = { a: rect(0, 40), b: rect(50, 90), c: rect(100, 140) };

type Conn = { sendCursor: Mock<GameConn['sendCursor']>; sendActivity: Mock<GameConn['sendActivity']> };

function Harness({
  row = ['a', 'b', 'c'],
  serverRow = row,
  canPick = () => true,
  conn,
  onDrop,
  onClick,
}: {
  row?: string[];
  serverRow?: string[];
  canPick?: (id: string) => boolean;
  conn: Conn;
  onDrop: (id: string, index: number) => void;
  onClick?: (id: string) => void;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const drag = usePhoneDrag({ container: box, row, serverRow, canPick, conn, onDrop });
  return (
    <div>
      <div
        ref={(el) => {
          box.current = el;
          if (el) el.getBoundingClientRect = () => rect(0, 400); // a barra da mão fica abaixo de 400
        }}
        data-testid="box"
      >
        {row.map((id) => (
          <div
            key={id}
            data-card={id}
            data-testid={id}
            ref={(el) => {
              if (el) el.getBoundingClientRect = () => SPOTS[id]!;
            }}
            onPointerDown={(e) => drag.onPointerDown(e, id)}
            onClick={() => onClick?.(id)}
          />
        ))}
      </div>
      <button data-testid="h" onPointerDown={(e) => drag.onPointerDown(e, 'h')} onClick={() => onClick?.('h')}>
        h
      </button>
      <output data-testid="state">{`${drag.dragging ?? '-'}|${drag.pos ?? '-'}`}</output>
    </div>
  );
}

const mkConn = (): Conn => ({ sendCursor: vi.fn<GameConn['sendCursor']>(), sendActivity: vi.fn<GameConn['sendActivity']>() });
const state = () => screen.getByTestId('state').textContent;

describe('arrastar no celular', () => {
  it('mouse: começa depois de 6 px, solta na posição 2 e avisa o PC', () => {
    const conn = mkConn();
    const onDrop = vi.fn();
    render(<Harness conn={conn} onDrop={onDrop} />);
    fireEvent.pointerDown(screen.getByTestId('h'), { pointerType: 'mouse', button: 0, clientX: 0, clientY: 200 });
    fireEvent.pointerMove(window, { pointerType: 'mouse', clientX: 0, clientY: 197 });
    expect(state()).toBe('-|-'); // ainda dentro dos 6 px
    fireEvent.pointerMove(window, { pointerType: 'mouse', clientX: 0, clientY: 95 });
    expect(state()).toBe('h|2');
    expect(conn.sendActivity).toHaveBeenCalledWith('dragging');
    expect(conn.sendCursor).toHaveBeenLastCalledWith(expect.objectContaining({ zone: 'table', drag: { cardId: 'h', index: 2 } }));
    fireEvent.pointerUp(window, { pointerType: 'mouse', clientX: 0, clientY: 95 });
    expect(onDrop).toHaveBeenCalledWith('h', 2);
    expect(conn.sendCursor).toHaveBeenLastCalledWith(expect.objectContaining({ drag: null }));
    expect(conn.sendActivity).toHaveBeenLastCalledWith('thinking');
    expect(state()).toBe('-|-');
  });

  it('toque segurado 220 ms vira arrasto', () => {
    vi.useFakeTimers();
    const conn = mkConn();
    render(<Harness conn={conn} onDrop={vi.fn()} />);
    fireEvent.pointerDown(screen.getByTestId('h'), { pointerType: 'touch', clientX: 0, clientY: 200 });
    rtlAct(() => void vi.advanceTimersByTime(219));
    expect(state()).toBe('-|-');
    rtlAct(() => void vi.advanceTimersByTime(2));
    expect(state()).toBe('h|3'); // o vão já aparece sob o dedo
    fireEvent.pointerMove(window, { pointerType: 'touch', clientX: 0, clientY: 30 });
    expect(state()).toBe('h|1');
  });

  it('o guarda de touchmove existe desde a montagem; só segura o gesto com o arrasto ativo', () => {
    vi.useFakeTimers();
    render(<Harness conn={mkConn()} onDrop={vi.fn()} />);
    const touchmove = () => {
      const ev = new Event('touchmove', { cancelable: true, bubbles: true });
      document.body.dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    expect(touchmove()).toBe(false); // sem toque nenhum: não segura
    fireEvent.pointerDown(screen.getByTestId('h'), { pointerType: 'touch', clientX: 0, clientY: 200 });
    expect(touchmove()).toBe(false); // ainda não segurou: deixa rolar
    rtlAct(() => void vi.advanceTimersByTime(230));
    expect(touchmove()).toBe(true);
    const notCancelable = new Event('touchmove', { cancelable: false, bubbles: true });
    document.body.dispatchEvent(notCancelable);
    expect(notCancelable.defaultPrevented).toBe(false);
    fireEvent.pointerUp(window, { pointerType: 'touch', clientX: 0, clientY: 200 });
    expect(touchmove()).toBe(false);
  });

  it('o guarda de touchmove sai ao desmontar', () => {
    const { unmount } = render(<Harness conn={mkConn()} onDrop={vi.fn()} />);
    const spy = vi.spyOn(document, 'removeEventListener');
    unmount();
    expect(spy).toHaveBeenCalledWith('touchmove', expect.any(Function));
    spy.mockRestore();
  });

  it('arrastar com o mouse não segura touchmove', () => {
    render(<Harness conn={mkConn()} onDrop={vi.fn()} />);
    fireEvent.pointerDown(screen.getByTestId('h'), { pointerType: 'mouse', button: 0, clientX: 0, clientY: 200 });
    fireEvent.pointerMove(window, { pointerType: 'mouse', clientX: 0, clientY: 95 });
    const ev = new Event('touchmove', { cancelable: true, bubbles: true });
    document.body.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it('toque que mexe antes dos 220 ms é rolagem: nada acontece', () => {
    vi.useFakeTimers();
    const conn = mkConn();
    const onDrop = vi.fn();
    render(<Harness conn={conn} onDrop={onDrop} />);
    fireEvent.pointerDown(screen.getByTestId('h'), { pointerType: 'touch', clientX: 0, clientY: 200 });
    rtlAct(() => void vi.advanceTimersByTime(50));
    fireEvent.pointerMove(window, { pointerType: 'touch', clientX: 0, clientY: 180 });
    fireEvent.pointerUp(window, { pointerType: 'touch', clientX: 0, clientY: 180 });
    rtlAct(() => void vi.advanceTimersByTime(500));
    expect(state()).toBe('-|-');
    expect(onDrop).not.toHaveBeenCalled();
    expect(conn.sendCursor).not.toHaveBeenCalled();
    expect(conn.sendActivity).not.toHaveBeenCalled();
  });

  it('carta que não pode ser pega: nada acontece', () => {
    const conn = mkConn();
    const onDrop = vi.fn();
    render(<Harness conn={conn} onDrop={onDrop} canPick={() => false} />);
    fireEvent.pointerDown(screen.getByTestId('h'), { pointerType: 'mouse', button: 0, clientX: 0, clientY: 200 });
    fireEvent.pointerMove(window, { pointerType: 'mouse', clientX: 0, clientY: 95 });
    fireEvent.pointerUp(window, { pointerType: 'mouse', clientX: 0, clientY: 95 });
    expect(onDrop).not.toHaveBeenCalled();
    expect(conn.sendCursor).not.toHaveBeenCalled();
    expect(state()).toBe('-|-');
  });

  it('soltar a carta da fila onde ela já está: sem alvo, volta e avisa o PC', () => {
    const conn = mkConn();
    const onDrop = vi.fn();
    render(<Harness conn={conn} onDrop={onDrop} />);
    fireEvent.pointerDown(screen.getByTestId('b'), { pointerType: 'mouse', button: 0, clientX: 0, clientY: 70 });
    fireEvent.pointerMove(window, { pointerType: 'mouse', clientX: 0, clientY: 78 });
    expect(state()).toBe('b|-');
    fireEvent.pointerUp(window, { pointerType: 'mouse', clientX: 0, clientY: 78 });
    expect(onDrop).not.toHaveBeenCalled();
    expect(conn.sendCursor).toHaveBeenLastCalledWith(expect.objectContaining({ drag: null }));
    expect(conn.sendActivity).toHaveBeenLastCalledWith('thinking');
  });

  it('carta da fila arrastada pro fim: o índice é o do servidor (sem contar ela mesma)', () => {
    const onDrop = vi.fn();
    render(<Harness conn={mkConn()} onDrop={onDrop} />);
    fireEvent.pointerDown(screen.getByTestId('b'), { pointerType: 'mouse', button: 0, clientX: 0, clientY: 70 });
    fireEvent.pointerMove(window, { pointerType: 'mouse', clientX: 0, clientY: 160 });
    expect(state()).toBe('b|3');
    fireEvent.pointerUp(window, { pointerType: 'mouse', clientX: 0, clientY: 160 });
    expect(onDrop).toHaveBeenCalledWith('b', 2);
  });

  it('o cursor do PC usa a fila do servidor (intenção pendente não muda o índice)', () => {
    const conn = mkConn();
    // Mostro [a, h, b, c] (h minha, ainda não confirmada); o servidor só tem [a, b, c].
    render(<Harness conn={conn} row={['a', 'h', 'b', 'c']} serverRow={['a', 'b', 'c']} onDrop={vi.fn()} />);
    fireEvent.pointerDown(screen.getAllByTestId('h')[0]!, { pointerType: 'mouse', button: 0, clientX: 0, clientY: 70 });
    fireEvent.pointerMove(window, { pointerType: 'mouse', clientX: 0, clientY: 160 });
    expect(conn.sendCursor).toHaveBeenLastCalledWith(expect.objectContaining({ drag: { cardId: 'h', index: 3 } }));
  });

  it('depois de um arrasto o clique que o navegador dispara é engolido', () => {
    vi.useFakeTimers();
    const onClick = vi.fn();
    render(<Harness conn={mkConn()} onDrop={vi.fn()} onClick={onClick} />);
    const h = screen.getByTestId('h');
    fireEvent.pointerDown(h, { pointerType: 'mouse', button: 0, clientX: 0, clientY: 200 });
    fireEvent.pointerMove(window, { pointerType: 'mouse', clientX: 0, clientY: 95 });
    fireEvent.pointerUp(window, { pointerType: 'mouse', clientX: 0, clientY: 95 });
    fireEvent.click(h);
    expect(onClick).not.toHaveBeenCalled();
    rtlAct(() => void vi.advanceTimersByTime(200));
    fireEvent.click(h);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('toque curto sem arrasto continua sendo clique', () => {
    const onClick = vi.fn();
    render(<Harness conn={mkConn()} onDrop={vi.fn()} onClick={onClick} />);
    const h = screen.getByTestId('h');
    fireEvent.pointerDown(h, { pointerType: 'mouse', button: 0, clientX: 0, clientY: 200 });
    fireEvent.pointerUp(window, { pointerType: 'mouse', clientX: 0, clientY: 200 });
    fireEvent.click(h);
    expect(onClick).toHaveBeenCalledWith('h');
  });

  it('rola sozinho perto da borda de baixo', () => {
    vi.useFakeTimers();
    render(<Harness conn={mkConn()} onDrop={vi.fn()} />);
    const box = screen.getByTestId('box');
    let top = 0;
    Object.defineProperty(box, 'scrollTop', { get: () => top, set: (v: number) => void (top = v), configurable: true });
    box.getBoundingClientRect = () => rect(0, 400);
    fireEvent.pointerDown(screen.getByTestId('h'), { pointerType: 'mouse', button: 0, clientX: 0, clientY: 300 });
    fireEvent.pointerMove(window, { pointerType: 'mouse', clientX: 0, clientY: 390 });
    rtlAct(() => void vi.advanceTimersByTime(50));
    expect(top).toBeGreaterThanOrEqual(16);
    fireEvent.pointerUp(window, { pointerType: 'mouse', clientX: 0, clientY: 390 });
    const stopped = top;
    rtlAct(() => void vi.advanceTimersByTime(100));
    expect(top).toBe(stopped);
  });

  it('terminado o arrasto, os listeners da janela saem: pointermove depois não faz nada', () => {
    const conn = mkConn();
    render(<Harness conn={conn} onDrop={vi.fn()} />);
    fireEvent.pointerDown(screen.getByTestId('h'), { pointerType: 'mouse', button: 0, clientX: 0, clientY: 200 });
    fireEvent.pointerMove(window, { pointerType: 'mouse', clientX: 0, clientY: 95 });
    fireEvent.pointerUp(window, { pointerType: 'mouse', clientX: 0, clientY: 95 });
    const calls = conn.sendCursor.mock.calls.length;
    const acts = conn.sendActivity.mock.calls.length;
    fireEvent.pointerMove(window, { pointerType: 'mouse', clientX: 0, clientY: 10 });
    fireEvent.pointerMove(window, { pointerType: 'mouse', clientX: 0, clientY: 130 });
    fireEvent.pointerUp(window, { pointerType: 'mouse', clientX: 0, clientY: 130 });
    expect(conn.sendCursor).toHaveBeenCalledTimes(calls);
    expect(conn.sendActivity).toHaveBeenCalledTimes(acts);
    expect(state()).toBe('-|-');
  });

  it('desmontar no meio do arrasto solta os listeners', () => {
    const conn = mkConn();
    const { unmount } = render(<Harness conn={conn} onDrop={vi.fn()} />);
    fireEvent.pointerDown(screen.getByTestId('h'), { pointerType: 'mouse', button: 0, clientX: 0, clientY: 200 });
    fireEvent.pointerMove(window, { pointerType: 'mouse', clientX: 0, clientY: 95 });
    unmount();
    const calls = conn.sendCursor.mock.calls.length;
    fireEvent.pointerMove(window, { pointerType: 'mouse', clientX: 0, clientY: 10 });
    expect(conn.sendCursor).toHaveBeenCalledTimes(calls);
  });

  it('soltar sobre a barra da mão (fora da fila) não coloca a carta; voltar pra dentro traz o alvo de volta', () => {
    const conn = mkConn();
    const onDrop = vi.fn();
    render(<Harness conn={conn} onDrop={onDrop} />);
    fireEvent.pointerDown(screen.getByTestId('h'), { pointerType: 'mouse', button: 0, clientX: 0, clientY: 200 });
    fireEvent.pointerMove(window, { pointerType: 'mouse', clientX: 0, clientY: 95 });
    expect(state()).toBe('h|2');
    fireEvent.pointerMove(window, { pointerType: 'mouse', clientX: 0, clientY: 450 });
    expect(state()).toBe('h|-');
    fireEvent.pointerUp(window, { pointerType: 'mouse', clientX: 0, clientY: 450 });
    expect(onDrop).not.toHaveBeenCalled();
    expect(conn.sendCursor).toHaveBeenLastCalledWith(expect.objectContaining({ drag: null }));

    fireEvent.pointerDown(screen.getByTestId('h'), { pointerType: 'mouse', button: 0, clientX: 0, clientY: 450 });
    fireEvent.pointerMove(window, { pointerType: 'mouse', clientX: 0, clientY: 440 });
    fireEvent.pointerMove(window, { pointerType: 'mouse', clientX: 0, clientY: 95 });
    fireEvent.pointerUp(window, { pointerType: 'mouse', clientX: 0, clientY: 95 });
    expect(onDrop).toHaveBeenCalledWith('h', 2);
  });

  it('carta da fila arrastada pra baixo da fila: sem alvo, volta', () => {
    const onDrop = vi.fn();
    render(<Harness conn={mkConn()} onDrop={onDrop} />);
    fireEvent.pointerDown(screen.getByTestId('b'), { pointerType: 'mouse', button: 0, clientX: 0, clientY: 70 });
    fireEvent.pointerMove(window, { pointerType: 'mouse', clientX: 0, clientY: 460 });
    fireEvent.pointerUp(window, { pointerType: 'mouse', clientX: 0, clientY: 460 });
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('sem alvo, o cursor do PC fica no índice atual da carta no servidor (ou no fim, se vem da mão)', () => {
    const conn = mkConn();
    render(<Harness conn={conn} onDrop={vi.fn()} />);
    fireEvent.pointerDown(screen.getByTestId('b'), { pointerType: 'mouse', button: 0, clientX: 0, clientY: 70 });
    fireEvent.pointerMove(window, { pointerType: 'mouse', clientX: 0, clientY: 78 });
    fireEvent.pointerUp(window, { pointerType: 'mouse', clientX: 0, clientY: 78 });
    expect(conn.sendCursor).toHaveBeenLastCalledWith({ ...deskCursor(['a', 'b', 'c'], 'b', 1), drag: null });

    fireEvent.pointerDown(screen.getByTestId('h'), { pointerType: 'mouse', button: 0, clientX: 0, clientY: 450 });
    fireEvent.pointerMove(window, { pointerType: 'mouse', clientX: 0, clientY: 440 });
    fireEvent.pointerUp(window, { pointerType: 'mouse', clientX: 0, clientY: 440 });
    expect(conn.sendCursor).toHaveBeenLastCalledWith({ ...deskCursor(['a', 'b', 'c'], 'h', 3), drag: null });
  });

  it('não rola com o dedo abaixo da fila (sobre a barra da mão)', () => {
    vi.useFakeTimers();
    render(<Harness conn={mkConn()} onDrop={vi.fn()} />);
    const box = screen.getByTestId('box');
    let top = 0;
    Object.defineProperty(box, 'scrollTop', { get: () => top, set: (v: number) => void (top = v), configurable: true });
    fireEvent.pointerDown(screen.getByTestId('h'), { pointerType: 'mouse', button: 0, clientX: 0, clientY: 300 });
    fireEvent.pointerMove(window, { pointerType: 'mouse', clientX: 0, clientY: 450 });
    rtlAct(() => void vi.advanceTimersByTime(100));
    expect(top).toBe(0);
  });

  it('um 2º dedo não derruba o arrasto ativo; o 1º dedo ainda solta', () => {
    vi.useFakeTimers();
    const onDrop = vi.fn();
    render(<Harness conn={mkConn()} onDrop={onDrop} />);
    fireEvent.pointerDown(screen.getByTestId('h'), { pointerType: 'touch', pointerId: 1, clientX: 0, clientY: 200 });
    rtlAct(() => void vi.advanceTimersByTime(230));
    fireEvent.pointerMove(window, { pointerType: 'touch', pointerId: 1, clientX: 0, clientY: 95 });
    fireEvent.pointerDown(screen.getByTestId('a'), { pointerType: 'touch', pointerId: 2, clientX: 0, clientY: 20 });
    rtlAct(() => void vi.advanceTimersByTime(300));
    fireEvent.pointerUp(window, { pointerType: 'touch', pointerId: 2, clientX: 0, clientY: 20 });
    expect(state()).toBe('h|2');
    fireEvent.pointerUp(window, { pointerType: 'touch', pointerId: 1, clientX: 0, clientY: 95 });
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledWith('h', 2);
  });

  it('pressão ainda não ativa é trocada por uma nova', () => {
    vi.useFakeTimers();
    render(<Harness conn={mkConn()} onDrop={vi.fn()} />);
    fireEvent.pointerDown(screen.getByTestId('h'), { pointerType: 'touch', pointerId: 1, clientX: 0, clientY: 200 });
    fireEvent.pointerDown(screen.getByTestId('a'), { pointerType: 'touch', pointerId: 2, clientX: 0, clientY: 20 });
    rtlAct(() => void vi.advanceTimersByTime(230));
    expect(state().startsWith('a|')).toBe(true);
  });

  it('pointercancel durante o arrasto ativo: não solta e avisa o PC', () => {
    vi.useFakeTimers();
    const conn = mkConn();
    const onDrop = vi.fn();
    render(<Harness conn={conn} onDrop={onDrop} />);
    fireEvent.pointerDown(screen.getByTestId('h'), { pointerType: 'touch', clientX: 0, clientY: 200 });
    rtlAct(() => void vi.advanceTimersByTime(230));
    fireEvent.pointerMove(window, { pointerType: 'touch', clientX: 0, clientY: 95 });
    fireEvent(window, new PointerEvent('pointercancel', { pointerType: 'touch' }));
    expect(onDrop).not.toHaveBeenCalled();
    expect(conn.sendCursor).toHaveBeenLastCalledWith(expect.objectContaining({ drag: null }));
    expect(conn.sendActivity).toHaveBeenLastCalledWith('thinking');
    expect(state()).toBe('-|-');
  });

  it('vibra de leve ao ativar o arrasto de toque', () => {
    vi.useFakeTimers();
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true, writable: true });
    try {
      render(<Harness conn={mkConn()} onDrop={vi.fn()} />);
      fireEvent.pointerDown(screen.getByTestId('h'), { pointerType: 'touch', clientX: 0, clientY: 200 });
      rtlAct(() => void vi.advanceTimersByTime(230));
      expect(vibrate).toHaveBeenCalledWith(10);
    } finally {
      delete (navigator as unknown as { vibrate?: unknown }).vibrate;
    }
  });
});
