import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { mandacaruStateOf, type MandacaruRoomView, type MandacaruState, type Room } from '@cartolina/shared';
import { resSources, resUses } from '../src/games/mandacaru/CardZoom';
import { MandacaruTable } from '../src/games/mandacaru/MandacaruTable';
import type { GameConn } from '../src/net/connection';
import { T0, afterSetup, mandacaruRoom, viewOf, withGame } from './mandacaru-fixtures';

vi.mock('../src/games/mandacaru/sounds', () => ({
  playMandacaruSound: vi.fn(),
  installMandacaruAudioUnlock: vi.fn(() => () => {}),
}));

type Conn = GameConn & { sendAction: Mock<GameConn['sendAction']> };
function conn(): Conn {
  return {
    sendAction: vi.fn<GameConn['sendAction']>(),
    sendActivity: vi.fn(),
    sendCursor: vi.fn(),
    sendPing: vi.fn(),
    onFx: vi.fn(() => () => {}),
    onError: vi.fn(() => () => {}),
  };
}
const mesa = (view: MandacaruRoomView, c: Conn = conn()) => render(<MandacaruTable view={view} conn={c} serverOffset={0} status="joined" />);
const turnOf = (room: Room) => mandacaruStateOf(room)!.turn!;

/** Fase principal de quem está na vez, com os cordéis dados (e já rolou: dá pra jogar o que não é novo). */
function comCordeis(cordeis: MandacaruState['hands'][string]['cordeis'], edit: (s: MandacaruState) => MandacaruState = (s) => s): Room {
  const base = afterSetup(mandacaruRoom(3, 1));
  const turn = turnOf(base);
  return withGame(base, (s) =>
    edit({ ...s, phase: 'main', rolled: true, hands: { ...s.hands, [turn]: { ...s.hands[turn]!, cordeis } } }),
  );
}
const dialog = () => screen.queryByRole('dialog', { name: /^carta/ });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('carta da mão aberta grande', () => {
  it('recurso: clicar abre com o nome, quantas, de onde vem e em que entra; Esc fecha', () => {
    const room = afterSetup(mandacaruRoom(3, 1));
    const turn = turnOf(room);
    const n = mandacaruStateOf(room)!.hands[turn]!.res.wood;
    mesa(viewOf(room, turn));
    fireEvent.click(screen.getByRole('button', { name: 'ver madeira' }));
    const d = dialog()!;
    expect(d.getAttribute('aria-label')).toBe('carta: madeira');
    expect(d.textContent).toContain(`você tem ${n}`);
    expect(d.textContent).toContain('vem de: caatinga');
    expect(d.textContent).toContain('entra em: estrada e casa');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(dialog()).toBeNull();
  });

  it('recurso também abre pelo teclado (Enter) e fecha clicando fora ou no ✕', () => {
    const room = afterSetup(mandacaruRoom(3, 1));
    const turn = turnOf(room);
    const { container } = mesa(viewOf(room, turn));
    fireEvent.keyDown(screen.getByRole('button', { name: 'ver pedra' }), { key: 'Enter' });
    expect(dialog()!.textContent).toContain('lajedo');
    // clicar dentro da carta não fecha
    fireEvent.click(dialog()!);
    expect(dialog()).toBeTruthy();
    fireEvent.click(container.querySelector('.mc-zoom-fundo')!);
    expect(dialog()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'ver pedra' }));
    fireEvent.click(screen.getByRole('button', { name: 'fechar a carta' }));
    expect(dialog()).toBeNull();
  });

  it('cordel: arte, nome, quantas, "novo" e o que faz; o "jogar" do zoom manda a mesma ação e fecha', () => {
    const room = comCordeis([
      { kind: 'vaqueiro', fresh: false },
      { kind: 'vaqueiro', fresh: true },
    ]);
    const c = conn();
    const { container } = mesa(viewOf(room, turnOf(room)), c);
    fireEvent.click(container.querySelector('[data-cordel="vaqueiro"]')!);
    const d = dialog()!;
    expect(d.getAttribute('aria-label')).toBe('carta: Vaqueiro');
    expect(d.textContent).toContain('você tem 2');
    expect(d.textContent).toContain('1 novo');
    expect(d.textContent).toContain('leva o Carcará pra outro terreno e rouba 1 carta');
    expect(d.querySelector('img, svg')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'jogar Vaqueiro (carta aberta)' }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'play_vaqueiro' });
    expect(dialog()).toBeNull();
  });

  it('cordel novo (comprado agora) não mostra "jogar"', () => {
    const room = comCordeis([{ kind: 'mutirao', fresh: true }]);
    mesa(viewOf(room, turnOf(room)));
    fireEvent.click(screen.getByRole('button', { name: 'ver Mutirão' }));
    expect(dialog()!.textContent).toContain('novo');
    expect(screen.queryByRole('button', { name: /carta aberta/ })).toBeNull();
  });

  it('Pontos: cada um com o nome dele', () => {
    const room = comCordeis([
      { kind: 'point', fresh: false },
      { kind: 'point', fresh: false },
    ]);
    mesa(viewOf(room, turnOf(room)));
    fireEvent.click(screen.getByRole('button', { name: 'ver Pontos' }));
    const d = dialog()!;
    expect(d.textContent).toContain('Igrejinha');
    expect(d.textContent).toContain('Açude');
    expect(d.textContent).toContain('+1 ponto, escondido até o fim');
  });

  it('o "jogar" da mão continua jogando direto (não abre o zoom)', () => {
    const room = comCordeis([{ kind: 'mutirao', fresh: false }]);
    const c = conn();
    mesa(viewOf(room, turnOf(room)), c);
    fireEvent.click(screen.getByRole('button', { name: 'jogar Mutirão' }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'play_mutirao' });
    expect(dialog()).toBeNull();
  });

  it('com janela aberta por cima (descarte), as cartas não abrem', () => {
    const base = afterSetup(mandacaruRoom(3, 1));
    const turn = turnOf(base);
    const room = withGame(base, (s) => ({
      ...s,
      phase: 'discard',
      rolled: true,
      discards: { [turn]: 4 },
      discardEndsAt: T0 + 30_000,
      hands: { ...s.hands, [turn]: { ...s.hands[turn]!, res: { wood: 2, brick: 2, leather: 2, beans: 1, stone: 1 } } },
    }));
    const { container } = mesa(viewOf(room, turn));
    expect(screen.queryByRole('button', { name: 'ver madeira' })).toBeNull();
    fireEvent.click(container.querySelector('.mc-hand [data-res="wood"]')!);
    expect(dialog()).toBeNull();
  });

  it('textos do recurso vêm das tabelas (terreno e custos)', () => {
    expect(resSources('beans')).toEqual(['roçado']);
    expect(resUses('beans')).toEqual(['casa', 'vila', 'cordel']);
    expect(resUses('stone')).toEqual(['vila', 'cordel']);
  });
});
