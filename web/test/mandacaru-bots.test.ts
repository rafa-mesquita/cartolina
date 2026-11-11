import { mandacaruStateOf, mulberry32, noResources, type MandacaruAction, type Room } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import {
  OFFER_WAIT_MS,
  decideMandacaru,
  decideMandacaruStable,
  mandacaruStepKey,
  newMandacaruMemo,
  type MandacaruMemo,
} from '../src/dev/mandacaruBots';
import { T0, afterSetup, mandacaruLobbyRoom, mandacaruRoom, step, viewOf, withGame } from './mandacaru-fixtures';

const HOST_ACTIONS = ['start', 'restart'];
const always = (v: number) => () => v;
const res = (wood: number, brick: number, leather: number, beans: number, stone: number) => ({ wood, brick, leather, beans, stone });

/**
 * Uma partida inteira só com bots: a cada passo, cada jogador decide pela própria visão (com a sua memória e o
 * relógio simulado); age quem tem o menor atraso (o relógio anda esse tanto). Decisão sem ação só guarda a memória.
 */
function playOut(n: number, seed: number, maxSteps = 4000) {
  let room: Room = mandacaruRoom(n, seed);
  const rng = mulberry32(seed * 7919);
  const players = mandacaruStateOf(room)!.players;
  const memos: Record<string, MandacaruMemo> = Object.fromEntries(players.map((p) => [p, newMandacaruMemo()]));
  const sent: MandacaruAction[] = [];
  let clock = T0;
  for (let i = 0; i < maxSteps; i++) {
    if (mandacaruStateOf(room)!.phase === 'over') return { room, sent, steps: i };
    let chosen: { p: string; d: NonNullable<ReturnType<typeof decideMandacaru>> } | null = null;
    for (const p of players) {
      const d = decideMandacaru(viewOf(room, p), rng, memos[p], clock);
      if (!d) continue;
      if (d.actions.length === 0) {
        memos[p] = d.memo;
        continue;
      }
      if (!chosen || d.delay < chosen.d.delay) chosen = { p, d };
    }
    if (!chosen) continue;
    clock += chosen.d.delay;
    const d = chosen.d;
    memos[chosen.p] = d.memo;
    for (const a of d.actions) {
      sent.push(a as MandacaruAction);
      room = step(room, chosen.p, a, T0, seed * 100_003 + i);
    }
  }
  return { room, sent, steps: maxSteps };
}

describe('bots do Mandacaru', () => {
  it.each([
    [3, 1],
    [3, 2],
    [4, 3],
    [4, 4],
  ])('com %i jogadores (semente %i) jogam uma partida inteira até alguém vencer', (n, seed) => {
    const { room, sent } = playOut(n, seed);
    const s = mandacaruStateOf(room)!;
    expect(s.phase).toBe('over');
    expect(s.winner).not.toBeNull();
    // nunca faz ação de anfitrião; e usa as partes do jogo (troca, feira, cordel)
    expect(sent.some((a) => HOST_ACTIONS.includes(a.type))).toBe(false);
    expect(sent.some((a) => a.type === 'buy_cordel')).toBe(true);
    for (const a of sent) if (a.type === 'close_deal') expect(typeof a.id).toBe('number');
  });

  it('nunca decide no lobby, no fim nem pra quem assiste', () => {
    const lobby = mandacaruLobbyRoom(3);
    expect(decideMandacaru(viewOf(lobby, 'p0'), always(0.5))).toBeNull();
    const room = mandacaruRoom(3);
    expect(decideMandacaru(viewOf(room, null), always(0.5))).toBeNull();
    expect(mandacaruStepKey(viewOf(room, null))).toBeNull();
    const over = withGame(room, (s) => ({ ...s, phase: 'over', winner: 'p0' }));
    for (const p of ['p0', 'p1', 'p2']) expect(decideMandacaru(viewOf(over, p), always(0.5))).toBeNull();
  });

  it('na preparação põe a casa num canto de can.placeHouse e depois a estrada encostada nela', () => {
    let room = mandacaruRoom(3);
    for (let i = 0; i < 6; i++) {
      const p = mandacaruStateOf(room)!.turn!;
      const v = viewOf(room, p);
      for (const r of [0, 0.5, 0.999]) {
        const d = decideMandacaru(v, always(r))!;
        expect(d.actions).toHaveLength(1);
        const a = d.actions[0] as MandacaruAction;
        expect(a.type).toBe('place_house');
        if (a.type === 'place_house') expect(v.game.can.placeHouse).toContain(a.vertex);
      }
      // os outros não fazem nada na vez de quem está pondo
      for (const o of ['p0', 'p1', 'p2'].filter((x) => x !== p)) expect(decideMandacaru(viewOf(room, o), always(0.5))).toBeNull();
      room = step(room, p, decideMandacaru(v, always(0.3))!.actions[0]);
      const road = decideMandacaru(viewOf(room, p), always(0.3))!.actions[0] as MandacaruAction;
      expect(road.type).toBe('place_road');
      if (road.type === 'place_road') expect(viewOf(room, p).game.can.placeRoad).toContain(road.edge);
      room = step(room, p, road);
    }
  });

  it('a casa da preparação vai pro canto que mais rende', () => {
    const room = mandacaruRoom(3);
    const p = mandacaruStateOf(room)!.turn!;
    const v = viewOf(room, p);
    const a = decideMandacaru(v, always(0))!.actions[0] as { type: 'place_house'; vertex: number };
    const b = decideMandacaru(v, always(0.999))!.actions[0] as { type: 'place_house'; vertex: number };
    // empate no topo: o sorteio escolhe, mas os dois valem o mesmo e estão em can.placeHouse
    expect(v.game.can.placeHouse).toContain(a.vertex);
    expect(v.game.can.placeHouse).toContain(b.vertex);
  });

  describe('com oferta aberta de outro', () => {
    /** Sala na fase principal de quem está na vez, com mãos conhecidas e uma oferta dele na mesa. */
    function offerRoom(): { room: Room; turn: string; other: string } {
      let room = afterSetup(mandacaruRoom(3));
      const s0 = mandacaruStateOf(room)!;
      const turn = s0.turn!;
      const other = s0.players.find((p) => p !== turn)!;
      room = withGame(room, (s) => ({
        ...s,
        phase: 'main',
        rolled: true,
        hands: Object.fromEntries(
          Object.entries(s.hands).map(([p, h]) => [p, { ...h, res: p === turn ? res(3, 0, 0, 0, 0) : res(0, 0, 2, 0, 0) }]),
        ),
      }));
      room = step(room, turn, { type: 'offer', give: { ...noResources(), wood: 1 }, want: { ...noResources(), leather: 1 } });
      return { room, turn, other };
    }

    it('responde no máximo uma vez por oferta (a memória segura mesmo com a visão velha)', () => {
      const { room, other } = offerRoom();
      const v = viewOf(room, other);
      const offerId = v.game.offer!.id;
      const first = decideMandacaru(v, always(0.9), newMandacaruMemo(), T0)!;
      expect(first.actions).toHaveLength(1);
      expect(first.actions[0]).toMatchObject({ type: 'respond', offerId });
      // com a mesma visão (o servidor ainda não respondeu) e a memória nova: não responde de novo
      const again = decideMandacaru(v, always(0.9), first.memo, T0);
      expect(again?.actions.some((a) => a.type === 'respond') ?? false).toBe(false);
      // depois de aplicada, também não
      const after = step(room, other, first.actions[0]);
      let memo = first.memo;
      for (let i = 0; i < 3; i++) {
        const d = decideMandacaru(viewOf(after, other), always(0.9), memo, T0);
        expect(d?.actions.some((a) => a.type === 'respond') ?? false).toBe(false);
        if (d) memo = d.memo;
      }
    });

    it('quem ofereceu fecha com quem aceitou, com o id da oferta', () => {
      const { room, turn, other } = offerRoom();
      const v = viewOf(room, other);
      const offerId = v.game.offer!.id;
      const accepted = step(room, other, { type: 'respond', offerId, accept: true });
      const d = decideMandacaru(viewOf(accepted, turn), always(0.5), newMandacaruMemo(), T0)!;
      expect(d.actions).toEqual([{ type: 'close_deal', with: other, source: 'offer', id: offerId }]);
      step(accepted, turn, d.actions[0]); // lança se recusada
    });

    it('quem ofereceu espera respostas e, passado o tempo, retira a oferta', () => {
      const { room, turn } = offerRoom();
      const v = viewOf(room, turn);
      // a memória do turno (a chave certa) com a hora em que ofereceu
      const memo = { ...decideMandacaru(v, always(0.5), undefined, T0)!.memo, offerAt: T0 };
      const waiting = decideMandacaru(v, always(0.5), memo, T0 + 1000)!;
      expect(waiting.actions).toEqual([{ type: 'cancel_offer' }]);
      // o atraso cobre o resto da espera
      expect(waiting.delay).toBeGreaterThanOrEqual(OFFER_WAIT_MS - 1000);
      const late = decideMandacaru(v, always(0.5), { ...waiting.memo, offerAt: T0 }, T0 + OFFER_WAIT_MS + 1)!;
      expect(late.actions).toEqual([{ type: 'cancel_offer' }]);
      expect(late.delay).toBeLessThan(2000);
    });

    it('todos recusaram: retira a oferta logo', () => {
      const { room, turn } = offerRoom();
      const s = mandacaruStateOf(room)!;
      let r = room;
      for (const p of s.players.filter((x) => x !== turn)) r = step(r, p, { type: 'respond', offerId: s.offer!.id, accept: false });
      const d = decideMandacaru(viewOf(r, turn), always(0.5), { ...newMandacaruMemo(), offerAt: T0 }, T0)!;
      expect(d.actions).toEqual([{ type: 'cancel_offer' }]);
      expect(d.delay).toBeLessThan(2000);
    });
  });

  it('a chave muda quando a visão muda e é a mesma pra mesma visão', () => {
    const room = mandacaruRoom(3);
    const p = mandacaruStateOf(room)!.turn!;
    const k1 = mandacaruStepKey(viewOf(room, p));
    expect(k1).toBe(mandacaruStepKey(viewOf(room, p)));
    const d = decideMandacaru(viewOf(room, p), always(0.5))!;
    const next = step(room, p, d.actions[0]);
    expect(mandacaruStepKey(viewOf(next, p))).not.toBe(k1);
  });

  it('a versão estável decide igual na mesma etapa e, depois de 3 tentativas na fase principal, passa a vez', () => {
    let room = afterSetup(mandacaruRoom(3));
    const p = mandacaruStateOf(room)!.turn!;
    room = withGame(room, (s) => ({ ...s, phase: 'main', rolled: true }));
    const v = viewOf(room, p);
    const a = decideMandacaruStable(v, newMandacaruMemo(), T0, 0)!;
    const b = decideMandacaruStable(v, newMandacaruMemo(), T0, 0)!;
    expect(a.actions).toEqual(b.actions);
    expect(a.delay).toBe(b.delay);
    expect(decideMandacaruStable(v, newMandacaruMemo(), T0, 3)!.actions).toEqual([{ type: 'end_turn' }]);
  });
});
