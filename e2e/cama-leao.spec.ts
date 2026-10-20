import { expect, test, type Page } from '@playwright/test';
import { closePlayers, join, newPlayer } from './helpers';

test.afterEach(closePlayers);

/** O letreiro da mesa ("sua vez: …", "vez de Bia", ou a frase da última jogada). */
const banner = (page: Page) => page.locator('.cl-banner .txt');
/** Uma pilha do picadeiro ("carta aberta" ou "monte"). */
const pile = (page: Page, name: 'carta aberta' | 'monte') => page.getByRole('group', { name, exact: true });
/** Uma mesa: "sua mesa" ou "mesa de Fulano". */
const seat = (page: Page, name: string) => page.getByRole('group', { name, exact: true });

/** Quantas cartas faltam no monte, lido do topo ("meta: 5 cores · monte 70"). */
async function deckCount(page: Page): Promise<number> {
  const text = (await page.locator('.cl-info').textContent()) ?? '';
  const n = /monte\s*(\d+)/.exec(text)?.[1];
  if (n === undefined) throw new Error(`sem contagem do monte em "${text}"`);
  return Number(n);
}

/** Espera a vez de alguém começar e devolve [quem joga, quem espera] (a página cujo letreiro diz "sua vez"). */
async function whoseTurn(a: Page, b: Page): Promise<[Page, Page]> {
  let mine: Page | null = null;
  await expect
    .poll(
      async () => {
        for (const p of [a, b]) {
          if (/sua vez/i.test((await banner(p).textContent()) ?? '')) mine = p;
        }
        return mine !== null;
      },
      { timeout: 20_000, intervals: [100] },
    )
    .toBe(true);
  const me = mine!;
  return [me, me === a ? b : a];
}

/**
 * Espera o letreiro da página narrar a jogada. A frase fica poucos instantes no letreiro (a dica da vez volta
 * depois), então olha de 50 em 50 ms e guarda se chegou a vê-la.
 */
async function sawBanner(page: Page, phrase: RegExp): Promise<void> {
  let seen = false;
  await expect
    .poll(
      async () => {
        seen = seen || phrase.test((await banner(page).textContent()) ?? '');
        return seen;
      },
      { timeout: 20_000, intervals: [50] },
    )
    .toBe(true);
}

/** Quem não tem a vez clica na carta aberta: leva o aviso e o monte não muda. */
async function cannotPlay(waiting: Page): Promise<void> {
  const before = await deckCount(waiting);
  // (se a virada anterior ainda acaba de rodar nessa tela, o clique é ignorado: tenta de novo)
  await expect(async () => {
    await pile(waiting, 'carta aberta').click();
    await expect(waiting.locator('.cl-toast.on')).toContainText('Não é a sua vez', { timeout: 1_500 });
  }).toPass({ timeout: 10_000 });
  expect(await deckCount(waiting)).toBe(before);
}

/** Confere nas duas páginas: o monte perdeu uma carta e o letreiro narrou a jogada. */
async function expectPlayed(page: Page, other: Page, before: number, mine: RegExp, theirs: RegExp): Promise<void> {
  await Promise.all([sawBanner(page, mine), sawBanner(other, theirs)]);
  await expect.poll(() => deckCount(page), { timeout: 10_000 }).toBe(before - 1);
  await expect.poll(() => deckCount(other), { timeout: 10_000 }).toBe(before - 1);
}

test('partida do Cama-Leão com dois navegadores', async ({ browser }) => {
  test.setTimeout(120_000);
  const a = await newPlayer(browser);
  const b = await newPlayer(browser);
  const names = new Map<Page, string>([
    [a, 'Ana'],
    [b, 'Bia'],
  ]);
  await a.goto('/');
  await a.getByRole('link', { name: /Cama-Leão/ }).click();
  await a.getByRole('button', { name: 'criar sala' }).click();
  await expect(a).toHaveURL(/#\/sala\/[A-Z0-9]{4}$/);
  await join(a, 'Ana', 0);
  await b.goto(a.url());
  await join(b, 'Bia', 1);

  // Lobby: os dois na mesa; só o host começa.
  await expect(a.locator('.cl-lobby-people li', { hasText: 'Bia' })).toBeVisible();
  await expect(b.getByText('esperando o host começar…')).toBeVisible();
  await expect(b.getByRole('button', { name: 'começar', exact: true })).toHaveCount(0);
  await a.getByRole('button', { name: 'começar', exact: true }).click();

  // A mesa: o monte, a carta aberta e as mesas dos dois aparecem nas duas telas.
  for (const p of [a, b]) {
    await expect(pile(p, 'monte')).toBeVisible();
    await expect(pile(p, 'carta aberta')).toBeVisible();
    await expect(seat(p, 'sua mesa')).toBeVisible();
    await expect(seat(p, `mesa de ${p === a ? 'Bia' : 'Ana'}`)).toBeVisible();
  }

  // Quatro jogadas, a vez passando de um pro outro; a segunda é por arrasto, as outras por clique.
  for (let play = 0; play < 4; play++) {
    const [me, other] = await whoseTurn(a, b);
    const myName = names.get(me)!;
    const otherName = names.get(other)!;
    const before = await deckCount(me);
    expect(await deckCount(other)).toBe(before);

    // fora da vez não dá pra jogar
    await cannotPlay(other);

    if (play === 1) {
      // arrasto: a carta aberta (a carta em si) até a mesa do outro, devagar, como a mão faz
      const from = (await pile(me, 'carta aberta').locator('.lift').boundingBox())!;
      const to = (await seat(me, `mesa de ${otherName}`).boundingBox())!;
      await me.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await me.mouse.down();
      await me.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
      await me.mouse.up();
      await expectPlayed(me, other, before, new RegExp(`você deu .+ pra ${otherName}`), new RegExp(`${myName} deu .+ pra você`));
    } else {
      // clique: a carta aberta e depois a própria mesa
      await pile(me, 'carta aberta').click();
      await seat(me, 'sua mesa').click();
      await expectPlayed(me, other, before, /você ficou com/, new RegExp(`${myName} ficou com`));
    }
  }
});
