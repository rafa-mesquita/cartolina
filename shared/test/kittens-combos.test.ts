import { describe, expect, it } from 'vitest';
import { settleKittens } from '../src/games/kittens/settle';
import { KITTENS_CHOICE_MS, KITTENS_UNSTOPPABLE_MS, type KittensAction, type KittensState } from '../src/games/kittens/types';
import { kittensViewFor } from '../src/games/kittens/view';
import { T0, act, ctxOf, ids, refuse, table } from './kittens-helpers';

const ctx = ctxOf(ids(3));
const at = (ms: number) => ctxOf(ids(3), { now: T0 + ms });
const hands = () => ({
  p0: ['favor-0', 'capivara-0', 'capivara-1', 'capivara-2', 'mico-0', 'quati-0', 'tamandua-0', 'preguica-0'],
  p1: ['ataque-5', 'pular-5'],
  p2: ['espiar-5'],
});

/** p0 joga `action` e a janela de 5 s passa sem Nem vem!. */
function resolved(action: KittensAction, discard: string[] = []) {
  const s = act(table({ hands: hands(), discard, draw: ['pular-9', 'mico-9'] }), 'p0', action, ctx);
  return settleKittens(s, at(5000));
}

describe('Favor', () => {
  const favor: KittensAction = { type: 'play', cards: ['favor-0'], target: 'p1' };

  it('o alvo escolhe o que dar; só os dois veem qual carta', () => {
    const s = resolved(favor);
    expect(s.choice).toEqual({ kind: 'favor', who: 'p1', to: 'p0', left: 1, deadline: T0 + 5000 + KITTENS_CHOICE_MS });
    expect(refuse(s, 'p0', { type: 'draw' }, at(5000))).toBe('waiting_choice');
    expect(refuse(s, 'p0', { type: 'choose', card: 'ataque-5' }, at(5000))).toBe('not_your_choice');
    expect(refuse(s, 'p1', { type: 'choose', card: 'mico-0' }, at(5000))).toBe('bad_choice');
    expect(refuse(s, 'p1', { type: 'choose' }, at(5000))).toBe('bad_choice');
    const given = act(s, 'p1', { type: 'choose', card: 'pular-5' }, at(5000));
    expect(given.hands.p1).toEqual(['ataque-5']);
    expect(given.hands.p0).toContain('pular-5');
    expect(given).toMatchObject({ choice: null, current: 'p0', owed: 1 });
    expect(given.log.at(-1)).toMatchObject({ ev: { t: 'gave', from: 'p1', to: 'p0', card: 'pular-5' }, seenBy: ['p1', 'p0'] });
  });

  it('sem resposta, no fim do prazo vai uma carta ao acaso', () => {
    const late = settleKittens(resolved(favor), at(5000 + KITTENS_CHOICE_MS));
    expect(late.choice).toBeNull();
    expect(late.hands.p1).toHaveLength(1);
    expect(late.hands.p0).toHaveLength(8);
  });
});

describe('trio de Favor: tira 3 cartas do escolhido, uma ao acaso (pedidos do Rafa, 2026-10-20 e 2026-10-28)', () => {
  const FAVORES = ['favor-0', 'favor-1', 'favor-2'];
  const trioHands = () => ({
    p0: [...FAVORES, 'mico-0'],
    p1: ['ataque-5', 'pular-5', 'espiar-5', 'cafune-5'],
    p2: ['quati-5'],
  });
  const play = (target?: string): KittensAction => ({ type: 'play', cards: FAVORES, ...(target ? { target } : {}) });
  const air = (target: string) => act(table({ hands: trioHands(), draw: ['pular-9', 'mico-9'] }), 'p0', play(target), ctx);
  const gaves = (s: KittensState) => s.log.filter((e) => e.ev.t === 'gave');

  it('pede alvo: adversário vivo com carta na mão', () => {
    const s = table({ hands: { ...trioHands(), p2: [] }, draw: ['pular-9'] });
    expect(refuse(s, 'p0', play(), ctx)).toBe('bad_target');
    expect(refuse(s, 'p0', play('p0'), ctx)).toBe('bad_target');
    expect(refuse(s, 'p0', play('p2'), ctx)).toBe('bad_target'); // sem carta
    expect(refuse(s, 'p0', play('p9'), ctx)).toBe('bad_target');
    const ok = act(s, 'p0', play('p1'), ctx);
    expect(ok.pending!.play).toEqual({ kind: 'trio', cards: FAVORES, target: 'p1', ask: null, as: 'favor' });
    expect(ok.log.at(-1)!.ev).toEqual({ t: 'play', by: 'p0', play: 'trio', target: 'p1', ask: null, as: 'favor' });
  });

  it('uma sai ao acaso da mão do alvo e ele escolhe as outras 2, uma de cada vez; só os dois veem quais; não rouba Desarme', () => {
    const s = settleKittens(air('p1'), at(5000));
    expect(s.log.some((e) => e.ev.t === 'grabbed')).toBe(false);
    const [pulled] = gaves(s);
    expect(pulled).toMatchObject({ ev: { t: 'gave', from: 'p1', to: 'p0', random: true }, seenBy: ['p1', 'p0'] });
    const luck = (pulled!.ev as { card: string }).card;
    expect(trioHands().p1).toContain(luck);
    expect(s.hands.p1).toHaveLength(3);
    expect(s.hands.p1).not.toContain(luck);
    expect(s.hands.p0).toEqual(['mico-0', luck]);
    expect(s.choice).toEqual({ kind: 'favor', who: 'p1', to: 'p0', left: 2, deadline: T0 + 5000 + KITTENS_CHOICE_MS });
    expect(kittensViewFor(s, 'p2').log.find((e) => e.ev.t === 'gave')!.ev).toEqual({ t: 'gave', from: 'p1', to: 'p0', card: null, random: true });
    expect(refuse(s, 'p0', { type: 'choose', card: s.hands.p1![0]! }, at(5000))).toBe('not_your_choice');
    expect(refuse(s, 'p1', { type: 'choose', card: luck }, at(5000))).toBe('bad_choice'); // já saiu
    const [a, b, keep] = s.hands.p1!;
    const one = act(s, 'p1', { type: 'choose', card: a! }, at(6000));
    expect(one.choice).toEqual({ ...s.choice, left: 1 });
    const two = act(one, 'p1', { type: 'choose', card: b! }, at(7000));
    expect(two.choice).toBeNull();
    expect(two.hands.p1).toEqual([keep]);
    expect(two.hands.p0).toEqual(['mico-0', luck, a, b]);
    expect(two).toMatchObject({ current: 'p0', owed: 1 });
    expect(gaves(two).map((e) => [e.ev, e.seenBy])).toEqual([
      [{ t: 'gave', from: 'p1', to: 'p0', card: luck, random: true }, ['p1', 'p0']],
      [{ t: 'gave', from: 'p1', to: 'p0', card: a }, ['p1', 'p0']],
      [{ t: 'gave', from: 'p1', to: 'p0', card: b }, ['p1', 'p0']],
    ]);
  });

  it('não aceita Nem vem! (pedido do Rafa, 2026-10-28): fica no ar só o tempo de ver e resolve', () => {
    const s = act(table({ hands: { ...trioHands(), p2: ['nemvem-2'] }, draw: ['pular-9'] }), 'p0', play('p1'), ctx);
    expect(s.pending!.resolvesAt).toBe(T0 + KITTENS_UNSTOPPABLE_MS);
    expect(refuse(s, 'p2', { type: 'nope' }, at(500))).toBe('unstoppable');
    const done = settleKittens(s, at(KITTENS_UNSTOPPABLE_MS));
    expect(done.pending).toBeNull();
    expect(done.hands.p2).toEqual(['nemvem-2']);
    expect(done.hands.p1).toHaveLength(3);
    expect(done.choice).toMatchObject({ kind: 'favor', who: 'p1', left: 2 });
  });

  it('sem resposta, no fim do prazo as que faltam vão ao acaso', () => {
    const s = settleKittens(air('p1'), at(5000));
    const late = settleKittens(s, at(5000 + KITTENS_CHOICE_MS));
    expect(late.choice).toBeNull();
    expect(late.hands.p1).toHaveLength(1);
    expect(late.hands.p0).toHaveLength(4);
    expect(gaves(late)).toHaveLength(3);
    const half = act(s, 'p1', { type: 'choose', card: s.hands.p1![0]! }, at(6000));
    const rest = settleKittens(half, at(5000 + KITTENS_CHOICE_MS));
    expect(rest.choice).toBeNull();
    expect(rest.hands.p0).toContain(s.hands.p1![0]);
    expect(rest.hands.p1).toHaveLength(1);
    expect(gaves(rest)).toHaveLength(3);
  });

  it('alvo com menos de 3 cartas perde a mão toda (com 1 carta, ela sai ao acaso e não abre escolha)', () => {
    const s = settleKittens(air('p2'), at(5000));
    expect(s.choice).toBeNull();
    expect(s.hands.p2).toEqual([]);
    expect(s.hands.p0).toContain('quati-5');
    expect(gaves(s).map((e) => e.ev)).toEqual([{ t: 'gave', from: 'p2', to: 'p0', card: 'quati-5', random: true }]);
    const two = settleKittens(act(table({ hands: { ...trioHands(), p2: ['quati-5', 'mico-5'] }, draw: ['pular-9'] }), 'p0', play('p2'), ctx), at(5000));
    expect(two.choice).toMatchObject({ kind: 'favor', who: 'p2', left: 1 });
    const done = act(two, 'p2', { type: 'choose', card: two.hands.p2![0]! }, at(6000));
    expect(done.choice).toBeNull();
    expect(done.hands.p2).toEqual([]);
  });

  it('se o alvo sai, as que faltam vão ao acaso; se quem ia receber sai, a escolha some', () => {
    const s = settleKittens(air('p1'), at(5000));
    const one = act(s, 'p1', { type: 'choose', card: s.hands.p1![0]! }, at(6000));
    const gone = settleKittens(one, ctxOf(['p0', 'p2'], { now: T0 + 7000 }));
    expect(gone.choice).toBeNull();
    expect(gone.alive).toEqual(['p0', 'p2']);
    expect(gone.hands.p0).toHaveLength(4);
    const toGone = settleKittens(one, ctxOf(['p1', 'p2'], { now: T0 + 7000 }));
    expect(toGone.choice).toBeNull();
    expect(toGone.hands.p1).toHaveLength(2);
  });

  it('trio de outra carta continua roubando Desarme', () => {
    const s = table({ hands: { p0: ['pular-0', 'pular-1', 'pular-2'], p1: ['cafune-5'], p2: [] }, draw: ['mico-9'] });
    const done = settleKittens(act(s, 'p0', { type: 'play', cards: ['pular-0', 'pular-1', 'pular-2'], target: 'p1' }, ctx), at(5000));
    expect(done.pending).toBeNull();
    expect(done.choice).toBeNull();
    expect(done.hands.p0).toEqual(['cafune-5']);
    expect(done.log.at(-1)!.ev).toEqual({ t: 'grabbed', by: 'p0', from: 'p1', card: 'cafune-5' });
  });

  it('cego: fichas que viram 3 Favores sem alvo são bad_combo; com alvo, vale', () => {
    const s = table({ hands: trioHands(), draw: ['pular-9'], blind: ['p0'] });
    expect(refuse(s, 'p0', { type: 'play', cards: ['?0', '?1', '?2'] }, ctx)).toBe('bad_combo');
    expect(refuse(s, 'p0', { type: 'play', cards: ['?0', '?1', '?2'], target: 'p0' }, ctx)).toBe('bad_combo');
    const ok = act(s, 'p0', { type: 'play', cards: ['?0', '?1', '?2'], target: 'p1' }, ctx);
    expect(ok.pending!.play).toMatchObject({ kind: 'trio', as: 'favor', target: 'p1', cards: FAVORES });
  });
});

describe('escolha do Favor salva antes do trio de Favor (sem `left`)', () => {
  it('vale como 1 carta', () => {
    const s = { ...table({ hands: hands(), draw: ['pular-9'] }), choice: { kind: 'favor', who: 'p1', to: 'p0', deadline: T0 + 30_000 } };
    const old = s as unknown as KittensState;
    expect(kittensViewFor(old, 'p1').choice).toEqual({ kind: 'favor', who: 'p1', to: 'p0', left: 1, deadline: T0 + 30_000 });
    const gave = act(old, 'p1', { type: 'choose', card: 'pular-5' }, at(1000));
    expect(gave.choice).toBeNull();
    expect(gave.hands.p0).toContain('pular-5');
  });

  it('trio de 3 Favores no ar, salvo sem alvo: vale como trio comum (rouba um Desarme) e a sala não trava', () => {
    const FAVORES = ['favor-0', 'favor-1', 'favor-2'];
    const s = table({ hands: { p0: ['mico-0'], p1: ['ataque-5', 'cafune-5'], p2: ['quati-5'] }, draw: ['pular-9'] });
    const air: KittensState = {
      ...s,
      pending: { by: 'p0', play: { kind: 'trio', cards: FAVORES, target: null, ask: null, as: 'favor' }, nopes: [], resolvesAt: T0 + 5000 },
    };
    const done = settleKittens(air, at(5000));
    expect(done.pending).toBeNull();
    expect(done.choice).toBeNull();
    expect(done.discard).toEqual(FAVORES);
    expect(done.hands.p0).toEqual(['mico-0', 'cafune-5']);
    expect(done.log.at(-1)!.ev).toEqual({ t: 'grabbed', by: 'p0', from: 'p1', card: 'cafune-5' });
  });
});

describe('combos', () => {
  const cinco: KittensAction = { type: 'play', cards: ['capivara-0', 'mico-0', 'quati-0', 'tamandua-0'] };
  const picks = (s: ReturnType<typeof resolved>) => s.log.filter((e) => e.ev.t === 'picked').map((e) => e.ev);

  it('4 bichos diferentes: pega duas cartas do descarte de antes da jogada, uma de cada vez', () => {
    const s = resolved(cinco, ['ataque-7', 'espiar-7', 'pular-7']);
    expect(s.choice).toEqual({
      kind: 'cinco',
      who: 'p0',
      options: ['ataque-7', 'espiar-7', 'pular-7'],
      left: 2,
      deadline: T0 + 5000 + KITTENS_CHOICE_MS,
    });
    expect(refuse(s, 'p0', { type: 'choose', card: 'mico-0' }, at(5000))).toBe('bad_choice');
    expect(refuse(s, 'p1', { type: 'choose', card: 'espiar-7' }, at(5000))).toBe('not_your_choice');
    const first = act(s, 'p0', { type: 'choose', card: 'espiar-7' }, at(5000));
    expect(first.discard).not.toContain('espiar-7');
    expect(first.hands.p0).toContain('espiar-7');
    expect(first.choice).toMatchObject({ kind: 'cinco', who: 'p0', left: 1, deadline: T0 + 5000 + KITTENS_CHOICE_MS });
    expect(first.log.at(-1)!.ev).toEqual({ t: 'picked', by: 'p0', card: 'espiar-7' });
    expect(refuse(first, 'p0', { type: 'choose', card: 'espiar-7' }, at(5000))).toBe('bad_choice'); // já pegou essa
    const second = act(first, 'p0', { type: 'choose', card: 'ataque-7' }, at(5000));
    expect(second.choice).toBeNull();
    expect(second.hands.p0).toEqual(expect.arrayContaining(['espiar-7', 'ataque-7']));
    expect(second.discard).toEqual(['pular-7', 'capivara-0', 'mico-0', 'quati-0', 'tamandua-0']);
    expect(picks(second)).toEqual([
      { t: 'picked', by: 'p0', card: 'espiar-7' },
      { t: 'picked', by: 'p0', card: 'ataque-7' },
    ]);
    expect(second).toMatchObject({ current: 'p0', owed: 1 });
  });

  it('4 bichos diferentes com uma só carta no descarte: começa com 1 e fecha ao pegar', () => {
    const s = resolved(cinco, ['ataque-7']);
    expect(s.choice).toMatchObject({ kind: 'cinco', options: ['ataque-7'], left: 1 });
    const picked = act(s, 'p0', { type: 'choose', card: 'ataque-7' }, at(5000));
    expect(picked.choice).toBeNull();
    expect(picked.hands.p0).toContain('ataque-7');
  });

  it('4 bichos diferentes: sem resposta, no fim do prazo o que falta sai ao acaso', () => {
    const s = resolved(cinco, ['ataque-7', 'espiar-7', 'pular-7']);
    const none = settleKittens(s, at(5000 + KITTENS_CHOICE_MS));
    expect(none.choice).toBeNull();
    expect(picks(none)).toHaveLength(2);
    expect(none.hands.p0!.filter((c) => c.endsWith('-7'))).toHaveLength(2);
    expect(none.discard.filter((c) => c.endsWith('-7'))).toHaveLength(1);
    const half = act(s, 'p0', { type: 'choose', card: 'espiar-7' }, at(5000));
    const late = settleKittens(half, at(5000 + KITTENS_CHOICE_MS));
    expect(late.choice).toBeNull();
    expect(picks(late)).toHaveLength(2);
    expect(late.hands.p0).toContain('espiar-7');
    expect(late.hands.p0!.filter((c) => c.endsWith('-7'))).toHaveLength(2);
    const one = settleKittens(resolved(cinco, ['ataque-7']), at(5000 + KITTENS_CHOICE_MS));
    expect(one.choice).toBeNull();
    expect(one.hands.p0).toContain('ataque-7');
  });

  it('4 bichos diferentes com o descarte vazio: nada acontece', () => {
    const s = resolved(cinco);
    expect(s.choice).toBeNull();
    expect(s.current).toBe('p0');
  });

  it('4 bichos diferentes não aceitam Nem vem!: sem contagem, resolvem em 1,5 s', () => {
    const s = table({ hands: { ...hands(), p1: ['nemvem-5'] }, discard: ['ataque-7'], draw: ['pular-9', 'mico-9'] });
    const air = act(s, 'p0', cinco, ctx);
    expect(air.pending!.resolvesAt).toBe(T0 + KITTENS_UNSTOPPABLE_MS);
    expect(refuse(air, 'p1', { type: 'nope' }, at(100))).toBe('unstoppable');
    expect(settleKittens(air, at(KITTENS_UNSTOPPABLE_MS - 1))).toBe(air);
    const done = settleKittens(air, at(KITTENS_UNSTOPPABLE_MS));
    expect(done.hands.p1).toEqual(['nemvem-5']);
    expect(done.choice).toMatchObject({ kind: 'cinco', who: 'p0', options: ['ataque-7'], left: 1 });
  });

  it('4 bichos diferentes: só bichos (o Boto conta como um a mais), 4 cartas, nenhum repetido', () => {
    const s = table({
      hands: { p0: ['capivara-0', 'mico-0', 'quati-0', 'tucano-0', 'preguica-0', 'boto-0', 'boto-1', 'mico-1', 'ataque-0'], p1: [], p2: [] },
    });
    const kind = (cards: string[]) => act(s, 'p0', { type: 'play', cards }, ctx).pending!.play.kind;
    expect(kind(['capivara-0', 'mico-0', 'quati-0', 'tucano-0'])).toBe('cinco');
    expect(kind(['capivara-0', 'mico-0', 'quati-0', 'boto-0'])).toBe('cinco');
    for (const cards of [
      ['capivara-0', 'mico-0', 'quati-0', 'tucano-0', 'preguica-0'], // 5 bichos
      ['capivara-0', 'mico-0', 'quati-0', 'ataque-0'], // carta de ação
      ['capivara-0', 'mico-0', 'mico-1', 'quati-0'], // bicho repetido
      ['capivara-0', 'mico-0', 'boto-0', 'boto-1'], // 2 Botos
    ]) {
      expect(refuse(s, 'p0', { type: 'play', cards }, ctx)).toBe('bad_combo');
    }
  });
});

describe('Cafuné sem resposta', () => {
  it('no fim do prazo o tatu vai pra um lugar ao acaso e a vez passa', () => {
    const s = act(table({ hands: { p0: ['cafune-0'], p1: [], p2: [] }, draw: ['mico-0', 'tatubum-0'] }), 'p0', { type: 'draw' }, ctx);
    expect(settleKittens(s, at(KITTENS_CHOICE_MS - 1))).toBe(s);
    const late = settleKittens(s, at(KITTENS_CHOICE_MS));
    expect(late.choice).toBeNull();
    expect([...late.draw].sort()).toEqual(['mico-0', 'tatubum-0']);
    expect(late.current).toBe('p1');
  });
});
