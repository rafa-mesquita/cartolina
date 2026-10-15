# cartolina~

Jogos de tabuleiro pra jogar com os amigos na call. Primeiro jogo: **ITO**.

## Estrutura

- `shared/` — regras dos jogos, sala e protocolo (TypeScript puro, testado)
- `server/` — Cloudflare Worker + Durable Object (uma instância por sala)
- `web/` — site (Plano 2)

## Desenvolvimento

```bash
npm install
npm test            # todos os testes
npm run typecheck
npm run dev -w server   # servidor local em http://localhost:8787
```

Os testes usam Vitest 4 e, no servidor, `@cloudflare/vitest-plugin` (sucessor do `@cloudflare/vitest-pool-workers`).

## API do servidor

- `POST /rooms` → `{ code }`
- `GET /rooms/:code` → `{ exists }` (404 se não existir)
- `GET /rooms/:code/ws` → WebSocket; protocolo em `shared/src/protocol.ts`

Design: `docs/superpowers/specs/2026-10-15-cartolina-ito-design.md`
