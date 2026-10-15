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
