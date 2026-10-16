import { act as rtlAct, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CardArt } from '../src/games/dixit/CardArt';
import { CardViewer } from '../src/games/dixit/CardViewer';

afterEach(() => {
  vi.useRealTimers();
});

describe('arte da carta', () => {
  it('mostra a imagem e, se ela falhar, volta para a pintura em SVG', () => {
    const { container } = render(<CardArt id="d001" />);
    const img = container.querySelector('img.dx-art');
    expect(img).toBeTruthy();
    expect(container.querySelector('svg')).toBeNull();
    fireEvent.error(img!);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.dx-art svg')).toBeTruthy();
  });

  it('a falha de uma carta não vaza para a próxima', () => {
    const { container, rerender } = render(<CardArt id="d001" />);
    fireEvent.error(container.querySelector('img.dx-art')!);
    expect(container.querySelector('img')).toBeNull();
    rerender(<CardArt id="d002" />);
    expect(container.querySelector('img.dx-art')).toBeTruthy();
  });
});

describe('carta ampliada', () => {
  const label = (_id: string, i: number) => `carta ${i + 1}`;

  it('abre com o foco no diálogo; setas navegam; Esc fecha; ao fechar o foco volta', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const onClose = vi.fn();
    const onIndex = vi.fn();
    const { unmount } = render(<CardViewer ids={['d001', 'd002']} index={0} label={label} onIndex={onIndex} onClose={onClose} />);
    const dialog = screen.getByRole('dialog', { name: 'carta 1' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(dialog);
    fireEvent.keyDown(dialog, { key: 'ArrowRight' });
    expect(onIndex).toHaveBeenLastCalledWith(1);
    fireEvent.keyDown(dialog, { key: 'ArrowLeft' });
    expect(onIndex).toHaveBeenLastCalledWith(1);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('teclas fora do diálogo (ex.: campo da dica) não trocam de carta', () => {
    const onIndex = vi.fn();
    render(<CardViewer ids={['d001', 'd002']} index={0} label={label} onIndex={onIndex} onClose={vi.fn()} />);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onIndex).not.toHaveBeenCalled();
  });

  it('sem cartas não desenha nada nem reage às setas', () => {
    const onIndex = vi.fn();
    const { container } = render(<CardViewer ids={[]} index={0} label={label} onIndex={onIndex} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onIndex).not.toHaveBeenCalled();
  });

  it('rodinha pra baixo fecha (não logo ao abrir)', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<CardViewer ids={['d001', 'd002']} index={0} label={label} onIndex={vi.fn()} onClose={onClose} />);
    const dialog = screen.getByRole('dialog');
    fireEvent.wheel(dialog, { deltaY: 100 });
    expect(onClose).not.toHaveBeenCalled();
    rtlAct(() => vi.advanceTimersByTime(400));
    fireEvent.wheel(dialog, { deltaY: 100 });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
