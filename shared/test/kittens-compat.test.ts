import { describe, expect, it } from 'vitest';
import { applyKittensAction, initialKittensState } from '../src/games/kittens/rules';
import { settleKittens } from '../src/games/kittens/settle';
import type { KittensState } from '../src/games/kittens/types';
import { kittens, kittensNextDeadline, kittensViewFor } from '../src/games/kittens/view';
import { T0, act, ctxOf, deepFreeze, ids, must, table } from './kittens-helpers';

const ctx = ctxOf(ids(3));
const at = (ms: number) => ctxOf(ids(3), { now: T0 + ms });

/** Estado como era salvo antes das cartas novas: sem `front` nem `blind` (sala no meio de uma partida no deploy). */
function old(s: KittensState): KittensState {
  const { front: _front, blind: _blind, ...rest } = s;
  void _front;
  void _blind;
  return deepFreeze(rest as KittensState);
}

const DRAW = ['mico-9', 'tatubum-0', 'tatubum-1', 'pular-9'];
const playing = () =>
  old(table({ hands: { p0: ['olhado-0', 'latido-0', 'mico-0'], p1: ['latido-1', 'cafune-1'], p2: ['quati-2'] }, draw: DRAW }));

describe('estado salvo antes das cartas novas (sem front/blind)', () => {
  it('visão, prazo e settle funcionam e completam os campos vazios', () => {
    const s = playing();
    for (const viewer of ['p0', 'p1', 'p9', null]) {
      const v = kittensViewFor(s, viewer);
      expect(v.blind).toEqual([]);
      expect(v.front).toEqual({ p0: [], p1: [], p2: [] });
    }
    expect(kittensNextDeadline(s)).toBeNull();
    const settled = settleKittens(s, ctx);
    expect(settled).toMatchObject({ front: {}, blind: [] });
    // Quem caiu de vez sai normalmente.
    expect(settleKittens(s, ctxOf(['p0', 'p1'], { now: T0 + 1000 })).alive).toEqual(['p0', 'p1']);
    // Lobby e fim de jogo antigos também.
    const lobby = old(initialKittensState());
    expect(kittensViewFor(lobby, 'p0')).toMatchObject({ phase: 'lobby', blind: [], hand: [] });
    expect(must(applyKittensAction(lobby, 'p0', { type: 'start' }, ctx))).toMatchObject({ phase: 'playing', blind: [], front: {} });
    expect(kittensViewFor(old({ ...s, phase: 'gameover', winner: 'p0' }), 'p1').phase).toBe('gameover');
  });

  it('ações seguem: comprar, jogar Mau-olhado e Latidor', () => {
    const s = playing();
    expect(act(s, 'p0', { type: 'draw' }, ctx)).toMatchObject({ current: 'p1', front: {}, blind: [] });
    // Carta no ar salva no formato antigo resolve no settle.
    const cursed = settleKittens(old(act(s, 'p0', { type: 'play', cards: ['olhado-0'], target: 'p1' }, ctx)), at(5000));
    expect(cursed.blind).toEqual(['p1']);
    const barked = settleKittens(old(act(s, 'p0', { type: 'play', cards: ['latido-0'] }, ctx)), at(5000));
    expect(barked.choice).toMatchObject({ kind: 'latido', who: 'p1' });
    // Pelo módulo (o que a sala chama).
    expect(kittens.onPresenceChange(s, ctx)).toMatchObject({ front: {}, blind: [] });
    expect(kittens.applyAction(s, 'p0', { type: 'draw' }, ctx).ok).toBe(true);
  });

  it('Espiar salvo no formato antigo (`peek`, sem `peeks`) vira a espiada de quem espiou e continua à mostra', () => {
    const { peeks: _peeks, ...rest } = table({ hands: { p0: ['mico-0'], p1: ['pular-0'], p2: [] }, draw: DRAW });
    void _peeks;
    const saved = (peek: unknown) => deepFreeze({ ...rest, peek } as unknown as KittensState);
    const spied = saved({ who: 'p0', cards: ['pular-9', 'tatubum-1', 'tatubum-0'] });
    expect(kittensViewFor(spied, 'p0')).toMatchObject({ peek: ['pular-9', 'tatubum-1', 'tatubum-0'], peekers: ['p0'] });
    expect(kittensViewFor(spied, 'p1')).toMatchObject({ peek: null, peekers: ['p0'] });
    const settled = settleKittens(spied, ctx);
    expect(settled.peeks).toEqual({ p0: ['pular-9', 'tatubum-1', 'tatubum-0'] });
    expect('peek' in settled).toBe(false);
    // Comprando, a de cima sai e o resto fica (a vez passa e a espiada continua).
    const drawn = act(spied, 'p0', { type: 'draw' }, ctx);
    expect(drawn).toMatchObject({ current: 'p1', peeks: { p0: ['tatubum-1', 'tatubum-0'] } });
    expect('peek' in drawn).toBe(false);
    // Sem Espiar salvo: nenhuma espiada.
    expect(settleKittens(saved(null), ctx).peeks).toEqual({});
    // Espiada antiga desatualizada (não devia existir) fica só com o que ainda é o topo; de quem saiu, some.
    expect(settleKittens(saved({ who: 'p0', cards: ['pular-9', 'mico-9'] }), ctx).peeks).toEqual({ p0: ['pular-9'] });
    expect(settleKittens(deepFreeze({ ...rest, alive: ['p0', 'p2'], peek: { who: 'p1', cards: ['pular-9'] } } as unknown as KittensState), ctx).peeks).toEqual({});
  });

  it('estado completo não muda: settle sem nada a fazer devolve o mesmo objeto', () => {
    const s = deepFreeze(table({ hands: { p0: ['mico-0'], p1: [], p2: [] }, draw: DRAW }));
    expect(settleKittens(s, ctx)).toBe(s);
  });
});
