import { describe, expect, it } from 'vitest';
import { produce, setupGain } from '../src/games/mandacaru/production';
import { corner, res, table } from './mandacaru-helpers';

// FIXED_LAYOUT: terreno 5 = forest 6, terreno 16 = hills 6, terreno 10 = hills 8, terreno 18 = fields 8, 9 = rio seco.
describe('Mandacaru: produção', () => {
  it('casa rende 1, vila rende 2, dos terrenos com o número', () => {
    const s = table({ houses: { [corner(5, 0)]: 'p0' }, cities: { [corner(16, 0)]: 'p1' } });
    const { state, gains } = produce(s, 6);
    expect(gains).toEqual({ p0: res({ wood: 1 }), p1: res({ brick: 2 }) });
    expect(state.hands.p0!.res.wood).toBe(1);
    expect(state.bank.brick).toBe(s.bank.brick - 2);
  });

  it('o terreno com o Carcará não rende', () => {
    const s = table({ houses: { [corner(5, 0)]: 'p0' }, carcara: 5 });
    expect(produce(s, 6).gains).toEqual({});
  });

  it('banco curto com dois recebendo: ninguém recebe', () => {
    const base = table({ houses: { [corner(10, 0)]: 'p0', [corner(10, 3)]: 'p1' } });
    const s = { ...base, bank: { ...base.bank, brick: 1 } };
    const out = produce(s, 8);
    expect(out.gains).toEqual({});
    expect(out.short).toEqual(['brick']);
  });

  it('banco curto com um só recebendo: leva o que tiver', () => {
    const base = table({ cities: { [corner(10, 0)]: 'p0' } });
    const s = { ...base, bank: { ...base.bank, brick: 1 } };
    expect(produce(s, 8).gains).toEqual({ p0: res({ brick: 1 }) });
  });

  it('segunda casa da preparação: 1 de cada terreno em volta, sem o rio seco', () => {
    const s = table();
    // corner(9, 0) é o canto de cima do rio seco: encosta no 9 e em mais dois terrenos.
    const g = setupGain(s, corner(9, 0));
    expect(Object.values(g).reduce((a, b) => a + b, 0)).toBe(2);
  });
});
