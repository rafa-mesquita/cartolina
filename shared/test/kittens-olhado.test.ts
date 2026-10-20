import { describe, expect, it } from 'vitest';
import { settleKittens } from '../src/games/kittens/settle';
import { KITTENS_CHOICE_MS, type KittensState } from '../src/games/kittens/types';
import { kittensViewFor } from '../src/games/kittens/view';
import { T0, act, ctxOf, everyCard, ids, refuse, table, tokenOf } from './kittens-helpers';

const ctx = ctxOf(ids(3));
const at = (ms: number) => ctxOf(ids(3), { now: T0 + ms });
const DRAW = ['mico-9', 'tatubum-0', 'pular-9', 'tatubum-1', 'quati-9'];
const P1 = ['ataque-1', 'favor-1', 'nemvem-1', 'mico-1', 'mico-2', 'cafune-1', 'espiar-1'];

/** p0 joga o Mau-olhado em p1 e a janela passa: p1 está cego. */
function cursed(p1: string[] = P1, seed = 1): KittensState {
  const s = table({ hands: { p0: ['olhado-0', 'favor-0', 'nemvem-0'], p1, p2: ['quati-2'] }, draw: DRAW });
  return settleKittens(act(s, 'p0', { type: 'play', cards: ['olhado-0'], target: 'p1' }, ctx), ctxOf(ids(3), { now: T0 + 5000, seed }));
}

/** A vez é do cego (p1). */
const p1Turn = (s: KittensState): KittensState => ({ ...s, current: 'p1', owed: 1 });

describe('Mau-olhado: jogar', () => {
  it('pede um adversário vivo (pode estar sem carta)', () => {
    const s = table({ hands: { p0: ['olhado-0'], p1: ['mico-1'], p2: [] }, draw: DRAW });
    const play = (target?: string) => ({ type: 'play' as const, cards: ['olhado-0'], ...(target ? { target } : {}) });
    expect(refuse(s, 'p0', play(), ctx)).toBe('bad_target');
    expect(refuse(s, 'p0', play('p0'), ctx)).toBe('bad_target');
    expect(refuse(s, 'p0', play('p9'), ctx)).toBe('bad_target');
    expect(refuse({ ...s, alive: ['p0', 'p1'] }, 'p0', play('p2'), ctx)).toBe('bad_target');
    expect(act(s, 'p0', play('p2'), ctx).pending!.play).toEqual({ kind: 'olhado', cards: ['olhado-0'], target: 'p2', ask: null, as: null });
    const empty = settleKittens(act(s, 'p0', play('p2'), ctx), at(5000));
    expect(empty.blind).toEqual(['p2']);
  });

  it('o alvo fica cego: a mão é embaralhada no estado; todo mundo sabe quem está cego', () => {
    const s = cursed();
    expect(s.blind).toEqual(['p1']);
    expect([...s.hands.p1!].sort()).toEqual([...P1].sort());
    expect(s.log.at(-1)).toEqual({ n: 2, ev: { t: 'cursed', by: 'p0', target: 'p1' }, seenBy: null });
    for (const viewer of ['p0', 'p2', null]) expect(kittensViewFor(s, viewer).blind).toEqual(['p1']);
    expect(kittensViewFor(s, 'p2').handCounts.p1).toBe(7);
    // A mão é mesmo embaralhada (alguma semente muda a ordem).
    expect([1, 2, 3, 4].some((seed) => cursed(P1, seed).hands.p1!.join() !== P1.join())).toBe(true);
  });

  it('quem está cego vê fichas no lugar das cartas e nenhum id da própria mão aparece na visão dele', () => {
    const s = cursed();
    const v = kittensViewFor(s, 'p1');
    expect(v.hand).toEqual(['?0', '?1', '?2', '?3', '?4', '?5', '?6']);
    const json = JSON.stringify(v);
    for (const c of P1) expect(json).not.toContain(`"${c}"`);
  });

  it('Nem vem! cancela o olhado', () => {
    const s = table({ hands: { p0: ['olhado-0'], p1: ['nemvem-1'], p2: [] }, draw: DRAW });
    const air = act(s, 'p0', { type: 'play', cards: ['olhado-0'], target: 'p1' }, ctx);
    const done = settleKittens(act(air, 'p1', { type: 'nope' }, at(1000)), at(6000));
    expect(done.blind).toEqual([]);
    expect(done.discard).toEqual(['olhado-0', 'nemvem-1']);
  });

  it('o alvo já estava cego: continua cego (uma vez só na lista)', () => {
    const s = table({ hands: { p0: ['olhado-0', 'olhado-1'], p1: ['mico-1', 'mico-2'], p2: [] }, draw: DRAW, blind: ['p1'] });
    const done = settleKittens(act(s, 'p0', { type: 'play', cards: ['olhado-0'], target: 'p1' }, ctx), at(5000));
    expect(done.blind).toEqual(['p1']);
  });
});

describe('Mau-olhado: jogar às cegas', () => {
  it('joga por ficha: a ficha vira a carta de verdade; id de verdade ou ficha que não existe não vale', () => {
    const s = p1Turn(cursed());
    const t = tokenOf(s, 'p1', 'ataque-1');
    const air = act(s, 'p1', { type: 'play', cards: [t] }, at(6000));
    expect(air.pending!.play).toEqual({ kind: 'ataque', cards: ['ataque-1'], target: null, ask: null, as: null });
    expect(air.hands.p1).not.toContain('ataque-1');
    expect(refuse(s, 'p1', { type: 'play', cards: ['ataque-1'] }, at(6000))).toBe('blind_pick');
    expect(refuse(s, 'p1', { type: 'play', cards: ['?7'] }, at(6000))).toBe('not_in_hand');
    expect(refuse(s, 'p1', { type: 'play', cards: [t, t] }, at(6000))).toBe('bad_combo');
    // Uma carta que sozinha não faz nada: recusada como sempre.
    expect(refuse(s, 'p1', { type: 'play', cards: [tokenOf(s, 'p1', 'mico-1')] }, at(6000))).toBe('bad_combo');
    // Par por sorte.
    const pair = act(s, 'p1', { type: 'play', cards: [tokenOf(s, 'p1', 'mico-1'), tokenOf(s, 'p1', 'mico-2')] }, at(6000));
    expect(pair.pending!.play).toMatchObject({ kind: 'par', cards: ['mico-1', 'mico-2'], as: 'mico' });
  });

  it('quem não está cego não joga ficha', () => {
    const s = cursed();
    expect(refuse(s, 'p0', { type: 'play', cards: ['?0'] }, at(6000))).toBe('not_in_hand');
  });

  it('Nem vem! às cegas: tem que mandar uma ficha, e ela tem que ser um Nem vem!', () => {
    const s = cursed();
    const air = act(s, 'p0', { type: 'play', cards: ['favor-0'], target: 'p2' }, at(6000));
    expect(refuse(air, 'p1', { type: 'nope' }, at(6100))).toBe('blind_pick');
    expect(refuse(air, 'p1', { type: 'nope', card: 'nemvem-1' }, at(6100))).toBe('blind_pick');
    expect(refuse(air, 'p1', { type: 'nope', card: tokenOf(s, 'p1', 'mico-1') }, at(6100))).toBe('no_nope');
    const noped = act(air, 'p1', { type: 'nope', card: tokenOf(s, 'p1', 'nemvem-1') }, at(6100));
    expect(noped.pending!.nopes).toEqual([{ by: 'p1', card: 'nemvem-1' }]);
    // Quem vê escolhe qual Nem vem! usar (ou deixa o servidor escolher).
    expect(refuse(air, 'p0', { type: 'nope', card: 'favor-0' }, at(6100))).toBe('not_in_hand');
    expect(act(air, 'p0', { type: 'nope', card: 'nemvem-0' }, at(6100)).pending!.nopes).toEqual([{ by: 'p0', card: 'nemvem-0' }]);
  });

  it('Favor e par de Mico contra quem está cego: ele escolhe por ficha', () => {
    const s = cursed();
    const favor = settleKittens(act(s, 'p0', { type: 'play', cards: ['favor-0'], target: 'p1' }, at(6000)), at(11_000));
    expect(favor.choice).toMatchObject({ kind: 'favor', who: 'p1' });
    expect(refuse(favor, 'p1', { type: 'choose', card: 'mico-1' }, at(11_000))).toBe('blind_pick');
    const t = tokenOf(favor, 'p1', 'espiar-1');
    const gave = act(favor, 'p1', { type: 'choose', card: t }, at(11_000));
    expect(gave.hands.p0).toContain('espiar-1');
    expect(gave.hands.p1).not.toContain('espiar-1');
    const mico: KittensState = { ...s, choice: { kind: 'mico', by: 'p0', waiting: ['p1'], deadline: T0 + 40_000 } };
    const discarded = act(mico, 'p1', { type: 'choose', card: tokenOf(mico, 'p1', 'ataque-1') }, at(6000));
    expect(discarded.discard).toContain('ataque-1');
  });

  it('carta que chega enquanto está cego vai pro fim, desconhecida (nem o diário mostra pra ele)', () => {
    const s = cursed();
    const favor: KittensState = { ...s, hands: { ...s.hands, p2: ['quati-2'] }, choice: { kind: 'favor', who: 'p2', to: 'p1', deadline: T0 + 40_000 } };
    const got = act(favor, 'p2', { type: 'choose', card: 'quati-2' }, at(6000));
    expect(got.hands.p1!.at(-1)).toBe('quati-2');
    const v = kittensViewFor(got, 'p1');
    expect(v.hand).toHaveLength(8);
    expect(v.log.at(-1)!.ev).toEqual({ t: 'gave', from: 'p2', to: 'p1', card: null });
    expect(JSON.stringify(v)).not.toContain('quati-2');
    // Quem deu continua vendo.
    expect(kittensViewFor(got, 'p2').log.at(-1)!.ev).toEqual({ t: 'gave', from: 'p2', to: 'p1', card: 'quati-2' });
  });

  it('entradas antigas do diário com carta que está na mão de quem está cego somem pra ele', () => {
    const s = table({ hands: { p0: ['olhado-0'], p1: [], p2: [] }, draw: ['tatubum-0', 'tatubum-1', 'mico-9'], current: 'p1' });
    const drew = act(s, 'p1', { type: 'draw' }, ctx); // p1 comprou o mico-9 (só ele vê)
    expect(kittensViewFor(drew, 'p1').log.at(-1)!.ev).toEqual({ t: 'draw', by: 'p1', card: 'mico-9' });
    const p0turn = { ...drew, current: 'p0' };
    const blind = settleKittens(act(p0turn, 'p0', { type: 'play', cards: ['olhado-0'], target: 'p1' }, at(100)), at(5100));
    const v = kittensViewFor(blind, 'p1');
    expect(v.log.find((e) => e.ev.t === 'draw')!.ev).toEqual({ t: 'draw', by: 'p1', card: null });
    expect(JSON.stringify(v)).not.toContain('mico-9');
  });
});

describe('Mau-olhado: voltar a ver', () => {
  it('comprar cura: a carta comprada e a mão voltam a aparecer', () => {
    const s = p1Turn(cursed());
    const drew = act(s, 'p1', { type: 'draw' }, at(6000));
    expect(drew.blind).toEqual([]);
    expect(drew.log.slice(-2).map((e) => e.ev)).toEqual([
      { t: 'cured', by: 'p1' },
      { t: 'draw', by: 'p1', card: 'quati-9' },
    ]);
    const v = kittensViewFor(drew, 'p1');
    expect([...v.hand].sort()).toEqual([...P1, 'quati-9'].sort());
    expect(kittensViewFor(drew, 'p0').log.at(-1)!.ev).toEqual({ t: 'draw', by: 'p1', card: null });
  });

  it('comprar um Tatubum também cura (o Desarme é jogado vendo a mão)', () => {
    const s = { ...p1Turn(cursed()), draw: ['mico-9', 'tatubum-0'] };
    const drew = act(s, 'p1', { type: 'draw' }, at(6000));
    expect(drew.blind).toEqual([]);
    expect(drew.choice).toMatchObject({ kind: 'tatu', who: 'p1' });
    expect(act(drew, 'p1', { type: 'choose', card: 'cafune-1' }, at(6000)).choice).toMatchObject({ kind: 'cafune' });
  });

  it('par de Tamanduá (compra 2) cura', () => {
    const s = { ...p1Turn(cursed(['tamandua-1', 'tamandua-2', 'mico-1'])), draw: DRAW };
    const air = act(s, 'p1', { type: 'play', cards: [tokenOf(s, 'p1', 'tamandua-1'), tokenOf(s, 'p1', 'tamandua-2')] }, at(6000));
    const done = settleKittens(air, at(11_000));
    expect(done.blind).toEqual([]);
    expect(done.log.some((e) => e.ev.t === 'cured' && e.ev.by === 'p1')).toBe(true);
  });

  it('quem está cego e sai do jogo sai da lista', () => {
    const s = cursed();
    const after = settleKittens(s, ctxOf(['p0', 'p2'], { now: T0 + 6000 }));
    expect(after.blind).toEqual([]);
    expect(everyCard(after)).toEqual(everyCard(s));
  });

  it('no fim de jogo ninguém fica cego', () => {
    const s = cursed();
    const over = settleKittens(settleKittens(s, ctxOf(['p0', 'p1'], { now: T0 + 6000 })), ctxOf(['p1'], { now: T0 + 7000 }));
    expect(over).toMatchObject({ phase: 'gameover', winner: 'p1', blind: [] });
    expect(kittensViewFor(over, 'p1').hand).toEqual(over.hands.p1);
  });

  it('prazo da escolha do Favor vencido com quem está cego: dá uma carta ao acaso', () => {
    const s = cursed();
    const favor = settleKittens(act(s, 'p0', { type: 'play', cards: ['favor-0'], target: 'p1' }, at(6000)), at(11_000));
    const late = settleKittens(favor, at(11_000 + KITTENS_CHOICE_MS));
    expect(late.hands.p1).toHaveLength(6);
    expect(late.blind).toEqual(['p1']);
  });
});
