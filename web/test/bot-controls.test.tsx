import { MAX_PLAYERS } from '@cartolina/shared';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const state = { bots: [] as { code: string }[], version: 0 };
  const emit = () => {
    state.version++;
    listeners.forEach((fn) => fn());
  };
  return { state, listeners, emit };
});

vi.mock('../src/dev/bots', () => ({
  subscribeBots: (fn: () => void) => {
    fake.listeners.add(fn);
    return () => fake.listeners.delete(fn);
  },
  botsVersion: () => fake.state.version,
  botsIn: (code: string) => fake.state.bots.filter((b) => b.code === code),
  addBot: vi.fn((code: string) => {
    fake.state.bots.push({ code });
    fake.emit();
  }),
  removeAllBots: vi.fn(() => {
    fake.state.bots = [];
    fake.emit();
  }),
}));

vi.mock('../src/dev/dixitBots', () => ({
  subscribeDixitBots: (fn: () => void) => {
    fake.listeners.add(fn);
    return () => fake.listeners.delete(fn);
  },
  dixitBotsVersion: () => fake.state.version,
  dixitBotsIn: (code: string) => fake.state.bots.filter((b) => b.code === code).length,
  addDixitBot: vi.fn((code: string) => {
    fake.state.bots.push({ code });
    fake.emit();
  }),
  removeAllDixitBots: vi.fn(() => {
    fake.state.bots = [];
    fake.emit();
  }),
}));

vi.mock('../src/dev/picturesBots', () => ({
  subscribePicturesBots: (fn: () => void) => {
    fake.listeners.add(fn);
    return () => fake.listeners.delete(fn);
  },
  picturesBotsVersion: () => fake.state.version,
  picturesBotsIn: (code: string) => fake.state.bots.filter((b) => b.code === code).length,
  addPicturesBot: vi.fn((code: string) => {
    fake.state.bots.push({ code });
    fake.emit();
  }),
  removeAllPicturesBots: vi.fn(() => {
    fake.state.bots = [];
    fake.emit();
  }),
}));

import BotControls from '../src/dev/BotControls';
import { addBot, removeAllBots } from '../src/dev/bots';
import { addDixitBot, removeAllDixitBots } from '../src/dev/dixitBots';
import { addPicturesBot, removeAllPicturesBots } from '../src/dev/picturesBots';
import { Lobby } from '../src/screens/Lobby';
import { makeRoom, viewOf } from './fixtures';

describe('BotControls (dev)', () => {
  afterEach(() => {
    fake.state.bots = [];
    vi.clearAllMocks();
  });

  it('adiciona bots e mostra "tirar bots" só quando existem', () => {
    render(<BotControls code="ABCD" seats={2} />);
    expect(screen.getByText('modo teste (só no localhost)')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /tirar bots/ })).toBeNull();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /adicionar bot/ }));
    });
    expect(addBot).toHaveBeenCalledWith('ABCD');
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /tirar bots/ }));
    });
    expect(removeAllBots).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /tirar bots/ })).toBeNull();
  });

  it('no Diquisti usa os bots do Diquisti, não os do DITU', () => {
    render(<BotControls code="ABCD" seats={2} game="dixit" />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /adicionar bot/ }));
    });
    expect(addDixitBot).toHaveBeenCalledWith('ABCD');
    expect(addBot).not.toHaveBeenCalled();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /tirar bots \(1\)/ }));
    });
    expect(removeAllDixitBots).toHaveBeenCalled();
    expect(removeAllBots).not.toHaveBeenCalled();
  });

  it('no Retratim usa os bots do Retratim, não os do DITU nem os do Diquisti', () => {
    render(<BotControls code="ABCD" seats={2} game="pictures" />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /adicionar bot/ }));
    });
    expect(addPicturesBot).toHaveBeenCalledWith('ABCD');
    expect(addBot).not.toHaveBeenCalled();
    expect(addDixitBot).not.toHaveBeenCalled();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /tirar bots \(1\)/ }));
    });
    expect(removeAllPicturesBots).toHaveBeenCalled();
    expect(removeAllBots).not.toHaveBeenCalled();
    expect(removeAllDixitBots).not.toHaveBeenCalled();
  });

  it('sala cheia desabilita "adicionar bot"', () => {
    render(<BotControls code="ABCD" seats={MAX_PLAYERS} />);
    expect((screen.getByRole('button', { name: /adicionar bot/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('o lobby carrega os controles em dev', async () => {
    const conn = { sendAction: vi.fn(), sendActivity: vi.fn(), sendCursor: vi.fn(), sendPing: vi.fn(), onFx: vi.fn(), onError: vi.fn() };
    render(<Lobby view={viewOf(makeRoom(2), 'p0')} conn={conn} />);
    expect(await screen.findByRole('button', { name: /adicionar bot/ })).toBeTruthy();
  });
});
