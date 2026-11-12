import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { phoneOrientationOf } from '../src/games/catalog';
import {
  LAND_LAYOUT_QUERY,
  LANDSCAPE_PHONE_QUERY,
  PHONE_LAYOUT_QUERY,
  PHONE_QUERY,
  useGameLayout,
  useIsLandscapePhone,
  useLayout,
} from '../src/lib/device';
import { RotateNotice } from '../src/screens/RotateNotice';

function media(matching: string[]) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: matching.includes(query), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
}

function LayoutProbe() {
  return <p>{useLayout()}</p>;
}
function GameLayoutProbe({ o }: { o: 'portrait' | 'landscape' }) {
  return <p>{useGameLayout(o)}</p>;
}
function LandscapeProbe() {
  return <p>{useIsLandscapePhone() ? 'deitado' : 'ok'}</p>;
}

describe('layout do celular', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('tela estreita é "phone"; o resto é "desktop"', () => {
    expect(PHONE_LAYOUT_QUERY).toBe('(max-width: 640px)');
    media([PHONE_LAYOUT_QUERY]);
    const { unmount } = render(<LayoutProbe />);
    expect(screen.getByText('phone')).toBeTruthy();
    unmount();
    media([]);
    render(<LayoutProbe />);
    expect(screen.getByText('desktop')).toBeTruthy();
  });

  it('sem matchMedia (navegador velho, jsdom): desktop', () => {
    vi.stubGlobal('matchMedia', undefined);
    render(<LayoutProbe />);
    expect(screen.getByText('desktop')).toBeTruthy();
  });

  it('celular deitado com tela baixa é detectado', () => {
    expect(LANDSCAPE_PHONE_QUERY).toBe('(pointer: coarse) and (orientation: landscape) and (max-height: 500px)');
    media([LANDSCAPE_PHONE_QUERY]);
    render(<LandscapeProbe />);
    expect(screen.getByText('deitado')).toBeTruthy();
  });

  it('teclado aberto com o celular em pé não conta como deitado (a tela fica baixa, mas a orientação é retrato)', () => {
    media([LANDSCAPE_PHONE_QUERY]);
    vi.stubGlobal('screen', { orientation: { type: 'portrait-primary', addEventListener: vi.fn(), removeEventListener: vi.fn() } });
    render(<LandscapeProbe />);
    expect(screen.getByText('ok')).toBeTruthy();
  });

  it('com a orientação da tela em paisagem, segue deitado', () => {
    media([LANDSCAPE_PHONE_QUERY]);
    vi.stubGlobal('screen', { orientation: { type: 'landscape-primary', addEventListener: vi.fn(), removeEventListener: vi.fn() } });
    render(<LandscapeProbe />);
    expect(screen.getByText('deitado')).toBeTruthy();
  });

  it('iPhone antigo sem screen.orientation: usa window.orientation (0 = em pé)', () => {
    media([LANDSCAPE_PHONE_QUERY]);
    vi.stubGlobal('screen', {});
    vi.stubGlobal('orientation', 0);
    const { unmount } = render(<LandscapeProbe />);
    expect(screen.getByText('ok')).toBeTruthy();
    unmount();
    vi.stubGlobal('orientation', 90);
    render(<LandscapeProbe />);
    expect(screen.getByText('deitado')).toBeTruthy();
  });

  it('jogo de celular deitado: "land" com a tela deitada e baixa; o jogo de jogar em pé segue o useLayout', () => {
    expect(LAND_LAYOUT_QUERY).toBe('(orientation: landscape) and (max-height: 500px)');
    media([LAND_LAYOUT_QUERY]);
    const a = render(<GameLayoutProbe o="landscape" />);
    expect(screen.getByText('land')).toBeTruthy();
    a.unmount();
    const b = render(<GameLayoutProbe o="portrait" />);
    expect(screen.getByText('desktop')).toBeTruthy();
    b.unmount();
    media([PHONE_LAYOUT_QUERY]);
    render(<GameLayoutProbe o="landscape" />);
    expect(screen.getByText('phone')).toBeTruthy();
  });

  it('teclado aberto com o celular em pé não vira mesa deitada', () => {
    media([LAND_LAYOUT_QUERY, PHONE_LAYOUT_QUERY]);
    vi.stubGlobal('screen', { orientation: { type: 'portrait-primary', addEventListener: vi.fn(), removeEventListener: vi.fn() } });
    render(<GameLayoutProbe o="landscape" />);
    expect(screen.getByText('phone')).toBeTruthy();
  });

  it('o Tatubum é de jogar deitado; os outros, em pé', () => {
    expect(phoneOrientationOf('kittens')).toBe('landscape');
    for (const g of ['ito', 'coup', 'dixit', 'pictures', 'nada']) expect(phoneOrientationOf(g)).toBe('portrait');
  });

  it('jogo de jogar deitado: em pé pede pra deitar; deitado e no computador, nada', () => {
    media([PHONE_QUERY, PHONE_LAYOUT_QUERY]);
    const a = render(<RotateNotice orientation="landscape" />);
    expect(screen.getByRole('alert').textContent).toContain('vira o celular deitado');
    a.unmount();
    media([LANDSCAPE_PHONE_QUERY, LAND_LAYOUT_QUERY, PHONE_QUERY]);
    const b = render(<RotateNotice orientation="landscape" />);
    expect(b.container.innerHTML).toBe('');
    b.unmount();
    // Janela estreita no computador (sem toque): não pede nada.
    media([PHONE_LAYOUT_QUERY]);
    const c = render(<RotateNotice orientation="landscape" />);
    expect(c.container.innerHTML).toBe('');
  });

  it('aviso de virar o celular só aparece deitado', () => {
    media([]);
    const { container, unmount } = render(<RotateNotice />);
    expect(container.innerHTML).toBe('');
    unmount();
    media([LANDSCAPE_PHONE_QUERY]);
    render(<RotateNotice />);
    expect(screen.getByRole('alert').textContent).toContain('vira o celular em pé');
  });
});
