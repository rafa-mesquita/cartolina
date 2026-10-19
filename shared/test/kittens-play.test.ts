import { describe, expect, it } from 'vitest';
import { KITTENS_NOPE_MS, type KittensAction } from '../src/games/kittens/types';
import { T0, act, ctxOf, ids, refuse, table } from './kittens-helpers';

const ctx = ctxOf(ids(3));
const hands = () => ({
  p0: [
    'ataque-0',
    'favor-1',
    'nemvem-0',
    'capivara-0',
    'capivara-1',
    'capivara-2',
    'mico-0',
    'quati-0',
    'tamandua-0',
    'preguica-0',
    'cafune-0',
    'pular-0',
  ],
  p1: ['nemvem-1', 'favor-0'],
  p2: [] as string[],
});
type Play = Omit<Extract<KittensAction, { type: 'play' }>, 'type'>;
const play = (p: Play): KittensAction => ({ type: 'play', ...p });

describe('jogar', () => {
  it('a carta de ação vai pro ar com 5 s de janela', () => {
    const after = act(table({ hands: hands() }), 'p0', play({ cards: ['ataque-0'] }), ctx);
    expect(after.pending).toEqual({
      by: 'p0',
      play: { kind: 'ataque', cards: ['ataque-0'], target: null, ask: null },
      nopes: [],
      resolvesAt: T0 + KITTENS_NOPE_MS,
    });
    expect(after.hands.p0).not.toContain('ataque-0');
    expect(after.log.at(-1)!.ev).toEqual({ t: 'play', by: 'p0', play: 'ataque', target: null, ask: null });
  });

  it.each<[string[], string]>([
    [[], 'bad_combo'],
    [['nemvem-0'], 'bad_combo'],
    [['cafune-0'], 'bad_combo'],
    [['mico-0'], 'bad_combo'],
    [['mico-0', 'quati-0'], 'bad_combo'],
    [['capivara-0', 'capivara-0'], 'bad_combo'],
    [['capivara-0', 'capivara-1', 'capivara-2', 'mico-0', 'quati-0'], 'bad_combo'],
    [['favor-0'], 'not_in_hand'],
  ])('%j não vale (%s)', (cards, error) => {
    expect(refuse(table({ hands: hands() }), 'p0', play({ cards }), ctx)).toBe(error);
  });

  it('par, trio e 5 diferentes', () => {
    const s = table({ hands: hands() });
    expect(act(s, 'p0', play({ cards: ['capivara-0', 'capivara-1'], target: 'p1' }), ctx).pending!.play).toEqual({
      kind: 'par',
      cards: ['capivara-0', 'capivara-1'],
      target: 'p1',
      ask: null,
    });
    expect(
      act(s, 'p0', play({ cards: ['capivara-0', 'capivara-1', 'capivara-2'], target: 'p1', ask: 'favor' }), ctx).pending!.play,
    ).toEqual({ kind: 'trio', cards: ['capivara-0', 'capivara-1', 'capivara-2'], target: 'p1', ask: 'favor' });
    expect(act(s, 'p0', play({ cards: ['capivara-0', 'mico-0', 'quati-0', 'tamandua-0', 'preguica-0'] }), ctx).pending!.play.kind).toBe(
      'cinco',
    );
  });

  it('combo vale com quaisquer cartas, não só bichos', () => {
    const s = table({ hands: { p0: ['ataque-0', 'ataque-1', 'pular-0', 'cafune-0', 'mico-0', 'nemvem-0'], p1: ['mico-1'], p2: [] } });
    expect(act(s, 'p0', play({ cards: ['ataque-0', 'ataque-1'], target: 'p1' }), ctx).pending!.play.kind).toBe('par');
    expect(act(s, 'p0', play({ cards: ['ataque-0', 'pular-0', 'cafune-0', 'mico-0', 'nemvem-0'] }), ctx).pending!.play.kind).toBe('cinco');
  });

  it.each<[Play, string]>([
    [{ cards: ['capivara-0', 'capivara-1'] }, 'bad_target'],
    [{ cards: ['capivara-0', 'capivara-1'], target: 'p0' }, 'bad_target'],
    [{ cards: ['capivara-0', 'capivara-1'], target: 'p2' }, 'bad_target'],
    [{ cards: ['capivara-0', 'capivara-1'], target: 'p9' }, 'bad_target'],
    [{ cards: ['favor-1'], target: 'p2' }, 'bad_target'],
    [{ cards: ['capivara-0', 'capivara-1', 'capivara-2'], target: 'p1' }, 'bad_ask'],
    [{ cards: ['capivara-0', 'capivara-1', 'capivara-2'], target: 'p1', ask: 'tatubum' }, 'bad_ask'],
  ])('alvo e pedido: %j → %s', (p, error) => {
    expect(refuse(table({ hands: hands() }), 'p0', play(p), ctx)).toBe(error);
  });

  it('alvo que não precisa é ignorado', () => {
    const after = act(table({ hands: hands() }), 'p0', play({ cards: ['ataque-0'], target: 'p1' }), ctx);
    expect(after.pending!.play.target).toBeNull();
  });

  it('com carta no ar ninguém joga nem compra; fora da vez não joga', () => {
    const air = act(table({ hands: hands() }), 'p0', play({ cards: ['ataque-0'] }), ctx);
    expect(refuse(air, 'p0', play({ cards: ['pular-0'] }), ctx)).toBe('card_in_air');
    expect(refuse(air, 'p0', { type: 'draw' }, ctx)).toBe('card_in_air');
    expect(refuse(table({ hands: hands() }), 'p1', play({ cards: ['favor-0'], target: 'p0' }), ctx)).toBe('not_your_turn');
  });
});

describe('Nem vem!', () => {
  const air = () => act(table({ hands: hands() }), 'p0', play({ cards: ['ataque-0'] }), ctx);

  it('qualquer vivo com Nem vem! dá, e a janela recomeça', () => {
    const later = ctxOf(ids(3), { now: T0 + 3000 });
    const noped = act(air(), 'p1', { type: 'nope' }, later);
    expect(noped.pending!.nopes).toEqual([{ by: 'p1', card: 'nemvem-1' }]);
    expect(noped.pending!.resolvesAt).toBe(T0 + 3000 + KITTENS_NOPE_MS);
    expect(noped.hands.p1).toEqual(['favor-0']);
    expect(noped.log.at(-1)!.ev).toEqual({ t: 'nope', by: 'p1' });
    const back = act(noped, 'p0', { type: 'nope' }, later);
    expect(back.pending!.nopes.map((n) => n.by)).toEqual(['p1', 'p0']);
  });

  it('sem Nem vem! na mão, sem carta no ar ou já fora do jogo, não dá', () => {
    expect(refuse(air(), 'p2', { type: 'nope' }, ctx)).toBe('no_nope');
    expect(refuse(table({ hands: hands() }), 'p1', { type: 'nope' }, ctx)).toBe('nothing_to_nope');
    expect(refuse({ ...air(), alive: ['p0', 'p2'] }, 'p1', { type: 'nope' }, ctx)).toBe('not_alive');
  });
});
