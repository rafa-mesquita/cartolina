import { act as rtlAct, fireEvent, render, screen } from '@testing-library/react';
import type { RoomView } from '@cartolina/shared';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { installButtonSounds } from '../src/brand/buttonSounds';
import { DixitTable } from '../src/games/dixit/DixitTable';
import { playDixitSound } from '../src/games/dixit/sounds';
import type { ConnSnapshot, GameConn } from '../src/net/connection';
import { Game } from '../src/screens/Game';
import { dixitRoom, dixitView, othersOf, revealed, started, stateOf, told, voting } from './dixit-fixtures';

vi.mock('../src/games/dixit/sounds', () => ({ playDixitSound: vi.fn() }));

type Conn = GameConn & { sendAction: Mock<GameConn['sendAction']>; onError: Mock<GameConn['onError']> };

const conn = (): Conn => ({
  sendAction: vi.fn<GameConn['sendAction']>(),
  sendActivity: vi.fn(),
  sendCursor: vi.fn(),
  sendPing: vi.fn(),
  onFx: vi.fn(() => () => {}),
  onError: vi.fn<GameConn['onError']>(() => () => {}),
});

const sounds = () => vi.mocked(playDixitSound).mock.calls.map((c) => c[0]);
const enter = (label: string) => fireEvent.keyDown(screen.getByRole('button', { name: label }), { key: 'Enter' });
const NEED_CLUE = 'Antes de jogar a carta, escreva a dica ou marque “vou falar na call”.';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('mesa do Diquisti: narrar', () => {
  it('quem narra escreve a dica e solta a carta (Enter): manda tell com a dica', () => {
    const room = started(4);
    const st = stateOf(room).storyteller!;
    const c = conn();
    render(<DixitTable view={dixitView(room, st)} conn={c} />);
    fireEvent.change(screen.getByLabelText('sua dica'), { target: { value: 'luar' } });
    enter('sua carta 2');
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'tell', cardId: stateOf(room).hands[st]![1], clue: 'luar' });
  });

  it('o narrador não trava se o envio se perder (socket fechado): a carta fica na mão e dá pra jogar de novo', () => {
    const room = started(4);
    const st = stateOf(room).storyteller!;
    const c = conn(); // sendAction não faz nada: como o socket fechado, que descarta em silêncio
    const { container } = render(<DixitTable view={dixitView(room, st)} conn={c} />);
    fireEvent.change(screen.getByLabelText('sua dica'), { target: { value: 'luar' } });
    enter('sua carta 2');
    expect(screen.getByRole('button', { name: 'sua carta 6' })).toBeTruthy();
    expect(container.querySelector('.dx-hcard.away')).toBeNull();
    enter('sua carta 2');
    expect(c.sendAction).toHaveBeenCalledTimes(2);
    expect(c.sendAction).toHaveBeenLastCalledWith({ type: 'tell', cardId: stateOf(room).hands[st]![1], clue: 'luar' });
  });

  it('sem dica a carta não vai: nada é mandado, toca o erro e o painel avisa', () => {
    const room = started(4);
    const c = conn();
    render(<DixitTable view={dixitView(room, stateOf(room).storyteller!)} conn={c} />);
    expect(screen.getByText('primeiro a dica: escreva ou marque “vou falar na call”')).toBeTruthy();
    enter('sua carta 1');
    expect(c.sendAction).not.toHaveBeenCalled();
    expect(screen.getByText(NEED_CLUE)).toBeTruthy();
    expect(sounds()).toContain('error');
    expect(screen.getByRole('button', { name: 'sua carta 6' })).toBeTruthy();
  });

  it('com "vou falar a dica na call" marcado, manda tell com a dica vazia', () => {
    const room = started(4);
    const st = stateOf(room).storyteller!;
    const c = conn();
    render(<DixitTable view={dixitView(room, st)} conn={c} />);
    fireEvent.click(screen.getByLabelText('vou falar a dica na call'));
    expect(screen.getByText('arraste pra cá a carta da sua dica')).toBeTruthy();
    enter('sua carta 3');
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'tell', cardId: stateOf(room).hands[st]![2], clue: '' });
  });

  it('a dica e a caixinha zeram quando a rodada passa pro próximo narrador', () => {
    const room = started(4);
    const st = stateOf(room).storyteller!;
    const c = conn();
    const { rerender } = render(<DixitTable view={dixitView(room, st)} conn={c} />);
    fireEvent.change(screen.getByLabelText('sua dica'), { target: { value: 'luar' } });
    fireEvent.click(screen.getByLabelText('vou falar a dica na call'));
    rerender(<DixitTable view={dixitView(told(4), st)} conn={c} />);
    expect(screen.getByText('dica dada ✓')).toBeTruthy();
    // volta a ser a vez dele narrar (outra rodada): campo limpo e caixinha desmarcada
    rerender(<DixitTable view={dixitView(room, st)} conn={c} />);
    expect((screen.getByLabelText('sua dica') as HTMLTextAreaElement).value).toBe('');
    expect((screen.getByLabelText('vou falar a dica na call') as HTMLInputElement).checked).toBe(false);
  });
});

describe('mesa do Diquisti: escolher', () => {
  it('quem escolhe solta a carta (Enter): manda submit com ela e confirm', () => {
    const room = told(4);
    const p = othersOf(room)[0]!;
    const c = conn();
    render(<DixitTable view={dixitView(room, p)} conn={c} />);
    enter('sua carta 1');
    expect(c.sendAction).toHaveBeenNthCalledWith(1, { type: 'submit', cardIds: [stateOf(room).hands[p]![0]] });
    expect(c.sendAction).toHaveBeenNthCalledWith(2, { type: 'confirm' });
    expect(screen.queryByRole('button', { name: 'sua carta 6' })).toBeNull();
    // já mandada: a carta solta não volta mais pra mão enquanto o servidor responde
    expect(screen.queryByRole('button', { name: 'devolver sua carta pra mão' })).toBeNull();
  });

  it('em 3 jogadores, depois de mandar as duas, nenhuma volta pra mão', () => {
    const room = told(3);
    const c = conn();
    render(<DixitTable view={dixitView(room, othersOf(room)[0]!)} conn={c} />);
    enter('sua carta 1');
    expect(screen.getAllByRole('button', { name: 'devolver sua carta pra mão' })).toHaveLength(1);
    enter('sua carta 1');
    expect(c.sendAction).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button', { name: 'devolver sua carta pra mão' })).toBeNull();
  });

  it('ao reconectar, as pendentes voltam pra mão (o servidor é a verdade)', () => {
    const room = told(3);
    const v = dixitView(room, othersOf(room)[0]!);
    const c = conn();
    const { rerender } = render(<DixitTable view={v} conn={c} status="joined" />);
    enter('sua carta 1');
    expect(screen.getByText('1 de 2')).toBeTruthy();
    rerender(<DixitTable view={v} conn={c} status="reconnecting" />);
    expect(screen.getByText('1 de 2')).toBeTruthy();
    rerender(<DixitTable view={v} conn={c} status="joined" />);
    expect(screen.queryByText('1 de 2')).toBeNull();
    expect(screen.getByRole('button', { name: 'sua carta 7' })).toBeTruthy();
  });

  it('erro de outra ação (destravar recusado) não mexe nas pendentes', () => {
    const room = told(3);
    const p = othersOf(room)[0]!;
    const c = conn();
    render(<DixitTable view={{ ...dixitView(room, p), hostId: p }} conn={c} />);
    enter('sua carta 1');
    fireEvent.click(screen.getByRole('button', { name: 'destravar' }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'forceNext' });
    rtlAct(() => c.onError.mock.calls[0]![0]('not_host', 'Só o host pode.'));
    expect(screen.getByText('Só o host pode.')).toBeTruthy();
    expect(screen.getByText('1 de 2')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'sua carta 7' })).toBeNull();
  });

  it('em 3 jogadores a 1ª carta espera a 2ª; clicar nela devolve; a 2ª manda as duas', () => {
    const room = told(3);
    const p = othersOf(room)[0]!;
    const hand = stateOf(room).hands[p]!;
    const c = conn();
    render(<DixitTable view={dixitView(room, p)} conn={c} />);
    enter('sua carta 1');
    expect(c.sendAction).not.toHaveBeenCalled();
    expect(screen.getByText('1 de 2')).toBeTruthy();
    // devolve a pendente: volta pra mão e o contador some
    fireEvent.click(screen.getByRole('button', { name: 'devolver sua carta pra mão' }));
    expect(screen.queryByText('1 de 2')).toBeNull();
    expect(screen.queryByRole('button', { name: 'devolver sua carta pra mão' })).toBeNull();
    enter('sua carta 2');
    enter('sua carta 2'); // a antiga 3ª (a 2ª foi pra mesa)
    expect(c.sendAction).toHaveBeenNthCalledWith(1, { type: 'submit', cardIds: [hand[1], hand[2]] });
    expect(c.sendAction).toHaveBeenNthCalledWith(2, { type: 'confirm' });
  });

  it('arrastar pro feltro acende o feltro e joga a carta', () => {
    const room = told(4);
    const p = othersOf(room)[0]!;
    const c = conn();
    const { container } = render(<DixitTable view={dixitView(room, p)} conn={c} />);
    const felt = container.querySelector<HTMLElement>('.dx-felt')!;
    if (!document.elementFromPoint) document.elementFromPoint = () => null;
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(felt);
    const card = screen.getByRole('button', { name: 'sua carta 2' });
    fireEvent.pointerDown(card, { pointerId: 1, button: 0, clientX: 300, clientY: 800 });
    fireEvent.pointerMove(card, { pointerId: 1, clientX: 320, clientY: 400 });
    expect(felt.classList.contains('drop-over')).toBe(true);
    fireEvent.pointerUp(card, { pointerId: 1, clientX: 320, clientY: 400 });
    expect(felt.classList.contains('drop-over')).toBe(false);
    expect(c.sendAction).toHaveBeenNthCalledWith(1, { type: 'submit', cardIds: [stateOf(room).hands[p]![1]] });
    // a sua carta já está virada no feltro
    expect(container.querySelectorAll(`.dx-tcard.loose[data-loose^="${p}:"]`)).toHaveLength(1);
  });

  it('jogada recusada pelo servidor: avisa e a carta volta pra mão (e pode ser jogada de novo)', () => {
    const room = told(4);
    const p = othersOf(room)[0]!;
    const c = conn();
    render(<DixitTable view={dixitView(room, p)} conn={c} />);
    enter('sua carta 1');
    expect(screen.queryByRole('button', { name: 'sua carta 6' })).toBeNull();
    const onErr = c.onError.mock.calls[0]![0];
    rtlAct(() => onErr('bad_phase', 'Agora não dá.'));
    expect(screen.getByRole('status').textContent).toBe('Agora não dá.');
    expect(screen.getByRole('button', { name: 'sua carta 6' })).toBeTruthy();
    expect(sounds()).toContain('error');
    rtlAct(() => vi.advanceTimersByTime(2300));
    expect(screen.queryByText('Agora não dá.')).toBeNull();
    enter('sua carta 1');
    expect(c.sendAction).toHaveBeenCalledTimes(4);
  });
});

describe('mesa do Diquisti: votar e revelar', () => {
  it('votar clicando na carta; a própria carta não', () => {
    const room = voting(4);
    const p = othersOf(room)[0]!;
    const v = dixitView(room, p);
    const c = conn();
    render(<DixitTable view={v} conn={c} />);
    const mine = v.game.table.findIndex((t) => t.mine);
    const other = v.game.table.findIndex((t) => !t.mine);
    const roman = ['I', 'II', 'III', 'IV'];
    fireEvent.click(screen.getByRole('button', { name: `carta ${roman[mine]}` }));
    expect(c.sendAction).not.toHaveBeenCalled();
    expect(screen.getByText('Não dá pra votar na própria carta.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: `carta ${roman[other]}` }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'vote', cardId: v.game.table[other]!.cardId });
  });

  it('quem narra não vota', () => {
    const room = voting(4);
    const c = conn();
    render(<DixitTable view={dixitView(room, stateOf(room).storyteller!)} conn={c} />);
    fireEvent.click(screen.getByRole('button', { name: 'carta II' }));
    expect(c.sendAction).not.toHaveBeenCalled();
    expect(screen.getByText('Quem narra não vota.')).toBeTruthy();
  });

  it('revelação narrada até o placar; o host passa a rodada', () => {
    const room = revealed(4);
    const c = conn();
    render(<DixitTable view={dixitView(room, 'p0')} conn={c} />);
    rtlAct(() => vi.advanceTimersByTime(600));
    expect(screen.getByText('1 de 4')).toBeTruthy();
    expect(screen.getByText('carta do narrador')).toBeTruthy();
    rtlAct(() => vi.advanceTimersByTime(30_000));
    expect(screen.getByRole('region', { name: 'placar da rodada' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'ver a mesa' }));
    expect(screen.queryByRole('region', { name: 'placar da rodada' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'placar da rodada ▸' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'próxima rodada' })[0]!);
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'next' });
  });

  it('pular leva direto ao placar', () => {
    render(<DixitTable view={dixitView(revealed(4), 'p1')} conn={conn()} />);
    rtlAct(() => vi.advanceTimersByTime(600));
    fireEvent.click(screen.getByRole('button', { name: 'pular ›' }));
    rtlAct(() => vi.advanceTimersByTime(100));
    expect(screen.getByRole('region', { name: 'placar da rodada' })).toBeTruthy();
  });
});

describe('mesa do Diquisti: carta ampliada e sons', () => {
  it('rodinha pra cima numa carta da mão amplia; pra baixo fecha', () => {
    render(<DixitTable view={dixitView(started(4), 'p1')} conn={conn()} />);
    fireEvent.wheel(screen.getByRole('button', { name: 'sua carta 1' }), { deltaY: -100 });
    const dialog = screen.getByRole('dialog', { name: 'sua mão · 1 de 6' });
    rtlAct(() => vi.advanceTimersByTime(400));
    fireEvent.wheel(dialog, { deltaY: 100 });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('rodinha pra cima numa carta da mesa amplia com o numeral', () => {
    const room = voting(4);
    render(<DixitTable view={dixitView(room, othersOf(room)[0]!)} conn={conn()} />);
    fireEvent.wheel(screen.getByRole('button', { name: 'carta III' }), { deltaY: -60 });
    expect(screen.getByRole('dialog', { name: 'carta III' })).toBeTruthy();
  });

  it('botões da mesa tocam o clique baixo do Diquisti, e o som global fica quieto', () => {
    const global = vi.fn();
    const uninstall = installButtonSounds(document, global);
    render(<DixitTable view={dixitView(started(4), 'p1')} conn={conn()} />);
    fireEvent.click(screen.getByRole('button', { name: /mesa 3D/ }));
    uninstall();
    expect(sounds()).toEqual(['click']);
    expect(global).not.toHaveBeenCalled();
  });
});

describe('Game com sala de Diquisti', () => {
  const snap = (view: RoomView): ConnSnapshot => ({ status: 'joined', playerId: view.you, view, joinError: null });

  it('partida em andamento abre a mesa', () => {
    const view = dixitView(started(4), 'p1');
    render(<Game conn={conn()} snap={snap(view)} view={view} />);
    expect(screen.getByRole('region', { name: 'sua vez' })).toBeTruthy();
    expect(document.querySelector('.dixit')).toBeTruthy();
  });

  it('no lobby não mostra a mesa nem o lobby do DITU', () => {
    const view = dixitView(dixitRoom(2), 'p0');
    render(<Game conn={conn()} snap={snap(view)} view={view} />);
    expect(screen.queryByRole('region', { name: 'sua vez' })).toBeNull();
    expect(screen.queryByText(/sendo montada/)).toBeNull();
  });
});
