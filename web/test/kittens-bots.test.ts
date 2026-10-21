import {
  PLAYER_COLORS,
  createRoom,
  isKittensRoomView,
  joinRoom,
  kittensKindOf,
  mulberry32,
  roomAction,
  roomView,
  settleKittens,
  type GameAction,
  type KittensRoomView,
  type KittensState,
  type KittensView,
  type Room,
} from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { decideKittens, kittensNopeWait, newKittensMemory } from '../src/dev/kittensBots';

const HOST_ACTIONS = ['start', 'again', 'lobby'];

/** Sala de Tatubum começada com `n` jogadores p0…; o p0 (host) é o da vez (quem começa é sorteado: aqui, fixo). */
function started(n = 3): Room {
  let room = createRoom('ABCD', 0, 'kittens');
  for (let i = 0; i < n; i++) {
    const res = joinRoom(room, { token: `t${i}`, name: `P${i}`, color: PLAYER_COLORS[i]! }, `p${i}`, 0);
    if (!res.ok) throw new Error(res.error);
    room = res.room;
  }
  const res = roomAction(room, 'p0', { type: 'start' }, mulberry32(7), 0);
  if (!res.ok) throw new Error(res.error);
  return { ...res.room, game: { ...(res.room.game as KittensState), current: 'p0' } };
}

/** Os 2 Tatus Latidores vão pras mãos de p0 e p1 (saem de onde estavam: mãos ou monte). */
function withLatidos(room: Room): Room {
  const g = room.game as KittensState;
  const latidos = ['latido-0', 'latido-1'];
  const without = (cs: string[]) => cs.filter((c) => !latidos.includes(c));
  const hands = Object.fromEntries(Object.entries(g.hands).map(([p, cs]) => [p, without(cs)]));
  hands.p0 = [...hands.p0!, 'latido-0'];
  hands.p1 = [...hands.p1!, 'latido-1'];
  return { ...room, game: { ...g, hands, draw: without(g.draw) } };
}

function viewOf(room: Room, me: string): KittensRoomView {
  const v = roomView(room, me);
  if (!isKittensRoomView(v)) throw new Error('esperava sala de Tatubum');
  return v;
}

/** A mesma visão com campos do jogo trocados (pra montar situações exatas). */
function withGame(v: KittensRoomView, game: Partial<KittensView>): KittensRoomView {
  return { ...v, game: { ...v.game, ...game } };
}

/** Visão do p1 numa mesa de 3, fora da vez dele, com a mão dada. */
function p1View(hand: string[], game: Partial<KittensView> = {}): KittensRoomView {
  return withGame(viewOf(started(3), 'p1'), { hand, current: 'p0', pending: null, choice: null, peek: null, ...game });
}

const inAir = (by: string, target: string | null, kind: 'favor' | 'ataque' = 'favor', nopes = 0) => ({
  by,
  play: { kind, cards: [`${kind}-1`], target, ask: null, as: null },
  nopes: Array.from({ length: nopes }, (_, i) => ({ by: `p${i}`, card: `nemvem-${i + 9}` })),
  resolvesAt: 5000,
});

describe('decisão do bot do Tatubum', () => {
  it('na vez dele, sem jogada escolhida (rng alto), compra', () => {
    const room = started(3);
    const d = decideKittens(viewOf(room, 'p0'), newKittensMemory(), () => 0.99)!;
    expect(d.action).toEqual({ type: 'draw' });
    expect(d.key).toMatch(/^turn:/);
    expect(d.delay).toBeGreaterThanOrEqual(900);
    expect(d.delay).toBeLessThanOrEqual(1700);
  });

  it('comprou o Tatubum: joga o Desarme depois de uma pausa (1,2 a 2,2 s); sem Desarme na mão, nada', () => {
    const choice = { kind: 'tatu' as const, who: 'p1', deadline: 9000 };
    const v = p1View(['mico-1', 'cafune-3', 'cafune-4'], { current: 'p1', choice });
    for (const r of [0, 0.5, 0.99]) {
      const d = decideKittens(v, newKittensMemory(), () => r)!;
      expect(d.action).toEqual({ type: 'choose', card: 'cafune-3' });
      expect(d.key).toBe('choice:tatu:9000');
      expect(d.delay).toBeGreaterThanOrEqual(1200);
      expect(d.delay).toBeLessThanOrEqual(2200);
    }
    expect(decideKittens(p1View(['mico-1'], { current: 'p1', choice }), newKittensMemory(), () => 0)).toBeNull();
    // a escolha de outro jogador: espera
    expect(decideKittens(p1View(['cafune-3'], { choice: { ...choice, who: 'p0' } }), newKittensMemory(), () => 0)).toBeNull();
  });

  it('escolha do Cafuné: manda choose com posição válida (0 até o tamanho do monte)', () => {
    const base = viewOf(started(3), 'p1');
    const v = withGame(base, { choice: { kind: 'cafune', who: 'p1', deadline: 9000 }, current: 'p1' });
    for (const r of [0, 0.2, 0.5, 0.99]) {
      const d = decideKittens(v, newKittensMemory(), () => r)!;
      expect(d.key).toBe('choice:cafune:9000');
      const a = d.action as { type: string; position: number };
      expect(a.type).toBe('choose');
      expect(Number.isInteger(a.position)).toBe(true);
      expect(a.position).toBeGreaterThanOrEqual(0);
      expect(a.position).toBeLessThanOrEqual(v.game.drawCount);
    }
  });

  it('escolha do Favor: dá uma carta da própria mão, de preferência um bicho', () => {
    const hand = ['ataque-1', 'capivara-2', 'nemvem-3'];
    const v = p1View(hand, { choice: { kind: 'favor', who: 'p1', to: 'p0', left: 1, deadline: 9000 } });
    const a = decideKittens(v, newKittensMemory(), () => 0.5)!.action as { type: string; card: string };
    expect(a.type).toBe('choose');
    expect(a.card).toBe('capivara-2');
    // sem bicho, qualquer carta da mão
    const v2 = p1View(['ataque-1', 'pular-4'], { choice: { kind: 'favor', who: 'p1', to: 'p0', left: 1, deadline: 9000 } });
    const b = decideKittens(v2, newKittensMemory(), () => 0.5)!.action as { card: string };
    expect(['ataque-1', 'pular-4']).toContain(b.card);
  });

  it('escolha dos 5 diferentes: prefere o Cafuné entre as opções', () => {
    const v = p1View([], { choice: { kind: 'cinco', who: 'p1', options: ['pular-1', 'cafune-2', 'espiar-3'], left: 2, deadline: 9000 } });
    const d = decideKittens(v, newKittensMemory(), () => 0.5)!;
    expect(d.action).toEqual({ type: 'choose', card: 'cafune-2' });
    // São duas pegadas: a chave muda com o que falta, então o bot também responde à segunda.
    const second = p1View([], { choice: { kind: 'cinco', who: 'p1', options: ['pular-1', 'espiar-3'], left: 1, deadline: 9000 } });
    const d2 = decideKittens(second, newKittensMemory(), () => 0.5)!;
    expect(d2.key).not.toBe(d.key);
    expect(d2.action).toEqual({ type: 'choose', card: 'pular-1' });
  });

  describe('par de Mico: descarta uma carta quando está na espera', () => {
    const mico = (waiting: string[]) => ({ kind: 'mico' as const, by: 'p0', waiting, discarded: [], deadline: 9000 });

    it('prefere bicho (sozinho antes do que está em par); nunca o Desarme se tiver outra', () => {
      const hand = ['cafune-1', 'ataque-2', 'capivara-3', 'capivara-4', 'quati-5', 'nemvem-6'];
      const v = p1View(hand, { choice: mico(['p1', 'p2']) });
      const d = decideKittens(v, newKittensMemory(), () => 0.5)!;
      expect(d.key).toBe('choice:mico:9000');
      expect(d.action).toEqual({ type: 'choose', card: 'quati-5' });
      for (const r of [0, 0.5, 0.99]) {
        const a = decideKittens(p1View(['cafune-1', 'pular-2'], { choice: mico(['p1']) }), newKittensMemory(), () => r)!.action as { card: string };
        expect(a.card).toBe('pular-2');
      }
      // só bichos em par: ainda é bicho
      const pairs = decideKittens(p1View(['cafune-1', 'ataque-2', 'mico-3', 'mico-4'], { choice: mico(['p1']) }), newKittensMemory(), () => 0)!.action as { card: string };
      expect(pairs.card).toMatch(/^mico-/);
    });

    it('só tem Desarme: descarta ele mesmo (é a única opção)', () => {
      const v = p1View(['cafune-1'], { choice: mico(['p1']) });
      expect(decideKittens(v, newKittensMemory(), () => 0)!.action).toEqual({ type: 'choose', card: 'cafune-1' });
    });

    it('quem não está na espera (ou já descartou) fica quieto, e quem jogou também', () => {
      expect(decideKittens(p1View(['quati-1'], { choice: mico(['p2']) }), newKittensMemory(), () => 0)).toBeNull();
      const by = withGame(viewOf(started(3), 'p0'), { hand: ['quati-1'], choice: mico(['p1', 'p2']) });
      expect(decideKittens(by, newKittensMemory(), () => 0)).toBeNull();
    });

    it('quem jogou pega uma das descartadas no fim (prefere Desarme, Nem vem!, Ataque), com chave própria', () => {
      const pick = (options: string[]) => ({ kind: 'cinco' as const, who: 'p0', options, left: 1, deadline: 9000, from: 'mico' as const });
      const mine = (options: string[]) => withGame(viewOf(started(3), 'p0'), { hand: ['quati-1'], pending: null, choice: pick(options) });
      const d = decideKittens(mine(['pular-4', 'nemvem-5', 'quati-6']), newKittensMemory(), () => 0.5)!;
      expect(d.action).toEqual({ type: 'choose', card: 'nemvem-5' });
      expect(decideKittens(mine(['ataque-4', 'cafune-5']), newKittensMemory(), () => 0.5)!.action).toEqual({ type: 'choose', card: 'cafune-5' });
      expect(decideKittens(mine(['capivara-4', 'ataque-5']), newKittensMemory(), () => 0.5)!.action).toEqual({ type: 'choose', card: 'ataque-5' });
      // Sem preferida: uma delas.
      expect(['capivara-4', 'quati-6']).toContain((decideKittens(mine(['capivara-4', 'quati-6']), newKittensMemory(), () => 0.5)!.action as { card: string }).card);
      // A chave não se confunde com a de uma pegada anterior (5 diferentes no mesmo prazo e com o mesmo `left`).
      const cinco = withGame(viewOf(started(3), 'p0'), { choice: { kind: 'cinco', who: 'p0', options: ['pular-4', 'nemvem-5', 'quati-6'], left: 1, deadline: 9000 } });
      expect(decideKittens(cinco, newKittensMemory(), () => 0.5)!.key).not.toBe(d.key);
      expect(decideKittens(mine(['pular-4']), newKittensMemory(), () => 0.5)!.key).not.toBe(d.key);
      // Os outros esperam.
      expect(decideKittens(p1View(['quati-1'], { choice: pick(['pular-4']) }), newKittensMemory(), () => 0)).toBeNull();
    });
  });

  it('joga o par de Mico sem alvo', () => {
    const base = viewOf(started(3), 'p0');
    const a = decideKittens(withGame(base, { hand: ['mico-0', 'mico-1'], peek: null, owed: 1 }), newKittensMemory(), () => 0)!.action;
    expect(a).toEqual({ type: 'play', cards: ['mico-0', 'mico-1'] });
  });

  it('escolha dos outros: espera, não faz nada', () => {
    const v = p1View(['nemvem-1'], { choice: { kind: 'cafune', who: 'p0', deadline: 9000 }, current: 'p1' });
    expect(decideKittens(v, newKittensMemory(), () => 0)).toBeNull();
  });

  it('4 bichos diferentes no ar: nunca dá Nem vem!', () => {
    const pending = { by: 'p0', play: { kind: 'cinco' as const, cards: ['capivara-1', 'quati-1', 'tucano-1', 'boto-1'], target: null, ask: null, as: null }, nopes: [], resolvesAt: 9000 };
    expect(decideKittens(p1View(['nemvem-5', 'mico-1'], { pending }), newKittensMemory(), () => 0)).toBeNull();
  });

  it('carta no ar contra ele, com Nem vem! na mão e rng 0: dá Nem vem!; na mesma etapa, a segunda chamada devolve null', () => {
    const v = p1View(['nemvem-5', 'mico-1'], { pending: inAir('p0', 'p1') });
    const mem = newKittensMemory();
    const d = decideKittens(v, mem, () => 0)!;
    // Vai junto o que ele viu (at/on): se outro deu Nem vem! antes, o servidor recusa em vez de anular o outro.
    expect(d.action).toEqual({ type: 'nope', at: 0, on: 'favor-1' });
    expect(d.key).toBe('nope:p0:favor-1:0');
    expect(d.delay).toBeGreaterThanOrEqual(800);
    expect(d.delay).toBeLessThanOrEqual(3400);
    expect(decideKittens(v, mem, () => 0)).toBeNull();
    // um Nem vem! novo no ar é outra etapa: decide de novo
    const v2 = p1View(['nemvem-5'], { pending: inAir('p0', 'p1', 'favor', 1) });
    const d2 = decideKittens(v2, mem, () => 0)!;
    expect(d2.key).toBe('nope:p0:favor-1:1');
    expect(d2.action).toEqual({ type: 'nope', at: 1, on: 'favor-1' });
  });

  it('na espera de 2 s depois de um Nem vem!, não dá Nem vem! nem gasta a decisão; quando ela acaba, decide', () => {
    // Um Nem vem! na carta no ar, dado em 0 (resolvesAt 5000): a espera vai até 2000.
    const v = p1View(['nemvem-5', 'mico-1'], { pending: inAir('p0', 'p1', 'favor', 1) });
    expect(kittensNopeWait(v, 1000)).toBe(1000);
    expect(kittensNopeWait(v, 2000)).toBe(0);
    const mem = newKittensMemory();
    expect(decideKittens(v, mem, () => 0, 0)).toBeNull();
    expect(decideKittens(v, mem, () => 0, 1999)).toBeNull();
    expect(mem.noped).toBeNull();
    const d = decideKittens(v, mem, () => 0, 2000)!;
    expect(d.action).toEqual({ type: 'nope', at: 1, on: 'favor-1' });
    expect(mem.noped).toBe('nope:p0:favor-1:1');
    // Sem Nem vem! nenhum na carta no ar, não tem espera.
    expect(kittensNopeWait(p1View(['nemvem-5'], { pending: inAir('p0', 'p1') }), 0)).toBe(0);
  });

  it('Ataque cujo próximo da vez é ele conta como "contra ele"; sem Nem vem! na mão, nunca dá', () => {
    // p0 ataca: o próximo vivo é o p1; chance 0.7 passa com rng 0.6
    const v = p1View(['nemvem-5'], { pending: inAir('p0', null, 'ataque') });
    expect(decideKittens(v, newKittensMemory(), () => 0.6)!.action).toEqual({ type: 'nope', at: 0, on: 'ataque-1' });
    const sem = p1View(['mico-1'], { pending: inAir('p0', 'p1') });
    expect(decideKittens(sem, newKittensMemory(), () => 0)).toBeNull();
  });

  it('não corta a própria jogada que está valendo, mas pode anular um Nem vem! contra ela', () => {
    const own = p1View(['nemvem-5'], { current: 'p1', pending: inAir('p1', 'p0') });
    expect(decideKittens(own, newKittensMemory(), () => 0)).toBeNull();
    const noped = p1View(['nemvem-5'], { current: 'p1', pending: inAir('p1', 'p0', 'favor', 1) });
    expect(decideKittens(noped, newKittensMemory(), () => 0.5)!.action).toEqual({ type: 'nope', at: 1, on: 'favor-1' });
  });

  it('fora da vez e sem nada no ar, não faz nada', () => {
    expect(decideKittens(p1View(['ataque-1', 'nemvem-2']), newKittensMemory(), () => 0)).toBeNull();
  });

  it('quem não joga (espectador, fora da partida, sem lugar) não faz nada', () => {
    const room = started(3);
    expect(decideKittens(withGame(viewOf(room, 'p1'), { alive: ['p0', 'p2'] }), newKittensMemory(), () => 0)).toBeNull();
    expect(decideKittens({ ...viewOf(room, 'p0'), you: null }, newKittensMemory(), () => 0)).toBeNull();
    expect(decideKittens(withGame(viewOf(room, 'p0'), { phase: 'gameover' }), newKittensMemory(), () => 0)).toBeNull();
  });

  it('espiou e o tatu é o de cima: foge com Pular, Ataque ou Embaralhar', () => {
    const v = withGame(viewOf(started(3), 'p0'), { hand: ['pular-1', 'mico-2'], peek: ['tatubum-1', 'mico-3', 'quati-1'], peekers: ['p0'] });
    expect(decideKittens(v, newKittensMemory(), () => 0.99)!.action).toEqual({ type: 'play', cards: ['pular-1'] });
  });

  it('sob ataque (2 turnos devidos), joga o Ataque em 80% das vezes', () => {
    const v = withGame(viewOf(started(3), 'p0'), { hand: ['ataque-1', 'mico-2'], owed: 2 });
    expect(decideKittens(v, newKittensMemory(), () => 0.5)!.action).toEqual({ type: 'play', cards: ['ataque-1'] });
    expect(decideKittens(v, newKittensMemory(), () => 0.99)!.action).toEqual({ type: 'draw' });
  });

  it('joga no máximo 2 cartas por turno', () => {
    const v = withGame(viewOf(started(3), 'p0'), { hand: ['espiar-1', 'mico-2'] });
    const mem = newKittensMemory();
    expect(decideKittens(v, mem, () => 0)!.action).toMatchObject({ type: 'play' });
    mem.playedThisTurn = 2;
    expect(decideKittens(v, mem, () => 0)!.action).toEqual({ type: 'draw' });
  });

  it('escolha do Quati: manda Tatubum pro fundo e deixa o resto', () => {
    const choice = (card: string) => ({ kind: 'quati' as const, who: 'p1', deadline: 9000, card });
    const tatu = p1View([], { current: 'p1', choice: choice('tatubum-0') });
    expect(decideKittens(tatu, newKittensMemory(), () => 0.5)!.action).toEqual({ type: 'choose', keep: false });
    const calm = p1View([], { current: 'p1', choice: choice('pular-0') });
    expect(decideKittens(calm, newKittensMemory(), () => 0.5)!.action).toEqual({ type: 'choose', keep: true });
  });

  it('par de Capivara vai sem alvo; par de Preguiça pede um bicho; trio vai sem alvo', () => {
    const base = viewOf(started(3), 'p0');
    const play = (hand: string[]) => decideKittens(withGame(base, { hand, peek: null, owed: 1 }), newKittensMemory(), () => 0)!.action;
    expect(play(['capivara-0', 'capivara-1'])).toEqual({ type: 'play', cards: ['capivara-0', 'capivara-1'] });
    const lazy = play(['preguica-0', 'preguica-1']);
    expect(lazy).toMatchObject({ type: 'play', cards: ['preguica-0', 'preguica-1'] });
    expect(['capivara', 'mico', 'quati', 'tamandua', 'preguica', 'tucano']).toContain((lazy as { ask: string }).ask);
    expect(play(['nemvem-0', 'nemvem-1', 'nemvem-2'])).toEqual({ type: 'play', cards: ['nemvem-0', 'nemvem-1', 'nemvem-2'] });
  });

  it('par de Tucano (ou Boto + Tucano) vai com alvo: um adversário vivo, mesmo sem carta, nunca ele mesmo', () => {
    const base = viewOf(started(3), 'p0');
    const play = (hand: string[], game: Partial<KittensView> = {}) =>
      decideKittens(withGame(base, { hand, peek: null, owed: 1, ...game }), newKittensMemory(), () => 0)!.action;
    expect(play(['tucano-0', 'tucano-1'])).toEqual({ type: 'play', cards: ['tucano-0', 'tucano-1'], target: 'p1' });
    expect(play(['tucano-0', 'boto-1'])).toEqual({ type: 'play', cards: ['tucano-0', 'boto-1'], target: 'p1' });
    const lone = play(['tucano-0', 'tucano-1'], { alive: ['p0', 'p2'], handCounts: { p0: 2, p1: 0, p2: 0 } });
    expect(lone).toEqual({ type: 'play', cards: ['tucano-0', 'tucano-1'], target: 'p2' });
  });

  it('trio de Favor vai com alvo (adversário com carta na mão); ninguém com carta, não joga', () => {
    const base = viewOf(started(3), 'p0');
    const favores = ['favor-0', 'favor-1', 'favor-2'];
    const trios = (handCounts: Record<string, number>) => {
      const out: { cards: string[]; target?: string }[] = [];
      for (let seed = 1; seed <= 200; seed++) {
        const v = withGame(base, { hand: favores, peek: null, owed: 1, handCounts });
        const a = decideKittens(v, newKittensMemory(), mulberry32(seed))!.action as { type: string; cards?: string[]; target?: string };
        if (a.type === 'play' && a.cards!.length === 3) out.push({ cards: a.cards!, ...(a.target ? { target: a.target } : {}) });
      }
      return out;
    };
    const played = trios({ p0: 3, p1: 2, p2: 0 });
    expect(played.length).toBeGreaterThan(0);
    for (const p of played) expect(p).toEqual({ cards: favores, target: 'p1' });
    expect(trios({ p0: 3, p1: 0, p2: 0 })).toEqual([]);
  });

  it('trio de Favor contra ele: dá uma carta por vez, respondendo de novo a cada `left`', () => {
    const choice = (left: number) => ({ kind: 'favor' as const, who: 'p1', to: 'p0', left, deadline: 9000 });
    const mem = newKittensMemory();
    const three = decideKittens(p1View(['ataque-1', 'capivara-2', 'pular-3'], { choice: choice(3) }), mem, () => 0.5)!;
    const two = decideKittens(p1View(['ataque-1', 'pular-3'], { choice: choice(2) }), mem, () => 0.5)!;
    const one = decideKittens(p1View(['ataque-1'], { choice: choice(1) }), mem, () => 0.5)!;
    expect(three.action).toEqual({ type: 'choose', card: 'capivara-2' });
    expect(['ataque-1', 'pular-3']).toContain((two.action as { card: string }).card);
    expect(one.action).toEqual({ type: 'choose', card: 'ataque-1' });
    expect(new Set([three.key, two.key, one.key]).size).toBe(3);
  });

  describe('cartas novas', () => {
    const myTurn = (hand: string[], game: Partial<KittensView> = {}) =>
      withGame(viewOf(started(3), 'p0'), { hand, peek: null, owed: 1, pending: null, choice: null, ...game });

    it('solta o Tatu Latidor sempre que pode', () => {
      expect(decideKittens(myTurn(['latido-0', 'mico-1']), newKittensMemory(), () => 0.5)!.action).toEqual({ type: 'play', cards: ['latido-0'] });
    });

    it('Mau-olhado vai num adversário vivo (mesmo sem carta), nunca nele mesmo', () => {
      const v = myTurn(['olhado-0'], { handCounts: { p0: 1, p1: 0, p2: 0 } });
      expect(decideKittens(v, newKittensMemory(), () => 0)!.action).toEqual({ type: 'play', cards: ['olhado-0'], target: 'p1' });
      const dead = myTurn(['olhado-0'], { alive: ['p0', 'p2'] });
      expect(decideKittens(dead, newKittensMemory(), () => 0)!.action).toEqual({ type: 'play', cards: ['olhado-0'], target: 'p2' });
    });

    it('Feitiço: fica com a carta de baixo, a não ser que seja Tatubum (aí vai pro topo)', () => {
      const choice = (card: string) => ({ kind: 'feitico' as const, who: 'p0', deadline: 9000, card });
      expect(decideKittens(myTurn([], { choice: choice('tatubum-0') }), newKittensMemory(), () => 0.5)!.action).toEqual({ type: 'choose', keep: false });
      expect(decideKittens(myTurn([], { choice: choice('mico-0') }), newKittensMemory(), () => 0.5)!.action).toEqual({ type: 'choose', keep: true });
      expect(decideKittens(myTurn(['feitico-0']), newKittensMemory(), () => 0)!.action).toEqual({ type: 'play', cards: ['feitico-0'] });
    });

    it('Latidor contra ele: joga o Desarme; cego, manda qualquer ficha', () => {
      const choice = { kind: 'latido' as const, who: 'p1', by: 'p0', deadline: 9000 };
      const d = decideKittens(p1View(['mico-1', 'cafune-3'], { choice }), newKittensMemory(), () => 0.5)!;
      expect(d.action).toEqual({ type: 'choose', card: 'cafune-3' });
      expect(d.key).toBe('choice:latido:9000');
      const blind = decideKittens(p1View(['?0', '?1'], { choice, blind: ['p1'] }), newKittensMemory(), () => 0.5)!;
      expect(blind.action).toEqual({ type: 'choose', card: '?0' });
      // a escolha de outro: espera
      expect(decideKittens(p1View(['cafune-3'], { choice: { ...choice, who: 'p2' } }), newKittensMemory(), () => 0)).toBeNull();
    });

    it('Boto: completa o par de um bicho; dois Botos viram o par de um bicho declarado', () => {
      const a = decideKittens(myTurn(['boto-0', 'quati-1']), newKittensMemory(), () => 0)!.action;
      expect(a).toEqual({ type: 'play', cards: ['quati-1', 'boto-0'] });
      const two = decideKittens(myTurn(['boto-0', 'boto-1']), newKittensMemory(), () => 0)!.action as { cards: string[]; as: string; ask?: string };
      expect(two.cards).toEqual(['boto-0', 'boto-1']);
      expect(['capivara', 'mico', 'quati', 'tamandua', 'preguica', 'tucano']).toContain(two.as);
      // Dois Botos que viram Tucano vão com alvo.
      if (two.as === 'tucano') expect(['p1', 'p2']).toContain((two as { target?: string }).target);
      const lazy = decideKittens(myTurn(['boto-0', 'preguica-1']), newKittensMemory(), () => 0)!.action as { cards: string[]; ask: string };
      expect(lazy.cards).toEqual(['preguica-1', 'boto-0']);
      expect(['capivara', 'mico', 'quati', 'tamandua', 'preguica', 'tucano']).toContain(lazy.ask);
    });

    it('cego: quase sempre compra; às vezes arrisca uma ficha', () => {
      const v = myTurn(['?0', '?1', '?2'], { blind: ['p0'] });
      expect(decideKittens(v, newKittensMemory(), () => 0.99)!.action).toEqual({ type: 'draw' });
      const risky = decideKittens(v, newKittensMemory(), () => 0)!.action as { type: string; cards: string[] };
      expect(risky.type).toBe('play');
      for (const c of risky.cards) expect(['?0', '?1', '?2']).toContain(c);
      // no Favor contra ele, dá uma ficha
      const favor = decideKittens(p1View(['?0', '?1'], { choice: { kind: 'favor', who: 'p1', to: 'p0', left: 1, deadline: 9000 }, blind: ['p1'] }), newKittensMemory(), () => 0.5)!;
      expect(['?0', '?1']).toContain((favor.action as { card: string }).card);
      // e não dá Nem vem! (não sabe se tem)
      expect(decideKittens(p1View(['?0'], { pending: inAir('p0', 'p1'), blind: ['p1'] }), newKittensMemory(), () => 0)).toBeNull();
    });
  });

  it('numa partida inteira simulada, o que ele manda é aceito pelo servidor (jogar, Nem vem!, escolher, comprar) e nunca é ação de host', () => {
    const seen = new Set<string>();
    /** Cartas novas que os bots jogaram ou escolhas novas que responderam. */
    const news = new Set<string>();
    let blindTries = 0;
    for (let seed = 1; seed <= 60; seed++) {
      // Metade das partidas começa com os 2 Latidores nas mãos de p0 e p1 (só move cartas): senão o Latidor que late pra
      // alguém (e a defesa com o Desarme) depende da sorte do baralho.
      let room = seed % 2 === 0 ? withLatidos(started(4)) : started(4);
      const rng = mulberry32(seed);
      let clock = 0;
      for (let step = 0; step < 60; step++) {
        const g = viewOf(room, 'p0').game;
        if (g.phase !== 'playing') break;
        // quem precisa agir: o dono da escolha, o da vez (se nada no ar) ou todos (nope)
        const actors = g.choice ? (g.choice.kind === 'mico' ? g.choice.waiting : [g.choice.who]) : g.pending ? g.alive : g.current ? [g.current] : [];
        let acted = false;
        for (const who of actors) {
          const v = viewOf(room, who);
          const d = decideKittens(v, newKittensMemory(), rng, clock + 100);
          if (!d) continue;
          const a = d.action as GameAction & { type: string };
          expect(HOST_ACTIONS).not.toContain(a.type);
          seen.add(a.type);
          if (v.game.choice?.kind === 'latido' || v.game.choice?.kind === 'feitico') news.add(`choice:${v.game.choice.kind}`);
          let res = roomAction(room, who, d.action, mulberry32(seed + step), (clock += 100));
          // Às cegas (Mau-olhado) o bot arrisca fichas que podem não formar jogada: o servidor recusa e ele compra.
          if (!res.ok && a.type === 'play' && v.game.blind.includes(who)) {
            blindTries += 1;
            res = roomAction(room, who, { type: 'draw' }, mulberry32(seed + step), (clock += 100));
          }
          expect(res.ok, `${who} ${JSON.stringify(a)}`).toBe(true);
          if (res.ok) {
            room = res.room;
            const air = (room.game as KittensState).pending?.play;
            for (const c of air && a.type === 'play' ? air.cards : []) {
              const k = kittensKindOf(c);
              if (k === 'latido' || k === 'olhado' || k === 'feitico' || k === 'boto' || k === 'tucano') news.add(k);
            }
          }
          acted = true;
          break;
        }
        if (!acted) {
          // ninguém quis dar Nem vem!: o prazo vence e a carta resolve
          const game = room.game as KittensState;
          const ctx = { hostId: null, active: game.alive, rng: mulberry32(seed), now: (clock += 5_100) };
          room = { ...room, game: settleKittens(game, ctx) };
        }
      }
    }
    expect([...seen].sort()).toEqual(['choose', 'draw', 'nope', 'play']);
    expect([...news].sort()).toEqual(['boto', 'choice:feitico', 'choice:latido', 'feitico', 'latido', 'olhado', 'tucano']);
    void blindTries;
  });
});
