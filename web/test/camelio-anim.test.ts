import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CAMELIO_COLORS, type CamelioCard, type CamelioFrom, type CamelioState, type CamelioView } from '@cartolina/shared';
import { playTurnAnim, type AnimOptions } from '../src/games/camelio/anim';
import { backHtml, frontHtml } from '../src/games/camelio/cardArt';
import { SEAT_W, seatFit, seatSlots, stackLayout } from '../src/games/camelio/layout';
import { narrate } from '../src/games/camelio/narrate';
import { camelioView, patchGame, play, started, stateOf } from './camelio-fixtures';

// ids: 18/19 = vermelho 1, 20 = vermelho 2, 22 = vermelho 3, 23 = vermelho 4, 0 = verde 1, 5/6 = verde 4/amarelo 1
interface Turn {
  prev: CamelioView;
  next: CamelioView;
  you: string;
}

interface Setup {
  /** Mesa e área de pontos de quem recebe, antes da jogada. */
  table?: number[];
  scored?: number[];
  open: number;
  /** O topo é o último. */
  deck: number[];
}

/** Partida de 2 com o estado trocado; quem tem a vez (`you`) joga `from` pra si (`toSelf`) ou pro outro. */
function turnWith(setup: Setup, from: CamelioFrom, toSelf: boolean): Turn {
  const base = started(2);
  const you = stateOf(base).turn!;
  const other = stateOf(base).players.find((p) => p !== you)!;
  const to = toSelf ? you : other;
  const patch: Partial<CamelioState> = {
    open: setup.open,
    deck: setup.deck,
    table: { [you]: [], [other]: [], [to]: setup.table ?? [] },
    scored: { [you]: [], [other]: [], [to]: setup.scored ?? [] },
  };
  const room = patchGame(base, patch);
  const after = play(room, you, { type: 'play', from, to });
  return { prev: camelioView(room, you).game, next: camelioView(after, you).game, you };
}

const NONE = () => turnWith({ table: [20], open: 18, deck: [5, 6] }, 'open', false);
const SCORED_MINE = () => turnWith({ table: [20], open: 22, deck: [5, 6] }, 'open', true);
const BUST = () => turnWith({ table: [20], open: 23, deck: [5, 6] }, 'open', false);
/** Do monte (vira), pra uma mesa que já tinha o vermelho pontuado. */
const LOST = () => turnWith({ table: [20], scored: [22, 18, 19], open: 0, deck: [5, 23] }, 'deck', false);

function stacksHtml(cards: CamelioCard[], w: number): string {
  const colors = CAMELIO_COLORS.filter((c) => cards.some((x) => x.color === c));
  if (!colors.length) return '<div class="stacks empty"><span>mesa vazia</span></div>';
  const stack = (color: string) =>
    `<div class="stack" data-color="${color}"><div class="pile">${cards
      .filter((c) => c.color === color)
      .map((c) => frontHtml(c, w))
      .join('')}</div><span class="sum">?</span></div>`;
  return `<div class="stacks">${colors.map(stack).join('')}</div>`;
}

/** Palco mínimo com a marcação que a mesa gera (monte, aberta, assentos, a sua mesa com o leque). */
function mountStage(v: CamelioView, you: string): HTMLElement {
  const root = document.createElement('div');
  root.className = 'camelio';
  const seat = (p: string) => {
    const mine = p === you;
    const flags = [...new Set((v.scored[p] ?? []).map((c) => c.color))]
      .map((c) => `<span class="flag" data-color="${c}"></span>`)
      .join('');
    const fans = mine ? '<div class="fans"><span class="none">nenhum ponto</span></div>' : '';
    const w = mine ? 64 : stackLayout(false, 1).w;
    return `<div class="seat" data-pid="${p}"><div class="head"><span class="nm">${p}</span><span class="flags">${flags}</span></div>${stacksHtml(
      v.table[p] ?? [],
      w,
    )}${fans}</div>`;
  };
  root.innerHTML =
    `<div class="ring"><div data-pile="deck"><div class="slot">${v.top ? `<div class="lift">${backHtml(v.top, 92)}</div>` : ''}</div></div>` +
    `<div data-pile="open"><div class="slot">${v.open ? `<div class="lift">${frontHtml(v.open, 92)}</div>` : ''}</div></div></div>` +
    `<div class="seats">${v.players.filter((p) => p !== you).map(seat).join('')}</div>` +
    `<div class="cl-mine">${seat(you)}</div>`;
  document.body.appendChild(root);
  return root;
}

const nameOf = (id: string) => (id === 'p0' ? 'Ana' : 'Bia');

type Opts = AnimOptions & { say: ReturnType<typeof vi.fn>; sound: ReturnType<typeof vi.fn> };
function options(you: string, over: Partial<AnimOptions> = {}): Opts {
  return {
    nameOf,
    say: vi.fn(),
    sound: vi.fn(),
    layout: (pid: string, n: number) => stackLayout(pid === you, n),
    scale: 1,
    ...over,
  } as Opts;
}

function expectClean(root: HTMLElement) {
  // a virada engole erro (resolve assim mesmo): aqui ela não pode ter falhado
  expect(console.error).not.toHaveBeenCalled();
  expect(document.querySelector('.cl-fly')).toBeNull();
  const hidden = [...root.querySelectorAll<HTMLElement>('*')].filter((el) => el.style.visibility === 'hidden');
  expect(hidden).toEqual([]);
  root.querySelectorAll<HTMLElement>('.stack').forEach((el) => expect(el.style.transformOrigin).toBe(''));
}

const proto = Element.prototype as unknown as { animate?: unknown };
let cancels: ReturnType<typeof vi.fn>[] = [];
const animateNow = () =>
  vi.fn(() => {
    const cancel = vi.fn();
    cancels.push(cancel);
    return { finished: Promise.resolve(), cancel, onfinish: null };
  });
const animateNever = () => vi.fn(() => ({ finished: new Promise(() => {}), cancel: vi.fn(), onfinish: null }));

beforeEach(() => {
  cancels = [];
  vi.spyOn(console, 'error');
  proto.animate = animateNow();
});
afterEach(() => {
  delete proto.animate;
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('playTurnAnim', () => {
  const cases: [string, () => Turn, string][] = [
    ['none', NONE, 'drop'],
    ['scored', SCORED_MINE, 'scored'], // pra própria mesa (a sua mesa, com o leque)
    ['bust', BUST, 'bust'],
    ['lost', LOST, 'lost'],
  ];

  it.each(cases)('%s: resolve, narra, toca e não deixa nada pra trás', async (outcome, make, sfx) => {
    const t = make();
    expect(t.next.last?.outcome).toBe(outcome);
    const root = mountStage(t.prev, t.you);
    const opts = options(t.you);
    const anim = playTurnAnim(root, t.prev, t.next, opts);
    // clone síncrono e origem escondida já no primeiro quadro
    expect(root.querySelector('.cl-fly .fly-card')).not.toBeNull();
    const lift = root.querySelector<HTMLElement>(`[data-pile="${t.next.last!.from}"] .lift`)!;
    expect(lift.style.visibility).toBe('hidden');
    await anim.done;
    expect(opts.say).toHaveBeenCalledWith(narrate(t.next.last, nameOf));
    expect(opts.sound).toHaveBeenNthCalledWith(1, 'flip');
    expect(opts.sound).toHaveBeenLastCalledWith(sfx);
    expectClean(root);
    expect(lift.style.visibility).toBe('');
  });

  it('do monte: o clone tem as duas faces', () => {
    const t = turnWith({ table: [20], open: 0, deck: [5, 18] }, 'deck', false);
    const root = mountStage(t.prev, t.you);
    const anim = playTurnAnim(root, t.prev, t.next, options(t.you));
    expect(root.querySelectorAll('.cl-fly .fly-face')).toHaveLength(2);
    anim.stop();
  });

  it('dropFrom: a carta nasce onde o clone do arrasto caiu', () => {
    const t = NONE();
    const root = mountStage(t.prev, t.you);
    const anim = playTurnAnim(root, t.prev, t.next, options(t.you, { dropFrom: { x: 100, y: 200, from: 'open' } }));
    expect(root.querySelector<HTMLElement>('.cl-fly .fly-card')!.style.transform).toBe('translate(100px,200px)');
    anim.stop();
  });

  it('stop() no meio resolve o done e desfaz tudo', async () => {
    proto.animate = animateNever();
    const t = LOST();
    const root = mountStage(t.prev, t.you);
    const anim = playTurnAnim(root, t.prev, t.next, options(t.you));
    expect(root.querySelector('.cl-fly')).not.toBeNull();
    anim.stop();
    await anim.done;
    expectClean(root);
    anim.stop(); // de novo não faz nada
  });

  it('teto de 4 s: sem quadros, encerra e resolve assim mesmo', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    proto.animate = animateNever();
    const t = NONE();
    const root = mountStage(t.prev, t.you);
    const anim = playTurnAnim(root, t.prev, t.next, options(t.you));
    let resolved = false;
    void anim.done.then(() => (resolved = true));
    vi.advanceTimersByTime(3999);
    await Promise.resolve();
    expect(resolved).toBe(false);
    vi.advanceTimersByTime(1);
    await anim.done;
    expectClean(root);
  });

  it('lost: a bandeirinha cai numa cópia e a de verdade volta a aparecer', async () => {
    const t = LOST();
    const root = mountStage(t.prev, t.you);
    await playTurnAnim(root, t.prev, t.next, options(t.you)).done;
    expect(root.querySelector<HTMLElement>('.flag[data-color="vermelho"]')!.style.visibility).toBe('');
    expect(root.querySelectorAll('.flag')).toHaveLength(1);
  });

  it('as animações nos elementos de verdade saem antes do resolve', async () => {
    const t = SCORED_MINE();
    const root = mountStage(t.prev, t.you);
    await playTurnAnim(root, t.prev, t.next, options(t.you)).done;
    // o "nenhum ponto" da sua mesa apagou durante a subida; a animação dele foi cancelada no fim
    expect(cancels.some((c) => c.mock.calls.length > 0)).toBe(true);
  });

  it('uma virada nova no mesmo palco encerra a anterior', async () => {
    proto.animate = animateNever();
    const t = NONE();
    const root = mountStage(t.prev, t.you);
    const first = playTurnAnim(root, t.prev, t.next, options(t.you));
    const second = playTurnAnim(root, t.prev, t.next, options(t.you));
    await first.done;
    expect(root.querySelectorAll('.cl-fly')).toHaveLength(1);
    second.stop();
    await second.done;
    expectClean(root);
  });

  it('sem jogada pra mostrar, resolve na hora', async () => {
    const v = camelioView(started(2), 'p0').game;
    const root = mountStage(v, 'p0');
    const opts = options('p0');
    await playTurnAnim(root, v, v, opts).done;
    expect(opts.sound).not.toHaveBeenCalled();
    expectClean(root);
  });

  it('som que estoura não derruba a jogada', async () => {
    const t = NONE();
    const root = mountStage(t.prev, t.you);
    const sound = () => {
      throw new Error('sem áudio');
    };
    await playTurnAnim(root, t.prev, t.next, options(t.you, { sound })).done;
    expectClean(root);
  });
});

describe('layout', () => {
  it('seatFit: a maior carta que cabe no assento', () => {
    expect(seatFit(1)).toEqual({ w: 46, gap: 6, pad: 8 });
    expect(seatFit(4)).toEqual({ w: 39, gap: 6, pad: 8 });
    expect(seatFit(6)).toEqual({ w: 30, gap: 3, pad: 2 });
    for (let n = 1; n <= 6; n++) {
      const { w, gap, pad } = seatFit(n);
      expect(n * (w + pad) + (n - 1) * gap).toBeLessThanOrEqual(SEAT_W - 23);
    }
  });

  it('stackLayout: a sua mesa tem tamanho fixo', () => {
    expect(stackLayout(true, 5)).toEqual({ w: 64, gap: 14, pad: 8 });
    expect(stackLayout(false, 5)).toEqual(seatFit(5));
  });

  it('seatSlots: arco simétrico na largura, as pontas mais baixas', () => {
    const s = seatSlots(3, 1440);
    expect(s.map((p) => p.x)).toEqual([360 - 115, 720 - 115, 1080 - 115]);
    expect(s[1]!.y).toBe(20);
    expect(s[0]!.y).toBe(s[2]!.y);
    expect(s[0]!.y).toBeGreaterThan(s[1]!.y);
    expect(seatSlots(0, 1440)).toEqual([]);
  });
});
