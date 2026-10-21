import { describe, expect, it } from 'vitest';
import { kittensKindOf } from '../src/games/kittens/cards';
import { KITTENS_NOPE_COOLDOWN_MS, KITTENS_NOPE_MS, type KittensAction } from '../src/games/kittens/types';
import { applyKittensAction } from '../src/games/kittens/rules';
import { errorMessage } from '../src/protocol';
import { T0, act, ctxOf, deepFreeze, ids, refuse, table, tokenOf } from './kittens-helpers';

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
    'mico-1',
    'quati-0',
    'tamandua-0',
    'preguica-0',
    'preguica-1',
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
      play: { kind: 'ataque', cards: ['ataque-0'], target: null, ask: null, as: null },
      nopes: [],
      resolvesAt: T0 + KITTENS_NOPE_MS,
    });
    expect(after.hands.p0).not.toContain('ataque-0');
    expect(after.log.at(-1)!.ev).toEqual({ t: 'play', by: 'p0', play: 'ataque', target: null, ask: null, as: null });
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
    // Par de Mico não tem alvo: vale sem ele, e o que vier é ignorado.
    for (const extra of [{}, { target: 'p1' }, { target: 'p9' }]) {
      expect(act(s, 'p0', play({ cards: ['mico-0', 'mico-1'], ...extra }), ctx).pending!.play).toEqual({
        kind: 'par',
        cards: ['mico-0', 'mico-1'],
        target: null,
        ask: null,
        as: 'mico',
      });
    }
    // Trio não tem alvo nem pedido: o que vier é ignorado.
    expect(
      act(s, 'p0', play({ cards: ['capivara-0', 'capivara-1', 'capivara-2'], target: 'p1', ask: 'favor' }), ctx).pending!.play,
    ).toEqual({ kind: 'trio', cards: ['capivara-0', 'capivara-1', 'capivara-2'], target: null, ask: null, as: 'capivara' });
    expect(act(s, 'p0', play({ cards: ['capivara-0', 'mico-0', 'quati-0', 'tamandua-0'] }), ctx).pending!.play.kind).toBe(
      'cinco',
    );
  });

  it('par só de bichos; trio vale com quaisquer cartas; 4 diferentes só com bichos', () => {
    const s = table({ hands: { p0: ['ataque-0', 'ataque-1', 'ataque-2', 'pular-0', 'cafune-0', 'mico-0', 'nemvem-0'], p1: ['mico-1'], p2: [] } });
    expect(refuse(s, 'p0', play({ cards: ['ataque-0', 'ataque-1'], target: 'p1' }), ctx)).toBe('bad_combo');
    expect(act(s, 'p0', play({ cards: ['ataque-0', 'ataque-1', 'ataque-2'] }), ctx).pending!.play.kind).toBe('trio');
    expect(refuse(s, 'p0', play({ cards: ['ataque-0', 'pular-0', 'cafune-0', 'mico-0'] }), ctx)).toBe('bad_combo');
  });

  it.each<[Play, string]>([
    [{ cards: ['favor-1'] }, 'bad_target'],
    [{ cards: ['favor-1'], target: 'p0' }, 'bad_target'],
    [{ cards: ['favor-1'], target: 'p2' }, 'bad_target'],
    [{ cards: ['favor-1'], target: 'p9' }, 'bad_target'],
    [{ cards: ['preguica-0', 'preguica-1'] }, 'bad_ask'],
    [{ cards: ['preguica-0', 'preguica-1'], ask: 'ataque' }, 'bad_ask'],
  ])('alvo e pedido: %j → %s', (p, error) => {
    expect(refuse(table({ hands: hands() }), 'p0', play(p), ctx)).toBe(error);
  });

  it('par de Preguiça leva o bicho pedido; Quati, Tamanduá e Capivara não pedem nada', () => {
    const s = table({
      hands: { p0: ['preguica-0', 'preguica-1', 'quati-0', 'quati-1', 'tamandua-0', 'tamandua-1', 'capivara-0', 'capivara-1'], p1: ['mico-1'], p2: [] },
    });
    expect(act(s, 'p0', play({ cards: ['preguica-0', 'preguica-1'], ask: 'mico', target: 'p1' }), ctx).pending!.play).toEqual({
      kind: 'par',
      cards: ['preguica-0', 'preguica-1'],
      target: null,
      ask: 'mico',
      as: 'preguica',
    });
    for (const cards of [['quati-0', 'quati-1'], ['tamandua-0', 'tamandua-1'], ['capivara-0', 'capivara-1']]) {
      expect(act(s, 'p0', play({ cards, target: 'p1', ask: 'mico' }), ctx).pending!.play).toEqual({ kind: 'par', cards, target: null, ask: null, as: kittensKindOf(cards[0]!) });
    }
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
    const back = act(noped, 'p0', { type: 'nope' }, ctxOf(ids(3), { now: T0 + 5000 }));
    expect(back.pending!.nopes.map((n) => n.by)).toEqual(['p1', 'p0']);
  });

  it('sem Nem vem! na mão, sem carta no ar ou já fora do jogo, não dá', () => {
    expect(refuse(air(), 'p2', { type: 'nope' }, ctx)).toBe('no_nope');
    expect(refuse(table({ hands: hands() }), 'p1', { type: 'nope' }, ctx)).toBe('nothing_to_nope');
    expect(refuse({ ...air(), alive: ['p0', 'p2'] }, 'p1', { type: 'nope' }, ctx)).toBe('not_alive');
  });

  describe('Nem vem! atrasado (pedido do Rafa, 2026-10-20)', () => {
    // p1 e p2 têm Nem vem! e veem a mesma carta no ar, sem nenhum Nem vem! ainda.
    const air2 = () => act(table({ hands: { ...hands(), p2: ['nemvem-2', 'mico-2'] } }), 'p0', play({ cards: ['ataque-0'] }), ctx);
    const later = ctxOf(ids(3), { now: T0 + 1000 });

    it('dois quase juntos: vale o primeiro; o segundo é recusado e a carta fica na mão', () => {
      const first = act(air2(), 'p1', { type: 'nope', at: 0, on: 'ataque-0' }, later);
      expect(first.pending!.nopes).toEqual([{ by: 'p1', card: 'nemvem-1' }]);
      const res = applyKittensAction(deepFreeze(first), 'p2', { type: 'nope', at: 0, on: 'ataque-0' }, ctxOf(ids(3), { now: T0 + 1100 }));
      expect(res).toEqual({ ok: false, error: 'nope_late' });
      // Nada muda: o Nem vem! de p2 continua na mão e a janela é a que o primeiro abriu (5 s pra decidir de novo).
      expect(first.hands.p2).toEqual(['nemvem-2', 'mico-2']);
      expect(first.pending!.resolvesAt).toBe(T0 + 1000 + KITTENS_NOPE_MS);
      expect(errorMessage('nope_late')).toBe('Alguém deu Nem vem! antes de você: sua carta voltou pra mão.');
    });

    it('depois de ver o primeiro, o segundo pode dar Nem vem! em cima (at: 1)', () => {
      const first = act(air2(), 'p1', { type: 'nope', at: 0, on: 'ataque-0' }, later);
      const back = act(first, 'p2', { type: 'nope', at: 1, on: 'ataque-0' }, ctxOf(ids(3), { now: T0 + 3000 }));
      expect(back.pending!.nopes).toEqual([
        { by: 'p1', card: 'nemvem-1' },
        { by: 'p2', card: 'nemvem-2' },
      ]);
      expect(back.hands.p2).toEqual(['mico-2']);
      expect(back.pending!.resolvesAt).toBe(T0 + 3000 + KITTENS_NOPE_MS);
    });

    it('`at` à frente do que há na mesa também não vale', () => {
      expect(refuse(air2(), 'p1', { type: 'nope', at: 1 }, later)).toBe('nope_late');
    });

    it('sem `at` (cliente antigo) vale como antes: vira Nem vem! em cima de Nem vem!', () => {
      const first = act(air2(), 'p1', { type: 'nope', at: 0 }, later);
      // (Passada a espera de 2 s entre um Nem vem! e outro.)
      expect(act(first, 'p2', { type: 'nope' }, ctxOf(ids(3), { now: T0 + 3000 })).pending!.nopes.map((n) => n.by)).toEqual(['p1', 'p2']);
    });

    it('outra carta no ar com o mesmo número de Nem vem!: recusado (`on`)', () => {
      // p2 clicou no Ataque; ele resolveu e agora o Pular está no ar, também sem Nem vem!.
      const other = act(table({ hands: { ...hands(), p2: ['nemvem-2'] } }), 'p0', play({ cards: ['pular-0'] }), ctx);
      expect(refuse(other, 'p2', { type: 'nope', at: 0, on: 'ataque-0' }, later)).toBe('nope_stale');
      expect(act(other, 'p2', { type: 'nope', at: 0, on: 'pular-0' }, later).pending!.nopes).toHaveLength(1);
    });

    it('quem está cego manda a ficha com `at` também', () => {
      const s = { ...air2(), blind: ['p2'] };
      const token = tokenOf(s, 'p2', 'nemvem-2');
      const first = act(s, 'p1', { type: 'nope', at: 0, on: 'ataque-0' }, later);
      expect(refuse(first, 'p2', { type: 'nope', card: token, at: 0, on: 'ataque-0' }, later)).toBe('nope_late');
      expect(act(first, 'p2', { type: 'nope', card: token, at: 1, on: 'ataque-0' }, ctxOf(ids(3), { now: T0 + 3000 })).pending!.nopes.at(-1)).toEqual({
        by: 'p2',
        card: 'nemvem-2',
      });
    });
  });

  describe('espera de 2 s entre um Nem vem! e outro (pedido do Rafa, 2026-10-21)', () => {
    const air2 = () => act(table({ hands: { ...hands(), p2: ['nemvem-2', 'mico-2'] } }), 'p0', play({ cards: ['ataque-0'] }), ctx);
    const at = (ms: number) => ctxOf(ids(3), { now: T0 + ms });

    it('a constante é 2 s', () => {
      expect(KITTENS_NOPE_COOLDOWN_MS).toBe(2000);
      expect(errorMessage('nope_cooldown')).toBe('Espere: acabaram de dar Nem vem! (2 s).');
    });

    it('o primeiro Nem vem! numa jogada não espera', () => {
      expect(act(air2(), 'p1', { type: 'nope', at: 0, on: 'ataque-0' }, at(0)).pending!.nopes).toHaveLength(1);
    });

    it('outro antes de 2 s é recusado: a carta fica na mão e o prazo não muda', () => {
      const first = act(air2(), 'p1', { type: 'nope', at: 0, on: 'ataque-0' }, at(1000));
      for (const ms of [1000, 1500, 2999]) {
        const res = applyKittensAction(deepFreeze(first), 'p2', { type: 'nope', at: 1, on: 'ataque-0' }, at(ms));
        expect(res).toEqual({ ok: false, error: 'nope_cooldown' });
      }
      // Sem `at`/`on` (cliente antigo) também espera; quem deu o primeiro também.
      expect(refuse(first, 'p2', { type: 'nope' }, at(2000))).toBe('nope_cooldown');
      expect(refuse(first, 'p0', { type: 'nope' }, at(2000))).toBe('nope_cooldown');
      expect(first.hands.p2).toEqual(['nemvem-2', 'mico-2']);
      expect(first.pending!.resolvesAt).toBe(T0 + 1000 + KITTENS_NOPE_MS);
    });

    it('com 2 s cravados vale, como Nem vem! em cima de Nem vem!', () => {
      const first = act(air2(), 'p1', { type: 'nope', at: 0, on: 'ataque-0' }, at(1000));
      const back = act(first, 'p2', { type: 'nope', at: 1, on: 'ataque-0' }, at(3000));
      expect(back.pending!.nopes.map((n) => n.by)).toEqual(['p1', 'p2']);
      expect(back.hands.p2).toEqual(['mico-2']);
      expect(back.pending!.resolvesAt).toBe(T0 + 3000 + KITTENS_NOPE_MS);
    });

    it('a espera conta do último Nem vem!', () => {
      const first = act(air2(), 'p1', { type: 'nope', at: 0, on: 'ataque-0' }, at(0));
      const second = act(first, 'p2', { type: 'nope', at: 1, on: 'ataque-0' }, at(2500));
      // 2 s depois do primeiro, mas só 1 s depois do segundo: espera.
      expect(refuse(second, 'p0', { type: 'nope', at: 2, on: 'ataque-0' }, at(3500))).toBe('nope_cooldown');
      expect(act(second, 'p0', { type: 'nope', at: 2, on: 'ataque-0' }, at(4500)).pending!.nopes).toHaveLength(3);
    });

    it('atrasado ou em outra carta continua dando o erro mais específico', () => {
      const first = act(air2(), 'p1', { type: 'nope', at: 0, on: 'ataque-0' }, at(1000));
      expect(refuse(first, 'p2', { type: 'nope', at: 0, on: 'ataque-0' }, at(1100))).toBe('nope_late');
      expect(refuse(first, 'p2', { type: 'nope', at: 1, on: 'pular-0' }, at(1100))).toBe('nope_stale');
    });
  });
});
