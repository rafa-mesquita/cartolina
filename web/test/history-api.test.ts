import { describe, expect, it, vi } from 'vitest';
import { createRoom, getHistory } from '../src/net/api';

const fakeFetch = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('api de salas e histórico', () => {
  it('createRoom manda o jogo', async () => {
    const f = fakeFetch(201, { code: 'KXQ7' });
    await expect(createRoom('dixit', f, 'http://s')).resolves.toBe('KXQ7');
    expect(f).toHaveBeenCalledWith(
      'http://s/rooms',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ game: 'dixit' }) }),
    );
  });

  it('getHistory pagina com before; 404 (jogo sem histórico) vira null', async () => {
    const f = fakeFetch(200, { game: 'ito', rounds: [], stats: null, nextBefore: null });
    await getHistory('ito', 123, f, 'http://s');
    expect(f).toHaveBeenCalledWith('http://s/history/ito?before=123');
    await expect(getHistory('dixit', null, fakeFetch(404, { error: 'no_history' }), 'http://s')).resolves.toBeNull();
    await expect(getHistory('ito', null, fakeFetch(500, {}), 'http://s')).rejects.toThrow('history_failed_500');
  });

  it('getHistory sem before não manda query', async () => {
    const f = fakeFetch(200, { game: 'ito', rounds: [], stats: null, nextBefore: null });
    await getHistory('ito', null, f, 'http://s');
    expect(f).toHaveBeenCalledWith('http://s/history/ito');
  });
});
