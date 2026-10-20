import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COUP_SOUNDS, MASTER_VOLUME, installAudioUnlock, playCoupSound, resetCoupSounds } from '../src/games/coup/sounds';
import { saveSoundPref } from '../src/net/identity';

/** AudioContext mínimo: conta o que foi criado e anota os ganhos escritos em `gain.value`. */
function fakeAudio(resume: () => Promise<void> = () => Promise.resolve()) {
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
    resume = vi.fn(resume);
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

describe('sons do Cúpi', () => {
  let desinstala: () => void;
  beforeEach(() => {
    resetCoupSounds();
    localStorage.clear();
    desinstala = installAudioUnlock();
  });
  afterEach(() => {
    desinstala();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('tem os 12 sons do plano', () => {
    expect([...COUP_SOUNDS].sort()).toEqual(
      ['bluff', 'challenge', 'click', 'coin', 'declare', 'end', 'error', 'lose', 'reveal', 'tick', 'turn', 'win'].sort(),
    );
  });

  it('o volume geral é 0,28 e todo som liga na saída só por esse ganho', () => {
    const made = fakeAudio();
    gesto();
    playCoupSound('error'); // tom + ruído
    expect(MASTER_VOLUME).toBe(0.28);
    expect(made.gainValues).toContain(0.28);
    expect(made.toDestination).toBe(1);
  });

  it('com o som desligado nada cria AudioContext, nem no gesto', () => {
    const made = fakeAudio();
    saveSoundPref(false);
    gesto();
    for (const nome of COUP_SOUNDS) playCoupSound(nome);
    expect(made.ctx).toBe(0);
    expect(made.osc).toBe(0);
  });

  it('ligar o som depois do gesto já funciona (o gesto vale)', () => {
    const made = fakeAudio();
    saveSoundPref(false);
    gesto();
    saveSoundPref(true);
    playCoupSound('coin');
    expect(made.ctx).toBe(1);
    expect(made.osc).toBeGreaterThan(0);
  });

  it('antes de qualquer gesto não cria AudioContext; o gesto cria e acorda o contexto', () => {
    const made = fakeAudio();
    playCoupSound('turn');
    expect(made.ctx).toBe(0);
    gesto();
    expect(made.ctx).toBe(1);
    playCoupSound('turn');
    expect(made.ctx).toBe(1); // reaproveita
    expect(made.osc).toBeGreaterThan(0);
  });

  it('teclado também libera o áudio; desinstalar tira os ouvintes', () => {
    const made = fakeAudio();
    document.dispatchEvent(new Event('keydown'));
    expect(made.ctx).toBe(1);
    resetCoupSounds();
    desinstala();
    gesto();
    expect(made.ctx).toBe(1);
  });

  it.each([...COUP_SOUNDS])('"%s" toca sem lançar erro (e faz barulho)', (nome) => {
    const made = fakeAudio();
    gesto();
    expect(() => playCoupSound(nome)).not.toThrow();
    expect(made.osc + made.noise).toBeGreaterThan(0);
  });

  it('sem AudioContext (navegador velho), resume rejeitado e erro do Web Audio são engolidos', async () => {
    vi.stubGlobal('AudioContext', undefined);
    gesto();
    for (const nome of COUP_SOUNDS) expect(() => playCoupSound(nome)).not.toThrow();

    resetCoupSounds();
    fakeAudio(() => Promise.reject(new Error('sem gesto')));
    gesto();
    expect(() => playCoupSound('win')).not.toThrow();
    await Promise.resolve();

    resetCoupSounds();
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          throw new Error('quebrado');
        }
      },
    );
    gesto();
    expect(() => playCoupSound('error')).not.toThrow();
  });
});
