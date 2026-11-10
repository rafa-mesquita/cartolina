import { describe, expect, it } from 'vitest';
import { act, corner, ctxOf, geo, ids, res, table, tryAct } from './mandacaru-helpers';

const ctx = ctxOf(ids(3));

describe('Mandacaru: cordéis', () => {
  it('Mutirão: 2 estradas de graça e volta pra fase principal', () => {
    const a = corner(9, 0);
    let s = act(table({ houses: { [a]: 'p0' }, cordeis: { p0: ['mutirao'] } }), 'p0', { type: 'play_mutirao' }, ctx);
    expect(s.phase).toBe('mutirao');
    expect(s.mutiraoLeft).toBe(2);
    const e1 = geo().vertices[a]!.edges[0]!;
    s = act(s, 'p0', { type: 'build_road', edge: e1 }, ctx);
    const e2 = geo().vertices[a]!.edges[1]!;
    s = act(s, 'p0', { type: 'build_road', edge: e2 }, ctx);
    expect(s.phase).toBe('main');
    expect(s.roads[e1]).toBe('p0');
    expect(s.roads[e2]).toBe('p0');
    expect(s.hands.p0!.cordeis).toEqual([]);
  });

  it('Mutirão sem lugar ou sem peça de estrada: recusado (bad_spot) e a carta fica', () => {
    // Sem casa nem estrada, não tem onde pôr estrada.
    const nowhere = table({ cordeis: { p0: ['mutirao'] } });
    expect(tryAct(nowhere, 'p0', { type: 'play_mutirao' }, ctx)).toEqual({ ok: false, error: 'bad_spot' });
    const a = corner(9, 0);
    // As 15 estradas já no tabuleiro: sem peça.
    const roads = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [40 + i, 'p0']));
    const noPieces = table({ houses: { [a]: 'p0' }, roads, cordeis: { p0: ['mutirao'] } });
    expect(tryAct(noPieces, 'p0', { type: 'play_mutirao' }, ctx)).toEqual({ ok: false, error: 'bad_spot' });
    // Recusado não gasta o cordel do turno: ainda dá pra jogar outro.
    const other = table({ cordeis: { p0: ['mutirao', 'chuva'] } });
    expect(tryAct(other, 'p0', { type: 'play_mutirao' }, ctx).ok).toBe(false);
    expect(tryAct(other, 'p0', { type: 'play_chuva', resources: ['wood', 'wood'] }, ctx).ok).toBe(true);
  });

  it('Chuva no sertão: 2 recursos do banco', () => {
    const s = act(table({ cordeis: { p0: ['chuva'] } }), 'p0', { type: 'play_chuva', resources: ['stone', 'stone'] }, ctx);
    expect(s.hands.p0!.res).toEqual(res({ stone: 2 }));
    const poor = table({ cordeis: { p0: ['chuva'] } });
    expect(tryAct({ ...poor, bank: { ...poor.bank, stone: 1 } }, 'p0', { type: 'play_chuva', resources: ['stone', 'stone'] }, ctx)).toEqual({
      ok: false,
      error: 'bank_empty',
    });
  });

  it('Atravessador: todos entregam tudo do recurso', () => {
    const s = act(
      table({ cordeis: { p0: ['atravessador'] }, hands: { p1: { beans: 3, wood: 1 }, p2: { beans: 2 } } }),
      'p0',
      { type: 'play_atravessador', resource: 'beans' },
      ctx,
    );
    expect(s.hands.p0!.res.beans).toBe(5);
    expect(s.hands.p1!.res).toEqual(res({ wood: 1 }));
    expect(s.log.at(-1)).toEqual({ t: 'play', player: 'p0', kind: 'atravessador', resources: ['beans'], total: 5 });
  });

  it('um cordel por turno, e não o comprado agora', () => {
    let s = table({ cordeis: { p0: ['chuva', 'atravessador', { kind: 'mutirao', fresh: true }] } });
    expect(tryAct(s, 'p0', { type: 'play_mutirao' }, ctx)).toEqual({ ok: false, error: 'cordel_fresh' });
    s = act(s, 'p0', { type: 'play_chuva', resources: ['wood', 'brick'] }, ctx);
    expect(tryAct(s, 'p0', { type: 'play_atravessador', resource: 'wood' }, ctx)).toEqual({ ok: false, error: 'cordel_used' });
  });
});
