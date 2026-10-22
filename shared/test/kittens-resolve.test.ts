import { describe, expect, it } from 'vitest';
import { settleKittens } from '../src/games/kittens/settle';
import { T0, act, ctxOf, ids, refuse, table } from './kittens-helpers';

const ctx = ctxOf(ids(3));
const at = (ms: number) => ctxOf(ids(3), { now: T0 + ms });
const DRAW = ['mico-0', 'quati-0', 'tamandua-0', 'preguica-0'];

/** p0 joga `cards` (tem também um Nem vem!); p1 tem Nem vem! e Favor; p2 tem uma capivara. */
function played(cards: string[], { owed = 1, draw = DRAW }: { owed?: number; draw?: string[] } = {}) {
  const s = table({ hands: { p0: [...cards, 'nemvem-0'], p1: ['nemvem-1', 'favor-0'], p2: ['capivara-3'] }, draw, owed });
  return act(s, 'p0', { type: 'play', cards }, ctx);
}

describe('carta no ar', () => {
  it('antes do prazo nada muda (o mesmo objeto)', () => {
    const air = played(['ataque-0']);
    expect(settleKittens(air, at(4999))).toBe(air);
  });

  it('Ataque: o próximo joga 2 turnos e a carta vai pro descarte', () => {
    const s = settleKittens(played(['ataque-0']), at(5000));
    expect(s).toMatchObject({ pending: null, current: 'p1', owed: 2 });
    expect(s.discard).toEqual(['ataque-0']);
    expect(s.log.at(-1)!.ev).toEqual({ t: 'resolved', by: 'p0', play: 'ataque', canceled: false });
  });

  it('Ataque de quem estava sob ataque acumula: 2 → 4', () => {
    expect(settleKittens(played(['ataque-0'], { owed: 2 }), at(5000))).toMatchObject({ current: 'p1', owed: 4 });
  });

  it('Nem vem! em número ímpar cancela; par deixa valer', () => {
    const one = act(played(['ataque-0']), 'p1', { type: 'nope' }, at(1000));
    const canceled = settleKittens(one, at(6000));
    expect(canceled).toMatchObject({ pending: null, current: 'p0', owed: 1 });
    expect(canceled.discard).toEqual(['ataque-0', 'nemvem-1']);
    expect(canceled.log.at(-1)!.ev).toEqual({ t: 'resolved', by: 'p0', play: 'ataque', canceled: true });
    const two = act(one, 'p0', { type: 'nope' }, at(3000));
    expect(settleKittens(two, at(8000))).toMatchObject({ current: 'p1', owed: 2 });
  });

  it('cada Nem vem! empurra o prazo', () => {
    const one = act(played(['ataque-0']), 'p1', { type: 'nope' }, at(4000));
    expect(settleKittens(one, at(5000))).toBe(one);
    expect(settleKittens(one, at(9000)).pending).toBeNull();
  });

  it('Nem vem! que chega depois do prazo é tarde: a carta já resolveu', () => {
    expect(refuse(played(['ataque-0']), 'p1', { type: 'nope' }, at(5000))).toBe('nothing_to_nope');
  });

  it('Pular gasta 1 turno', () => {
    expect(settleKittens(played(['pular-0']), at(5000))).toMatchObject({ current: 'p1', owed: 1 });
    expect(settleKittens(played(['pular-0'], { owed: 2 }), at(5000))).toMatchObject({ current: 'p0', owed: 1 });
  });

  it('Embaralhar mexe no monte e apaga o Espiar de todos', () => {
    const s = { ...played(['embaralhar-0']), peeks: { p0: ['preguica-0'], p1: ['preguica-0', 'tamandua-0'] } };
    const after = settleKittens(s, at(5000));
    expect([...after.draw].sort()).toEqual([...DRAW].sort());
    expect(after.peeks).toEqual({});
    expect(after.current).toBe('p0');
  });

  it('Espiar mostra as 3 de cima (a do topo primeiro); comprando, a comprada sai e o resto fica à mostra', () => {
    const after = settleKittens(played(['espiar-0']), at(5000));
    expect(after.peeks).toEqual({ p0: ['preguica-0', 'tamandua-0', 'quati-0'] });
    expect(after.draw).toEqual(DRAW);
    expect(after).toMatchObject({ current: 'p0', owed: 1 });
    const drawn = act(after, 'p0', { type: 'draw' }, at(5000));
    expect(drawn.current).toBe('p1');
    expect(drawn.peeks).toEqual({ p0: ['tamandua-0', 'quati-0'] });
  });

  it('fora de partida nada muda', () => {
    const lobby = { ...played(['ataque-0']), phase: 'lobby' as const };
    expect(settleKittens(lobby, at(9000))).toBe(lobby);
  });
});
