import { act as rtlAct, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { mandacaruGeometry, mandacaruHouseSpots, mandacaruStateOf, type MandacaruRoomView, type MandacaruState, type Room } from '@cartolina/shared';
import { freshEntries } from '../src/games/mandacaru/Diary';
import { MandacaruTable } from '../src/games/mandacaru/MandacaruTable';
import { playMandacaruSound } from '../src/games/mandacaru/sounds';
import type { ConnStatus, GameConn } from '../src/net/connection';
import { T0, afterSetup, mandacaruRoom, step, viewOf, withGame } from './mandacaru-fixtures';

vi.mock('../src/games/mandacaru/sounds', () => ({
  playMandacaruSound: vi.fn(),
  installMandacaruAudioUnlock: vi.fn(() => () => {}),
}));

type Conn = GameConn & { sendAction: Mock<GameConn['sendAction']>; onError: Mock<GameConn['onError']> };

/** Conexão falsa: guarda os ouvintes de erro (pra `fail` avisar). */
function conn(): Conn {
  return {
    sendAction: vi.fn<GameConn['sendAction']>(),
    sendActivity: vi.fn(),
    sendCursor: vi.fn(),
    sendPing: vi.fn(),
    onFx: vi.fn(() => () => {}),
    onError: vi.fn<GameConn['onError']>(() => () => {}),
  };
}
const fail = (c: Conn, code: string, message: string) =>
  rtlAct(() => {
    for (const [listener] of c.onError.mock.calls) listener(code, message);
  });

function mesa(view: MandacaruRoomView, c: Conn = conn(), status: ConnStatus = 'joined') {
  return render(<MandacaruTable view={view} conn={c} serverOffset={0} status={status} />);
}

const res = (wood: number, brick: number, leather: number, beans: number, stone: number) => ({ wood, brick, leather, beans, stone });
const turnOf = (room: Room) => mandacaruStateOf(room)!.turn!;

/** Fase principal de quem está na vez (dados já rolados), com a mão dada. */
function mainWith(room: Room, hand: ReturnType<typeof res>, edit: (s: MandacaruState) => MandacaruState = (s) => s): Room {
  return withGame(room, (s) => edit({ ...s, phase: 'main', rolled: true, hands: { ...s.hands, [s.turn!]: { ...s.hands[s.turn!]!, res: hand } } }));
}

/** Põe estradas de `p` até ter um canto livre onde caiba casa (procura a partir das estradas da preparação). */
function roadsToHouseSpot(s: MandacaruState, p: string): MandacaruState {
  const geo = mandacaruGeometry();
  for (let e1 = 0; e1 < geo.edges.length; e1++) {
    if (s.roads[e1] !== null) continue;
    const touches = [geo.edges[e1]!.a, geo.edges[e1]!.b].some((v) => s.buildings[v]?.owner === p || geo.vertices[v]!.edges.some((x) => s.roads[x] === p));
    if (!touches) continue;
    const roads = s.roads.slice();
    roads[e1] = p;
    const next = { ...s, roads };
    if (mandacaruHouseSpots(next, p, false).length) return next;
  }
  throw new Error('não achei canto pra casa');
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('Mesa do Mandacaru: preparação', () => {
  it('na preparação, quem está na vez clica num canto e manda place_house', () => {
    const room = mandacaruRoom(3, 1);
    const turn = turnOf(room);
    const c = conn();
    mesa(viewOf(room, turn), c);
    const spots = screen.getAllByRole('button', { name: /casa no canto/ });
    expect(spots).toHaveLength(viewOf(room, turn).game.can.placeHouse.length);
    fireEvent.click(spots[0]!);
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'place_house', vertex: expect.any(Number) });
    expect(screen.getByText('sua vez · preparação')).toBeTruthy();
  });

  it('o lugar também vai pelo teclado (Enter)', () => {
    const room = mandacaruRoom(3, 1);
    const turn = turnOf(room);
    const c = conn();
    mesa(viewOf(room, turn), c);
    const spot = screen.getAllByRole('button', { name: /casa no canto/ })[0]!;
    fireEvent.keyDown(spot, { key: 'Enter' });
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'place_house', vertex: Number(spot.getAttribute('data-v')) });
  });

  it('depois da casa, os lados encostados nela pulsam e mandam place_road', () => {
    const room = mandacaruRoom(3, 1);
    const turn = turnOf(room);
    const vertex = viewOf(room, turn).game.can.placeHouse[0]!;
    const after = step(room, turn, { type: 'place_house', vertex });
    const c = conn();
    mesa(viewOf(after, turn), c);
    expect(screen.queryAllByRole('button', { name: /casa no canto/ })).toHaveLength(0);
    const roads = screen.getAllByRole('button', { name: /estrada no lado/ });
    expect(roads.length).toBeGreaterThan(0);
    fireEvent.click(roads[0]!);
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'place_road', edge: Number(roads[0]!.getAttribute('data-e')) });
  });

  it('quem não está na vez não vê lugares', () => {
    const room = mandacaruRoom(3, 1);
    const turn = turnOf(room);
    const other = ['p0', 'p1', 'p2'].find((p) => p !== turn)!;
    mesa(viewOf(room, other));
    expect(screen.queryAllByRole('button', { name: /casa no canto/ })).toHaveLength(0);
    expect(screen.getByText(/está escolhendo onde pôr a casa/)).toBeTruthy();
  });
});

describe('Mesa do Mandacaru: turno', () => {
  it('rolar os dados e passar a vez', () => {
    const room = afterSetup(mandacaruRoom(3, 1));
    const turn = turnOf(room);
    const c = conn();
    const { unmount } = mesa(viewOf(room, turn), c);
    fireEvent.click(screen.getByRole('button', { name: /rolar/ }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'roll' });
    // trava: o segundo clique na mesma visão não sai
    fireEvent.click(screen.getByRole('button', { name: /rolar/ }));
    expect(c.sendAction).toHaveBeenCalledTimes(1);
    unmount();
    const main = mainWith(room, res(0, 0, 0, 0, 0));
    const c2 = conn();
    mesa(viewOf(main, turn), c2);
    expect((screen.getByRole('button', { name: /rolar/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'passar a vez' }));
    expect(c2.sendAction).toHaveBeenCalledWith({ type: 'end_turn' });
  });

  it('construir casa: o botão liga os lugares e o clique manda build_house', () => {
    const base = afterSetup(mandacaruRoom(3, 1));
    const turn = turnOf(base);
    const room = mainWith(base, res(1, 1, 1, 1, 0), (s) => roadsToHouseSpot(s, turn));
    const view = viewOf(room, turn);
    expect(view.game.can.buildHouse.length).toBeGreaterThan(0);
    const c = conn();
    mesa(view, c);
    expect(screen.queryAllByRole('button', { name: /casa no canto/ })).toHaveLength(0);
    // sem pedra e feijão: vila e cordel apagados
    expect((screen.getByRole('button', { name: 'vila' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'cordel' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'casa' }));
    const spots = screen.getAllByRole('button', { name: /casa no canto/ });
    expect(spots.map((s) => Number(s.getAttribute('data-v')))).toEqual(view.game.can.buildHouse);
    expect(screen.getByText('clique num canto que pulsa')).toBeTruthy();
    fireEvent.click(spots[0]!);
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'build_house', vertex: view.game.can.buildHouse[0] });
    // casa é uma de cada vez: os lugares somem
    expect(screen.queryAllByRole('button', { name: /casa no canto/ })).toHaveLength(0);
  });

  it('estrada: liga e desliga pelo botão (e pelo Esc); o clique manda build_road', () => {
    const base = afterSetup(mandacaruRoom(3, 1));
    const turn = turnOf(base);
    const view = viewOf(mainWith(base, res(2, 2, 0, 0, 0)), turn);
    const c = conn();
    mesa(view, c);
    const btn = screen.getByRole('button', { name: 'estrada' });
    fireEvent.click(btn);
    expect(screen.getAllByRole('button', { name: /estrada no lado/ })).toHaveLength(view.game.can.buildRoad.length);
    fireEvent.click(btn);
    expect(screen.queryAllByRole('button', { name: /estrada no lado/ })).toHaveLength(0);
    fireEvent.click(btn);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryAllByRole('button', { name: /estrada no lado/ })).toHaveLength(0);
    fireEvent.click(btn);
    fireEvent.click(screen.getAllByRole('button', { name: /estrada no lado/ })[0]!);
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'build_road', edge: view.game.can.buildRoad[0] });
  });

  it('estrada: quando os lugares acabam, a peça é largada (não volta sozinha ao ganhar cartas)', () => {
    const base = afterSetup(mandacaruRoom(3, 1));
    const turn = turnOf(base);
    const rich = viewOf(mainWith(base, res(1, 1, 0, 0, 0)), turn);
    const broke = viewOf(mainWith(base, res(0, 0, 0, 0, 0)), turn);
    const c = conn();
    const { rerender } = mesa(rich, c);
    const again = (view: MandacaruRoomView) => rerender(<MandacaruTable view={view} conn={c} serverOffset={0} status="joined" />);
    fireEvent.click(screen.getByRole('button', { name: 'estrada' }));
    expect(screen.getAllByRole('button', { name: /estrada no lado/ }).length).toBeGreaterThan(0);
    again(broke);
    expect(screen.queryAllByRole('button', { name: /estrada no lado/ })).toHaveLength(0);
    again(rich);
    expect(screen.queryAllByRole('button', { name: /estrada no lado/ })).toHaveLength(0);
  });

  it('vila: as casas suas acendem e mandam build_city', () => {
    const base = afterSetup(mandacaruRoom(3, 1));
    const turn = turnOf(base);
    const view = viewOf(mainWith(base, res(0, 0, 0, 2, 3)), turn);
    const c = conn();
    mesa(view, c);
    fireEvent.click(screen.getByRole('button', { name: 'vila' }));
    const spots = screen.getAllByRole('button', { name: /vila no canto/ });
    expect(spots).toHaveLength(2);
    fireEvent.click(spots[1]!);
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'build_city', vertex: view.game.can.buildCity[1] });
  });

  it('Carcará: os terrenos acendem e mandam move_carcara', () => {
    const base = afterSetup(mandacaruRoom(3, 1));
    const turn = turnOf(base);
    const room = withGame(base, (s) => ({ ...s, phase: 'carcara', rolled: true, afterCarcara: 'main' }));
    const c = conn();
    mesa(viewOf(room, turn), c);
    const spots = screen.getAllByRole('button', { name: /Carcará no terreno/ });
    expect(spots).toHaveLength(18);
    fireEvent.click(spots[3]!);
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'move_carcara', hex: Number(spots[3]!.getAttribute('data-h')) });
  });

  it('roubo com mais de uma vítima: botões com os nomes', () => {
    const base = afterSetup(mandacaruRoom(3, 1));
    const turn = turnOf(base);
    const room = withGame(base, (s) => ({ ...s, phase: 'steal', rolled: true, afterCarcara: 'main' }));
    const v = viewOf(room, turn);
    const c = conn();
    // as vítimas vêm do `can` (aqui forçado: a regra decide quem tem casa no terreno)
    mesa({ ...v, game: { ...v.game, can: { ...v.game.can, steal: v.game.players.filter((p) => p !== turn) } } }, c);
    const others = v.game.players.filter((p) => p !== turn);
    const name = (id: string) => v.seats.find((s) => s.id === id)!.name;
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name(others[1]!)}`) }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'steal', from: others[1] });
  });

  it('cordéis na mão: agrupados, "novo" e "jogar" do Vaqueiro manda play_vaqueiro', () => {
    const base = afterSetup(mandacaruRoom(3, 1));
    const turn = turnOf(base);
    const room = withGame(base, (s) => ({
      ...s,
      hands: {
        ...s.hands,
        [turn]: {
          ...s.hands[turn]!,
          cordeis: [
            { kind: 'vaqueiro', fresh: false },
            { kind: 'vaqueiro', fresh: true },
            { kind: 'point', fresh: false },
          ],
        },
      },
    }));
    const c = conn();
    const { container } = mesa(viewOf(room, turn), c);
    const vaq = container.querySelector('[data-cordel="vaqueiro"]')!;
    expect(vaq.textContent).toContain('×2');
    expect(vaq.textContent).toContain('1 novo');
    expect(container.querySelector('[data-cordel="point"]')!.textContent).toContain('Igrejinha');
    fireEvent.click(screen.getByRole('button', { name: 'jogar Vaqueiro' }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'play_vaqueiro' });
  });

  it('trocar e feira: apagados antes dos dados, acesos na fase principal', () => {
    const base = afterSetup(mandacaruRoom(3, 1));
    const turn = turnOf(base);
    const { unmount } = mesa(viewOf(base, turn));
    expect((screen.getByRole('button', { name: /trocar/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'feira' }) as HTMLButtonElement).disabled).toBe(true);
    unmount();
    mesa(viewOf(mainWith(base, res(4, 0, 0, 0, 0)), turn));
    expect((screen.getByRole('button', { name: /trocar/ }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: 'feira' }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('Mesa do Mandacaru: avisos, relógio, jogadores e diário', () => {
  it('erro do servidor vira aviso e destrava', () => {
    const room = afterSetup(mandacaruRoom(3, 1));
    const turn = turnOf(room);
    const c = conn();
    mesa(viewOf(room, turn), c);
    fireEvent.click(screen.getByRole('button', { name: /rolar/ }));
    fail(c, 'bad_phase', 'Agora não dá pra fazer isso.');
    expect(screen.getByRole('status').textContent).toContain('Agora não dá pra fazer isso.');
    expect(playMandacaruSound).toHaveBeenCalledWith('error');
    fireEvent.click(screen.getByRole('button', { name: /rolar/ }));
    expect(c.sendAction).toHaveBeenCalledTimes(2);
  });

  it('a trava solta sozinha depois de 4 s', () => {
    const room = afterSetup(mandacaruRoom(3, 1));
    const turn = turnOf(room);
    const c = conn();
    mesa(viewOf(room, turn), c);
    fireEvent.click(screen.getByRole('button', { name: /rolar/ }));
    rtlAct(() => {
      vi.advanceTimersByTime(4000);
    });
    fireEvent.click(screen.getByRole('button', { name: /rolar/ }));
    expect(c.sendAction).toHaveBeenCalledTimes(2);
  });

  it('a trava segura uns 400 ms mesmo com visão nova chegando (clique duplo não manda 2)', () => {
    const room = afterSetup(mandacaruRoom(3, 1));
    const turn = turnOf(room);
    const v = viewOf(room, turn);
    const c = conn();
    const { rerender } = mesa(v, c);
    const again = (view: MandacaruRoomView) => rerender(<MandacaruTable view={view} conn={c} serverOffset={0} status="joined" />);
    fireEvent.click(screen.getByRole('button', { name: /rolar/ }));
    // chegou a visão de outra coisa no meio do clique duplo: ainda travado
    again({ ...v });
    fireEvent.click(screen.getByRole('button', { name: /rolar/ }));
    expect(c.sendAction).toHaveBeenCalledTimes(1);
    rtlAct(() => {
      vi.advanceTimersByTime(400);
    });
    fireEvent.click(screen.getByRole('button', { name: /rolar/ }));
    expect(c.sendAction).toHaveBeenCalledTimes(2);
    // passados os 400 ms sem visão nova, segue travado até ela chegar
    rtlAct(() => {
      vi.advanceTimersByTime(500);
    });
    fireEvent.click(screen.getByRole('button', { name: /rolar/ }));
    expect(c.sendAction).toHaveBeenCalledTimes(2);
    again({ ...v });
    fireEvent.click(screen.getByRole('button', { name: /rolar/ }));
    expect(c.sendAction).toHaveBeenCalledTimes(3);
  });

  it('depois de reconectar, as linhas da queda não chacoalham os dados (o welcome chega antes da visão)', () => {
    const room = afterSetup(mandacaruRoom(3, 1));
    const turn = turnOf(room);
    const c = conn();
    const v = viewOf(room, turn);
    const { container, rerender } = mesa(v, c);
    const again = (view: MandacaruRoomView, status: ConnStatus) =>
      rerender(<MandacaruTable view={view} conn={c} serverOffset={0} status={status} />);
    again(v, 'reconnecting');
    // welcome: o status volta a 'joined' ainda com a visão velha
    again(v, 'joined');
    // a visão nova traz o que aconteceu na queda (dados rolados)
    const rolled = step(room, turn, { type: 'roll' });
    again(viewOf(rolled, turn), 'joined');
    expect(container.querySelector('.mc-soma.on')).toBeNull();
    expect(container.querySelectorAll('.mc-dado.rolando')).toHaveLength(0);
    // dali pra frente, linhas novas voltam a valer
    const passed = withGame(rolled, (s) => ({ ...s, phase: 'main' }));
    const ended = step(passed, turn, { type: 'end_turn' });
    const rolled2 = step(ended, turnOf(ended), { type: 'roll' });
    again(viewOf(rolled2, turn), 'joined');
    expect(container.querySelector('.mc-soma.on')).toBeTruthy();
  });

  it('relógio do turno: corre, fica vermelho no último minuto', () => {
    const room = afterSetup(mandacaruRoom(3, 1));
    const turn = turnOf(room);
    const ends = mandacaruStateOf(room)!.turnEndsAt!;
    vi.setSystemTime(ends - 61_000);
    const { container } = mesa(viewOf(room, turn));
    expect(container.querySelector('.mc-relogio')!.textContent).toBe('1:01');
    expect(container.querySelector('.mc-relogio.pouco')).toBeNull();
    rtlAct(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(container.querySelector('.mc-relogio')!.textContent).toBe('0:59');
    expect(container.querySelector('.mc-relogio.pouco')).toBeTruthy();
  });

  it('relógio parado quando turnEndsAt é null', () => {
    const room = withGame(afterSetup(mandacaruRoom(3, 1)), (s) => ({ ...s, turnEndsAt: null }));
    mesa(viewOf(room, 'p0'));
    expect(screen.getByText(/parado/)).toBeTruthy();
  });

  it('jogadores na ordem da partida, com a vez marcada e "saiu" pra quem desconectou', () => {
    const room = afterSetup(mandacaruRoom(3, 1));
    const v = viewOf(room, 'p0');
    const off = { ...v, seats: v.seats.map((s) => (s.id === 'p2' ? { ...s, connected: false } : s)) };
    const { container } = mesa(off);
    const seats = [...container.querySelectorAll('.mc-seat')];
    expect(seats.map((s) => s.getAttribute('data-seat'))).toEqual(v.game.players);
    expect(container.querySelector('.mc-seat.vez')!.getAttribute('data-seat')).toBe(v.game.turn);
    expect(container.querySelector('[data-seat="p2"]')!.textContent).toContain('saiu');
    expect(container.querySelector('[data-seat="p0"]')!.textContent).toContain('você');
    expect(container.querySelector('[data-seat="p0"] .mc-seat-pts')!.textContent).toContain('2');
  });

  it('diário: as 8 últimas, a mais nova em cima', () => {
    const room = afterSetup(mandacaruRoom(3, 1));
    const v = viewOf(room, 'p0');
    const { container } = mesa(v);
    const lines = [...container.querySelectorAll('.mc-log li')];
    expect(lines).toHaveLength(8);
    expect(v.game.log.length).toBeGreaterThan(8);
    expect(lines[0]!.textContent).toMatch(/pôs uma estrada|ganhou/);
    expect(screen.getByRole('heading', { name: 'diário' })).toBeTruthy();
  });

  it('dados rolados: a soma aparece grande e some', () => {
    const room = afterSetup(mandacaruRoom(3, 1));
    const turn = turnOf(room);
    const c = conn();
    const { container, rerender } = mesa(viewOf(room, turn), c);
    expect(container.querySelector('.mc-soma.on')).toBeNull();
    const rolled = step(room, turn, { type: 'roll' });
    rerender(<MandacaruTable view={viewOf(rolled, turn)} conn={c} serverOffset={0} status="joined" />);
    const dice = mandacaruStateOf(rolled)!.dice!;
    const soma = container.querySelector('.mc-soma.on')!;
    expect(soma.textContent).toContain(String(dice[0] + dice[1]));
    expect(container.querySelectorAll('.mc-dado.rolando')).toHaveLength(2);
    // a mesa liga os sons: dados rolados tocam
    expect(playMandacaruSound).toHaveBeenCalledWith('dice');
    rtlAct(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(container.querySelector('.mc-soma.on')).toBeNull();
  });

  it('quem assiste vê o tabuleiro e o aviso', () => {
    const { container } = mesa(viewOf(mandacaruRoom(3, 1), null));
    expect(screen.getByText(/assistindo/)).toBeTruthy();
    expect(container.querySelectorAll('.mc-board path').length).toBeGreaterThan(19);
    expect(screen.queryAllByRole('button', { name: /casa no canto/ })).toHaveLength(0);
  });
});

describe('freshEntries', () => {
  const e = (n: number) => ({ t: 'end_turn' as const, player: `p${n}` });
  it('sem visão anterior, nada; com entradas novas, só elas; com o diário cortado no começo, acha pelo fim', () => {
    expect(freshEntries(null, [e(1)])).toEqual([]);
    expect(freshEntries([e(1), e(2)], [e(1), e(2), e(3)])).toEqual([e(3)]);
    expect(freshEntries([e(1), e(2), e(3)], [e(2), e(3), e(4), e(5)])).toEqual([e(4), e(5)]);
    expect(freshEntries([e(1), e(2)], [e(1), e(2)])).toEqual([]);
    expect(freshEntries([e(7), e(8)], [e(1)])).toEqual([e(1)]);
  });
});
