# Estante de jogos e histórico por jogo — design

Data: 2026-10-16. Pedido do usuário depois do Plano 4 (site no ar):

> "a página inicial do cartolina deve ser uma página que mostra todos os jogos;
> clicando no ITO, por exemplo, você ganha acesso a criar a sala e ao histórico
> desse jogo. A parte de grupo não é necessária: todo histórico deve ficar salvo
> na aba de histórico dentro dos jogos."

Este documento substitui a §11 da spec do ITO
(`2026-10-15-cartolina-ito-design.md`, histórico do grupo). Ele também
substitui a §4 da spec do Dixit (`2026-10-15-dixit-design.md`, "estante de jogos
com grupos") no que diz respeito à tela inicial e aos grupos.

## 0. Decisões

- **Grupos deixam de existir.** O histórico é **um por jogo** e é **aberto a
  qualquer pessoa que abra o site**. Escolha do usuário: o site é da galera, e
  quem achar o endereço também vê as partidas e as dicas.
- **Dados:** histórico por jogo de verdade (abordagem A). Uma migração do D1
  guarda todas as rodadas existentes como rodadas do ITO e apaga a tabela de
  grupos.
- **Ordem:** a implementação começa **depois que o D1 do Dixit** (sala genérica
  com `gameId`, registro `GAMES` em `shared/src/games/registry.ts`) estiver no
  `main`, e usa esse registro. O D2 do Dixit (estante) segue este documento.

## 1. Telas e navegação (`web/`)

Rotas (hash, como hoje):

| Rota | Tela |
|---|---|
| `#/` | Início: estante de jogos |
| `#/<jogo>` (ex.: `#/ito`) | Página do jogo, aba **jogar** |
| `#/<jogo>/historico` | Página do jogo, aba **histórico** |
| `#/sala/<CÓDIGO>` | Sala (como hoje; a mesa é escolhida pelo `gameId` da sala) |
| `#/g/<qualquer-coisa>` | Redireciona para `#/ito/historico` (links antigos de grupo) |

`<jogo>` é um id do registro `GAMES` (`ito`, `dixit`). Id desconhecido volta
para o início.

### 1.1 Início — estante de jogos

- Logo + frase como hoje. Uma **capa por jogo**: ITO no estilo cartolina~,
  Dixit no estilo "conto ilustrado". Capas trocáveis
  (`web/public/covers/<jogo>.webp`); a primeira versão é montada no código,
  como já previa a spec do Dixit.
- Clicar na capa leva para a **página do jogo** (`#/<jogo>`). Clicar na capa
  não cria sala.
- Embaixo das capas: **"entrar com código"** (4 letras), que leva a
  `#/sala/<CÓDIGO>` de qualquer jogo.
- Some a seção "grupos" e a lista de grupos lembrados.

### 1.2 Página do jogo

Cabeçalho com a capa pequena, o nome do jogo e "← jogos" (volta ao início).
Duas abas, cada uma com rota própria (dá para mandar o link direto da aba):

- **jogar:**
  - "criar sala": `POST /rooms { game }`, depois vai para a sala;
  - "entrar com código";
  - "como jogar": regras curtas do jogo, num texto que vem do registro do jogo
    no web.
- **histórico:** o conteúdo da página de grupo de hoje, sem o grupo:
  - números: rodadas, % de vitórias no livre, campanhas zeradas, maior
    sequência sem erro, quem mais acerta, temas mais jogados;
  - lista de partidas, 20 por página com "carregar mais"; cada partida abre e
    mostra a fila revelada com as dicas;
  - jogo que ainda não grava histórico (Dixit): "o histórico do Dixit vem em
    breve".

Os componentes de números e partidas saem de `GroupPage.tsx` e viram
`web/src/screens/history/` (sem nome de grupo, sem "copiar link do grupo", sem
"criar sala do grupo").

### 1.3 Sala, lobby e mesa

- O lobby mostra "📜 histórico do ITO", que leva a `#/ito/historico` e abre em
  nova aba, como o link do grupo fazia.
- No topo da mesa, o link do grupo embaixo do logo vira "📜 histórico", que
  leva para o histórico do jogo da sala.
- "essa sala acabou" → "criar sala nova" cria uma sala **do mesmo jogo**. O link
  "voltar pro grupo" vira "ver o histórico".

### 1.4 Celular

Igual ao Plano 4: estante, página do jogo e histórico funcionam em aparelho de
toque. "criar sala" e "entrar com código" mostram o aviso "abre no computador",
e a rota da sala também.

## 2. Banco e servidor (`server/`)

### 2.1 Migração `0002_rounds_by_game.sql`

```sql
CREATE TABLE rounds_v2 (
  id TEXT PRIMARY KEY,
  game TEXT NOT NULL,
  room_code TEXT NOT NULL,
  reveal_key TEXT NOT NULL,
  played_at INTEGER NOT NULL,
  mode TEXT NOT NULL,
  level INTEGER NOT NULL,
  outcome TEXT NOT NULL,
  errors INTEGER NOT NULL,
  campaign_id TEXT,
  theme_json TEXT NOT NULL,
  players_json TEXT NOT NULL,
  cards_json TEXT NOT NULL,
  UNIQUE (game, room_code, reveal_key)
);
INSERT OR IGNORE INTO rounds_v2
  SELECT id, 'ito', room_code, reveal_key, played_at, mode, level, outcome, errors,
         campaign_id, theme_json, players_json, cards_json
  FROM rounds;
DROP TABLE rounds;
DROP TABLE groups;
ALTER TABLE rounds_v2 RENAME TO rounds;
CREATE INDEX rounds_game_played ON rounds (game, played_at DESC);
```

- Nenhuma rodada se perde. O que some é o nome dos grupos. Em produção há um
  grupo só, "Galera da call".
- As colunas continuam no formato do ITO. O histórico do Dixit terá sua
  própria migração quando existir.
- Teste da migração com um banco no formato antigo (grupos + rodadas),
  conferindo contagem, conteúdo e `game = 'ito'`.

### 2.2 Salas

- `Room.group` e `RoomGroup` saem. `RoomView.group` sai.
- **Toda rodada revelada de ITO entra no histórico do ITO.** A decisão de gravar
  vem do registro: só jogos que gravam histórico gravam.
- O registro pendente (`pendingRound:*`) passa a ter `game` em vez de
  `groupId`. Entradas antigas com `groupId` (deixadas por um servidor antigo na
  janela do deploy) são gravadas como `ito`.
- Salas antigas salvas com `group` carregam normalmente; o campo é ignorado.

### 2.3 Rotas

- **Nova:** `GET /history/:game?before=<playedAt>` →
  `{ game, rounds, stats, nextBefore }`. Mesmo formato e regras de hoje:
  - páginas de 20;
  - `stats` só na primeira página (`null` nas seguintes);
  - `before` inválido → 400.
- Jogo inexistente → 404 `not_found`. Jogo que existe mas não grava histórico
  → 404 `no_history`; o site mostra "em breve".
- **Saem:** `POST /groups`, `GET /groups/:slug` e `POST /groups/:slug/rooms`
  (passam a dar 404). Sai também o `GROUP_LIMITER`. O limite de criar salas
  (`ROOM_LIMITER`, 10 por minuto por IP) continua.
- Criar sala: `POST /rooms { game }`, no formato do D1 do Dixit.
- CORS, 403 de origem e 413 do Plano 4 continuam iguais.

### 2.4 Código que sai

- **`shared/`:** `RoomGroup`, `cleanGroupName`, `GROUP_NAME_MAX` e
  `GroupResponse`. Este último vira `HistoryResponse`, com `game` no lugar de
  `group`.
- **`server/`:** `createGroup`, `findGroup`, `randomSlug`/`SLUG_RE` (se não
  forem usados em outro lugar), as rotas e os testes de grupo.
  `listRounds`/`allRounds` passam a filtrar por `game`.
- **`web/`:**
  - `GroupPage`;
  - `createGroup`/`getGroup`/`createGroupRoom` em `api.ts`;
  - `loadGroups`/`rememberGroup` em `identity.ts` (a chave antiga no
    `localStorage` é simplesmente ignorada);
  - a rota `#/g/` vira só o redirecionamento.

## 3. Testes

- **`shared/`:** `HistoryResponse`. Os tipos de grupo saem.
- **`server/`:**
  - migração `0002` em cima de dados no formato antigo;
  - `GET /history/ito` (primeira página com `stats`, paginação, `before`
    inválido);
  - `GET /history/dixit` → 404 `no_history`;
  - `GET /history/xyz` → 404 `not_found`;
  - rodada de ITO revelada grava com `game = 'ito'`;
  - pendente antigo com `groupId` grava como `ito`;
  - rotas de grupo → 404.
- **`web/`:**
  - estante;
  - página do jogo e suas abas, incluindo o "em breve" do Dixit;
  - redirecionamento de `#/g/...`;
  - lobby e mesa com o link "histórico";
  - "essa sala acabou" criando sala do mesmo jogo.
- **E2E:**
  - "sala de grupo aparece no histórico" vira "rodada aparece no histórico do
    ITO" (início → ITO → criar sala → jogar → aba histórico);
  - os outros dois testes passam a criar a sala pela página do ITO.
- Antes do merge: aplicar a migração num D1 local populado com o formato antigo
  e conferir o histórico na tela.

## 4. Publicação

- O merge no `main` publica sozinho: a migração roda antes do servidor novo,
  como no Plano 4.
- **Não fazer o merge durante uma noite de jogo:** as salas abertas caem por
  alguns segundos.
- Depois do merge:
  - `GET /history/ito` em produção mostra a rodada de 2026-10-16 (vitória
    1 → 71);
  - o link antigo do grupo (`#/g/d3jj53e9xj`) cai no histórico do ITO.

## 5. Fora de escopo

Histórico do Dixit, contas e login, histórico privado, celular jogável
(Plano 5), manual de marca (Plano 6).
