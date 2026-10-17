import { createRef } from 'react';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MASTER_VOLUME, installAudioUnlock, playPicturesSound, resetPicturesSounds, type PicturesSound } from '../src/games/pictures/sounds';
import { usePicturesSounds } from '../src/games/pictures/useButtonSounds';
import { saveSoundPref } from '../src/net/identity';

const NOMES: PicturesSound[] = ['tape', 'peel', 'shutter', 'plim', 'ready', 'tick', 'round', 'error', 'win', 'click'];

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

describe('sons do Retratim', () => {
  let desinstala: () => void;
  beforeEach(() => {
    resetPicturesSounds();
    localStorage.clear();
    desinstala = installAudioUnlock();
  });
  afterEach(() => {
    desinstala();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('o volume geral é 0,35 e todo som liga na saída só por esse ganho', () => {
    const made = fakeAudio();
    gesto();
    playPicturesSound('error'); // tom + ruído
    expect(MASTER_VOLUME).toBe(0.35);
    expect(made.gainValues).toContain(0.35);
    expect(made.toDestination).toBe(1);
  });

  it('com o som desligado nada cria AudioContext, nem no gesto', () => {
    const made = fakeAudio();
    saveSoundPref(false);
    gesto();
    for (const nome of NOMES) playPicturesSound(nome);
    expect(made.ctx).toBe(0);
    expect(made.osc).toBe(0);
  });

  it('ligar o som depois do gesto já funciona (o gesto vale)', () => {
    const made = fakeAudio();
    saveSoundPref(false);
    gesto();
    saveSoundPref(true);
    playPicturesSound('plim');
    expect(made.ctx).toBe(1);
    expect(made.osc).toBeGreaterThan(0);
  });

  it('antes de qualquer gesto não cria AudioContext; o gesto cria e acorda o contexto', () => {
    const made = fakeAudio();
    playPicturesSound('round');
    expect(made.ctx).toBe(0);
    gesto();
    expect(made.ctx).toBe(1);
    playPicturesSound('round');
    expect(made.ctx).toBe(1); // reaproveita
    expect(made.osc).toBeGreaterThan(0);
  });

  it('teclado e toque também liberam o áudio; desinstalar tira os ouvintes', () => {
    const made = fakeAudio();
    document.dispatchEvent(new Event('keydown'));
    expect(made.ctx).toBe(1);
    resetPicturesSounds();
    desinstala();
    gesto();
    expect(made.ctx).toBe(1);
  });

  it.each(NOMES)('"%s" toca sem lançar erro (e faz barulho)', (nome) => {
    const made = fakeAudio();
    gesto();
    expect(() => playPicturesSound(nome)).not.toThrow();
    expect(made.osc + made.noise).toBeGreaterThan(0);
  });

  it('sem AudioContext (navegador velho), resume rejeitado e erro do Web Audio são engolidos', async () => {
    vi.stubGlobal('AudioContext', undefined);
    gesto();
    for (const nome of NOMES) expect(() => playPicturesSound(nome)).not.toThrow();

    resetPicturesSounds();
    fakeAudio(() => Promise.reject(new Error('sem gesto')));
    gesto();
    expect(() => playPicturesSound('win')).not.toThrow();
    await Promise.resolve();

    resetPicturesSounds();
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          throw new Error('quebrado');
        }
      },
    );
    gesto();
    expect(() => playPicturesSound('error')).not.toThrow();
  });

});

describe('botões do Retratim (usePicturesSounds)', () => {
  beforeEach(() => {
    resetPicturesSounds();
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function Area({ extra }: { extra?: string }) {
    const ref = createRef<HTMLDivElement>();
    usePicturesSounds(ref);
    return (
      <div ref={ref} data-button-sounds="">
        <button type="button">oi</button>
        <button type="button" data-sound="none">
          mudo
        </button>
        {extra}
      </div>
    );
  }

  it('botão dentro da área soa o clique do Retratim, no volume geral; data-sound="none" fica mudo', () => {
    const made = fakeAudio();
    const { getByText, unmount } = render(<Area />);
    getByText('oi').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(made.ctx).toBe(0); // clicar por clique sintético não é gesto: nada de AudioContext
    document.dispatchEvent(new Event('pointerdown'));
    expect(made.ctx).toBe(1);
    const antes = made.osc;
    getByText('oi').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(made.osc).toBe(antes + 1);
    getByText('mudo').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(made.osc).toBe(antes + 1);
    unmount();
    expect(made.osc).toBe(antes + 1);
  });
});
