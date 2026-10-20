import { PLAYER_COLORS, type CoupHistoryResponse, type CoupMatchRecord, type CoupPerson } from '@cartolina/shared';
import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoupHistory } from '../src/games/coup/history/CoupHistory';
import { useCoupHistory } from '../src/games/coup/history/useCoupHistory';
import * as api from '../src/net/api';
import { TOO_MANY_MESSAGE } from '../src/net/errors';

vi.mock('../src/net/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/net/api')>();
  return { ...actual, getHistory: vi.fn() };
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const ANA: CoupPerson = { name: 'Ana', color: PLAYER_COLORS[0] };
const BETO: CoupPerson = { name: 'Beto', color: PLAYER_COLORS[1] };
const CAIO: CoupPerson = { name: 'Caio', color: PLAYER_COLORS[2] };

const AT_NEW = new Date(2026, 9, 19, 21, 30).getTime();
const AT_OLD = new Date(2026, 9, 18, 20, 5).getTime();

/** A mais nova primeiro (como o servidor manda). */
const NEWER: CoupMatchRecord = {
  id: 'c2',
  matchId: 'ABCD-1-2',
  roomCode: 'ABCD',
  playedAt: AT_NEW,
  players: [ANA, BETO, CAIO],
  out: [CAIO, ANA],
  winner: BETO,
  winnerCards: ['assassin'],
};
const OLDER: CoupMatchRecord = {
  id: 'c1',
  matchId: 'ABCD-1-1',
  roomCode: 'ABCD',
  playedAt: AT_OLD,
  players: [ANA, BETO],
  out: [BETO],
  winner: ANA,
  winnerCards: ['duke', 'contessa'],
};

function coupResponse(matches: CoupMatchRecord[], nextBefore: number | null = null): CoupHistoryResponse {
  return { game: 'coup', matches, stats: null, nextBefore };
}

const dateText = (ms: number) =>
  new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(
    new Date(ms),
  );

const items = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('li.cph-match')];

describe('aba histórico do Cúpi', () => {
  beforeEach(() => {
    vi.mocked(api.getHistory).mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mostra "carregando…" como status', () => {
    vi.mocked(api.getHistory).mockReturnValue(new Promise(() => {}));
    render(<CoupHistory />);
    expect(screen.getByRole('status').textContent).toBe('carregando…');
  });

  it('cada partida: data, quem tomou o poder, as cartas dele, quem jogou e quem saiu', async () => {
    vi.mocked(api.getHistory).mockResolvedValue(coupResponse([NEWER, OLDER]));
    const { container } = render(<CoupHistory />);
    await screen.findAllByText(/tomou o poder/, { selector: '.cph-title' });
    expect(api.getHistory).toHaveBeenCalledWith('coup');
    const [first, second] = items(container);
    expect(items(container)).toHaveLength(2);
    const f = within(first!);
    expect(f.getByText(dateText(AT_NEW))).toBeTruthy();
    expect(f.getByText('3 jogadores')).toBeTruthy();
    expect(first!.querySelector('.cph-title')!.textContent).toContain('Beto tomou o poder');
    expect(f.getByText('Assassino')).toBeTruthy();
    // quem jogou: o nome e o bichinho da cor de cada um
    const played = first!.querySelector('.cph-players')!;
    expect(played.textContent).toContain('Ana');
    expect(played.textContent).toContain('Beto');
    expect(played.textContent).toContain('Caio');
    expect(played.querySelectorAll('.critter')).toHaveLength(3);
    expect(first!.querySelector('.cph-out')!.textContent).toBe('saíram: Caio → Ana');
    // a frase inteira pra leitor de tela
    expect(first!.getAttribute('aria-label')).toBe(
      `${dateText(AT_NEW)} · Beto tomou o poder com Assassino · jogaram Ana, Beto e Caio · saíram Caio, depois Ana`,
    );
    // a segunda: duas cartas do vencedor
    const s = within(second!);
    expect(s.getByText('2 jogadores')).toBeTruthy();
    expect(s.getByText('Duque')).toBeTruthy();
    expect(s.getByText('Condessa')).toBeTruthy();
    expect(second!.querySelector('.cph-out')!.textContent).toBe('saíram: Beto');
    expect(second!.getAttribute('aria-label')).toBe(
      `${dateText(AT_OLD)} · Ana tomou o poder com Duque e Condessa · jogaram Ana e Beto · saíram Beto`,
    );
  });

  it('com 3 ou mais saídas, o leitor de tela ouve a ordem: "saíram Beto, depois Duda, depois Caio"', async () => {
    const DUDA: CoupPerson = { name: 'Duda', color: PLAYER_COLORS[3] };
    const four: CoupMatchRecord = {
      ...NEWER,
      id: 'c3',
      players: [ANA, BETO, CAIO, DUDA],
      out: [BETO, DUDA, CAIO],
      winner: ANA,
      winnerCards: ['captain'],
    };
    vi.mocked(api.getHistory).mockResolvedValue(coupResponse([four]));
    const { container } = render(<CoupHistory />);
    await screen.findByText('4 jogadores');
    const [li] = items(container);
    expect(li!.querySelector('.cph-out')!.textContent).toBe('saíram: Beto → Duda → Caio');
    expect(li!.getAttribute('aria-label')).toBe(
      `${dateText(AT_NEW)} · Ana tomou o poder com Capitão · jogaram Ana, Beto, Caio e Duda · saíram Beto, depois Duda, depois Caio`,
    );
  });

  it('a data mostra o ano', async () => {
    vi.mocked(api.getHistory).mockResolvedValue(coupResponse([NEWER]));
    const { container } = render(<CoupHistory />);
    await screen.findByText('3 jogadores');
    expect(container.querySelector('.cph-meta')!.textContent).toContain('2026');
  });

  it('sem partidas: convite curto', async () => {
    vi.mocked(api.getHistory).mockResolvedValue(coupResponse([]));
    render(<CoupHistory />);
    expect(await screen.findByText('Nenhuma partida de Cúpi ainda.')).toBeTruthy();
    expect(screen.getByText('Joguem uma e ela aparece aqui.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'ver mais' })).toBeNull();
  });

  it('"ver mais" busca a página seguinte e junta as partidas sem repetir', async () => {
    vi.mocked(api.getHistory)
      .mockResolvedValueOnce(coupResponse([NEWER], AT_NEW))
      // o servidor pode repetir uma partida na borda da página: não aparece duas vezes
      .mockResolvedValueOnce(coupResponse([NEWER, OLDER], null));
    const { container } = render(<CoupHistory />);
    fireEvent.click(await screen.findByRole('button', { name: 'ver mais' }));
    expect(api.getHistory).toHaveBeenLastCalledWith('coup', AT_NEW);
    await screen.findByText('2 jogadores');
    expect(items(container)).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'ver mais' })).toBeNull();
  });

  it('sem próxima página, não mostra "ver mais"', async () => {
    vi.mocked(api.getHistory).mockResolvedValue(coupResponse([NEWER, OLDER], null));
    render(<CoupHistory />);
    await screen.findByText('3 jogadores');
    expect(screen.queryByRole('button', { name: 'ver mais' })).toBeNull();
  });

  it('enquanto busca mais, o botão diz "carregando…" e segura o segundo clique', async () => {
    const more = deferred<CoupHistoryResponse | null>();
    vi.mocked(api.getHistory).mockResolvedValueOnce(coupResponse([NEWER], AT_NEW)).mockReturnValueOnce(more.promise);
    const { container } = render(<CoupHistory />);
    const button = await screen.findByRole('button', { name: 'ver mais' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(api.getHistory).toHaveBeenCalledTimes(2);
    expect(button.textContent).toBe('carregando…');
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await act(async () => more.resolve(coupResponse([OLDER], null)));
    expect(items(container)).toHaveLength(2);
  });

  it('loadMore chamado de novo antes do primeiro voltar é ignorado; stats fica null', async () => {
    const more = deferred<CoupHistoryResponse | null>();
    vi.mocked(api.getHistory).mockResolvedValueOnce(coupResponse([NEWER], AT_NEW)).mockReturnValueOnce(more.promise);
    const { result } = renderHook(() => useCoupHistory());
    await act(async () => {});
    expect(result.current.data?.nextBefore).toBe(AT_NEW);
    const { loadMore } = result.current;
    let first!: Promise<void>;
    act(() => {
      first = loadMore();
      void loadMore();
    });
    expect(api.getHistory).toHaveBeenCalledTimes(2);
    await act(async () => {
      more.resolve(coupResponse([OLDER], null));
      await first;
    });
    expect(result.current.data?.matches.map((m) => m.id)).toEqual(['c2', 'c1']);
    expect(result.current.data?.stats).toBeNull();
  });

  it('falha ao buscar mais: mensagem perto do botão, que continua lá', async () => {
    vi.mocked(api.getHistory)
      .mockResolvedValueOnce(coupResponse([NEWER], AT_NEW))
      .mockRejectedValueOnce(new Error('history_failed_500'));
    render(<CoupHistory />);
    fireEvent.click(await screen.findByRole('button', { name: 'ver mais' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe('Não deu pra carregar mais partidas. Tenta de novo.');
    expect(screen.getByRole('button', { name: 'ver mais' })).toBeTruthy();
  });

  it('erro na primeira carga: "tentar de novo" recarrega', async () => {
    vi.mocked(api.getHistory)
      .mockRejectedValueOnce(new Error('history_failed_500'))
      .mockResolvedValueOnce(coupResponse([NEWER]));
    render(<CoupHistory />);
    expect(await screen.findByText('não deu pra falar com o servidor')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'tentar de novo' }));
    expect(await screen.findByText('3 jogadores')).toBeTruthy();
    expect(screen.queryByText('não deu pra falar com o servidor')).toBeNull();
  });

  it('pedidos demais (429): "Calma!"', async () => {
    vi.mocked(api.getHistory).mockRejectedValue(new Error('history_failed_429'));
    render(<CoupHistory />);
    expect(await screen.findByText(TOO_MANY_MESSAGE)).toBeTruthy();
    expect(screen.queryByText('não deu pra falar com o servidor')).toBeNull();
    expect(screen.getByRole('button', { name: 'tentar de novo' })).toBeTruthy();
  });

  it('servidor sem histórico do Cúpi (null): avisa', async () => {
    vi.mocked(api.getHistory).mockResolvedValue(null);
    render(<CoupHistory />);
    expect(await screen.findByText('Esse jogo ainda não tem histórico.')).toBeTruthy();
  });

  it('ignora resposta antiga que chega depois (StrictMode roda o efeito duas vezes)', async () => {
    const old = deferred<CoupHistoryResponse | null>();
    vi.mocked(api.getHistory).mockReturnValueOnce(old.promise).mockResolvedValueOnce(coupResponse([NEWER]));
    render(
      <StrictMode>
        <CoupHistory />
      </StrictMode>,
    );
    expect(await screen.findByText('3 jogadores')).toBeTruthy();
    await act(async () => old.resolve(coupResponse([])));
    expect(screen.queryByText('Nenhuma partida de Cúpi ainda.')).toBeNull();
  });
});
