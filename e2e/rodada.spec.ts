import { expect, test } from '@playwright/test';
import { closePlayers, join, newPlayer, playRound } from './helpers';

test.afterEach(closePlayers);

test('build de produção não tem bots', async ({ browser }) => {
  const a = await newPlayer(browser);
  await a.goto('/');
  await a.getByRole('button', { name: 'criar sala' }).click();
  await expect(a).toHaveURL(/#\/sala\/[A-Z0-9]{4}$/);
  await join(a, 'Ana', 0);
  await expect(a.getByRole('button', { name: 'começar' })).toBeVisible();
  await expect(a.getByRole('button', { name: /adicionar bot/ })).toHaveCount(0);
});

test('rodada livre com dois navegadores', async ({ browser }) => {
  const a = await newPlayer(browser);
  const b = await newPlayer(browser);
  await a.goto('/');
  await a.getByRole('button', { name: 'criar sala' }).click();
  await expect(a).toHaveURL(/#\/sala\/[A-Z0-9]{4}$/);
  await join(a, 'Ana', 0);
  await b.goto(a.url());
  await join(b, 'Bia', 1);

  await playRound(a, b, 'Bia', ['praia', 'neve']);

  // O resultado bate com os números revelados, na ordem da fila (esquerda → direita; a ordem do DOM não é a da fila).
  const values = await a.locator('.row .rcard').evaluateAll((cards) =>
    cards
      .map((c) => ({ x: c.getBoundingClientRect().x, n: Number(c.querySelector('.bignum')?.textContent) }))
      .sort((p, q) => p.x - q.x)
      .map((c) => c.n),
  );
  expect(values).toHaveLength(2);
  expect(values.every(Number.isInteger)).toBe(true);
  const sorted = values.every((v, i) => i === 0 || values[i - 1]! < v);
  await expect(a.getByRole('dialog')).toHaveAttribute('aria-label', sorted ? 'vitória' : 'xi, errou essa');
  // As dicas chegaram (inclusive escritas logo antes de arrastar).
  await expect(a.locator('.row .rcard', { hasText: 'praia' })).toHaveCount(1);
  await expect(a.locator('.row .rcard', { hasText: 'neve' })).toHaveCount(1);
});

test('rodada numa sala de grupo aparece no histórico', async ({ browser }) => {
  const a = await newPlayer(browser);
  const b = await newPlayer(browser);
  await a.goto('/');
  await a.getByLabel('nome do grupo').fill('Galera E2E');
  await a.getByRole('button', { name: 'criar grupo' }).click();
  await expect(a).toHaveURL(/#\/g\/[a-z0-9]{10}$/);
  const groupUrl = a.url();
  await a.getByRole('button', { name: 'criar sala do grupo' }).click();
  await expect(a).toHaveURL(/#\/sala\/[A-Z0-9]{4}$/);
  await join(a, 'Ana', 0);
  await b.goto(a.url());
  await join(b, 'Bia', 1);

  await playRound(a, b, 'Bia', ['farol', 'iglu']);

  await a.goto(groupUrl);
  // A gravação no D1 acontece logo depois da revelação: recarrega até aparecer.
  await expect(async () => {
    await a.reload();
    await expect(a.locator('[aria-controls]')).toHaveCount(1, { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await a.locator('[aria-controls]').first().click();
  await expect(a.getByText('farol')).toBeVisible();
});
