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

**Substituída (2026-10-16)** pela spec da estante de jogos
(`2026-10-16-estante-de-jogos-design.md`, da sessão do ITO): não há grupos;
`#/` é a estante, `#/<jogo>` é a página do jogo (abas "jogar" e "histórico"),
`POST /rooms { game }` cria a sala, e `web/src/games/catalog.ts` diz se o jogo
já é jogável. O Dixit entra lá como "chegando" e o Plano D2 o liga.

O que continua valendo daqui:

- **Entrar na sala:** o mesmo formulário (nome + personagem) para todos os jogos.
- **Lobby do Dixit:** próprio, na identidade do Dixit: assentos, copiar link,
  som, meta 15/30 (host) e "começar" com 3+ (bots em desenvolvimento).
- `Game.tsx` escolhe lobby e mesa pelo `gameId`.
- Personagens (critters) iguais em todos os jogos.

## 5. Mesa do Dixit (`web/src/games/dixit/`)

Validada no protótipo `prototipo/dixit/` (2026-10-16), com as regras reais e
bots. O que o usuário aprovou e pediu durante o teste vale para a mesa do site.

### 5.1 Layout

- **Tela inteira:** palco desenhado em 1440×900, escalado pela altura; a
  largura cresce até a da janela (sem faixas vazias). Mesa, mão e legendas no
  centro; logo, botões e painel nos cantos; assentos num arco que se abre com a
  largura extra.
- **Você embaixo à esquerda** (personagem, nome, pontos); outros jogadores no
  arco acima da mesa (personagem, nome, cartas na mão em miniatura, status:
  *narrando…*, *escolhendo…*, *pronto ✓*, *votando…*, *votou ✓*); narrador com
  selo ✎.
- **Feltro em perspectiva** (`rotateX(38°)`, opção "mesa 3D" lembrada no
  navegador, a mesma do ITO). Cartas no feltro quase deitadas; de pé quando o
  cursor passa ou quando estão em destaque. **Nenhuma carta pode afundar no
  feltro** em animação: a mola só passa do ponto subindo, a carta fica sempre
  2 px acima do feltro e levanta enquanto vira.
- **Mão** embaixo, plana, em leque; a carta sobe ao passar o cursor; escolhida
  ganha moldura mostarda.
- **Topo:** dica do narrador num selo (personagem + dica em itálico, ou "dica
  falada na call"), e pílulas de rodada/fase/meta, som e mesa 3D.
- **Painel de ação** (canto inferior direito): o que fazer agora em cada fase
  (narrar com campo de dica até 80 letras + "contei"; "jogar essa(s)";
  "confirmar voto"; esperas com contagem).
- **Visualizador:** clique duplo, botão ⤢ ou **rodinha pra cima** sobre
  qualquer carta (mão ou mesa) amplia; **rodinha pra baixo**, Esc ou clique fora
  fecha; setas navegam.
- Nada de interface por cima dos personagens (placar, pílulas e avisos ficam no
  centro ou embaixo) e nada de interface "sobrando" quando a rodada avança.

### 5.2 Placar como tabuleiro

- **Trilha de casas 0…meta** na borda do feltro; números de 5 em 5; meta em
  mostarda. Peões = personagens de pé na casa da pontuação, espalhados quando
  dividem a casa. Pontos exatos no `title`/`aria-label` do peão e do assento.

### 5.3 Revelação narrada

Um passo de cada vez, com legenda grande e numerada embaixo da mesa ("1 de 4")
e "pular ›":

1. **Holofote na carta do narrador:** ela cresce ~1,55×, sobe acima do feltro
   com mola e brilho mostarda pulsante, com o rótulo "carta do narrador"; as
   outras escurecem e perdem cor. Legenda: "esta era a carta de **X**, que
   narrou “dica”". Depois a carta fica um pouco maior e destacada até o fim.
2. **Votos:** as fichas (personagens) aparecem uma a uma nas cartas; legenda
   final "**A e B** acharam a carta do narrador" / "ninguém achou…" / "todo
   mundo achou: a dica foi fácil demais".
3. **De quem era cada carta:** o dono aparece embaixo de cada carta; legenda
   "a carta de **X** enganou 2 pessoas" (até 3 destaques).
4. **Pontos:** os peões andam casa a casa, com "+n" sobre o assento.

A legenda não pula: a caixa fica parada (largura mínima estável) e só o texto
troca com fade. No fim, o **placar da rodada** (no centro, sem cobrir os
assentos): cada jogador com "+n", o total e o motivo ("achou a carta do
narrador +3 · enganou 1 pessoa +1"; "ninguém achou a carta: quem narra não
pontua"), com "ver a mesa" (esconde; uma pílula embaixo traz de volta) e
"próxima rodada"/"ver quem venceu" (host; os outros veem "esperando o host").
Fim de jogo: vencedores, confete na paleta, "jogar de novo"/"voltar pro lobby"
(host).

### 5.4 Protótipo

`prototipo/dixit/` fica no repositório como referência (`launch.json`
"prototipo-dixit", porta 5175). Regras empacotadas de `shared/` em `rules.js`.

### 5.5 Cartas provisórias

Pequenas "pinturas" geradas a partir do id (céu em degradê, sol/lua, colinas,
objetos como árvore, casa, porta, escada, balão, peixe no céu…), na paleta da
identidade; verso com espirais e "dixit". Quando a arte real existir
(`REAL_ART` ligado pelo script da §7), a carta usa
`web/public/dixit/cards/<id>.webp`.

### 5.6 Bots (só em desenvolvimento)

"🤖 adicionar bot" no lobby do Dixit: bots narram com dica aleatória (às vezes
vazia), escolhem e votam com atrasos humanos (40% acham a carta do narrador).
Não vão para o build de produção.

## 6. Identidade visual do Dixit — "conto ilustrado"

Escolhida pelo usuário a partir de mockups (2026-10-15). Tokens escopados na
raiz `.dixit` das telas do Dixit (lobby e mesa).

- **Cores:** fundo verde-floresta `#233D36`, superfície `#2F5046`, creme
  `#F6EAD2` (texto e molduras), mostarda `#F2A541` (acento: dica, voto,
  progresso), texto suave `#B7C7B0`.
- **Fundo:** pinceladas suaves em verdes próximos do fundo (`#26403A`–
  `#2C4A41`) com espirais em mostarda quase transparente.
- **Traço fino em tudo:** molduras em fio creme (~0,75 px) com respiro de
  3 px antes da arte.
- **Tipografia:** DM Serif Display (título, dica, romanos, pontos, legendas);
  Nunito 300/400/600 na interface.
- **Numeração:** romana (I–X) nas cartas da votação.
- **Movimento:** mola subindo; descida suave (nada atravessa o feltro).
- **Voz:** PT-BR informal ("contei", "engane a mesa", "ninguém achou!").
- **Sons (os do ITO, pedido do usuário):** carta pousando na mesa (arquivo da
  carta, bem baixo); escolher carta na mão e clicar pra votar (arquivo da
  carta a 70%, nunca engolido pelo intervalo mínimo); cartas virando e fichas
  de voto ("tic" que sobe de tom); holofote e sua vez de narrar ("plim");
  dono aparecendo ("deslize"); peão andando (estalinho); você pontuou
  (vitória); fim de jogo (vitória/derrota); ação recusada ("tunc"); botões
  (clique). Mesmo botão de som do ITO.

## 7. Arte das cartas (entrega do usuário, depois)

- Formato retrato **2:3** (como a carta original, 80×120 mm); PNG/JPG em
  qualquer tamanho.
- `npm run dixit:cartas <pasta>`: converte para WebP 800×1200 (visualizador)
  + miniatura, renomeia para `d001…`, grava em `web/public/dixit/cards/` e
  atualiza `DIXIT_DECK_SIZE`.
- O script também liga `REAL_ART` em `web/src/games/dixit/art.ts`.
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

1. **Plano D1 — fundação** (PR #5): registro de jogos, sala genérica, regras do
   Dixit em `shared/`, protocolo e servidor aceitando o jogo.
2. **Protótipo da mesa** (`prototipo/dixit/`, feito em 2026-10-16).
3. **Plano D2 — mesa no site** (branch `feat/dixit-mesa`): parte A sem depender
   da estante (cartas, revelação, trilha, sons, componentes, lobby, bots);
   parte B depois que a estante (sessão do ITO) entrar no `main`: o Dixit fica
   jogável no catálogo e o E2E cobre uma rodada.
4. **Depois:** arte real (§7), histórico do Dixit, celular (com o Plano 5).

## 11. Fora de escopo (esta versão)

Histórico/estatísticas do Dixit, arte final, variantes (Odyssey,
votos duplos), chat, celular, cursores ao vivo no Dixit.
