# cartolina~ — guia pra começar um chat

Site de jogos de tabuleiro pra jogar com os amigos na call (Discord). Projeto pessoal do Rafa.
No ar: site https://rafa-mesquita.github.io/cartolina/ · servidor https://cartolina-server.mrlimao36.workers.dev

**Fale sempre em português (PT-BR)**: mensagens, lista de tarefas, commits, PRs e docs.

| Nome na tela | id no código | estado |
|---|---|---|
| **DITU** (nosso ITO) | `ito` | jogável no computador e no celular |
| **Diquisti** (nosso Dixit) | `dixit` | jogável no computador; celular ainda não |
| **Retratim** (nosso Pictures) | `pictures` | jogável no computador; histórico/museu ainda não |
| **Tatubum** (nosso Exploding Kittens) | `kittens` | jogável no computador, com bots também no site publicado; histórico e celular ainda não |
| **Cúpi** (nosso Coup) | `coup` | jogável no computador e no celular; artes ainda são ícones (vêm no C3) |

O id interno nunca muda: rotas, banco, registro e testes usam `ito`/`dixit`/`pictures`/`kittens`/`coup`. Só o que o jogador vê usa o nome novo.

## Regras de trabalho (importante)

- **Trabalhe numa worktree** em `.claude/worktrees/<nome>`, numa branch saída do `origin/main`. A pasta mãe pode estar sendo usada por outra sessão; não troque a branch dela nem mexa nos arquivos dela.
- **Nunca use `git stash` puro** (o stash é compartilhado entre worktrees e sessões). Prefira um commit temporário.
- **Merge no `main` = publicar.** Cada push no `main` roda testes + E2E e, se passar, publica servidor e site (`.github/workflows/deploy.yml`). As salas abertas caem por alguns segundos.
  - **Só faça merge quando o Rafa pedir**, e nunca durante uma noite de jogo ("estamos jogando agora" = não mexer).
  - Push num PR não publica nada.
- **Migrações do D1 rodam sozinhas em produção** no deploy. Toda migração nova só pode **criar** (tabela/índice); nunca apague nem altere o histórico da galera. Ver `server/test/migration-*.test.ts`.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; PRs terminam com `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Não commite `web/.env.development.local` (aponta o site local pra uma porta de servidor de teste).
- Antes de PR: `npm test`, `npm run typecheck` e `npm run build -w web` (o build roda `tsc --noEmit && vite build`). O CI também roda o E2E.
- Mudanças grandes seguem o fluxo superpowers: brainstorming → spec em `docs/superpowers/specs/` → plano em `docs/superpowers/plans/` → execução com subagentes e revisão. O Rafa gosta de **ver opções visuais aplicadas na tela real** antes de decidir.
- Sessões em paralelo: a versão de celular e outros jogos às vezes estão em outro chat. Se for mexer em arquivo compartilhado (`Game.tsx`, `global.css`, `catalog.ts`, `RoomScreen.tsx`, `App.tsx`, `device.ts`, `Home.tsx`, `web/src/table/*`), combine antes.

## Estrutura

```
shared/   regras dos jogos, sala, protocolo, histórico (TypeScript puro, Vitest)
server/   Cloudflare Worker + Durable Object (uma instância por sala) + D1 (histórico)
web/      site React 19 + Vite (GitHub Pages)
e2e/      Playwright (sobe servidor e site e joga com o Chromium)
scripts/  importação de imagens (dixit-cartas, pictures-fotos), smoke
docs/     specs, planos, prompts das cartas, deploy
prototipo/ protótipos HTML soltos (servidos por http-server)
```

Comandos: `npm install`, `npm test`, `npm run typecheck`, `npm run dev:server` (8787, aplica migrações locais), `npm run dev:web` (5173), `npm run e2e`, `npm run build`.

## Como um jogo é montado

1. **Regras puras em `shared/src/games/<id>/`**:
   - `types.ts`: estado, ações e view;
   - `rules.ts`: `applyAction`, `onPresenceChange` e, se o jogo tiver prazo, `nextDeadline`;
   - `schema.ts`: zod que valida a ação vinda do WebSocket;
   - `view.ts`: `viewFor` esconde o que cada jogador não pode ver.

   A interface é `GameModule` (`shared/src/game.ts`). Tudo é testado em `shared/test/`. Sorteio só pelo `ctx.rng`; hora só por `ctx.now`.
2. **Registro** em `shared/src/games/registry.ts` (`GAME_IDS`, `GAMES`):
   - mínimo e máximo de jogadores;
   - `liveCursors` (cursor ao vivo; desligado quando entregaria um voto);
   - `recordsHistory`.
3. **Servidor**: nada por jogo. `server/src/room-do.ts` é genérico. Ele recebe a ação, valida com o schema, aplica as regras e manda a view de cada um. Também cuida de reconexão (30 s de tolerância) e de alarme pros prazos.
4. **Site**:
   - `web/src/games/catalog.ts`: nome de vitrine, frase, "como jogar", `playable` e `mobile`;
   - a mesa do jogo em `web/src/games/<id>/`, escolhida por jogo em `web/src/screens/Game.tsx`;
   - cada jogo tem identidade visual própria. DITU: papel cartolina. Diquisti: "conto ilustrado", verde-floresta com mostarda e pintura a óleo de fundo. Retratim: "álbum de fotos". Tatubum: pixel art "cerrado" (fundo que amanhece e anoitece, mesa imperativa em `web/src/games/kittens/mesa.ts` portada do protótipo `prototipo/tatubum/`).
5. **Histórico** (opcional): cada jogo grava as rodadas reveladas numa tabela própria do D1 (migração nova em `server/migrations/`).
   - O registro sai de uma função pura no `shared`: `pendingHistoryRecord` em `shared/src/history.ts`, com `switch` exaustivo por jogo.
   - O Durable Object guarda o pendente no mesmo `put` do estado, e o `INSERT` usa `ON CONFLICT DO NOTHING`. Assim a rodada grava uma vez só.
   - Rodada com bot não grava.
   - A rota é `GET /history/<id>`, e a aba "histórico" fica em `#/<id>/historico`.
   - Modelo: `docs/superpowers/specs/2026-10-17-diquisti-historico-design.md`.
6. **Testes E2E** em `e2e/`. Bots só existem no `dev`; o build de produção não tem bots, então o E2E joga por WebSocket direto (exemplo: `e2e/dixit-historico.spec.ts`).

## Servidor e deploy

- **Rotas:**
  - `POST /rooms { game }` → `{ code }`;
  - `GET /rooms/:code`;
  - `GET /rooms/:code/ws` (protocolo em `shared/src/protocol.ts`);
  - `GET /history/:game`, com limite de 60 pedidos por minuto por IP.
- **Conta Cloudflare:** mrlimao36@gmail.com. O D1 se chama `cartolina`. Os segredos do GitHub Actions estão em `docs/deploy.md`.
- **Ordem do deploy:** check → e2e → server (migração D1 + `wrangler deploy`) → web (Pages). Acompanhe com `gh run list --repo rafa-mesquita/cartolina --branch main`.

## Testar no navegador (painel do app)

- **Servidores próprios:** a porta 8787 costuma estar ocupada por outra sessão. Suba os seus em outras portas: servidor com `npx wrangler dev --port 87xx --inspector-port 92xx`, dentro de `server/`, e site com `npx vite --port 51xx --strictPort`, dentro de `web/`, com `web/.env.development.local` contendo `VITE_SERVER_URL=http://127.0.0.1:87xx`.
  - Pelo `preview_start`, use entradas **temporárias** no `.claude/launch.json` da pasta mãe (com `cwd`) e **remova logo depois** de subir.
- **Viewport:** emule 1280×800 (`resize_window`). A mesa é um palco fixo de 1440×900 escalado. O Diquisti mostra aviso de celular abaixo de 640px.
- **Bots:** "🤖 adicionar bot" no lobby, só em dev. Os bots vivem na aba: recarregar derruba eles.
- **Ser o narrador no Diquisti:** o host clica em "destravar" até a vez cair em você.
- **Agir por script:** dá pra clicar em botões com `.click()` via JS e jogar carta com foco + `keydown Enter`.
- **Captura de tela:** às vezes sai miniaturizada. Nesse caso, meça com `getBoundingClientRect` via JS.

## Imagens das cartas (Google Flow)

As cartas do Diquisti (191 até agora) e as fotos do Retratim são geradas no **Google Flow** (Nano Banana 2.1), no painel do navegador. O **login é do Rafa**: quando cair, peça pra ele entrar.

- **Projeto:** https://flow.google.com/project/916ea2ac-3247-471a-a7d6-0fb82c8b8092. Configure **Imagem, 3:4, x2** no botão "Nano Banana" (o formato às vezes volta pra 16:9).
- **Prompt:** o estilo e todos os prompts estão em `docs/dixit/cartas-prompts.md`. Escreva o prompt novo lá também. Formato: `Dreamlike surrealist oil painting: <cena>. Setting: … Palette: … ` + o final fixo (sem texto, sem moldura, assunto centralizado).
- **Gostos do Rafa:**
  - nada de sombra como ideia principal;
  - nada de baleia (já tem demais);
  - temas com pessoas negras com dignidade;
  - nunca retratar pessoa real (se o tema for um nome, pergunte).
- **Mandar o prompt:**
  1. foque a caixa com JS: `document.querySelector('div[contenteditable="true"]').focus()`;
  2. digite com `computer type` (texto inserido por JS o editor não registra);
  3. espere 1,5 s;
  4. clique no botão "Iniciar geração" pela ref (`find`);
  5. tire o mouse de cima (`hover` no topo).

  Confira que a caixa ficou vazia. Se a URL tiver `/edit/`, abriu uma imagem por engano: volte pro projeto antes de digitar. Peça pro Rafa **não clicar no Flow enquanto você digita**.
- **Escolha:** o Rafa dá **coração** (favorito) na opção que fica. Depois você abre "Favoritos" na lateral e:
  1. pega o link de cada imagem: clique na miniatura e, na tela de edição, a `img` **visível** com `naturalWidth >= 800` dá `https://flow-content.google/image/…?Expires…&Signature…`;
  2. baixa com `curl` (o link é assinado e público por algumas horas);
  3. monta uma folha de conferência (ffmpeg `hstack`) pra checar se cada imagem bate com o tema;
  4. tira os corações (botões "Remover favorito").
  - Nunca use `<a download>`: abre um diálogo de salvar pra cada imagem.
  - As miniaturas `flow.google.com/asb/…` não baixam pelo `curl`.
- **Cartas do Diquisti:**
  - recorte central 2:3, WebP 600×900, qualidade 78 (mesmo recorte de `scripts/dixit-cartas.mjs`), em `web/public/dixit/cards/dNNN.webp`;
  - **pra adicionar cartas, não rode `npm run dixit:cartas`**, porque ele refaz o baralho inteiro. Converta só as novas com sharp;
  - atualize `DIXIT_DECK_SIZE` (`shared/src/games/dixit/deck.ts`), o teste `shared/test/dixit-deck.test.ts` e o `web/public/dixit/cards/cartas.json`;
  - um PR por lote.
- **Fotos do Retratim:** `npm run pictures:fotos -- <pasta>` (recorte 4:3, 1200×900 + miniatura 480×360). Estilo: foto realista de celular, 1 opção por prompt.

## Versão de celular

- **Detecção:** `web/src/lib/device.ts`. `useLayout()` dá `'phone'` até 640px; `useIsPhone()` detecta aparelho de toque; celular deitado mostra "vira o celular em pé".
- **Quais jogos:** `mobile: true` em `web/src/games/catalog.ts` libera o jogo no celular. Sem isso, o celular vê "esse jogo por enquanto é pra jogar no computador 💻" e nenhuma conexão é aberta.
- **Mesa do celular do DITU:** fica em `web/src/table/phone/`, separada da mesa do computador (`web/src/table/engine.ts`). Mesa mista funciona: cada um vê o arrasto do outro no lugar certo. E2E com `newPhonePlayer(browser)` em `e2e/helpers.ts`.
- **Diquisti e Retratim no celular:** ainda não. Não mude o `mobile` deles sem planejar junto com o Rafa.

## Pegadinhas conhecidas

- **Vitest:** `beforeEach(() => x.mockReset())` devolve o mock e o Vitest chama como limpeza. Use chaves: `beforeEach(() => { x.mockReset(); })`.
- **React 19:** o `onWheel` é passivo. Pra `preventDefault` na rodinha, use listener nativo `{ passive: false }`.
- **Canvas que continua montado** (confete da mesa do Diquisti): parar a animação também tem que limpar o canvas.
- **Bash no Windows:** o `rtk` não existe no Git Bash. Rode `git`/`npm`/`gh` direto. No PowerShell do Rafa, use `npx.cmd`.
- **Memória do projeto:** `~/.claude/projects/<pasta>/memory/` (histórico de decisões e temas pendentes de cartas).
