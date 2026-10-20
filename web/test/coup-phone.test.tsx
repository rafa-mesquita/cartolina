import { act as rtlAct, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { CoupRoomView, CoupView, Room } from '@cartolina/shared';
import { CoupTable } from '../src/games/coup/CoupTable';
import { lossTitle } from '../src/games/coup/texts';
import { PHONE_LAYOUT_QUERY } from '../src/lib/device';
import type { GameConn } from '../src/net/connection';
import { T0, coupRoom, step, turnOf, viewOf } from './coup-fixtures';

vi.mock('../src/games/coup/sounds', async (original) => ({ ...(await original<typeof import('../src/games/coup/sounds')>()), playCoupSound: vi.fn() }));

type Conn = GameConn & { sendAction: Mock<GameConn['sendAction']> };
const conn = (): Conn => ({
  sendAction: vi.fn<GameConn['sendAction']>(),
  sendActivity: vi.fn(),
  sendCursor: vi.fn(),
  sendPing: vi.fn(),
  onFx: vi.fn(() => () => {}),
  onError: vi.fn(() => () => {}),
});

/** `matchMedia` falso: só as queries de `matching` batem. */
const media = (matching: string[]) =>
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: matching.includes(query), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );

const mesa = (view: CoupRoomView, c: Conn = conn()) => render(<CoupTable view={view} conn={c} serverOffset={0} status="joined" />);
const com = (v: CoupRoomView, game: Partial<CoupView>): CoupRoomView => ({ ...v, game: { ...v.game, ...game } });

function startedBy(n: number, first: string): Room {
  for (let seed = 1; seed < 500; seed++) {
    const r = coupRoom(n, seed);
    if (turnOf(r) === first) return r;
  }
  throw new Error(`nenhuma semente começa com ${first}`);
}
const betoDaVez = () => step(startedBy(3, 'p0'), 'p0', { type: 'act', kind: 'income' });
const betoTaxa = () => step(betoDaVez(), 'p1', { type: 'act', kind: 'tax' });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  media([PHONE_LAYOUT_QUERY]);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('Cúpi no celular em pé', () => {
  it('a raiz ganha coup--phone (no computador, não)', () => {
    const { container, unmount } = mesa(viewOf(betoDaVez(), 'p0'));
    expect(container.querySelector('.coup')!.classList.contains('coup--phone')).toBe(true);
    // sem palco fixo: nada de escala no style
    expect(container.querySelector<HTMLElement>('.cp-app')!.style.transform).toBe('');
    unmount();
    media([]);
    const { container: desk } = mesa(viewOf(betoDaVez(), 'p0'));
    expect(desk.querySelector('.coup')!.classList.contains('coup--phone')).toBe(false);
    expect(desk.querySelector('.cp-lastline')).toBeNull();
  });

  it('o topo mostra o placar resumido: você e quem lidera', () => {
    const view = com(viewOf(betoDaVez(), 'p0'), { wins: { p0: 1, p1: 2, p2: 0 } });
    const { container } = mesa(view);
    expect(container.querySelector('.cp-score')!.textContent).toBe('placar você 1 · Beto 2');
  });

  it('a faixa do diário mostra a última linha e abre e fecha a folha', () => {
    const { container } = mesa(viewOf(betoTaxa(), 'p0'));
    const strip = screen.getByRole('button', { name: 'abrir o diário' });
    expect(strip.querySelector('.txt')!.textContent).toBe('Beto disse Duque');
    expect(screen.queryByRole('dialog', { name: 'diário' })).toBeNull();
    fireEvent.click(strip);
    const sheet = screen.getByRole('dialog', { name: 'diário' });
    expect(within(sheet).getAllByRole('listitem')).toHaveLength(3);
    expect(container.querySelector('.cp-scrim')).toBeTruthy();
    expect(document.activeElement).toBe(within(sheet).getByRole('button', { name: 'fechar' }));
    fireEvent.click(within(sheet).getByRole('button', { name: 'fechar' }));
    expect(screen.queryByRole('dialog', { name: 'diário' })).toBeNull();
    expect(container.querySelector('.cp-scrim')).toBeNull();
    // o fundo escurecido também fecha
    fireEvent.click(strip);
    fireEvent.click(container.querySelector('.cp-scrim')!);
    expect(screen.queryByRole('dialog', { name: 'diário' })).toBeNull();
  });

  it('as ações mandam o mesmo que no computador', () => {
    const c = conn();
    mesa(viewOf(startedBy(3, 'p0'), 'p0'), c);
    fireEvent.click(screen.getByRole('button', { name: /^renda/ }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'act', kind: 'income' });
  });

  it('o modo alvo funciona igual', () => {
    const c = conn();
    mesa(viewOf(startedBy(3, 'p0'), 'p0'), c);
    fireEvent.click(screen.getByRole('button', { name: /^extorquir/ }));
    fireEvent.click(screen.getByRole('button', { name: /^mirar em Caio/ }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'act', kind: 'steal', target: 'p2' });
  });

  it('as reações mandam o mesmo que no computador', () => {
    const view = viewOf(betoTaxa(), 'p0');
    const c = conn();
    mesa(view, c);
    fireEvent.click(screen.getByRole('button', { name: 'deixa' }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'pass', windowId: view.game.window!.id });
    const steal = viewOf(step(betoDaVez(), 'p1', { type: 'act', kind: 'steal', target: 'p0' }), 'p0');
    const c2 = conn();
    mesa(steal, c2);
    fireEvent.click(screen.getAllByRole('button', { name: 'bloquear como Capitão' }).at(-1)!);
    expect(c2.sendAction).toHaveBeenCalledWith({ type: 'block', as: 'captain', windowId: steal.game.window!.id });
  });

  it('o painel de perder carta aparece como folha', () => {
    const tax = betoTaxa();
    const room = step(tax, 'p0', { type: 'challenge', windowId: viewOf(tax, null).game.window!.id });
    const game = viewOf(room, null).game;
    const view = viewOf(room, game.loss!.player);
    const c = conn();
    mesa(view, c);
    const sheet = screen.getByRole('dialog', { name: lossTitle(game.loss!.reason) });
    expect(sheet.classList.contains('cp-panel')).toBe(true);
    fireEvent.click(sheet.querySelectorAll<HTMLButtonElement>('.cp-pickc')[0]!);
    fireEvent.click(within(sheet).getByRole('button', { name: /^revelar / }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'lose', card: view.game.myCards[0] });
  });

  it('o diário fechado não vira folha no computador (sem a faixa, sem dialog)', () => {
    media([]);
    mesa(viewOf(betoTaxa(), 'p0'));
    expect(screen.queryByRole('button', { name: 'abrir o diário' })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    rtlAct(() => {});
    expect(screen.getByRole('heading', { name: 'diário' })).toBeTruthy();
  });
});
