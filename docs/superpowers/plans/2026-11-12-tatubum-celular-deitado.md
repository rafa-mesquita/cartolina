# Tatubum no celular deitado — plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o Tatubum passa a ser jogado com o celular deitado (layout B do protótipo `prototipo/tatubum-deitado/`), e em pé pede pra deitar.

**Architecture:** um terceiro layout `'land'` da mesa imperativa (`web/src/games/kittens/mesa.ts`), com a classe `kt-land` no palco e CSS próprio em `kittens.css`. O que é "tela de toque" (toque, segurar, fileira que rola, "toque" nos textos) passa a valer pro `'phone'` e pro `'land'`; o que é "coluna em pé" continua só no `'phone'`. O catálogo diz a orientação de cada jogo no celular, e o aviso de virar segue isso.

**Tech Stack:** React 19, Vite, TypeScript, Vitest + Testing Library (jsdom), Playwright.

Spec: `docs/superpowers/specs/2026-11-12-tatubum-celular-deitado-design.md`. Comandos rodam na worktree
`.claude/worktrees/tatubum-deitado` (Git Bash; não existe `rtk` lá). Testes do site: `npm test -w web -- <filtro>`.
Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## Arquivos

| Arquivo | O que muda |
|---|---|
| `web/src/lib/device.ts` | `LAND_LAYOUT_QUERY`, `useGameLayout(orientation)` |
| `web/src/games/catalog.ts` | `phoneOrientation` no `CatalogEntry`; Tatubum `'landscape'` |
| `web/src/screens/RotateNotice.tsx` | recebe a orientação; em pé num jogo deitado pede pra deitar |
| `web/src/screens/RoomScreen.tsx` | passa a orientação do jogo da sala pro `RotateNotice` |
| `web/src/games/kittens/KittensTable.tsx` | usa `useGameLayout('landscape')` |
| `web/src/games/kittens/mesa.ts` | `MesaLayout` ganha `'land'`; `touch()`; `fit()` deitado; seta do diário |
| `web/src/games/kittens/kittens.css` | seção nova `#stage.kt-land` |
| `web/test/device.test.tsx`, `web/test/room-screen.test.tsx`, `web/test/kittens-mesa.test.ts` | testes |
| `e2e/tatubum.spec.ts`, `e2e/helpers.ts` | jogador deitado |

As tarefas 1 e 2 mexem em arquivos diferentes e podem andar juntas. A interface entre elas: `MesaLayout =
'phone' | 'desktop' | 'land'` (em `mesa.ts`) e `useGameLayout` devolvendo esse mesmo trio.

---

### Task 1: orientação por jogo, aviso de virar e escolha do layout

**Files:** `web/src/lib/device.ts`, `web/src/games/catalog.ts`, `web/src/screens/RotateNotice.tsx`,
`web/src/screens/RoomScreen.tsx`, `web/src/games/kittens/KittensTable.tsx`, `web/test/device.test.tsx`,
`web/test/room-screen.test.tsx`.

- [ ] **Step 1: testes que falham** em `web/test/device.test.tsx` (seguir o mock de `matchMedia` que o arquivo já usa):

```ts
it('useGameLayout: jogo deitado vira "land" com a tela deitada e baixa; em pé segue o useLayout', () => {
  setMedia({ [LAND_LAYOUT_QUERY]: true });
  expect(renderHook(() => useGameLayout('landscape')).result.current).toBe('land');
  expect(renderHook(() => useGameLayout('portrait')).result.current).toBe('desktop');
  setMedia({ [PHONE_LAYOUT_QUERY]: true });
  expect(renderHook(() => useGameLayout('landscape')).result.current).toBe('phone');
});
```

E em `web/test/room-screen.test.tsx` (ou num `rotate-notice.test.tsx` novo):

```tsx
it('jogo de jogar deitado: em pé pede pra deitar; deitado não avisa', () => {
  setMedia({ [PHONE_QUERY]: true, [PHONE_LAYOUT_QUERY]: true });
  render(<RotateNotice orientation="landscape" />);
  expect(screen.getByRole('alert').textContent).toContain('vira o celular deitado');
});
it('jogo de jogar em pé: deitado pede pra ficar em pé (como antes)', () => {
  setMedia({ [LANDSCAPE_PHONE_QUERY]: true });
  render(<RotateNotice orientation="portrait" />);
  expect(screen.getByRole('alert').textContent).toContain('vira o celular em pé');
});
```

- [ ] **Step 2:** `npm test -w web -- device room-screen` → falham (não existe `useGameLayout`/prop).

- [ ] **Step 3: implementar.** Em `device.ts`:

```ts
/** Tela deitada e baixa (celular deitado, ou janela baixa no computador): mesa deitada dos jogos `landscape`. */
export const LAND_LAYOUT_QUERY = '(orientation: landscape) and (max-height: 500px)';
export type GameLayout = Layout | 'land';
/** Layout da mesa de um jogo: o jogo de celular deitado usa 'land' com a tela deitada e baixa. */
export function useGameLayout(orientation: 'portrait' | 'landscape'): GameLayout {
  const land = useMedia(LAND_LAYOUT_QUERY);
  const base = useLayout();
  return orientation === 'landscape' && land ? 'land' : base;
}
/** Aparelho de toque em pé (pra pedir pra deitar nos jogos `landscape`). */
export function useIsPortraitPhone(): boolean {
  return useMedia(PHONE_QUERY) && useMedia(PHONE_LAYOUT_QUERY);
}
```

Em `catalog.ts`: campo `phoneOrientation?: 'portrait' | 'landscape'` (doc: "Como joga no celular; ausente = em pé")
e `phoneOrientation: 'landscape'` no `kittens`. Helper `phoneOrientationOf(game) = catalogEntry(game)?.phoneOrientation ?? 'portrait'`.

`RotateNotice({ orientation = 'portrait' })`: `'portrait'` → comportamento de hoje (`useIsLandscapePhone`, "vira o
celular em pé 📱"); `'landscape'` → mostra "vira o celular deitado 📱↔" quando `useIsPortraitPhone()`. Chamar os dois
hooks sempre (regras dos hooks) e escolher pelo `orientation`.

`RoomScreen`: `<RotateNotice orientation={phoneOrientationOf(snap.view.gameId)} />` na sala e
`orientation={info ? phoneOrientationOf(info.game) : 'portrait'}` na tela de entrar.

`KittensTable`: `const layout = useGameLayout('landscape');` no lugar de `useLayout()`.

- [ ] **Step 4:** `npm test -w web -- device room-screen kittens-table` → passam. `npm run typecheck` pode acusar
`'land'` não cabendo em `MesaLayout` até a Task 2 entrar; nesse caso rodar o typecheck depois dela.
- [ ] **Step 5:** commit `feat(web): Tatubum é de jogar deitado no celular (aviso e layout por jogo)`.

---

### Task 2: layout `'land'` na mesa (TS)

**Files:** `web/src/games/kittens/mesa.ts`, `web/test/kittens-mesa.test.ts`.

- [ ] **Step 1: testes que falham** em `kittens-mesa.test.ts` (usar os helpers que o arquivo já tem pra criar a mesa e
mandar visões; os testes de `'phone'` nas linhas ~526 e ~720 são o modelo):

```ts
describe('mesa deitada (land)', () => {
  it('liga kt-land (e não kt-phone), troca "clique" por "toque" e tira a última linha do diário', () => {
    const { mesa, stage } = createWith({ layout: 'land' });
    mesa.update(started());
    expect(stage.classList.contains('kt-land')).toBe(true);
    expect(stage.classList.contains('kt-phone')).toBe(false);
    expect(stage.querySelector('#lastline')!.hasAttribute('hidden')).toBe(true);
  });
  it('a seta da direita abre o diário e a seta da gaveta fecha', () => {
    const { mesa, stage } = createWith({ layout: 'land' });
    mesa.update(started());
    (stage.querySelector('#logtab') as HTMLButtonElement).click();
    expect(stage.classList.contains('kt-logopen')).toBe(true);
    (stage.querySelector('#log .kt-logclose') as HTMLButtonElement).click();
    expect(stage.classList.contains('kt-logopen')).toBe(false);
  });
  it('setLayout troca entre desktop, phone e land na mesma mesa', () => {
    const { mesa, stage } = createWith({ layout: 'desktop' });
    mesa.update(started());
    mesa.setLayout('land');
    expect(stage.classList.contains('kt-land')).toBe(true);
    mesa.setLayout('desktop');
    expect(stage.classList.contains('kt-land')).toBe(false);
  });
});
```

Acrescentar `'land'` aos `it.each(['desktop', 'phone'])` que já existem (painel do Quati e o da linha ~720).

- [ ] **Step 2:** `npm test -w web -- kittens-mesa` → os novos falham.

- [ ] **Step 3: implementar em `mesa.ts`.**
  - `export type MesaLayout = 'phone' | 'desktop' | 'land';` (doc atualizada).
  - Junto de `phone()`: `const land = (): boolean => layout === 'land';` e
    `/** Tela de toque (celular em pé ou deitado): toque, segurar, fileiras que rolam, "toque" nos textos. */ const touch = (): boolean => layout !== 'desktop';`
  - Revisar as 37 chamadas de `phone()` uma a uma. Viram `touch()`: `tx`, `clampToSeats`, `revealSeat`, `bigAt`,
    `popPx`, `mineAt`, `edgeScroll`, a mão que rola (`PHONE_STEP`, sem `ondblclick`/`onmouseleave`), as dicas de
    toque nos painéis e na galeria, o "toque fora pra fechar", `openLog`, `syncSheets` (folhas com `#scrim`). Ficam
    `phone()` só o que é da coluna em pé: o ajuste da faixa de botões (`kt-tight`/`kt-longhint`), a tira `#lastline`
    e as medidas `PHONE_MIN_W/H`, `PHONE_SHORT_H`.
  - `stage.classList.toggle('kt-land', land())` junto do `kt-phone` (no início e em `setLayout`).
  - `fit()` com `land()`: como o ramo do `phone()`, com `LAND_MIN_W = 740` e `LAND_MIN_H = 340`
    (`scale = Math.min(1, W / LAND_MIN_W, H / LAND_MIN_H)`), sem `kt-short`, e o cerrado na proporção deitada
    (`w = Math.round((180 * stageW) / stageH)`).
  - Diário deitado: um botão novo no HTML do palco, irmão de `#lastline`:
    `<button type="button" id="logtab" aria-label="Abrir o diário" aria-haspopup="dialog">◀</button>`, que chama
    `openLog()`. Em `renderLog()`, com `land()` o cabeçalho da gaveta ganha
    `<button type="button" class="kt-logclose" aria-label="Fechar o diário">▶</button>` (no lugar do FECHAR do
    `'phone'`), que chama `closeSheets()`. `#lastline` ganha `hidden` com `land()` e perde no resto.
  - Botões da coluna: o `#actions` continua sendo preenchido por `fillActions()`; o posicionamento em coluna é CSS
    (Task 3). O botão "AS CARTAS" e o "SOM" do `#topbar` são movidos pelo CSS também (não mexer no HTML).

- [ ] **Step 4:** `npm test -w web -- kittens` → todos passam.
- [ ] **Step 5:** commit `feat(web): mesa do Tatubum ganha o layout deitado (land)`.

---

### Task 3: CSS da mesa deitada (layout B)

**Files:** `web/src/games/kittens/kittens.css` (seção nova depois da do `kt-phone`, com o mesmo cabeçalho de
comentário `/* ======== Celular deitado (classe kt-land no #stage) */`).

Referência visual: `prototipo/tatubum-deitado/index.html`, opção B (rodar com `npx --yes http-server . -p 51xx` na
raiz da worktree e abrir `/prototipo/tatubum-deitado/`). Medidas de 844×390:

- [ ] **Step 1:** palco: `#stage.kt-land { left: 0; top: 0; transform-origin: 0 0; user-select: none; -webkit-touch-callout: none; }`,
  `#board { display: contents; }` e todos os blocos com `position: absolute`. Margem de segurança:
  `padding` via `env(safe-area-inset-left/right)` aplicada nos `left`/`right` dos blocos (o recorte da câmera).
- [ ] **Step 2:** `#topbar`: só a faixa da vez (`#turn`) no canto direito de cima (`right: 40px; top: 10px`); `#logo`
  some; `#cards` e `#sound` vão pra coluna da direita (Step 5).
- [ ] **Step 3:** `#seats`: `top: 6px; left: 56px; right: 150px; height: 44px;` fileira com `overflow-x: auto`, assentos
  compactos (bichinho 26 px, nome + "N cartas" em duas linhas, marcas pequenas), igual ao protótipo.
- [ ] **Step 4:** `#table`: `left: 56px; right: 150px; top: 58px; height: ~150px`; monte, ar e descarte lado a lado
  com cartas de 64 px de largura (`transform: scale(.57)` nas cartas de 112 px, como o `'phone'` faz), `#bar` embaixo
  do ar, `#eye` junto do descarte, `#future` junto do monte, `#caption` e `#banners` por cima do meio.
- [ ] **Step 5:** coluna da direita: `#actions` em `right: 40px; bottom: 12px; width: 98px; flex-direction: column`
  (dica em cima, botões embaixo, JOGAR por último); `#cards` e `#sound` em cima dela (`top: 70px`).
- [ ] **Step 6:** mão: `#hand` em `left: 50px; right: 150px; bottom: 10px; height: ~112px;` uma fileira que rola,
  cartas de 66 px (escala sobre 112), selecionada sobe 14 px; `#front` no começo da fileira (à esquerda, separado).
- [ ] **Step 7:** diário: `#logtab` na borda direita (`right: 0; top: 50%; translate: 0 -50%; 26×64 px`); `#log`
  vira gaveta `position: absolute; top: 0; right: 0; bottom: 0; width: 300px;` fora da tela (`translate: 100% 0`)
  e entra com `.kt-logopen` (`translate: 0 0`, `transition: translate .18s steps(4)`); `.kt-logclose` na borda
  esquerda da gaveta. `#lastline` escondida.
- [ ] **Step 8:** painéis (`#panel`, `#pile`, `#gallery`, `#over`, `#viewer`): centrados, `max-height: calc(100% - 20px)`,
  rolagem por dentro, cartas menores. Carta grande e textos que pulam já seguem `bigAt()`/`popPx()`.
- [ ] **Step 9:** `npm test -w web -- kittens` e `npm run build -w web` passam. Commit
  `feat(web): CSS da mesa deitada do Tatubum (mão à mostra)`.

---

### Task 4: conferência no navegador

- [ ] Subir servidor e site próprios (CLAUDE.md, "Testar no navegador"): `npx wrangler dev --port 87xx --inspector-port 92xx`
  em `server/`, `npx vite --port 51xx --strictPort` em `web/` com `web/.env.development.local` apontando pro servidor.
- [ ] Viewport 844×390: criar sala do Tatubum, 3 bots, começar. Conferir: galera, mesa, mão rolando, coluna de botões,
  comprar pelo monte, jogar carta, Nem vem!, seta do diário abrindo e fechando, painel do Favor e do Desarme, BUM!.
- [ ] Viewport 740×360 e 932×430: nada cortado.
- [ ] Viewport 390×844 com toque (preset mobile): aparece "vira o celular deitado".
- [ ] Sala de espera deitada (844×390): cabe e os botões aparecem.
- [ ] Corrigir o que estiver errado, rodar os testes de novo, tirar prints pro Rafa. Apagar `.env.development.local`
  e as entradas temporárias do `launch.json`.

### Task 5: E2E

**Files:** `e2e/helpers.ts`, `e2e/tatubum.spec.ts`.

- [ ] `newLandscapePlayer(browser)` em `helpers.ts`, igual ao `newPhonePlayer` mas com `viewport: { width: 844, height: 390 }`,
  `hasTouch: true`, `isMobile: true`.
- [ ] Teste: anfitrião no computador e um jogador deitado entram, começam; o deitado vê `#stage.kt-land`, abre o
  diário pela `#logtab` e vê `.kt-logopen`; fecha pela `.kt-logclose`.
- [ ] `npm run e2e -- tatubum` passa. Commit `test(e2e): Tatubum deitado no celular`.

### Task 6: PR

- [ ] `npm test`, `npm run typecheck`, `npm run build -w web`; atualizar o "Versão de celular" do `CLAUDE.md`
  (Tatubum deitado, `phoneOrientation`); PR com prints; não fazer merge sem o Rafa.
