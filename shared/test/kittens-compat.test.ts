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

  it('par de Mico salvo antes da pegada no fim (sem `discarded`): segue, e quem jogou pega uma das descartadas depois', () => {
    const s = table({ hands: { p0: ['quati-0'], p1: ['pular-1', 'ataque-1'], p2: ['espiar-2'] }, draw: DRAW, discard: ['mico-0', 'mico-1', 'favor-2'] });
    // p2 já tinha descartado o Favor antes do deploy: esse não conta.
    const saved = deepFreeze({ ...s, choice: { kind: 'mico', by: 'p0', waiting: ['p1'], deadline: T0 + 30_000 } } as unknown as KittensState);
    expect(settleKittens(saved, ctx).choice).toEqual({ kind: 'mico', by: 'p0', waiting: ['p1'], discarded: [], deadline: T0 + 30_000 });
    expect(kittensViewFor(saved, 'p2').choice).toMatchObject({ kind: 'mico', discarded: [] });
    expect(kittensNextDeadline(saved)).toBe(T0 + 30_000);
    const done = act(saved, 'p1', { type: 'choose', card: 'pular-1' }, at(1000));
    expect(done.choice).toEqual({ kind: 'cinco', who: 'p0', options: ['pular-1'], left: 1, deadline: T0 + 1000 + 30_000, from: 'mico' });
    // Prazo vencido no formato antigo: o descarte ao acaso também abre a pegada.
    const late = settleKittens(saved, at(30_000));
    expect(late.choice).toMatchObject({ kind: 'cinco', who: 'p0', left: 1, from: 'mico' });
    expect(late.hands.p1).toHaveLength(1);
  });

  it('estado salvo antes do Tucano (sem `skips`): ninguém tem vez pulada, e o par de Tucano funciona', () => {
    const { skips: _skips, ...rest } = table({ hands: { p0: ['tucano-0', 'tucano-1'], p1: ['pular-1'], p2: ['espiar-2'] }, draw: DRAW });
    void _skips;
    const saved = deepFreeze(rest as KittensState);
    expect(kittensViewFor(saved, 'p1').skips).toEqual({});
    expect(settleKittens(saved, ctx).skips).toEqual({});
    const played = act(saved, 'p0', { type: 'play', cards: ['tucano-0', 'tucano-1'], target: 'p2' }, ctx);
    const { skips: _s2, ...inAir } = played;
    void _s2;
    const done = settleKittens(deepFreeze(inAir as KittensState), at(5000));
    expect(done).toMatchObject({ current: 'p1', owed: 1, skips: { p2: 1 } });
  });

  it('estado completo não muda: settle sem nada a fazer devolve o mesmo objeto', () => {
    const s = deepFreeze(table({ hands: { p0: ['mico-0'], p1: [], p2: [] }, draw: DRAW }));
    expect(settleKittens(s, ctx)).toBe(s);
  });
});
