import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { COUP_CHARACTERS, type CoupRoomView, type CoupView, type Room } from '@cartolina/shared';
import { CoupTable } from '../src/games/coup/CoupTable';
import { CHARACTER_NAMES } from '../src/games/coup/names';
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

const c0 = conn();
const table = (view: CoupRoomView) => <CoupTable view={view} conn={c0} serverOffset={0} status="joined" />;
const mesa = (view: CoupRoomView) => render(table(view));
const com = (v: CoupRoomView, game: Partial<CoupView>): CoupRoomView => ({ ...v, game: { ...v.game, ...game } });
const NOTHING = { act: [], targets: [], challenge: false, block: [], pass: false, lose: false, keep: 0 };

function startedBy(n: number, first: string): Room {
  for (let seed = 1; seed < 500; seed++) {
    const r = coupRoom(n, seed);
    if (turnOf(r) === first) return r;
  }
  throw new Error(`nenhuma semente começa com ${first}`);
}
/** Ana pega renda: a vez vai pro Beto (Ana não precisa fazer nada). */
const betoDaVez = () => step(startedBy(3, 'p0'), 'p0', { type: 'act', kind: 'income' });
/** Beto taxa: janela aberta pra Ana e Caio. */
const betoTaxa = () => step(betoDaVez(), 'p1', { type: 'act', kind: 'tax' });

const rulesBtn = () => screen.getByRole('button', { name: 'regras' });
const sheet = () => screen.queryByRole('dialog', { name: 'regras' });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  media([]);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('Cúpi: botão "regras" e a colinha', () => {
  it('o botão no topo abre a colinha completa, com o foco no "fechar"', () => {
    mesa(viewOf(betoDaVez(), 'p0'));
    const btn = rulesBtn();
    expect(btn.closest('.cp-top')).toBeTruthy();
    expect(btn.getAttribute('aria-haspopup')).toBe('dialog');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(sheet()).toBeNull();
    fireEvent.click(btn);
    const d = sheet()!;
    expect(d).toBeTruthy();
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    for (const h of ['ações', 'personagens', 'como funciona']) expect(within(d).getByRole('heading', { name: h })).toBeTruthy();
    expect(d.querySelectorAll('tbody tr')).toHaveLength(7);
    const imgs = within(d).getAllByRole('img');
    expect(imgs.map((i) => i.getAttribute('alt'))).toEqual(COUP_CHARACTERS.map((c) => CHARACTER_NAMES[c]));
    expect(d.textContent).toContain('bloqueia o assassinato');
    expect(document.activeElement).toBe(within(d).getByRole('button', { name: 'fechar' }));
    // computador: painel ao lado (a partida continua), sem fundo escurecido
    expect(d.getAttribute('aria-modal')).toBeNull();
    expect(document.querySelector('.cp-scrim')).toBeNull();
  });

  it('"fechar" fecha e o foco volta pro botão', () => {
    mesa(viewOf(betoDaVez(), 'p0'));
    fireEvent.click(rulesBtn());
    fireEvent.click(within(sheet()!).getByRole('button', { name: 'fechar' }));
    expect(sheet()).toBeNull();
    expect(document.activeElement).toBe(rulesBtn());
    expect(rulesBtn().getAttribute('aria-expanded')).toBe('false');
  });

  it('o botão de novo também fecha', () => {
    mesa(viewOf(betoDaVez(), 'p0'));
    fireEvent.click(rulesBtn());
    fireEvent.click(rulesBtn());
    expect(sheet()).toBeNull();
  });

  it('Esc fecha e o foco volta pro botão', () => {
    mesa(viewOf(betoDaVez(), 'p0'));
    fireEvent.click(rulesBtn());
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(sheet()).toBeNull();
    expect(document.activeElement).toBe(rulesBtn());
  });

  it('Esc com a colinha aberta no modo alvo fecha só a colinha', () => {
    mesa(viewOf(startedBy(3, 'p0'), 'p0'));
    fireEvent.click(screen.getByRole('button', { name: /^extorquir/ }));
    fireEvent.click(rulesBtn());
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(sheet()).toBeNull();
    expect(screen.getByText('escolha o alvo lá em cima ·', { exact: false })).toBeTruthy();
  });

  it('no celular é folha com fundo; tocar no fundo fecha', () => {
    media([PHONE_LAYOUT_QUERY]);
    const { container } = mesa(viewOf(betoDaVez(), 'p0'));
    fireEvent.click(rulesBtn());
    const d = sheet()!;
    expect(d.getAttribute('aria-modal')).toBe('true');
    expect(d.classList.contains('sheet')).toBe(true);
    expect(document.activeElement).toBe(within(d).getByRole('button', { name: 'fechar' }));
    fireEvent.click(container.querySelector('.cp-scrim')!);
    expect(sheet()).toBeNull();
    expect(container.querySelector('.cp-scrim')).toBeNull();
    expect(document.activeElement).toBe(rulesBtn());
  });

  it('abre uma janela pra você reagir: a colinha fecha sozinha', () => {
    const { rerender } = mesa(viewOf(betoDaVez(), 'p0'));
    fireEvent.click(rulesBtn());
    expect(sheet()).toBeTruthy();
    const tax = viewOf(betoTaxa(), 'p0');
    expect(tax.game.can.pass).toBe(true);
    rerender(table(tax));
    expect(sheet()).toBeNull();
    expect(screen.getByRole('button', { name: 'deixa' })).toBeTruthy();
  });

  it('fechando sozinha com o foco nela, o foco vai pro primeiro botão da janela', () => {
    const { rerender } = mesa(viewOf(betoDaVez(), 'p0'));
    fireEvent.click(rulesBtn());
    expect(document.activeElement?.textContent).toMatch(/^fechar/);
    rerender(table(viewOf(betoTaxa(), 'p0')));
    expect(sheet()).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'duvidar' }));
  });

  it('fechando sozinha com o foco fora dela, ninguém mexe no foco', () => {
    const { rerender } = mesa(viewOf(betoDaVez(), 'p0'));
    fireEvent.click(rulesBtn());
    const card = document.querySelector<HTMLElement>('.cp-myhand .cp-card.tipped')!;
    act(() => card.focus());
    rerender(table(viewOf(betoTaxa(), 'p0')));
    expect(sheet()).toBeNull();
    expect(document.activeElement).toBe(card);
  });

  it('fechada no "fechar" com a janela aberta, o foco volta pro botão "regras"', () => {
    mesa(viewOf(betoTaxa(), 'p0'));
    fireEvent.click(rulesBtn());
    fireEvent.click(within(sheet()!).getByRole('button', { name: 'fechar' }));
    expect(document.activeElement).toBe(rulesBtn());
  });

  it('você precisa perder carta ou trocar: a colinha fecha sozinha', () => {
    const base = viewOf(betoDaVez(), 'p0');
    const { rerender } = mesa(base);
    fireEvent.click(rulesBtn());
    rerender(table(com(base, { phase: 'losing', can: { ...NOTHING, lose: true } })));
    expect(sheet()).toBeNull();
    fireEvent.click(rulesBtn());
    expect(sheet()).toBeTruthy();
    rerender(table(com(base, { phase: 'exchange', can: { ...NOTHING, keep: 2 } })));
    expect(sheet()).toBeNull();
  });

  it('fechada sozinha, não volta quando a situação deixa de pedir você', () => {
    const { rerender } = mesa(viewOf(betoDaVez(), 'p0'));
    fireEvent.click(rulesBtn());
    rerender(table(viewOf(betoTaxa(), 'p0')));
    expect(sheet()).toBeNull();
    rerender(table(viewOf(betoDaVez(), 'p0')));
    expect(sheet()).toBeNull();
  });

  it('a vez de outro (nada pra você fazer) não fecha a colinha', () => {
    const { rerender } = mesa(viewOf(betoDaVez(), 'p0'));
    fireEvent.click(rulesBtn());
    rerender(table(viewOf(step(betoDaVez(), 'p1', { type: 'act', kind: 'income' }), 'p0')));
    expect(sheet()).toBeTruthy();
  });

  it('aberta com a janela já pedindo você, fica aberta (foi você que abriu) e o relógio não fecha', () => {
    mesa(viewOf(betoTaxa(), 'p0'));
    fireEvent.click(rulesBtn());
    expect(sheet()).toBeTruthy();
    act(() => vi.advanceTimersByTime(1000));
    expect(sheet()).toBeTruthy();
  });

  it('quem assiste também tem a colinha', () => {
    mesa(viewOf(betoDaVez(), null));
    fireEvent.click(rulesBtn());
    expect(sheet()).toBeTruthy();
  });
});
