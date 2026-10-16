import { afterEach, describe, expect, it, vi } from 'vitest';
import { playSound, type SoundName } from '../src/brand/sounds';
import { playDixitSound } from '../src/games/dixit/sounds';

vi.mock('../src/brand/sounds', () => ({ playSound: vi.fn() }));

describe('sons do Diquisti (tabela de volumes)', () => {
  afterEach(() => vi.clearAllMocks());

  const CASOS: [SoundName, number][] = [
    ['land', 0.45],
    ['pick', 0.45],
    ['card', 0.45],
    ['error', 0.3],
    ['flip', 0.35],
    ['click', 0.5],
    ['win', 0.5],
  ];

  it.each(CASOS)('%s toca com ganho %s', (nome, ganho) => {
    playDixitSound(nome, 2, 123);
    expect(playSound).toHaveBeenCalledExactlyOnceWith(nome, 2, 123, ganho);
  });

  it('sem argumentos extras, índice 0 e relógio do navegador', () => {
    playDixitSound('land');
    expect(playSound).toHaveBeenCalledWith('land', 0, expect.any(Number), 0.45);
  });
});
