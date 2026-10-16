# cartolina~ — Dixit (design)

Data: 2026-10-15. Segundo jogo do cartolina~, sobre a base descrita em
`2026-10-15-cartolina-ito-design.md` (§3 arquitetura, §4 interface). Esta spec
cobre a mecânica completa com **cartas provisórias**; a arte de verdade das
cartas será feita pelo usuário depois e entra só como arquivos (§7).

## 1. Objetivo

Jogar Dixit com os amigos na call (Discord), cada um no seu PC, no mesmo site
do ITO. Critério de sucesso: um grupo de 3–10 pessoas entra pelo link, joga uma
partida inteira até a meta de pontos sem travar, e quando a arte chegar basta
soltar os arquivos numa pasta e rodar um script.

Decisões do usuário (2026-10-15):

- Identidade **só dentro do jogo**: início, grupos e entrada seguem cartolina~;
  sala de Dixit (lobby, mesa, resultado) tem cara própria (§6).
- **3 a 10 jogadores.**
- Fim por **pontos, host escolhe**; padrão **30** (como a caixa).
- Dica do narrador **escrita opcional**.
- **Sem histórico do grupo** nesta versão (vem num plano próprio).
- Página inicial vira **estante de jogos** com capa por jogo; o jogo é
  escolhido ao criar a sala.
- **Sala genérica com registro de jogos** (caminho A).
- **Mesa 3D como a do ITO**, **personagens mantidos**, **placar como
  personagens andando num tabuleiro** (a validar no protótipo, §5.4).

## 2. Regras implementadas

### Preparação

- 3 a 10 jogadores. Mão de **6 cartas** (com 3 jogadores, **7**).
- Host escolhe a meta no lobby: **30** (padrão) ou **15** (curta).
- Primeiro narrador sorteado; depois passa na ordem dos assentos.
- Baralho embaralhado pelo servidor (`rng` injetável).

### Rodada

1. **Narração** (`storytelling`): o narrador escolhe 1 carta da mão e,
   opcionalmente, escreve a dica (até 80 caracteres); confirma com "contei".
   A dica pode ficar vazia (dada na call: som, gesto, música).
2. **Escolha** (`submitting`): cada outro jogador escolhe 1 carta da mão que
   combine com a dica (com 3 jogadores, **2 cartas** cada; mesa de 5).
   Pode trocar a escolha até confirmar; confirmado, não muda mais. Ninguém vê quem jogou o quê.
3. **Votação** (`voting`): quando todos confirmaram, o servidor embaralha as
   cartas jogadas e mostra todas viradas para cima, numeradas (I, II, III…).
   Cada não-narrador vota em **uma** carta que não seja sua; pode trocar até
   confirmar; confirmado, não muda mais. Todos veem quem já votou, não em quê.
4. **Revelação** (`reveal`): mostra dono de cada carta, qual é a do narrador e
   os votos (personagens como fichas sobre as cartas); pontos aplicados.

### Pontuação (regra da caixa)

- "Todos" e "ninguém" contam só quem votou.
- **Todos** ou **ninguém** acharam a carta do narrador: narrador 0, cada outro
  jogador 2.
- Caso contrário: narrador **3** e cada um que acertou **3**.
- Bônus: cada não-narrador ganha **+1 por voto** recebido em carta(s) sua(s).

### Reposição e fim

- Fim da rodada: cartas jogadas vão ao descarte; cada um compra até a mão
  cheia. Baralho vazio → descarte é embaralhado e vira o baralho.
- Partida termina **no fim da rodada** em que alguém atinge a meta. Empate no
  topo: todos os empatados vencem (`gameover`).
- Tela final: host escolhe "jogar de novo" (mesmos assentos, placar zerado) ou
  "voltar pro lobby".
- **Baralho mínimo:** `jogadores × 7`; abaixo disso o lobby bloqueia o início
  com aviso (só relevante quando a arte real tiver poucas cartas).

### Presença (tolerância de 30 s, como no ITO)

- Quem entra no meio assiste e recebe mão na próxima rodada.
- Narrador inativo durante `storytelling` → a vez passa ao próximo jogador
  ativo e a rodada recomeça com esse novo narrador.
- Jogador inativo em `submitting`/`voting` → a rodada segue sem ele (não
  precisa confirmar). Quem não votou não ganha pontos de acerto, mas ganha
  o bônus dos votos que a carta dele recebeu.
  Se a carta dele já estava na mesa, continua valendo.
- Menos de 3 ativos → partida pausa com "esperando gente"; host pode voltar
  ao lobby.
- Host tem **"destravar"**: força a próxima etapa (quem não confirmou fica de
  fora da etapa).

## 3. Arquitetura

### 3.1 Sala genérica (`shared/`)

Hoje `room.ts` é presa ao ITO (`Room.game: ItoState`, chamadas `ito.*`
diretas). Muda para:

- `shared/src/games/registry.ts`: `GAMES = { ito, dixit }`, `GameId`. Cada
  entrada traz módulo de regras (`GameModule`), schema zod das ações,
  `minPlayers`/`maxPlayers` e `liveCursors` (cursores/ping ao vivo). Por
  enquanto só o ITO grava histórico: `pendingRecord` filtra com `itoStateOf`.
- `Room` ganha `gameId: GameId`; `game` passa a ser o estado do jogo daquela
  sala. `roomAction`, `tick`, `roomView` e `roomSummary` delegam ao registro.
- O que é só do ITO fica explícito como tal: detecção de início de campanha
  (`runStartedAt`) e gravação no histórico (`recordedRevealKey`).
- **Compatibilidade:** sala salva sem `gameId` carrega como `'ito'`. Testes
  atuais do ITO passam sem mudança de comportamento.
- `RoomView` ganha `gameId`; `RoomSummary` também.
- A rotação do narrador usa `players` do estado do Dixit (ordem dos assentos
  no início da partida; quem entra depois vai pro fim); `GameContext` não
  muda.

### 3.2 Protocolo

- Envelope continua `{ t: 'action', action }`; o schema do envelope aceita
  `action` como objeto e o servidor valida com o schema do jogo da sala
  (`GAMES[room.gameId].actionSchema`). Inválida → `bad_action`.
- `fx.cursor` e `fx.ping` **não são usados no Dixit** (cursor sobre uma carta
  entrega o voto); o servidor descarta `fx.cursor`/`fx.ping` em salas de Dixit.
  `fx.activity` continua (status: *escolhendo…*, *votando…*, *escrevendo…*).
- Novos códigos de erro com mensagem PT-BR (ex.: `own_card` "Não dá pra votar
  na própria carta.", `not_storyteller`, `deck_too_small`).

### 3.3 Módulo do Dixit (`shared/src/games/dixit/`)

- `types.ts`: fases `lobby → storytelling → submitting → voting → reveal →
  (storytelling | gameover)`; estado com `players`, `scores`, `target`,
  `storyteller`, `deck`, `discard`, `hands`, `clue`, `submissions`
  (cartas por jogador), `tableOrder` (ordem embaralhada na votação),
  `votes`, `confirmed`, `lastRound` (resultado para animar).
- Ações: `setTarget`, `start`, `tell { cardId, clue }`, `submit { cardIds }`,
  `vote { cardId }`, `confirm`, `forceNext`, `next`, `again`,
  `lobby`.
- `scoring.ts`: função pura `scoreRound(...)` → pontos por jogador e detalhes
  (quem acertou, votos por carta). Concentra a maior parte dos testes.
- `deck.ts`: `DIXIT_DECK_SIZE` e ids `d001…dNNN`. Provisório: 84.
- `rules.ts`: implementa `GameModule`; `onPresenceChange` cuida de narrador
  inativo, jogadores inativos e pausa com < 3.

### 3.4 Segredos (`viewFor`)

- Sua mão: só você vê.
- `storytelling`/`submitting`: a carta do narrador e as dos outros não
  aparecem; só a contagem e quem já confirmou. Você vê as suas jogadas.
- `voting`: cartas na `tableOrder`; você sabe quais são suas, não de quem são
  as outras nem qual é a do narrador; votos alheios ocultos (só quem votou).
- `reveal`/`gameover`: tudo.
- Ids de carta são do baralho e não codificam dono.

### 3.5 Servidor (`server/`)

- `POST /rooms { game? }` e `POST /groups/:slug/rooms { game? }`; padrão
  `ito` (clientes antigos continuam funcionando). `game` inválido → 400.
- `GET /rooms/:code` devolve também `game`.
- `room-do.ts` não muda de forma: delega ao registro; só grava no D1 se o jogo
  da sala grava histórico (Dixit não grava nesta versão).
- Limites/CORS do Plano 4 valem igual.

## 4. Telas compartilhadas (`web/`)

- **Início = estante de jogos:** uma capa por jogo (ITO no estilo cartolina~,
  Dixit no conto ilustrado). Clicar na capa cria a sala daquele jogo. "Entrar
  com código" e grupos continuam. Capas são imagens trocáveis
  (`web/public/covers/<jogo>.webp`); a primeira versão é montada no código.
- **Página do grupo:** "criar sala" pergunta o jogo (mesma estante, compacta).
- **Entrar na sala / lobby:** os mesmos componentes, com `data-game` na raiz
  da sala trocando tokens (cores, fontes, sons). Painel de opções do lobby é
  por jogo (ITO: modo; Dixit: meta 15/30). "Começar" exige 3+ no Dixit.
- `RoomScreen` escolhe a mesa pelo `gameId`.
- Personagens (critters) continuam iguais em todos os jogos.

## 5. Mesa do Dixit (`web/src/games/dixit/`)

### 5.1 Layout

- Mesma estrutura "Uno online" do ITO: **você embaixo** com sua mão; outros
  jogadores em assentos ao redor (personagem + nome + status), reaproveitando
  `seatLayout`/`Seat`.
- **Feltro em perspectiva** como no ITO (`perspective` no palco, `rotateX` no
  feltro, opção "mesa 3D" no `localStorage`, reaproveitando `homography.ts`).
  Assentos, mão, dica e botões ficam planos por cima.
- **A arte não pode ficar distorcida:** cartas no feltro ficam "de pé"
  (contra-rotação, como as cartas levantadas do ITO) quando em foco, e
  **clicar numa carta abre ela grande e plana** (visualizador), em qualquer
  fase. Na mão, as cartas são grandes e planas.
- Topo: dica do narrador (com o personagem dele) e fase/progresso
  ("votação · 3 de 5").
- Centro do feltro: cartas viradas para baixo chegando (escolha), depois
  viradas para cima com numeração romana (votação); voto = sua ficha
  (personagem) sobre a carta.

### 5.2 Placar como tabuleiro

- Em vez de números, uma **trilha de casas 0…meta** desenhada no feltro (em
  volta da área das cartas). Cada jogador é seu **personagem como peão**,
  de pé sobre a casa da pontuação.
- Na revelação, os peões andam casa a casa com mola (um por vez, rápido).
- Vários peões na mesma casa se empilham/espalham levemente.
- Número exato sempre acessível: no hover do peão/assento e no `aria-label`.
- Risco: muita informação na mesa com 10 jogadores. Validado no protótipo
  (§5.4); se não funcionar, plano B é a trilha numa faixa reta fora do feltro.

### 5.3 Revelação e fim

- Sequência: vira a carta do narrador com destaque → fichas de voto aparecem
  nas cartas → donos aparecem sob cada carta → peões andam.
- `gameover`: vencedor(es) em destaque, confete no estilo da identidade,
  botões do host.

### 5.4 Protótipo antes da mesa real

Como no ITO, a mesa é validada antes num **protótipo só de front com bots
falsos** (`prototipo/dixit/`): mesa 3D, cartas de pé, visualizador, trilha com
peões e revelação. O usuário joga sozinho contra bots, ajusta, e só então a
mesa é portada para `web/`.

### 5.5 Cartas provisórias

- Geradas no navegador a partir do id (semente): formas e pinceladas na
  paleta da identidade; cada carta diferente e reconhecível.
- Verso provisório no estilo da identidade.
- Quando existir `web/public/dixit/cards/<id>.webp`, usa a imagem; senão, a
  provisória.

### 5.6 Bots (só em desenvolvimento)

Botão "🤖 adicionar bot" no lobby do Dixit (como no ITO): bots narram com dica
aleatória de uma lista, escolhem e votam ao acaso com pequenos atrasos. Não
vão para o build de produção.

## 6. Identidade visual do Dixit — "conto ilustrado"

Escolhida pelo usuário a partir de mockups (2026-10-15). Tokens em
`web/src/games/dixit/tokens.css`, escopados em `[data-game="dixit"]`.

- **Cores:** fundo verde-floresta `#233D36`, superfície `#2F5046`, creme
  `#F6EAD2` (texto e molduras), mostarda `#F2A541` (acento: dica, voto,
  progresso), texto suave `#B7C7B0`.
- **Fundo:** pinceladas suaves em verdes próximos do fundo (`#26403A`–
  `#2C4A41`) com espirais em mostarda quase transparente; nunca compete com as
  cartas.
- **Traço fino em tudo:** molduras das cartas em fio creme (~0,75 px) com
  respiro de 3 px antes da arte; linhas e contornos finos.
- **Tipografia:** DM Serif Display (título, dica, números romanos, pontos);
  Nunito 300/400 para interface.
- **Numeração:** romana (I–X) nas cartas da votação, como etiqueta de museu.
- **Movimento:** sempre mola (padrões do cartolina~).
- **Voz:** PT-BR informal ("contei", "bora votar", "ninguém achou!").
- **Sons:** pontos de som prontos (carta virando, voto, revelação, peão
  andando), começando mudos até o usuário escolher os arquivos; mesmo botão de
  som do ITO.

## 7. Arte das cartas (entrega do usuário, depois)

- Formato retrato **2:3** (como a carta original, 80×120 mm); PNG/JPG em
  qualquer tamanho.
- `npm run dixit:cartas <pasta>`: converte para WebP 800×1200 (visualizador)
  + miniatura, renomeia para `d001…`, grava em `web/public/dixit/cards/` e
  atualiza `DIXIT_DECK_SIZE`.
- Verso, capa e sons também podem ser trocados por arquivos.

## 8. Erros e casos de borda

- Votar na própria carta, narrador votando, ação fora da fase → erro com
  mensagem PT-BR, estado inalterado.
- Jogada com carta que não está na mão → `unknown_card`.
- Reconexão no meio: a `View` traz tudo para redesenhar a fase atual
  (incluindo sua escolha/voto ainda não confirmados).
- Narrador sai depois de narrar: a rodada segue; ele pontua normalmente.
- Baralho + descarte insuficientes para repor (baralho real pequeno): bloqueado
  pelo mínimo do lobby.

## 9. Testes

- **`shared/`:** `scoreRound` (todos/ninguém/alguns acharam, bônus, 3
  jogadores com 2 cartas), fluxo completo de fases, meta e empate, reembaralho
  do descarte, segredos do `viewFor` em cada fase, presença (narrador inativo,
  jogador inativo, < 3 ativos, entrada no meio), validação das ações.
- **Sala genérica:** todos os testes atuais do ITO passam; sala antiga sem
  `gameId` carrega como ITO; ação de um jogo rejeitada em sala de outro.
- **`server/`:** `POST /rooms { game }`, padrão `ito`, `game` inválido → 400;
  Dixit não grava no D1; `fx.cursor` descartado em sala de Dixit.
- **Manual:** protótipo e bots com 3, 6 e 10 jogadores.

## 10. Ordem de construção

1. **Plano D1 — fundação:** registro de jogos, sala genérica, regras do Dixit
   em `shared/`, protocolo e servidor aceitando o jogo. Sem tela nova; ITO
   intacto.
2. **Plano D2 — jogo no site:** protótipo da mesa (§5.4) → estante de jogos →
   tema e lobby do Dixit → mesa 3D, visualizador, trilha, revelação, fim →
   cartas provisórias → bots.
3. **Depois:** arte real (§7), sons, histórico do Dixit no grupo, celular
   (junto com o Plano 5 do ITO).

Branch `feat/dixit` (worktree a partir do `main`). O Plano 4 (em andamento)
também mexe em `server/src/index.ts`: antes de mexer no servidor no D1, o
`feat/dixit` é atualizado com o `main` depois que o Plano 4 entrar.

## 11. Fora de escopo (esta versão)

Histórico/estatísticas do Dixit, arte final, sons finais, variantes (Odyssey,
votos duplos), chat, celular, cursores ao vivo no Dixit.
