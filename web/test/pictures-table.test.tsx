import { act as rtlAct, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { playPicturesSound } from '../src/games/pictures/sounds';
import { PicturesTable } from '../src/games/pictures/PicturesTable';
import { randomWork } from '../src/games/pictures/random';
import { KIT_NAMES } from '../src/games/pictures/status';
import type { GameConn } from '../src/net/connection';
import { COORDS, PLAYER_COLORS, joinRoom, type PicturesRoomView } from '@cartolina/shared';
import { KITS_UI } from '../src/games/pictures/kits';
import { confetti } from '../src/table/confetti';
import { dropTarget, stickerMove } from '../src/games/pictures/stickers';
import { finished, guessing, lastReveal, picturesView, play, revealed, started, stateOf } from './pictures-fixtures';

vi.mock('../src/games/pictures/sounds', async (original) => ({ ...(await original<typeof import('../src/games/pictures/sounds')>()), playPicturesSound: vi.fn() }));
vi.mock('../src/table/confetti', () => ({ confetti: vi.fn(() => () => {}) }));
// Os blocos carregam o three.js sob demanda: aqui não precisa (ninguém monta blocos na rodada 0 com 3).
vi.mock('../src/games/pictures/kits/blocks', () => ({ blocks: { build: () => ({ destroy() {} }), show() {} } }));

type Conn = GameConn & { sendAction: Mock<GameConn['sendAction']>; onError: Mock<GameConn['onError']> };

/** Conexões criadas no teste: no fim, toda ação tem que ter ido pela conexão (é método; solto, perde o `this`). */
const conns: Conn[] = [];
const conn = (): Conn => {
  const c: Conn = {
    sendAction: vi.fn<GameConn['sendAction']>(),
    sendActivity: vi.fn(),
    sendCursor: vi.fn(),
    sendPing: vi.fn(),
    onFx: vi.fn(() => () => {}),
    onError: vi.fn<GameConn['onError']>(() => () => {}),
  };
  conns.push(c);
  return c;
};

/** Avisa todos os ouvintes de erro registrados na conexão falsa (mesa e bancada). */
const fail = (c: Conn, code: string, message: string) =>
  rtlAct(() => {
    for (const [listener] of c.onError.mock.calls) listener(code, message);
  });

/** Pinta a casa `i` dos cubos (o kit acha a casa pelo ponto do ponteiro). */
function paintCube(container: HTMLElement, i: number) {
  const cell = container.querySelector<HTMLElement>(`.pc-kc-cell[data-i="${i}"]`)!;
  const real = document.elementFromPoint;
  document.elementFromPoint = () => cell;
  try {
    fireEvent.pointerDown(cell, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });
  } finally {
    document.elementFromPoint = real;
  }
}

const realGetContext = HTMLCanvasElement.prototype.getContext;
beforeEach(() => {
  vi.useFakeTimers();
  // cadarços e palitos desenham em canvas: um contexto falso que aceita tudo
  const ctx = new Proxy({} as Record<PropertyKey, unknown>, {
    get: (t, k) => (k in t ? t[k] : (t[k] = vi.fn())),
    set: (t, k, v) => ((t[k] = v), true),
  });
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx) as unknown as typeof realGetContext;
});
afterEach(() => {
  for (const c of conns.splice(0)) expect(c.sendAction.mock.contexts.every((t) => t === c)).toBe(true);
  HTMLCanvasElement.prototype.getContext = realGetContext;
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('mesa do Retratim: montagem', () => {
  it('mostra a foto secreta da visão, a grade de 16 fotos, o kit e "estou pronto"', () => {
    const room = started(3);
    const { container } = render(<PicturesTable view={picturesView(room, 'p0')} conn={conn()} serverOffset={0} />);
    expect(screen.getByText('sua foto secreta')).toBeTruthy();
    const secret = stateOf(room).secrets.p0!;
    expect(container.querySelector('.pc-secret-card .co')!.textContent).toBe(secret);
    expect(container.querySelectorAll('.pc-grid .pc-photo')).toHaveLength(16);
    expect(container.querySelector(`.pc-photo[data-coord="${secret}"]`)!.classList.contains('secret')).toBe(true);
    expect(container.querySelectorAll('.pc-photo.secret')).toHaveLength(1);
    expect(container.querySelector('.pc-info .kit')!.textContent).toBe('cubos coloridos');
    expect(container.querySelector('.pc-bench .pc-kc')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'estou pronto' })).toBeTruthy();
  });

  it('"estou pronto" sem mexer não manda nada e avisa no palco', () => {
    const c = conn();
    render(<PicturesTable view={picturesView(started(3), 'p0')} conn={c} serverOffset={0} />);
    fireEvent.click(screen.getByRole('button', { name: 'estou pronto' }));
    expect(c.sendAction).not.toHaveBeenCalled();
    expect(screen.getByText('Monte alguma coisa antes de ficar pronto.')).toBeTruthy();
    expect(vi.mocked(playPicturesSound)).toHaveBeenCalledWith('error');
  });

  it('recusa do servidor vira aviso no palco (erro de entrada na sala não)', () => {
    const c = conn();
    render(<PicturesTable view={picturesView(started(3), 'p0')} conn={c} serverOffset={0} />);
    fail(c, 'room_full', 'A sala está cheia.');
    expect(screen.queryByText('A sala está cheia.')).toBeNull();
    fail(c, 'empty_work', 'Monte alguma coisa antes de ficar pronto.');
    expect(screen.getByText('Monte alguma coisa antes de ficar pronto.')).toBeTruthy();
  });

  it('mexer manda o rascunho; "estou pronto" manda ready com a obra local', () => {
    const c = conn();
    const { container } = render(<PicturesTable view={picturesView(started(3), 'p0')} conn={c} serverOffset={0} />);
    paintCube(container, 5);
    expect(c.sendAction).toHaveBeenCalledTimes(1);
    expect(c.sendAction.mock.calls[0]![0]).toMatchObject({ type: 'draft', work: { kit: 'cubes' } });
    paintCube(container, 6);
    fireEvent.click(screen.getByRole('button', { name: 'estou pronto' }));
    expect(c.sendAction).toHaveBeenCalledTimes(2);
    const ready = c.sendAction.mock.calls[1]![0] as { type: string; on: boolean; work: { cells: unknown[] } };
    expect(ready).toMatchObject({ type: 'ready', on: true });
    expect(ready.work.cells[5]).toBe(0);
    expect(ready.work.cells[6]).toBe(0);
    vi.advanceTimersByTime(5000);
    expect(c.sendAction).toHaveBeenCalledTimes(2);
  });

  it('o eco do servidor não recria a bancada (a obra local fica)', () => {
    const c = conn();
    let room = started(3);
    const { container, rerender } = render(<PicturesTable view={picturesView(room, 'p0')} conn={c} serverOffset={0} />);
    paintCube(container, 3);
    const sheet = container.querySelector('.pc-bench-sheet');
    room = play(room, 'p0', c.sendAction.mock.calls[0]![0]);
    rerender(<PicturesTable view={picturesView(room, 'p0')} conn={c} serverOffset={0} />);
    expect(container.querySelector('.pc-bench-sheet')).toBe(sheet);
    expect(container.querySelector('.pc-kc-cell[data-i="3"]')!.classList.contains('pc-kc-cube')).toBe(true);
  });

  it('pronto: bancada a 60% e sem interação; "desmarcar pronto" manda ready desligado', () => {
    const c = conn();
    let room = started(3);
    room = play(room, 'p0', { type: 'ready', on: true, work: { kit: 'cubes', cells: [0, ...Array<null>(15).fill(null)] } });
    const { container } = render(<PicturesTable view={picturesView(room, 'p0')} conn={c} serverOffset={0} />);
    expect(container.querySelector('.pc-bench')!.classList.contains('ready')).toBe(true);
    expect(screen.getByText('pronto ✓ — esperando os outros')).toBeTruthy();
    // reconectou já pronto: a bancada abre com a obra do servidor
    expect(container.querySelector('.pc-kc-cell[data-i="0"]')!.classList.contains('pc-kc-cube')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'desmarcar pronto' }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'ready', on: false });
  });

  it('selinhos: quem está montando e quem está pronto', () => {
    let room = started(3);
    room = play(room, 'p1', { type: 'ready', on: true, work: randomWork('laces') });
    const { container } = render(<PicturesTable view={picturesView(room, 'p0')} conn={conn()} serverOffset={0} />);
    const seal = (p: string) => container.querySelector(`.pc-seal[data-p="${p}"] .stt`)!.textContent;
    expect(seal('p0')).toBe('montando…');
    expect(seal('p1')).toBe('pronto ✓');
  });

  it('só o host vê "apressar" (manda hurry); com a contagem correndo, some e aparece o relógio', () => {
    const c = conn();
    const room = started(3);
    const { rerender } = render(<PicturesTable view={picturesView(room, 'p0')} conn={c} serverOffset={0} />);
    fireEvent.click(screen.getByRole('button', { name: 'apressar' }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'hurry' });

    rerender(<PicturesTable view={picturesView(room, 'p1')} conn={c} serverOffset={0} />);
    expect(screen.queryByRole('button', { name: 'apressar' })).toBeNull();

    vi.setSystemTime(1_000_000);
    const hurried = play(room, 'p0', { type: 'hurry' }, 1_000_000);
    // relógio do PC 5 s atrasado em relação ao servidor: a contagem vale a hora do servidor
    rerender(<PicturesTable view={picturesView(hurried, 'p0')} conn={c} serverOffset={5000} />);
    expect(screen.queryByRole('button', { name: 'apressar' })).toBeNull();
    expect(screen.getByRole('timer').textContent).toBe('faltam 0:25');
    rtlAct(() => vi.advanceTimersByTime(20_000));
    expect(screen.getByRole('timer').textContent).toBe('faltam 0:05');
    expect(screen.getByRole('timer').classList.contains('hurry')).toBe(true);
  });

  it('clicar numa foto abre o zoom; ← → passam, a sua tem o selo, Esc fecha', () => {
    const room = started(3);
    const secret = stateOf(room).secrets.p0!;
    const { container } = render(<PicturesTable view={picturesView(room, 'p0')} conn={conn()} serverOffset={0} />);
    fireEvent.click(container.querySelector('.pc-photo[data-coord="A1"]')!);
    expect(screen.getByRole('dialog', { name: 'foto A1' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(screen.getByRole('dialog', { name: 'foto B1' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(screen.getByRole('dialog', { name: 'foto D4' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    // o cartão da secreta abre a secreta, com o selo "sua foto"
    fireEvent.click(container.querySelector('.pc-secret-card')!);
    expect(screen.getByRole('dialog', { name: `foto ${secret}` })).toBeTruthy();
    expect(screen.getByText('sua foto')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'fechar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('o divisor solto recria a bancada com a obra local (sem mandar nada)', () => {
    const c = conn();
    const { container } = render(<PicturesTable view={picturesView(started(3), 'p0')} conn={c} serverOffset={0} />);
    paintCube(container, 9);
    const before = container.querySelector('.pc-bench-sheet');
    const divider = screen.getByRole('separator', { name: 'divisor' });
    fireEvent.pointerDown(divider, { button: 0, clientX: 700, pointerId: 7 });
    fireEvent.pointerMove(divider, { clientX: 600, pointerId: 7 });
    fireEvent.pointerUp(divider, { clientX: 600, pointerId: 7 });
    const after = container.querySelector('.pc-bench-sheet');
    expect(after).not.toBe(before);
    expect(container.querySelector('.pc-kc-cell[data-i="9"]')!.classList.contains('pc-kc-cube')).toBe(true);
    expect(c.sendAction).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('retratim:lado-direito')).not.toBeNull();
  });
});

describe('mesa do Retratim: galeria de palpites (adesivos)', () => {
  const photo = (container: HTMLElement, coord: string) => container.querySelector<HTMLElement>(`.pc-photo[data-coord="${coord}"]`)!;
  const frame = (container: HTMLElement, p: string) => container.querySelector<HTMLElement>(`.pc-wf[data-artist="${p}"]`)!;
  const sticker = (name: string) => screen.getByRole('button', { name: `adesivo de ${name}` });
  /** Os adesivos colados numa foto (na ordem em que aparecem). */
  const onPhoto = (container: HTMLElement, coord: string) =>
    [...photo(container, coord).querySelectorAll<HTMLElement>('.pc-stks .pc-stk')].map((s) => s.getAttribute('aria-label') ?? s.title);

  /** Arrasta `el` até o ponto onde `document.elementFromPoint` devolve `over` (o kit acha o alvo pelo ponteiro). */
  function dragTo(el: HTMLElement, over: Element | null, { drop = true }: { drop?: boolean } = {}) {
    const real = document.elementFromPoint;
    document.elementFromPoint = () => over;
    try {
      fireEvent.pointerDown(el, { button: 0, clientX: 10, clientY: 10, pointerId: 7 });
      fireEvent.pointerMove(window, { clientX: 60, clientY: 40, pointerId: 7 });
      if (drop) {
        fireEvent.pointerUp(window, { clientX: 60, clientY: 40, pointerId: 7 });
        fireEvent.click(el);
      }
    } finally {
      document.elementFromPoint = real;
    }
  }

  it('mostra as obras dos outros (não a sua) com o adesivo do artista, o kit, a grade e os selinhos', () => {
    const room = guessing(3);
    const { container } = render(<PicturesTable view={picturesView(room, 'p0')} conn={conn()} serverOffset={0} />);
    expect(screen.getByText('de quem é qual foto?')).toBeTruthy();
    const frames = [...container.querySelectorAll<HTMLElement>('.pc-wf')];
    expect(frames.map((f) => f.dataset.artist)).toEqual(['p1', 'p2']);
    const kits = stateOf(room).kits;
    expect(frame(container, 'p1').querySelector('.cap .nm')!.textContent).toBe('P1');
    expect(frame(container, 'p1').querySelector('.cap .kt')!.textContent).toBe(KIT_NAMES[kits.p1!]);
    expect(frame(container, 'p2').querySelector('.cap .kt')!.textContent).toBe(KIT_NAMES[kits.p2!]);
    expect(frame(container, 'p1').querySelector('.pc-wsheet')!.childElementCount).toBeGreaterThan(0);
    expect(container.querySelectorAll('.pc-grid .pc-photo')).toHaveLength(16);
    expect(container.querySelector('.pc-bench')).toBeNull();
    // o adesivo (bichinho num círculo branco) mora no lugar marcado da moldura
    const s = sticker('P1');
    expect(s.closest('.pc-stk-slot')!.closest('.pc-wf')).toBe(frame(container, 'p1'));
    expect(s.querySelector('.critter')).toBeTruthy();
    expect(s.getAttribute('aria-pressed')).toBe('false');
    expect(frame(container, 'p1').querySelector('.pc-wf-guess')!.textContent).toBe('sem palpite');
    expect(container.querySelector('.pc-seal[data-p="p1"] .stt')!.textContent).toBe('palpitando…');
  });

  it('clicar no adesivo e depois na foto manda o guess; o adesivo vai pra foto na hora e a sombra fica na moldura', () => {
    const c = conn();
    let room = guessing(3);
    const { container, rerender } = render(<PicturesTable view={picturesView(room, 'p0')} conn={c} serverOffset={0} />);
    const show = () => rerender(<PicturesTable view={picturesView(room, 'p0')} conn={c} serverOffset={0} />);

    fireEvent.click(sticker('P1'));
    expect(sticker('P1').getAttribute('aria-pressed')).toBe('true');
    expect(sticker('P1').classList.contains('sel')).toBe(true);
    fireEvent.click(photo(container, 'B2'));
    expect(c.sendAction).toHaveBeenLastCalledWith({ type: 'guess', artist: 'p1', coord: 'B2' });
    // sem esperar o eco: o adesivo já está na foto, pequeno no canto; na moldura fica a sombra apagada
    expect(onPhoto(container, 'B2')).toEqual(['adesivo de P1']);
    const ghost = frame(container, 'p1').querySelector<HTMLElement>('.pc-stk-slot .pc-stk.ghost')!;
    expect(ghost.querySelector('.critter')).toBeTruthy();
    expect(frame(container, 'p1').querySelector('.pc-wf-guess')!.textContent).toBe('você acha que é a B2');
    expect(frame(container, 'p1').querySelector('.pc-wf-guess b')!.textContent).toBe('B2');
    room = play(room, 'p0', c.sendAction.mock.lastCall![0]);
    show();
    expect(onPhoto(container, 'B2')).toEqual(['adesivo de P1']);
    expect(photo(container, 'B2').classList.contains('picked')).toBe(true);

    // outro adesivo na mesma foto: empilham
    fireEvent.click(sticker('P2'));
    expect(sticker('P1').getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(photo(container, 'B2'));
    expect(c.sendAction).toHaveBeenLastCalledWith({ type: 'guess', artist: 'p2', coord: 'B2' });
    room = play(room, 'p0', c.sendAction.mock.lastCall![0]);
    show();
    expect(onPhoto(container, 'B2')).toEqual(['adesivo de P1', 'adesivo de P2']);

    // a mesma foto de novo não manda nada; outra foto troca
    const sent = c.sendAction.mock.calls.length;
    fireEvent.click(photo(container, 'B2'));
    expect(c.sendAction).toHaveBeenCalledTimes(sent);
    fireEvent.click(photo(container, 'D4'));
    expect(c.sendAction).toHaveBeenLastCalledWith({ type: 'guess', artist: 'p2', coord: 'D4' });
    expect(onPhoto(container, 'D4')).toEqual(['adesivo de P2']);
    expect(onPhoto(container, 'B2')).toEqual(['adesivo de P1']);
  });

  it('a sombra apagada do adesivo continua na moldura (palpite que veio da visão)', () => {
    let room = guessing(3);
    room = play(room, 'p0', { type: 'guess', artist: 'p2', coord: 'C3' });
    const { container } = render(<PicturesTable view={picturesView(room, 'p0')} conn={conn()} serverOffset={0} />);
    const slot = frame(container, 'p2').querySelector('.pc-stk-slot')!;
    expect(slot.querySelector('.pc-stk.ghost .critter')).toBeTruthy();
    expect(slot.querySelector('.pc-stk:not(.ghost)')).toBeNull();
    expect(onPhoto(container, 'C3')).toEqual(['adesivo de P2']);
    // a outra obra continua com o adesivo inteiro na moldura
    expect(frame(container, 'p1').querySelector('.pc-stk-slot .pc-stk.ghost')).toBeNull();
    expect(sticker('P1').closest('.pc-wf')).toBe(frame(container, 'p1'));
  });

  it('tirar o palpite manda coord null: clicando na sombra, pelo teclado ou arrastando de volta pra moldura', () => {
    const c = conn();
    let room = guessing(3);
    room = play(room, 'p0', { type: 'guess', artist: 'p1', coord: 'A1' });
    room = play(room, 'p0', { type: 'guess', artist: 'p2', coord: 'B1' });
    const { container } = render(<PicturesTable view={picturesView(room, 'p0')} conn={c} serverOffset={0} />);
    fireEvent.click(screen.getByRole('button', { name: 'tirar o palpite de P1 (A1)' }));
    expect(c.sendAction).toHaveBeenLastCalledWith({ type: 'guess', artist: 'p1', coord: null });
    expect(onPhoto(container, 'A1')).toEqual([]);
    expect(sticker('P1').closest('.pc-wf')).toBe(frame(container, 'p1'));

    dragTo(sticker('P2'), frame(container, 'p2').querySelector('.pc-wsheet'));
    expect(c.sendAction).toHaveBeenLastCalledWith({ type: 'guess', artist: 'p2', coord: null });
    expect(onPhoto(container, 'B1')).toEqual([]);
    expect(c.sendAction).toHaveBeenCalledTimes(2);
  });

  it('arrastar o adesivo: segue o ponteiro e destaca a foto embaixo; soltar cola; de uma foto pra outra troca; fora tira', () => {
    const c = conn();
    const { container } = render(<PicturesTable view={picturesView(guessing(3), 'p0')} conn={c} serverOffset={0} />);
    // no meio do arraste: o adesivo voa (maior) e a foto embaixo fica destacada
    dragTo(sticker('P1'), photo(container, 'C2').querySelector('img') ?? photo(container, 'C2'), { drop: false });
    expect(container.querySelector('.pc-stk.fly')).toBeTruthy();
    expect(photo(container, 'C2').classList.contains('drop')).toBe(true);
    expect(frame(container, 'p1').querySelector('.pc-stk-slot .pc-stk.ghost')).toBeTruthy();
    fireEvent.pointerUp(window, { clientX: 60, clientY: 40, pointerId: 7 });
    // sem `elementFromPoint` no ponto (jsdom), soltou fora: nada colado, nada mandado
    expect(c.sendAction).not.toHaveBeenCalled();
    expect(container.querySelector('.pc-stk.fly')).toBeNull();
    expect(container.querySelector('.pc-photo.drop')).toBeNull();

    dragTo(sticker('P1'), photo(container, 'C2'));
    expect(c.sendAction).toHaveBeenLastCalledWith({ type: 'guess', artist: 'p1', coord: 'C2' });
    expect(playPicturesSound).toHaveBeenLastCalledWith('tape');
    // o clique que vem no fim do arraste não seleciona o adesivo
    expect(sticker('P1').getAttribute('aria-pressed')).toBe('false');
    expect(onPhoto(container, 'C2')).toEqual(['adesivo de P1']);

    dragTo(sticker('P1'), photo(container, 'A4'));
    expect(c.sendAction).toHaveBeenLastCalledWith({ type: 'guess', artist: 'p1', coord: 'A4' });
    expect(onPhoto(container, 'A4')).toEqual(['adesivo de P1']);
    expect(onPhoto(container, 'C2')).toEqual([]);

    // soltar na mesma foto: nada muda
    dragTo(sticker('P1'), photo(container, 'A4'));
    expect(c.sendAction).toHaveBeenCalledTimes(2);

    dragTo(sticker('P1'), container.querySelector('.pc-gal-head'));
    expect(c.sendAction).toHaveBeenLastCalledWith({ type: 'guess', artist: 'p1', coord: null });
    expect(playPicturesSound).toHaveBeenLastCalledWith('peel');
    expect(onPhoto(container, 'A4')).toEqual([]);
  });

  it('um toque sem arrastar é clique (seleciona), não arraste', () => {
    const c = conn();
    render(<PicturesTable view={picturesView(guessing(3), 'p0')} conn={c} serverOffset={0} />);
    const s = sticker('P2');
    fireEvent.pointerDown(s, { button: 0, clientX: 10, clientY: 10, pointerId: 2 });
    fireEvent.pointerMove(window, { clientX: 12, clientY: 11, pointerId: 2 });
    fireEvent.pointerUp(window, { clientX: 12, clientY: 11, pointerId: 2 });
    fireEvent.click(s);
    expect(s.getAttribute('aria-pressed')).toBe('true');
    expect(c.sendAction).not.toHaveBeenCalled();
    // clicar de novo larga
    fireEvent.click(s);
    expect(s.getAttribute('aria-pressed')).toBe('false');
  });

  it('o adesivo volta pra moldura se o servidor recusar o palpite', () => {
    const c = conn();
    const { container } = render(<PicturesTable view={picturesView(guessing(3), 'p0')} conn={c} serverOffset={0} />);
    fireEvent.click(sticker('P1'));
    fireEvent.click(photo(container, 'B4'));
    expect(onPhoto(container, 'B4')).toEqual(['adesivo de P1']);
    fail(c, 'bad_phase', 'fase errada');
    expect(onPhoto(container, 'B4')).toEqual([]);
    expect(sticker('P1').closest('.pc-wf')).toBe(frame(container, 'p1'));
  });

  it('teclado: com um adesivo selecionado, letra e número colam (sem adesivo, ou com a foto ampliada aberta, não)', () => {
    const c = conn();
    const { container } = render(<PicturesTable view={picturesView(guessing(3), 'p0')} conn={c} serverOffset={0} />);
    fireEvent.keyDown(document, { key: 'c' });
    fireEvent.keyDown(document, { key: '3' });
    expect(c.sendAction).not.toHaveBeenCalled();

    fireEvent.click(sticker('P1'));
    fireEvent.keyDown(document, { key: 'c' });
    fireEvent.keyDown(document, { key: '3' });
    expect(c.sendAction).toHaveBeenLastCalledWith({ type: 'guess', artist: 'p1', coord: 'C3' });
    expect(onPhoto(container, 'C3')).toEqual(['adesivo de P1']);
    // um número sem letra antes não faz nada
    fireEvent.keyDown(document, { key: '2' });
    expect(c.sendAction).toHaveBeenCalledTimes(1);
    // Delete tira o palpite do adesivo selecionado
    fireEvent.keyDown(document, { key: 'Delete' });
    expect(c.sendAction).toHaveBeenLastCalledWith({ type: 'guess', artist: 'p1', coord: null });

    // a lupinha abre a foto grande (sem palpite); com ela aberta o teclado não cola
    fireEvent.click(photo(container, 'A1').querySelector('.pc-zoom-btn')!);
    expect(screen.getByRole('dialog', { name: 'foto A1' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'b' });
    fireEvent.keyDown(document, { key: '1' });
    expect(c.sendAction).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('sem adesivo selecionado, clicar na foto amplia', () => {
    const c = conn();
    const { container } = render(<PicturesTable view={picturesView(guessing(3), 'p0')} conn={c} serverOffset={0} />);
    fireEvent.click(photo(container, 'D1'));
    expect(screen.getByRole('dialog', { name: 'foto D1' })).toBeTruthy();
    expect(c.sendAction).not.toHaveBeenCalled();
  });

  it('a lupa da obra abre a obra grande com o artista e o seu palpite; Esc fecha', () => {
    const c = conn();
    let room = guessing(3);
    room = play(room, 'p0', { type: 'guess', artist: 'p2', coord: 'A4' });
    render(<PicturesTable view={picturesView(room, 'p0')} conn={c} serverOffset={0} />);
    fireEvent.click(sticker('P1'));
    fireEvent.click(screen.getByRole('button', { name: 'ver a obra de P2 grande' }));
    const dialog = screen.getByRole('dialog', { name: 'obra de P2' });
    expect(dialog.querySelector('.who .nm')!.textContent).toBe('P2');
    expect(dialog.querySelector('.pc-gtape')!.textContent).toBe('A4');
    expect(dialog.querySelector('.pic')!.childElementCount).toBeGreaterThan(0);
    // a lupa não troca o adesivo selecionado, e o teclado não cola com ela aberta
    expect(sticker('P1').getAttribute('aria-pressed')).toBe('true');
    fireEvent.keyDown(document, { key: 'b' });
    fireEvent.keyDown(document, { key: '1' });
    expect(c.sendAction).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('"confirmar palpites" avisa quantas faltam e manda confirm; depois só "esperando a galera…" e nada se arrasta', () => {
    const c = conn();
    let room = guessing(3);
    room = play(room, 'p0', { type: 'guess', artist: 'p1', coord: 'A1' });
    const { container, rerender } = render(<PicturesTable view={picturesView(room, 'p0')} conn={c} serverOffset={0} />);
    expect(container.querySelector('.pc-gal-foot .hint')!.textContent).toBe('faltam 1 obra sem palpite · dá pra confirmar assim mesmo');
    fireEvent.click(screen.getByRole('button', { name: 'confirmar palpites' }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'confirm' });

    room = play(room, 'p0', { type: 'confirm' });
    rerender(<PicturesTable view={picturesView(room, 'p0')} conn={c} serverOffset={0} />);
    expect(screen.getByText('esperando a galera…')).toBeTruthy();
    expect(screen.getByText('palpites confirmados ✓')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'confirmar palpites' })).toBeNull();
    expect(container.querySelector('.pc-seal[data-p="p0"] .stt')!.textContent).toBe('confirmou ✓');
    // os adesivos ficam onde estão, mas não são mais botões; a sombra e o texto continuam
    expect(screen.queryByRole('button', { name: /^adesivo de/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^tirar o palpite/ })).toBeNull();
    expect(onPhoto(container, 'A1')).toEqual(['adesivo de P1']);
    expect(frame(container, 'p1').querySelector('.pc-stk-slot .pc-stk.ghost')).toBeTruthy();
    expect(frame(container, 'p1').querySelector('.pc-wf-guess')!.textContent).toBe('você acha que é a A1');
    const onA1 = photo(container, 'A1').querySelector<HTMLElement>('.pc-stks .pc-stk')!;
    const p2 = frame(container, 'p2').querySelector<HTMLElement>('.pc-stk-slot .pc-stk')!;
    dragTo(onA1, photo(container, 'C2'));
    dragTo(p2, photo(container, 'C2'), { drop: false });
    expect(container.querySelector('.pc-stk.fly')).toBeNull();
    expect(container.querySelector('.pc-photo.drop')).toBeNull();
    fireEvent.pointerUp(window, { pointerId: 7 });
    fireEvent.click(p2);
    fireEvent.click(photo(container, 'C2'));
    fireEvent.keyDown(document, { key: 'c' });
    fireEvent.keyDown(document, { key: '2' });
    expect(c.sendAction).toHaveBeenCalledTimes(1);
  });

  it('todas com palpite: o pé diz isso', () => {
    let room = guessing(3);
    room = play(room, 'p0', { type: 'guess', artist: 'p1', coord: 'A1' });
    room = play(room, 'p0', { type: 'guess', artist: 'p2', coord: 'A1' });
    const { container } = render(<PicturesTable view={picturesView(room, 'p0')} conn={conn()} serverOffset={0} />);
    expect(container.querySelector('.pc-gal-foot .hint')!.textContent).toBe('todas as obras com palpite');
  });

  it('todos confirmaram: a mesa passa pra revelação', () => {
    render(<PicturesTable view={picturesView(revealed(3), 'p0')} conn={conn()} serverOffset={0} />);
    expect(screen.getByRole('button', { name: 'pular ›' })).toBeTruthy();
    expect(screen.queryByText('de quem é qual foto?')).toBeNull();
  });

  it('confirmou e o eco não chegou: clique duplo, adesivo, foto, sombra, arraste e teclado não mandam mais nada', () => {
    const c = conn();
    let room = guessing(3);
    room = play(room, 'p0', { type: 'guess', artist: 'p1', coord: 'A1' });
    const { container } = render(<PicturesTable view={picturesView(room, 'p0')} conn={c} serverOffset={0} />);
    fireEvent.click(sticker('P2'));
    const confirm = screen.getByRole('button', { name: 'confirmar palpites' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    fireEvent.click(photo(container, 'B3'));
    fireEvent.keyDown(document, { key: 'c' });
    fireEvent.keyDown(document, { key: '1' });
    fireEvent.keyDown(document, { key: 'Delete' });
    expect(screen.queryByRole('button', { name: /^adesivo de/ })).toBeNull();
    dragTo(frame(container, 'p2').querySelector<HTMLElement>('.pc-stk-slot .pc-stk')!, photo(container, 'D1'));
    expect(c.sendAction.mock.calls).toEqual([[{ type: 'confirm' }]]);
    expect(screen.queryByRole('button', { name: 'confirmar palpites' })).toBeNull();
    expect(screen.getByText('esperando a galera…')).toBeTruthy();
  });

  it('pelo teclado: cada adesivo é um botão (Tab chega, Enter seleciona) e letra + número colam', () => {
    const c = conn();
    const { container } = render(<PicturesTable view={picturesView(guessing(3), 'p0')} conn={c} serverOffset={0} />);
    const s = sticker('P2');
    expect(s.tagName).toBe('BUTTON');
    expect(s.tabIndex).toBe(0);
    // a lupa e o adesivo são irmãos (botão não fica dentro de botão)
    expect(s.querySelector('button')).toBeNull();
    expect(s.closest('.pc-wf')).toBe(frame(container, 'p2'));
    s.focus();
    expect(document.activeElement).toBe(s);
    fireEvent.click(s);
    expect(s.getAttribute('aria-pressed')).toBe('true');
    expect(frame(container, 'p2').classList.contains('sel')).toBe(true);
    fireEvent.keyDown(document, { key: 'a' });
    fireEvent.keyDown(document, { key: '2' });
    expect(c.sendAction).toHaveBeenLastCalledWith({ type: 'guess', artist: 'p2', coord: 'A2' });
  });

  it('lupa da obra: modal, foco no ✕ e de volta na lupa; a lupinha das fotos não abre outro zoom por cima', () => {
    const { container } = render(<PicturesTable view={picturesView(guessing(3), 'p0')} conn={conn()} serverOffset={0} />);
    const lupa = screen.getByRole('button', { name: 'ver a obra de P1 grande' });
    lupa.focus();
    fireEvent.click(lupa);
    const dialog = screen.getByRole('dialog', { name: 'obra de P1' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'fechar' }));
    fireEvent.click(photo(container, 'A1').querySelector('.pc-zoom-btn')!);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(lupa);
  });

  it('o teclado da galeria ignora quem está digitando num campo', () => {
    const c = conn();
    render(<PicturesTable view={picturesView(guessing(3), 'p0')} conn={c} serverOffset={0} />);
    fireEvent.click(sticker('P1'));
    const input = document.createElement('input');
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    document.body.append(input, editable);
    try {
      for (const el of [input, editable]) {
        fireEvent.keyDown(el, { key: 'c' });
        fireEvent.keyDown(el, { key: '3' });
      }
      expect(c.sendAction).not.toHaveBeenCalled();
    } finally {
      input.remove();
      editable.remove();
    }
  });

  it('quem assiste a rodada vê as obras de todos com o adesivo de cada artista, sem palpite; clicar na foto amplia', () => {
    const c = conn();
    let room = guessing(3);
    const res = joinRoom(room, { token: 't3', name: 'P3', color: PLAYER_COLORS[3]! }, 'p3', 0);
    if (!res.ok) throw new Error(res.error);
    room = res.room;
    expect(stateOf(room).inRound).not.toContain('p3');
    const { container } = render(<PicturesTable view={picturesView(room, 'p3')} conn={c} serverOffset={0} />);
    expect([...container.querySelectorAll<HTMLElement>('.pc-wf')].map((f) => f.dataset.artist)).toEqual(['p0', 'p1', 'p2']);
    expect(screen.getByText('você está assistindo esta rodada')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'confirmar palpites' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^adesivo de/ })).toBeNull();
    expect(container.querySelectorAll('.pc-stk-slot .pc-stk:not(.ghost)')).toHaveLength(3);
    expect(container.querySelector('.pc-wf-guess')).toBeNull();
    expect(container.querySelector('.pc-photo.secret')).toBeNull();
    fireEvent.click(photo(container, 'C2'));
    expect(screen.getByRole('dialog', { name: 'foto C2' })).toBeTruthy();
    expect(c.sendAction).not.toHaveBeenCalled();
  });

  it('um re-render com as mesmas obras não redesenha as molduras', () => {
    const spies = Object.values(KITS_UI).map((k) => vi.spyOn(k, 'show'));
    try {
      let room = guessing(3);
      const { rerender } = render(<PicturesTable view={picturesView(room, 'p0')} conn={conn()} serverOffset={0} />);
      const drawn = () => spies.reduce((n, s) => n + s.mock.calls.length, 0);
      expect(drawn()).toBe(2);
      rerender(<PicturesTable view={picturesView(room, 'p0')} conn={conn()} serverOffset={0} />);
      room = play(room, 'p0', { type: 'guess', artist: 'p1', coord: 'D2' });
      rerender(<PicturesTable view={picturesView(room, 'p0')} conn={conn()} serverOffset={0} />);
      expect(drawn()).toBe(2);
    } finally {
      for (const s of spies) s.mockRestore();
    }
  });
});

describe('mesa do Retratim: palpite perdido e avisos da última rodada', () => {
  const photo = (container: HTMLElement, coord: string) => container.querySelector<HTMLElement>(`.pc-photo[data-coord="${coord}"]`)!;

  it('palpite mandado sem eco (conexão caiu): depois de 3 s o adesivo volta pro que a visão diz', () => {
    const c = conn();
    const { container } = render(<PicturesTable view={picturesView(guessing(3), 'p0')} conn={c} serverOffset={0} />);
    fireEvent.click(screen.getByRole('button', { name: 'adesivo de P1' }));
    fireEvent.click(photo(container, 'B2'));
    expect(c.sendAction).toHaveBeenLastCalledWith({ type: 'guess', artist: 'p1', coord: 'B2' });
    expect(photo(container, 'B2').querySelector('.pc-stks .pc-stk')).toBeTruthy();
    rtlAct(() => vi.advanceTimersByTime(2900));
    expect(photo(container, 'B2').querySelector('.pc-stks .pc-stk')).toBeTruthy();
    rtlAct(() => vi.advanceTimersByTime(200));
    expect(photo(container, 'B2').querySelector('.pc-stks .pc-stk')).toBeNull();
    // e dá pra colar de novo (o adesivo continua na mão; manda outra vez)
    fireEvent.click(photo(container, 'B2'));
    expect(c.sendAction).toHaveBeenCalledTimes(2);
  });

  it('com o eco a tempo, o palpite fica', () => {
    const c = conn();
    const room = guessing(3);
    const { container, rerender } = render(<PicturesTable view={picturesView(room, 'p0')} conn={c} serverOffset={0} />);
    fireEvent.click(screen.getByRole('button', { name: 'adesivo de P1' }));
    fireEvent.click(photo(container, 'B2'));
    rerender(<PicturesTable view={picturesView(play(room, 'p0', { type: 'guess', artist: 'p1', coord: 'B2' }), 'p0')} conn={c} serverOffset={0} />);
    rtlAct(() => vi.advanceTimersByTime(5000));
    expect(photo(container, 'B2').querySelector('.pc-stks .pc-stk')).toBeTruthy();
  });

  it('na última rodada não tem aviso de que as fotos trocam (nada troca no fim)', () => {
    const { container } = render(<PicturesTable view={picturesView(lastReveal(3), 'p0')} conn={conn()} serverOffset={0} />);
    expect(container.textContent).not.toMatch(/trocam na próxima/);
    render(<PicturesTable view={picturesView(revealed(3), 'p0')} conn={conn()} serverOffset={0} />);
    expect(document.body.textContent).toMatch(/trocam na próxima/);
  });

  it('a foto ampliada no placar fecha quando começa a rodada seguinte', () => {
    const c = conn();
    const room = revealed(3);
    const { container, rerender } = render(<PicturesTable view={picturesView(room, 'p0')} conn={c} serverOffset={0} />);
    fireEvent.click(screen.getByRole('button', { name: 'pular ›' }));
    fireEvent.click(container.querySelector('.pc-rs-photo .pc-zoom-btn')!);
    expect(screen.getByRole('dialog', { name: /^foto / })).toBeTruthy();
    rerender(<PicturesTable view={picturesView(play(room, 'p0', { type: 'next' }), 'p0')} conn={c} serverOffset={0} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('com a foto ampliada no placar, a lupinha de uma obra não abre outro zoom por cima', () => {
    const { container } = render(<PicturesTable view={picturesView(revealed(3), 'p0')} conn={conn()} serverOffset={0} />);
    fireEvent.click(screen.getByRole('button', { name: 'pular ›' }));
    fireEvent.click(container.querySelector('.pc-rs-photo .pc-zoom-btn')!);
    fireEvent.click(container.querySelector('.pc-rs-work .pc-wz')!);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });
});

describe('mesa do Retratim: onde o adesivo cai (funções puras)', () => {
  it('dropTarget: dentro de uma foto da grade dá a coordenada; fora dela, null', () => {
    const grid = document.createElement('div');
    grid.className = 'pc-grid';
    grid.innerHTML = '<div class="pc-photo" data-coord="B3"><div class="pc-ph"><img></div></div><span class="pc-lbl">A</span>';
    const wf = document.createElement('div');
    wf.className = 'pc-wf';
    wf.innerHTML = '<div class="pc-wsheet"></div>';
    document.body.append(grid, wf);
    try {
      expect(dropTarget(grid.querySelector('img'))).toBe('B3');
      expect(dropTarget(grid.querySelector('.pc-photo'))).toBe('B3');
      expect(dropTarget(grid.querySelector('.pc-lbl'))).toBeNull();
      expect(dropTarget(wf.querySelector('.pc-wsheet'))).toBeNull();
      expect(dropTarget(document.body)).toBeNull();
      expect(dropTarget(null)).toBeNull();
    } finally {
      grid.remove();
      wf.remove();
    }
  });

  it('dropTarget ignora foto fora da grade (o zoom, a revelação) e coordenada inválida', () => {
    const lone = document.createElement('div');
    lone.className = 'pc-photo';
    lone.dataset.coord = 'A1';
    const bad = document.createElement('div');
    bad.className = 'pc-grid';
    bad.innerHTML = '<div class="pc-photo" data-coord="Z9"></div>';
    document.body.append(lone, bad);
    try {
      expect(dropTarget(lone)).toBeNull();
      expect(dropTarget(bad.firstElementChild)).toBeNull();
    } finally {
      lone.remove();
      bad.remove();
    }
  });

  it('stickerMove: soltar onde já estava não manda nada; noutra foto troca; fora tira', () => {
    expect(stickerMove(null, null)).toBeUndefined();
    expect(stickerMove('A1', 'A1')).toBeUndefined();
    expect(stickerMove(null, 'B2')).toEqual({ coord: 'B2' });
    expect(stickerMove('B2', 'C3')).toEqual({ coord: 'C3' });
    expect(stickerMove('C3', null)).toEqual({ coord: null });
  });
});

describe('mesa do Retratim: montagem sem perder rascunho', () => {
  const cubeWork = (cells: number[]) => ({ kit: 'cubes' as const, cells: Array.from({ length: 16 }, (_, i) => (cells.includes(i) ? 0 : null)) });
  const actions = (c: Conn, type: string) => c.sendAction.mock.calls.map(([a]) => a).filter((a) => a.type === type);

  it('recarregou com rascunho e sem estar pronto: a bancada abre com a obra do servidor (sem reenviar)', () => {
    const c = conn();
    const room = play(started(3), 'p0', { type: 'draft', work: cubeWork([2, 7]) });
    const { container } = render(<PicturesTable view={picturesView(room, 'p0')} conn={c} serverOffset={0} />);
    expect(container.querySelector('.pc-bench')!.classList.contains('ready')).toBe(false);
    expect(container.querySelector('.pc-kc-cell[data-i="2"]')!.classList.contains('pc-kc-cube')).toBe(true);
    expect(container.querySelector('.pc-kc-cell[data-i="7"]')!.classList.contains('pc-kc-cube')).toBe(true);
    rtlAct(() => vi.advanceTimersByTime(5000));
    expect(c.sendAction).not.toHaveBeenCalled();
  });

  it('depois de uma recusa do "pronto", a próxima mexida volta a mandar draft', () => {
    const c = conn();
    const { container } = render(<PicturesTable view={picturesView(started(3), 'p0')} conn={c} serverOffset={0} />);
    paintCube(container, 1);
    fireEvent.click(screen.getByRole('button', { name: 'estou pronto' }));
    expect(actions(c, 'ready')).toHaveLength(1);
    fail(c, 'bad_phase', 'Agora não dá pra fazer isso.');
    expect(container.querySelector('.pc-bench')!.classList.contains('ready')).toBe(false);
    paintCube(container, 2);
    rtlAct(() => vi.advanceTimersByTime(2000));
    expect(actions(c, 'draft')).toHaveLength(2);
  });

  it('outro erro (que não é recusa do "pronto") não solta o pedido em voo', () => {
    const c = conn();
    const { container } = render(<PicturesTable view={picturesView(started(3), 'p0')} conn={c} serverOffset={0} />);
    paintCube(container, 1);
    fireEvent.click(screen.getByRole('button', { name: 'estou pronto' }));
    fail(c, 'not_host', 'Só o host pode fazer isso.');
    expect(container.querySelector('.pc-bench')!.classList.contains('ready')).toBe(true);
    expect((screen.getByRole('button', { name: 'estou pronto' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('pedido em voo: botão desabilitado e bancada já esmaecida; clique duplo manda um ready só', () => {
    const c = conn();
    let room = started(3);
    const { container, rerender } = render(<PicturesTable view={picturesView(room, 'p0')} conn={c} serverOffset={0} />);
    paintCube(container, 4);
    const btn = screen.getByRole('button', { name: 'estou pronto' });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(actions(c, 'ready')).toHaveLength(1);
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(container.querySelector('.pc-bench')!.classList.contains('ready')).toBe(true);
    room = play(room, 'p0', actions(c, 'ready')[0]!);
    rerender(<PicturesTable view={picturesView(room, 'p0')} conn={c} serverOffset={0} />);
    expect((screen.getByRole('button', { name: 'desmarcar pronto' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('"pronto" perdido (a visão não me marca pronto): em 1,5 s o botão volta e a mexida sai', () => {
    const c = conn();
    const { container } = render(<PicturesTable view={picturesView(started(3), 'p0')} conn={c} serverOffset={0} />);
    paintCube(container, 1);
    fireEvent.click(screen.getByRole('button', { name: 'estou pronto' }));
    rtlAct(() => vi.advanceTimersByTime(1500));
    expect((screen.getByRole('button', { name: 'estou pronto' }) as HTMLButtonElement).disabled).toBe(false);
    expect(container.querySelector('.pc-bench')!.classList.contains('ready')).toBe(false);
    paintCube(container, 2);
    rtlAct(() => vi.advanceTimersByTime(2000));
    expect(actions(c, 'draft').at(-1)).toMatchObject({ work: { kit: 'cubes' } });
    expect(actions(c, 'draft').length).toBeGreaterThanOrEqual(2);
  });
});

describe('mesa do Retratim: rodinha do mouse (como no Diquisti)', () => {
  const tick = (ms: number) => rtlAct(() => vi.advanceTimersByTime(ms));
  /** Gira a rodinha em `el`; devolve se a página foi impedida de rolar (o giro abriu ou fechou algo). */
  const wheel = (el: Element, deltaY: number) => !fireEvent.wheel(el, { deltaY });

  it('pra cima numa foto da grade abre o zoom dela; pra baixo fecha, menos logo depois de abrir', () => {
    const { container } = render(<PicturesTable view={picturesView(started(3), 'p0')} conn={conn()} serverOffset={0} />);
    const b2 = container.querySelector('.pc-photo[data-coord="B2"]')!;
    expect(wheel(b2, 40)).toBe(false); // pra baixo sem zoom: nada (e a página rola normal)
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(wheel(b2.querySelector('.pc-ph')!, -40)).toBe(true);
    const dialog = screen.getByRole('dialog', { name: 'foto B2' });
    // o resto do mesmo giro não abre outra nem fecha
    expect(wheel(dialog, -40)).toBe(false);
    tick(200);
    expect(wheel(dialog, 40)).toBe(false);
    expect(screen.getByRole('dialog', { name: 'foto B2' })).toBeTruthy();
    tick(200);
    expect(wheel(dialog.querySelector('.pc-zoom-frame')!, 40)).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('o cartão da foto secreta também amplia com a rodinha', () => {
    const room = started(3);
    const { container } = render(<PicturesTable view={picturesView(room, 'p0')} conn={conn()} serverOffset={0} />);
    wheel(container.querySelector('.pc-secret-card')!, -30);
    expect(screen.getByRole('dialog', { name: `foto ${stateOf(room).secrets.p0}` })).toBeTruthy();
  });

  it('dentro da bancada a rodinha fica com o kit: não abre nada nem barra a rolagem', () => {
    const { container } = render(<PicturesTable view={picturesView(started(3), 'p0')} conn={conn()} serverOffset={0} />);
    const bench = container.querySelector('.pc-bench')!;
    expect(wheel(bench.querySelector('.pc-kc-cell') ?? bench, -60)).toBe(false);
    expect(wheel(bench, -60)).toBe(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('fora de foto e de obra não faz nada', () => {
    const { container } = render(<PicturesTable view={picturesView(started(3), 'p0')} conn={conn()} serverOffset={0} />);
    expect(wheel(container.querySelector('.pc-grid-note')!, -60)).toBe(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('galeria: pra cima numa moldura abre a obra grande; numa foto, a foto (com um adesivo na mão, sem colar)', () => {
    const c = conn();
    const { container } = render(<PicturesTable view={picturesView(guessing(3), 'p0')} conn={c} serverOffset={0} />);
    wheel(container.querySelector('.pc-wf[data-artist="p2"] .pc-wsheet')!, -50);
    const work = screen.getByRole('dialog', { name: 'obra de P2' });
    // com a obra aberta, a rodinha numa foto não abre outro zoom por cima
    expect(wheel(container.querySelector('.pc-photo[data-coord="A1"]')!, -50)).toBe(false);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    tick(400);
    wheel(work, 50);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'adesivo de P1' }));
    wheel(container.querySelector('.pc-photo[data-coord="C3"]')!, -50);
    expect(screen.getByRole('dialog', { name: 'foto C3' })).toBeTruthy();
    expect(c.sendAction).not.toHaveBeenCalled();
  });

  it('numa lista que rola (placar), a rodinha rola primeiro: só abre com a lista no topo e num giro novo', () => {
    const { container } = render(<PicturesTable view={picturesView(revealed(3), 'p0')} conn={conn()} serverOffset={0} />);
    fireEvent.click(screen.getByRole('button', { name: 'pular ›' }));
    const list = container.querySelector<HTMLElement>('.pc-rs-list')!;
    list.style.overflowY = 'auto';
    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 2000 });
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: 500 });
    list.scrollTop = 300;
    const work = container.querySelector('.pc-rs-work')!;
    const photo = container.querySelector('.pc-rs-photo')!;
    expect(wheel(work, -40)).toBe(false); // rolando pra cima: a lista rola, nada abre
    expect(wheel(photo, -40)).toBe(false);
    list.scrollTop = 0;
    expect(wheel(work, -40)).toBe(false); // chegou no topo no embalo do mesmo giro: ainda não abre
    expect(screen.queryByRole('dialog')).toBeNull();
    tick(400);
    expect(wheel(photo, -40)).toBe(true); // giro novo com a lista no topo: abre
    expect(screen.getByRole('dialog', { name: /^foto / })).toBeTruthy();
  });

  it('revelação: pra cima numa foto da grade abre o zoom', () => {
    const { container } = render(<PicturesTable view={picturesView(revealed(3), 'p0')} conn={conn()} serverOffset={0} />);
    wheel(container.querySelector('.pc-photo[data-coord="D4"]')!, -50);
    expect(screen.getByRole('dialog', { name: 'foto D4' })).toBeTruthy();
  });
});

describe('mesa do Retratim: foco e teclado', () => {
  it('o zoom foca o ✕, é modal e, ao fechar, devolve o foco pra lupinha que abriu', () => {
    const { container } = render(<PicturesTable view={picturesView(started(3), 'p0')} conn={conn()} serverOffset={0} />);
    const lupa = container.querySelector<HTMLButtonElement>('.pc-photo[data-coord="C2"] .pc-zoom-btn')!;
    lupa.focus();
    fireEvent.click(lupa);
    const dialog = screen.getByRole('dialog', { name: 'foto C2' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'fechar' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(lupa);
  });

  it('o divisor tem valor e anda ~2% com as setas (recriando a bancada)', () => {
    const { container } = render(<PicturesTable view={picturesView(started(3), 'p0')} conn={conn()} serverOffset={0} />);
    const sep = screen.getByRole('separator', { name: 'divisor' });
    expect(sep.tabIndex).toBe(0);
    expect(sep.getAttribute('aria-valuemin')).toBe('35');
    expect(sep.getAttribute('aria-valuemax')).toBe('75');
    expect(sep.getAttribute('aria-valuenow')).toBe('42');
    const sheet = container.querySelector('.pc-bench-sheet');
    fireEvent.keyDown(sep, { key: 'ArrowLeft' });
    expect(sep.getAttribute('aria-valuenow')).toBe('44');
    expect(container.querySelector('.pc-bench-sheet')).not.toBe(sheet);
    fireEvent.keyDown(sep, { key: 'ArrowRight' });
    fireEvent.keyDown(sep, { key: 'ArrowRight' });
    expect(sep.getAttribute('aria-valuenow')).toBe('40');
  });

  it('desmontar no meio do arraste do divisor tira o cursor de arraste da mesa', () => {
    const room = started(3);
    const { container, rerender } = render(<PicturesTable view={picturesView(room, 'p0')} conn={conn()} serverOffset={0} />);
    fireEvent.pointerDown(screen.getByRole('separator', { name: 'divisor' }), { button: 0, clientX: 700, pointerId: 3 });
    const root = container.querySelector('.pictures')!;
    expect(root.classList.contains('pc-resizing')).toBe(true);
    rerender(<PicturesTable view={picturesView(guessing(3), 'p0')} conn={conn()} serverOffset={0} />);
    expect(root.classList.contains('pc-resizing')).toBe(false);
  });
});

describe('mesa do Retratim: revelação narrada', () => {
  const tick = (ms: number) => rtlAct(() => vi.advanceTimersByTime(ms));
  const seal = (c: HTMLElement, p: string) => c.querySelector(`.pc-seal[data-p="${p}"] .stt`)!.textContent;
  const caption = (c: HTMLElement) => c.querySelector('.pc-rv-t')!.textContent;

  it('passo a passo: a obra cresce, as fitinhas, a foto sai da grade, ✓ e os pontos sobem nos selinhos', () => {
    const room = revealed(3);
    const r = stateOf(room).result!;
    const { container } = render(<PicturesTable view={picturesView(room, 'p0')} conn={conn()} serverOffset={0} />);
    // os selinhos começam no placar de antes da rodada (não o final)
    expect(seal(container, 'p0')).toBe('0 pts');
    expect(container.querySelectorAll('.pc-grid .pc-photo')).toHaveLength(16);
    tick(350);
    expect(r.order[0]).toBe('p0');
    expect(caption(container)).toBe(`a sua obra · ${KIT_NAMES[r.kits.p0!]}`);
    expect(container.querySelector('.pc-rv-n')!.textContent).toBe('obra 1 de 3');
    expect(container.querySelector('.pc-rv-work .pc-wsheet')).toBeTruthy();
    tick(900);
    expect(caption(container)).toBe('os palpites…');
    expect(container.querySelectorAll('.pc-rv-g')).toHaveLength(1);
    tick(400);
    expect([...container.querySelectorAll('.pc-rv-g .pc-rv-tape')].map((e) => e.textContent)).toEqual([r.guesses.p1!.p0, r.guesses.p2!.p0]);
    tick(850);
    const secret = r.secrets.p0!;
    expect(caption(container)).toBe(`a foto era a ${secret}!`);
    expect(container.querySelector(`.pc-photo[data-coord="${secret}"]`)!.classList.contains('lifted')).toBe(true);
    expect(container.querySelector('.pc-rv-slot')!.classList.contains('on')).toBe(true); // sem animação no jsdom: pousa na hora
    expect(container.querySelector('.pc-rv-co')!.textContent).toBe(`era a${secret}`);
    tick(1200);
    expect(caption(container)).toBe('P1 e P2 acertaram');
    expect(container.querySelectorAll('.pc-rv-g.ok')).toHaveLength(2);
    expect(container.querySelectorAll('.pc-rv-g .tick')).toHaveLength(2);
    expect(seal(container, 'p0')).toBe('0 pts');
    tick(800);
    expect(caption(container)).toBe('+2 pra você · +1 pra P1 · +1 pra P2');
    expect(seal(container, 'p0')).toBe('2 pts');
    expect(container.querySelector('.pc-seal[data-p="p0"] .pc-plus')!.textContent).toBe('+2');
    tick(500);
    expect(seal(container, 'p1')).toBe('1 pt');
    expect(seal(container, 'p2')).toBe('1 pt');
    // a próxima obra: a anterior volta pra grade com o bichinho do artista
    tick(1400);
    expect(container.querySelector('.pc-rv-n')!.textContent).toBe('obra 2 de 3');
    expect(caption(container)).toBe('a obra de P1 · ' + KIT_NAMES[r.kits.p1!]);
    expect(container.querySelector(`.pc-photo[data-coord="${secret}"]`)!.classList.contains('lifted')).toBe(false);
    expect(container.querySelector(`.pc-photo[data-coord="${secret}"] .pc-used`)).toBeTruthy();
    expect(container.querySelectorAll('.pc-rv-g')).toHaveLength(0);
  });

  it('palpite errado fica cinza; sem palpite vira fitinha vazia; ninguém pontua', () => {
    let room = guessing(3);
    const st = stateOf(room);
    const wrong = COORDS.find((c) => c !== st.secrets.p0)!;
    room = play(room, 'p1', { type: 'guess', artist: 'p0', coord: wrong });
    for (const p of ['p0', 'p1', 'p2']) room = play(room, p, { type: 'confirm' });
    const { container } = render(<PicturesTable view={picturesView(room, 'p1')} conn={conn()} serverOffset={0} />);
    tick(2450);
    expect([...container.querySelectorAll('.pc-rv-tape')].map((e) => e.textContent)).toEqual([wrong, 'sem palpite']);
    expect(container.querySelector('.pc-rv-tape.none')).toBeTruthy();
    tick(1200);
    expect(caption(container)).toBe('ninguém acertou');
    expect(container.querySelectorAll('.pc-rv-g.no')).toHaveLength(2);
    expect(container.querySelector('.pc-rv-g .tick')).toBeNull();
    tick(800);
    expect(caption(container)).toBe('ninguém pontua com esta obra');
  });

  it('um re-render com a mesma rodada não recomeça a revelação', () => {
    const room = revealed(3);
    const c = conn();
    const { container, rerender } = render(<PicturesTable view={picturesView(room, 'p0')} conn={c} serverOffset={0} />);
    tick(2450);
    rerender(<PicturesTable view={picturesView(room, 'p0')} conn={c} serverOffset={0} />);
    tick(100);
    expect(caption(container)).toMatch(/^a foto era a /);
  });

  it('pular leva ao placar com os totais da visão; o host vê "próxima rodada" e manda next', () => {
    const c = conn();
    const room = revealed(3);
    const g = picturesView(room, 'p0').game;
    const { container } = render(<PicturesTable view={picturesView(room, 'p0')} conn={c} serverOffset={0} />);
    tick(600);
    fireEvent.click(screen.getByRole('button', { name: 'pular ›' }));
    expect(screen.getByRole('heading', { name: 'placar da rodada 1' })).toBeTruthy();
    expect(container.querySelector('.pc-rv-board .sum')!.textContent).toBe('3 obras · 6 acertos');
    for (const p of g.players) {
      const row = container.querySelector(`.pc-board-row[data-p="${p}"]`)!;
      expect(row.querySelector('.tot')!.textContent).toBe(`${g.scores[p]}pts`);
      expect(row.querySelector('.g')!.textContent).toBe(`+${g.result!.gained[p]}`);
      expect(seal(container, p)).toBe(`${g.scores[p]} pts`);
    }
    // ao lado do placar, todas as obras com a foto verdadeira (da grade da rodada) e os palpites
    const r = g.result!;
    const pages = container.querySelectorAll<HTMLElement>('.pc-rs-page');
    expect([...pages].map((pg) => pg.dataset.artist)).toEqual(r.order);
    for (const pg of pages) {
      const a = pg.dataset.artist!;
      const coord = r.secrets[a]!;
      const ph = pg.querySelector<HTMLElement>('.pc-rs-photo')!;
      expect(ph.dataset.zoomPhoto).toBe(coord);
      expect(ph.dataset.photo).toBe(r.grid[COORDS.indexOf(coord)]);
      expect(pg.querySelector('.gain')!.textContent).toBe(`+${r.correct[a]!.length}${r.correct[a]!.length === 1 ? 'pt' : 'pts'}`);
      for (const p of g.inRound.filter((q) => q !== a)) {
        const chip = pg.querySelector(`.pc-rs-g[data-g="${p}"]`)!;
        expect(chip.querySelector('.gc')!.textContent).toBe(r.guesses[p]?.[a] ?? '—');
        expect(chip.classList.contains('ok')).toBe(r.correct[a]!.includes(p));
      }
    }
    expect(screen.queryByText('esperando o host…')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'próxima rodada' }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'next' });
  });

  it('quem não é host vê "esperando o host…" (sem botão)', () => {
    render(<PicturesTable view={picturesView(revealed(3), 'p1')} conn={conn()} serverOffset={0} />);
    fireEvent.click(screen.getByRole('button', { name: 'pular ›' }));
    expect(screen.getByText('esperando o host…')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'próxima rodada' })).toBeNull();
  });

  it('o placar chega sozinho no fim da linha do tempo; a próxima rodada abre a montagem', () => {
    const c = conn();
    const room = revealed(3);
    const { rerender } = render(<PicturesTable view={picturesView(room, 'p0')} conn={c} serverOffset={0} />);
    tick(20_000);
    expect(screen.getByRole('heading', { name: 'placar da rodada 1' })).toBeTruthy();
    rerender(<PicturesTable view={picturesView(play(room, 'p0', { type: 'next' }), 'p0')} conn={c} serverOffset={0} />);
    expect(screen.getByRole('button', { name: 'estou pronto' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'pular ›' })).toBeNull();
  });

  it('ninguém montou nada: o aviso e depois o placar "ninguém montou nada nesta rodada"', () => {
    const v = picturesView(revealed(3), 'p0');
    const r = v.game.result!;
    const zero = { p0: 0, p1: 0, p2: 0 };
    const empty: PicturesRoomView = { ...v, game: { ...v.game, scores: zero, result: { ...r, order: [], works: {}, guesses: {}, correct: {}, gained: zero } } };
    const { container } = render(<PicturesTable view={empty} conn={conn()} serverOffset={0} />);
    expect(screen.getByText(/Ninguém montou nada nesta rodada, então não tem obra pra revelar/)).toBeTruthy();
    tick(2500);
    expect(container.querySelector('.pc-rv-board .sum')!.textContent).toBe('ninguém montou nada nesta rodada');
  });

  it('no placar, a obra amplia ao lado da foto verdadeira: ← → passam pelas obras, Esc fecha', () => {
    const v = picturesView(revealed(3), 'p0');
    const r = v.game.result!;
    const { container } = render(<PicturesTable view={v} conn={conn()} serverOffset={0} />);
    fireEvent.click(screen.getByRole('button', { name: 'pular ›' }));
    const [a0, a1] = r.order as [string, string];
    const nm = (p: string) => container.querySelector(`.pc-rs-page[data-artist="${p}"] .cap .nm`)!.textContent;
    fireEvent.click(container.querySelector(`.pc-rs-page[data-artist="${a0}"] .pc-rs-work`)!);
    let dialog = screen.getByRole('dialog', { name: `obra de ${nm(a0)}` });
    expect(dialog.querySelector('.pc-zoom-frame.photo .co')!.textContent).toBe(`era a${r.secrets[a0]}`);
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    dialog = screen.getByRole('dialog', { name: `obra de ${nm(a1)}` });
    expect(dialog.querySelector('.pc-zoom-frame.photo .co')!.textContent).toBe(`era a${r.secrets[a1]}`);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    // rodinha pra cima numa obra também abre
    fireEvent.wheel(container.querySelector(`.pc-rs-page[data-artist="${a1}"] .pc-rs-work`)!, { deltaY: -100 });
    expect(screen.getByRole('dialog', { name: `obra de ${nm(a1)}` })).toBeTruthy();
  });

  it('no placar, a foto verdadeira abre o zoom da mesa com a grade da rodada', () => {
    const v = picturesView(revealed(3), 'p0');
    const r = v.game.result!;
    const { container } = render(<PicturesTable view={v} conn={conn()} serverOffset={0} />);
    fireEvent.click(screen.getByRole('button', { name: 'pular ›' }));
    const a = r.order[0]!;
    fireEvent.click(container.querySelector(`.pc-rs-page[data-artist="${a}"] .pc-rs-photo .pc-zoom-btn`)!);
    expect(screen.getByRole('dialog', { name: `foto ${r.secrets[a]}` })).toBeTruthy();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('na última rodada o host vê "ver o fim do jogo"', () => {
    render(<PicturesTable view={picturesView(lastReveal(3), 'p0')} conn={conn()} serverOffset={0} />);
    fireEvent.click(screen.getByRole('button', { name: 'pular ›' }));
    expect(screen.getByRole('heading', { name: 'placar da rodada 6' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'ver o fim do jogo' })).toBeTruthy();
  });
});

describe('mesa do Retratim: fim de jogo', () => {
  const over = (scores: Record<string, number>, winners: string[], viewer: string): PicturesRoomView => {
    const v = picturesView(finished(3), viewer);
    return { ...v, game: { ...v.game, scores, winners } };
  };
  const rows = (c: HTMLElement) => [...c.querySelectorAll('.pc-fin-row')].map((r) => `${r.querySelector('.pos')!.textContent} ${r.querySelector('.nm')!.textContent} ${r.querySelector('.pts')!.textContent}`);

  it('empate geral: "empate!", todo mundo em 1º com estrelinha; o host joga de novo ou volta pro lobby', () => {
    const c = conn();
    const v = picturesView(finished(3), 'p0');
    expect(v.game.phase).toBe('gameover');
    const { container } = render(<PicturesTable view={v} conn={c} serverOffset={0} />);
    expect(screen.getByRole('heading', { name: 'fim de jogo' })).toBeTruthy();
    expect(container.querySelector('.pc-fin .sub')!.textContent).toBe('empate! você, P1 e P2 dividem o álbum');
    expect(container.querySelectorAll('.pc-fin-row .pos')).toHaveLength(3);
    expect([...container.querySelectorAll('.pc-fin-row .pos')].every((e) => e.textContent === '1º')).toBe(true);
    expect(container.querySelectorAll('.pc-fin-row .star')).toHaveLength(3);
    expect(container.querySelector('.pc-grid')).toBeNull(); // no fim a grade some
    fireEvent.click(screen.getByRole('button', { name: 'jogar de novo' }));
    // mandou: as duas travam até a visão nova (ver "botões do host não mandam ação duplicada")
    fireEvent.click(screen.getByRole('button', { name: 'voltar pro lobby' }));
    expect(c.sendAction.mock.calls.map(([a]) => a)).toEqual([{ type: 'again' }]);
    // abriu a mesa já no fim: sem confete
    expect(vi.mocked(confetti)).not.toHaveBeenCalled();
  });

  it('empate dividindo o 1º (1º, 1º, 3º) e quem não é host espera', () => {
    const { container } = render(<PicturesTable view={over({ p0: 10, p1: 7, p2: 10 }, ['p0', 'p2'], 'p1')} conn={conn()} serverOffset={0} />);
    expect(rows(container)).toEqual(['1º P0 10pts', '1º P2 10pts', '3º você 7pts']);
    expect(container.querySelector('.pc-fin .sub')!.textContent).toBe('empate! P0 e P2 dividem o álbum');
    expect(container.querySelectorAll('.pc-fin-row.win')).toHaveLength(2);
    expect(screen.getByText('esperando o host…')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'jogar de novo' })).toBeNull();
  });

  it('um vencedor: "você venceu!" e o 2º dividido', () => {
    const { container } = render(<PicturesTable view={over({ p0: 12, p1: 1, p2: 1 }, ['p0'], 'p0')} conn={conn()} serverOffset={0} />);
    expect(container.querySelector('.pc-fin .sub')!.textContent).toBe('você venceu!');
    expect(rows(container)).toEqual(['1º você 12pts', '2º P1 1pt', '2º P2 1pt']);
  });

  it('da revelação pro fim: confete de papel uma vez', () => {
    const c = conn();
    const { rerender } = render(<PicturesTable view={picturesView(lastReveal(3), 'p0')} conn={c} serverOffset={0} />);
    rerender(<PicturesTable view={picturesView(finished(3), 'p0')} conn={c} serverOffset={0} />);
    expect(vi.mocked(confetti)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(confetti).mock.calls[0]![1]).toContain('#2f5aa8');
  });
});

describe('mesa do Retratim: sons', () => {
  const sons = () => vi.mocked(playPicturesSound).mock.calls.map(([n]) => n);
  const photo = (container: HTMLElement, coord: string) => container.querySelector<HTMLElement>(`.pc-photo[data-coord="${coord}"]`)!;

  it('abrir a mesa na rodada 0 toca "round"; outra pessoa ficar pronta toca "ready" (desfazer, não)', () => {
    const c = conn();
    let room = started(3);
    const { rerender } = render(<PicturesTable view={picturesView(room, 'p0')} conn={c} serverOffset={0} />);
    expect(sons()).toEqual(['round']);
    const show = () => rerender(<PicturesTable view={picturesView(room, 'p0')} conn={c} serverOffset={0} />);
    show(); // a mesma visão de novo: quieto
    room = play(room, 'p1', { type: 'ready', on: true, work: randomWork('laces') });
    show();
    expect(sons()).toEqual(['round', 'ready']);
    room = play(room, 'p1', { type: 'ready', on: false });
    show();
    expect(sons()).toEqual(['round', 'ready']);
  });

  it('abrir a mesa já no meio da partida (palpites) não toca "round"; confirmar toca "ready"', () => {
    const c = conn();
    let room = guessing(3);
    const { rerender } = render(<PicturesTable view={picturesView(room, 'p0')} conn={c} serverOffset={0} />);
    expect(sons()).toEqual([]);
    room = play(room, 'p1', { type: 'confirm' });
    rerender(<PicturesTable view={picturesView(room, 'p0')} conn={c} serverOffset={0} />);
    expect(sons()).toEqual(['ready']);
  });

  it('a rodada seguinte (de volta à montagem) toca "round"', () => {
    const c = conn();
    const { rerender } = render(<PicturesTable view={picturesView(lastReveal(3), 'p0')} conn={c} serverOffset={0} />);
    expect(sons()).toEqual([]);
    const next = play(revealed(3), 'p0', { type: 'next' });
    rerender(<PicturesTable view={picturesView(next, 'p0')} conn={c} serverOffset={0} />);
    expect(sons()).toContain('round');
  });

  it('adesivo colando e saindo na galeria: "tape" e "peel"', () => {
    const c = conn();
    const { container } = render(<PicturesTable view={picturesView(guessing(3), 'p0')} conn={c} serverOffset={0} />);
    fireEvent.click(screen.getByRole('button', { name: 'adesivo de P1' }));
    fireEvent.click(photo(container, 'B2'));
    expect(sons()).toEqual(['tape']);
    fireEvent.click(screen.getByRole('button', { name: 'tirar o palpite de P1 (B2)' }));
    expect(sons()).toEqual(['tape', 'peel']);
  });

  it('"tick" nos 5 s finais da contagem, uma vez por segundo', () => {
    vi.setSystemTime(1_000_000);
    const hurried = play(started(3), 'p0', { type: 'hurry' }, 1_000_000);
    render(<PicturesTable view={picturesView(hurried, 'p0')} conn={conn()} serverOffset={0} />);
    vi.mocked(playPicturesSound).mockClear();
    // um segundo por vez: o relógio do navegador renderiza a cada batida
    const wait = (s: number) => {
      for (let i = 0; i < s; i++) rtlAct(() => vi.advanceTimersByTime(1000));
    };
    wait(24);
    expect(sons()).toEqual([]);
    wait(7);
    expect(sons()).toEqual(['tick', 'tick', 'tick', 'tick', 'tick']);
  });

  it('erro do servidor e aviso do palco tocam "error"; botão da mesa toca o clique baixinho, o zoom da foto secreta não', () => {
    const c = conn();
    const { container } = render(<PicturesTable view={picturesView(started(3), 'p0')} conn={c} serverOffset={0} />);
    vi.mocked(playPicturesSound).mockClear();
    fail(c, 'empty_work', 'Monte alguma coisa antes de ficar pronto.');
    expect(sons()).toEqual(['error']);
    vi.mocked(playPicturesSound).mockClear();
    fireEvent.click(container.querySelector('.pc-secret-card')!);
    expect(sons()).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'fechar' }));
    expect(sons()).toEqual(['click']);
  });

  it('fim de jogo: quem venceu ouve "win" (uma vez, só na troca de fase)', () => {
    const c = conn();
    const { rerender } = render(<PicturesTable view={picturesView(lastReveal(3), 'p0')} conn={c} serverOffset={0} />);
    rerender(<PicturesTable view={picturesView(finished(3), 'p0')} conn={c} serverOffset={0} />);
    expect(sons().filter((n) => n === 'win')).toEqual(['win']);
  });
});

describe('mesa do Retratim: sons e relógio da revelação', () => {
  const tick = (ms: number) => rtlAct(() => vi.advanceTimersByTime(ms));
  const REVEAL = ['tape', 'shutter', 'plim'];
  const revealSounds = () => vi.mocked(playPicturesSound).mock.calls.map(([n]) => n).filter((n) => REVEAL.includes(n));

  it('"tape" a cada fitinha e "shutter" quando a foto sai da grade, na hora certa', () => {
    render(<PicturesTable view={picturesView(revealed(3), 'p0')} conn={conn()} serverOffset={0} />);
    tick(1150); // a obra já cresceu; a 1ª fitinha sai em 1200
    expect(revealSounds()).toEqual([]);
    tick(100);
    expect(revealSounds()).toEqual(['tape']);
    tick(400);
    expect(revealSounds()).toEqual(['tape', 'tape']);
    tick(650); // a foto sai em 2400
    expect(revealSounds()).toEqual(['tape', 'tape']);
    tick(100);
    expect(revealSounds()).toEqual(['tape', 'tape', 'shutter']);
    tick(2050); // os pontos: +2 pra você, +1 pra P1, +1 pra P2 (4400, 4620, 4840)
    expect(revealSounds()).toEqual(['tape', 'tape', 'shutter', 'plim']);
    tick(220);
    tick(220);
    expect(revealSounds()).toEqual(['tape', 'tape', 'shutter', 'plim', 'plim', 'plim']);
  });

  it('depois de "pular", nenhum som da revelação', () => {
    render(<PicturesTable view={picturesView(revealed(3), 'p0')} conn={conn()} serverOffset={0} />);
    tick(1300);
    fireEvent.click(screen.getByRole('button', { name: 'pular ›' }));
    vi.mocked(playPicturesSound).mockClear();
    tick(20_000);
    expect(revealSounds()).toEqual([]);
  });

  it('um salto grande de tempo não vira uma rajada com os sons atrasados', () => {
    render(<PicturesTable view={picturesView(revealed(3), 'p0')} conn={conn()} serverOffset={0} />);
    tick(4300); // tudo de uma vez: fitinhas e foto já ficaram pra trás
    expect(revealSounds()).toEqual([]);
  });

  it('re-render com outro estado (alguém saiu) não recomeça a revelação nem repete os sons', () => {
    const c = conn();
    const v = picturesView(revealed(3), 'p0');
    const { container, rerender } = render(<PicturesTable view={v} conn={c} serverOffset={0} />);
    tick(1250);
    tick(400);
    tick(800);
    expect(container.querySelector('.pc-rv-t')!.textContent).toMatch(/^a foto era a /);
    const left: PicturesRoomView = {
      ...v,
      seats: v.seats.map((s) => (s.id === 'p2' ? { ...s, connected: false } : s)),
      game: { ...v.game, result: { ...v.game.result! } },
    };
    rerender(<PicturesTable view={left} conn={c} serverOffset={0} />);
    tick(100);
    expect(container.querySelector('.pc-rv-t')!.textContent).toMatch(/^a foto era a /);
    expect(container.querySelector('.pc-rv-n')!.textContent).toBe('obra 1 de 3');
    expect(revealSounds()).toEqual(['tape', 'tape', 'shutter']);
  });

  it('nenhum relógio sobra depois de desmontar no meio da revelação', () => {
    const { unmount } = render(<PicturesTable view={picturesView(revealed(3), 'p0')} conn={conn()} serverOffset={0} />);
    tick(500);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('nenhum relógio sobra depois de "pular"', () => {
    render(<PicturesTable view={picturesView(revealed(3), 'p0')} conn={conn()} serverOffset={0} />);
    tick(500);
    fireEvent.click(screen.getByRole('button', { name: 'pular ›' }));
    tick(100);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('mesa do Retratim: botões do host não mandam ação duplicada', () => {
  const sent = (c: Conn) => c.sendAction.mock.calls.map(([a]) => a.type);

  it('"próxima rodada": clique duplo manda um next só; visão nova destrava', () => {
    const c = conn();
    const room = revealed(3);
    const { rerender } = render(<PicturesTable view={picturesView(room, 'p0')} conn={c} serverOffset={0} />);
    fireEvent.click(screen.getByRole('button', { name: 'pular ›' }));
    const btn = screen.getByRole('button', { name: 'próxima rodada' }) as HTMLButtonElement;
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(sent(c)).toEqual(['next']);
    expect(btn.disabled).toBe(true);
    rerender(<PicturesTable view={picturesView(room, 'p0')} conn={c} serverOffset={0} />);
    expect((screen.getByRole('button', { name: 'próxima rodada' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('recusa do servidor (gente de menos) destrava o botão', () => {
    const c = conn();
    render(<PicturesTable view={picturesView(revealed(3), 'p0')} conn={c} serverOffset={0} />);
    fireEvent.click(screen.getByRole('button', { name: 'pular ›' }));
    fireEvent.click(screen.getByRole('button', { name: 'próxima rodada' }));
    fail(c, 'need_3_players', 'Precisa de pelo menos 3 jogadores.');
    const btn = screen.getByRole('button', { name: 'próxima rodada' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(sent(c)).toEqual(['next', 'next']);
  });

  it('fim de jogo: "jogar de novo" e "voltar pro lobby" mandam uma ação só (as duas travam juntas)', () => {
    const c = conn();
    const room = finished(3);
    const { rerender } = render(<PicturesTable view={picturesView(room, 'p0')} conn={c} serverOffset={0} />);
    const again = screen.getByRole('button', { name: 'jogar de novo' }) as HTMLButtonElement;
    const lobby = screen.getByRole('button', { name: 'voltar pro lobby' }) as HTMLButtonElement;
    fireEvent.click(again);
    fireEvent.click(again);
    fireEvent.click(lobby);
    expect(sent(c)).toEqual(['again']);
    expect(again.disabled && lobby.disabled).toBe(true);
    rerender(<PicturesTable view={picturesView(room, 'p0')} conn={c} serverOffset={0} />);
    fireEvent.click(screen.getByRole('button', { name: 'voltar pro lobby' }));
    fireEvent.click(screen.getByRole('button', { name: 'voltar pro lobby' }));
    expect(sent(c)).toEqual(['again', 'lobby']);
  });
});

describe('mesa do Retratim: divisor durante o voo da foto', () => {
  it('o divisor mudou o tamanho com a foto voando: ela pousa direto no lugar novo', () => {
    const proto = HTMLElement.prototype as unknown as { animate?: unknown };
    const real = proto.animate;
    // um voo que nunca termina sozinho
    proto.animate = vi.fn(() => ({ finished: new Promise(() => {}), cancel() {} }));
    try {
      const { container } = render(<PicturesTable view={picturesView(revealed(3), 'p0')} conn={conn()} serverOffset={0} />);
      rtlAct(() => vi.advanceTimersByTime(2450));
      expect(container.querySelector('.pc-fly')).toBeTruthy();
      expect(container.querySelector('.pc-rv-slot')!.classList.contains('on')).toBe(false);
      fireEvent.keyDown(screen.getByRole('separator', { name: 'divisor' }), { key: 'ArrowLeft' });
      expect(container.querySelector('.pc-fly')).toBeNull();
      expect(container.querySelector('.pc-rv-slot')!.classList.contains('on')).toBe(true);
    } finally {
      proto.animate = real;
    }
  });
});
