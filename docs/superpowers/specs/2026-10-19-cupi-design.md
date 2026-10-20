# cartolina~ — Cúpi (design)

Data: 2026-10-19. Quarto jogo do cartolina~, sobre a base descrita em
`2026-10-15-cartolina-ito-design.md` e na sala genérica do Diquisti
(`2026-10-15-dixit-design.md` §3). É a nossa versão do **Coup** (Rikki Tahta,
Indie Boards & Cards), só o jogo **básico** (sem a expansão Reforma).

**Nome:** o jogo se chama **Cúpi** em tudo que o jogador vê. O id interno é
`coup` (`gameId`, pastas `games/coup`, classes `.coup`, `web/public/coup/`),
como DITU/`ito`, Diquisti/`dixit` e Retratim/`pictures`.

## 1. Objetivo

Jogar Coup com os amigos na call (Discord), no computador ou no celular. Cada um
tem 2 cartas secretas de personagem e moedas; na sua vez faz uma ação, dizendo
(de verdade ou blefando) que tem o personagem dela; os outros podem duvidar ou
bloquear. Quem perde as duas cartas sai; o último com carta vence.
Critério de sucesso: 2 a 6 pessoas jogam várias partidas seguidas na mesma sala,
sem travar, entendendo pelo diário quem disse ser o quê, e com um placar de
vitórias da noite.

Decisões do usuário (2026-10-19):

- **Coup básico**, 5 personagens × 3 cópias, **2 a 6 jogadores**.
- **Janela de reação com cronômetro + "deixa"**: **10 s**; se todos que podem
  reagir clicam "deixa", resolve na hora; se o tempo acaba, a ação passa.
- **Revanche com placar**: "jogar de novo" na mesma sala e placar de vitórias da
  noite na mesa.
- **Histórico: só as partidas** (sem estatísticas e sem replay por enquanto).
- **Computador e celular** desde o começo (celular em pé, como o DITU).
- **Artes dos 5 personagens geradas no Google Flow**, no estilo da identidade.
- Identidade **"cartaz de propaganda"** (§5.4).
- Caminho: **regras → protótipo com bots → mesa real única** que se adapta ao
  celular (§9).

## 2. Regras implementadas

### Preparação (ao clicar "começar" ou "jogar de novo")

- Só o anfitrião começa; precisa de 2 a 6 jogadores ativos (os que estão na
  sala na hora). Quem entra depois assiste e joga a próxima partida.
- Baralho de 15 cartas: 3 de cada personagem — **Duque, Assassino, Capitão,
  Embaixador, Condessa** — embaralhado com `ctx.rng`.
- Cada jogador recebe 2 cartas viradas pra baixo e **2 moedas**. Com **2
  jogadores**, quem começa recebe **1 moeda** (regra oficial).
- **Tesouro**: 50 moedas no total; o tesouro é 50 menos as moedas dos
  jogadores. Ganhar moeda com o tesouro vazio dá só o que tiver. É raro com
  gente jogando, mas acontece com muitos no automático (6 ausentes esvaziam o
  tesouro com todos entre 8 e 9 moedas; ver §2 Presença).
- **Quem começa:** na primeira partida da sala, sorteado; na revanche, quem
  venceu a anterior (se não estiver jogando, sorteado). A vez segue a ordem dos
  assentos, pulando quem está fora.

### Ações (uma por vez)

Com **10 moedas ou mais**, a única ação permitida é o **golpe**.

| Ação | Personagem | Custo/efeito | Bloqueio |
|---|---|---|---|
| Renda | — | +1 | não; ninguém duvida |
| Ajuda externa | — | +2 | qualquer um, dizendo **Duque** |
| Golpe | — | paga 7, alvo perde 1 carta | não; ninguém duvida |
| Taxar | Duque | +3 | não |
| Assassinar | Assassino | paga 3, alvo perde 1 carta | só o alvo, dizendo **Condessa** |
| Extorquir | Capitão | tira 2 do alvo (ou o que ele tiver, se < 2) | só o alvo, dizendo **Capitão** ou **Embaixador** |
| Trocar | Embaixador | compra 2 do baralho, fica com tantas quantas cartas vivas tem, devolve o resto | não |

- O alvo tem que estar vivo e não pode ser você.
- O custo (7 do golpe, 3 do assassinato) é pago na hora da declaração.
- **Moedas do Assassino:** voltam pra ele se ele **perder uma dúvida**; ficam
  perdidas se ele for **bloqueado** (inclusive bloqueio verdadeiro ou não
  desafiado).

### Reação (janelas de 10 s)

1. **Janela da ação.** Abre quando a ação declara personagem (taxar,
   assassinar, extorquir, trocar) ou pode ser bloqueada (ajuda externa). Renda e
   golpe resolvem direto.
   - Podem reagir todos os outros jogadores vivos, cada um só com o que pode:
     **duvidar** (se a ação declara personagem), **bloquear** (ajuda externa:
     qualquer um; assassinar/extorquir: só o alvo) e **deixa**.
   - O primeiro "duvidar" ou "bloquear" que o servidor recebe fecha a janela;
     ações de reação que chegam depois recebem o erro `window_closed` (o site
     mostra "Beto duvidou primeiro").
   - Se **todos que podem reagir** clicaram "deixa", ou o prazo acabou, a ação
     acontece.
   - Quem já deixou aparece pra todos ("Beto deixou").
   - Cada janela tem um número (`id`); o site manda junto da reação o número da
     janela que o jogador viu, e reação de uma janela que já fechou (ou depois
     do prazo) recebe `window_closed`. Assim um "duvidar" atrasado não vira
     dúvida do bloqueio que abriu logo depois (decidido na execução do C1).
2. **Janela do bloqueio.** Quando alguém bloqueia, abre outra janela de 10 s
   pra **qualquer jogador vivo, menos quem bloqueou** (inclusive quem fez a
   ação), com **duvidar do bloqueio** e **deixa**. Ninguém duvidou: a ação é
   bloqueada e a vez passa.
3. **Dúvida.**
   - **O desafiado tinha a carta:** ele mostra a carta (fica visível no
     diário), quem duvidou **perde uma carta**, e a carta mostrada volta pro
     baralho, que é embaralhado, e ele compra uma nova.
   - **Não tinha:** ele perde uma carta e a ação (ou o bloqueio) não acontece.
   - **Dúvida da ação que falhou + ação bloqueável:** se a ação ainda pode ser
     bloqueada e o alvo continua vivo, abre a **janela só de bloqueio**: 10 s só
     pro alvo, com **bloquear** e **deixa**. (É assim que quem duvida do
     Assassino e erra pode perder as duas cartas.) Na ajuda externa não há
     dúvida da ação, então não existe esse caso.
   - Se o alvo de assassinar/extorquir sai do jogo por causa da dúvida, a ação
     termina sem efeito.

### Perder uma carta

- Quem perde **escolhe** qual carta revela, **sem prazo** (o anfitrião não
  precisa destravar; amigos na call). Com uma carta só, ela vira sozinha.
- A carta revelada fica **virada pra cima** na frente do jogador, à vista de
  todos, e não volta pro baralho.
- Sem cartas viradas pra baixo, o jogador **está fora**: as moedas dele voltam
  pro tesouro, ele segue assistindo, **sem ver** as cartas dos outros.

### Trocar (Embaixador)

Quando a troca acontece, só quem troca vê as cartas dele + as 2 compradas e
escolhe com quais fica (o mesmo número de cartas viradas pra baixo que tinha).
O resto volta pro baralho, que é embaralhado. Sem prazo.

### Fim e revanche

- Vence o **último com carta**. A tela de fim mostra o vencedor, com quais cartas
  ficou, e a ordem em que os outros saíram.
- O **placar de vitórias da noite** (por jogador, pelo id) vive no estado da
  sala e aparece na mesa durante e entre as partidas. Some quando a sala acaba.
- O anfitrião clica **"jogar de novo"** e começa outra partida (§2 Preparação)
  com quem está ativo.

### Presença (tolerância de 30 s, como nos outros jogos)

Depois de 30 s desconectado, o jogador vai pro **automático** até voltar (não é
eliminado):

- na vez dele: **renda**; com 10 moedas ou mais, **golpe num alvo sorteado**
  (também com 7 ou mais se o tesouro estiver vazio, senão a mesa trava; decidido
  na execução do C1, 2026-10-19);
- nas janelas de reação: **deixa** (conta na hora, a janela pode fechar antes do
  prazo);
- quando tem que perder carta: **uma carta sorteada**;
- na troca: fica com as cartas que já tinha.

Se o anfitrião sai, o anfitrião passa pro próximo, como nos outros jogos.

### Diário

Lista pública, na ordem, de tudo que aconteceu na partida, por exemplo:
"Ana disse Duque e pegou 3", "Beto duvidou: Ana tinha Duque. Beto perdeu um
Capitão", "Caio bloqueou como Condessa", "Duda está fora". Cartas que viraram
pra cima aparecem com o nome; cartas que voltaram pro baralho numa troca, não.
O diário recomeça a cada partida.

## 3. Personagens e artes

- **Nomes:** Duque, Assassino, Capitão, Embaixador, Condessa (os nomes da
  edição brasileira).
- **Artes:** 5 ilustrações (uma por personagem) geradas no **Google Flow**
  (Nano Banana, 3:4, **x2** por prompt, como o Diquisti), no estilo da
  identidade: **cartaz de propaganda em serigrafia**, poucas cores (vermelho,
  creme e preto), traço gráfico, personagens de uma corte distópica como no Coup
  original, **sem texto** na imagem. O usuário marca a escolhida com coração.
- **Lote de teste primeiro:** Duque e Condessa. Com o estilo aprovado, os outros
  três.
- Prompts em `docs/coup/cartas-prompts.md`; imagens em
  `web/public/coup/cartas/<personagem>.webp` (recorte central 2:3, 600×900,
  WebP q78, como as cartas do Diquisti), convertidas por um script pequeno
  (`npm run coup:cartas -- <pasta>`).
- **Verso da carta:** feito em código (vermelho com um emblema simples), não
  vem do Flow.
- Até as artes ficarem prontas (§9), as cartas usam um **ícone + nome** no
  lugar da ilustração.

## 4. Arquitetura

### 4.1 Módulo do Cúpi (`shared/src/games/coup/`)

- `types.ts`: `Character`, estado, ações, view. Fases: `lobby`, `turn` (esperando
  a ação da vez), `reaction` (janela da ação, do bloqueio ou só de bloqueio, com
  `deadline`, quem pode reagir e quem já deixou), `losing` (quem tem que
  escolher a carta e o que acontece depois), `exchange`, `over`.
- `deck.ts`: as 15 cartas e o embaralhar via `ctx.rng`.
- `rules.ts`: `applyAction` (a máquina de estados da §2), `onPresenceChange`
  (fecha janela vencida, faz as jogadas automáticas dos ausentes) e
  `nextDeadline` (o `deadline` da janela aberta; `null` fora dela).
- `schema.ts`: zod das ações: `start`, `restart`, `act {kind, target?}`,
  `pass`, `challenge`, `block {as}`, `lose {card}`, `exchange {keep}`.
- `view.ts`: `viewFor` mostra as suas cartas viradas pra baixo, as cartas
  viradas pra cima de todos, moedas, tamanho do baralho e tesouro, a janela
  aberta e o que **você** pode fazer nela, o diário e o placar. Esconde as
  cartas viradas pra baixo dos outros, a ordem do baralho e as 2 cartas da troca
  (só quem troca vê).
- `table.ts`: consultas puras (cartas viradas pra baixo, vivos, tesouro, quem
  bloqueia, por que uma ação não vale) usadas pelas regras e pela visão.
- O diário são dados (`CoupLogEntry`, em `types.ts`), não texto; o site escreve
  as frases.
- `record.ts` (Plano C4): resumo da partida pro histórico (§6).

Registro em `shared/src/games/registry.ts`: `coup`, `minPlayers: 2`,
`maxPlayers: 6`, `liveCursors: false` (cursor em cima de um assento entregaria
o alvo), `recordsHistory: true` a partir do Plano C4 (até lá `false`, e
`/history/coup` responde 404).

### 4.2 Servidor (`server/`)

- A sala (`room-do.ts`) é genérica; o prazo da janela usa o alarme que já existe
  pro `nextDeadline`.
- Histórico: migração nova `server/migrations/0004_coup_matches.sql`, que
  **só cria** a tabela `coup_matches` (nunca mexe nas outras); gravação pelo
  `pendingHistoryRecord` (`shared/src/history.ts`) com o caso `coup`, como o
  Diquisti; `INSERT ... ON CONFLICT DO NOTHING`; **partida com bot não grava**.
- `GET /history/coup` entra no `switch` de `server/src/index.ts`: 20 partidas
  por página, cursor `nextBefore`, `stats: null`.

### 4.3 Web (`web/src/games/coup/`)

- Mesa em React, **um layout só**: no computador, palco fixo 1440×900 escalado
  (como as outras mesas); no celular (`useLayout() === 'phone'`), layout em pé
  fluido. Componentes: assentos, palco (declaração + barra de 10 s + botões),
  sua mão, barra de ações, diário, painel de perder carta, painel de troca, fim
  de partida, placar da noite, lobby.
- Escolher alvo: depois de clicar golpe/assassinar/extorquir, os assentos
  válidos acendem e você clica (ou toca) num deles; "cancelar" volta.
- Bloquear contra extorsão pergunta "Capitão ou Embaixador".
- Catálogo (`web/src/games/catalog.ts`): nome "Cúpi", `mobile: true`, "como
  jogar" curto; a mesa entra no `switch` de `web/src/screens/Game.tsx` e a aba
  de histórico no de `GamePage.tsx`.
- **Bots de desenvolvimento** (só no `dev`): fazem ações válidas sorteadas,
  blefam de vez em quando, duvidam e bloqueiam com pouca chance, escolhem carta
  e troca ao acaso.
- **Sons:** os do site, baixos (o usuário acha os do DITU um pouco altos), mais
  um tique suave nos últimos 3 s da janela.
- Arquivos compartilhados que mudam (`catalog.ts`, `Game.tsx`, `GamePage.tsx`,
  `history.ts`, `registry.ts`, `index.ts` do servidor): combinar se houver outra
  sessão mexendo neles.

### 4.4 Protótipo (`prototipo/coup/`)

Página estática com as **regras reais** empacotadas pelo esbuild (global
`Cupi`, ações passando pelo schema zod como no servidor), uma mesa simples na
identidade e bots que blefam, duvidam e bloqueiam. Serve pro usuário sentir o
ritmo dos 10 s e ajustar o fluxo antes da mesa real. Entrada temporária no
`.claude/launch.json` pra abrir no painel.

## 5. Telas

### 5.1 Computador

- **Em cima:** os oponentes, cada um com nome, moedas, cartas viradas pra baixo
  (verso vermelho) e as já reveladas (de cara pra cima, riscadas). O da vez fica
  destacado.
- **No meio, o palco:** tesouro e baralho nos cantos; a declaração em letra
  grande ("Ana diz: sou **Duque** e pega 3"); a barra dos 10 s; os botões que
  **você** pode usar (duvidar / bloquear / deixa); embaixo, quem já deixou.
  Fora de janela, o palco diz de quem é a vez.
- **Embaixo:** suas duas cartas com a arte, suas moedas e as 7 ações (apagadas
  fora da sua vez; as que você não pode pagar ficam apagadas também).
- **Coluna à direita:** o diário, com a última entrada destacada.
- **Placar da noite:** linha discreta embaixo da mesa.

### 5.2 Celular (em pé)

A mesma ordem: oponentes numa grade em cima, o diário reduzido à última jogada
(tocar abre a lista toda numa folha que sobe), o palco no meio com botões
grandes, suas cartas e moedas, e as ações numa grade 4 × 2. Celular deitado
mostra "vira o celular em pé" (o aviso que já existe).

### 5.3 Painéis da sua vez

- **Perder carta:** "Você errou a dúvida. Escolha a carta que vai revelar" + as
  suas cartas viradas pra baixo + "revelar <personagem>".
- **Trocar:** "Fique com N das M cartas" + as cartas; marca N e confirma.
- **Fim:** "<vencedor> tomou o poder", com quais cartas ficou, quem saiu em que
  ordem, o placar da noite e "jogar de novo" (só o anfitrião; os outros veem
  "esperando o anfitrião").

### 5.4 Identidade — "cartaz de propaganda"

- Papel creme `#efe6d2`, mesa/palco `#e4d7bb`, papel das cartas `#f7f0e0`,
  tinta preta `#1d1a17`, texto apagado `#6b6152`, vermelho `#c8312b`.
- Letras: **Bebas Neue** pros títulos, nomes e a declaração; **Oswald** pro
  resto.
- Contornos pretos grossos (2px), cantos quase retos, botões de reação grandes
  (vermelho pra duvidar/bloquear, contorno pra deixa).
- Mesa **plana** (sem a inclinação 3D do DITU/Diquisti).

## 6. Histórico (só as partidas)

### 6.1 Gravação

Quando a partida chega em `over`, o estado gera o registro pendente (no mesmo
`put` do estado no Durable Object) com: id, código da sala, quando terminou,
jogadores (nome e cor, na ordem dos assentos), **ordem de eliminação**,
vencedor e **as cartas com que o vencedor terminou**. Partida com bot não grava.

### 6.2 Aba "histórico" (`#/coup/historico`)

Lista das partidas, da mais nova pra mais velha, 20 por vez com "ver mais":
data, quem jogou, quem venceu (com as cartas) e a ordem em que os outros
saíram. Sem estatísticas por enquanto.

## 7. Erros e casos de borda

- Ações recusadas pelas regras (o site não deixa chegar lá, mas o servidor
  confere): `not_your_turn`, `not_enough_coins`, `must_coup` (10+ moedas),
  `bad_target` (você mesmo, alguém fora), `cannot_react` (você não pode reagir
  nessa janela), `already_passed`, `window_closed`, `not_losing`,
  `bad_exchange` (número errado de cartas ou carta que você não tem).
- Duas pessoas duvidam ao mesmo tempo: vale a primeira que o servidor recebeu;
  a outra recebe `window_closed`.
- O prazo vence com o servidor dormindo: o alarme acorda a sala, que fecha a
  janela.
- O jogador da vez sai: depois de 30 s, automático (§2 Presença).
- Sobra só 1 jogador na sala no meio da partida (os outros saíram de vez):
  a partida continua com os ausentes no automático até alguém vencer.
- Quem entra no meio de uma partida vê a mesa como espectador e joga a próxima.

## 8. Testes

- **`shared/test/` (TDD):** cada ação; dúvida certa e errada da ação e do
  bloqueio; bloqueio sem dúvida; janela só de bloqueio depois de dúvida errada;
  quem duvida do Assassino e erra perde as duas cartas; alvo que sai por causa
  da dúvida; moedas do Assassino (volta na dúvida perdida, fica no bloqueio);
  1 moeda pra quem começa no jogo de 2; golpe obrigatório com 10+; troca com 2
  e com 1 carta viva; extorquir quem tem 0 ou 1 moeda; fim da partida;
  revanche, placar e quem começa; prazo (`nextDeadline`, janela fecha no prazo,
  fecha antes quando todos deixam); automático do ausente; `viewFor` não vaza
  carta escondida, baralho nem cartas da troca; diário; registro do histórico.
- **Servidor:** a janela fecha pelo alarme; migração só cria
  (`server/test/migration-*.test.ts`); `GET /history/coup`.
- **Web:** componentes da mesa (botões certos por janela, escolha de alvo,
  painéis de perder carta e troca, fim) e o layout do celular.
- **E2E:** uma partida curta com 3 navegadores (um deles em celular) jogando
  por clique; histórico gravado por WebSocket direto, como
  `e2e/dixit-historico.spec.ts`.

## 9. Ordem de construção

1. **Plano C1 — regras e base:** módulo `shared/src/games/coup/` completo com
   testes, registro, catálogo com o Cúpi **"em breve"** na estante.
2. **Protótipo** (`prototipo/coup/`): o usuário testa o ritmo com bots e aprova.
3. **Plano C2 — mesa:** computador e celular, bots de desenvolvimento, sons,
   E2E. Aqui o Cúpi fica jogável (com ícones no lugar das artes).
4. **Plano C3 — artes:** lote de teste (Duque e Condessa) no Flow, depois os
   outros três; script de conversão.
5. **Plano C4 — histórico:** migração, gravação, rota e aba.

Merge no `main` = publicar: só quando o Rafa pedir.

## 10. Fora de escopo (esta versão)

- Expansão Reforma (facções, tesouro dos convertidos, Inquisidor) e mesas de 7
  a 10.
- Estatísticas e replay no histórico.
- Prazo pra jogar na sua vez, pra escolher a carta perdida ou pra trocar.
- Chat dentro do jogo (a galera está na call).
- Variações de arte por personagem (uma arte por personagem).
