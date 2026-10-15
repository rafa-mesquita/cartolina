# cartolina~ — site de jogos de tabuleiro + ITO (design)

**Data:** 2026-10-15
**Status:** aprovado no brainstorming, aguardando revisão da spec

## 1. Objetivo

Um site leve, hospedado no GitHub Pages, para jogar online com amigos versões
digitais de jogos de tabuleiro. O primeiro jogo é o **ITO** (cooperativo). Timeline
e Dixit virão depois, cada um com spec própria, reaproveitando esta base.

Contexto de uso: os amigos jogam **em call (Discord)**, cada um no seu PC. O site
é a mesa compartilhada; a conversa acontece por voz. Celular é secundário, mas
precisa funcionar.

Critério de sucesso: um grupo de 2–10 pessoas abre um link, entra na sala e joga
rodadas completas de ITO (modo livre e campanha) vendo, em tempo real, os
cursores e as cartas sendo arrastadas pelos outros, com animações fluidas.

## 2. Regras do ITO implementadas

- Baralho de números **1–100**, sem repetição dentro de uma rodada.
- Cada rodada tem um **tema** com dois extremos (ex.: "Lugares que você quer
  visitar — 1 nunca iria · 100 sonho de vida").
- Cada jogador vê **apenas os próprios números**. Escreve uma **dica curta**
  (máx. 40 caracteres) em cada carta sua, visível a todos.
- Os jogadores colocam suas cartas numa **fila compartilhada** (ordem crescente
  da esquerda pra direita) e podem reposicioná-las livremente. **Qualquer
  jogador da rodada move qualquer carta que já está na fila; só o dono coloca a
  carta da mão na fila, tira a carta da fila (volta pra mão) ou edita a dica.**
  Se alguém solta a carta de outro fora da fila, ela volta pro lugar dela na
  fila. (Decisão do usuário em 2026-10-15, durante o Plano 2.)
- Qualquer mudança na fila (colocar, mover ou tirar carta) **desmarca o "pronto"
  de todos**, porque "pronto" significa "aprovo esta ordem". Editar a dica só
  desmarca quem editou.
- Cada jogador marca **"tô pronto"**. Quando todos com cartas estiverem prontos
  e todas as cartas estiverem na fila, a revelação começa. O host pode **forçar a
  revelação** (só se todas as cartas estiverem na fila).
- **Contagem de erros:** percorrendo a fila da esquerda pra direita, uma carta é
  erro se seu valor for **menor que o maior valor revelado antes dela**.

### Modos (escolhidos pelo host no lobby)

- **Livre:** 1 carta por jogador. 0 erros = vitória; ≥1 erro = derrota. Depois,
  "nova rodada" com novo tema.
- **Campanha:** 3 vidas compartilhadas; níveis 1 → 2 → 3, onde o nível N dá N
  cartas por jogador; tema novo a cada rodada. Cada carta fora de ordem custa 1
  vida. Só um nível revelado **sem erro** avança; com erro e vidas > 0, o grupo
  **repete o mesmo nível** (cartas e tema novos). Nível 3 sem erro = vitória.
  Vidas = 0 = derrota (imediata, ao fim da revelação daquele nível).

### Temas

- Lista embutida de **~100 temas em PT-BR** (`shared/src/games/ito/themes.ts`),
  cada um `{ titulo, min, max }`.
- Na fase de tema, o host pode **sortear outro** ou **escrever um tema próprio**
  (título + rótulos dos extremos).
- No modo campanha o tema é sempre sorteado (o host pode sortear outro, mas não escrever).

## 3. Arquitetura

Monorepo npm workspaces, TypeScript em tudo:

```
cartolina/
├── shared/   tipos, protocolo e regras dos jogos (TS puro, sem I/O)
├── server/   Cloudflare Worker + Durable Object (1 instância por sala)
└── web/      Vite + React + TS → GitHub Pages
```

### 3.1 `shared/` — regras puras

Cada jogo implementa a interface:

```ts
interface GameModule<State, Action, View> {
  id: string;                                   // "ito"
  initialState(players: PlayerInfo[], opts: unknown, rng: Rng): State;
  applyAction(state: State, playerId: string, action: Action, rng: Rng):
    { ok: true; state: State } | { ok: false; error: string };
  viewFor(state: State, playerId: string | null): View; // esconde o que não pode ser visto
}
```

- `rng` injetável (seedable) para testes determinísticos.
- `viewFor` é a única fronteira de segredo: números de outros jogadores nunca
  aparecem na `View` antes da revelação.
- Também ficam aqui: tipos do protocolo de mensagens, paleta de cores de
  jogador (ids), validação de nomes/dicas.

### 3.2 `server/` — sala em Durable Object

- Worker HTTP: `POST /rooms` cria sala e devolve código; `GET /rooms/:code/ws`
  faz upgrade para WebSocket no Durable Object daquela sala.
- **Código de sala:** 4 caracteres de alfabeto sem ambíguos
  (`ABCDEFGHJKMNPQRSTUVWXYZ23456789`).
- **Identidade:** ao entrar, o cliente envia um `token` secreto (UUID). Em
  produção ele fica no `localStorage` (fechar a aba e voltar pelo link devolve o
  assento); em desenvolvimento fica no `sessionStorage` (cada aba é um jogador,
  para testar). O servidor mapeia `token → playerId` público. Outros jogadores
  só veem `playerId`. Reconectar com o mesmo token devolve o mesmo assento; o
  socket antigo é fechado com 4000 e aquela aba mostra "você abriu a sala em
  outra aba".
- **Heartbeat:** o cliente manda `ping` a cada 15 s; o DO responde `pong`
  sozinho (auto-response, sem acordar). Enquanto houver sockets, o DO acorda a
  cada 20 s e fecha (4002) sockets sem ping há mais de 90 s. Ao voltar para a
  aba, o cliente pinga e reconecta se não houver resposta em 5 s.
- **Estado do jogo** (lobby + estado do módulo) é salvo no storage do DO a cada
  ação aceita. Cursores/arrastos são efêmeros (só memória, só repassados).
- **Host:** quem cria a sala. Se o host desconectar por >30 s, o papel passa ao
  próximo jogador conectado (ordem de assento).
- **Entrada no meio:** quem entra durante uma rodada vira espectador até a
  próxima rodada (livre) ou próximo nível (campanha). Máx. 10 jogadores; o
  11º recebe erro `room_full`.
- **Expiração:** alarm do DO apaga a sala após 6 h sem atividade.
- Plano gratuito da Cloudflare (Durable Objects com SQLite).

### 3.3 Protocolo (JSON sobre WebSocket)

Cliente → servidor:

| tipo | payload | quem |
|---|---|---|
| `join` | `token, name, color` | todos |
| `lobby.setMode` | `mode: "livre" \| "campanha"` | host |
| `lobby.start` | — | host |
| `theme.reroll` | — | host |
| `theme.custom` | `titulo, min, max` | host |
| `round.begin` | — (confirma o tema e distribui) | host |
| `card.place` | `cardId, index` (mão → fila: dono; reposicionar na fila: qualquer jogador da rodada) | dono / jogadores |
| `card.return` | `cardId` (fila → mão) | dono |
| `card.clue` | `cardId, text` | dono |
| `player.ready` | `ready: boolean` | todos |
| `round.forceReveal` | — | host |
| `round.next` | — (próxima rodada/nível ou nova partida) | host |
| `lobby` | — (voltar ao lobby a partir do tema ou da revelação) | host |
| `fx.cursor` | `zone, x, y, drag?: { cardId }` (≤30/s) | todos |
| `fx.activity` | `"thinking" \| "writing" \| "dragging"` | todos |
| `fx.ping` | `x, y` (coordenadas da mesa) | todos |

Servidor → cliente:

| tipo | payload |
|---|---|
| `welcome` | `playerId, roomCode` |
| `state` | `View` completa do jogador (enviada a cada mudança) |
| `fx.cursor` / `fx.activity` / `fx.ping` | repasse com `playerId` |
| `error` | `code, message` (ex.: `not_owner`, `room_full`, `bad_phase`) |

Mensagens `fx.*` nunca passam pelo módulo de regras.

### 3.4 Fases do ITO

`lobby → theme → sorting → reveal → (theme | lobby)`

- `theme`: tema visível, host sorteia/edita e confirma.
- `sorting`: cartas distribuídas, dicas, fila, "tô pronto".
- `reveal`: servidor calcula de uma vez `reveal: { cardId, value, owner, error }[]`
  na ordem da fila, aplica vidas e define `outcome` (`round_won`, `round_lost`,
  `level_cleared`, `won`, `lost`). Os clientes animam carta a carta e depois
  mostram a tela de resultado (vitória/derrota da rodada, do nível ou da partida).

> Implementação: as ações do jogo trafegam como `{ t: 'action', action }`, com
> nomes que mapeiam 1:1 a tabela de §3.3 (`lobby.setMode` → `setMode`,
> `card.place` → `place`, …), e `fx.cursor.drag` inclui `index` de destino.

## 4. Interface (`web/`)

### 4.1 Telas

- **Início:** logo, "criar sala", campo "entrar com código".
- **Entrar na sala** (`#/sala/KXQ7`): nome + escolha de personagem (18
  desenhos, um por cor; os já usados ficam apagados). Roteamento por hash
  (compatível com GitHub Pages).
- **Lobby:** assentos com os jogadores, seletor de modo (host), "começar".
- **Mesa** (tema, ordenação, revelação, resultado) — descrita abaixo.
- **Manual de marca** (`#/marca`).
- **Sala não encontrada/expirada**, **sala cheia**.

### 4.2 Mesa estilo "Uno online"

- **Você sempre embaixo**, com sua mão em destaque, o campo de dica de cada
  carta e o botão "tô pronto".
- **Outros jogadores ao redor** (topo, esquerda, direita), na mesma ordem
  circular para todos, rotacionada a partir de você. Cada assento mostra o
  personagem do jogador (só o desenho; o nome do bicho nunca aparece, só em
  `aria-label`) e o nome do jogador, cartas ainda na mão (viradas), espaço tracejado das cartas
  já jogadas, e status ao vivo: *pensando*, *escrevendo…*, *arrastando…*,
  *pronto ✓*, *desconectado*.
- **Feltro no centro:** carta de tema, marcadores "1" e "100", fila de cartas
  (dono + dica; número só para o próprio dono até a revelação). Topo: nível e
  vidas (campanha).
- **Arrasto ao vivo:** a carta de outro jogador sai do assento dele, segue o
  cursor dele inclinada e levantada; a fila abre um espaço tracejado no índice
  de destino; vizinhas deslizam. Ao soltar, assenta com mola; ao cancelar, volta
  voando ao assento.
- **Cursores:** todos os cursores visíveis com nome e cor. **Clique duplo na
  mesa** = ping (onda na cor do jogador).
- **Zonas de cursor:** `table` (x,y normalizados 0–1 no feltro, iguais para
  todos) ou `hand` (cursor sobre a própria mão → desenhado no assento daquele
  jogador na tela de cada um).
- **Revelação:** flip 3D carta a carta (~600 ms cada); erro = tremidinho + X;
  vitória = confete. O banner de resultado tem um botão de olho ("ver a mesa")
  que esconde banner e véu para olhar a fila revelada; uma pílula no topo traz
  o banner de volta (local, por pessoa). Host pode "pular rodada" durante a
  ordenação (envia `next`), para destravar se alguém sair com carta na mão.
- **Sons:** um som quando a revelação começa e um quando uma carta assenta na
  fila (sua ou de outro); botão "som" liga/desliga (salvo no navegador).
- **Selo das cartas e buraco da fila:** mostram o personagem do dono.
- **Celular (<768 px):** assentos viram fileira compacta de avatares no topo;
  mesa e mão ocupam o resto. Mesa 3D desligada por padrão.

### 4.3 Mesa em perspectiva (etapa própria, depois da mesa plana)

- Só o feltro inclina: `perspective: 900px` no palco, `rotateX(38deg)` no feltro.
  Assentos, mão e botões ficam planos por cima.
- Carta arrastada sobe (`translateZ`) e contra-rotaciona para ficar de frente.
- Conversão ponteiro → coordenadas do feltro via matriz inversa (interseção do
  raio com o plano do feltro), em função pura testada.
- Opção "mesa 3D" nas configurações (ligada por padrão no desktop), salva em
  `localStorage`.

### 4.4 Animação e rede

- Motor próprio (`web/src/table/engine.ts`, portado do protótipo aprovado):
  molas, homografia do feltro e um único `requestAnimationFrame`; sem
  biblioteca de animação.
- Posições remotas chegam a ≤30 Hz e são **interpoladas com mola a 60 fps**.
- Reordenações da fila sempre deslizam (posições alvo animadas por mola).

## 5. Identidade visual — cartolina~

Tokens em `web/src/brand/tokens.css`, documentados em `#/marca` e resumidos em
`docs/marca.md`.

- **Nome/logo:** wordmark `cartolina~` em Fredoka 700, til em rosa `#E0567A`.
  Favicon: "~" dentro de uma cartinha.
- **Cores base:** kraft `#EADBC0` (fundo), papel `#F6EEDD` (feltro/superfícies),
  tinta `#3B2F2F` (texto e contornos), rosa `#FF8FAB` (tema/destaque),
  rosa-forte `#E0567A` (acento/alvo de soltura).
- **Personagens (18, um por cor; máx. 10 jogadores por sala):** desenhos em SVG
  com contorno de tinta e preenchimento chapado (`web/src/brand/critters.ts`):
  cavaleiro `#8EC5FF`, porquinho `#FF8FAB`, dinossauro `#7EDDB5`, polvo
  `#C7B3FF`, pintinho `#FFD07A`, raposa `#FFB38A`, robô `#9EE6F0`, gatinho
  `#E6B8E0`, sapo `#C9E27A`, urso `#D9C2A0`, galo `#F4877A`, coruja `#B59A7A`,
  mago `#9C9CF0`, panda `#ECE8E2`, pinguim `#9FB5CC`, abelha `#F9E36B`,
  vampiro `#A97AB0`, lobo `#A7A9AE`.
- **Semânticas:** acerto `#7EDDB5`, erro `#E0567A`, vida `#E0567A`.
- **Tipografia:** Fredoka (500/700) para interface e números; Patrick Hand para
  dicas e temas (o que é "escrito por jogadores").
- **Forma:** contorno de tinta 2px; cantos irregulares `14px 10px 13px 9px`;
  cartas com rotação fixa sorteada por carta (−3° a 3°); sem sombras —
  profundidade por contorno/deslocamento.
- **Movimento:** sempre mola, nunca linear. Padrões nomeados: levantar, assentar,
  deslizar, flip, tremidinho, voltar-pro-assento.
- **Voz:** PT-BR informal e brincalhão ("tô pronto", "xi, errou essa", "bora de
  novo?").

## 6. Erros e casos de borda

- **Conexão caiu:** faixa "reconectando…", backoff exponencial (1 s → 10 s). Ao
  reconectar, servidor reenvia `state` completo; cartas e assento preservados.
- **Ação inválida:** servidor responde `error`; cliente reverte a carta com
  animação e mostra aviso discreto.
- **Sala inexistente/expirada:** tela com "criar sala nova".
- **Sala cheia:** aviso.
- **Host some:** transferência automática após 30 s.
- **Jogador desconectado com cartas na rodada:** cartas dele permanecem; a regra
  de "todos prontos" ignora desconectados há >30 s. Ninguém pode tirar da mão
  as cartas de quem saiu (só o dono coloca da mão), então o host só força a
  revelação quando todas as cartas já estão na fila;
  caso contrário, aguarda a reconexão ou usa `round.next` para descartar a
  rodada e começar outra (no modo campanha, repete o mesmo nível sem perder
  vida).

## 7. Testes

- **`shared/` (Vitest):** distribuição sem repetição; `viewFor` nunca vaza
  números alheios antes da revelação; qualquer jogador move cartas da fila, só o
  dono coloca da mão, tira da fila ou escreve a dica;
  contagem de erros; vidas e progressão de níveis; vitória/derrota em ambos os
  modos; validação de fase; transferência de host.
- **`server/` (Vitest 4 + `@cloudflare/vitest-plugin`):** criar sala, entrar,
  reconectar com token, sala cheia, repasse de `fx.*`, persistência após
  reinício do DO.
- **`web/`:** testes unitários da conversão de coordenadas (plana e 3D) e da
  rotação de assentos; um teste Playwright end-to-end com 2 contextos de
  navegador jogando uma rodada livre completa contra o servidor local
  (`wrangler dev`).
- **Playtest manual** com o grupo antes de considerar pronto.

## 8. Deploy

- GitHub Actions no push para `main`:
  - `web/` → build Vite → GitHub Pages (base path do repositório).
  - `server/` → `wrangler deploy` (secret `CLOUDFLARE_API_TOKEN` no repo).
- `web` lê a URL do servidor de `VITE_SERVER_URL`.
- Pré-requisitos do usuário: conta gratuita na Cloudflare e repositório no
  GitHub com Pages habilitado.

## 9. Ordem de construção sugerida

1. Monorepo + `shared/` com regras do ITO e testes.
2. `server/` com sala, protocolo e testes.
3. `web/`: identidade (tokens) + telas início/entrar/lobby.
4. Mesa plana com assentos, arrasto, dicas, prontos, revelação.
5. Cursores, arrastos remotos interpolados, pings, status ao vivo.
6. Mesa em perspectiva 38°.
7. Manual de marca `#/marca` + `docs/marca.md`.
8. Deploy (Actions) + E2E + playtest.

## 10. Fora de escopo (esta versão)

Chat de texto, login/contas, espectador com visão privilegiada,
Timeline, Dixit. (Sons entraram no Plano 2 a pedido do usuário. Em modo de
desenvolvimento existem bots de teste — "🤖 adicionar bot" no lobby — que não
vão para o build de produção.)

## 11. Histórico do grupo (adicionado em 2026-10-15, Plano 3)

Pedido do usuário depois do design inicial: guardar o histórico das partidas
da galera, de forma permanente e compartilhada.

- **Grupo:** espaço permanente com nome (ex.: "Galera da call") e link secreto
  `#/g/<slug>` (10 caracteres aleatórios). Quem tem o link vê tudo; sem login.
  A página do grupo tem "criar sala", a lista de partidas e as estatísticas.
- **Salas do grupo:** salas criadas a partir da página do grupo ficam ligadas a
  ele (`groupId` guardado no `Room`). Salas avulsas continuam funcionando, sem
  histórico.
- **O que é salvo:** a cada revelação (fase `reveal`), uma linha com data, modo,
  nível, tema (título + extremos), jogadores (nome + cor), fila final (dono,
  número, dica, erro), número de erros e `outcome`. Rodadas de uma mesma
  campanha compartilham um `campaignId`, e a última traz o resultado final.
- **Página do grupo:**
  - lista de partidas (mais recentes primeiro), cada uma expansível mostrando a
    fila revelada com as dicas;
  - números gerais: rodadas jogadas, % de vitórias no modo livre, campanhas
    zeradas;
  - destaques por **nome** de jogador: quem mais acerta a posição (menos cartas
    com erro / total de cartas), temas mais jogados, maior sequência de
    vitórias.
- **Armazenamento:** Cloudflare D1 (SQLite, plano gratuito), tabelas `groups`
  (`id`, `slug`, `name`, `created_at`) e `rounds` (`id`, `group_id`,
  `room_code`, `played_at`, `mode`, `level`, `outcome`, `errors`,
  `campaign_id`, `theme_json`, `players_json`, `cards_json`). O Durable Object
  da sala grava a linha ao entrar em `reveal`.
- **Rotas novas:** `POST /groups` (cria, devolve slug), `GET /groups/:slug`
  (grupo + rodadas paginadas + estatísticas), `POST /groups/:slug/rooms` (cria
  sala ligada ao grupo).
- **Ordem dos planos:** Plano 2 (mesa jogável) → Plano 3 (histórico do grupo) →
  Plano 4 (celular, manual de marca, deploy, E2E).
