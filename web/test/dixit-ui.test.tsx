import { act as rtlAct, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionPanel, type PanelActions } from '../src/games/dixit/ActionPanel';
import { CardArt } from '../src/games/dixit/CardArt';
import { CardViewer } from '../src/games/dixit/CardViewer';
import { DixitTopBar } from '../src/games/dixit/DixitTopBar';
import { Felt } from '../src/games/dixit/Felt';
import { Hand } from '../src/games/dixit/Hand';
import { RevealCaption } from '../src/games/dixit/RevealCaption';
import { RoundBoard } from '../src/games/dixit/RoundBoard';
import { Seats } from '../src/games/dixit/Seats';
import { fitStage, tableSlots } from '../src/games/dixit/geometry';
import { buildRevealTimeline } from '../src/games/dixit/reveal';
import { useReveal } from '../src/games/dixit/useReveal';
import { useStageFit } from '../src/games/dixit/useStageFit';
import { playDixitSound } from '../src/games/dixit/sounds';
import { colorer, namer } from '../src/games/dixit/status';
import { dixitRoom, dixitView, othersOf, play, revealed, started, stateOf, told, voting } from './dixit-fixtures';

vi.mock('../src/games/dixit/sounds', () => ({ playDixitSound: vi.fn() }));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  document.querySelectorAll('body > .dx-felt').forEach((e) => e.remove());
});

const sounds = () => vi.mocked(playDixitSound).mock.calls.map((c) => c[0]);

describe('arte da carta', () => {
  it('mostra a imagem e, se ela falhar, volta para a pintura em SVG', () => {
    const { container } = render(<CardArt id="d001" />);
    const img = container.querySelector('img.dx-art');
    expect(img).toBeTruthy();
    expect(container.querySelector('svg')).toBeNull();
    fireEvent.error(img!);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.dx-art svg')).toBeTruthy();
  });

  it('a falha de uma carta não vaza para a próxima', () => {
    const { container, rerender } = render(<CardArt id="d001" />);
    fireEvent.error(container.querySelector('img.dx-art')!);
    expect(container.querySelector('img')).toBeNull();
    rerender(<CardArt id="d002" />);
    expect(container.querySelector('img.dx-art')).toBeTruthy();
  });
});

describe('carta ampliada', () => {
  const label = (_id: string, i: number) => `carta ${i + 1}`;

  it('abre com o foco no diálogo; setas navegam; Esc fecha; ao fechar o foco volta', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const onClose = vi.fn();
    const onIndex = vi.fn();
    const { unmount } = render(<CardViewer ids={['d001', 'd002']} index={0} label={label} onIndex={onIndex} onClose={onClose} />);
    const dialog = screen.getByRole('dialog', { name: 'carta 1' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(dialog);
    fireEvent.keyDown(dialog, { key: 'ArrowRight' });
    expect(onIndex).toHaveBeenLastCalledWith(1);
    fireEvent.keyDown(dialog, { key: 'ArrowLeft' });
    expect(onIndex).toHaveBeenLastCalledWith(1);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('teclas fora do diálogo (ex.: campo da dica) não trocam de carta', () => {
    const onIndex = vi.fn();
    render(<CardViewer ids={['d001', 'd002']} index={0} label={label} onIndex={onIndex} onClose={vi.fn()} />);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onIndex).not.toHaveBeenCalled();
  });

  it('sem cartas não desenha nada nem reage às setas', () => {
    const onIndex = vi.fn();
    const { container } = render(<CardViewer ids={[]} index={0} label={label} onIndex={onIndex} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onIndex).not.toHaveBeenCalled();
  });

  it('rodinha pra baixo fecha (não logo ao abrir)', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<CardViewer ids={['d001', 'd002']} index={0} label={label} onIndex={vi.fn()} onClose={onClose} />);
    const dialog = screen.getByRole('dialog');
    fireEvent.wheel(dialog, { deltaY: 100 });
    expect(onClose).not.toHaveBeenCalled();
    rtlAct(() => vi.advanceTimersByTime(400));
    fireEvent.wheel(dialog, { deltaY: 100 });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

/** jsdom não tem `elementFromPoint`: cria e devolve o espião (o ponteiro "está em cima" de `alvo`). */
function pointAt(alvo: Element | null) {
  if (!document.elementFromPoint) document.elementFromPoint = () => null;
  return vi.spyOn(document, 'elementFromPoint').mockReturnValue(alvo);
}

/** Um feltro de mentira na página, pra soltar a carta em cima. */
function fakeFelt(): HTMLElement {
  const felt = document.createElement('div');
  felt.className = 'dx-felt';
  const inside = document.createElement('span');
  felt.appendChild(inside);
  document.body.appendChild(felt);
  return inside;
}

function drag(card: HTMLElement, from: [number, number], to: [number, number], end: 'up' | 'cancel' = 'up') {
  fireEvent.pointerDown(card, { pointerId: 1, button: 0, clientX: from[0], clientY: from[1] });
  fireEvent.pointerMove(card, { pointerId: 1, clientX: to[0], clientY: to[1] });
  if (end === 'up') fireEvent.pointerUp(card, { pointerId: 1, clientX: to[0], clientY: to[1] });
  else fireEvent.pointerCancel(card, { pointerId: 1 });
}

describe('mão', () => {
  const handProps = () => ({
    ids: ['d001', 'd002', 'd003'],
    away: [] as string[],
    canPlay: true,
    blocked: false,
    onPlay: vi.fn(),
    onBlocked: vi.fn(),
    onReorder: vi.fn(),
    onZoom: vi.fn(),
    onDropState: vi.fn(),
  });

  it('clique simples amplia; ⤢ também', () => {
    const p = handProps();
    render(<Hand {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'sua carta 1' }));
    expect(p.onZoom).toHaveBeenLastCalledWith('d001');
    fireEvent.click(screen.getAllByRole('button', { name: 'ampliar' })[1]!);
    expect(p.onZoom).toHaveBeenLastCalledWith('d002');
    expect(p.onPlay).not.toHaveBeenCalled();
  });

  it('Enter joga na sua vez, avisa se falta a dica e amplia fora da vez', () => {
    const p = handProps();
    const { rerender } = render(<Hand {...p} />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'sua carta 2' }), { key: 'Enter' });
    expect(p.onPlay).toHaveBeenCalledWith('d002', null);
    rerender(<Hand {...p} blocked />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'sua carta 2' }), { key: 'Enter' });
    expect(p.onBlocked).toHaveBeenCalledTimes(1);
    expect(p.onPlay).toHaveBeenCalledTimes(1);
    rerender(<Hand {...p} canPlay={false} />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'sua carta 2' }), { key: 'Enter' });
    expect(p.onZoom).toHaveBeenCalledWith('d002');
  });

  it('arrastar e soltar no feltro joga a carta no ponto onde soltou', () => {
    const p = handProps();
    pointAt(fakeFelt());
    render(<Hand {...p} />);
    const card = screen.getByRole('button', { name: 'sua carta 1' });
    fireEvent.pointerDown(card, { pointerId: 1, button: 0, clientX: 300, clientY: 800 });
    fireEvent.pointerMove(card, { pointerId: 1, clientX: 320, clientY: 400 });
    expect(card.classList.contains('dragging')).toBe(true);
    expect(p.onDropState.mock.calls.map((c) => c[0])).toEqual(['ready', 'over']);
    fireEvent.pointerUp(card, { pointerId: 1, clientX: 320, clientY: 400 });
    expect(p.onPlay).toHaveBeenCalledWith('d001', { x: 320, y: 400 });
    expect(p.onDropState).toHaveBeenLastCalledWith(null);
    expect(p.onReorder).not.toHaveBeenCalled();
    // o clique que vem depois do arrasto não amplia
    fireEvent.click(card);
    expect(p.onZoom).not.toHaveBeenCalled();
  });

  it('sem a dica, o feltro fica vermelho e a carta volta (avisa em vez de jogar)', () => {
    const p = handProps();
    pointAt(fakeFelt());
    render(<Hand {...p} blocked />);
    drag(screen.getByRole('button', { name: 'sua carta 1' }), [300, 800], [320, 400]);
    expect(p.onDropState.mock.calls.map((c) => c[0])).toEqual(['no', null]);
    expect(p.onBlocked).toHaveBeenCalledTimes(1);
    expect(p.onPlay).not.toHaveBeenCalled();
  });

  it('soltar fora do feltro reordena (as outras abrem espaço durante o arrasto)', () => {
    const p = handProps();
    pointAt(document.body);
    const { container } = render(<Hand {...p} />);
    const card = screen.getByRole('button', { name: 'sua carta 1' });
    // jsdom: a mão mede 0 → escala 1 e x da mão = x da tela; 536 é o centro da 3ª carta
    fireEvent.pointerDown(card, { pointerId: 1, button: 0, clientX: 304, clientY: 800 });
    fireEvent.pointerMove(card, { pointerId: 1, clientX: 536, clientY: 790 });
    const left = (id: string) => (container.querySelector(`[data-card-id="${id}"]`) as HTMLElement).style.left;
    expect(left('d002')).toBe('304px');
    expect(left('d003')).toBe('420px');
    fireEvent.pointerUp(card, { pointerId: 1, clientX: 536, clientY: 790 });
    expect(p.onReorder).toHaveBeenCalledWith(['d002', 'd003', 'd001']);
    expect(p.onPlay).not.toHaveBeenCalled();
    expect(sounds()).toEqual(['pick', 'land']);
  });

  it('fora da vez, soltar no feltro só reordena; cancelar devolve sem fazer nada', () => {
    const p = handProps();
    pointAt(fakeFelt());
    render(<Hand {...p} canPlay={false} />);
    drag(screen.getByRole('button', { name: 'sua carta 3' }), [536, 800], [300, 400]);
    expect(p.onPlay).not.toHaveBeenCalled();
    expect(p.onReorder).toHaveBeenCalledWith(['d003', 'd001', 'd002']);
    p.onReorder.mockClear();
    drag(screen.getByRole('button', { name: 'sua carta 1' }), [300, 800], [536, 790], 'cancel');
    expect(p.onReorder).not.toHaveBeenCalled();
    expect(p.onPlay).not.toHaveBeenCalled();
  });

  it('carta que foi pra mesa some; fora da vez a mão fica apagada', () => {
    const p = handProps();
    const { container } = render(<Hand {...p} away={['d002']} canPlay={false} />);
    expect(container.querySelectorAll('.dx-hcard.away')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /^sua carta/ })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'sua carta 2' }).getAttribute('data-card-id')).toBe('d003');
    expect(container.querySelector('.dx-hand.off')).toBeTruthy();
  });

  it('Espaço também joga', () => {
    const p = handProps();
    render(<Hand {...p} />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'sua carta 3' }), { key: ' ' });
    expect(p.onPlay).toHaveBeenCalledWith('d003', null);
  });

  it('andar menos de 6 px ainda é clique (amplia)', () => {
    const p = handProps();
    pointAt(fakeFelt());
    render(<Hand {...p} />);
    const card = screen.getByRole('button', { name: 'sua carta 1' });
    drag(card, [300, 800], [303, 797]);
    expect(card.classList.contains('dragging')).toBe(false);
    fireEvent.click(card);
    expect(p.onZoom).toHaveBeenCalledWith('d001');
    expect(p.onPlay).not.toHaveBeenCalled();
    expect(p.onDropState).not.toHaveBeenCalled();
  });

  it('outro ponteiro (outro dedo) é ignorado', () => {
    const p = handProps();
    pointAt(fakeFelt());
    render(<Hand {...p} />);
    const card = screen.getByRole('button', { name: 'sua carta 1' });
    fireEvent.pointerDown(card, { pointerId: 1, button: 0, clientX: 300, clientY: 800 });
    fireEvent.pointerMove(card, { pointerId: 2, clientX: 320, clientY: 400 });
    expect(card.classList.contains('dragging')).toBe(false);
    fireEvent.pointerUp(card, { pointerId: 2, clientX: 320, clientY: 400 });
    expect(p.onPlay).not.toHaveBeenCalled();
  });

  it('desmontar no meio do arrasto apaga o feltro', () => {
    const p = handProps();
    pointAt(fakeFelt());
    const { unmount } = render(<Hand {...p} />);
    const card = screen.getByRole('button', { name: 'sua carta 1' });
    fireEvent.pointerDown(card, { pointerId: 1, button: 0, clientX: 300, clientY: 800 });
    fireEvent.pointerMove(card, { pointerId: 1, clientX: 320, clientY: 400 });
    expect(p.onDropState).toHaveBeenLastCalledWith('over');
    unmount();
    expect(p.onDropState).toHaveBeenLastCalledWith(null);
  });

  it('carta que sai da mão no meio do arrasto: o arrasto acaba e soltar não joga', () => {
    const p = handProps();
    pointAt(fakeFelt());
    const { rerender } = render(<Hand {...p} />);
    const card = screen.getByRole('button', { name: 'sua carta 1' });
    fireEvent.pointerDown(card, { pointerId: 1, button: 0, clientX: 300, clientY: 800 });
    fireEvent.pointerMove(card, { pointerId: 1, clientX: 320, clientY: 400 });
    rerender(<Hand {...p} away={['d001']} />);
    expect(p.onDropState).toHaveBeenLastCalledWith(null);
    expect(card.classList.contains('dragging')).toBe(false);
    fireEvent.pointerUp(card, { pointerId: 1, clientX: 320, clientY: 400 });
    expect(p.onPlay).not.toHaveBeenCalled();
    expect(p.onReorder).not.toHaveBeenCalled();
  });
});

describe('feltro', () => {
  const props = (v: ReturnType<typeof dixitView>) => ({
    view: v,
    name: namer(v),
    color: colorer(v),
    frame: null,
    scores: v.game.scores,
    dropState: null,
    pending: [] as string[],
    dropPoints: {},
    clueReady: false,
    onCard: vi.fn(),
    onZoom: vi.fn(),
    canUnpend: true,
    onUnpend: vi.fn(),
  });
  const tellerOf = (room: ReturnType<typeof started>) => stateOf(room).storyteller!;

  it('trilha 0…meta e um peão por jogador', () => {
    const v = dixitView(started(4), 'p0');
    const { container } = render(<Felt {...props(v)} />);
    expect(container.querySelectorAll('.dx-cell')).toHaveLength(31);
    expect(container.querySelectorAll('.dx-pawn')).toHaveLength(4);
    expect(screen.getAllByRole('img', { name: /pontos$/ })).toHaveLength(4);
  });

  it('quem narra vê primeiro o pedido da dica, depois o de arrastar a carta; os outros esperam', () => {
    const room = started(4);
    const v = dixitView(room, tellerOf(room));
    const { rerender } = render(<Felt {...props(v)} />);
    expect(screen.getByText('primeiro a dica: escreva ou marque “vou falar na call”')).toBeTruthy();
    rerender(<Felt {...props(v)} clueReady />);
    expect(screen.getByText('arraste pra cá a carta da sua dica')).toBeTruthy();
    rerender(<Felt {...props(dixitView(room, othersOf(room)[0]!))} />);
    expect(screen.getByText(/está escolhendo a carta…/)).toBeTruthy();
  });

  it('o feltro mostra o estado do arrasto', () => {
    const v = dixitView(started(4), 'p0');
    const { container, rerender } = render(<Felt {...props(v)} dropState="no" />);
    expect(container.querySelector('.dx-felt.drop-no')).toBeTruthy();
    rerender(<Felt {...props(v)} dropState={null} />);
    expect(container.querySelector('.dx-felt')!.className).toBe('dx-felt');
  });

  it('na escolha, uma carta virada solta por jogada: narrador + confirmados + suas pendentes', () => {
    let room = told(4);
    const [a, b] = othersOf(room) as [string, string];
    const { container, rerender } = render(<Felt {...props(dixitView(room, b))} />);
    expect(container.querySelectorAll('.dx-tcard.loose')).toHaveLength(1);
    room = play(room, a, { type: 'submit', cardIds: stateOf(room).hands[a]!.slice(0, 1) });
    room = play(room, a, { type: 'confirm' });
    const p = props(dixitView(room, b));
    rerender(<Felt {...p} pending={['x']} />);
    expect(container.querySelectorAll('.dx-tcard.loose')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'devolver sua carta pra mão' }));
    expect(p.onUnpend).toHaveBeenCalledWith('x');
    rerender(<Felt {...p} pending={[]} />);
    expect(container.querySelectorAll('.dx-tcard.loose')).toHaveLength(2);
  });

  it('em 3 jogadores, quem confirma põe 2 cartas na mesa', () => {
    let room = told(3);
    const [a, b] = othersOf(room) as [string, string];
    room = play(room, a, { type: 'submit', cardIds: stateOf(room).hands[a]!.slice(0, 2) });
    room = play(room, a, { type: 'confirm' });
    const { container } = render(<Felt {...props(dixitView(room, b))} />);
    expect(container.querySelectorAll('.dx-tcard.loose')).toHaveLength(3);
  });

  it('a sua carta cai onde você soltou', () => {
    const room = started(4);
    const me = tellerOf(room);
    const { container, rerender } = render(<Felt {...props(dixitView(room, me))} />);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 1000, height: 560, right: 1000, bottom: 560, x: 0, y: 0, toJSON: () => ({}) });
    const cardId = stateOf(room).hands[me]![0]!;
    const after = dixitView(play(room, me, { type: 'tell', cardId, clue: 'x' }), me);
    rerender(<Felt {...props(after)} dropPoints={{ [cardId]: { x: 400, y: 300 } }} />);
    const card = container.querySelector<HTMLElement>('.dx-tcard.loose')!;
    expect(card.style.left).toBe('400px');
    expect(card.style.top).toBe('370px');
  });

  it('devolver a 1ª de 2 pendentes tira essa e deixa a outra no ponto dela', () => {
    const room = told(3);
    const me = othersOf(room)[0]!;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 1000, height: 560, right: 1000, bottom: 560, x: 0, y: 0, toJSON: () => ({}) });
    const p = props(dixitView(room, me));
    const dropPoints = { A: { x: 200, y: 200 }, B: { x: 600, y: 300 } };
    const { container, rerender } = render(<Felt {...p} pending={['A', 'B']} dropPoints={dropPoints} />);
    const mine = () => [...container.querySelectorAll<HTMLElement>(`[data-loose^="${me}:"]`)];
    expect(mine().map((e) => [e.dataset.loose, e.style.left])).toEqual([
      [`${me}:A`, '200px'],
      [`${me}:B`, '600px'],
    ]);
    fireEvent.click(screen.getAllByRole('button', { name: 'devolver sua carta pra mão' })[0]!);
    expect(p.onUnpend).toHaveBeenCalledWith('A');
    rerender(<Felt {...p} pending={['B']} dropPoints={{ B: dropPoints.B }} />);
    expect(mine().map((e) => [e.dataset.loose, e.style.left, e.style.top])).toEqual([[`${me}:B`, '600px', '370px']]);
  });

  it('pendente já mandada (canUnpend falso) não devolve', () => {
    const room = told(3);
    const p = props(dixitView(room, othersOf(room)[0]!));
    const { container } = render(<Felt {...p} pending={['A', 'B']} canUnpend={false} />);
    expect(container.querySelectorAll('.dx-tcard.loose.pending')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'devolver sua carta pra mão' })).toBeNull();
    fireEvent.click(container.querySelector('[data-loose$=":A"]')!);
    expect(p.onUnpend).not.toHaveBeenCalled();
  });

  it('pendente devolve pelo teclado (Enter e Espaço)', () => {
    const room = told(3);
    const p = props(dixitView(room, othersOf(room)[0]!));
    render(<Felt {...p} pending={['A']} />);
    const card = screen.getByRole('button', { name: 'devolver sua carta pra mão' });
    fireEvent.keyDown(card, { key: 'Enter' });
    fireEvent.keyDown(card, { key: ' ' });
    expect(p.onUnpend.mock.calls).toEqual([['A'], ['A']]);
  });

  it('ao fechar a escolha, as soltas se arrumam nas casas da votação e viram', () => {
    vi.useFakeTimers();
    const before = told(4);
    const viewer = othersOf(before)[0]!;
    const { container, rerender } = render(<Felt {...props(dixitView(before, viewer))} />);
    const v = dixitView(voting(4), viewer);
    const p = props(v);
    rerender(<Felt {...p} />);
    // faltavam cartas (a última jogada fecha a fase): todas soltas e viradas primeiro
    expect(container.querySelectorAll('.dx-tcard.loose')).toHaveLength(4);
    expect(container.querySelectorAll('.dx-tcard.down')).toHaveLength(4);
    const second = screen.getByRole('button', { name: 'carta II' });
    fireEvent.click(second);
    fireEvent.keyDown(second, { key: 'Enter' });
    expect(p.onCard).not.toHaveBeenCalled();
    expect(second.tabIndex).toBe(-1);
    expect(second.getAttribute('aria-disabled')).toBe('true');
    rtlAct(() => vi.advanceTimersByTime(750));
    expect(container.querySelectorAll('.dx-tcard.loose')).toHaveLength(0);
    expect(container.querySelectorAll('.dx-tcard.gather')).toHaveLength(4);
    const slots = tableSlots(v.game.table.length);
    v.game.table.forEach((t, i) => {
      const el = container.querySelector<HTMLElement>(`[data-card-id="${t.cardId}"]`)!;
      expect(el.style.left).toBe(`${slots[i]![0]}px`);
      expect(el.style.top).toBe(`${slots[i]![1]}px`);
      expect(el.style.getPropertyValue('--rz')).toBe('0deg');
    });
    rtlAct(() => vi.advanceTimersByTime(820));
    expect(container.querySelectorAll('.dx-tcard.down')).toHaveLength(0);
    expect(container.querySelectorAll('.dx-tcard.flip-in')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'carta II' }).tabIndex).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'carta II' }));
    expect(p.onCard).toHaveBeenCalledWith(v.game.table[1]!.cardId);
    rtlAct(() => vi.advanceTimersByTime(1500));
    // a arrumação acabou: as cartas continuam no lugar, viradas pra cima
    expect(container.querySelectorAll('.dx-tcard.flip-in')).toHaveLength(4);
    expect(container.querySelectorAll('.dx-tcard.down, .dx-tcard.gather')).toHaveLength(0);
    // as 3 que faltavam pousaram; as 4 viraram
    expect(sounds().filter((s) => s === 'land')).toHaveLength(3);
    expect(sounds().filter((s) => s === 'flip')).toHaveLength(4);
  });

  it('desmontar no meio da arrumação não toca mais nada', () => {
    vi.useFakeTimers();
    const before = told(4);
    const viewer = othersOf(before)[0]!;
    const { rerender, unmount } = render(<Felt {...props(dixitView(before, viewer))} />);
    rerender(<Felt {...props(dixitView(voting(4), viewer))} />);
    unmount();
    rtlAct(() => vi.advanceTimersByTime(5000));
    expect(sounds()).toEqual([]);
  });

  it('a carta dos outros voa do assento; a sua só assenta', () => {
    const animate = vi.fn();
    Object.defineProperty(Element.prototype, 'animate', { value: animate, configurable: true, writable: true });
    try {
      let room = told(4);
      const [a, b] = othersOf(room) as [string, string];
      const tree = (v: ReturnType<typeof dixitView>, pending: string[] = []) => (
        <>
          <Seats view={v} width={1440} name={namer(v)} gained={{}} floatKey="" />
          <Felt {...props(v)} pending={pending} />
        </>
      );
      const { rerender } = render(tree(dixitView(room, b)));
      expect(animate).not.toHaveBeenCalled(); // o que já estava na mesa ao abrir só aparece
      room = play(room, a, { type: 'submit', cardIds: stateOf(room).hands[a]!.slice(0, 1) });
      room = play(room, a, { type: 'confirm' });
      rerender(tree(dixitView(room, b)));
      expect(animate).toHaveBeenCalledTimes(1);
      expect(animate.mock.calls[0]![0][0].transform).toContain('translateZ(150px)');
      rerender(tree(dixitView(room, b), ['x']));
      expect(animate).toHaveBeenCalledTimes(2);
      expect(animate.mock.calls[1]![0][0].transform).toContain('translateZ(70px)');
    } finally {
      delete (Element.prototype as { animate?: unknown }).animate;
    }
  });

  it('chegando já na votação, cartas com números romanos clicáveis', () => {
    const v = dixitView(voting(4), 'p0');
    const p = props(v);
    render(<Felt {...p} />);
    expect(screen.getByRole('button', { name: 'carta I' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'carta II' }));
    expect(p.onCard).toHaveBeenCalledWith(v.game.table[1]!.cardId);
    fireEvent.keyDown(screen.getByRole('button', { name: 'carta III' }), { key: 'Enter' });
    fireEvent.keyDown(screen.getByRole('button', { name: 'carta IV' }), { key: ' ' });
    expect(p.onCard.mock.calls.slice(1)).toEqual([[v.game.table[2]!.cardId], [v.game.table[3]!.cardId]]);
  });

  it('no fim de jogo mostra a carta do narrador, votos e donos (selo dentro da carta)', () => {
    let room = revealed(4);
    room = { ...room, game: { ...room.game, phase: 'gameover' } as typeof room.game };
    const v = dixitView(room, 'p0');
    const { container } = render(<Felt {...props(v)} />);
    expect(screen.getByText('carta do narrador')).toBeTruthy();
    expect(container.querySelectorAll('.dx-tokens > span')).toHaveLength(3);
    expect(container.querySelectorAll('.dx-face .dx-owner')).toHaveLength(4);
    expect(container.querySelectorAll('.dx-owner.me')).toHaveLength(1);
    expect(container.querySelector('.dx-owner.me')!.textContent).toBe('você');
    expect(container.querySelector('.dx-mine')).toBeNull();
  });
});

describe('assentos', () => {
  it('os outros no arco, com status; você embaixo com pontos', () => {
    const v = dixitView(told(4), 'p0');
    const { container } = render(<Seats view={v} width={1440} name={namer(v)} gained={{}} floatKey="" />);
    expect(container.querySelectorAll('.dx-seat')).toHaveLength(3);
    expect(screen.getByText('você')).toBeTruthy();
    expect(screen.getAllByText(/escolhendo…|contou ✓/).length).toBeGreaterThan(0);
  });

  it('cada assento (e o seu) diz de quem é, de onde as cartas voam', () => {
    const v = dixitView(told(4), 'p0');
    const { container } = render(<Seats view={v} width={1440} name={namer(v)} gained={{}} floatKey="" />);
    expect([...container.querySelectorAll<HTMLElement>('[data-seat]')].map((e) => e.dataset.seat).sort()).toEqual(['p0', 'p1', 'p2', 'p3']);
  });
});

const actions = (): PanelActions => ({ confirmVote: vi.fn(), next: vi.fn(), again: vi.fn(), lobby: vi.fn() });

describe('painel de ação', () => {
  const panelProps = (v: ReturnType<typeof dixitView>) => ({
    view: v,
    need: 1,
    pending: 0,
    revealDone: true,
    host: false,
    name: namer(v),
    clue: '',
    onClue: vi.fn(),
    spoken: false,
    onSpoken: vi.fn(),
    needClueTick: 0,
    actions: actions(),
  });

  it('quem narra: campo da dica e caixinha "vou falar na call"; sem botão de contar', () => {
    const room = started(4);
    const v = dixitView(room, stateOf(room).storyteller!);
    const p = panelProps(v);
    render(<ActionPanel {...p} />);
    expect(screen.queryByRole('button', { name: 'contei' })).toBeNull();
    fireEvent.change(screen.getByLabelText('sua dica'), { target: { value: 'luar' } });
    expect(p.onClue).toHaveBeenCalledWith('luar');
    fireEvent.click(screen.getByRole('checkbox', { name: /vou falar a dica na call/ }));
    expect(p.onSpoken).toHaveBeenCalledWith(true);
    expect(screen.getByText('arraste a carta pra mesa').tagName).toBe('B');
  });

  it('com "vou falar na call" marcado o campo fica desligado', () => {
    const room = started(4);
    const v = dixitView(room, stateOf(room).storyteller!);
    render(<ActionPanel {...panelProps(v)} spoken />);
    expect((screen.getByLabelText('sua dica') as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
  });

  it('soltou a carta sem dica: avisa, treme e foca o campo; o aviso some quando a dica fica pronta', () => {
    vi.useFakeTimers();
    const room = started(4);
    const v = dixitView(room, stateOf(room).storyteller!);
    const p = panelProps(v);
    const { container, rerender } = render(<ActionPanel {...p} />);
    const msg = 'Antes de jogar a carta, escreva a dica ou marque “vou falar na call”.';
    expect(screen.queryByText(msg)).toBeNull();
    rerender(<ActionPanel {...p} needClueTick={1} />);
    expect(screen.getByText(msg)).toBeTruthy();
    expect(container.querySelector('.dx-clue-box.need')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText('sua dica'));
    rtlAct(() => vi.advanceTimersByTime(500));
    expect(container.querySelector('.dx-clue-box.need')).toBeNull();
    // outra tentativa treme de novo
    rerender(<ActionPanel {...p} needClueTick={2} />);
    expect(container.querySelector('.dx-clue-box.need')).toBeTruthy();
    // dica pronta: o aviso some de vez, mesmo se ela for apagada depois
    rerender(<ActionPanel {...p} needClueTick={2} clue="luar" />);
    expect(screen.queryByText(msg)).toBeNull();
    rerender(<ActionPanel {...p} needClueTick={2} clue="" />);
    expect(screen.queryByText(msg)).toBeNull();
    // só um novo tique faz avisar de novo
    rerender(<ActionPanel {...p} needClueTick={3} clue="" />);
    expect(screen.getByText(msg)).toBeTruthy();
  });

  it('o aviso fica num contêiner fixo (role=alert) ligado ao campo da dica', () => {
    const room = started(4);
    const v = dixitView(room, stateOf(room).storyteller!);
    const p = panelProps(v);
    const { rerender } = render(<ActionPanel {...p} />);
    const field = screen.getByLabelText('sua dica');
    const box = screen.getByRole('alert');
    expect(box.textContent).toBe('');
    expect(field.getAttribute('aria-describedby')).toBe(box.id);
    expect(field.getAttribute('aria-invalid')).toBe('false');
    rerender(<ActionPanel {...p} needClueTick={1} />);
    expect(screen.getByRole('alert')).toBe(box);
    expect(box.textContent).toContain('Antes de jogar a carta');
    expect(field.getAttribute('aria-invalid')).toBe('true');
  });

  it('desmarcar "vou falar na call" sem dica foca o campo; com dica não mexe no foco', () => {
    const room = started(4);
    const v = dixitView(room, stateOf(room).storyteller!);
    const p = panelProps(v);
    const { rerender } = render(<ActionPanel {...p} spoken />);
    const field = screen.getByLabelText('sua dica');
    expect(document.activeElement).not.toBe(field);
    rerender(<ActionPanel {...p} spoken={false} />);
    expect(document.activeElement).toBe(field);
    (field as HTMLElement).blur();
    rerender(<ActionPanel {...p} spoken />);
    rerender(<ActionPanel {...p} spoken={false} clue="luar" />);
    expect(document.activeElement).not.toBe(field);
  });

  it('trocar de fase zera os avisos (da dica e do voto)', () => {
    const room = told(4);
    const teller = stateOf(room).storyteller!;
    const other = othersOf(room)[0]!;
    // dica: avisa na narração, passa pra escolha e volta pra narração (outra rodada)
    const story = dixitView(started(4), stateOf(started(4)).storyteller!);
    const p = panelProps(story);
    const { rerender } = render(<ActionPanel {...p} needClueTick={0} />);
    rerender(<ActionPanel {...p} needClueTick={1} />);
    expect(screen.getByRole('alert').textContent).not.toBe('');
    rerender(<ActionPanel {...panelProps(dixitView(room, teller))} needClueTick={1} />);
    rerender(<ActionPanel {...p} needClueTick={1} />);
    expect(screen.getByRole('alert').textContent).toBe('');
    // voto: tenta confirmar sem votar, a fase muda e volta
    const vote = dixitView(voting(4), other);
    rerender(<ActionPanel {...panelProps(vote)} />);
    fireEvent.click(screen.getByRole('button', { name: 'confirmar voto' }));
    expect(screen.getByRole('alert').textContent).toBe('Clique numa carta da mesa primeiro.');
    rerender(<ActionPanel {...panelProps(dixitView(room, other))} />);
    rerender(<ActionPanel {...panelProps(vote)} />);
    expect(screen.getByRole('alert').textContent).toBe('');
  });

  it('o tique com a dica já pronta não avisa; o tique antigo ao abrir não dispara nada', () => {
    const room = started(4);
    const v = dixitView(room, stateOf(room).storyteller!);
    const p = panelProps(v);
    const { container, rerender } = render(<ActionPanel {...p} needClueTick={3} />);
    expect(screen.getByRole('alert').textContent).toBe('');
    rerender(<ActionPanel {...p} needClueTick={4} clue="luar" />);
    expect(screen.getByRole('alert').textContent).toBe('');
    expect(container.querySelector('.dx-clue-box.need')).toBeNull();
  });

  it('desmontar no meio da tremida cancela o timer dela', () => {
    vi.useFakeTimers();
    const set = vi.spyOn(window, 'setTimeout');
    const clear = vi.spyOn(window, 'clearTimeout');
    const room = started(4);
    const v = dixitView(room, stateOf(room).storyteller!);
    const p = panelProps(v);
    const { container, rerender, unmount } = render(<ActionPanel {...p} />);
    rerender(<ActionPanel {...p} needClueTick={1} />);
    const box = container.querySelector('.dx-clue-box')!;
    expect(box.classList.contains('need')).toBe(true);
    const i = set.mock.calls.findIndex((c) => c[1] === 450);
    expect(i).toBeGreaterThanOrEqual(0);
    const id = set.mock.results[i]!.value;
    unmount();
    expect(clear).toHaveBeenCalledWith(id);
    // e, de fato, a caixa (solta do documento) não é mais mexida
    rtlAct(() => vi.advanceTimersByTime(1000));
    expect(box.classList.contains('need')).toBe(true);
  });

  it('quem espera vê quem narra', () => {
    const room = started(4);
    const v = dixitView(room, othersOf(room)[0]!);
    render(<ActionPanel {...panelProps(v)} />);
    expect(screen.getByText('Esperando a carta e a dica…')).toBeTruthy();
    expect(screen.queryByLabelText('sua dica')).toBeNull();
  });

  it('escolha: pede pra arrastar a carta, sem botão de jogar', () => {
    const room = told(4);
    const v = dixitView(room, othersOf(room)[0]!);
    render(<ActionPanel {...panelProps(v)} />);
    expect(screen.getByText(/Arraste pra mesa/).textContent).toBe('Arraste pra mesa a carta da sua mão que mais combina com a dica.');
    expect(screen.queryByRole('button', { name: /jogar essa/ })).toBeNull();
  });

  it('escolha em 3 jogadores: 2 cartas e "1 de 2 na mesa"', () => {
    const room = told(3);
    const v = dixitView(room, othersOf(room)[0]!);
    const p = panelProps(v);
    const { rerender } = render(<ActionPanel {...p} need={2} />);
    expect(screen.getByText(/Arraste pra mesa/).textContent).toBe('Arraste pra mesa as 2 cartas da sua mão que mais combinam com a dica.');
    rerender(<ActionPanel {...p} need={2} pending={1} />);
    expect(screen.getByText('1 de 2').tagName).toBe('B');
    expect(screen.getByText(/Arraste pra mesa/).textContent).toContain('1 de 2 na mesa (clique nela pra desfazer).');
  });

  it('votação: confirmar sem voto avisa', () => {
    const room = voting(4);
    const v = dixitView(room, othersOf(room)[0]!);
    const p = panelProps(v);
    render(<ActionPanel {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'confirmar voto' }));
    expect(p.actions.confirmVote).not.toHaveBeenCalled();
    expect(screen.getByText('Clique numa carta da mesa primeiro.')).toBeTruthy();
  });

  it('votação: com voto, confirma', () => {
    const room = voting(4);
    const me = othersOf(room)[0]!;
    const card = dixitView(room, me).game.table.find((t) => !t.mine)!.cardId;
    const v = dixitView(play(room, me, { type: 'vote', cardId: card }), me);
    const p = panelProps(v);
    render(<ActionPanel {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'confirmar voto' }));
    expect(p.actions.confirmVote).toHaveBeenCalledTimes(1);
  });

  it('revelação pronta: só o host avança', () => {
    const room = revealed(4);
    const v = dixitView(room, othersOf(room)[0]!);
    const p = panelProps(v);
    const { rerender } = render(<ActionPanel {...p} />);
    expect(screen.getByText('esperando o host…')).toBeTruthy();
    rerender(<ActionPanel {...p} host />);
    fireEvent.click(screen.getByRole('button', { name: 'próxima rodada' }));
    expect(p.actions.next).toHaveBeenCalledTimes(1);
  });
});

describe('topo', () => {
  it('sem narrador (lobby) o selo fica vazio; no fim de jogo diz fim de jogo', () => {
    const lobby = dixitView(dixitRoom(4), 'p0');
    const { container, rerender } = render(<DixitTopBar view={lobby} name={namer(lobby)} color={colorer(lobby)} tilt onTilt={vi.fn()} host={false} onForce={vi.fn()} />);
    expect(container.querySelector('.dx-clue .txt')!.textContent).toBe('');
    expect(container.querySelector('.dx-clue .who')).toBeNull();
    let room = revealed(4);
    room = { ...room, game: { ...room.game, phase: 'gameover' } as typeof room.game };
    const over = dixitView(room, 'p0');
    rerender(<DixitTopBar view={over} name={namer(over)} color={colorer(over)} tilt onTilt={vi.fn()} host={false} onForce={vi.fn()} />);
    expect(container.querySelector('.dx-clue .txt')!.textContent).toBe('fim de jogo');
  });

  it('mostra a dica, a fase e o destravar só pro host', () => {
    const room = told(4, 'luar');
    const onForce = vi.fn();
    const v0 = dixitView(room, 'p0');
    const { rerender } = render(<DixitTopBar view={v0} name={namer(v0)} color={colorer(v0)} tilt onTilt={vi.fn()} host onForce={onForce} />);
    expect(screen.getByText('“luar”')).toBeTruthy();
    expect(screen.getByText('escolha · 0 de 3 · meta 30')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('diquisti');
    fireEvent.click(screen.getByRole('button', { name: 'destravar' }));
    expect(onForce).toHaveBeenCalled();
    const v1 = dixitView(room, 'p1');
    rerender(<DixitTopBar view={v1} name={namer(v1)} color={colorer(v1)} tilt onTilt={vi.fn()} host={false} onForce={onForce} />);
    expect(screen.queryByRole('button', { name: 'destravar' })).toBeNull();
  });
});

describe('legenda da revelação', () => {
  it('troca o texto com fade sem desmontar a caixa; pular chama onSkip', () => {
    vi.useFakeTimers();
    const onSkip = vi.fn();
    const a = { step: 1 as const, parts: [{ text: 'primeiro' }] };
    const b = { step: 2 as const, parts: [{ text: 'segundo', em: true }] };
    const { container, rerender } = render(<RevealCaption caption={a} onSkip={onSkip} />);
    const box = container.querySelector('.dx-step');
    expect(screen.getByText('primeiro')).toBeTruthy();
    rerender(<RevealCaption caption={b} onSkip={onSkip} />);
    expect(container.querySelector('.dx-step.swap')).toBeTruthy();
    // durante o fade o texto antigo continua na tela
    rtlAct(() => vi.advanceTimersByTime(100));
    expect(screen.getByText('primeiro')).toBeTruthy();
    rtlAct(() => vi.advanceTimersByTime(100));
    expect(screen.getByText('segundo').tagName).toBe('EM');
    expect(container.querySelector('.dx-step')).toBe(box);
    fireEvent.click(screen.getByRole('button', { name: 'pular ›' }));
    expect(onSkip).toHaveBeenCalled();
  });

  it('só o número e o texto ficam na região viva; o "pular" fica fora', () => {
    render(<RevealCaption caption={{ step: 1, parts: [{ text: 'primeiro' }] }} onSkip={vi.fn()} />);
    const live = screen.getByRole('status');
    expect(live.textContent).toBe('1 de 4primeiro');
    expect(live.contains(screen.getByRole('button', { name: 'pular ›' }))).toBe(false);
  });

  it('se a legenda volta à que já está na tela durante a troca, cancela o fade', () => {
    vi.useFakeTimers();
    const a = { step: 1 as const, parts: [{ text: 'primeiro' }] };
    const b = { step: 2 as const, parts: [{ text: 'segundo' }] };
    const { container, rerender } = render(<RevealCaption caption={a} onSkip={vi.fn()} />);
    rerender(<RevealCaption caption={b} onSkip={vi.fn()} />);
    expect(container.querySelector('.dx-step.swap')).toBeTruthy();
    rerender(<RevealCaption caption={a} onSkip={vi.fn()} />);
    expect(container.querySelector('.dx-step.swap')).toBeNull();
    rtlAct(() => vi.advanceTimersByTime(300));
    expect(screen.getByText('primeiro')).toBeTruthy();
    expect(screen.queryByText('segundo')).toBeNull();
  });

  it('sem legenda não desenha nada', () => {
    const { container } = render(<RevealCaption caption={null} onSkip={vi.fn()} />);
    expect(container.querySelector('.dx-step')).toBeNull();
  });
});

describe('placar da rodada', () => {
  it('pontos, motivos e total; próxima rodada só pro host', () => {
    const room = revealed(4);
    const v = dixitView(room, 'p0');
    const r = v.game.result!;
    const onNext = vi.fn();
    const props = { result: r, players: v.game.inRound, scores: v.game.scores, target: v.game.target, name: namer(v), color: colorer(v), onNext, onHide: vi.fn() };
    const { rerender } = render(<RoundBoard {...props} host />);
    expect(screen.getByText('placar da rodada')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'placar da rodada' })).toBeTruthy();
    expect(screen.getAllByText(/todo mundo achou: \+2 pra quem votou/)).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'próxima rodada' }));
    expect(onNext).toHaveBeenCalled();
    rerender(<RoundBoard {...props} host={false} />);
    expect(screen.queryByRole('button', { name: 'próxima rodada' })).toBeNull();
    expect(screen.getByText('esperando o host passar pra próxima…')).toBeTruthy();
  });

  it('quando alguém chegou na meta o botão vira "ver quem venceu"; "ver a mesa" esconde', () => {
    const room = revealed(4);
    const v = dixitView(room, 'p0');
    const onHide = vi.fn();
    const scores = { ...v.game.scores, p1: v.game.target };
    render(<RoundBoard result={v.game.result!} players={v.game.inRound} scores={scores} target={v.game.target} name={namer(v)} color={colorer(v)} host onNext={vi.fn()} onHide={onHide} />);
    expect(screen.getByRole('button', { name: 'ver quem venceu' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'ver a mesa' }));
    expect(onHide).toHaveBeenCalled();
  });
});

describe('relógio da revelação', () => {
  const setup = (meId: string | null) => {
    const room = revealed(4);
    const v = dixitView(room, meId);
    return { v, r: v.game.result!, order: v.game.inRound, name: namer(v) };
  };
  /** Deixa o tempo correr em batidas de 50 ms, cada uma no seu `act` (um `act` só juntaria tudo num render). */
  const passa = (ms: number) => {
    for (let t = 0; t < ms; t += 50) rtlAct(() => vi.advanceTimersByTime(50));
  };
  const count = (n: string) => sounds().filter((s) => s === n).length;

  it('anda pela linha do tempo tocando os sons do Diquisti; pro narrador a legenda diz "a sua carta"', () => {
    vi.useFakeTimers();
    const { r, order } = setup('p0');
    const me = r.storyteller;
    const name = (id: string) => (id === me ? 'você' : id);
    const { result } = renderHook(() => useReveal(r, 'k1', order, name, me));
    expect(result.current.frame?.caption).toBeNull();
    passa(1000);
    expect(result.current.frame?.spot).toBe(true);
    const texto = result.current.frame?.caption?.parts.map((p) => p.text).join('');
    expect(texto).toContain('esta era a sua carta, que você narrou');
    expect(sounds()).toContain('join');
    passa(60000);
    expect(result.current.frame?.done).toBe(true);
  });

  it('com a revelação inteira, cada som toca o número certo de vezes', () => {
    vi.useFakeTimers();
    const { r, order, name } = setup('p0');
    renderHook(() => useReveal(r, 'k1', order, name, null));
    passa(60000);
    const ganhos = order.reduce((s, p) => s + (r.gained[p] ?? 0), 0);
    expect(count('join')).toBe(1);
    expect(count('flip')).toBe(Object.keys(r.votes).length);
    expect(count('slide')).toBe(r.table.length);
    expect(count('click')).toBe(ganhos);
    expect(ganhos).toBeGreaterThan(0);
  });

  it('aba em segundo plano: o salto do relógio não vira uma rajada de sons velhos', () => {
    vi.useFakeTimers();
    const { r, order, name } = setup('p0');
    renderHook(() => useReveal(r, 'k1', order, name, null));
    const primeiroVoto = buildRevealTimeline(r, order, name).find((e) => e.kind === 'vote')!;
    passa(Math.ceil((primeiroVoto.at + 10) / 50) * 50);
    expect(count('flip')).toBe(1);
    vi.mocked(playDixitSound).mockClear();
    vi.setSystemTime(Date.now() + 1000);
    rtlAct(() => vi.advanceTimersByTime(50));
    expect(count('flip')).toBeLessThanOrEqual(1);
    expect(sounds().length).toBeLessThanOrEqual(1);
  });

  it('pular vai direto pro fim e só toca o som final (se você ganhou pontos)', () => {
    vi.useFakeTimers();
    const { r, order, name } = setup('p0');
    const winner = Object.keys(r.gained).find((p) => (r.gained[p] ?? 0) > 0)!;
    const { result } = renderHook(() => useReveal(r, 'k1', order, name, winner));
    passa(500);
    vi.mocked(playDixitSound).mockClear();
    rtlAct(() => result.current.skip());
    expect(result.current.frame?.done).toBe(true);
    expect(sounds()).toEqual(['win']);
  });

  it('revelação nova (key nova) recomeça do zero e os sons do meio voltam a tocar', () => {
    vi.useFakeTimers();
    const { r, order, name } = setup('p0');
    const { result, rerender } = renderHook(({ k }) => useReveal(r, k, order, name, null), { initialProps: { k: 'k1' } });
    rtlAct(() => result.current.skip());
    expect(result.current.frame?.done).toBe(true);
    vi.mocked(playDixitSound).mockClear();
    rerender({ k: 'k2' });
    expect(result.current.frame?.done).toBe(false);
    expect(result.current.frame?.votes).toHaveLength(0);
    expect(sounds()).toEqual([]);
    passa(60000);
    expect(result.current.frame?.done).toBe(true);
    expect(count('join')).toBe(1);
    expect(count('flip')).toBe(Object.keys(r.votes).length);
  });

  it('em StrictMode (efeitos rodam duas vezes) toca um único "join"', () => {
    vi.useFakeTimers();
    const { r, order, name } = setup('p0');
    renderHook(() => useReveal(r, 'k1', order, name, null), { wrapper: StrictMode });
    passa(60000);
    expect(count('join')).toBe(1);
    expect(count('flip')).toBe(Object.keys(r.votes).length);
  });

  it('sem resultado não há quadro, e desmontar limpa o relógio', () => {
    vi.useFakeTimers();
    const none = renderHook(() => useReveal(null, '', [], () => '', null));
    expect(none.result.current.frame).toBeNull();
    const { r, order, name } = setup('p0');
    const { unmount } = renderHook(() => useReveal(r, 'k1', order, name, null));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('escala do palco', () => {
  it('acompanha o redimensionamento da janela', () => {
    const w = window.innerWidth, h = window.innerHeight;
    try {
      const { result } = renderHook(() => useStageFit());
      expect(result.current).toEqual(fitStage(w, h));
      rtlAct(() => {
        Object.assign(window, { innerWidth: 1000, innerHeight: 700 });
        window.dispatchEvent(new Event('resize'));
      });
      expect(result.current).toEqual(fitStage(1000, 700));
    } finally {
      Object.assign(window, { innerWidth: w, innerHeight: h });
    }
  });

  it('ao desmontar remove o mesmo ouvinte que adicionou', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const rm = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useStageFit());
    const added = add.mock.calls.find((c) => c[0] === 'resize')?.[1];
    expect(added).toBeTypeOf('function');
    unmount();
    expect(rm.mock.calls.find((c) => c[0] === 'resize')?.[1]).toBe(added);
  });
});
