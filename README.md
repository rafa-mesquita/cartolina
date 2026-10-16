# cartolina~

Jogos de tabuleiro pra jogar com os amigos na call. Jogos: **DITU**, a nossa versão do ITO (no código, id `ito`), e **Diquisti**, a nossa versão do Dixit (id `dixit`; mesa jogável).

## Estrutura

- `shared/` — regras dos jogos, sala e protocolo (TypeScript puro, testado)
- `server/` — Cloudflare Worker + Durable Object (uma instância por sala)
- `web/` — site em React; a mesa é um motor imperativo (`web/src/table/engine.ts`) portado de `prototipo/`

## Desenvolvimento

```bash
npm install
npm test              # shared, server e web
npm run typecheck
npm run dev:server    # servidor local em http://127.0.0.1:8787
npm run dev:web       # site em http://localhost:5173
npm run smoke         # fumaça WS de ponta a ponta (com o servidor rodando)
npm run build         # build do site em web/dist
```

Identidade do jogador: em desenvolvimento (`npm run dev:web`) cada aba é um jogador (o token fica no `sessionStorage`), então dá pra testar sozinho abrindo a sala em duas abas. No build de produção o jogador é lembrado pelo navegador (`localStorage`): quem fecha a aba e reabre o link volta pro mesmo assento.
Bots: o lobby tem um botão "🤖 adicionar bot" só no modo de desenvolvimento (`npm run dev:web`); eles não existem no build de produção.
O site usa `VITE_SERVER_URL` (padrão `http://127.0.0.1:8787`). Para publicar, defina `VITE_SERVER_URL` com a URL do Worker (o `npm run build` avisa quando ela não está definida).
Há um botão de som para ligar/desligar os efeitos, e os personagens substituem as cores de jogador.
Os sons em `web/public/sounds/` são do autor do projeto.

Os testes usam Vitest 4 e, no servidor, `@cloudflare/vitest-plugin` (sucessor do `@cloudflare/vitest-pool-workers`).

## Jogos e histórico

- A tela inicial é a **estante**: uma capa por jogo, mais "tem um código?" pra entrar numa sala que já existe.
- Cada jogo tem a própria página, `#/<jogo>` (`#/ito`, `#/dixit`), com duas abas: **jogar** (criar sala, entrar com código, como jogar) e **histórico** (`#/<jogo>/historico`).
- O histórico é **aberto a todos**, sem login, e é **um por jogo**: toda rodada revelada de uma sala de ITO (tema, quem jogou, a fila com números e dicas, resultado) é gravada no banco **Cloudflare D1** `cartolina`. Só o ITO grava por enquanto (`recordsHistory` em `shared/src/games/registry.ts`).
- A aba mostra números (rodadas, % de vitórias no livre, campanhas zeradas, maior sequência sem erro), quem mais acerta a posição, os temas mais jogados e as partidas (clique pra ver a fila revelada).
- Não existem mais grupos: `#/g/<slug>` e as rotas `/groups*` saíram. Os links antigos caem no histórico do ITO, com um aviso.
- Em desenvolvimento, `npm run dev:server` aplica as migrações no D1 local antes de subir (`npm run db:migrate -w server`).
- API: `GET /history/:game[?before=<ms>]` → 20 rodadas, estatísticas (`stats`, só na primeira página) e cursor (`nextBefore`). Jogo desconhecido: 404 `not_found`; jogo sem histórico: 404 `no_history`. Limite de 60 pedidos por minuto por IP e `Cache-Control: public, max-age=15`.

## API do servidor

- `POST /rooms [{ game: "ito" | "dixit" }]` → `{ code }` (sem corpo: ITO; jogo desconhecido: 400 `bad_game`)
- `GET /rooms/:code` → `{ exists, game, phase, seats }` (404 com `{ exists: false }` se não existir)
- `GET /rooms/:code/ws` → WebSocket; protocolo em `shared/src/protocol.ts`

Design: `docs/superpowers/specs/2026-10-15-cartolina-ito-design.md`
Dixit: `docs/superpowers/specs/2026-10-15-dixit-design.md` (regras em `shared/src/games/dixit/`; cada jogo se registra em `shared/src/games/registry.ts`).

## Online

O site e o servidor são publicados sozinhos a cada push no `main`, se os testes
passarem. Configuração, conferência e roteiro da primeira noite em
[docs/deploy.md](docs/deploy.md).

Testes de ponta a ponta (sobem servidor e site e jogam com o Chromium):

    npm run e2e
