import { KITTENS_CARD_KINDS } from '@cartolina/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ART, SOLDADO, VERSO } from '../src/games/kittens/art';
import { Cerrado, paletteAt, scene, shade } from '../src/games/kittens/cerrado';
import { Fx } from '../src/games/kittens/fx';
import { CARD_STYLE, Sprites, snapToPalette } from '../src/games/kittens/sprites';
import { Sound } from '../src/games/kittens/sounds';
import { saveSoundPref } from '../src/net/identity';

/**
 * jsdom não desenha: o `getContext` devolve um contexto que só ANOTA o que foi pintado (cor + retângulo) e o
 * `toDataURL` devolve um resumo dessa anotação. Mesmo desenho => mesma URL.
 */
const realGetContext = HTMLCanvasElement.prototype.getContext;
const realToDataURL = HTMLCanvasElement.prototype.toDataURL;
const logs = new WeakMap<HTMLCanvasElement, string[]>();

function fakeContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const log: string[] = [];
  logs.set(canvas, log);
  const ctx = {
    fillStyle: '#000000',
    fillRect: vi.fn((x: number, y: number, w: number, h: number) => log.push(`${String(ctx.fillStyle)}@${x},${y},${w},${h}`)),
    drawImage: vi.fn(),
    clearRect: vi.fn(),
    putImageData: vi.fn(),
    getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) })),
    createImageData: vi.fn((w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h })),
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
    return fakeContext(this);
  } as unknown as typeof realGetContext;
  HTMLCanvasElement.prototype.toDataURL = function (this: HTMLCanvasElement) {
    const text = (logs.get(this) ?? []).join(';');
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = (h * 33 + text.charCodeAt(i)) >>> 0;
    return `data:image/png;base64,${this.width}x${this.height}-${h.toString(16)}`;
  };
});
afterEach(() => {
  HTMLCanvasElement.prototype.getContext = realGetContext;
  HTMLCanvasElement.prototype.toDataURL = realToDataURL;
  Cerrado.stop();
  vi.useRealTimers();
});

describe('cerrado: cenário das cartas', () => {
  it('devolve uma URL do tamanho pedido', () => {
    expect(scene(56, 78, 7, '#e4572e')).toMatch(/^data:image\/png;base64,56x78-/);
  });

  it('é determinístico pela semente e muda com a semente e com a cor', () => {
    const a = scene(56, 78, 7, '#e4572e');
    expect(scene(56, 78, 7, '#e4572e')).toBe(a);
    expect(scene(56, 78, 8, '#e4572e')).not.toBe(a);
    expect(scene(56, 78, 7, '#3b8a4a')).not.toBe(a);
  });

  it('shade clareia e escurece', () => {
    expect(shade('#808080', 1)).toBe('#ffffff');
    expect(shade('#808080', -1)).toBe('#000000');
    expect(Cerrado.shade).toBe(shade);
    expect(Sprites.shade('#808080', 1)).toBe('#ffffff');
  });
});

describe('cerrado: ciclo do dia', () => {
  it('a noite tem estrelas e vaga-lumes; o meio-dia não', () => {
    const noite = paletteAt(0), dia = paletteAt(0.5);
    expect(noite.stars).toBe(1);
    expect(noite.flies).toBe(1);
    expect(dia.stars).toBe(0);
    expect(dia.flies).toBe(0);
    expect(paletteAt(1).stars).toBe(1);
  });

  it('mistura as horas vizinhas (entre a noite e o amanhecer)', () => {
    const p = paletteAt(0.16);
    expect(p.stars).toBeGreaterThan(0.25);
    expect(p.stars).toBeLessThan(1);
    expect(p.sky).toHaveLength(4);
    expect(p.land).toHaveLength(8);
    expect(p.cloud).toHaveLength(3);
  });

  it('start desenha na largura pedida, setPhase fixa a hora e stop para o relógio', () => {
    vi.useFakeTimers();
    const canvas = document.createElement('canvas');
    Cerrado.start(canvas, 7, 400, { phase: 0.5 });
    expect([canvas.width, canvas.height]).toEqual([400, 180]);
    Cerrado.setPhase(0.8);
    vi.advanceTimersByTime(250);
    Cerrado.setPhase(null);
    Cerrado.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('artes', () => {
  it('toda carta tem arte', () => {
    for (const k of KITTENS_CARD_KINDS) {
      expect(ART[k], k).toEqual(expect.any(String));
      expect(ART[k]!.length, k).toBeGreaterThan(0);
    }
    expect(VERSO).toEqual(expect.any(String));
    expect(SOLDADO).toEqual(expect.any(String));
  });

  it('toda carta tem estilo, dica e sprite de reserva', () => {
    for (const k of KITTENS_CARD_KINDS) {
      expect(CARD_STYLE[k].hint.length, k).toBeGreaterThan(0);
      const s = Sprites.card(k);
      expect(s.w, k).toBeGreaterThan(0);
      expect(s.h, k).toBeGreaterThan(0);
    }
    expect(Sprites.style).toBe(CARD_STYLE);
    expect(CARD_STYLE.mico.hint).toBe('par: me dá uma');
  });

  it('o tatu do assento muda com a cor do jogador', () => {
    expect(Sprites.tatu('#ff0000').url).not.toBe(Sprites.tatu('#0000ff').url);
  });
});

describe('snapToPalette', () => {
  it('encaixa na cor mais próxima e zera o quase transparente', () => {
    const d = new Uint8ClampedArray([250, 10, 10, 255, 9, 9, 9, 50, 10, 10, 240, 255]);
    snapToPalette(d, [[255, 0, 0], [0, 0, 255]]);
    expect(Array.from(d)).toEqual([255, 0, 0, 255, 9, 9, 9, 0, 0, 0, 255, 255]);
  });
});

describe('sons', () => {
  /** AudioContext mínimo que só conta o que foi criado. */
  function fakeAudio() {
    const made = { ctx: 0, osc: 0, noise: 0 };
    const param = () => ({ value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
    const node = <T extends object>(extra: T) => ({ ...extra, connect: (x: unknown) => x, start: vi.fn(), stop: vi.fn() });
    class FakeCtx {
      currentTime = 0;
      sampleRate = 8000;
      state = 'running';
      destination = {};
      constructor() {
        made.ctx++;
      }
      resume = vi.fn(() => Promise.resolve());
      createOscillator() {
        made.osc++;
        return node({ type: '', frequency: param() });
      }
      createGain() {
        return node({ gain: param() });
      }
      createBiquadFilter() {
        return node({ type: '', frequency: param() });
      }
      createBuffer(_c: number, len: number) {
        const data = new Float32Array(len);
        return { getChannelData: () => data };
      }
      createBufferSource() {
        made.noise++;
        return node({ buffer: null });
      }
    }
    vi.stubGlobal('AudioContext', FakeCtx);
    return made;
  }
  afterEach(() => vi.unstubAllGlobals());

  it('não toca com o som desligado', () => {
    const made = fakeAudio();
    saveSoundPref(false);
    Sound.play('boom');
    Sound.play('select');
    expect(made).toEqual({ ctx: 0, osc: 0, noise: 0 });
    expect(Sound.muted).toBe(true);
  });

  it('toca com o som ligado', () => {
    const made = fakeAudio();
    saveSoundPref(true);
    Sound.play('boom');
    expect(made.ctx).toBe(1);
    expect(made.osc).toBeGreaterThan(0);
    expect(made.noise).toBeGreaterThan(0);
    expect(Sound.muted).toBe(false);
  });

  it('toggle muda a preferência do site e diz se ficou mudo', () => {
    saveSoundPref(true);
    expect(Sound.toggle()).toBe(true);
    expect(Sound.muted).toBe(true);
    expect(Sound.toggle()).toBe(false);
  });
});

describe('efeitos', () => {
  it('uma carta que voa entra na camada e sai no fim; flipTo troca o conteúdo', async () => {
    const stage = document.createElement('div');
    const layer = document.createElement('div');
    const particles = document.createElement('canvas');
    stage.append(layer, particles);
    document.body.append(stage);
    Fx.init(stage, layer, particles, () => 1);
    expect([particles.width, particles.height]).toEqual([360, 225]);

    const node = document.createElement('div');
    const verso = document.createElement('div');
    verso.className = 'card back';
    const frente = document.createElement('div');
    frente.className = 'card front';
    frente.textContent = 'frente';
    const voo = Fx.fly({ node, from: { x: 0, y: 0 }, to: { x: 100, y: 100 }, flipTo: frente });
    expect(layer.contains(node)).toBe(true);
    expect(node.classList.contains('flying')).toBe(true);
    await voo;
    expect(layer.contains(node)).toBe(false);
    expect(node.textContent).toBe('frente');
    expect(verso.className).toBe('card back');

    await Fx.stamp(node, 'NEM VEM!');
    Fx.sparks({ x: 10, y: 10 });
    Fx.dispose();
    stage.remove();
  }, 10_000);

  it('sem Fx.init avisa com uma mensagem clara', async () => {
    vi.resetModules();
    const { Fx: novo } = await import('../src/games/kittens/fx');
    await expect(novo.cross(document.createElement('div'))).rejects.toThrow(/Fx.init/);
  });

  it('depois do dispose os efeitos no ar viram no-ops (rastro, carimbo, flash, tremor)', async () => {
    vi.useFakeTimers();
    const stage = document.createElement('div');
    const layer = document.createElement('div');
    const particles = document.createElement('canvas');
    stage.append(layer, particles);
    document.body.append(stage);
    Fx.init(stage, layer, particles, () => 1);

    const node = document.createElement('div');
    const voo = Fx.fly({ node, from: { x: 0, y: 0 }, to: { x: 100, y: 100 }, trail: '#fff' });
    const carimbo = Fx.stamp(node, 'NEM VEM!');
    Fx.dispose();
    // o rastro (setInterval de 30 ms) foi parado e nada lança depois do dispose
    expect(vi.getTimerCount()).toBe(1); // só o tempo-limite do rastro; o setInterval foi limpo
    expect(() => {
      Fx.shake();
      Fx.flash();
      Fx.sparks({ x: 1, y: 1 });
      Fx.fireworks({ x: 1, y: 1 });
      expect(Fx.box(node)).toEqual({ x: 0, y: 0, w: 0, h: 0 });
    }).not.toThrow();
    await vi.advanceTimersByTimeAsync(5000);
    await expect(voo).resolves.toBeUndefined();
    await expect(carimbo).resolves.toBeUndefined();
    await expect(Fx.pop('BUM!', { x: 0, y: 0 })).resolves.toBeUndefined();
    await expect(Fx.cross(node)).resolves.toBeUndefined();
    await expect(Fx.fly({ node, from: { x: 0, y: 0 }, to: { x: 1, y: 1 } })).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(1000);
    stage.remove();
  });
});
