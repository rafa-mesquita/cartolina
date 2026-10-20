import { act as rtlAct, fireEvent, render, screen } from '@testing-library/react';
import { Fragment, StrictMode, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { PLAYER_COLORS, joinRoom, type CamelioView, type Room } from '@cartolina/shared';
import { playTurnAnim, type AnimOptions } from '../src/games/camelio/anim';
import { CamelioTable } from '../src/games/camelio/CamelioTable';
import { playCamelioSound } from '../src/games/camelio/sounds';
import type { GameConn } from '../src/net/connection';
import { narrate } from '../src/games/camelio/narrate';
import { namer } from '../src/games/dixit/status';
import { camelioView, patchGame, play, started, stateOf, playTurn } from './camelio-fixtures';

vi.mock('../src/games/camelio/sounds', async (original) => ({
  ...(await original<typeof import('../src/games/camelio/sounds')>()),
  playCamelioSound: vi.fn(),
}));
vi.mock('../src/games/camelio/anim', () => ({
  playTurnAnim: vi.fn(() => ({ done: Promise.resolve(), stop: vi.fn() })),
}));

/** Deixa a virada (mockada) terminar: o `done` dela resolve num microtask. */
const flush = () => rtlAct(async () => {});

interface Manual {
  prev: CamelioView;
  next: CamelioView;
  opts: AnimOptions;
  finish: () => void;
  stop: Mock<() => void>;
}
/** Viradas com o fim controlado pelo teste: cada chamada empilha uma em `runs`. */
function manualAnims(): Manual[] {
  const runs: Manual[] = [];
  vi.mocked(playTurnAnim).mockImplementation((_root, prev, next, opts) => {
    let finish!: () => void;
    const done = new Promise<void>((res) => (finish = res));
    const stop = vi.fn(() => finish());
    // a anim de verdade põe a frase no letreiro logo no começo
    opts.say(`virada ${next.playCount}`);
    runs.push({ prev, next, opts, finish, stop });
    return { done, stop };
  });
  return runs;
}
/** Termina a virada `run` e deixa o React andar. */
const finishRun = (run: Manual) =>
  rtlAct(async () => {
    run.finish();
  });

type Conn = GameConn & { sendAction: Mock<GameConn['sendAction']>; onError: Mock<GameConn['onError']> };

const conn = (): Conn => ({
  sendAction: vi.fn<GameConn['sendAction']>(),
  sendActivity: vi.fn(),
  sendCursor: vi.fn(),
  sendPing: vi.fn(),
  onFx: vi.fn(() => () => {}),
  onError: vi.fn<GameConn['onError']>(() => () => {}),
});

/** Avisa todos os ouvintes de erro registrados na conexão falsa. */
const fail = (c: Conn, code: string, message: string) =>
  rtlAct(() => {
    for (const [listener] of c.onError.mock.calls) listener(code, message);
  });

/** Avança o relógio falso (o letreiro troca com fade de 120 ms). */
const tick = (ms: number) =>
  rtlAct(() => {
    vi.advanceTimersByTime(ms);
  });

const banner = (container: HTMLElement) => container.querySelector('.cl-banner')!.textContent;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.mocked(playTurnAnim).mockImplementation(() => ({ done: Promise.resolve(), stop: vi.fn() }));
});

describe('mesa do Cama-Leão', () => {
  it('com 3 jogadores: os 2 assentos dos outros, a sua mesa, o monte (71) e a carta aberta', () => {
    const { container } = render(<CamelioTable view={camelioView(started(3), 'p0')} conn={conn()} />);
    expect(screen.getByLabelText('mesa de P1')).toBeTruthy();
    expect(screen.getByLabelText('mesa de P2')).toBeTruthy();
    expect(screen.getByLabelText('sua mesa')).toBeTruthy();
    expect(screen.getByLabelText('monte').textContent).toContain('71');
    expect(screen.getByLabelText('carta aberta').querySelector('.lift > .card.front')).toBeTruthy();
    // os outros ficam no arco; o seu assento fica dentro da sua mesa
    expect(container.querySelectorAll('.cl-seats .seat[data-pid]')).toHaveLength(2);
    expect(container.querySelector('.cl-mine .seat[data-pid="p0"]')).toBeTruthy();
    expect(container.querySelector('.cl-info')!.textContent).toContain('monte 71');
  });

  it('a pilha mostra a soma certa (x/5) depois de uma jogada', async () => {
    const room = started(3);
    const c = conn();
    const { container, rerender } = render(<CamelioTable view={camelioView(room, 'p0')} conn={c} />);
    const turn = stateOf(room).turn!;
    const next = camelioView(playTurn(room), 'p0');
    rerender(<CamelioTable view={next} conn={c} />);
    await flush();
    const table = next.game.table[turn]!;
    expect(table).toHaveLength(1);
    const color = table[table.length - 1]!.color;
    const sum = table.filter((x) => x.color === color).reduce((n, x) => n + x.spheres, 0);
    const el = container.querySelector(`.seat[data-pid="${turn}"] .stack[data-color="${color}"] .sum`);
    expect(el!.textContent).toBe(`${sum}/5`);
    expect(el!.classList.contains('hot')).toBe(sum === 4);
  });

  it('desconectado aparece apagado, com "caiu"', () => {
    const v = camelioView(started(3), 'p0');
    const view = { ...v, seats: v.seats.map((s) => (s.id === 'p2' ? { ...s, connected: false } : s)) };
    render(<CamelioTable view={view} conn={conn()} />);
    const seat = screen.getByLabelText('mesa de P2');
    expect(seat.classList.contains('off')).toBe(true);
    expect(seat.textContent).toContain('caiu');
    expect(screen.getByLabelText('mesa de P1').textContent).not.toContain('caiu');
  });

  it('espectador vê a mesa de todo mundo e "você está assistindo esta partida" no lugar da sua', () => {
    const res = joinRoom(started(3), { token: 't9', name: 'Zé', color: PLAYER_COLORS[5]! }, 'p9', 0);
    if (!res.ok) throw new Error(res.error);
    const room: Room = res.room;
    const { container } = render(<CamelioTable view={camelioView(room, 'p9')} conn={conn()} />);
    expect(screen.getByText('você está assistindo esta partida')).toBeTruthy();
    expect(screen.queryByLabelText('sua mesa')).toBeNull();
    expect(container.querySelectorAll('.cl-seats .seat[data-pid]')).toHaveLength(3);
    const turn = stateOf(room).turn!;
    expect(container.querySelector('.cl-banner')!.textContent).toBe(`vez de P${turn.slice(1)}`);
  });

  it('a vez de quem joga: holofote no assento e, se for a sua, a dica no letreiro e o som de "sua vez"', () => {
    const room = started(3);
    const turn = stateOf(room).turn!;
    const { container } = render(<CamelioTable view={camelioView(room, turn)} conn={conn()} />);
    expect(container.querySelector('.cl-mine')!.classList.contains('myturn')).toBe(true);
    expect(container.querySelector(`.cl-mine .seat[data-pid="${turn}"]`)!.classList.contains('turn')).toBe(true);
    expect(container.querySelector('.cl-banner')!.textContent).toContain('sua vez:');
    expect(vi.mocked(playCamelioSound)).toHaveBeenCalledWith('turn');
  });

  it('recusa do servidor vira aviso no palco (erro de entrada na sala não)', () => {
    const c = conn();
    render(<CamelioTable view={camelioView(started(3), 'p0')} conn={c} />);
    fail(c, 'room_full', 'A sala está cheia.');
    expect(screen.queryByText('A sala está cheia.')).toBeNull();
    fail(c, 'not_your_turn', 'Não é a sua vez.');
    expect(screen.getByText('Não é a sua vez.')).toBeTruthy();
    expect(vi.mocked(playCamelioSound)).toHaveBeenCalledWith('error');
  });

  it('os outros sentam na ordem depois de quem vê', () => {
    const { container } = render(<CamelioTable view={camelioView(started(4), 'p1')} conn={conn()} />);
    const pids = [...container.querySelectorAll<HTMLElement>('.cl-seats .seat[data-pid]')].map((s) => s.dataset.pid);
    expect(pids).toEqual(['p2', 'p3', 'p0']);
  });
});

describe('mesa do Cama-Leão: o letreiro', () => {
  it('a frase da jogada fica um pouco e depois entra a dica da sua vez', async () => {
    const room = started(3);
    const nextRoom = playTurn(room);
    const me = stateOf(nextRoom).turn!;
    const c = conn();
    const { container, rerender } = render(<CamelioTable view={camelioView(room, me)} conn={c} />);
    const next = camelioView(nextRoom, me);
    rerender(<CamelioTable view={next} conn={c} />);
    await flush();
    tick(200);
    const phrase = narrate(next.game.last, namer(next));
    expect(phrase).not.toBe('');
    expect(banner(container)).toBe(phrase);
    tick(1100);
    tick(200);
    expect(banner(container)).toContain('sua vez:');
  });

  it('pausa tira a frase da jogada na hora', async () => {
    const room = started(3);
    const nextRoom = playTurn(room);
    const c = conn();
    const { container, rerender } = render(<CamelioTable view={camelioView(room, 'p0')} conn={c} />);
    rerender(<CamelioTable view={camelioView(nextRoom, 'p0')} conn={c} />);
    await flush();
    tick(200);
    expect(banner(container)).not.toContain('pausado');
    rerender(<CamelioTable view={camelioView(patchGame(nextRoom, { paused: true }), 'p0')} conn={c} />);
    tick(200);
    expect(banner(container)).toBe('pausado: esperando a galera voltar');
  });

  it('no fim mostra quem ganhou e por quê', () => {
    const room = patchGame(started(3), { phase: 'over', winners: ['p1'], endReason: 'target', turn: null });
    const { container } = render(<CamelioTable view={camelioView(room, 'p0')} conn={conn()} />);
    expect(banner(container)).toBe('fim: P1 ganhou! chegou a 3 cores');
  });

  it('o som de "sua vez" toca uma vez só, mesmo com a mesa redesenhada', () => {
    const room = started(3);
    const me = stateOf(room).turn!;
    const c = conn();
    const { rerender } = render(<CamelioTable view={camelioView(room, me)} conn={c} />);
    rerender(<CamelioTable view={camelioView(room, me)} conn={c} />);
    rerender(<CamelioTable view={camelioView(room, me)} conn={c} />);
    const turns = vi.mocked(playCamelioSound).mock.calls.filter(([s]) => s === 'turn');
    expect(turns).toHaveLength(1);
  });
});

describe('mesa do Cama-Leão: o clique', () => {
  /** Partida de 3 vista por quem tem a vez, e um dos outros. */
  const myTurn = () => {
    const room = started(3);
    const me = stateOf(room).turn!;
    const other = stateOf(room).players.find((p) => p !== me)!;
    return { room, me, other, otherLabel: `mesa de P${other.slice(1)}` };
  };

  it('na sua vez, clicar na carta aberta e depois na mesa de alguém manda a jogada', () => {
    const { room, me, other, otherLabel } = myTurn();
    const c = conn();
    render(<CamelioTable view={camelioView(room, me)} conn={c} />);
    fireEvent.click(screen.getByLabelText('carta aberta'));
    expect(screen.getByLabelText('carta aberta').classList.contains('picked')).toBe(true);
    // com a carta levantada, quem pode receber fica marcado
    expect(screen.getByLabelText(otherLabel).classList.contains('target')).toBe(true);
    fireEvent.click(screen.getByLabelText(otherLabel));
    expect(c.sendAction).toHaveBeenCalledTimes(1);
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'play', from: 'open', to: other });
  });

  it('clicar no monte e depois na sua mesa manda do monte pra você', () => {
    const { room, me } = myTurn();
    const c = conn();
    render(<CamelioTable view={camelioView(room, me)} conn={c} />);
    fireEvent.click(screen.getByLabelText('monte'));
    fireEvent.click(screen.getByLabelText('sua mesa'));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'play', from: 'deck', to: me });
  });

  it('fora da sua vez, clicar não manda nada', () => {
    const { room, me, other } = myTurn();
    const c = conn();
    render(<CamelioTable view={camelioView(room, other)} conn={c} />);
    fireEvent.click(screen.getByLabelText('carta aberta'));
    expect(screen.getByLabelText('carta aberta').classList.contains('picked')).toBe(false);
    expect(screen.getByText('Não é a sua vez.')).toBeTruthy();
    fireEvent.click(screen.getByLabelText(`mesa de P${me.slice(1)}`));
    fireEvent.click(screen.getByLabelText('sua mesa'));
    expect(c.sendAction).not.toHaveBeenCalled();
  });

  it('assento desconectado não recebe carta', () => {
    const { room, me, other, otherLabel } = myTurn();
    const v = camelioView(room, me);
    const view = { ...v, seats: v.seats.map((s) => (s.id === other ? { ...s, connected: false } : s)) };
    const c = conn();
    render(<CamelioTable view={view} conn={c} />);
    fireEvent.click(screen.getByLabelText('carta aberta'));
    expect(screen.getByLabelText(otherLabel).classList.contains('target')).toBe(false);
    fireEvent.click(screen.getByLabelText(otherLabel));
    expect(c.sendAction).not.toHaveBeenCalled();
  });

  it('Escape solta a carta levantada', () => {
    const { room, me, otherLabel } = myTurn();
    const c = conn();
    render(<CamelioTable view={camelioView(room, me)} conn={c} />);
    fireEvent.click(screen.getByLabelText('carta aberta'));
    expect(screen.getByLabelText('carta aberta').classList.contains('picked')).toBe(true);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByLabelText('carta aberta').classList.contains('picked')).toBe(false);
    fireEvent.click(screen.getByLabelText(otherLabel));
    expect(c.sendAction).not.toHaveBeenCalled();
  });

  it('com a carta levantada o letreiro guia o gesto (e a frase da jogada anterior sai na hora)', async () => {
    const room = started(3);
    const nextRoom = playTurn(room);
    const me = stateOf(nextRoom).turn!;
    const c = conn();
    const { container, rerender } = render(<CamelioTable view={camelioView(room, me)} conn={c} />);
    const next = camelioView(nextRoom, me);
    rerender(<CamelioTable view={next} conn={c} />);
    await flush();
    tick(200);
    expect(banner(container)).toBe(narrate(next.game.last, namer(next)));
    fireEvent.click(screen.getByLabelText('carta aberta'));
    tick(200);
    expect(banner(container)).toBe('agora clique na mesa de alguém (a sua também vale) · Esc desfaz');
    fireEvent.keyDown(window, { key: 'Escape' });
    tick(200);
    expect(banner(container)).toContain('sua vez:');
  });

  it('arrastar (depois de 6 px) mostra o clone, apaga a original e o Esc devolve', () => {
    const { room, me } = myTurn();
    const c = conn();
    const { container } = render(<CamelioTable view={camelioView(room, me)} conn={c} />);
    const open = screen.getByLabelText('carta aberta');
    fireEvent.pointerDown(open.querySelector('.lift > .card')!, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { pointerId: 1, buttons: 1, clientX: 103, clientY: 100 });
    expect(container.querySelector('.drag-clone')).toBeNull(); // menos de 6 px ainda é clique
    fireEvent.pointerMove(window, { pointerId: 1, buttons: 1, clientX: 120, clientY: 100 });
    expect(container.querySelector('.cl-stage .drag-clone .card.front')).toBeTruthy();
    expect(open.classList.contains('dragging')).toBe(true);
    expect(container.querySelector('.cl-stage')!.classList.contains('drag-on')).toBe(true);
    tick(200);
    expect(banner(container)).toBe('solte na mesa de alguém (a sua também vale) · Esc desfaz');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(container.querySelector('.drag-clone')).toBeNull();
    expect(open.classList.contains('dragging')).toBe(false);
    expect(c.sendAction).not.toHaveBeenCalled();
  });

  it('soltar numa mesa manda a jogada e o clone espera o servidor: erro ou 4 s devolvem, o eco tira', () => {
    const { room, me, other, otherLabel } = myTurn();
    const c = conn();
    const { container, rerender } = render(<CamelioTable view={camelioView(room, me)} conn={c} />);
    const seat = screen.getByLabelText(otherLabel);
    // jsdom não faz layout: o que está "embaixo do ponteiro" é sempre a mesa do outro
    const under = vi.fn(() => seat.querySelector('.head'));
    Object.defineProperty(document, 'elementFromPoint', { value: under, configurable: true });
    const drop = () => {
      const card = screen.getByLabelText('carta aberta').querySelector('.lift > .card')!;
      fireEvent.pointerDown(card, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(window, { pointerId: 1, buttons: 1, clientX: 130, clientY: 60 });
      expect(seat.classList.contains('hover')).toBe(true);
      fireEvent.pointerUp(window, { pointerId: 1, clientX: 130, clientY: 60 });
    };
    try {
      drop();
      expect(c.sendAction).toHaveBeenLastCalledWith({ type: 'play', from: 'open', to: other });
      expect(container.querySelector('.drag-clone')).toBeTruthy(); // parado onde caiu
      expect(screen.getByLabelText('carta aberta').classList.contains('dragging')).toBe(true);
      // recusa: volta pro lugar (sem animação no jsdom, some na hora)
      fail(c, 'cant_receive', 'Essa pessoa não pode receber carta agora.');
      expect(container.querySelector('.drag-clone')).toBeNull();
      expect(screen.getByLabelText('carta aberta').classList.contains('dragging')).toBe(false);
      // 4 s sem eco: volta também
      drop();
      expect(c.sendAction).toHaveBeenCalledTimes(2);
      tick(3900);
      expect(container.querySelector('.drag-clone')).toBeTruthy();
      tick(200);
      expect(container.querySelector('.drag-clone')).toBeNull();
      // o eco chega: o clone sai (a Task 8 faz a virada nascer dali)
      drop();
      expect(container.querySelector('.drag-clone')).toBeTruthy();
      const echoed = play(room, me, { type: 'play', from: 'open', to: other });
      rerender(<CamelioTable view={camelioView(echoed, me)} conn={c} />);
      expect(container.querySelector('.drag-clone')).toBeNull();
      expect(screen.getByLabelText('carta aberta').classList.contains('dragging')).toBe(false);
    } finally {
      Reflect.deleteProperty(document, 'elementFromPoint');
    }
  });

  it('depois de mandar, não dá pra jogar de novo até o servidor responder (e um erro libera)', () => {
    const { room, me, otherLabel } = myTurn();
    const c = conn();
    render(<CamelioTable view={camelioView(room, me)} conn={c} />);
    fireEvent.click(screen.getByLabelText('carta aberta'));
    fireEvent.click(screen.getByLabelText(otherLabel));
    fireEvent.click(screen.getByLabelText('carta aberta'));
    fireEvent.click(screen.getByLabelText(otherLabel));
    expect(c.sendAction).toHaveBeenCalledTimes(1);
    fail(c, 'cant_receive', 'Essa pessoa não pode receber carta agora.');
    fireEvent.click(screen.getByLabelText('carta aberta'));
    fireEvent.click(screen.getByLabelText(otherLabel));
    expect(c.sendAction).toHaveBeenCalledTimes(2);
  });
});

describe('mesa do Cama-Leão: a virada', () => {
  const deckTxt = () => screen.getByLabelText('monte').textContent;

  it('jogada nova: anima de prev pra next uma vez, e a mesa fica na de antes até o fim', async () => {
    const runs = manualAnims();
    const room = started(3);
    const c = conn();
    const first = camelioView(room, 'p0');
    const { container, rerender } = render(<CamelioTable view={first} conn={c} />);
    const next = camelioView(playTurn(room), 'p0');
    expect(next.game.deckCount).not.toBe(71);
    rerender(<CamelioTable view={next} conn={c} />);
    expect(playTurnAnim).toHaveBeenCalledTimes(1);
    expect(runs[0]!.prev).toBe(first.game);
    expect(runs[0]!.next).toBe(next.game);
    expect(runs[0]!.opts.dropFrom).toBeNull();
    expect(runs[0]!.opts.layout('p0', 3)).toEqual({ w: 64, gap: 14, pad: 8 }); // a sua mesa
    // redesenhos no meio não reiniciam a virada
    rerender(<CamelioTable view={next} conn={c} />);
    tick(200);
    expect(playTurnAnim).toHaveBeenCalledTimes(1);
    expect(deckTxt()).toContain('71');
    expect(banner(container)).toBe('virada 1');
    await finishRun(runs[0]!);
    expect(deckTxt()).toContain(String(next.game.deckCount));
    expect(deckTxt()).not.toContain('71');
    expect(playTurnAnim).toHaveBeenCalledTimes(1);
  });

  it('duas jogadas chegando durante a virada: a segunda anima depois da primeira', async () => {
    const runs = manualAnims();
    const room = started(3);
    const r1 = playTurn(room);
    const r2 = playTurn(r1);
    const c = conn();
    const { rerender } = render(<CamelioTable view={camelioView(room, 'p0')} conn={c} />);
    const v1 = camelioView(r1, 'p0');
    const v2 = camelioView(r2, 'p0');
    rerender(<CamelioTable view={v1} conn={c} />);
    rerender(<CamelioTable view={v2} conn={c} />);
    expect(playTurnAnim).toHaveBeenCalledTimes(1);
    await finishRun(runs[0]!);
    expect(playTurnAnim).toHaveBeenCalledTimes(2);
    expect(runs[1]!.prev).toBe(v1.game);
    expect(runs[1]!.next).toBe(v2.game);
    expect(deckTxt()).toContain(String(v1.game.deckCount));
    // o `done` atrasado da primeira não pula a segunda
    await finishRun(runs[0]!);
    expect(deckTxt()).toContain(String(v1.game.deckCount));
    await finishRun(runs[1]!);
    expect(deckTxt()).toContain(String(v2.game.deckCount));
  });

  it('partida nova no meio da virada: para a animação e vai direto, sem animar', async () => {
    const runs = manualAnims();
    const room = started(3);
    const r1 = playTurn(room);
    const c = conn();
    const { rerender } = render(<CamelioTable view={camelioView(room, 'p0')} conn={c} />);
    rerender(<CamelioTable view={camelioView(r1, 'p0')} conn={c} />);
    expect(playTurnAnim).toHaveBeenCalledTimes(1);
    const fresh = play(patchGame(r1, { phase: 'over', turn: null, winners: ['p0'], endReason: 'target' }), 'p0', { type: 'again' });
    const v = camelioView(fresh, 'p0');
    expect(v.game.match).not.toBe(stateOf(r1).match);
    rerender(<CamelioTable view={v} conn={c} />);
    expect(runs[0]!.stop).toHaveBeenCalled();
    await flush();
    expect(playTurnAnim).toHaveBeenCalledTimes(1);
    expect(deckTxt()).toContain(String(v.game.deckCount));
    expect(screen.queryByRole('region', { name: 'fim da partida' })).toBeNull();
  });

  it('na sua jogada, o letreiro fica com a frase da virada (sem "sua vez")', async () => {
    const runs = manualAnims();
    const room = started(3);
    const me = stateOf(room).turn!;
    const c = conn();
    const { container, rerender } = render(<CamelioTable view={camelioView(room, me)} conn={c} />);
    rerender(<CamelioTable view={camelioView(playTurn(room), me)} conn={c} />);
    tick(200);
    expect(banner(container)).toBe('virada 1');
    expect(container.querySelector('.cl-mine')!.classList.contains('myturn')).toBe(true); // a mesa parada na de antes
    expect(container.querySelector('.target, .picked')).toBeNull();
    await finishRun(runs[0]!);
    tick(200);
    expect(banner(container)).not.toContain('sua vez');
  });

  it('desmontar no meio da virada só para a animação', async () => {
    const runs = manualAnims();
    const room = started(3);
    const c = conn();
    const { rerender, unmount } = render(<CamelioTable view={camelioView(room, 'p0')} conn={c} />);
    rerender(<CamelioTable view={camelioView(playTurn(room), 'p0')} conn={c} />);
    unmount();
    expect(runs[0]!.stop).toHaveBeenCalled();
    await flush();
  });

  it.each([false, true])('arrasto: a virada da sua jogada nasce do ponto da soltura (StrictMode: %s)', (strict) => {
    const runs = manualAnims();
    const room = started(3);
    const me = stateOf(room).turn!;
    const other = stateOf(room).players.find((p) => p !== me)!;
    const c = conn();
    const Wrap = strict ? StrictMode : Fragment;
    const { container, rerender: rr } = render(
      <Wrap>
        <CamelioTable view={camelioView(room, me)} conn={c} />
      </Wrap>,
    );
    const rerender = (ui: ReactElement) => rr(<Wrap>{ui}</Wrap>);
    const seat = screen.getByLabelText(`mesa de P${other.slice(1)}`);
    Object.defineProperty(document, 'elementFromPoint', { value: () => seat.querySelector('.head'), configurable: true });
    try {
      const card = screen.getByLabelText('carta aberta').querySelector('.lift > .card')!;
      fireEvent.pointerDown(card, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(window, { pointerId: 1, buttons: 1, clientX: 130, clientY: 60 });
      fireEvent.pointerUp(window, { pointerId: 1, clientX: 130, clientY: 60 });
      expect(container.querySelector('.drag-clone')).toBeTruthy();
      rerender(<CamelioTable view={camelioView(play(room, me, { type: 'play', from: 'open', to: other }), me)} conn={c} />);
      expect(container.querySelector('.drag-clone')).toBeNull();
      // toda chamada (inclusive a repetida do StrictMode) recebe o ponto: o efeito guarda por animação
      expect(runs.length).toBeGreaterThan(0);
      for (const run of runs) expect(run.opts.dropFrom).toMatchObject({ from: 'open' });
    } finally {
      Reflect.deleteProperty(document, 'elementFromPoint');
    }
  });
});

describe('mesa do Cama-Leão: fim de partida', () => {
  /** Fim pela meta: p0 pontuou vermelho, azul e amarelo. */
  const byTarget = () =>
    patchGame(started(3), {
      phase: 'over',
      turn: null,
      winners: ['p0'],
      endReason: 'target',
      scored: { p0: [22, 20, 32, 34, 8, 10], p1: [], p2: [] },
    });
  const endCard = () => screen.queryByRole('region', { name: 'fim da partida' });
  const sounds = (s: string) => vi.mocked(playCamelioSound).mock.calls.filter(([x]) => x === s).length;

  it('fim pela meta visto por quem ganhou: "você ganhou!", as linhas em ordem e o som de vitória uma vez', () => {
    const room = byTarget();
    const c = conn();
    const { container, rerender } = render(<CamelioTable view={camelioView(room, 'p0')} conn={c} />);
    expect(endCard()).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'você ganhou!' })).toBeTruthy();
    expect([...container.querySelectorAll('.cl-end li')].map((li) => li.getAttribute('data-pid'))).toEqual(['p0', 'p1', 'p2']);
    rerender(<CamelioTable view={camelioView(room, 'p0')} conn={c} />);
    rerender(<CamelioTable view={camelioView(room, 'p0')} conn={c} />);
    expect(sounds('win')).toBe(1);
    expect(sounds('lose')).toBe(0);
  });

  it('empate pelo monte, visto por quem não é host e perdeu: "empate: …", "esperando o host…" e o som de derrota', () => {
    const room = patchGame(started(3), {
      phase: 'over',
      turn: null,
      winners: ['p0', 'p1'],
      endReason: 'deck',
      table: { p0: [], p1: [], p2: [] },
      scored: { p0: [], p1: [], p2: [] },
    });
    render(<CamelioTable view={camelioView(room, 'p2')} conn={conn()} />);
    expect(screen.getByRole('heading', { name: 'empate: P0 e P1' })).toBeTruthy();
    expect(screen.getByText('esperando o host…')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'jogar de novo' })).toBeNull();
    expect(sounds('lose')).toBe(1);
    expect(sounds('win')).toBe(0);
  });

  it('host: "jogar de novo" manda again e trava por 4 s; "voltar pro lobby" manda lobby e um erro destrava', () => {
    const c = conn();
    render(<CamelioTable view={camelioView(byTarget(), 'p0')} conn={c} />);
    const again = screen.getByRole('button', { name: 'jogar de novo' }) as HTMLButtonElement;
    const lobby = screen.getByRole('button', { name: 'voltar pro lobby' }) as HTMLButtonElement;
    fireEvent.click(again);
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'again' });
    expect(again.disabled).toBe(true);
    expect(lobby.disabled).toBe(true);
    fireEvent.click(again);
    expect(c.sendAction).toHaveBeenCalledTimes(1);
    tick(4000);
    expect(again.disabled).toBe(false);
    fireEvent.click(lobby);
    expect(c.sendAction).toHaveBeenLastCalledWith({ type: 'lobby' });
    expect(lobby.disabled).toBe(true);
    fail(c, 'bad_phase', 'Agora não dá.');
    expect(lobby.disabled).toBe(false);
  });

  it('espectador vê o cartaz sem botões e sem som', () => {
    const res = joinRoom(byTarget(), { token: 't9', name: 'Zé', color: PLAYER_COLORS[5]! }, 'p9', 0);
    if (!res.ok) throw new Error(res.error);
    render(<CamelioTable view={camelioView(res.room, 'p9')} conn={conn()} />);
    expect(screen.getByRole('heading', { name: 'P0 ganhou!' })).toBeTruthy();
    expect(screen.getByText('esperando o host…')).toBeTruthy();
    expect(sounds('win') + sounds('lose')).toBe(0);
  });

  it('o cartaz só aparece depois da virada da última jogada', async () => {
    const runs = manualAnims();
    const room = started(3);
    const c = conn();
    const { rerender } = render(<CamelioTable view={camelioView(room, 'p0')} conn={c} />);
    const last = patchGame(playTurn(room), { phase: 'over', turn: null, winners: ['p0'], endReason: 'target' });
    rerender(<CamelioTable view={camelioView(last, 'p0')} conn={c} />);
    expect(playTurnAnim).toHaveBeenCalledTimes(1);
    expect(endCard()).toBeNull();
    expect(sounds('win')).toBe(0);
    await finishRun(runs[0]!);
    expect(endCard()).toBeTruthy();
    expect(sounds('win')).toBe(1);
  });
});
