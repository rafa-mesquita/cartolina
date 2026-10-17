import type { DixitHistoryResponse } from '@cartolina/shared';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DixitHistory } from '../src/games/dixit/history/DixitHistory';
import * as api from '../src/net/api';
import { SAMPLE, dixitResponse } from './dixit-history-fixtures';

vi.mock('../src/net/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/net/api')>();
  return { ...actual, createRoom: vi.fn(), getHistory: vi.fn() };
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const heads = () => screen.getAllByRole('button').filter((b) => b.classList.contains('dxh-match-head'));

describe('aba histórico do Diquisti', () => {
  beforeEach(() => {
    vi.mocked(api.getHistory).mockReset();
    vi.mocked(api.createRoom).mockReset();
  });
  afterEach(() => {
    window.location.hash = '';
  });

  it('de cima pra baixo: a galera, as cartas famosas e as partidas (a mais recente primeiro)', async () => {
    vi.mocked(api.getHistory).mockResolvedValue(dixitResponse(SAMPLE));
    const { container } = render(<DixitHistory />);
    expect(await screen.findByRole('heading', { name: 'a galera' })).toBeTruthy();
    expect(api.getHistory).toHaveBeenCalledWith('dixit');
    const titles = [...container.querySelectorAll('h2')].map((h) => h.textContent);
    expect(titles).toEqual(['a galera', 'cartas famosas', 'partidas']);
    expect(within(screen.getByRole('region', { name: 'quem mais venceu' })).getByText('Ana')).toBeTruthy();
    expect(heads().map((h) => h.textContent?.includes('não terminou'))).toEqual([true, false]);
  });

  it('abrir uma partida mostra o placar final e as rodadas', async () => {
    vi.mocked(api.getHistory).mockResolvedValue(dixitResponse(SAMPLE));
    render(<DixitHistory />);
    await screen.findByRole('heading', { name: 'partidas' });
    fireEvent.click(heads()[1]!);
    const body = document.getElementById(heads()[1]!.getAttribute('aria-controls')!)!;
    expect(within(body).getByRole('heading', { name: 'placar final' })).toBeTruthy();
    expect(within(body).getByText('“luar”')).toBeTruthy();
  });

  it('clicar numa carta abre a carta ampliada com o rótulo; as setas navegam na faixa; Esc fecha', async () => {
    vi.mocked(api.getHistory).mockResolvedValue(dixitResponse(SAMPLE));
    render(<DixitHistory />);
    const fav = await screen.findByRole('region', { name: 'favoritas dos narradores' });
    fireEvent.click(within(fav).getAllByRole('button')[0]!);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-label')).toBe('favorita dos narradores · escolhida 1 vez');
    expect(dialog.querySelector('.dx-big img')!.getAttribute('src')).toContain('d001');
    fireEvent.keyDown(dialog, { key: 'ArrowRight' });
    // a próxima da mesma faixa (favoritas: d001, d005, d009)
    expect(screen.getByRole('dialog').querySelector('.dx-big img')!.getAttribute('src')).toContain('d005');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('rodinha pra cima numa carta também amplia', async () => {
    vi.mocked(api.getHistory).mockResolvedValue(dixitResponse(SAMPLE));
    render(<DixitHistory />);
    const wall = await screen.findByRole('region', { name: 'mural de dicas' });
    fireEvent.wheel(within(wall).getAllByRole('button')[1]!, { deltaY: -120 });
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('“luar” · Ana narrou');
  });

  it('sem partidas: convida a jogar a primeira', async () => {
    vi.mocked(api.getHistory).mockResolvedValue(dixitResponse([]));
    render(<DixitHistory />);
    expect(await screen.findByText('Ainda não tem partida de Diquisti. Bora jogar a primeira!')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'criar sala' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'a galera' })).toBeNull();
  });

  it('carregar mais traz as partidas seguintes e mantém as estatísticas da primeira página', async () => {
    vi.mocked(api.getHistory)
      .mockResolvedValueOnce(dixitResponse([SAMPLE[2]!], 5_000))
      .mockResolvedValueOnce(dixitResponse(SAMPLE.slice(0, 2), null, false));
    render(<DixitHistory />);
    fireEvent.click(await screen.findByRole('button', { name: 'carregar mais' }));
    await screen.findByText('Ana venceu');
    expect(api.getHistory).toHaveBeenLastCalledWith('dixit', 5_000);
    expect(heads()).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'a galera' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'carregar mais' })).toBeNull();
  });

  it('falha ao carregar mais: mensagem perto do botão, que continua lá', async () => {
    vi.mocked(api.getHistory)
      .mockResolvedValueOnce(dixitResponse([SAMPLE[2]!], 5_000))
      .mockRejectedValueOnce(new Error('history_failed_500'));
    render(<DixitHistory />);
    fireEvent.click(await screen.findByRole('button', { name: 'carregar mais' }));
    expect(await screen.findByText('Não deu pra carregar mais partidas. Tenta de novo.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'carregar mais' })).toBeTruthy();
  });

  it('erro na primeira carga: "tentar de novo" recarrega', async () => {
    vi.mocked(api.getHistory)
      .mockRejectedValueOnce(new Error('history_failed_500'))
      .mockResolvedValueOnce(dixitResponse(SAMPLE));
    render(<DixitHistory />);
    expect(await screen.findByText('não deu pra falar com o servidor')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'tentar de novo' }));
    expect(await screen.findByRole('heading', { name: 'a galera' })).toBeTruthy();
  });

  it('pedidos demais (429): "Calma!"', async () => {
    vi.mocked(api.getHistory).mockRejectedValue(new Error('history_failed_429'));
    render(<DixitHistory />);
    expect(await screen.findByText('Calma! Tenta de novo em um minutinho.')).toBeTruthy();
    expect(screen.queryByText('não deu pra falar com o servidor')).toBeNull();
  });

  it('mostra "carregando…" como status', () => {
    vi.mocked(api.getHistory).mockReturnValue(new Promise(() => {}));
    render(<DixitHistory />);
    expect(screen.getByRole('status').textContent).toBe('carregando…');
  });

  it('servidor sem histórico do Diquisti (null): avisa', async () => {
    vi.mocked(api.getHistory).mockResolvedValue(null);
    render(<DixitHistory />);
    expect(await screen.findByText('Esse jogo ainda não tem histórico.')).toBeTruthy();
  });

  it('ignora resposta antiga que chega depois (StrictMode roda o efeito duas vezes)', async () => {
    const old = deferred<DixitHistoryResponse | null>();
    vi.mocked(api.getHistory).mockReturnValueOnce(old.promise).mockResolvedValueOnce(dixitResponse(SAMPLE));
    render(
      <StrictMode>
        <DixitHistory />
      </StrictMode>,
    );
    expect(await screen.findByRole('heading', { name: 'a galera' })).toBeTruthy();
    await act(async () => old.resolve(dixitResponse([])));
    expect(screen.queryByText('Ainda não tem partida de Diquisti. Bora jogar a primeira!')).toBeNull();
  });
});
