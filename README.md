# cartolina~

Jogos de tabuleiro pra jogar com os amigos na call. Primeiro jogo: **ITO**.

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

## API do servidor

- `POST /rooms` → `{ code }`
- `GET /rooms/:code` → `{ exists, phase, seats }` (404 com `{ exists: false }` se não existir)
- `GET /rooms/:code/ws` → WebSocket; protocolo em `shared/src/protocol.ts`

Design: `docs/superpowers/specs/2026-10-15-cartolina-ito-design.md`
