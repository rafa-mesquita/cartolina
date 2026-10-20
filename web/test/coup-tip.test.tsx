import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { CoupRoomView, Room } from '@cartolina/shared';
import { CoupTable } from '../src/games/coup/CoupTable';
import { CHARACTER_NAMES } from '../src/games/coup/names';
import { playCoupSound } from '../src/games/coup/sounds';
import { actionTip, characterTip, reactionTip } from '../src/games/coup/rules';
import { useTip } from '../src/games/coup/Tip';
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
const mesa = (view: CoupRoomView, c: Conn = conn()) => render(<CoupTable view={view} conn={c} serverOffset={0} status="joined" />);

function startedBy(n: number, first: string): Room {
  for (let seed = 1; seed < 500; seed++) {
    const r = coupRoom(n, seed);
    if (turnOf(r) === first) return r;
  }
  throw new Error(`nenhuma semente começa com ${first}`);
}
const anaDaVez = () => startedBy(3, 'p0');
const betoTaxa = () => step(step(anaDaVez(), 'p0', { type: 'act', kind: 'income' }), 'p1', { type: 'act', kind: 'tax' });

/** O balão visível (null = escondido). */
const balloon = () => document.querySelector<HTMLElement>('.cp-tip');
/** O texto ligado ao elemento por aria-describedby. */
const described = (el: Element) => document.getElementById(el.getAttribute('aria-describedby') ?? '')?.textContent;
/** Clique que vem de ponteiro (o do teclado tem detail 0). */
const TAP = { detail: 1 };
const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const hold = (el: Element) => {
  fireEvent.pointerDown(el, { pointerType: 'touch' });
  wait(450);
  fireEvent.pointerUp(el, { pointerType: 'touch' });
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('dica rápida nas ações', () => {
  it('o texto está ligado ao botão por aria-describedby, mesmo com o balão escondido', () => {
    mesa(viewOf(anaDaVez(), 'p0'));
    const renda = screen.getByRole('button', { name: /^renda/ });
    expect(balloon()).toBeNull();
    expect(described(renda)).toBe(actionTip('income'));
    expect(screen.getByRole('button', { name: /^taxar/ }).getAttribute('aria-describedby')).not.toBe(renda.getAttribute('aria-describedby'));
  });

  it('passar o mouse mostra o balão; sair esconde', () => {
    mesa(viewOf(anaDaVez(), 'p0'));
    const taxar = screen.getByRole('button', { name: /^taxar/ });
    fireEvent.pointerEnter(taxar, { pointerType: 'mouse' });
    expect(balloon()!.textContent).toBe(actionTip('tax'));
    expect(balloon()!.getAttribute('aria-hidden')).toBe('true');
    fireEvent.pointerLeave(taxar, { pointerType: 'mouse' });
    expect(balloon()).toBeNull();
  });

  it('também nas ações apagadas (fora da sua vez dá pra aprender)', () => {
    mesa(viewOf(anaDaVez(), 'p0'));
    const golpe = screen.getByRole('button', { name: /^golpe/ }) as HTMLButtonElement;
    expect(golpe.disabled).toBe(true);
    fireEvent.pointerEnter(golpe, { pointerType: 'mouse' });
    expect(balloon()!.textContent).toBe(actionTip('coup'));
  });

  it('o foco pelo teclado mostra; perder o foco esconde', () => {
    mesa(viewOf(anaDaVez(), 'p0'));
    const renda = screen.getByRole('button', { name: /^renda/ });
    fireEvent.focus(renda);
    expect(balloon()!.textContent).toBe(actionTip('income'));
    fireEvent.blur(renda);
    expect(balloon()).toBeNull();
  });

  it('o clique do mouse continua mandando a ação', () => {
    const c = conn();
    mesa(viewOf(anaDaVez(), 'p0'), c);
    const renda = screen.getByRole('button', { name: /^renda/ });
    fireEvent.pointerEnter(renda, { pointerType: 'mouse' });
    fireEvent.pointerDown(renda, { pointerType: 'mouse' });
    fireEvent.pointerUp(renda, { pointerType: 'mouse' });
    fireEvent.click(renda, TAP);
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'act', kind: 'income' });
  });
});

describe('dica rápida no toque', () => {
  it('segurar 450 ms mostra o balão e o clique que vem depois não manda a ação', () => {
    const c = conn();
    mesa(viewOf(anaDaVez(), 'p0'), c);
    const renda = screen.getByRole('button', { name: /^renda/ });
    fireEvent.pointerDown(renda, { pointerType: 'touch' });
    wait(449);
    expect(balloon()).toBeNull();
    wait(1);
    expect(balloon()!.textContent).toBe(actionTip('income'));
    fireEvent.pointerUp(renda, { pointerType: 'touch' });
    fireEvent.click(renda, TAP);
    expect(c.sendAction).not.toHaveBeenCalled();
    // o toque seguinte, curto, volta a mandar
    fireEvent.pointerDown(renda, { pointerType: 'touch' });
    wait(100);
    fireEvent.pointerUp(renda, { pointerType: 'touch' });
    fireEvent.click(renda, TAP);
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'act', kind: 'income' });
  });

  it('um toque curto manda a ação e não mostra nada (nem pelo foco do toque)', () => {
    const c = conn();
    mesa(viewOf(anaDaVez(), 'p0'), c);
    const renda = screen.getByRole('button', { name: /^renda/ });
    fireEvent.pointerDown(renda, { pointerType: 'touch' });
    wait(120);
    fireEvent.pointerUp(renda, { pointerType: 'touch' });
    fireEvent.focus(renda);
    fireEvent.click(renda, TAP);
    expect(balloon()).toBeNull();
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'act', kind: 'income' });
    wait(1000);
    expect(balloon()).toBeNull();
  });

  it('o balão some sozinho depois de 3 s', () => {
    mesa(viewOf(anaDaVez(), 'p0'));
    hold(screen.getByRole('button', { name: /^renda/ }));
    expect(balloon()).toBeTruthy();
    wait(2900);
    expect(balloon()).toBeTruthy();
    wait(200);
    expect(balloon()).toBeNull();
  });

  it('segurar mais de 3 s: o foco que chega no fim do toque não reabre o balão, e o clique não sai', () => {
    const c = conn();
    mesa(viewOf(anaDaVez(), 'p0'), c);
    const renda = screen.getByRole('button', { name: /^renda/ });
    fireEvent.pointerDown(renda, { pointerType: 'touch' });
    wait(450);
    expect(balloon()).toBeTruthy();
    wait(3100);
    expect(balloon()).toBeNull();
    fireEvent.pointerUp(renda, { pointerType: 'touch' });
    fireEvent.focus(renda);
    fireEvent.click(renda, TAP);
    expect(balloon()).toBeNull();
    expect(c.sendAction).not.toHaveBeenCalled();
  });

  it('o balão sumiu sozinho: um Enter depois não é engolido', () => {
    const c = conn();
    mesa(viewOf(anaDaVez(), 'p0'), c);
    const renda = screen.getByRole('button', { name: /^renda/ });
    hold(renda);
    wait(3100);
    expect(balloon()).toBeNull();
    // clique do teclado (Enter/espaço): detail 0
    fireEvent.click(renda, { detail: 0 });
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'act', kind: 'income' });
  });

  it('o clique engolido depois de segurar não faz o som de clique; o toque curto faz', () => {
    mesa(viewOf(anaDaVez(), 'p0'));
    const renda = screen.getByRole('button', { name: /^renda/ });
    hold(renda);
    fireEvent.click(renda, TAP);
    expect(playCoupSound).not.toHaveBeenCalledWith('click');
    fireEvent.pointerDown(renda, { pointerType: 'touch' });
    fireEvent.pointerUp(renda, { pointerType: 'touch' });
    fireEvent.click(renda, TAP);
    expect(playCoupSound).toHaveBeenCalledWith('click');
  });

  it('tocar em outro lugar esconde o balão', () => {
    mesa(viewOf(anaDaVez(), 'p0'));
    hold(screen.getByRole('button', { name: /^renda/ }));
    expect(balloon()).toBeTruthy();
    fireEvent.pointerDown(document.body, { pointerType: 'touch' });
    expect(balloon()).toBeNull();
  });

  it('o toque cancelado (rolagem) não mostra nada', () => {
    mesa(viewOf(anaDaVez(), 'p0'));
    const renda = screen.getByRole('button', { name: /^renda/ });
    fireEvent.pointerDown(renda, { pointerType: 'touch' });
    wait(200);
    fireEvent.pointerCancel(renda, { pointerType: 'touch' });
    wait(500);
    expect(balloon()).toBeNull();
  });
});

describe('dica rápida: teclado', () => {
  it('Esc fecha a dica aberta pelo foco', () => {
    mesa(viewOf(anaDaVez(), 'p0'));
    const renda = screen.getByRole('button', { name: /^renda/ });
    fireEvent.focus(renda);
    expect(balloon()).toBeTruthy();
    fireEvent.keyDown(renda, { key: 'Escape' });
    expect(balloon()).toBeNull();
  });

  it('sua carta focável é uma imagem com o nome e a dica como descrição', () => {
    const view = viewOf(anaDaVez(), 'p0');
    mesa(view);
    const first = view.game.myCards[0]!;
    const card = screen.getAllByRole('img', { name: CHARACTER_NAMES[first], description: characterTip(first) })[0]!;
    expect(card.classList.contains('cp-card')).toBe(true);
    expect(card.tabIndex).toBe(0);
  });
});

describe('dica rápida nas suas cartas e na janela', () => {
  it('suas cartas viradas pra baixo explicam o personagem', () => {
    const view = viewOf(anaDaVez(), 'p0');
    const { container } = mesa(view);
    const cards = container.querySelectorAll<HTMLElement>('.cp-myhand .cp-card.l');
    expect(cards).toHaveLength(2);
    cards.forEach((card, i) => expect(described(card)).toBe(characterTip(view.game.myCards[i]!)));
    expect(cards[0]!.tabIndex).toBe(0);
    fireEvent.pointerEnter(cards[1]!, { pointerType: 'mouse' });
    expect(balloon()!.textContent).toBe(characterTip(view.game.myCards[1]!));
    fireEvent.pointerLeave(cards[1]!, { pointerType: 'mouse' });
    hold(cards[0]!);
    expect(balloon()!.textContent).toBe(characterTip(view.game.myCards[0]!));
  });

  it('duvidar e deixa têm dica; segurar "deixa" não manda o passe', () => {
    const c = conn();
    mesa(viewOf(betoTaxa(), 'p0'), c);
    const duvidar = screen.getByRole('button', { name: 'duvidar' });
    const deixa = screen.getByRole('button', { name: 'deixa' });
    expect(described(duvidar)).toBe(reactionTip('challenge'));
    expect(described(deixa)).toBe(reactionTip('pass'));
    fireEvent.pointerEnter(duvidar, { pointerType: 'mouse' });
    expect(balloon()!.textContent).toBe(reactionTip('challenge'));
    fireEvent.pointerLeave(duvidar, { pointerType: 'mouse' });
    hold(deixa);
    fireEvent.click(deixa, TAP);
    expect(balloon()!.textContent).toBe(reactionTip('pass'));
    expect(c.sendAction).not.toHaveBeenCalled();
    fireEvent.click(deixa, TAP);
    expect(c.sendAction).toHaveBeenCalledTimes(1);
  });

  it('"bloquear como X" explica o bloqueio com o personagem', () => {
    const steal = step(step(anaDaVez(), 'p0', { type: 'act', kind: 'income' }), 'p1', { type: 'act', kind: 'steal', target: 'p0' });
    mesa(viewOf(steal, 'p0'));
    const btn = screen.getAllByRole('button', { name: 'bloquear como Embaixador' }).at(-1)!;
    expect(described(btn)).toBe(reactionTip('block', 'ambassador'));
  });
});

function Probe({ text }: { text: string }) {
  const { props, tip } = useTip(text);
  return (
    <>
      <button type="button" {...props}>
        alvo
      </button>
      {tip}
    </>
  );
}

describe('useTip', () => {
  it('fora da mesa o balão vai pro body; desmontar no meio do segurar não deixa relógio ligado', () => {
    const { unmount } = render(<Probe text="oi" />);
    const btn = screen.getByRole('button', { name: 'alvo' });
    fireEvent.pointerEnter(btn, { pointerType: 'mouse' });
    expect(balloon()!.parentElement).toBe(document.body);
    fireEvent.pointerLeave(btn, { pointerType: 'mouse' });
    fireEvent.pointerDown(btn, { pointerType: 'touch' });
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
