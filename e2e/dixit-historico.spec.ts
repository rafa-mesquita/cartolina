import { expect, test, type Page } from '@playwright/test';
import { closePlayers, newPlayer } from './helpers';

test.afterEach(closePlayers);

const SERVER = 'http://127.0.0.1:8787';

/** Três pessoas jogam uma rodada de Diquisti por WebSocket, de dentro da página; devolve o código da sala. */
async function playDixitRoundDirect(page: Page, clue: string): Promise<string> {
  return page.evaluate(
    async ({ server, clue }) => {
      interface View {
        seats: unknown[];
        game: { phase: string; storyteller: string | null; hand: string[]; table: { cardId: string; mine: boolean }[] };
      }
      interface Client {
        ws: WebSocket;
        id: string;
        view: View | null;
      }
      const res = await fetch(`${server}/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game: 'dixit' }),
      });
      const { code } = (await res.json()) as { code: string };
      const connect = (name: string, color: string) =>
        new Promise<Client>((resolve, reject) => {
          const client: Client = { ws: new WebSocket(`${server.replace(/^http/, 'ws')}/rooms/${code}/ws`), id: '', view: null };
          client.ws.onmessage = (e) => {
            const msg = JSON.parse(String(e.data)) as { t: string; playerId?: string; room?: View };
            if (msg.t === 'welcome' && msg.playerId) {
              client.id = msg.playerId;
              resolve(client);
            }
            if (msg.t === 'state' && msg.room) client.view = msg.room;
          };
          client.ws.onerror = () => reject(new Error('websocket falhou'));
          client.ws.onopen = () => client.ws.send(JSON.stringify({ t: 'join', token: crypto.randomUUID(), name, color }));
        });
      const until = async (ok: () => boolean) => {
        for (let i = 0; i < 200; i++) {
          if (ok()) return;
          await new Promise((r) => setTimeout(r, 50));
        }
        throw new Error('a rodada não andou');
      };
      const send = (c: Client, action: Record<string, unknown>) => c.ws.send(JSON.stringify({ t: 'action', action }));
      const phase = (c: Client) => c.view?.game.phase;

      // Em sequência: quem entra primeiro é o host.
      const all = [await connect('Ana', '#8EC5FF'), await connect('Bia', '#FF8FAB'), await connect('Caio', '#7EDDB5')];
      const host = all[0]!;
      await until(() => all.every((c) => c.view?.seats.length === 3));
      send(host, { type: 'start' });
      await until(() => all.every((c) => phase(c) === 'storytelling'));
      const teller = all.find((c) => c.id === host.view!.game.storyteller)!;
      send(teller, { type: 'tell', cardId: teller.view!.game.hand[0], clue });
      const rest = all.filter((c) => c !== teller);
      await until(() => rest.every((c) => phase(c) === 'submitting'));
      // 3 pessoas: cada uma joga 2 cartas
      for (const c of rest) {
        send(c, { type: 'submit', cardIds: c.view!.game.hand.slice(0, 2) });
        send(c, { type: 'confirm' });
      }
      await until(() => rest.every((c) => phase(c) === 'voting'));
      for (const c of rest) {
        send(c, { type: 'vote', cardId: c.view!.game.table.find((t) => !t.mine)!.cardId });
        send(c, { type: 'confirm' });
      }
      await until(() => all.every((c) => phase(c) === 'reveal'));
      for (const c of all) c.ws.close();
      return code;
    },
    { server: SERVER, clue },
  );
}

test('rodada de Diquisti aparece no histórico do Diquisti', async ({ browser }) => {
  const page = await newPlayer(browser);
  await page.goto('/');
  const clue = `farol ${Date.now()}`;
  await playDixitRoundDirect(page, clue);

  await page.goto('/#/dixit/historico');
  // A gravação no D1 acontece logo depois da revelação: recarrega até aparecer. A partida mais recente é a primeira
  // (o histórico do Diquisti é um só e acumula as partidas de outras execuções).
  await expect(async () => {
    await page.reload();
    await page.locator('.dxh-match-head').first().click();
    await expect(page.locator('.dxh-match-body').getByText(clue)).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'a galera' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'mural de dicas' }).getByText(clue)).toBeVisible();
});
