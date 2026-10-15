# Notas para o Plano 2 (vindas da revisão final do Plano 1)

## Fazer no começo do Plano 2 (servidor/shared)

1. **Ver a sala antes de entrar.** O cliente que ainda não deu `join` não recebe nada; a tela
   de entrada precisa bloquear cores já usadas (spec §4.1). Opção: enviar
   `{ t: 'state', room: roomView(room, null) }` também para sockets não identificados, ou
   `GET /rooms/:code` devolver `{ exists, phase, seats: [{ name, color, connected }] }`.
2. **Reconciliação de presença pura.** Extrair o laço do construtor do `RoomDO` para
   `reconcilePresence(room, liveIds, now)` em `shared/src/room.ts` com testes.
3. **Códigos tipados.** Exportar um union `ErrorCode` e constantes `CLOSE_REPLACED = 4000`,
   `CLOSE_GONE = 4004` em `shared`.
4. **Heartbeat / liveness.** `ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping','pong'))`
   no DO + cliente mandando `ping` a cada ~20 s + varredura no alarme que trata como
   desconectados sockets com `getWebSocketAutoResponseTimestamp` antigo.
5. Menores: `fx.*` contar como atividade (throttled) para a sala não expirar com o grupo
   conversando; `cleanName` medir em code points; `engines: { node: ">=24" }`; `.claude/` no
   `.gitignore`; `.gitattributes` marcando `server/worker-configuration.d.ts` como gerado.
6. Spec desatualizada: §3.1 (assinatura do `GameModule`), §3.3 (`welcome` usa `code`), §7
   (`@cloudflare/vitest-plugin` + Vitest 4), `round.next` após `won`/`lost` volta ao lobby.

## Contrato para o cliente web

- Fluxo de entrada: `GET /rooms/:code` antes (WebSocket no navegador não expõe o 404 do
  upgrade, só fecha com 1006); depois `wss://…/rooms/:code/ws` e `join` com token
  `crypto.randomUUID()` guardado no `localStorage`.
- Ordem: `welcome` chega antes do primeiro `state`.
- Erros de `join` (`room_full`, `bad_name`, `bad_color`, `color_taken`) chegam como `error` e o
  socket continua aberto — pode tentar de novo no mesmo socket.
- Não reconectar automaticamente em close **4000** (substituído por outra aba) nem **4004**
  (sala expirou/não existe); backoff só para 1006 e similares.
- Ação recusada não gera `state`: desfazer o arrasto otimista ao receber `error` (re-render a
  partir do último `state`).
- Derivações do `RoomView`: espectador = `!game.players.includes(id)`; minha mão = cartas com
  `owner === you` fora da `row`; costas nos assentos = cartas do dono fora da `row`;
  prontos = `game.ready`; host = `hostId`; desconectado = `seats[].connected`. Status
  pensando/escrevendo/arrastando só via `fx.activity`.
- `lives`/`level` existem no modo livre (3 e 1): esconder fora da campanha.
- Cursor: limitar a ~30 Hz no cliente (o servidor descarta < 33 ms).
- Antes do deploy: `POST /rooms` sem rate limit; rodar `vite build` local (regra do hub).

## Referência de UX

`prototipo/index.html` (servido em http://localhost:5174 pela config `prototipo` do
`.claude/launch.json`) foi aprovado pelo usuário ("adorei a simulação"): reaproveitar molas,
fila abrindo espaço, carta levantando, cursores interpolados, flip da revelação.
