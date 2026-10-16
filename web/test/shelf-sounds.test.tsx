import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetHover } from '../src/brand/hoverSound';
import { playSound } from '../src/brand/sounds';
import { Home } from '../src/screens/Home';

vi.mock('../src/brand/sounds', async (importOriginal) => ({ ...(await importOriginal<typeof import('../src/brand/sounds')>()), playSound: vi.fn() }));

describe('sons da estante', () => {
  beforeEach(() => {
    vi.mocked(playSound).mockClear();
    resetHover();
  });
  afterEach(() => {
    window.location.hash = '';
  });

  it('as capas pedem o som de carta no clique (links só soam com data-sound)', () => {
    render(<Home />);
    expect(screen.getByRole('link', { name: /DITU/ }).getAttribute('data-sound')).toBe('card');
    expect(screen.getByRole('link', { name: /Diquisti/ }).getAttribute('data-sound')).toBe('card');
  });

  it('passar o mouse numa capa toca o "pick" baixinho, uma vez por entrada', () => {
    render(<Home />);
    const ito = screen.getByRole('link', { name: /DITU/ });
    fireEvent.pointerEnter(ito);
    expect(playSound).toHaveBeenCalledTimes(1);
    expect(playSound).toHaveBeenCalledWith('pick', 0, expect.any(Number), 0.5);
  });

  it('varrer duas capas seguidas toca só um som', () => {
    render(<Home />);
    fireEvent.pointerEnter(screen.getByRole('link', { name: /DITU/ }));
    fireEvent.pointerEnter(screen.getByRole('link', { name: /Diquisti/ }));
    expect(playSound).toHaveBeenCalledTimes(1);
  });
});
