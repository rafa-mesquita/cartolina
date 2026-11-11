import { expect, test, type Locator, type Page } from '@playwright/test';
import { closePlayers, join, newPlayer } from './helpers';

test.afterEach(closePlayers);

/** Folga pra rede e pras animações. */
const WAIT = { timeout: 15_000 };

/** Os lugares que pulsam: cantos pra casa, lados pra estrada (o `aria-label` vem do `Board.tsx`). */
const houseSpots = (p: Page): Locator => p.locator('[role="button"][aria-label^="casa no canto"]');
const roadSpots = (p: Page): Locator => p.locator('[role="button"][aria-label^="estrada no lado"]');

/** Peças já postas no tabuleiro (`data-peca` no `Board.tsx`). */
const pieces = (p: Page, kind: 'house' | 'road'): Locator => p.locator(`.mc-board [data-peca="${kind}"]`);

/** A barra de vez no topo ("sua vez · preparação", "vez de Bia"). */
const turnBar = (p: Page): Locator => p.locator('.mc-vez');

/** Quem tem "sua vez" na barra do topo e, além disso, `ready` na própria tela (os lugares acesos, o botão de rolar). */
async function turnOwner(pages: Page[], ready: (p: Page) => Promise<boolean>): Promise<number> {
  let found = -1;
  await expect
    .poll(async () => {
      const mine = await Promise.all(
        pages.map(async (p) => /^sua vez/.test((await turnBar(p).innerText().catch(() => '')).trim()) && (await ready(p))),
      );
      const hits = mine.flatMap((ok, i) => (ok ? [i] : []));
      found = hits.length === 1 ? hits[0]! : -1;
      return found;
    }, WAIT)
    .not.toBe(-1);
  return found;
}

test('partida do Mandacaru com três navegadores: a preparação inteira e a primeira rolagem', async ({ browser }) => {
  const ana = await newPlayer(browser);
  const beto = await newPlayer(browser);
  const caio = await newPlayer(browser);
  const all = [ana, beto, caio];

  // Ana cria a sala pela estante; Beto e Caio entram e a anfitriã começa.
  await ana.goto('/');
  await ana.getByRole('link', { name: /Mandacaru/ }).click();
  await ana.getByRole('button', { name: 'criar sala' }).click();
  await expect(ana).toHaveURL(/#\/sala\/[A-Z0-9]{4}$/);
  await join(ana, 'Ana', 0);
  await beto.goto(ana.url());
  await join(beto, 'Beto', 1);
  await caio.goto(ana.url());
  await join(caio, 'Caio', 2);
  await expect(ana.getByText(/^Caio/)).toBeVisible();
  await ana.getByRole('button', { name: 'começar' }).click();

  // Preparação: 3 jogadores × (casa + estrada) × 2 voltas, sempre casa e depois estrada de quem está na vez.
  for (let i = 0; i < 12; i++) {
    const house = i % 2 === 0;
    const spots = house ? houseSpots : roadSpots;
    const who = all[await turnOwner(all, async (p) => (await spots(p).count()) > 0)]!;
    const kind = house ? 'house' : 'road';
    const before = await pieces(who, kind).count();
    // lado em pé tem caixa de largura 0 (o SVG não conta o traço) e o Playwright acha que não aparece: pega um que aparece
    await spots(who).filter({ visible: true }).first().click();
    // a peça aparece na tela de quem pôs antes de procurar a próxima vez (a mesma pessoa pode jogar duas seguidas)
    await expect(pieces(who, kind)).toHaveCount(before + 1, WAIT);
  }

  // As 6 casas e as 6 estradas aparecem nas três telas, e ninguém mais tem lugar pra pôr.
  for (const p of all) {
    await expect(pieces(p, 'house')).toHaveCount(6, WAIT);
    await expect(pieces(p, 'road')).toHaveCount(6, WAIT);
    await expect(houseSpots(p)).toHaveCount(0);
    await expect(roadSpots(p)).toHaveCount(0);
  }

  // Quem está na vez rola os dados; o diário das três telas mostra a mesma soma (um 7 também vale).
  const roll = (p: Page) => p.getByRole('button', { name: /rolar os dados/ });
  const roller = all[await turnOwner(all, async (p) => roll(p).isEnabled())]!;
  await roll(roller).click();
  const rollLine = (p: Page) => p.locator('.mc-diario li', { hasText: /tirou \d+/ }).first();
  await expect(rollLine(roller)).toBeVisible(WAIT);
  const sum = (await rollLine(roller).innerText()).match(/tirou (\d+)/)![1]!;
  expect(Number(sum)).toBeGreaterThanOrEqual(2);
  expect(Number(sum)).toBeLessThanOrEqual(12);
  await expect(rollLine(roller)).toHaveText(new RegExp(`^Você tirou ${sum}\\b`, 'i'));
  for (const p of all.filter((x) => x !== roller)) await expect(rollLine(p)).toHaveText(new RegExp(`tirou ${sum}\\b`), WAIT);
  // os dados do topo também batem nas três telas
  const dice = await roller.locator('.mc-dados').getAttribute('aria-label');
  expect(dice).toMatch(/^dados: \d e \d$/);
  for (const p of all) await expect(p.locator('.mc-dados')).toHaveAttribute('aria-label', dice!, WAIT);
});
