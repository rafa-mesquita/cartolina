import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MANDACARU_SOUNDS,
  MASTER_VOLUME,
  installMandacaruAudioUnlock,
  playMandacaruSound,
  resetMandacaruSounds,
} from '../src/games/mandacaru/sounds';
import { saveSoundPref } from '../src/net/identity';

/** AudioContext mínimo: conta o que foi criado e anota os ganhos escritos em `gain.value`. */
function fakeAudio() {
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
  const destination = {};
  const made = { ctx: 0, osc: 0, noise: 0, gainValues: [] as number[], toDestination: 0 };
  const node = <T extends object>(extra: T) => ({
    ...extra,
    connect: (x: unknown) => {
      if (x === destination) made.toDestination++;
      return x;
    },
    start: vi.fn(),
    stop: vi.fn(),
  });
  class FakeCtx {
    currentTime = 0;
    sampleRate = 8000;
    destination = destination;
    resume = vi.fn(() => Promise.resolve());
    constructor() {
      made.ctx++;
    }
    createOscillator() {
      made.osc++;
      return node({ type: '', frequency: param() });
    }
    createGain() {
      const gain = param();
      Object.defineProperty(gain, 'value', { get: () => 0, set: (v: number) => made.gainValues.push(v) });
      return node({ gain });
    }
    createBiquadFilter() {
      return node({ type: '', frequency: param(), Q: { value: 0 } });
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

/** Um gesto qualquer do usuário (libera o áudio). */
const gesto = () => document.dispatchEvent(new Event('pointerdown'));

describe('sons do Mandacaru', () => {
  let desinstala: () => void;
  beforeEach(() => {
    resetMandacaruSounds();
    localStorage.clear();
    desinstala = installMandacaruAudioUnlock();
  });
  afterEach(() => {
    desinstala();
    vi.unstubAllGlobals();
  });

  it('tem os 7 sons do plano, num ganho geral de 0,18', () => {
    expect([...MANDACARU_SOUNDS].sort()).toEqual(['build', 'card', 'carcara', 'dice', 'error', 'turn', 'win'].sort());
    const made = fakeAudio();
    gesto();
    playMandacaruSound('dice');
    expect(MASTER_VOLUME).toBe(0.18);
    expect(made.gainValues).toContain(0.18);
    expect(made.toDestination).toBe(1);
  });

  it('antes do gesto e com o som desligado, nada de AudioContext', () => {
    const made = fakeAudio();
    playMandacaruSound('turn');
    expect(made.ctx).toBe(0);
    saveSoundPref(false);
    gesto();
    for (const s of MANDACARU_SOUNDS) playMandacaruSound(s);
    expect(made.ctx).toBe(0);
  });

  it.each([...MANDACARU_SOUNDS])('"%s" toca sem lançar erro (e faz barulho)', (nome) => {
    const made = fakeAudio();
    gesto();
    expect(() => playMandacaruSound(nome)).not.toThrow();
    expect(made.osc + made.noise).toBeGreaterThan(0);
  });

  it('o pio do Carcará: três gritos com tremido (cada um com o oscilador do tremido) e um chiado', () => {
    const made = fakeAudio();
    gesto();
    playMandacaruSound('carcara');
    expect(made.osc).toBe(6);
    expect(made.noise).toBe(3);
  });

  it('o chamado da vez: três notas de pífano (corpo, brilho e tremido em cada)', () => {
    const made = fakeAudio();
    gesto();
    playMandacaruSound('turn');
    expect(made.osc).toBe(9);
  });

  it('sem Web Audio, segue em silêncio', () => {
    vi.stubGlobal('AudioContext', undefined);
    gesto();
    for (const s of MANDACARU_SOUNDS) expect(() => playMandacaruSound(s)).not.toThrow();
  });
});
