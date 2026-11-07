import { describe, expect, it } from 'vitest';
import { KITTENS_BICHOS, KITTENS_CLASSIC_BICHOS, kittensKindOf, kittensSapoPair } from '../src/games/kittens/cards';
import { kittensWithNewFields } from '../src/games/kittens/compat';
import { KITTENS_BICHOS_PER_MATCH, KITTENS_PACK_SIZE, kittensDeal, kittensDrawBichos, kittensPackCards } from '../src/games/kittens/deck';
import { kittensActionSchema } from '../src/games/kittens/schema';
import { settleKittens } from '../src/games/kittens/settle';
import { KITTENS_CHOICE_MS, KITTENS_NOPE_MS, type KittensAction, type KittensState } from '../src/games/kittens/types';
import { kittensViewFor } from '../src/games/kittens/view';
import { mulberry32 } from '../src/rng';
import { T0, act, ctxOf, ids, refuse, started, table } from './kittens-helpers';

const ctx = ctxOf(ids(3));
const at = (ms: number) => ctxOf(ids(3), { now: T0 + ms });
const countOf = (cards: readonly string[], kind: string) => cards.filter((c) => kittensKindOf(c) === kind).length;

describe('sorteio dos bichos (pedido do Rafa, 2026-11-06)', () => {
  it('a pool tem 9 bichos e cada partida usa 6, sem repetir, na ordem da pool', () => {
    expect(KITTENS_BICHOS).toHaveLength(9);
    expect(KITTENS_BICHOS_PER_MATCH).toBe(6);
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const bichos = kittensDrawBichos(mulberry32(seed));
      expect(bichos).toHaveLength(6);
      expect(new Set(bichos).size).toBe(6);
      expect(bichos).toEqual(KITTENS_BICHOS.filter((b) => bichos.includes(b)));
      bichos.forEach((b) => seen.add(b));
    }
    expect([...seen].sort()).toEqual([...KITTENS_BICHOS].sort());
  });

  it('cada pacote continua com 58 cartas, só com os bichos da partida, e o Boto entra sempre', () => {
    const bichos = kittensDrawBichos(mulberry32(3));
    const packs = kittensPackCards(4, bichos);
    expect(packs).toHaveLength(2 * KITTENS_PACK_SIZE);
    expect(countOf(packs, 'boto')).toBe(8);
    for (const b of KITTENS_BICHOS) expect(countOf(packs, b)).toBe(bichos.includes(b) ? 8 : 0);
  });

  it('a distribuição usa os bichos pedidos, e o Latidor entra sempre', () => {
    const bichos = kittensDrawBichos(mulberry32(5));
    const { hands, draw } = kittensDeal(mulberry32(5), ids(4), bichos);
    const all = [...Object.values(hands).flat(), ...draw];
    for (const b of KITTENS_BICHOS) {
      if (bichos.includes(b)) expect(countOf(all, b)).toBeGreaterThanOrEqual(4);
      else expect(countOf(all, b)).toBe(0);
    }
    expect(countOf(all, 'latido')).toBe(3);
  });

  it('começar sorteia os bichos, a visão mostra e "jogar de novo" sorteia outra vez', () => {
    const { state } = started(3, 7);
    expect(state.bichos).toHaveLength(6);
    expect(kittensViewFor(state, 'p1').bichos).toEqual(state.bichos);
    const seen = new Set<string>();
    let room: KittensState = state;
    for (let seed = 1; seed <= 12; seed++) {
      const over: KittensState = { ...room, phase: 'gameover', winner: 'p0', current: null, pending: null, choice: null, peeks: {}, blind: [], skips: {} };
      room = act(over, 'p0', { type: 'again' }, ctxOf(ids(3), { seed }));
      seen.add(room.bichos.join());
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('partida salva sem `bichos` vale pelos 6 de sempre', () => {
    const { bichos: _gone, ...old } = table({ hands: { p0: [], p1: [] } });
    void _gone;
    expect(kittensWithNewFields(old as KittensState).bichos).toEqual(KITTENS_CLASSIC_BICHOS);
  });

  it('só valem os bichos da partida: Preguiça e dois Botos não pedem bicho que ficou de fora', () => {
    const bichos = ['capivara', 'mico', 'quati', 'tamandua', 'preguica', 'tucano'] as const;
    const s = table({ hands: { p0: ['preguica-0', 'preguica-1', 'boto-0', 'boto-1'], p1: [] }, draw: ['pular-9'], bichos: [...bichos] });
    const two = ctxOf(ids(2));
    expect(refuse(s, 'p0', { type: 'play', cards: ['preguica-0', 'preguica-1'], ask: 'onca' }, two)).toBe('bad_ask');
    expect(act(s, 'p0', { type: 'play', cards: ['preguica-0', 'preguica-1'], ask: 'mico' }, two).pending).not.toBeNull();
    expect(refuse(s, 'p0', { type: 'play', cards: ['boto-0', 'boto-1'], as: 'peixe' }, two)).toBe('bad_as');
    expect(act(s, 'p0', { type: 'play', cards: ['boto-0', 'boto-1'], as: 'quati' }, two).pending).not.toBeNull();
  });
});

describe('par de Peixe-beta', () => {
  // Topo = fim: a de cima é mico-9, a segunda é pular-9, a terceira é quati-9.
  const DRAW = ['cafune-9', 'quati-9', 'pular-9', 'mico-9'];
  const PAIR: KittensAction = { type: 'play', cards: ['peixe-0', 'peixe-1'] };
  const open = (draw = DRAW, hands?: Record<string, string[]>) => {
    const s = table({ hands: hands ?? { p0: ['peixe-0', 'peixe-1', 'favor-0'], p1: ['ataque-1'], p2: [] }, draw });
    return settleKittens(act(s, 'p0', PAIR, ctx), at(5000));
  };

  it('só quem jogou vê as 3 de cima, que ficam na espiada dele', () => {
    const s = open();
    expect(s.choice).toEqual({ kind: 'peixe', who: 'p0', deadline: T0 + 5000 + KITTENS_CHOICE_MS });
    expect(s.peeks.p0).toEqual(['mico-9', 'pular-9', 'quati-9']);
    expect(kittensViewFor(s, 'p0').choice).toMatchObject({ kind: 'peixe', cards: ['mico-9', 'pular-9', 'quati-9'] });
    expect(kittensViewFor(s, 'p1').choice).toMatchObject({ kind: 'peixe', cards: null });
    expect(refuse(s, 'p1', { type: 'choose', fate: 'keep' }, at(5000))).toBe('not_your_choice');
    expect(refuse(s, 'p0', { type: 'choose' }, at(5000))).toBe('bad_choice');
  });

  it('ficar com a segunda não é comprar: a vez continua e nenhum turno é gasto', () => {
    const s = act(open(), 'p0', { type: 'choose', fate: 'keep' }, at(6000));
    expect(s.hands.p0).toContain('pular-9');
    expect(s.draw).toEqual(['cafune-9', 'quati-9', 'mico-9']);
    expect(s.peeks.p0).toEqual(['mico-9', 'quati-9']);
    expect(s).toMatchObject({ current: 'p0', owed: 1, choice: null });
    expect(s.log.slice(-2).map((e) => e.ev)).toEqual([
      { t: 'fished', by: 'p0', fate: 'keep' },
      { t: 'draw', by: 'p0', card: 'pular-9' },
    ]);
    expect(kittensViewFor(s, 'p1').log.at(-1)!.ev).toEqual({ t: 'draw', by: 'p0', card: null });
  });

  it('cego continua cego ao ficar com a segunda', () => {
    const s = act({ ...open(), blind: ['p0'] }, 'p0', { type: 'choose', fate: 'keep' }, at(6000));
    expect(s.blind).toEqual(['p0']);
    expect(s.log.some((e) => e.ev.t === 'cured')).toBe(false);
  });

  it('deixar: nada muda no monte; mandar pro fundo: sai das espiadas e o resto continua sendo o topo', () => {
    const stay = act(open(), 'p0', { type: 'choose', fate: 'stay' }, at(6000));
    expect(stay.draw).toEqual(DRAW);
    expect(stay.peeks.p0).toEqual(['mico-9', 'pular-9', 'quati-9']);
    expect(stay.log.at(-1)!.ev).toEqual({ t: 'fished', by: 'p0', fate: 'stay' });
    const bottom = act(open(), 'p0', { type: 'choose', fate: 'bottom' }, at(6000));
    expect(bottom.draw).toEqual(['pular-9', 'cafune-9', 'quati-9', 'mico-9']);
    expect(bottom.peeks.p0).toEqual(['mico-9', 'quati-9']);
    expect(bottom.current).toBe('p0');
  });

  it('a segunda é Tatubum: ficar com ele é Desarme ou explode; o Desarme gasta o turno como sempre', () => {
    const tatuDraw = ['cafune-9', 'quati-9', 'tatubum-0', 'mico-9'];
    const boom = act(open(tatuDraw), 'p0', { type: 'choose', fate: 'keep' }, at(6000));
    expect(boom.alive).toEqual(['p1', 'p2']);
    const hands = { p0: ['peixe-0', 'peixe-1', 'cafune-0'], p1: ['ataque-1'], p2: [] };
    const tatu = act(open(tatuDraw, hands), 'p0', { type: 'choose', fate: 'keep' }, at(6000));
    expect(tatu.choice).toMatchObject({ kind: 'tatu', who: 'p0', tatu: 'tatubum-0' });
    const safe = act(tatu, 'p0', { type: 'choose', card: 'cafune-0' }, at(7000));
    const hidden = act(safe, 'p0', { type: 'choose', position: 0 }, at(8000));
    expect(hidden.current).toBe('p1');
  });

  it('sem resposta em 30 s, a carta fica onde está', () => {
    const s = settleKittens(open(), at(5000 + KITTENS_CHOICE_MS));
    expect(s.choice).toBeNull();
    expect(s.draw).toEqual(DRAW);
    expect(s.log.at(-1)!.ev).toEqual({ t: 'fished', by: 'p0', fate: 'stay' });
  });

  it('monte com menos de 2 cartas: só atualiza a espiada', () => {
    const s = open(['mico-9']);
    expect(s.choice).toBeNull();
    expect(s.peeks.p0).toEqual(['mico-9']);
    expect(s.current).toBe('p0');
  });

  it('a espiada de outro perde a segunda carta quando ela sai', () => {
    const before = open();
    const s = act({ ...before, peeks: { ...before.peeks, p1: ['mico-9', 'pular-9'] } }, 'p0', { type: 'choose', fate: 'keep' }, at(6000));
    expect(s.peeks.p1).toEqual(['mico-9']);
  });

  it('o schema aceita o destino', () => {
    expect(kittensActionSchema.safeParse({ type: 'choose', fate: 'bottom' }).success).toBe(true);
    expect(kittensActionSchema.safeParse({ type: 'choose', fate: 'outro' }).success).toBe(false);
  });
});

describe('par de Onça-pintada', () => {
  const DRAW = ['cafune-9', 'quati-9', 'mico-9'];
  const PAIR: KittensAction = { type: 'play', cards: ['onca-0', 'onca-1'] };
  const open = (discard: string[] = ['pular-5', 'cafune-5', 'ataque-5']) => {
    const s = table({ hands: { p0: ['onca-0', 'onca-1', 'favor-0'], p1: ['ataque-1'], p2: [] }, draw: DRAW, discard });
    return settleKittens(act(s, 'p0', PAIR, ctx), at(5000));
  };

  it('vê o topo e o fundo, só ele; pega do descarte de antes da jogada, menos Desarme', () => {
    const s = open();
    expect(s.choice).toEqual({ kind: 'cinco', who: 'p0', options: ['pular-5', 'ataque-5'], left: 1, deadline: T0 + 5000 + KITTENS_CHOICE_MS, from: 'onca' });
    expect(s.peeks.p0).toEqual(['mico-9']);
    expect(kittensViewFor(s, 'p0').choice).toMatchObject({ seen: { top: 'mico-9', bottom: 'cafune-9' } });
    expect(kittensViewFor(s, 'p1').choice).not.toHaveProperty('seen');
    expect(JSON.stringify(kittensViewFor(s, 'p1'))).not.toContain('cafune-9');
    expect(refuse(s, 'p0', { type: 'choose', card: 'cafune-5' }, at(6000))).toBe('bad_choice');
    expect(refuse(s, 'p0', { type: 'choose', card: 'onca-0' }, at(6000))).toBe('bad_choice');
    const got = act(s, 'p0', { type: 'choose', card: 'pular-5' }, at(6000));
    expect(got.hands.p0).toContain('pular-5');
    expect(got.discard).not.toContain('pular-5');
    expect(got).toMatchObject({ choice: null, current: 'p0' });
    expect(got.log.at(-1)).toMatchObject({ ev: { t: 'picked', by: 'p0', card: 'pular-5' }, seenBy: null });
  });

  it('sem resposta, a carta é sorteada entre as opções', () => {
    const s = settleKittens(open(), at(5000 + KITTENS_CHOICE_MS));
    expect(s.choice).toBeNull();
    expect(s.hands.p0!.some((c) => c === 'pular-5' || c === 'ataque-5')).toBe(true);
  });

  it('sem opção no descarte: ele só vê as cartas e fecha', () => {
    for (const discard of [[], ['cafune-5']]) {
      const s = open(discard);
      expect(s.choice).toMatchObject({ kind: 'cinco', from: 'onca', options: [] });
      expect(act(s, 'p0', { type: 'choose' }, at(6000)).choice).toBeNull();
      expect(settleKittens(s, at(5000 + KITTENS_CHOICE_MS)).choice).toBeNull();
    }
  });

  it('com espiada, o topo já é a primeira: a espiada fica como estava', () => {
    const s = table({ hands: { p0: ['onca-0', 'onca-1'], p1: [], p2: [] }, draw: DRAW });
    const air = act({ ...s, peeks: { p0: ['mico-9', 'quati-9'] } }, 'p0', PAIR, ctx);
    expect(settleKittens(air, at(5000)).peeks.p0).toEqual(['mico-9', 'quati-9']);
  });
});

describe('par de Sapo', () => {
  const DRAW = ['cafune-9', 'pular-9', 'mico-9'];
  const SAPOS = ['sapo-0', 'sapo-1'];
  const mesa = (opts: { p0?: string[]; p1?: string[]; p2?: string[]; blind?: string[] } = {}) =>
    table({
      hands: { p0: opts.p0 ?? ['favor-0', 'olhado-0', 'tucano-0', 'tucano-1', 'latido-0', 'latido-1', 'quati-0'], p1: opts.p1 ?? [...SAPOS, 'quati-1'], p2: opts.p2 ?? ['nemvem-2'] },
      draw: DRAW,
      blind: opts.blind,
    });
  const reflect = (cards = SAPOS): KittensAction => ({ type: 'sapo', cards });

  it('na própria vez o par é recusado, com Boto ou 2 Botos também', () => {
    const s = table({ hands: { p0: ['sapo-0', 'sapo-1', 'boto-0', 'boto-1'], p1: [] }, draw: DRAW });
    const two = ctxOf(ids(2));
    expect(refuse(s, 'p0', { type: 'play', cards: ['sapo-0', 'sapo-1'] }, two)).toBe('sapo_only');
    expect(refuse(s, 'p0', { type: 'play', cards: ['sapo-0', 'boto-0'] }, two)).toBe('sapo_only');
    expect(refuse(s, 'p0', { type: 'play', cards: ['boto-0', 'boto-1'], as: 'sapo' }, two)).toBe('sapo_only');
  });

  it('continua contando como bicho no trio e nos 4 bichos diferentes, e a Preguiça pode pedir', () => {
    const s = table({ hands: { p0: ['sapo-0', 'sapo-1', 'sapo-2', 'mico-0', 'quati-0', 'capivara-0', 'preguica-0', 'preguica-1'], p1: ['cafune-1'] }, draw: DRAW });
    const two = ctxOf(ids(2));
    expect(act(s, 'p0', { type: 'play', cards: ['sapo-0', 'sapo-1', 'sapo-2'] }, two).pending!.play.kind).toBe('trio');
    expect(act(s, 'p0', { type: 'play', cards: ['sapo-0', 'mico-0', 'quati-0', 'capivara-0'] }, two).pending!.play.kind).toBe('cinco');
    expect(act(s, 'p0', { type: 'play', cards: ['preguica-0', 'preguica-1'], ask: 'sapo' }, two).pending!.play.ask).toBe('sapo');
  });

  it('kittensSapoPair: Sapos primeiro, depois Botos; sem o Sapo na partida, nada', () => {
    expect(kittensSapoPair(['boto-0', 'sapo-0', 'sapo-1'], KITTENS_BICHOS)).toEqual(['sapo-0', 'sapo-1']);
    expect(kittensSapoPair(['boto-0', 'sapo-0', 'mico-1'], KITTENS_BICHOS)).toEqual(['sapo-0', 'boto-0']);
    expect(kittensSapoPair(['boto-0', 'boto-1'], KITTENS_BICHOS)).toEqual(['boto-0', 'boto-1']);
    expect(kittensSapoPair(['sapo-0', 'mico-1'], KITTENS_BICHOS)).toBeNull();
    expect(kittensSapoPair(['boto-0', 'boto-1'], KITTENS_CLASSIC_BICHOS)).toBeNull();
  });

  it('só o alvo reflete, com um par que vale e na mão', () => {
    const air = act(mesa(), 'p0', { type: 'play', cards: ['favor-0'], target: 'p1' }, ctx);
    expect(refuse(air, 'p2', reflect(), at(100))).toBe('sapo_only');
    expect(refuse(air, 'p0', reflect(), at(100))).toBe('sapo_only');
    expect(refuse(air, 'p1', reflect(['sapo-0']), at(100))).toBe('bad_combo');
    expect(refuse(air, 'p1', reflect(['sapo-0', 'sapo-0']), at(100))).toBe('bad_combo');
    expect(refuse(air, 'p1', reflect(['sapo-0', 'quati-1']), at(100))).toBe('bad_combo');
    expect(refuse(air, 'p1', reflect(['sapo-0', 'sapo-9']), at(100))).toBe('not_in_hand');
    expect(refuse(air, 'p1', { type: 'sapo', cards: SAPOS, on: 'ataque-0' }, at(100))).toBe('nope_stale');
    expect(refuse(mesa(), 'p1', reflect(), at(100))).toBe('sapo_only');
  });

  it('refletir: o par vai pro descarte, os dois trocam de lugar e a janela recomeça', () => {
    const air = act(mesa(), 'p0', { type: 'play', cards: ['favor-0'], target: 'p1' }, ctx);
    const s = act(air, 'p1', reflect(), at(4000));
    expect(s.pending).toMatchObject({ by: 'p0', caster: 'p1', play: { target: 'p0' }, nopes: [], resolvesAt: T0 + 4000 + KITTENS_NOPE_MS });
    expect(s.discard).toEqual(SAPOS);
    expect(s.hands.p1).toEqual(['quati-1']);
    expect(s.log.at(-1)!.ev).toEqual({ t: 'reflected', by: 'p1', target: 'p0' });
    expect(s.current).toBe('p0');
  });

  it('Sapo + Boto e 2 Botos também valem', () => {
    const air = (p1: string[]) => act(mesa({ p1 }), 'p0', { type: 'play', cards: ['favor-0'], target: 'p1' }, ctx);
    expect(act(air(['sapo-0', 'boto-1']), 'p1', reflect(['sapo-0', 'boto-1']), at(100)).pending!.caster).toBe('p1');
    expect(act(air(['boto-0', 'boto-1']), 'p1', reflect(['boto-0', 'boto-1']), at(100)).pending!.caster).toBe('p1');
  });

  it('Favor refletido: quem mandou dá a carta pra quem refletiu', () => {
    const air = act(mesa(), 'p0', { type: 'play', cards: ['favor-0'], target: 'p1' }, ctx);
    const s = settleKittens(act(air, 'p1', reflect(), at(1000)), at(6000));
    expect(s.choice).toMatchObject({ kind: 'favor', who: 'p0', to: 'p1', left: 1 });
    const given = act(s, 'p0', { type: 'choose', card: 'quati-0' }, at(7000));
    expect(given.hands.p1).toContain('quati-0');
    expect(given.current).toBe('p0');
  });

  it('Favor refletido em quem está sem carta: a jogada não vale', () => {
    const air = act(mesa({ p0: ['favor-0'] }), 'p0', { type: 'play', cards: ['favor-0'], target: 'p1' }, ctx);
    const s = settleKittens(act(air, 'p1', reflect(), at(1000)), at(6000));
    expect(s.choice).toBeNull();
    expect(s.log.at(-1)!.ev).toEqual({ t: 'resolved', by: 'p0', play: 'favor', canceled: true });
  });

  it('Mau-olhado refletido: quem mandou fica cego', () => {
    const air = act(mesa(), 'p0', { type: 'play', cards: ['olhado-0'], target: 'p1' }, ctx);
    const s = settleKittens(act(air, 'p1', reflect(), at(1000)), at(6000));
    expect(s.blind).toEqual(['p0']);
    expect(s.log.at(-1)!.ev).toEqual({ t: 'cursed', by: 'p1', target: 'p0' });
    expect(s.current).toBe('p0');
  });

  it('par de Latidores refletido: quem mandou joga um Desarme ou explode', () => {
    const air = act(mesa(), 'p0', { type: 'play', cards: ['latido-0', 'latido-1'], target: 'p1' }, ctx);
    const boom = settleKittens(act(air, 'p1', reflect(), at(1000)), at(6000));
    expect(boom.alive).toEqual(['p1', 'p2']);
    const armed = act(mesa({ p0: ['latido-0', 'latido-1', 'cafune-0'] }), 'p0', { type: 'play', cards: ['latido-0', 'latido-1'], target: 'p1' }, ctx);
    const defend = settleKittens(act(armed, 'p1', reflect(), at(1000)), at(6000));
    expect(defend.choice).toMatchObject({ kind: 'latido', who: 'p0', by: 'p1', pair: true });
    expect(act(defend, 'p0', { type: 'choose', card: 'cafune-0' }, at(7000))).toMatchObject({ choice: null, current: 'p0' });
  });

  it('par de Tucano refletido: a vez de quem jogou acaba e a próxima vez dele é pulada; o alvo original não perde nada', () => {
    const air = act(mesa(), 'p0', { type: 'play', cards: ['tucano-0', 'tucano-1'], target: 'p1' }, ctx);
    const s = settleKittens(act(air, 'p1', reflect(), at(1000)), at(6000));
    expect(s).toMatchObject({ current: 'p1', owed: 1, skips: { p0: 1 } });
    expect(s.log.at(-1)!.ev).toEqual({ t: 'tucano', by: 'p1', target: 'p0' });
    const passed = act(act(s, 'p1', { type: 'draw' }, at(7000)), 'p2', { type: 'draw' }, at(8000));
    expect(passed).toMatchObject({ current: 'p1', skips: {} });
  });

  it('o novo alvo pode refletir de volta: o efeito normal volta a valer', () => {
    const air = act(mesa({ p0: ['tucano-0', 'tucano-1', 'boto-0', 'boto-1'] }), 'p0', { type: 'play', cards: ['tucano-0', 'tucano-1'], target: 'p1' }, ctx);
    const once = act(air, 'p1', reflect(), at(1000));
    const twice = act(once, 'p0', reflect(['boto-0', 'boto-1']), at(2000));
    expect(twice.pending).toMatchObject({ by: 'p0', caster: 'p0', play: { target: 'p1' }, resolvesAt: T0 + 2000 + KITTENS_NOPE_MS });
    expect(settleKittens(twice, at(7000))).toMatchObject({ current: 'p2', skips: {} });
    expect(settleKittens(twice, at(7000)).log.some((e) => e.ev.t === 'skipped' && e.ev.who === 'p1')).toBe(true);
  });

  it('o Nem vem! que já estava na jogada vai pro descarte e a contagem zera; o de depois decide', () => {
    const air = act(mesa(), 'p0', { type: 'play', cards: ['favor-0'], target: 'p1' }, ctx);
    const noped = act(air, 'p2', { type: 'nope' }, at(1000));
    const s = act(noped, 'p1', reflect(), at(1500));
    expect(s.pending!.nopes).toEqual([]);
    expect(s.discard).toEqual(['nemvem-2', ...SAPOS]);
    expect(settleKittens(s, at(6500)).choice).toMatchObject({ kind: 'favor', who: 'p0', to: 'p1' });
    const late = table({ hands: { p0: ['favor-0', 'quati-0'], p1: SAPOS, p2: ['nemvem-2'] }, draw: DRAW });
    const after = act(act(act(late, 'p0', { type: 'play', cards: ['favor-0'], target: 'p1' }, ctx), 'p1', reflect(), at(1000)), 'p2', { type: 'nope' }, at(2000));
    const done = settleKittens(after, at(7000));
    expect(done.choice).toBeNull();
    expect(done.log.at(-1)!.ev).toEqual({ t: 'resolved', by: 'p0', play: 'favor', canceled: true });
  });

  it('não reflete o trio de Favor, nem jogada sem alvo, nem o Tucano do 1x1', () => {
    const trio = table({ hands: { p0: ['favor-0', 'favor-1', 'favor-2'], p1: SAPOS, p2: [] }, draw: DRAW });
    expect(refuse(act(trio, 'p0', { type: 'play', cards: ['favor-0', 'favor-1', 'favor-2'], target: 'p1' }, ctx), 'p1', reflect(), at(100))).toBe('sapo_only');
    const pular = table({ hands: { p0: ['pular-0'], p1: SAPOS, p2: [] }, draw: DRAW });
    expect(refuse(act(pular, 'p0', { type: 'play', cards: ['pular-0'] }, ctx), 'p1', reflect(), at(100))).toBe('sapo_only');
    const duel = table({ hands: { p0: ['tucano-0', 'tucano-1'], p1: SAPOS }, draw: DRAW });
    const two = ctxOf(ids(2));
    expect(refuse(act(duel, 'p0', { type: 'play', cards: ['tucano-0', 'tucano-1'], target: 'p1' }, two), 'p1', reflect(), two)).toBe('sapo_only');
  });

  it('cego não usa o Sapo, nem por ficha', () => {
    const air = act(mesa({ blind: ['p1'] }), 'p0', { type: 'play', cards: ['favor-0'], target: 'p1' }, ctx);
    expect(refuse(air, 'p1', reflect(), at(100))).toBe('sapo_blind');
    expect(refuse(air, 'p1', reflect(['?0', '?1']), at(100))).toBe('sapo_blind');
  });

  it('quem refletiu sai antes de resolver: a jogada não vale', () => {
    const air = act(mesa(), 'p0', { type: 'play', cards: ['favor-0'], target: 'p1' }, ctx);
    const gone = settleKittens(act(air, 'p1', reflect(), at(1000)), ctxOf(['p0', 'p2'], { now: T0 + 6000 }));
    expect(gone.choice).toBeNull();
    expect(gone.log.some((e) => e.ev.t === 'resolved' && e.ev.canceled)).toBe(true);
  });

  it('o schema aceita a ação', () => {
    expect(kittensActionSchema.safeParse({ type: 'sapo', cards: SAPOS, on: 'favor-0' }).success).toBe(true);
    expect(kittensActionSchema.safeParse({ type: 'sapo' }).success).toBe(false);
  });
});
