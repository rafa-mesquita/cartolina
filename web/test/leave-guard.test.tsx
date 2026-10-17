import { act, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LeaveGuard } from '../src/screens/LeaveGuard';

/** Simula o botão voltar: o navegador tira a entrada de cima e dispara `popstate` com o estado da de baixo. */
function pressBack() {
  act(() => {
    window.history.replaceState(null, '', window.location.href);
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
  });
}

describe('voltar dentro da sala', () => {
  beforeEach(() => window.history.replaceState(null, '', '/#/sala/ABCD'));
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('cria uma entrada extra no histórico (com a mesma URL) só uma vez, mesmo no StrictMode', () => {
    const before = window.history.length;
    render(
      <StrictMode>
        <LeaveGuard exitTo="#/ito" />
      </StrictMode>,
    );
    expect(window.history.length).toBe(before + 1);
    expect(window.location.hash).toBe('#/sala/ABCD');
  });

  it('voltar não sai: pergunta, e "ficar" fecha a pergunta e continua na sala', () => {
    render(<LeaveGuard exitTo="#/ito" />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    pressBack();
    expect(screen.getByRole('alertdialog', { name: 'sair da sala?' })).toBeTruthy();
    expect(window.location.hash).toBe('#/sala/ABCD');
    fireEvent.click(screen.getByRole('button', { name: 'ficar' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(window.location.hash).toBe('#/sala/ABCD');
  });

  it('"sair" leva pra página do jogo', () => {
    render(<LeaveGuard exitTo="#/ito" />);
    pressBack();
    fireEvent.click(screen.getByRole('button', { name: 'sair' }));
    expect(window.location.hash).toBe('#/ito');
  });

  it('Esc também fica', () => {
    render(<LeaveGuard exitTo="#/ito" />);
    pressBack();
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('mudar de URL (link do próprio site) não pergunta nada', () => {
    render(<LeaveGuard exitTo="#/ito" />);
    act(() => {
      window.history.replaceState(null, '', '/#/');
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    });
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
