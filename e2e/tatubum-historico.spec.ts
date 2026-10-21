import { expect, test, type Page } from '@playwright/test';
import { closePlayers, newPlayer } from './helpers';

test.afterEach(closePlayers);

const SERVER = 'http://127.0.0.1:8787';

/**
 * Duas pessoas (`names`) jogam uma partida inteira de Tatubum por WebSocket, de dentro da página, só comprando: quem tira
 * o Tatubum joga o Desarme e o esconde no topo, até alguém não ter mais Desarme e explodir. Devolve o nome do vencedor.
 */
async function playKittensMatchDirect(page: Page, names: [string, string]): Promise<string> {
  return page.evaluate(
    async ({ server, names }) => {
      interface View {
        seats: { id: string; name: string }[];
        game: {
          phase: string;
          current: string | null;
          hand: string[];
          pending: unknown;
          choice: { kind: string; who?: string } | null;
          winner: string | null;
        };
      }
      interface Client {
        ws: WebSocket;
        id: string;
        view: View | null;
        /** Chegou estado novo desde a última ação. */
        fresh: boolean;
      }
      const res = await fetch(`${server}/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game: 'kittens' }),
      });
      const { code } = (await res.json()) as { code: string };
      const connect = (name: string, color: string) =>
        new Promise<Client>((resolve, reject) => {
          const client: Client = { ws: new WebSocket(`${server.replace(/^http/, 'ws')}/rooms/${code}/ws`), id: '', view: null, fresh: false };
          client.ws.onmessage = (e) => {
            const msg = JSON.parse(String(e.data)) as { t: string; playerId?: string; room?: View };
            if (msg.t === 'welcome' && msg.playerId) {
              client.id = msg.playerId;
              resolve(client);
            }
            if (msg.t === 'state' && msg.room) {
              client.view = msg.room;
              client.fresh = true;
            }
          };
          client.ws.onerror = () => reject(new Error('websocket falhou'));
          client.ws.onopen = () => client.ws.send(JSON.stringify({ t: 'join', token: crypto.randomUUID(), name, color }));
        });
      const send = (c: Client, action: Record<string, unknown>) => c.ws.send(JSON.stringify({ t: 'action', action }));

      // Em sequência: quem entra primeiro é o host.
      const all = [await connect(names[0], '#8EC5FF'), await connect(names[1], '#FF8FAB')];
      for (let i = 0; i < 200 && !all.every((c) => c.view?.seats.length === 2); i++) await new Promise((r) => setTimeout(r, 50));
      send(all[0]!, { type: 'start' });
      for (let step = 0; step < 2000; step++) {
        const over = all.find((c) => c.view?.game.phase === 'gameover');
        if (over) {
          const winner = over.view!.seats.find((s) => s.id === over.view!.game.winner)!.name;
          for (const c of all) c.ws.close();
          return winner;
        }
        for (const c of all) {
          const g = c.view?.game;
          if (!c.fresh || !g || g.phase !== 'playing') continue;
          const ch = g.choice;
          if (ch?.who === c.id && ch.kind === 'tatu') send(c, { type: 'choose', card: g.hand.find((x) => x.startsWith('cafune')) });
          else if (ch?.who === c.id && ch.kind === 'cafune') send(c, { type: 'choose', position: 0 });
          else if (ch === null && g.pending === null && g.current === c.id) send(c, { type: 'draw' });
          else continue;
          c.fresh = false;
        }
        await new Promise((r) => setTimeout(r, 30));
      }
      throw new Error('a partida não terminou');
    },
    { server: SERVER, names },
  );
}

test('partida de Tatubum terminada aparece no histórico, com quem explodiu', async ({ browser }) => {
  const page = await newPlayer(browser);
  await page.goto('/');
  const stamp = String(Date.now() % 100_000);
  const names: [string, string] = [`Ana${stamp}`, `Beto${stamp}`];
  const winner = await playKittensMatchDirect(page, names);
  const loser = names.find((n) => n !== winner)!;

  await page.goto('/#/kittens/historico');
  // A gravação no D1 acontece logo depois do fim: recarrega até aparecer (o histórico acumula as partidas de outras execuções).
  const match = page.locator('.kt-hx-match').filter({ hasText: winner });
  await expect(async () => {
    await page.reload();
    await expect(match).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await expect(match.locator('.kt-hx-winner')).toHaveText(`${winner} venceu`);
  await expect(match.locator('.kt-hx-exits li')).toHaveText([`1º${loser}explodiu`]);
  await expect(page.getByRole('heading', { name: 'a galera' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'rei do Nem vem!' })).toBeVisible();
});
