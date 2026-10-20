import { expect, test, type Locator, type Page } from '@playwright/test';
import { closePlayers, join, newPhonePlayer, newPlayer } from './helpers';

test.afterEach(closePlayers);

/** Um jogador: a página, o nome na sala e se está no celular (toque, diário em faixa + folha). */
interface P {
  page: Page;
  name: string;
  phone: boolean;
}

/** A janela de reação dura 10 s: folga pra rede e pra animação. */
const WAIT = { timeout: 15_000 };

/** Clica (computador) ou toca (celular). */
const press = (p: P, target: Locator) => (p.phone ? target.tap() : target.click());

/** Quem tem "sua vez" no palco (a vez muda de mãos; some da tela de quem já jogou). `not`: o índice que não vale (a vez anterior). */
async function turnOwner(players: P[], not: number): Promise<number> {
  let found = -1;
  await expect
    .poll(async () => {
      const counts = await Promise.all(players.map((p) => p.page.locator('.cp-big.me', { hasText: /^sua vez$/ }).count()));
      const hits = counts.flatMap((n, i) => (n > 0 ? [i] : []));
      found = hits.length === 1 ? hits[0]! : -1;
      return found !== -1 && found !== not;
    }, WAIT)
    .toBe(true);
  return found;
}

/** Moedas de `owner` como `viewer` vê: na própria área ("você · 2 moedas") ou no assento do oponente. */
function coinsAt(viewer: P, owner: P): Locator {
  return viewer === owner ? viewer.page.locator('.cp-myline') : viewer.page.locator('.cp-opp', { hasText: owner.name }).locator('.cp-coins');
}

async function coinsOf(viewer: P, owner: P): Promise<number> {
  const text = await coinsAt(viewer, owner).innerText();
  return Number(text.match(/\d+/)![0]);
}

/** As três telas mostram `n` moedas pra `owner`. */
async function expectCoins(players: P[], owner: P, n: number): Promise<void> {
  for (const viewer of players) await expect(coinsAt(viewer, owner)).toHaveText(new RegExp(`\\b${n}\\b`), WAIT);
}

/** A última linha do diário: a faixa no celular, a coluna da direita no computador. */
const lastLine = (p: P): Locator => (p.phone ? p.page.locator('.cp-lastline .txt') : p.page.locator('.cp-log li.last'));

/** "você" pra quem vê a si mesmo, o nome pra os outros. */
const called = (viewer: P, owner: P): string => (viewer === owner ? 'você' : owner.name);

/** Botão de ação da sua área (o nome acessível traz a dica: "renda +1"). */
const act = (p: P, name: string): Locator => p.page.getByRole('button', { name: new RegExp(`^${name}`) });

test('partida do Cúpi com três navegadores (um deles celular)', async ({ browser }) => {
  const ana: P = { page: await newPlayer(browser), name: 'Ana', phone: false };
  const bia: P = { page: await newPlayer(browser), name: 'Bia', phone: false };
  const caio: P = { page: await newPhonePlayer(browser), name: 'Caio', phone: true };
  const all = [ana, bia, caio];

  // Ana cria a sala pela estante; os três entram e a anfitriã começa.
  await ana.page.goto('/');
  await ana.page.getByRole('link', { name: /Cúpi/ }).click();
  await ana.page.getByRole('button', { name: 'criar sala' }).click();
  await expect(ana.page).toHaveURL(/#\/sala\/[A-Z0-9]{4}$/);
  await join(ana.page, 'Ana', 0);
  await bia.page.goto(ana.page.url());
  await join(bia.page, 'Bia', 1);
  await caio.page.goto(ana.page.url());
  await join(caio.page, 'Caio', 2);
  await expect(ana.page.getByText(/^Caio/)).toBeVisible();
  await ana.page.getByRole('button', { name: 'começar' }).click();

  // 1. Renda: quem começa (sorteado) pega 1 moeda; as três telas mostram e a vez passa.
  const first = await turnOwner(all, -1);
  const a1 = all[first]!;
  const before1 = await coinsOf(a1, a1);
  await press(a1, act(a1, 'renda'));
  await expectCoins(all, a1, before1 + 1);
  for (const v of all) await expect(lastLine(v)).toHaveText(new RegExp(`^${called(v, a1)} pegou renda$`), WAIT);

  // 2. Taxar: os outros dois veem "duvidar" e "deixa"; os dois deixam e o Duque rende 3.
  const second = await turnOwner(all, first);
  const a2 = all[second]!;
  const others2 = all.filter((p) => p !== a2);
  const before2 = await coinsOf(a2, a2);
  await press(a2, act(a2, 'taxar'));
  for (const o of others2) {
    await expect(o.page.getByRole('button', { name: 'duvidar', exact: true })).toBeVisible(WAIT);
    await expect(o.page.getByRole('button', { name: 'deixa', exact: true })).toBeVisible(WAIT);
  }
  for (const o of others2) await press(o, o.page.getByRole('button', { name: 'deixa', exact: true }));
  await expectCoins(all, a2, before2 + 3);
  for (const v of all) await expect(lastLine(v)).toHaveText(new RegExp(`^${called(v, a2)} pegou 3$`), WAIT);

  // 3. Extorquir: mira no próximo; o alvo bloqueia como Capitão e os outros dois deixam passar o bloqueio.
  const third = await turnOwner(all, second);
  const a3 = all[third]!;
  const target = all[(third + 1) % all.length]!;
  const bystander = all.find((p) => p !== a3 && p !== target)!;
  const coins3 = await Promise.all(all.map((o) => coinsOf(a3, o)));
  await press(a3, act(a3, 'extorquir'));
  await press(a3, a3.page.getByRole('button', { name: new RegExp(`^mirar em ${target.name}`) }));
  await press(target, target.page.getByRole('button', { name: 'bloquear como Capitão', exact: true }));
  for (const o of [a3, bystander]) await expect(o.page.getByRole('button', { name: 'deixa', exact: true })).toBeVisible(WAIT);
  for (const o of [a3, bystander]) await press(o, o.page.getByRole('button', { name: 'deixa', exact: true }));
  for (const v of all)
    await expect(lastLine(v)).toHaveText(v === a3 ? 'sua ação foi bloqueada' : `a ação de ${a3.name} foi bloqueada`, WAIT);
  // ninguém ganhou nem perdeu moeda
  for (const [i, owner] of all.entries()) await expectCoins(all, owner, coins3[i]!);

  // O celular abre a folha do diário e vê a história inteira.
  await caio.page.locator('.cp-lastline').tap();
  const sheet = caio.page.getByRole('dialog', { name: 'diário' });
  await expect(sheet.getByText(/pegou renda/)).toBeVisible();
  await expect(sheet.getByText(/pegou 3/)).toBeVisible();
  await expect(sheet.getByText(/bloqueada/).first()).toBeVisible();
});
