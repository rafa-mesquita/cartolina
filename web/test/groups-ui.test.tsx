import { summarizeHistory, type GroupResponse, type RoundRecord } from '@cartolina/shared';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from '../src/net/api';
import { loadGroups, rememberGroup } from '../src/net/identity';
import { GroupPage } from '../src/screens/GroupPage';
import { Home } from '../src/screens/Home';

vi.mock('../src/net/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/net/api')>();
  return { ...actual, createGroup: vi.fn(), getGroup: vi.fn(), createGroupRoom: vi.fn() };
});

afterEach(() => {
  vi.mocked(api.createGroup).mockReset();
  vi.mocked(api.getGroup).mockReset();
  vi.mocked(api.createGroupRoom).mockReset();
  vi.restoreAllMocks();
  window.location.hash = '';
});

/** Promessa que o teste resolve quando quiser (pra simular respostas fora de ordem). */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('Home: grupos', () => {
  it('cria grupo, lembra dele e vai para a página do grupo', async () => {
    const spy = vi.mocked(api.createGroup).mockResolvedValue({ slug: 'abcdefghjk', name: 'Galera' });
    render(<Home />);
    fireEvent.change(screen.getByLabelText('nome do grupo'), { target: { value: ' Galera ' } });
    fireEvent.click(screen.getByRole('button', { name: 'criar grupo' }));
    await waitFor(() => expect(window.location.hash).toBe('#/g/abcdefghjk'));
    expect(spy).toHaveBeenCalledWith('Galera');
    expect(loadGroups()[0]).toEqual({ slug: 'abcdefghjk', name: 'Galera' });
  });

  it('nome vazio mostra erro', () => {
    render(<Home />);
    fireEvent.click(screen.getByRole('button', { name: 'criar grupo' }));
    expect(screen.getByText('Dá um nome pro grupo (até 40 letras).')).toBeTruthy();
  });

  it('mostra "criando…" enquanto cria o grupo', async () => {
    const d = deferred<{ slug: string; name: string }>();
    vi.mocked(api.createGroup).mockReturnValue(d.promise);
    render(<Home />);
    fireEvent.change(screen.getByLabelText('nome do grupo'), { target: { value: 'Galera' } });
    fireEvent.click(screen.getByRole('button', { name: 'criar grupo' }));
    const busy = await screen.findByRole('button', { name: 'criando…' });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    await act(async () => d.resolve({ slug: 'abcdefghjk', name: 'Galera' }));
  });

  it('servidor recusa o nome (400): "Nome inválido."', async () => {
    vi.mocked(api.createGroup).mockRejectedValue(new Error('group_create_failed_400'));
    render(<Home />);
    fireEvent.change(screen.getByLabelText('nome do grupo'), { target: { value: 'Galera' } });
    fireEvent.click(screen.getByRole('button', { name: 'criar grupo' }));
    expect(await screen.findByText('Nome inválido.')).toBeTruthy();
  });

  it('outros erros ao criar grupo: mensagem genérica', async () => {
    vi.mocked(api.createGroup).mockRejectedValue(new Error('group_create_failed_500'));
    render(<Home />);
    fireEvent.change(screen.getByLabelText('nome do grupo'), { target: { value: 'Galera' } });
    fireEvent.click(screen.getByRole('button', { name: 'criar grupo' }));
    expect(await screen.findByText('Não deu pra criar o grupo. O servidor tá ligado?')).toBeTruthy();
  });

  it('lista os grupos lembrados como links', () => {
    rememberGroup({ slug: 'abcdefghjk', name: 'Galera' });
    render(<Home />);
    expect(screen.getByRole('link', { name: 'Galera' }).getAttribute('href')).toBe('#/g/abcdefghjk');
  });
});

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

function response(rounds: RoundRecord[], nextBefore: number | null, name = 'Galera'): GroupResponse {
  return { group: { slug: 'abcdefghjk', name, createdAt: 0 }, rounds, stats: summarizeHistory(rounds), nextBefore };
}

describe('GroupPage', () => {
  it('mostra números, partidas e expande a fila revelada', async () => {
    vi.mocked(api.getGroup).mockResolvedValue(response([ROUND('r1', 2000)], null));
    render(<GroupPage slug="abcdefghjk" />);
    expect(await screen.findByRole('heading', { name: 'Galera' })).toBeTruthy();
    expect(screen.getByText('rodadas').parentElement!.textContent).toContain('1');
    const head = screen.getByRole('button', { name: /Lugares que você quer visitar/ });
    expect(head.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(head);
    expect(head.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Cracolândia')).toBeTruthy();
    expect(screen.getByText('Paris')).toBeTruthy();
    const body = document.getElementById(head.getAttribute('aria-controls')!);
    expect(body?.textContent).toContain('Cracolândia');
    expect(loadGroups()[0]).toEqual({ slug: 'abcdefghjk', name: 'Galera' });
  });

  it('jogadores com o mesmo nome não quebram a lista', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const players = [
      { name: 'Ana', color: '#8EC5FF' as const },
      { name: 'Ana', color: '#FF8FAB' as const },
    ];
    vi.mocked(api.getGroup).mockResolvedValue(response([ROUND('r1', 2000, { players })], null));
    render(<GroupPage slug="abcdefghjk" />);
    await screen.findByRole('heading', { name: 'Galera' });
    expect(err.mock.calls.some((c) => String(c[0]).includes('same key'))).toBe(false);
  });

  it('carrega mais partidas com o cursor (páginas seguintes sem estatísticas)', async () => {
    const spy = vi
      .mocked(api.getGroup)
      .mockResolvedValueOnce(response([ROUND('r2', 3000)], 3000))
      .mockResolvedValueOnce({
        ...response([ROUND('r1', 1000, { theme: { titulo: 'Comidas', min: 'a', max: 'b' } })], null),
        stats: null,
      });
    render(<GroupPage slug="abcdefghjk" />);
    fireEvent.click(await screen.findByRole('button', { name: 'carregar mais' }));
    expect(await screen.findByRole('button', { name: /Comidas/ })).toBeTruthy();
    expect(spy).toHaveBeenLastCalledWith('abcdefghjk', 3000);
    expect(screen.queryByRole('button', { name: 'carregar mais' })).toBeNull();
    expect(screen.getByText('rodadas').parentElement!.textContent).toContain('1');
  });

  it('falha ao carregar mais: mensagem perto do botão, que continua lá', async () => {
    vi.mocked(api.getGroup)
      .mockResolvedValueOnce(response([ROUND('r2', 3000)], 3000))
      .mockRejectedValueOnce(new Error('group_failed_500'));
    render(<GroupPage slug="abcdefghjk" />);
    fireEvent.click(await screen.findByRole('button', { name: 'carregar mais' }));
    expect(await screen.findByText('Não deu pra carregar mais partidas. Tenta de novo.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'carregar mais' })).toBeTruthy();
  });

  it('página seguinte some (null): mensagem de erro', async () => {
    vi.mocked(api.getGroup).mockResolvedValueOnce(response([ROUND('r2', 3000)], 3000)).mockResolvedValueOnce(null);
    render(<GroupPage slug="abcdefghjk" />);
    fireEvent.click(await screen.findByRole('button', { name: 'carregar mais' }));
    expect(await screen.findByText('Não achei mais partidas desse grupo.')).toBeTruthy();
  });

  it('sem estatísticas na primeira página, esconde os números', async () => {
    vi.mocked(api.getGroup).mockResolvedValue({ ...response([ROUND('r1', 2000)], null), stats: null });
    render(<GroupPage slug="abcdefghjk" />);
    await screen.findByRole('heading', { name: 'Galera' });
    expect(screen.queryByRole('heading', { name: 'números' })).toBeNull();
    expect(screen.getByRole('button', { name: /Lugares que você quer visitar/ })).toBeTruthy();
  });

  it('erro no primeiro carregamento: "tentar de novo" recarrega', async () => {
    vi.mocked(api.getGroup).mockRejectedValueOnce(new Error('group_failed_500')).mockResolvedValueOnce(response([], null));
    render(<GroupPage slug="abcdefghjk" />);
    fireEvent.click(await screen.findByRole('button', { name: 'tentar de novo' }));
    expect(await screen.findByRole('heading', { name: 'Galera' })).toBeTruthy();
  });

  it('mostra "carregando…" como status', () => {
    vi.mocked(api.getGroup).mockReturnValue(new Promise(() => {}));
    render(<GroupPage slug="abcdefghjk" />);
    expect(screen.getByRole('status').textContent).toBe('carregando…');
  });

  it('ignora resposta antiga que chega depois (StrictMode roda o efeito duas vezes)', async () => {
    const old = deferred<GroupResponse | null>();
    vi.mocked(api.getGroup).mockReturnValueOnce(old.promise).mockResolvedValueOnce(response([], null, 'Galera'));
    render(
      <StrictMode>
        <GroupPage slug="abcdefghjk" />
      </StrictMode>,
    );
    expect(await screen.findByRole('heading', { name: 'Galera' })).toBeTruthy();
    await act(async () => old.resolve(response([], null, 'Velho')));
    expect(screen.queryByRole('heading', { name: 'Velho' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Galera' })).toBeTruthy();
  });

  it('cria sala do grupo e vai pra ela', async () => {
    vi.mocked(api.getGroup).mockResolvedValue(response([], null));
    vi.mocked(api.createGroupRoom).mockResolvedValue('KXQ7');
    render(<GroupPage slug="abcdefghjk" />);
    fireEvent.click(await screen.findByRole('button', { name: 'criar sala do grupo' }));
    await waitFor(() => expect(window.location.hash).toBe('#/sala/KXQ7'));
    expect(screen.getByText('Nenhuma partida ainda. Crie uma sala do grupo e bora jogar!')).toBeTruthy();
  });

  it('falha ao criar sala do grupo: mensagem perto do botão', async () => {
    vi.mocked(api.getGroup).mockResolvedValue(response([], null));
    vi.mocked(api.createGroupRoom).mockRejectedValue(new Error('create_failed_500'));
    render(<GroupPage slug="abcdefghjk" />);
    fireEvent.click(await screen.findByRole('button', { name: 'criar sala do grupo' }));
    expect(await screen.findByText('Não deu pra criar a sala. Tenta de novo.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'criar sala do grupo' })).toBeTruthy();
  });

  it('sem clipboard: pede pra copiar da barra de endereço', async () => {
    vi.mocked(api.getGroup).mockResolvedValue(response([], null));
    render(<GroupPage slug="abcdefghjk" />);
    fireEvent.click(await screen.findByRole('button', { name: 'copiar link do grupo' }));
    const msg = await screen.findByText('copia o link da barra de endereço');
    expect(msg.getAttribute('aria-live')).toBe('polite');
  });

  it('grupo inexistente', async () => {
    vi.mocked(api.getGroup).mockResolvedValue(null);
    render(<GroupPage slug="abcdefghjk" />);
    expect(await screen.findByText('grupo não encontrado')).toBeTruthy();
  });
});
