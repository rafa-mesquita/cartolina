import { PLAYER_COLORS } from '@cartolina/shared';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LANDSCAPE_PHONE_QUERY, PHONE_LAYOUT_QUERY } from '../src/lib/device';
import { getRoomInfo } from '../src/net/api';
import type { SocketLike } from '../src/net/connection';
import { JoinForm } from '../src/screens/JoinForm';
import { RoomScreen } from '../src/screens/RoomScreen';

vi.mock('../src/net/api', () => ({ getRoomInfo: vi.fn(), createRoom: vi.fn() }));

/** Socket que nunca abre: as telas aqui não chegam a conectar. */
const idleSocket = (): SocketLike => ({
  readyState: 0,
  send: () => {},
  close: () => {},
  onopen: null,
  onmessage: null,
  onclose: null,
});

function media(matching: string[]) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: matching.includes(query), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
}

describe('telas de entrada no celular', () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    vi.mocked(getRoomInfo).mockReset();
    window.location.hash = '';
  });

  it('formulário de entrar: um botão de personagem por cor, nome e "entrar"', () => {
    media([PHONE_LAYOUT_QUERY]);
    render(<JoinForm takenColors={[]} initial={null} busy={false} error={null} onSubmit={() => {}} />);
    const swatches = document.querySelectorAll('button.swatch');
    expect(swatches.length).toBe(PLAYER_COLORS.length);
    expect(screen.getByLabelText('seu nome')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'entrar' })).toBeTruthy();
  });

  it('sala de DITU com o celular deitado: aviso pra virar em pé', async () => {
    media([PHONE_LAYOUT_QUERY, LANDSCAPE_PHONE_QUERY]);
    vi.mocked(getRoomInfo).mockResolvedValue({ exists: true, game: 'ito', phase: 'lobby', seats: [] });
    render(<RoomScreen code="ABCD" createSocket={idleSocket} />);
    expect(await screen.findByLabelText('seu nome')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('vira o celular em pé');
  });

  it('sala de DITU com o celular em pé: sem aviso', async () => {
    media([PHONE_LAYOUT_QUERY]);
    vi.mocked(getRoomInfo).mockResolvedValue({ exists: true, game: 'ito', phase: 'lobby', seats: [] });
    render(<RoomScreen code="ABCD" createSocket={idleSocket} />);
    expect(await screen.findByLabelText('seu nome')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
