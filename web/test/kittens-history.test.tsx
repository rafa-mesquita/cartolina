import {
  PLAYER_COLORS,
  type KittensHistoryResponse,
  type KittensMatchRecord,
  type KittensPerson,
  type KittensStats,
} from '@cartolina/shared';
import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KittensHistory } from '../src/games/kittens/history/KittensHistory';
import { useKittensHistory } from '../src/games/kittens/history/useKittensHistory';
import * as api from '../src/net/api';
import { TOO_MANY_MESSAGE } from '../src/net/errors';
import { GamePage } from '../src/screens/GamePage';

vi.mock('../src/net/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/net/api')>();
  return { ...actual, getHistory: vi.fn() };
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const ANA: KittensPerson = { name: 'Ana', color: PLAYER_COLORS[0] };
const BETO: KittensPerson = { name: 'Beto', color: PLAYER_COLORS[1] };
const CAIO: KittensPerson = { name: 'Caio', color: PLAYER_COLORS[2] };

const AT_NEW = new Date(2026, 9, 20, 21, 30).getTime();
const AT_OLD = new Date(2026, 9, 19, 20, 5).getTime();

const perPlayer = (people: KittensPerson[]) => people.map((who) => ({ who, nopes: 0, defuses: 0 }));

/** A mais nova primeiro (como o servidor manda): Caio explodiu, Ana caiu, Beto venceu. */
const NEWER: KittensMatchRecord = {
  id: 'k2',
  matchId: 'TATU-1-2',
  roomCode: 'TATU',
  playedAt: AT_NEW,
  players: [ANA, BETO, CAIO],
  exits: [
    { who: CAIO, how: 'boom' },
    { who: ANA, how: 'left' },
  ],
  winner: BETO,
  perPlayer: perPlayer([ANA, BETO, CAIO]),
};
const OLDER: KittensMatchRecord = {
  id: 'k1',
  matchId: 'TATU-1-1',
  roomCode: 'TATU',
  playedAt: AT_OLD,
  players: [ANA, BETO],
  exits: [{ who: BETO, how: 'boom' }],
  winner: ANA,
  perPlayer: perPlayer([ANA, BETO]),
};

const NO_STATS: KittensStats = { mostWins: [], firstOut: [], nopeKings: [] };
const STATS: KittensStats = {
  mostWins: [
    { ...ANA, count: 2, matches: 3, rate: 2 / 3 },
    { ...BETO, count: 1, matches: 4, rate: 1 / 4 },
  ],
  firstOut: [{ ...CAIO, count: 1, matches: 3, rate: 1 / 3 }],
  nopeKings: [{ ...BETO, count: 10, matches: 4, rate: 2.5 }],
};

function response(matches: KittensMatchRecord[], nextBefore: number | null = null, stats: KittensStats | null = NO_STATS): KittensHistoryResponse {
  return { game: 'kittens', matches, stats, nextBefore };
}

const dateText = (ms: number) =>
  new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(
    new Date(ms),
  );

const items = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('li.kt-hx-match')];

describe('aba histórico do Tatubum', () => {
  beforeEach(() => {
    vi.mocked(api.getHistory).mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('a página do jogo mostra o histórico do Tatubum na aba histórico', async () => {
    vi.mocked(api.getHistory).mockResolvedValue(response([NEWER]));
    const { container } = render(<GamePage game="kittens" tab="historico" />);
    await screen.findByText('3 jogadores');
    expect(api.getHistory).toHaveBeenCalledWith('kittens');
    expect(container.querySelector('.kt-history')).not.toBeNull();
    expect(screen.queryByText(/vem em breve/)).toBeNull();
  });

  it('mostra "carregando…" como status', () => {
    vi.mocked(api.getHistory).mockReturnValue(new Promise(() => {}));
    render(<KittensHistory />);
    expect(screen.getByRole('status').textContent).toBe('carregando…');
  });

  it('cada partida: data, o vencedor com o bichinho e a fila de quem saiu, marcando quem caiu', async () => {
    vi.mocked(api.getHistory).mockResolvedValue(response([NEWER, OLDER]));
    const { container } = render(<KittensHistory />);
    await screen.findByText('3 jogadores');
    const [first, second] = items(container);
    expect(items(container)).toHaveLength(2);
    const f = within(first!);
    expect(f.getByText(dateText(AT_NEW))).toBeTruthy();
    expect(first!.querySelector('.kt-hx-meta')!.textContent).toContain('2026');
    expect(first!.querySelector('.kt-hx-winner')!.textContent).toBe('Beto venceu');
    expect(first!.querySelector('.kt-hx-winner .kt-hx-face')).not.toBeNull();
    const exits = [...first!.querySelectorAll('.kt-hx-exits > li')];
    expect(exits.map((li) => li.textContent)).toEqual(['1ºCaioexplodiu', '2ºAnacaiu']);
    expect(exits.map((li) => li.classList.contains('kt-hx-left'))).toEqual([false, true]);
    expect(exits.every((li) => li.querySelector('.kt-hx-face'))).toBe(true);
    // a frase inteira pra leitor de tela
    expect(first!.getAttribute('aria-label')).toBe(
      `${dateText(AT_NEW)} · Beto venceu · jogaram Ana, Beto e Caio · saíram Caio (explodiu), depois Ana (caiu)`,
    );
    expect(within(second!).getByText('2 jogadores')).toBeTruthy();
    expect(second!.getAttribute('aria-label')).toBe(`${dateText(AT_OLD)} · Ana venceu · jogaram Ana e Beto · saíram Beto (explodiu)`);
  });

  it('estatísticas da galera: três quadros com o top 3; quadro vazio pede mais partidas', async () => {
    vi.mocked(api.getHistory).mockResolvedValue(response([NEWER], null, { ...STATS, firstOut: [] }));
    render(<KittensHistory />);
    const galera = (await screen.findByRole('heading', { name: 'a galera' })).closest('section')!;
    const board = (title: string) => within(galera).getByRole('region', { name: title });
    const wins = board('quem mais vence');
    expect([...wins.querySelectorAll('li b')].map((b) => b.textContent)).toEqual(['Ana', 'Beto']);
    expect(within(wins).getByText('67% · 2 de 3 partidas')).toBeTruthy();
    expect(within(wins).getByText('25% · 1 de 4 partidas')).toBeTruthy();
    expect(within(board('quem explode primeiro')).getByText('joguem mais umas partidas')).toBeTruthy();
    expect(within(board('rei do Nem vem!')).getByText('2,5 por partida · 10 em 4 partidas')).toBeTruthy();
  });

  it('quem explode primeiro: "1 vez", "2 vezes"', async () => {
    const firstOut = [
      { ...CAIO, count: 2, matches: 3, rate: 2 / 3 },
      { ...ANA, count: 1, matches: 5, rate: 1 / 5 },
    ];
    vi.mocked(api.getHistory).mockResolvedValue(response([NEWER], null, { ...STATS, firstOut }));
    render(<KittensHistory />);
    const board = await screen.findByRole('region', { name: 'quem explode primeiro' });
    expect(within(board).getByText('2 vezes em 3 partidas')).toBeTruthy();
    expect(within(board).getByText('1 vez em 5 partidas')).toBeTruthy();
  });

  it('sem partidas: mensagem do cerrado, sem quadros nem "carregar mais"', async () => {
    vi.mocked(api.getHistory).mockResolvedValue(response([]));
    render(<KittensHistory />);
    expect(await screen.findByText('Nenhuma partida de Tatubum ainda.')).toBeTruthy();
    expect(screen.getByText('O cerrado está quietinho. Joguem uma e ela aparece aqui.')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'a galera' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'carregar mais' })).toBeNull();
  });

  it('"carregar mais" busca a página seguinte, junta sem repetir e mantém as estatísticas', async () => {
    vi.mocked(api.getHistory)
      .mockResolvedValueOnce(response([NEWER], AT_NEW, STATS))
      // o servidor pode repetir uma partida na borda da página: não aparece duas vezes
      .mockResolvedValueOnce(response([NEWER, OLDER], null, null));
    const { container } = render(<KittensHistory />);
    fireEvent.click(await screen.findByRole('button', { name: 'carregar mais' }));
    expect(api.getHistory).toHaveBeenLastCalledWith('kittens', AT_NEW);
    await screen.findByText('2 jogadores');
    expect(items(container)).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'carregar mais' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'a galera' })).toBeTruthy();
  });

  it('enquanto busca mais, o botão diz "carregando…" e segura o segundo clique', async () => {
    const more = deferred<KittensHistoryResponse | null>();
    vi.mocked(api.getHistory).mockResolvedValueOnce(response([NEWER], AT_NEW)).mockReturnValueOnce(more.promise);
    const { container } = render(<KittensHistory />);
    const button = await screen.findByRole('button', { name: 'carregar mais' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(api.getHistory).toHaveBeenCalledTimes(2);
    expect(button.textContent).toBe('carregando…');
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await act(async () => more.resolve(response([OLDER], null, null)));
    expect(items(container)).toHaveLength(2);
  });

  it('loadMore chamado de novo antes do primeiro voltar é ignorado; as estatísticas da primeira página ficam', async () => {
    const more = deferred<KittensHistoryResponse | null>();
    vi.mocked(api.getHistory).mockResolvedValueOnce(response([NEWER], AT_NEW, STATS)).mockReturnValueOnce(more.promise);
    const { result } = renderHook(() => useKittensHistory());
    await act(async () => {});
    const { loadMore } = result.current;
    let first!: Promise<void>;
    act(() => {
      first = loadMore();
      void loadMore();
    });
    expect(api.getHistory).toHaveBeenCalledTimes(2);
    await act(async () => {
      more.resolve(response([OLDER], null, null));
      await first;
    });
    expect(result.current.data?.matches.map((m) => m.id)).toEqual(['k2', 'k1']);
    expect(result.current.data?.stats).toEqual(STATS);
  });

  it('falha ao buscar mais: mensagem perto do botão, que continua lá', async () => {
    vi.mocked(api.getHistory).mockResolvedValueOnce(response([NEWER], AT_NEW)).mockRejectedValueOnce(new Error('history_failed_500'));
    render(<KittensHistory />);
    fireEvent.click(await screen.findByRole('button', { name: 'carregar mais' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Não deu pra carregar mais partidas. Tenta de novo.');
    expect(screen.getByRole('button', { name: 'carregar mais' })).toBeTruthy();
  });

  it('erro na primeira carga: "tentar de novo" recarrega', async () => {
    vi.mocked(api.getHistory).mockRejectedValueOnce(new Error('history_failed_500')).mockResolvedValueOnce(response([NEWER]));
    render(<KittensHistory />);
    expect(await screen.findByText('não deu pra falar com o servidor')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'tentar de novo' }));
    expect(await screen.findByText('3 jogadores')).toBeTruthy();
    expect(screen.queryByText('não deu pra falar com o servidor')).toBeNull();
  });

  it('pedidos demais (429): "Calma!"', async () => {
    vi.mocked(api.getHistory).mockRejectedValue(new Error('history_failed_429'));
    render(<KittensHistory />);
    expect(await screen.findByText(TOO_MANY_MESSAGE)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'tentar de novo' })).toBeTruthy();
  });

  it('servidor sem histórico do Tatubum (null): avisa', async () => {
    vi.mocked(api.getHistory).mockResolvedValue(null);
    render(<KittensHistory />);
    expect(await screen.findByText('Esse jogo ainda não tem histórico.')).toBeTruthy();
  });

  it('ignora resposta antiga que chega depois (StrictMode roda o efeito duas vezes)', async () => {
    const old = deferred<KittensHistoryResponse | null>();
    vi.mocked(api.getHistory).mockReturnValueOnce(old.promise).mockResolvedValueOnce(response([NEWER]));
    render(
      <StrictMode>
        <KittensHistory />
      </StrictMode>,
    );
    expect(await screen.findByText('3 jogadores')).toBeTruthy();
    await act(async () => old.resolve(response([])));
    expect(screen.queryByText('Nenhuma partida de Tatubum ainda.')).toBeNull();
  });
});
