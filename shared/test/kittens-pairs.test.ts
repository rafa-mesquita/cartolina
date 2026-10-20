import { describe, expect, it } from 'vitest';
import type { KittensCardKind } from '../src/games/kittens/cards';
import { settleKittens } from '../src/games/kittens/settle';
import { kittensViewFor } from '../src/games/kittens/view';
import { KITTENS_CHOICE_MS, type KittensAction, type KittensState } from '../src/games/kittens/types';
import { T0, act, ctxOf, ids, refuse, table } from './kittens-helpers';

const ctx = ctxOf(ids(3));
const at = (ms: number) => ctxOf(ids(3), { now: T0 + ms });
const hands = (): Record<string, string[]> => ({
  p0: ['mico-0', 'mico-1', 'quati-0', 'quati-1', 'tamandua-0', 'tamandua-1', 'preguica-0', 'preguica-1', 'capivara-0', 'capivara-1', 'favor-0'],
  p1: ['ataque-5', 'pular-5'],
  p2: ['espiar-5'],
});
/** Monte: o topo é o FIM do array. */
const DRAW = ['cafune-9', 'embaralhar-9', 'pular-9'];

/** p0 joga `action` e a janela de 5 s passa sem Nem vem!. */
function resolved(action: KittensAction, opts: { draw?: string[]; hands?: Record<string, string[]>; peek?: string[] } = {}): KittensState {
  const base = table({ hands: opts.hands ?? hands(), draw: opts.draw ?? DRAW });
  const withPeek = opts.peek ? { ...base, peek: { who: 'p0', cards: opts.peek } } : base;
  return settleKittens(act(withPeek, 'p0', action, ctx), at(5000));
}
const par = (cards: string[], extra: { target?: string; ask?: KittensCardKind } = {}): KittensAction => ({ type: 'play', cards, ...extra });

describe('par de Mico: o adversário escolhe o que te dar', () => {
  it('abre a escolha do Favor pro alvo', () => {
    const s = resolved(par(['mico-0', 'mico-1'], { target: 'p1' }));
    expect(s.choice).toEqual({ kind: 'favor', who: 'p1', to: 'p0', deadline: T0 + 5000 + KITTENS_CHOICE_MS });
    const given = act(s, 'p1', { type: 'choose', card: 'pular-5' }, at(5000));
    expect(given.hands.p0).toContain('pular-5');
    expect(given.log.at(-1)).toMatchObject({ ev: { t: 'gave', from: 'p1', to: 'p0', card: 'pular-5' }, seenBy: ['p1', 'p0'] });
  });
});

describe('par de Tamanduá: compra 2, tatu vai pro fundo, a vez continua', () => {
  it('sem tatu: as 2 de cima vão pra mão e a vez segue', () => {
    const s = resolved(par(['tamandua-0', 'tamandua-1']));
    expect(s.hands.p0).toEqual(expect.arrayContaining(['pular-9', 'embaralhar-9']));
    expect(s.draw).toEqual(['cafune-9']);
    expect(s).toMatchObject({ current: 'p0', owed: 1, choice: null });
    const draws = s.log.filter((e) => e.ev.t === 'draw');
    expect(draws.map((e) => e.ev)).toEqual([
      { t: 'draw', by: 'p0', card: 'pular-9' },
      { t: 'draw', by: 'p0', card: 'embaralhar-9' },
    ]);
    expect(draws.every((e) => JSON.stringify(e.seenBy) === '["p0"]')).toBe(true);
    expect(s.log.some((e) => e.ev.t === 'buried')).toBe(false);
  });

  it('Tatubum comprado vai pro fundo sem gastar Desarme; todos sabem quantos', () => {
    const s = resolved(par(['tamandua-0', 'tamandua-1']), { draw: ['cafune-9', 'tatubum-0', 'pular-9'] });
    expect(s.draw).toEqual(['tatubum-0', 'cafune-9']);
    expect(s.hands.p0).toContain('pular-9');
    expect(s.alive).toContain('p0');
    expect(s.log.at(-1)).toMatchObject({ ev: { t: 'buried', by: 'p0', tatus: 1 }, seenBy: null });
  });

  it('dois Tatubuns: os dois vão pro fundo; monte com 1 carta: compra só ela', () => {
    const two = resolved(par(['tamandua-0', 'tamandua-1']), { draw: ['pular-9', 'tatubum-0', 'tatubum-1'] });
    expect(two.draw.slice(0, 2).sort()).toEqual(['tatubum-0', 'tatubum-1']);
    expect(two.draw.at(-1)).toBe('pular-9');
    expect(two.log.at(-1)!.ev).toEqual({ t: 'buried', by: 'p0', tatus: 2 });
    const one = resolved(par(['tamandua-0', 'tamandua-1']), { draw: ['tatubum-0'] });
    expect(one.draw).toEqual(['tatubum-0']);
    expect(one.log.at(-1)!.ev).toEqual({ t: 'buried', by: 'p0', tatus: 1 });
  });

  it('a espiada some (o topo mudou)', () => {
    expect(resolved(par(['tamandua-0', 'tamandua-1']), { peek: ['pular-9', 'embaralhar-9', 'cafune-9'] }).peek).toBeNull();
  });
});

describe('par de Preguiça: puxa o bicho pedido', () => {
  it('de um adversário sorteado entre os que têm', () => {
    const s = resolved(par(['preguica-0', 'preguica-1'], { ask: 'quati' }), {
      hands: { ...hands(), p1: ['ataque-5', 'quati-7'], p2: ['quati-8'] },
    });
    const ev = s.log.at(-1)!.ev;
    if (ev.t !== 'called') throw new Error('esperava called');
    expect(['p1', 'p2']).toContain(ev.from);
    expect(ev.card).toMatch(/^quati-[78]$/);
    expect(s.hands.p0).toContain(ev.card);
    expect(s.hands[ev.from!]).not.toContain(ev.card);
    expect(s.log.at(-1)!.seenBy).toBeNull();
  });

  it('ninguém tem: procura no monte; nem no monte: nada', () => {
    const fromDraw = resolved(par(['preguica-0', 'preguica-1'], { ask: 'mico' }), { draw: ['mico-7', 'embaralhar-9', 'pular-9'] });
    expect(fromDraw.hands.p0).toContain('mico-7');
    expect(fromDraw.draw).toEqual(['embaralhar-9', 'pular-9']);
    expect(fromDraw.log.at(-1)!.ev).toEqual({ t: 'called', by: 'p0', ask: 'mico', from: null, card: 'mico-7' });
    const nothing = resolved(par(['preguica-0', 'preguica-1'], { ask: 'mico' }));
    expect(nothing.draw).toEqual(DRAW);
    expect(nothing.log.at(-1)!.ev).toEqual({ t: 'called', by: 'p0', ask: 'mico', from: null, card: null });
  });

  it('não puxa de si mesmo', () => {
    const s = resolved(par(['preguica-0', 'preguica-1'], { ask: 'capivara' }));
    expect(s.log.at(-1)!.ev).toEqual({ t: 'called', by: 'p0', ask: 'capivara', from: null, card: null });
    expect(s.hands.p0!.filter((c) => c.startsWith('capivara'))).toHaveLength(2);
  });
});

describe('par de Capivara: todos menos você passam uma carta pro próximo', () => {
  it('você não passa, mas recebe do jogador antes de você', () => {
    const before = hands();
    const s = resolved(par(['capivara-0', 'capivara-1']));
    const passes = s.log.filter((e) => e.ev.t === 'passed');
    expect(passes.map((e) => e.ev)).toEqual([
      expect.objectContaining({ from: 'p1', to: 'p2' }),
      expect.objectContaining({ from: 'p2', to: 'p0' }),
    ]);
    for (const { ev, seenBy } of passes) {
      if (ev.t !== 'passed') throw new Error('esperava passed');
      expect(seenBy).toEqual([ev.from, ev.to]);
      expect(before[ev.from]).toContain(ev.card);
      expect(s.hands[ev.to]).toContain(ev.card);
    }
    expect(s.hands.p0).toHaveLength(10); // 11 − 2 do par + 1 que recebeu
    expect(s.hands.p1).toHaveLength(1);
    expect(s.hands.p2).toHaveLength(1);
    expect(s).toMatchObject({ current: 'p0', owed: 1 });
  });

  it('quem está sem carta não passa', () => {
    const s = resolved(par(['capivara-0', 'capivara-1']), { hands: { ...hands(), p2: [] } });
    expect(s.log.filter((e) => e.ev.t === 'passed').map((e) => e.ev)).toEqual([expect.objectContaining({ from: 'p1', to: 'p2' })]);
    expect(s.hands.p2).toHaveLength(1);
  });

  it('quem não deu nem recebeu não vê a carta', () => {
    const s = resolved(par(['capivara-0', 'capivara-1']));
    const p1p2 = kittensViewFor(s, 'p0').log.find((e) => e.ev.t === 'passed' && e.ev.from === 'p1');
    expect(p1p2!.ev).toMatchObject({ t: 'passed', from: 'p1', to: 'p2', card: null });
  });
});

describe('trio: rouba um Desarme', () => {
  const trio = (): KittensAction => ({ type: 'play', cards: ['ataque-0', 'ataque-1', 'ataque-2'] });
  const withTrio = (others: Record<string, string[]>) => ({ p0: ['ataque-0', 'ataque-1', 'ataque-2'], ...others });

  it('de um adversário sorteado entre os que têm Desarme; todos veem', () => {
    const s = resolved(trio(), { hands: withTrio({ p1: ['pular-5'], p2: ['cafune-4', 'mico-4'] }) });
    expect(s.hands.p0).toEqual(['cafune-4']);
    expect(s.hands.p2).toEqual(['mico-4']);
    expect(s.log.at(-1)).toMatchObject({ ev: { t: 'grabbed', by: 'p0', from: 'p2', card: 'cafune-4' }, seenBy: null });
  });

  it('ninguém tem Desarme: nada acontece', () => {
    const s = resolved(trio(), { hands: withTrio({ p1: ['pular-5'], p2: [] }) });
    expect(s.hands.p1).toEqual(['pular-5']);
    expect(s.log.at(-1)!.ev).toEqual({ t: 'grabbed', by: 'p0', from: null, card: null });
  });
});
