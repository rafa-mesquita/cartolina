# cartolina~ — Mandacaru (design)

Data: 2026-11-09. Sexto jogo do cartolina~, sobre a base descrita em
`2026-10-15-cartolina-ito-design.md` e na sala genérica do Diquisti
(`2026-10-15-dixit-design.md` §3). Modelo de execução: o Cúpi
(`2026-10-19-cupi-design.md`).

**O que é:** um jogo de colonizar uma ilha de hexágonos: dados produzem
recursos, a galera troca e constrói estradas, casas e vilas, e quem chega a 10
pontos vence. Usamos só a **mecânica** desse gênero de jogo de tabuleiro; o
**nome, os termos, o tema e as artes são nossos** (tema caatinga), como o
Tatubum fez com o tatu-bola.

**Nome:** **Mandacaru** em tudo que o jogador vê. O id interno é `mandacaru`
(`gameId`, pastas `games/mandacaru`, classes `.mandacaru`,
`web/public/mandacaru/`).

## 1. Objetivo

Jogar com os amigos na call (Discord), no computador. Critério de sucesso: 3 ou
4 pessoas jogam uma partida inteira (uns 60–90 min) e emendam outra na mesma
sala, sem travar, entendendo pelo diário o que cada dado rendeu, quem trocou o
quê e por que alguém ganhou ponto; com placar de vitórias da noite e histórico
com o gráfico dos dados.

Decisões do usuário (2026-11-09):

- **3 a 4 jogadores**, tabuleiro de **19 terrenos**. O código da geometria fica
  pronto pra um tabuleiro maior (modo de 5–6) num plano futuro.
- **Tabuleiro sorteado a cada partida**, com 6 e 8 nunca vizinhos.
- **Troca como no jogo original**: quem está na vez propõe pra mesa; os outros
  aceitam, recusam ou contrapropõem (e podem mandar proposta pra quem está na
  vez); quem está na vez escolhe com quem fecha. Ninguém troca com quem não está
  na vez.
- **Turno de 5 minutos.**
- **Computador primeiro**; celular num plano separado depois (`mobile: false`).
- Identidade **"Mandacaru" (caatinga)**, escolhida no protótipo
  `prototipo/hexa/` (estilo D) entre 4 opções (§5).
- **Bots só no dev** (pra testar), não no site publicado.
- **Histórico** com as partidas e o **gráfico dos dados** (quantas vezes saiu
  cada número).
- Caminho: **regras (M1) → protótipo jogável com bots → mesa no site (M2) →
  histórico (M3)**; celular depois (§9).

## 2. Regras implementadas

### 2.1 Componentes

| Coisa | Quantidade |
|---|---|
| Terrenos | 4 caatinga (madeira), 4 malhada (couro), 4 roçado (feijão), 3 barreiro (barro), 3 lajedo (pedra), 1 rio seco (nada) |
| Fichas de número | 2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12 |
| Feiras (portos) | 4 comuns (3:1) e 5 de um recurso (2:1), uma por recurso |
| Banco | 19 cartas de cada recurso |
| Peças por jogador | 15 estradas, 5 casas, 4 vilas |
| Cordéis (25) | 14 Vaqueiro, 5 Ponto, 2 Mutirão, 2 Chuva no sertão, 2 Atravessador |

Ids internos dos recursos (em inglês, como os do Cúpi): `wood` (madeira),
`brick` (barro), `leather` (couro), `beans` (feijão), `stone` (pedra). Terrenos:
`forest`, `pasture`, `fields`, `hills`, `mountains`, `desert`. Cordéis:
`vaqueiro`, `point`, `mutirao`, `chuva`, `atravessador` (esses são palavras
nossas, ficam em português mesmo).

### 2.2 Preparação

- Só o anfitrião começa; precisa de **3 ou 4 jogadores ativos**. Quem entra
  depois assiste e joga a próxima partida.
- **Tabuleiro sorteado** com `ctx.rng`: terrenos embaralhados nos 19 lugares;
  as 18 fichas embaralhadas nos 18 terrenos que não são rio seco, refazendo até
  nenhum 6 ou 8 ficar vizinho de outro 6 ou 8; os 9 tipos de feira embaralhados
  nas 9 posições fixas da costa (§4.2). O Carcará começa no rio seco.
- **Ordem dos jogadores sorteada** (inclusive na revanche; o placar da noite
  segue).
- **Preparação em cobra**: na ordem 1→N, cada um põe uma **casa** (regra da
  distância, sem precisar de estrada) e uma **estrada** encostada nessa casa;
  depois N→1, igual. A **segunda casa** rende 1 recurso de cada terreno em volta
  (rio seco não rende).
- Depois da preparação, começa o turno do jogador 1.

### 2.3 Turno

1. **Antes dos dados** (fase `roll`): pode jogar **1 Vaqueiro** (conta como o
   cordel do turno).
2. **Dados**: dois d6 pelo `ctx.rng`. Cada terreno com o número (sem o Carcará)
   rende 1 por casa e 2 por vila dos jogadores nos cantos dele.
   - **Banco curto**: se o banco não tem um recurso pra todos que iam receber,
     ninguém recebe aquele recurso; se só **um** jogador ia receber, ele leva o
     que tiver.
3. **Saiu 7**:
   1. **Descarte** (fase `discard`): todo jogador com **mais de 7** cartas de
      recurso descarta a metade (arredondando pra baixo), todos ao mesmo tempo,
      com prazo de **60 s**. Ninguém precisa descartar = pula.
   2. **Carcará** (fase `carcara`): quem está na vez move o Carcará pra
      **outro** terreno (pode ser o rio seco).
   3. **Roubo** (fase `steal`): rouba 1 carta sorteada de alguém (não ele
      mesmo) que tenha casa/vila num canto do terreno e tenha carta. Ninguém =
      pula; uma pessoa = rouba direto; mais de uma = ele escolhe.
4. **Fase principal** (`main`), em qualquer ordem e quantas vezes quiser:
   trocar com jogadores (§2.5), trocar na feira, construir, comprar cordel e
   jogar **1** cordel (se ainda não jogou no turno). Termina com "passar a vez".

### 2.4 Construção

| Peça | Custo | Onde |
|---|---|---|
| Estrada | madeira + barro | lado livre encostado numa estrada sua, ou numa casa/vila sua; não continua através de um canto com casa/vila de outro jogador |
| Casa | madeira + barro + couro + feijão | canto livre, com os 3 cantos vizinhos vazios (regra da distância), encostado numa estrada sua |
| Vila | 2 feijões + 3 pedras | no lugar de uma casa sua (a casa volta pro estoque) |
| Cordel | pedra + couro + feijão | compra o de cima do monte (monte vazio = não dá) |

Limite: 15 estradas, 5 casas, 4 vilas na mesa. As cartas gastas voltam pro
banco.

### 2.5 Troca

- **Só na fase `main` de quem está na vez** (depois dos dados).
- **Oferta pra mesa**: quem está na vez monta "dou X, quero Y" (cada lado com
  pelo menos 1 carta, sem o mesmo recurso nos dois lados) e manda. Uma oferta
  aberta por vez; mandar outra substitui a anterior. Cada oferta tem um `id`
  (a resposta diz a qual oferta responde; resposta pra oferta velha é recusada).
- Os outros respondem **aceito**, **não** ou **contraproposta** (uma oferta
  própria pra quem está na vez). Fora de oferta aberta, os outros também podem
  mandar uma **proposta** pra quem está na vez. Cada jogador tem no máximo uma
  proposta valendo; mandar outra substitui.
- Quem está na vez **fecha negócio** com um jogador: com quem aceitou a oferta
  dele (nos termos da oferta) ou aceitando a proposta de alguém (nos termos da
  proposta). Na hora de fechar, os dois precisam ter as cartas; se não têm, a
  ação é recusada (`cannot_afford`). Depois de um negócio fechado, a oferta e
  todas as propostas somem.
- **Feira**: quem está na vez troca com o banco, **4:1** sempre; **3:1** se tem
  casa/vila numa feira comum; **2:1** do recurso da feira de 2:1 onde tem
  casa/vila. Pode pedir várias de uma vez (múltiplos da taxa). O banco precisa
  ter o recurso pedido.
- Passar a vez cancela oferta e propostas.

### 2.6 Cordéis

- Comprado no turno = não pode ser jogado no mesmo turno. **1 cordel jogado
  por turno** (o Ponto nunca é "jogado").
- **Vaqueiro**: faz o passo 3.2–3.3 (move o Carcará e rouba), sem descarte.
  Pode ser jogado antes dos dados; depois do roubo, volta pra fase de onde veio.
- **Ponto** (Igrejinha, Açude, Cisterna, Escola, Casa de Farinha): +1 ponto,
  escondido dos outros até o fim.
- **Mutirão**: põe 2 estradas de graça (fase `mutirao`), seguindo as regras de
  lugar. Se faltar peça ou lugar, põe as que der.
- **Chuva no sertão**: pega 2 recursos quaisquer do banco (podem ser iguais;
  precisa ter no banco).
- **Atravessador**: escolhe um recurso; todos os outros entregam tudo que têm
  dele.

### 2.7 Pontos e fim

- Casa 1, vila 2, cordel de Ponto 1 (escondido).
- **Maior estrada**: o maior caminho contínuo de estradas de um jogador, sem
  repetir lado, cortado onde houver casa/vila de **outro** jogador. Com **5 ou
  mais** e maior que o de todos, vale **+2**. Empate: quem já tem continua.
  Se a estrada de quem tem for cortada: se ele ainda é o maior (ou empata no
  maior), continua; senão vai pro único maior com 5+; se houver empate entre
  os outros (ou ninguém com 5+), fica sem dono até alguém passar sozinho.
- **Maior comitiva**: com **3 ou mais** Vaqueiros jogados e mais que todos,
  **+2**. Empate: quem tem continua.
- **Fim**: quem tem **10 ou mais pontos na própria vez** (contando os Pontos
  escondidos) vence na hora: depois de qualquer ação dele e no começo da vez
  dele. Os Pontos de todos aparecem no fim.

### 2.8 Prazos e automático

- **Turno de 5 min** (`MANDACARU_TURN_MS = 300_000`): conta a partir do começo
  da vez (e de cada vez na preparação: casa + estrada). Quando acaba, o turno
  termina sozinho:
  - preparação: casa no canto livre que mais rende (soma das chances dos números
    em volta; empate = sorteado) e estrada sorteada encostada nela;
  - sem dados: rola;
  - Carcará pendente: vai pro terreno sorteado entre os que têm casa/vila de
    outro jogador e não têm dele (senão qualquer outro terreno); roubo
    sorteado;
  - Mutirão pendente: estradas em lugares sorteados;
  - oferta e propostas canceladas;
  - passa a vez.
- **Descarte**: prazo de **60 s** (`MANDACARU_DISCARD_MS`); quem não descartou
  descarta cartas sorteadas. O relógio do turno não para durante o descarte.
- **Ausente** (mais de 30 s desconectado, fora de `ctx.active`), como no Cúpi:
  na vez dele faz o mesmo que o fim do prazo, mas na hora; no descarte, descarta
  sorteado na hora; respostas pendentes dele contam como "não". Ele continua na
  partida e as peças ficam.
- `onPresenceChange` aplica tudo isso e devolve **o mesmo objeto** quando nada
  muda; `nextDeadline` = o menor entre o fim do turno e o fim do descarte.

### 2.9 O que cada um vê

- Público: tabuleiro, peças, Carcará, banco, monte de cordel (quantos), pontos
  visíveis de cada um, quantas cartas de recurso e quantos cordéis cada um tem,
  Vaqueiros jogados, maior estrada/comitiva, dados, diário, oferta e propostas,
  relógios.
- Só pra você: suas cartas de recurso e seus cordéis (com "comprado agora"), seu
  total de pontos com os Pontos escondidos.
- No fim (`over`): os cordéis de Ponto de todos.
- O roubo aparece no diário como "fulano roubou 1 carta de sicrano"; o recurso
  roubado só aparece pros dois envolvidos.

## 3. Revanche e placar da noite

"Jogar de novo" (só o anfitrião, no fim): partida nova na mesma sala com os
ativos (3–4), tabuleiro novo, ordem sorteada. O estado guarda `match` (número da
partida) e `wins` (vitórias da noite por jogador), como o Cúpi.

## 4. Arquitetura

Mesmo modelo dos outros jogos: regras puras no `shared`, servidor genérico, mesa
no `web`.

### 4.1 `shared/src/games/mandacaru/`

| Arquivo | Responsabilidade |
|---|---|
| `types.ts` | Constantes, tipos do estado, ações, visão e diário |
| `board.ts` | **Geometria fixa** do tabuleiro de 19: terrenos (coordenadas axiais), 54 cantos, 72 lados, vizinhanças, os 30 lados da costa e as 9 posições de feira. Calculada uma vez (puro, sem rng). Gerada a partir do raio, pra servir a um tabuleiro maior depois |
| `setup.ts` | Sorteio do tabuleiro (terrenos, fichas sem 6/8 vizinhos, feiras) |
| `build.ts` | Onde dá pra construir, custos, limites, quem tem feira de quê |
| `production.ts` | Dados → recursos, com a regra do banco curto |
| `longest.ts` | Maior estrada (busca em profundidade nos lados de cada jogador) e quem fica com maior estrada/comitiva |
| `trade.ts` | Oferta, respostas, propostas, fechar negócio, feira |
| `cordel.ts` | Monte e efeitos dos cordéis |
| `rules.ts` | `applyMandacaruAction` (despacha por fase), início/revanche, fim de turno, vitória |
| `auto.ts` | `settleMandacaru` (prazos e ausentes) e as escolhas automáticas |
| `view.ts` | `mandacaruViewFor`, `can` (o que você pode fazer agora, com os lugares válidos), `mandacaruNextDeadline`, o `GameModule` |
| `schema.ts` | zod das ações, com `Assert` de tipos |
| `record.ts` | Registro da partida pro histórico (M3) |

**Geometria**: hexágonos em pé (pointy-top), coordenadas axiais `(q, r)` com
`max(|q|,|r|,|q+r|) ≤ 2`, em ordem estável (q crescente, depois r). Cantos e
lados numerados na ordem em que aparecem percorrendo os terrenos e seus 6 cantos
no sentido horário a partir do canto de cima (dedupe por posição). Cada terreno
sabe seus 6 cantos e 6 lados; cada canto, seus vizinhos (2 ou 3), lados e
terrenos (1 a 3); cada lado, seus 2 cantos e seus terrenos (1 ou 2). **Costa** =
lados com 1 terreno só (30), em ordem ao redor da ilha; as **feiras** ficam nos
lados da costa de índice 0, 3, 7, 10, 13, 17, 20, 23 e 27 (nenhuma divide canto
com outra). Um teste fixa as contagens (19/54/72/30/9) e a simetria.

**Fases**: `lobby` → `setup` → (`roll` → [`discard` → `carcara` → `steal`] →
`main` [→ `mutirao`/`carcara`/`steal` → `main`]) … → `over`.

**Estado** (resumo): `phase`, `match`, `wins`, `players` (ordem de jogo),
`board` (terrenos com tipo e número, feiras com tipo), `carcara` (terreno),
`buildings` (canto → dono e tipo), `roads` (lado → dono), `hands` (recursos e
cordéis por jogador), `bank`, `cordelDeck`, `turn`, `setupStep`, `rolled`,
`dice`, `diceCounts` (2..12), `cordelPlayed`, `pendingDiscard`, `afterCarcara`,
`mutiraoLeft`, `offer`, `proposals`, `offerSeq`, `longestRoad`/`largestArmy`
(dono ou null), `knights` (Vaqueiros jogados), `turnEndsAt`, `discardEndsAt`,
`startedAt`, `turns`, `winner`, `log`.

**Ações**: `start`, `restart`, `place_house`, `place_road`, `roll`, `discard`,
`move_carcara`, `steal`, `build_road`, `build_house`, `build_city`,
`buy_cordel`, `play_vaqueiro`, `play_mutirao`, `play_chuva`,
`play_atravessador`, `offer`, `cancel_offer`, `respond` (aceito/não),
`propose` (contraproposta ou proposta), `close_deal`, `feira`, `end_turn`.

**Erros** (códigos curtos como nos outros jogos): `not_host`, `bad_phase`,
`not_player`, `not_your_turn`, `not_enough_players`, `room_full`, `bad_spot`,
`cannot_afford`, `no_pieces`, `bank_empty`, `deck_empty`, `cordel_used`,
`cordel_fresh`, `no_cordel`, `bad_trade`, `stale_offer`, `bad_discard`,
`bad_target`.

**Registro**: `minPlayers: 3`, `maxPlayers: 4`, `liveCursors: false` (o cursor
na mão entregaria qual recurso você está mexendo), `recordsHistory: false` até
o M3.

### 4.2 Servidor

Nada por jogo: o `room-do.ts` valida com o schema, aplica, manda a visão de cada
um, chama `onPresenceChange` e acorda no `nextDeadline`. No M3 entram a tabela,
a gravação e a rota `GET /history/mandacaru`.

### 4.3 Site (M2)

`web/src/games/mandacaru/`: lobby, mesa, tabuleiro em SVG (componentes portados
do estilo D do protótipo), mão, painel de troca, feira, jogadores, "quanto
custa", diário (frases a partir dos dados do diário), relógio, sons suaves, folha
de regras (como a do Cúpi). Catálogo: "em breve" no M1, `playable: true` no M2,
`mobile: false`.

## 5. Identidade visual "Mandacaru"

Referência viva: `prototipo/hexa/` estilo D.

- Ilustração chapada sob o sol da tarde; fundo creme-pêssego com brilho de sol
  no alto.
- Terrenos como peças com borda em relevo (cor mais escura embaixo), luz por
  cima e grão fino: caatinga #8f9c6c (árvore seca retorcida), malhada #d4b878
  (bode), roçado #9db35a (pé de feijão), barreiro #c8643b (pote de barro),
  lajedo #aaa49a (pedras), rio seco #e8cd96 (chão rachado e sol).
- Borda: **terra rachada** (#d9a56c com rachaduras #a86d3c) no lugar do mar.
- Feiras: barraca de toldo listrado vermelho e creme com "3:1" ou "2:1" + ícone.
- Peças: **casa de taipa** (parede na cor do jogador, telhado de telha
  #a4462a), **vila** (casario com torre de igrejinha), estrada com contorno
  marrom. Cores dos jogadores: vermelho #b8321f, azul #2f6fa8, roxo #7b4a9a,
  branco #f4efe3.
- Ladrão: **Carcará** (desenho próprio).
- Fichas: disco creme com aro terracota; 6 e 8 em vermelho; bolinhas de chance.
- Tinta #4a2e1f / #5b3a29; acento #c8643b e #b8321f.
- Fontes: **Bree Serif** (títulos, números) + **Mulish** (texto).
- Cordel: a carta de desenvolvimento tem cara de folheto de cordel.

## 6. Mesa (M2)

Palco fixo de 1440×900 escalado, como as outras mesas.

- **Esquerda**: jogadores (cor, nome, pontos visíveis, cartas, cordéis,
  Vaqueiros, selos de maior estrada/comitiva), quem está na vez destacado, placar
  da noite.
- **Centro**: o tabuleiro. Construir = escolher a peça e os lugares válidos
  (vindos de `can`) pulsam; clique põe. Carcará = terrenos válidos acendem.
- **Topo**: de quem é a vez, relógio de 5 min (fica vermelho no último minuto),
  dados (animação curta) e botão "rolar".
- **Direita**: trocar, feira, construir, cordel, passar a vez; "quanto custa";
  diário.
- **Embaixo**: sua mão (recursos com contagem; cordéis com selo "novo").
- **Troca**: painel com +/− por recurso nos dois lados. A oferta aparece pros
  outros com aceito / não / contraproposta; quem está na vez vê as respostas e
  propostas e clica em "fechar com fulano".
- **7**: janela de descarte pra quem precisa (escolhe as cartas; relógio de
  60 s); os outros veem quem falta.
- **Fim**: pontos de todos com os cordéis de Ponto revelados, "jogar de novo"
  pro anfitrião.

## 7. Histórico (M3)

- Tabela nova no D1 (`mandacaru_matches`, migração nova que só **cria**).
- Uma linha por partida terminada sem bot: chave sala-início-partida, data,
  duração, número de turnos, vencedor, e por jogador: nome, cor, pontos e de onde
  vieram (casas, vilas, maior estrada, maior comitiva, cordéis de Ponto);
  `diceCounts` (quantas vezes saiu cada soma de 2 a 12).
- `GET /history/mandacaru` (20 por página) e a aba `#/mandacaru/historico`
  com as partidas e o **gráfico dos dados** (barras de 2 a 12 com a curva
  esperada por cima), por partida e somado.

## 8. Testes

- **shared** (Vitest), por módulo: geometria (contagens, vizinhanças, costa,
  feiras), sorteio (6/8 nunca vizinhos em muitas sementes; contagens),
  construção (distância, ligação, estrada cortada, limites, custos), produção
  (casa/vila, Carcará, banco curto), 7 (descarte, prazo, Carcará, roubo),
  troca (oferta, respostas, oferta velha, proposta, fechar, cartas faltando,
  feira 4/3/2), cordéis (cada um, comprado agora, 1 por turno), maior estrada
  (caminhos com bifurcação e ciclo, corte, empates), maior comitiva, vitória na
  própria vez, prazos e ausentes (mesmo objeto quando nada muda), visão (nada
  secreto vaza), schema.
- **Partidas sorteadas**: jogos inteiros com escolhas aleatórias válidas (via
  `can`) terminam sem erro, sempre com 19 de cada recurso no total (banco +
  mãos) e peças dentro dos limites.
- **server**: cria e joga uma sala de Mandacaru.
- **web**: catálogo ("em breve" no M1); mesa e E2E no M2; histórico no M3.

## 9. Etapas

1. **M1 — regras**: tudo do §2 e §4.1 (menos `record.ts`), registro, sala,
   protocolo, estante "em breve", teste no servidor.
2. **Protótipo jogável**: `prototipo/hexa/` passa a usar as regras reais
   (empacotadas com esbuild, como `prototipo/coup/`), com bots simples, no estilo
   D, pro Rafa testar a jogabilidade antes da mesa.
3. **M2 — mesa**: a mesa no site, bots do dev (`web/src/dev/mandacaruBots.ts`),
   E2E com 3 navegadores; `playable: true`.
4. **M3 — histórico**: tabela, gravação, rota, aba com o gráfico dos dados.
5. **Depois**: celular; talvez o modo de 5–6.
