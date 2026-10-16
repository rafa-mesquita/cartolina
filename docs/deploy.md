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
3. **Banco D1 de produção.** Dentro de `server/`:
   `npx wrangler d1 create cartolina --binding DB`. Copie o `database_id` que
   aparecer para `server/wrangler.jsonc` (no lugar dos zeros) e faça commit. O
   id não é segredo. Se o wrangler perguntar se pode atualizar a configuração,
   ele só deve mudar o `database_id` da entrada `DB` que já existe. Confira
   o `server/wrangler.jsonc` depois: o binding `DB` e o
   `migrations_dir: "migrations"` precisam continuar lá. Se mais alguma coisa
   mudou, desfaça (`git checkout server/wrangler.jsonc`) e cole o id na mão.
4. **Token pro GitHub publicar.** No painel da Cloudflare: **My Profile → API
   Tokens → Create Token → modelo "Edit Cloudflare Workers"** e acrescente a
   permissão **Account → D1 → Edit**. Em **Account Resources**, escolha a sua
   conta. Se o modelo pedir **Zone Resources**, escolha "All zones from an account"
   (conta nova pode não ter zonas; tudo bem). Copie o token (ele só aparece uma
   vez).
5. **Segredos no GitHub.** Em https://github.com/rafa-mesquita/cartolina →
   **Settings → Secrets and variables → Actions → New repository secret**:
   - `CLOUDFLARE_API_TOKEN` = o token do passo 4;
   - `CLOUDFLARE_ACCOUNT_ID` = o Account ID (aparece na página inicial de
     **Workers & Pages**, na lateral; `npx wrangler whoami` também mostra).
6. **Pages.** **Settings → Pages → Build and deployment → Source: GitHub
   Actions**.
> Antes de terminar a configuração, qualquer execução do workflow falha no job
> `server`. É esperado: nada é publicado.

7. **Primeira publicação.** Faça push no `main` (ou rode o workflow em
   **Actions → deploy → Run workflow**). O job `server` publica o Worker e
   mostra o endereço dele no log. O job `web` vai falhar pedindo a variável
   `SERVER_URL` — é esperado.
8. **Endereço do servidor.** **Settings → Secrets and variables → Actions →
   Variables → New repository variable**: `SERVER_URL` =
   `https://cartolina-server.<seu-subdominio>.workers.dev` (sem barra no fim).
   Rode o workflow de novo: agora o site sai.

   Dica: se você já sabe o seu subdomínio `workers.dev`, crie a variável
   `SERVER_URL` (`https://cartolina-server.<subdominio>.workers.dev`) antes do
   primeiro push e a primeira execução já sai verde.

Se o `wrangler deploy` reclamar de `ratelimits` (limitador não disponível no
plano), apague o bloco `ratelimits` de `server/wrangler.jsonc`: o servidor
funciona sem ele; faça commit e push.

Se um dia o site passar a usar um domínio próprio, acrescente esse endereço em
`ALLOWED_ORIGINS` (`server/wrangler.jsonc`, separado por vírgula); senão o site
não consegue falar com o servidor.

## Conferir depois de publicar

- Deve terminar com `ok`:
  - bash: `SERVER_URL=https://cartolina-server.<subdominio>.workers.dev npm run smoke`
  - PowerShell: `$env:SERVER_URL = "https://cartolina-server.<subdominio>.workers.dev"; npm run smoke`
- Abrir o site, criar uma sala e jogar uma rodada com alguém (ou com uma aba
  anônima).

## Primeira noite

- Mande o **link do site** no Discord. Cada um abre no **computador** (no
  celular aparece um aviso), entra no **DITU** e clica em **criar sala** (ou
  entra pelo código de uma sala que já existe). As rodadas jogadas entram no
  histórico sozinhas, e ele fica em `#/ito/historico`, aberto a todos.
- Não faça push no `main` durante a partida: cada publicação reinicia o
  servidor e derruba as conexões por alguns segundos.
- Travou alguma coisa? **Recarregue a página**: carta e assento são mantidos.
- No dia seguinte, veja quanto da cota foi usado: painel da Cloudflare →
  **Workers & Pages → cartolina-server → Metrics** e **D1 → cartolina**. O
  plano grátis tem 100 mil requisições por dia.
