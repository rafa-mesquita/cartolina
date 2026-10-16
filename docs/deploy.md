# Colocar o cartolina online

O site fica no GitHub Pages (`https://rafa-mesquita.github.io/cartolina/`) e o
servidor na Cloudflare (`https://cartolina-server.<seu-subdominio>.workers.dev`).
Tudo no plano grátis. A cada push no `main`, o GitHub Actions testa e publica
sozinho (`.github/workflows/deploy.yml`); se um teste falhar, nada é publicado.

## Configuração (uma vez só)

1. **Conta na Cloudflare.** Entre em https://dash.cloudflare.com (ou crie a
   conta: é grátis e não pede cartão). Abra **Workers & Pages** uma vez; se
   pedir, escolha o seu subdomínio `*.workers.dev`.
2. **Login do wrangler no PC.** Na raiz do repositório:
   `npx wrangler login` → aprove no navegador.
3. **Banco D1 de produção.** `npx wrangler d1 create cartolina` (dentro de
   `server/`). Copie o `database_id` que aparecer para `server/wrangler.jsonc`
   (no lugar dos zeros) e faça commit. O id não é segredo.
4. **Token pro GitHub publicar.** No painel da Cloudflare: **My Profile → API
   Tokens → Create Token → modelo "Edit Cloudflare Workers"** e acrescente a
   permissão **Account → D1 → Edit**. Copie o token (ele só aparece uma vez).
5. **Segredos no GitHub.** Em https://github.com/rafa-mesquita/cartolina →
   **Settings → Secrets and variables → Actions → New repository secret**:
   - `CLOUDFLARE_API_TOKEN` = o token do passo 4;
   - `CLOUDFLARE_ACCOUNT_ID` = o Account ID (aparece na página inicial de
     **Workers & Pages**, na lateral).
6. **Pages.** **Settings → Pages → Build and deployment → Source: GitHub
   Actions**.
7. **Primeira publicação.** Faça push no `main` (ou rode o workflow em
   **Actions → deploy → Run workflow**). O job `server` publica o Worker e
   mostra o endereço dele no log. O job `web` vai falhar pedindo a variável
   `SERVER_URL` — é esperado.
8. **Endereço do servidor.** **Settings → Secrets and variables → Actions →
   Variables → New repository variable**: `SERVER_URL` =
   `https://cartolina-server.<seu-subdominio>.workers.dev` (sem barra no fim).
   Rode o workflow de novo: agora o site sai.

Se o `wrangler deploy` reclamar de `ratelimits` (limitador não disponível no
plano), apague o bloco `ratelimits` de `server/wrangler.jsonc`: o servidor
funciona sem ele.

## Conferir depois de publicar

- `SERVER_URL=https://cartolina-server.<subdominio>.workers.dev npm run smoke`
  → deve terminar com `ok`.
- Abrir o site, criar uma sala e jogar uma rodada com alguém (ou com uma aba
  anônima).

## Primeira noite

- Crie o grupo no site e mande o **link do grupo** no Discord. Cada um abre no
  **computador** (no celular aparece um aviso).
- Do grupo, clique em **criar sala do grupo** e mande o link da sala. As
  rodadas jogadas ali entram no histórico sozinhas.
- Travou alguma coisa? **Recarregue a página**: carta e assento são mantidos.
- No dia seguinte, veja quanto da cota foi usado: painel da Cloudflare →
  **Workers & Pages → cartolina-server → Metrics** e **D1 → cartolina**. O
  plano grátis tem 100 mil requisições por dia.
