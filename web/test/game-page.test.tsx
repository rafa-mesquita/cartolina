import { summarizeHistory, type HistoryResponse, type RoundRecord } from '@cartolina/shared';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../src/net/api';
import { GamePage } from '../src/screens/GamePage';

vi.mock('../src/net/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/net/api')>();
  return { ...actual, createRoom: vi.fn(), getHistory: vi.fn() };
});

/** Promessa que o teste resolve quando quiser (pra simular respostas fora de ordem). */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const ROUND = (id: string, playedAt: number, over: Partial<RoundRecord> = {}): RoundRecord => ({
  id,
  roomCode: 'KXQ7',
  playedAt,
  mode: 'livre',
  level: 1,
  outcome: 'round_lost',
  errors: 1,
  campaignId: null,
  theme: { titulo: 'Lugares que você quer visitar', min: 'nunca iria', max: 'sonho de vida' },
  players: [
    { name: 'Ana', color: '#8EC5FF' },
    { name: 'Bia', color: '#FF8FAB' },
  ],
  cards: [
    { name: 'Ana', color: '#8EC5FF', value: 60, clue: 'Paris', error: false },
    { name: 'Bia', color: '#FF8FAB', value: 12, clue: 'Cracolândia', error: true },
  ],
  ...over,
});

function response(rounds: RoundRecord[], nextBefore: number | null): HistoryResponse {
  return { game: 'ito', rounds, stats: summarizeHistory(rounds), nextBefore };
}

describe('GamePage', () => {
  beforeEach(() => {
    vi.mocked(api.createRoom).mockReset();
    vi.mocked(api.getHistory).mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    window.location.hash = '';
  });

  describe('aba jogar', () => {
    it('criar sala do jogo, como jogar e voltar pros jogos', async () => {
      vi.mocked(api.createRoom).mockResolvedValue('KXQ7');
      render(<GamePage game="ito" tab="jogar" />);
      expect(screen.getByRole('heading', { name: 'DITU' })).toBeTruthy();
      expect(screen.getByText(/número secreto de 1 a 100/)).toBeTruthy();
      expect(screen.getByRole('link', { name: '← jogos' }).getAttribute('href')).toBe('#/');
      fireEvent.click(screen.getByRole('button', { name: 'criar sala' }));
      await waitFor(() => expect(window.location.hash).toBe('#/sala/KXQ7'));
      expect(api.createRoom).toHaveBeenCalledWith('ito');
    });

    it('as seções são links de navegação com a rota de cada uma; a atual tem aria-current', () => {
      render(<GamePage game="ito" tab="jogar" />);
      const nav = screen.getByRole('navigation', { name: 'seções do jogo' });
      expect(nav.querySelector('[role=tab], [role=tablist]')).toBeNull();
      expect(screen.getByRole('link', { name: 'jogar' }).getAttribute('aria-current')).toBe('page');
      const hist = screen.getByRole('link', { name: 'histórico' });
      expect(hist.getAttribute('href')).toBe('#/ito/historico');
      expect(hist.hasAttribute('aria-current')).toBe(false);
    });

    it('abas e "← jogos" pedem o som de clique (links só soam com data-sound)', () => {
      render(<GamePage game="ito" tab="jogar" />);
      for (const name of ['jogar', 'histórico', '← jogos']) {
        expect(screen.getByRole('link', { name }).getAttribute('data-sound')).toBe('click');
      }
    });

    it('entrar com código vai pra sala', () => {
      render(<GamePage game="ito" tab="jogar" />);
      fireEvent.change(screen.getByLabelText('código da sala'), { target: { value: 'kxq7' } });
      fireEvent.click(screen.getByRole('button', { name: 'entrar na sala' }));
      expect(window.location.hash).toBe('#/sala/KXQ7');
    });

    it('código com tamanho errado mostra erro e não sai da página', () => {
      render(<GamePage game="ito" tab="jogar" />);
      fireEvent.change(screen.getByLabelText('código da sala'), { target: { value: 'ab' } });
      fireEvent.click(screen.getByRole('button', { name: 'entrar na sala' }));
      expect(screen.getByText('O código da sala tem 4 letras.')).toBeTruthy();
      expect(window.location.hash).toBe('');
    });

    it('mostra "criando…" enquanto cria a sala', async () => {
      const d = deferred<string>();
      vi.mocked(api.createRoom).mockReturnValue(d.promise);
      render(<GamePage game="ito" tab="jogar" />);
      fireEvent.click(screen.getByRole('button', { name: 'criar sala' }));
      const busy = await screen.findByRole('button', { name: 'criando…' });
      expect((busy as HTMLButtonElement).disabled).toBe(true);
      await act(async () => d.resolve('KXQ7'));
    });

    it('falha ao criar sala: mensagem perto do botão, que continua lá', async () => {
      vi.mocked(api.createRoom).mockRejectedValue(new Error('create_failed_500'));
      render(<GamePage game="ito" tab="jogar" />);
      fireEvent.click(screen.getByRole('button', { name: 'criar sala' }));
      expect(await screen.findByText('Não deu pra criar a sala. Tenta de novo.')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'criar sala' })).toBeTruthy();
    });

    it('pedidos demais (429): pede calma', async () => {
      vi.mocked(api.createRoom).mockRejectedValue(new Error('create_failed_429'));
      render(<GamePage game="ito" tab="jogar" />);
      fireEvent.click(screen.getByRole('button', { name: 'criar sala' }));
      expect((await screen.findByRole('alert')).textContent).toBe('Calma! Tenta de novo em um minutinho.');
    });
  });

  describe('aba histórico', () => {
    it('números e partidas do jogo; expande a fila revelada', async () => {
      vi.mocked(api.getHistory).mockResolvedValue(response([ROUND('r1', 2000)], null));
      render(<GamePage game="ito" tab="historico" />);
      expect(await screen.findByText('rodadas')).toBeTruthy();
      expect(api.getHistory).toHaveBeenCalledWith('ito');
      expect(screen.queryByText(/grupo/i)).toBeNull();
      expect(screen.getByText('rodadas').parentElement!.textContent).toContain('1');
      const head = screen.getByRole('button', { name: /Lugares que você quer visitar/ });
      expect(head.getAttribute('aria-expanded')).toBe('false');
      fireEvent.click(head);
      expect(head.getAttribute('aria-expanded')).toBe('true');
      expect(screen.getByText('Cracolândia')).toBeTruthy();
      expect(screen.getByText('Paris')).toBeTruthy();
      const body = document.getElementById(head.getAttribute('aria-controls')!);
      expect(body?.textContent).toContain('Cracolândia');
    });

    it('histórico vazio convida a jogar, com link pra aba jogar', async () => {
      vi.mocked(api.getHistory).mockResolvedValue(response([], null));
      render(<GamePage game="ito" tab="historico" />);
      expect(await screen.findByText(/Nenhuma partida ainda/)).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Crie uma sala' }).getAttribute('href')).toBe('#/ito');
    });

    it('jogadores com o mesmo nome não quebram a lista', async () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      const players = [
        { name: 'Ana', color: '#8EC5FF' as const },
        { name: 'Ana', color: '#FF8FAB' as const },
      ];
      vi.mocked(api.getHistory).mockResolvedValue(response([ROUND('r1', 2000, { players })], null));
      render(<GamePage game="ito" tab="historico" />);
      await screen.findByText('rodadas');
      expect(err.mock.calls.some((c) => String(c[0]).includes('same key'))).toBe(false);
    });

    it('carrega mais partidas com o cursor (páginas seguintes sem estatísticas)', async () => {
      const spy = vi
        .mocked(api.getHistory)
        .mockResolvedValueOnce(response([ROUND('r2', 3000)], 3000))
        .mockResolvedValueOnce({
          ...response([ROUND('r1', 1000, { theme: { titulo: 'Comidas', min: 'a', max: 'b' } })], null),
          stats: null,
        });
      render(<GamePage game="ito" tab="historico" />);
      fireEvent.click(await screen.findByRole('button', { name: 'carregar mais' }));
      expect(await screen.findByRole('button', { name: /Comidas/ })).toBeTruthy();
      expect(spy).toHaveBeenLastCalledWith('ito', 3000);
      expect(screen.queryByRole('button', { name: 'carregar mais' })).toBeNull();
      expect(screen.getByText('rodadas').parentElement!.textContent).toContain('1');
    });

    it('falha ao carregar mais: mensagem perto do botão, que continua lá', async () => {
      vi.mocked(api.getHistory)
        .mockResolvedValueOnce(response([ROUND('r2', 3000)], 3000))
        .mockRejectedValueOnce(new Error('history_failed_500'));
      render(<GamePage game="ito" tab="historico" />);
      fireEvent.click(await screen.findByRole('button', { name: 'carregar mais' }));
      expect(await screen.findByText('Não deu pra carregar mais partidas. Tenta de novo.')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'carregar mais' })).toBeTruthy();
    });

    it('página seguinte some (null): mensagem de erro', async () => {
      vi.mocked(api.getHistory).mockResolvedValueOnce(response([ROUND('r2', 3000)], 3000)).mockResolvedValueOnce(null);
      render(<GamePage game="ito" tab="historico" />);
      fireEvent.click(await screen.findByRole('button', { name: 'carregar mais' }));
      expect(await screen.findByText('Não achei mais partidas.')).toBeTruthy();
    });

    it('sem estatísticas na primeira página, esconde os números', async () => {
      vi.mocked(api.getHistory).mockResolvedValue({ ...response([ROUND('r1', 2000)], null), stats: null });
      render(<GamePage game="ito" tab="historico" />);
      await screen.findByRole('button', { name: /Lugares que você quer visitar/ });
      expect(screen.queryByRole('heading', { name: 'números' })).toBeNull();
    });

    it('erro no primeiro carregamento: "tentar de novo" recarrega', async () => {
      vi.mocked(api.getHistory)
        .mockRejectedValueOnce(new Error('history_failed_500'))
        .mockResolvedValueOnce(response([ROUND('r1', 2000)], null));
      render(<GamePage game="ito" tab="historico" />);
      fireEvent.click(await screen.findByRole('button', { name: 'tentar de novo' }));
      expect(await screen.findByText('rodadas')).toBeTruthy();
    });

    it('mostra "carregando…" como status', () => {
      vi.mocked(api.getHistory).mockReturnValue(new Promise(() => {}));
      render(<GamePage game="ito" tab="historico" />);
      expect(screen.getByRole('status').textContent).toBe('carregando…');
    });

    it('ignora resposta antiga que chega depois (StrictMode roda o efeito duas vezes)', async () => {
      const comTema = (titulo: string) => ROUND('r1', 2000, { theme: { titulo, min: 'a', max: 'b' } });
      const old = deferred<HistoryResponse | null>();
      vi.mocked(api.getHistory).mockReturnValueOnce(old.promise).mockResolvedValueOnce(response([comTema('Atual')], null));
      render(
        <StrictMode>
          <GamePage game="ito" tab="historico" />
        </StrictMode>,
      );
      expect(await screen.findByRole('button', { name: /Atual/ })).toBeTruthy();
      await act(async () => old.resolve(response([comTema('Velho')], null)));
      expect(screen.queryByRole('button', { name: /Velho/ })).toBeNull();
      expect(screen.getByRole('button', { name: /Atual/ })).toBeTruthy();
    });

    it('servidor sem histórico pra esse jogo (null): avisa', async () => {
      vi.mocked(api.getHistory).mockResolvedValue(null);
      render(<GamePage game="ito" tab="historico" />);
      expect(await screen.findByText('Esse jogo ainda não tem histórico.')).toBeTruthy();
    });
  });

  it('Diquisti (o Dixit): jogar cria sala de dixit; o histórico diz "em breve" e não chama o servidor', async () => {
    vi.mocked(api.createRoom).mockResolvedValue('DXQ7');
    const { rerender } = render(<GamePage game="dixit" tab="jogar" />);
    expect(screen.getByRole('heading', { name: 'Diquisti' })).toBeTruthy();
    expect(screen.queryByText(/tá chegando/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'criar sala' }));
    await waitFor(() => expect(window.location.hash).toBe('#/sala/DXQ7'));
    expect(api.createRoom).toHaveBeenCalledWith('dixit');
    rerender(<GamePage game="dixit" tab="historico" />);
    expect(screen.getByText(/histórico do Diquisti vem em breve/)).toBeTruthy();
    expect(api.getHistory).not.toHaveBeenCalled();
  });

  it('link antigo de grupo mostra um aviso', async () => {
    vi.mocked(api.getHistory).mockResolvedValue(response([], null));
    render(<GamePage game="ito" tab="historico" legacy />);
    expect(screen.getByText(/grupos acabaram/)).toBeTruthy();
    expect(await screen.findByText(/Nenhuma partida ainda/)).toBeTruthy();
  });

  it('pedidos demais (429) no histórico: "Calma!", e não "não deu pra falar com o servidor"', async () => {
    vi.mocked(api.getHistory).mockRejectedValue(new Error('history_failed_429'));
    render(<GamePage game="ito" tab="historico" />);
    expect(await screen.findByText('Calma! Tenta de novo em um minutinho.')).toBeTruthy();
    expect(screen.queryByText('não deu pra falar com o servidor')).toBeNull();
    expect(screen.getByRole('button', { name: 'tentar de novo' })).toBeTruthy();
  });
});
