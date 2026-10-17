import { expect, test, type Page } from '@playwright/test';
import { closePlayers, join, newPlayer } from './helpers';

test.afterEach(closePlayers);

/** Centro de uma caixa (as coordenadas do palco escalado vêm do `boundingBox`). */
const mid = (b: { x: number; y: number; width: number; height: number }) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

/** Cubos: põe um cubo (cor ativa) na primeira casa da grade. */
async function buildCubes(page: Page): Promise<void> {
  const bench = page.locator('[data-kit="cubes"]');
  await bench.locator('.pc-kc-cell').first().click();
  await expect(bench.locator('.pc-kc-left')).toHaveText(/15 casas vazias/);
}

/** Cadarços: pega um ponto da corda longa (a laranja, achada pelos pixels do canvas) e arrasta. */
async function buildLaces(page: Page): Promise<void> {
  const canvas = page.locator('[data-kit="laces"] canvas');
  await expect(canvas).toBeVisible();
  const before = await canvas.evaluate((cv: HTMLCanvasElement) => cv.toDataURL());
  const grab = await canvas.evaluate((cv: HTMLCanvasElement) => {
    const { width: w, height: h } = cv;
    const d = cv.getContext('2d')!.getImageData(0, 0, w, h).data;
    const near = (i: number, v: number) => Math.abs(d[i]! - v) < 10;
    const hits: { x: number; y: number }[] = [];
    // cor principal da corda longa: #D85A30
    for (let y = 0; y < h; y += 3)
      for (let x = 0; x < w; x += 3) {
        const i = (y * w + x) * 4;
        if (near(i, 0xd8) && near(i + 1, 0x5a) && near(i + 2, 0x30)) hits.push({ x, y });
      }
    const p = hits[Math.floor(hits.length / 2)];
    if (!p) return null;
    const rc = cv.getBoundingClientRect();
    return { x: rc.left + (p.x * rc.width) / w, y: rc.top + (p.y * rc.height) / h };
  });
  expect(grab).not.toBeNull();
  await page.mouse.move(grab!.x, grab!.y);
  await page.mouse.down();
  await page.mouse.move(grab!.x + 70, grab!.y + 45, { steps: 12 });
  await page.mouse.up();
  await expect.poll(() => canvas.evaluate((cv: HTMLCanvasElement) => cv.toDataURL())).not.toBe(before);
}

/** Palitos e pedras: arrasta o primeiro palito da gaveta até o meio da folha. */
async function buildSticks(page: Page): Promise<void> {
  const bench = page.locator('[data-kit="sticks"]');
  const from = mid((await bench.locator('.pc-ks-p[data-i="0"]').boundingBox())!);
  const to = mid((await bench.locator('svg > rect[width="400"]').boundingBox())!);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 15 });
  await page.mouse.up();
  await expect(bench.locator('.pc-ks-st')).toHaveText(/na folha: 1 de 8/);
}

/** Na galeria: cola uma foto diferente em cada obra alheia e confirma (o último a confirmar já vai pra revelação). */
async function guessAll(page: Page, others: string[], last = false): Promise<void> {
  await expect(page.getByRole('heading', { name: 'de quem é qual foto?' })).toBeVisible({ timeout: 30_000 });
  const coords = ['A1', 'B2'];
  for (const [i, name] of others.entries()) {
    const coord = coords[i]!;
    const pick = page.getByRole('button', { name: `obra de ${name}`, exact: true });
    await pick.click();
    await expect(pick).toHaveAttribute('aria-pressed', 'true');
    await page.locator(`.pc-grid .pc-photo[data-coord="${coord}"]`).click();
    await expect(page.getByRole('button', { name: `tirar o palpite ${coord}` })).toBeVisible();
  }
  await page.getByRole('button', { name: 'confirmar palpites' }).click();
  if (!last) await expect(page.getByText('palpites confirmados ✓')).toBeVisible();
}

test('rodada do Retratim com três navegadores', async ({ browser }) => {
  const a = await newPlayer(browser);
  const b = await newPlayer(browser);
  const c = await newPlayer(browser);
  await a.goto('/');
  await a.getByRole('link', { name: /Retratim/ }).click();
  await a.getByRole('button', { name: 'criar sala' }).click();
  await expect(a).toHaveURL(/#\/sala\/[A-Z0-9]{4}$/);
  await join(a, 'Ana', 0);
  await b.goto(a.url());
  await join(b, 'Bia', 1);
  await c.goto(a.url());
  await join(c, 'Caio', 2);
  await expect(a.getByText(/^Caio/)).toBeVisible();
  await a.getByRole('button', { name: 'começar' }).click();

  // Rodada 0: o kit segue a ordem dos assentos.
  await expect(a.locator('[data-kit="cubes"]')).toBeVisible();
  await expect(b.locator('[data-kit="laces"]')).toBeVisible();
  await expect(c.locator('[data-kit="sticks"]')).toBeVisible();
  await buildCubes(a);
  await buildLaces(b);
  await buildSticks(c);

  // "estou pronto" leva a obra junto; o último pronto já abre a galeria.
  for (const p of [a, b]) {
    await p.getByRole('button', { name: 'estou pronto' }).click();
    await expect(p.getByRole('button', { name: 'desmarcar pronto' })).toBeVisible();
  }
  await c.getByRole('button', { name: 'estou pronto' }).click();

  await guessAll(a, ['Bia', 'Caio']);
  await guessAll(b, ['Ana', 'Caio']);
  await guessAll(c, ['Ana', 'Bia'], true);

  // Revelação: todos veem; "pular ›" vai pro placar.
  for (const p of [a, b, c]) {
    const skip = p.getByRole('button', { name: 'pular ›' });
    await expect(skip).toBeVisible({ timeout: 30_000 });
    await skip.click();
  }
  const board = a.getByRole('region', { name: 'placar da rodada 1' });
  await expect(board).toBeVisible();
  await expect(board.locator('.pc-board-row')).toHaveCount(3);
  await expect(a.getByRole('button', { name: 'próxima rodada' })).toBeVisible();
  for (const p of [b, c]) {
    await expect(p.getByRole('region', { name: 'placar da rodada 1' }).locator('.pc-board-row')).toHaveCount(3);
    await expect(p.getByText('esperando o host…')).toBeVisible();
    await expect(p.getByRole('button', { name: 'próxima rodada' })).toHaveCount(0);
  }
});
