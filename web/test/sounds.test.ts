import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { resetSounds, playSound } from '../src/brand/sounds';
import { saveSoundPref } from '../src/net/identity';

describe('sons', () => {
  let play: Mock<() => Promise<void>>;

  beforeEach(() => {
    resetSounds();
    play = vi.fn(() => Promise.resolve());
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const played = () => play.mock.contexts as HTMLAudioElement[];

  it('toca o arquivo certo, relativo à base do site', () => {
    playSound('reveal', 0);
    playSound('card', 0);
    expect(played()).toHaveLength(2);
    expect(played()[0]!.src).toMatch(/sounds\/reveal\.mp3$/);
    expect(played()[1]!.src).toMatch(/sounds\/card\.mp3$/);
  });

  it('cartas seguidas não se cortam (elementos diferentes) e respeitam o intervalo mínimo', () => {
    playSound('card', 0);
    playSound('card', 50); // dentro de 80 ms: ignorado
    playSound('card', 100);
    playSound('card', 200);
    expect(played()).toHaveLength(3);
    expect(new Set(played()).size).toBe(3);
    expect(played().every((a) => a.currentTime === 0)).toBe(true);
  });

  it('mudo não toca nada', () => {
    saveSoundPref(false);
    playSound('reveal', 0);
    playSound('card', 0);
    expect(play).not.toHaveBeenCalled();
  });

  it('autoplay bloqueado (promessa rejeitada) não vaza erro', async () => {
    play.mockImplementation(() => Promise.reject(new DOMException('bloqueado', 'NotAllowedError')));
    expect(() => playSound('reveal', 0)).not.toThrow();
    await Promise.resolve();
    play.mockImplementation(() => {
      throw new Error('sem suporte');
    });
    expect(() => playSound('card', 1000)).not.toThrow();
  });
});
