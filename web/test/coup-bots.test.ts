import {
  COUP_MAX_PLAYERS,
  coupStateOf,
  mulberry32,
  tick,
  type CoupActionKind,
  type CoupCharacter,
  type CoupState,
  type Room,
} from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { coupKeyRng, decideCoup, decideCoupStable } from '../src/dev/coupBots';
import { T0, coupLobbyRoom, coupRoom, step, viewOf } from './coup-fixtures';

const HOST_ACTIONS = ['start', 'restart'];
/** Sorteios em sequência (o último se repete). */
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)]!;
};
const always = (v: number) => () => v;

/** Troca o estado do jogo da sala (pra montar mãos e moedas conhecidas). */
function edit(room: Room, fn: (s: CoupState) => CoupState): Room {
  return { ...room, game: fn(coupStateOf(room)!) };
}
type Pair = [CoupCharacter, CoupCharacter];
const hands = (room: Room, cards: Record<string, Pair>): Room =>
  edit(room, (s) => ({
    ...s,
    hands: {
      ...s.hands,
      ...Object.fromEntries(
        Object.entries(cards)
          .filter(([p]) => s.players.includes(p))
          .map(([p, [a, b]]) => [
            p,
            { ...s.hands[p]!, cards: [{ character: a, revealed: false }, { character: b, revealed: false }] },
          ]),
      ),
    },
  }));
const coins = (room: Room, player: string, n: number): Room =>
  edit(room, (s) => ({ ...s, hands: { ...s.hands, [player]: { ...s.hands[player]!, coins: n } } }));
/** Vira a primeira carta de `player` pra cima, como se tivesse perdido. */
const lost = (room: Room, player: string): Room =>
  edit(room, (s) => {
    const h = s.hands[player]!;
    return { ...s, hands: { ...s.hands, [player]: { ...h, cards: [{ ...h.cards[0]!, revealed: true }, h.cards[1]!] } } };
  });

/** Sala de n pessoas, na vez de p0, com mãos conhecidas. */
function turnRoom(n: number, hand: Record<string, Pair> = {}): Room {
  const room = edit(coupRoom(n), (s) => ({ ...s, turn: 'p0' }));
  return hands(room, { p0: ['duke', 'captain'], p1: ['contessa', 'assassin'], p2: ['ambassador', 'ambassador'], ...hand });
}
const declare = (room: Room, kind: CoupActionKind, target?: string) => step(room, 'p0', { type: 'act', kind, target }, T0);
const view = (room: Room, who: string | null) => viewOf(room, who);

describe('decisão do bot do Cúpi', () => {
  describe('perder carta', () => {
    it('revela a carta de que tem mais cópias, com 0,9 a 2 s de espera', () => {
      let room = turnRoom(3, { p1: ['duke', 'duke'] });
      room = declare(coins(room, 'p0', 7), 'coup', 'p1');
      expect(viewOf(room, 'p1').game.can.lose).toBe(true);
      const lo = decideCoup(view(room, 'p1'), always(0))!;
      expect(lo.actions).toEqual([{ type: 'lose', card: 'duke' }]);
      expect(lo.delay).toBe(900);
      const hi = decideCoup(view(room, 'p1'), always(0.999))!.delay;
      expect(hi).toBeGreaterThan(1990);
      expect(hi).toBeLessThanOrEqual(2000);
    });

    it('com cartas diferentes, escolhe uma das duas; o servidor aceita', () => {
      const room = declare(coins(turnRoom(3), 'p0', 7), 'coup', 'p1');
      for (const r of [0, 0.99]) {
        const a = decideCoup(view(room, 'p1'), always(r))!.actions[0] as { type: string; card: CoupCharacter };
        expect(a.type).toBe('lose');
        expect(['contessa', 'assassin']).toContain(a.card);
        step(room, 'p1', a); // lança se recusada
      }
    });

    it('quem não está perdendo carta não faz nada na fase', () => {
      const room = declare(coins(turnRoom(3), 'p0', 7), 'coup', 'p1');
      expect(decideCoup(view(room, 'p0'), always(0.5))).toBeNull();
      expect(decideCoup(view(room, 'p2'), always(0.5))).toBeNull();
    });
  });

  describe('troca', () => {
    function exchangeRoom(mine: Pair = ['ambassador', 'contessa'], drawn: Pair = ['duke', 'captain']): Room {
      let room = turnRoom(3, { p0: mine });
      room = edit(room, (s) => ({ ...s, deck: [...drawn, ...s.deck.slice(2)] }));
      room = step(declare(room, 'exchange'), 'p1', { type: 'pass' });
      return step(room, 'p2', { type: 'pass' });
    }

    it('fica com as melhores (duque, capitão, assassino, condessa, embaixador), com 0,9 a 2 s de espera', () => {
      const room = exchangeRoom();
      expect(coupStateOf(room)!.phase).toBe('exchange');
      const d = decideCoup(view(room, 'p0'), always(0))!;
      expect(d.actions).toEqual([{ type: 'exchange', keep: ['duke', 'captain'] }]);
      expect(d.delay).toBe(900);
      expect(decideCoup(view(room, 'p0'), always(0.999))!.delay).toBeLessThanOrEqual(2000);
      expect(coupStateOf(step(room, 'p0', d.actions[0]))!.phase).toBe('turn');
    });

    it('com uma carta só (a outra já foi perdida), fica com a melhor das três', () => {
      let room = lost(turnRoom(3, { p0: ['ambassador', 'contessa'] }), 'p0'); // sobra a condessa
      room = edit(room, (s) => ({ ...s, deck: ['assassin', 'captain', ...s.deck.slice(2)] }));
      room = step(step(declare(room, 'exchange'), 'p1', { type: 'pass' }), 'p2', { type: 'pass' });
      const d = decideCoup(view(room, 'p0'), always(0))!;
      expect(d.actions).toEqual([{ type: 'exchange', keep: ['captain'] }]);
      step(room, 'p0', d.actions[0]);
    });

    it('quem não é o da troca não faz nada', () => {
      const room = exchangeRoom();
      expect(decideCoup(view(room, 'p1'), always(0.5))).toBeNull();
    });
  });

  describe('na vez', () => {
    it('com 10 ou mais moedas, só dá golpe, no alvo com mais cartas; espera de 1,2 a 3 s', () => {
      const room = coins(lost(turnRoom(3), 'p1'), 'p0', 10); // p1 com 1 carta; p2 com 2
      for (const r of [0, 0.5, 0.99]) {
        const d = decideCoup(view(room, 'p0'), always(r))!;
        expect(d.actions).toEqual([{ type: 'act', kind: 'coup', target: 'p2' }]);
        expect(d.delay).toBeGreaterThanOrEqual(1200);
        expect(d.delay).toBeLessThanOrEqual(3000);
        step(room, 'p0', d.actions[0]);
      }
      expect(decideCoup(view(room, 'p0'), always(0))!.delay).toBe(1200);
    });

    it('golpe: no empate de cartas, o alvo com mais moedas', () => {
      const room = coins(coins(turnRoom(3), 'p0', 10), 'p2', 5);
      expect(decideCoup(view(room, 'p0'), always(0))!.actions).toEqual([{ type: 'act', kind: 'coup', target: 'p2' }]);
    });

    it('com 7+ moedas, dá golpe em cerca de 70% das vezes', () => {
      const room = coins(turnRoom(3), 'p0', 8);
      const rng = mulberry32(5);
      const N = 1500;
      let n = 0;
      for (let i = 0; i < N; i++) if ((decideCoup(view(room, 'p0'), rng)!.actions[0] as { kind: string }).kind === 'coup') n++;
      expect(n / N).toBeGreaterThan(0.68);
      expect(n / N).toBeLessThan(0.85);
    });

    it('senão sorteia: honestas pesam 3, blefes 0,6', () => {
      // p0 (duque + capitão), 2 moedas: renda, ajuda, taxar, extorquir (honestas) e trocar (blefe); sem moedas pra assassinar
      const room = turnRoom(3);
      const rng = mulberry32(11);
      const counts: Partial<Record<CoupActionKind, number>> = {};
      const N = 4000;
      for (let i = 0; i < N; i++) {
        const k = (decideCoup(view(room, 'p0'), rng)!.actions[0] as { kind: CoupActionKind }).kind;
        counts[k] = (counts[k] ?? 0) + 1;
      }
      expect(counts.assassinate).toBeUndefined();
      expect(counts.coup).toBeUndefined();
      // pesos 3+3+3+3+0,6 = 12,6: blefe ≈ 4,8%, cada honesta ≈ 23,8%
      expect(counts.exchange! / N).toBeGreaterThan(0.025);
      expect(counts.exchange! / N).toBeLessThan(0.08);
      for (const k of ['income', 'foreignAid', 'tax', 'steal'] as const) {
        expect(counts[k]! / N).toBeGreaterThan(0.19);
        expect(counts[k]! / N).toBeLessThan(0.29);
      }
    });

    it('extorquir mira em quem tem mais moedas', () => {
      let room = turnRoom(4);
      room = lost(coins(coins(room, 'p2', 6), 'p3', 1), 'p2');
      // sorteio 0,8 × 12,6 = 10,08 cai em "extorquir" (4º da lista)
      const d = decideCoup(view(room, 'p0'), seq(0.8, 0.5))!;
      expect(d.actions).toEqual([{ type: 'act', kind: 'steal', target: 'p2' }]);
      step(room, 'p0', d.actions[0]);
    });

    it('assassinar mira em quem tem mais cartas (e, no empate, mais moedas)', () => {
      let room = turnRoom(4);
      room = lost(coins(coins(coins(room, 'p2', 6), 'p3', 1), 'p0', 4), 'p2'); // p2 rico, mas com 1 carta
      const rng = mulberry32(3);
      let seen = 0;
      for (let i = 0; i < 600; i++) {
        const a = decideCoup(view(room, 'p0'), rng)!.actions[0] as { kind: string; target?: string };
        if (a.kind === 'assassinate') {
          seen++;
          expect(a.target).toBe('p1'); // 2 cartas e 2 moedas, contra p3 (2 cartas, 1 moeda) e p2 (1 carta)
        }
      }
      expect(seen).toBeGreaterThan(0);
    });

    it('nunca declara uma ação que o servidor recusaria', () => {
      const rng = mulberry32(21);
      for (const n of [2, 3, 6])
        for (const c of [0, 2, 3, 7, 9, 10, 12]) {
          const room = coins(turnRoom(n), 'p0', c);
          for (let i = 0; i < 40; i++) {
            const d = decideCoup(view(room, 'p0'), rng)!;
            expect(d.actions).toHaveLength(1);
            step(room, 'p0', d.actions[0]); // lança se recusada
          }
        }
    });
  });

  describe('janela de reação', () => {
    it('sempre manda o windowId da janela que viu', () => {
      const rng = mulberry32(2);
      const rooms = [
        declare(turnRoom(3), 'tax'),
        declare(turnRoom(3), 'foreignAid'),
        declare(turnRoom(3), 'steal', 'p1'),
        declare(coins(turnRoom(3), 'p0', 3), 'assassinate', 'p1'),
      ];
      let sent = 0;
      for (const room of rooms)
        for (const p of ['p1', 'p2']) {
          const v = view(room, p);
          for (let i = 0; i < 60; i++)
            for (const a of decideCoup(v, rng)?.actions ?? []) {
              sent++;
              expect(['pass', 'challenge', 'block']).toContain(a.type);
              expect((a as { windowId?: number }).windowId).toBe(v.game.window!.id);
            }
        }
      expect(sent).toBeGreaterThan(100);
    });

    it('bloqueia sempre que tem a carta que bloqueia', () => {
      const room = declare(turnRoom(3, { p1: ['captain', 'duke'] }), 'steal', 'p1');
      for (const r of [0, 0.5, 0.999]) {
        const d = decideCoup(view(room, 'p1'), always(r))!;
        expect(d.actions).toEqual([{ type: 'block', as: 'captain', windowId: viewOf(room, 'p1').game.window!.id }]);
        step(room, 'p1', d.actions[0]);
      }
      // ajuda externa: o duque também bloqueia
      const aid = declare(turnRoom(3, { p2: ['duke', 'contessa'] }), 'foreignAid');
      expect((decideCoup(view(aid, 'p2'), always(0.999))!.actions[0] as { as: string }).as).toBe('duke');
    });

    it('sem a carta, blefa o bloqueio com 25% sendo o alvo e 10% numa ajuda externa', () => {
      const steal = declare(turnRoom(3, { p1: ['contessa', 'assassin'] }), 'steal', 'p1');
      const bluff = decideCoup(view(steal, 'p1'), seq(0.2, 0))!.actions[0] as { type: string; as: string };
      expect(bluff.type).toBe('block');
      expect(['captain', 'ambassador']).toContain(bluff.as);
      expect(decideCoup(view(steal, 'p1'), seq(0.26, 0.9))!.actions[0]).not.toMatchObject({ type: 'block' });
      const aid = declare(turnRoom(3, { p1: ['contessa', 'assassin'] }), 'foreignAid');
      expect(decideCoup(view(aid, 'p1'), seq(0.09, 0))!.actions[0]).toMatchObject({ type: 'block', as: 'duke' });
      expect(decideCoup(view(aid, 'p1'), seq(0.11, 0.9))!.actions[0]).not.toMatchObject({ type: 'block' });
      // quem não é o alvo de um extorquir não tem como bloquear: só duvida ou deixa
      const other = view(steal, 'p2');
      expect(other.game.can.block).toEqual([]);
      expect(decideCoup(other, always(0.01))!.actions[0]).toMatchObject({ type: 'challenge' });
    });

    it('duvida com 15%; com 2 cópias do personagem declarado vira 45%', () => {
      const tax = declare(turnRoom(3, { p1: ['contessa', 'assassin'] }), 'tax');
      expect(decideCoup(view(tax, 'p1'), always(0.14))!.actions[0]).toMatchObject({ type: 'challenge' });
      expect(decideCoup(view(tax, 'p1'), always(0.16))!.actions[0]).toMatchObject({ type: 'pass' });
      const two = declare(turnRoom(3, { p1: ['duke', 'duke'] }), 'tax');
      expect(decideCoup(view(two, 'p1'), always(0.4))!.actions[0]).toMatchObject({ type: 'challenge' });
      expect(decideCoup(view(two, 'p1'), always(0.5))!.actions[0]).toMatchObject({ type: 'pass' });
    });

    it('o alvo de um assassinato, com a última carta, duvida em dobro (30%)', () => {
      let room = lost(turnRoom(3, { p1: ['duke', 'duke'] }), 'p1'); // só sobra um duque
      room = declare(coins(room, 'p0', 3), 'assassinate', 'p1');
      const v = view(room, 'p1');
      expect(v.game.myCards).toHaveLength(1);
      expect(decideCoup(v, seq(0.9, 0.28))!.actions[0]).toMatchObject({ type: 'challenge' });
      expect(decideCoup(v, seq(0.9, 0.32, 0.9))!.actions[0]).toMatchObject({ type: 'pass' });
      // com as duas cartas, o mesmo sorteio não duvida
      const two = declare(coins(turnRoom(3, { p1: ['duke', 'duke'] }), 'p0', 3), 'assassinate', 'p1');
      expect(decideCoup(view(two, 'p1'), seq(0.9, 0.28, 0.9))!.actions[0]).toMatchObject({ type: 'pass' });
    });

    it('duvida do bloqueio pelo personagem que o bloqueador declarou', () => {
      let room = turnRoom(3, { p1: ['contessa', 'assassin'], p2: ['captain', 'captain'] });
      room = step(declare(room, 'steal', 'p1'), 'p1', { type: 'block', as: 'captain' });
      const v = view(room, 'p2'); // p2 tem 2 capitães: duvida com 45%
      expect(v.game.window!.kind).toBe('block');
      expect(v.game.can.block).toEqual([]);
      expect(decideCoup(v, always(0.4))!.actions[0]).toMatchObject({ type: 'challenge', windowId: v.game.window!.id });
      expect(decideCoup(view(room, 'p0'), always(0.14))!.actions[0]).toMatchObject({ type: 'challenge' });
    });

    it('na janela só de bloqueio (depois de uma dúvida errada), o alvo só bloqueia ou deixa', () => {
      let room = turnRoom(3, { p0: ['captain', 'duke'], p1: ['contessa', 'assassin'], p2: ['ambassador', 'ambassador'] });
      room = step(declare(room, 'steal', 'p1'), 'p2', { type: 'challenge' }); // p0 tem o capitão: p2 erra
      room = step(room, 'p2', { type: 'lose', card: 'ambassador' });
      const v = view(room, 'p1');
      expect(v.game.window!.kind).toBe('blockOnly');
      expect(v.game.can.challenge).toBe(false);
      expect(decideCoup(v, seq(0.9, 0.9, 0.9))!.actions).toEqual([{ type: 'pass', windowId: v.game.window!.id }]);
      expect(decideCoup(v, seq(0.2, 0))!.actions[0]).toMatchObject({ type: 'block' });
      expect(decideCoup(view(room, 'p0'), always(0.5))).toBeNull();
    });

    it('senão deixa; e 15% das vezes não responde (ação vazia: deixa o tempo correr)', () => {
      const tax = declare(turnRoom(3, { p1: ['contessa', 'assassin'] }), 'tax');
      const v = view(tax, 'p1');
      const pass = decideCoup(v, seq(0.9, 0.5))!;
      expect(pass.actions).toEqual([{ type: 'pass', windowId: v.game.window!.id }]);
      const quiet = decideCoup(v, seq(0.9, 0.1))!;
      expect(quiet.actions).toEqual([]);
      expect(quiet.key).toBe(pass.key);
      expect(quiet.delay).toBeGreaterThan(0);
    });

    it('espera de 1,5 a 7 s', () => {
      const v = view(declare(turnRoom(3, { p1: ['contessa', 'assassin'] }), 'tax'), 'p1');
      expect(decideCoup(v, seq(0.9, 0.9, 0))!.delay).toBe(1500);
      const hi = decideCoup(v, seq(0.9, 0.9, 0.999))!.delay;
      expect(hi).toBeGreaterThan(6990);
      expect(hi).toBeLessThanOrEqual(7000);
    });

    it('quem já deixou, ou não está na janela (o autor da ação), não faz nada', () => {
      let room = declare(turnRoom(3), 'tax');
      expect(decideCoup(view(room, 'p0'), always(0.5))).toBeNull();
      room = step(room, 'p1', { type: 'pass' });
      expect(decideCoup(view(room, 'p1'), always(0.5))).toBeNull();
      expect(decideCoup(view(room, 'p2'), always(0.5))).not.toBeNull();
    });
  });

  describe('chave da etapa', () => {
    it('é partida:tamanho do diário:id da janela (ou -)', () => {
      const room = turnRoom(3);
      const v = view(room, 'p0');
      expect(decideCoup(v, always(0.5))!.key).toBe(`${v.game.match}:${v.game.log.length}:-`);
      const w = view(declare(room, 'tax'), 'p1');
      expect(decideCoup(w, always(0.9))!.key).toBe(`${w.game.match}:${w.game.log.length}:${w.game.window!.id}`);
    });

    it('muda quando a etapa muda, e fica igual para a mesma etapa', () => {
      const room = turnRoom(3);
      const a = decideCoup(view(room, 'p0'), always(0.5))!.key;
      expect(decideCoup(view(room, 'p0'), always(0.1))!.key).toBe(a);
      const tax = declare(room, 'tax');
      expect(decideCoup(view(tax, 'p1'), always(0.9))!.key).not.toBe(a);
      expect(decideCoup(view(step(tax, 'p1', { type: 'pass' }), 'p2'), always(0.9))!.key).toBe(
        decideCoup(view(tax, 'p2'), always(0.9))!.key,
      );
    });

    it('o sorteio por chave é estável pra mesma (chave, bot) e muda com a chave ou com o bot', () => {
      expect(coupKeyRng('1:3:-', 'p1')()).toBe(coupKeyRng('1:3:-', 'p1')());
      expect(coupKeyRng('1:3:-', 'p1')()).not.toBe(coupKeyRng('1:4:-', 'p1')());
      expect(coupKeyRng('1:3:-', 'p1')()).not.toBe(coupKeyRng('1:3:-', 'p2')());
    });

    it('decideCoupStable dá a mesma decisão sempre que a etapa é a mesma', () => {
      const v = view(declare(turnRoom(3, { p1: ['contessa', 'assassin'] }), 'tax'), 'p1');
      const a = decideCoupStable(v)!;
      for (let i = 0; i < 20; i++) expect(decideCoupStable(v)).toEqual(a);
      expect(decideCoupStable(view(turnRoom(3), 'p1'))).toBeNull();
    });
  });

  describe('nada a fazer', () => {
    it('não faz nada fora da partida, de espectador, ou quando não é a vez', () => {
      expect(decideCoup(view(coupLobbyRoom(3), 'p0'), always(0.5))).toBeNull();
      const room = turnRoom(3);
      expect(decideCoup(view(room, null), always(0.5))).toBeNull();
      expect(decideCoup(view(room, 'ninguem'), always(0.5))).toBeNull();
      expect(decideCoup(view(room, 'p1'), always(0.5))).toBeNull();
      expect(decideCoup(view(room, 'p2'), always(0.5))).toBeNull();
    });

    it('não faz nada no fim da partida', () => {
      const room = edit(turnRoom(2), (s) => ({ ...s, phase: 'over', turn: null, winner: 'p0' }));
      expect(decideCoup(view(room, 'p0'), always(0.5))).toBeNull();
      expect(decideCoup(view(room, 'p1'), always(0.5))).toBeNull();
    });

    it('nunca faz ação de anfitrião (começar, jogar de novo)', () => {
      const rng = mulberry32(8);
      const rooms = [
        coupLobbyRoom(3),
        turnRoom(3),
        declare(turnRoom(3), 'tax'),
        edit(turnRoom(3), (s) => ({ ...s, phase: 'over', turn: null, winner: 'p0' })),
      ];
      for (const room of rooms)
        for (const p of ['p0', 'p1', 'p2', null])
          for (let i = 0; i < 20; i++)
            for (const a of decideCoup(view(room, p), rng)?.actions ?? []) expect(HOST_ACTIONS).not.toContain(a.type);
    });
  });
});

/**
 * Partida inteira só com bots: a hora anda, cada bot age uma vez por etapa (como a classe do bot),
 * as janelas fecham sozinhas pelo prazo. Nenhuma ação pode ser recusada pelo servidor.
 */
function playWholeMatch(players: number, seed: number): { winner: string | null; actions: number } {
  let room = coupRoom(players, seed);
  let now = T0;
  const done = new Set<string>();
  let actions = 0;
  for (let i = 0; i < 4000 && coupStateOf(room)!.phase !== 'over'; i++) {
    const candidates: { at: number; who: string; key: string; actions: NonNullable<ReturnType<typeof decideCoup>>['actions'] }[] = [];
    for (const who of coupStateOf(room)!.players) {
      const d = decideCoupStable(viewOf(room, who));
      if (!d || d.actions.length === 0 || done.has(`${who}|${d.key}`)) continue;
      candidates.push({ at: now + d.delay, who, key: d.key, actions: d.actions });
    }
    const w = coupStateOf(room)!.window;
    const next = candidates.sort((a, b) => a.at - b.at)[0];
    if (next && (!w || next.at < w.endsAt)) {
      now = Math.max(now, next.at);
      done.add(`${next.who}|${next.key}`);
      for (const a of next.actions) {
        room = step(room, next.who, a, now, seed + i); // lança se o servidor recusar
        actions++;
      }
    } else if (w) {
      now = w.endsAt;
      room = tick(room, now, mulberry32(seed + i));
    } else {
      throw new Error('travou: ninguém tem o que fazer fora de uma janela');
    }
  }
  return { winner: coupStateOf(room)!.winner, actions };
}

describe('partida inteira só com bots', () => {
  it.each([2, 3, 4, 5, COUP_MAX_PLAYERS])('termina sem ação recusada (%i jogadores)', (n) => {
    for (const seed of [1, 2, 3]) {
      const r = playWholeMatch(n, seed);
      expect(r.winner).not.toBeNull();
      expect(r.actions).toBeGreaterThan(5);
    }
  });
});
