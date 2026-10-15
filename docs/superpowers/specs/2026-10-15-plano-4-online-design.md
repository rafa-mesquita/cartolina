# Plano 4 — colocar o cartolina online (design)

Data: 2026-10-15. Complementa a spec principal
(`2026-10-15-cartolina-ito-design.md`, §8 Deploy) e as notas em
`docs/superpowers/plans/notas-para-planos-3-e-4.md`.

## 0. Escopo e decisões

O antigo "Plano 4" (celular, manual de marca, deploy, E2E) foi dividido. Este
plano só **coloca o jogo online pra galera jogar de verdade**:

- Publicação automática: site no **GitHub Pages**, servidor (Worker + Durable
  Objects + D1) na **Cloudflare**, a cada push no `main`, só se os testes
  passarem (opção A, escolhida pelo usuário).
- Ajustes que só importam online: cursor mais leve, sala expirada, limites
  contra abuso, CORS restrito, aviso no celular.
- Testes de ponta a ponta (Playwright) e o roteiro da primeira noite.

**Fora deste plano:** versão jogável no celular (Plano 5) e manual de marca
`#/marca` + `docs/marca.md` (Plano 6). Na primeira noite todo mundo joga pelo
computador, em call no Discord.

## 1. Publicação automática

Arquivo `.github/workflows/deploy.yml`, disparado em push no `main` (e manual
via `workflow_dispatch`). `concurrency: { group: deploy, cancel-in-progress:
false }` impede duas publicações ao mesmo tempo.

Jobs, em ordem (cada um depende do anterior):

1. **check** — `npm ci`, `npm run typecheck`, `npm test`, `npm run build`.
2. **e2e** — instala o Chromium do Playwright e roda `npm run e2e` (ver §4).
3. **server** — `wrangler d1 migrations apply cartolina --remote` e depois
   `wrangler deploy` (nessa ordem: o Worker novo nunca roda contra um banco sem
   as tabelas). Usa os segredos `CLOUDFLARE_API_TOKEN` e
   `CLOUDFLARE_ACCOUNT_ID`.
4. **web** — `npm run build -w web` com `VITE_SERVER_URL` vindo da variável de
   repositório `SERVER_URL`, e publicação com `actions/upload-pages-artifact` +
   `actions/deploy-pages` (permissões `pages: write`, `id-token: write`).

Se `SERVER_URL` não estiver definida, o job **web** falha com mensagem clara
("defina a variável SERVER_URL"), em vez de publicar um site que aponta para
`127.0.0.1`.

## 2. Configuração de uma vez só

Passo a passo em `docs/deploy.md`. Os passos com **(usuário)** exigem login ou
segredos e são feitos pelo usuário; o Claude pode abrir as páginas certas no
Chrome pessoal do usuário e indicar onde clicar, mas não digita senhas nem
cola tokens.

1. **(usuário)** Entrar em dash.cloudflare.com, ou criar a conta grátis (sem
   cartão), e escolher o subdomínio `*.workers.dev` se for pedido.
2. **(usuário)** Rodar `npx wrangler login` no PC e aprovar no navegador.
3. Claude roda `wrangler d1 create cartolina` e commita o `database_id` real em
   `server/wrangler.jsonc` (o id não é segredo).
4. **(usuário)** Criar um token da Cloudflare a partir do modelo "Edit
   Cloudflare Workers", acrescentando a permissão D1 Edit, e cadastrar no
   GitHub (Settings → Secrets and variables → Actions) os segredos
   `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`.
5. **(usuário)** Em Settings → Pages, escolher "GitHub Actions" como fonte.
6. Depois do primeiro deploy do servidor, o endereço do Worker é conhecido
   (`https://cartolina-server.<subdominio>.workers.dev`). Ele vira a variável de
   repositório `SERVER_URL` (pode ser cadastrada pelo Claude com `gh variable
   set`, já que não é segredo), e o workflow roda de novo.

## 3. Ajustes para o jogo de verdade

### 3.1 Cursor mais leve (cota grátis)

Cada mensagem WebSocket recebida conta como requisição do Durable Object
(~20 mensagens = 1 requisição; o plano grátis tem 100 mil/dia). Hoje o cliente
manda até ~30 cursores/s.

- Cursor solto: no máximo **12 envios/s**; arrastando carta: **20/s**.
- Nada é enviado com o mouse parado (posição igual à última enviada) nem com a
  janela fora de foco/escondida.
- O servidor mantém o piso atual (`CURSOR_MIN_INTERVAL_MS = 33`) como defesa.
- O lado que recebe já interpola; se a interpolação ficar travada a 12/s, o
  ajuste é no amortecimento do `engine.ts`, conferido no localhost com bots.
- Estimativa: noite de 6 pessoas por 3 h cai de ~100 mil para algo como
  10–20 mil requisições.

### 3.2 Sala que acabou

Hoje, se a sala expira enquanto alguém reconecta, o upgrade `/ws` dá 404 e o
cliente tenta para sempre. Novo comportamento:

- Depois de **3 falhas seguidas** de conexão, o cliente consulta
  `GET /rooms/:code`. Se a sala não existe, para de tentar e mostra a tela
  "essa sala acabou" com "criar sala nova" (e "voltar pro grupo" quando a
  sala era de um grupo e o cliente sabe qual).
- Se a sala existe, continua tentando com o backoff atual (1 s → 10 s).

### 3.3 Limites contra abuso

- `POST /rooms`, `POST /groups` e `POST /groups/:slug/rooms` passam por um
  limitador por IP (`CF-Connecting-IP`) usando o binding de Rate Limiting da
  Cloudflare (`ratelimits` no `wrangler.jsonc`, período de 60 s): **10
  salas/min** e **5 grupos/min** por IP. Estourou → `429` com
  `{ error: 'too_many' }`, e o site mostra "calma! tenta de novo em um
  minutinho".
- O binding é **opcional no código**: se não existir no ambiente, a rota segue
  sem limite. A documentação não deixa claro se ele está no plano grátis; se o
  deploy recusar o binding, ele sai do `wrangler.jsonc` e o resto continua
  igual.
- Corpo de requisição acima de **1 KB** é recusado com `413` antes do
  `request.json()`.

### 3.4 CORS restrito

`Access-Control-Allow-Origin` deixa de ser `*`: o servidor devolve o `Origin`
da requisição só se ele estiver na lista permitida — a origem do Pages
(`https://rafa-mesquita.github.io`, configurada em `wrangler.jsonc` como var
`ALLOWED_ORIGINS`) e qualquer `http://localhost:*` / `http://127.0.0.1:*`. O
upgrade de WebSocket confere a mesma lista pelo cabeçalho `Origin`.

### 3.5 Aviso no celular

Com tela estreita (< 768 px) **ou** ponteiro grosso (`(pointer: coarse)`), as
telas de sala (entrar, lobby, mesa) e o "criar sala" da tela inicial mostram:
"o cartolina por enquanto é pra jogar no computador 💻". A página do grupo
continua funcionando normalmente no celular (é só leitura).

### 3.6 Detalhes de produção

- Conferir favicon e título (já existem em `web/index.html`).
- Nenhum `console.log` de depuração no build (os `console.error` do servidor
  ficam).
- Os bots de teste continuam fora do build de produção (checado pelo E2E).

## 4. Testes

- **Unitários** (Vitest) para cada ajuste: ritmo do cursor, parada de
  reconexão com sala inexistente, limitador opcional e `413`, CORS por origem,
  detecção de celular.
- **E2E (Playwright, `e2e/` na raiz, `npm run e2e`)**, contra `wrangler dev`
  (com a migração local) e o `vite preview` do build:
  1. **Rodada livre com 2 navegadores:** um cria a sala, o outro entra pelo
     link; os dois escrevem dica, arrastam a carta pra fila, ficam prontos e
     veem a revelação; o resultado bate com os números revelados.
  2. **Sala de grupo:** cria grupo → cria sala do grupo → joga uma rodada →
     a rodada aparece na página do grupo.
  3. **Build sem bots:** o lobby do build de produção não tem
     "🤖 adicionar bot".
- **Fumaça em produção:** depois do primeiro deploy, `scripts/smoke.mjs`
  apontado para o endereço real (criar sala, duas conexões, uma rodada), e uma
  rodada jogada junto com o usuário.

## 5. Primeira noite

Seção "primeira noite" em `docs/deploy.md`:

- Criar o grupo, mandar o link do grupo no Discord, cada um abre pelo
  computador.
- Se algo travar: recarregar a página (carta e assento são mantidos).
- No dia seguinte, olhar no painel da Cloudflare quanto da cota foi usado
  (Workers → cartolina → métricas; D1 → cartolina).

## 6. Fora de escopo

Domínio próprio, plano pago, versão jogável no celular (Plano 5), manual de
marca (Plano 6), estatísticas em SQL e cursor de paginação composto (notas do
Plano 3, só quando o grupo crescer).
