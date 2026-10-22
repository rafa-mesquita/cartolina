import { expect, test, type Page } from '@playwright/test';
import { closePlayers, newPlayer } from './helpers';

test.afterEach(closePlayers);

const SERVER = 'http://127.0.0.1:8787';

/**
 * Duas pessoas (`names`) jogam uma partida inteira de Cama-Leão por WebSocket, de dentro da página: quem tem a vez compra
 * do monte e fica com a carta, até alguém chegar à meta ou o monte acabar. Devolve os nomes dos vencedores.
 */
async function playCamelioMatchDirect(page: Page, names: [string, string]): Promise<string[]> {
  return page.evaluate(
    async ({ server, names }) => {
      interface View {
        seats: { id: string; name: string }[];
        game: { phase: string; turn: string | null; paused: boolean; winners: string[] };
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
        body: JSON.stringify({ game: 'camelio' }),
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
      for (let step = 0; step < 3000; step++) {
        const over = all.find((c) => c.view?.game.phase === 'over');
        if (over) {
          const v = over.view!;
          const winners = v.game.winners.map((w) => v.seats.find((s) => s.id === w)!.name);
          for (const c of all) c.ws.close();
          return winners;
        }
        for (const c of all) {
          const g = c.view?.game;
          if (!c.fresh || !g || g.phase !== 'playing' || g.paused || g.turn !== c.id) continue;
          send(c, { type: 'play', from: 'deck', to: c.id });
          c.fresh = false;
        }
        await new Promise((r) => setTimeout(r, 30));
      }
      throw new Error('a partida não terminou');
    },
    { server: SERVER, names },
  );
}

test('partida de Cama-Leão terminada aparece no histórico, com os lances', async ({ browser }) => {
  const page = await newPlayer(browser);
  await page.goto('/');
  const stamp = String(Date.now() % 100_000);
  const names: [string, string] = [`Ana${stamp}`, `Beto${stamp}`];
  const winners = await playCamelioMatchDirect(page, names);
  expect(winners.length).toBeGreaterThan(0);

  await page.goto('/#/camelio/historico');
  // A gravação no D1 acontece logo depois do fim: recarrega até aparecer (o histórico acumula as partidas de outras execuções).
  const match = page.locator('.cl-hx-match').filter({ hasText: names[0] }).filter({ hasText: names[1] });
  await expect(async () => {
    await page.reload();
    await expect(match).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await expect(match.locator('.cl-hx-winner')).toContainText(winners[0]!);
  // Jogando tudo pra si mesmo sempre tem lance marcante: alguém fecha cores até a meta, ou estoura até o monte acabar.
  await match.getByRole('button', { name: /ver os lances/ }).click();
  await expect(match.locator('.cl-hx-timeline li').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'a galera' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'domador' })).toBeVisible();
});
