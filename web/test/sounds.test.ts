import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { playSound, resetSounds, type SoundName } from '../src/brand/sounds';
import { saveSoundPref } from '../src/net/identity';

describe('sons de arquivo (carta)', () => {
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

  it('toca o arquivo da carta, relativo à base do site', () => {
    playSound('card', 0, 0);
    expect(played()).toHaveLength(1);
    expect(played()[0]!.src).toMatch(/sounds\/card\.mp3$/);
  });

  it('cartas seguidas não se cortam (elementos diferentes) e respeitam o intervalo mínimo', () => {
    playSound('card', 0, 0);
    playSound('card', 0, 50); // dentro de 80 ms: ignorado
    playSound('card', 0, 100);
    playSound('card', 0, 200);
    expect(played()).toHaveLength(3);
    expect(new Set(played()).size).toBe(3);
    expect(played().every((a) => a.currentTime === 0)).toBe(true);
  });

  it('mudo não toca nada', () => {
    saveSoundPref(false);
    playSound('card', 0, 0);
    expect(play).not.toHaveBeenCalled();
  });

  it('autoplay bloqueado (promessa rejeitada) não vaza erro', async () => {
    play.mockImplementation(() => Promise.reject(new DOMException('bloqueado', 'NotAllowedError')));
    expect(() => playSound('card', 0, 0)).not.toThrow();
    await Promise.resolve();
    play.mockImplementation(() => {
      throw new Error('sem suporte');
    });
    expect(() => playSound('card', 0, 1000)).not.toThrow();
  });
});

describe('sons sintetizados (revelação)', () => {
  const SYNTH: SoundName[] = ['flip', 'error', 'win', 'lose'];

  /** AudioContext mínimo: conta osciladores e ruídos criados. */
  function fakeAudio(resume: () => Promise<void> = () => Promise.resolve()) {
    const param = () => ({ value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
    const node = <T extends object>(extra: T) => ({ ...extra, connect: (x: unknown) => x, start: vi.fn(), stop: vi.fn() });
    const made = { ctx: 0, osc: 0, noise: 0, freqs: [] as number[] };
    class FakeCtx {
      currentTime = 0;
      sampleRate = 8000;
      destination = {};
      resume = vi.fn(resume);
      constructor() {
        made.ctx++;
      }
      createOscillator() {
        made.osc++;
        const frequency = param();
        frequency.setValueAtTime.mockImplementation((f: number) => made.freqs.push(f));
        return node({ type: '', frequency });
      }
      createGain() {
        return node({ gain: param() });
      }
      createBiquadFilter() {
        return node({ type: '', frequency: { value: 0 }, Q: { value: 0 } });
      }
      createBuffer(_ch: number, len: number) {
        const data = new Float32Array(len);
        return { getChannelData: () => data };
      }
      createBufferSource() {
        made.noise++;
        return node({ buffer: null });
      }
    }
    vi.stubGlobal('AudioContext', FakeCtx);
    return made;
  }

  beforeEach(() => resetSounds());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sem AudioContext (jsdom, navegador velho) nenhum som sintetizado quebra', () => {
    for (const name of SYNTH) expect(() => playSound(name, 3)).not.toThrow();
  });

  it('cria o AudioContext só no primeiro som e reaproveita', () => {
    const made = fakeAudio();
    expect(made.ctx).toBe(0);
    playSound('flip', 0);
    playSound('win');
    expect(made.ctx).toBe(1);
    expect(made.osc).toBeGreaterThan(4);
  });

  it('tic sobe de tom com o índice da carta', () => {
    const made = fakeAudio();
    playSound('flip', 0);
    const first = made.freqs[0]!;
    made.freqs.length = 0;
    playSound('flip', 4);
    expect(made.freqs[0]!).toBeGreaterThan(first);
  });

  it('mudo não cria nem toca nada', () => {
    const made = fakeAudio();
    saveSoundPref(false);
    for (const name of SYNTH) playSound(name, 1);
    expect(made.ctx).toBe(0);
    expect(made.osc).toBe(0);
  });

  it('resume rejeitado e erro do Web Audio são engolidos', async () => {
    const made = fakeAudio(() => Promise.reject(new Error('sem gesto')));
    expect(() => playSound('error')).not.toThrow();
    await Promise.resolve();
    expect(made.noise).toBeGreaterThan(0);
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          throw new Error('quebrado');
        }
      },
    );
    resetSounds();
    expect(() => playSound('lose')).not.toThrow();
  });
});
