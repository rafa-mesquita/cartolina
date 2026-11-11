import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { mandacaruStateOf, type CordelKind, type MandacaruRoomView, type MandacaruState, type Resources, type Room } from '@cartolina/shared';
import { MandacaruTable } from '../src/games/mandacaru/MandacaruTable';
import type { ConnStatus, GameConn } from '../src/net/connection';
import { T0, afterSetup, mandacaruRoom, step, viewOf, withGame } from './mandacaru-fixtures';

vi.mock('../src/games/mandacaru/sounds', () => ({
  playMandacaruSound: vi.fn(),
  installMandacaruAudioUnlock: vi.fn(() => () => {}),
}));

type Conn = GameConn & { sendAction: Mock<GameConn['sendAction']> };
function conn(): Conn {
  return {
    sendAction: vi.fn<GameConn['sendAction']>(),
    sendActivity: vi.fn(),
    sendCursor: vi.fn(),
    sendPing: vi.fn(),
    onFx: vi.fn(() => () => {}),
    onError: vi.fn<GameConn['onError']>(() => () => {}),
  };
}
function mesa(view: MandacaruRoomView, c: Conn = conn(), status: ConnStatus = 'joined') {
  return render(<MandacaruTable view={view} conn={c} serverOffset={0} status={status} />);
}

const res = (wood: number, brick: number, leather: number, beans: number, stone: number): Resources => ({ wood, brick, leather, beans, stone });
const turnOf = (room: Room) => mandacaruStateOf(room)!.turn!;
const othersOf = (room: Room) => mandacaruStateOf(room)!.players.filter((p) => p !== turnOf(room));
const nameIn = (v: MandacaruRoomView, id: string) => v.seats.find((s) => s.id === id)!.name;
const btn = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;
const click = (name: string | RegExp, times = 1) => {
  for (let i = 0; i < times; i++) fireEvent.click(btn(name));
};

/** Fase principal de quem está na vez, com as mãos dadas (id → recursos) e o que mais precisar. */
function mainWith(room: Room, hands: Record<string, Resources>, edit: (s: MandacaruState) => MandacaruState = (s) => s): Room {
  return withGame(room, (s) => {
    const next = { ...s.hands };
    for (const [p, r] of Object.entries(hands)) next[p] = { ...next[p]!, res: r };
    return edit({ ...s, phase: 'main', rolled: true, hands: next });
  });
}
const withCordeis = (s: MandacaruState, p: string, kinds: CordelKind[]): MandacaruState => ({
  ...s,
  hands: { ...s.hands, [p]: { ...s.hands[p]!, cordeis: kinds.map((kind) => ({ kind, fresh: false })) } },
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('Mandacaru: troca', () => {
  it('quem está na vez monta a oferta e manda pra mesa', () => {
    const base = afterSetup(mandacaruRoom(3, 1));
    const turn = turnOf(base);
    const c = conn();
    mesa(viewOf(mainWith(base, { [turn]: res(3, 0, 0, 0, 0) }), turn), c);
    click(/trocar/);
    const dialog = screen.getByRole('dialog', { name: 'troca com a mesa' });
    expect(btn('mandar pra mesa').disabled).toBe(true);
    click('mais madeira que você dá', 2);
    click('mais pedra que você quer');
    // não dá mais do que tem; o recurso de um lado trava o outro
    click('mais madeira que você dá', 5);
    expect(within(dialog).getByText(/você dá 3 madeira e quer 1 pedra/)).toBeTruthy();
    expect(btn('mais madeira que você quer').disabled).toBe(true);
    expect(btn('mais pedra que você dá').disabled).toBe(true);
    click('mandar pra mesa');
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'offer', give: res(3, 0, 0, 0, 0), want: res(0, 0, 0, 0, 1) });
  });

  it('cliques seguidos na mesma passada não se apagam (dá e quer juntos)', () => {
    const base = afterSetup(mandacaruRoom(3, 1));
    const turn = turnOf(base);
    mesa(viewOf(mainWith(base, { [turn]: res(0, 0, 0, 1, 1) }), turn));
    click(/trocar/);
    act(() => {
      btn('mais pedra que você dá').click();
      btn('mais madeira que você quer').click();
    });
    expect(screen.getByText(/você dá 1 pedra e quer 1 madeira/)).toBeTruthy();
  });

  it('com a oferta aberta: as respostas, "fechar com" leva o id da oferta e "retirar" cancela', () => {
    const base = afterSetup(mandacaruRoom(3, 1));
    const turn = turnOf(base);
    const [a, b] = othersOf(base) as [string, string];
    const room = mainWith(base, { [turn]: res(2, 0, 0, 0, 0), [a]: res(0, 0, 0, 0, 1) }, (s) => ({
      ...s,
      tradeSeq: 5,
      offer: { id: 5, give: res(2, 0, 0, 0, 0), want: res(0, 0, 0, 0, 1), accepted: [a], rejected: [b] },
    }));
    const v = viewOf(room, turn);
    const c = conn();
    mesa(v, c);
    click(/trocar/);
    // o painel abre com a oferta que está na mesa
    expect(screen.getByText(/você dá 2 madeira e quer 1 pedra/)).toBeTruthy();
    expect(btn('trocar a oferta')).toBeTruthy();
    expect(screen.getByText('✗ não')).toBeTruthy();
    click(`fechar com ${nameIn(v, a)}`);
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'close_deal', with: a, source: 'offer', id: 5 });
  });

  it('"trocar a oferta" fica apagado com os mesmos números da oferta aberta', () => {
    const base = afterSetup(mandacaruRoom(3, 1));
    const turn = turnOf(base);
    const room = mainWith(base, { [turn]: res(2, 0, 0, 0, 0) }, (s) => ({
      ...s,
      tradeSeq: 5,
      offer: { id: 5, give: res(2, 0, 0, 0, 0), want: res(0, 0, 0, 0, 1), accepted: [], rejected: [] },
    }));
    const c = conn();
    mesa(viewOf(room, turn), c);
    click(/trocar/);
    expect(btn('trocar a oferta').disabled).toBe(true);
    click('trocar a oferta');
    expect(c.sendAction).not.toHaveBeenCalled();
    click('mais pedra que você quer');
    expect(btn('trocar a oferta').disabled).toBe(false);
    click('menos pedra que você quer');
    expect(btn('trocar a oferta').disabled).toBe(true);
  });

  it('troca fechada: a janela fecha e o aviso diz o que você deu', () => {
    const base = afterSetup(mandacaruRoom(3, 1));
    const turn = turnOf(base);
    const [a] = othersOf(base) as [string];
    const room = mainWith(base, { [turn]: res(2, 0, 0, 0, 0), [a]: res(0, 0, 0, 0, 1) }, (s) => ({
      ...s,
      tradeSeq: 5,
      offer: { id: 5, give: res(2, 0, 0, 0, 0), want: res(0, 0, 0, 0, 1), accepted: [a], rejected: [] },
    }));
    const v = viewOf(room, turn);
    const c = conn();
    const { rerender } = mesa(v, c);
    click(/trocar/);
    expect(screen.getByRole('dialog', { name: 'troca com a mesa' })).toBeTruthy();
    const after = step(room, turn, { type: 'close_deal', with: a, source: 'offer', id: 5 });
    rerender(<MandacaruTable view={viewOf(after, turn)} conn={c} serverOffset={0} status="joined" />);
    expect(screen.queryByRole('dialog', { name: 'troca com a mesa' })).toBeNull();
    expect(screen.getByRole('status').textContent).toContain(`troca feita com ${nameIn(v, a)}: você deu 2 madeira`);
  });

  it('propostas pra quem está na vez: "aceitar" fecha com o id da proposta', () => {
    const base = afterSetup(mandacaruRoom(3, 1));
    const turn = turnOf(base);
    const [a] = othersOf(base) as [string];
    const room = mainWith(base, { [turn]: res(0, 1, 0, 0, 0), [a]: res(0, 0, 0, 2, 0) }, (s) => ({
      ...s,
      tradeSeq: 9,
      proposals: [{ id: 9, from: a, give: res(0, 0, 0, 2, 0), want: res(0, 1, 0, 0, 0) }],
    }));
    const v = viewOf(room, turn);
    const c = conn();
    mesa(v, c);
    click('ver a troca');
    click(`aceitar a proposta de ${nameIn(v, a)}`);
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'close_deal', with: a, source: 'proposal', id: 9 });
  });

  it('os outros veem o cartão da oferta: aceito, não e contraproposta (invertida) viram respond e propose', () => {
    const base = afterSetup(mandacaruRoom(3, 1));
    const turn = turnOf(base);
    const [a] = othersOf(base) as [string];
    const room = mainWith(base, { [turn]: res(2, 0, 0, 0, 0), [a]: res(0, 0, 0, 0, 1) }, (s) => ({
      ...s,
      tradeSeq: 3,
      offer: { id: 3, give: res(2, 0, 0, 0, 0), want: res(0, 0, 0, 0, 1), accepted: [], rejected: [] },
    }));
    const v = viewOf(room, a);
    const c = conn();
    const { unmount } = mesa(v, c);
    expect(screen.getByText(`oferta de ${nameIn(v, turn)}`)).toBeTruthy();
    click('aceito');
    expect(c.sendAction).toHaveBeenLastCalledWith({ type: 'respond', offerId: 3, accept: true });
    unmount();
    const c2 = conn();
    mesa(v, c2);
    click('não');
    expect(c2.sendAction).toHaveBeenLastCalledWith({ type: 'respond', offerId: 3, accept: false });
  });

  it('contraproposta abre a troca invertida e manda propose', () => {
    const base = afterSetup(mandacaruRoom(3, 1));
    const turn = turnOf(base);
    const [a] = othersOf(base) as [string];
    const room = mainWith(base, { [turn]: res(2, 0, 0, 0, 0), [a]: res(0, 0, 0, 0, 1) }, (s) => ({
      ...s,
      tradeSeq: 3,
      offer: { id: 3, give: res(2, 0, 0, 0, 0), want: res(0, 0, 0, 0, 1), accepted: [], rejected: [] },
    }));
    const v = viewOf(room, a);
    const c = conn();
    mesa(v, c);
    click('contraproposta');
    expect(screen.getByRole('dialog', { name: `proposta pra ${nameIn(v, turn)}` })).toBeTruthy();
    // o cartão some enquanto a proposta está aberta
    expect(screen.queryByText(`oferta de ${nameIn(v, turn)}`)).toBeNull();
    click('menos madeira que você quer');
    click('mandar proposta');
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'propose', give: res(0, 0, 0, 0, 1), want: res(1, 0, 0, 0, 0) });
  });

  it('sem cartas pro que a oferta pede, "aceito" fica apagado', () => {
    const base = afterSetup(mandacaruRoom(3, 1));
    const turn = turnOf(base);
    const [a] = othersOf(base) as [string];
    const room = mainWith(base, { [turn]: res(2, 0, 0, 0, 0), [a]: res(0, 0, 0, 0, 0) }, (s) => ({
      ...s,
      offer: { id: 3, give: res(2, 0, 0, 0, 0), want: res(0, 0, 0, 0, 1), accepted: [], rejected: [] },
    }));
    mesa(viewOf(room, a));
    expect(btn('aceito').disabled).toBe(true);
    expect(screen.getByText(/não tem 1 pedra pra dar/)).toBeTruthy();
  });

  it('na vez dos outros, "propor" abre a proposta pra quem está jogando', () => {
    const base = afterSetup(mandacaruRoom(3, 1));
    const turn = turnOf(base);
    const [a] = othersOf(base) as [string];
    const v = viewOf(mainWith(base, { [a]: res(0, 0, 1, 0, 0) }), a);
    const c = conn();
    mesa(v, c);
    click(/propor/);
    click('mais couro que você dá');
    click('mais barro que você quer');
    click('mandar proposta');
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'propose', give: res(0, 0, 1, 0, 0), want: res(0, 1, 0, 0, 0) });
    expect(nameIn(v, turn)).toBeTruthy();
  });
});

describe('Mandacaru: feira', () => {
  it('feira manda give/want/count na taxa do can.feira', () => {
    const base = afterSetup(mandacaruRoom(3, 1));
    const turn = turnOf(base);
    const v = viewOf(mainWith(base, { [turn]: res(9, 0, 0, 0, 0) }), turn);
    const rate = v.game.can.feira.wood!;
    const c = conn();
    mesa(v, c);
    click('feira');
    expect(btn('trocar na feira').disabled).toBe(true);
    // sem barro suficiente pra taxa: apagado
    expect(btn('dar barro').disabled).toBe(true);
    click('dar madeira');
    click('querer pedra');
    click('mais quantas');
    expect(screen.getByText(`${2 * rate} madeira`)).toBeTruthy();
    click('trocar na feira');
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'feira', give: 'wood', want: 'stone', count: 2 });
  });

  it('se a trava segura a troca na feira, a escolha fica', () => {
    const base = afterSetup(mandacaruRoom(3, 1));
    const turn = turnOf(base);
    const v = viewOf(mainWith(base, { [turn]: res(9, 0, 0, 0, 0) }), turn);
    const c = conn();
    mesa(v, c);
    click('feira');
    click('dar madeira');
    click('querer pedra');
    click('trocar na feira');
    expect(c.sendAction).toHaveBeenCalledTimes(1);
    // mandou: o "quer" zera
    expect(btn('querer pedra').getAttribute('aria-pressed')).toBe('false');
    click('querer barro');
    click('trocar na feira');
    // travado: não mandou e a escolha continua
    expect(c.sendAction).toHaveBeenCalledTimes(1);
    expect(btn('querer barro').getAttribute('aria-pressed')).toBe('true');
    expect(btn('trocar na feira').disabled).toBe(false);
  });
});

describe('Mandacaru: cordéis com escolha', () => {
  it('Chuva no sertão manda os 2 recursos (podem repetir)', () => {
    const base = afterSetup(mandacaruRoom(3, 1));
    const turn = turnOf(base);
    const room = mainWith(base, {}, (s) => withCordeis(s, turn, ['chuva']));
    const c = conn();
    mesa(viewOf(room, turn), c);
    click('jogar Chuva no sertão');
    expect(btn('jogar a Chuva').disabled).toBe(true);
    click('mais feijão', 3);
    expect(btn('mais pedra').disabled).toBe(true);
    click('jogar a Chuva');
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'play_chuva', resources: ['beans', 'beans'] });
  });

  it('Atravessador manda o recurso escolhido', () => {
    const base = afterSetup(mandacaruRoom(3, 1));
    const turn = turnOf(base);
    const room = mainWith(base, {}, (s) => withCordeis(s, turn, ['atravessador']));
    const c = conn();
    mesa(viewOf(room, turn), c);
    click('jogar Atravessador');
    click('pedir couro');
    expect(screen.getByText(/todo mundo te entrega o couro que tem/)).toBeTruthy();
    click('jogar o Atravessador');
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'play_atravessador', resource: 'leather' });
  });
});

describe('Mandacaru: descarte', () => {
  function discardRoom() {
    const base = afterSetup(mandacaruRoom(3, 1));
    const turn = turnOf(base);
    const [a, b] = othersOf(base) as [string, string];
    const room = withGame(base, (s) => ({
      ...s,
      phase: 'discard',
      rolled: true,
      discards: { [a]: 4 },
      discardEndsAt: T0 + 60_000,
      hands: { ...s.hands, [a]: { ...s.hands[a]!, res: res(5, 3, 0, 0, 1) } },
    }));
    return { room, turn, a, b };
  }

  it('só habilita "descartar" com o número exato, com o relógio do descarte', () => {
    const { room, a } = discardRoom();
    const c = conn();
    mesa(viewOf(room, a), c);
    const dialog = screen.getByRole('dialog', { name: /Descarte 4 cartas/ });
    expect(within(dialog).getByText('1:00')).toBeTruthy();
    expect(btn('descartar').disabled).toBe(true);
    click('mais madeira pra descartar', 3);
    expect(within(dialog).getByText('faltam 1')).toBeTruthy();
    expect(btn('descartar').disabled).toBe(true);
    click('mais pedra pra descartar', 3);
    expect(btn('mais barro pra descartar').disabled).toBe(true);
    click('descartar');
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'discard', cards: res(3, 0, 0, 0, 1) });
  });

  it('"sugerir" escolhe as cartas; quem não precisa vê quem falta', () => {
    const { room, a, b } = discardRoom();
    const c = conn();
    const { unmount } = mesa(viewOf(room, a), c);
    click('sugerir');
    expect(screen.getByText('pronto!')).toBeTruthy();
    click('descartar');
    const sent = c.sendAction.mock.calls[0]![0] as { cards: Resources };
    expect(Object.values(sent.cards).reduce((x, y) => x + y, 0)).toBe(4);
    unmount();
    const v = viewOf(room, b);
    mesa(v);
    expect(screen.queryByRole('button', { name: 'descartar' })).toBeNull();
    expect(screen.getByText(new RegExp(`esperando o descarte de ${nameIn(v, a)}`))).toBeTruthy();
  });
});

describe('Mandacaru: fim', () => {
  function overRoom() {
    const base = afterSetup(mandacaruRoom(3, 1));
    const winner = 'p1';
    return withGame(base, (s) => ({
      ...s,
      phase: 'over',
      winner,
      turnEndsAt: null,
      wins: { p1: 1 },
      longestRoad: winner,
      hands: { ...s.hands, [winner]: { ...s.hands[winner]!, cordeis: [{ kind: 'point', fresh: false }] } },
    }));
  }

  it('mostra de onde vieram os pontos e "jogar de novo" só pro anfitrião', () => {
    const room = overRoom();
    const c = conn();
    const { unmount } = mesa(viewOf(room, 'p0'), c);
    const dialog = screen.getByRole('dialog', { name: 'Beto venceu!' });
    const rows = within(dialog).getAllByTestId('mc-fim-linha');
    expect(rows[0]!.textContent).toContain('Beto');
    expect(rows[0]!.textContent).toContain('2 casas');
    expect(rows[0]!.textContent).toContain('maior estrada');
    expect(rows[0]!.textContent).toContain('Igrejinha');
    // o Ponto revelado aparece com a arte dele (Igrejinha = point-1)
    expect(rows[0]!.querySelector('.pontos img')?.getAttribute('src')).toBe(`${import.meta.env.BASE_URL}mandacaru/cordeis/point-1.webp`);
    expect(rows).toHaveLength(3);
    click('jogar de novo');
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'restart' });
    unmount();
    mesa(viewOf(room, 'p1'));
    expect(screen.getByRole('dialog', { name: 'Você venceu!' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'jogar de novo' })).toBeNull();
    expect(screen.getByText(/esperando o anfitrião/)).toBeTruthy();
  });

  it('"jogar de novo" apagado com menos de 3 conectados, com o motivo', () => {
    const v = viewOf(overRoom(), 'p0');
    const off = { ...v, seats: v.seats.map((s) => (s.id === 'p2' ? { ...s, connected: false } : s)) };
    const c = conn();
    mesa(off, c);
    expect(btn('jogar de novo').disabled).toBe(true);
    click('jogar de novo');
    expect(c.sendAction).not.toHaveBeenCalled();
    expect(screen.getByText(/precisa de 3 a 4 pessoas conectadas \(tem 2\)/)).toBeTruthy();
  });
});

describe('Mandacaru: regras', () => {
  it('o botão abre a folha de regras com os custos e os cordéis; Esc fecha', () => {
    const room = afterSetup(mandacaruRoom(3, 1));
    mesa(viewOf(room, 'p0'));
    click('regras');
    const sheet = screen.getByRole('dialog', { name: 'regras' });
    expect(within(sheet).getByText(/10 pontos/)).toBeTruthy();
    expect(within(sheet).getByText(/Chuva no sertão/)).toBeTruthy();
    expect(within(sheet).getByText(/Igrejinha/)).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'regras' })).toBeNull();
    click('regras');
    fireEvent.click(within(screen.getByRole('dialog', { name: 'regras' })).getByRole('button', { name: /fechar/ }));
    expect(screen.queryByRole('dialog', { name: 'regras' })).toBeNull();
  });
});
