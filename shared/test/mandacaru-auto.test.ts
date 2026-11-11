import { describe, expect, it } from 'vitest';
import { settleMandacaru } from '../src/games/mandacaru/auto';
import { initialMandacaruState } from '../src/games/mandacaru/rules';
import { mandacaruNextDeadline } from '../src/games/mandacaru/view';
import { MANDACARU_DISCARD_MS, MANDACARU_TURN_MS } from '../src/games/mandacaru/types';
import { T0, act, ctxOf, deepFreeze, ids, res, table } from './mandacaru-helpers';

describe('Mandacaru: automático', () => {
  it('nada a fazer: devolve o mesmo objeto', () => {
    const s = deepFreeze(table());
    expect(settleMandacaru(s, ctxOf(ids(3)))).toBe(s);
    const lobby = deepFreeze(initialMandacaruState());
    expect(settleMandacaru(lobby, ctxOf(ids(3)))).toBe(lobby);
  });

  it('acabou o turno na fase principal: passa a vez e anota no diário', () => {
    const s = settleMandacaru(deepFreeze(table()), ctxOf(ids(3), { now: T0 + MANDACARU_TURN_MS }));
    expect(s.turn).toBe('p1');
    expect(s.log.some((e) => e.t === 'timeout' && e.player === 'p0')).toBe(true);
  });

  it('acabou o turno antes dos dados: rola e segue', () => {
    const s = settleMandacaru(deepFreeze(table({ phase: 'roll' })), ctxOf(ids(3), { now: T0 + MANDACARU_TURN_MS }));
    expect(s.diceCounts.reduce((a, b) => a + b, 0)).toBe(1);
    expect(s.turn).not.toBe('p0');
  });

  it('ausente na vez: rola e passa na hora', () => {
    const s = settleMandacaru(deepFreeze(table({ phase: 'roll' })), ctxOf(['p1', 'p2']));
    expect(s.turn).toBe('p1');
  });

  it('descarte: prazo vencido descarta sorteado', () => {
    const s0 = { ...table({ hands: { p1: { wood: 8 } } }), phase: 'discard' as const, discards: { p1: 4 }, discardEndsAt: T0 + MANDACARU_DISCARD_MS };
    expect(settleMandacaru(deepFreeze(s0), ctxOf(ids(3), { now: T0 + 10 }))).toBe(s0);
    const s = settleMandacaru(deepFreeze(s0), ctxOf(ids(3), { now: T0 + MANDACARU_DISCARD_MS }));
    expect(s.hands.p1!.res).toEqual(res({ wood: 4 }));
    expect(s.phase).toBe('carcara');
  });

  it('preparação de ausente: põe casa e estrada', () => {
    const s0 = act(initialMandacaruState(), 'p0', { type: 'start' }, ctxOf(ids(3)));
    const first = s0.turn!;
    const s = settleMandacaru(deepFreeze(s0), ctxOf(ids(3).filter((p) => p !== first)));
    expect(s.buildings.filter((b) => b?.owner === first)).toHaveLength(s.turn === first ? 2 : 1);
    expect(s.roads.filter((o) => o === first).length).toBeGreaterThanOrEqual(1);
  });

  it('todo mundo ausente: a mesa congela (mesmo objeto) até alguém voltar', () => {
    const s0 = deepFreeze(act(initialMandacaruState(), 'p0', { type: 'start' }, ctxOf(ids(3))));
    expect(settleMandacaru(s0, ctxOf([]))).toBe(s0);
    // Quem não está na partida (quem assiste) não descongela.
    expect(settleMandacaru(s0, ctxOf(['visita']))).toBe(s0);
    const main = deepFreeze(table());
    expect(settleMandacaru(main, ctxOf([], { now: T0 + 10 }))).toBe(main);
    const d = deepFreeze({ ...table({ hands: { p1: { wood: 8 } } }), phase: 'discard' as const, discards: { p1: 4 }, discardEndsAt: T0 + MANDACARU_DISCARD_MS });
    expect(settleMandacaru(d, ctxOf([]))).toBe(d);
  });

  it('todo mundo ausente com o prazo vencido: o relógio para (sem alarme no passado) e volta quando alguém chega', () => {
    const late = T0 + MANDACARU_TURN_MS + 1;
    const s = settleMandacaru(deepFreeze(table()), ctxOf([], { now: late }));
    expect(s.turn).toBe('p0');
    expect(s.turns).toBe(0);
    expect(s.turnEndsAt).toBeNull();
    expect(mandacaruNextDeadline(s)).toBeNull();
    expect(settleMandacaru(deepFreeze(s), ctxOf([], { now: late + 1000 }))).toBe(s);
    // Quem está na vez volta: turno novo de 5 min, a partir de agora.
    const back = settleMandacaru(deepFreeze(s), ctxOf(['p0'], { now: late + 5000 }));
    expect(back.turn).toBe('p0');
    expect(back.turnEndsAt).toBe(late + 5000 + MANDACARU_TURN_MS);
    expect(settleMandacaru(deepFreeze(back), ctxOf(['p0'], { now: late + 6000 }))).toBe(back);

    // No descarte: os dois relógios param e voltam.
    const d0 = { ...table({ hands: { p1: { wood: 8 } } }), phase: 'discard' as const, discards: { p1: 4 }, discardEndsAt: T0 + MANDACARU_DISCARD_MS };
    const d = settleMandacaru(deepFreeze(d0), ctxOf([], { now: T0 + MANDACARU_DISCARD_MS }));
    expect(d).toMatchObject({ phase: 'discard', discards: { p1: 4 }, turnEndsAt: null, discardEndsAt: null });
    const dBack = settleMandacaru(deepFreeze(d), ctxOf(['p1'], { now: late }));
    expect(dBack).toMatchObject({ phase: 'discard', turnEndsAt: late + MANDACARU_TURN_MS, discardEndsAt: late + MANDACARU_DISCARD_MS });
  });

  it('só um presente: o jogo anda pelos ausentes até chegar na vez dele', () => {
    const s0 = act(initialMandacaruState(), 'p0', { type: 'start' }, ctxOf(ids(3)));
    const last = s0.players[2]!;
    const s = settleMandacaru(deepFreeze(s0), ctxOf([last]));
    expect(s.phase).toBe('setup');
    expect(s.turn).toBe(last);
    expect(s.setup).toEqual({ index: 2, house: null });
    expect(settleMandacaru(deepFreeze(s), ctxOf([last]))).toBe(s);
  });

  it('só um presente: no descarte, os ausentes descartam e a mesa espera a decisão dele', () => {
    const s0 = {
      ...table({ hands: { p0: { wood: 8 }, p1: { stone: 8 } } }),
      phase: 'discard' as const,
      discards: { p0: 4, p1: 4 },
      discardEndsAt: T0 + MANDACARU_DISCARD_MS,
    };
    const s = settleMandacaru(deepFreeze(s0), ctxOf(['p1']));
    expect(s.phase).toBe('discard');
    expect(s.discards).toEqual({ p1: 4 });
    expect(s.hands.p0!.res).toEqual(res({ wood: 4 }));
    expect(settleMandacaru(deepFreeze(s), ctxOf(['p1']))).toBe(s);
  });

  it('ausente na fase principal: resposta pendente conta como "não" e a proposta dele some', () => {
    const base = table({ hands: { p0: { wood: 2 }, p1: { stone: 2 }, p2: { stone: 2 } } });
    let s = act(base, 'p0', { type: 'offer', give: res({ wood: 1 }), want: res({ stone: 1 }) }, ctxOf(ids(3)));
    s = act(s, 'p1', { type: 'propose', give: res({ stone: 1 }), want: res({ wood: 1 }) }, ctxOf(ids(3)));
    s = act(s, 'p2', { type: 'propose', give: res({ stone: 2 }), want: res({ wood: 1 }) }, ctxOf(ids(3)));
    const out = settleMandacaru(deepFreeze(s), ctxOf(['p0', 'p2']));
    expect(out.offer).toMatchObject({ accepted: [], rejected: ['p1'] });
    expect(out.proposals.map((x) => x.from)).toEqual(['p2']);
    expect(out.turn).toBe('p0');
    // Já resolvido: mesmo objeto.
    expect(settleMandacaru(deepFreeze(out), ctxOf(['p0', 'p2']))).toBe(out);

    // Quem já aceitou continua aceito; sem proposta dele, nada muda.
    const accepted = act(s, 'p1', { type: 'respond', offerId: s.offer!.id, accept: true }, ctxOf(ids(3)));
    const noProposal = deepFreeze({ ...accepted, proposals: accepted.proposals.filter((x) => x.from !== 'p1') });
    expect(settleMandacaru(noProposal, ctxOf(['p0', 'p2']))).toBe(noProposal);
    // Sem oferta aberta, só a proposta some.
    const noOffer = settleMandacaru(deepFreeze({ ...s, offer: null }), ctxOf(['p0', 'p2']));
    expect(noOffer.offer).toBeNull();
    expect(noOffer.proposals.map((x) => x.from)).toEqual(['p2']);
  });
});
