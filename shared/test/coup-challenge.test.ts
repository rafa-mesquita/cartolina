import { describe, expect, it } from 'vitest';
import { settleCoup } from '../src/games/coup/rules';
import { hiddenOf } from '../src/games/coup/table';
import { COUP_WINDOW_MS } from '../src/games/coup/types';
import { T0, THREE, act, allPass, cardsOf, ctxOf, ids, table, tryAct } from './coup-helpers';

const ctx = ctxOf(ids(3));

describe('Cúpi: dúvida da ação', () => {
  it('quem tinha a carta mostra, troca por outra do baralho, e quem duvidou perde; depois a ação acontece', () => {
    const start = table(THREE);
    let s = act(act(start, 'p0', { type: 'act', kind: 'tax' }, ctx), 'p1', { type: 'challenge' }, ctx);
    expect(s.log.at(-1)).toEqual({ t: 'challenge', by: 'p1', of: 'p0', claim: 'duke', had: true });
    expect(s.phase).toBe('losing');
    expect(s.loss).toEqual({ player: 'p1', reason: 'challengeWrong', then: 'proceed' });
    expect(hiddenOf(s, 'p0')).toHaveLength(2);
    expect(cardsOf(s)).toEqual(cardsOf(start));
    expect(tryAct(s, 'p2', { type: 'challenge' }, ctx)).toEqual({ ok: false, error: 'window_closed' });
    s = act(s, 'p1', { type: 'lose', card: 'contessa' }, ctx);
    expect(s.hands.p0!.coins).toBe(5);
    expect(s.turn).toBe('p1');
  });

  it('quem blefou perde uma carta e a ação não acontece', () => {
    let s = act(table(THREE, { turn: 'p1' }), 'p1', { type: 'act', kind: 'tax' }, ctx);
    s = act(s, 'p2', { type: 'challenge' }, ctx);
    expect(s.log.at(-1)).toEqual({ t: 'challenge', by: 'p2', of: 'p1', claim: 'duke', had: false });
    expect(s.loss).toEqual({ player: 'p1', reason: 'caught', then: 'next' });
    s = act(s, 'p1', { type: 'lose', card: 'assassin' }, ctx);
    expect(s.hands.p1!.coins).toBe(2);
    expect(s.turn).toBe('p2');
  });

  it('dúvida ou bloqueio depois do prazo não vale (a janela já fechou)', () => {
    const s = act(table(THREE), 'p0', { type: 'act', kind: 'steal', target: 'p1' }, ctx);
    const late = ctxOf(ids(3), { now: T0 + COUP_WINDOW_MS });
    expect(tryAct(s, 'p2', { type: 'challenge' }, late)).toEqual({ ok: false, error: 'window_closed' });
    expect(tryAct(s, 'p1', { type: 'block', as: 'captain' }, late)).toEqual({ ok: false, error: 'window_closed' });
    expect(tryAct(s, 'p1', { type: 'pass' }, late)).toEqual({ ok: false, error: 'window_closed' });
  });

  it('ajuda externa não tem o que duvidar', () => {
    const s = act(table(THREE), 'p0', { type: 'act', kind: 'foreignAid' }, ctx);
    expect(tryAct(s, 'p1', { type: 'challenge' }, ctx)).toEqual({ ok: false, error: 'cannot_react' });
  });

  it('Assassino pego blefando recebe as 3 moedas de volta', () => {
    let s = act(table(THREE, { coins: { p0: 3 } }), 'p0', { type: 'act', kind: 'assassinate', target: 'p1' }, ctx);
    s = act(s, 'p2', { type: 'challenge' }, ctx);
    expect(s.hands.p0!.coins).toBe(3);
    s = act(s, 'p0', { type: 'lose', card: 'captain' }, ctx);
    expect(hiddenOf(s, 'p1')).toHaveLength(2);
    expect(s.turn).toBe('p1');
  });

  it('o alvo duvida do Assassino e erra: perde uma, ganha a janela só de bloqueio e, deixando, perde a outra', () => {
    const start = table({ p0: ['assassin', 'captain'], p1: ['contessa', 'duke'], p2: ['ambassador', 'duke'] }, { coins: { p0: 3 } });
    let s = act(start, 'p0', { type: 'act', kind: 'assassinate', target: 'p1' }, ctx);
    s = act(s, 'p1', { type: 'challenge' }, ctx);
    s = act(s, 'p1', { type: 'lose', card: 'duke' }, ctx);
    expect(s.phase).toBe('reaction');
    expect(s.window).toEqual({ id: 2, kind: 'blockOnly', eligible: ['p1'], passed: [], endsAt: T0 + COUP_WINDOW_MS });
    expect(tryAct(s, 'p1', { type: 'challenge' }, ctx)).toEqual({ ok: false, error: 'cannot_react' });
    s = act(s, 'p1', { type: 'pass' }, ctx);
    expect(s.out).toEqual(['p1']);
    expect(s.turn).toBe('p2');
  });

  it('na janela só de bloqueio o alvo pode bloquear com a Condessa', () => {
    const start = table({ p0: ['assassin', 'captain'], p1: ['contessa', 'duke'], p2: ['ambassador', 'duke'] }, { coins: { p0: 3 } });
    let s = act(start, 'p0', { type: 'act', kind: 'assassinate', target: 'p1' }, ctx);
    s = act(act(s, 'p2', { type: 'challenge' }, ctx), 'p2', { type: 'lose', card: 'duke' }, ctx);
    expect(s.window!.kind).toBe('blockOnly');
    s = act(s, 'p1', { type: 'block', as: 'contessa' }, ctx);
    expect(s.window).toMatchObject({ kind: 'block', eligible: ['p0', 'p2'] });
  });
});

describe('Cúpi: bloqueio', () => {
  it('extorsão: só o alvo bloqueia, e só como Capitão ou Embaixador', () => {
    const s = act(table(THREE), 'p0', { type: 'act', kind: 'steal', target: 'p1' }, ctx);
    expect(tryAct(s, 'p2', { type: 'block', as: 'captain' }, ctx)).toEqual({ ok: false, error: 'cannot_react' });
    expect(tryAct(s, 'p1', { type: 'block', as: 'duke' }, ctx)).toEqual({ ok: false, error: 'bad_block' });
    const b = act(s, 'p1', { type: 'block', as: 'ambassador' }, ctx);
    expect(b.block).toEqual({ by: 'p1', as: 'ambassador' });
    expect(b.log.at(-1)).toEqual({ t: 'block', by: 'p1', as: 'ambassador' });
    expect(b.window).toEqual({ id: 2, kind: 'block', eligible: ['p0', 'p2'], passed: [], endsAt: T0 + COUP_WINDOW_MS });
    expect(tryAct(b, 'p1', { type: 'challenge' }, ctx)).toEqual({ ok: false, error: 'cannot_react' });
    expect(tryAct(b, 'p0', { type: 'block', as: 'captain' }, ctx)).toEqual({ ok: false, error: 'cannot_react' });
  });

  it('ajuda externa: qualquer um bloqueia como Duque; ninguém duvida, a ação é bloqueada', () => {
    let s = act(act(table(THREE), 'p0', { type: 'act', kind: 'foreignAid' }, ctx), 'p2', { type: 'block', as: 'duke' }, ctx);
    s = allPass(s, ctx);
    expect(s.hands.p0!.coins).toBe(2);
    expect(s.log.at(-1)).toEqual({ t: 'blocked', actor: 'p0', kind: 'foreignAid', by: 'p2', as: 'duke' });
    expect(s.turn).toBe('p1');
  });

  it('Assassino bloqueado pela Condessa: as 3 moedas ficam perdidas', () => {
    let s = act(table(THREE, { coins: { p0: 3 } }), 'p0', { type: 'act', kind: 'assassinate', target: 'p1' }, ctx);
    s = allPass(act(s, 'p1', { type: 'block', as: 'contessa' }, ctx), ctx);
    expect(s.hands.p0!.coins).toBe(0);
    expect(hiddenOf(s, 'p1')).toHaveLength(2);
  });

  it('reação atrasada, de uma janela que já fechou, não vale na janela nova', () => {
    let s = act(table(THREE), 'p0', { type: 'act', kind: 'steal', target: 'p1' }, ctx);
    const first = s.window!.id;
    s = act(s, 'p1', { type: 'block', as: 'captain' }, ctx);
    expect(s.window!.id).toBe(first + 1);
    expect(tryAct(s, 'p2', { type: 'challenge', window: first }, ctx)).toEqual({ ok: false, error: 'window_closed' });
    expect(tryAct(s, 'p2', { type: 'pass', window: first }, ctx)).toEqual({ ok: false, error: 'window_closed' });
    expect(act(s, 'p2', { type: 'pass', window: s.window!.id }, ctx).window!.passed).toEqual(['p2']);
  });

  it('bloqueio vale quando o prazo acaba', () => {
    const s = act(act(table(THREE), 'p0', { type: 'act', kind: 'steal', target: 'p1' }, ctx), 'p1', { type: 'block', as: 'captain' }, ctx);
    const done = settleCoup(s, ctxOf(ids(3), { now: T0 + COUP_WINDOW_MS }));
    expect(done.log.at(-1)).toMatchObject({ t: 'blocked' });
    expect(done.hands.p1!.coins).toBe(2);
  });
});

describe('Cúpi: dúvida do bloqueio', () => {
  it('quem bloqueou tinha a carta: quem duvidou perde e a ação fica bloqueada', () => {
    const start = table({ p0: ['duke', 'captain'], p1: ['captain', 'contessa'], p2: ['ambassador', 'duke'] });
    let s = act(act(start, 'p0', { type: 'act', kind: 'steal', target: 'p1' }, ctx), 'p1', { type: 'block', as: 'captain' }, ctx);
    s = act(s, 'p0', { type: 'challenge' }, ctx);
    expect(s.log.at(-1)).toEqual({ t: 'challenge', by: 'p0', of: 'p1', claim: 'captain', had: true });
    expect(s.loss).toEqual({ player: 'p0', reason: 'challengeWrong', then: 'blocked' });
    expect(cardsOf(s)).toEqual(cardsOf(start));
    s = act(s, 'p0', { type: 'lose', card: 'duke' }, ctx);
    expect(s.log.at(-1)).toMatchObject({ t: 'blocked', by: 'p1', as: 'captain' });
    expect(s.hands.p1!.coins).toBe(2);
    expect(s.turn).toBe('p1');
  });

  it('quem bloqueou blefou: perde uma carta e a ação acontece', () => {
    let s = act(act(table(THREE), 'p0', { type: 'act', kind: 'steal', target: 'p1' }, ctx), 'p1', { type: 'block', as: 'ambassador' }, ctx);
    s = act(s, 'p2', { type: 'challenge' }, ctx);
    expect(s.loss).toEqual({ player: 'p1', reason: 'caught', then: 'resolve' });
    s = act(s, 'p1', { type: 'lose', card: 'assassin' }, ctx);
    expect(s.hands.p0!.coins).toBe(4);
    expect(s.hands.p1!.coins).toBe(0);
    expect(s.turn).toBe('p1');
  });
});
