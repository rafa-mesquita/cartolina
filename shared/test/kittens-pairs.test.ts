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
function resolved(
  action: KittensAction,
  opts: { draw?: string[]; hands?: Record<string, string[]>; peek?: string[]; owed?: number } = {},
): KittensState {
  const base = table({ hands: opts.hands ?? hands(), draw: opts.draw ?? DRAW, owed: opts.owed });
  const withPeek = opts.peek ? { ...base, peeks: { p0: opts.peek } } : base;
  return settleKittens(act(withPeek, 'p0', action, ctx), at(5000));
}
const par = (cards: string[], extra: { target?: string; ask?: KittensCardKind } = {}): KittensAction => ({ type: 'play', cards, ...extra });

describe('par de Mico: os outros descartam uma carta à escolha deles', () => {
  const mico = (opts: Parameters<typeof resolved>[1] = {}) => resolved(par(['mico-0', 'mico-1']), opts);

  it('abre a escolha pra quem tem carta, na ordem dos assentos; não precisa de alvo', () => {
    const s = mico();
    expect(s.choice).toEqual({ kind: 'mico', by: 'p0', waiting: ['p1', 'p2'], deadline: T0 + 5000 + KITTENS_CHOICE_MS });
    expect(s.pending).toBeNull();
    expect(s.discard).toEqual(['mico-0', 'mico-1']);
    // A escolha é pública: todo mundo vê quem ainda falta.
    expect(kittensViewFor(s, 'p2').choice).toEqual(s.choice);
    expect(kittensViewFor(s, null).choice).toEqual(s.choice);
  });

  it('quem está sem carta não entra na espera', () => {
    expect(mico({ hands: { ...hands(), p1: [] } }).choice).toMatchObject({ kind: 'mico', waiting: ['p2'] });
  });

  it('ninguém mais tem carta: nada acontece (sem escolha)', () => {
    const s = mico({ hands: { ...hands(), p1: [], p2: [] } });
    expect(s.choice).toBeNull();
    expect(s).toMatchObject({ current: 'p0', owed: 1 });
  });

  it('cada um descarta uma carta de verdade: evento público, a carta vai pro descarte sem efeito', () => {
    const s = mico();
    const one = act(s, 'p1', { type: 'choose', card: 'pular-5' }, at(5000));
    expect(one.hands.p1).toEqual(['ataque-5']);
    expect(one.discard).toEqual(['mico-0', 'mico-1', 'pular-5']);
    expect(one.choice).toMatchObject({ kind: 'mico', waiting: ['p2'] });
    expect(one.log.at(-1)).toMatchObject({ ev: { t: 'discarded', by: 'p1', card: 'pular-5' }, seenBy: null });
    expect(one).toMatchObject({ current: 'p0', owed: 1 }); // o Pular descartado não pulou nada
    expect(kittensViewFor(one, 'p2').log.at(-1)!.ev).toEqual({ t: 'discarded', by: 'p1', card: 'pular-5' });
    const two = act(one, 'p2', { type: 'choose', card: 'espiar-5' }, at(5000));
    expect(two.choice).toBeNull();
    expect(two.hands.p2).toEqual([]);
    expect(two.discard).toEqual(['mico-0', 'mico-1', 'pular-5', 'espiar-5']);
    expect(two.peeks).toEqual({}); // o Espiar descartado também não faz nada
    expect(two).toMatchObject({ current: 'p0', owed: 1 });
  });

  it('só quem falta escolhe, com carta da própria mão', () => {
    const s = mico();
    expect(refuse(s, 'p0', { type: 'choose', card: 'quati-0' }, at(5000))).toBe('not_your_choice');
    expect(refuse(s, 'espectador', { type: 'choose', card: 'quati-0' }, at(5000))).toBe('not_your_choice');
    expect(refuse(s, 'p1', { type: 'choose', card: 'espiar-5' }, at(5000))).toBe('bad_choice');
    expect(refuse(s, 'p1', { type: 'choose', card: 'nao-existe' }, at(5000))).toBe('bad_choice');
    expect(refuse(s, 'p1', { type: 'choose' }, at(5000))).toBe('bad_choice');
    const after = act(s, 'p1', { type: 'choose', card: 'pular-5' }, at(5000));
    expect(refuse(after, 'p1', { type: 'choose', card: 'ataque-5' }, at(5000))).toBe('not_your_choice');
  });

  it('quem jogou não age enquanto a escolha está aberta', () => {
    const s = mico();
    expect(refuse(s, 'p0', { type: 'draw' }, at(5000))).toBe('waiting_choice');
    expect(refuse(s, 'p0', par(['quati-0', 'quati-1']), at(5000))).toBe('waiting_choice');
  });

  it('prazo vencido: cada um que falta descarta uma carta ao acaso', () => {
    const half = act(mico(), 'p1', { type: 'choose', card: 'pular-5' }, at(5000));
    const late = settleKittens(half, at(5000 + KITTENS_CHOICE_MS));
    expect(late.choice).toBeNull();
    expect(late.hands.p1).toEqual(['ataque-5']); // quem já tinha descartado não perde outra
    expect(late.hands.p2).toEqual([]);
    expect(late.log.at(-1)!.ev).toEqual({ t: 'discarded', by: 'p2', card: 'espiar-5' });
    const none = settleKittens(mico(), at(5000 + KITTENS_CHOICE_MS));
    expect(none.choice).toBeNull();
    expect(none.hands.p1).toHaveLength(1);
    expect(none.hands.p2).toHaveLength(0);
    expect(none.discard).toHaveLength(4);
    expect(none.log.filter((e) => e.ev.t === 'discarded').map((e) => e.ev)).toEqual([
      expect.objectContaining({ t: 'discarded', by: 'p1' }),
      expect.objectContaining({ t: 'discarded', by: 'p2', card: 'espiar-5' }),
    ]);
  });

  it('quem está na espera e cai de vez sai dela (a mão vai pra fora); o último a sair fecha a escolha', () => {
    const noP1 = settleKittens(mico(), ctxOf(['p0', 'p2'], { now: T0 + 5000 }));
    expect(noP1.choice).toMatchObject({ kind: 'mico', waiting: ['p2'] });
    expect(noP1.alive).toEqual(['p0', 'p2']);
    expect(noP1.out).toEqual(expect.arrayContaining(['ataque-5', 'pular-5']));
    const noBoth = settleKittens(noP1, ctxOf(['p0'], { now: T0 + 5000 }));
    expect(noBoth.choice).toBeNull();
    expect(noBoth.phase).toBe('gameover');
    // O que sobrou descartando depois da saída do outro também fecha.
    const done = act(noP1, 'p2', { type: 'choose', card: 'espiar-5' }, ctxOf(['p0', 'p2'], { now: T0 + 5000 }));
    expect(done.choice).toBeNull();
  });

  it('se quem jogou cai, a escolha continua pros outros', () => {
    const only = ctxOf(['p1', 'p2'], { now: T0 + 5000 });
    const left = settleKittens(mico(), only);
    expect(left.choice).toMatchObject({ kind: 'mico', by: 'p0', waiting: ['p1', 'p2'] });
    expect(left.current).toBe('p1');
    const a = act(left, 'p1', { type: 'choose', card: 'pular-5' }, only);
    const b = act(a, 'p2', { type: 'choose', card: 'espiar-5' }, only);
    expect(b.choice).toBeNull();
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

  it('as 2 compradas saem da espiada; a que sobra continua à mostra (é o topo agora)', () => {
    expect(resolved(par(['tamandua-0', 'tamandua-1']), { peek: ['pular-9', 'embaralhar-9', 'cafune-9'] }).peeks).toEqual({ p0: ['cafune-9'] });
    // Tatubum comprado vai pro fundo e também sai da espiada.
    const tatu = resolved(par(['tamandua-0', 'tamandua-1']), { draw: ['cafune-9', 'tatubum-0', 'pular-9'], peek: ['pular-9', 'tatubum-0', 'cafune-9'] });
    expect(tatu.draw).toEqual(['tatubum-0', 'cafune-9']);
    expect(tatu.peeks).toEqual({ p0: ['cafune-9'] });
  });

  it('sob ataque (owed 2) o par não gasta turno: a vez e a dívida ficam', () => {
    const s = resolved(par(['tamandua-0', 'tamandua-1']), { owed: 2 });
    expect(s).toMatchObject({ current: 'p0', owed: 2 });
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

  it('jogador fora da partida é pulado: nada passa de ou pra ele', () => {
    const ctx4 = ctxOf(ids(4));
    const four = table({
      hands: { p0: ['capivara-0', 'capivara-1'], p1: ['ataque-5'], p2: [], p3: ['espiar-5'] },
      draw: DRAW,
    });
    const start = { ...four, alive: ['p0', 'p1', 'p3'] }; // p2 já saiu
    const s = settleKittens(act(start, 'p0', par(['capivara-0', 'capivara-1']), ctx4), ctxOf(ids(4), { now: T0 + 5000 }));
    expect(s.log.filter((e) => e.ev.t === 'passed').map((e) => e.ev)).toEqual([
      expect.objectContaining({ from: 'p1', to: 'p3', card: 'ataque-5' }),
      expect.objectContaining({ from: 'p3', to: 'p0', card: 'espiar-5' }),
    ]);
    expect(s.hands).toEqual({ p0: ['espiar-5'], p1: [], p2: [], p3: ['ataque-5'] });
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

describe('par de Quati: a carta de cima fica ou vai pro fundo', () => {
  const fuca = () => resolved(par(['quati-0', 'quati-1']));

  it('abre a escolha; só quem jogou vê a carta de cima', () => {
    const s = fuca();
    expect(s.choice).toEqual({ kind: 'quati', who: 'p0', deadline: T0 + 5000 + KITTENS_CHOICE_MS });
    expect(kittensViewFor(s, 'p0').choice).toEqual({ ...s.choice, card: 'pular-9' });
    expect(kittensViewFor(s, 'p1').choice).toEqual({ ...s.choice, card: null });
    expect(kittensViewFor(s, null).choice).toEqual({ ...s.choice, card: null });
    expect(JSON.stringify(kittensViewFor(s, 'p1'))).not.toContain('"pular-9"');
  });

  it('FUNDO: vai pro fundo; todos sabem que foi, ninguém sabe qual', () => {
    const s = act(fuca(), 'p0', { type: 'choose', keep: false }, at(5000));
    expect(s.draw).toEqual(['pular-9', 'cafune-9', 'embaralhar-9']);
    expect(s).toMatchObject({ choice: null, current: 'p0', owed: 1 });
    expect(s.log.at(-1)).toMatchObject({ ev: { t: 'delayed', by: 'p0', moved: true }, seenBy: null });
  });

  it('FICA: nada muda no monte', () => {
    const s = act(fuca(), 'p0', { type: 'choose', keep: true }, at(5000));
    expect(s.draw).toEqual(DRAW);
    expect(s.log.at(-1)!.ev).toEqual({ t: 'delayed', by: 'p0', moved: false });
  });

  it('sem resposta, a carta fica; só quem jogou escolhe', () => {
    expect(refuse(fuca(), 'p0', { type: 'choose' }, at(5000))).toBe('bad_choice');
    expect(refuse(fuca(), 'p1', { type: 'choose', keep: false }, at(5000))).toBe('not_your_choice');
    const late = settleKittens(fuca(), at(5000 + KITTENS_CHOICE_MS));
    expect(late.draw).toEqual(DRAW);
    expect(late.choice).toBeNull();
    expect(late.log.at(-1)!.ev).toEqual({ t: 'delayed', by: 'p0', moved: false });
  });

  it('mandar pro fundo tira a carta da espiada (como se fosse comprada); ficar não muda nada', () => {
    const s = resolved(par(['quati-0', 'quati-1']), { peek: ['pular-9', 'embaralhar-9', 'cafune-9'] });
    expect(act(s, 'p0', { type: 'choose', keep: false }, at(5000)).peeks).toEqual({ p0: ['embaralhar-9', 'cafune-9'] });
    expect(act(s, 'p0', { type: 'choose', keep: true }, at(5000)).peeks).toEqual({ p0: ['pular-9', 'embaralhar-9', 'cafune-9'] });
  });
});
