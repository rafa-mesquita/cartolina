import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { GameConn } from '../src/net/connection';
import { PLAYER_COLORS } from '@cartolina/shared';
import { Avatar } from '../src/screens/Avatar';
import { JoinForm } from '../src/screens/JoinForm';
import { Lobby } from '../src/screens/Lobby';
import { makeRoom, viewOf } from './fixtures';

function fakeConn(): GameConn & { sendAction: Mock<GameConn['sendAction']> } {
  return {
    sendAction: vi.fn<GameConn['sendAction']>(),
    sendActivity: vi.fn(),
    sendCursor: vi.fn(),
    sendPing: vi.fn(),
    onFx: vi.fn(() => () => {}),
    onError: vi.fn(() => () => {}),
  };
}

describe('JoinForm', () => {
  it('desabilita cores ocupadas e exige nome', () => {
    const onSubmit = vi.fn();
    render(<JoinForm takenColors={['#8EC5FF']} initial={null} busy={false} error={null} onSubmit={onSubmit} />);
    expect((screen.getByRole('button', { name: 'cavaleiro' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'entrar' }));
    expect(screen.getByText('Escolha um nome de 1 a 16 letras.')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('envia nome limpo e a cor escolhida', () => {
    const onSubmit = vi.fn();
    render(<JoinForm takenColors={[]} initial={null} busy={false} error={null} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText('seu nome'), { target: { value: '  Ana  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'porquinho' }));
    fireEvent.click(screen.getByRole('button', { name: 'entrar' }));
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Ana', color: '#FF8FAB' });
  });

  it('mostra o erro vindo do servidor', () => {
    render(<JoinForm takenColors={[]} initial={null} busy={false} error="color_taken" onSubmit={() => {}} />);
    expect(screen.getByText('Esse personagem já foi escolhido.')).toBeTruthy();
  });
});

describe('JoinForm (cor ocupada depois)', () => {
  it('troca a cor selecionada pela primeira livre quando alguém a pega', () => {
    const props = { initial: null, busy: false, error: null, onSubmit: () => {} };
    const { rerender } = render(<JoinForm takenColors={[]} {...props} />);
    expect(screen.getByRole('button', { name: 'cavaleiro' }).getAttribute('aria-pressed')).toBe('true');
    rerender(<JoinForm takenColors={['#8EC5FF']} {...props} />);
    expect(screen.getByRole('button', { name: 'cavaleiro' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'porquinho' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('erros são anunciados (role=alert)', () => {
    render(<JoinForm takenColors={[]} initial={null} busy={false} error="room_full" onSubmit={() => {}} />);
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});

describe('Lobby', () => {
  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
  });

  it('modo atual fica marcado com aria-pressed', () => {
    render(<Lobby view={viewOf(makeRoom(2), 'p0')} conn={fakeConn()} />);
    expect(screen.getByRole('button', { name: /livre/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /campanha/ }).getAttribute('aria-pressed')).toBe('false');
  });

  it('copiar link mostra "link copiado!" por 2 s', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<Lobby view={viewOf(makeRoom(2), 'p0')} conn={fakeConn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'copiar link da sala' }));
    });
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('#/sala/ABCD'));
    expect(screen.getByRole('button', { name: 'link copiado!' })).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(2100);
    });
    expect(screen.getByRole('button', { name: 'copiar link da sala' })).toBeTruthy();
  });

  it('sem clipboard (ou recusado) mostra o link num campo selecionável', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    render(<Lobby view={viewOf(makeRoom(2), 'p0')} conn={fakeConn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'copiar link da sala' }));
    });
    const input = screen.getByLabelText('link da sala') as HTMLInputElement;
    expect(input.readOnly).toBe(true);
    expect(input.value).toContain('#/sala/ABCD');

    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(async () => { throw new Error('denied'); }) }, configurable: true });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'copiar link da sala' }));
    });
    expect(screen.getByLabelText('link da sala')).toBeTruthy();
  });

  it('campo do link seleciona o texto uma vez ao aparecer, não a cada render', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    const select = vi.spyOn(HTMLInputElement.prototype, 'select');
    const { rerender } = render(<Lobby view={viewOf(makeRoom(2), 'p0')} conn={fakeConn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'copiar link da sala' }));
    });
    expect(select).toHaveBeenCalledTimes(1);
    rerender(<Lobby view={viewOf(makeRoom(3), 'p0')} conn={fakeConn()} />);
    expect(select).toHaveBeenCalledTimes(1);
    fireEvent.focus(screen.getByLabelText('link da sala'));
    expect(select).toHaveBeenCalledTimes(2);
    select.mockRestore();
  });

  it('host escolhe o modo e começa', () => {
    const conn = fakeConn();
    render(<Lobby view={viewOf(makeRoom(2), 'p0')} conn={conn} />);
    fireEvent.click(screen.getByRole('button', { name: /campanha/ }));
    expect(conn.sendAction).toHaveBeenCalledWith({ type: 'setMode', mode: 'campanha' });
    fireEvent.click(screen.getByRole('button', { name: 'começar' }));
    expect(conn.sendAction).toHaveBeenCalledWith({ type: 'start' });
  });

  it('host sozinho não consegue começar', () => {
    render(<Lobby view={viewOf(makeRoom(1), 'p0')} conn={fakeConn()} />);
    expect((screen.getByRole('button', { name: 'começar' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('quem não é host espera', () => {
    render(<Lobby view={viewOf(makeRoom(2), 'p1')} conn={fakeConn()} />);
    expect(screen.queryByRole('button', { name: 'começar' })).toBeNull();
    expect(screen.getByText('esperando o host começar…')).toBeTruthy();
  });
});

describe('personagens', () => {
  it('Avatar desenha o personagem (svg) e não mostra a inicial', () => {
    const { container } = render(<Avatar color='#C9E27A' anchor='p0' />);
    const box = container.querySelector('.avatar')!;
    expect(box.querySelector('svg')).toBeTruthy();
    expect(box.textContent).toBe('');
    expect(box.getAttribute('data-seat-anchor')).toBe('p0');
    // o nome do personagem não aparece na tela
    expect(container.textContent).not.toContain('sapo');
  });

  it('JoinForm: um botão por personagem, rotulado pelo nome do bicho', () => {
    render(<JoinForm takenColors={['#C9E27A']} initial={null} busy={false} error={null} onSubmit={() => {}} />);
    const names = ['cavaleiro', 'porquinho', 'dinossauro', 'polvo', 'pintinho', 'raposa', 'robô', 'gatinho', 'sapo', 'urso'];
    expect(names).toHaveLength(PLAYER_COLORS.length);
    for (const n of names) expect(screen.getByRole('button', { name: n }).querySelector('svg')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'sapo' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText('sapo')).toBeNull();
  });
});
