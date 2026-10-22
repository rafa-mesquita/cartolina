# Tatubum — histórico e celular (design)

Pedido do Rafa (2026-10-20): "quero implementar o histórico + mobile". Complementa o spec principal
`docs/superpowers/specs/2026-10-19-tatubum-design.md` (§7a já descrevia o histórico). São dois pedaços
independentes, feitos em paralelo (worktrees e PRs separados).

## 1. Histórico

Molde: o histórico do Cúpi (`coup`) — `shared/src/games/coup/record.ts`, `server/migrations/0004_coup_matches.sql`,
`server/src/coup-history-db.ts`, `server/src/coup-history-page.ts`, `web/src/games/coup/history/`, testes
`shared/test/coup-record.test.ts`, `server/test/coup-history-route.test.ts`, `server/test/migration-0004.test.ts`,
`web/test/coup-history.test.tsx` — e as estatísticas do Diquisti (`shared/src/games/dixit/summary.ts`,
`web/src/games/dixit/history/GaleraBoards.tsx`, stats só na primeira página).

### 1.1 O que muda nas regras (shared)
- `KittensState` ganha:
  - `match: number` — conta as partidas da sala (sobe a cada "começar"/"jogar de novo"); entra no id da partida
    (`${room.code}-${room.runStartedAt ?? 0}-${match}`, como no Cúpi).
  - `exits: { player: string; how: 'boom' | 'left' }[]` — a ordem em que cada um saiu (explodiu, inclusive pelo
    Tatu Latidor, ou caiu de vez). O vencedor não entra (ele é o `winner`).
  - `stats: Record<string, { nopes: number; defuses: number }>` — Nem vem! dados (cada `nope` aceito) e Desarmes
    usados (Tatubum e Latidor), por jogador.
  - Zerados em "começar"/"jogar de novo"/"lobby". `compat.ts` completa salas salvas sem esses campos (`match: 0`,
    `exits: []`, `stats: {}`).
- Nada disso aparece de um jeito que revele segredo (são públicos: quem saiu, quantos Nem vem! e Desarmes foram
  jogados já está no diário).

### 1.2 Gravação (shared + server)
- `registry.ts`: `kittens.recordsHistory: true`.
- `shared/src/games/kittens/record.ts`: `KittensMatchRecord` =
  `{ id, matchId, roomCode, playedAt, players: KittensPerson[] (ordem dos assentos), exits: { who: KittensPerson; how }[],
  winner: KittensPerson, perPlayer: { who: KittensPerson; nopes: number; defuses: number }[] }`, com
  `KittensPerson = { name, color }` daquele momento. `pendingKittensRecord(room, now)` devolve `null` se a fase não é
  `gameover` ou não tem vencedor, se a chave já foi gravada (`recordedRevealKey`), se falta assento, ou **se alguém é
  bot** (`isBotName`). Partida que volta pro lobby antes do fim não chega a `gameover` → não grava.
- `history.ts`: caso `kittens` em `pendingHistoryRecord`, `PendingHistoryRecord`, `HistoryResponses` com
  `KittensHistoryResponse = { game: 'kittens', matches, stats: KittensStats | null, nextBefore }`.
- Estatísticas (puras, testadas), só na primeira página, com mínimo de **3 partidas** e top **3**:
  - **quem mais vence:** % de vitórias;
  - **quem explode primeiro:** vezes que foi o 1º a sair (`exits[0]`, explodiu ou caiu);
  - **rei do Nem vem!:** média de Nem vem! por partida.
  Identidade da pessoa: nome + cor, como nas estatísticas do Diquisti/DITU.
- Server: migração `0005_kittens_matches.sql` (só cria; tabela `kittens_matches` com `UNIQUE(room_code, match_id)`
  e índice em `played_at DESC`), `kittens-history-db.ts` (`INSERT … ON CONFLICT DO NOTHING`, listagem paginada),
  `kittens-history-page.ts`, casos em `historyPageOf` e no `room-do.ts` (`PendingRound`/`insertPending`).
  `GET /history/kittens` público, no-cache, mesmo limite por IP dos outros.

### 1.3 Aba "histórico" (web)
- `web/src/games/kittens/history/` (`KittensHistory.tsx`, hook de carga como `useCoupHistory`, CSS pixel art do
  cerrado, escopado). `GamePage.tsx` troca o "vem em breve" pelo componente.
- **Partidas:** mais novas primeiro, 20 por página + "carregar mais"; cada uma com data, o vencedor (bichinho em
  pixel art + nome) e a fila de quem saiu, na ordem (1º, 2º…), marcando quem "caiu" em vez de explodir.
- **Estatísticas da galera:** três quadros com o top 3 (bichinho + nome + número). Vazio: mensagem no tom do jogo.
- Textos só descrevem; sem dicas de estratégia.

## 2. Celular

Molde: o Cúpi em modo celular (mesmo componente com classe `coup--phone`, `useLayout()` de `web/src/lib/device.ts`,
gavetas com fundo escuro) — aqui dentro do motor imperativo `web/src/games/kittens/mesa.ts`.

### 2.1 Quando
- `catalog.ts`: `kittens.mobile: true`. O motor recebe o layout (`'phone' | 'desktop'`) do React
  (`useLayout()` em `KittensTable.tsx` → `createMesa(…, { layout })` e um `setLayout()` quando muda), e aplica a
  classe `kt-phone` no palco. O lobby (`KittensLobby.tsx`) também fica usável no celular (coluna, botões grandes).
- Celular deitado: aviso de girar (o `RotateNotice` do site já cobre todos os jogos).

### 2.2 Layout em pé (`kt-phone`)
- Palco sem a escala fixa de 1440×900: ocupa a tela (100dvh), em coluna.
- **Topo:** barra fina (vez/turnos, botões AS CARTAS, som, diário) e os adversários numa fileira compacta com rolagem
  pro lado se não couber: bichinho, nome curto, nº de cartas, PRÓXIMO/ordem, selo de turnos, olho de espiada, olho
  do cego, Latidor na frente, chip "pensando/escolhendo/caiu".
- **Meio:** monte (com contagem), carta no ar + barrinha do Nem vem! + botão NEM VEM!, descarte com o olho; a
  espiada (as 3 de cima) aparece ao lado do monte em miniatura.
- **Embaixo:** a sua mão grande em leque/rolagem horizontal, com a faixa dos turnos/cego por cima, e os botões
  (COMPRAR, JOGAR …, JOGAR ÀS CEGAS) grandes.
- **Diário:** gaveta que abre pelo botão da barra; a última linha aparece numa tira fina (como o `LastLine` do Cúpi).
- **Painéis e quadros** (Desarme/onde esconder, Favor, Mico, Quati, Feitiço, Preguiça/Boto, alvo, quadro do
  descarte, galeria, zoom, fim de jogo): gavetas/quadros de tela cheia com fundo escuro.
- **Efeitos:** todos continuam (voos, BUM, soldado do Desarme, latido…), na escala do layout do celular.

### 2.3 Toque
- Tocar numa carta seleciona/deseleciona; tocar e segurar (~400 ms) abre o zoom com a explicação (substitui o
  hover/rodinha); tocar num adversário escolhe o alvo; arrastar continua funcionando (pointer events), sem
  rolar a página sem querer (`touch-action` certo na mão).
- Nada de informação só em `title=` (tooltip): no celular o que estava em tooltip aparece no zoom/gaveta.

### 2.4 Processo
- Primeiro o layout básico funcionando (sem polir) e um **print do celular pro Rafa aprovar**; depois o polimento
  e os detalhes.
- Testes: `web/test/kittens-phone.test.ts` (jsdom com `matchMedia` falso, como `coup-phone.test.tsx`): classe
  `kt-phone`, toque longo abre zoom, tocar adversário escolhe alvo, gaveta do diário; `e2e/tatubum.spec.ts` ganha
  um jogador com viewport de celular; `catalog.test.ts` atualizado.

## 3. Fora de escopo
- Estatísticas novas além das três escolhidas; histórico com replay da partida; celular deitado.
