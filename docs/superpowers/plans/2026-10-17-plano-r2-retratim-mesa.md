# Plano R2 — Retratim: mesa no site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O Retratim fica jogável no site: lobby, montagem com os 6 kits, galeria de palpites, revelação narrada, placar e fim de jogo, ligados ao servidor, com bots de desenvolvimento e um E2E de uma rodada — portando o protótipo aprovado (`prototipo/retratim/`) pra React.

**Architecture:** Tudo do jogo em `web/src/games/pictures/`, no padrão do Diquisti (`web/src/games/dixit/`): palco fixo 1440×900 escalado (`useStageFit`), CSS escopado em `.pictures` com prefixo `pc-`, toast próprio no palco, sons próprios. Os **kits continuam imperativos** (DOM/SVG/canvas/three.js), portados quase 1:1 do protótipo pra módulos TS com o contrato `build(el, work, onChange) → {destroy}` / `show(el, work)`, e o React só os embrulha (`KitBench`, `KitShow`). Duas mudanças pequenas na base: a mensagem `state` passa a levar a hora do servidor (a contagem de 30 s não depende do relógio do PC) e `ready` pode levar a obra junto (o último rascunho nunca se perde no "estou pronto").

**Tech Stack:** React 19, TypeScript 5.9, Vite 8, Vitest 4 + Testing Library (jsdom), three.js (npm, carregado sob demanda com `import()`), `@tabler/icons-webfont` (ícones dos símbolos e das fotos provisórias), Playwright (E2E), Cloudflare Workers (só uma linha no servidor).

**Spec:** `docs/superpowers/specs/2026-10-17-retratim-design.md` (§2 regras, §3 kits, §4.3–4.5, §5 telas, §8, §9). **Referência de comportamento e visual: o protótipo aprovado pelo usuário em 2026-10-17** (`prototipo/retratim/`; abrir com o `launch.json` "prototipo-retratim", porta 5177, em `/prototipo/retratim/`). Onde este plano e o protótipo divergirem em comportamento, vale o protótipo, exceto nas mudanças listadas em "Diferenças em relação ao protótipo". Notas acumuladas: `docs/superpowers/plans/notas-para-retratim-r2-r4.md` (seção R2).

---

## Contexto para quem vai executar

- Repo `C:\Users\rafam\Desktop\Rpositórios Github - claude\Pessoal\Jogos de tabuleiro`, branch `feat/retratim` (sem push, sem merge: merge no `main` = deploy, decisão do usuário). Use o Bash (no PowerShell `npm.ps1`/`npx.ps1` podem estar bloqueados; use `npm.cmd`).
- Monorepo: `shared/` (regras puras), `server/` (Worker + Durable Object), `web/` (React). Comandos na raiz: `npm test -w shared|server|web -- <filtro>`, `npm run typecheck`, `npm run build`, `npm run e2e`.
- Tudo em português (textos, comentários, testes). Commits `feat(web): …`/`feat(shared): …`, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. `git add` com caminhos explícitos.
- `tsconfig` com `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`.
- **Modelo de código:** o Diquisti no `web/`. Antes de cada task de tela, leia os arquivos equivalentes citados (ex.: `DixitLobby.tsx`, `DixitTable.tsx`, `useStageFit.ts`, `useToast.ts`, `sounds.ts`, `useReveal.ts`/`reveal.ts`, `dev/dixitBots.ts`, `web/test/dixit-*.test.ts(x)`).
- **Modelo de comportamento e visual:** o protótipo. Seções do `prototipo/retratim/index.html` (linhas aproximadas): CSS do palco 24, topo 33, painel de dev 56, página 69, galeria 151, revelação 212, fim 287; JS: utilidades 395, laço 414, rascunho 455, bancada 481, bots 519, topo 577, grade 607, montagem 627, galeria 641, revelação 753, fim 918, confete 947, duas colunas/divisor 1027, zoom 1079. Kits: `prototipo/retratim/kits/*.js`; fotos provisórias: `photos.js`; obras aleatórias: `random.js`; sons: `sounds.js`.
- Identidade: kraft/papel (`--kraft:#eadbc0; --paper:#f6eedd; --edge:#d3bf99; --ink:#3b2f2f; --ink-soft:#7d6a58; --blue:#2f5aa8; --tape:rgba(242,165,65,.75); --photo-border:#fbf7ef; --ok:#3b6d11; --no:#a3958a`), **Caveat 700 só no logo "Retratim"**, **Quicksand 500/600/700 em todo o resto**.
- Só computador (celular fica pra depois: a página do jogo já mostra o aviso de celular pra todos os jogos).

### Diferenças em relação ao protótipo (intencionais)

1. **Sem painel de dev, sem "trocar meu kit", sem "apressar" pra todos**: o "apressar" (`hurry`) vira um botão discreto **só do host**, no topo, durante montagem/palpite.
2. **Bots** são conexões de verdade (como `web/src/dev/dixitBots.ts`), só em desenvolvimento, adicionados no lobby (`BotControls`).
3. **Selinhos** usam só a visão: montagem → "montando…"/"pronto ✓"; palpite → "palpitando…"/"confirmou ✓"; desconectado → "saiu". (Sem `fx.activity`.)
4. **Contagem** usa a hora do servidor (Task 2).
5. **"estou pronto"** manda `{type:'ready', on:true, work}` com a obra local (Task 1), em vez de rascunho + pronto.
6. **Placar da rodada** tem "próxima rodada" só pro host; os outros veem "esperando o host…". O mesmo no fim de jogo ("jogar de novo"/"voltar pro lobby" só pro host).
7. **Fotos**: as provisórias do protótipo (ícone sobre cor), com a real ganhando quando existir em `web/public/pictures/fotos/<id>.webp` (o Plano R3 traz as fotos). Sem 404 em produção: o componente só tenta a real se o id estiver na lista `PICTURES_PHOTOS_READY` (vazia até o R3; ver Task 4).

## Mapa de arquivos

Criar em `web/src/games/pictures/`:
- `kits/types.ts` (contrato), `kits/cubes.ts`, `kits/icons.ts`, `kits/dots.ts`, `kits/sticks.ts`, `kits/laces.ts`, `kits/blocks.ts`, `kits/index.ts` (registro `KITS_UI`).
- `random.ts` (obras aleatórias válidas, pros bots e testes), `photos.ts` (fotos provisórias), `status.ts` (nomes de kit, rótulos dos selinhos, nomes/cores dos jogadores).
- `pictures.css`.
- `PicturesLobby.tsx`, `PicturesTable.tsx`, `TopBar.tsx`, `Photo.tsx`, `PhotoGrid.tsx`, `SplitLayout.tsx`, `PhotoZoom.tsx`, `KitBench.tsx`, `KitShow.tsx`, `Building.tsx`, `Gallery.tsx`, `Reveal.tsx`, `RoundScore.tsx`, `GameOver.tsx`.
- `useDraft.ts`, `useCountdown.ts`, `reveal.ts` (linha do tempo pura), `useReveal.ts`, `sounds.ts`.
- `web/src/dev/picturesBots.ts`.
- Testes: `web/test/pictures-fixtures.ts`, `pictures-kits.test.ts`, `pictures-draft.test.ts`, `pictures-status.test.ts`, `pictures-reveal.test.ts`, `pictures-lobby.test.tsx`, `pictures-table.test.tsx`, `pictures-bots.test.ts`; `e2e/retratim.spec.ts`.

Modificar: `shared/src/games/pictures/{types,schema,rules,works}.ts` + testes (Task 1); `shared/src/protocol.ts`, `server/src/room-do.ts`, `web/src/net/connection.ts` + testes (Task 2); `web/package.json`, `web/index.html` (fontes) (Task 3); `web/src/screens/Game.tsx`, `web/src/games/catalog.ts`, `web/src/screens/shelf.css` (Task 5); `web/src/dev/BotControls.tsx` (Task 10).

---

### Task 1: `ready` levando a obra e a lista dos 19 símbolos (shared)

**Files:** Modify `shared/src/games/pictures/types.ts`, `schema.ts`, `rules.ts`, `works.ts`; Test `shared/test/pictures-rules.test.ts`, `pictures-works.test.ts`, `pictures-view.test.ts`.

- [ ] **Step 1: testes que falham**

Em `shared/test/pictures-works.test.ts`:

```ts
  it('os 19 símbolos têm nome, sem repetir', () => {
    expect(ICON_NAMES).toHaveLength(ICON_COUNT);
    expect(new Set(ICON_NAMES).size).toBe(ICON_COUNT);
  });
```

(importe `ICON_NAMES` e `ICON_COUNT` de `../src/games/pictures/works`).

Em `shared/test/pictures-rules.test.ts`, no describe da montagem:

```ts
  it('"pronto" pode levar a obra junto: grava e fica pronto de uma vez', () => {
    const { state, ctx } = started(3);
    const s = act(state, 'p0', { type: 'ready', on: true, work: sampleWork('cubes') }, ctx);
    expect(s.works.p0).toEqual(sampleWork('cubes'));
    expect(s.ready).toEqual(['p0']);
  });

  it('"pronto" com obra de outro kit, inválida ou em branco é recusado e nada muda', () => {
    const { state, ctx } = started(3);
    expect(applyPicturesAction(state, 'p0', { type: 'ready', on: true, work: sampleWork('laces') }, ctx)).toEqual({ ok: false, error: 'wrong_kit' });
    const four = { kit: 'cubes' as const, cells: [0, 0, 0, 0, ...Array<null>(12).fill(null)] };
    expect(applyPicturesAction(state, 'p0', { type: 'ready', on: true, work: four }, ctx)).toEqual({ ok: false, error: 'bad_work' });
    const blank = { kit: 'cubes' as const, cells: Array<null>(16).fill(null) };
    expect(applyPicturesAction(state, 'p0', { type: 'ready', on: true, work: blank }, ctx)).toEqual({ ok: false, error: 'empty_work' });
  });
```

Em `shared/test/pictures-view.test.ts`, no describe do schema: `expect(ok({ type: 'ready', on: true, work: sampleWork('dots') })).toBe(true);`.

Run: `npm test -w shared -- pictures` → FAIL.

- [ ] **Step 2: implementar**

`works.ts` (depois de `ICON_COUNT`):

```ts
/** Os 19 símbolos do kit (id = índice): nomes de ícone do Tabler Icons, sem o prefixo `ti-`. */
export const ICON_NAMES = [
  'circle', 'square', 'triangle', 'arrow-up', 'arrow-right', 'wave-sine', 'sun', 'moon', 'cloud', 'flame',
  'droplet', 'leaf', 'home', 'eye', 'heart', 'star', 'bolt', 'user', 'paw',
] as const;
```

`types.ts`: `| { type: 'ready'; on: boolean; work?: Work }`.

`schema.ts`: `z.object({ type: z.literal('ready'), on: z.boolean(), work: workSchema.optional() })`. (Se o `Assert` de tipos acusar diferença por causa de `undefined`, troque o tipo pra `work?: Work | undefined`.)

`rules.ts`, caso `'ready'`, troque o ramo `on: true` por:

```ts
      if (state.ready.includes(playerId)) return fail('already_ready');
      let next = state;
      if (action.work !== undefined) {
        // "estou pronto" leva a obra local: o último rascunho nunca se perde no meio do caminho.
        if (action.work.kit !== state.kits[playerId]) return fail('wrong_kit');
        const bad = workError(action.work);
        if (bad) return fail(bad);
        next = { ...state, works: { ...state.works, [playerId]: action.work } };
      }
      const notYet = readyError(next.works[playerId]);
      if (notYet) return fail(notYet);
      return ok(settlePictures({ ...next, ready: [...next.ready, playerId] }, ctx));
```

- [ ] **Step 3:** `npm test -w shared && npm run typecheck -w shared` → PASS.
- [ ] **Step 4:** Regenere o `rules.js` do protótipo (o comando está no topo do `prototipo/retratim/rules.js` / plano do protótipo, Task 1 Step 2) pra ele continuar batendo com as regras.
- [ ] **Step 5: Commit** `feat(shared): Retratim — "pronto" leva a obra e lista dos símbolos` (inclua `prototipo/retratim/rules.js`).

---

### Task 2: hora do servidor na mensagem `state`

**Files:** Modify `shared/src/protocol.ts`, `server/src/room-do.ts`, `web/src/net/connection.ts`; Test `server/test/pictures.test.ts`, `web/test/connection.test.ts`.

- [ ] **Step 1: testes que falham**
  - `server/test/pictures.test.ts`: num teste novo, depois de entrar numa sala, a mensagem `state` recebida tem `now` numérico e próximo de `Date.now()` (diferença < 5 s).
  - `web/test/connection.test.ts`: seguindo os testes existentes que simulam mensagens do servidor, mande `{t:'state', room, now: Date.now() + 10_000}` e confira que `getSnapshot().serverOffset` fica perto de 10 000 (tolerância 200 ms); sem `now`, `serverOffset` continua `0`.
- [ ] **Step 2: implementar**
  - `protocol.ts`: `| { t: 'state'; room: RoomView; /** Hora do servidor (ms) quando a visão saiu: o cliente mede a diferença pro próprio relógio. */ now?: number }`.
  - `room-do.ts`: em **todo** lugar que manda `{ t: 'state', … }` (grep `t: 'state'`), acrescente `now: Date.now()`.
  - `connection.ts`: `ConnSnapshot` ganha `serverOffset: number` (inicial `0`); ao receber `state` com `now`, `serverOffset = msg.now - Date.now()`. Atualize quem constrói `ConnSnapshot` à mão nos testes do web, se o typecheck pedir.
- [ ] **Step 3:** `npm test -w server && npm test -w web && npm run typecheck` → PASS.
- [ ] **Step 4: Commit** `feat: mensagem state leva a hora do servidor`.

---

### Task 3: dependências, fontes e contrato dos kits

**Files:** Modify `web/package.json`, `web/index.html`; Create `web/src/games/pictures/kits/types.ts`, `web/src/games/pictures/status.ts`, `web/test/pictures-status.test.ts`.

- [ ] **Step 1: dependências.** `npm install -w web three @tabler/icons-webfont` e `npm install -D -w web @types/three`. Confira que o `package-lock.json` mudou e commite junto.
- [ ] **Step 2: fontes.** No `<link>` do Google Fonts em `web/index.html`, acrescente `Caveat:wght@700` e `Quicksand:wght@500;600;700` (mantendo as do DITU/Diquisti).
- [ ] **Step 3: contrato** `kits/types.ts`:

```ts
import type { KitId, WorkOf } from '@cartolina/shared';

/** Um kit do Retratim: imperativo (DOM/SVG/canvas/WebGL), embrulhado pelo React em KitBench/KitShow. */
export interface KitModule<K extends KitId> {
  /**
   * Monta a bancada dentro de `el` (folha 4:3, já com tamanho). `work` = rascunho atual ou null (bancada nova).
   * Chama `onChange(obra)` a cada mexida (nunca na montagem inicial). Quem chama decide quando enviar.
   */
  build(el: HTMLElement, work: WorkOf<K> | null, onChange: (work: WorkOf<K>) => void): { destroy(): void };
  /** Desenha a obra (só leitura) dentro de `el`, em qualquer tamanho 4:3. */
  show(el: HTMLElement, work: WorkOf<K>): void;
}
```

(Se `WorkOf` não estiver exportado em `@cartolina/shared`, exporte-o — já está em `works.ts`, exportado por `export *`.)

- [ ] **Step 4: `status.ts`** (com teste primeiro em `web/test/pictures-status.test.ts`):

```ts
import type { KitId, PicturesView, SeatView } from '@cartolina/shared';

export const KIT_NAMES: Record<KitId, string> = {
  cubes: 'cubos coloridos', laces: 'cadarços', sticks: 'palitos e pedras',
  blocks: 'blocos', icons: 'símbolos', dots: 'pontos e linhas',
};

/** Rótulo do selinho de cada jogador, só a partir da visão. */
export function seatLabel(game: PicturesView, seat: SeatView): string {
  if (!seat.connected) return 'saiu';
  if (!game.inRound.includes(seat.id)) return 'esperando';
  if (game.phase === 'building') return game.ready.includes(seat.id) ? 'pronto ✓' : 'montando…';
  if (game.phase === 'guessing') return game.confirmed.includes(seat.id) ? 'confirmou ✓' : 'palpitando…';
  return '';
}

/** "1 pt" / "3 pts". */
export const pts = (n: number): string => `${n} ${n === 1 ? 'pt' : 'pts'}`;
```

Testes: cada ramo do `seatLabel` e `pts(1)`/`pts(0)`/`pts(3)` (monte `PicturesView` com as fixtures da Task 4 ou um objeto mínimo tipado).

- [ ] **Step 5:** `npm test -w web -- pictures-status && npm run typecheck -w web` → PASS. **Commit** `feat(web): Retratim — dependências, fontes e contrato dos kits`.

---

### Task 4: kits, fotos provisórias e obras aleatórias (porta do protótipo)

**Files:** Create `web/src/games/pictures/kits/{cubes,icons,dots,sticks,laces,blocks,index}.ts`, `random.ts`, `photos.ts`; Test `web/test/pictures-kits.test.ts`, `web/test/pictures-fixtures.ts`.

- [ ] **Step 1: fixtures** `web/test/pictures-fixtures.ts`, no molde de `web/test/dixit-fixtures.ts` (sala real do shared: `createRoom(code, 0, 'pictures')`, `joinRoom`, `roomAction`, `roomView`): `picturesRoom(n)`, `play(room, playerId, action, now?)`, `picturesView(room, viewer)`, `started(n)`, `guessing(n)` (todos mandam `ready` com `randomWork(kit)` da Task 4), `revealed(n)`.
- [ ] **Step 2: testes que falham** `web/test/pictures-kits.test.ts`:
  - para cada kit, 300 obras de `randomWork(kit)` passam em `workSchema` (de `@cartolina/shared`) e em `workError` (null) e não são em branco (`isBlankWork` false);
  - `resample` (exportado de `kits/laces.ts`): uma polilinha reta de 160 pontos em px vira 60 pontos igualmente espaçados, primeiro e último iguais aos originais (em 0–1), todos dentro de 0–1;
  - **física da corda** (spec §9): exporte de `kits/laces.ts` as funções puras da física (`makeChain`, `dragPoint(chain, i, x, y)` com janela K=9 + `pull` + `relax` + `clamp`, e `chainLength`); depois de 50 puxões aleatórios, o comprimento total fica entre 0,85 e 1,0 do original e nenhum trecho passa de L (fora o efeito do `clamp` na borda, tolerância de 5%);
  - `show` de `cubes`, `icons`, `dots`, `sticks`, `laces` em um `div` de 400×300 (jsdom) não lança e cria conteúdo (`el.childElementCount > 0`). O jsdom não tem canvas 2D: nos testes de kit que usam canvas, troque `HTMLCanvasElement.prototype.getContext` por um contexto falso mínimo (métodos vazios, `vi.fn()`), restaurado no `afterEach`;
  - `build` de `cubes`: clicar numa casa (dispare `pointerdown`/`click` como o kit escuta) chama `onChange` com `cells` contendo uma cor; `destroy()` não lança;
  - `photoTheme`/`photoPlaceholder` (de `photos.ts`): o mesmo id gera sempre o mesmo ícone/cor; ids do mesmo tema compartilham a família de ícones.
  - `blocks`: só confira que o módulo exporta `build`/`show` (jsdom não tem WebGL).
- [ ] **Step 3: portar os kits** de `prototipo/retratim/kits/*.js` pra TS, **mantendo o comportamento** (inclusive o que foi aprovado depois: Quicksand, respiro, cubos sem obrigação de completar, gaveta dos palitos, duas cordas com física v3 e K=9, menu flutuante dos blocos, renderer compartilhado + `toDataURL` + cache no `show` de blocos, `forceContextLoss()` no `destroy`). Ajustes:
  - cada arquivo exporta `export const cubes: KitModule<'cubes'> = { build, show }` etc.; `kits/index.ts` exporta `KITS_UI: { [K in KitId]: KitModule<K> }`;
  - `icons.ts` usa `ICON_NAMES` do shared (classe `ti ti-${nome}`), e o `show` mede o vão pelo próprio `el` (não pela janela — bug achado na galeria do protótipo);
  - `blocks.ts` faz `const THREE = await import('three')` (sem CDN); enquanto carrega, "carregando os blocos…"; falha → mensagem + "tentar de novo";
  - textos e classes com prefixo `pc-` (o CSS vem na Task 6, mas os kits podem ter estilo inline/próprio como no protótipo);
  - nada de `window.*` global.
- [ ] **Step 4: `random.ts`** porta de `prototipo/retratim/random.js` (`export function randomWork(kit: KitId): Work`), incluindo os blocos apoiados sem sobreposição.
- [ ] **Step 5: `photos.ts`** porta de `prototipo/retratim/photos.js`:
  - `export function photoPlaceholder(id: string): { theme, icon, hue, sat, light, size, rot, dx, dy, label }` (pura, testável);
  - `export const PICTURES_PHOTOS_READY: ReadonlySet<string> = new Set()` — ids que têm foto real em `web/public/pictures/fotos/` (o script do R3 preenche); `photoSrc(id)` devolve `${import.meta.env.BASE_URL}pictures/fotos/${id}.webp` só se estiver no conjunto, senão `null`.
- [ ] **Step 6:** `npm test -w web -- pictures-kits && npm run typecheck -w web` → PASS. **Commit** `feat(web): Retratim — kits, fotos provisórias e obras aleatórias`.

---

### Task 5: lobby, rota da sala, estante jogável e capa

**Files:** Create `web/src/games/pictures/PicturesLobby.tsx`, `pictures.css` (início); Modify `web/src/screens/Game.tsx`, `web/src/games/catalog.ts`, `web/src/screens/shelf.css`, `web/test/catalog.test.ts`, `web/test/shelf.test.tsx`; Test `web/test/pictures-lobby.test.tsx`.

- [ ] **Step 1: testes que falham** `pictures-lobby.test.tsx` (molde: `web/test/dixit-lobby.test.tsx`): host com 3+ conectados clica "começar" → `sendAction({type:'start'})`; com 2, "começar" mostra o aviso de 3 pessoas e não manda; quem não é host vê "esperando o host começar…"; mostra o código da sala e "copiar link da sala". E em `catalog.test.ts`/`shelf.test.tsx`: Retratim agora `playable: true` (sem selo "em breve" na estante).
- [ ] **Step 2: `PicturesLobby`** no molde do `DixitLobby` (lista de bichinhos+nomes, link da sala, som, "começar", "voltar pro início", `BotControls` só em DEV com `game="pictures"` — a entrada no `BotControls` vem na Task 10; até lá, passe a prop e deixe o `BotControls` ignorar jogo desconhecido, ou adicione a entrada já com stubs). Visual álbum: título "Retratim" em Caveat, resto Quicksand, página kraft.
- [ ] **Step 3: rota** em `Game.tsx`: `if (isPicturesRoomView(view)) return <>{reconnecting}{view.game.phase === 'lobby' ? <PicturesLobby view={view} conn={conn}/> : <PicturesTable view={view} conn={conn} serverOffset={snap.serverOffset}/>}</>`. Até a Task 6 existir, crie um `PicturesTable` mínimo ("mesa em construção").
- [ ] **Step 4: estante**: `catalog.ts` → `playable: true` (tire o comentário "A mesa vem no Plano R2"); `shelf.css` → `.cover-pictures` na identidade álbum (kraft, foto com borda branca e fitinha, "Retratim" em Caveat; olhe `.cover-ito`/`.cover-dixit` pra estrutura).
- [ ] **Step 5:** `npm test -w web && npm run typecheck` → PASS. **Commit** `feat(web): Retratim — lobby, rota e estante jogável`.

---

### Task 6: mesa — palco, topo, grade com divisor e zoom, montagem

**Files:** Create `PicturesTable.tsx`, `TopBar.tsx`, `Photo.tsx`, `PhotoGrid.tsx`, `SplitLayout.tsx`, `PhotoZoom.tsx`, `KitBench.tsx`, `KitShow.tsx`, `Building.tsx`, `useDraft.ts`, `useCountdown.ts`, `pictures.css`; Test `web/test/pictures-draft.test.ts`, `web/test/pictures-table.test.tsx`.

- [ ] **Step 1: `useDraft` com teste primeiro** (`pictures-draft.test.ts`, `vi.useFakeTimers()`). Regras (protótipo, seção "rascunho", e notas do R2):
  - nada é enviado antes da primeira mexida (`onChange`);
  - envia `draft` no máximo a cada 2 s; a última mexida sempre sai (trailing);
  - `markReady()` cancela o envio pendente e manda **uma** ação `{type:'ready', on:true, work: obraLocal}`;
  - depois de pronto, mexidas não enviam nada; `unready()` manda `{type:'ready', on:false}` e volta a enviar;
  - trocar de rodada/kit (`key` diferente) zera tudo.

```ts
/** Rascunho da bancada: local manda; servidor só serve pra reconectar (o eco nunca recria a bancada). */
export function useDraft(key: string, send: (a: PicturesAction) => void): {
  local: Work | null; touched: boolean; onChange(work: Work): void; markReady(): void; unready(): void;
}
```

  Testes: (a) sem mexida, nada; (b) 5 mexidas em 1 s → 1 envio imediato (a 1ª) + 1 no fim dos 2 s com a última obra; (c) `markReady` logo depois de mexer → só a ação `ready` com a obra mais recente, sem `draft` atrasado; (d) mudar `key` descarta o pendente.

- [ ] **Step 2: `useCountdown(endsAt, serverOffset)`** → segundos restantes (inteiro, ≥ 0) ou `null`, atualizando a cada 250 ms; usa `Date.now() + serverOffset`.
- [ ] **Step 3: componentes** (porta do protótipo; visual idêntico, Quicksand, respiro de 48 px do divisor):
  - `PicturesTable`: raiz `<div className="pictures" data-button-sounds>`, palco 1440×900 com `useStageFit` (de `../dixit/useStageFit`), toast do palco (`useToast` do Diquisti) ligado a `conn.onError` (ignora `JOIN_ERRORS`), e troca de tela por fase (`building` → `Building`; `guessing`/`reveal`/`gameover` → telas das Tasks 7–8; até lá, um aviso simples).
  - `TopBar`: logo "Retratim" (Caveat), "rodada X de 6 · seu kit" + nome do kit, selinhos (`seatLabel`, bichinho via `<Critter>`, pontos `pts`), relógio "faltam 0:24" (`useCountdown`), botão de som (`SoundPill` do Diquisti ou equivalente no estilo álbum), **"apressar" só pro host** em montagem/palpite sem contagem correndo (`{type:'hurry'}`).
  - `Photo` (placeholder do `photos.ts` com ícone Tabler; `<img>` real só se `photoSrc(id)`), `PhotoGrid` (4×4 com A–D/1–4, contorno tracejado azul na secreta, lupinha ao passar o mouse, `onPhotoClick`), `PhotoZoom` (Esc/clique fora/✕, ← → e botões ‹ ›, selo "sua foto"), `SplitLayout` (divisor 35%–75%, duplo clique volta ao padrão, `localStorage` com try/catch, callback `onResizeEnd`).
  - `KitBench`: `useEffect` chama `KITS_UI[kit].build(el, draft.local ?? myWorkDaVisão, draft.onChange)` **só quando a chave `rodada:kit` muda ou o divisor é solto** (aí reconstrói com `draft.local`); nunca por re-render/eco. `destroy()` no cleanup.
  - `KitShow`: `useEffect` com `KITS_UI[work.kit].show(el, work)` quando a obra muda (compare por `JSON.stringify`).
  - `Building`: grade à esquerda (clique na foto = zoom), à direita o cartão "sua foto secreta B3" com fitinha (abre o zoom), a bancada e "estou pronto"/"desmarcar pronto" (bancada a 60% de opacidade e sem interação quando pronto).
- [ ] **Step 4: teste de tela** `pictures-table.test.tsx` (molde `dixit-table.test.tsx`, mocke `./sounds` e o `kits/blocks`): na montagem aparecem "sua foto secreta" com a coordenada da visão, a grade com 16 fotos e "estou pronto"; clicar em "estou pronto" sem mexer mostra o toast vindo de `conn.onError` (simule o erro `empty_work`) — ou, se o componente bloquear antes, o texto equivalente; host vê "apressar" e outro jogador não.
- [ ] **Step 5:** `npm test -w web && npm run typecheck && npm run build` → PASS. **Commit** `feat(web): Retratim — mesa, montagem, divisor e zoom`.

---

### Task 7: galeria de palpites

**Files:** Create `Gallery.tsx` (+ CSS); Modify `PicturesTable.tsx`; Test `pictures-table.test.tsx` (acrescentar).

- [ ] **Step 1: testes que falham**: na fase `guessing` (fixture `guessing(3)`), aparecem as obras dos outros (não a sua) com nome do artista e do kit; selecionar uma obra e clicar numa foto manda `{type:'guess', artist, coord}`; clicar na fitinha manda `coord: null`; "confirmar palpites" mostra "faltam N obras sem palpite" e manda `{type:'confirm'}`; depois de confirmado aparece "esperando a galera…" e nada mais manda ação.
- [ ] **Step 2: implementar** (porta da seção "galeria" do protótipo): molduras em 2 colunas com rolagem só nelas, `KitShow` dentro de cada folha (a folha é o contêiner do `show`), fitinha "B3" (Quicksand 700, `--tape`, tinta azul, girada), contorno azul na obra selecionada e na foto correspondente, bichinhos nas fotos já usadas, "sem palpite", lupa da obra (sobreposição grande), teclado letra+número, selinhos e relógio do topo. Os palpites mostrados vêm de `view.game.myGuesses` (sem estado local duplicado).
- [ ] **Step 3:** `npm test -w web && npm run typecheck` → PASS. **Commit** `feat(web): Retratim — galeria de palpites`.

---

### Task 8: revelação narrada, placar da rodada e fim de jogo

**Files:** Create `reveal.ts`, `useReveal.ts`, `Reveal.tsx`, `RoundScore.tsx`, `GameOver.tsx`; Modify `PicturesTable.tsx`; Test `web/test/pictures-reveal.test.ts`, `pictures-table.test.tsx`.

- [ ] **Step 1: linha do tempo pura com teste primeiro** (molde `web/src/games/dixit/reveal.ts` + `web/test/dixit-reveal.test.ts`): `buildRevealTimeline(result, seats) → evento[]` com, pra cada artista de `result.order`: `grow` (0,9 s), uma `tape` por palpiteiro (1,2 s no total), `photo` (1,2 s), `mark` (0,8 s), `points` (1 s); e `frameAt(eventos, t)` devolvendo `{ artistIndex, tapes, photoShown, marked, scoresSoFar, done }`. Testes: tempos e ordem; `order` vazio → só `done` ("ninguém montou nada nesta rodada"); `scoresSoFar` sobe até o placar final.
- [ ] **Step 2: `useReveal`** (molde `useReveal.ts` do Diquisti): relógio de 50 ms, sons por evento (`shutter`, `tape`, `plim`; evento atrasado > 300 ms não toca), `skip()`, chave por rodada (`result.round` + ordem) pra nunca recomeçar em re-render.
- [ ] **Step 3: telas** (porta das seções "revelação" e "fim" do protótipo): obra crescendo na coluna da direita, fitinhas embaixo da obra com bichinho, foto voando da posição real na grade até o lado da obra (polaroide "era a B2"), ✓ verde/cinza, adesivo azul "+N" saindo dos selinhos, "pular ›"; `RoundScore` (cartão de álbum ordenado pelo total, `+ganho`, total; "próxima rodada"/"ver o fim do jogo" só pro host, senão "esperando o host…"); `GameOver` (posições com empate 1º/1º/3º, estrelinha nos `winners`, "empate!", confete de papel — use `web/src/table/confetti.ts` com as cores do álbum —, "jogar de novo"/"voltar pro lobby" só pro host, som `win` se você venceu).
- [ ] **Step 4:** teste de tela: em `revealed(3)`, "pular" leva ao placar com os totais da visão; host vê "próxima rodada" e clicar manda `{type:'next'}`; não-host vê "esperando o host…". `npm test -w web && npm run typecheck` → PASS. **Commit** `feat(web): Retratim — revelação narrada, placar e fim`.

---

### Task 9: sons

**Files:** Create `web/src/games/pictures/sounds.ts`; Test `web/test/pictures-sounds.test.ts`.

- [ ] Porta de `prototipo/retratim/sounds.js` (Web Audio sintetizado, **volume geral 0,35**): `tape`, `peel`, `shutter`, `plim`, `ready`, `tick`, `round`, `error`, `win`. `export function playPicturesSound(name: PicturesSound)`; respeita `loadSoundPref()` (não toca com o som desligado); `AudioContext` criado só depois de um gesto. Ligue nos lugares do protótipo (fitinha, revelação, pronto/confirmou de qualquer um — detectado pela mudança da visão —, `tick` nos 5 s finais uma vez por segundo, `round` ao começar rodada, `win`, `error` no toast). Botões do jogo usam `installButtonSounds` no estilo do Diquisti (`data-button-sounds` + ganho baixo).
- [ ] Teste: com `loadSoundPref` falso nada cria `AudioContext` (mock); todo nome é aceito sem lançar (mock do `AudioContext` simples). **Commit** `feat(web): Retratim — sons baixinhos`.

---

### Task 10: bots de desenvolvimento

**Files:** Create `web/src/dev/picturesBots.ts`; Modify `web/src/dev/BotControls.tsx`, `PicturesLobby.tsx`; Test `web/test/pictures-bots.test.ts`.

- [ ] Molde: `web/src/dev/dixitBots.ts` + `web/test/dixit-bots.test.ts`. Função pura `decidePictures(view, rng) → { key, delay, actions } | null`:
  - montagem, eu na rodada e não pronto → depois de 3–9 s, `[{type:'ready', on:true, work: randomWork(meuKit)}]` (um bot em cada 4, sorteado pela semente da rodada, espera 40 s pra a contagem aparecer);
  - palpite, eu na rodada e não confirmado → depois de 4–12 s, um `guess` por obra alheia (coordenada aleatória; os bots não sabem o segredo) e `confirm`;
  - nunca ações de host.
- [ ] `BotControls`: entrada `pictures` no mapa `API` e no tipo da prop `game`.
- [ ] Testes de `decidePictures` (cada ramo; nunca `next`/`hurry`/`start`). **Commit** `feat(web): Retratim — bots de desenvolvimento`.

---

### Task 11: E2E de uma rodada e conferência final

**Files:** Create `e2e/retratim.spec.ts` (e helpers em `e2e/helpers.ts` se precisar).

- [ ] **Step 1: teste** (molde `e2e/rodada.spec.ts`): 3 navegadores; a cria a sala pelo link "Retratim" da estante, todos entram, o host começa. Na rodada 0, pela ordem dos assentos, os kits são cubos (a), cadarços (b), palitos e pedras (c):
  - a: clica numa casa da grade de cubos;
  - b: arrasta um ponto da corda longa (mouse down/move com `steps`/up sobre o canvas);
  - c: arrasta um palito da gaveta pra dentro da folha;
  - os três clicam "estou pronto" → galeria;
  - cada um seleciona cada obra alheia e clica numa foto, depois "confirmar palpites";
  - todos veem a revelação; clicam "pular ›"; o host vê "próxima rodada" e o placar mostra 3 jogadores.
- [ ] **Step 2:** `npm run typecheck && npm test && npm run build && npm run e2e` → tudo PASS (inclusive os E2E do DITU e "build de produção não tem bots").
- [ ] **Step 3: conferência no navegador** (controlador): subir `server` + `web` (`.claude/launch.json`), jogar uma rodada com bots, comparar com o protótipo (visual, ritmo da revelação, sons).
- [ ] **Step 4:** spec §10 item 4 → "(feito, `docs/superpowers/plans/2026-10-17-plano-r2-retratim-mesa.md`)"; notas do R2 que foram resolvidas marcadas como feitas. **Commit** `test(e2e): rodada do Retratim` e `docs: Plano R2 do Retratim concluído`.

Não abra PR nem faça merge: publicar é decisão do usuário. Lembrete pra ele: com o R2 no `main`, o Retratim fica jogável em produção **com fotos provisórias** até o R3.
