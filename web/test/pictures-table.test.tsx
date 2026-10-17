import { act as rtlAct, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { playSound } from '../src/brand/sounds';
import { PicturesTable } from '../src/games/pictures/PicturesTable';
import { randomWork } from '../src/games/pictures/random';
import { KIT_NAMES } from '../src/games/pictures/status';
import type { GameConn } from '../src/net/connection';
import { COORDS, type PicturesRoomView } from '@cartolina/shared';
import { confetti } from '../src/table/confetti';
import { finished, guessing, lastReveal, picturesView, play, revealed, started, stateOf } from './pictures-fixtures';

vi.mock('../src/brand/sounds', () => ({ playSound: vi.fn() }));
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
    expect(vi.mocked(playSound)).toHaveBeenCalledWith('error');
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

describe('mesa do Retratim: galeria de palpites', () => {
  const photo = (container: HTMLElement, coord: string) => container.querySelector<HTMLElement>(`.pc-photo[data-coord="${coord}"]`)!;
  const frame = (container: HTMLElement, p: string) => container.querySelector<HTMLElement>(`.pc-wf[data-artist="${p}"]`)!;

  it('mostra as obras dos outros (não a sua) com artista e kit, a grade e os selinhos', () => {
    const room = guessing(3);
    const { container } = render(<PicturesTable view={picturesView(room, 'p0')} conn={conn()} serverOffset={0} />);
    expect(screen.getByText('de quem é qual foto?')).toBeTruthy();
    const frames = [...container.querySelectorAll<HTMLElement>('.pc-wf')];
    expect(frames.map((f) => f.dataset.artist)).toEqual(['p1', 'p2']);
    const kits = stateOf(room).kits;
    expect(frame(container, 'p1').querySelector('.cap .nm')!.textContent).toBe('P1');
    expect(frame(container, 'p1').querySelector('.cap .kt')!.textContent).toBe(KIT_NAMES[kits.p1!]);
    expect(frame(container, 'p2').querySelector('.cap .kt')!.textContent).toBe(KIT_NAMES[kits.p2!]);
    // cada moldura desenha a obra na própria folha
    expect(frame(container, 'p1').querySelector('.pc-wsheet')!.childElementCount).toBeGreaterThan(0);
    expect(container.querySelectorAll('.pc-grid .pc-photo')).toHaveLength(16);
    expect(container.querySelector('.pc-bench')).toBeNull();
    expect(frame(container, 'p1').classList.contains('sel')).toBe(true);
    expect(frame(container, 'p1').querySelector('.pc-empty-tag')!.textContent).toBe('sem palpite');
    expect(container.querySelector('.pc-seal[data-p="p1"] .stt')!.textContent).toBe('palpitando…');
  });

  it('clicar na foto cola a fitinha na obra selecionada; a mesma foto vale em duas obras; a fitinha tira', () => {
    const c = conn();
    let room = guessing(3);
    const { container, rerender } = render(<PicturesTable view={picturesView(room, 'p0')} conn={c} serverOffset={0} />);
    const show = () => rerender(<PicturesTable view={picturesView(room, 'p0')} conn={c} serverOffset={0} />);

    fireEvent.click(photo(container, 'B2'));
    expect(c.sendAction).toHaveBeenLastCalledWith({ type: 'guess', artist: 'p1', coord: 'B2' });
    // sem o eco ainda nada aparece: o que vale são os palpites da visão
    expect(frame(container, 'p1').querySelector('.pc-gtape')).toBeNull();
    room = play(room, 'p0', c.sendAction.mock.lastCall![0]);
    show();
    const tape = frame(container, 'p1').querySelector('.pc-gtape')!;
    expect(tape.textContent).toBe('B2');
    expect(tape.classList.contains('pop')).toBe(true);
    expect(photo(container, 'B2').classList.contains('picked')).toBe(true);
    expect(photo(container, 'B2').querySelectorAll('.pc-used > span')).toHaveLength(1);

    // seleciona a outra obra e cola a mesma foto
    fireEvent.click(frame(container, 'p2'));
    expect(frame(container, 'p2').classList.contains('sel')).toBe(true);
    expect(photo(container, 'B2').classList.contains('picked')).toBe(false);
    fireEvent.click(photo(container, 'B2'));
    expect(c.sendAction).toHaveBeenLastCalledWith({ type: 'guess', artist: 'p2', coord: 'B2' });
    room = play(room, 'p0', c.sendAction.mock.lastCall![0]);
    show();
    expect(photo(container, 'B2').querySelectorAll('.pc-used > span')).toHaveLength(2);

    // clicar de novo na mesma foto não manda nada; trocar manda a nova
    const sent = c.sendAction.mock.calls.length;
    fireEvent.click(photo(container, 'B2'));
    expect(c.sendAction).toHaveBeenCalledTimes(sent);
    fireEvent.click(photo(container, 'D4'));
    expect(c.sendAction).toHaveBeenLastCalledWith({ type: 'guess', artist: 'p2', coord: 'D4' });

    // a fitinha da p1 sai (e a obra fica selecionada)
    expect(screen.getAllByRole('button', { name: 'tirar o palpite B2' })).toHaveLength(2);
    fireEvent.click(frame(container, 'p1').querySelector('.pc-gtape')!);
    expect(c.sendAction).toHaveBeenLastCalledWith({ type: 'guess', artist: 'p1', coord: null });
    expect(frame(container, 'p1').classList.contains('sel')).toBe(true);
  });

  it('teclado: letra e número colam a fitinha (com a foto ampliada aberta, não)', () => {
    const c = conn();
    const { container } = render(<PicturesTable view={picturesView(guessing(3), 'p0')} conn={c} serverOffset={0} />);
    fireEvent.keyDown(document, { key: 'c' });
    fireEvent.keyDown(document, { key: '3' });
    expect(c.sendAction).toHaveBeenLastCalledWith({ type: 'guess', artist: 'p1', coord: 'C3' });
    // um número sem letra antes não faz nada
    fireEvent.keyDown(document, { key: '2' });
    expect(c.sendAction).toHaveBeenCalledTimes(1);

    // a lupinha abre a foto grande (sem palpite); lá as setas passam as fotos
    fireEvent.click(photo(container, 'A1').querySelector('.pc-zoom-btn')!);
    expect(screen.getByRole('dialog', { name: 'foto A1' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'b' });
    fireEvent.keyDown(document, { key: '1' });
    expect(c.sendAction).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a lupa da obra abre a obra grande com o artista e a sua fitinha; Esc fecha', () => {
    const c = conn();
    let room = guessing(3);
    room = play(room, 'p0', { type: 'guess', artist: 'p2', coord: 'A4' });
    const { container } = render(<PicturesTable view={picturesView(room, 'p0')} conn={c} serverOffset={0} />);
    fireEvent.click(screen.getByRole('button', { name: 'ver a obra de P2 grande' }));
    const dialog = screen.getByRole('dialog', { name: 'obra de P2' });
    expect(dialog.querySelector('.who .nm')!.textContent).toBe('P2');
    expect(dialog.querySelector('.pc-gtape')!.textContent).toBe('A4');
    expect(dialog.querySelector('.pic')!.childElementCount).toBeGreaterThan(0);
    // a lupa não seleciona a obra, e o teclado não cola fitinha com ela aberta
    expect(frame(container, 'p1').classList.contains('sel')).toBe(true);
    fireEvent.keyDown(document, { key: 'b' });
    fireEvent.keyDown(document, { key: '1' });
    expect(c.sendAction).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('"confirmar palpites" avisa quantas faltam e manda confirm; depois só "esperando a galera…"', () => {
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
    expect(container.querySelector('.pc-wf.sel')).toBeNull();
    expect(container.querySelector('.pc-empty-tag')).toBeNull();
    // a fitinha fica, mas não sai mais; foto, obra e teclado não mandam nada
    expect(frame(container, 'p1').querySelector('.pc-gtape')!.tagName).toBe('SPAN');
    fireEvent.click(frame(container, 'p2'));
    fireEvent.click(photo(container, 'C2'));
    fireEvent.keyDown(document, { key: 'c' });
    fireEvent.keyDown(document, { key: '2' });
    expect(c.sendAction).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Você já confirmou.')).toBeTruthy();
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
    // todas as fotos reveladas marcadas na grade
    expect(container.querySelectorAll('.pc-grid .pc-used > span').length).toBe(3);
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
    fireEvent.click(screen.getByRole('button', { name: 'voltar pro lobby' }));
    expect(c.sendAction.mock.calls.map(([a]) => a)).toEqual([{ type: 'again' }, { type: 'lobby' }]);
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
