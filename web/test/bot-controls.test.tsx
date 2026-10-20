import { CAMELIO_MAX_PLAYERS, COUP_MAX_PLAYERS, MAX_PLAYERS } from '@cartolina/shared';
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

vi.mock('../src/dev/camelioBots', () => ({
  subscribeCamelioBots: (fn: () => void) => {
    fake.listeners.add(fn);
    return () => fake.listeners.delete(fn);
  },
  camelioBotsVersion: () => fake.state.version,
  camelioBotsIn: (code: string) => fake.state.bots.filter((b) => b.code === code).length,
  addCamelioBot: vi.fn((code: string) => {
    fake.state.bots.push({ code });
    fake.emit();
  }),
  removeAllCamelioBots: vi.fn(() => {
    fake.state.bots = [];
    fake.emit();
  }),
}));

vi.mock('../src/dev/coupBots', () => ({
  subscribeCoupBots: (fn: () => void) => {
    fake.listeners.add(fn);
    return () => fake.listeners.delete(fn);
  },
  coupBotsVersion: () => fake.state.version,
  coupBotsIn: (code: string) => fake.state.bots.filter((b) => b.code === code).length,
  addCoupBot: vi.fn((code: string) => {
    fake.state.bots.push({ code });
    fake.emit();
  }),
  removeAllCoupBots: vi.fn(() => {
    fake.state.bots = [];
    fake.emit();
  }),
}));

import BotControls from '../src/dev/BotControls';
import { addCoupBot, removeAllCoupBots } from '../src/dev/coupBots';
import { addBot, removeAllBots } from '../src/dev/bots';
import { addCamelioBot, removeAllCamelioBots } from '../src/dev/camelioBots';
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
    expect(screen.getByText(/^modo teste: os bots jogam daqui/)).toBeTruthy();
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

  it('no Cama-Leão usa os bots do Cama-Leão e o botão trava com 6 assentos', () => {
    const { rerender } = render(<BotControls code="ABCD" seats={2} game="camelio" />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /adicionar bot/ }));
    });
    expect(addCamelioBot).toHaveBeenCalledWith('ABCD');
    expect(addBot).not.toHaveBeenCalled();
    expect(addPicturesBot).not.toHaveBeenCalled();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /tirar bots \(1\)/ }));
    });
    expect(removeAllCamelioBots).toHaveBeenCalled();
    expect(removeAllBots).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: /adicionar bot/ }) as HTMLButtonElement).disabled).toBe(false);
    rerender(<BotControls code="ABCD" seats={CAMELIO_MAX_PLAYERS} game="camelio" />);
    expect((screen.getByRole('button', { name: /adicionar bot/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('no Cúpi usa os bots do Cúpi, e o teto é o de 6 pessoas do jogo', () => {
    const { unmount } = render(<BotControls code="ABCD" seats={5} game="coup" />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /adicionar bot/ }));
    });
    expect(addCoupBot).toHaveBeenCalledWith('ABCD');
    expect(addBot).not.toHaveBeenCalled();
    expect(addPicturesBot).not.toHaveBeenCalled();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /tirar bots \(1\)/ }));
    });
    expect(removeAllCoupBots).toHaveBeenCalled();
    expect(removeAllBots).not.toHaveBeenCalled();
    unmount();
    // com 6 pessoas o Cúpi está cheio, embora o teto geral seja maior
    render(<BotControls code="ABCD" seats={COUP_MAX_PLAYERS} game="coup" />);
    expect((screen.getByRole('button', { name: /adicionar bot/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('cada jogo tem o seu teto: 6 pessoas enchem o Retratim mas não o DITU', () => {
    const { unmount } = render(<BotControls code="ABCD" seats={6} game="ito" />);
    expect((screen.getByRole('button', { name: /adicionar bot/ }) as HTMLButtonElement).disabled).toBe(false);
    unmount();
    render(<BotControls code="ABCD" seats={6} game="pictures" />);
    expect((screen.getByRole('button', { name: /adicionar bot/ }) as HTMLButtonElement).disabled).toBe(true);
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
