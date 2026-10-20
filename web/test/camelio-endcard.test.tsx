import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CamelioView } from '@cartolina/shared';
import { EndCard, endTitle, endWhy, type EndCardProps } from '../src/games/camelio/EndCard';
import { namer, colorer } from '../src/games/dixit/status';
import { camelioView, patchGame, started } from './camelio-fixtures';

/** Fim pela meta: p0 pontuou vermelho, azul e amarelo. */
const target = (n = 3) =>
  patchGame(started(n), {
    phase: 'over',
    turn: null,
    winners: ['p0'],
    endReason: 'target',
    scored: { p0: [22, 20, 32, 34, 8, 10], ...Object.fromEntries(Array.from({ length: n - 1 }, (_, i) => [`p${i + 1}`, []])) },
  });

function setup(room = target(), viewer: string | null = 'p0', over: Partial<EndCardProps> = {}) {
  const view = camelioView(room, viewer);
  const props: EndCardProps = {
    v: view.game as CamelioView,
    you: view.you,
    name: namer(view),
    color: colorer(view),
    host: view.hostId !== null && view.hostId === view.you,
    busy: false,
    onAgain: vi.fn(),
    onLobby: vi.fn(),
    ...over,
  };
  const utils = render(<EndCard {...props} />);
  return { ...utils, props, view };
}

describe('EndCard', () => {
  it('fim pela meta: título, motivo e linhas na ordem', () => {
    const { container } = setup();
    expect(screen.getByRole('heading', { name: 'você ganhou!' })).toBeTruthy();
    expect(screen.getByText('chegou a 3 cores')).toBeTruthy();
    const rows = [...container.querySelectorAll('li')];
    expect(rows.map((li) => li.getAttribute('data-pid'))).toEqual(['p0', 'p1', 'p2']);
    expect(rows[0]?.classList.contains('win')).toBe(true);
    expect(rows[1]?.classList.contains('win')).toBe(false);
    expect(within(rows[0]!).getByText('1º')).toBeTruthy();
    // p1 e p2 empatam (sem pontos e sem esferas): dividem a posição
    expect(within(rows[1]!).getByText('2º')).toBeTruthy();
    expect(within(rows[2]!).getByText('2º')).toBeTruthy();
    expect(within(rows[0]!).getAllByLabelText(/^pontuou o /)).toHaveLength(3);
    expect(within(rows[1]!).getByText('nenhuma cor')).toBeTruthy();
    expect(within(rows[1]!).getByText('0 esferas em jogo')).toBeTruthy();
  });

  it('outro jogador ganhou: usa o nome dele', () => {
    const room = patchGame(target(), { winners: ['p1'], scored: { p0: [], p1: [22, 20, 32, 34, 8, 10], p2: [] } });
    setup(room, 'p0');
    expect(screen.getByRole('heading', { name: 'P1 ganhou!' })).toBeTruthy();
  });

  it('empate pelo monte: "você" por último e sem pontuar nada', () => {
    const room = patchGame(started(3), {
      phase: 'over',
      turn: null,
      winners: ['p0', 'p1'],
      endReason: 'deck',
      table: { p0: [], p1: [], p2: [] },
      scored: { p0: [], p1: [], p2: [] },
    });
    const { view } = setup(room, 'p0');
    expect(screen.getByRole('heading', { name: 'empate: P1 e você' })).toBeTruthy();
    expect(screen.getByText('o monte acabou')).toBeTruthy();
    expect(endTitle(view.game as CamelioView, view.you, namer(view))).toBe('empate: P1 e você');
    expect(endWhy(view.game as CamelioView)).toBe('o monte acabou');
  });

  it('host vê os dois botões; "jogar de novo" e "voltar pro lobby" chamam os callbacks', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'jogar de novo' }));
    expect(props.onAgain).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'voltar pro lobby' }));
    expect(props.onLobby).toHaveBeenCalledTimes(1);
  });

  it('busy trava os botões do host', () => {
    setup(target(), 'p0', { busy: true });
    expect((screen.getByRole('button', { name: 'jogar de novo' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'voltar pro lobby' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('não-host vê "esperando o host…" e nenhum botão de recomeçar', () => {
    setup(target(), 'p1');
    expect(screen.getByText('esperando o host…')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'jogar de novo' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'voltar pro lobby' })).toBeNull();
  });

  it('"ver a mesa" recolhe numa faixa e clicar nela reabre', () => {
    const { container, props } = setup();
    const card = container.querySelector('.cl-end')!;
    expect(card?.classList.contains('mini')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /ver a mesa/ }));
    expect(card?.classList.contains('mini')).toBe(true);
    fireEvent.click(card);
    expect(card?.classList.contains('mini')).toBe(false);
    expect(props.onAgain).not.toHaveBeenCalled();
  });

  it('compacto só a partir de 4 jogadores', () => {
    const three = setup(target(3));
    expect(three.container.querySelector('.cl-end')?.classList.contains('compact')).toBe(false);
    three.unmount();
    const four = setup(target(4));
    expect(four.container.querySelector('.cl-end')?.classList.contains('compact')).toBe(true);
  });
});
