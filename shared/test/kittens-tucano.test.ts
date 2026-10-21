import { describe, expect, it } from 'vitest';
import { settleKittens } from '../src/games/kittens/settle';
import type { KittensAction, KittensEvent, KittensState } from '../src/games/kittens/types';
import { kittensViewFor } from '../src/games/kittens/view';
import { T0, act, ctxOf, refuse, table } from './kittens-helpers';

/**
 * Tucano (pedido do Rafa, 2026-10-21): "par: você pula sua vez quando manda ele, não compra e nem joga, e escolhe outro
 * jogador pra pular; ele também não joga nada nem compra, o turno dele é pulado."
 */
const P4 = ['p0', 'p1', 'p2', 'p3'];
const ctx = ctxOf(P4);
const at = (ms: number) => ctxOf(P4, { now: T0 + ms });
/** Monte: o topo é o FIM do array. */
const DRAW = ['cafune-9', 'embaralhar-9', 'pular-9', 'espiar-9'];

const mesa = (opts: { hands?: Record<string, string[]>; owed?: number; current?: string; skips?: Record<string, number> } = {}): KittensState => ({
  ...table({
    hands: opts.hands ?? { p0: ['tucano-0', 'tucano-1', 'boto-0', 'boto-1'], p1: ['pular-1'], p2: [], p3: ['espiar-3'] },
    draw: DRAW,
    owed: opts.owed,
    current: opts.current,
  }),
  skips: opts.skips ?? {},
});
const tucano = (target?: string, cards = ['tucano-0', 'tucano-1']): KittensAction => ({ type: 'play', cards, ...(target ? { target } : {}) });

/** `by` joga e a janela de 5 s passa sem Nem vem!. */
function resolved(s: KittensState, action: KittensAction, by = s.current!): KittensState {
  return settleKittens(act(s, by, action, ctx), at(5000));
}
const events = (s: KittensState, from: number): KittensEvent[] => s.log.filter((e) => e.n >= from).map((e) => e.ev);
const skippedIn = (s: KittensState, from: number) => events(s, from).flatMap((ev) => (ev.t === 'skipped' ? [ev.who] : []));

describe('par de Tucano: o alvo', () => {
  it('precisa de um adversário vivo (até sem carta na mão)', () => {
    const s = mesa();
    expect(refuse(s, 'p0', tucano(), ctx)).toBe('bad_target');
    expect(refuse(s, 'p0', tucano('p0'), ctx)).toBe('bad_target');
    expect(refuse(s, 'p0', tucano('p9'), ctx)).toBe('bad_target');
    expect(refuse({ ...s, alive: ['p0', 'p1', 'p3'] }, 'p0', tucano('p2'), ctx)).toBe('bad_target');
    // p2 não tem carta: vale mesmo assim.
    expect(act(s, 'p0', tucano('p2'), ctx).pending!.play).toEqual({
      kind: 'par',
      cards: ['tucano-0', 'tucano-1'],
      target: 'p2',
      ask: null,
      as: 'tucano',
    });
  });

  it('Boto faz as vezes do Tucano, e dois Botos podem virar Tucano (os dois pedem alvo)', () => {
    const s = mesa();
    expect(act(s, 'p0', tucano('p1', ['boto-0', 'tucano-0']), ctx).pending!.play).toMatchObject({ kind: 'par', as: 'tucano', target: 'p1' });
    expect(refuse(s, 'p0', { type: 'play', cards: ['boto-0', 'boto-1'], as: 'tucano' }, ctx)).toBe('bad_target');
    const botos = act(s, 'p0', { type: 'play', cards: ['boto-0', 'boto-1'], as: 'tucano', target: 'p3' }, ctx);
    expect(botos.pending!.play).toMatchObject({ kind: 'par', as: 'tucano', target: 'p3' });
  });

  it('o diário mostra a jogada com o alvo (público)', () => {
    const s = act(mesa(), 'p0', tucano('p2'), ctx);
    expect(s.log.at(-1)!.ev).toEqual({ t: 'play', by: 'p0', play: 'par', target: 'p2', ask: null, as: 'tucano' });
  });
});

describe('par de Tucano: o efeito', () => {
  it('quem jogou acaba a vez sem comprar e a próxima vez do alvo é pulada', () => {
    const before = mesa();
    const s = resolved(before, tucano('p2'));
    expect(s.draw).toEqual(DRAW);
    expect(s.hands.p0).toEqual(['boto-0', 'boto-1']);
    expect(s.discard).toEqual(['tucano-0', 'tucano-1']);
    expect(s).toMatchObject({ current: 'p1', owed: 1, skips: { p2: 1 } });
    expect(events(s, before.seq).filter((ev) => ev.t === 'tucano')).toEqual([{ t: 'tucano', by: 'p0', target: 'p2' }]);
    // A vez de p1 acaba: a de p2 é pulada e vai pra p3.
    const next = act(s, 'p1', { type: 'draw' }, at(6000));
    expect(next).toMatchObject({ current: 'p3', owed: 1, skips: {} });
    expect(skippedIn(next, s.seq)).toEqual(['p2']);
    expect(next.hands.p2).toEqual([]);
  });

  it('alvo logo depois de quem jogou: perde a vez na hora', () => {
    const s = resolved(mesa(), tucano('p1'));
    expect(s).toMatchObject({ current: 'p2', owed: 1, skips: {} });
    expect(skippedIn(s, 0)).toEqual(['p1']);
  });

  it('sob ataque, quem joga gasta só um dos turnos devidos (como o Pular)', () => {
    const s = resolved(mesa({ owed: 2 }), tucano('p1'));
    expect(s).toMatchObject({ current: 'p0', owed: 1, skips: { p1: 1 } });
    // Acabou o outro turno: a vez de p1 é pulada.
    expect(act(s, 'p0', { type: 'draw' }, at(6000))).toMatchObject({ current: 'p2', skips: {} });
  });

  it('alvo devendo 2 turnos (Ataque): a pulada gasta um deles e ele joga o outro', () => {
    const s = resolved(mesa({ hands: { p0: ['tucano-0', 'tucano-1', 'ataque-0'], p1: [], p2: [], p3: [] } }), tucano('p2'));
    expect(s).toMatchObject({ current: 'p1', skips: { p2: 1 } });
    // p1 ataca: p2 deve 2, a pulada gasta um.
    const attacked = resolved({ ...s, hands: { ...s.hands, p1: ['ataque-1'] } }, { type: 'play', cards: ['ataque-1'] }, 'p1');
    expect(attacked).toMatchObject({ current: 'p2', owed: 1, skips: {} });
    expect(skippedIn(attacked, s.seq)).toEqual(['p2']);
  });

  it('acumula: duas vezes no mesmo alvo pula duas vezes dele', () => {
    const s = resolved(mesa({ current: 'p0', skips: { p2: 1 } }), tucano('p2'));
    expect(s.skips).toEqual({ p2: 2 });
    // Primeira vez de p2: pulada (sobra uma).
    const one = act(s, 'p1', { type: 'draw' }, at(6000));
    expect(one).toMatchObject({ current: 'p3', skips: { p2: 1 } });
    // Volta toda: p3, p0 e p1 compram; a segunda vez de p2 também é pulada.
    let t = act(one, 'p3', { type: 'draw' }, at(6000));
    t = act(t, 'p0', { type: 'draw' }, at(6000));
    const before = t.seq;
    t = act(t, 'p1', { type: 'draw' }, at(6000));
    expect(t).toMatchObject({ current: 'p3', skips: {} });
    expect(skippedIn(t, before)).toEqual(['p2']);
  });

  it('duas puladas devendo 2 turnos: as duas se gastam e a vez segue', () => {
    const s = { ...mesa({ hands: { p0: ['ataque-0'], p1: [], p2: [], p3: [] } }), skips: { p1: 2 } };
    const attacked = resolved(s, { type: 'play', cards: ['ataque-0'] });
    expect(attacked).toMatchObject({ current: 'p2', owed: 1, skips: {} });
    expect(skippedIn(attacked, s.seq)).toEqual(['p1', 'p1']);
  });

  it('puladas em cadeia: vários seguidos perdem a vez', () => {
    const s = resolved(mesa({ skips: { p2: 1 } }), tucano('p1'));
    expect(s).toMatchObject({ current: 'p3', owed: 1, skips: {} });
    expect(skippedIn(s, 0)).toEqual(['p1', 'p2']);
  });

  it('todos os outros com vez pulada: as puladas se gastam na ordem e a vez volta pra quem jogou', () => {
    const s = resolved(mesa({ skips: { p2: 1, p3: 1 } }), tucano('p1'));
    expect(s).toMatchObject({ current: 'p0', owed: 1, skips: {} });
    expect(skippedIn(s, 0)).toEqual(['p1', 'p2', 'p3']);
    // Com 2 jogadores, o mesmo: a vez volta.
    const two: KittensState = { ...table({ hands: { p0: ['tucano-0', 'tucano-1'], p1: [] }, draw: DRAW }), skips: {} };
    const back = settleKittens(act(two, 'p0', tucano('p1'), ctxOf(['p0', 'p1'])), ctxOf(['p0', 'p1'], { now: T0 + 5000 }));
    expect(back).toMatchObject({ current: 'p0', owed: 1, skips: {} });
  });

  it('Nem vem! cancela: ninguém é pulado e quem jogou continua na vez', () => {
    const s = mesa({ hands: { p0: ['tucano-0', 'tucano-1'], p1: ['nemvem-1'], p2: [], p3: [] } });
    const air = act(s, 'p0', tucano('p2'), ctx);
    const noped = settleKittens(act(air, 'p1', { type: 'nope' }, at(1000)), at(6000));
    expect(noped).toMatchObject({ current: 'p0', owed: 1, skips: {} });
    expect(noped.stats.p1).toEqual({ nopes: 1, defuses: 0 });
  });

  it('o alvo saiu antes de resolver: a jogada não vale', () => {
    const air = act(mesa(), 'p0', tucano('p2'), ctx);
    const gone = settleKittens(air, ctxOf(['p0', 'p1', 'p3'], { now: T0 + 5000 }));
    expect(gone.alive).toEqual(['p0', 'p1', 'p3']);
    expect(gone).toMatchObject({ current: 'p0', skips: {} });
    expect(gone.log.some((e) => e.ev.t === 'resolved' && e.ev.canceled)).toBe(true);
  });

  it('quem tinha vez pulada e sai perde as puladas (e não conta nada no histórico)', () => {
    const s = resolved(mesa(), tucano('p2'));
    const left = settleKittens(s, ctxOf(['p0', 'p1', 'p3'], { now: T0 + 6000 }));
    expect(left.skips).toEqual({});
    expect(left.exits).toEqual([{ player: 'p2', how: 'left' }]);
    // A vez de p1 acaba e vai direto pra p3.
    expect(act(left, 'p1', { type: 'draw' }, ctxOf(['p0', 'p1', 'p3'], { now: T0 + 7000 }))).toMatchObject({ current: 'p3' });
    expect(Object.values(s.stats).every((x) => x.nopes === 0 && x.defuses === 0)).toBe(true);
  });

  it('a visão mostra as puladas de todos (público)', () => {
    const s = resolved(mesa(), tucano('p2'));
    for (const viewer of ['p0', 'p2', null]) expect(kittensViewFor(s, viewer).skips).toEqual({ p2: 1 });
  });

  it('nos 5 diferentes conta como Tucano e o par de Preguiça pode pedir Tucano', () => {
    const cinco = mesa({ hands: { p0: ['tucano-0', 'mico-0', 'quati-0', 'tamandua-0', 'boto-0'], p1: [], p2: [], p3: [] } });
    expect(act(cinco, 'p0', { type: 'play', cards: ['tucano-0', 'mico-0', 'quati-0', 'tamandua-0', 'boto-0'] }, ctx).pending!.play.kind).toBe('cinco');
    const preguica = mesa({ hands: { p0: ['preguica-0', 'preguica-1'], p1: [], p2: ['tucano-5'], p3: [] } });
    const called = resolved(preguica, { type: 'play', cards: ['preguica-0', 'preguica-1'], ask: 'tucano' });
    expect(called.hands.p0).toEqual(['tucano-5']);
  });
});
