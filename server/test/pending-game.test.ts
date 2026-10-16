import { describe, expect, it } from 'vitest';
import { pendingGame } from '../src/room-do';

describe('pendingGame', () => {
  it('pendente novo usa o jogo gravado; antigo (só groupId) é ITO', () => {
    expect(pendingGame({ game: 'dixit' })).toBe('dixit');
    expect(pendingGame({ game: 'ito' })).toBe('ito');
    expect(pendingGame({ groupId: 'g1' } as { game?: 'ito' })).toBe('ito');
  });
});
