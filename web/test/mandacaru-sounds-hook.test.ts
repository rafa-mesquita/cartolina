import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mandacaruStateOf, type MandacaruRoomView, type MandacaruView } from '@cartolina/shared';
import { playMandacaruSound } from '../src/games/mandacaru/sounds';
import { useMandacaruSounds } from '../src/games/mandacaru/useMandacaruSounds';
import type { ConnStatus } from '../src/net/connection';
import { T0, afterSetup, mandacaruRoom, step, viewOf, withGame } from './mandacaru-fixtures';

vi.mock('../src/games/mandacaru/sounds', () => ({ playMandacaruSound: vi.fn() }));

// Sala de 3 depois da preparação; quem vê é quem NÃO está na vez (pra a vez dele ser uma mudança).
const room = afterSetup(mandacaruRoom(3, 1));
const turn = mandacaruStateOf(room)!.turn!;
const me = mandacaruStateOf(room)!.players.find((p) => p !== turn)!;
const base: MandacaruRoomView = viewOf(room, me);

const com = (v: MandacaruRoomView, game: Partial<MandacaruView>): MandacaruRoomView => ({ ...v, game: { ...v.game, ...game } });
/** O Carcará pousando em `hex`: o terreno muda e entra a linha dele no diário (é a linha que dispara o pio). */
const pousa = (v: MandacaruRoomView, hex: number): Partial<MandacaruView> => ({
  carcara: hex,
  log: [...v.game.log, { t: 'carcara', player: turn, hex }],
});
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

  it('Carcará pousou (linha nova no diário): carcara, o pio; uma vez só por pouso', () => {
    const { rerender } = monta(base);
    const v = com(base, pousa(base, (base.game.carcara + 1) % 19));
    rerender({ view: v });
    rerender({ view: { ...v, game: { ...v.game } } });
    espera();
    expect(tocados()).toEqual(['carcara']);
  });

  it('Carcará pousou pela regra de verdade (7, descarte, Carcará): o pio toca', () => {
    // rola 7 na mão e leva o Carcará pra um terreno qualquer pelas regras
    const seven = withGame(room, (s) => ({ ...s, phase: 'carcara', rolled: true, afterCarcara: 'main', discards: {} }));
    const { rerender } = monta(viewOf(seven, me));
    const hex = viewOf(seven, turn).game.can.carcara[0]!;
    rerender({ view: viewOf(step(seven, turn, { type: 'move_carcara', hex }), me) });
    espera();
    expect(tocados()).toContain('carcara');
  });

  it('o terreno do Carcará mudar sem linha nova no diário não pia (ex.: partida nova sorteada)', () => {
    const { rerender } = monta(base);
    rerender({ view: com(base, { carcara: (base.game.carcara + 1) % 19 }) });
    espera();
    expect(tocados()).toEqual([]);
  });

  it('a visão que passa a vez pra você (pelas regras) toca turn uma vez só', () => {
    // quem vê é o próximo da ordem: quem está na vez rola e passa
    const next = mandacaruStateOf(room)!.players[(mandacaruStateOf(room)!.players.indexOf(turn) + 1) % 3]!;
    const rolled = withGame(step(room, turn, { type: 'roll' }), (s) => ({ ...s, phase: 'main', discards: {} }));
    const { rerender } = monta(viewOf(rolled, next));
    const passed = step(rolled, turn, { type: 'end_turn' });
    rerender({ view: viewOf(passed, next) });
    rerender({ view: viewOf(step(passed, next, { type: 'roll' }), next) });
    espera();
    expect(tocados().filter((t) => t === 'turn')).toEqual(['turn']);
  });

  it('preparação: toca turn em cada vez sua, inclusive nas duas seguidas da ordem em cobra', () => {
    let r = mandacaruRoom(3, 1);
    const order = mandacaruStateOf(r)!.players;
    const last = order[order.length - 1]!; // em cobra, o último joga duas vezes seguidas
    const { rerender } = monta(viewOf(r, last));
    for (let i = 0; i < 12; i++) {
      const s = mandacaruStateOf(r)!;
      if (s.phase !== 'setup') break;
      const can = viewOf(r, s.turn!).game.can;
      r = can.placeHouse.length
        ? step(r, s.turn!, { type: 'place_house', vertex: can.placeHouse[0]! })
        : step(r, s.turn!, { type: 'place_road', edge: can.placeRoad[0]! });
      rerender({ view: viewOf(r, last) });
    }
    espera();
    // vira a vez dele (casa+estrada) e, logo depois, a segunda seguida: dois chamados
    expect(tocados().filter((t) => t === 'turn')).toHaveLength(2);
  });

  it('descarte do 7 na vez de outro: turn (é com você); quem não precisa descartar não ouve', () => {
    const { rerender } = monta(base);
    const discard = withGame(room, (s) => ({ ...s, phase: 'discard', rolled: true, discards: { [me]: 4 }, discardEndsAt: T0 + 30_000 }));
    rerender({ view: viewOf(discard, me) });
    espera();
    expect(tocados()).toEqual(['turn']);
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
    const queda = com(base, { turn: me, ...pousa(base, (base.game.carcara + 1) % 19) });
    rerender({ view: queda });
    espera();
    expect(tocados()).toEqual([]);
    // depois disso volta a tocar
    rerender({ view: com(queda, { turn: me, ...pousa(queda, (base.game.carcara + 2) % 19) }) });
    espera();
    expect(tocados()).toEqual(['carcara']);
  });

  it('quem assiste não ouve card nem turn', () => {
    const watch = viewOf(room, null);
    const { rerender } = monta(watch);
    rerender({ view: com(watch, { turn: me, ...pousa(watch, (watch.game.carcara + 1) % 19) }) });
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
