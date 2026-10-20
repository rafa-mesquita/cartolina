import { describe, expect, it } from 'vitest';
import type { KittensCardKind } from '../src/games/kittens/cards';
import { settleKittens } from '../src/games/kittens/settle';
import { KITTENS_CHOICE_MS, type KittensAction } from '../src/games/kittens/types';
import { T0, act, ctxOf, ids, refuse, table } from './kittens-helpers';

const ctx = ctxOf(ids(3));
const at = (ms: number) => ctxOf(ids(3), { now: T0 + ms });
const hands = (): Record<string, string[]> => ({
  p0: [
    'boto-0',
    'boto-1',
    'boto-2',
    'capivara-0',
    'capivara-1',
    'mico-0',
    'quati-0',
    'tamandua-0',
    'preguica-0',
    'ataque-0',
    'ataque-1',
    'nemvem-0',
  ],
  p1: ['pular-5', 'mico-5', 'nemvem-5'],
  p2: ['espiar-5'],
});
const DRAW = ['cafune-9', 'embaralhar-9', 'pular-9'];
const play = (cards: string[], extra: { target?: string; ask?: KittensCardKind; as?: KittensCardKind } = {}): KittensAction => ({
  type: 'play',
  cards,
  ...extra,
});
const base = () => table({ hands: hands(), draw: DRAW });

describe('Boto: o bicho coringa', () => {
  it('sozinho não faz nada; com carta de ação não forma par', () => {
    expect(refuse(base(), 'p0', play(['boto-0']), ctx)).toBe('bad_combo');
    expect(refuse(base(), 'p0', play(['boto-0', 'ataque-0']), ctx)).toBe('bad_combo');
    expect(refuse(base(), 'p0', play(['boto-0', 'nemvem-0']), ctx)).toBe('bad_combo');
  });

  it('Boto + bicho = par desse bicho (o par registra o bicho em `as`, a jogada e o diário também)', () => {
    const s = act(base(), 'p0', play(['quati-0', 'boto-0'], { as: 'mico' }), ctx);
    expect(s.pending!.play).toEqual({ kind: 'par', cards: ['quati-0', 'boto-0'], target: null, ask: null, as: 'quati' });
    expect(s.log.at(-1)!.ev).toEqual({ t: 'play', by: 'p0', play: 'par', target: null, ask: null, as: 'quati' });
    // O efeito é o do bicho: par de Quati abre a escolha do Quati.
    const done = settleKittens(s, at(5000));
    expect(done.choice).toEqual({ kind: 'quati', who: 'p0', deadline: T0 + 5000 + KITTENS_CHOICE_MS });
    expect(done.discard).toEqual(['quati-0', 'boto-0']);
  });

  it('par normal também registra o bicho', () => {
    const s = act(base(), 'p0', play(['capivara-0', 'capivara-1']), ctx);
    expect(s.pending!.play).toMatchObject({ kind: 'par', as: 'capivara' });
  });

  it('Boto + Tamanduá compra 2; Boto + Mico faz os outros descartarem', () => {
    const tam = settleKittens(act(base(), 'p0', play(['boto-0', 'tamandua-0']), ctx), at(5000));
    expect(tam.hands.p0).toEqual(expect.arrayContaining(['pular-9', 'embaralhar-9']));
    const mico = settleKittens(act(base(), 'p0', play(['mico-0', 'boto-1']), ctx), at(5000));
    expect(mico.choice).toMatchObject({ kind: 'mico', by: 'p0', waiting: ['p1', 'p2'] });
  });

  it('Boto + Boto: tem que dizer qual bicho (`as`), e tem que ser um dos 5', () => {
    expect(refuse(base(), 'p0', play(['boto-0', 'boto-1']), ctx)).toBe('bad_as');
    expect(refuse(base(), 'p0', play(['boto-0', 'boto-1'], { as: 'ataque' }), ctx)).toBe('bad_as');
    expect(refuse(base(), 'p0', play(['boto-0', 'boto-1'], { as: 'boto' }), ctx)).toBe('bad_as');
    const s = act(base(), 'p0', play(['boto-0', 'boto-1'], { as: 'capivara' }), ctx);
    expect(s.pending!.play).toEqual({ kind: 'par', cards: ['boto-0', 'boto-1'], target: null, ask: null, as: 'capivara' });
    // Roda de capivara: os outros passam uma carta.
    const done = settleKittens(s, at(5000));
    expect(done.log.filter((e) => e.ev.t === 'passed')).toHaveLength(2);
  });

  it('par de Preguiça com Boto pede um dos 5 bichos (Boto não vale como pedido)', () => {
    expect(refuse(base(), 'p0', play(['boto-0', 'preguica-0']), ctx)).toBe('bad_ask');
    expect(refuse(base(), 'p0', play(['boto-0', 'preguica-0'], { ask: 'boto' }), ctx)).toBe('bad_ask');
    const s = settleKittens(act(base(), 'p0', play(['boto-0', 'preguica-0'], { ask: 'mico' }), ctx), at(5000));
    expect(s.log.at(-1)!.ev).toEqual({ t: 'called', by: 'p0', ask: 'mico', from: 'p1', card: 'mico-5' });
    expect(refuse(base(), 'p0', play(['boto-0', 'boto-1'], { as: 'preguica' }), ctx)).toBe('bad_ask');
    expect(act(base(), 'p0', play(['boto-0', 'boto-1'], { as: 'preguica', ask: 'quati' }), ctx).pending!.play).toMatchObject({
      as: 'preguica',
      ask: 'quati',
    });
  });

  it('um Boto na mão de alguém não conta como o bicho pedido pela Preguiça', () => {
    const s = table({
      hands: { p0: ['preguica-0', 'preguica-1'], p1: ['boto-5'], p2: [] },
      draw: ['quati-9', 'pular-9'],
    });
    const done = settleKittens(act(s, 'p0', play(['preguica-0', 'preguica-1'], { ask: 'quati' }), ctx), at(5000));
    // Ninguém tem Quati de verdade: vem do monte.
    expect(done.log.at(-1)!.ev).toEqual({ t: 'called', by: 'p0', ask: 'quati', from: null, card: 'quati-9' });
    expect(done.hands.p1).toEqual(['boto-5']);
  });

  it('trio: o Boto completa os bichos iguais; 3 Botos também; com carta de ação, não', () => {
    const s = base();
    expect(act(s, 'p0', play(['capivara-0', 'capivara-1', 'boto-0']), ctx).pending!.play).toEqual({
      kind: 'trio',
      cards: ['capivara-0', 'capivara-1', 'boto-0'],
      target: null,
      ask: null,
      as: 'capivara',
    });
    expect(act(s, 'p0', play(['boto-0', 'mico-0', 'boto-1']), ctx).pending!.play).toMatchObject({ kind: 'trio', as: 'mico' });
    expect(act(s, 'p0', play(['boto-0', 'boto-1', 'boto-2']), ctx).pending!.play).toMatchObject({ kind: 'trio', as: 'boto' });
    expect(refuse(s, 'p0', play(['ataque-0', 'ataque-1', 'boto-0']), ctx)).toBe('bad_combo');
    expect(refuse(s, 'p0', play(['mico-0', 'quati-0', 'boto-0']), ctx)).toBe('bad_combo');
  });

  it('trio com Boto rouba um Desarme como qualquer trio', () => {
    const s = table({ hands: { p0: ['boto-0', 'boto-1', 'mico-0'], p1: ['cafune-5'], p2: [] }, draw: DRAW });
    const done = settleKittens(act(s, 'p0', play(['boto-0', 'boto-1', 'mico-0']), ctx), at(5000));
    expect(done.hands.p0).toEqual(['cafune-5']);
    expect(done.log.at(-1)!.ev).toEqual({ t: 'grabbed', by: 'p0', from: 'p1', card: 'cafune-5' });
  });

  it('5 diferentes: o Boto conta como o próprio nome', () => {
    const s = base();
    expect(act(s, 'p0', play(['capivara-0', 'mico-0', 'quati-0', 'tamandua-0', 'boto-0']), ctx).pending!.play).toMatchObject({
      kind: 'cinco',
      as: null,
    });
    expect(refuse(s, 'p0', play(['capivara-0', 'mico-0', 'quati-0', 'boto-0', 'boto-1']), ctx)).toBe('bad_combo');
  });

  it('Nem vem! cancela o par com Boto (as duas cartas vão pro descarte)', () => {
    const air = act(base(), 'p0', play(['boto-0', 'quati-0']), ctx);
    const noped = act(air, 'p1', { type: 'nope' }, at(1000));
    const done = settleKittens(noped, at(6000));
    expect(done.choice).toBeNull();
    expect(done.discard).toEqual(['boto-0', 'quati-0', 'nemvem-5']);
    expect(done.log.at(-1)!.ev).toEqual({ t: 'resolved', by: 'p0', play: 'par', canceled: true });
  });
});
