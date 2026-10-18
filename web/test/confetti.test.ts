import { afterEach, describe, expect, it, vi } from 'vitest';
import { confetti } from '../src/table/confetti';

/** Contexto 2D de mentira (o jsdom não desenha): só registra as chamadas. */
function fakeCanvas() {
  const ctx = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
  };
  const canvas = document.createElement('canvas');
  vi.spyOn(canvas, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  return { canvas, ctx };
}

describe('confete', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('interromper no meio apaga o canvas (o canvas da mesa do Diquisti fica montado e guardava o último quadro)', () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const { canvas, ctx } = fakeCanvas();

    const stop = confetti(canvas);
    frames.shift()!(performance.now() + 16); // um quadro desenhado: confete no ar
    expect(ctx.fillRect).toHaveBeenCalled();
    ctx.clearRect.mockClear();

    stop();
    expect(ctx.clearRect).toHaveBeenCalled();
  });
});
