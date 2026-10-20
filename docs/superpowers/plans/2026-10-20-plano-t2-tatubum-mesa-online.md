# Plano T2 (refeito) — Tatubum: a mesa do protótipo no site, online

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> Substitui o rascunho `2026-10-19-plano-t2-tatubum-mesa.md` (escrito antes das artes do Flow, do ciclo do dia,
> do zoom explicado, da ordem da vez e dos combos novos). Pedido do Rafa (2026-10-20): "pode subir pra main,
> deixe a opção de colocar bot, que vou testar eu e um amigo" → primeiro a mesa de verdade, depois a main.

**Goal:** O Tatubum fica jogável no site, online (2 a 8 pessoas, cada uma no seu PC), com a mesa **igual ao
protótipo aprovado** e com a opção de pôr bots na sala também no site publicado.

**Architecture:** A mesa do protótipo (`prototipo/tatubum/index.html` + `sprites.js`, `cerrado.js`, `fx.js`,
`sounds.js`) é um motor imperativo que desenha a partir de uma `KittensView` e roda uma fila de efeitos dirigida
pelo diário. Ele é portado quase 1:1 para TypeScript como uma "ilha" imperativa (`mesa.ts`) que o React monta
num `<div>`: a sala manda a visão nova (`mesa.update(...)`), e as jogadas saem por `send(action)` para o servidor
(no protótipo saíam pras regras locais). O lobby continua o React que já existe (`KittensLobby.tsx`).

**Tech Stack:** React 19, TypeScript, Vite, Vitest + jsdom, Playwright, Canvas 2D, Web Audio.

**Spec:** `docs/superpowers/specs/2026-10-19-tatubum-design.md`. **Referência de comportamento e visual:** o
protótipo — servir a raiz do worktree (`npx http-server . -p 5179 -c-1`) e abrir `/prototipo/tatubum/`.

---

## Contexto para quem vai executar

- Worktree `.claude/worktrees/tatubum`, branch `feat/tatubum`. Não fazer push nem merge (merge na `main` = publicar).
- Windows: `npx.cmd`/`npm.cmd` se `npx`/`npm` não acharem; o `rtk` não está instalado.
- Comandos: dentro de `web/`: `npx vitest run test/<arquivo>`, `npx tsc --noEmit -p .`; na raiz: `npm run build -w web`
  (o CI usa `tsc -b && vite build`, mais estrito que `--noEmit`), `npm run e2e`.
- Tudo em português (comentários, textos, commits `feat(web): …`), commits terminando com uma linha em branco e
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `web/.env.development.local` aponta o site local pro servidor de teste: **nunca** commitar (está no `.git/info/exclude`).
- O que já existe em `web/src/games/kittens/`: `KittensLobby.tsx` (lobby pronto, com `seedOf` e `PixelButton`),
  `Background.tsx` (canvas do cerrado), `PixelCritter.tsx` (bichinho do site em pixel art), `sprites.ts` (porta
  ANTIGA do `sprites.js`), `cerrado.ts` (porta ANTIGA, só noite), `kittens.css` (classes `kt-`, só lobby),
  `KittensTable.tsx` (PROVISÓRIO: "A MESA ESTÁ CHEGANDO"), `capa.webp`. Bots: `web/src/dev/kittensBots.ts` (decisão +
  bot por WebSocket, já com os combos novos) e `web/src/dev/BotControls.tsx`.
- Visão do jogo: `KittensView` (`shared/src/games/kittens/types.ts`); sala: `KittensRoomView` = `RoomView<KittensView>`
  com `code`, `hostId`, `you`, `seats: { id, name, color, connected }[]`. Conexão: `GameConn.sendAction(action)` e
  `conn.onError((code, message) => …)`; hora do servidor: `serverOffset` (em `Game.tsx`, `snap.serverOffset`, já passado
  pro Retratim: `<PicturesTable … serverOffset={snap.serverOffset} />`). Textos de erro: `errorMessage(code)` do shared.

## Diferenças intencionais em relação ao protótipo

1. Sem a tela de menu do protótipo (quantos bots / JOGAR), sem "DERRUBAR UM BOT", sem "BOTS: NORMAIS/RÁPIDOS",
   sem regras locais nem bots locais. O lobby é o do site.
2. `ME` = `view.you`; nomes, cores e quem caiu vêm de `seats` (o protótipo usava `players`/`active`/nomes fixos).
   O chip "caiu…" usa `seat.connected === false`.
3. Prazos (barrinha do Nem vem!, relógio das escolhas) contam pela hora do servidor: `Date.now() + serverOffset`.
4. Fim de jogo: só o host vê "JOGAR DE NOVO" (`{type:'again'}`) e "VOLTAR PRO LOBBY" (`{type:'lobby'}`); os outros
   veem "esperando o host…".
5. Erro do servidor (ação recusada) vira o toast da mesa (o protótipo já tem `toast()`) + som de erro.
6. Som: liga/desliga pela preferência do site (`loadSoundPref`/`saveSoundPref` de `web/src/net/identity`), no
   mesmo lugar onde o protótipo tem "SOM: SIM".
7. "AS CARTAS" (galeria) continua acessível por um botão na barra de cima da mesa.

---

### Task 1: Artes e módulos de apoio (cerrado com ciclo do dia, sprites, efeitos, sons)

**Files:**
- Create: `web/src/games/kittens/art/` com as artes do protótipo (`prototipo/tatubum/art/*.png`, `verso.webp`; copiar
  os arquivos, não referenciar a pasta do protótipo).
- Replace: `web/src/games/kittens/cerrado.ts` ← porta TS do `prototipo/tatubum/cerrado.js` ATUAL (ciclo
  amanhecer → dia → entardecer → noite, `setPhase`, `scene(cw, ch, seed, base)`, `shade`).
- Update: `web/src/games/kittens/sprites.ts` ← sincronizar com o `prototipo/tatubum/sprites.js` ATUAL (dicas das
  cartas, `shade`, o que mais mudou); manter o `snapToPalette` exportado e os testes que existirem.
- Create: `web/src/games/kittens/fx.ts` ← porta TS do `fx.js` (manter: animação instantânea com `document.hidden`
  ou `prefers-reduced-motion`, e tempo-limite em toda animação).
- Create: `web/src/games/kittens/sounds.ts` ← porta TS do `sounds.js`, tocando só se `loadSoundPref()`.
- Update: `web/src/games/kittens/Background.tsx` pra usar a API nova do cerrado (`start(canvas, seed, width, {…})`).

- [ ] **Step 1:** Ler os 4 arquivos do protótipo e as portas antigas; portar mantendo nomes e comportamento (tipar
  com TS estrito; nada de `any` solto). As artes entram por `import url from './art/x.png'` (Vite) num mapa
  `ART: Partial<Record<KittensCardKind, string>>` + `VERSO`, `SOLDADO`.
- [ ] **Step 2:** Testes (jsdom, mock de canvas como os testes existentes de sprites/kittens fazem): `cerrado.scene`
  devolve uma URL e é determinístico pela semente; todo `KITTENS_CARD_KINDS` tem arte em `ART`; `sounds` não toca
  com o som desligado.
- [ ] **Step 3:** `npx tsc --noEmit -p .` e `npx vitest run` em `web/` verdes; commit `feat(web): artes e motores do Tatubum (cerrado com ciclo do dia, efeitos, sons)`.

### Task 2: `mesa.ts` — o motor da mesa do protótipo, online

**Files:**
- Create: `web/src/games/kittens/mesa.ts`
- Update: `web/src/games/kittens/kittens.css` (o CSS da mesa do protótipo, escopado em `.kittens .kt-mesa`, sem
  vazar pro resto do site; manter as classes do protótipo dentro desse escopo ou com prefixo `kt-`).

Interface:

```ts
import type { GameAction, KittensView, SeatView } from '@cartolina/shared';

export interface MesaOptions {
  /** Manda a ação pro servidor. */
  send(action: GameAction): void;
  /** Hora do servidor (Date.now() + serverOffset). */
  now(): number;
  /** Semente do cerrado (a mesma do lobby: seedOf(code)). */
  seed: number;
}

export interface MesaState {
  view: KittensView;
  you: string | null;
  hostId: string | null;
  seats: SeatView[];
}

export interface Mesa {
  /** Visão nova da sala: redesenha e enfileira os efeitos das entradas novas do diário. */
  update(state: MesaState): void;
  /** Ação recusada pelo servidor: toast + som de erro. */
  error(message: string): void;
  /** Para animações, timers, listeners de janela e o canvas. */
  destroy(): void;
}

export function createMesa(root: HTMLElement, opts: MesaOptions): Mesa;
```

- [ ] **Step 1:** Portar o `<script>` inline e o HTML do palco do `prototipo/tatubum/index.html` pra `createMesa`:
  o HTML do palco vira um template inserido em `root`; o estado global vira estado dentro do fechamento; `$()`
  procura dentro de `root`; listeners de `window`/`document` registrados e removidos no `destroy`.
- [ ] **Step 2:** Trocar a fonte das regras: `dispatch(ME, action)`/`send(play)` → `opts.send(action)`; `state`,
  `rng`, `ctx()`, regras locais, menu, bots locais, "derrubar bot" e velocidade saem; `onState` passa a rodar em
  `update()`. `players` = ordem de `view.players`; nomes/cores por `seats`; `PLAYER_COLORS`/`critterSvg` não são mais
  necessários pra nomes (o `PixelCritter`/`Sprites.critter` continua desenhando o bichinho na cor do assento).
- [ ] **Step 3:** Diferenças 2–7 da lista acima (hora do servidor, host, toast, som, galeria).
- [ ] **Step 4:** Tudo o que o protótipo tem hoje continua: palco de largura variável, cerrado com ciclo do dia,
  cartas com a cor e a cena de cada uma e arte do Flow (caixa 84×74), arrastar (reordenar, soltar na mesa, num
  assento, Nem vem!), clique/duplo clique, zoom com a explicação completa, ordem da vez (PRÓXIMO, 3º…, setinhas,
  "VOCÊ É O PRÓXIMO"), leque + número grande nos assentos, bichinhos em pixel art, Desarme com o tatu soldado,
  combos novos (Mico com alvo, Preguiça com lista de bichos, painel do Quati), diário, legenda, todos os efeitos.
- [ ] **Step 5:** `npx tsc --noEmit -p .` em `web/` limpo; commit `feat(web): mesa do Tatubum (porta do protótipo)`.

### Task 3: `KittensTable.tsx` liga a mesa na sala

**Files:**
- Replace: `web/src/games/kittens/KittensTable.tsx`
- Modify: `web/src/screens/Game.tsx` (passar `serverOffset={snap.serverOffset}` pra `KittensTable`, como no Retratim)
- Test: `web/test/kittens-table.test.tsx`

- [ ] **Step 1:** `KittensTable({ view, conn, serverOffset })`: um `<div className="kittens">` com um `ref`; `useEffect` de
  montagem cria a mesa (`createMesa(div, { send: (a) => conn.sendAction(a), now: () => Date.now() + offsetRef.current, seed: seedOf(view.code) })`)
  e a destrói na saída; outro `useEffect` chama `mesa.update({ view: view.game, you: view.you, hostId: view.hostId, seats: view.seats })`
  a cada visão nova; `conn.onError((_code, message) => mesa.error(message))` com limpeza. Lembrete do CLAUDE.md: não pôr
  objetos instáveis no array de dependências de `useEffect` (usar refs).
- [ ] **Step 2:** Teste (jsdom; mock de canvas/Image/AudioContext como os outros testes do Tatubum; montar uma sala real
  com `createRoom`/`joinRoom`/`roomAction`/`roomView` do shared, como `web/test/kittens-bots.test.ts`): a mesa monta com
  as cartas da minha mão (8 `.card` na mão); clicar em COMPRAR na minha vez manda `{type:'draw'}`; desmontar não deixa
  erro nem timer pendente.
- [ ] **Step 3:** testes do web e tsc verdes; commit `feat(web): mesa do Tatubum ligada na sala`.

### Task 4: bots no site publicado (só no Tatubum)

**Files:**
- Modify: `web/src/games/kittens/KittensLobby.tsx` (o `BotControls` deixa de depender de `import.meta.env.DEV`)
- Modify: `web/src/dev/BotControls.tsx` / `web/src/dev/kittensBots.ts` só se algo depender de dev (URL do servidor,
  `import.meta.env.DEV`); os outros jogos continuam com bots só em dev.
- Test: o teste do lobby (ou um novo `web/test/kittens-lobby.test.tsx`): o botão de pôr bot aparece pro host.

- [ ] **Step 1:** Carregar o `BotControls` sempre no lobby do Tatubum (lazy). Conferir que os bots usam o mesmo
  servidor do site (`wsUrl`/`getRoomInfo`), sem nada fixo de localhost. Atualizar os comentários "SÓ PARA
  DESENVOLVIMENTO" do `kittensBots.ts` pra dizer que no Tatubum eles também existem em produção.
- [ ] **Step 2:** `npm run build -w web` (na raiz) passa e o bundle de produção contém o código dos bots do Tatubum.
- [ ] **Step 3:** commit `feat(web): bots no Tatubum também no site publicado`.

### Task 5: E2E do Tatubum

**Files:**
- Create: `e2e/tatubum.spec.ts` (molde: `e2e/retratim.spec.ts` / `e2e/rodada.spec.ts` / `e2e/helpers.ts`).

- [ ] **Step 1:** 2 páginas: a 1ª cria a sala do Tatubum pela estante, a 2ª entra pelo link; o host começa; as duas
  veem a mesa com 8 cartas na mão; quem está na vez compra e a vez passa pra outra pessoa (o selo "SUA VEZ" troca).
- [ ] **Step 2:** `npm run e2e` verde (todos os E2E, não só o novo); commit `test(e2e): partida do Tatubum`.

### Task 6: conferência e fechamento (controlador)

- Conferir no navegador com o servidor e o site locais (portas próprias): 2 abas (eu e "amigo") + 1–2 bots, partida
  até o fim, cada efeito aparecendo, console sem erro; print pro Rafa.
- `npm test`, `npm run typecheck`, `npm run build -w web`, `npm run e2e`.
- `CLAUDE.md`: Tatubum (`kittens`) jogável no computador, com bots. Memória do projeto.
- PR para a `main` e merge (pedido do Rafa), sem ser durante noite de jogo.
