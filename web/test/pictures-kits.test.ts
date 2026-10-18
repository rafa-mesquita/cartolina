import { KITS, PICTURES_DECK, PICTURES_THEME_NAMES, PICTURES_THEMES, isBlankWork, mulberry32, readyError, workError, workSchema, type WorkOf } from '@cartolina/shared';
import { fireEvent, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KITS_UI } from '../src/games/pictures/kits';
import { blocks } from '../src/games/pictures/kits/blocks';
import { cubes } from '../src/games/pictures/kits/cubes';
import { LIM } from '../src/games/pictures/kits/sticks';
import { ROPES, chainLength, dragPoint, makeChain, resample, SHEET_H, SHEET_W } from '../src/games/pictures/kits/laces';
import { PHOTO_FALLBACK_ICONS, PHOTO_THEMES, PICTURES_PHOTOS_READY, photoPlaceholder, photoSrc, photoTheme } from '../src/games/pictures/photos';
import { Photo } from '../src/games/pictures/Photo';
import { randomWork } from '../src/games/pictures/random';
import { picturesView, revealed, stateOf } from './pictures-fixtures';

/** Contexto 2D falso: qualquer método é um `vi.fn()`, qualquer propriedade guarda o que recebeu. */
function fakeContext(): CanvasRenderingContext2D {
  const store: Record<PropertyKey, unknown> = {};
  return new Proxy(store, {
    get: (t, k) => (k in t ? t[k] : (t[k] = vi.fn())),
    set: (t, k, v) => {
      t[k] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

const realGetContext = HTMLCanvasElement.prototype.getContext;
let el: HTMLDivElement;
beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => fakeContext()) as unknown as typeof realGetContext;
  el = document.createElement('div');
  el.style.cssText = 'position:relative;width:400px;height:300px';
  document.body.appendChild(el);
});
afterEach(() => {
  HTMLCanvasElement.prototype.getContext = realGetContext;
  el.remove();
});

describe('randomWork', () => {
  it.each(KITS)('%s: 300 obras válidas, sem erro de regra e não em branco', (kit) => {
    for (let i = 0; i < 300; i++) {
      const w = randomWork(kit);
      expect(w.kit).toBe(kit);
      const parsed = workSchema.safeParse(w);
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
      expect(workError(w)).toBeNull();
      expect(isBlankWork(w)).toBe(false);
      expect(readyError(w)).toBeNull();
    }
  });
});

describe('cadarços: resample', () => {
  it('polilinha reta de 160 pontos vira 60 igualmente espaçados, mesmas pontas, dentro de 0–1', () => {
    const P = Array.from({ length: 160 }, (_, i) => ({ x: 30 + (i * 540) / 159, y: 100 + (i * 250) / 159 }));
    const out = resample(P, 60);
    expect(out).toHaveLength(60);
    expect(out[0]).toEqual([0.05, Math.round((100 / SHEET_H) * 1000) / 1000]);
    expect(out[59]).toEqual([Math.round((570 / SHEET_W) * 1000) / 1000, Math.round((350 / SHEET_H) * 1000) / 1000]);
    for (const [x, y] of out) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
    }
    const gaps = out.slice(1).map(([x, y], k) => Math.hypot((x - out[k]![0]) * SHEET_W, (y - out[k]![1]) * SHEET_H));
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    for (const g of gaps) expect(Math.abs(g - mean)).toBeLessThan(1); // arredondamento de 3 casas em 0–1
  });

  it('nunca passa de 60 pontos nem sai de 0–1, mesmo com pontos fora da folha', () => {
    const P = [{ x: -50, y: -20 }, { x: 300, y: 200 }, { x: 900, y: 600 }];
    const out = resample(P, 60);
    expect(out).toHaveLength(60);
    expect(out.flat().every((v) => v >= 0 && v <= 1)).toBe(true);
  });
});

describe('cadarços: física da corda (spec §9)', () => {
  it.each(ROPES.map((s) => [s.id, s] as const))('%s: 50 puxões aleatórios mantêm o comprimento e os trechos', (_, spec) => {
    const rng = mulberry32(7);
    const chain = makeChain(spec);
    const full = (chain.N - 1) * chain.L;
    for (let k = 0; k < 50; k++) {
      const i = Math.floor(rng() * chain.N);
      // um puxão = vários passos pequenos até o alvo, como o arraste do mouse
      const tx = rng() * SHEET_W, ty = rng() * SHEET_H, p = chain.P[i]!, x0 = p.x, y0 = p.y;
      for (let s = 1; s <= 10; s++) dragPoint(chain, i, x0 + ((tx - x0) * s) / 10, y0 + ((ty - y0) * s) / 10);
    }
    const len = chainLength(chain);
    expect(len / full).toBeGreaterThanOrEqual(0.85);
    expect(len / full).toBeLessThanOrEqual(1.0);
    for (let j = 0; j < chain.N - 1; j++) {
      const a = chain.P[j]!, b = chain.P[j + 1]!;
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThanOrEqual(chain.L * 1.05);
    }
    for (const p of chain.P) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(SHEET_W);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(SHEET_H);
    }
  });

  it('a obra sai com no máximo 60 pontos por corda e passa no schema', () => {
    const work = { kit: 'laces' as const, long: randomWork('laces').long, short: randomWork('laces').short };
    const chain = makeChain(ROPES[0]!, work.long);
    expect(chain.P).toHaveLength(ROPES[0]!.n);
    expect(workSchema.safeParse({ ...work, long: resample(chain.P, ROPES[0]!.out) }).success).toBe(true);
  });
});

describe('show dos kits (jsdom)', () => {
  it.each(['cubes', 'icons', 'dots', 'sticks', 'laces'] as const)('%s: desenha sem lançar', (kit) => {
    const show = KITS_UI[kit].show as (el: HTMLElement, work: WorkOf<typeof kit>) => void;
    expect(() => show(el, randomWork(kit))).not.toThrow();
    expect(el.childElementCount).toBeGreaterThan(0);
  });

  it('icons: uma carta por símbolo, com a classe do Tabler', () => {
    KITS_UI.icons.show(el, { kit: 'icons', ids: [0, 14, 18] });
    expect([...el.querySelectorAll('i')].map((i) => i.className)).toEqual(['ti ti-circle', 'ti ti-heart', 'ti ti-paw']);
  });

  it('icons: a fila (com o vão) fica dentro do contêiner de tamanho, não nele', () => {
    KITS_UI.icons.show(el, { kit: 'icons', ids: [2, 3] });
    const box = el.firstElementChild!;
    expect(box.className).toBe('pc-ki-show');
    const fila = box.firstElementChild!;
    expect(fila.className).toBe('pc-ki-fila');
    expect(box.childElementCount).toBe(1);
    expect([...fila.children].map((c) => c.className)).toEqual(['pc-ki-card', 'pc-ki-card']);
  });

  it('sticks: o que está na gaveta (fora de 0–1) não aparece', () => {
    const p = (x: number) => ({ x, y: 0.5, rot: 0 });
    KITS_UI.sticks.show(el, { kit: 'sticks', sticks: [p(0.5), p(1.2), p(1.2), p(1.2)], stones: [p(-0.2), p(1.3), p(1.3), p(0.3)] });
    expect(el.querySelectorAll('g')).toHaveLength(2);
  });
});

describe('build dos kits (jsdom)', () => {
  it('cubes: clicar numa casa põe a cor ativa; destroy limpa', () => {
    const onChange = vi.fn();
    const bench = cubes.build(el, null, onChange);
    const cell = el.querySelector<HTMLElement>('[data-i="5"]')!;
    const realFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => cell;
    try {
      fireEvent.pointerDown(cell, { clientX: 10, clientY: 10, pointerId: 1 });
      fireEvent.pointerUp(window, { pointerId: 1 });
    } finally {
      document.elementFromPoint = realFromPoint;
    }
    expect(onChange).toHaveBeenCalledTimes(1);
    const work = onChange.mock.calls[0]![0] as WorkOf<'cubes'>;
    expect(work.kit).toBe('cubes');
    expect(work.cells[5]).toBe(0);
    expect(work.cells.filter((c) => c !== null)).toHaveLength(1);
    expect(() => bench.destroy()).not.toThrow();
    expect(el.childElementCount).toBe(0);
  });

  it('cubes: botão direito não pinta', () => {
    const onChange = vi.fn();
    const bench = cubes.build(el, null, onChange);
    const cell = el.querySelector<HTMLElement>('[data-i="2"]')!;
    const realFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => cell;
    try {
      fireEvent.pointerDown(cell, { button: 2, pointerId: 1 });
    } finally {
      document.elementFromPoint = realFromPoint;
    }
    expect(onChange).not.toHaveBeenCalled();
    bench.destroy();
  });

  it('cubes: montar a partir de um rascunho não chama onChange', () => {
    const onChange = vi.fn();
    const bench = cubes.build(el, randomWork('cubes'), onChange);
    expect(el.querySelectorAll('.pc-kc-cube[data-i]')).toHaveLength(16);
    expect(onChange).not.toHaveBeenCalled();
    bench.destroy();
  });

  it.each(['icons', 'dots', 'sticks', 'laces'] as const)('%s: monta e desmonta sem lançar, sem onChange', (kit) => {
    const onChange = vi.fn();
    const build = KITS_UI[kit].build as (el: HTMLElement, w: WorkOf<typeof kit> | null, f: () => void) => { destroy(): void };
    const bench = build(el, randomWork(kit), onChange);
    expect(el.childElementCount).toBeGreaterThan(0);
    expect(onChange).not.toHaveBeenCalled();
    expect(() => bench.destroy()).not.toThrow();
    expect(el.childElementCount).toBe(0);
  });

  it('icons: a partir de uma obra, clicar numa carta da mão põe ela no fim da fila', () => {
    const onChange = vi.fn();
    const bench = KITS_UI.icons.build(el, { kit: 'icons', ids: [4, 0] }, onChange);
    fireEvent.click(el.querySelector('.pc-ki-hand [data-id="9"]')!);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0]).toEqual({ kit: 'icons', ids: [4, 0, 9] });
    bench.destroy();
  });

  it('sticks: a partir de uma obra, a rodinha na peça 0 só gira ela', () => {
    const onChange = vi.fn();
    const work = randomWork('sticks');
    const bench = KITS_UI.sticks.build(el, work, onChange);
    fireEvent.wheel(el.querySelector('.pc-ks-p[data-i="0"] rect')!, { deltaY: 100 });
    expect(onChange).toHaveBeenCalledTimes(1);
    const out = onChange.mock.calls[0]![0] as WorkOf<'sticks'>;
    expect(out.sticks[0]).toEqual({ ...work.sticks[0], rot: (work.sticks[0]!.rot + 15) % 360 });
    expect(out.sticks.slice(1)).toEqual(work.sticks.slice(1));
    expect(out.stones).toEqual(work.stones);
    bench.destroy();
  });

  it('sticks: o limite do arraste fica dentro do −0,5/1,5 do schema', () => {
    expect(LIM.x0).toBeGreaterThanOrEqual(-0.5);
    expect(LIM.y0).toBeGreaterThanOrEqual(-0.5);
    expect(LIM.x1).toBeLessThanOrEqual(1.5);
    expect(LIM.y1).toBeLessThanOrEqual(1.5);
  });

  it('laces: reconstruir a corda a partir da obra e reamostrar volta perto da obra', () => {
    // distância (px) de um ponto até a polilinha da obra
    const toPx = ([x, y]: readonly [number, number]) => ({ x: x * SHEET_W, y: y * SHEET_H });
    function distance(p: { x: number; y: number }, line: readonly (readonly [number, number])[]): number {
      let best = Infinity;
      for (let j = 1; j < line.length; j++) {
        const a = toPx(line[j - 1]!), b = toPx(line[j]!), dx = b.x - a.x, dy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
        best = Math.min(best, Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)));
      }
      return best;
    }
    for (let k = 0; k < 20; k++) {
      const w = randomWork('laces');
      for (const spec of ROPES) {
        const orig = w[spec.id];
        const back = resample(makeChain(spec, orig).P, orig.length);
        expect(back).toHaveLength(orig.length);
        // mesmas pontas e o mesmo desenho (os pontos podem escorregar ao longo da corda, que sai igualmente espaçada)
        expect(Math.hypot(...[0, 1].map((c) => (back[0]![c]! - orig[0]![c]!) * 600))).toBeLessThan(1.5);
        expect(Math.hypot(...[0, 1].map((c) => (back.at(-1)![c]! - orig.at(-1)![c]!) * 600))).toBeLessThan(1.5);
        for (const q of back) expect(distance(toPx(q), orig)).toBeLessThan(1.5);
      }
    }
  });

  it('blocks: exporta build e show (o three.js só carrega dentro deles)', () => {
    expect(typeof blocks.build).toBe('function');
    expect(typeof blocks.show).toBe('function');
    expect(KITS_UI.blocks).toBe(blocks);
  });
});

describe('three.js sob demanda', () => {
  afterEach(() => {
    vi.doUnmock('three');
    vi.resetModules();
  });

  it('importar kits/index.ts não carrega o three; o show dos blocos carrega', async () => {
    vi.resetModules();
    let loaded = false;
    vi.doMock('three', () => {
      loaded = true;
      return {};
    });
    const { KITS_UI: fresh } = await import('../src/games/pictures/kits');
    expect(loaded).toBe(false);
    // prova de que o mock enxerga o carregamento: o show pede o three (o falso quebra e cai no "tentar de novo")
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    fresh.blocks.show(el, randomWork('blocks'));
    await vi.waitFor(() => expect(el.textContent).toContain('tentar de novo'));
    expect(loaded).toBe(true);
    quiet.mockRestore();
  });
});

describe('fotos provisórias', () => {
  it('o mesmo id gera sempre o mesmo desenho', () => {
    for (const { id } of PICTURES_DECK) expect(photoPlaceholder(id)).toEqual(photoPlaceholder(id));
  });

  it('o ícone e a cor vêm da família do tema da foto', () => {
    for (const { id, theme } of PICTURES_DECK) {
      const ph = photoPlaceholder(id);
      expect(ph.theme).toBe(theme);
      expect(photoTheme(id)).toBe(theme);
      expect(PHOTO_THEMES[theme].icons).toContain(ph.icon);
      expect(ph.hue).toBe(PHOTO_THEMES[theme].hue);
      expect(ph.label).toBe(`${PICTURES_THEME_NAMES[theme]} · ${id.slice(1)}`);
    }
  });

  it('todo tema tem cor e ícone; tema sem ícone próprio cai no genérico', () => {
    for (const t of PICTURES_THEMES) {
      expect(PHOTO_THEMES[t].icons.length).toBeGreaterThan(0);
      expect(PHOTO_THEMES[t].hue).toBeGreaterThanOrEqual(0);
    }
    expect(PHOTO_THEMES.locomotiva.icons).toEqual(PHOTO_FALLBACK_ICONS);
    expect(PHOTO_THEMES.gato.icons).toContain('cat');
  });

  it('fotos variam entre si (não é tudo igual)', () => {
    const icons = new Set(PICTURES_DECK.map(({ id }) => photoPlaceholder(id).icon));
    const lights = new Set(PICTURES_DECK.map(({ id }) => photoPlaceholder(id).light));
    expect(icons.size).toBeGreaterThan(10);
    expect(lights.size).toBeGreaterThan(5);
  });

  it('as 100 fotos do baralho têm foto real', () => {
    expect(PICTURES_PHOTOS_READY.size).toBe(100);
    for (const { id } of PICTURES_DECK) expect(PICTURES_PHOTOS_READY.has(id)).toBe(true);
  });

  it('photoSrc: miniatura na grade, cheia no zoom; id sem foto real é null (nada de 404)', () => {
    const base = import.meta.env.BASE_URL;
    expect(photoSrc('p001', 'thumb')).toBe(`${base}pictures/fotos/p001-thumb.webp`);
    expect(photoSrc('p100', 'full')).toBe(`${base}pictures/fotos/p100.webp`);
    expect(photoSrc('p101', 'thumb')).toBeNull();
    expect(photoSrc('x', 'full')).toBeNull();
  });

  it('a foto mostra a miniatura (ou miniatura + cheia) com o nome do tema no alt', () => {
    const { container, unmount } = render(createElement(Photo, { id: 'p073' }));
    const imgs = container.querySelectorAll('img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0]!.getAttribute('src')).toMatch(/p073-thumb.webp$/);
    expect(imgs[0]!.getAttribute('alt')).toBe('ônibus');
    expect(imgs[0]!.getAttribute('loading')).toBe('lazy');
    unmount();
    const full = render(createElement(Photo, { id: 'p073', size: 'full' })).container.querySelectorAll('img');
    expect([...full].map((i) => i.getAttribute('src')!.split('/').pop())).toEqual(['p073-thumb.webp', 'p073.webp']);
    expect(full[1]!.getAttribute('alt')).toBe('ônibus');
  });
});

describe('fixtures', () => {
  it('revealed: a rodada chega na revelação com as obras aleatórias', () => {
    const room = revealed(3);
    expect(stateOf(room).phase).toBe('reveal');
    const v = picturesView(room, 'p0');
    expect(v.game.result?.order).toHaveLength(3);
  });
});
