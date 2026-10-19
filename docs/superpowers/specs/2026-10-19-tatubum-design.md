# cartolina~ — Tatubum (design)

Data: 2026-10-19. Mais um jogo do cartolina~, sobre a sala genérica (`server/src/room-do.ts`) e o
prazo de jogo que o Retratim trouxe (`GameModule.nextDeadline`). É a nossa versão do **Exploding
Kittens** (Elan Lee, Matthew Inman, Shane Small), trocando o gatinho explosivo por um **tatu-bola**
enrolado com o pavio aceso.

**Nome:** o jogo se chama **Tatubum** em tudo que o jogador vê. O id interno é `kittens` (`gameId`,
pastas `games/kittens`, classes `.kittens`, `web/public/kittens/`), como DITU/`ito`,
Diquisti/`dixit` e Retratim/`pictures`.

## 1. Objetivo

Jogar Exploding Kittens com os amigos na call (Discord), cada um no seu PC. Todo mundo compra do
mesmo monte, e quem compra o Tatubum sem ter Cafuné explode. Vence quem sobra. Critério de
sucesso: 2 a 8 pessoas jogam uma partida inteira (~15 min) sem travar, e a janela do Nem vem! é
justa pra todos.

Decisões do usuário (2026-10-19):

- **2 a 8 jogadores**, com baralho que cresce com a mesa (§3).
- **Janela do Nem vem! de 5 s**, fixa, sempre corre, mesmo que ninguém tenha Nem vem! (assim a
  demora não entrega quem tem).
- **Escolhas pessoais com 30 s** (Favor, Cafuné, trio, 5 diferentes); acabou o tempo, o servidor
  escolhe ao acaso. **O turno em si não tem tempo.**
- **Ataque acumula** (regra das edições novas, §2).
- **Cartas ilustradas no Google Flow**, uma arte por tipo de carta (§6).
- Identidade **pixel art, paleta "noite no cerrado"** (§5.4). Primeiro foi escolhido o "gibi"
  (entre cerrado, festa junina e gibi); no mesmo dia o usuário trocou pra pixel art (referência: um
  tatu em pixel art de banco de imagens, usado só como estilo) e escolheu a paleta entre "noite no
  cerrado" e "Game Boy".
- **Só computador por enquanto**; celular e **histórico** ficam pra planos depois.
- Motor: **pilha de resolução no servidor com prazo** (§4.2).

## 2. Regras implementadas

### Preparação (ao clicar "começar")

1. Monta o baralho pelo número de jogadores (§3), sem Tatubuns nem Cafunés.
2. Cada jogador recebe **1 Cafuné** e mais **7 cartas** do baralho embaralhado (8 na mão).
3. Entram no monte **2 Cafunés extras** e **um Tatubum a menos que o número de jogadores**; o monte
   é embaralhado.
4. Começa o primeiro assento, com `owed = 1`.

Diferença do original: com 5 jogadores o original põe só 1 Cafuné extra; aqui são sempre 2.

### Turno

Na sua vez você joga **quantas cartas quiser** (inclusive nenhuma), uma de cada vez, e termina
**comprando** a carta do topo. Pular e Ataque terminam o turno sem comprar.

- **Turnos devidos** (`owed`): normalmente 1. Comprar, Pular e Cafuné gastam 1; quando chega a 0, a
  vez passa pro próximo vivo com `owed = 1`.
- Enquanto há **carta no ar** (§4.2), ninguém joga carta nova nem compra; só vale Nem vem!.
- Enquanto há **escolha em aberto**, o jogo espera essa escolha (ou o prazo).
- Cafuné sob ataque (`owed ≥ 2`): gasta 1 turno e você continua jogando os que faltam.

### Cartas

| Carta | Cópias por pacote | Efeito | Aceita Nem vem!? |
|---|---|---|---|
| **Tatubum** | (fora do pacote: vivos − 1) | Quem compra e não tem Cafuné **explode** e sai do jogo. | não |
| **Cafuné** | (fora do pacote: 1 por jogador + 2) | Jogado na hora em que você compra um Tatubum. Você escolhe **em segredo** onde o tatu volta no monte (topo, 2ª, …, fundo, ou aleatório). Gasta 1 turno. | não |
| **Nem vem!** | 5 | Cancela a carta no ar. Pode ser jogado fora da vez, por qualquer vivo (até por quem jogou a carta). Nem vem! em cima de Nem vem! vale. | sim |
| **Ataque** | 4 | Termina seu turno sem comprar. O próximo vivo joga **2 turnos**, ou, se você estava sob ataque (`owed ≥ 2`), **os seus turnos devidos + 2**. | sim |
| **Pular** | 4 | Gasta 1 turno sem comprar. | sim |
| **Favor** | 4 | Escolha um adversário vivo com carta na mão: **ele** escolhe uma carta pra te dar (30 s). | sim |
| **Embaralhar** | 4 | Embaralha o monte (`ctx.rng`). | sim |
| **Espiar** | 5 | Você vê as 3 cartas do topo (ou menos, se o monte tiver menos), só você. | sim |
| **Capivara, Mico-leão, Quati, Tamanduá, Preguiça** | 4 de cada | Sozinhas não fazem nada; só em combo. | (combo sim) |

**Ataque, exemplos:** Ana (normal, `owed = 1`) ataca → Bia joga 2. Bia, no 1º dos 2 turnos, ataca →
Caio joga 4. Caio, no último turno devido (`owed = 1`), ataca → Duda joga 2.

### Combos

Jogados como **uma jogada só** (várias cartas de uma vez); valem com quaisquer cartas, não só os
bichos, e o efeito próprio das cartas é ignorado. Aceitam Nem vem! (que cancela o combo todo).

- **Par** (2 cartas iguais) + alvo com carta na mão: você rouba **uma carta ao acaso** do alvo.
- **Trio** (3 iguais) + alvo + **nome de uma carta** (qualquer tipo menos Tatubum): se o alvo
  tiver, entrega uma; se não, nada.
- **5 diferentes** (5 nomes diferentes): você escolhe (30 s) uma carta do **descarte como estava
  antes desta jogada**. Descarte vazio = nada.

### Fim

- Quem explode sai: o Tatubum e a mão dele ficam **fora do jogo** (não vão pro descarte). Os turnos
  devidos dele se perdem; o próximo vivo começa com `owed = 1`.
- **Sobrou 1 vivo → vence.** Quadro final com "jogar de novo" (nova partida na hora, com quem está
  ativo) e "voltar pro lobby", ações do host.
- Quem explodiu continua vendo a mesa (como espectador) até o fim.

### Presença (tolerância de 30 s, como nos outros jogos)

- Quem cai e volta em até 30 s continua igual. Se for a vez da pessoa, a mesa espera.
- Passados os 30 s, a pessoa é **eliminada** como se tivesse explodido (mão fora do jogo), e **um
  Tatubum sai do monte** se ainda houver mais tatus que `vivos − 1` (mantém a conta do jogo).
  Escolha em aberto dela é resolvida ao acaso antes.
- Carta no ar de quem saiu ainda resolve; se quem jogou ou o alvo não está mais vivo quando ela
  resolveria, a carta só vai pro descarte.
- Quem entra no meio assiste e joga na próxima partida.
- Sobrou 1 vivo (por queda ou explosão) → vence.

O monte nunca acaba enquanto há 2+ vivos, porque sempre tem `vivos − 1 ≥ 1` tatus nele.

## 3. Baralho

Um **pacote** tem 46 cartas: 5 Nem vem!, 4 Ataque, 4 Pular, 4 Favor, 4 Embaralhar, 5 Espiar e 20
bichos (5 tipos × 4).

| Jogadores | Pacotes | Cartas no baralho antes de distribuir | Cafunés | Tatubuns |
|---|---|---|---|---|
| 2–5 | 1 | 46 | n + 2 | n − 1 |
| 6–8 | 2 | 92 | n + 2 | n − 1 |

Com 8 jogadores a mão inicial gasta 56 cartas, por isso 2 pacotes a partir de 6. Com 2 a 5 o
baralho é o do jogo original.

## 4. Arquitetura

### 4.1 Módulo do Tatubum (`shared/src/games/kittens/`)

- `cards.ts`: tipos de carta (`tatubum`, `cafune`, `nemvem`, `ataque`, `pular`, `favor`,
  `embaralhar`, `espiar`, `capivara`, `mico`, `quati`, `tamandua`, `preguica`), nomes em PT-BR,
  quem aceita Nem vem!. Cada carta física tem id próprio `<tipo>-<n>` (ex.: `ataque-3`) pra animar.
- `deck.ts`: `buildDeck(n)` e `deal(...)` (§3).
- `types.ts`: fases `lobby → playing → gameover`. Estado: `players` (ordem dos assentos), `alive`,
  `hands`, `draw` (monte, topo no fim), `discard`, `out` (fora do jogo), `current`, `owed`,
  `pending`, `choice`, `peek`, `log`, `winner`.
  - `pending`: `{ by, play: { kind, cards, target, ask }, nopes: { by, card }[], resolvesAt }`.
  - `choice`: `{ kind: 'cafune' | 'favor' | 'cinco', who, deadline, ... }` (o trio não precisa de
    escolha: o nome vai junto da jogada).
  - `peek`: `{ who, cards }`, apagado na próxima ação de quem espiou ou quando a vez muda.
  - `log`: últimas 30 entradas, com o que cada um pode ler (§4.3).
- Ações (`schema.ts`, zod): `start`, `play { cards: id[], target?, ask? }`, `nope`, `draw`,
  `choose { … }` (posição do tatu, carta do Favor, carta do descarte), `again`, `lobby`.
- `rules.ts`: `applyKittensAction` (valida turno, posse das cartas, combo, alvo) e
  `onPresenceChange` (prazos e presença).
- `resolve.ts`: ao vencer o prazo, **Nem vem! em número par → aplica; ímpar → cancela**. Em ambos os
  casos as cartas jogadas e os Nem vem! vão pro descarte.
- `view.ts`: `viewFor` (§4.3) e `nextDeadline` = o menor entre `pending.resolvesAt` e
  `choice.deadline`.

### 4.2 Pilha de resolução com prazo

1. Uma jogada que aceita Nem vem! entra em `pending` com `resolvesAt = ctx.now + 5000`.
2. `nope` de qualquer vivo com Nem vem! na mão → a carta sai da mão, entra em `pending.nopes`, e
   `resolvesAt = ctx.now + 5000` de novo.
3. O alarme da sala chama `onPresenceChange` com `ctx.now ≥ resolvesAt` → `resolve.ts` aplica.
4. Se o efeito pede escolha (Favor, 5 diferentes), abre `choice` com `deadline = now + 30000`.
5. Comprar, Cafuné e explodir **não** passam pela pilha: acontecem na hora.

A sala genérica não muda: o Retratim já trouxe `ctx.now`, `nextDeadline` e o `now` na mensagem
`state`, que o site usa pra desenhar a barrinha igual pra todos.

### 4.3 Segredos (`viewFor`)

- Sua mão inteira; dos outros, só a **quantidade** de cartas.
- Monte: só a quantidade e quantos tatus ainda estão nele (informação que todos podem deduzir).
- Descarte: público, inteiro.
- `peek`: as cartas só pra quem espiou; os outros leem "Ana espiou o futuro".
- Favor e par: a carta que trocou de mão aparece só pros dois; os outros leem "Caio roubou uma
  carta da Bia".
- Cafuné: a posição do tatu só quem escondeu sabe; os outros leem "Ana escondeu o tatu".
- `choice`: quem escolhe vê as opções; os outros veem quem está escolhendo e o relógio.

### 4.4 Registro, servidor e histórico

- `GAMES.kittens`: `minPlayers: 2`, `maxPlayers: 8`, `liveCursors: false` (um cursor em cima de uma
  carta da mão ou do monte entregaria jogada), `recordsHistory: false`.
- `pendingHistoryRecord` ganha o caso `kittens` → `null` (histórico vem depois, plano próprio).
- Servidor: nada específico; `POST /rooms { game: 'kittens' }` passa a valer pelo registro.

### 4.5 Web (`web/src/games/kittens/`)

- Carregado sob demanda (só quando a sala é do Tatubum), como o Retratim.
- Telas: `KittensLobby`, `KittensTable` (mesa), `GameOver`.
- Peças: `Seats` (adversários com bichinho, nome, nº de cartas, vez, fantasminha de quem explodiu),
  `Pile` (monte, com nº de cartas e de tatus), `Discard`, `InTheAir` (carta no ar + Nem vem! +
  barrinha), `Hand`, `ComboBar` ("jogar par/trio/5"), painéis `CafunePanel`, `FavorPanel`,
  `Pick5Panel`, `AskPicker` (nome da carta do trio), `PeekPanel`, `Boom` (quadro do BUM!), `Log`
  (diário lateral), `Caption` (legenda em quadrinho no topo).
- Bots só em desenvolvimento (`web/src/dev/kittensBots.ts`): jogam cartas ao acaso, às vezes dão Nem
  vem!, sempre compram no fim e escolhem ao acaso.
- `catalog.ts`: nome "Tatubum", `mobile: false`, `playable: false` até o Plano T2.

## 5. Telas

Mesa como palco fixo 1440×900 escalado (padrão do site). Adversários em arco no topo, monte e
descarte no centro, carta no ar entre os dois, sua mão embaixo, diário à direita.

### 5.1 Jogar

- Clicar numa carta da mão levanta a carta; clicar de novo (ou arrastar pro meio) joga.
- Favor e combos pedem o alvo: os adversários válidos ganham contorno e você clica num deles.
- Selecionar 2, 3 ou 5 cartas que formam combo mostra o botão "jogar par / trio / 5". No trio,
  aparece a lista de nomes pra pedir.
- Botão **"comprar"** sempre à vista na sua vez.
- Selo no topo: "vez da Ana · 2 turnos" quando há ataque acumulado.

### 5.2 Carta no ar e Nem vem!

- A carta jogada fica no meio, com legenda ("Caio jogou ATAQUE em você!") e a **barrinha de 5 s**
  esvaziando, igual pra todo mundo.
- Quem tem Nem vem! vê o botão grande vermelho **"NEM VEM! (n)"**, mesmo fora da vez. Quem não tem
  não vê botão.
- Cada Nem vem! empilha em cima da carta, a legenda diz quem deu ("Bia deu Nem vem!") e a barrinha
  recomeça.

### 5.3 Momentos

- **Cafuné:** painel só seu, "Ufa! Onde esconder o tatu?", com topo / 2ª / … / fundo / aleatório.
  Os outros leem "Ana tá escondendo o tatu…".
- **Favor:** o alvo vê a própria mão com "escolhe uma carta pra dar pro Caio" e o relógio de 30 s.
- **Espiar:** painel só seu com as 3 do topo, na ordem.
- **5 diferentes:** painel com o descarte pra escolher.
- **Explodiu:** quadro vermelho com **BUM!** pra todos por ~2 s; a cadeira vira fantasminha.
- **Fim:** quadro "Ana sobreviveu!".

### 5.4 Identidade — pixel art "noite no cerrado"

Cara de videogame retrô: fundo noturno `#1b1b2f` com pontilhado de pixel (`#23233d`), barra do
topo `#0e0e1c`, mesa verde `#2e5a3a` com borda `#0e0e1c`, cartas creme `#f4e9d0` com contorno
`#2b1a10` em **degrau** (sem cantos arredondados, sombra dura deslocada), destaque amarelo
`#f2c14e` (vez, botão comprar), vermelho `#e4572e` (Nem vem!, BUM!, perigo). Tatu em marrom
(`#3b2412` / `#a0703f` / `#c8955a`, focinho e orelha `#e8a0a0`). Títulos e botões em **Press
Start 2P**; textos em **VT323**. A barrinha do Nem vem! são **5 blocos** (um por segundo).
Tudo com `image-rendering: pixelated`. O "BUM!" é uma explosão em 8 bits. Bichinhos do site nos
assentos, em quadradinhos com contorno de pixel.

**Fundo: noite no cerrado desenhada em código** (aprovada pelo usuário num mockup, 2026-10-19;
referência de estilo: tela de menu pixel art de banco de imagens, só o estilo). Um `<canvas>` de
320×180 ampliado sem suavizar, atrás do lobby e da mesa: céu em faixas `#0f1030 → #17204a →
#1f3a6b → #2c5a8c` com pontilhado ordenado (Bayer 4×4) nas transições, estrelas, lua, nuvens de
pixel azul-claras, duas fileiras de árvores tortas do cerrado (copa achatada) em azul-escuro,
cupinzeiros, capim e vaga-lumes amarelos. Animação leve (estrelas piscando, vaga-lumes, nuvens
andando devagar), parada quando a aba não está visível. Semente fixa por sala, pra todos verem o
mesmo cerrado.

**Botões** no estilo da referência: vermelho `#e0605a` com contorno escuro `#1a0f1f`, pontas
chanfradas (hexágono achatado), luz em cima `#f08a80` e sombra embaixo `#b8423e`, texto creme
`#fff3e0` em Press Start 2P com sombra `#8c2f2f`. Logo "TATUBUM" em amarelo `#f2c14e` com
contorno marrom.

**Sons** (baixos, como no Diquisti): papel ao jogar carta, "tic" nos últimos 2 s da barrinha,
"BUM" abafado na explosão, "ronron" no Cafuné.

## 6. Arte das cartas

- **14 ilustrações**: as 13 cartas + o verso. **Pixel art** (sprite de bicho/objeto com contorno
  escuro, poucas cores, fundo liso, como a referência do tatu), sem texto na imagem (o nome da carta
  é desenhado pelo site).
- Geradas no **Google Flow** (mesmo processo do Diquisti, ver `CLAUDE.md`), prompts em
  `docs/kittens/cartas-prompts.md`.
- Script `npm run kittens:cartas -- <pasta>` converte pra `web/public/kittens/cards/<tipo>.webp`.
- Até lá (T1, protótipo e T2), arte provisória: ícone + cor por tipo.

## 7. Erros e casos de borda

- Ação fora da vez, carta que não está na mão, combo inválido, alvo sem carta ou morto, Nem vem!
  sem carta no ar, jogar com carta no ar → erro com mensagem PT-BR, estado inalterado.
- Nem vem! chegando junto com o fim do prazo: vale o que o servidor recebeu antes de resolver
  (ordem do Durable Object).
- Reconexão: a view traz tudo pra redesenhar, inclusive `peek` e `choice` ainda abertos.
- Deploy derruba a sala por alguns segundos → reconecta como nos outros jogos (não fazer deploy em
  noite de jogo).

## 8. Testes

- **`shared/`** (TDD): baralho por número de jogadores (2, 5, 6, 8); distribuição; comprar,
  Cafuné (todas as posições) e explodir; Ataque acumulando (exemplos da §2) e Pular sob ataque;
  Nem vem! par/ímpar, cadeia reiniciando os 5 s, Nem vem! do próprio autor; cada combo (par ao
  acaso, trio com e sem a carta, 5 diferentes com descarte vazio); prazos das escolhas (acaso no
  fim); segredos do `viewFor`; presença (queda < 30 s, eliminação, tatu removido, carta no ar de
  quem saiu); vitória por explosão e por queda; `nextDeadline`.
- **`server/`**: `POST /rooms { game: 'kittens' }`; o alarme resolve a carta no ar.
- **`web/`**: componentes principais com dados de teste; bots.
- **E2E**: partida curta com 3 navegadores pela página do Tatubum, jogando por WebSocket como o
  `e2e/dixit-historico.spec.ts` onde precisar.
- **Manual**: protótipo e bots com 2, 5 e 8 jogadores.

## 9. Ordem de construção

1. **Plano T1 — regras:** módulo em `shared/`, registro, `pendingHistoryRecord`, catálogo com
   "Tatubum · em breve", teste no servidor.
2. **Protótipo** (`prototipo/tatubum/`): só front, regras reais empacotadas (como o do Retratim),
   bots, pra sentir o ritmo dos 5 s e das escolhas.
3. **Plano T2 — mesa no site:** telas, sons, bots, `playable: true`, E2E.
4. **Plano T3 — artes:** prompts, Flow, script e as cartas no site.
5. Depois, cada um no seu plano: **histórico** e **celular**.

**Sessões em paralelo:** o Cama-Leão (`camelio`) está sendo feito em outra worktree e mexe nos
mesmos arquivos compartilhados (`registry.ts`, `catalog.ts`, `history.ts`, `Game.tsx`). Quem
mergear depois resolve o conflito (normalmente só somar as duas entradas).

## 10. Fora de escopo (esta versão)

- Celular.
- Histórico de partidas.
- Expansões (Imploding Kittens, Streaking Kittens etc.) e cartas novas.
- Arte diferente por cópia da mesma carta.
- Tempo de turno.
