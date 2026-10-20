import { describe, expect, it } from 'vitest';
import { initialKittensState } from '../src/games/kittens/rules';
import { settleKittens } from '../src/games/kittens/settle';
import { kittens, kittensNextDeadline, kittensViewFor } from '../src/games/kittens/view';
import { T0, act, ctxOf, ids, table } from './kittens-helpers';

const s = {
  ...table({
    hands: { p0: ['mico-0', 'nemvem-0'], p1: ['quati-0'], p2: [] },
    draw: ['pular-0', 'tatubum-0', 'espiar-0'],
    discard: ['ataque-0'],
  }),
  peek: { who: 'p0', cards: ['espiar-0', 'tatubum-0', 'pular-0'] },
};

describe('visão do Tatubum', () => {
  it('mão só a sua; dos outros, a quantidade; monte só em números', () => {
    const v = kittensViewFor(s, 'p1');
    expect(v.hand).toEqual(['quati-0']);
    expect(v.handCounts).toEqual({ p0: 2, p1: 1, p2: 0 });
    expect(v).toMatchObject({ drawCount: 3, tatusInDraw: 1, discard: ['ataque-0'], current: 'p0', owed: 1 });
    expect(JSON.stringify(v)).not.toContain('mico-0');
    expect(JSON.stringify(v)).not.toContain('espiar-0');
  });

  it('o Espiar só aparece pra quem espiou', () => {
    expect(kittensViewFor(s, 'p0')).toMatchObject({ peek: ['espiar-0', 'tatubum-0', 'pular-0'], peekBy: 'p0' });
    expect(kittensViewFor(s, 'p1')).toMatchObject({ peek: null, peekBy: 'p0' });
  });

  it('espectador não tem mão', () => {
    expect(kittensViewFor(s, null).hand).toEqual([]);
    expect(kittensViewFor(s, 'p9').hand).toEqual([]);
  });

  it('o diário esconde a carta de quem não pode ver', () => {
    const drawn = act(table({ hands: { p0: [], p1: [], p2: [] }, draw: ['mico-0'] }), 'p0', { type: 'draw' }, ctxOf(ids(3)));
    expect(kittensViewFor(drawn, 'p0').log.at(-1)).toEqual({ n: 0, ev: { t: 'draw', by: 'p0', card: 'mico-0' } });
    expect(kittensViewFor(drawn, 'p1').log.at(-1)).toEqual({ n: 0, ev: { t: 'draw', by: 'p0', card: null } });
  });

  it('Favor e par: a carta só aparece pros dois; espectador não vê', () => {
    const later = ctxOf(ids(3), { now: T0 + 5000 });
    const favorAir = act(
      table({ hands: { p0: ['favor-0'], p1: ['mico-0'], p2: [] }, draw: ['pular-0', 'quati-0'] }),
      'p0',
      { type: 'play', cards: ['favor-0'], target: 'p1' },
      ctxOf(ids(3)),
    );
    const gave = act(settleKittens(favorAir, later), 'p1', { type: 'choose', card: 'mico-0' }, later);
    const gaveEv = (card: string | null) => ({ t: 'gave', from: 'p1', to: 'p0', card });
    expect(kittensViewFor(gave, 'p0').log.at(-1)!.ev).toEqual(gaveEv('mico-0'));
    expect(kittensViewFor(gave, 'p1').log.at(-1)!.ev).toEqual(gaveEv('mico-0'));
    expect(kittensViewFor(gave, 'p2').log.at(-1)!.ev).toEqual(gaveEv(null));
    expect(kittensViewFor(gave, null).log.at(-1)!.ev).toEqual(gaveEv(null));

    const rodaAir = act(
      table({ hands: { p0: ['capivara-0', 'capivara-1'], p1: ['mico-0'], p2: [] }, draw: ['pular-0', 'quati-0'] }),
      'p0',
      { type: 'play', cards: ['capivara-0', 'capivara-1'] },
      ctxOf(ids(3)),
    );
    const passed = settleKittens(rodaAir, later);
    const last = (viewer: string | null) => kittensViewFor(passed, viewer).log.at(-1)!.ev;
    expect(last('p1')).toMatchObject({ t: 'passed', from: 'p1', to: 'p2', card: 'mico-0' });
    expect(last('p2')).toMatchObject({ t: 'passed', card: 'mico-0' });
    expect(last('p0')).toMatchObject({ t: 'passed', card: null });
    expect(last(null)).toMatchObject({ t: 'passed', card: null });

    expect(JSON.stringify(kittensViewFor(s, 'p1'))).not.toContain('tatubum-0');
  });

  it('o tatu sendo escondido não tem id na visão (senão daria pra saber onde ele foi parar)', () => {
    const hiding = {
      ...table({ hands: { p0: [], p1: ['mico-0'], p2: [] }, draw: ['quati-0', 'tatubum-1'] }),
      choice: { kind: 'cafune' as const, who: 'p0', tatu: 'tatubum-0', deadline: T0 + 30_000 },
    };
    for (const viewer of ['p0', 'p1', 'p2', 'p9', null]) {
      const v = kittensViewFor(hiding, viewer);
      expect(v.choice).toEqual({ kind: 'cafune', who: 'p0', deadline: T0 + 30_000 });
      expect(JSON.stringify(v)).not.toContain('tatubum-0');
    }
  });

  it('a escolha do Desarme (tatu comprado) também não leva o id do tatu', () => {
    const holding = {
      ...table({ hands: { p0: ['cafune-0'], p1: ['mico-0'], p2: [] }, draw: ['quati-0', 'tatubum-1'] }),
      choice: { kind: 'tatu' as const, who: 'p0', tatu: 'tatubum-0', deadline: T0 + 30_000 },
    };
    for (const viewer of ['p0', 'p1', 'p2', 'p9', null]) {
      const v = kittensViewFor(holding, viewer);
      expect(v.choice).toEqual({ kind: 'tatu', who: 'p0', deadline: T0 + 30_000 });
      expect(JSON.stringify(v)).not.toContain('tatubum-0');
    }
  });

  it('as outras escolhas aparecem como estão', () => {
    const choice = { kind: 'cinco' as const, who: 'p0', options: ['ataque-0'], left: 1, deadline: T0 + 30_000 };
    expect(kittensViewFor({ ...s, choice }, 'p1').choice).toEqual(choice);
    const mico = { kind: 'mico' as const, by: 'p0', waiting: ['p1', 'p2'], deadline: T0 + 30_000 };
    expect(kittensViewFor({ ...s, choice: mico }, 'p1').choice).toEqual(mico);
  });
});

describe('prazo do Tatubum', () => {
  it('só com carta no ar ou escolha aberta', () => {
    expect(kittensNextDeadline(initialKittensState())).toBeNull();
    expect(kittensNextDeadline(s)).toBeNull();
    const air = act(table({ hands: { p0: ['ataque-0'], p1: [], p2: [] } }), 'p0', { type: 'play', cards: ['ataque-0'] }, ctxOf(ids(3)));
    expect(kittensNextDeadline(air)).toBe(T0 + 5000);
    const choosing = { ...s, choice: { kind: 'cafune' as const, who: 'p0', tatu: 'tatubum-9', deadline: T0 + 30_000 } };
    expect(kittensNextDeadline(choosing)).toBe(T0 + 30_000);
    expect(kittensNextDeadline({ ...air, phase: 'gameover' })).toBeNull();
  });

  it('módulo kittens', () => {
    expect(kittens.id).toBe('kittens');
    expect(kittens.initialState()).toEqual(initialKittensState());
  });
});
