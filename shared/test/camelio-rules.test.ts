import { describe, expect, it } from 'vitest';
import { applyCamelioAction, camelioTarget, initialCamelioState } from '../src/games/camelio/rules';
import { act, allCards, C, ctxOf, ids, playing, tryAct } from './camelio-helpers';

describe('estado inicial e meta', () => {
  it('começa no lobby, sem partida', () => {
    expect(initialCamelioState()).toMatchObject({ phase: 'lobby', players: [], match: 0, turn: null, winners: [], endReason: null });
  });

  it('meta: 4 cores com 2 jogadores, 3 com 3 a 6', () => {
    expect(camelioTarget(2)).toBe(4);
    expect(camelioTarget(3)).toBe(3);
    expect(camelioTarget(6)).toBe(3);
  });
});

describe('começar', () => {
  it('host começa com 3: monte de 71, uma aberta, mesas vazias, meta 3', () => {
    const s = act(initialCamelioState(), 'p0', { type: 'start' }, ctxOf(ids(3)));
    expect(s.phase).toBe('playing');
    expect(s.players).toEqual(['p0', 'p1', 'p2']);
    expect(s.deck).toHaveLength(71);
    expect(s.open).not.toBeNull();
    expect(new Set(allCards(s)).size).toBe(72);
    expect(s.table).toEqual({ p0: [], p1: [], p2: [] });
    expect(s.scored).toEqual({ p0: [], p1: [], p2: [] });
    expect(s.target).toBe(3);
    expect(s.players).toContain(s.turn);
    expect(s.match).toBe(1);
    expect(s.log).toEqual([]);
    expect(s.reshuffled).toBe(false);
  });

  it('com 2 jogadores a meta é 4', () => {
    expect(act(initialCamelioState(), 'p0', { type: 'start' }, ctxOf(ids(2))).target).toBe(4);
  });

  it('quem começa é sorteado', () => {
    const firsts = new Set<string | null>();
    for (let seed = 1; seed <= 20; seed++) firsts.add(act(initialCamelioState(), 'p0', { type: 'start' }, ctxOf(ids(3), seed)).turn);
    expect(firsts.size).toBeGreaterThan(1);
  });

  it('o monte vem embaralhado', () => {
    const a = act(initialCamelioState(), 'p0', { type: 'start' }, ctxOf(ids(3), 1));
    const b = act(initialCamelioState(), 'p0', { type: 'start' }, ctxOf(ids(3), 2));
    expect(a.deck).not.toEqual(b.deck);
  });

  it('recusa: só host, só no lobby, precisa de 2', () => {
    expect(tryAct(initialCamelioState(), 'p1', { type: 'start' }, ctxOf(ids(3)))).toEqual({ ok: false, error: 'not_host' });
    expect(tryAct(initialCamelioState(), 'p0', { type: 'start' }, ctxOf(['p0']))).toEqual({ ok: false, error: 'not_enough_players' });
    expect(tryAct(playing(3), 'p0', { type: 'start' }, ctxOf(ids(3)))).toEqual({ ok: false, error: 'bad_phase' });
  });

  it('ação desconhecida é recusada', () => {
    const res = applyCamelioAction(initialCamelioState(), 'p0', { type: 'xyz' } as never, ctxOf(ids(3)));
    expect(res).toEqual({ ok: false, error: 'bad_action' });
  });
});

describe('voltar pro lobby', () => {
  it('host volta pro lobby de qualquer fase de jogo, mantendo o número da partida', () => {
    const s = act(playing(3, { match: 2 }), 'p0', { type: 'lobby' }, ctxOf(ids(3)));
    expect(s).toEqual({ ...initialCamelioState(), match: 2 });
  });

  it('recusa: só host, e não no lobby', () => {
    expect(tryAct(playing(3), 'p1', { type: 'lobby' }, ctxOf(ids(3)))).toEqual({ ok: false, error: 'not_host' });
    expect(tryAct(initialCamelioState(), 'p0', { type: 'lobby' }, ctxOf(ids(3)))).toEqual({ ok: false, error: 'bad_phase' });
  });
});

describe('jogar de novo', () => {
  const over = (scored: Record<string, number[]>, table: Record<string, number[]>, winners: string[]) =>
    playing(3, { phase: 'over', turn: null, winners, endReason: 'target', scored, table });

  it('partida nova com quem está ativo; começa quem ficou em último', () => {
    const prev = over(
      { p0: [C.vermelho3, C.vermelho2], p1: [C.azul2, C.azul3], p2: [] },
      { p0: [], p1: [], p2: [C.amarelo3] },
      ['p1'],
    );
    const s = act(prev, 'p0', { type: 'again' }, ctxOf(ids(3)));
    expect(s.phase).toBe('playing');
    expect(s.match).toBe(2);
    expect(s.turn).toBe('p2');
    expect(s.deck).toHaveLength(71);
    expect(s.table).toEqual({ p0: [], p1: [], p2: [] });
    expect(s.winners).toEqual([]);
    expect(s.endReason).toBeNull();
  });

  it('empate em pontos: começa quem tem menos esferas na mesa', () => {
    const prev = over({ p0: [], p1: [C.azul2, C.azul3], p2: [] }, { p0: [], p1: [], p2: [C.amarelo3] }, ['p1']);
    expect(act(prev, 'p0', { type: 'again' }, ctxOf(ids(3))).turn).toBe('p0');
  });

  it('empate em tudo: o primeiro depois do vencedor, na ordem dos assentos', () => {
    const prev = over({ p0: [], p1: [C.azul2, C.azul3], p2: [] }, { p0: [], p1: [], p2: [] }, ['p1']);
    expect(act(prev, 'p0', { type: 'again' }, ctxOf(ids(3))).turn).toBe('p2');
  });

  it('quem não está mais aqui não começa', () => {
    const prev = over({ p0: [C.vermelho3, C.vermelho2], p1: [C.azul2, C.azul3], p2: [] }, { p0: [], p1: [], p2: [] }, ['p1']);
    const s = act(prev, 'p0', { type: 'again' }, ctxOf(['p0', 'p1']));
    expect(s.players).toEqual(['p0', 'p1']);
    expect(s.turn).toBe('p0');
    expect(s.target).toBe(4);
  });

  it('recusa: só host, só no fim', () => {
    expect(tryAct(playing(3), 'p0', { type: 'again' }, ctxOf(ids(3)))).toEqual({ ok: false, error: 'bad_phase' });
    const prev = over({ p0: [], p1: [], p2: [] }, { p0: [], p1: [], p2: [] }, ['p1']);
    expect(tryAct(prev, 'p1', { type: 'again' }, ctxOf(ids(3)))).toEqual({ ok: false, error: 'not_host' });
  });
});
