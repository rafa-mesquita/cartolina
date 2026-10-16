import { expect, test } from '@playwright/test';
import { closePlayers, join, newPlayer, playRound } from './helpers';

test.afterEach(closePlayers);

test('build de produção não tem bots', async ({ browser }) => {
  const a = await newPlayer(browser);
  await a.goto('/');
  await a.getByRole('link', { name: /DITU/ }).click();
  await expect(a).toHaveURL(/#\/ito$/);
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
  await a.getByRole('link', { name: /DITU/ }).click();
  await expect(a).toHaveURL(/#\/ito$/);
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

test('rodada aparece no histórico do ITO', async ({ browser }) => {
  const a = await newPlayer(browser);
  const b = await newPlayer(browser);
  await a.goto('/#/ito');
  await a.getByRole('button', { name: 'criar sala' }).click();
  await expect(a).toHaveURL(/#\/sala\/[A-Z0-9]{4}$/);
  await join(a, 'Ana', 0);
  await b.goto(a.url());
  await join(b, 'Bia', 1);

  await playRound(a, b, 'Bia', ['farol', 'iglu']);

  await a.goto('/#/ito/historico');
  // A gravação no D1 acontece logo depois da revelação: recarrega até aparecer. A partida mais recente é a primeira
  // (o histórico do ITO é um só e acumula as rodadas de outras execuções).
  await expect(async () => {
    await a.reload();
    await a.locator('.round-head').first().click();
    await expect(a.getByText('farol')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
});
