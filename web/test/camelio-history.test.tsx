import {
  PLAYER_COLORS,
  type CamelioHistoryResponse,
  type CamelioMatchRecord,
  type CamelioPerson,
  type CamelioRecordPlay,
  type CamelioStats,
} from '@cartolina/shared';
import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CamelioHistory } from '../src/games/camelio/history/CamelioHistory';
import { givenText, joinNames, keyPlays, outcomeText, reasonText, winnersText } from '../src/games/camelio/history/texts';
import { useCamelioHistory } from '../src/games/camelio/history/useCamelioHistory';
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

const ANA: CamelioPerson = { name: 'Ana', color: PLAYER_COLORS[0] };
const BETO: CamelioPerson = { name: 'Beto', color: PLAYER_COLORS[1] };
const CAIO: CamelioPerson = { name: 'Caio', color: PLAYER_COLORS[2] };

const AT_NEW = new Date(2026, 9, 21, 21, 30).getTime();
const AT_OLD = new Date(2026, 9, 20, 20, 5).getTime();

const play = (p: Partial<CamelioRecordPlay> & Pick<CamelioRecordPlay, 'by' | 'to' | 'outcome'>): CamelioRecordPlay => ({
  from: 'open',
  card: { color: 'vermelho', spheres: 2, kind: 'normal' },
  sum: 2,
  ...p,
});

/** A mais nova (como o servidor manda primeiro): Ana chega a 3 cores. Beto tem 1 ponto, Caio 2. */
const NEWER: CamelioMatchRecord = {
  id: 'c2',
  matchId: 'LONA-1-2',
  roomCode: 'LONA',
  playedAt: AT_NEW,
  target: 3,
  endReason: 'target',
  players: [BETO, ANA, CAIO],
  winners: [1],
  final: [
    { colors: ['azul'], spheres: 3 },
    { colors: ['verde', 'amarelo', 'roxo'], spheres: 1 },
    { colors: ['laranja', 'vermelho'], spheres: 4 },
  ],
  plays: [
    play({ by: 1, to: 0, outcome: 'none' }),
    // Ana deu pra Beto, e Beto fechou o vermelho
    play({ by: 1, to: 0, outcome: 'scored', card: { color: 'vermelho', spheres: 5, kind: 'bicolor' }, sum: 5 }),
    play({ by: 2, to: 2, outcome: 'none' }),
    // Caio ficou com a carta e estourou o azul
    play({ by: 2, to: 2, outcome: 'bust', card: { color: 'azul', spheres: 4, kind: 'multi' }, sum: 7 }),
  ],
};
/** Vitória dividida porque o monte acabou. */
const OLDER: CamelioMatchRecord = {
  id: 'c1',
  matchId: 'LONA-1-1',
  roomCode: 'LONA',
  playedAt: AT_OLD,
  target: 4,
  endReason: 'deck',
  players: [ANA, BETO],
  winners: [0, 1],
  final: [
    { colors: ['verde'], spheres: 2 },
    { colors: ['azul'], spheres: 2 },
  ],
  plays: [play({ by: 0, to: 1, outcome: 'none' })],
};

const STATS: CamelioStats = {
  galera: [
    { ...ANA, wins: 2, matches: 2 },
    { ...BETO, wins: 1, matches: 2 },
    { ...CAIO, wins: 0, matches: 1 },
  ],
  domador: { holders: [ANA], count: 2 },
  sabotador: { holders: [ANA, BETO], count: 3 },
  palhaco: { holders: [CAIO], count: 1 },
  papaiNoel: null,
};

function response(matches: CamelioMatchRecord[], nextBefore: number | null = null, stats: CamelioStats | null = STATS): CamelioHistoryResponse {
  return { game: 'camelio', matches, stats, nextBefore };
}

const dateText = (ms: number) =>
  new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(
    new Date(ms),
  );

const items = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('li.cl-hx-match')];

describe('textos do histórico do Cama-Leão', () => {
  it('joinNames', () => {
    expect(joinNames([])).toBe('');
    expect(joinNames(['Ana'])).toBe('Ana');
    expect(joinNames(['Ana', 'Beto'])).toBe('Ana e Beto');
    expect(joinNames(['Ana', 'Beto', 'Caio'])).toBe('Ana, Beto e Caio');
  });

  it('winnersText e reasonText', () => {
    expect(winnersText(NEWER)).toBe('Ana venceu');
    expect(winnersText(OLDER)).toBe('Ana e Beto dividiram a vitória');
    expect(reasonText(NEWER)).toBe('chegou a 3 cores');
    expect(reasonText(OLDER)).toBe('o monte acabou');
  });

  it('keyPlays guarda só os lances que importam, com o número da jogada', () => {
    expect(keyPlays(NEWER).map((k) => k.n)).toEqual([2, 4]);
    expect(keyPlays(OLDER)).toEqual([]);
  });

  it('outcomeText nos 3 resultados e givenText', () => {
    const m = NEWER;
    expect(outcomeText(m, play({ by: 1, to: 0, outcome: 'scored' }))).toBe('Beto fechou o vermelho');
    expect(outcomeText(m, play({ by: 0, to: 2, outcome: 'bust', card: { color: 'azul', spheres: 3, kind: 'normal' }, sum: 7 }))).toBe(
      'Caio estourou o azul (7)',
    );
    expect(outcomeText(m, play({ by: 0, to: 1, outcome: 'lost', card: { color: 'verde', spheres: 1, kind: 'normal' }, sum: 6 }))).toBe(
      'Ana perdeu o ponto do verde (6)',
    );
    expect(givenText(m, play({ by: 1, to: 0, outcome: 'none' }))).toBe('Ana deu pra Beto');
    expect(givenText(m, play({ by: 2, to: 2, outcome: 'none' }))).toBe('Caio ficou com a carta');
  });
});

describe('aba histórico do Cama-Leão', () => {
  beforeEach(() => {
    vi.mocked(api.getHistory).mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('a página do jogo mostra o histórico do Cama-Leão na aba histórico', async () => {
    vi.mocked(api.getHistory).mockResolvedValue(response([NEWER]));
    const { container } = render(<GamePage game="camelio" tab="historico" />);
    await screen.findByText('3 jogadores');
    expect(api.getHistory).toHaveBeenCalledWith('camelio');
    expect(container.querySelector('.cl-history')).not.toBeNull();
    expect(screen.queryByText(/vem em breve/)).toBeNull();
  });

  it('mostra "carregando…" como status', () => {
    vi.mocked(api.getHistory).mockReturnValue(new Promise(() => {}));
    render(<CamelioHistory />);
    expect(screen.getByRole('status').textContent).toBe('carregando…');
  });

  it('cada partida: data, quem venceu e por quê', async () => {
    vi.mocked(api.getHistory).mockResolvedValue(response([NEWER, OLDER]));
    const { container } = render(<CamelioHistory />);
    await screen.findByText('3 jogadores');
    const [first, second] = items(container);
    expect(items(container)).toHaveLength(2);
    expect(within(first!).getByText(dateText(AT_NEW))).toBeTruthy();
    expect(within(first!).getByText('chegou a 3 cores')).toBeTruthy();
    expect(first!.querySelector('.cl-hx-winner')!.textContent).toBe('Ana venceu');
    expect(first!.querySelector('.cl-hx-winner .cl-hx-face')).not.toBeNull();
    expect(first!.getAttribute('aria-label')).toBe(`${dateText(AT_NEW)} · Ana venceu · chegou a 3 cores · jogaram Beto, Ana e Caio`);
    expect(second!.querySelector('.cl-hx-winner')!.textContent).toBe('Ana e Beto dividiram a vitória');
    expect(within(second!).getByText('o monte acabou')).toBeTruthy();
    expect(second!.getAttribute('aria-label')).toBe(`${dateText(AT_OLD)} · Ana e Beto dividiram a vitória · o monte acabou · jogaram Ana e Beto`);
  });

  it('o placar fica na ordem de pontos, com as bolinhas das cores e o vencedor marcado', async () => {
    vi.mocked(api.getHistory).mockResolvedValue(response([NEWER, OLDER]));
    const { container } = render(<CamelioHistory />);
    await screen.findByText('3 jogadores');
    const [first, second] = items(container);
    const rows = [...within(first!).getByRole('list', { name: 'placar' }).querySelectorAll<HTMLElement>(':scope > li')];
    expect(rows.map((r) => r.querySelector('.cl-hx-name')!.textContent)).toEqual(['Ana', 'Caio', 'Beto']);
    expect(rows.map((r) => r.querySelector('.cl-hx-pts')!.textContent)).toEqual(['3 pontos', '2 pontos', '1 ponto']);
    expect(rows.map((r) => r.classList.contains('cl-hx-won'))).toEqual([true, false, false]);
    const dots = [...rows[0]!.querySelectorAll<HTMLElement>('.cl-hx-dot')];
    expect(dots.map((d) => d.title)).toEqual(['verde', 'amarelo', 'roxo']);
    expect(dots[0]!.style.background).toBeTruthy();
    // vitória por pontos: não mostra as esferas na mesa
    expect(first!.textContent).not.toContain('na mesa');
    // fim pelo monte: empate fica na ordem dos assentos, com as esferas na mesa
    const old = [...within(second!).getByRole('list', { name: 'placar' }).querySelectorAll<HTMLElement>(':scope > li')];
    expect(old.map((r) => r.querySelector('.cl-hx-name')!.textContent)).toEqual(['Ana', 'Beto']);
    expect(old.every((r) => r.classList.contains('cl-hx-won'))).toBe(true);
    expect(old[0]!.textContent).toContain('2 esferas na mesa');
  });

  it('"ver os lances" abre a linha do tempo só com o que importa e fecha de novo', async () => {
    vi.mocked(api.getHistory).mockResolvedValue(response([NEWER, OLDER]));
    const { container } = render(<CamelioHistory />);
    await screen.findByText('3 jogadores');
    const [first, second] = items(container);
    const toggle = within(first!).getByRole('button', { name: 'ver os lances (2)' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(within(first!).queryByRole('list', { name: 'lances que importam' })).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.textContent).toBe('esconder os lances');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const timeline = within(first!).getByRole('list', { name: 'lances que importam' });
    const lis = [...timeline.querySelectorAll<HTMLElement>(':scope > li')];
    expect(lis).toHaveLength(2);
    expect(lis[0]!.classList.contains('cl-hx-scored')).toBe(true);
    expect(within(lis[0]!).getByText('2ª')).toBeTruthy();
    expect(within(lis[0]!).getByText('Ana deu pra Beto')).toBeTruthy();
    expect(within(lis[0]!).getByText('Beto fechou o vermelho')).toBeTruthy();
    const chip = lis[0]!.querySelector<HTMLElement>('.cl-hx-chip')!;
    expect(chip.textContent).toBe('5');
    expect(chip.title).toBe('5 esferas vermelho (bicolor)');
    expect(chip.querySelector('.cl-hx-kind-bicolor')).not.toBeNull();
    expect(chip.style.background).toBeTruthy();
    expect(lis[1]!.classList.contains('cl-hx-bust')).toBe(true);
    expect(within(lis[1]!).getByText('Caio ficou com a carta')).toBeTruthy();
    expect(within(lis[1]!).getByText('Caio estourou o azul (7)')).toBeTruthy();
    expect(lis[1]!.querySelector('.cl-hx-kind-multi')).not.toBeNull();
    fireEvent.click(toggle);
    expect(toggle.textContent).toBe('ver os lances (2)');
    expect(within(first!).queryByRole('list', { name: 'lances que importam' })).toBeNull();
    // partida sem lance marcante
    fireEvent.click(within(second!).getByRole('button', { name: 'ver os lances (0)' }));
    expect(within(second!).getByText('nenhum lance marcante')).toBeTruthy();
  });

  it('a galera: os quatro títulos, "ninguém ainda" no título vazio e a lista de vitórias', async () => {
    vi.mocked(api.getHistory).mockResolvedValue(response([NEWER]));
    render(<CamelioHistory />);
    const galera = (await screen.findByRole('heading', { name: 'a galera' })).closest('section')!;
    const title = (name: string) => within(galera).getByRole('region', { name });
    expect(within(title('domador')).getByText('Ana')).toBeTruthy();
    expect(within(title('domador')).getByText('2 vitórias')).toBeTruthy();
    expect(within(title('domador')).getByText('mais vitórias')).toBeTruthy();
    expect(within(title('sabotador')).getByText('Ana e Beto')).toBeTruthy();
    expect(within(title('sabotador')).getByText('3 vezes')).toBeTruthy();
    expect(title('sabotador').querySelectorAll('.cl-hx-face')).toHaveLength(2);
    expect(within(title('palhaço')).getByText('Caio')).toBeTruthy();
    expect(within(title('palhaço')).getByText('1 vez')).toBeTruthy();
    expect(within(title('Papai Noel')).getByText('ninguém ainda')).toBeTruthy();
    const wins = within(galera).getByRole('list', { name: 'vitórias' });
    expect([...wins.querySelectorAll('li b')].map((b) => b.textContent)).toEqual(['Ana', 'Beto', 'Caio']);
    expect(within(wins).getByText('2 vitórias em 2 partidas')).toBeTruthy();
    expect(within(wins).getByText('1 vitória em 2 partidas')).toBeTruthy();
    expect(within(wins).getByText('0 vitórias em 1 partida')).toBeTruthy();
  });

  it('sem partidas: o picadeiro vazio, sem galera nem "carregar mais"', async () => {
    vi.mocked(api.getHistory).mockResolvedValue(response([], null, { galera: [], domador: null, sabotador: null, palhaco: null, papaiNoel: null }));
    render(<CamelioHistory />);
    expect(await screen.findByText('Nenhuma partida de Cama-Leão ainda.')).toBeTruthy();
    expect(screen.getByText('O picadeiro está vazio. Joguem uma e ela aparece aqui.')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'a galera' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'carregar mais' })).toBeNull();
  });

  it('"carregar mais" busca a página seguinte, junta sem repetir e mantém a galera', async () => {
    vi.mocked(api.getHistory)
      .mockResolvedValueOnce(response([NEWER], AT_NEW, STATS))
      // o servidor pode repetir uma partida na borda da página: não aparece duas vezes
      .mockResolvedValueOnce(response([NEWER, OLDER], null, null));
    const { container } = render(<CamelioHistory />);
    fireEvent.click(await screen.findByRole('button', { name: 'carregar mais' }));
    expect(api.getHistory).toHaveBeenLastCalledWith('camelio', AT_NEW);
    await screen.findByText('2 jogadores');
    expect(items(container)).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'carregar mais' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'a galera' })).toBeTruthy();
  });

  it('enquanto busca mais, o botão diz "carregando…" e segura o segundo clique', async () => {
    const more = deferred<CamelioHistoryResponse | null>();
    vi.mocked(api.getHistory).mockResolvedValueOnce(response([NEWER], AT_NEW)).mockReturnValueOnce(more.promise);
    const { container } = render(<CamelioHistory />);
    const button = await screen.findByRole('button', { name: 'carregar mais' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(api.getHistory).toHaveBeenCalledTimes(2);
    expect(button.textContent).toBe('carregando…');
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await act(async () => more.resolve(response([OLDER], null, null)));
    expect(items(container)).toHaveLength(2);
  });

  it('loadMore chamado de novo antes do primeiro voltar é ignorado; a galera da primeira página fica', async () => {
    const more = deferred<CamelioHistoryResponse | null>();
    vi.mocked(api.getHistory).mockResolvedValueOnce(response([NEWER], AT_NEW, STATS)).mockReturnValueOnce(more.promise);
    const { result } = renderHook(() => useCamelioHistory());
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
    expect(result.current.data?.matches.map((m) => m.id)).toEqual(['c2', 'c1']);
    expect(result.current.data?.stats).toEqual(STATS);
  });

  it('falha ao buscar mais: mensagem perto do botão, que continua lá', async () => {
    vi.mocked(api.getHistory).mockResolvedValueOnce(response([NEWER], AT_NEW)).mockRejectedValueOnce(new Error('history_failed_500'));
    render(<CamelioHistory />);
    fireEvent.click(await screen.findByRole('button', { name: 'carregar mais' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Não deu pra carregar mais partidas. Tenta de novo.');
    expect(screen.getByRole('button', { name: 'carregar mais' })).toBeTruthy();
  });

  it('erro na primeira carga: "tentar de novo" recarrega', async () => {
    vi.mocked(api.getHistory).mockRejectedValueOnce(new Error('history_failed_500')).mockResolvedValueOnce(response([NEWER]));
    render(<CamelioHistory />);
    expect(await screen.findByText('não deu pra falar com o servidor')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'tentar de novo' }));
    expect(await screen.findByText('3 jogadores')).toBeTruthy();
    expect(screen.queryByText('não deu pra falar com o servidor')).toBeNull();
  });

  it('pedidos demais (429): "Calma!"', async () => {
    vi.mocked(api.getHistory).mockRejectedValue(new Error('history_failed_429'));
    render(<CamelioHistory />);
    expect(await screen.findByText(TOO_MANY_MESSAGE)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'tentar de novo' })).toBeTruthy();
  });

  it('servidor sem histórico do Cama-Leão (null): avisa', async () => {
    vi.mocked(api.getHistory).mockResolvedValue(null);
    render(<CamelioHistory />);
    expect(await screen.findByText('Esse jogo ainda não tem histórico.')).toBeTruthy();
  });

  it('ignora resposta antiga que chega depois (StrictMode roda o efeito duas vezes)', async () => {
    const old = deferred<CamelioHistoryResponse | null>();
    vi.mocked(api.getHistory).mockReturnValueOnce(old.promise).mockResolvedValueOnce(response([NEWER]));
    render(
      <StrictMode>
        <CamelioHistory />
      </StrictMode>,
    );
    expect(await screen.findByText('3 jogadores')).toBeTruthy();
    await act(async () => old.resolve(response([])));
    expect(screen.queryByText('Nenhuma partida de Cama-Leão ainda.')).toBeNull();
  });
});

