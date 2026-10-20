import { describe, expect, it } from 'vitest';
import { fullDeck } from '../src/games/coup/deck';
import { applyCoupAction, initialCoupState, settleCoup } from '../src/games/coup/rules';
import { hiddenOf } from '../src/games/coup/table';
import { COUP_WINDOW_MS, type CoupState } from '../src/games/coup/types';
import { T0, THREE, act, allPass, cardsOf, ctxOf, ids, table, tryAct, withLost } from './coup-helpers';

const ctx3 = ctxOf(ids(3));

describe('Cúpi: início', () => {
  it('estado inicial é o lobby vazio', () => {
    expect(initialCoupState()).toMatchObject({ phase: 'lobby', match: 0, players: [], turn: null, wins: {}, log: [] });
  });

  it('precisa de 2 ativos, só o host começa e só no lobby', () => {
    expect(applyCoupAction(initialCoupState(), 'p0', { type: 'start' }, ctxOf(['p0']))).toEqual({ ok: false, error: 'not_enough_players' });
    expect(applyCoupAction(initialCoupState(), 'p1', { type: 'start' }, ctx3)).toEqual({ ok: false, error: 'not_host' });
    expect(tryAct(table(THREE), 'p0', { type: 'start' }, ctx3)).toEqual({ ok: false, error: 'bad_phase' });
  });

  it('mais de 6 ativos: recusa', () => {
    expect(applyCoupAction(initialCoupState(), 'p0', { type: 'start' }, ctxOf(ids(7)))).toEqual({ ok: false, error: 'room_full' });
  });

  it('com 4: 2 cartas e 2 moedas cada, baralho com 7, vez de alguém da partida, placar zerado', () => {
    const s = act(initialCoupState(), 'p0', { type: 'start' }, ctxOf(ids(4)));
    expect(s.phase).toBe('turn');
    expect(s.match).toBe(1);
    expect(s.players).toEqual(ids(4));
    for (const p of ids(4)) {
      expect(s.hands[p]!.coins).toBe(2);
      expect(hiddenOf(s, p)).toHaveLength(2);
    }
    expect(s.deck).toHaveLength(7);
    expect(ids(4)).toContain(s.turn);
    expect(s.wins).toEqual({ p0: 0, p1: 0, p2: 0, p3: 0 });
    expect(s.log).toEqual([{ t: 'start', first: s.turn }]);
    expect(cardsOf(s)).toEqual([...fullDeck()].sort());
  });

  it('com 2: quem começa recebe 1 moeda', () => {
    for (const seed of [1, 2, 3, 4]) {
      const s = act(initialCoupState(), 'p0', { type: 'start' }, ctxOf(ids(2), { seed }));
      const other = s.turn === 'p0' ? 'p1' : 'p0';
      expect(s.hands[s.turn!]!.coins).toBe(1);
      expect(s.hands[other]!.coins).toBe(2);
    }
  });

  it('jogar de novo: só no fim, começa quem venceu, placar e número da partida continuam', () => {
    const over: CoupState = { ...table(THREE), phase: 'over', turn: null, winner: 'p1', wins: { p0: 0, p1: 1 } };
    expect(tryAct(table(THREE), 'p0', { type: 'restart' }, ctx3)).toEqual({ ok: false, error: 'bad_phase' });
    expect(tryAct(over, 'p1', { type: 'restart' }, ctx3)).toEqual({ ok: false, error: 'not_host' });
    const s = act(over, 'p0', { type: 'restart' }, ctxOf(['p0', 'p1', 'p3']));
    expect(s.phase).toBe('turn');
    expect(s.match).toBe(2);
    expect(s.players).toEqual(['p0', 'p1', 'p3']);
    expect(s.turn).toBe('p1');
    expect(s.wins).toEqual({ p0: 0, p1: 1, p3: 0 });
    expect(s.winner).toBeNull();
    expect(s.out).toEqual([]);
  });

  it('jogar de novo sem o vencedor anterior entre os ativos: começa um ativo sorteado e as moedas ficam normais', () => {
    const over: CoupState = { ...table(THREE), phase: 'over', turn: null, winner: 'p1', wins: { p0: 0, p1: 1 } };
    const active = ['p0', 'p2', 'p3'];
    const firsts = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const s = act(over, 'p0', { type: 'restart' }, ctxOf(active, { seed }));
      expect(s.players).toEqual(active);
      expect(active).toContain(s.turn);
      for (const p of active) expect(s.hands[p]!.coins).toBe(2);
      expect(s.wins).toEqual({ p0: 0, p1: 1, p2: 0, p3: 0 });
      firsts.add(s.turn!);
    }
    expect(firsts.size).toBeGreaterThan(1);
  });

  it('jogar de novo: o contador de janelas não zera (reação atrasada da partida anterior não casa)', () => {
    const last = act(table(THREE), 'p0', { type: 'act', kind: 'tax' }, ctx3).window!.id;
    const over: CoupState = { ...table(THREE), phase: 'over', turn: null, winner: 'p1', wins: { p0: 0, p1: 1 }, windowSeq: last };
    const s = act(over, 'p0', { type: 'restart' }, ctx3);
    expect(s.windowSeq).toBe(last);
    expect(act(s, s.turn!, { type: 'act', kind: 'tax' }, ctx3).window!.id).toBeGreaterThan(last);
  });
});

describe('Cúpi: ações sem reação', () => {
  it('renda: +1 e a vez passa', () => {
    const s = act(table(THREE), 'p0', { type: 'act', kind: 'income' }, ctx3);
    expect(s.hands.p0!.coins).toBe(3);
    expect(s.phase).toBe('turn');
    expect(s.turn).toBe('p1');
    expect(s.declared).toBeNull();
    expect(s.log).toEqual([
      { t: 'act', actor: 'p0', kind: 'income', target: null },
      { t: 'resolved', actor: 'p0', kind: 'income', target: null, amount: 1 },
    ]);
  });

  it('golpe: paga 7, o alvo escolhe a carta que perde e a vez passa', () => {
    let s = act(table(THREE, { coins: { p0: 7 } }), 'p0', { type: 'act', kind: 'coup', target: 'p1' }, ctx3);
    expect(s.hands.p0!.coins).toBe(0);
    expect(s.phase).toBe('losing');
    expect(s.loss).toEqual({ player: 'p1', reason: 'coup', then: 'next' });
    s = act(s, 'p1', { type: 'lose', card: 'assassin' }, ctx3);
    expect(s.hands.p1!.cards).toEqual([
      { character: 'contessa', revealed: false },
      { character: 'assassin', revealed: true },
    ]);
    expect(s.phase).toBe('turn');
    expect(s.turn).toBe('p1');
    expect(s.loss).toBeNull();
  });

  it('perder carta: só quem está perdendo, e só carta que tem virada pra baixo', () => {
    const s = act(table(THREE, { coins: { p0: 7 } }), 'p0', { type: 'act', kind: 'coup', target: 'p1' }, ctx3);
    expect(tryAct(s, 'p2', { type: 'lose', card: 'duke' }, ctx3)).toEqual({ ok: false, error: 'not_losing' });
    expect(tryAct(s, 'p1', { type: 'lose', card: 'duke' }, ctx3)).toEqual({ ok: false, error: 'not_owner' });
    expect(tryAct(table(THREE), 'p0', { type: 'lose', card: 'duke' }, ctx3)).toEqual({ ok: false, error: 'not_losing' });
  });

  it('golpe na última carta: perde direto, sai sem moedas; sobrando um, ele vence', () => {
    const ctx = ctxOf(ids(2));
    const start = withLost(table({ p0: ['duke', 'captain'], p1: ['contessa', 'assassin'] }, { coins: { p0: 7, p1: 4 } }), 'p1', 0);
    const s = act(start, 'p0', { type: 'act', kind: 'coup', target: 'p1' }, ctx);
    expect(s.phase).toBe('over');
    expect(s.winner).toBe('p0');
    expect(s.turn).toBeNull();
    expect(s.out).toEqual(['p1']);
    expect(s.hands.p1!.coins).toBe(0);
    expect(s.wins).toEqual({ p0: 1, p1: 0 });
    expect(s.log.slice(-3)).toEqual([
      { t: 'lose', player: 'p1', card: 'assassin' },
      { t: 'out', player: 'p1' },
      { t: 'win', player: 'p0' },
    ]);
  });

  it('a vez pula quem saiu', () => {
    const start = withLost(withLost(table(THREE), 'p1', 0), 'p1', 1);
    expect(act(start, 'p0', { type: 'act', kind: 'income' }, ctx3).turn).toBe('p2');
  });

  it('ações recusadas', () => {
    const s = table(THREE);
    expect(tryAct(s, 'p1', { type: 'act', kind: 'income' }, ctx3)).toEqual({ ok: false, error: 'not_your_turn' });
    expect(tryAct(s, 'p9', { type: 'act', kind: 'income' }, ctx3)).toEqual({ ok: false, error: 'not_player' });
    expect(tryAct(s, 'p0', { type: 'act', kind: 'coup', target: 'p1' }, ctx3)).toEqual({ ok: false, error: 'not_enough_coins' });
    expect(tryAct(s, 'p0', { type: 'act', kind: 'steal' }, ctx3)).toEqual({ ok: false, error: 'bad_target' });
    expect(tryAct(s, 'p0', { type: 'act', kind: 'income', target: 'p1' }, ctx3)).toEqual({ ok: false, error: 'bad_target' });
    const rich = table(THREE, { coins: { p0: 10 } });
    expect(tryAct(rich, 'p0', { type: 'act', kind: 'income' }, ctx3)).toEqual({ ok: false, error: 'must_coup' });
    const waiting = act(s, 'p0', { type: 'act', kind: 'tax' }, ctx3);
    expect(tryAct(waiting, 'p0', { type: 'act', kind: 'income' }, ctx3)).toEqual({ ok: false, error: 'bad_phase' });
  });
});

describe('Cúpi: janela de reação', () => {
  it('taxar abre 10 s pros outros vivos; todos deixam e o +3 vem na hora', () => {
    let s = act(table(THREE), 'p0', { type: 'act', kind: 'tax' }, ctx3);
    expect(s.phase).toBe('reaction');
    expect(s.declared).toEqual({ actor: 'p0', kind: 'tax', target: null });
    expect(s.window).toEqual({ id: 1, kind: 'action', eligible: ['p1', 'p2'], passed: [], endsAt: T0 + COUP_WINDOW_MS });
    s = act(s, 'p1', { type: 'pass' }, ctx3);
    expect(s.window!.passed).toEqual(['p1']);
    expect(tryAct(s, 'p1', { type: 'pass' }, ctx3)).toEqual({ ok: false, error: 'already_passed' });
    expect(tryAct(s, 'p0', { type: 'pass' }, ctx3)).toEqual({ ok: false, error: 'cannot_react' });
    expect(tryAct(s, 'p9', { type: 'pass' }, ctx3)).toEqual({ ok: false, error: 'not_player' });
    s = act(s, 'p2', { type: 'pass' }, ctx3);
    expect(s.hands.p0!.coins).toBe(5);
    expect(s.phase).toBe('turn');
    expect(s.turn).toBe('p1');
    expect(s.window).toBeNull();
    expect(tryAct(s, 'p1', { type: 'pass' }, ctx3)).toEqual({ ok: false, error: 'window_closed' });
  });

  it('no prazo a ação passa; antes dele nada muda (mesmo objeto)', () => {
    const s = act(table(THREE), 'p0', { type: 'act', kind: 'tax' }, ctx3);
    expect(settleCoup(s, ctxOf(ids(3), { now: T0 + COUP_WINDOW_MS - 1 }))).toBe(s);
    const done = settleCoup(s, ctxOf(ids(3), { now: T0 + COUP_WINDOW_MS }));
    expect(done.phase).toBe('turn');
    expect(done.hands.p0!.coins).toBe(5);
  });

  it('ajuda externa: a janela é de quem pode bloquear (todos os outros); ninguém bloqueia, +2', () => {
    let s = act(table(THREE), 'p0', { type: 'act', kind: 'foreignAid' }, ctx3);
    expect(s.window!.eligible).toEqual(['p1', 'p2']);
    s = allPass(s, ctx3);
    expect(s.hands.p0!.coins).toBe(4);
  });

  it('extorquir tira 2 do alvo, ou o que ele tiver', () => {
    const steal = (coins: number) =>
      allPass(act(table(THREE, { coins: { p1: coins } }), 'p0', { type: 'act', kind: 'steal', target: 'p1' }, ctx3), ctx3);
    expect(steal(5).hands.p0!.coins).toBe(4);
    expect(steal(5).hands.p1!.coins).toBe(3);
    expect(steal(1).hands.p0!.coins).toBe(3);
    expect(steal(0).hands.p0!.coins).toBe(2);
    expect(steal(0).log.at(-1)).toEqual({ t: 'resolved', actor: 'p0', kind: 'steal', target: 'p1', amount: 0 });
  });

  it('assassinar: paga 3 na declaração; deixado, o alvo perde uma carta', () => {
    let s = act(table(THREE, { coins: { p0: 3 } }), 'p0', { type: 'act', kind: 'assassinate', target: 'p1' }, ctx3);
    expect(s.hands.p0!.coins).toBe(0);
    s = allPass(s, ctx3);
    expect(s.loss).toEqual({ player: 'p1', reason: 'assassinated', then: 'next' });
  });

  it('trocar: compra 2, fica com 2 das 4 e devolve o resto ao baralho', () => {
    const ctx = ctxOf(ids(2));
    const start = table({ p0: ['duke', 'captain'], p1: ['contessa', 'assassin'] });
    let s = allPass(act(start, 'p0', { type: 'act', kind: 'exchange' }, ctx), ctx);
    expect(s.phase).toBe('exchange');
    expect(s.drawn).toEqual(['duke', 'duke']);
    expect(s.deck).toHaveLength(9);
    expect(tryAct(s, 'p0', { type: 'exchange', keep: ['duke'] }, ctx)).toEqual({ ok: false, error: 'bad_exchange' });
    expect(tryAct(s, 'p0', { type: 'exchange', keep: ['contessa', 'duke'] }, ctx)).toEqual({ ok: false, error: 'bad_exchange' });
    expect(tryAct(s, 'p1', { type: 'exchange', keep: ['contessa', 'assassin'] }, ctx)).toEqual({ ok: false, error: 'not_your_turn' });
    s = act(s, 'p0', { type: 'exchange', keep: ['duke', 'duke'] }, ctx);
    expect(hiddenOf(s, 'p0')).toEqual(['duke', 'duke']);
    expect(s.drawn).toEqual([]);
    expect(s.deck).toHaveLength(11);
    expect(s.turn).toBe('p1');
    expect(cardsOf(s)).toEqual(cardsOf(start));
  });

  it('trocar com uma carta viva: fica com 1 das 3; a perdida continua à vista', () => {
    const ctx = ctxOf(ids(2));
    const start = withLost(table({ p0: ['duke', 'captain'], p1: ['contessa', 'assassin'] }), 'p0', 0);
    let s = allPass(act(start, 'p0', { type: 'act', kind: 'exchange' }, ctx), ctx);
    expect(tryAct(s, 'p0', { type: 'exchange', keep: ['duke', 'captain'] }, ctx)).toEqual({ ok: false, error: 'bad_exchange' });
    s = act(s, 'p0', { type: 'exchange', keep: ['duke'] }, ctx);
    expect(s.hands.p0!.cards).toEqual([
      { character: 'duke', revealed: true },
      { character: 'duke', revealed: false },
    ]);
    expect(cardsOf(s)).toEqual(cardsOf(start));
  });

  it('tesouro quase vazio: ganha só o que tem', () => {
    const s = allPass(act(table(THREE, { coins: { p1: 24, p2: 23 } }), 'p0', { type: 'act', kind: 'tax' }, ctx3), ctx3);
    expect(s.hands.p0!.coins).toBe(3);
  });
});
