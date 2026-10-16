import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

const contexts: BrowserContext[] = [];

/** Página num contexto próprio: cada jogador tem seu token (como navegadores diferentes). */
export async function newPlayer(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  contexts.push(context);
  return context.newPage();
}

/** Fecha os contextos criados por `newPlayer` (chamar no `afterEach`). */
export async function closePlayers(): Promise<void> {
  await Promise.all(contexts.splice(0).map((c) => c.close()));
}

/** Entra na sala aberta na página com o nome e o personagem de índice `critter`. */
export async function join(page: Page, name: string, critter: number): Promise<void> {
  await page.getByLabel('seu nome').fill(name);
  await page.locator('button[data-sound="pick"]').nth(critter).click();
  await page.getByRole('button', { name: 'entrar', exact: true }).click();
}

/** Escreve a dica e arrasta a carta da mão até o meio da mesa. */
export async function placeMyCard(page: Page, clue: string): Promise<void> {
  await page.getByPlaceholder('escreve uma dica…').fill(clue);
  const card = page.locator('[data-hand-slot] .hcard .mynum').first();
  const felt = page.locator('.felt');
  const from = (await card.boundingBox())!;
  const to = (await felt.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height * 0.6, { steps: 15 });
  await page.mouse.up();
  await expect(page.locator('[data-hand-slot]').first()).toHaveClass(/away/);
}

/** Host `a` e `b` (que entrou como `bName`) já estão na sala: começa, dá as cartas, os dois colocam, ficam prontos e veem a revelação. */
export async function playRound(a: Page, b: Page, bName: string, clues: [string, string]): Promise<void> {
  await expect(a.getByText(bName, { exact: true }).first()).toBeVisible();
  await a.getByRole('button', { name: 'começar' }).click();
  await a.getByRole('button', { name: 'dar as cartas' }).click();
  await placeMyCard(a, clues[0]);
  await placeMyCard(b, clues[1]);
  await a.getByRole('button', { name: 'tô pronto' }).click();
  await b.getByRole('button', { name: 'tô pronto' }).click();
  await expect(a.getByRole('dialog')).toBeVisible({ timeout: 30_000 });
  await expect(b.getByRole('dialog')).toBeVisible({ timeout: 30_000 });
}
