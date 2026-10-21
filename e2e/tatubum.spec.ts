import { expect, test, type Page } from '@playwright/test';
import { closePlayers, join, newPhonePlayer, newPlayer } from './helpers';

test.afterEach(closePlayers);

/** O selo da vez, na barra de cima da mesa ("SUA VEZ" ou "vez de FULANO"). */
const turn = (page: Page) => page.locator('.kt-mesa #turn');
const hand = (page: Page) => page.locator('.kt-mesa #hand [data-id]');
const button = (page: Page, label: string) => page.locator('.kt-mesa #actions button, .kt-mesa #panel button').filter({ hasText: new RegExp(`^${label}$`) });

/**
 * Quem está na vez compra. Se vier o Tatubum, joga o Desarme e esconde o tatu de volta no monte (a mão inicial
 * sempre tem um Desarme); em qualquer caso a vez acaba passando pra outra pessoa.
 */
async function drawAndPass(me: Page, other: Page, phone = false): Promise<void> {
  // no celular é toque (tap), no computador clique
  await (phone ? button(me, 'COMPRAR').tap() : button(me, 'COMPRAR').click());
  await expect
    .poll(
      async () => {
        if ((await turn(other).textContent())?.includes('SUA VEZ')) return 'passou';
        // o tatu grande (animação) pode cobrir os botões: o clique vai direto no botão, sem esperar a animação
        for (const label of ['JOGAR DESARME', 'ESCONDER AQUI']) {
          const b = button(me, label);
          if ((await b.count()) > 0) await b.first().dispatchEvent('click', undefined, { timeout: 2_000 }).catch(() => {});
        }
        return 'esperando';
      },
      // (sem clique nenhum, o servidor joga o Desarme e esconde o tatu sozinho depois dos prazos)
      { timeout: 75_000, intervals: [500] },
    )
    .toBe('passou');
}

test('partida do Tatubum com dois navegadores', async ({ browser }) => {
  // se alguém comprar o Tatubum e o Desarme não sair na hora, os prazos do servidor (30 s + 30 s) resolvem sozinhos
  test.setTimeout(200_000);
  const a = await newPlayer(browser);
  const b = await newPlayer(browser);
  await a.goto('/');
  await a.getByRole('link', { name: /Tatubum/ }).click();
  await a.getByRole('button', { name: 'criar sala' }).click();
  await expect(a).toHaveURL(/#\/sala\/[A-Z0-9]{4}$/);
  await join(a, 'Ana', 0);
  await b.goto(a.url());
  await join(b, 'Bia', 1);

  // Lobby: os dois na mesa; só o host começa (e só ele vê os bots).
  await expect(a.locator('.kt-people .who', { hasText: 'Bia' })).toBeVisible();
  await expect(b.getByText('esperando o host começar…')).toBeVisible();
  await expect(a.getByRole('button', { name: /adicionar bot/ })).toBeVisible();
  await expect(b.getByRole('button', { name: /adicionar bot/ })).toHaveCount(0);
  await a.getByRole('button', { name: 'COMEÇAR' }).click();

  // A mesa: 8 cartas na mão de cada um; o selo da vez diz quem começa.
  for (const p of [a, b]) {
    await expect(p.locator('.kt-mesa')).toBeVisible();
    await expect(hand(p)).toHaveCount(8);
    await expect(turn(p)).toContainText(/SUA VEZ|vez de/);
  }
  const aFirst = (await turn(a).textContent())!.includes('SUA VEZ');
  const [first, second] = aFirst ? [a, b] : [b, a];
  await expect(turn(second)).toContainText(`vez de ${aFirst ? 'ANA' : 'BIA'}`);
  await expect(button(second, 'COMPRAR')).toHaveCount(0);

  // Quem está na vez compra e a vez passa: o selo "SUA VEZ" troca de navegador.
  await drawAndPass(first, second);
  await expect(turn(second)).toContainText('SUA VEZ');
  await expect(turn(first)).toContainText(`vez de ${aFirst ? 'BIA' : 'ANA'}`);
  await expect(button(second, 'COMPRAR')).toBeVisible();
  // quem comprou ficou com uma carta a mais (9), ou com 8 se jogou o Desarme no Tatubum
  await expect.poll(() => hand(first).count()).toBeGreaterThanOrEqual(8);

  // E volta: o segundo compra e a vez é do primeiro de novo.
  await drawAndPass(second, first);
  await expect(turn(first)).toContainText('SUA VEZ');
});

test('Tatubum no celular: entra pelo link, a mesa fica em pé e compra', async ({ browser }) => {
  test.setTimeout(200_000);
  const a = await newPlayer(browser);
  const b = await newPhonePlayer(browser);
  await a.goto('/');
  await a.getByRole('link', { name: /Tatubum/ }).click();
  await a.getByRole('button', { name: 'criar sala' }).click();
  await expect(a).toHaveURL(/#\/sala\/[A-Z0-9]{4}$/);
  await join(a, 'Ana', 0);
  // o celular não vê "abre no computador": entra direto
  await b.goto(a.url());
  await join(b, 'Bia', 1);
  await expect(b.getByText('esperando o host começar…')).toBeVisible();
  await a.getByRole('button', { name: 'COMEÇAR' }).click();

  // no celular: palco em pé (kt-phone), as 8 cartas, a tira do diário e o botão DIÁRIO
  await expect(b.locator('.kt-mesa #stage.kt-phone')).toBeVisible();
  await expect(a.locator('.kt-mesa #stage.kt-phone')).toHaveCount(0);
  await expect(hand(b)).toHaveCount(8);
  await expect(b.locator('.kt-mesa #lastline')).toBeVisible();
  await b.locator('.kt-mesa #diary').tap();
  await expect(b.locator('.kt-mesa #log')).toBeVisible();
  await b.locator('.kt-mesa #log .kt-close').tap();
  await expect(b.locator('.kt-mesa #log')).toBeHidden();

  // cada um compra uma vez (o celular tocando em COMPRAR)
  const aFirst = (await turn(a).textContent())!.includes('SUA VEZ');
  if (aFirst) {
    await drawAndPass(a, b);
    await drawAndPass(b, a, true);
  } else {
    await drawAndPass(b, a, true);
    await drawAndPass(a, b);
  }
  await expect(turn(aFirst ? a : b)).toContainText('SUA VEZ');
});
