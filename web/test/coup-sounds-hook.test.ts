import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoupLogEntry, CoupRoomView, CoupView } from '@cartolina/shared';
import { playCoupSound } from '../src/games/coup/sounds';
import { useCoupSounds, type CoupClock } from '../src/games/coup/useCoupSounds';
import { coupRoom, viewOf } from './coup-fixtures';

vi.mock('../src/games/coup/sounds', () => ({ playCoupSound: vi.fn() }));

// Sala de 3 (Ana p0, Beto p1, Caio p2); quem vê é a Ana. Cada teste parte da visão inicial e a altera.
const base: CoupRoomView = viewOf(coupRoom(3), 'p0');
const win = (id = 1) => ({ id, kind: 'action' as const, eligible: ['p0', 'p1'], passed: [], endsAt: 5_000 });

/** Visão com o jogo alterado (a original não muda). */
function com(v: CoupRoomView, game: Partial<CoupView>): CoupRoomView {
  return { ...v, game: { ...v.game, ...game } };
}
/** Visão da vez de `turn` (fase 'turn'). */
const vezDe = (v: CoupRoomView, turn: string) => com(v, { phase: 'turn', turn });
/** Visão com as moedas de `id` trocadas. */
const moedas = (v: CoupRoomView, id: string, coins: number) =>
  com(v, { seats: v.game.seats.map((s) => (s.id === id ? { ...s, coins } : s)) });
/** Visão com entradas novas no diário. */
const diario = (v: CoupRoomView, ...novas: CoupLogEntry[]) => com(v, { log: [...v.game.log, ...novas] });

const tocados = () => vi.mocked(playCoupSound).mock.calls.map((c) => c[0]);

type Props = { view: CoupRoomView; clock: CoupClock | null };
function monta(view: CoupRoomView, clock: CoupClock | null = null) {
  return renderHook((p: Props) => useCoupSounds(p.view, p.clock), { initialProps: { view, clock } });
}

describe('useCoupSounds', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(playCoupSound).mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it('na primeira visão não toca nada, nem com a vez sua, moedas ou diário cheio', () => {
    const cheia = diario(vezDe(moedas(base, 'p0', 7), 'p0'), { t: 'act', actor: 'p1', kind: 'tax', target: null });
    monta(cheia);
    act(() => void vi.advanceTimersByTime(2_000));
    expect(tocados()).toEqual([]);
  });

  it('mudar nada (mesma visão de novo) não toca nada', () => {
    const v = vezDe(base, 'p1');
    const { rerender } = monta(v);
    rerender({ view: { ...v }, clock: null });
    rerender({ view: com(v, {}), clock: null });
    expect(tocados()).toEqual([]);
  });

  it('turn quando a vez passa a ser sua (e só uma vez)', () => {
    const v1 = vezDe(base, 'p1');
    const { rerender } = monta(v1);
    const v2 = vezDe(base, 'p0');
    rerender({ view: v2, clock: null });
    expect(tocados()).toEqual(['turn']);
    rerender({ view: com(v2, {}), clock: null });
    expect(tocados()).toEqual(['turn']);
    // passa pra outro e volta: toca de novo
    rerender({ view: vezDe(base, 'p2'), clock: null });
    rerender({ view: v2, clock: null });
    expect(tocados()).toEqual(['turn', 'turn']);
  });

  it('a vez dos outros e a janela de reação na sua vez não tocam turn', () => {
    const { rerender } = monta(vezDe(base, 'p1'));
    rerender({ view: vezDe(base, 'p2'), clock: null });
    rerender({ view: com(vezDe(base, 'p0'), { phase: 'reaction' }), clock: null });
    expect(tocados()).toEqual([]);
  });

  it('coin quando as suas moedas sobem; descer ou subir as dos outros não toca', () => {
    const v0 = vezDe(base, 'p1');
    const { rerender } = monta(v0);
    rerender({ view: moedas(v0, 'p1', 9), clock: null });
    expect(tocados()).toEqual([]);
    const subiu = moedas(v0, 'p0', base.game.seats[0]!.coins + 1);
    rerender({ view: subiu, clock: null });
    expect(tocados()).toEqual(['coin']);
    rerender({ view: moedas(v0, 'p0', 0), clock: null });
    expect(tocados()).toEqual(['coin']);
  });

  it('declare só pra declaração de outro (act e block); a sua não toca', () => {
    const { rerender } = monta(base);
    const v1 = diario(base, { t: 'act', actor: 'p1', kind: 'tax', target: null });
    rerender({ view: v1, clock: null });
    expect(tocados()).toEqual(['declare']);
    const v2 = diario(v1, { t: 'act', actor: 'p0', kind: 'income', target: null });
    rerender({ view: v2, clock: null });
    const v3 = diario(v2, { t: 'block', by: 'p2', as: 'duke' });
    rerender({ view: v3, clock: null });
    const v4 = diario(v3, { t: 'block', by: 'p0', as: 'duke' });
    rerender({ view: v4, clock: null });
    expect(tocados()).toEqual(['declare', 'declare']);
  });

  it('dúvida: challenge e, 260 ms depois, bluff (ou reveal se tinha a carta)', () => {
    const { rerender } = monta(base);
    const v1 = diario(base, { t: 'challenge', by: 'p1', of: 'p2', claim: 'duke', had: false });
    rerender({ view: v1, clock: null });
    expect(tocados()).toEqual(['challenge']);
    act(() => void vi.advanceTimersByTime(259));
    expect(tocados()).toEqual(['challenge']);
    act(() => void vi.advanceTimersByTime(1));
    expect(tocados()).toEqual(['challenge', 'bluff']);

    vi.mocked(playCoupSound).mockClear();
    rerender({ view: diario(v1, { t: 'challenge', by: 'p2', of: 'p1', claim: 'captain', had: true }), clock: null });
    act(() => void vi.advanceTimersByTime(300));
    expect(tocados()).toEqual(['challenge', 'reveal']);
  });

  it('lose só quando é você quem perde a carta', () => {
    const { rerender } = monta(base);
    const v1 = diario(base, { t: 'lose', player: 'p1', card: 'duke' });
    rerender({ view: v1, clock: null });
    expect(tocados()).toEqual([]);
    rerender({ view: diario(v1, { t: 'lose', player: 'p0', card: 'contessa' }), clock: null });
    expect(tocados()).toEqual(['lose']);
  });

  it('win quando você vence, end quando é outro (e pra quem assiste)', () => {
    const { rerender } = monta(base);
    rerender({ view: diario(base, { t: 'win', player: 'p0' }), clock: null });
    expect(tocados()).toEqual(['win']);

    vi.mocked(playCoupSound).mockClear();
    const outro = monta(base);
    outro.rerender({ view: diario(base, { t: 'win', player: 'p2' }), clock: null });
    expect(tocados()).toEqual(['end']);

    vi.mocked(playCoupSound).mockClear();
    const plateia = viewOf(coupRoom(3), null);
    const assiste = monta(plateia);
    assiste.rerender({ view: diario(plateia, { t: 'win', player: 'p0' }), clock: null });
    expect(tocados()).toEqual(['end']);
  });

  it('sons juntos saem espaçados de 260 ms, sem repetir o mesmo nome', () => {
    const v0 = vezDe(base, 'p2');
    const { rerender } = monta(v0);
    // numa mesma visão: declaração de outro + dúvida + sua vez + suas moedas
    const v1 = moedas(
      vezDe(
        diario(
          v0,
          { t: 'act', actor: 'p1', kind: 'tax', target: null },
          { t: 'challenge', by: 'p2', of: 'p1', claim: 'duke', had: true },
        ),
        'p0',
      ),
      'p0',
      9,
    );
    rerender({ view: v1, clock: null });
    expect(tocados()).toEqual(['declare']);
    act(() => void vi.advanceTimersByTime(260));
    expect(tocados()).toEqual(['declare', 'challenge']);
    act(() => void vi.advanceTimersByTime(260));
    expect(tocados()).toEqual(['declare', 'challenge', 'reveal']);
    act(() => void vi.advanceTimersByTime(260));
    expect(tocados()).toEqual(['declare', 'challenge', 'reveal', 'turn']);
    act(() => void vi.advanceTimersByTime(260));
    expect(tocados()).toEqual(['declare', 'challenge', 'reveal', 'turn', 'coin']);
    act(() => void vi.advanceTimersByTime(5_000));
    expect(tocados()).toHaveLength(5);
  });

  it('desmontar cancela os sons que ainda estavam na fila', () => {
    const { rerender, unmount } = monta(base);
    rerender({ view: diario(base, { t: 'challenge', by: 'p1', of: 'p2', claim: 'duke', had: true }), clock: null });
    unmount();
    act(() => void vi.advanceTimersByTime(1_000));
    expect(tocados()).toEqual(['challenge']);
  });

  it('partida nova recomeça a conta do diário e da vez', () => {
    const v1 = moedas(diario(base, { t: 'act', actor: 'p1', kind: 'tax', target: null }), 'p0', 0);
    const { rerender } = monta(v1);
    // o diário da partida 2 é menor que o da 1, já começa na vez de p0 e suas moedas (2) são mais que as 0 de antes
    const nova = com(base, { match: base.game.match + 1, phase: 'turn', turn: 'p0', log: [{ t: 'start', first: 'p0' }] });
    rerender({ view: nova, clock: null });
    expect(tocados()).toEqual(['turn']);
    // nem coin (subir de 0 pra 2 entre partidas não é ganhar moeda) nem declare (a entrada 'start' não conta)
    act(() => void vi.advanceTimersByTime(1_000));
    expect(tocados()).toEqual(['turn']);
  });

  describe('tique da janela', () => {
    const reacao = (v: CoupRoomView, pass: boolean, id = 1) =>
      com(v, { phase: 'reaction', turn: 'p1', window: win(id), can: { ...v.game.can, pass } });
    const relogio = (ms: number, expired = false): CoupClock => ({ msLeft: ms, expired });

    it('tick uma vez por segundo nos 3 últimos, só com can.pass', () => {
      const v = reacao(base, true);
      const { rerender } = monta(v, relogio(10_000));
      rerender({ view: v, clock: relogio(4_000) });
      expect(tocados()).toEqual([]);
      rerender({ view: v, clock: relogio(3_000) }); // 3
      expect(tocados()).toEqual(['tick']);
      rerender({ view: v, clock: relogio(2_700) }); // ainda 3
      rerender({ view: v, clock: relogio(2_000) }); // 2
      expect(tocados()).toEqual(['tick', 'tick']);
      rerender({ view: v, clock: relogio(1_000) }); // 1
      expect(tocados()).toEqual(['tick', 'tick', 'tick']);
      rerender({ view: v, clock: relogio(0, true) }); // venceu: sem tique
      expect(tocados()).toHaveLength(3);
    });

    it('sem can.pass (já reagiu, não é elegível) não tica', () => {
      const v = reacao(base, false);
      const { rerender } = monta(v, relogio(10_000));
      for (const ms of [3_000, 2_000, 1_000]) rerender({ view: v, clock: relogio(ms) });
      expect(tocados()).toEqual([]);
    });

    it('janela nova tica de novo no mesmo segundo; fora de janela (clock null) não tica', () => {
      const v = reacao(base, true, 1);
      const { rerender } = monta(v, relogio(10_000));
      rerender({ view: v, clock: relogio(2_500) });
      expect(tocados()).toEqual(['tick']);
      rerender({ view: reacao(base, true, 2), clock: relogio(2_500) });
      expect(tocados()).toEqual(['tick', 'tick']);
      rerender({ view: vezDe(base, 'p1'), clock: null });
      expect(tocados()).toEqual(['tick', 'tick']);
    });

    it('a pessoa clicar "deixa" (can.pass vira false) no meio da contagem silencia o tique', () => {
      const v = reacao(base, true);
      const { rerender } = monta(v, relogio(10_000));
      rerender({ view: v, clock: relogio(3_000) });
      rerender({ view: reacao(base, false), clock: relogio(2_000) });
      rerender({ view: reacao(base, false), clock: relogio(1_000) });
      expect(tocados()).toEqual(['tick']);
    });
  });
});
