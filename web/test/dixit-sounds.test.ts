import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { playSound, resetSounds } from '../src/brand/sounds';
import { playDixitSound } from '../src/games/dixit/sounds';

describe('sons do Diquisti (mais baixos que os do DITU)', () => {
  let play: Mock<() => Promise<void>>;

  beforeEach(() => {
    resetSounds();
    play = vi.fn(() => Promise.resolve());
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const played = () => play.mock.contexts as HTMLAudioElement[];

  it('carta pousando (land) toca a 45% do volume pedido', () => {
    playDixitSound('land', 0, 0);
    expect(played()).toHaveLength(1);
    expect(played()[0]!.volume).toBeCloseTo(0.18);
  });

  it('land e depois pick em 10 ms tocam os dois, com os volumes do Diquisti', () => {
    playDixitSound('land', 0, 0);
    playDixitSound('pick', 0, 10);
    expect(played()).toHaveLength(2);
    expect(played().map((a) => a.volume)).toEqual([expect.closeTo(0.18), expect.closeTo(0.315)]);
  });

  it('o DITU não muda: playSound sem ganho segue a volume cheio', () => {
    playSound('card', 0, 0);
    expect(played()[0]!.volume).toBe(1);
  });

  it('sons sintetizados passam por um ganho próprio (metade do volume), sem tocar direto no destino', () => {
    const gains: number[] = [];
    const destination = {};
    const connected: unknown[] = [];
    const param = () => ({ value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
    const node = <T extends object>(extra: T) => {
      const n: Record<string, unknown> = { ...extra, start: vi.fn(), stop: vi.fn() };
      n.connect = (x: unknown) => {
        connected.push(x);
        return x;
      };
      return n;
    };
    class FakeCtx {
      currentTime = 0;
      sampleRate = 8000;
      destination = destination;
      resume = vi.fn(() => Promise.resolve());
      createOscillator() {
        return node({ type: '', frequency: param() });
      }
      createGain() {
        const gain = param();
        const n = node({ gain });
        // anota o valor que escreverem em gain.value (o ganho geral do Diquisti)
        Object.defineProperty(gain, 'value', {
          get: () => 0,
          set: (v: number) => gains.push(v),
        });
        return n;
      }
      createBiquadFilter() {
        return node({ type: '', frequency: { value: 0 }, Q: { value: 0 } });
      }
      createBuffer(_ch: number, len: number) {
        const data = new Float32Array(len);
        return { getChannelData: () => data };
      }
      createBufferSource() {
        return node({ buffer: null });
      }
    }
    vi.stubGlobal('AudioContext', FakeCtx);

    playDixitSound('click');

    // o ganho geral do Diquisti (0,5) existe e só ele liga no destino
    expect(gains).toContain(0.5);
    expect(connected.filter((x) => x === destination)).toHaveLength(1);
  });
});
