# cartolina~ — histórico do Diquisti (design)

Data: 2026-10-17. Pedido do usuário: "coloca o histórico no dixit". Base: a estante
de jogos (`2026-10-16-estante-de-jogos-design.md`, PR #9) já deu a cada jogo uma
página com a aba **histórico** (`#/<jogo>/historico`), o endpoint
`GET /history/:game` e a flag `GAMES[id].recordsHistory`. O DITU grava cada rodada
revelada; o Diquisti (id interno `dixit`) mostra "vem em breve". Este documento
desenha o histórico do Diquisti. Nomes de código continuam `dixit`; o que o jogador
vê diz "Diquisti".

## 1. Decisões do usuário (2026-10-17)

- Mostrar **partidas**, **estatísticas da galera** e **cartas famosas**. Não há
  lista solta de rodadas no topo; as rodadas são gravadas por baixo e aparecem
  dentro de cada partida.
- Partida que não chegou à meta entra como **"não terminou"**, com o placar de onde
  parou; as rodadas dela contam nas estatísticas e nas cartas famosas.
- Abrir uma partida mostra o **placar final e uma linha por rodada**.
- Guardar como **rodadas do Diquisti numa tabela própria**; partidas,
  estatísticas e cartas famosas são calculadas a partir delas (abordagem A).
- Visual: **conto ilustrado** do Diquisti (o da mesa), escolhido numa prévia lado a
  lado com o papel do cartolina.

## 2. O que é gravado e quando

- **Quando:** toda rodada do Diquisti que chega à revelação (`phase: 'reveal'` com
  `result`) é gravada **uma vez**. Recarregar a página ou reconectar não duplica:
  mesmo mecanismo do DITU (`pendingRecord` + `recordedRevealKey` + registro
  pendente no Durable Object gravado no mesmo `put`, `insertRound` com
  `ON CONFLICT DO NOTHING`).
- **Partida:** precisa de um id que mude a cada partida. `room.runStartedAt` só
  muda ao sair do lobby, e o "jogar de novo" (`again`) começa outra partida direto
  do fim de jogo. Por isso o estado do Diquisti ganha:
  - `match: number`: começa em 0 no lobby e soma 1 a cada `start` e `again`;
  - `round: number`: zera em cada partida nova e soma 1 a cada narração começada (narração refeita ou pulada
    também conta, então pode pular números; a tela numera as rodadas pela ordem dentro da partida).
  - Estado gravado antes desta versão (sala em andamento na publicação) ganha `match: 1, round: 0` ao ser lido.
  - Id da partida: `${room.code}-${room.runStartedAt}-${match}`.
  - Chave da revelação (anti-duplicata): id da partida + `round`.
- **Linha gravada (`DixitRoundRecord`):**
  - `id`, `matchId`, `roomCode`, `playedAt`, `target`, `round`;
  - `storyteller` (`{ name, color }`), `clue` (vazia = "falada na call"),
    `storyCard`;
  - `cards`: cada carta da mesa, na ordem da votação, com o dono `{ name, color }`;
  - `votes`: `{ voter: { name, color }, card }[]`;
  - `gained` e `scores` (placar de todos depois da rodada) por nome:
    `{ name, color, gained, score }[]`.
  - Nomes e personagens **como estavam na hora** (trocar de nome depois não mexe no
    passado), como no DITU.
- **Banco:** migração nova `0003_dixit_rounds.sql`, só cria a tabela
  `dixit_rounds` (colunas: `id`, `match_id`, `room_code`, `reveal_key`, `played_at`,
  `target`, `round`, `story_card`, `clue`, `record_json`; `UNIQUE (room_code,
  reveal_key)`; índice por `played_at DESC` e por `(match_id, played_at)`). Não toca na tabela
  `rounds` do DITU. Segura para aplicar sozinha na publicação.
- `GAMES.dixit.recordsHistory` passa a `true`. A gravação no servidor escolhe a
  tabela e o registro pelo jogo da sala.
- Sem login e sem apagar nada pela tela; o histórico é aberto como o do DITU.
- O histórico começa a contar da publicação; partidas antigas não existem.

## 3. Partidas, estatísticas e cartas famosas

Calculadas em funções puras no `shared` (`summarizeDixitHistory`, `dixitMatches`),
a partir das rodadas, como o `summarizeHistory` do DITU. Pessoas são identificadas
pelo **nome**. Cada estatística mostra o **top 3** com o personagem (cor mais
recente daquele nome).

- **Partida:** o conjunto das rodadas com o mesmo `matchId`.
  - Terminada quando algum `score` da última rodada chegou ao `target`. Vencedor =
    maior placar; empate = mais de um vencedor.
  - Não terminada = "não terminou", com o placar da última rodada.
  - Campos: data (da 1ª rodada), meta, número de rodadas, vencedores (ou nenhum),
    placar final por pessoa, rodadas (narrador, carta, dica).
- **Quem mais venceu:** vitórias em partidas terminadas (empate conta pros dois).
- **Quem mais acha:** votos na carta do narrador ÷ votos dados. Mínimo 5 votos.
- **Quem mais engana:** votos recebidos na própria carta ÷ rodadas em que jogou sem
  narrar. Mínimo 5 rodadas.
- **Melhor narrador:** narrações em que alguns acharam, mas não todos ÷ narrações.
  Mínimo 3 narrações. (Rodada sem voto nenhum não conta como "alguns acharam".)
- **Cartas famosas** (sempre com a pintura):
  - favoritas dos narradores: top 5 cartas mais escolhidas como `storyCard`, com a
    contagem;
  - as que mais enganaram: top 5 cartas por votos recebidos quando não eram a do
    narrador, com a contagem;
  - mural de dicas: as 12 dicas escritas mais recentes (`clue` não vazia), com a
    carta e quem narrou;
  - cartas impossíveis: as 8 `storyCard` mais recentes que ninguém achou (com pelo
    menos 1 voto na rodada), com a dica (se houver) e quem narrou.
- Os números (top 3, mínimos, 5/12/8) são pontos de partida, constantes nomeadas.

## 4. Endpoint

- `GET /history/dixit` responde no formato do Diquisti:
  `{ game: 'dixit', matches: DixitMatch[], stats: DixitHistoryStats | null,
  nextBefore: number | null }`.
- Paginação por partida: 20 partidas por página, mais recentes primeiro; `before`
  = data da última partida da página anterior (exclusivo). Estatísticas e cartas
  famosas só na primeira página, calculadas sobre as últimas rodadas (teto como o
  `STATS_ROUNDS_CAP` do DITU).
- O tipo de resposta vira uma união por jogo (`HistoryResponse` do DITU continua
  igual para `game: 'ito'`). Mesmos cabeçalhos (`Cache-Control: no-cache`) e mesmos
  erros (`not_found`, 429) do DITU.

## 5. A aba na tela

- Em `#/dixit/historico`, no lugar do "vem em breve". A "sala que acabou" já levava para lá; o lobby
  ("📜 histórico do Diquisti") e a mesa ("📜 histórico", embaixo do logo) ganharam o link, que abre em outra aba.
- **Visual conto ilustrado**: tokens e fontes do `dixit.css` (verde-floresta
  `#233D36`, superfície `#2F5046`, creme `#F6EAD2`, mostarda `#F2A541`, DM Serif
  Display + Nunito), moldura fina, fundo de pinceladas suave. O topo da página do
  jogo (abas jogar/histórico) continua como na estante.
- **Ordem**, de cima pra baixo:
  1. **a galera:** 4 quadros (quem mais venceu, quem mais acha, quem mais engana,
     melhor narrador), cada um com o top 3 e os personagens; abaixo do mínimo,
     "jogue mais umas rodadas".
  2. **cartas famosas:** 4 faixas (favoritas, as que mais enganaram, mural de dicas
     com a dica e quem narrou, cartas impossíveis), cartas com o número (vezes ou
     votos) num selo.
  3. **partidas:** a mais recente primeiro: data, meta e rodadas, "X venceu" (ou "X e
     Y venceram") ou "não terminou", personagens. Clicar abre o placar final e uma
     linha por rodada (narrador, miniatura da carta, dica ou "falada na call").
     "carregar mais" no fim.
- **Cartas:** pinturas reais (`CardArt`, com a pintura SVG de reserva). Clicar ou
  rodinha pra cima abre a carta ampliada (`CardViewer`), como na mesa.
  - Diferente da mesa, a página do histórico rola. Por isso a rodinha pra cima só amplia com o ponteiro parado
    (sem rolagem da página ou de uma faixa nos últimos 300 ms) e nunca com deslize horizontal; com a carta
    aberta, a página não rola por trás.
- **Celular:** quadros em 2 colunas; faixas de cartas rolam pro lado. Enquanto o `mobile` do Diquisti no
  catálogo for `false`, o histórico vazio mostra, no celular, o aviso de jogar no computador no lugar de
  "criar sala".
- **Sem dados:** "Ainda não tem partida de Diquisti. Bora jogar a primeira!" com o
  botão de criar sala.
- Erros de carga como no DITU ("tentar de novo"; 429 com "Calma!").

## 6. Erros e casos de borda

- Falha ao gravar no D1: a partida segue; o registro pendente fica no Durable
  Object e é regravado depois (como o DITU).
- Jogador que saiu no meio: a rodada grava o que aconteceu; ele aparece na partida
  com o placar que tinha.
- Rodada forçada pelo host (sem votos): grava; não conta como "alguns acharam" nem
  como carta impossível.
- Dica com texto do usuário: sempre exibida como texto (sem HTML).
- Carta com id desconhecido (baralho mudou): `CardArt` já cai na pintura SVG.

## 7. Testes

- `shared`: montar o registro a partir da sala (com e sem dica, jogador que saiu);
  chave da revelação muda entre rodadas e partidas (`start`, `again`); juntar
  partidas; terminada × não terminada; vencedor e empate; cada estatística com e sem
  o mínimo; cartas famosas (contagens, ordem, rodada sem votos).
- `server`: migração (só cria a tabela, `rounds` intacta), gravar uma vez só,
  paginação por partida, `GET /history/dixit` com e sem dados, `recordsHistory`.
- `web`: a aba com dados e vazia, abrir uma partida, carta ampliada, erro de carga.
- E2E: uma rodada de Diquisti com bots (ou ações diretas) aparece no histórico.

## 8. Fora desta versão

Apagar partidas, filtro por pessoa, exportar, conquistas.

## 9. Notas da implementação (2026-10-17)

- Plano: `docs/superpowers/plans/2026-10-17-diquisti-historico.md`.
- A versão de celular do DITU já está na `main` (PR #11) e o README foi atualizado nesta branch.
