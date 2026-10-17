import { expect, test } from '@playwright/test';
import { closePlayers, join, newPhonePlayer, newPlayer, placeMyCard } from './helpers';

test.afterEach(closePlayers);

/** O aviso do resultado (a folha da dica também é um `dialog`). */
const RESULT = { name: /^(vitória|xi, errou essa)$/ };

test('rodada de DITU com um jogador no celular e outro no PC', async ({ browser }) => {
  const pc = await newPlayer(browser);
  const cel = await newPhonePlayer(browser);
  await pc.goto('/#/ito');
  await pc.getByRole('button', { name: 'criar sala' }).click();
  await expect(pc).toHaveURL(/#\/sala\/[A-Z0-9]{4}$/);
  await join(pc, 'Ana', 0);
  await cel.goto(pc.url());
  await join(cel, 'Bia', 1);

  await expect(pc.getByText('Bia', { exact: true }).first()).toBeVisible();
  await pc.getByRole('button', { name: 'começar' }).click();
  await pc.getByRole('button', { name: 'dar as cartas' }).click();

  // Celular: a dica pela folha de baixo, e a carta vai pra fila tocando nela e depois no "aqui".
  await cel.getByRole('button', { name: '✎ dica' }).tap();
  const sheet = cel.getByRole('dialog', { name: 'dica da carta' });
  await sheet.getByRole('textbox').fill('iglu');
  await sheet.getByRole('button', { name: 'ok' }).tap();
  await expect(sheet).toHaveCount(0);
  // O rótulo da carta vem do servidor: a dica chegou.
  const card = cel.getByRole('button', { name: /^\d+, iglu$/ });
  await card.tap();
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await cel.getByRole('button', { name: 'colocar aqui, no começo' }).tap();
  await expect(cel.getByRole('button', { name: /^\d+, na fila$/ })).toBeVisible();
  await expect(pc.locator('.row .rcard', { hasText: 'iglu' })).toHaveCount(1);

  // PC: escreve a dica e arrasta pra mesa (como nos outros testes).
  await placeMyCard(pc, 'praia');
  await expect(cel.locator('.p-strip', { hasText: 'praia' })).toHaveCount(1);

  // Pronto só depois das duas cartas na fila: colocar carta tira todo mundo do "pronto".
  await pc.getByRole('button', { name: 'tô pronto' }).click();
  await cel.getByRole('button', { name: 'tô pronto' }).tap();

  await expect(pc.getByRole('dialog', RESULT)).toBeVisible({ timeout: 30_000 });
  await expect(cel.getByRole('dialog', RESULT)).toBeVisible({ timeout: 30_000 });
  // Os dois veem o mesmo resultado.
  const title = await pc.getByRole('dialog', RESULT).getAttribute('aria-label');
  await expect(cel.getByRole('dialog', RESULT)).toHaveAttribute('aria-label', title!);
  await expect(cel.locator('.p-strip', { hasText: 'iglu' })).toHaveCount(1);
  await expect(cel.locator('.p-strip', { hasText: 'praia' })).toHaveCount(1);
  await expect(pc.locator('.row .rcard', { hasText: 'iglu' })).toHaveCount(1);
  await expect(pc.locator('.row .rcard', { hasText: 'praia' })).toHaveCount(1);
});
