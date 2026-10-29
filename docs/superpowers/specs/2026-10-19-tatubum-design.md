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
- **Escolhas pessoais com 30 s** (Favor, par de Mico (o descarte e a pegada no fim), Desarme, 5 diferentes, par de Quati, defesa do Tatu Latidor, Feitiço; no par de Preguiça o bicho vai junto da jogada); acabou o tempo, o servidor
  escolhe ao acaso (no Quati e no Feitiço, sem acaso: a carta fica / vai pro topo). **O turno em si não tem tempo.**
- **Ataque acumula** (regra das edições novas, §2).
- **Cartas ilustradas no Google Flow**, uma arte por tipo de carta (§6).
- Identidade **pixel art, paleta "noite no cerrado"** (§5.4). Primeiro foi escolhido o "gibi"
  (entre cerrado, festa junina e gibi); no mesmo dia o usuário trocou pra pixel art (referência: um
  tatu em pixel art de banco de imagens, usado só como estilo) e escolheu a paleta entre "noite no
  cerrado" e "Game Boy".
- **Só computador por enquanto**; celular fica pra depois.
- **Entrar igual aos outros jogos** (pedido depois de jogar o protótipo, 2026-10-19): criar sala pela
  estante, link/código, apelido e o mesmo bichinho dos outros jogos (o formulário de entrada é o do site);
  só a cara é do Tatubum.
- **Histórico como o dos outros jogos** (mesmo dia): partidas + estatísticas da galera (§7a). Plano
  próprio logo depois da mesa.
- **Mesa na largura toda da tela** (sem faixas nos lados), **cartas de arrastar** como no Diquisti e
  **bichinhos do site em pixel art** nos assentos (§5).
- Motor: **pilha de resolução no servidor com prazo** (§4.2).

## 2. Regras implementadas

### Preparação (ao clicar "começar")

1. Monta o baralho pelo número de jogadores (§3), sem Tatubuns nem Cafunés.
2. Cada jogador recebe **1 Cafuné** e mais **7 cartas** do baralho embaralhado (8 na mão).
3. Entram no monte os **Desarmes extras** (2 com até 4 jogadores, 1 com 5 ou mais) e **um Tatubum a menos que o número de jogadores**; o monte
   é embaralhado.
4. Quem começa é sorteado (2026-10-20), com `owed = 1`.

Como no original (pedido do Rafa, 2026-10-21): 2 Desarmes extras com até 4 jogadores e 1 com 5. De 6 a 8 o original não tem regra: 1 extra, seguindo a tendência.

### Turno

Na sua vez você joga **quantas cartas quiser** (inclusive nenhuma), uma de cada vez, e termina
**comprando** a carta do topo. Pular, Ataque e o par de Tucano terminam o turno sem comprar.

- **Turnos devidos** (`owed`): normalmente 1. Comprar, Pular e Cafuné gastam 1; quando chega a 0, a
  vez passa pro próximo vivo com `owed = 1`.
- Enquanto há **carta no ar** (§4.2), ninguém joga carta nova nem compra; só vale Nem vem!.
- Enquanto há **escolha em aberto**, o jogo espera essa escolha (ou o prazo).
- Cafuné sob ataque (`owed ≥ 2`): gasta 1 turno e você continua jogando os que faltam.
- **Vez pulada** (par de Tucano; pedido do Rafa, 2026-10-21): `skips[p]` = quantas vezes de `p` ainda vão ser
  puladas. Toda passagem de vez é por `passTo` (`turn.ts`); quando a vez chega em quem tem `skips`, um turno dele é
  gasto sozinho (`skips` − 1, evento público `{ t: 'skipped', who }`): devendo 2 (Ataque), ele perde um e continua na
  vez; devendo 1, a vez segue pro próximo vivo, que também pode ter vez pulada (puladas em cadeia). Sempre acaba (cada
  volta gasta uma pulada): se todos os outros tinham, as puladas se gastam na ordem e a vez volta. Quem sai do jogo
  perde as puladas; no fim de jogo elas zeram. Vez pulada não entra no histórico (saídas, Nem vem!, Desarmes).

### Cartas

| Carta | Cópias por pacote | Efeito | Aceita Nem vem!? |
|---|---|---|---|
| **Tatubum** | (fora do pacote: vivos − 1) | Quem compra e não tem Cafuné **explode** e sai do jogo. | não |
| **Desarme** (id `cafune`) | (fora do pacote: 1 por jogador + 2) | Jogado na hora em que você compra um Tatubum. **Quem comprou joga o Desarme à mão** (arrasta pro tatu ou clica; pedido do Rafa, 2026-10-20: "ter a sensação de que jogou"): a mesa toda vê o tatu tremendo até lá (escolha `tatu`, 30 s; sem resposta, o Desarme vai sozinho e o tatu volta pra um lugar sorteado). Depois você escolhe **em segredo** onde o tatu volta no monte (topo, 2ª, …, fundo, ou aleatório; mais 30 s). Gasta 1 turno. | não |
| **Nem vem!** | 5 | Cancela a carta no ar. Pode ser jogado fora da vez, por qualquer vivo (até por quem jogou a carta). Nem vem! em cima de Nem vem! vale. | sim |
| **Ataque** | 4 | Termina seu turno sem comprar. O próximo vivo joga **2 turnos**, ou, se você estava sob ataque (`owed ≥ 2`), **os seus turnos devidos + 2**. | sim |
| **Pular** | 4 | Gasta 1 turno sem comprar. | sim |
| **Favor** | 4 | Escolha um adversário vivo com carta na mão: **ele** escolhe uma carta pra te dar (30 s). **Três Favores juntos** (trio de Favor): você tira **3 cartas** do escolhido, uma ao acaso, e não aceita Nem vem! (ver "Combos"; pedidos do Rafa, 2026-10-20 e 2026-10-28). | sim |
| **Embaralhar** | 4 | Embaralha o monte (`ctx.rng`). | sim |
| **Espiar** | 5 | Você vê as 3 cartas do topo (ou menos, se o monte tiver menos), só você. Elas ficam à mostra pra você até serem compradas ou o monte mudar de ordem, mesmo depois que a vez passa; espiar de novo troca pelas 3 de agora. Várias pessoas podem ter espiada ao mesmo tempo (pedido do Rafa, 2026-10-20; ver "Espiada à mostra" abaixo). | sim |
| **Capivara, Mico-leão, Quati, Tamanduá, Preguiça, Tucano** | 4 de cada | Sozinhas não fazem nada; só em combo. O Tucano (id `tucano`) entrou em 2026-10-21 (pedido do Rafa). | (combo sim) |
| **Tatu Latidor** (id `latido`) | (fora do pacote: **2** com 2 jogadores, **3** com 3, depois **n − 1**; nenhum na mão inicial) | Todo mundo que tiver Latidor (na mão ou na frente) joga um Desarme ou explode, um de cada vez; ninguém tem, o seu fica na sua frente. **Par de Latidores:** um adversário escolhido joga um Desarme ou explode. Ver "Cartas novas". | sim |
| **Mau-olhado** (id `olhado`) | 2 | Um adversário vivo fica **cego** (mão embaralhada e escondida dele) até comprar. Ver "Cartas novas". | sim |
| **Feitiço** (id `feitico`) | 2 | Só você vê a **carta de baixo** do monte: fica com ela (é comprar) ou ela vai pro topo. Acaba o turno. Ver "Cartas novas". | sim |
| **Boto** (id `boto`) | 4 | Bicho **coringa**: sozinho não faz nada; em par ou trio vale por qualquer bicho. Ver "Cartas novas". | (combo sim) |

**Ataque, exemplos:** Ana (normal, `owed = 1`) ataca → Bia joga 2. Bia, no 1º dos 2 turnos, ataca →
Caio joga 4. Caio, no último turno devido (`owed = 1`), ataca → Duda joga 2.

### Espiada à mostra (pedido do Rafa, 2026-10-20)

Rafa: "Quando a carta Espiar é usada, o topo deve ficar revelado pro jogador até ele mudar de ordem ou a carta ser
comprada etc."

- Estado `peeks: Record<jogador, id[]>` (a do topo primeiro). O Espiar põe `peeks[quem] = as 3 de cima` (troca a
  espiada anterior dele). A vez passar **não** apaga nada.
- Vale sempre `peeks[p] = draw.slice(-k).reverse()` (k = tamanho da espiada, 1 ou mais: passa de 3 quando quem mexe
  no monte continua vendo o que sabe, abaixo): cada espiada é o topo do monte, na ordem. A simulação aleatória confere
  isso depois de cada passo. Espiada vazia não fica no estado.
- O que mexe no monte, um por um (`draw:` em `shared/src/games/kittens`):
  - **Comprar** (compra normal, inclusive comprar um Tatubum): a carta sai de todas as espiadas; o resto continua o topo.
  - **Par de Tamanduá**: as 2 compradas saem; o Tatubum comprado vai pro fundo (embaixo de tudo), então o resto continua
    o topo.
  - **Par de Quati, carta pro fundo**: tratada como compra, sai das espiadas (o resto vira o topo, na mesma ordem).
    Ficando (inclusive sem resposta), quem escolheu viu a de cima: sem espiada, ganha `[a de cima]`; com espiada, ela
    já começa por essa carta e nada muda (pedido do Rafa, 2026-10-21).
  - **Par de Preguiça puxando do monte**: a carta sai das espiadas que a tinham (o resto do monte não muda de ordem).
  - **Tatu tirado do monte quando alguém sai** (`eliminate`): sai das espiadas que o tinham.
  - **Feitiço ficando com a de baixo**: sai das espiadas que a tinham (só se a espiada era o monte inteiro).
  - **Embaralhar**: apaga **todas**.
  - **Desarme escondendo o tatu** (Cafuné): apaga as dos **outros**, em qualquer posição (até no fundo): apagar só às
    vezes contaria onde o tatu foi. Quem escondeu, numa posição escolhida, sabe onde pôs (pedido do Rafa, 2026-10-21):
    com espiada de k cartas e o tatu na posição `pos` (0 = topo, = cartas acima dele) com `pos ≤ k`, o tatu entra na
    espiada no índice `pos`; com `pos > k`, a espiada fica igual (o topo não mudou). Sem espiada, **não** ganha uma, nem
    com `pos = 0`: o olhinho (`peekers`) é público, e aparecer só nesse caso contaria pra mesa que o tatu está no topo.
    No "aleatório" (escolhido, ou o automático do prazo vencido / de quem caiu) ele também não sabe: perde a espiada.
  - **Feitiço pondo a de baixo no topo** (escolhido ou sem resposta): apaga as dos **outros** (o topo mudou); quem
    escolheu viu a carta, e a espiada dele vira `[a carta, ...a espiada que ele tinha]` (ou só `[a carta]`; se a
    espiada já era o monte todo, a carta só sobe pro começo) (pedido do Rafa, 2026-10-21: "o correto seria ver as 4
    cartas reveladas, porque teoricamente tenho informação de todas").
  - **Distribuir / jogar de novo / lobby / fim de jogo**: sem espiadas.
- Quem sai da partida (explodiu ou caiu de vez) perde a espiada.
- Sala salva no meio da partida antes disso tem `peek: { who, cards } | null`: o `compat.ts` converte pra
  `peeks = { [who]: cards }` (ou `{}`), só com o que ainda é o topo e só se `who` está vivo, e tira `peek` do estado.
- Visão: `peek` = a sua espiada (ou `null`); `peekers` = quem tem espiada agora (público, na ordem dos assentos). Na
  mesa, a sua fica ao lado do monte (e encolhe conforme as cartas são compradas; com mais de 3, as cartas se encavalam
  no mesmo espaço das 3, no computador e no celular); nos assentos dos outros, um olhinho.

### Combos

Jogados como **uma jogada só** (várias cartas de uma vez); o efeito próprio das cartas é ignorado.
Aceitam Nem vem! (que cancela o combo todo). Regras dos combos redesenhadas pelo Rafa em 2026-10-20:

- **Par** (2 cartas iguais) **só de bichos**: cada bicho tem o seu efeito (tabela abaixo). Duas cartas de
  ação iguais (ex.: 2 Ataques) não formam par (`bad_combo`).
- **Trio** (3 cartas iguais, **de qualquer tipo**), sem alvo nem pedido: você rouba **um Desarme** de um
  adversário sorteado **entre os que têm Desarme**. Ninguém tem: não acontece nada. Todos veem quem
  perdeu o Desarme.
  - **Exceção: trio de 3 Favores** (pedido do Rafa, 2026-10-20). Pede **alvo** como o Favor sozinho (adversário
    vivo com carta na mão; `bad_target` sem isso) e não rouba Desarme: você tira **3 cartas** dele (a mão toda, se
    tiver menos). Buff (pedido do Rafa, 2026-10-28): a **primeira sai ao acaso** da mão dele assim que resolve, e as
    outras (até 2) ele **escolhe**, uma de cada vez, no mesmo prazo de 30 s; vencido, as que faltam vão ao acaso. Só
    vocês dois veem quais cartas foram. **Não aceita Nem vem!**, como os 4 bichos diferentes (1,5 s no ar, sem
    contagem, `unstoppable`). O Boto não completa (Favor não é bicho).
- **4 bichos diferentes** (pedido do Rafa, 2026-10-21; antes eram 5 nomes diferentes de quaisquer cartas): **só bichos**,
  4 diferentes; o Boto conta como um bicho a mais (no máximo um). **Não aceita Nem vem!**: a carta fica 1,5 s no ar
  (`KITTENS_UNSTOPPABLE_MS`, sem contagem, sem botão), o Nem vem! é recusado (`unstoppable`) e ela resolve. O id da
  jogada continua `cinco`. Você escolhe (30 s) **duas cartas** do **descarte
  como estava antes desta jogada** (pedido do Rafa, 2026-10-20; uma de cada vez, no quadro do descarte). Descarte
  com 1 carta = só ela; vazio = nada. Prazo vencido: o que faltar sai ao acaso.
- **Quadro do descarte:** um olho ao lado da pilha de descarte abre um quadro com todas as cartas do descarte
  (qualquer um, a qualquer hora). A escolha dos 4 bichos diferentes acontece nesse quadro.

### Par de cada bicho (pedido do Rafa, 2026-10-20)

Sozinho o bicho continua não fazendo nada.

| Par de… | Pede | Efeito |
|---|---|---|
| Mico-leão | — | **Cada adversário** vivo com carta **descarta uma carta à escolha dele**, todos ao mesmo tempo (30 s; depois, ao acaso). O efeito da carta descartada não vale. As cartas vão à mostra pro descarte. (Pedido do Rafa, 2026-10-20: antes era igual ao Favor.) **Depois que todos descartam, você pega uma das cartas descartadas nesse par** pra sua mão (30 s, no quadro do descarte; depois, ao acaso); se ninguém descartou nada, ou se você saiu do jogo antes, não pega (pedido do Rafa, 2026-10-20). |
| Quati | — | Só você vê a **carta de cima** do monte e escolhe se ela **fica no topo** ou **vai pro fundo** (30 s; sem escolha, fica). Todos sabem se foi pro fundo, ninguém sabe qual era. |
| Tamanduá | — | Você **compra 2 cartas** de cima (1, se o monte só tiver 1). Cada **Tatubum** comprado assim **vai pro fundo do monte** sem gastar Desarme; as outras vão pra sua mão (só você vê). **A vez continua**: você ainda pode jogar e, no fim, compra normalmente. Todos sabem quantos Tatubuns foram pro fundo. |
| Preguiça | um bicho (pelo nome) | Você puxa uma carta **desse bicho** do adversário com **mais cartas na mão entre os que têm** (pedido do Rafa, 2026-10-28; empate: sorteado entre eles). Ninguém tem: você **procura no monte** e pega uma dele (sem ver o resto). Nem no monte: **pega do descarte** (sem contar as cartas do próprio par; pedido do Rafa, 2026-10-21). Nada em lugar nenhum: nada. **30% de chance de puxar dois** (`KITTENS_PREGUICA_DOUBLE`), cada um na mesma ordem (mão → monte → descarte); o segundo que não acha nada não aparece no diário. Todos veem de onde veio. |
| Tucano (pedido do Rafa, 2026-10-21) | um adversário vivo (mesmo sem carta) | **A sua vez acaba sem você comprar**, como no Pular (sob ataque, gasta só um dos turnos devidos), e a **próxima vez do alvo é pulada**: ele não joga nem compra. Duas vezes no mesmo alvo pulam duas vezes dele. Todos veem quem vai ser pulado. Rafa: "par: você pula sua vez quando manda ele, não compra e nem joga, e escolhe outro jogador pra pular; ele também não joga nada nem compra, o turno dele é pulado." |
| Capivara | — | **Todos os outros** vivos passam, ao mesmo tempo, uma carta **ao acaso** pro próximo na ordem da vez (o sentido em que a vez anda). **Você não passa**, mas recebe a do jogador antes de você. Quem está sem carta não passa. Cada um vê só o que deu e o que recebeu. |

Regras de motor:
- `playKindOf`: 2 iguais só vira `par` se for bicho; 3 iguais de qualquer tipo é `trio`.
- `parsePlay`: alvo exigido só no Favor, no trio de Favor, no Mau-olhado e no par de Tucano (`bad_target`); pedido
  (`ask`) exigido só no par de Preguiça e tem que ser um dos bichos (6, com o Tucano; `bad_ask`). Os outros trios ignoram alvo e pedido. (Quem está
  cego ouve `bad_combo` no lugar desses: ver "Jogar às cegas".)
- Favor e trio de Favor: a escolha `favor` tem `left` (quantas cartas ainda dar: 1 no Favor sozinho; no trio, `min(2,
  o que sobrou na mão do alvo)` depois da carta ao acaso, que sai como `gave` com `random: true`; sem sobra, não abre
  escolha). Cada `choose { card }` do alvo passa uma carta (evento `gave`, só os dois veem) e o `left` cai; em
  0, ou com a mão do alvo vazia, a escolha fecha. Prazo vencido: as que faltam vão ao acaso. O evento `play` do trio
  de Favor sai com `play: 'trio'`, `as: 'favor'` e o `target`. Escolha salva sem `left` (antes da mudança) vale 1.
- Par de Mico: escolha `{ kind: 'mico', by, waiting, deadline }` (`waiting` = quem ainda tem que descartar; pública).
  Cada um em `waiting` manda `choose { card }` com uma carta da própria mão; evento público `{ t: 'discarded', by, card }`.
  Prazo vencido: cada um que falta descarta uma ao acaso. Quem sai do jogo sai do `waiting`. `waiting` vazio fecha a escolha.
  Pegada no fim (pedido do Rafa, 2026-10-20): a escolha guarda `discarded` (o que já foi descartado nela). Quando o
  `waiting` esvazia (último descarte, prazo vencido ou o último da espera saiu do jogo), se `discarded` não está vazio
  e `by` está vivo, abre a escolha dos 5 diferentes pra `by`: `{ kind: 'cinco', who: by, options: discarded, left: 1,
  deadline: now + 30000, from: 'mico' }` (`from` só muda os textos da mesa). Pega com `choose { card }` (evento público
  `picked`); prazo vencido, uma ao acaso. Senão a escolha fecha sem pegada. A vez continua com `by`. Escolha `mico`
  salva sem `discarded` (antes da mudança) entra com `[]`.
- 4 bichos diferentes: a escolha `cinco` ganha `left` (quantas ainda pegar, 2 ou 1); cada `choose { card }` pega uma e o `left` cai;
  em 0 (ou sem opções) a escolha fecha.
- Escolha nova `{ kind: 'quati', who, deadline }`; na visão, só `who` recebe `card` = a carta de cima.
  Ação: `choose` com `keep: boolean`. Evento `{ t: 'delayed', by, moved }` (público).
- Tamanduá: eventos `{ t: 'draw', by, card }` (só quem comprou vê) pra cada carta que fica na mão e
  `{ t: 'buried', by, tatus }` (público) quando algum Tatubum vai pro fundo. As 2 compradas saem das
  espiadas (o resto continua à mostra; ver "Espiada à mostra").
- Preguiça: evento `{ t: 'called', by, ask, from, card }` (público): `from` = quem deu, ou `null` quando
  veio do monte ou do descarte (`pile: true`); `card` = `null` quando não estava em lugar nenhum. A carta tirada do
  monte sai das espiadas. Puxando dois, dois eventos.
- Capivara: um `{ t: 'passed', from, to, card }` por passe, com `seenBy` [from, to].
- Tucano: o alvo tem que ser outro jogador vivo (qualquer tamanho de mão; Boto + Tucano e 2 Botos com `as: 'tucano'`
  também pedem). Resolvendo: evento público `{ t: 'tucano', by, target }`, `skips[target]` + 1 e `spendTurn` (a pulada
  entra antes: se o alvo é o próximo, já perde a vez agora). Cancelado (Nem vem! ímpar, quem jogou ou o alvo saiu): nada.
  Sala salva antes do Tucano não tem `skips`: entra `{}` (`compat.ts`).
- Trio: evento `{ t: 'grabbed', by, from, card }` (público; `from`/`card` = `null` quando ninguém tinha
  Desarme). O evento antigo `asked` (trio pelo nome) sai.

### Cartas novas (pedido do Rafa, 2026-10-20)

Quatro cartas novas, adaptadas de expansões do Exploding Kittens. O Rafa pediu as cartas e deixou os detalhes pra
decidir; onde ele não disse, vale a regra mais simples que bate com a carta original, e cada decisão está marcada
com **(decisão)**. As três de ação aceitam Nem vem! como qualquer carta de ação (`KITTENS_ACTION_KINDS`); o Boto é
bicho.

#### Tatu Latidor (`latido`; do "Barking Kitten"; arte: tatu numa casinha de cachorro latindo "AU AU")

- **1 por jogador** na partida (pedido do Rafa, 2026-10-21; antes eram sempre 2), fora dos pacotes, e **nenhum na
  mão inicial**: vão todos pro monte (§3).
- Jogado sozinho, sem alvo; vai pro ar e aceita Nem vem! (cancelado: vai pro descarte e nada acontece).
- Ao resolver (pedido do Rafa, 2026-10-21): **todo outro jogador vivo** que tem Latidor **na mão ou na frente dele**
  tem que se defender, **um de cada vez, na ordem dos assentos a partir de quem jogou**. Cada um, na vez dele
  (evento `{ t: 'barked', by, target }`):
  - **Tem Desarme:** abre a escolha **pública** `{ kind: 'latido', who, by, deadline }` (30 s; `by` = quem jogou o
    Latidor). Ele joga o Desarme à mão (`choose { card: <Desarme> }`): o Desarme vai pro descarte (evento
    `{ t: 'cafune', by }`, o mesmo do Tatubum) e **todos os Latidores dele** (da frente e da mão) também.
    **(decisão)** Um Desarme basta, mesmo com mais de um Latidor. O jogado já está no descarte. Prazo vencido (ou ele
    cai de vez): o Desarme vai sozinho. Aí a escolha abre pro próximo da fila, com prazo novo.
  - **Não tem Desarme:** **explode na hora** (sem escolha), como quem compra um Tatubum sem Desarme: sai do jogo, a
    mão vai pra fora e um Tatubum sai do monte pra manter `vivos − 1`. **(decisão)** Os Latidores dele vão **pra
    fora do jogo junto com a mão** (e com o que estava na frente dele). A fila segue.
  - **(decisão)** A fila não fica guardada: o próximo é sempre o primeiro vivo depois de quem jogou, na ordem dos
    assentos, que ainda tem Latidor (quem se defendeu ou explodiu fica sem nenhum, e durante a defesa ninguém joga
    nem compra). Por isso a escolha só guarda `by`.
  - Se as explosões deixam 1 vivo, a partida acaba ali (quem jogou vence). Senão, depois do último a vez continua
    com quem jogou o Latidor (a carta não gasta turno). O jogado fica no descarte.
- Ninguém mais tem Latidor: o jogado sai do descarte e fica **na frente de quem jogou** (estado público
  `front: Record<jogador, carta[]>`; chave ausente = nada). Quem tem um Latidor na frente também tem que se defender
  quando outro for jogado.
- **(decisão)** Quem jogou e tem outro Latidor na frente (ou na mão) não conta como alvo de si mesmo; se ninguém
  mais tem, o jogado também fica na frente dele e nada acontece.
- **(decisão)** A escolha `latido` só abre pra quem tem Desarme, então nunca trava; mesmo assim, se no prazo não
  houver Desarme na mão, ele explode.
- Quem sai do jogo (explodiu ou caiu de vez) com Latidor na frente: o Latidor vai **pra fora do jogo** com a mão.
- Quem está cego (Mau-olhado) e tem que se defender não sabe qual ficha é o Desarme: **(decisão)** qualquer ficha da
  própria mão vale, e o servidor joga o Desarme dele.
- Eventos públicos: `{ t: 'barked', by, target }` (`target` = quem tem que se defender, ou `null` quando foi pra
  frente de `by`), depois `{ t: 'cafune', by }` ou `{ t: 'boom', by }`; com vários se defendendo, um par desses
  pra cada um, na ordem da fila.
- Partida salva antes da fila (sem `by` na escolha `latido`): `compat.ts` completa com `by = current` (o Latidor só
  sai na vez de quem joga, e a vez fica com ele).
- **Par de Latidores** (pedido do Rafa, 2026-10-21): 2 Latidores juntos (o Boto não completa) pedem um adversário
  vivo (`target`, com ou sem Latidor; `bad_target`). Ao resolver: evento `{ t: 'barked', by, target, pair: true }`;
  com Desarme, abre a escolha pública `{ kind: 'latido', who: target, by, deadline, pair: true }` (30 s) e **só o
  Desarme** vai pro descarte (os Latidores dele ficam onde estão; sem fila); sem Desarme (ou prazo vencido sem ele),
  explode. Não gasta a vez. Pode levar Nem vem!.

#### Mau-olhado (`olhado`; do "Curse of the Cat Butt"; arte: tatu botando mau-olhado)

- 2 por pacote. Carta de ação **com alvo**: um adversário vivo (`bad_target` sem alvo, em si mesmo ou em quem saiu).
  **(decisão)** Diferente do Favor, o alvo pode estar sem carta (fica cego de mão vazia; o que receber chega
  escondido). Aceita Nem vem!; se o alvo sair antes de resolver, cancela.
- Ao resolver, o alvo fica **cego**: a mão dele é **embaralhada no estado** (`ctx.rng`) e ele entra na lista pública
  `blind`. **(decisão)** Em vez de guardar um mapa separado ficha → carta, a própria ordem da mão no estado é o mapa:
  a ficha `?i` é `hands[p][i]`. Toda carta que chega na mão vai pro fim (Favor, Preguiça, trio, Capivara, 5
  diferentes); carta que sai só desloca as fichas. Já cego de novo: embaralha outra vez e continua uma vez só na
  lista.
- **(decisão) O que o cego pode saber das fichas.** O id nunca aparece pra ele, mas às vezes o **tipo** de uma ficha
  dá pra deduzir, e tudo bem (é o que ele saberia na mesa de verdade, e não ajuda a achar as cartas de antes do
  olhado, que foram embaralhadas):
  - a última ficha é a carta que acabou de chegar quando ele mesmo pediu ou escolheu: **par de Preguiça** (o bicho
    pedido, se veio), **trio** (um Desarme, se alguém tinha; o `grabbed` é público), **4 bichos diferentes** (a carta que
    ele pegou do descarte, que é público);
  - o diário mostra o que **saiu** da mão dele (a carta já não está lá, então não é apagada): **Capivara** (o que
    ele passou ao acaso, só pra ele e pra quem recebeu), **Favor** (o que deu), **par de Mico** e Desarme (público).
    Isso diz quais cartas sobraram, não onde estão;
  - o que chega **sem ele escolher** (Favor que recebe, Capivara que recebe) fica desconhecido: o evento chega com
    `card: null` pra ele.
- **Visão do cego:** `hand` = `['?0', '?1', …]`; nenhum id da própria mão aparece pra ele, nem no diário (qualquer
  evento cuja carta esteja hoje na mão dele chega com `card: null`, inclusive o que ele mesmo comprou antes e o que
  acabou de receber). Os outros veem quem está cego (`blind`), mas não a ordem.
- **Jogar às cegas:** quem está cego manda **fichas** em tudo que aponta carta da própria mão: `play.cards`,
  `nope.card`, `choose.card` (Favor, descarte do Mico, Desarme). O servidor troca a ficha pela carta de verdade e
  valida como sempre. Cego mandando id de verdade (ou nada onde precisa de carta) → erro novo **`blind_pick`**
  ("Mau-olhado: escolha uma das suas cartas viradas."). Ficha que não existe (índice ≥ tamanho da mão) →
  `not_in_hand` no `play` e no `nope`; no `choose`, `bad_choice`, como qualquer carta que não vale ali. Quem vê não
  pode mandar ficha (`not_in_hand` no `play`/`nope`, `bad_choice` no `choose`).
- **Uma ficha por carta (correção da revisão):** só vale a escrita canônica `?0`, `?1`, …, `?999` (sem zero à
  esquerda). `?00`, `?01`, `?007` não são fichas (→ `blind_pick`): antes eram "outro nome" da mesma carta, e como
  a checagem de carta repetida olhava os nomes mandados, `['?0', '?00']` jogava **uma carta como par** (e ela ia
  duas vezes pro descarte). Agora, além disso, o `parsePlay` confere repetição **depois** de trocar as fichas pelas
  cartas (`bad_combo`). `nope` e `choose` apontam uma carta só, então não têm como repetir.
- **(decisão) Erro às cegas não entrega o tipo da ficha:** depois que as fichas viram cartas, qualquer recusa da
  jogada de quem está cego chega como **`bad_combo`** (no lugar de `bad_target`, `bad_ask` e `bad_as`). Senão,
  mandar `?3` sem alvo e ouvir `bad_target` diria "é Favor ou Mau-olhado" sem gastar nada, e dois Botos se
  denunciariam por `bad_as`. Os erros que ele ainda ouve só dependem do que ele já sabe (`blind_pick`,
  `not_in_hand` pelo tamanho da mão, ficha repetida, e os da vez: `not_your_turn`, `card_in_air`…). O que uma
  tentativa às cegas ainda ensina é só "isso, mandado assim, forma jogada ou não", e quando forma a carta vai pro
  ar (não é de graça). Ex.: `?3` sozinho recusado = não é uma carta de ação sem alvo; `?3` com alvo aceito = era
  de ação. Quem vê continua ouvindo o erro exato.
- **Nem vem! às cegas:** a ação `nope` ganhou `card?` (opcional pra quem vê: sem ela o servidor escolhe um Nem vem!
  como antes; com ela, tem que ser um Nem vem! da mão, senão `no_nope`/`not_in_hand`). O cego **tem que** mandar
  uma ficha; se não for Nem vem!, `no_nope`. **(decisão)** A recusa ensina ao cego que aquela ficha não era o que
  ele queria (como no par/trio às cegas), o que é aceitável: errar não muda nada no jogo.
- **Escolhas que não usam a mão** (onde esconder o tatu, 4 bichos diferentes, Quati, Feitiço) funcionam normal; no 4
  diferentes ele escolhe pelo id do descarte (que é público).
- **Voltar a ver:** quando ele **compra** — compra normal (inclusive um Tatubum: vê a mão pra jogar o Desarme), as
  2 do par de Tamanduá, ou ficar com a carta do Feitiço. Evento público `{ t: 'cured', by }` antes do `draw`. Mandar
  a carta do Feitiço pro topo não é comprar.
- Quem sai do jogo deixa de estar cego; no fim de jogo ninguém fica cego.
- Eventos públicos: `{ t: 'cursed', by, target }` e `{ t: 'cured', by }`.

#### Feitiço (`feitico`; do "Raising Heck"; arte: tatu feiticeiro com caldeirão puxando uma carta de baixo do monte)

- 2 por pacote. Carta de ação sem alvo; aceita Nem vem! (cancelado: nada acontece e a vez continua).
- Ao resolver: escolha `{ kind: 'feitico', who, deadline }` (30 s). Na visão, só `who` recebe `card` = a **carta de
  baixo** do monte (`draw[0]`); os outros veem `card: null`.
- `choose { keep: true }`: fica com ela, **como se comprasse** (cura o Mau-olhado; evento `draw` só pra ele). Se for
  **Tatubum**: com Desarme, o fluxo de sempre (escolha `tatu`, Desarme à mão, esconder); sem Desarme, explode.
- `choose { keep: false }`: ela vai pro **topo** do monte (as espiadas de todos se apagam). Com `keep: true`, ela só sai
  das espiadas que a tinham.
- **Nos dois casos acaba o turno** (gasta 1 turno, como comprar; sob ataque, gasta um dos devidos). O Tatubum guardado
  gasta o turno quando o tatu volta pro monte.
- Prazo vencido (ou quem escolhe cai de vez): a carta **sempre vai pro topo**, seja qual for (gasta o turno como no
  `keep: false`). **(correção da revisão)** Antes ficava com a carta "a não ser que fosse Tatubum": aí quem
  assistia via a mão dele não crescer e sabia que tinha um Tatubum no topo. Indo sempre pro topo, ninguém aprende
  nada, e a escolha do Desarme nunca abre pra quem já saiu.
- Eventos: `{ t: 'conjured', by, kept }` (público, sem a carta) e, quando fica, `{ t: 'draw', by, card }` só pra ele.

#### Boto (`boto`; o bicho coringa — Rafa: "animal coringa, ele pode ser usado pra ser qualquer animal, não tem muitas no baralho"; arte: boto-cor-de-rosa)

- 2 por pacote. Sozinho não faz nada; com carta de ação não forma par (`bad_combo`).
- **Par:** Boto + bicho X = par de X (o efeito é o do X). Boto + Boto = par do bicho declarado no campo novo
  **`as`** da jogada (um dos bichos, o Tucano incluído desde 2026-10-21; faltando ou inválido → erro novo **`bad_as`**, "Escolha qual bicho o Boto
  vira."). Par de Preguiça com Boto continua pedindo `ask`.
- **Trio:** 3 iguais de qualquer tipo, como antes; o Boto completa **bichos** iguais (Capivara + Capivara + Boto,
  Boto + Boto + Mico); 3 Botos também é trio. Com carta que não é bicho (Ataque + Ataque + Boto) não vale.
- **4 bichos diferentes:** o Boto conta como um bicho a mais (Boto + 3 bichos diferentes vale; 2 Botos repetem o nome).
- **(decisão)** O pedido da Preguiça (`ask`) continua sendo um dos bichos (Boto não; o Tucano pode), e um Boto na mão de alguém
  **não conta** como o bicho pedido.
- `KittensPlay` ganhou `as: KittensCardKind | null`: no par, o bicho que o par vale (sempre, com ou sem Boto); no
  trio, o tipo das iguais (`boto` em 3 Botos); `null` no resto. O evento `play` também leva `as`, pra a tela mostrar
  "par de Quati (com Boto)". `KITTENS_BICHOS` continua sendo os bichos (6 desde o Tucano; o Boto é `KITTENS_WILD`).

#### Motor e segredo

- Estado novo: `front` e `blind` (zerados no começar/jogar de novo). Visão nova: `front` (todos os jogadores, `[]`
  sem nada) e `blind` (lista pública).
- **Estado salvo antes das cartas novas (deploy com partida no meio):** o Tatubum já estava no ar sem `front`/`blind`,
  então uma sala guardada no Durable Object pode voltar sem eles. `kittensWithNewFields` (`compat.ts`) completa os
  dois vazios (`{}`/`[]`) na entrada do motor: `settleKittens` (e por ele `applyKittensAction`, que sempre começa
  pelo settle) e `kittensViewFor`; `kittensNextDeadline` não lê os campos. Estado completo passa pelo mesmo objeto.
  Testado em `kittens-compat.test.ts` (lobby, partida, carta no ar, pelo módulo).
- Ações: `play.as?`, `nope.card?`; fichas `?i` são ids de até 32 caracteres, então o schema não muda pra elas.
- `takeCard` (`choices.ts`) junta "comprar" (compra normal e Feitiço): cura o cego, Tatubum abre o Desarme ou
  explode, outra carta vai pra mão e gasta o turno.
- `eliminate` manda pra fora também as cartas na frente e tira da lista de cegos; `checkWin` zera os cegos.
- A simulação aleatória (`kittens-fuzz.test.ts`) joga as cartas novas, responde as escolhas novas e põe cegos jogando
  por ficha; confere a cada passo: cartas conservadas (contando as da frente), só Latidor na frente de vivos,
  `vivos − 1` tatus, a carta de baixo do Feitiço só pra quem escolhe e **nenhum id da mão do cego na visão dele**.
  Depois da revisão: o cego às vezes manda a ficha com outro nome (`?00`, `?03`, inclusive repetindo uma ficha
  por outro nome) e isso **tem que ser recusado**; o Feitiço sem resposta tem que mandar a carta pro topo; os bots
  usam o que é público (seguram o Latidor até quem tem o outro na frente ficar cego, botam mau-olhado nele, latem),
  e há partidas que começam arranjadas com um cego com Latidor na frente (só move cartas). A conferência de
  cobertura joga as próprias partidas (não depende da ordem dos testes) e exige, além das cartas novas, ficha com
  outro nome, cego se defendendo do Latidor e Feitiço sem resposta. Rodada pesada (SEEDS = 225: 900 partidas
  normais + 900 arranjadas) passou.
  Com a fila do Latidor (2026-10-21) ela também confere que quem tem a escolha `latido` está vivo, não é quem jogou e
  tem Latidor e Desarme, e que quando a fila acaba (partida seguindo) nenhum vivo além de quem jogou tem Latidor; e
  exige ver a escolha passando de um pro outro e uma explosão no meio da fila. Os jogadores ao acaso com espiada
  jogam o Feitiço mais vezes (a espiada com mais de 3 cartas ficou rara com o baralho novo).

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

Um **pacote** tem **58 cartas**: 5 Nem vem!, 4 Ataque, 4 Pular, 4 Favor, 4 Embaralhar, 5 Espiar, 24
bichos (6 tipos × 4; o Tucano entrou em 2026-10-21, pedido do Rafa) e, desde 2026-10-20, 2 Mau-olhado, 2 Feitiço e
4 Botos (eram 2 até 2026-10-21). Os **Tatus Latidores** ficam fora dos pacotes: **2 com 2 jogadores, 3 com 3 e n − 1 a partir de 4** (pedido do
Rafa, 2026-10-21; antes eram sempre 2), e **nenhum vem na mão inicial**: a mão (1 Desarme + 7) sai só dos pacotes, e os Latidores vão pro monte
junto com o resto dos pacotes, os Desarmes extras e os Tatubuns, tudo embaralhado (`kittensLatidos(n)` = n até 3, n − 1 depois).

Monte = pacotes × 58 − 7n + Latidores + Desarmes extras + (n − 1) Tatubuns.

| Jogadores | Pacotes | Cartas dos pacotes | Latidores | Monte depois de distribuir | Desarmes | Tatubuns |
|---|---|---|---|---|---|---|
| 2 | 1 | 58 | 2 | 58 − 14 + 2 + 2 + 1 = 49 | n + 2 | n − 1 |
| 3 | 1 | 58 | 3 | 58 − 21 + 3 + 2 + 2 = 44 | n + 2 | n − 1 |
| 4 | 1 | 58 | 3 | 58 − 28 + 3 + 2 + 3 = 38 | n + 2 | n − 1 |
| 5 | 1 | 58 | 4 | 58 − 35 + 4 + 1 + 4 = 32 | n + 1 | n − 1 |
| 6 | 2 | 116 | 5 | 116 − 42 + 5 + 1 + 5 = 85 | n + 1 | n − 1 |
| 7 | 2 | 116 | 6 | 116 − 49 + 6 + 1 + 6 = 80 | n + 1 | n − 1 |
| 8 | 2 | 116 | 7 | 116 − 56 + 7 + 1 + 7 = 75 | n + 1 | n − 1 |

Com 8 jogadores a mão inicial gasta 56 cartas, por isso 2 pacotes a partir de 6. Antes das cartas novas, com 2
a 5 o baralho era o do jogo original (46).

## 4. Arquitetura

### 4.1 Módulo do Tatubum (`shared/src/games/kittens/`)

- `cards.ts`: tipos de carta (`tatubum`, `cafune`, `nemvem`, `ataque`, `pular`, `favor`,
  `embaralhar`, `espiar`, `latido`, `olhado`, `feitico`, `capivara`, `mico`, `quati`, `tamandua`, `preguica`,
  `boto`), nomes em PT-BR, quem aceita Nem vem! (`KITTENS_ACTION_KINDS`, com as 3 cartas de ação novas), os 5
  bichos (`KITTENS_BICHOS`, sem o Boto) e o coringa (`KITTENS_WILD`), e as fichas do Mau-olhado (`?i`). Cada carta
  física tem id próprio `<tipo>-<n>` (ex.: `ataque-3`) pra animar.
- `deck.ts`: `kittensPackCards(n)` (os pacotes, de onde sai a mão), `kittensLatidos(n)`/`kittensLatidoCards(n)`,
  `kittensBaseDeck(n)` (pacotes + Latidores) e `kittensDeal(...)` (§3). Os números dos Cafunés são sorteados, pra
  um Cafuné roubado não entregar de quem era.
- `types.ts`: fases `lobby → playing → gameover`. Estado: `players` (ordem dos assentos), `alive`,
  `hands`, `draw` (monte, topo no fim), `discard`, `out` (fora do jogo), `front` (cartas na frente: Tatu
  Latidor), `blind` (cegos pelo Mau-olhado), `current`, `owed`, `pending`, `choice`, `peeks`, `log`, `winner`.
  - `pending`: `{ by, play: { kind, cards, target, ask, as }, nopes: { by, card }[], resolvesAt }`.
  - `choice`: `{ kind: 'tatu' | 'cafune' | 'favor' | 'cinco' | 'mico' | 'quati' | 'latido' | 'feitico', who, deadline, ... }`
    (o Mico tem `by` e `waiting` no lugar de `who`; o par de Preguiça não precisa de escolha: o bicho vai junto da jogada).
  - `peeks`: `{ [jogador]: cards }`, a espiada de cada um, que fica à mostra entre os turnos; carta comprada ou tirada
    do monte sai dela, e o monte mudar de ordem perto do topo apaga todas, menos a de quem mexeu sabendo o que fez
    (§2 "Espiada à mostra").
  - `log`: últimas 30 entradas, com o que cada um pode ler (§4.3).
- Ações (`schema.ts`, zod): `start`, `play { cards: id[], target?, ask?, as? }`, `nope { card? }`, `draw`,
  `choose { … }` (posição do tatu, carta do Favor/Mico/Desarme, carta do descarte, `keep` do Quati/Feitiço),
  `again`, `lobby`. Quem está cego manda fichas `?i` no lugar dos ids da mão.
- `rules.ts`: `applyKittensAction` (valida turno, posse das cartas, combo, alvo); `settle.ts`:
  `settleKittens`, que é o `onPresenceChange` (presença e prazos) e roda antes de cada ação.
- `turn.ts` (diário, vez, eliminação, vitória), `play.ts` (lê a jogada), `choices.ts` (escolhas e
  escolha ao acaso).
- `resolve.ts`: ao vencer o prazo, **Nem vem! em número par → aplica; ímpar → cancela**. Em ambos os
  casos as cartas jogadas e os Nem vem! vão pro descarte.
- `view.ts`: `viewFor` (§4.3) e `nextDeadline` = o menor entre `pending.resolvesAt` e
  `choice.deadline`.

### 4.2 Pilha de resolução com prazo

1. Uma jogada que aceita Nem vem! entra em `pending` com `resolvesAt = ctx.now + 5000`.
2. `nope` de qualquer vivo com Nem vem! na mão → a carta sai da mão, entra em `pending.nopes`, e
   `resolvesAt = ctx.now + 5000` de novo.
   - **Nem vem! atrasado (pedido do Rafa, 2026-10-20).** Antes, dois Nem vem! quase juntos viravam Nem vem! em
     cima de Nem vem! (o segundo anulava o primeiro sem querer). Agora o `nope` leva o que o jogador viu ao clicar:
     `at` = quantos Nem vem! já havia na carta no ar (`pending.nopes.length`) e `on` = a primeira carta da jogada no
     ar (`pending.play.cards[0]`; os ids de carta são únicos, então isso identifica a jogada sem mudar o estado). Vale
     o que chegou primeiro; se `at` não bate, o servidor recusa com `nope_late` ("Alguém deu Nem vem! antes de você:
     sua carta voltou pra mão.") e nada muda: a carta fica na mão e a janela é a que o primeiro já reiniciou, então
     ele tem 5 s pra decidir de novo (agora vendo o Nem vem! do outro, com `at` novo). Se `on` não bate (resolveu e
     outra carta subiu com o mesmo número de Nem vem!), recusa com `nope_stale`. **(decisão)** `on` em vez de um
     número de sequência no `pending`: não precisa de compatibilidade com sala salva. `at`/`on` são opcionais: sem
     eles (site antigo em cache) vale como antes. Mesa (botão, tecla N, arrastar o Nem vem! ou a ficha do cego pra
     mesa) e bots mandam os dois.
   - **Espera de 2 s entre um Nem vem! e outro (pedido do Rafa, 2026-10-21).** Mesmo com `at`/`on`, ainda dava pra
     usar dois Nem vem! por engano (o segundo clique chegava logo depois de o primeiro aparecer). Agora, depois de um
     Nem vem! aceito, qualquer outro na mesma carta no ar é recusado com `nope_cooldown` ("Espere: acabaram de dar
     Nem vem! (2 s).") até passarem `KITTENS_NOPE_COOLDOWN_MS` = 2000 ms desse Nem vem!; nada muda (a carta fica na
     mão, o prazo não mexe). O primeiro Nem vem! de uma jogada não espera. A espera conta sempre do último Nem vem!.
     Ordem das recusas: `nope_stale` e `nope_late` primeiro (mais específicos), depois `nope_cooldown`.
     **(decisão)** Sem estado novo: a hora do último Nem vem! é `pending.resolvesAt - KITTENS_NOPE_MS` (só o `nope`
     mexe no `resolvesAt` depois da jogada), então salas no ar continuam valendo. A mesa (computador e celular) apaga
     o botão NEM VEM! mostrando quanto falta ("NEM VEM! 2s", "1s", pela hora do servidor); a tecla N e arrastar o
     Nem vem! (ou a ficha do cego) pra mesa só mostram o aviso "Espere…"; a barrinha continua correndo. Os bots não
     decidem durante a espera (nem gastam a decisão daquele número de Nem vem!) e voltam a olhar quando ela acaba.
3. O alarme da sala chama `onPresenceChange` com `ctx.now ≥ resolvesAt` → `resolve.ts` aplica.
4. Se o efeito pede escolha (Favor, 4 bichos diferentes), abre `choice` com `deadline = now + 30000`.
5. Comprar, Cafuné e explodir **não** passam pela pilha: acontecem na hora.

A sala genérica não muda: o Retratim já trouxe `ctx.now`, `nextDeadline` e o `now` na mensagem
`state`, que o site usa pra desenhar a barrinha igual pra todos.

### 4.3 Segredos (`viewFor`)

- Sua mão inteira; dos outros, só a **quantidade** de cartas.
- Monte: só a quantidade e quantos tatus ainda estão nele (informação que todos podem deduzir).
- Descarte: público, inteiro. Fora do jogo (`out`: tatus que explodiram, mãos de quem saiu): público
  também, como no original (as cartas ficam viradas na frente de quem explodiu).
- Espiadas (pedido do Rafa, 2026-10-20): cada um vê só a **própria** (`peek`); dos outros, só **quem** tem espiada
  (`peekers`, público) e o diário "Ana espiou o futuro". O monte continua secreto pra cada um, menos a própria espiada
  (a simulação aleatória confere visão por visão).
- Favor e par: a carta que trocou de mão aparece só pros dois; os outros leem "Caio roubou uma
  carta da Bia".
- Cafuné: a posição do tatu só quem escondeu sabe; os outros leem "Ana escondeu o tatu".
- `choice`: quem escolhe vê as opções; os outros veem quem está escolhendo e o relógio. No Cafuné, a
  visão não leva o id do tatu (junto com o tatu tirado do monte quando alguém cai, ele entregaria a
  posição). A carta de cima do Quati e a de baixo do Feitiço só pra quem escolhe; a escolha do Latidor é pública.
- Cartas na frente (`front`, o Tatu Latidor): públicas.
- Mau-olhado: todos sabem quem está cego (`blind`); o cego vê fichas `?0…` no lugar da mão e nenhum id da própria mão
  (nem no diário: evento com carta que está na mão dele chega com `card: null`).

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
  `Pick5Panel`, `AskPicker` (bicho do par de Preguiça), `QuatiPanel` (fica/fundo), `PeekPanel`, `Boom` (quadro do BUM!), `Log`
  (diário lateral), `Caption` (legenda em quadrinho no topo).
- Bots só em desenvolvimento (`web/src/dev/kittensBots.ts`): jogam cartas ao acaso, às vezes dão Nem
  vem!, sempre compram no fim e escolhem ao acaso.
- `catalog.ts`: nome "Tatubum", `mobile: false`, `playable: false` até o Plano T2.

## 5. Telas

Palco de 900 de altura escalado, **que cresce na largura até a da janela** (como o `fitStage` do
Diquisti): o fundo do cerrado, o topo e os assentos ocupam a tela toda; o bloco central (mesa, mão,
diário) cresce junto até 1760 de largura. Adversários em arco no topo, monte e descarte no centro, carta
no ar entre os dois, sua mão embaixo, diário à direita.

**Assentos:** o **bichinho que a pessoa escolheu ao entrar** (os mesmos dos outros jogos), convertido em
pixel art (o SVG do site desenhado numa grade de 26×26 com as cores encaixadas na paleta do próprio
bichinho; aprovado no protótipo). Embaixo, o nome e a **quantidade de cartas bem visível**: leque de
versinhos + número grande em amarelo na fonte pixelada.

**Lobby:** o mesmo fluxo dos outros jogos (estante → criar sala → link/código → apelido e bichinho), com
a cara do Tatubum (fundo do cerrado, botões chanfrados, bichinhos em pixel art na lista de quem está).

### 5.1 Jogar

- **Arrastar, como no Diquisti:** arrastar uma carta dentro da mão troca a ordem (a ordem é só do seu
  PC); arrastar pra mesa joga (se a carta faz parte da seleção, vai a seleção inteira: par, trio, 5);
  arrastar Favor/par de Mico até um adversário já joga nele; arrastar Nem vem! pra mesa com carta no ar dá
  Nem vem!; no Favor que você deve, arrastar a carta pra mesa entrega.
- Clicar seleciona (a carta sobe); duplo clique joga uma carta sozinha; o botão "JOGAR …" também joga.
- Favor, Mau-olhado e par de Tucano pedem o alvo (clicar no assento ou arrastar as cartas pra ele): os adversários válidos ganham contorno e você clica num deles.
- Selecionar 2, 3 ou 4 cartas que formam combo mostra o botão "jogar par / trio / 4 bichos". No par de
  Preguiça, aparece a lista dos 6 bichos pra pedir.
- Quem tem vez pulada (Tucano) ganha o selo "PULA" no assento (×2 se tiver duas); o Tucano voa até o alvo e, quando a
  vez dele é pulada, o assento pisca e o diário diz "X teve a vez pulada".
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
- **Favor:** o alvo vê a própria mão com "escolhe uma carta pra dar pro Caio" e o relógio de 30 s. No trio de
  Favor, "DÊ 3 CARTAS PRA CAIO", depois "MAIS 2", "MAIS 1"; os outros leem "Bia vai dar 3 cartas pro Caio".
- **Espiar:** painel só seu com as 3 do topo, na ordem, ao lado do monte; fica lá depois que a vez passa e perde as
  cartas que forem compradas (pedido do Rafa, 2026-10-20). Quem tem espiada ganha um olhinho no assento.
- **4 bichos diferentes:** painel com o descarte pra escolher.
- **Pegada do par de Mico** (pedido do Rafa, 2026-10-20): o mesmo quadro abre pra quem jogou, "PEGUE UMA DAS
  DESCARTADAS", só com as cartas descartadas no par acesas; os outros leem "Ana vai pegar uma das descartadas…".
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

### 5.5 Animações e efeitos (pedido do usuário, 2026-10-19)

As cartas e a mesa têm que ser **animadas**, no espírito pixel art (movimentos em degrau com
`steps()`, partículas quadradas, flashes curtos). Lista inicial, pra escolher e calibrar vendo no
protótipo:

- **Mão:** passar o mouse levanta a carta com um brilho de borda; cartas escolhidas pra combo
  ficam com a borda piscando.
- **Comprar:** a carta sai do monte, vira (flip em degraus) e desliza pra mão; pros outros, o verso
  vai pro assento de quem comprou.
- **Jogar:** a carta voa da mão pro centro com um rastro de pixels; o ícone da carta anima (2–3
  quadros) enquanto está no ar.
- **Nem vem!:** carimbo por cima da carta no ar, com flash vermelho e um "X" na de baixo; os 5
  blocos da barrinha voltam a acender.
- **Ataque:** espada de pixel cortando e seta até o próximo; o selo "2 turnos" pulsa.
- **Embaralhar:** as cartas do monte saltam e trocam de lugar.
- **Espiar:** pra quem jogou, as 3 de cima levantam e brilham; pros outros, um olho pisca no monte.
- **Favor / par / trio:** a carta voa de uma mão pra outra (de verso pra quem não pode ver).
- **Tatubum comprado:** a carta treme, o pavio solta faíscas; com o desarme, **o tatu soldado (arte da
  carta de desarme, recortada) entra andando pela mesa, corta o fio com o alicate (faísca + "clic") e sai
  andando** — pedido do Rafa, aprovado no protótipo; o painel de esconder o tatu só abre depois; sem Cafuné, **BUM** com explosão de partículas, tela tremendo e flash.
- **Vitória:** fogos de pixel em cima do vencedor.
- **Fundo:** estrelas piscando, vaga-lumes e nuvens andando (§5.4).

Tudo respeita `prefers-reduced-motion` (sem tremor de tela nem flash; só troca de estado).

**Sons** (baixos, como no Diquisti): papel ao jogar carta, "tic" nos últimos 2 s da barrinha,
"BUM" abafado na explosão, "ronron" no Cafuné.

## 6. Arte das cartas

- **19 ilustrações**: as 18 cartas + o verso, todas do Flow (Tatu Latidor = tatu numa casinha de cachorro latindo;
  Mau-olhado = tatu botando mau-olhado; Feitiço = tatu feiticeiro com caldeirão; Boto = boto-cor-de-rosa; Tucano =
  tucano-toco, fundo cobalto `#3b5bc4`). **Pixel art** (sprite de bicho/objeto com contorno
  escuro, poucas cores, fundo liso, como a referência do tatu), sem texto na imagem (o nome da carta
  é desenhado pelo site).
- Geradas no **Google Flow** (mesmo processo do Diquisti, ver `CLAUDE.md`), prompts em
  `docs/kittens/cartas-prompts.md`.
- Script `npm run kittens:cartas -- <pasta>` converte pra `web/public/kittens/cards/<tipo>.webp`.
- Até lá (T1, protótipo e T2), arte provisória: ícone + cor por tipo.

## 7a. Histórico (pedido do usuário, 2026-10-19)

No molde do Diquisti (`docs/superpowers/specs/2026-10-17-diquisti-historico-design.md`), com a cara do
Tatubum.

- **Gravação:** uma linha por **partida terminada** (alguém venceu), numa tabela nova do D1 (migração
  que só cria). Guarda: sala, id da partida (sala + momento do "começar"), data, número de jogadores, e por
  jogador: nome e bichinho daquele momento, **posição de saída** (1º a explodir, 2º… ou vencedor), como
  saiu (explodiu / caiu), **Nem vem! dados** e **Cafunés usados**. Partida com bot não grava; partida que
  volta pro lobby antes do fim não grava. Grava uma vez só (`ON CONFLICT DO NOTHING`), como os outros.
- **Regras:** o estado ganha contadores por jogador (Nem vem! dados, Cafunés usados) e a ordem de saída,
  porque o diário guarda só as últimas 30 entradas.
- **Aba "histórico"** (`#/kittens/historico`):
  1. **Partidas:** mais novas primeiro, 20 por página + "carregar mais"; data, vencedor com o bichinho, e
     a fila de quem explodiu, na ordem.
  2. **Estatísticas da galera** (top 3 com bichinho), escolhidas pelo usuário: **maior % de vitórias**
     (mín. 10 partidas) e **mais vitórias** (total, sem mínimo; as duas no lugar do antigo "quem mais vence",
     pedido do Rafa, 2026-10-28), **quem explode primeiro** (vezes que foi o 1º a sair, mín. 3
     partidas) e **rei do Nem vem!** (média de Nem vem! por partida, mín. 3 partidas).
- `GET /history/kittens` público, no-cache, mesmo limite por IP dos outros.

## 7. Erros e casos de borda

- Ação fora da vez, carta que não está na mão, combo inválido, alvo sem carta ou morto, Nem vem!
  sem carta no ar, jogar com carta no ar → erro com mensagem PT-BR, estado inalterado.
- Nem vem! chegando junto com o fim do prazo: vale o que o servidor recebeu antes de resolver
  (ordem do Durable Object).
- Reconexão: a view traz tudo pra redesenhar, inclusive `peek` e `choice` ainda abertos.
- Estado salvo por uma versão anterior (sem `front`/`blind`): completado na entrada do motor (§2 "Motor e segredo").
- Deploy derruba a sala por alguns segundos → reconecta como nos outros jogos (não fazer deploy em
  noite de jogo).

## 8. Testes

- **`shared/`** (TDD): baralho por número de jogadores (2, 5, 6, 8); distribuição; comprar,
  Cafuné (todas as posições) e explodir; Ataque acumulando (exemplos da §2) e Pular sob ataque;
  Nem vem! par/ímpar, cadeia reiniciando os 5 s, Nem vem! do próprio autor; cada combo (os 5 pares,
  trio com e sem Desarme na mesa, 4 bichos diferentes com descarte vazio); prazos das escolhas (acaso no
  fim); segredos do `viewFor`; presença (queda < 30 s, eliminação, tatu removido, carta no ar de
  quem saiu); vitória por explosão e por queda; `nextDeadline`.
- **`server/`**: `POST /rooms { game: 'kittens' }`, mão de cada um e erro em PT-BR. O alarme que
  resolve a carta no ar é testado na sala (`shared/test/room-games.test.ts`: `nextAlarmAt` + `tick`),
  como no Retratim.
- **Simulação aleatória** (`shared/test/kittens-fuzz.test.ts`): partidas com jogadas, quedas e prazos
  ao acaso, conferindo a cada passo que nenhuma carta some e que o monte tem vivos − 1 tatus.
- **`web/`**: componentes principais com dados de teste; bots.
- **E2E**: partida curta com 3 navegadores pela página do Tatubum, jogando por WebSocket como o
  `e2e/dixit-historico.spec.ts` onde precisar.
- **Manual**: protótipo e bots com 2, 5 e 8 jogadores.

## 9. Ordem de construção

1. **Plano T1 — regras:** módulo em `shared/`, registro, `pendingHistoryRecord`, catálogo com
   "Tatubum · em breve", teste no servidor.
2. **Protótipo** (`prototipo/tatubum/`): só front, regras reais empacotadas (como o do Retratim),
   bots, pra sentir o ritmo dos 5 s e das escolhas.
3. **Plano T2 — mesa no site:** lobby, telas, arrastar, bichinhos em pixel art, sons, bots,
   `playable: true`, E2E.
4. **Plano T4 — histórico** (§7a): contadores nas regras, tabela no D1, rota e aba.
5. **Plano T3 — artes:** prompts, Flow, script e as cartas no site.
6. Depois, no seu plano: **celular**.

**Sessões em paralelo:** o Cama-Leão (`camelio`) está sendo feito em outra worktree e mexe nos
mesmos arquivos compartilhados (`registry.ts`, `catalog.ts`, `history.ts`, `Game.tsx`). Quem
mergear depois resolve o conflito (normalmente só somar as duas entradas).

## 10. Fora de escopo (esta versão)

- Celular.
- Expansões (Imploding Kittens, Streaking Kittens etc.) e outras cartas novas além das 4 de 2026-10-20 (Tatu
  Latidor, Mau-olhado, Feitiço e Boto, em §2 "Cartas novas").
- Arte diferente por cópia da mesma carta.
- Tempo de turno.
