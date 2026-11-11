import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mandacaruStateOf, type MandacaruRoomView, type MandacaruView } from '@cartolina/shared';
import { playMandacaruSound } from '../src/games/mandacaru/sounds';
import { useMandacaruSounds } from '../src/games/mandacaru/useMandacaruSounds';
import type { ConnStatus } from '../src/net/connection';
import { afterSetup, mandacaruRoom, step, viewOf, withGame } from './mandacaru-fixtures';

vi.mock('../src/games/mandacaru/sounds', () => ({ playMandacaruSound: vi.fn() }));

// Sala de 3 depois da preparação; quem vê é quem NÃO está na vez (pra a vez dele ser uma mudança).
const room = afterSetup(mandacaruRoom(3, 1));
const turn = mandacaruStateOf(room)!.turn!;
const me = mandacaruStateOf(room)!.players.find((p) => p !== turn)!;
const base: MandacaruRoomView = viewOf(room, me);

const com = (v: MandacaruRoomView, game: Partial<MandacaruView>): MandacaruRoomView => ({ ...v, game: { ...v.game, ...game } });
const tocados = () => vi.mocked(playMandacaruSound).mock.calls.map((c) => c[0]);

type Props = { view: MandacaruRoomView; status?: ConnStatus };
function monta(view: MandacaruRoomView) {
  return renderHook((p: Props) => useMandacaruSounds(p.view, p.status ?? 'joined'), { initialProps: { view } as Props });
}
/** Avança o tempo pra fila de sons tocar toda. */
const espera = () => act(() => void vi.advanceTimersByTime(2_000));

describe('useMandacaruSounds', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(playMandacaruSound).mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it('na primeira visão não toca nada, nem com a vez sua e o diário cheio', () => {
    monta(com(base, { turn: me }));
    espera();
    expect(tocados()).toEqual([]);
  });

  it('vindo do lobby: a primeira visão toca turn se a vez já é sua (e só isso)', () => {
    const mine = com(base, { turn: me, carcara: (base.game.carcara + 1) % 19 });
    renderHook(() => useMandacaruSounds(mine, 'joined', 'lobby'));
    espera();
    expect(tocados()).toEqual(['turn']);
  });

  it('vindo do lobby, sem ser a sua vez: nada', () => {
    renderHook(() => useMandacaruSounds(base, 'joined', 'lobby'));
    espera();
    expect(tocados()).toEqual([]);
  });

  it('o fromPhase só vale na primeira visão', () => {
    const other = base.game.players.find((p) => p !== me && p !== turn)!;
    const { rerender } = renderHook((p: { view: MandacaruRoomView }) => useMandacaruSounds(p.view, 'joined', 'lobby'), {
      initialProps: { view: base },
    });
    rerender({ view: com(base, { turn: other }) });
    espera();
    expect(tocados()).toEqual([]);
  });

  it('mesma visão de novo não toca nada', () => {
    const { rerender } = monta(base);
    rerender({ view: { ...base } });
    rerender({ view: com(base, {}) });
    espera();
    expect(tocados()).toEqual([]);
  });

  it('dados rolados: dice (e card se a sua mão ganhou carta)', () => {
    const { rerender } = monta(base);
    const rolled = step(room, turn, { type: 'roll' });
    const v = viewOf(rolled, me);
    rerender({ view: v });
    espera();
    const before = Object.values(base.game.myRes!).reduce((a, b) => a + b, 0);
    const after = Object.values(v.game.myRes!).reduce((a, b) => a + b, 0);
    expect(tocados()[0]).toBe('dice');
    expect(tocados().includes('card')).toBe(after > before);
  });

  it('prédio ou estrada novos: build', () => {
    const { rerender } = monta(base);
    const roads = base.game.roads.slice();
    roads[roads.findIndex((r) => r === null)] = turn;
    rerender({ view: com(base, { roads }) });
    const buildings = base.game.buildings.map((b) => (b?.owner === turn ? { ...b, kind: 'city' as const } : b));
    rerender({ view: com(base, { roads, buildings }) });
    espera();
    expect(tocados()).toEqual(['build', 'build']);
  });

  it('sua mão ganhou carta: card; perder carta não toca', () => {
    const { rerender } = monta(base);
    const res = base.game.myRes!;
    rerender({ view: com(base, { myRes: { ...res, wood: res.wood + 1 } }) });
    rerender({ view: com(base, { myRes: res }) });
    rerender({ view: com(base, { myRes: res, myCordeis: [{ kind: 'point', fresh: true }] }) });
    espera();
    expect(tocados()).toEqual(['card', 'card']);
  });

  it('Carcará mudou de terreno: carcara', () => {
    const { rerender } = monta(base);
    rerender({ view: com(base, { carcara: (base.game.carcara + 1) % 19 }) });
    espera();
    expect(tocados()).toEqual(['carcara']);
  });

  it('virou sua vez: turn (uma vez só); a vez dos outros não toca', () => {
    const other = base.game.players.find((p) => p !== me && p !== turn)!;
    const { rerender } = monta(base);
    rerender({ view: com(base, { turn: other }) });
    rerender({ view: com(base, { turn: me }) });
    rerender({ view: com(base, { turn: me, rolled: true }) });
    espera();
    expect(tocados()).toEqual(['turn']);
  });

  it('fim da partida: win', () => {
    const { rerender } = monta(base);
    const over = withGame(room, (s) => ({ ...s, phase: 'over', winner: turn }));
    rerender({ view: viewOf(over, me) });
    espera();
    expect(tocados()).toEqual(['win']);
  });

  it('ao reconectar, a primeira visão nova só vira base', () => {
    const { rerender } = monta(base);
    rerender({ view: base, status: 'reconnecting' });
    rerender({ view: base, status: 'joined' });
    rerender({ view: com(base, { turn: me, carcara: (base.game.carcara + 1) % 19 }) });
    espera();
    expect(tocados()).toEqual([]);
    // depois disso volta a tocar
    rerender({ view: com(base, { turn: me, carcara: (base.game.carcara + 2) % 19 }) });
    espera();
    expect(tocados()).toEqual(['carcara']);
  });

  it('quem assiste não ouve card nem turn', () => {
    const watch = viewOf(room, null);
    const { rerender } = monta(watch);
    rerender({ view: com(watch, { turn: me, carcara: (watch.game.carcara + 1) % 19 }) });
    espera();
    expect(tocados()).toEqual(['carcara']);
  });

  it('sons da mesma mudança saem espaçados', () => {
    const { rerender } = monta(base);
    const res = base.game.myRes!;
    rerender({ view: com(base, { turn: me, myRes: { ...res, stone: res.stone + 1 } }) });
    expect(tocados()).toEqual(['card']);
    espera();
    expect(tocados()).toEqual(['card', 'turn']);
  });
});
