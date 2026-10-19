import { describe, expect, it } from 'vitest';
import { settleKittens } from '../src/games/kittens/settle';
import { T0, act, ctxOf, ids, table } from './kittens-helpers';

const all = ids(3);
/** Ativos sem `p` (a tolerância de 30 s de `p` já acabou). */
const without = (p: string, ms = 0) => ctxOf(all.filter((x) => x !== p), { now: T0 + ms });

describe('presença', () => {
  it('todo mundo presente: o mesmo objeto', () => {
    const s = table({ hands: { p0: [], p1: [], p2: [] }, draw: ['tatubum-0', 'tatubum-1'] });
    expect(settleKittens(s, ctxOf(all))).toBe(s);
  });

  it('quem caiu de vez sai: mão fora do jogo e um tatu sai do monte', () => {
    const s = table({ hands: { p0: ['mico-0'], p1: ['quati-0'], p2: [] }, draw: ['tatubum-0', 'pular-0', 'tatubum-1'] });
    const after = settleKittens(s, without('p1'));
    expect(after.alive).toEqual(['p0', 'p2']);
    expect(after.hands.p1).toEqual([]);
    expect(after.out).toEqual(['quati-0', 'tatubum-0']);
    expect(after.draw).toEqual(['pular-0', 'tatubum-1']);
    expect(after.current).toBe('p0');
    expect(after.log.at(-1)!.ev).toEqual({ t: 'left', by: 'p1' });
  });

  it('se era a vez de quem saiu, o próximo começa com 1 turno', () => {
    const s = table({ hands: { p0: [], p1: [], p2: [] }, draw: ['tatubum-0', 'tatubum-1'], owed: 2 });
    expect(settleKittens(s, without('p0'))).toMatchObject({ current: 'p1', owed: 1 });
  });

  it('com 2, quem fica vence', () => {
    const s = table({ hands: { p0: [], p1: [] }, draw: ['tatubum-0'] });
    expect(settleKittens(s, ctxOf(['p0']))).toMatchObject({ phase: 'gameover', winner: 'p0' });
  });

  it('a escolha de quem saiu é feita ao acaso antes', () => {
    const s = {
      ...table({ hands: { p0: ['mico-0'], p1: ['quati-0', 'pular-0'], p2: [] }, draw: ['tatubum-0', 'tatubum-1'] }),
      choice: { kind: 'favor' as const, who: 'p1', to: 'p0', deadline: T0 + 30_000 },
    };
    const after = settleKittens(s, without('p1'));
    expect(after.hands.p0).toHaveLength(2);
    expect(after.choice).toBeNull();
    expect(after.alive).toEqual(['p0', 'p2']);
  });

  it('se quem ia receber o Favor sai, a escolha some', () => {
    const s = {
      ...table({ hands: { p0: [], p1: ['quati-0'], p2: [] }, draw: ['tatubum-0', 'tatubum-1'] }),
      choice: { kind: 'favor' as const, who: 'p1', to: 'p0', deadline: T0 + 30_000 },
    };
    expect(settleKittens(s, without('p0'))).toMatchObject({ choice: null, current: 'p1' });
  });

  it('o tatu que está na mão de quem escolhe onde esconder conta: sai um tatu do monte', () => {
    // p0 comprou um tatu e está escolhendo (o tatu não está no monte); p1 cai de vez.
    const s = {
      ...table({ hands: { p0: [], p1: [], p2: [] }, draw: ['mico-0', 'tatubum-1'] }),
      choice: { kind: 'cafune' as const, who: 'p0', tatu: 'tatubum-0', deadline: T0 + 30_000 },
    };
    const after = settleKittens(s, without('p1'));
    expect(after.draw).toEqual(['mico-0']);
    expect(after.out).toEqual(['tatubum-1']);
    const hid = act(after, 'p0', { type: 'choose', position: 0 }, without('p1'));
    expect(hid.draw.filter((c) => c.startsWith('tatubum'))).toHaveLength(1);
  });

  it('a carta no ar de quem saiu não faz efeito', () => {
    const air = act(table({ hands: { p0: ['ataque-0'], p1: [], p2: [] } }), 'p0', { type: 'play', cards: ['ataque-0'] }, ctxOf(all));
    const gone = settleKittens(air, without('p0', 1000));
    expect(gone.current).toBe('p1');
    const done = settleKittens(gone, without('p0', 5000));
    expect(done).toMatchObject({ pending: null, current: 'p1', owed: 1 });
    expect(done.log.at(-1)!.ev).toEqual({ t: 'resolved', by: 'p0', play: 'ataque', canceled: true });
  });
});
