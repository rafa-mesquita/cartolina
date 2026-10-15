import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, type Mock } from 'vitest';
import type { GameConn } from '../src/net/connection';
import { resultCopy, ResultBanner } from '../src/table/ResultBanner';
import { act, sortingRoom, viewOf } from './fixtures';

const conn = (): GameConn & { sendAction: Mock<GameConn['sendAction']> } => ({
  sendAction: vi.fn<GameConn['sendAction']>(),
  sendActivity: vi.fn(),
  sendCursor: vi.fn(),
  sendPing: vi.fn(),
  onFx: vi.fn(() => () => {}),
  onError: vi.fn(() => () => {}),
});

function revealed() {
  let room = sortingRoom(2);
  room = act(room, 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
  room = act(room, 'p1', { type: 'place', cardId: 'p1:0', index: 1 });
  return act(room, 'p0', { type: 'forceReveal' });
}

describe('resultCopy', () => {
  it('textos por resultado', () => {
    expect(resultCopy('round_won', 1, 0).win).toBe(true);
    expect(resultCopy('round_lost', 1, 2)).toMatchObject({ win: false, title: 'xi, errou essa', sub: '2 cartas fora de ordem', next: 'nova rodada' });
    expect(resultCopy('level_cleared', 2, 1)).toMatchObject({ win: true, title: 'nível 2 ✓', next: 'próximo nível' });
    expect(resultCopy('lost', 3, 1)).toMatchObject({ win: false, next: 'voltar pro lobby' });
    expect(resultCopy('won', 3, 0)).toMatchObject({ win: true, next: 'voltar pro lobby' });
  });
});

describe('ResultBanner', () => {
  it('host vê próxima ação e voltar ao lobby', () => {
    const c = conn();
    render(<ResultBanner view={viewOf(revealed(), 'p0')} conn={c} />);
    fireEvent.click(screen.getByRole('button', { name: 'nova rodada' }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'next' });
    fireEvent.click(screen.getByRole('button', { name: 'voltar pro lobby' }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'lobby' });
  });

  it('quem não é host espera', () => {
    render(<ResultBanner view={viewOf(revealed(), 'p1')} conn={conn()} />);
    expect(screen.getByText('esperando o host…')).toBeTruthy();
  });

  it('"ver a mesa" esconde o banner e a pílula traz de volta (também pra quem não é host)', () => {
    for (const who of ['p0', 'p1']) {
      const { container, unmount } = render(<ResultBanner view={viewOf(revealed(), who)} conn={conn()} />);
      const title = screen.getByRole('dialog').getAttribute('aria-label')!;
      fireEvent.click(screen.getByRole('button', { name: 'ver a mesa' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(container.querySelector('.veil')).toBeNull();
      expect(container.querySelector('canvas.confetti')).toBeNull();
      const pill = screen.getByRole('button', { name: `${title} · ver resultado` });
      fireEvent.click(pill);
      expect(screen.getByRole('dialog')).toBeTruthy();
      expect(screen.queryByRole('button', { name: `${title} · ver resultado` })).toBeNull();
      unmount();
    }
  });
});
