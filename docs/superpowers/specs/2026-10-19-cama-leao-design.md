# cartolina~ — Cama-Leão (design)

Data: 2026-10-19. Quarto jogo do cartolina~, sobre a base da sala genérica
(`2026-10-15-dixit-design.md` §3) e do histórico por jogo
(`2026-10-17-diquisti-historico-design.md`). É a nossa versão do **Camelio**
(Paolo Bianchi, Little Rocket Games, 2025; no Brasil, Bucaneiros Jogos).
Referências das regras: <https://rulespal.com/camelio/rulebook>,
<https://boardgamematcher.com/game/camelio> e o vídeo da Laranjogos que o Rafa
mandou (edição brasileira, "2 a 6 jogadores").

**Nome:** o jogo se chama **Cama-Leão** em tudo que o jogador vê. O id interno é
`camelio` (`gameId`, pastas `games/camelio`, classes `.camelio`,
`web/public/camelio/`, tabela `camelio_matches`), como DITU/`ito`,
Diquisti/`dixit` e Retratim/`pictures`.

## 1. Objetivo

Jogar Camelio com os amigos na call (Discord), cada um no seu PC. É um jogo de
cartas de blefe e "forçar a sorte": cada um tenta juntar **exatamente 5 esferas**
de uma cor; quem passa de 5 perde as cartas da cor. Na sua vez você pega uma carta
(a aberta ou a do monte, que só mostra metade da informação) e decide, **antes de
virar**, se fica com ela ou se dá pra alguém. Critério de sucesso: 2 a 6 pessoas
jogam uma partida (~15–20 min) sem travar, e a partida aparece no histórico.

Decisões do usuário (2026-10-19):

- **Sem dicas, sem palavra:** é o Camelio de cartas, não o *The Chameleon*.
- **Distribuição do baralho inventada** (não achamos a oficial; o BGG pede
  verificação anti-robô e as lojas não dizem): 6 cores, proposta da §2.1. Ajusta
  depois de jogar o protótipo.
- **Fim com 5–6 jogadores = igual a 3–4** (pontos em 3 cores).
- **Cor já pontuada:** chegou a 5 **ou passou**, perde o ponto e descarta tudo dela.
- **Nome na tela:** Cama-Leão.
- **Primeira versão:** mesa no computador + **histórico**. Celular fica pra depois.
- **Identidade "circo"** (§5.1).
- **Gesto:** arrastar a carta até a mesa de quem recebe (a sua inclusive); clique
  como alternativa.
- **Abordagem:** regras primeiro (com testes), depois protótipo com bots usando as
  regras reais, depois a mesa no site, depois o histórico (§8).

## 2. Regras implementadas

### 2.1 Baralho (72 cartas, 6 cores)

Cores, na ordem do círculo: `verde`, `amarelo`, `laranja`, `vermelho`, `roxo`,
`azul`. Cada carta tem **cor** e **esferas** (1 a 4) na frente; o verso depende do
tipo:

| Tipo | Quantas | Verso mostra | Distribuição |
|---|---|---|---|
| Normal | 36 (6 por cor) | a cor | esferas 1, 1, 2, 2, 3, 4 em cada cor |
| Bicolor | 24 (4 por par) | esferas + as 2 cores possíveis | 6 pares de cores vizinhas no círculo (verde-amarelo, amarelo-laranja, laranja-vermelho, vermelho-roxo, roxo-azul, azul-verde); no par (A, B): 1→A, 2→A, 2→B, 3→B |
| Multicolor | 12 (2 por cor) | esferas + "qualquer cor" | esferas 1 e 2 em cada cor |

Cada cor soma 24 esferas (13 normais + 8 bicolores + 3 multicolores). Cada carta
tem um id estável (`0..71`) numa tabela fixa em `shared/src/games/camelio/deck.ts`.

### 2.2 Preparação (ao clicar "começar")

- 2 a 6 jogadores, na ordem dos assentos.
- O servidor embaralha as 72 cartas (`ctx.rng`) num monte e vira a do topo: essa é
  a **carta aberta**.
- **Quem começa:** na primeira partida da sala, sorteado. No "jogar de novo",
  quem ficou em último (menos pontos; empate: menos esferas na mesa; empate: o
  primeiro na ordem dos assentos depois do vencedor).
- Meta: pontos em **4 cores com 2 jogadores**, **3 cores com 3 a 6**.

### 2.3 A vez

Uma ação: `play { from: 'open' | 'deck', to: jogadorId }`.

1. A carta escolhida (a aberta ou a do topo do monte) é revelada e vai pra **área
   de jogo** de `to` (pode ser você mesmo). `to` tem que ser um jogador da partida
   que esteja ativo.
2. Resolve **na hora**, só na cor da carta, na mesa de `to` (`s` = soma das
   esferas daquela cor na área de jogo):
   - cor **ainda não pontuada** e `s == 5` → **fechou**: +1 ponto nessa cor; as
     cartas da cor vão pra **área de pontos** de `to`;
   - cor **ainda não pontuada** e `s > 5` → **estourou**: as cartas da cor na área
     de jogo vão pro **descarte**;
   - cor **já pontuada** e `s >= 5` → **perdeu o ponto**: as cartas da cor na área
     de jogo **e** na área de pontos vão pro descarte, e o ponto sai;
   - senão → nada, a carta fica na mesa.
3. Se a carta usada foi a aberta, a do topo do monte vira a nova aberta.
4. Se `to` chegou à meta, a partida **acaba na hora** e `to` ganha (mesmo que não
   seja quem jogou). A meta vem antes do fim do monte.
5. **Monte vazio** (depois dos passos 3 e 4): se ainda não houve reembaralho e o
   descarte tem cartas, o descarte é embaralhado e vira o monte novo (uma vez só
   por partida). Se não, a partida **acaba por fim do monte** (§2.4). Assim, no
   começo de toda vez existem a carta aberta e pelo menos uma carta no monte.
6. A vez passa pro próximo ativo no sentido dos assentos.

Os pontos são no máximo 1 por cor, então "pontos em N cores" = "N pontos".

### 2.4 Fim

- **Meta:** quem chega à meta ganha sozinho.
- **Fim do monte:** ganha quem tem mais pontos; empate → mais esferas na área de
  jogo (em cores ainda não pontuadas); empate → vitória dividida (`winners` com
  mais de um).
- Fim de jogo mostra o placar e o botão "jogar de novo" (host) e "voltar pro
  lobby", como no Diquisti.

### 2.5 Presença

- Quem cai (depois dos 30 s de tolerância da base) tem a vez **pulada**; a área
  dele fica na mesa e ninguém pode dar carta pra ele enquanto estiver fora. Se a
  vez era dele, ela passa pro próximo ativo.
- **Menos de 2 ativos:** a partida **pausa** até alguém voltar (como o Diquisti
  pausa com menos de 3). O host pode voltar pro lobby.
- Quem entra no meio da partida assiste; joga a partir da próxima.

### 2.6 O que cada um vê (`viewFor`)

Tudo é aberto, menos o **topo do monte**. A view manda só o verso dele:

```ts
type CamelioBack =
  | { kind: 'normal'; color: CamelioColor }
  | { kind: 'bicolor'; spheres: number; colors: [CamelioColor, CamelioColor] }
  | { kind: 'multi'; spheres: number };
```

A view também traz: a carta aberta (frente), o tamanho do monte e do descarte, se
já houve reembaralho, as áreas de jogo e de pontos de cada um, a vez, a meta, a
última jogada (pra animar) e, no fim, os vencedores e o motivo. O cursor ao vivo
fica **ligado** (`liveCursors: true`): não há nada escondido que ele entregue.

### 2.7 Ações e erros

`start` (host, no lobby, 2 a 6 ativos), `play`, `again` (host, no fim),
`lobby` (host). O servidor recusa com erro curto:

- `not_your_turn`: jogar fora da vez (inclui duas jogadas quase ao mesmo tempo: a
  primeira vale);
- `bad_target`: `to` fora da partida ou inativo;
- `not_playing`: jogar fora da fase de jogo ou com a partida pausada;
- `not_host`, `bad_phase`, `not_enough_players`: como nos outros jogos.

A tela nem deixa arrastar nesses casos; a recusa é a rede de segurança.

## 3. Estado (`shared/src/games/camelio/types.ts`)

```ts
type CamelioPhase = 'lobby' | 'playing' | 'over';

interface CamelioState {
  phase: CamelioPhase;
  players: string[];            // ordem dos assentos no início
  deck: number[];               // ids; topo = último
  open: number | null;
  discard: number[];
  reshuffled: boolean;
  table: Record<string, number[]>;   // área de jogo
  scored: Record<string, number[]>;  // área de pontos (cartas guardadas)
  turn: string | null;
  target: number;               // 4 com 2 jogadores, 3 com 3 a 6
  paused: boolean;
  log: CamelioPlay[];           // toda jogada da partida (animação + histórico)
  winners: string[];
  endReason: 'target' | 'deck' | null;
  match: number;                // 0 no lobby, +1 a cada start/again
}

interface CamelioPlay {
  by: string;
  from: 'open' | 'deck';
  to: string;
  card: number;
  outcome: 'none' | 'scored' | 'bust' | 'lost';
  color: CamelioColor;
  /** Esferas da cor na mesa de `to` depois da carta (antes de descartar). */
  sum: number;
}
```

Pontos de um jogador = cores distintas em `scored[id]`. As funções de cálculo
(`sumByColor`, `pointsOf`, `resolvePlay`, `finalRanking`) ficam puras e testadas.

## 4. Servidor

Nada específico por jogo: `room-do.ts` já é genérico. O Cama-Leão entra no
registro (`GAME_IDS`, `GAMES.camelio` com `minPlayers: 2`, `maxPlayers: 6`,
`liveCursors: true`, `recordsHistory` falso até o C4) e o `POST /rooms` aceita
`{ game: 'camelio' }`. Teste do servidor: uma sala de verdade com 2 jogadores
jogando até o fim.

## 5. A mesa (web)

### 5.1 Identidade "circo"

Escolhida num mockup lado a lado (savana, circo, terrário):

- fundo creme `#f7efe0` com **listras de lona** (`#f3dcd2`) no picadeiro;
- vermelho de circo `#c8372d` (logo, botões, destaques) e azul-marinho `#1f2a4a`
  (texto, verso das cartas);
- fonte de letreiro **Rye só no logo "Cama-Leão"** (como o Caveat do Retratim);
  todo o resto em **Fredoka**;
- esferas: verde `#4caf50`, amarelo `#f2c230`, laranja `#f08a24`, vermelho
  `#e04848`, roxo `#8e5cc7`, azul `#3a8fd8`, sempre com o nome da cor no
  `title`/`aria-label` (não depender só da cor);
- versos: normal = a cor com textura de escamas; bicolor = diagonal com as 2 cores
  e as esferas num círculo; multicolor = as 6 cores em faixas e as esferas num
  círculo.

### 5.2 Disposição

Palco fixo 1440×900 escalado, como as outras mesas:

- **No alto**, em semicírculo, as mesas dos outros: nome, personagem, pontos como
  bandeirinhas da cor fechada, e as pilhas por cor (cartas levemente sobrepostas,
  soma "3/5" embaixo; "4/5" em destaque).
- **No meio**, o picadeiro com o monte (verso do topo à mostra, contador de
  cartas, aviso "último monte" depois do reembaralho) e a carta aberta.
- **Embaixo**, a sua mesa, maior, com a área de pontos ao lado.
- Holofote no assento da vez; o seu brilha quando é a sua vez, com a frase "sua
  vez: arraste uma carta até a mesa de alguém".

### 5.3 A vez (gesto)

- **Arrastar** a carta aberta ou a do topo do monte e **soltar na mesa** de quem
  recebe (a sua inclusive). A mesa acende enquanto a carta passa por cima; soltar
  fora devolve a carta.
- **Clique** como alternativa: clica na carta (ela levanta) e depois na mesa de
  alguém; Esc ou clicar de novo na carta cancela.
- Fora da sua vez, nada arrasta. Jogador inativo aparece apagado e não acende.

### 5.4 A virada (animação)

Cada `play` novo na view (pelo `log`) dispara, pra todo mundo:

1. a carta voa da origem até a mesa de `to`;
2. vira lá (frente à mostra);
3. o resultado: **fechou** = a pilha sobe pra área de pontos e nasce a
   bandeirinha; **estourou** = a pilha cai e some; **perdeu o ponto** = a pilha e
   a bandeirinha caem; **nada** = a carta encaixa na pilha;
4. um letreiro curto narra: "Léo deu um 3 vermelho pra Bia: estourou!",
   "Duda ficou com o 2 do monte: fechou o azul!".

Sons curtos de picadeiro (rufar ao virar, fanfarra ao fechar, "buum" ao estourar,
"fiu" ao perder o ponto), **mais baixos que os do DITU**, com o botão de som de
sempre.

### 5.5 Lobby e fim

Padrão dos outros jogos: personagens como avatares, "começar" do host, bots no modo
de desenvolvimento ("🤖 adicionar bot"; o bot joga sozinho com uma heurística
simples: fecha 5 se puder, dá carta que estoura o líder, senão fica com carta que
não estoura). Fim: placar com vencedor(es), motivo ("chegou a 3 cores" / "o monte
acabou"), "jogar de novo" e "voltar pro lobby".

### 5.6 Catálogo

`web/src/games/catalog.ts`: `name: 'Cama-Leão'`, frase "junte 5 esferas certinhas
e empurre o resto pros amigos", "como jogar" em 4 linhas, `mobile: false`.
`playable` fica `false` (selo "em breve") até a mesa do C3 estar pronta. No celular
aparece o aviso de jogar no computador.

## 6. Histórico (C4)

### 6.1 O que é gravado

- **Uma linha por partida terminada** (`phase: 'over'` com `endReason`), gravada
  uma vez só, pelo mecanismo do Diquisti (`pendingHistoryRecord` em
  `shared/src/history.ts` com o caso `camelio`; pendente no mesmo `put` do Durable
  Object; `INSERT … ON CONFLICT DO NOTHING`).
- Partida abandonada (voltou pro lobby ou a sala esvaziou antes do fim) **não
  entra**. Partida com bot (`isBotName`) **não entra**.
- Id da partida: `${room.code}-${room.runStartedAt}-${match}`; essa também é a
  chave anti-duplicata.
- **Registro (`CamelioMatchRecord`):** `id`, `roomCode`, `playedAt`, `target`,
  `endReason`, `players` (`{ name, color }` como estavam na hora, na ordem dos
  assentos), `winners` (nomes), `final` (por jogador: cores pontuadas e esferas na
  mesa) e `plays` (o `log` com nomes no lugar dos ids e a carta como
  `{ color, spheres, kind }`). Uma partida tem ~70 a 140 jogadas.
- **Banco:** migração nova `NNNN_camelio_matches.sql` (próximo número livre no
  `main` na hora do C4; hoje seria 0004, mas Tatubum e Cúpi estão sendo feitos em
  paralelo), que só **cria** a tabela
  `camelio_matches` (`id`, `room_code`, `match_key`, `played_at`, `record_json`;
  `UNIQUE (room_code, match_key)`; índice por `played_at DESC`). Não toca em
  nenhuma outra tabela; segura pra aplicar sozinha na publicação. Teste de
  migração em `server/test/migration-*.test.ts`.
- `GAMES.camelio.recordsHistory` passa a `true` no C4.

### 6.2 A aba (`#/camelio/historico`, no visual de circo)

- **Partidas:** data, vencedor(es), placar e motivo. Clicar abre o placar final e a
  **linha do tempo** só dos momentos que importam (fechou, estourou, perdeu o
  ponto), cada um com quem deu pra quem.
- **A galera:** vitórias por pessoa e quatro títulos tirados das jogadas:
  - **domador**: mais vitórias;
  - **sabotador**: mais estouros/pontos perdidos causados nos outros
    (`by != to` e `outcome` `bust` ou `lost`);
  - **palhaço**: mais estouros na própria mesa (`by == to` e `bust` ou `lost`);
  - **Papai Noel**: mais vezes deu 5 de bandeja pros outros (`by != to` e
    `scored`).
- API: `GET /history/camelio[?before=<ms>]` → 20 partidas, `stats` só na primeira
  página, `nextBefore`; mesmo limite de 60 pedidos/min/IP e `no-cache`.

## 7. Testes

- **`shared`** (TDD): baralho (72 cartas, contagem por tipo/cor/esferas, ids
  estáveis), verso do topo por tipo (e que a view nunca manda a frente do topo),
  `resolvePlay` (nada, fechou, estourou, perdeu o ponto ao chegar a 5 e ao passar
  de 5), aberta reposta, reembaralho uma vez só, fim por monte, meta com 2 e com
  3+ jogadores (inclusive quando quem chega à meta é quem recebeu), desempates,
  vitória dividida, quem começa no "jogar de novo", pular quem caiu, pausa com
  menos de 2, erros da §2.7, schema zod.
- **`server`:** sala com 2 jogadores do `start` ao fim; no C4, gravação única
  (reconectar não duplica) e a migração 0004.
- **`web`:** componentes (pilhas/somas, versos, arrastar e clicar, letreiro) e um
  **E2E** de uma partida curta com 2 navegadores (com baralho fixo por seed de
  teste, se precisar); no C4, um E2E do histórico jogando por WebSocket direto
  (modelo `e2e/dixit-historico.spec.ts`).

## 8. Ordem do trabalho

Cada plano em `docs/superpowers/plans/`, cada um com o próprio PR; merge no `main`
= publicar, só quando o Rafa pedir.

1. **C1 — regras e base:** `shared/src/games/camelio/` + registro + `POST /rooms`
   + catálogo "em breve" + teste do servidor.
2. **C2 — protótipo:** `prototipo/cama-leao/`, página estática com as regras reais
   empacotadas por esbuild (como `prototipo/retratim/`), bots, arrasto, virada,
   sons. O Rafa joga e aprova (e a gente ajusta o baralho se precisar).
3. **C3 — mesa no site:** `web/src/games/camelio/`, porta o protótipo; catálogo
   `playable: true`; E2E de 2 navegadores; README e `CLAUDE.md` (tabela de jogos).
4. **C4 — histórico:** migração 0004, registro, rota, aba com partidas e galera.

## 9. Fora desta versão

Celular; variantes com outra meta; cartas personalizadas; "partida que não
terminou" no histórico.
