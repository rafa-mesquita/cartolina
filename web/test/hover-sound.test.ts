import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HOVER_GAIN, HOVER_GAP_MS, playHover, resetHover } from '../src/brand/hoverSound';

describe('som ao passar o mouse numa capa', () => {
  const play = vi.fn();
  beforeEach(() => {
    play.mockClear();
    resetHover();
  });

  it('toca o som de hover (mesmo áudio do "pick") com a metade do volume', () => {
    playHover(1000, play);
    expect(HOVER_GAIN).toBe(0.5);
    expect(play).toHaveBeenCalledWith('hover', 0, 1000, 0.5);
  });

  it('varrer as capas não gagueja: no máximo um som a cada 150 ms', () => {
    expect(HOVER_GAP_MS).toBe(150);
    playHover(1000, play);
    playHover(1100, play); // engolido
    playHover(1149, play); // engolido
    playHover(1150, play);
    expect(play).toHaveBeenCalledTimes(2);
  });
});
