import { act as rtlAct, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { PLAYER_COLORS, joinRoom, type CoupRoomView, type CoupView, type Room } from '@cartolina/shared';
import { CoupTable } from '../src/games/coup/CoupTable';
import { playCoupSound } from '../src/games/coup/sounds';
import { lossTitle } from '../src/games/coup/texts';
import type { ConnStatus, GameConn } from '../src/net/connection';
import { T0, coupRoom, step, turnOf, viewOf } from './coup-fixtures';

vi.mock('../src/games/coup/sounds', async (original) => ({ ...(await original<typeof import('../src/games/coup/sounds')>()), playCoupSound: vi.fn() }));

type Conn = GameConn & { sendAction: Mock<GameConn['sendAction']>; onError: Mock<GameConn['onError']> };

/** Conexão falsa: guarda os ouvintes de erro (pra `fail` avisar). */
const conns: Conn[] = [];
function conn(): Conn {
  const c: Conn = {
    sendAction: vi.fn<GameConn['sendAction']>(),
    sendActivity: vi.fn(),
    sendCursor: vi.fn(),
    sendPing: vi.fn(),
    onFx: vi.fn(() => () => {}),
    onError: vi.fn<GameConn['onError']>(() => () => {}),
  };
  conns.push(c);
  return c;
}
const fail = (c: Conn, code: string, message: string) =>
  rtlAct(() => {
    for (const [listener] of c.onError.mock.calls) listener(code, message);
  });

/** Monta a mesa (status 'joined', relógio do servidor = do PC, a menos que `serverOffset` diga outra coisa). */
function mesa(view: CoupRoomView, c: Conn = conn(), serverOffset = 0, status: ConnStatus = 'joined') {
  return render(<CoupTable view={view} conn={c} serverOffset={serverOffset} status={status} />);
}

/** Sala de `n` (Ana p0, Beto p1, Caio p2…) começada pela vez de `first`. */
function startedBy(n: number, first: string): Room {
  for (let seed = 1; seed < 500; seed++) {
    const r = coupRoom(n, seed);
    if (turnOf(r) === first) return r;
  }
  throw new Error(`nenhuma semente começa com ${first}`);
}

/** Ana pega renda: a vez vai pro Beto. */
const betoDaVez = () => step(startedBy(3, 'p0'), 'p0', { type: 'act', kind: 'income' });
/** Beto taxa: janela de reação aberta pra Ana e Caio. */
const betoTaxa = () => step(betoDaVez(), 'p1', { type: 'act', kind: 'tax' });

/** Visão com o jogo alterado (a original não muda). */
const com = (v: CoupRoomView, game: Partial<CoupView>): CoupRoomView => ({ ...v, game: { ...v.game, ...game } });

const NOTHING = { act: [], targets: [], challenge: false, block: [], pass: false, lose: false, keep: 0 };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => {
  for (const c of conns.splice(0)) expect(c.sendAction.mock.contexts.every((t) => t === c)).toBe(true);
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('mesa do Cúpi: sua vez', () => {
  it('as ações de can.act aparecem habilitadas; "renda" manda act income', () => {
    const view = viewOf(startedBy(3, 'p0'), 'p0');
    const c = conn();
    mesa(view, c);
    expect(screen.getByText('sua vez')).toBeTruthy();
    const acts = ['renda', 'ajuda externa', 'golpe', 'taxar', 'assassinar', 'extorquir', 'trocar'] as const;
    const kinds = ['income', 'foreignAid', 'coup', 'tax', 'assassinate', 'steal', 'exchange'] as const;
    acts.forEach((name, i) => {
      const btn = screen.getByRole('button', { name: new RegExp(`^${name}`) }) as HTMLButtonElement;
      expect(btn.disabled).toBe(!view.game.can.act.includes(kinds[i]!));
    });
    // com 2 moedas: sem golpe e sem assassinar
    expect((screen.getByRole('button', { name: /^golpe/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /^renda/ }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'act', kind: 'income' });
  });

  it('"você tem" marca as ações dos personagens que estão na sua mão', () => {
    const view = viewOf(startedBy(3, 'p0'), 'p0');
    const { container } = mesa(view);
    const has = [...container.querySelectorAll('.cp-act')].filter((b) => b.querySelector('.cp-has')).length;
    const claims = { duke: 'taxar', assassin: 'assassinar', captain: 'extorquir', ambassador: 'trocar' } as Record<string, string>;
    expect(has).toBe(new Set(view.game.myCards.filter((ch) => claims[ch])).size);
  });

  it('"extorquir" entra no modo alvo; o assento do Beto manda o alvo; Esc e "cancelar" saem sem mandar', () => {
    const c = conn();
    mesa(viewOf(startedBy(3, 'p0'), 'p0'), c);
    expect(screen.queryByRole('button', { name: /^mirar em Beto/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^extorquir/ }));
    expect(c.sendAction).not.toHaveBeenCalled();
    expect(screen.getByText(/escolha o alvo lá em cima/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^mirar em Caio/ })).toBeTruthy();
    // Esc sai do modo
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: /^mirar em Beto/ })).toBeNull();
    expect(screen.getByText('sua vez')).toBeTruthy();
    // "cancelar" também
    fireEvent.click(screen.getByRole('button', { name: /^extorquir/ }));
    fireEvent.click(screen.getByRole('button', { name: 'cancelar' }));
    expect(screen.queryByRole('button', { name: /^mirar em Beto/ })).toBeNull();
    expect(c.sendAction).not.toHaveBeenCalled();
    // e mirando de verdade
    fireEvent.click(screen.getByRole('button', { name: /^extorquir/ }));
    fireEvent.click(screen.getByRole('button', { name: /^mirar em Beto/ }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'act', kind: 'steal', target: 'p1' });
    expect(c.sendAction).toHaveBeenCalledTimes(1);
  });

  it('fora da sua vez: "vez de Beto" e as ações apagadas', () => {
    const view = viewOf(betoDaVez(), 'p0');
    mesa(view);
    expect(screen.getByText('vez de Beto')).toBeTruthy();
    expect((screen.getByRole('button', { name: /^renda/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('mesa do Cúpi: assentos, topo e diário', () => {
  it('oponentes a partir de quem vem depois de você, com moedas e a vez marcada', () => {
    const { container } = mesa(viewOf(betoDaVez(), 'p1'));
    const names = [...container.querySelectorAll('.cp-opp .cp-nm')].map((n) => n.firstChild?.textContent);
    expect(names).toEqual(['Caio', 'Ana']);
    const ana = container.querySelectorAll('.cp-opp')[1]!;
    expect(ana.querySelector('.cp-coins')!.textContent).toBe('3');
    expect(ana.querySelectorAll('.cp-card.back')).toHaveLength(2);
    // a vez é do Beto (você): nenhum oponente marcado; a sua área sim
    expect(container.querySelector('.cp-opp.turn')).toBeNull();
    expect(container.querySelector('.cp-me.turn')).toBeTruthy();
  });

  it('desconectado aparece como "saiu"', () => {
    const view = viewOf(betoDaVez(), 'p0');
    const off = { ...view, seats: view.seats.map((s) => (s.id === 'p2' ? { ...s, connected: false } : s)) };
    const { container } = mesa(off);
    const caio = [...container.querySelectorAll('.cp-opp')].find((o) => o.textContent?.includes('Caio'))!;
    expect(within(caio as HTMLElement).getByText('saiu')).toBeTruthy();
  });

  it('o diário conta a partida, mais nova embaixo e destacada', () => {
    const { container } = mesa(viewOf(betoTaxa(), 'p0'));
    const lines = [...container.querySelectorAll('.cp-log li')].map((l) => l.textContent);
    expect(lines).toEqual(['Partida nova. Começa você.', 'você pegou renda', 'Beto disse Duque']);
    expect(container.querySelector('.cp-log li.last')!.textContent).toBe('Beto disse Duque');
    expect(screen.getByRole('heading', { name: 'diário' })).toBeTruthy();
  });

  it('o topo tem CÚPI, o som e o placar da noite (só quem já ganhou)', () => {
    const view = viewOf(betoDaVez(), 'p0');
    const { container, unmount } = mesa(view);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('CÚPI');
    expect(screen.getByRole('button', { name: /^som:/ })).toBeTruthy();
    expect(container.querySelector('.cp-score')!.textContent).toBe('placar da noite: ninguém ganhou ainda');
    unmount();
    const { container: c2 } = mesa(com(view, { wins: { p0: 1, p1: 2, p2: 0 } }));
    expect(c2.querySelector('.cp-score')!.textContent).toBe('placar da noite: Beto 2 · você 1');
  });

  it('o palco mostra o tesouro e o baralho', () => {
    const view = viewOf(betoDaVez(), 'p0');
    const { container } = mesa(view);
    expect(container.querySelector('.cp-corner.treasury')!.textContent).toBe(`tesouro ${view.game.treasury}`);
    expect(container.querySelector('.cp-corner.deck')!.textContent).toBe(`baralho ${view.game.deckSize}`);
  });
});

describe('mesa do Cúpi: janela de reação', () => {
  it('numa taxa do Beto: declaração, "duvidar" e "deixa"; "deixa" manda pass com o id da janela', () => {
    const view = viewOf(betoTaxa(), 'p0');
    const c = conn();
    const { container } = mesa(view, c);
    expect(container.querySelector('.cp-decl')!.textContent).toBe('Beto diz: sou Duque e pega 3');
    expect(screen.getByRole('button', { name: 'duvidar' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^bloquear/ })).toBeNull();
    expect(container.querySelector('.cp-passed')!.textContent).toBe('faltam você e Caio');
    expect(container.querySelector('.cp-secs')!.textContent).toBe('10');
    fireEvent.click(screen.getByRole('button', { name: 'deixa' }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'pass', windowId: view.game.window!.id });
  });

  it('"duvidar" manda challenge com o id da janela', () => {
    const view = viewOf(betoTaxa(), 'p0');
    const c = conn();
    mesa(view, c);
    fireEvent.click(screen.getByRole('button', { name: 'duvidar' }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'challenge', windowId: view.game.window!.id });
  });

  it('o alvo de uma extorsão vê "bloquear como Capitão" e "bloquear como Embaixador"', () => {
    const room = step(betoDaVez(), 'p1', { type: 'act', kind: 'steal', target: 'p0' });
    const view = viewOf(room, 'p0');
    const c = conn();
    mesa(view, c);
    expect(screen.getByRole('button', { name: 'bloquear como Capitão' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'bloquear como Embaixador' }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'block', as: 'ambassador', windowId: view.game.window!.id });
  });

  it('quem não pode reagir espera; quem já deixou aparece na linha', () => {
    const room = step(betoTaxa(), 'p2', { type: 'pass', windowId: viewOf(betoTaxa(), null).game.window!.id });
    mesa(viewOf(room, 'p1'));
    expect(screen.getByText('esperando os outros…')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'deixa' })).toBeNull();
    expect(screen.getByText('Caio deixou · falta Ana')).toBeTruthy();
  });

  it('passado o prazo, os botões somem e aparece "tempo esgotado…"', () => {
    mesa(viewOf(betoTaxa(), 'p0'));
    expect(screen.getByRole('button', { name: 'deixa' })).toBeTruthy();
    rtlAct(() => vi.advanceTimersByTime(5000));
    expect(screen.getByRole('button', { name: 'deixa' })).toBeTruthy();
    rtlAct(() => vi.advanceTimersByTime(5100));
    expect(screen.queryByRole('button', { name: 'deixa' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'duvidar' })).toBeNull();
    expect(screen.getByText('tempo esgotado…')).toBeTruthy();
  });

  it('o prazo vale na hora do servidor (serverOffset)', () => {
    mesa(viewOf(betoTaxa(), 'p0'), conn(), 20_000);
    expect(screen.queryByRole('button', { name: 'deixa' })).toBeNull();
    expect(screen.getByText('tempo esgotado…')).toBeTruthy();
  });

  it('outra pessoa escolhendo a carta que perde', () => {
    const view = viewOf(betoTaxa(), 'p0');
    mesa(com(view, { phase: 'losing', window: null, loss: { player: 'p2', reason: 'coup' }, can: NOTHING }));
    expect(screen.getByText('Caio está escolhendo a carta que perde…')).toBeTruthy();
  });
});

describe('mesa do Cúpi: painéis', () => {
  it('perdendo carta: título certo; escolher e "revelar" manda lose', () => {
    const tax = betoTaxa();
    const room = step(tax, 'p0', { type: 'challenge', windowId: viewOf(tax, null).game.window!.id });
    const game = viewOf(room, null).game;
    expect(game.phase).toBe('losing');
    const loser = game.loss!.player;
    const view = viewOf(room, loser);
    const c = conn();
    const { container } = mesa(view, c);
    expect(screen.getByRole('heading', { name: lossTitle(game.loss!.reason) })).toBeTruthy();
    expect(screen.getByText('Escolha a carta que vai revelar')).toBeTruthy();
    const reveal = screen.getByRole('button', { name: 'revelar' }) as HTMLButtonElement;
    expect(reveal.disabled).toBe(true);
    const picks = container.querySelectorAll<HTMLButtonElement>('.cp-pickc');
    expect(picks).toHaveLength(view.game.myCards.length);
    fireEvent.click(picks[picks.length - 1]!);
    const card = view.game.myCards[picks.length - 1]!;
    fireEvent.click(screen.getByRole('button', { name: /^revelar / }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'lose', card });
  });

  it('troca: "ficar com essas" só habilita com o número certo e manda exchange', () => {
    let room = step(betoDaVez(), 'p1', { type: 'act', kind: 'exchange' });
    const id = viewOf(room, null).game.window!.id;
    room = step(room, 'p0', { type: 'pass', windowId: id });
    room = step(room, 'p2', { type: 'pass', windowId: id });
    const view = viewOf(room, 'p1');
    expect(view.game.phase).toBe('exchange');
    expect(view.game.can.keep).toBe(2);
    const c = conn();
    const { container } = mesa(view, c);
    expect(screen.getByRole('heading', { name: 'Fique com 2 das 4 cartas' })).toBeTruthy();
    const ok = () => screen.getByRole('button', { name: 'ficar com essas' }) as HTMLButtonElement;
    expect(ok().disabled).toBe(true);
    const picks = container.querySelectorAll<HTMLButtonElement>('.cp-pickc');
    expect(picks).toHaveLength(4);
    expect(container.querySelectorAll('.cp-pickc .cp-new')).toHaveLength(2);
    fireEvent.click(picks[1]!);
    expect(ok().disabled).toBe(true);
    fireEvent.click(picks[3]!);
    expect(ok().disabled).toBe(false);
    // a terceira não entra (já tem 2)
    fireEvent.click(picks[0]!);
    expect(container.querySelectorAll('.cp-pickc.on')).toHaveLength(2);
    // desmarcar e marcar de novo
    fireEvent.click(picks[3]!);
    expect(ok().disabled).toBe(true);
    fireEvent.click(picks[2]!);
    fireEvent.click(ok());
    const pool = [...view.game.myCards, ...view.game.myDrawn];
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'exchange', keep: [pool[1], pool[2]] });
  });

  const over = (v: CoupRoomView) =>
    com(v, {
      phase: 'over',
      turn: null,
      window: null,
      declared: null,
      winner: 'p1',
      winnerCards: ['duke', 'contessa'],
      out: ['p2', 'p0'],
      wins: { p0: 0, p1: 1, p2: 0 },
      can: NOTHING,
    });

  it('fim: o anfitrião vê "jogar de novo" (manda restart)', () => {
    const c = conn();
    const { container } = mesa(over(viewOf(betoDaVez(), 'p0')), c);
    expect(screen.getByRole('heading', { name: 'Beto tomou o poder' })).toBeTruthy();
    expect(screen.getByText('Duque e Condessa')).toBeTruthy();
    expect(screen.getByText('Caio → você')).toBeTruthy();
    expect(container.querySelector('.cp-panel .cp-pscore em.lead')!.textContent).toBe('Beto 1');
    fireEvent.click(screen.getByRole('button', { name: 'jogar de novo' }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'restart' });
  });

  it('fim: quem não é anfitrião vê "esperando o anfitrião…"', () => {
    mesa(over(viewOf(betoDaVez(), 'p1')));
    expect(screen.getByRole('heading', { name: 'você tomou o poder' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'jogar de novo' })).toBeNull();
    expect(screen.getByText('esperando o anfitrião…')).toBeTruthy();
  });
});

describe('mesa do Cúpi: momentos, avisos e quem assiste', () => {
  it('uma dúvida nova vira momento sobre o palco', () => {
    const tax = betoTaxa();
    const room = step(tax, 'p2', { type: 'challenge', windowId: viewOf(tax, null).game.window!.id });
    const { container, rerender } = mesa(viewOf(tax, 'p0'));
    expect(container.querySelector('.cp-moment')).toBeNull();
    rerender(<CoupTable view={viewOf(room, 'p0')} conn={conn()} serverOffset={0} status="joined" />);
    const moment = container.querySelector('.cp-moment')!;
    expect(moment.textContent).toContain('Caio duvidou!');
    rtlAct(() => vi.advanceTimersByTime(2300));
    expect(container.querySelector('.cp-moment')).toBeNull();
  });

  it('com a janela aberta pra você, o momento vira faixa que não bloqueia cliques', () => {
    const tax = betoTaxa();
    const view = viewOf(tax, 'p0');
    const { container, rerender } = mesa(view);
    const blocked = com(view, { log: [...view.game.log, { t: 'out', player: 'p2' }] });
    rerender(<CoupTable view={blocked} conn={conn()} serverOffset={0} status="joined" />);
    const moment = container.querySelector('.cp-moment')!;
    expect(moment.classList.contains('band')).toBe(true);
    expect(moment.textContent).toBe('Caio está fora');
    expect(screen.getByRole('button', { name: 'deixa' })).toBeTruthy();
  });

  it('recusa do servidor vira aviso no palco (as de entrada na sala não)', () => {
    const c = conn();
    mesa(viewOf(betoTaxa(), 'p0'), c);
    fail(c, 'room_full', 'A sala está cheia.');
    expect(screen.queryByText('A sala está cheia.')).toBeNull();
    fail(c, 'window_closed', 'Essa janela já fechou.');
    expect(screen.getByText('Essa janela já fechou.')).toBeTruthy();
    expect(vi.mocked(playCoupSound)).toHaveBeenCalledWith('error');
  });

  it('quem assiste vê a mesa sem a sua área', () => {
    const res = joinRoom(betoDaVez(), { token: 't3', name: 'Duda', color: PLAYER_COLORS[3]! }, 'p3', 0);
    if (!res.ok) throw new Error(res.error);
    const { container } = mesa(viewOf(res.room, 'p3'));
    expect(screen.getByText('você está assistindo — joga a próxima')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^renda/ })).toBeNull();
    expect([...container.querySelectorAll('.cp-opp .cp-nm')].map((n) => n.firstChild?.textContent)).toEqual(['Ana', 'Beto', 'Caio']);
  });
});

describe('mesa do Cúpi: trava, prazo, foco e estado que zera', () => {
  it('dois cliques seguidos em "deixa" mandam uma ação só; uma recusa libera de novo', () => {
    const c = conn();
    mesa(viewOf(betoTaxa(), 'p0'), c);
    fireEvent.click(screen.getByRole('button', { name: 'deixa' }));
    fireEvent.click(screen.getByRole('button', { name: 'deixa' }));
    expect(c.sendAction).toHaveBeenCalledTimes(1);
    fail(c, 'window_closed', 'Essa janela já fechou.');
    fireEvent.click(screen.getByRole('button', { name: 'deixa' }));
    expect(c.sendAction).toHaveBeenCalledTimes(2);
  });

  it('a trava solta sozinha se nada chegar em alguns segundos', () => {
    const c = conn();
    mesa(viewOf(startedBy(3, 'p0'), 'p0'), c);
    fireEvent.click(screen.getByRole('button', { name: /^renda/ }));
    fireEvent.click(screen.getByRole('button', { name: /^renda/ }));
    expect(c.sendAction).toHaveBeenCalledTimes(1);
    rtlAct(() => vi.advanceTimersByTime(4100));
    fireEvent.click(screen.getByRole('button', { name: /^renda/ }));
    expect(c.sendAction).toHaveBeenCalledTimes(2);
  });

  it('visão nova solta a trava (outra situação)', () => {
    const c = conn();
    const view = viewOf(startedBy(3, 'p0'), 'p0');
    const { rerender } = mesa(view, c);
    fireEvent.click(screen.getByRole('button', { name: /^renda/ }));
    rerender(<CoupTable view={com(view, { log: [...view.game.log, { t: 'out', player: 'p2' }] })} conn={c} serverOffset={0} status="joined" />);
    fireEvent.click(screen.getByRole('button', { name: /^taxar/ }));
    expect(c.sendAction).toHaveBeenCalledTimes(2);
  });

  it('no fim do prazo (antes do próximo tique do relógio) a reação não sai', () => {
    const c = conn();
    const view = viewOf(betoTaxa(), 'p0');
    mesa(view, c);
    vi.setSystemTime(view.game.window!.endsAt); // o relógio ainda não acordou: os botões estão na tela
    fireEvent.click(screen.getByRole('button', { name: 'deixa' }));
    fireEvent.click(screen.getByRole('button', { name: 'duvidar' }));
    expect(c.sendAction).not.toHaveBeenCalled();
  });

  it('modo alvo: o foco vai pro primeiro alvo e volta pra ação; o rótulo diz moedas e cartas', () => {
    mesa(viewOf(startedBy(3, 'p0'), 'p0'));
    const steal = screen.getByRole('button', { name: /^extorquir/ });
    expect(steal.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: /^renda/ }).getAttribute('aria-pressed')).toBeNull();
    fireEvent.click(steal);
    expect(steal.getAttribute('aria-pressed')).toBe('true');
    const beto = screen.getByRole('button', { name: 'mirar em Beto, 2 moedas, 2 cartas' });
    expect(document.activeElement).toBe(beto);
    expect(beto.querySelector('div')).toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.activeElement).toBe(steal);
    fireEvent.click(steal);
    fireEvent.click(screen.getByRole('button', { name: 'cancelar' }));
    expect(document.activeElement).toBe(steal);
  });

  it('o momento troca dentro de uma região de aviso que fica na tela', () => {
    const view = viewOf(betoTaxa(), 'p1');
    const { container, rerender } = mesa(view);
    const live = container.querySelector('.cp-felt [role="status"]');
    expect(live).toBeTruthy();
    expect(live!.textContent).toBe('');
    rerender(<CoupTable view={com(view, { log: [...view.game.log, { t: 'out', player: 'p2' }] })} conn={conn()} serverOffset={0} status="joined" />);
    expect(container.querySelector('.cp-felt [role="status"]')).toBe(live);
    expect(live!.textContent).toBe('Caio está fora');
  });

  it('o modo alvo zera com uma visão de outra situação', () => {
    const view = viewOf(startedBy(3, 'p0'), 'p0');
    const c = conn();
    const { rerender } = mesa(view, c);
    fireEvent.click(screen.getByRole('button', { name: /^extorquir/ }));
    expect(screen.getByRole('button', { name: /^mirar em Beto/ })).toBeTruthy();
    rerender(<CoupTable view={com(view, { log: [...view.game.log, { t: 'out', player: 'p2' }] })} conn={c} serverOffset={0} status="joined" />);
    expect(screen.queryByRole('button', { name: /^mirar em/ })).toBeNull();
    expect(screen.getByText('sua vez')).toBeTruthy();
  });

  it('a carta marcada pra perder zera com uma visão de outra situação', () => {
    const tax = betoTaxa();
    const room = step(tax, 'p0', { type: 'challenge', windowId: viewOf(tax, null).game.window!.id });
    const view = viewOf(room, viewOf(room, null).game.loss!.player);
    const c = conn();
    const { container, rerender } = mesa(view, c);
    fireEvent.click(container.querySelectorAll<HTMLButtonElement>('.cp-pickc')[0]!);
    expect(container.querySelectorAll('.cp-pickc.on')).toHaveLength(1);
    rerender(<CoupTable view={com(view, { log: [...view.game.log, { t: 'out', player: 'p2' }] })} conn={c} serverOffset={0} status="joined" />);
    expect(container.querySelectorAll('.cp-pickc.on')).toHaveLength(0);
    expect((screen.getByRole('button', { name: 'revelar' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
