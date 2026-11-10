import { describe, expect, it } from 'vitest';
import { geometry } from '../src/games/mandacaru/board';
import { act, ctxOf, ids, res, table, tryAct } from './mandacaru-helpers';

const ctx = ctxOf(ids(3));

describe('Mandacaru: troca entre jogadores', () => {
  const base = () => table({ hands: { p0: { wood: 2, brick: 1 }, p1: { stone: 1 }, p2: { stone: 2 } } });

  it('oferta pra mesa; respostas; fecha com quem aceitou', () => {
    let s = act(base(), 'p0', { type: 'offer', give: res({ wood: 2 }), want: res({ stone: 1 }) }, ctx);
    const id = s.offer!.id;
    s = act(s, 'p1', { type: 'respond', offerId: id, accept: true }, ctx);
    s = act(s, 'p2', { type: 'respond', offerId: id, accept: false }, ctx);
    expect(s.offer).toMatchObject({ accepted: ['p1'], rejected: ['p2'] });
    expect(tryAct(s, 'p0', { type: 'close_deal', with: 'p2', source: 'offer' }, ctx)).toEqual({ ok: false, error: 'bad_target' });
    s = act(s, 'p0', { type: 'close_deal', with: 'p1', source: 'offer' }, ctx);
    expect(s.hands.p0!.res).toEqual(res({ brick: 1, stone: 1 }));
    expect(s.hands.p1!.res).toEqual(res({ wood: 2 }));
    expect(s.offer).toBeNull();
    expect(s.log.at(-1)).toEqual({ t: 'trade', a: 'p0', b: 'p1', aGives: res({ wood: 2 }), bGives: res({ stone: 1 }) });
  });

  it('termos inválidos, sem cartas, fora da vez', () => {
    const s = base();
    expect(tryAct(s, 'p0', { type: 'offer', give: res(), want: res({ stone: 1 }) }, ctx)).toEqual({ ok: false, error: 'bad_trade' });
    expect(tryAct(s, 'p0', { type: 'offer', give: res({ wood: 1 }), want: res({ wood: 1 }) }, ctx)).toEqual({ ok: false, error: 'bad_trade' });
    expect(tryAct(s, 'p0', { type: 'offer', give: res({ stone: 1 }), want: res({ wood: 1 }) }, ctx)).toEqual({ ok: false, error: 'cannot_afford' });
    expect(tryAct(s, 'p1', { type: 'offer', give: res({ stone: 1 }), want: res({ wood: 1 }) }, ctx)).toEqual({ ok: false, error: 'not_your_turn' });
    expect(tryAct({ ...s, phase: 'roll', rolled: false }, 'p0', { type: 'offer', give: res({ wood: 1 }), want: res({ stone: 1 }) }, ctx)).toEqual({
      ok: false,
      error: 'bad_phase',
    });
  });

  it('resposta pra oferta velha não vale; aceitar exige ter as cartas', () => {
    let s = act(base(), 'p0', { type: 'offer', give: res({ wood: 1 }), want: res({ stone: 2 }) }, ctx);
    const old = s.offer!.id;
    expect(tryAct(s, 'p1', { type: 'respond', offerId: old, accept: true }, ctx)).toEqual({ ok: false, error: 'cannot_afford' });
    s = act(s, 'p0', { type: 'offer', give: res({ wood: 1 }), want: res({ stone: 1 }) }, ctx);
    expect(tryAct(s, 'p1', { type: 'respond', offerId: old, accept: true }, ctx)).toEqual({ ok: false, error: 'stale_offer' });
  });

  it('proposta (contraproposta) dos outros; quem está na vez aceita', () => {
    let s = act(base(), 'p2', { type: 'propose', give: res({ stone: 2 }), want: res({ wood: 1, brick: 1 }) }, ctx);
    expect(s.proposals).toHaveLength(1);
    s = act(s, 'p2', { type: 'propose', give: res({ stone: 1 }), want: res({ brick: 1 }) }, ctx);
    expect(s.proposals).toHaveLength(1);
    s = act(s, 'p0', { type: 'close_deal', with: 'p2', source: 'proposal' }, ctx);
    expect(s.hands.p0!.res).toEqual(res({ wood: 2, stone: 1 }));
    expect(s.hands.p2!.res).toEqual(res({ stone: 1, brick: 1 }));
    expect(s.proposals).toEqual([]);
  });

  it('quem está na vez não manda proposta; passar a vez limpa tudo', () => {
    let s = base();
    expect(tryAct(s, 'p0', { type: 'propose', give: res({ wood: 1 }), want: res({ stone: 1 }) }, ctx)).toEqual({ ok: false, error: 'not_your_turn' });
    s = act(s, 'p1', { type: 'propose', give: res({ stone: 1 }), want: res({ wood: 1 }) }, ctx);
    s = act(s, 'p0', { type: 'offer', give: res({ wood: 1 }), want: res({ stone: 1 }) }, ctx);
    s = act(s, 'p0', { type: 'end_turn' }, ctx);
    expect(s.offer).toBeNull();
    expect(s.proposals).toEqual([]);
  });
});

describe('Mandacaru: feira', () => {
  it('4:1 sem feira, várias de uma vez', () => {
    const s = act(table({ hands: { p0: { wood: 8 } } }), 'p0', { type: 'feira', give: 'wood', want: 'stone', count: 2 }, ctx);
    expect(s.hands.p0!.res).toEqual(res({ stone: 2 }));
  });

  it('2:1 na feira do recurso', () => {
    const wood = geometry().ports[1]!; // FIXED_LAYOUT.ports[1] = wood
    const s = act(table({ houses: { [wood.vertices[0]]: 'p0' }, hands: { p0: { wood: 2 } } }), 'p0', { type: 'feira', give: 'wood', want: 'beans' }, ctx);
    expect(s.hands.p0!.res).toEqual(res({ beans: 1 }));
  });

  it('sem cartas, mesmo recurso, banco vazio', () => {
    const s = table({ hands: { p0: { wood: 3 } } });
    expect(tryAct(s, 'p0', { type: 'feira', give: 'wood', want: 'stone' }, ctx)).toEqual({ ok: false, error: 'cannot_afford' });
    expect(tryAct(s, 'p0', { type: 'feira', give: 'wood', want: 'wood' }, ctx)).toEqual({ ok: false, error: 'bad_trade' });
    const rich = table({ hands: { p0: { wood: 4 } } });
    expect(tryAct({ ...rich, bank: { ...rich.bank, stone: 0 } }, 'p0', { type: 'feira', give: 'wood', want: 'stone' }, ctx)).toEqual({
      ok: false,
      error: 'bank_empty',
    });
  });
});
