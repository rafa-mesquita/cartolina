# cartolina~ — Retratim (design)

Data: 2026-10-17. Terceiro jogo do cartolina~, sobre a base descrita em
`2026-10-15-cartolina-ito-design.md` e na sala genérica do Diquisti
(`2026-10-15-dixit-design.md` §3). É a nossa versão do **Pictures**
(Christian e Daniela Stöhr, PD-Verlag; regras de referência em
<https://rulespal.com/pictures/rulebook>).

**Nome:** o jogo se chama **Retratim** em tudo que o jogador vê. O id interno é
`pictures` (`gameId`, pastas `games/pictures`, classes `.pictures`,
`web/public/pictures/`), como DITU/`ito` e Diquisti/`dixit`.

## 1. Objetivo

Jogar Pictures com os amigos na call (Discord), cada um no seu PC. Na mesa há
16 fotos; cada um recebe uma foto secreta e um kit de material limitado,
remonta a foto do jeito que der, e todo mundo tenta adivinhar qual foto cada um
montou. Critério de sucesso: 3 a 6 pessoas jogam uma partida de 6 rodadas
(~35 min) sem travar, e depois revisitam as obras no museu do histórico.

Decisões do usuário (2026-10-17):

- **3 a 6 jogadores, 6 rodadas.** Os kits giram: cada um usa cada kit uma vez e
  ninguém divide kit na mesma rodada.
- **As fotos usadas são trocadas a cada rodada** (decisão do usuário,
  2026-10-17, que substitui a anterior "grade de 16 fotos fixa a partida toda"):
  ao começar a rodada seguinte, cada coordenada que foi a foto secreta de alguém
  ganha uma foto **aleatória** do baralho, de qualquer tema (as duplas não se
  mantêm, de propósito, pra ficar imprevisível), nunca uma que já apareceu na
  partida (§2). **Foto secreta pode repetir** (saquinho de 48 fichas, 3 por
  coordenada), como o original.
- **6 kits:** os 5 do original (cubos com grade **4×4**, blocos em **3D**) + o
  kit novo **pontos e linhas**. Quantidades do original (§3).
- **Obras escondidas** enquanto montam; só aparece a atividade de cada um.
- **Tempo:** sem teto. Quando **metade da mesa, arredondando pra cima**, está
  pronta, quem falta tem **30 s**. A mesma regra vale na fase de palpite.
- **Palpites numa galeria** com todas as obras de uma vez; depois **revelação
  narrada**, uma obra por vez.
- **Pontuação igual à do original.**
- **Histórico** como o do Diquisti + **museu** das obras.
- Identidade **"álbum de fotos"** (§5.5). **100 fotos realistas** geradas no
  Google Flow, começando por um lote de teste (§6).
- **Só computador por enquanto**; celular fica pra depois.

## 2. Regras implementadas

### Preparação (ao clicar "começar")

- 3 a 6 jogadores na ordem dos assentos.
- O servidor sorteia **16 fotos** do baralho (**8 temas × 2 fotos**, §6.4) e monta a grade 4×4 com
  coordenadas **A–D** (colunas) × **1–4** (linhas). Essas 16 entram na lista de fotos já vistas
  (`shown`).
- **Saquinho** com 48 fichas (cada coordenada 3 vezes). Cada ficha tirada sai do
  saquinho pela partida inteira (6 × 6 = 36 ≤ 48, então nunca falta).
- **Rodízio de kits:** na rodada `r` (0–5), o jogador no assento `i` usa o kit
  `(i + r) mod 6`. Com ≤ 6 jogadores ninguém repete kit e ninguém divide kit
  na rodada.

### Rodada

1. **Montar** (`building`): cada um tira uma ficha (sua coordenada secreta) e
   monta com o kit da rodada. O navegador manda o **rascunho** ao servidor a
   cada ~2 s (e na hora de "pronto"). Botão **"pronto"** (dá pra desfazer
   enquanto a fase não fechou). Quando `ceil(n/2)` jogadores ativos estão
   prontos, começa a contagem de **30 s**. A fase fecha quando todos estão
   prontos ou a contagem acaba; a obra de cada um congela no último rascunho
   recebido.
2. **Palpitar** (`guessing`): galeria com as obras dos outros (a sua não
   aparece pra você). Pra cada obra você escolhe uma coordenada; pode trocar até
   **"confirmar"** (e **"desconfirmar"** volta atrás enquanto a fase não fecha; a
   contagem que já começou continua). Obra sem palpite vale zero. A mesma coordenada pode ir em
   mais de uma obra. Mesma regra de tempo: `ceil(n/2)` confirmados → 30 s pra
   quem falta. Quando o tempo acaba, valem os palpites já colados, confirmados
   ou não.

Contagem já disparada não para se alguém desmarca "pronto". O host tem
**"apressar"**: dispara os 30 s na hora (pra quando alguém some sem cair).
3. **Revelar** (`reveal`): uma obra por vez, na ordem dos assentos (§5.3).
   Depois, placar da rodada com todas as obras ao lado das fotos verdadeiras
   (clicar no palpite de alguém abre a foto em que a pessoa votou); o host
   clica **"próxima rodada"**.
4. **Troca das fotos usadas** (decisão do usuário, 2026-10-17; substitui a
   grade fixa): ao começar a rodada seguinte, cada coordenada que foi a foto
   secreta de alguém na rodada que passou recebe uma foto aleatória do baralho
   (`ctx.rng`), de qualquer tema, sem manter as duplas. A foto nova nunca é uma
   que já apareceu na grade nesta partida (`shown`); se acabarem as nunca
   usadas, vale qualquer uma que não esteja na grade agora. Coordenada que foi
   segredo de duas pessoas troca uma vez só; as outras casas ficam como estão.
   No fim do jogo nada é trocado. O resultado da rodada guarda a grade daquela
   rodada (`result.grid`, antes da troca), pro histórico e o museu.

Obra **em branco** (o jogador nunca mandou rascunho): não entra na galeria e o
artista não ganha pontos de artista naquela rodada. Ele ainda palpita.

### Pontuação (regra do original)

- **+1** pra cada obra que você acertou.
- **+1** pro artista por cada pessoa que acertou a obra dele.
- Sem bônus nem penalidade.

### Fim

- Depois da 6ª rodada: placar final. Mais pontos vence; empate = vários
  vencedores.
- "Jogar de novo" começa outra partida na hora com quem está ativo (grade e
  saquinho novos); "voltar pro lobby" é outra ação do host.

### Presença (tolerância de 30 s, como no ITO e no Diquisti)

- Quem cai volta pro mesmo estado (inclusive o próprio rascunho, que o servidor
  guardou).
- Quem sai de vez continua no placar; nas rodadas seguintes não monta nem
  palpita, e a contagem de "metade da mesa" considera só os ativos.
- Quem entra no meio da partida espera a próxima, como no Diquisti.
- Quem é da partida e volta **durante a montagem** entra na rodada na hora
  (tira ficha, recebe o kit do assento). No palpite, só espera a próxima.
- Com < 3 ativos a fase pausa, como no Diquisti; "apressar" não vale em pausa.
  "Próxima rodada" só vai com pelo menos 3 da partida ativos.
- Se a montagem fecha sem nenhuma obra, pula direto pra revelação (vazia).

## 3. Kits

Base comum: a obra é montada numa **folha do álbum** em 4:3 (igual às fotos).
Coordenadas guardadas **relativas à folha** (0–1), pra desenhar em qualquer
tamanho. Peça fora da folha não conta. Cada kit tem, em `shared/`, o tipo da
obra e uma validação (quantidade e limites); no `web/`, um componente
**montar** e um **mostrar** (o mesmo na galeria, na revelação e no museu).

| Kit | Material | Interação (protótipos de 2026-10-17) | Obra salva |
|---|---|---|---|
| `cubes` | 24 cubos, **3 de cada uma das 8 cores**, grade **4×4** | Escolhe a cor e clica na casa. A paleta mostra quantos restam de cada cor. **Não precisa preencher tudo** (decisão do usuário, 2026-10-17, diferente do original): com pelo menos 1 cubo já dá pra ficar pronto; grade vazia é obra em branco. | `cells: (cor \| null)[16]` |
| `laces` | 1 cadarço **longo** + 1 **curto** | Física da v3: o ponto pego arrasta um **trecho** em volta (janela com queda suave, tamanho fixo, padrão 9 pontos de 160); o resto só se move quando a corda estica; comprimento constante. Pontos de pegar invisíveis; o trecho aparece destacado ao passar o mouse. | 2 polilinhas, ~40 pontos cada |
| `sticks` | **4 palitos + 4 pedras** | Arrasta pra mover; clicar mostra a **alça azul** de girar; rodinha gira 15°. A última peça clicada fica **por cima**, e a obra guarda essa ordem (o print desenha igual). | `{x, y, giro}[]` + `order` |
| `blocks` | **6 blocos** de madeira: cubo, tijolo, prancha, pilar, telhado, arco | three.js. Arrastar move sobre a mesa; a peça **sobe em cima** do que está embaixo. Ao soltar, **menu flutuante** junto da peça: girar ↺/↻ (15°) e deitar/levantar. **Sem botões fora da cena**: legendas no canto explicam (arraste a peça pra mover, rodinha gira a mesa, arraste o fundo pra inclinar). **O ângulo da câmera faz parte da obra.** | `{forma, x, y, z, giro, deitado}[]` + câmera `{θ, φ}` |
| `icons` | **20 cartas de ícone** (as 19 do original + **vento**, pedido do usuário em 2026-10-18) | Escolhe de **2 a 5** e arrasta pra ordenar lado a lado. Começa com ícones Tabler (MIT); depois podem virar ícones com cara de álbum. "Pronto" com menos de 2 avisa. | `ids[]` em ordem |
| `dots` | **5 pontos** e linhas | Clique na folha põe ponto (até 5); clique num ponto e depois em outro liga/desliga a linha (livre, no máx. 10); arrastar move; clique duplo apaga. Folha vazia (não por cima da foto). | `pontos[]`, `linhas: [i, j][]` |

Os blocos guardam `y` (a altura calculada na montagem), então quem mostra não
precisa refazer o empilhamento.

## 4. Arquitetura

### 4.1 Módulo do Retratim (`shared/src/games/pictures/`)

- `types.ts`: fases `lobby → building → guessing → reveal → (building |
  gameover)`; estado com `players`, `inRound`, `scores`, `round`, `grid` (16
  ids de foto da rodada), `shown` (fotos que já apareceram na partida; não vai
  pra visão), `bag` (fichas restantes), `secrets` (coordenada por jogador),
  `kits` (kit por jogador na rodada), `works` (rascunho/obra por jogador),
  `ready`, `guesses` (palpiteiro → artista → coordenada), `confirmed`,
  `countdownEndsAt`, `result` (resultado da rodada pra animar, com a `grid`
  daquela rodada), `winners`,
  `paused`.
- Ações: `start`, `draft { work }`, `ready { on }`, `guess { artist, coord |
  null }`, `confirm`, `unconfirm`, `hurry` (host), `next`, `again`, `lobby`.
- `works.ts`: schema zod da obra de cada kit (`workSchema`), `workError`
  (regras que o schema não pega → `bad_work`), `readyError` (o que impede
  "pronto") e `isBlankWork` (obra que não mostra nada conta como em branco).
- `rotation.ts`: rodízio de kits; `bag.ts`: saquinho; `grid.ts`: sorteio da
  grade (`drawGrid`) e troca das fotos usadas (`refreshGrid`); `scoring.ts`: `scorePicturesRound(...)` pura; `rules.ts`:
  `applyPicturesAction` + `settlePictures`; `view.ts`: visão e prazo;
  `schema.ts`: ações.
- `photos.ts`: `PICTURES_DECK` (ids `p001…p100` + tema), `PICTURES_THEMES` (50 slugs) e
  `PICTURES_THEME_NAMES` (nome em português).

### 4.2 Mudanças na base

Duas coisas que a sala genérica ainda não tem:

1. **Tempo controlado pelo servidor.** `GameContext` ganha `now`, e
   `GameModule` ganha `nextDeadline?(state): number | null`. `nextAlarmAt` da
   sala passa a considerar o prazo do jogo. O alarme do Durable Object já chama
   `tick` → `onPresenceChange`, que agora recebe `now` e fecha a fase quando
   acabam os 30 s (não precisa de um `onDeadline` separado). ITO e Diquisti não
   implementam `nextDeadline` e não mudam.
2. **Histórico genérico.** Hoje `pendingRecord` é do ITO. Passa a ser um hook
   do registro (`historyRecord?(state)` devolvendo chave + registro), com tabela
   própria por jogo. O histórico do Diquisti (brainstorming em pausa) precisa da
   mesma coisa; quem chegar primeiro faz a generalização e o outro reaproveita.

`GAMES.pictures`: `minPlayers: 3`, `maxPlayers: 6`, `liveCursors: false` (um
cursor na foto entregaria o palpite), `recordsHistory: true` a partir do
Plano R4 (no R1 fica `false`). Os selinhos ("montando…", "pronto ✓",
"palpitando…", "confirmou ✓") saem só da visão; o Retratim não usa
`fx.activity` (decidido no Plano R2).

### 4.3 Segredos (`viewFor`)

- `building`: você vê sua coordenada, seu kit e seu rascunho; dos outros, só
  kit, pronto/não pronto e atividade. Ninguém vê obra alheia.
- `guessing`: você vê as obras dos outros (sem a coordenada) e os seus
  palpites; dos outros, só quem confirmou.
- `reveal`/`gameover`: tudo.

### 4.4 Servidor (`server/`)

- `POST /rooms { game: 'pictures' }` como os outros jogos.
- Rascunho limitado em tamanho pelo próprio schema (cadarço ≤ 60 pontos etc.,
  ~5 KB no pior caso). Sem limite de frequência no servidor (Plano R2): o
  site manda rascunho no máximo a cada 2 s e o "pronto" leva a obra junto
  (`ready { on: true, work }`), então o último rascunho nunca se perde.
- A mensagem `state` leva `now` (hora do servidor) pra contagem de 30 s não
  depender do relógio do PC.
- Grava a rodada no D1 uma vez, no fim da revelação (idempotente, mesma lógica
  de `recordedRevealKey`), na tabela da §7.1.
- `GET /history/pictures` público, no-cache, mesmo limite por IP dos outros.

### 4.5 Web (`web/src/games/pictures/`)

- `kits/<kit>.ts` por kit, **imperativos** (DOM/SVG/canvas/WebGL, portados do
  protótipo) com o contrato `build(el, obra, onChange) → {destroy}` /
  `show(el, obra)`; o React os embrulha em `KitBench` (montagem) e `KitShow`
  (galeria, revelação, museu).
- `blocks` carrega o three.js com `import()` só quando alguém pega o kit ou
  abre uma obra 3D. Se falhar: aviso + "tentar de novo".
- Telas: `PicturesLobby`, `PicturesTable` (fases), `Building`, `Gallery`,
  `RevealStage`, `RoundScore`, `GameOver`; o jogo inteiro é carregado sob
  demanda (só quando a sala é do Retratim).
- Bots só em desenvolvimento (como no Diquisti), montando obras aleatórias
  válidas e palpitando ao acaso.

## 5. Telas

### 5.1 Montar

Página do álbum: grade 4×4 de fotos com coordenadas na borda (a **sua** foto
com um contorno pontilhado em tinta azul, só pra você). Ao lado: cartão
"sua foto secreta **B3**" com fitinha, a **bancada** (folha 4:3 com o kit) e
o botão "estou pronto". No topo: "Retratim · rodada 2 de 6 · kit: palitos e
pedras" e os selinhos de cada um ("Ana pronta", "Caio mexendo…"), sempre com
os **pontos à vista** (número grande ao lado do nome; pedido de 2026-10-18). Quando a
contagem dispara, todos veem o relógio ("faltam 0:24").

### 5.2 Palpitar (galeria)

Grade de fotos de um lado, obras dos outros em molduras do outro. Palpite com
**adesivos** (decisão do usuário, 2026-10-17, aprovada num mockup; substitui a
"fitinha B3" colada na obra): cada obra vem com um **adesivo redondo com o
bichinho do artista** (círculo branco, sombrinha) num lugar marcado da moldura.
**Arrastar o adesivo** até uma foto cola o adesivo na foto (pequeno, no canto;
vários empilham) e manda o palpite; enquanto arrasta, o adesivo segue o
ponteiro um pouco maior e a foto embaixo ganha contorno azul tracejado. De uma
foto pra outra troca; de volta pra moldura (ou solto fora da grade) tira o
palpite. Na moldura fica a **sombra apagada do adesivo** (opacidade 0,3), pra
não perder de vista de quem é cada obra, com "você acha que é a **B3**" ou
"sem palpite"; clicar na sombra também tira. Sem arrastar: clique no adesivo
(contorno azul) e depois na foto, ou letra + número no teclado (Delete tira).
Sem adesivo na mão, clicar na foto amplia. Depois de confirmar nada se
arrasta, até "desconfirmar". Obras 3D aparecem **fixas no ângulo do artista**; uma lupa abre
qualquer obra grande. "Confirmar" vale com obra sem palpite. Selinho de quem
confirmou.

### 5.3 Revelação narrada (avança sozinha, ritmo do Diquisti)

Pra cada obra: (1) a obra cresce no centro da página; (2) aparecem as fitinhas
de cada um com o bichinho de quem palpitou; (3) a foto verdadeira **descola da
grade** e vem pra perto da obra (clique de câmera baixinho); fitinhas certas
ganham ✓, erradas ficam acinzentadas; (4) os pontos sobem. No fim, placar da
rodada com o ganho de cada um; o host clica "próxima rodada".

### 5.4 Protótipo

Antes da mesa de verdade, um protótipo só de front com bots
(`prototipo/retratim/`), como o do Diquisti, pra sentir montar → galeria →
revelação. Os 6 kits dos protótipos desta conversa são o ponto de partida.

### 5.5 Identidade — "álbum de fotos"

Página de álbum em papel kraft (paleta da cartolina: `#eadbc0`, `#f6eedd`,
borda `#d3bf99`, tinta `#3b2f2f`), fotos com **borda branca** e sombrinha de
papel, **fitinha** colada no cartão da foto secreta, título manuscrito (Caveat
no mockup), destaque em **tinta azul** `#2f5aa8`. Bichinhos dos outros jogos
mantidos.

**Sons** (mais baixos que o DITU, como no Diquisti): papel e fita ao colar
palpite, clique de câmera na revelação, "plim" suave nos pontos.

## 6. Fotos

### 6.1 Estilo

Fotos **realistas**, nada surreal: cara de foto de celular, luz natural, leve
granulado, enquadramento casual, sem texto, **4:3 deitado**. Pessoas só de
mãos ou de costas (rosto gerado costuma sair estranho).

### 6.2 Temas

100 fotos em **50 temas de 2 fotos** (decisão do usuário, 2026-10-17; com mais
fotos por tema elas ficavam parecidas demais). Cada tema é uma "dupla parecida",
às vezes uma pegadinha (bandeirinha de escanteio × bandeirinha de festa junina):
p001+p002 são o 1º tema, p003+p004 o 2º, e assim por diante. A tabela com os
temas e as fotos está em `docs/pictures/fotos-prompts.md`; no código, os temas são
slugs ASCII (`cachorro`, `chao-da-mata`, `onibus`…) com o nome bonito em
`PICTURES_THEME_NAMES`.

### 6.3 Geração

- Prompts em `docs/pictures/fotos-prompts.md`, com o sufixo de estilo fixo.
- Google Flow, **uma opção por prompt**.
- **Lote de teste primeiro:** 8 fotos (uma por tema + uma). O usuário aprova a
  qualidade antes do resto.
- `npm run pictures:fotos -- <pasta>` (`scripts/pictures-fotos.mjs`, como
  `dixit:cartas`): lê `p001…p100` (.jpg/.png/.webp), recorta no centro pra 4:3
  exato e grava em `web/public/pictures/fotos/` a foto cheia `pNNN.webp`
  (1200×900, WebP q75: zoom e revelação) e a miniatura `pNNN-thumb.webp`
  (480×360, q75: grade e galeria). Também gera
  `web/src/games/pictures/photos-ready.ts` (o `Set` dos ids importados; foto fora
  dele usa a provisória, sem 404). Falha se faltar foto. As 100 dão **15,9 MB**
  (12,7 MB cheias + 3,2 MB miniaturas).

### 6.4 Sorteio da grade

**8 temas sorteados × 2 fotos** (as duas do tema), embaralhadas na grade: 16
fotos, 8 duplas parecidas. Baralho com menos de 8 temas de 2 fotos → erro.

Isso vale só pra **grade inicial**. Da 2ª rodada em diante, as casas que foram
segredo de alguém ganham fotos aleatórias de qualquer tema (§2, decisão do
usuário em 2026-10-17, que substitui a grade fixa): as duplas vão se
desfazendo de propósito.

## 7. Histórico e museu

### 7.1 Gravação

Tabela nova no D1, só do Retratim (migração própria; as tabelas do DITU não
mudam). Uma linha por rodada, gravada uma vez no fim da revelação: sala, id da
partida (sala + momento do "começar"), data, número da rodada, as 16 fotos da
grade **daquela rodada** (`result.grid`; a grade muda de rodada pra rodada), e por jogador: nome e bichinho daquele momento, coordenada, foto, kit,
**obra (JSON)**, palpites dados, pontos ganhos e placar depois da rodada.
Partida terminada = chegou à 6ª rodada. Sem login, sem apagar.

### 7.2 Aba "histórico"

1. **Partidas:** mais novas primeiro, 20 por página + "carregar mais"; data,
   rodadas jogadas, vencedor ou "não terminou", bichinhos com placar. Abrir
   uma partida mostra **o álbum dela**: uma página por rodada, cada obra ao
   lado da foto original, com quem acertou.
2. **Estatísticas da galera** (top 3 com bichinho): **quem mais acerta**
   (% de palpites certos, mín. 10 palpites); **artista mais entendido**
   (% médio de acertos nas suas obras, mín. 3 obras); **melhor com cada kit**
   (mais entendido por kit, mín. 2 obras); **foto mais difícil** (menor % de
   acerto, mín. 3 aparições como foto secreta).
3. **Museu:** obras mais recentes (24 por página), filtro por kit, e duas
   vitrines: **obras-primas** (todos acertaram) e **ninguém entendeu** (zero
   acertos).

Os números mínimos são ponto de partida.

## 8. Erros e casos de borda

- Ação fora da fase, palpite na própria obra, coordenada inválida → erro com
  mensagem PT-BR, estado inalterado.
- Rascunho inválido ou grande demais → `bad_work`, servidor mantém o anterior.
- Reconexão: a `View` traz tudo pra redesenhar a fase, inclusive seu rascunho
  e seus palpites ainda não confirmados.
- Queda de vez durante a montagem → vale o último rascunho; nenhum → obra em
  branco (§2).
- Deploy derruba a sala por alguns segundos → reconecta como nos outros jogos
  (e não fazer deploy em noite de jogo).
- three.js não carrega → aviso com "tentar de novo".

## 9. Testes

- **`shared/`:** rodízio de kits (sem repetição em 3–6 jogadores), saquinho
  (36 tiradas sem faltar, repetição possível), regra da metade arredondada pra
  cima + 30 s nas duas fases, `scorePicturesRound` (ninguém/alguns/todos acertaram,
  obra em branco), validação de cada kit, segredos do `viewFor` por fase,
  presença (queda com rascunho, saída de vez, < 3 ativos), troca das fotos
  usadas (só as secretas, sem repetir foto já vista, uma vez por casa, nada no
  fim), fim e empate.
- **Base:** prazo do jogo no alarme (`nextDeadline`); ITO e
  Diquisti sem mudança de comportamento.
- **`server/`:** `POST /rooms { game: 'pictures' }`, limite de rascunho,
  gravação idempotente no D1, `GET /history/pictures`.
- **`web/`:** cada `Show` desenha uma obra a partir do JSON; a corda mantém o
  comprimento depois de puxões.
- **E2E:** uma rodada com 3 jogadores pela página do Retratim, travando o
  deploy junto com o do DITU.
- **Manual:** protótipo e bots com 3 e 6 jogadores.

## 10. Ordem de construção

1. **Lote de teste das fotos** (pode correr em paralelo com o resto).
2. **Protótipo** (`prototipo/retratim/`) com os 6 kits, galeria e revelação.
3. **Plano R1 — regras e base** (feito,
   `docs/superpowers/plans/2026-10-17-plano-r1-retratim-regras.md`): módulo em `shared/`, prazo do jogo na sala,
   servidor aceitando `pictures`.
4. **Plano R2 — mesa no site** (feito, `docs/superpowers/plans/2026-10-17-plano-r2-retratim-mesa.md`): kits
   (montar/mostrar), telas, sons, bots, catálogo jogável, E2E.
5. **Plano R3 — fotos** (feito): 100 prompts, geração, baralho de 50 temas × 2,
   grade 8 × 2, script `pictures:fotos` e as fotos no site (miniatura + cheia).
6. **Plano R4 — histórico e museu** (com o hook de histórico genérico).

## 11. Fora de escopo (esta versão)

- Celular.
- Baixar a página do álbum como PNG pro Discord.
- Grade toda nova por rodada (só as fotos que foram secretas trocam, §4) e impedir foto secreta repetida na mesma
  rodada (revemos depois de jogar).
- Pacote de fotos da galera (upload).
- Kits extras (tangram, pixel 2 cores, traço único).
- Ícones próprios com cara de álbum (começa com Tabler).
