import { describe, expect, it } from 'vitest';
import { settleKittens } from '../src/games/kittens/settle';
import { KITTENS_CHOICE_MS, type KittensState } from '../src/games/kittens/types';
import { kittensViewFor } from '../src/games/kittens/view';
import { T0, act, ctxOf, everyCard, ids, refuse, table } from './kittens-helpers';

const ctx = ctxOf(ids(3));
const at = (ms: number) => ctxOf(ids(3), { now: T0 + ms });
/** Monte: o topo é o FIM do array; a de baixo é a primeira. */
const DRAW = ['quati-9', 'pular-9', 'tatubum-0', 'espiar-9'];

/** p0 joga o Feitiço e a janela passa sem Nem vem!: a escolha está aberta. */
function conjuring(opts: { draw?: string[]; p0?: string[]; owed?: number } = {}): KittensState {
  const s = table({
    hands: { p0: opts.p0 ?? ['feitico-0', 'mico-0'], p1: ['nemvem-1', 'ataque-1'], p2: ['mico-2'] },
    draw: opts.draw ?? DRAW,
    owed: opts.owed,
  });
  return settleKittens(act(s, 'p0', { type: 'play', cards: ['feitico-0'] }, ctx), at(5000));
}

describe('Feitiço: a carta de baixo do monte', () => {
  it('abre a escolha; só quem jogou vê a carta de baixo', () => {
    const s = conjuring();
    expect(s.choice).toEqual({ kind: 'feitico', who: 'p0', deadline: T0 + 5000 + KITTENS_CHOICE_MS });
    expect(s.discard).toEqual(['feitico-0']);
    expect(kittensViewFor(s, 'p0').choice).toEqual({ kind: 'feitico', who: 'p0', deadline: T0 + 5000 + KITTENS_CHOICE_MS, card: 'quati-9' });
    for (const viewer of ['p1', 'p2', 'p9', null]) {
      const v = kittensViewFor(s, viewer);
      expect(v.choice).toMatchObject({ kind: 'feitico', who: 'p0', card: null });
      expect(JSON.stringify(v)).not.toContain('quati-9');
    }
    expect(refuse(s, 'p0', { type: 'draw' }, at(5000))).toBe('waiting_choice');
    expect(refuse(s, 'p1', { type: 'choose', keep: true }, at(5000))).toBe('not_your_choice');
    expect(refuse(s, 'p0', { type: 'choose' }, at(5000))).toBe('bad_choice');
  });

  it('ficar com ela: vai pra mão (como se comprasse) e gasta o turno', () => {
    const s = act(conjuring(), 'p0', { type: 'choose', keep: true }, at(6000));
    expect(s.hands.p0).toEqual(['mico-0', 'quati-9']);
    expect(s.draw).toEqual(['pular-9', 'tatubum-0', 'espiar-9']);
    expect(s).toMatchObject({ choice: null, current: 'p1', owed: 1 });
    const evs = s.log.slice(-2);
    expect(evs[0]).toMatchObject({ ev: { t: 'conjured', by: 'p0', kept: true }, seenBy: null });
    expect(evs[1]).toMatchObject({ ev: { t: 'draw', by: 'p0', card: 'quati-9' }, seenBy: ['p0'] });
    expect(JSON.stringify(kittensViewFor(s, 'p1'))).not.toContain('quati-9');
  });

  it('mandar pro topo: ninguém sabe qual era, e também gasta o turno', () => {
    const s = act(conjuring(), 'p0', { type: 'choose', keep: false }, at(6000));
    expect(s.hands.p0).toEqual(['mico-0']);
    expect(s.draw).toEqual(['pular-9', 'tatubum-0', 'espiar-9', 'quati-9']);
    expect(s).toMatchObject({ choice: null, current: 'p1', owed: 1 });
    expect(s.log.at(-1)).toMatchObject({ ev: { t: 'conjured', by: 'p0', kept: false }, seenBy: null });
  });

  it('sob ataque gasta só um dos turnos', () => {
    const s = act(conjuring({ owed: 2 }), 'p0', { type: 'choose', keep: false }, at(6000));
    expect(s).toMatchObject({ current: 'p0', owed: 1 });
  });

  it('ficar com um Tatubum é como comprá-lo: com Desarme, a escolha do Desarme; depois esconde e gasta o turno', () => {
    const draw = ['tatubum-0', 'pular-9', 'espiar-9'];
    const s = act(conjuring({ draw, p0: ['feitico-0', 'cafune-0'] }), 'p0', { type: 'choose', keep: true }, at(6000));
    expect(s.choice).toMatchObject({ kind: 'tatu', who: 'p0', tatu: 'tatubum-0' });
    expect(s.draw).toEqual(['pular-9', 'espiar-9']);
    expect(s.log.slice(-2).map((e) => e.ev)).toEqual([
      { t: 'conjured', by: 'p0', kept: true },
      { t: 'tatu', by: 'p0' },
    ]);
    const used = act(s, 'p0', { type: 'choose', card: 'cafune-0' }, at(7000));
    const hid = act(used, 'p0', { type: 'choose', position: 0 }, at(8000));
    expect(hid.draw.at(-1)).toBe('tatubum-0');
    expect(hid).toMatchObject({ choice: null, current: 'p1', owed: 1 });
  });

  it('ficar com um Tatubum sem Desarme: explode', () => {
    const draw = ['tatubum-0', 'pular-9', 'tatubum-1'];
    const start = table({ hands: { p0: ['feitico-0', 'mico-0'], p1: [], p2: [] }, draw });
    const s0 = settleKittens(act(start, 'p0', { type: 'play', cards: ['feitico-0'] }, ctx), at(5000));
    const s = act(s0, 'p0', { type: 'choose', keep: true }, at(6000));
    expect(s.alive).toEqual(['p1', 'p2']);
    expect(s.out).toEqual(['tatubum-0', 'mico-0']);
    expect(s.log.at(-1)!.ev).toEqual({ t: 'boom', by: 'p0' });
    expect(s).toMatchObject({ current: 'p1', owed: 1, choice: null });
    expect(everyCard(s)).toEqual(everyCard(start));
  });

  it('prazo vencido: a carta de baixo vai pro topo, seja qual for (quem assiste não aprende nada)', () => {
    const late = (s: KittensState) => settleKittens(s, at(5000 + KITTENS_CHOICE_MS));
    const plain = late(conjuring());
    expect(plain.draw).toEqual(['pular-9', 'tatubum-0', 'espiar-9', 'quati-9']);
    expect(plain.hands.p0).toEqual(['mico-0']);
    expect(plain).toMatchObject({ choice: null, current: 'p1', owed: 1 });
    const tatu = late(conjuring({ draw: ['tatubum-0', 'pular-9'] }));
    expect(tatu.draw).toEqual(['pular-9', 'tatubum-0']);
    expect(tatu.hands.p0).toEqual(['mico-0']);
    // O que todo mundo vê é igual nos dois casos: o mesmo evento, a mesma mão de quem jogou, a vez passando.
    for (const s of [plain, tatu]) {
      expect(s.log.at(-1)!.ev).toEqual({ t: 'conjured', by: 'p0', kept: false });
      expect(kittensViewFor(s, 'p1').handCounts.p0).toBe(1);
    }
  });

  it('Nem vem! cancela: nada acontece e a vez continua', () => {
    const s = table({ hands: { p0: ['feitico-0'], p1: ['nemvem-1'], p2: [] }, draw: DRAW });
    const air = act(s, 'p0', { type: 'play', cards: ['feitico-0'] }, ctx);
    const done = settleKittens(act(air, 'p1', { type: 'nope' }, at(1000)), at(6000));
    expect(done).toMatchObject({ choice: null, current: 'p0', owed: 1, draw: DRAW });
    expect(done.discard).toEqual(['feitico-0', 'nemvem-1']);
  });

  it('quem está escolhendo cai de vez: a carta de baixo vai pro topo e ele sai; o monte fica com vivos − 1 tatus', () => {
    const s = conjuring({ draw: ['mico-9', 'tatubum-0', 'tatubum-1'] });
    const after = settleKittens(s, ctxOf(['p1', 'p2'], { now: T0 + 6000 }));
    expect(after.alive).toEqual(['p1', 'p2']);
    expect(after.choice).toBeNull();
    expect(after.draw).toEqual(['tatubum-1', 'mico-9']);
    expect(after.out).toEqual(['mico-0', 'tatubum-0']);
    expect(after.log.map((e) => e.ev.t).slice(-2)).toEqual(['conjured', 'left']);
    expect(after.current).toBe('p1');
    expect(everyCard(after)).toEqual(everyCard(s));
  });

  it('ficar com a carta conta como comprar: o Mau-olhado passa', () => {
    // p0 ficou cego enquanto escolhia (montado à mão: a escolha não depende de ver a mão).
    const blind = (): KittensState => ({ ...conjuring(), blind: ['p0'] });
    expect(kittensViewFor(blind(), 'p0').choice).toMatchObject({ kind: 'feitico', card: 'quati-9' });
    const s = act(blind(), 'p0', { type: 'choose', keep: true }, at(6000));
    expect(s.blind).toEqual([]);
    expect(s.log.map((e) => e.ev.t).slice(-3)).toEqual(['conjured', 'cured', 'draw']);
    expect(kittensViewFor(s, 'p0').hand).toEqual(['mico-0', 'quati-9']);
    // Mandar pro topo não é comprar: continua cego.
    expect(act(blind(), 'p0', { type: 'choose', keep: false }, at(6000)).blind).toEqual(['p0']);
  });
});
