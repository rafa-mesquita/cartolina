# Cúpi — regras e explicação das cartas na mesa Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dentro da mesa do Cúpi, um botão "regras" abre a colinha completa (ações, personagens, como funciona), e cada carta/ação/reação ganha uma dica rápida (hover no computador, segurar no celular).

**Architecture:** Textos gerados das tabelas do `shared` num módulo puro (`rules.ts`); componente `RulesSheet` (painel no computador, folha no celular) aberto pelo `TopBar`; hook `useTip` + componente `Tip` pra dica (hover/foco/segurar, `aria-describedby`). Tudo em `web/src/games/coup/`, CSS dentro de `.coup`.

**Tech Stack:** React 19, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-20-cupi-regras-na-mesa-design.md`.

---

## Contexto para quem vai executar

- Worktree `C:\Users\rafam\Desktop\Rpositórios Github - claude\Pessoal\Jogos de tabuleiro\.claude\worktrees\cupi-regras`, branch `feat/cupi-regras` (saída do `main` com o Cúpi no ar). Sem push, sem merge, nunca `git stash`. No Git Bash o `rtk` não existe. Rode `npm install` na worktree se não houver `node_modules`.
- Código e textos em português; commits terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Modelos no próprio Cúpi: `web/src/games/coup/texts.ts` (frases), `names.ts` (`CHARACTER_NAMES`), `art.ts` (`characterArtUrl`), `CardFace.tsx`, `TopBar.tsx`, `MyArea.tsx` (7 ações), `Stage.tsx` (botões de reação), `Diary.tsx` (folha do diário no celular: fundo, "fechar", Esc, foco), `CoupTable.tsx` (layout `coup--phone`, estado da UI), `coup.css` (identidade: `--cream`, `--felt`, `--paper`, `--ink`, `--ink-soft`, `--red`, `--red-text`; Bebas Neue/Oswald). Testes: `web/test/coup-table.test.tsx`, `coup-phone.test.tsx`, fixtures `coup-fixtures.ts`.
- Regra do repo: nenhum `useEffect` com dependência que muda a cada render.
- Comandos: `npm test -w web -- coup`, `npm test -w web`, `npm run typecheck`, `npm run build -w web`.

### Task 1: textos das regras (`rules.ts`)

**Files:** Create `web/src/games/coup/rules.ts`, `web/test/coup-rules-text.test.ts`.

- [ ] Testes primeiro (`coup-rules-text.test.ts`):
  - `ACTION_ROWS` tem as 7 ações na ordem de `COUP_ACTION_KINDS`; pra cada uma, `claim` é `CHARACTER_NAMES[COUP_CLAIM[k]]` ou "—"; `blockedBy` lista `COUP_BLOCKERS[k]` em português ("ninguém" quando vazio); o efeito contém o custo (`COUP_COST`) e o ganho (`COUP_GAIN`) certos (ex.: golpe "−7, alvo perde carta"; taxar "+3"; extorquir "tira 2 do alvo").
  - `CHARACTER_INFO` tem os 5; a Condessa tem "na sua vez: nenhuma ação" e "bloqueia: o assassinato"; o Capitão bloqueia "a extorsão"; o Embaixador faz "trocar" e bloqueia "a extorsão"; o Duque faz "taxar, pega 3" e bloqueia "a ajuda externa"; o Assassino faz "assassinar (paga 3)" e bloqueia "nada".
  - `HOW_IT_WORKS.goal` existe; `HOW_IT_WORKS.items` tem de 5 a 7 frases e cita "10 segundos" e "10 moedas" a partir das constantes (`COUP_WINDOW_MS / 1000`, `COUP_MUST_COUP_AT`).
  - `actionTip('tax')` contém "Duque" e "3"; `characterTip('duke')` contém "taxar" e "ajuda externa"; `reactionTip('challenge')`, `reactionTip('pass')` e `reactionTip('block', 'contessa')` existem e são frases curtas.
- [ ] Implementar `rules.ts` com essas exportações (texto gerado das tabelas; frases em bom português, no tom do resto do site).
- [ ] `npm test -w web -- coup-rules-text && npm run typecheck` → PASS. Commit `feat(web): Cúpi — textos das regras gerados das tabelas`.

### Task 2: botão "regras" e a colinha (`RulesSheet`)

**Files:** Create `web/src/games/coup/RulesSheet.tsx`; Modify `TopBar.tsx`, `CoupTable.tsx`, `coup.css`; Test `web/test/coup-rules-sheet.test.tsx`.

- [ ] Testes primeiro: o botão "regras" no topo abre um `role="dialog"` com nome "regras" e conteúdo (cabeçalhos "ações", "personagens", "como funciona"; a tabela tem 7 linhas de ação; os 5 personagens com `img` da arte); "fechar" e Esc fecham e o foco volta pro botão; ao abrir, o foco vai pro "fechar"; no celular (mock de `matchMedia('(max-width: 640px)')`) é folha com fundo, e tocar no fundo fecha; **com a colinha aberta, um `rerender` com visão em que você pode reagir (`can.pass`) — ou perder carta/trocar — fecha a colinha**.
- [ ] Implementar: estado `rulesOpen` no `CoupTable` (zera quando a situação pede você: `can.pass || can.lose || can.keep > 0` — derive isso na renderização, sem `useEffect` com dependência instável; ex.: guarde a chave da situação em que abriu e considere fechado se mudou pra uma situação que pede você). `TopBar` ganha o botão "regras" ao lado do som (no celular também). `RulesSheet` mostra objetivo, tabela de ações, os 5 personagens (arte pequena via `characterArtUrl`, nome em Bebas, "na sua vez" e "bloqueia") e "como funciona". Computador: painel absoluto à direita sobre a coluna do diário (~380 px de largura, altura da área da mesa, rolagem própria). Celular: folha de baixo como a do diário.
- [ ] `npm test -w web -- coup && npm run typecheck` → PASS. Commit `feat(web): Cúpi — botão de regras com a colinha`.

### Task 3: dica rápida (`useTip` + `Tip`)

**Files:** Create `web/src/games/coup/Tip.tsx`; Modify `MyArea.tsx`, `Stage.tsx`, `CardFace.tsx` (se a dica das cartas morar nela), `coup.css`; Test `web/test/coup-tip.test.tsx`.

- [ ] Testes primeiro: passar o mouse num botão de ação mostra a dica com o texto de `actionTip`; o botão tem `aria-describedby` apontando pro texto (que existe no DOM mesmo escondido); foco pelo teclado também mostra; sair esconde. Com `pointerType: 'touch'`: segurar 450 ms (fake timers) mostra a dica e o `click` que vem depois **não** manda a ação; um toque curto manda a ação normalmente; a dica some sozinha depois de 3 s. Funciona nas suas cartas (`characterTip`), nas 7 ações e nos botões da janela (`reactionTip`).
- [ ] Implementar `useTip(text)` → `{ props pro elemento (onPointerEnter/Leave/Down/Up/Cancel, onFocus/onBlur, onClickCapture que cancela o clique depois de segurar, aria-describedby), tip: ReactNode }` e o balão `Tip` (escuro, texto creme, seta, acima do elemento, `pointer-events: none`, preso dentro da tela). Timers limpos ao desmontar.
- [ ] Ligar nas suas cartas, nos 7 botões de ação e nos botões da janela.
- [ ] `npm test -w web && npm run typecheck && npm run build -w web` → PASS. Commit `feat(web): Cúpi — dica rápida nas cartas e ações`.

### Task 4: conferência

- [ ] No navegador (servidor `npx wrangler dev --port 8799 --inspector-port 9239` em `server/`, site `npx vite --port 5197 --strictPort` em `web/` com `VITE_SERVER_URL=http://127.0.0.1:8799`; 2 jogadores por script ou bots), em 1280×800 e 390×844 com toque: abrir/fechar a colinha, a colinha fechando quando abre uma janela pra você, a dica no hover e no segurar sem disparar a ação. Prints em `scratchpad/regras/`. Encerre tudo.
- [ ] `npm test`, `npm run typecheck`, `npm run build`, `npm run e2e` → PASS.
