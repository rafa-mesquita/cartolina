# Notas para os Planos 3 e 4 (vindas da revisão final do Plano 2)

## Plano 3 — histórico do grupo (spec §11)

- Gravar a rodada ao entrar em `reveal` encaixa sem mudanças. Rodada pulada
  (`next` durante a ordenação) nunca chega em `reveal`, então não é registrada —
  é o comportamento desejado; deixar explícito no plano.
- `players_json` com nome + cor basta: a cor identifica o personagem. A página do
  grupo pode reaproveitar `critterSvg`/`Critter` (`web/src/brand/critters.ts`).
- Estatísticas por **nome** (tokens não são estáveis entre dispositivos); o mesmo
  nome em sessões diferentes se soma — é o esperado.

## Plano 4 — celular, manual de marca, deploy, E2E

- **Bloqueador de deploy:** definir `VITE_SERVER_URL` no build do Pages (sem ele o
  bundle aponta para `http://127.0.0.1:8787`, o que quebra em https). O
  `vite.config.ts` já avisa quando falta.
- **Cota gratuita da Cloudflare:** cursores a até 30/s por jogador contam como
  requisições do Durable Object (mensagens WebSocket recebidas). Avaliar ~20 Hz
  ou só enviar cursor quando sobre a mesa/arrastando, e olhar o painel depois da
  primeira noite de jogo.
- **Sala expirada durante reconexão:** o upgrade `/ws` dá 404 (visto como 1006) e
  o cliente tenta para sempre; após algumas falhas, consultar `getRoomInfo` e ir
  para o estado "sala não existe".
- Celular < 768 px, toque, e pausar o loop de animação quando ocioso (bateria).
- Opcional: um ponto de entrada menor do `shared` para o cliente (tirar zod e a
  lista de temas do bundle; hoje ~106 kB gzip).
- `readyCount` na UI conta só conectados; o servidor também espera quem está nos
  30 s de tolerância — alinhar ou explicar na UI.

### Vindas da revisão final do Plano 3

- **Ordem do deploy do D1 (importante):** `wrangler d1 create cartolina` →
  trocar o `database_id` em `server/wrangler.jsonc` → `wrangler d1 migrations
  apply cartolina --remote` → só então `wrangler deploy`. Publicando o Worker
  antes da migração, `GET /groups` dá 500 e as rodadas ficam na fila de nova
  tentativa. (Com o id de mentira, o `wrangler deploy` recusa: falha segura.)
- **Limites contra abuso:** regra de rate limit da Cloudflare em `POST /groups*`
  e `POST /rooms` (cada grupo é uma escrita no D1; o grátis tem 100 mil/dia), e
  recusar corpo com `content-length` acima de ~1 KB.
- **Estatísticas mais baratas (quando o grupo crescer):** hoje a primeira página
  lê até 5000 rodadas e faz parse de 3 JSONs por linha; perto do limite pode
  passar dos 10 ms de CPU do plano grátis, e "rodadas" trava em 5000. Contar
  rodadas, vitórias no livre e campanhas com `COUNT`/`SUM` no SQL e fazer parse
  só da janela recente (sequência, quem mais acerta, temas).
- **Paginação:** duas rodadas no mesmo milissegundo podem pular uma na troca de
  página. Usar cursor composto `before=<playedAt>_<id>`.
- **Menos leituras no DO:** `hasPendingRounds()` faz um `storage.list` a cada
  `scheduleAlarm`; guardar uma contagem em memória (atualizada no `commit()` e no
  `flushRound()`).
- **`errors` x `outcome`:** `pendingRecord` descarta cartas sem assento antes de
  contar erros. Hoje não acontece; contar a partir de `game.reveal` e manter a
  carta órfã com nome `'?'` deixaria os dois sempre de acordo.
