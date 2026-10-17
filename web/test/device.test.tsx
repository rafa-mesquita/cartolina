import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LANDSCAPE_PHONE_QUERY, PHONE_LAYOUT_QUERY, useIsLandscapePhone, useLayout } from '../src/lib/device';
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
