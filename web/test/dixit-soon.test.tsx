import { fireEvent, render, screen } from '@testing-library/react';
import { createRoom, roomView } from '@cartolina/shared';
import { describe, expect, it, vi } from 'vitest';
import type { ConnSnapshot, GameConn } from '../src/net/connection';
import { Game } from '../src/screens/Game';

function fakeConn(): GameConn {
  return {
    sendAction: vi.fn(),
    sendActivity: vi.fn(),
    sendCursor: vi.fn(),
    sendPing: vi.fn(),
    onFx: vi.fn(() => () => {}),
    onError: vi.fn(() => () => {}),
  };
}

describe('Game (sala de Diquisti)', () => {
  it('mostra "em breve" com o logo e um jeito de voltar pro início', () => {
    const view = roomView(createRoom('ABCD', 0, null, 'dixit'), null);
    const snap: ConnSnapshot = { status: 'joined', playerId: null, view, joinError: null };
    window.location.hash = '#/sala/ABCD';
    render(<Game conn={fakeConn()} snap={snap} view={view} />);
    expect(screen.getByText('a mesa do Diquisti está sendo montada')).toBeTruthy();
    expect(document.querySelector('h1.logo')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'voltar pro início' }));
    expect(window.location.hash).toBe('#/');
  });
});
