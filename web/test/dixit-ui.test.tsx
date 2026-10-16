import { act as rtlAct, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CardArt } from '../src/games/dixit/CardArt';
import { CardViewer } from '../src/games/dixit/CardViewer';

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
});

describe('carta ampliada', () => {
  it('Esc fecha; setas navegam; rodinha pra baixo fecha (não logo ao abrir)', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const onIndex = vi.fn();
    render(<CardViewer ids={['d001', 'd002']} index={0} label={(_id, i) => `carta ${i + 1}`} onIndex={onIndex} onClose={onClose} />);
    expect(screen.getByText('carta 1')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onIndex).toHaveBeenCalledWith(1);
    const dialog = screen.getByRole('dialog', { name: 'carta ampliada' });
    fireEvent.wheel(dialog, { deltaY: 100 });
    expect(onClose).not.toHaveBeenCalled();
    rtlAct(() => vi.advanceTimersByTime(400));
    fireEvent.wheel(dialog, { deltaY: 100 });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
