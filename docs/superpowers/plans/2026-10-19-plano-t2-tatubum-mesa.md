# Plano T2 — Tatubum: mesa no site Implementation Plan (RASCUNHO)

> **Rascunho de 2026-10-19, escrito enquanto o Rafa estava fora.** Antes de executar: o Rafa joga o protótipo
> (`prototipo/tatubum/`) e o que ele pedir entra aqui (seção "Ajustes do Rafa", vazia por enquanto). Onde este
> plano e o protótipo divergirem em comportamento ou visual, **vale o protótipo**, exceto nas diferenças listadas.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O Tatubum fica jogável no site (2 a 8 pessoas, cada uma no seu PC): lobby, mesa em pixel art com o
cerrado à noite, jogadas, Nem vem! com a barrinha de 5 s na hora do servidor, escolhas, animações dirigidas pelo
diário, sons, fim de jogo, bots de desenvolvimento e um E2E — portando o protótipo pra React.

**Architecture:** Tudo do jogo em `web/src/games/kittens/`, no padrão do Retratim (`web/src/games/pictures/`) e
do Diquisti: palco fixo 1440×900 escalado (`useStageFit` do Diquisti), CSS escopado em `.kittens` com prefixo
`kt-`, toast próprio no palco, sons próprios respeitando a preferência de som do site (`loadSoundPref`). O que é
imperativo no protótipo continua imperativo (fundo em canvas, efeitos/partículas, sprites gerados em canvas),
portado pra módulos TS; o React desenha a visão (`KittensView`) e um hook roda a **fila de efeitos dirigida pelo
diário** (`log`), igual ao protótipo. O jogo inteiro é carregado sob demanda (lazy), como o Retratim.

**Tech Stack:** React 19, TypeScript 5.9, Vite, Vitest 4 + Testing Library (jsdom), Playwright, Web Audio, Canvas 2D.

**Spec:** `docs/superpowers/specs/2026-10-19-tatubum-design.md` (§2 regras, §4.3 segredos, §4.5 web, §5 telas,
§5.4 identidade, §5.5 animações). **Referências:** protótipo `prototipo/tatubum/` (servir com
`npx http-server . -p 5178` na raiz da worktree e abrir `/prototipo/tatubum/`); fundo aprovado
`prototipo/tatubum/ref/fundo-cerrado.html`; regras em `shared/src/games/kittens/` (Plano T1, feito).

---

## Contexto para quem vai executar

- Worktree `.claude/worktrees/tatubum`, branch `feat/tatubum`. Sem push, sem merge (merge no `main` = publicar).
  PowerShell com `npm.cmd` (o `rtk` não existe no Git Bash).
- Comandos: `npm test -w web -- <filtro>`, `npm run typecheck`, `npm run build -w web`, `npm run e2e`.
- Tudo em português. Commits `feat(web): …`, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Modelo de código:** o Retratim no `web/` (`PicturesLobby.tsx`, `PicturesTable.tsx`, `TopBar.tsx`,
  `useCountdown.ts`, `sounds.ts`, `useButtonSounds.ts`, `web/src/dev/picturesBots.ts`, `web/test/pictures-*.test.ts(x)`)
  e o `useStageFit`/`useToast`/`SoundPill` do Diquisti.
- **Modelo de comportamento e visual:** `prototipo/tatubum/index.html` (CSS no topo, depois: palco, regras/dispatch,
  fila de efeitos, `onState`, render por região, jogada do humano, painéis, diário, `animate`, menu, zoom, galeria,
  bots), `sprites.js`, `cerrado.js`, `fx.js`, `sounds.js`, `bots.js`.
- A hora do servidor: `snap.serverOffset` (`useConnSnapshot`), como no Retratim. A barrinha usa
  `pending.resolvesAt − (Date.now() + serverOffset)`; o painel de escolha usa `choice.deadline` do mesmo jeito.
- Fontes: acrescentar `Press+Start+2P` e `VT323` ao link do Google Fonts em `web/index.html`.

### Diferenças em relação ao protótipo (intencionais)

1. **Sem menu nem painel de dev:** o lobby é o da sala (código, link, quem está, host começa) no visual pixel
   art com o cerrado; "derrubar bot" e "bots rápidos" não existem. Bots só em dev, pelo `BotControls` do lobby.
2. **Host** decide "jogar de novo" e "voltar pro lobby"; os outros veem "esperando o host…".
3. **Assentos** usam os nomes e as cores (`PLAYER_COLORS`) da sala; o tatu do assento é pintado na cor do
   jogador. Desconectado (dentro dos 30 s) mostra "caiu…"; saiu de vez vira fantasminha (como no protótipo).
4. **A galeria "AS CARTAS"** vira um botão "cartas" no topo da mesa e no lobby.
5. **Som:** liga/desliga pela preferência do site (`SoundPill`), não por um botão próprio.

## Ajustes do Rafa (depois de jogar o protótipo)

_(vazio — preencher antes de executar)_

## Mapa de arquivos

Criar em `web/src/games/kittens/`:
- `kittens.css` — CSS do protótipo escopado em `.kittens`, classes com prefixo `kt-`.
- `sprites.ts` — mapas de pixel e `cardSprite(kind)`, `seatTatu(color)`, `CARD_STYLE` (porta de `sprites.js`).
- `cerrado.ts` — `startCerrado(canvas, seed): () => void` (porta de `cerrado.js`; devolve o "parar").
- `fx.ts` — `createFx(stage, layer, particles, getScale)` com `fly/stamp/pop/cross/icon/shake/flash/sparks/hearts/glitter/boom/fireworks/slash/box` (porta de `fx.js`, incluindo o tempo-limite das animações e o caso de aba escondida).
- `sounds.ts` — sons 8-bit (porta de `sounds.js`), tocando só com `loadSoundPref()`.
- `text.ts` — **puro**: `eventText(ev, nameOf, me, prevPending)`, `PLAY_LABEL`, `cardName(kind)`.
- `plays.ts` — **puro**: `selectedPlayKind(cardIds)`, `needsTarget(kind)`, `validTargets(view, me)`.
- `effects.ts` — **puro**: `freshEntries(prevLog, log)`, `arrivals(prevHand, hand)`, `seatPos(i, n)`.
- `useEffectsQueue.ts` — a fila de efeitos (porta de `enqueue/runQueue/animate/dealAnim`), com `arriving`/`airHidden`.
- `CardFace.tsx` (carta e verso), `KittensLobby.tsx`, `KittensTable.tsx`, `TopBar.tsx`, `Seats.tsx`,
  `TableCenter.tsx` (monte + futuro + carta no ar + barrinha + descarte), `Hand.tsx`, `Actions.tsx`,
  `ChoicePanel.tsx` (Cafuné, Favor, 5 diferentes), `AskPanel.tsx`, `LogPanel.tsx`, `Caption.tsx`,
  `CardsGallery.tsx`, `CardZoom.tsx`, `GameOver.tsx`, `Background.tsx` (canvas do cerrado).
- `web/src/dev/kittensBots.ts` — bots por WebSocket (molde `picturesBots.ts`), decisão em `decideKittens(view, mem, rng)` (porta de `bots.js`).
- Testes: `web/test/kittens-fixtures.ts`, `kittens-sprites.test.ts`, `kittens-text.test.ts`, `kittens-plays.test.ts`,
  `kittens-effects.test.ts`, `kittens-bots.test.ts`, `kittens-lobby.test.tsx`, `kittens-table.test.tsx`; `e2e/tatubum.spec.ts`.

Modificar: `web/index.html` (fontes), `web/src/screens/Game.tsx` (lazy lobby/mesa por `isKittensRoomView`),
`web/src/games/catalog.ts` (`playable: true`), `web/test/catalog.test.ts`, `web/test/shelf.test.tsx`
("em breve" some), `web/src/dev/BotControls.tsx` (`kittens`), `e2e/helpers.ts` se precisar.

---

### Task 1: peças puras (texto, jogadas, efeitos) com TDD

**Files:** Create `text.ts`, `plays.ts`, `effects.ts`; Test `kittens-text.test.ts`, `kittens-plays.test.ts`, `kittens-effects.test.ts`.

Comportamento (copiar do protótipo, `rawText`/`textOf`, `selectedPlay`, `validTarget`, `seatPos`):

- `eventText`: um teste por tipo de evento do `KittensEvent`, com o "Você" maiúsculo só no começo
  ("Caio teve que dar ATAQUE pra você"), "Seu PAR valeu!" quando é de quem vê, carta escondida
  (`card: null`) → "uma carta".
- `selectedPlayKind`: 1 carta de ação → o tipo; Nem vem!/Cafuné/bicho sozinho → `null`; 2 iguais → `par`;
  3 iguais → `trio`; 5 tipos diferentes → `cinco`; o resto → `null` (mesmos casos do `kittens-play.test.ts` do shared).
- `validTargets`: vivos, não eu, com carta na mão.
- `freshEntries`: entradas com `n` maior que o último visto (inclusive quando o diário é cortado em 30).
- `arrivals`: ids novos na mão.

- [ ] Testes que falham → implementação → `npm test -w web -- kittens` verde → `npm run typecheck` → commit.

### Task 2: sprites, cerrado, efeitos e sons (portas imperativas)

**Files:** Create `sprites.ts`, `cerrado.ts`, `fx.ts`, `sounds.ts`; Test `kittens-sprites.test.ts`.

- `sprites.ts`: os mapas viram constantes tipadas `Record<KittensCardKind, SpriteMap>`; testes: todo tipo de
  `KITTENS_CARD_KINDS` tem sprite; toda letra usada está na paleta (ou é `k`/`.`); `cardSprite` devolve a mesma URL
  na segunda chamada (cache). O desenho em canvas roda no navegador; no jsdom, mockar `HTMLCanvasElement.prototype.getContext`/`toDataURL` como os testes do Retratim fazem.
- `cerrado.ts`, `fx.ts`, `sounds.ts`: porta quase 1:1, tipada; sem testes de unidade (verificados no navegador
  na Task 7). `fx.ts` mantém: animação instantânea com `document.hidden` ou `prefers-reduced-motion` e tempo-limite
  em toda animação.

- [ ] Porta → testes verdes → typecheck → commit.

### Task 3: entrar no site (lobby, fontes, catálogo, Game.tsx)

**Files:** `web/index.html`, `KittensLobby.tsx`, `Background.tsx`, `CardFace.tsx`, `CardsGallery.tsx`,
`kittens.css` (parte do lobby), `web/src/screens/Game.tsx`, `catalog.ts` + testes.

- Lobby no visual pixel art: fundo do cerrado, logo TATUBUM, quem está na mesa (tatu na cor de cada um), copiar
  link, `SoundPill`, botão "cartas" (galeria), "começar" só do host (com aviso se < 2), `BotControls` em dev.
- `Game.tsx`: `isKittensRoomView` → lobby ou mesa (lazy, como o Retratim).
- Catálogo: `playable: true`; `shelf.test.tsx` volta a não ter "em breve".
- Testes (`kittens-lobby.test.tsx`, com `kittens-fixtures.ts` montando uma sala real do shared):
  host vê "começar" e manda `{type:'start'}`; não-host vê "esperando o host…"; com 1 pessoa o aviso aparece.

### Task 4: a mesa (desenho da visão, sem efeitos)

**Files:** `KittensTable.tsx`, `TopBar.tsx`, `Seats.tsx`, `TableCenter.tsx`, `Hand.tsx`, `Actions.tsx`,
`LogPanel.tsx`, `Caption.tsx`, `CardZoom.tsx`, `GameOver.tsx`, `kittens.css`.

- Layout e estilos do protótipo (palco 1440×900). Assentos em arco (`seatPos`), mão em leque, monte com contagem
  de cartas e tatus, futuro espiado ao lado do monte (só pra quem espiou), carta no ar com os Nem vem!
  empilhados, barrinha de 5 blocos na hora do servidor (com "tic" nos últimos 3 s), descarte, diário, legenda.
- Jogada do humano: clicar seleciona; botão "JOGAR X" pelo `selectedPlayKind`; Favor/par/trio entram no modo
  "escolha um adversário" (assentos válidos piscando); trio abre o `AskPanel`; duplo clique joga carta sozinha;
  "COMPRAR" e clique no monte; "NEM VEM! (n)" sempre que há carta no ar e eu tenho Nem vem!; teclas N, espaço,
  Enter, Esc; rodinha amplia a carta (`CardZoom`).
- `GameOver`: "<nome> sobreviveu!"; host: "jogar de novo" (`again`) e "voltar pro lobby" (`lobby`).
- Erros do servidor viram toast (como o Retratim) + som de erro.
- Testes (`kittens-table.test.tsx`, fixtures com a sala real):
  - minha mão aparece; dos outros só a contagem;
  - selecionar 1 Ataque mostra "JOGAR ATAQUE" e clicar manda `{type:'play', cards:[id]}`;
  - par → clicar no assento manda `target`; trio → `AskPanel` manda `ask`;
  - com carta no ar e Nem vem! na mão, o botão aparece e manda `{type:'nope'}`; sem Nem vem!, não aparece;
  - "COMPRAR" manda `draw` só na minha vez;
  - fim de jogo: host vê os dois botões; não-host vê "esperando o host…".

### Task 5: escolhas (Cafuné, Favor, 5 diferentes)

**Files:** `ChoicePanel.tsx` (+ CSS).

- Cafuné: "UFA! ONDE ESCONDER O TATU?", slider 0…`drawCount` com o rótulo (topo / Nª / fundo), botões "ESCONDER
  AQUI", "NO TOPO", "NO FUNDO", "ALEATÓRIO"; relógio do prazo (hora do servidor).
- Favor (eu dou): mão em modo "dar" (borda vermelha no hover), clicar manda `choose {card}`.
- 5 diferentes: cartas de `choice.options` que ainda estão no descarte; clicar manda `choose {card}`.
- Outros escolhendo: chip "escolhendo…" no assento + relógio na legenda.
- Testes: cada painel manda a ação certa; o rótulo do slider; o relógio conta pela hora do servidor.

### Task 6: efeitos dirigidos pelo diário

**Files:** `useEffectsQueue.ts`, ligações em `KittensTable.tsx`.

- Porta de `onState`/`animate`/`dealAnim` do protótipo: cada entrada nova do diário entra na fila, em ordem;
  cartas novas na minha mão ficam escondidas até o voo pousar; a carta no ar fica escondida até o voo da jogada
  pousar; ao esvaziar a fila, nada fica escondido. Efeitos: distribuição, jogar (voo com rastro), Nem vem!
  (carimbo + flash), cancelado (X), Ataque (corte + "N TURNOS!" no próximo), Pular, Embaralhar (monte pula +
  brilho), Espiar (olho no monte pros outros), comprar (voo + virar), Cafuné (tatu treme, faíscas, corações,
  "UFA!"), BUM (faíscas → explosão, tremor, flash, "BUM!"), Favor/par/trio/5 (voo entre mãos, de verso pra quem
  não vê), vitória (fogos + quadro final), som da sua vez.
- Teste: com a fila mockada, uma sequência de visões gera os efeitos na ordem certa e libera `arriving` no fim.

### Task 7: bots de desenvolvimento e conferência no navegador

**Files:** `web/src/dev/kittensBots.ts`, `web/src/dev/BotControls.tsx`; Test `kittens-bots.test.ts`.

- `decideKittens` (porta de `bots.js`, com a chance de Nem vem! dividida pela mesa) + classe de bot por
  WebSocket (molde `picturesBots.ts`, com nova tentativa se a ação se perder). Bots nunca fazem ação de host.
- Testes da decisão: escolhe na sua escolha; dá Nem vem! com mais chance contra si; compra quando não joga; não
  age fora da vez.
- Conferência no navegador (servidor e site em portas próprias, ver `CLAUDE.md`): partida com 1, 3 e 7 bots até o
  fim, sem erro no console, cada efeito aparecendo; print pro Rafa.

### Task 8: E2E e fechamento

**Files:** `e2e/tatubum.spec.ts`.

- 3 jogadores (2 páginas + 1 cliente WebSocket direto, como `dixit-historico.spec.ts`, porque o build de produção
  não tem bots): começam; cada um compra até alguém jogar uma carta de ação que vai pro ar; o terceiro dá Nem vem!
  quando tiver; confere a barrinha, o descarte e a vez andando. (O E2E não espera o fim da partida.)
- `npm test`, `npm run typecheck`, `npm run build -w web`, `npm run e2e`.
- Atualizar `CLAUDE.md` (tabela de jogos: Tatubum `kittens`, jogável no computador) e a memória do projeto.
