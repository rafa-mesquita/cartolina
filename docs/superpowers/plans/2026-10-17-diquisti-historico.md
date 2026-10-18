# Histórico do Diquisti Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gravar cada rodada revelada do Diquisti (id `dixit`) numa tabela própria do D1 e mostrar, na aba `#/dixit/historico`, as estatísticas da galera, as cartas famosas e as partidas, no visual "conto ilustrado" da mesa.

**Architecture:** O estado do Diquisti ganha `match` e `round`; o `shared` monta o registro da rodada (`pendingDixitRecord`) e calcula partidas, estatísticas e cartas famosas em funções puras (`dixitMatches`, `summarizeDixitHistory`). O Durable Object grava pelo mesmo mecanismo do DITU (registro pendente no mesmo `put` que marca `recordedRevealKey`, `INSERT … ON CONFLICT DO NOTHING`), agora escolhendo a tabela pelo jogo do pendente; `GET /history/dixit` pagina por partida. O site ganha a aba em `web/src/games/dixit/history/`, em componentes pequenos, ligada à `GamePage`.

**Tech Stack:** TypeScript estrito (monorepo npm workspaces), Cloudflare Workers + Durable Objects + D1, Vitest 4 (`@cloudflare/vitest-plugin` no servidor, jsdom + Testing Library no site), React 19, Vite 8, Playwright.

---

## Contexto para quem vai executar

**Onde:** worktree `C:\Users\rafam\Desktop\Rpositórios Github - claude\Pessoal\Jogos de tabuleiro\.claude\worktrees\dixit`, branch `feat/diquisti-historico`. Todos os comandos rodam na raiz do worktree. Nunca mexa fora dessa pasta, sem `git stash`, sem push.

**Comandos** (se o seu ambiente usa o `rtk`, prefixe: `rtk npm test …`):

| O quê | Comando |
| --- | --- |
| Testes de um arquivo do `shared` | `npm test -w shared -- <trecho-do-nome>` (ex.: `npm test -w shared -- dixit-record`) |
| Testes de um arquivo do servidor | `npm test -w server -- <trecho-do-nome>` |
| Testes de um arquivo do site | `npm test -w web -- <trecho-do-nome>` |
| Todos os testes | `npm test` |
| Tipos (todos os pacotes + e2e) | `npm run typecheck` |
| Tipos de um pacote | `npm run typecheck -w shared` / `-w server` / `-w web` |
| Build do site (o Dockerfile/CI usa `tsc --noEmit && vite build`, mais estrito) | `npm run build -w web` |
| E2E (sobe servidor local com migrações e o build de produção) | `npm run e2e` |

**Convenções do projeto**

- TS estrito com `noUncheckedIndexedAccess` (índice de array/objeto pode ser `undefined`: use `!` só quando garantido, ou `?? valor`) e `verbatimModuleSyntax` (tipos sempre com `import type` / `type X` dentro do import).
- Código, comentários, testes e commits em **português**. O jogador vê "Diquisti"; o código diz `dixit`. O DITU é o `ito`.
- Services do servidor seguem o padrão de `server/src/history-db.ts`: funções soltas que recebem `db: D1Database`.
- Migrações D1 aplicam sozinhas na publicação. A `0003` **só cria** (tabela e índices); nunca apaga nem altera a tabela `rounds` do DITU.
- Commits terminam com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Front: nunca ponha resultado de hook/objeto instável nas deps de um `useEffect` que faz `setState` (loop infinito). Os efeitos deste plano dependem só de `useCallback` com deps estáveis.
- Dica de jogador é sempre texto do React (nunca `dangerouslySetInnerHTML`).

**Restrições (outra sessão faz a versão de celular em paralelo, branch `feat/plano-5-celular`):**

1. **Não mude** `web/src/screens/Game.tsx`, `web/src/brand/global.css`, `web/src/games/catalog.ts`, `web/src/screens/RoomScreen.tsx`, `web/src/App.tsx`, `web/src/lib/device.ts`, `web/src/screens/Home.tsx`, nada em `web/src/table/*`, `README.md`, `docs/deploy.md`.
2. Em `web/src/screens/GamePage.tsx`, mexa **só na aba histórico** (trocar o "vem em breve" do Diquisti pelo painel novo, com o mínimo de linhas). Nada na `PlayTab`.
3. Não mude o formato de `RoomView` nem de `ItoRoomView`. `match`/`round` entram só no `DixitState`; a `DixitView` não muda.
4. A aba do histórico do Diquisti fica em arquivos novos em `web/src/games/dixit/history/`. O E2E novo tem arquivo próprio (`e2e/dixit-historico.spec.ts`) e não altera os helpers existentes.

**Testes do servidor e estado compartilhado:** o D1 dos testes é compartilhado entre arquivos. Cada arquivo de teste deste plano usa sua própria faixa de `played_at` e/ou seu próprio `room_code`, e limpa o que semeou:

| Arquivo | `room_code` | `played_at` |
| --- | --- | --- |
| `server/test/migration-0003.test.ts` | `MGR3` | 60_001 |
| `server/test/dixit-history-db.test.ts` | `DBTS` | 50_000–50_099 e 9_000_000_000_000+ |
| `server/test/dixit-history-page.test.ts` | `PGTS` | 10_000–10_999 |
| `server/test/pending-game.test.ts` | `PNDG` | 70_001–70_002 |
| `server/test/dixit-history-route.test.ts` | código aleatório da sala | `Date.now()` |

Por que funciona: as consultas paginadas dos testes usam `before`, que só enxerga linhas **menores**; a faixa da paginação (10_000) é a menor de todas, e as estatísticas leem as mais recentes (a faixa 9_000_000_000_000 é a maior). Não reaproveite essas faixas em outros testes.

## Decisões tomadas onde a spec deixava espaço

- **Tipos:** `DixitPerson`, `DixitRoundRecord` (em `shared/src/games/dixit/record.ts`); `DixitMatch`, `DixitMatchRound`, `DixitMatchScore`, `DixitHistoryStats`, `DixitWinsEntry`, `DixitRateEntry`, `DixitCardCount`, `DixitClueEntry` (em `shared/src/games/dixit/summary.ts`); `DixitHistoryResponse`, `HistoryResponses`, `HistoryResponseOf<G>`, `PendingHistoryRecord` (em `shared/src/history.ts`).
- **União por jogo da resposta:** um mapa `HistoryResponses { ito: HistoryResponse; dixit: DixitHistoryResponse }` e `HistoryResponseOf<G> = HistoryResponses[G]`. O `HistoryResponse` do DITU só troca `game: GameId` por `game: 'ito'` (o resto igual).
- **Resposta do Diquisti:** `{ game: 'dixit', matches, stats, nextBefore }`. Cada partida traz `rounds` enxutas (`id`, `round`, `playedAt`, `storyteller`, `storyCard`, `clue`) e não as rodadas inteiras (as estatísticas já vêm calculadas).
- **Registro pendente:** o pendente do DO já guardava `game`; vira uma união `{ game: 'dixit'; key; record: DixitRoundRecord } | { game?: 'ito'; groupId?; key; record: RoundRecord }`, e `insertPending(db, round)` escolhe a tabela. `pendingGame` sai (era só isso que fazia).
- **Despacho no shared:** `pendingHistoryRecord(room, now, id)` checa `GAMES[room.gameId].recordsHistory` e devolve o pendente já com o jogo; o DO só chama essa função.
- **Partida:** id `${código}-${runStartedAt ?? 0}-${match}`; chave da revelação `${id da partida}|${round}`. `round` soma 1 em toda narração começada (inclusive narração refeita por presença ou pulada pelo host), então pode pular números; **a tela numera as rodadas pela ordem dentro da partida** (1, 2, 3…), não por `round`.
- **Salas em andamento na publicação:** estado do Diquisti gravado sem `match`/`round` é completado ao ler do storage (`withDixitCounters` em `restoreRoom`): partida em andamento vira a 1, rodada 0. Sem isso, as revelações dessas salas teriam todas a mesma chave e só a primeira seria gravada.
- **Paginação:** `before` = início (1ª rodada) da última partida da página anterior, exclusivo; ordem `início DESC, match_id DESC` igual no SQL e em `dixitMatches`. Limitação conhecida (como no DITU): duas partidas com o mesmo início na divisa de página fazem a segunda ser pulada.
- **Estatísticas:** "quem mais engana" conta rodadas em que a pessoa teve carta na mesa sem ser a do narrador; a taxa pode passar de 1 (mostrada como "7 votos em 5 rodadas"). Desempate dos rankings: taxa, depois mais tentativas, depois nome (`pt-BR`). Cartas empatadas: pelo id.
- **Estado vazio:** o botão "criar sala" da aba vazia tem a própria lógica (`EmptyHistory`), porque a `PlayTab` não pode ser mexida para extrair um componente comum.
- **Links pro histórico:** a spec diz que lobby e mesa "já levam para lá", mas hoje só a "sala que acabou" leva (o lobby e a mesa do Diquisti não têm link). A Tarefa 16 acrescenta os dois links no lobby e no topo da mesa do Diquisti.
- **Ordem das tarefas:** o site vem antes de ligar a gravação (`recordsHistory: true` na Tarefa 15) para nenhum commit deixar a aba do Diquisti quebrada: até a Tarefa 15 a aba continua "vem em breve".

## Mapa de arquivos

**shared**

| Arquivo | Ação | Responsabilidade |
| --- | --- | --- |
| `shared/src/games/dixit/types.ts` | Modificar | `DixitState` ganha `match` e `round` |
| `shared/src/games/dixit/rules.ts` | Modificar | contar partidas/rodadas; `withDixitCounters` |
| `shared/src/room.ts` | Modificar | `dixitStateOf`; `restoreRoom` completa `match`/`round` |
| `shared/src/games/dixit/record.ts` | Criar | tipos do registro, id da partida, chave da revelação, `pendingDixitRecord` |
| `shared/src/games/dixit/summary.ts` | Criar | `dixitMatches`, `summarizeDixitHistory`, constantes e tipos |
| `shared/src/history.ts` | Modificar | `pendingHistoryRecord`, `DixitHistoryResponse`, `HistoryResponses`, `HistoryResponseOf`; `HistoryResponse.game: 'ito'` |
| `shared/src/games/registry.ts` | Modificar | `GAMES.dixit.recordsHistory = true` |
| `shared/src/index.ts` | Modificar | exportar o que é novo |
| `shared/test/dixit-history-helpers.ts` | Criar | sala do Diquisti com nomes, jogar até a revelação, construtor de rodada gravada |
| `shared/test/dixit-rules.test.ts` | Modificar | testes de `match`/`round` e `withDixitCounters` |
| `shared/test/room-games.test.ts` | Modificar | `restoreRoom` de sala antiga do Diquisti |
| `shared/test/dixit-record.test.ts` | Criar | registro, chave e `pendingHistoryRecord` |
| `shared/test/dixit-summary.test.ts` | Criar | partidas, estatísticas, cartas famosas |
| `shared/test/registry-history.test.ts`, `shared/test/history.test.ts` | Modificar | Diquisti passa a gravar |

**server**

| Arquivo | Ação | Responsabilidade |
| --- | --- | --- |
| `server/migrations/0003_dixit_rounds.sql` | Criar | tabela `dixit_rounds` + 2 índices |
| `server/src/dixit-history-db.ts` | Criar | `insertDixitRound`, `listDixitMatchIds`, `dixitRoundsOfMatches`, `allDixitRounds` |
| `server/src/dixit-history-page.ts` | Criar | `dixitHistoryPage(db, before)` |
| `server/src/history-db.ts` | Modificar | `HISTORY_PAGE_SIZE` (sai do `index.ts`) |
| `server/src/index.ts` | Modificar | `GET /history/dixit` responde no formato do Diquisti |
| `server/src/room-do.ts` | Modificar | pendente por jogo, `insertPending`, `pendingHistoryRecord` |
| `server/test/helpers.ts` | Modificar | `playDixitRound` |
| `server/test/migration-0003.test.ts`, `dixit-history-db.test.ts`, `dixit-history-page.test.ts`, `dixit-history-route.test.ts` | Criar | testes |
| `server/test/pending-game.test.ts`, `history-route.test.ts` | Modificar | pendente por jogo; Diquisti tem histórico |

**web**

| Arquivo | Ação | Responsabilidade |
| --- | --- | --- |
| `web/src/net/api.ts` | Modificar | `getHistory` tipado por jogo |
| `web/src/screens/history/HistoryPanel.tsx` | Modificar | prop `game: 'ito'` |
| `web/src/screens/GamePage.tsx` | Modificar | só a aba histórico: DITU → `HistoryPanel`, Diquisti → `DixitHistory` |
| `web/src/games/dixit/history/format.ts` | Criar | textos (nomes, resultado, plural, %, dica) |
| `web/src/games/dixit/history/groups.ts` | Criar | itens de carta (rótulo, selo, dica) por faixa e por partida |
| `web/src/games/dixit/history/HistoryCard.tsx` | Criar | miniatura clicável da carta, com selo |
| `web/src/games/dixit/history/dixit-history.css` | Criar | visual conto ilustrado da aba |
| `web/src/games/dixit/history/GaleraBoards.tsx` | Criar | 4 quadros da galera |
| `web/src/games/dixit/history/FamousCards.tsx` | Criar | 4 faixas de cartas famosas |
| `web/src/games/dixit/history/MatchList.tsx` | Criar | partidas, com a partida aberta |
| `web/src/games/dixit/history/EmptyHistory.tsx` | Criar | "Bora jogar a primeira!" + criar sala |
| `web/src/games/dixit/history/useDixitHistory.ts` | Criar | carga, erro, "carregar mais" |
| `web/src/games/dixit/history/DixitHistory.tsx` | Criar | a aba montada + carta ampliada |
| `web/src/games/dixit/DixitLobby.tsx`, `DixitTopBar.tsx`, `dixit.css` | Modificar | links pro histórico |
| `web/test/dixit-history-fixtures.ts` | Criar | rodadas e respostas de exemplo |
| `web/test/history-api.test.ts`, `game-page.test.tsx`, `room-screen.test.tsx`, `dixit-lobby.test.tsx`, `dixit-table.test.tsx` | Modificar | testes |
| `web/test/dixit-history-format.test.ts`, `dixit-history-cards.test.tsx`, `dixit-history-boards.test.tsx`, `dixit-history-famous.test.tsx`, `dixit-history-matches.test.tsx`, `dixit-history-empty.test.tsx`, `dixit-history.test.tsx` | Criar | testes |

**e2e e docs**

| Arquivo | Ação | Responsabilidade |
| --- | --- | --- |
| `e2e/dixit-historico.spec.ts` | Criar | rodada de Diquisti (ações diretas) aparece no histórico |
| `docs/superpowers/specs/2026-10-17-diquisti-historico-design.md` | Modificar | registrar as decisões de implementação |

---

## Tarefa 1: o Diquisti conta partidas e rodadas

**Files:**
- Modify: `shared/src/games/dixit/types.ts` (interface `DixitState`)
- Modify: `shared/src/games/dixit/rules.ts` (`initialDixitState`, `beginRound`, `startMatch`; nova `withDixitCounters`)
- Modify: `shared/src/room.ts` (imports, `restoreRoom`)
- Modify: `shared/src/index.ts` (export de `withDixitCounters`)
- Test: `shared/test/dixit-rules.test.ts`, `shared/test/room-games.test.ts`

- [ ] **Passo 1: escrever os testes que falham**

No fim de `shared/test/dixit-rules.test.ts`, acrescente (e inclua `withDixitCounters` no import de `'../src/games/dixit/rules'` e `import type { DixitState } from '../src/games/dixit/types';` no topo):

```ts
describe('Dixit: contagem de partidas e rodadas (histórico)', () => {
  it('lobby começa na partida 0, rodada 0', () => {
    expect(initialDixitState()).toMatchObject({ match: 0, round: 0 });
  });

  it('começar abre a partida 1 na rodada 1', () => {
    expect(started(4).state).toMatchObject({ match: 1, round: 1 });
  });

  it('a próxima narração soma 1 na rodada; a partida continua', () => {
    const { state, ctx } = revealed(4, (s) => s.storyCard!);
    expect(act(state, 'p0', { type: 'next' }, ctx)).toMatchObject({ match: 1, round: 2 });
  });

  it('narração pulada pelo host também conta como narração nova', () => {
    const { state, ctx } = started(4);
    expect(act(state, 'p0', { type: 'forceNext' }, ctx).round).toBe(2);
  });

  it('jogar de novo: partida 2, rodada 1', () => {
    const { state, ctx } = revealed(4, (s) => s.storyCard!);
    const over = act({ ...state, scores: { ...state.scores, p2: 30 } }, 'p0', { type: 'next' }, ctx);
    expect(over.phase).toBe('gameover');
    expect(act(over, 'p0', { type: 'again' }, ctx)).toMatchObject({ match: 2, round: 1 });
  });

  it('voltar pro lobby zera os dois', () => {
    const { state, ctx } = started(4);
    expect(act(state, 'p0', { type: 'lobby' }, ctx)).toMatchObject({ match: 0, round: 0 });
  });
});

describe('withDixitCounters', () => {
  it('estado gravado antes do histórico: partida em andamento vira a 1 (rodada 0); lobby fica na 0', () => {
    const { match: _m, round: _r, ...old } = started(4).state;
    expect(withDixitCounters(old as DixitState)).toMatchObject({ match: 1, round: 0, phase: 'storytelling' });
    const { match: _m2, round: _r2, ...lobby } = initialDixitState();
    expect(withDixitCounters(lobby as DixitState)).toMatchObject({ match: 0, round: 0 });
  });

  it('estado que já tem os campos volta o mesmo objeto', () => {
    const s = started(4).state;
    expect(withDixitCounters(s)).toBe(s);
  });
});
```

Em `shared/test/room-games.test.ts`, acrescente `import type { DixitState } from '../src/games/dixit/types';` no topo e, dentro de `describe('restoreRoom', …)`, este teste:

```ts
  it('sala de Diquisti gravada antes do histórico ganha partida e rodada', () => {
    const res = roomAction(dixitRoom(3), 'p0', { type: 'start' }, rng, 10);
    if (!res.ok) throw new Error(res.error);
    const { match: _m, round: _r, ...oldGame } = res.room.game as DixitState;
    const restored = restoreRoom({ ...res.room, game: oldGame as DixitState });
    expect(restored.game).toMatchObject({ match: 1, round: 0, phase: 'storytelling' });
  });
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `npm test -w shared -- dixit-rules room-games`
Expected: FAIL — `expected { phase: 'lobby', … } to match object { match: 0, round: 0 }` e `TypeError: withDixitCounters is not a function`; o teste do `restoreRoom` falha com `match` ausente.

- [ ] **Passo 3: implementar**

Em `shared/src/games/dixit/types.ts`, no fim da interface `DixitState` (depois de `paused: boolean;`):

```ts
  /** Partida da sala: 0 no lobby, +1 a cada `start` e `again` (identifica a partida no histórico). */
  match: number;
  /** Narrações começadas nesta partida: zera na partida nova e soma 1 a cada narração (chave da revelação no histórico). */
  round: number;
```

Em `shared/src/games/dixit/rules.ts`:

1. Em `initialDixitState`, depois de `paused: false,`:

```ts
    match: 0,
    round: 0,
```

2. Logo depois da função `initialDixitState`, a função nova:

```ts
/**
 * Estado gravado antes do histórico do Diquisti não tem `match` nem `round`: partida em andamento vira a partida 1
 * (rodada 0, a próxima narração já é a 1). Sem isso, todas as revelações dela teriam a mesma chave.
 */
export function withDixitCounters(state: DixitState): DixitState {
  const stored = state as Omit<DixitState, 'match' | 'round'> & Partial<Pick<DixitState, 'match' | 'round'>>;
  if (stored.match !== undefined && stored.round !== undefined) return state;
  return { ...state, match: stored.match ?? (state.phase === 'lobby' ? 0 : 1), round: stored.round ?? 0 };
}
```

3. Em `beginRound`, no objeto `reset`, depois de `paused: inRound.length < DIXIT_MIN_PLAYERS,`:

```ts
    round: state.round + 1,
```

4. Em `startMatch`, no objeto `fresh`, depois de `...initialDixitState(state.target),`:

```ts
    match: state.match + 1,
```

Em `shared/src/room.ts`:

1. Troque `import type { DixitView } from './games/dixit/types';` por:

```ts
import { withDixitCounters } from './games/dixit/rules';
import type { DixitState, DixitView } from './games/dixit/types';
```

2. Troque o corpo de `restoreRoom` por:

```ts
export function restoreRoom(stored: StoredRoom): Room {
  const { group: _legacyGroup, ...rest } = stored;
  const gameId = stored.gameId ?? 'ito';
  return {
    ...rest,
    gameId,
    // Diquisti gravado antes do histórico não tem `match`/`round`.
    game: gameId === 'dixit' ? withDixitCounters(rest.game as DixitState) : rest.game,
    runStartedAt: stored.runStartedAt ?? null,
    recordedRevealKey: stored.recordedRevealKey ?? null,
  };
}
```

Em `shared/src/index.ts`, no bloco `export { applyDixitAction, … } from './games/dixit/rules';`, acrescente `withDixitCounters,` depois de `initialDixitState,`.

- [ ] **Passo 4: rodar e ver passar**

Run: `npm test -w shared` e `npm run typecheck -w shared`
Expected: PASS em todos os arquivos (o teste antigo "voltar pro lobby mantém a meta" continua passando: o lobby volta a `initialDixitState(15)`, com `match: 0, round: 0`).

- [ ] **Passo 5: commit**

```bash
git add shared/src/games/dixit/types.ts shared/src/games/dixit/rules.ts shared/src/room.ts shared/src/index.ts shared/test/dixit-rules.test.ts shared/test/room-games.test.ts
git commit -m "feat(dixit): estado conta partidas e rodadas para o histórico

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 2: registro da rodada do Diquisti e chave da revelação

**Files:**
- Create: `shared/src/games/dixit/record.ts`
- Modify: `shared/src/room.ts` (nova `dixitStateOf`)
- Modify: `shared/src/history.ts` (nova `pendingHistoryRecord` e tipo `PendingHistoryRecord`)
- Modify: `shared/src/index.ts`
- Create: `shared/test/dixit-history-helpers.ts`
- Test: `shared/test/dixit-record.test.ts`

- [ ] **Passo 1: criar os helpers de teste**

Crie `shared/test/dixit-history-helpers.ts`:

```ts
import type { GameContext } from '../src/game';
import { dixitPicksPerPlayer } from '../src/games/dixit/rules';
import type { DixitState } from '../src/games/dixit/types';
import { PLAYER_COLORS } from '../src/players';
import { createRoom, joinRoom, type Room } from '../src/room';
import { act, ids, others } from './dixit-helpers';

/** Nome de cada id das salas de teste (p0…p3). */
export const NAMES: Record<string, string> = { p0: 'Ana', p1: 'Bia', p2: 'Caio', p3: 'Duda' };
export const colorOf = (id: string) => PLAYER_COLORS[Number(id.slice(1))]!;

/** Sala ABCD de Diquisti com Ana, Bia, Caio e Duda (p0…p3) sentados, o estado `game` e a sessão começada em 50. */
export function roomOf(game: DixitState, over: Partial<Room> = {}): Room {
  let room = createRoom('ABCD', 0, 'dixit');
  for (const [i, id] of ids(4).entries()) {
    const res = joinRoom(room, { token: `t${i}`, name: NAMES[id]!, color: PLAYER_COLORS[i]! }, id, 0);
    if (!res.ok) throw new Error(res.error);
    room = res.room;
  }
  return { ...room, game, runStartedAt: 50, ...over };
}

/** Da narração até a revelação: o narrador conta a 1ª carta, cada um joga as primeiras e vota na 1ª carta que não é sua. */
export function playToReveal(state: DixitState, ctx: GameContext, clue = 'eco'): DixitState {
  const st = state.storyteller!;
  let s = act(state, st, { type: 'tell', cardId: state.hands[st]![0]!, clue }, ctx);
  const per = dixitPicksPerPlayer(s.inRound.length);
  for (const p of others(s)) {
    s = act(s, p, { type: 'submit', cardIds: s.hands[p]!.slice(0, per) }, ctx);
    s = act(s, p, { type: 'confirm' }, ctx);
  }
  for (const p of others(s)) {
    const mine = s.picks[p] ?? [];
    const cardId = s.table.find((c) => !mine.includes(c))!;
    s = act(s, p, { type: 'vote', cardId }, ctx);
    s = act(s, p, { type: 'confirm' }, ctx);
  }
  return s;
}
```

- [ ] **Passo 2: escrever os testes que falham**

Crie `shared/test/dixit-record.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { dixitMatchId, dixitRevealKey, pendingDixitRecord } from '../src/games/dixit/record';
import { dixitOnPresenceChange, initialDixitState } from '../src/games/dixit/rules';
import type { DixitAction } from '../src/games/dixit/types';
import { pendingHistoryRecord } from '../src/history';
import { mulberry32 } from '../src/rng';
import { createRoom, dixitStateOf, roomAction, type Room } from '../src/room';
import { act, ctxOf, ids, others, revealed, started, voting } from './dixit-helpers';
import { NAMES, colorOf, playToReveal, roomOf } from './dixit-history-helpers';

function playRoom(room: Room, id: string, action: DixitAction, now: number): Room {
  const res = roomAction(room, id, action, mulberry32(7), now);
  if (!res.ok) throw new Error(res.error);
  return res.room;
}

describe('pendingDixitRecord', () => {
  it('monta o registro da rodada revelada com nomes e personagens da hora', () => {
    const { state } = revealed(4, (s) => s.storyCard!);
    const res = state.result!;
    const pending = pendingDixitRecord(roomOf(state), 1234, 'r-1')!;
    const r = pending.record;
    expect(pending.key).toBe('ABCD-50-1|1');
    expect(r).toMatchObject({
      id: 'r-1',
      matchId: 'ABCD-50-1',
      roomCode: 'ABCD',
      playedAt: 1234,
      target: 30,
      round: 1,
      clue: 'saudade',
      storyCard: res.storyCard,
    });
    expect(r.storyteller).toEqual({ name: NAMES[res.storyteller], color: colorOf(res.storyteller) });
    expect(r.cards.map((c) => c.card)).toEqual(res.table);
    expect(r.cards.find((c) => c.card === res.storyCard)!.owner.name).toBe(NAMES[res.storyteller]);
    expect(r.votes).toHaveLength(3);
    expect(r.votes.every((v) => v.card === res.storyCard)).toBe(true);
    expect(r.scores.map((s) => s.name)).toEqual(['Ana', 'Bia', 'Caio', 'Duda']);
    expect(r.scores.map((s) => s.score)).toEqual(ids(4).map((p) => state.scores[p]));
    expect(r.scores.map((s) => s.gained)).toEqual(ids(4).map((p) => res.gained[p]));
  });

  it('dica falada na call fica vazia', () => {
    const { state } = revealed(4, (s) => s.storyCard!);
    const room = roomOf({ ...state, result: { ...state.result!, clue: '' } });
    expect(pendingDixitRecord(room, 1, 'r')!.record.clue).toBe('');
  });

  it('quem saiu no meio aparece no placar, sem voto', () => {
    const { state: v } = voting(4);
    const leaver = others(v).at(-1)!;
    const staying = ctxOf(ids(4).filter((p) => p !== leaver));
    let s = dixitOnPresenceChange(v, staying);
    for (const p of others(s).filter((p) => p !== leaver)) {
      s = act(s, p, { type: 'vote', cardId: s.storyCard! }, staying);
      s = act(s, p, { type: 'confirm' }, staying);
    }
    expect(s.phase).toBe('reveal');
    const r = pendingDixitRecord(roomOf(s), 1, 'r')!.record;
    expect(r.votes.map((x) => x.voter.name)).not.toContain(NAMES[leaver]);
    expect(r.scores.map((x) => x.name)).toContain(NAMES[leaver]);
  });

  it('rodada destravada pelo host sem nenhum voto também grava (sem votos)', () => {
    const { state, ctx } = voting(4);
    const s = act(state, 'p0', { type: 'forceNext' }, ctx);
    expect(s.phase).toBe('reveal');
    expect(pendingDixitRecord(roomOf(s), 1, 'r')!.record.votes).toEqual([]);
  });

  it('fora da revelação, sala no lobby ou sala do DITU: nada a gravar', () => {
    expect(pendingDixitRecord(roomOf(started(4).state), 1, 'r')).toBeNull();
    expect(pendingDixitRecord(roomOf(initialDixitState()), 1, 'r')).toBeNull();
    expect(pendingDixitRecord(createRoom('ABCD', 0), 1, 'r')).toBeNull();
  });

  it('não grava de novo a mesma revelação', () => {
    const room = roomOf(revealed(4, (s) => s.storyCard!).state);
    const key = pendingDixitRecord(room, 1, 'r')!.key;
    expect(pendingDixitRecord({ ...room, recordedRevealKey: key }, 2, 'r2')).toBeNull();
  });
});

describe('chave da revelação e id da partida', () => {
  it('muda a cada rodada e a cada partida (próxima, jogar de novo, outra sessão)', () => {
    const { state, ctx } = revealed(4, (s) => s.storyCard!);
    expect(dixitRevealKey(roomOf(state))).toBe('ABCD-50-1|1');
    const second = playToReveal(act(state, 'p0', { type: 'next' }, ctx), ctx);
    expect(dixitRevealKey(roomOf(second))).toBe('ABCD-50-1|2');
    const over = act({ ...second, scores: { ...second.scores, p1: 30 } }, 'p0', { type: 'next' }, ctx);
    const again = playToReveal(act(over, 'p0', { type: 'again' }, ctx), ctx);
    expect(dixitRevealKey(roomOf(again))).toBe('ABCD-50-2|1');
    expect(dixitRevealKey(roomOf(again, { runStartedAt: 90 }))).toBe('ABCD-90-2|1');
  });

  it('voltar pro lobby e começar de novo gera outra partida (o início da sessão muda)', () => {
    let room = roomOf(initialDixitState(), { runStartedAt: null });
    room = playRoom(room, 'p0', { type: 'start' }, 100);
    const first = dixitMatchId(room, dixitStateOf(room)!);
    room = playRoom(room, 'p0', { type: 'lobby' }, 200);
    room = playRoom(room, 'p0', { type: 'start' }, 300);
    expect(first).toBe('ABCD-100-1');
    expect(dixitMatchId(room, dixitStateOf(room)!)).toBe('ABCD-300-1');
  });

  it('fora da revelação não tem chave', () => {
    expect(dixitRevealKey(roomOf(started(4).state))).toBeNull();
  });
});

describe('pendingHistoryRecord', () => {
  it('sala de Diquisti segue o registro: enquanto não grava histórico, nada', () => {
    expect(pendingHistoryRecord(roomOf(revealed(4, (s) => s.storyCard!).state), 1, 'r')).toBeNull();
  });

  it('sala fora da revelação: nada', () => {
    expect(pendingHistoryRecord(createRoom('ABCD', 0), 1, 'r')).toBeNull();
  });
});
```

- [ ] **Passo 3: rodar e ver falhar**

Run: `npm test -w shared -- dixit-record`
Expected: FAIL — `Failed to load url ../src/games/dixit/record` (o arquivo não existe).

- [ ] **Passo 4: implementar**

Em `shared/src/room.ts`, logo depois de `itoStateOf`:

```ts
/** Estado do Diquisti, ou null se a sala é de outro jogo. */
export function dixitStateOf(room: Room): DixitState | null {
  return room.gameId === 'dixit' ? (room.game as DixitState) : null;
}
```

Crie `shared/src/games/dixit/record.ts`:

```ts
import type { PlayerColor } from '../../players';
import { dixitStateOf, type Room } from '../../room';
import type { DixitState, DixitTarget } from './types';

/** Pessoa como estava na hora da rodada (trocar de nome depois não mexe no passado). */
export interface DixitPerson {
  name: string;
  color: PlayerColor;
}

/** Uma rodada revelada do Diquisti, como fica gravada no histórico. */
export interface DixitRoundRecord {
  id: string;
  /** `${sala}-${início da sessão}-${partida}`: muda a cada `start` e `again`. */
  matchId: string;
  roomCode: string;
  playedAt: number;
  target: DixitTarget;
  /** Narração da partida; pode pular números (narração refeita ou pulada também conta). */
  round: number;
  storyteller: DixitPerson;
  /** Vazia = dica falada na call. */
  clue: string;
  storyCard: string;
  /** Cartas da mesa, na ordem da votação, com o dono. */
  cards: { card: string; owner: DixitPerson }[];
  votes: { voter: DixitPerson; card: string }[];
  /** Todos da partida depois da rodada: pontos ganhos nela e placar. */
  scores: { name: string; color: PlayerColor; gained: number; score: number }[];
}

/** Id da partida: muda a cada partida (`match`) e a cada sessão que sai do lobby (`runStartedAt`). */
export function dixitMatchId(room: Room, state: DixitState): string {
  return `${room.code}-${room.runStartedAt ?? 0}-${state.match}`;
}

/** Chave da revelação (anti-duplicata): a partida e a narração. Fora da revelação, null. */
export function dixitRevealKey(room: Room): string | null {
  const state = dixitStateOf(room);
  if (!state || state.phase !== 'reveal' || !state.result) return null;
  return `${dixitMatchId(room, state)}|${state.round}`;
}

/** Registro a gravar se a sala do Diquisti está numa revelação ainda não gravada. */
export function pendingDixitRecord(room: Room, now: number, id: string): { key: string; record: DixitRoundRecord } | null {
  const state = dixitStateOf(room);
  const key = dixitRevealKey(room);
  if (!state?.result || !key || key === room.recordedRevealKey) return null;
  const result = state.result;
  const person = (playerId: string | undefined): DixitPerson | null => {
    const seat = room.seats.find((s) => s.id === playerId);
    return seat ? { name: seat.name, color: seat.color } : null;
  };
  const storyteller = person(result.storyteller);
  if (!storyteller) return null;
  const cards = result.table.flatMap((card) => {
    const owner = person(result.owners[card]);
    return owner ? [{ card, owner }] : [];
  });
  const votes = Object.entries(result.votes).flatMap(([voterId, card]) => {
    const voter = person(voterId);
    return voter ? [{ voter, card }] : [];
  });
  // Quem já saiu continua na partida (os assentos dos jogadores da partida não são reaproveitados).
  const scores = state.players.flatMap((playerId) => {
    const p = person(playerId);
    return p ? [{ ...p, gained: result.gained[playerId] ?? 0, score: state.scores[playerId] ?? 0 }] : [];
  });
  return {
    key,
    record: {
      id,
      matchId: dixitMatchId(room, state),
      roomCode: room.code,
      playedAt: now,
      target: state.target,
      round: state.round,
      storyteller,
      clue: result.clue,
      storyCard: result.storyCard,
      cards,
      votes,
      scores,
    },
  };
}
```

Em `shared/src/history.ts`:

1. Acrescente aos imports:

```ts
import { pendingDixitRecord, type DixitRoundRecord } from './games/dixit/record';
```

2. No fim do arquivo:

```ts
/** Rodada a gravar, já com o jogo: o servidor escolhe a tabela por ele. */
export type PendingHistoryRecord =
  | { game: 'ito'; key: string; record: RoundRecord }
  | { game: 'dixit'; key: string; record: DixitRoundRecord };

/** Registro pendente da sala, se o jogo dela grava histórico (`GAMES[jogo].recordsHistory`) e há revelação nova. */
export function pendingHistoryRecord(room: Room, now: number, id: string): PendingHistoryRecord | null {
  if (!GAMES[room.gameId].recordsHistory) return null;
  if (room.gameId === 'dixit') {
    const pending = pendingDixitRecord(room, now, id);
    return pending ? { game: 'dixit', ...pending } : null;
  }
  const pending = pendingRecord(room, now, id);
  return pending ? { game: 'ito', ...pending } : null;
}
```

Em `shared/src/index.ts`, depois de `export * from './games/dixit/types';`:

```ts
export * from './games/dixit/record';
```

- [ ] **Passo 5: rodar e ver passar**

Run: `npm test -w shared` e `npm run typecheck -w shared`
Expected: PASS.

- [ ] **Passo 6: commit**

```bash
git add shared/src/games/dixit/record.ts shared/src/room.ts shared/src/history.ts shared/src/index.ts shared/test/dixit-history-helpers.ts shared/test/dixit-record.test.ts
git commit -m "feat(dixit): registro da rodada revelada e chave anti-duplicata

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 3: partidas, estatísticas e cartas famosas (funções puras)

**Files:**
- Create: `shared/src/games/dixit/summary.ts`
- Modify: `shared/src/history.ts` (tipos da resposta)
- Modify: `shared/src/index.ts`
- Modify: `shared/test/dixit-history-helpers.ts` (construtor `dixitRound`)
- Test: `shared/test/dixit-summary.test.ts`

- [ ] **Passo 1: acrescentar o construtor de rodada gravada aos helpers**

No fim de `shared/test/dixit-history-helpers.ts` (e acrescente `import type { DixitPerson, DixitRoundRecord } from '../src/games/dixit/record';` e `import type { DixitTarget } from '../src/games/dixit/types';` aos imports — junte com o import de `DixitState` que já existe):

```ts
export const PEOPLE = {
  Ana: { name: 'Ana', color: PLAYER_COLORS[0] },
  Bia: { name: 'Bia', color: PLAYER_COLORS[1] },
  Caio: { name: 'Caio', color: PLAYER_COLORS[2] },
  Duda: { name: 'Duda', color: PLAYER_COLORS[3] },
} satisfies Record<string, DixitPerson>;
export type Who = keyof typeof PEOPLE;

export interface RoundSpec {
  at: number;
  teller: Who;
  /** Carta do narrador (padrão `d001`). */
  story?: string;
  clue?: string;
  /** Outras cartas da mesa: carta → dono. */
  cards?: Record<string, Who>;
  /** Votante → carta. */
  votes?: Partial<Record<Who, string>>;
  /** Placar depois da rodada. */
  scores?: Partial<Record<Who, number>>;
  match?: string;
  target?: DixitTarget;
}

/** Rodada gravada de mentira, só com o que cada teste precisa. Id `r<at>`, partida padrão `ABCD-1-1`. */
export function dixitRound(s: RoundSpec): DixitRoundRecord {
  const story = s.story ?? 'd001';
  const votes = (Object.entries(s.votes ?? {}) as [Who, string][]).map(([voter, card]) => ({ voter: PEOPLE[voter], card }));
  const scores = (Object.entries(s.scores ?? {}) as [Who, number][]).map(([name, score]) => ({ ...PEOPLE[name], gained: 0, score }));
  return {
    id: `r${s.at}`,
    matchId: s.match ?? 'ABCD-1-1',
    roomCode: 'ABCD',
    playedAt: s.at,
    target: s.target ?? 30,
    round: 1,
    storyteller: PEOPLE[s.teller],
    clue: s.clue ?? '',
    storyCard: story,
    cards: [{ card: story, owner: PEOPLE[s.teller] }, ...Object.entries(s.cards ?? {}).map(([card, owner]) => ({ card, owner: PEOPLE[owner] }))],
    votes,
    scores,
  };
}
```

- [ ] **Passo 2: escrever os testes que falham**

Crie `shared/test/dixit-summary.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { dixitMatches, summarizeDixitHistory } from '../src/games/dixit/summary';
import { PLAYER_COLORS } from '../src/players';
import { PEOPLE, dixitRound as R } from './dixit-history-helpers';

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe('dixitMatches', () => {
  it('junta as rodadas por partida: a mais recente primeiro, rodadas em ordem', () => {
    const ms = dixitMatches([
      R({ at: 20, teller: 'Bia', match: 'm1' }),
      R({ at: 30, teller: 'Ana', match: 'm2' }),
      R({ at: 10, teller: 'Ana', match: 'm1' }),
    ]);
    expect(ms.map((m) => m.id)).toEqual(['m2', 'm1']);
    expect(ms[1]!.startedAt).toBe(10);
    expect(ms[1]!.roomCode).toBe('ABCD');
    expect(ms[1]!.rounds.map((r) => r.storyteller.name)).toEqual(['Ana', 'Bia']);
    expect(ms[1]!.rounds[0]).toEqual({ id: 'r10', round: 1, playedAt: 10, storyteller: PEOPLE.Ana, storyCard: 'd001', clue: '' });
  });

  it('terminada quando alguém chega na meta: vencedor e placar do maior pro menor', () => {
    const [m] = dixitMatches([R({ at: 1, teller: 'Ana', scores: { Ana: 12, Bia: 31, Caio: 20 } })]);
    expect(m!.finished).toBe(true);
    expect(m!.winners).toEqual([PEOPLE.Bia]);
    expect(m!.scores.map((s) => [s.name, s.score])).toEqual([['Bia', 31], ['Caio', 20], ['Ana', 12]]);
  });

  it('empate no topo: mais de um vencedor', () => {
    const [m] = dixitMatches([R({ at: 1, teller: 'Ana', scores: { Bia: 30, Ana: 30, Caio: 4 } })]);
    expect(m!.winners).toEqual([PEOPLE.Ana, PEOPLE.Bia]);
  });

  it('não terminou: sem vencedor, com o placar de onde parou; a meta vem da partida', () => {
    const [open] = dixitMatches([R({ at: 1, teller: 'Ana', target: 15, scores: { Ana: 14, Bia: 9 } })]);
    expect(open).toMatchObject({ finished: false, winners: [], target: 15 });
    expect(open!.scores.map((s) => [s.name, s.score])).toEqual([['Ana', 14], ['Bia', 9]]);
    const [done] = dixitMatches([R({ at: 1, teller: 'Ana', target: 15, scores: { Ana: 15, Bia: 9 } })]);
    expect(done!.finished).toBe(true);
  });

  it('o placar e o fim vêm da última rodada da partida', () => {
    const [m] = dixitMatches([
      R({ at: 2, teller: 'Bia', scores: { Ana: 31, Bia: 5 } }),
      R({ at: 1, teller: 'Ana', scores: { Ana: 28, Bia: 2 } }),
    ]);
    expect(m!.finished).toBe(true);
    expect(m!.scores.map((s) => s.score)).toEqual([31, 5]);
  });
});

describe('summarizeDixitHistory', () => {
  it('sem rodadas: tudo vazio', () => {
    expect(summarizeDixitHistory([])).toEqual({
      mostWins: [],
      bestFinders: [],
      bestFoolers: [],
      bestTellers: [],
      favoriteCards: [],
      trickiestCards: [],
      clueWall: [],
      impossibleCards: [],
    });
  });

  it('quem mais venceu: vitórias em partidas terminadas (empate conta pros dois), top 3', () => {
    const s = summarizeDixitHistory([
      R({ at: 1, teller: 'Ana', match: 'a', scores: { Ana: 30, Bia: 3 } }),
      R({ at: 2, teller: 'Ana', match: 'b', scores: { Ana: 30, Bia: 30 } }),
      R({ at: 3, teller: 'Ana', match: 'c', scores: { Caio: 31, Ana: 2 } }),
      R({ at: 4, teller: 'Ana', match: 'd', scores: { Duda: 31 } }),
      R({ at: 5, teller: 'Ana', match: 'e', scores: { Duda: 10, Ana: 29 } }),
    ]);
    expect(s.mostWins).toEqual([
      { ...PEOPLE.Ana, wins: 2 },
      { ...PEOPLE.Bia, wins: 1 },
      { ...PEOPLE.Caio, wins: 1 },
    ]);
  });

  it('quem mais acha: votos na carta do narrador ÷ votos dados, com mínimo de 5 votos', () => {
    // Bia: 5 votos, 4 certos. Caio: 4 votos certos (abaixo do mínimo).
    const rounds = range(5).map((at) =>
      R({ at, teller: 'Ana', cards: { d002: 'Duda' }, votes: { Bia: at === 5 ? 'd002' : 'd001', ...(at < 5 ? { Caio: 'd001' } : {}) } }),
    );
    expect(summarizeDixitHistory(rounds).bestFinders).toEqual([{ ...PEOPLE.Bia, hits: 4, total: 5, rate: 0.8 }]);
  });

  it('quem mais engana: votos na própria carta ÷ rodadas em que jogou sem narrar, com mínimo de 5 rodadas', () => {
    // Caio joga em 5 rodadas e recebe voto em 3. Duda joga em 4 (abaixo do mínimo) e recebe voto em todas.
    const rounds = range(5).map((at) =>
      R({
        at,
        teller: 'Ana',
        cards: { [`c${at}`]: 'Caio', ...(at < 5 ? { [`x${at}`]: 'Duda' } : {}) },
        votes: { Bia: at <= 3 ? `c${at}` : 'd001', ...(at < 5 ? { Caio: `x${at}` } : {}) },
      }),
    );
    expect(summarizeDixitHistory(rounds).bestFoolers).toEqual([{ ...PEOPLE.Caio, hits: 3, total: 5, rate: 0.6 }]);
  });

  it('melhor narrador: alguns acharam mas não todos ÷ narrações (mín. 3); rodada sem voto não conta como acerto', () => {
    const s = summarizeDixitHistory([
      R({ at: 1, teller: 'Ana', cards: { d002: 'Bia' }, votes: { Bia: 'd001', Caio: 'd002' } }),
      R({ at: 2, teller: 'Ana', votes: { Bia: 'd001', Caio: 'd001' } }),
      R({ at: 3, teller: 'Ana' }),
      R({ at: 4, teller: 'Bia', cards: { d002: 'Ana' }, votes: { Ana: 'd001', Caio: 'd002' } }),
      R({ at: 5, teller: 'Bia', cards: { d002: 'Ana' }, votes: { Ana: 'd001', Caio: 'd002' } }),
    ]);
    expect(s.bestTellers).toEqual([{ ...PEOPLE.Ana, hits: 1, total: 3, rate: 1 / 3 }]);
  });

  it('desempate dos rankings: taxa, depois mais tentativas, depois nome; só o top 3', () => {
    // Todos acertam sempre: Bia com 6 votos, Ana, Caio e Duda com 5.
    const rounds = [
      ...range(6).map((at) => R({ at, teller: 'Ana', votes: { Bia: 'd001', ...(at <= 5 ? { Caio: 'd001', Duda: 'd001' } : {}) } })),
      ...range(5).map((i) => R({ at: 10 + i, teller: 'Bia', votes: { Ana: 'd001' } })),
    ];
    expect(summarizeDixitHistory(rounds).bestFinders.map((e) => [e.name, e.total])).toEqual([['Bia', 6], ['Ana', 5], ['Caio', 5]]);
  });

  it('cartas: favoritas dos narradores e as que mais enganaram (top 5, empate pelo id)', () => {
    const s = summarizeDixitHistory([
      R({ at: 1, teller: 'Ana', story: 'd010', cards: { d020: 'Bia' }, votes: { Bia: 'd010', Caio: 'd020' } }),
      R({ at: 2, teller: 'Bia', story: 'd010', cards: { d020: 'Caio', d030: 'Ana' }, votes: { Ana: 'd020', Caio: 'd010' } }),
      // d003…d007, uma vez cada: o top 5 corta a d007
      ...range(5).map((i) => R({ at: 2 + i, teller: 'Caio', story: `d00${i + 2}` })),
    ]);
    expect(s.favoriteCards).toEqual([
      { card: 'd010', count: 2 },
      { card: 'd003', count: 1 },
      { card: 'd004', count: 1 },
      { card: 'd005', count: 1 },
      { card: 'd006', count: 1 },
    ]);
    expect(s.trickiestCards).toEqual([{ card: 'd020', count: 2 }]);
  });

  it('mural de dicas: as 12 dicas escritas mais recentes, com a carta e quem narrou', () => {
    const rounds = range(14).map((at) => R({ at, teller: 'Ana', story: `d${String(at).padStart(3, '0')}`, clue: at === 14 ? '' : `dica ${at}` }));
    const wall = summarizeDixitHistory(rounds).clueWall;
    expect(wall).toHaveLength(12);
    expect(wall[0]).toEqual({ roundId: 'r13', card: 'd013', clue: 'dica 13', storyteller: PEOPLE.Ana, playedAt: 13 });
    expect(wall.at(-1)!.clue).toBe('dica 2');
  });

  it('cartas impossíveis: as 8 mais recentes que ninguém achou (com pelo menos 1 voto), com a dica e quem narrou', () => {
    const s = summarizeDixitHistory([
      ...range(9).map((at) => R({ at, teller: 'Bia', story: `d10${at}`, cards: { d200: 'Caio' }, votes: { Ana: 'd200' } })),
      R({ at: 10, teller: 'Bia', story: 'd300' }),
      R({ at: 11, teller: 'Bia', story: 'd301', votes: { Ana: 'd301' } }),
    ]);
    expect(s.impossibleCards.map((e) => e.card)).toEqual(['d109', 'd108', 'd107', 'd106', 'd105', 'd104', 'd103', 'd102']);
    expect(s.impossibleCards[0]).toEqual({ roundId: 'r9', card: 'd109', clue: '', storyteller: PEOPLE.Bia, playedAt: 9 });
  });

  it('cada pessoa aparece com o personagem mais recente do nome', () => {
    const later = R({ at: 2, teller: 'Ana', match: 'b' });
    const s = summarizeDixitHistory([
      R({ at: 1, teller: 'Ana', match: 'a', scores: { Ana: 30 } }),
      { ...later, scores: [{ name: 'Ana', color: PLAYER_COLORS[5], gained: 0, score: 30 }] },
    ]);
    expect(s.mostWins).toEqual([{ name: 'Ana', color: PLAYER_COLORS[5], wins: 2 }]);
  });
});
```

- [ ] **Passo 3: rodar e ver falhar**

Run: `npm test -w shared -- dixit-summary`
Expected: FAIL — `Failed to load url ../src/games/dixit/summary`.

- [ ] **Passo 4: implementar**

Crie `shared/src/games/dixit/summary.ts`:

```ts
import type { PlayerColor } from '../../players';
import type { DixitPerson, DixitRoundRecord } from './record';
import type { DixitTarget } from './types';

// Pontos de partida (spec §3): ajuste aqui.
export const DIXIT_TOP_PEOPLE = 3;
export const DIXIT_FINDER_MIN_VOTES = 5;
export const DIXIT_FOOLER_MIN_ROUNDS = 5;
export const DIXIT_TELLER_MIN_TELLS = 3;
export const DIXIT_TOP_CARDS = 5;
export const DIXIT_CLUE_WALL_SIZE = 12;
export const DIXIT_IMPOSSIBLE_SIZE = 8;

/** Uma linha da partida aberta. */
export interface DixitMatchRound {
  id: string;
  round: number;
  playedAt: number;
  storyteller: DixitPerson;
  storyCard: string;
  clue: string;
}

export interface DixitMatchScore {
  name: string;
  color: PlayerColor;
  score: number;
}

/** Partida: as rodadas com o mesmo `matchId`. */
export interface DixitMatch {
  id: string;
  roomCode: string;
  /** Hora da 1ª rodada. */
  startedAt: number;
  target: DixitTarget;
  /** Alguém chegou na meta na última rodada. */
  finished: boolean;
  /** Maior placar das terminadas (empate: mais de um); vazio se não terminou. */
  winners: DixitPerson[];
  /** Placar da última rodada, do maior pro menor. */
  scores: DixitMatchScore[];
  /** Em ordem cronológica. */
  rounds: DixitMatchRound[];
}

export interface DixitWinsEntry {
  name: string;
  color: PlayerColor;
  wins: number;
}

export interface DixitRateEntry {
  name: string;
  color: PlayerColor;
  hits: number;
  total: number;
  rate: number;
}

export interface DixitCardCount {
  card: string;
  count: number;
}

export interface DixitClueEntry {
  roundId: string;
  card: string;
  clue: string;
  storyteller: DixitPerson;
  playedAt: number;
}

export interface DixitHistoryStats {
  /** Quem mais venceu (top 3). */
  mostWins: DixitWinsEntry[];
  /** Quem mais acha: votos na carta do narrador ÷ votos dados (mín. 5 votos). */
  bestFinders: DixitRateEntry[];
  /** Quem mais engana: votos na própria carta ÷ rodadas em que jogou sem narrar (mín. 5 rodadas). */
  bestFoolers: DixitRateEntry[];
  /** Melhor narrador: narrações em que alguns acharam, mas não todos ÷ narrações (mín. 3). */
  bestTellers: DixitRateEntry[];
  /** Mais escolhidas como carta do narrador (top 5). */
  favoriteCards: DixitCardCount[];
  /** Mais votadas sem ser a do narrador (top 5). */
  trickiestCards: DixitCardCount[];
  /** As 12 dicas escritas mais recentes. */
  clueWall: DixitClueEntry[];
  /** As 8 cartas do narrador mais recentes que ninguém achou (com pelo menos 1 voto). */
  impossibleCards: DixitClueEntry[];
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'pt-BR');
/** Comparação de texto igual à do SQLite (por código), pra ordem bater com o banco. */
const byCode = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const byTime = (a: DixitRoundRecord, b: DixitRoundRecord) => a.playedAt - b.playedAt || byCode(a.id, b.id);

/** `rounds`: as rodadas de uma partida, em ordem, pelo menos uma. */
function toMatch(rounds: readonly DixitRoundRecord[]): DixitMatch {
  const first = rounds[0]!;
  const last = rounds[rounds.length - 1]!;
  const scores = last.scores.map(({ name, color, score }) => ({ name, color, score })).sort((a, b) => b.score - a.score || byName(a, b));
  const top = scores[0]?.score ?? 0;
  const finished = scores.length > 0 && top >= last.target;
  return {
    id: first.matchId,
    roomCode: first.roomCode,
    startedAt: first.playedAt,
    target: last.target,
    finished,
    winners: finished ? scores.filter((s) => s.score === top).map(({ name, color }) => ({ name, color })) : [],
    scores,
    rounds: rounds.map((r) => ({ id: r.id, round: r.round, playedAt: r.playedAt, storyteller: r.storyteller, storyCard: r.storyCard, clue: r.clue })),
  };
}

/** Junta as rodadas por partida; a mais recente (pela 1ª rodada) primeiro, como o SQL da paginação. */
export function dixitMatches(rounds: readonly DixitRoundRecord[]): DixitMatch[] {
  const groups = new Map<string, DixitRoundRecord[]>();
  for (const r of [...rounds].sort(byTime)) {
    const group = groups.get(r.matchId);
    if (group) group.push(r);
    else groups.set(r.matchId, [r]);
  }
  return [...groups.values()].map(toMatch).sort((a, b) => b.startedAt - a.startedAt || byCode(b.id, a.id));
}

interface Tally {
  name: string;
  color: PlayerColor;
  hits: number;
  total: number;
}

function tally(map: Map<string, Tally>, p: DixitPerson, hits: number): void {
  const t = map.get(p.name) ?? { name: p.name, color: p.color, hits: 0, total: 0 };
  t.hits += hits;
  t.total += 1;
  map.set(p.name, t);
}

function ranking(map: Map<string, Tally>, min: number, colors: Map<string, PlayerColor>): DixitRateEntry[] {
  return [...map.values()]
    .filter((t) => t.total >= min)
    .map((t) => ({ name: t.name, color: colors.get(t.name) ?? t.color, hits: t.hits, total: t.total, rate: t.hits / t.total }))
    .sort((a, b) => b.rate - a.rate || b.total - a.total || byName(a, b))
    .slice(0, DIXIT_TOP_PEOPLE);
}

function topCards(counts: Map<string, number>): DixitCardCount[] {
  return [...counts.entries()]
    .map(([card, count]) => ({ card, count }))
    .sort((a, b) => b.count - a.count || byCode(a.card, b.card))
    .slice(0, DIXIT_TOP_CARDS);
}

const bump = (counts: Map<string, number>, card: string) => counts.set(card, (counts.get(card) ?? 0) + 1);

const clueEntry = (r: DixitRoundRecord): DixitClueEntry => ({
  roundId: r.id,
  card: r.storyCard,
  clue: r.clue,
  storyteller: r.storyteller,
  playedAt: r.playedAt,
});

/** Estatísticas da galera e cartas famosas. Pessoas são identificadas pelo nome, com o personagem mais recente. */
export function summarizeDixitHistory(rounds: readonly DixitRoundRecord[]): DixitHistoryStats {
  const ordered = [...rounds].sort(byTime);
  const colors = new Map<string, PlayerColor>();
  const finders = new Map<string, Tally>();
  const foolers = new Map<string, Tally>();
  const tellers = new Map<string, Tally>();
  const favorites = new Map<string, number>();
  const tricky = new Map<string, number>();
  for (const r of ordered) {
    for (const p of [r.storyteller, ...r.cards.map((c) => c.owner), ...r.votes.map((v) => v.voter), ...r.scores]) colors.set(p.name, p.color);
    const found = r.votes.filter((v) => v.card === r.storyCard).length;
    tally(tellers, r.storyteller, r.votes.length > 0 && found > 0 && found < r.votes.length ? 1 : 0);
    bump(favorites, r.storyCard);
    for (const v of r.votes) {
      tally(finders, v.voter, v.card === r.storyCard ? 1 : 0);
      if (v.card !== r.storyCard) bump(tricky, v.card);
    }
    // Quem teve carta na mesa sem ser a do narrador: uma rodada, com os votos que as cartas dele receberam.
    const owners = new Map<string, DixitPerson>();
    for (const c of r.cards) if (c.card !== r.storyCard) owners.set(c.owner.name, c.owner);
    for (const owner of owners.values()) {
      const mine = new Set(r.cards.filter((c) => c.card !== r.storyCard && c.owner.name === owner.name).map((c) => c.card));
      tally(foolers, owner, r.votes.filter((v) => mine.has(v.card)).length);
    }
  }
  const wins = new Map<string, DixitWinsEntry>();
  for (const m of dixitMatches(ordered)) {
    for (const w of m.winners) {
      const e = wins.get(w.name) ?? { name: w.name, color: w.color, wins: 0 };
      e.wins++;
      wins.set(w.name, e);
    }
  }
  return {
    mostWins: [...wins.values()]
      .map((e) => ({ ...e, color: colors.get(e.name) ?? e.color }))
      .sort((a, b) => b.wins - a.wins || byName(a, b))
      .slice(0, DIXIT_TOP_PEOPLE),
    bestFinders: ranking(finders, DIXIT_FINDER_MIN_VOTES, colors),
    bestFoolers: ranking(foolers, DIXIT_FOOLER_MIN_ROUNDS, colors),
    bestTellers: ranking(tellers, DIXIT_TELLER_MIN_TELLS, colors),
    favoriteCards: topCards(favorites),
    trickiestCards: topCards(tricky),
    clueWall: ordered
      .filter((r) => r.clue.trim() !== '')
      .slice(-DIXIT_CLUE_WALL_SIZE)
      .reverse()
      .map(clueEntry),
    impossibleCards: ordered
      .filter((r) => r.votes.length > 0 && r.votes.every((v) => v.card !== r.storyCard))
      .slice(-DIXIT_IMPOSSIBLE_SIZE)
      .reverse()
      .map(clueEntry),
  };
}
```

Em `shared/src/history.ts`, acrescente aos imports:

```ts
import type { DixitHistoryStats, DixitMatch } from './games/dixit/summary';
```

e, logo depois da interface `HistoryResponse`:

```ts
/** Resposta de `GET /history/dixit`: 20 partidas por página; estatísticas e cartas famosas só na primeira. */
export interface DixitHistoryResponse {
  game: 'dixit';
  matches: DixitMatch[];
  /** Só na primeira página (sem `before`); nas seguintes vem `null`. */
  stats: DixitHistoryStats | null;
  /** Início da última partida da página (exclusivo na próxima), ou null se acabou. */
  nextBefore: number | null;
}

/** Resposta de `GET /history/:game`, por jogo (todo jogo do registro precisa estar aqui). */
export interface HistoryResponses {
  ito: HistoryResponse;
  dixit: DixitHistoryResponse;
}
export type HistoryResponseOf<G extends GameId> = HistoryResponses[G];
```

Em `shared/src/index.ts`, depois de `export * from './games/dixit/record';`:

```ts
export * from './games/dixit/summary';
```

- [ ] **Passo 5: rodar e ver passar**

Run: `npm test -w shared` e `npm run typecheck`
Expected: PASS (o `typecheck` geral confirma que `HistoryResponses[G]` cobre todos os `GameId`).

- [ ] **Passo 6: commit**

```bash
git add shared/src/games/dixit/summary.ts shared/src/history.ts shared/src/index.ts shared/test/dixit-history-helpers.ts shared/test/dixit-summary.test.ts
git commit -m "feat(dixit): partidas, estatísticas da galera e cartas famosas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 4: migração 0003 (tabela `dixit_rounds`)

**Files:**
- Create: `server/migrations/0003_dixit_rounds.sql`
- Test: `server/test/migration-0003.test.ts`

- [ ] **Passo 1: escrever o teste que falha**

Crie `server/test/migration-0003.test.ts`:

```ts
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

const columns = async (table: string) =>
  (await env.DB.prepare(`SELECT name FROM pragma_table_info('${table}')`).all<{ name: string }>()).results.map((c) => c.name);

describe('migração 0003: rodadas do Diquisti', () => {
  it('só cria coisas e nunca toca na tabela rounds do DITU (segura para aplicar sozinha)', () => {
    const m3 = env.TEST_MIGRATIONS[2];
    expect(m3?.name).toMatch(/^0003/);
    const sql = m3!.queries.join('\n').replace(/--.*$/gm, '');
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS dixit_rounds/);
    expect(sql).not.toMatch(/\b(DROP|ALTER|DELETE|UPDATE|INSERT)\b/i);
    expect(sql).not.toMatch(/\brounds\b/);
  });

  it('cria dixit_rounds com as colunas e os índices', async () => {
    expect(await columns('dixit_rounds')).toEqual([
      'id',
      'match_id',
      'room_code',
      'reveal_key',
      'played_at',
      'target',
      'round',
      'story_card',
      'clue',
      'record_json',
    ]);
    const { results } = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'dixit_rounds'").all<{
      name: string;
    }>();
    expect(results.map((r) => r.name)).toEqual(expect.arrayContaining(['dixit_rounds_played', 'dixit_rounds_match']));
  });

  it('a tabela rounds do DITU continua igual', async () => {
    expect(await columns('rounds')).toEqual([
      'id',
      'game',
      'room_code',
      'reveal_key',
      'played_at',
      'mode',
      'level',
      'outcome',
      'errors',
      'campaign_id',
      'theme_json',
      'players_json',
      'cards_json',
    ]);
  });

  it('a mesma revelação na mesma sala só entra uma vez', async () => {
    const insert = (id: string) =>
      env.DB.prepare(
        `INSERT INTO dixit_rounds (id, match_id, room_code, reveal_key, played_at, target, round, story_card, clue, record_json)
         VALUES (?, 'MGR3-1-1', 'MGR3', 'k1', 60001, 30, 1, 'd001', '', '{}') ON CONFLICT (room_code, reveal_key) DO NOTHING`,
      )
        .bind(id)
        .run();
    await insert('mgr3-a');
    await insert('mgr3-b');
    const { results } = await env.DB.prepare("SELECT id FROM dixit_rounds WHERE room_code = 'MGR3'").all<{ id: string }>();
    expect(results.map((r) => r.id)).toEqual(['mgr3-a']);
    await env.DB.prepare("DELETE FROM dixit_rounds WHERE room_code = 'MGR3'").run();
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `npm test -w server -- migration-0003`
Expected: FAIL — `expected undefined to match /^0003/` (e `no such table: dixit_rounds` nos outros).

- [ ] **Passo 3: implementar**

Crie `server/migrations/0003_dixit_rounds.sql`:

```sql
-- Histórico do Diquisti: tabela própria; a do DITU não muda.
-- Só cria coisas, então é segura para aplicar sozinha na publicação.
CREATE TABLE IF NOT EXISTS dixit_rounds (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  room_code TEXT NOT NULL,
  -- chave da revelação (anti-duplicata): a mesma revelação gravada de novo vira no-op.
  reveal_key TEXT NOT NULL,
  played_at INTEGER NOT NULL,
  target INTEGER NOT NULL,
  round INTEGER NOT NULL,
  story_card TEXT NOT NULL,
  clue TEXT NOT NULL,
  -- o DixitRoundRecord inteiro; as colunas acima servem para filtrar e ordenar.
  record_json TEXT NOT NULL,
  UNIQUE (room_code, reveal_key)
);

CREATE INDEX IF NOT EXISTS dixit_rounds_played ON dixit_rounds (played_at DESC);
CREATE INDEX IF NOT EXISTS dixit_rounds_match ON dixit_rounds (match_id);
```

- [ ] **Passo 4: rodar e ver passar**

Run: `npm test -w server`
Expected: PASS (o `test/apply-migrations.ts` aplica a 0003 no banco dos testes; o teste da 0002 continua usando só as duas primeiras).

- [ ] **Passo 5: commit**

```bash
git add server/migrations/0003_dixit_rounds.sql server/test/migration-0003.test.ts
git commit -m "feat(server): migração 0003 cria a tabela das rodadas do Diquisti

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 5: camada de banco do Diquisti

**Files:**
- Create: `server/src/dixit-history-db.ts`
- Test: `server/test/dixit-history-db.test.ts`

- [ ] **Passo 1: escrever os testes que falham**

Crie `server/test/dixit-history-db.test.ts`:

```ts
import { env } from 'cloudflare:test';
import type { DixitRoundRecord } from '@cartolina/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { allDixitRounds, dixitRoundsOfMatches, insertDixitRound, listDixitMatchIds } from '../src/dixit-history-db';

// Faixas próprias deste arquivo (o D1 dos testes é compartilhado): sala DBTS, played_at 50_000+ e 9_000_000_000_000+.
const FUTURE = 9_000_000_000_000;

function rec(matchId: string, playedAt: number, clue = 'luar'): DixitRoundRecord {
  return {
    id: crypto.randomUUID(),
    matchId,
    roomCode: 'DBTS',
    playedAt,
    target: 30,
    round: 1,
    storyteller: { name: 'Ana', color: '#8EC5FF' },
    clue,
    storyCard: 'd001',
    cards: [
      { card: 'd001', owner: { name: 'Ana', color: '#8EC5FF' } },
      { card: 'd002', owner: { name: 'Bia', color: '#FF8FAB' } },
    ],
    votes: [{ voter: { name: 'Bia', color: '#FF8FAB' }, card: 'd001' }],
    scores: [
      { name: 'Ana', color: '#8EC5FF', gained: 3, score: 3 },
      { name: 'Bia', color: '#FF8FAB', gained: 3, score: 3 },
    ],
  };
}

const clear = () => env.DB.prepare("DELETE FROM dixit_rounds WHERE room_code = 'DBTS'").run();
beforeEach(clear);
afterEach(clear);

describe('dixit-history-db', () => {
  it('grava e lê de volta a rodada inteira', async () => {
    const r = rec('DBTS-1-1', 50_001);
    await insertDixitRound(env.DB, r, 'k1');
    expect(await dixitRoundsOfMatches(env.DB, ['DBTS-1-1'])).toEqual([r]);
  });

  it('gravar a mesma revelação duas vezes deixa uma linha só', async () => {
    const r = rec('DBTS-1-1', 50_002);
    await insertDixitRound(env.DB, r, 'mesma');
    await insertDixitRound(env.DB, { ...r, id: crypto.randomUUID() }, 'mesma');
    expect(await dixitRoundsOfMatches(env.DB, ['DBTS-1-1'])).toHaveLength(1);
    await insertDixitRound(env.DB, { ...r, id: crypto.randomUUID() }, 'outra');
    expect(await dixitRoundsOfMatches(env.DB, ['DBTS-1-1'])).toHaveLength(2);
  });

  it('lista partidas pela 1ª rodada, mais recente primeiro, com before exclusivo', async () => {
    await insertDixitRound(env.DB, rec('DBTS-m1', 50_010), 'a');
    await insertDixitRound(env.DB, rec('DBTS-m1', 50_015), 'b');
    await insertDixitRound(env.DB, rec('DBTS-m2', 50_020), 'c');
    await insertDixitRound(env.DB, rec('DBTS-m3', 50_030), 'd');
    expect(await listDixitMatchIds(env.DB, 50_031, 2)).toEqual([
      { matchId: 'DBTS-m3', startedAt: 50_030 },
      { matchId: 'DBTS-m2', startedAt: 50_020 },
    ]);
    expect(await listDixitMatchIds(env.DB, 50_020, 1)).toEqual([{ matchId: 'DBTS-m1', startedAt: 50_010 }]);
  });

  it('rodadas das partidas pedidas, em ordem cronológica; nenhuma partida, nenhuma consulta', async () => {
    await insertDixitRound(env.DB, rec('DBTS-m1', 50_042, 'segunda'), 'a');
    await insertDixitRound(env.DB, rec('DBTS-m1', 50_041, 'primeira'), 'b');
    await insertDixitRound(env.DB, rec('DBTS-m2', 50_043, 'outra'), 'c');
    expect((await dixitRoundsOfMatches(env.DB, ['DBTS-m1'])).map((r) => r.clue)).toEqual(['primeira', 'segunda']);
    expect(await dixitRoundsOfMatches(env.DB, [])).toEqual([]);
  });

  it('estatísticas leem as rodadas MAIS RECENTES até o limite, em ordem cronológica', async () => {
    for (const t of [1, 4, 2, 3]) await insertDixitRound(env.DB, rec('DBTS-f', FUTURE + t), `k${t}`);
    expect((await allDixitRounds(env.DB, 2)).map((r) => r.playedAt)).toEqual([FUTURE + 3, FUTURE + 4]);
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `npm test -w server -- dixit-history-db`
Expected: FAIL — `Failed to load url ../src/dixit-history-db`.

- [ ] **Passo 3: implementar**

Crie `server/src/dixit-history-db.ts`:

```ts
import type { DixitRoundRecord } from '@cartolina/shared';
import { STATS_ROUNDS_CAP } from './history-db';

/** Idempotente por (sala, chave da revelação): gravar a mesma revelação de novo não duplica. */
export async function insertDixitRound(db: D1Database, r: DixitRoundRecord, revealKey: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO dixit_rounds (id, match_id, room_code, reveal_key, played_at, target, round, story_card, clue, record_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (room_code, reveal_key) DO NOTHING`,
    )
    .bind(r.id, r.matchId, r.roomCode, revealKey, r.playedAt, r.target, r.round, r.storyCard, r.clue, JSON.stringify(r))
    .run();
}

export interface DixitMatchRef {
  matchId: string;
  /** Hora da 1ª rodada da partida. */
  startedAt: number;
}

/**
 * Partidas mais recentes primeiro, pela 1ª rodada; `before` pagina por esse início (exclusivo). Mesma limitação
 * do DITU: duas partidas com o mesmo início na divisa de uma página fazem a segunda ser pulada (improvável).
 */
export async function listDixitMatchIds(db: D1Database, before: number | null, limit: number): Promise<DixitMatchRef[]> {
  const base = 'SELECT match_id, MIN(played_at) AS started_at FROM dixit_rounds GROUP BY match_id';
  const order = 'ORDER BY started_at DESC, match_id DESC LIMIT ?';
  const stmt =
    before === null
      ? db.prepare(`${base} ${order}`).bind(limit)
      : db.prepare(`${base} HAVING MIN(played_at) < ? ${order}`).bind(before, limit);
  const { results } = await stmt.all<{ match_id: string; started_at: number }>();
  return results.map((r) => ({ matchId: r.match_id, startedAt: r.started_at }));
}

const parse = (rows: { record_json: string }[]): DixitRoundRecord[] => rows.map((r) => JSON.parse(r.record_json) as DixitRoundRecord);

/** Todas as rodadas das partidas pedidas (uma página: até 20), em ordem cronológica. */
export async function dixitRoundsOfMatches(db: D1Database, matchIds: readonly string[]): Promise<DixitRoundRecord[]> {
  if (matchIds.length === 0) return [];
  const marks = matchIds.map(() => '?').join(', ');
  const { results } = await db
    .prepare(`SELECT record_json FROM dixit_rounds WHERE match_id IN (${marks}) ORDER BY played_at, id`)
    .bind(...matchIds)
    .all<{ record_json: string }>();
  return parse(results);
}

/** As `cap` rodadas mais recentes, em ordem cronológica, para estatísticas e cartas famosas. */
export async function allDixitRounds(db: D1Database, cap = STATS_ROUNDS_CAP): Promise<DixitRoundRecord[]> {
  const { results } = await db
    .prepare('SELECT record_json FROM dixit_rounds ORDER BY played_at DESC, id DESC LIMIT ?')
    .bind(cap)
    .all<{ record_json: string }>();
  return parse(results).reverse();
}
```

- [ ] **Passo 4: rodar e ver passar**

Run: `npm test -w server -- dixit-history-db` e `npm run typecheck -w server`
Expected: PASS.

- [ ] **Passo 5: commit**

```bash
git add server/src/dixit-history-db.ts server/test/dixit-history-db.test.ts
git commit -m "feat(server): grava e lê as rodadas do Diquisti no D1

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 6: página do histórico do Diquisti (paginada por partida)

**Files:**
- Create: `server/src/dixit-history-page.ts`
- Modify: `server/src/history-db.ts` (constante `HISTORY_PAGE_SIZE`)
- Modify: `server/src/index.ts` (usar `HISTORY_PAGE_SIZE` no lugar de `PAGE_SIZE`)
- Test: `server/test/dixit-history-page.test.ts`

- [ ] **Passo 1: escrever os testes que falham**

Crie `server/test/dixit-history-page.test.ts`:

```ts
import { env } from 'cloudflare:test';
import type { DixitRoundRecord } from '@cartolina/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { insertDixitRound } from '../src/dixit-history-db';
import { dixitHistoryPage } from '../src/dixit-history-page';

// Faixa própria deste arquivo: sala PGTS, played_at 10_000–10_999.
function rec(match: number, playedAt: number): DixitRoundRecord {
  return {
    id: crypto.randomUUID(),
    matchId: `PGTS-${match}`,
    roomCode: 'PGTS',
    playedAt,
    target: 30,
    round: 1,
    storyteller: { name: 'Ana', color: '#8EC5FF' },
    clue: `dica ${match}`,
    storyCard: 'd001',
    cards: [{ card: 'd001', owner: { name: 'Ana', color: '#8EC5FF' } }],
    votes: [],
    scores: [{ name: 'Ana', color: '#8EC5FF', gained: 0, score: 0 }],
  };
}

const clear = () => env.DB.prepare("DELETE FROM dixit_rounds WHERE room_code = 'PGTS'").run();
beforeEach(clear);
afterEach(clear);

/** Partidas PGTS-1…PGTS-n, cada uma começando em 10_000 + i. */
async function seed(n: number): Promise<void> {
  for (let i = 1; i <= n; i++) await insertDixitRound(env.DB, rec(i, 10_000 + i), `k${i}`);
}

const ids = (from: number, to: number) => Array.from({ length: from - to + 1 }, (_, i) => `PGTS-${from - i}`);

describe('dixitHistoryPage', () => {
  it('pagina de 20 em 20 partidas, com nextBefore = início da última', async () => {
    await seed(25);
    const p1 = await dixitHistoryPage(env.DB, 10_026);
    expect(p1.game).toBe('dixit');
    expect(p1.matches.map((m) => m.id)).toEqual(ids(25, 6));
    expect(p1.nextBefore).toBe(10_006);
    expect(p1.stats).toBeNull();
    const p2 = await dixitHistoryPage(env.DB, 10_006);
    expect(p2.matches.map((m) => m.id)).toEqual(ids(5, 1));
    expect(p2.nextBefore).toBeNull();
  });

  it('exatamente 20 partidas: não há próxima página', async () => {
    await seed(20);
    const p = await dixitHistoryPage(env.DB, 10_021);
    expect(p.matches).toHaveLength(20);
    expect(p.nextBefore).toBeNull();
  });

  it('a partida vem com todas as rodadas, mesmo as jogadas depois do cursor', async () => {
    await seed(2);
    await insertDixitRound(env.DB, rec(2, 10_500), 'k2b');
    const p = await dixitHistoryPage(env.DB, 10_003);
    expect(p.matches[0]!.id).toBe('PGTS-2');
    expect(p.matches[0]!.rounds.map((r) => r.playedAt)).toEqual([10_002, 10_500]);
  });

  it('primeira página (sem before) traz as estatísticas', async () => {
    await seed(1);
    const p = await dixitHistoryPage(env.DB, null);
    expect(p.stats).not.toBeNull();
    expect(Array.isArray(p.stats!.clueWall)).toBe(true);
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `npm test -w server -- dixit-history-page`
Expected: FAIL — `Failed to load url ../src/dixit-history-page`.

- [ ] **Passo 3: implementar**

Em `server/src/history-db.ts`, logo depois de `export const STATS_ROUNDS_CAP = 5000;`:

```ts
/** Itens por página do histórico: rodadas no DITU, partidas no Diquisti. */
export const HISTORY_PAGE_SIZE = 20;
```

Em `server/src/index.ts`:
1. Apague a linha `const PAGE_SIZE = 20;`.
2. Troque `import { allRounds, listRounds } from './history-db';` por `import { HISTORY_PAGE_SIZE, allRounds, listRounds } from './history-db';`.
3. Em `getHistoryPage`, troque as três ocorrências de `PAGE_SIZE` por `HISTORY_PAGE_SIZE`.

Crie `server/src/dixit-history-page.ts`:

```ts
import { dixitMatches, summarizeDixitHistory, type DixitHistoryResponse } from '@cartolina/shared';
import { allDixitRounds, dixitRoundsOfMatches, listDixitMatchIds } from './dixit-history-db';
import { HISTORY_PAGE_SIZE } from './history-db';

/** Uma página do histórico do Diquisti: 20 partidas inteiras; estatísticas e cartas famosas só na primeira. */
export async function dixitHistoryPage(db: D1Database, before: number | null): Promise<DixitHistoryResponse> {
  // Uma a mais que a página só para saber se existe próxima.
  const refs = await listDixitMatchIds(db, before, HISTORY_PAGE_SIZE + 1);
  const page = refs.slice(0, HISTORY_PAGE_SIZE);
  const rounds = await dixitRoundsOfMatches(db, page.map((m) => m.matchId));
  return {
    game: 'dixit',
    matches: dixitMatches(rounds),
    // Lê até STATS_ROUNDS_CAP rodadas: caro demais para repetir a cada "carregar mais".
    stats: before === null ? summarizeDixitHistory(await allDixitRounds(db)) : null,
    nextBefore: refs.length > HISTORY_PAGE_SIZE ? page[page.length - 1]!.startedAt : null,
  };
}
```

- [ ] **Passo 4: rodar e ver passar**

Run: `npm test -w server` e `npm run typecheck -w server`
Expected: PASS (as rotas do DITU continuam paginando de 20 em 20).

- [ ] **Passo 5: commit**

```bash
git add server/src/dixit-history-page.ts server/src/history-db.ts server/src/index.ts server/test/dixit-history-page.test.ts
git commit -m "feat(server): página do histórico do Diquisti paginada por partida

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 7: `getHistory` tipado por jogo

**Files:**
- Modify: `web/src/net/api.ts` (`getHistory`)
- Modify: `web/src/screens/history/HistoryPanel.tsx` (prop `game: 'ito'`)
- Modify: `web/src/screens/GamePage.tsx` (só a linha da aba histórico que escolhe o `HistoryPanel`)
- Test: `web/test/history-api.test.ts`

- [ ] **Passo 1: escrever o teste que falha**

Em `web/test/history-api.test.ts`, dentro do `describe`, acrescente:

```ts
  it('getHistory do Diquisti devolve a resposta do Diquisti (partidas)', async () => {
    const body = { game: 'dixit', matches: [], stats: null, nextBefore: null };
    const res = await getHistory('dixit', null, fakeFetch(200, body), 'http://s');
    expect(res?.matches).toEqual([]);
    expect(res?.game).toBe('dixit');
  });
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `npm run typecheck -w web`
Expected: FAIL — `error TS2339: Property 'matches' does not exist on type 'HistoryResponse'.` (em tempo de execução o teste passaria; quem falha é o tipo).

- [ ] **Passo 3: implementar**

Em `web/src/net/api.ts`, troque o import de tipos por:

```ts
import type { GameId, HistoryResponseOf, RoomSummary } from '@cartolina/shared';
```

e a função `getHistory` por:

```ts
/** Histórico do jogo, no formato dele (`HistoryResponses` do shared); `null` quando o jogo não tem histórico (404). */
export async function getHistory<G extends GameId>(
  game: G,
  before: number | null = null,
  fetcher: typeof fetch = fetch,
  base: string = SERVER_URL,
): Promise<HistoryResponseOf<G> | null> {
  const qs = before === null ? '' : `?before=${before}`;
  const res = await fetcher(`${base}/history/${game}${qs}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`history_failed_${res.status}`);
  return (await res.json()) as HistoryResponseOf<G>;
}
```

Em `web/src/screens/history/HistoryPanel.tsx`:
1. Troque `import type { GameId, HistoryResponse } from '@cartolina/shared';` por `import type { HistoryResponse } from '@cartolina/shared';`.
2. Troque `export function HistoryPanel({ game }: { game: GameId }) {` por:

```tsx
/** Histórico do DITU (id `ito`). O do Diquisti fica em `games/dixit/history/`. */
export function HistoryPanel({ game }: { game: 'ito' }) {
```

Em `web/src/screens/GamePage.tsx`, na aba histórico, troque **só** esta linha:

```tsx
      ) : entry.hasHistory ? (
```

por:

```tsx
      ) : game === 'ito' ? (
```

(O Diquisti continua no "vem em breve" até a Tarefa 15; o DITU sempre teve histórico.)

- [ ] **Passo 4: rodar e ver passar**

Run: `npm run typecheck -w web` e `npm test -w web -- history-api game-page`
Expected: PASS.

- [ ] **Passo 5: commit**

```bash
git add web/src/net/api.ts web/src/screens/history/HistoryPanel.tsx web/src/screens/GamePage.tsx web/test/history-api.test.ts
git commit -m "refactor(web): getHistory devolve a resposta no formato de cada jogo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 8: textos do histórico do Diquisti

**Files:**
- Create: `web/src/games/dixit/history/format.ts`
- Create: `web/test/dixit-history-fixtures.ts`
- Test: `web/test/dixit-history-format.test.ts`

- [ ] **Passo 1: criar as fixtures do site**

Crie `web/test/dixit-history-fixtures.ts`:

```ts
import {
  PLAYER_COLORS,
  dixitMatches,
  summarizeDixitHistory,
  type DixitHistoryResponse,
  type DixitHistoryStats,
  type DixitPerson,
  type DixitRoundRecord,
} from '@cartolina/shared';

export const ANA: DixitPerson = { name: 'Ana', color: PLAYER_COLORS[0] };
export const BIA: DixitPerson = { name: 'Bia', color: PLAYER_COLORS[1] };
export const CAIO: DixitPerson = { name: 'Caio', color: PLAYER_COLORS[2] };

interface Spec {
  id: string;
  match: string;
  at: number;
  teller: DixitPerson;
  story: string;
  clue: string;
  cards: [string, DixitPerson][];
  votes: [DixitPerson, string][];
  scores: [DixitPerson, number][];
}

export function dxRound(s: Spec): DixitRoundRecord {
  return {
    id: s.id,
    matchId: s.match,
    roomCode: 'KXQ7',
    playedAt: s.at,
    target: 30,
    round: 1,
    storyteller: s.teller,
    clue: s.clue,
    storyCard: s.story,
    cards: [{ card: s.story, owner: s.teller }, ...s.cards.map(([card, owner]) => ({ card, owner }))],
    votes: s.votes.map(([voter, card]) => ({ voter, card })),
    scores: s.scores.map(([p, score]) => ({ ...p, gained: 0, score })),
  };
}

/**
 * Duas partidas. m1 (1ª rodada em 1000): Ana venceu com 31; a 2ª rodada, sem dica, ninguém achou.
 * m2 (5000): não terminou; a dica tem HTML (tem que aparecer como texto).
 */
export const SAMPLE: DixitRoundRecord[] = [
  dxRound({ id: 'r1', match: 'm1', at: 1_000, teller: ANA, story: 'd001', clue: 'luar', cards: [['d002', BIA], ['d003', CAIO]], votes: [[BIA, 'd001'], [CAIO, 'd002']], scores: [[ANA, 3], [BIA, 4], [CAIO, 0]] }),
  dxRound({ id: 'r2', match: 'm1', at: 2_000, teller: BIA, story: 'd005', clue: '', cards: [['d006', CAIO], ['d007', ANA]], votes: [[ANA, 'd006'], [CAIO, 'd007']], scores: [[ANA, 31], [BIA, 4], [CAIO, 2]] }),
  dxRound({ id: 'r3', match: 'm2', at: 5_000, teller: CAIO, story: 'd009', clue: '<b>oi</b>', cards: [['d010', ANA], ['d011', BIA]], votes: [[ANA, 'd009'], [BIA, 'd009']], scores: [[ANA, 2], [BIA, 2], [CAIO, 0]] }),
];

export function dixitResponse(rounds: DixitRoundRecord[], nextBefore: number | null = null, withStats = true): DixitHistoryResponse {
  return { game: 'dixit', matches: dixitMatches(rounds), stats: withStats ? summarizeDixitHistory(rounds) : null, nextBefore };
}

export const EMPTY_STATS: DixitHistoryStats = {
  mostWins: [],
  bestFinders: [],
  bestFoolers: [],
  bestTellers: [],
  favoriteCards: [],
  trickiestCards: [],
  clueWall: [],
  impossibleCards: [],
};
```

- [ ] **Passo 2: escrever o teste que falha**

Crie `web/test/dixit-history-format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { clueText, joinNames, matchMeta, matchOutcome, percent, plural } from '../src/games/dixit/history/format';
import { ANA, BIA, CAIO } from './dixit-history-fixtures';

describe('textos do histórico do Diquisti', () => {
  it('junta nomes com vírgula e "e"', () => {
    expect(joinNames([])).toBe('');
    expect(joinNames(['Ana'])).toBe('Ana');
    expect(joinNames(['Ana', 'Bia'])).toBe('Ana e Bia');
    expect(joinNames(['Ana', 'Bia', 'Caio'])).toBe('Ana, Bia e Caio');
  });

  it('resultado da partida: "X venceu", "X e Y venceram" ou "não terminou"', () => {
    expect(matchOutcome({ finished: true, winners: [ANA] })).toBe('Ana venceu');
    expect(matchOutcome({ finished: true, winners: [ANA, BIA, CAIO] })).toBe('Ana, Bia e Caio venceram');
    expect(matchOutcome({ finished: false, winners: [] })).toBe('não terminou');
  });

  it('meta e rodadas da partida', () => {
    expect(matchMeta({ target: 30, rounds: [{}, {}] })).toBe('meta 30 · 2 rodadas');
    expect(matchMeta({ target: 15, rounds: [{}] })).toBe('meta 15 · 1 rodada');
  });

  it('plural, porcentagem e dica', () => {
    expect(plural(1, 'voto', 'votos')).toBe('1 voto');
    expect(plural(0, 'voto', 'votos')).toBe('0 votos');
    expect(percent(2 / 3)).toBe('67%');
    expect(clueText('luar')).toBe('“luar”');
    expect(clueText('')).toBe('falada na call');
  });
});
```

- [ ] **Passo 3: rodar e ver falhar**

Run: `npm test -w web -- dixit-history-format`
Expected: FAIL — `Failed to resolve import "../src/games/dixit/history/format"`.

- [ ] **Passo 4: implementar**

Crie `web/src/games/dixit/history/format.ts`:

```ts
import type { DixitMatch } from '@cartolina/shared';

const dateFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
export const formatDate = (ms: number): string => dateFmt.format(new Date(ms));

/** "Ana", "Ana e Bia", "Ana, Bia e Caio". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

export function matchOutcome(m: Pick<DixitMatch, 'finished' | 'winners'>): string {
  if (!m.finished || m.winners.length === 0) return 'não terminou';
  const names = joinNames(m.winners.map((w) => w.name));
  return m.winners.length === 1 ? `${names} venceu` : `${names} venceram`;
}

export const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export function matchMeta(m: { target: number; rounds: readonly unknown[] }): string {
  return `meta ${m.target} · ${plural(m.rounds.length, 'rodada', 'rodadas')}`;
}

export const percent = (rate: number): string => `${Math.round(rate * 100)}%`;

/** Dica entre aspas; vazia é a dica falada na call. */
export const clueText = (clue: string): string => (clue.trim() ? `“${clue}”` : 'falada na call');
```

- [ ] **Passo 5: rodar e ver passar**

Run: `npm test -w web -- dixit-history-format` e `npm run typecheck -w web`
Expected: PASS.

- [ ] **Passo 6: commit**

```bash
git add web/src/games/dixit/history/format.ts web/test/dixit-history-fixtures.ts web/test/dixit-history-format.test.ts
git commit -m "feat(web): textos do histórico do Diquisti

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 9: cartas do histórico (itens, miniatura e o visual conto ilustrado)

**Files:**
- Create: `web/src/games/dixit/history/groups.ts`
- Create: `web/src/games/dixit/history/HistoryCard.tsx`
- Create: `web/src/games/dixit/history/dixit-history.css`
- Test: `web/test/dixit-history-cards.test.tsx`

- [ ] **Passo 1: escrever os testes que falham**

Crie `web/test/dixit-history-cards.test.tsx`:

```tsx
import { dixitMatches, summarizeDixitHistory } from '@cartolina/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HistoryCard } from '../src/games/dixit/history/HistoryCard';
import { famousItems, matchGroupKey, matchItems } from '../src/games/dixit/history/groups';
import { ANA, BIA, SAMPLE } from './dixit-history-fixtures';

describe('itens de carta do histórico', () => {
  it('faixas de cartas famosas: selo, dica, quem narrou e o rótulo da carta ampliada', () => {
    const items = famousItems(summarizeDixitHistory(SAMPLE));
    expect(items.favoritas.map((i) => i.card)).toEqual(['d001', 'd005', 'd009']);
    expect(items.favoritas[0]).toEqual({ card: 'd001', badge: '1×', label: 'favorita dos narradores · escolhida 1 vez' });
    expect(items.enganaram.map((i) => i.card)).toEqual(['d002', 'd006', 'd007']);
    expect(items.enganaram[0]).toEqual({ card: 'd002', badge: '1 voto', label: 'enganou 1 voto' });
    expect(items.mural.map((i) => i.card)).toEqual(['d009', 'd001']);
    expect(items.mural[1]).toEqual({ card: 'd001', clue: 'luar', teller: ANA, label: '“luar” · Ana narrou' });
    expect(items.impossiveis).toEqual([{ card: 'd005', clue: '', teller: BIA, label: 'ninguém achou · falada na call · Bia narrou' }]);
  });

  it('partida: uma carta por rodada, numerada pela ordem', () => {
    const m1 = dixitMatches(SAMPLE).find((m) => m.id === 'm1')!;
    expect(matchItems(m1).map((i) => i.label)).toEqual(['rodada 1 · Ana narrou · “luar”', 'rodada 2 · Bia narrou · falada na call']);
    expect(matchGroupKey('m1')).toBe('partida:m1');
  });
});

describe('HistoryCard', () => {
  it('mostra a carta com selo; clicar abre a carta ampliada daquela faixa', () => {
    const onOpen = vi.fn();
    render(<HistoryCard card="d007" group="mural" index={2} label="“luar” · Ana narrou" badge="3×" onOpen={onOpen} />);
    const btn = screen.getByRole('button', { name: '“luar” · Ana narrou' });
    expect(btn.dataset.cardId).toBe('d007');
    expect(btn.dataset.group).toBe('mural');
    expect(btn.dataset.index).toBe('2');
    expect(screen.getByText('3×')).toBeTruthy();
    fireEvent.click(btn);
    expect(onOpen).toHaveBeenCalledWith('mural', 2);
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `npm test -w web -- dixit-history-cards`
Expected: FAIL — `Failed to resolve import "../src/games/dixit/history/HistoryCard"`.

- [ ] **Passo 3: implementar**

Crie `web/src/games/dixit/history/groups.ts`:

```ts
import type { DixitHistoryStats, DixitMatch, DixitPerson } from '@cartolina/shared';
import { clueText, plural } from './format';

/** Uma carta numa faixa ou numa partida: o que aparece na miniatura e o rótulo da carta ampliada. */
export interface CardItem {
  card: string;
  label: string;
  /** Número no selo (vezes ou votos). */
  badge?: string;
  /** Dica embaixo da carta ('' = falada na call). */
  clue?: string;
  teller?: DixitPerson;
}

export const FAMOUS = [
  { key: 'favoritas', title: 'favoritas dos narradores' },
  { key: 'enganaram', title: 'as que mais enganaram' },
  { key: 'mural', title: 'mural de dicas' },
  { key: 'impossiveis', title: 'cartas impossíveis' },
] as const;
export type FamousKey = (typeof FAMOUS)[number]['key'];

export function famousItems(stats: DixitHistoryStats): Record<FamousKey, CardItem[]> {
  return {
    favoritas: stats.favoriteCards.map((c) => ({
      card: c.card,
      badge: `${c.count}×`,
      label: `favorita dos narradores · escolhida ${plural(c.count, 'vez', 'vezes')}`,
    })),
    enganaram: stats.trickiestCards.map((c) => ({
      card: c.card,
      badge: plural(c.count, 'voto', 'votos'),
      label: `enganou ${plural(c.count, 'voto', 'votos')}`,
    })),
    mural: stats.clueWall.map((e) => ({
      card: e.card,
      clue: e.clue,
      teller: e.storyteller,
      label: `${clueText(e.clue)} · ${e.storyteller.name} narrou`,
    })),
    impossiveis: stats.impossibleCards.map((e) => ({
      card: e.card,
      clue: e.clue,
      teller: e.storyteller,
      label: `ninguém achou · ${clueText(e.clue)} · ${e.storyteller.name} narrou`,
    })),
  };
}

/** Grupo da carta ampliada de uma partida (as setas navegam pelas cartas do narrador dela). */
export const matchGroupKey = (matchId: string): string => `partida:${matchId}`;

/** Rodadas numeradas pela ordem na partida (o `round` gravado pode pular números). */
export function matchItems(m: DixitMatch): CardItem[] {
  return m.rounds.map((r, i) => ({
    card: r.storyCard,
    clue: r.clue,
    teller: r.storyteller,
    label: `rodada ${i + 1} · ${r.storyteller.name} narrou · ${clueText(r.clue)}`,
  }));
}
```

Crie `web/src/games/dixit/history/HistoryCard.tsx`:

```tsx
import { CardArt } from '../CardArt';

interface Props {
  card: string;
  /** Faixa ou partida onde a carta está: a carta ampliada navega dentro dela. */
  group: string;
  index: number;
  label: string;
  badge?: string;
  onOpen: (group: string, index: number) => void;
}

/** Miniatura de carta do histórico. Clique abre a carta ampliada; a rodinha pra cima é tratada no painel (pelos `data-*`). */
export function HistoryCard({ card, group, index, label, badge, onOpen }: Props) {
  return (
    <button
      type="button"
      className="dxh-card"
      aria-label={label}
      data-card-id={card}
      data-group={group}
      data-index={index}
      onClick={() => onOpen(group, index)}
    >
      <CardArt id={card} />
      {badge && <span className="dxh-seal">{badge}</span>}
    </button>
  );
}
```

Crie `web/src/games/dixit/history/dixit-history.css` (todas as classes da aba; as tarefas seguintes só usam):

```css
/* Histórico do Diquisti: o "conto ilustrado" da mesa dentro da página do jogo (o topo da página continua no papel do cartolina). */
.dxh {
  --bg: #233D36; --sf: #2F5046; --cream: #F6EAD2; --must: #F2A541; --mu: #B7C7B0; --deep: #1B2F2A;
  --serif: 'DM Serif Display', Georgia, serif; --ui: 'Nunito', system-ui, sans-serif; --spring: cubic-bezier(.34, 1.56, .64, 1);
  position: relative; box-sizing: border-box; width: min(760px, 100%); padding: 24px 20px 28px; border-radius: 18px; overflow: hidden;
  background: var(--bg); color: var(--cream); font-family: var(--ui); font-weight: 300;
  border: .75px solid rgba(246,234,210,.55); box-shadow: inset 0 0 0 7px var(--bg), inset 0 0 0 7.75px rgba(246,234,210,.18);
  display: flex; flex-direction: column; gap: 30px;
}
.dxh > :not(.dx-bg):not(.dx-viewer) { position: relative; z-index: 1; }
.dxh button { font: inherit; color: inherit; cursor: pointer; }
.dxh h2 { margin: 0 0 14px; font: 400 30px/1.1 var(--serif); }
.dxh h3 { margin: 0 0 8px; font: 400 19px/1.15 var(--serif); }
.dxh .muted { margin: 0; color: var(--mu); font-size: 13.5px; }
.dxh .critter, .dxh .critter svg { display: block; width: 100%; height: 100%; }
.dxh-error { margin: 8px 0 0; color: #ffb4a8; font-size: 13px; }

/* a galera */
.dxh-boards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.dxh-board { padding: 14px; border: .75px solid rgba(246,234,210,.4); border-radius: 14px; background: rgba(27,47,42,.85); }
.dxh-board ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 9px; }
.dxh-board li { display: grid; grid-template-columns: 30px minmax(0, 1fr); gap: 8px; align-items: center; }
.dxh-board .critter { width: 30px; height: 30px; }
.dxh-board b { display: block; font: 600 14px/1.2 var(--ui); overflow-wrap: anywhere; }
.dxh-board small { display: block; margin-top: 2px; font-size: 12px; color: var(--mu); }
.dxh-board li:first-child b { color: var(--must); }

/* cartas famosas: faixas que rolam pro lado */
.dxh-famous { display: flex; flex-direction: column; gap: 18px; }
.dxh-strip { display: flex; gap: 16px; overflow-x: auto; padding: 14px 4px 10px 14px; scroll-snap-type: x proximity; }
.dxh-item { flex: none; width: 96px; display: flex; flex-direction: column; gap: 6px; scroll-snap-align: start; }
.dxh-item.wide { width: 132px; }
.dxh-card { position: relative; flex: none; width: 96px; height: 144px; padding: 3px; border: .75px solid var(--cream); border-radius: 4px; background: var(--bg); transition: transform .3s var(--spring); }
.dxh-card:hover, .dxh-card:focus-visible { transform: translateY(-4px); }
.dxh-card:focus-visible { outline: 1.5px solid var(--must); outline-offset: 3px; }
.dxh-seal { position: absolute; left: -10px; bottom: 8px; min-width: 28px; height: 28px; padding: 0 8px; box-sizing: border-box; display: grid; place-items: center; border-radius: 14px; background: var(--bg); border: .75px solid var(--cream); box-shadow: 0 3px 8px rgba(0,0,0,.4); font: 400 13px/1 var(--serif); color: var(--cream); white-space: nowrap; }
.dxh-cap { margin: 0; font: italic 400 14px/1.25 var(--serif); overflow-wrap: anywhere; }
.dxh-cap.muted { font: 300 12px/1.3 var(--ui); }
.dxh-who { display: flex; align-items: center; gap: 5px; font-size: 12px; color: var(--mu); }
.dxh-who .critter { width: 20px; height: 20px; flex: none; }

/* partidas */
.dxh-matches { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.dxh-match { border: .75px solid rgba(246,234,210,.4); border-radius: 14px; background: rgba(27,47,42,.85); overflow: hidden; }
.dxh-match-head { width: 100%; display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; gap: 8px 12px; align-items: center; padding: 12px 14px; background: none; border: none; text-align: left; }
.dxh-match-head:focus-visible { outline: 1.5px solid var(--must); outline-offset: -4px; }
.dxh-match-head[aria-expanded='true'] { border-bottom: .5px solid rgba(246,234,210,.15); }
.dxh-date { font-size: 13px; color: var(--mu); white-space: nowrap; }
.dxh-meta { font-size: 14px; }
.dxh-outcome { font: italic 400 17px/1.1 var(--serif); color: var(--must); white-space: nowrap; }
.dxh-outcome.open { font: 300 13px/1 var(--ui); color: var(--mu); }
.dxh-faces { display: flex; flex-wrap: wrap; gap: 2px; }
.dxh-faces .critter { width: 24px; height: 24px; }
.dxh-match-body { padding: 12px 14px 16px; display: flex; flex-direction: column; gap: 10px; }
.dxh-final { list-style: none; margin: 0 0 6px; padding: 0; display: flex; flex-wrap: wrap; gap: 8px 18px; }
.dxh-final li { display: flex; align-items: center; gap: 6px; font-size: 14px; }
.dxh-final .critter { width: 26px; height: 26px; }
.dxh-final b { font: 400 20px/1 var(--serif); color: var(--must); }
.dxh-rounds { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.dxh-round { display: grid; grid-template-columns: 22px 54px minmax(0, 1fr); gap: 10px; align-items: center; }
.dxh-round .n { font: 400 15px/1 var(--serif); color: var(--mu); }
.dxh-round .dxh-card { width: 54px; height: 81px; padding: 2px; }
.dxh-round-text { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.dxh-more { align-self: center; margin-top: 12px; padding: 9px 18px; border: .75px solid var(--must); border-radius: 999px; background: none; color: var(--must) !important; font: 600 14px/1 var(--ui); }
.dxh-more:disabled { opacity: .5; }

/* sem dados, erro */
.dxh-empty { display: flex; flex-direction: column; align-items: center; gap: 14px; text-align: center; padding: 30px 0; }
.dxh .dxh-empty .dx-btn, .dxh-fail .dx-btn { display: inline-block; width: auto; padding: 10px 24px; }
.dxh-fail { display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; }

/* carta ampliada: na página ela cobre a janela toda */
.dxh .dx-viewer { position: fixed; z-index: 60; }
.dxh .dx-viewer:focus { outline: none; }
.dxh .dx-big { width: min(420px, 62vw); height: auto; aspect-ratio: 2 / 3; }

@media (max-width: 720px) {
  .dxh { padding: 18px 14px 22px; }
  .dxh-boards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .dxh-match-head { grid-template-columns: minmax(0, 1fr) auto; }
}
@media (prefers-reduced-motion: reduce) {
  .dxh-card { transition: none; }
}
```

- [ ] **Passo 4: rodar e ver passar**

Run: `npm test -w web -- dixit-history-cards` e `npm run typecheck -w web`
Expected: PASS.

- [ ] **Passo 5: commit**

```bash
git add web/src/games/dixit/history/groups.ts web/src/games/dixit/history/HistoryCard.tsx web/src/games/dixit/history/dixit-history.css web/test/dixit-history-cards.test.tsx
git commit -m "feat(web): cartas do histórico do Diquisti e o visual conto ilustrado

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 10: quadros da galera

**Files:**
- Create: `web/src/games/dixit/history/GaleraBoards.tsx`
- Test: `web/test/dixit-history-boards.test.tsx`

- [ ] **Passo 1: escrever o teste que falha**

Crie `web/test/dixit-history-boards.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GaleraBoards } from '../src/games/dixit/history/GaleraBoards';
import { ANA, BIA, CAIO, EMPTY_STATS } from './dixit-history-fixtures';

describe('quadros da galera', () => {
  it('quatro quadros com o top 3, em ordem, e o detalhe de cada um', () => {
    render(
      <GaleraBoards
        stats={{
          ...EMPTY_STATS,
          mostWins: [{ ...ANA, wins: 3 }, { ...BIA, wins: 1 }],
          bestFinders: [{ ...BIA, hits: 4, total: 5, rate: 0.8 }],
          bestFoolers: [{ ...CAIO, hits: 7, total: 5, rate: 1.4 }],
          bestTellers: [{ ...ANA, hits: 2, total: 3, rate: 2 / 3 }],
        }}
      />,
    );
    expect(screen.getByRole('heading', { name: 'a galera' })).toBeTruthy();
    const wins = within(screen.getByRole('region', { name: 'quem mais venceu' })).getAllByRole('listitem');
    expect(wins).toHaveLength(2);
    expect(within(wins[0]!).getByText('Ana')).toBeTruthy();
    expect(within(wins[0]!).getByText('3 vitórias')).toBeTruthy();
    expect(within(wins[1]!).getByText('1 vitória')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'quem mais acha' })).getByText('80% · achou 4 de 5 votos')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'quem mais engana' })).getByText('7 votos em 5 rodadas')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'melhor narrador' })).getByText('67% · 2 de 3 narrações')).toBeTruthy();
  });

  it('quadro sem ninguém no mínimo pede mais rodadas', () => {
    render(<GaleraBoards stats={EMPTY_STATS} />);
    expect(screen.getAllByText('jogue mais umas rodadas')).toHaveLength(4);
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `npm test -w web -- dixit-history-boards`
Expected: FAIL — `Failed to resolve import "../src/games/dixit/history/GaleraBoards"`.

- [ ] **Passo 3: implementar**

Crie `web/src/games/dixit/history/GaleraBoards.tsx`:

```tsx
import type { DixitHistoryStats } from '@cartolina/shared';
import { Critter } from '../../../screens/Critter';
import { percent, plural } from './format';

interface Row {
  name: string;
  color: string;
  detail: string;
}

function Board({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <section className="dxh-board" aria-label={title}>
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p className="muted">jogue mais umas rodadas</p>
      ) : (
        <ol>
          {rows.map((r) => (
            <li key={r.name}>
              <Critter color={r.color} />
              <span>
                <b>{r.name}</b>
                <small>{r.detail}</small>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Quatro quadros com o top 3 de cada estatística (abaixo do mínimo, o quadro pede mais rodadas). */
export function GaleraBoards({ stats }: { stats: DixitHistoryStats }) {
  return (
    <section>
      <h2>a galera</h2>
      <div className="dxh-boards">
        <Board title="quem mais venceu" rows={stats.mostWins.map((e) => ({ ...e, detail: plural(e.wins, 'vitória', 'vitórias') }))} />
        <Board
          title="quem mais acha"
          rows={stats.bestFinders.map((e) => ({ ...e, detail: `${percent(e.rate)} · achou ${e.hits} de ${plural(e.total, 'voto', 'votos')}` }))}
        />
        <Board
          title="quem mais engana"
          rows={stats.bestFoolers.map((e) => ({ ...e, detail: `${plural(e.hits, 'voto', 'votos')} em ${plural(e.total, 'rodada', 'rodadas')}` }))}
        />
        <Board
          title="melhor narrador"
          rows={stats.bestTellers.map((e) => ({ ...e, detail: `${percent(e.rate)} · ${e.hits} de ${plural(e.total, 'narração', 'narrações')}` }))}
        />
      </div>
    </section>
  );
}
```

- [ ] **Passo 4: rodar e ver passar**

Run: `npm test -w web -- dixit-history-boards` e `npm run typecheck -w web`
Expected: PASS.

- [ ] **Passo 5: commit**

```bash
git add web/src/games/dixit/history/GaleraBoards.tsx web/test/dixit-history-boards.test.tsx
git commit -m "feat(web): quadros da galera no histórico do Diquisti

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 11: faixas de cartas famosas

**Files:**
- Create: `web/src/games/dixit/history/FamousCards.tsx`
- Test: `web/test/dixit-history-famous.test.tsx`

- [ ] **Passo 1: escrever o teste que falha**

Crie `web/test/dixit-history-famous.test.tsx`:

```tsx
import { summarizeDixitHistory } from '@cartolina/shared';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FamousCards } from '../src/games/dixit/history/FamousCards';
import { famousItems } from '../src/games/dixit/history/groups';
import { EMPTY_STATS, SAMPLE } from './dixit-history-fixtures';

const cardsIn = (region: HTMLElement) => within(region).getAllByRole('button').map((b) => b.getAttribute('data-card-id'));

describe('cartas famosas', () => {
  it('quatro faixas com as pinturas, os selos, as dicas e quem narrou', () => {
    render(<FamousCards items={famousItems(summarizeDixitHistory(SAMPLE))} onOpen={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'cartas famosas' })).toBeTruthy();
    const fav = screen.getByRole('region', { name: 'favoritas dos narradores' });
    expect(cardsIn(fav)).toEqual(['d001', 'd005', 'd009']);
    expect(within(fav).getAllByText('1×')).toHaveLength(3);
    const tricky = screen.getByRole('region', { name: 'as que mais enganaram' });
    expect(cardsIn(tricky)).toEqual(['d002', 'd006', 'd007']);
    expect(within(tricky).getAllByText('1 voto')).toHaveLength(3);
    const wall = screen.getByRole('region', { name: 'mural de dicas' });
    expect(cardsIn(wall)).toEqual(['d009', 'd001']);
    expect(within(wall).getByText('“luar”')).toBeTruthy();
    expect(within(wall).getByText('Ana')).toBeTruthy();
    const impossible = screen.getByRole('region', { name: 'cartas impossíveis' });
    expect(cardsIn(impossible)).toEqual(['d005']);
    expect(within(impossible).getByText('falada na call')).toBeTruthy();
    expect(within(impossible).getByText('Bia')).toBeTruthy();
  });

  it('dica com HTML aparece como texto', () => {
    render(<FamousCards items={famousItems(summarizeDixitHistory(SAMPLE))} onOpen={vi.fn()} />);
    const wall = screen.getByRole('region', { name: 'mural de dicas' });
    expect(within(wall).getByText('“<b>oi</b>”')).toBeTruthy();
    expect(wall.querySelector('b')).toBeNull();
  });

  it('clicar numa carta abre a carta ampliada daquela faixa', () => {
    const onOpen = vi.fn();
    render(<FamousCards items={famousItems(summarizeDixitHistory(SAMPLE))} onOpen={onOpen} />);
    fireEvent.click(within(screen.getByRole('region', { name: 'mural de dicas' })).getAllByRole('button')[1]!);
    expect(onOpen).toHaveBeenCalledWith('mural', 1);
  });

  it('faixa vazia avisa', () => {
    render(<FamousCards items={famousItems(EMPTY_STATS)} onOpen={vi.fn()} />);
    expect(screen.getAllByText('ainda nenhuma carta aqui')).toHaveLength(4);
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `npm test -w web -- dixit-history-famous`
Expected: FAIL — `Failed to resolve import "../src/games/dixit/history/FamousCards"`.

- [ ] **Passo 3: implementar**

Crie `web/src/games/dixit/history/FamousCards.tsx`:

```tsx
import { Critter } from '../../../screens/Critter';
import { clueText } from './format';
import { FAMOUS, type CardItem, type FamousKey } from './groups';
import { HistoryCard } from './HistoryCard';

interface Props {
  items: Record<FamousKey, CardItem[]>;
  onOpen: (group: string, index: number) => void;
}

/** Quatro faixas de cartas (rolam pro lado no celular), sempre com a pintura. */
export function FamousCards({ items, onOpen }: Props) {
  return (
    <section className="dxh-famous">
      <h2>cartas famosas</h2>
      {FAMOUS.map(({ key, title }) => (
        <section key={key} aria-label={title}>
          <h3>{title}</h3>
          {items[key].length === 0 ? (
            <p className="muted">ainda nenhuma carta aqui</p>
          ) : (
            <div className="dxh-strip">
              {items[key].map((it, i) => (
                <div key={`${it.card}-${i}`} className={it.clue === undefined ? 'dxh-item' : 'dxh-item wide'}>
                  <HistoryCard card={it.card} group={key} index={i} label={it.label} badge={it.badge} onOpen={onOpen} />
                  {it.clue !== undefined && <p className={it.clue.trim() ? 'dxh-cap' : 'dxh-cap muted'}>{clueText(it.clue)}</p>}
                  {it.teller && (
                    <span className="dxh-who">
                      <Critter color={it.teller.color} />
                      {it.teller.name}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
    </section>
  );
}
```

- [ ] **Passo 4: rodar e ver passar**

Run: `npm test -w web -- dixit-history-famous` e `npm run typecheck -w web`
Expected: PASS.

- [ ] **Passo 5: commit**

```bash
git add web/src/games/dixit/history/FamousCards.tsx web/test/dixit-history-famous.test.tsx
git commit -m "feat(web): faixas de cartas famosas no histórico do Diquisti

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 12: lista de partidas, com a partida aberta

**Files:**
- Create: `web/src/games/dixit/history/MatchList.tsx`
- Test: `web/test/dixit-history-matches.test.tsx`

- [ ] **Passo 1: escrever o teste que falha**

Crie `web/test/dixit-history-matches.test.tsx`:

```tsx
import { dixitMatches } from '@cartolina/shared';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MatchList } from '../src/games/dixit/history/MatchList';
import { SAMPLE } from './dixit-history-fixtures';

const heads = () => screen.getAllByRole('button').filter((b) => b.classList.contains('dxh-match-head'));
const bodyOf = (head: HTMLElement) => document.getElementById(head.getAttribute('aria-controls')!)!;

describe('partidas do Diquisti', () => {
  it('a mais recente primeiro: data, meta e rodadas, resultado', () => {
    render(<MatchList matches={dixitMatches(SAMPLE)} onOpen={vi.fn()} />);
    const [m2, m1] = heads();
    expect(m2!.textContent).toContain('não terminou');
    expect(m2!.textContent).toContain('meta 30 · 1 rodada');
    expect(m1!.textContent).toContain('Ana venceu');
    expect(m1!.textContent).toContain('meta 30 · 2 rodadas');
    expect(m1!.getAttribute('aria-expanded')).toBe('false');
  });

  it('abrir mostra o placar final e uma linha por rodada (narrador, carta, dica ou "falada na call")', () => {
    const onOpen = vi.fn();
    render(<MatchList matches={dixitMatches(SAMPLE)} onOpen={onOpen} />);
    const m1 = heads()[1]!;
    fireEvent.click(m1);
    expect(m1.getAttribute('aria-expanded')).toBe('true');
    const body = bodyOf(m1);
    expect(within(body).getByRole('heading', { name: 'placar final' })).toBeTruthy();
    expect(within(body).getByText('31')).toBeTruthy();
    expect(within(body).getByText('“luar”')).toBeTruthy();
    expect(within(body).getByText('falada na call')).toBeTruthy();
    expect(within(body).getByText('Bia narrou')).toBeTruthy();
    const cards = within(body).getAllByRole('button');
    expect(cards.map((c) => c.getAttribute('data-card-id'))).toEqual(['d001', 'd005']);
    fireEvent.click(cards[1]!);
    expect(onOpen).toHaveBeenCalledWith('partida:m1', 1);
  });

  it('partida que não terminou mostra o placar de onde parou; abrir outra fecha a primeira', () => {
    render(<MatchList matches={dixitMatches(SAMPLE)} onOpen={vi.fn()} />);
    const [m2, m1] = heads();
    fireEvent.click(m1!);
    fireEvent.click(m2!);
    expect(within(bodyOf(m2!)).getByRole('heading', { name: 'placar de onde parou' })).toBeTruthy();
    expect(m1!.getAttribute('aria-expanded')).toBe('false');
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `npm test -w web -- dixit-history-matches`
Expected: FAIL — `Failed to resolve import "../src/games/dixit/history/MatchList"`.

- [ ] **Passo 3: implementar**

Crie `web/src/games/dixit/history/MatchList.tsx`:

```tsx
import type { DixitMatch } from '@cartolina/shared';
import { useId, useState } from 'react';
import { Critter } from '../../../screens/Critter';
import { clueText, formatDate, matchMeta, matchOutcome } from './format';
import { matchGroupKey, matchItems } from './groups';
import { HistoryCard } from './HistoryCard';

type OnOpen = (group: string, index: number) => void;

function MatchItem({ match, open, onToggle, onOpen }: { match: DixitMatch; open: boolean; onToggle: () => void; onOpen: OnOpen }) {
  const bodyId = useId();
  const items = matchItems(match);
  return (
    <li className="dxh-match">
      <button type="button" className="dxh-match-head" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
        <span className="dxh-date">{formatDate(match.startedAt)}</span>
        <span className="dxh-meta">{matchMeta(match)}</span>
        <span className={match.finished ? 'dxh-outcome' : 'dxh-outcome open'}>{matchOutcome(match)}</span>
        <span className="dxh-faces">
          {/* nomes podem repetir numa sala; personagens não */}
          {match.scores.map((s) => (
            <Critter key={s.color} color={s.color} />
          ))}
        </span>
      </button>
      {open && (
        <div className="dxh-match-body" id={bodyId}>
          <h3>{match.finished ? 'placar final' : 'placar de onde parou'}</h3>
          <ol className="dxh-final">
            {match.scores.map((s) => (
              <li key={s.color}>
                <Critter color={s.color} />
                {s.name} <b>{s.score}</b>
              </li>
            ))}
          </ol>
          <h3>rodadas</h3>
          <ol className="dxh-rounds">
            {match.rounds.map((r, i) => (
              <li key={r.id} className="dxh-round">
                <span className="n">{i + 1}</span>
                <HistoryCard card={r.storyCard} group={matchGroupKey(match.id)} index={i} label={items[i]!.label} onOpen={onOpen} />
                <span className="dxh-round-text">
                  <span className="dxh-who">
                    <Critter color={r.storyteller.color} />
                    {`${r.storyteller.name} narrou`}
                  </span>
                  <span className={r.clue.trim() ? 'dxh-cap' : 'dxh-cap muted'}>{clueText(r.clue)}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </li>
  );
}

/** Partidas, a mais recente primeiro; uma aberta por vez. */
export function MatchList({ matches, onOpen }: { matches: DixitMatch[]; onOpen: OnOpen }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ul className="dxh-matches">
      {matches.map((m) => (
        <MatchItem key={m.id} match={m} open={open === m.id} onToggle={() => setOpen(open === m.id ? null : m.id)} onOpen={onOpen} />
      ))}
    </ul>
  );
}
```

- [ ] **Passo 4: rodar e ver passar**

Run: `npm test -w web -- dixit-history-matches` e `npm run typecheck -w web`
Expected: PASS.

- [ ] **Passo 5: commit**

```bash
git add web/src/games/dixit/history/MatchList.tsx web/test/dixit-history-matches.test.tsx
git commit -m "feat(web): partidas do Diquisti com placar e rodadas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 13: histórico vazio (criar sala)

**Files:**
- Create: `web/src/games/dixit/history/EmptyHistory.tsx`
- Test: `web/test/dixit-history-empty.test.tsx`

- [ ] **Passo 1: escrever o teste que falha**

Crie `web/test/dixit-history-empty.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmptyHistory } from '../src/games/dixit/history/EmptyHistory';
import * as api from '../src/net/api';

vi.mock('../src/net/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/net/api')>();
  return { ...actual, createRoom: vi.fn() };
});

describe('histórico do Diquisti vazio', () => {
  beforeEach(() => vi.mocked(api.createRoom).mockReset());
  afterEach(() => {
    window.location.hash = '';
  });

  it('convida a jogar e cria a sala do Diquisti', async () => {
    vi.mocked(api.createRoom).mockResolvedValue('DXQ7');
    render(<EmptyHistory />);
    expect(screen.getByText('Ainda não tem partida de Diquisti. Bora jogar a primeira!')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'criar sala' }));
    await waitFor(() => expect(window.location.hash).toBe('#/sala/DXQ7'));
    expect(api.createRoom).toHaveBeenCalledWith('dixit');
  });

  it('falha ao criar: avisa e o botão continua', async () => {
    vi.mocked(api.createRoom).mockRejectedValue(new Error('create_failed_500'));
    render(<EmptyHistory />);
    fireEvent.click(screen.getByRole('button', { name: 'criar sala' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Não deu pra criar a sala. Tenta de novo.');
    expect(screen.getByRole('button', { name: 'criar sala' })).toBeTruthy();
  });

  it('pedidos demais (429): pede calma', async () => {
    vi.mocked(api.createRoom).mockRejectedValue(new Error('create_failed_429'));
    render(<EmptyHistory />);
    fireEvent.click(screen.getByRole('button', { name: 'criar sala' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Calma! Tenta de novo em um minutinho.');
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `npm test -w web -- dixit-history-empty`
Expected: FAIL — `Failed to resolve import "../src/games/dixit/history/EmptyHistory"`.

- [ ] **Passo 3: implementar**

Crie `web/src/games/dixit/history/EmptyHistory.tsx`:

```tsx
import { useState } from 'react';
import { goToRoom } from '../../../lib/router';
import { createRoom } from '../../../net/api';
import { TOO_MANY_MESSAGE, isTooMany } from '../../../net/errors';

/**
 * Histórico ainda vazio: convida a jogar a primeira partida. Mesmo comportamento do "criar sala" da aba jogar
 * (a `PlayTab` não é extraída para não mexer na aba jogar, que a versão de celular está mudando).
 */
export function EmptyHistory() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      goToRoom(await createRoom('dixit'));
    } catch (err) {
      setError(isTooMany(err) ? TOO_MANY_MESSAGE : 'Não deu pra criar a sala. Tenta de novo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="dxh-empty">
      <h2>Ainda não tem partida de Diquisti. Bora jogar a primeira!</h2>
      <button className="dx-btn" type="button" onClick={() => void create()} disabled={busy}>
        {busy ? 'criando…' : 'criar sala'}
      </button>
      {error && (
        <p className="dxh-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
```

- [ ] **Passo 4: rodar e ver passar**

Run: `npm test -w web -- dixit-history-empty` e `npm run typecheck -w web`
Expected: PASS.

- [ ] **Passo 5: commit**

```bash
git add web/src/games/dixit/history/EmptyHistory.tsx web/test/dixit-history-empty.test.tsx
git commit -m "feat(web): histórico do Diquisti vazio convida a jogar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 14: a aba montada (carga, erros, "carregar mais", carta ampliada)

**Files:**
- Create: `web/src/games/dixit/history/useDixitHistory.ts`
- Create: `web/src/games/dixit/history/DixitHistory.tsx`
- Test: `web/test/dixit-history.test.tsx`

- [ ] **Passo 1: escrever o teste que falha**

Crie `web/test/dixit-history.test.tsx`:

```tsx
import type { DixitHistoryResponse } from '@cartolina/shared';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DixitHistory } from '../src/games/dixit/history/DixitHistory';
import * as api from '../src/net/api';
import { SAMPLE, dixitResponse } from './dixit-history-fixtures';

vi.mock('../src/net/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/net/api')>();
  return { ...actual, createRoom: vi.fn(), getHistory: vi.fn() };
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const heads = () => screen.getAllByRole('button').filter((b) => b.classList.contains('dxh-match-head'));

describe('aba histórico do Diquisti', () => {
  beforeEach(() => {
    vi.mocked(api.getHistory).mockReset();
    vi.mocked(api.createRoom).mockReset();
  });
  afterEach(() => {
    window.location.hash = '';
  });

  it('de cima pra baixo: a galera, as cartas famosas e as partidas (a mais recente primeiro)', async () => {
    vi.mocked(api.getHistory).mockResolvedValue(dixitResponse(SAMPLE));
    const { container } = render(<DixitHistory />);
    expect(await screen.findByRole('heading', { name: 'a galera' })).toBeTruthy();
    expect(api.getHistory).toHaveBeenCalledWith('dixit');
    const titles = [...container.querySelectorAll('h2')].map((h) => h.textContent);
    expect(titles).toEqual(['a galera', 'cartas famosas', 'partidas']);
    expect(within(screen.getByRole('region', { name: 'quem mais venceu' })).getByText('Ana')).toBeTruthy();
    expect(heads().map((h) => h.textContent?.includes('não terminou'))).toEqual([true, false]);
  });

  it('abrir uma partida mostra o placar final e as rodadas', async () => {
    vi.mocked(api.getHistory).mockResolvedValue(dixitResponse(SAMPLE));
    render(<DixitHistory />);
    await screen.findByRole('heading', { name: 'partidas' });
    fireEvent.click(heads()[1]!);
    const body = document.getElementById(heads()[1]!.getAttribute('aria-controls')!)!;
    expect(within(body).getByRole('heading', { name: 'placar final' })).toBeTruthy();
    expect(within(body).getByText('“luar”')).toBeTruthy();
  });

  it('clicar numa carta abre a carta ampliada com o rótulo; as setas navegam na faixa; Esc fecha', async () => {
    vi.mocked(api.getHistory).mockResolvedValue(dixitResponse(SAMPLE));
    render(<DixitHistory />);
    const fav = await screen.findByRole('region', { name: 'favoritas dos narradores' });
    fireEvent.click(within(fav).getAllByRole('button')[0]!);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-label')).toBe('favorita dos narradores · escolhida 1 vez');
    expect(dialog.querySelector('.dx-big img')!.getAttribute('src')).toContain('d001');
    fireEvent.keyDown(dialog, { key: 'ArrowRight' });
    // a próxima da mesma faixa (favoritas: d001, d005, d009)
    expect(screen.getByRole('dialog').querySelector('.dx-big img')!.getAttribute('src')).toContain('d005');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('rodinha pra cima numa carta também amplia', async () => {
    vi.mocked(api.getHistory).mockResolvedValue(dixitResponse(SAMPLE));
    render(<DixitHistory />);
    const wall = await screen.findByRole('region', { name: 'mural de dicas' });
    fireEvent.wheel(within(wall).getAllByRole('button')[1]!, { deltaY: -120 });
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('“luar” · Ana narrou');
  });

  it('sem partidas: convida a jogar a primeira', async () => {
    vi.mocked(api.getHistory).mockResolvedValue(dixitResponse([]));
    render(<DixitHistory />);
    expect(await screen.findByText('Ainda não tem partida de Diquisti. Bora jogar a primeira!')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'criar sala' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'a galera' })).toBeNull();
  });

  it('carregar mais traz as partidas seguintes e mantém as estatísticas da primeira página', async () => {
    vi.mocked(api.getHistory)
      .mockResolvedValueOnce(dixitResponse([SAMPLE[2]!], 5_000))
      .mockResolvedValueOnce(dixitResponse(SAMPLE.slice(0, 2), null, false));
    render(<DixitHistory />);
    fireEvent.click(await screen.findByRole('button', { name: 'carregar mais' }));
    await screen.findByText('Ana venceu');
    expect(api.getHistory).toHaveBeenLastCalledWith('dixit', 5_000);
    expect(heads()).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'a galera' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'carregar mais' })).toBeNull();
  });

  it('falha ao carregar mais: mensagem perto do botão, que continua lá', async () => {
    vi.mocked(api.getHistory)
      .mockResolvedValueOnce(dixitResponse([SAMPLE[2]!], 5_000))
      .mockRejectedValueOnce(new Error('history_failed_500'));
    render(<DixitHistory />);
    fireEvent.click(await screen.findByRole('button', { name: 'carregar mais' }));
    expect(await screen.findByText('Não deu pra carregar mais partidas. Tenta de novo.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'carregar mais' })).toBeTruthy();
  });

  it('erro na primeira carga: "tentar de novo" recarrega', async () => {
    vi.mocked(api.getHistory)
      .mockRejectedValueOnce(new Error('history_failed_500'))
      .mockResolvedValueOnce(dixitResponse(SAMPLE));
    render(<DixitHistory />);
    expect(await screen.findByText('não deu pra falar com o servidor')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'tentar de novo' }));
    expect(await screen.findByRole('heading', { name: 'a galera' })).toBeTruthy();
  });

  it('pedidos demais (429): "Calma!"', async () => {
    vi.mocked(api.getHistory).mockRejectedValue(new Error('history_failed_429'));
    render(<DixitHistory />);
    expect(await screen.findByText('Calma! Tenta de novo em um minutinho.')).toBeTruthy();
    expect(screen.queryByText('não deu pra falar com o servidor')).toBeNull();
  });

  it('mostra "carregando…" como status', () => {
    vi.mocked(api.getHistory).mockReturnValue(new Promise(() => {}));
    render(<DixitHistory />);
    expect(screen.getByRole('status').textContent).toBe('carregando…');
  });

  it('servidor sem histórico do Diquisti (null): avisa', async () => {
    vi.mocked(api.getHistory).mockResolvedValue(null);
    render(<DixitHistory />);
    expect(await screen.findByText('Esse jogo ainda não tem histórico.')).toBeTruthy();
  });

  it('ignora resposta antiga que chega depois (StrictMode roda o efeito duas vezes)', async () => {
    const old = deferred<DixitHistoryResponse | null>();
    vi.mocked(api.getHistory).mockReturnValueOnce(old.promise).mockResolvedValueOnce(dixitResponse(SAMPLE));
    render(
      <StrictMode>
        <DixitHistory />
      </StrictMode>,
    );
    expect(await screen.findByRole('heading', { name: 'a galera' })).toBeTruthy();
    await act(async () => old.resolve(dixitResponse([])));
    expect(screen.queryByText('Ainda não tem partida de Diquisti. Bora jogar a primeira!')).toBeNull();
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `npm test -w web -- dixit-history.test`
Expected: FAIL — `Failed to resolve import "../src/games/dixit/history/DixitHistory"`.

- [ ] **Passo 3: implementar o hook**

Crie `web/src/games/dixit/history/useDixitHistory.ts`:

```ts
import type { DixitHistoryResponse } from '@cartolina/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getHistory } from '../../../net/api';
import { TOO_MANY_MESSAGE, isTooMany } from '../../../net/errors';

export interface DixitHistoryState {
  /** `undefined` carregando; `null` o servidor não tem histórico do Diquisti. */
  data: DixitHistoryResponse | null | undefined;
  /** Falha da primeira carga: `too_many` (429) ou `net` (servidor fora/rede). */
  loadFailed: false | 'net' | 'too_many';
  loadingMore: boolean;
  moreError: string | null;
  reload: () => void;
  loadMore: () => Promise<void>;
}

/** Carga do histórico do Diquisti, como a do DITU: geração invalida respostas velhas; "carregar mais" junta partidas. */
export function useDixitHistory(): DixitHistoryState {
  const [data, setData] = useState<DixitHistoryResponse | null | undefined>(undefined);
  const [loadFailed, setLoadFailed] = useState<false | 'net' | 'too_many'>(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  /** Cada carga nova (ou a desmontagem) invalida as respostas que ainda estão a caminho. */
  const generation = useRef(0);

  const reload = useCallback(() => {
    const gen = ++generation.current;
    setLoadFailed(false);
    getHistory('dixit')
      .then((d) => {
        if (gen === generation.current) setData(d);
      })
      .catch((err: unknown) => {
        if (gen === generation.current) setLoadFailed(isTooMany(err) ? 'too_many' : 'net');
      });
  }, []);

  // `reload` é estável (useCallback sem deps): o efeito roda uma vez (duas no StrictMode, e a geração cuida disso).
  useEffect(() => {
    reload();
    return () => {
      generation.current++;
    };
  }, [reload]);

  async function loadMore() {
    if (!data || data.nextBefore === null) return;
    const gen = generation.current;
    const before = data.nextBefore;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const more = await getHistory('dixit', before);
      if (gen !== generation.current) return;
      if (!more) {
        setMoreError('Não achei mais partidas.');
        return;
      }
      setData((prev) => {
        if (!prev) return prev;
        const seen = new Set(prev.matches.map((m) => m.id));
        return {
          ...prev,
          matches: [...prev.matches, ...more.matches.filter((m) => !seen.has(m.id))],
          nextBefore: more.nextBefore,
          // páginas seguintes vêm sem estatísticas: mantém as da primeira
          stats: prev.stats ?? more.stats,
        };
      });
    } catch (err) {
      if (gen === generation.current) setMoreError(isTooMany(err) ? TOO_MANY_MESSAGE : 'Não deu pra carregar mais partidas. Tenta de novo.');
    } finally {
      if (gen === generation.current) setLoadingMore(false);
    }
  }

  return { data, loadFailed, loadingMore, moreError, reload, loadMore };
}
```

- [ ] **Passo 4: implementar a aba**

Crie `web/src/games/dixit/history/DixitHistory.tsx`:

```tsx
import { useMemo, useState, type WheelEvent } from 'react';
import { TOO_MANY_MESSAGE } from '../../../net/errors';
import { Brushes } from '../Brushes';
import { CardViewer } from '../CardViewer';
import { EmptyHistory } from './EmptyHistory';
import { FamousCards } from './FamousCards';
import { GaleraBoards } from './GaleraBoards';
import { FAMOUS, famousItems, matchGroupKey, matchItems, type CardItem } from './groups';
import { MatchList } from './MatchList';
import { useDixitHistory } from './useDixitHistory';
import '../dixit.css';
import './dixit-history.css';

/** Aba histórico do Diquisti: a galera, cartas famosas e partidas, no visual da mesa. */
export function DixitHistory() {
  const { data, loadFailed, loadingMore, moreError, reload, loadMore } = useDixitHistory();
  const [viewer, setViewer] = useState<{ group: string; index: number } | null>(null);
  const famous = useMemo(() => (data?.stats ? famousItems(data.stats) : null), [data]);
  /** Cartas de cada faixa e de cada partida: a carta ampliada navega dentro do grupo de onde abriu. */
  const groups = useMemo(() => {
    const map = new Map<string, CardItem[]>();
    if (famous) for (const { key } of FAMOUS) map.set(key, famous[key]);
    for (const m of data?.matches ?? []) map.set(matchGroupKey(m.id), matchItems(m));
    return map;
  }, [data, famous]);

  const open = (group: string, index: number) => {
    if (groups.get(group)?.[index]) setViewer({ group, index });
  };

  // Rodinha pra cima numa carta amplia (como na mesa); pra baixo, a própria carta ampliada fecha.
  function onWheel(e: WheelEvent<HTMLDivElement>) {
    if (viewer || e.deltaY >= 0) return;
    const el = (e.target as Element).closest<HTMLElement>('[data-card-id][data-group]');
    if (el?.dataset.group) open(el.dataset.group, Number(el.dataset.index));
  }

  if (data === undefined && loadFailed) {
    return (
      <div className="dxh">
        <section className="dxh-fail">
          <h2>{loadFailed === 'too_many' ? TOO_MANY_MESSAGE : 'não deu pra falar com o servidor'}</h2>
          <button className="dx-btn" type="button" onClick={reload}>
            tentar de novo
          </button>
        </section>
      </div>
    );
  }
  if (data === undefined) {
    return (
      <p className="hint" role="status">
        carregando…
      </p>
    );
  }
  if (data === null) {
    return (
      <section className="panel">
        <p>Esse jogo ainda não tem histórico.</p>
      </section>
    );
  }

  const items = viewer ? (groups.get(viewer.group) ?? []) : [];
  return (
    <div className="dxh" onWheel={onWheel}>
      <Brushes width={760} height={1600} />
      {data.matches.length === 0 ? (
        <EmptyHistory />
      ) : (
        <>
          {data.stats && <GaleraBoards stats={data.stats} />}
          {famous && <FamousCards items={famous} onOpen={open} />}
          <section>
            <h2>partidas</h2>
            <MatchList matches={data.matches} onOpen={open} />
            {data.nextBefore !== null && (
              <button className="dxh-more" type="button" onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? 'carregando…' : 'carregar mais'}
              </button>
            )}
            {moreError && (
              <p className="dxh-error" role="alert">
                {moreError}
              </p>
            )}
          </section>
        </>
      )}
      {viewer && items.length > 0 && (
        <CardViewer
          ids={items.map((it) => it.card)}
          index={viewer.index}
          label={(_id, i) => items[i]?.label ?? ''}
          onIndex={(index) => setViewer((cur) => (cur ? { ...cur, index } : cur))}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}
```

(O `CardArt` usa a arte real, `REAL_ART = true`: a carta ampliada é um `<img>` com o id da carta no `src`, e é isso que o teste das setas confere.)

- [ ] **Passo 5: rodar e ver passar**

Run: `npm test -w web -- dixit-history` e `npm run typecheck -w web`
Expected: PASS (todos os `dixit-history*`).

- [ ] **Passo 6: commit**

```bash
git add web/src/games/dixit/history/useDixitHistory.ts web/src/games/dixit/history/DixitHistory.tsx web/test/dixit-history.test.tsx
git commit -m "feat(web): aba histórico do Diquisti montada, com carta ampliada

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 15: ligar — o Diquisti grava e mostra o histórico

**Files:**
- Modify: `shared/src/games/registry.ts` (`recordsHistory: true` no `dixit`)
- Modify: `shared/src/history.ts` (`HistoryResponse.game: 'ito'`, comentários)
- Modify: `server/src/room-do.ts` (pendente por jogo, `insertPending`, `pendingHistoryRecord`)
- Modify: `server/src/index.ts` (rota despacha por jogo)
- Modify: `web/src/screens/GamePage.tsx` (só a aba histórico: `DixitHistory` no lugar do "vem em breve")
- Modify: `server/test/helpers.ts` (`playDixitRound`)
- Create: `server/test/dixit-history-route.test.ts`
- Modify (testes): `shared/test/registry-history.test.ts`, `shared/test/history.test.ts`, `shared/test/dixit-record.test.ts`, `server/test/pending-game.test.ts`, `server/test/history-route.test.ts`, `web/test/game-page.test.tsx`, `web/test/room-screen.test.tsx`

- [ ] **Passo 1: atualizar e escrever os testes (vão falhar)**

`shared/test/registry-history.test.ts`:
- troque `expect(GAMES.dixit.recordsHistory).toBe(false);` por `expect(GAMES.dixit.recordsHistory).toBe(true);`;
- renomeie `it('sala de Dixit não grava', …)` para `it('pendingRecord (o do DITU) não monta registro de sala de Diquisti', …)` (corpo igual).

`shared/test/history.test.ts`: renomeie `it('sala de Dixit, mesmo na revelação, não grava histórico', …)` para `it('pendingRecord (o do DITU) ignora sala de Diquisti, mesmo na revelação', …)` (corpo igual).

`shared/test/dixit-record.test.ts`: troque o teste `'sala de Diquisti segue o registro: enquanto não grava histórico, nada'` por:

```ts
  it('sala de Diquisti na revelação: pendente do Diquisti', () => {
    const pending = pendingHistoryRecord(roomOf(revealed(4, (s) => s.storyCard!).state), 1, 'r');
    expect(pending?.game).toBe('dixit');
    expect(pending?.key).toBe('ABCD-50-1|1');
    expect(pending?.record.id).toBe('r');
  });
```

`server/test/pending-game.test.ts`: substitua o conteúdo inteiro por:

```ts
import { env } from 'cloudflare:test';
import type { DixitRoundRecord, RoundRecord } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { insertPending } from '../src/room-do';

// Sala PNDG, played_at 70_001–70_002 (faixa própria deste arquivo).
const ito = (): RoundRecord => ({
  id: crypto.randomUUID(),
  roomCode: 'PNDG',
  playedAt: 70_001,
  mode: 'livre',
  level: 1,
  outcome: 'round_won',
  errors: 0,
  campaignId: null,
  theme: { titulo: 'Comidas', min: 'odeio', max: 'amo' },
  players: [{ name: 'Ana', color: '#8EC5FF' }],
  cards: [{ name: 'Ana', color: '#8EC5FF', value: 42, clue: 'pizza', error: false }],
});

const dixit = (): DixitRoundRecord => ({
  id: crypto.randomUUID(),
  matchId: 'PNDG-1-1',
  roomCode: 'PNDG',
  playedAt: 70_002,
  target: 30,
  round: 1,
  storyteller: { name: 'Ana', color: '#8EC5FF' },
  clue: 'luar',
  storyCard: 'd001',
  cards: [{ card: 'd001', owner: { name: 'Ana', color: '#8EC5FF' } }],
  votes: [],
  scores: [{ name: 'Ana', color: '#8EC5FF', gained: 0, score: 0 }],
});

const idsIn = async (table: 'rounds' | 'dixit_rounds') =>
  (await env.DB.prepare(`SELECT id FROM ${table} WHERE room_code = 'PNDG'`).all<{ id: string }>()).results.map((r) => r.id);

describe('insertPending', () => {
  it('pendente do Diquisti vai pra dixit_rounds; do ITO e o antigo (só groupId) vão pra rounds do ITO', async () => {
    const d = dixit();
    const i = ito();
    const old = ito();
    await insertPending(env.DB, { game: 'dixit', key: 'kd', record: d });
    await insertPending(env.DB, { game: 'ito', key: 'ki', record: i });
    await insertPending(env.DB, { groupId: 'g-antigo', key: 'ko', record: old });
    expect(await idsIn('dixit_rounds')).toEqual([d.id]);
    expect((await idsIn('rounds')).sort()).toEqual([i.id, old.id].sort());
    await env.DB.prepare("DELETE FROM dixit_rounds WHERE room_code = 'PNDG'").run();
    await env.DB.prepare("DELETE FROM rounds WHERE room_code = 'PNDG'").run();
  });
});
```

`server/test/history-route.test.ts`:
- apague o teste `it('sala de Dixit não enfileira rodada para o histórico', …)` inteiro;
- troque o teste `it('jogo sem histórico dá 404 no_history; jogo inexistente dá 404 not_found', …)` por:

```ts
  it('jogo inexistente dá 404 not_found', async () => {
    const xyz = await history('xyz');
    expect(xyz.status).toBe(404);
    expect(await xyz.json()).toEqual({ error: 'not_found' });
  });
```

`server/test/helpers.ts`: troque o import de tipos por `import { HEARTBEAT_PONG, type ClientMessage, type DixitRoomView, type ItoRoomView, type RoomView, type ServerMessage } from '@cartolina/shared';` e acrescente no fim:

```ts
/** Três jogadores (P0 host) jogam uma rodada de Diquisti até a revelação; cada um vota na 1ª carta que não é sua. */
export async function playDixitRound(
  code: string,
  clue = 'saudade',
): Promise<{ players: { client: TestClient; id: string; token: string }[]; tellerId: string }> {
  const players = await joined(code, 3);
  players[0]!.client.send({ t: 'action', action: { type: 'start' } });
  const views = await Promise.all(players.map((p) => p.client.state<DixitRoomView>((r) => r.game.phase === 'storytelling')));
  const tellerId = views[0]!.game.storyteller!;
  const ti = players.findIndex((p) => p.id === tellerId);
  players[ti]!.client.send({ t: 'action', action: { type: 'tell', cardId: views[ti]!.game.hand[0]!, clue } });
  const rest = players.filter((p) => p.id !== tellerId);
  for (const p of rest) {
    const v = await p.client.state<DixitRoomView>((r) => r.game.phase === 'submitting');
    p.client.send({ t: 'action', action: { type: 'submit', cardIds: v.game.hand.slice(0, 2) } });
    p.client.send({ t: 'action', action: { type: 'confirm' } });
  }
  for (const p of rest) {
    const v = await p.client.state<DixitRoomView>((r) => r.game.phase === 'voting');
    p.client.send({ t: 'action', action: { type: 'vote', cardId: v.game.table.find((t) => !t.mine)!.cardId } });
    p.client.send({ t: 'action', action: { type: 'confirm' } });
  }
  await players[ti]!.client.state<DixitRoomView>((r) => r.game.phase === 'reveal');
  return { players, tellerId };
}
```

Crie `server/test/dixit-history-route.test.ts`:

```ts
import { SELF, env, runInDurableObject } from 'cloudflare:test';
import { GAMES, type DixitHistoryResponse, type DixitRoomView } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { newGameRoom, playDixitRound } from './helpers';

const rowsOf = async (code: string) =>
  (await env.DB.prepare('SELECT id, match_id, clue FROM dixit_rounds WHERE room_code = ?').bind(code).all<{ id: string; match_id: string; clue: string }>())
    .results;

/** O DO grava no D1 depois de transmitir o estado: espera a rodada aparecer. */
async function waitForRows(code: string): Promise<Awaited<ReturnType<typeof rowsOf>>> {
  let rows = await rowsOf(code);
  for (let i = 0; i < 40 && rows.length === 0; i++) {
    await new Promise((r) => setTimeout(r, 50));
    rows = await rowsOf(code);
  }
  return rows;
}

async function pendingCount(code: string): Promise<number> {
  const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
  let size = 0;
  await runInDurableObject(stub, async (_instance, state) => {
    size = (await state.storage.list({ prefix: 'pendingRound:' })).size;
  });
  return size;
}

describe('histórico do Diquisti no servidor', () => {
  it('o registro diz que o Diquisti grava histórico', () => {
    expect(GAMES.dixit.recordsHistory).toBe(true);
  });

  it('rodada revelada grava uma vez só, esvazia a fila do DO e aparece em GET /history/dixit', async () => {
    const code = await newGameRoom('dixit');
    const { players, tellerId } = await playDixitRound(code, 'saudade');
    const rows = await waitForRows(code);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.clue).toBe('saudade');
    expect(rows[0]!.match_id).toMatch(new RegExp(`^${code}-\\d+-1$`));

    // alguém sai: novo commit, mas a mesma revelação
    const leaver = players.find((p) => p.id !== tellerId)!;
    const other = players.find((p) => p !== leaver)!;
    leaver.client.ws.close(1000, 'tchau');
    await other.client.state<DixitRoomView>((v) => v.seats.some((s) => !s.connected));
    await new Promise((r) => setTimeout(r, 200)); // dá tempo de uma gravação indevida aparecer
    expect(await rowsOf(code)).toHaveLength(1);
    for (let i = 0; i < 20 && (await pendingCount(code)) > 0; i++) await new Promise((r) => setTimeout(r, 50));
    expect(await pendingCount(code)).toBe(0);

    const res = await SELF.fetch('https://x/history/dixit');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-cache');
    const body = (await res.json()) as DixitHistoryResponse;
    expect(body.game).toBe('dixit');
    expect(body.stats).not.toBeNull();
    const match = body.matches.find((m) => m.roomCode === code)!;
    expect(match.finished).toBe(false);
    expect(match.rounds.map((r) => r.clue)).toEqual(['saudade']);
    expect(match.scores.map((s) => s.name).sort()).toEqual(['P0', 'P1', 'P2']);
  });

  it('páginas seguintes vêm sem estatísticas; before inválido dá 400', async () => {
    const page = (await (await SELF.fetch(`https://x/history/dixit?before=${Date.now() + 1}`)).json()) as DixitHistoryResponse;
    expect(page.game).toBe('dixit');
    expect(page.stats).toBeNull();
    const bad = await SELF.fetch('https://x/history/dixit?before=abc');
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: 'bad_before' });
  });
});
```

`web/test/game-page.test.tsx`: troque o teste `it('Diquisti (o Dixit): jogar cria sala de dixit; o histórico diz "em breve" e não chama o servidor', …)` por:

```tsx
  it('Diquisti (o Dixit): jogar cria sala de dixit; o histórico mostra o painel do Diquisti', async () => {
    vi.mocked(api.createRoom).mockResolvedValue('DXQ7');
    vi.mocked(api.getHistory).mockResolvedValue({ game: 'dixit', matches: [], stats: null, nextBefore: null });
    const { rerender } = render(<GamePage game="dixit" tab="jogar" />);
    expect(screen.getByRole('heading', { name: 'Diquisti' })).toBeTruthy();
    expect(screen.queryByText(/tá chegando/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'criar sala' }));
    await waitFor(() => expect(window.location.hash).toBe('#/sala/DXQ7'));
    expect(api.createRoom).toHaveBeenCalledWith('dixit');
    rerender(<GamePage game="dixit" tab="historico" />);
    expect(await screen.findByText('Ainda não tem partida de Diquisti. Bora jogar a primeira!')).toBeTruthy();
    expect(api.getHistory).toHaveBeenCalledWith('dixit');
    expect(screen.queryByText(/vem em breve/)).toBeNull();
  });
```

`web/test/room-screen.test.tsx`: troque o teste `it('sala de Diquisti que acabou: cria outra do Diquisti e não oferece histórico (não tem)', …)` por (o `RoomScreen` não muda; ele já segue `hasHistory`, que vem do registro):

```tsx
  it('sala de Diquisti que acabou: cria outra do Diquisti e mostra o histórico do Diquisti', async () => {
    mocked.mockResolvedValue({ ...info(), game: 'dixit' });
    vi.mocked(createRoom).mockResolvedValue('QRST');
    markJoined('ABCD', { name: 'Ana', color: '#8EC5FF' });
    renderRoom();
    await waitFor(() => expect(FakeSocket.all).toHaveLength(1));
    act(() => last().drop(4004));
    expect(await screen.findByText('essa sala acabou')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'ver o histórico' }).getAttribute('href')).toBe('#/dixit/historico');
    fireEvent.click(screen.getByRole('button', { name: 'criar sala nova' }));
    await waitFor(() => expect(createRoom).toHaveBeenCalledWith('dixit'));
  });
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `npm test`
Expected: FAIL — `registry-history` (`expected false to be true`), `dixit-record` (`expected undefined to be 'dixit'`), `pending-game` (`insertPending is not a function`), `dixit-history-route` (`expected false to be true`, sem linhas no D1), `game-page` (texto do Diquisti não aparece; ainda "vem em breve"), `room-screen` (link "ver o histórico" não existe).

- [ ] **Passo 3: implementar no shared**

Em `shared/src/games/registry.ts`, no `dixit: defineGame({ … })`, troque `recordsHistory: false,` por `recordsHistory: true,`.

Em `shared/src/history.ts`:
1. Na interface `HistoryResponse`, troque o comentário `/** Resposta de \`GET /history/:game\`. */` por `/** Resposta de \`GET /history/ito\` (o DITU). */` e `game: GameId;` por `game: 'ito';`.
2. Em `pendingRecord`, troque o comentário `// Só jogos que gravam histórico (hoje, o ITO).` por `// Só jogos que gravam histórico; aqui só o DITU monta registro (o Diquisti é \`pendingDixitRecord\`).`.

- [ ] **Passo 4: implementar no Durable Object**

Em `server/src/room-do.ts`:

1. No import de `@cartolina/shared`, remova `pendingRecord` e `type GameId`, e acrescente `pendingHistoryRecord` e `type DixitRoundRecord` (mantenha `type RoundRecord`).
2. Acrescente `import { insertDixitRound } from './dixit-history-db';` ao lado de `import { insertRound } from './history-db';`.
3. Troque o bloco que vai de `interface PendingRound {` até o fim da função `pendingGame` por:

```ts
/**
 * Rodada revelada ainda não confirmada no D1 (fila durável no storage do DO, uma chave por rodada).
 * Entra no mesmo `put` que marca `recordedRevealKey`, então nem queda do DO nem falha do D1 perdem a rodada.
 * Pendentes deixados por um servidor antigo (antes da estante) têm só `groupId` e eram do ITO.
 */
export type PendingRound =
  | { game: 'dixit'; key: string; record: DixitRoundRecord }
  | { game?: 'ito'; groupId?: string; key: string; record: RoundRecord };

/** Grava o pendente na tabela do jogo dele (o UNIQUE de cada tabela absorve repetições). */
export async function insertPending(db: D1Database, round: PendingRound): Promise<void> {
  if (round.game === 'dixit') await insertDixitRound(db, round.record, round.key);
  else await insertRound(db, 'ito', round.record, round.key);
}
```

4. Em `flushRound`, troque `await insertRound(this.env.DB, pendingGame(round), round.record, round.key);` por `await insertPending(this.env.DB, round);`.
5. Em `commit`, troque:

```ts
    const pending = pendingRecord(this.room, Date.now(), crypto.randomUUID());
    let queued: [string, PendingRound] | null = null;
    if (pending) {
      this.room = { ...this.room, recordedRevealKey: pending.key };
      queued = [PENDING_ROUND_PREFIX + pending.record.id, { game: this.room.gameId, key: pending.key, record: pending.record }];
```

por:

```ts
    const pending = pendingHistoryRecord(this.room, Date.now(), crypto.randomUUID());
    let queued: [string, PendingRound] | null = null;
    if (pending) {
      this.room = { ...this.room, recordedRevealKey: pending.key };
      queued = [PENDING_ROUND_PREFIX + pending.record.id, pending];
```

- [ ] **Passo 5: implementar na rota**

Em `server/src/index.ts`:
1. Acrescente `import { dixitHistoryPage } from './dixit-history-page';`.
2. Troque a função `getHistoryPage` inteira por:

```ts
/** Página do histórico do DITU (id `ito`): 20 rodadas; estatísticas só na primeira. */
async function getHistoryPage(env: Env, before: number | null): Promise<HistoryResponse> {
  // Uma a mais que a página só para saber se existe próxima.
  const fetched = await listRounds(env.DB, 'ito', before, HISTORY_PAGE_SIZE + 1);
  const rounds = fetched.slice(0, HISTORY_PAGE_SIZE);
  return {
    game: 'ito',
    rounds,
    // Estatísticas só na primeira página: leem até STATS_ROUNDS_CAP rodadas, caro demais para repetir a cada "ver mais".
    stats: before === null ? summarizeHistory(await allRounds(env.DB, 'ito')) : null,
    nextBefore: fetched.length > HISTORY_PAGE_SIZE ? rounds[rounds.length - 1]!.playedAt : null,
  };
}
```

3. Na rota do histórico, troque `return json(await getHistoryPage(env, game, before), 200, { 'Cache-Control': 'no-cache' });` por:

```ts
    const page = game === 'dixit' ? await dixitHistoryPage(env.DB, before) : await getHistoryPage(env, before);
    return json(page, 200, { 'Cache-Control': 'no-cache' });
```

(O `if (!GAMES[game].recordsHistory) return json({ error: 'no_history' }, 404);` fica: hoje todo jogo grava, mas vale para um jogo novo.)

- [ ] **Passo 6: implementar na página do jogo (só a aba histórico)**

Em `web/src/screens/GamePage.tsx`:
1. Acrescente `import { DixitHistory } from '../games/dixit/history/DixitHistory';` junto dos imports.
2. Troque o bloco do "vem em breve":

```tsx
      ) : (
        <section className="panel">
          <p>O histórico do {entry.name} vem em breve.</p>
        </section>
      )}
```

por:

```tsx
      ) : (
        <DixitHistory />
      )}
```

(Depois da Tarefa 7 a aba já escolhe `game === 'ito' ? <HistoryPanel game={game} /> : …`; o outro jogo é o Diquisti.)

- [ ] **Passo 7: rodar e ver passar**

Run: `npm test` e `npm run typecheck`
Expected: PASS em todos os pacotes.

- [ ] **Passo 8: commit**

```bash
git add shared/src/games/registry.ts shared/src/history.ts server/src/room-do.ts server/src/index.ts web/src/screens/GamePage.tsx server/test/helpers.ts server/test/dixit-history-route.test.ts shared/test/registry-history.test.ts shared/test/history.test.ts shared/test/dixit-record.test.ts server/test/pending-game.test.ts server/test/history-route.test.ts web/test/game-page.test.tsx web/test/room-screen.test.tsx
git commit -m "feat: o Diquisti grava cada rodada revelada e mostra o histórico

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 16: links pro histórico no lobby e na mesa do Diquisti

**Files:**
- Modify: `web/src/games/dixit/DixitLobby.tsx`
- Modify: `web/src/games/dixit/DixitTopBar.tsx`
- Modify: `web/src/games/dixit/dixit.css` (estilo dos links)
- Test: `web/test/dixit-lobby.test.tsx`, `web/test/dixit-table.test.tsx`

- [ ] **Passo 1: escrever os testes que falham**

Em `web/test/dixit-lobby.test.tsx`, dentro de `describe('lobby do Diquisti', …)`:

```tsx
  it('leva pro histórico do Diquisti numa aba nova', () => {
    render(<DixitLobby view={dixitView(dixitRoom(3), 'p0')} conn={conn()} />);
    const link = screen.getByRole('link', { name: /histórico do Diquisti/ });
    expect(link.getAttribute('href')).toBe('#/dixit/historico');
    expect(link.getAttribute('target')).toBe('_blank');
  });
```

No fim de `web/test/dixit-table.test.tsx`:

```tsx
describe('mesa do Diquisti: topo', () => {
  it('embaixo do logo tem o link pro histórico do Diquisti, numa aba nova', () => {
    render(<DixitTable view={dixitView(started(4), 'p0')} conn={conn()} />);
    const link = screen.getByRole('link', { name: /histórico/ });
    expect(link.getAttribute('href')).toBe('#/dixit/historico');
    expect(link.getAttribute('target')).toBe('_blank');
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `npm test -w web -- dixit-lobby dixit-table`
Expected: FAIL — `Unable to find an accessible element with the role "link" and name /histórico do Diquisti/` (e `/histórico/` na mesa).

- [ ] **Passo 3: implementar**

Em `web/src/games/dixit/DixitLobby.tsx`:
1. Troque `import { goHome, roomLink } from '../../lib/router';` por `import { gameHash, goHome, roomLink } from '../../lib/router';`.
2. Na primeira `dx-sheet` ("na mesa"), logo antes de `<SoundPill />`:

```tsx
          <a className="dx-btn ghost" href={gameHash('dixit', 'historico')} target="_blank" rel="noopener">
            📜 histórico do Diquisti
          </a>
```

Em `web/src/games/dixit/DixitTopBar.tsx`:
1. Acrescente `import { gameHash } from '../../lib/router';`.
2. Logo depois do `</h1>` do logo:

```tsx
      {/* Embaixo do logo, e não nas pílulas: ali ele apertaria a dica do narrador. */}
      <a className="dx-histlink" href={gameHash('dixit', 'historico')} target="_blank" rel="noopener" title="histórico do Diquisti">
        📜 histórico
      </a>
```

No fim de `web/src/games/dixit/dixit.css`:

```css
/* links pro histórico: no lobby (botão fantasma) e embaixo do logo da mesa */
a.dx-btn { box-sizing: border-box; text-align: center; text-decoration: none; }
.dx-histlink { position: absolute; left: 30px; top: 84px; z-index: 8; font: 400 13px/1 var(--ui); color: var(--mu); text-decoration: none; }
.dx-histlink:hover, .dx-histlink:focus-visible { color: var(--must); }
```

- [ ] **Passo 4: rodar e ver passar**

Run: `npm test -w web` e `npm run typecheck -w web`
Expected: PASS.

- [ ] **Passo 5: commit**

```bash
git add web/src/games/dixit/DixitLobby.tsx web/src/games/dixit/DixitTopBar.tsx web/src/games/dixit/dixit.css web/test/dixit-lobby.test.tsx web/test/dixit-table.test.tsx
git commit -m "feat(web): lobby e mesa do Diquisti levam pro histórico

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 17: E2E — uma rodada de Diquisti aparece no histórico

**Files:**
- Create: `e2e/dixit-historico.spec.ts`

O build de produção do E2E não tem bots, e a mesa do Diquisti já tem testes de componente. Aqui a rodada é jogada por **ações diretas**: três WebSockets abertos de dentro da página (origem `http://127.0.0.1:4173`, aceita pelo servidor), e o histórico é conferido na tela de verdade.

- [ ] **Passo 1: escrever o teste**

Crie `e2e/dixit-historico.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';
import { closePlayers, newPlayer } from './helpers';

test.afterEach(closePlayers);

const SERVER = 'http://127.0.0.1:8787';

/** Três pessoas jogam uma rodada de Diquisti por WebSocket, de dentro da página; devolve o código da sala. */
async function playDixitRoundDirect(page: Page, clue: string): Promise<string> {
  return page.evaluate(
    async ({ server, clue }) => {
      interface View {
        seats: unknown[];
        game: { phase: string; storyteller: string | null; hand: string[]; table: { cardId: string; mine: boolean }[] };
      }
      interface Client {
        ws: WebSocket;
        id: string;
        view: View | null;
      }
      const res = await fetch(`${server}/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game: 'dixit' }),
      });
      const { code } = (await res.json()) as { code: string };
      const connect = (name: string, color: string) =>
        new Promise<Client>((resolve, reject) => {
          const client: Client = { ws: new WebSocket(`${server.replace(/^http/, 'ws')}/rooms/${code}/ws`), id: '', view: null };
          client.ws.onmessage = (e) => {
            const msg = JSON.parse(String(e.data)) as { t: string; playerId?: string; room?: View };
            if (msg.t === 'welcome' && msg.playerId) {
              client.id = msg.playerId;
              resolve(client);
            }
            if (msg.t === 'state' && msg.room) client.view = msg.room;
          };
          client.ws.onerror = () => reject(new Error('websocket falhou'));
          client.ws.onopen = () => client.ws.send(JSON.stringify({ t: 'join', token: crypto.randomUUID(), name, color }));
        });
      const until = async (ok: () => boolean) => {
        for (let i = 0; i < 200; i++) {
          if (ok()) return;
          await new Promise((r) => setTimeout(r, 50));
        }
        throw new Error('a rodada não andou');
      };
      const send = (c: Client, action: Record<string, unknown>) => c.ws.send(JSON.stringify({ t: 'action', action }));
      const phase = (c: Client) => c.view?.game.phase;

      // Em sequência: quem entra primeiro é o host.
      const all = [await connect('Ana', '#8EC5FF'), await connect('Bia', '#FF8FAB'), await connect('Caio', '#7EDDB5')];
      const host = all[0]!;
      await until(() => all.every((c) => c.view?.seats.length === 3));
      send(host, { type: 'start' });
      await until(() => all.every((c) => phase(c) === 'storytelling'));
      const teller = all.find((c) => c.id === host.view!.game.storyteller)!;
      send(teller, { type: 'tell', cardId: teller.view!.game.hand[0], clue });
      const rest = all.filter((c) => c !== teller);
      await until(() => rest.every((c) => phase(c) === 'submitting'));
      // 3 pessoas: cada uma joga 2 cartas
      for (const c of rest) {
        send(c, { type: 'submit', cardIds: c.view!.game.hand.slice(0, 2) });
        send(c, { type: 'confirm' });
      }
      await until(() => rest.every((c) => phase(c) === 'voting'));
      for (const c of rest) {
        send(c, { type: 'vote', cardId: c.view!.game.table.find((t) => !t.mine)!.cardId });
        send(c, { type: 'confirm' });
      }
      await until(() => all.every((c) => phase(c) === 'reveal'));
      for (const c of all) c.ws.close();
      return code;
    },
    { server: SERVER, clue },
  );
}

test('rodada de Diquisti aparece no histórico do Diquisti', async ({ browser }) => {
  const page = await newPlayer(browser);
  await page.goto('/');
  const clue = `farol ${Date.now()}`;
  await playDixitRoundDirect(page, clue);

  await page.goto('/#/dixit/historico');
  // A gravação no D1 acontece logo depois da revelação: recarrega até aparecer. A partida mais recente é a primeira
  // (o histórico do Diquisti é um só e acumula as partidas de outras execuções).
  await expect(async () => {
    await page.reload();
    await page.locator('.dxh-match-head').first().click();
    await expect(page.locator('.dxh-match-body').getByText(clue)).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'a galera' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'mural de dicas' }).getByText(clue)).toBeVisible();
});
```

- [ ] **Passo 2: conferir os tipos**

Run: `npm run typecheck`
Expected: PASS (o `tsc -p e2e` compila o arquivo novo com `lib: DOM`).

- [ ] **Passo 3: rodar o E2E**

Run: `npm run e2e -- dixit-historico`
Expected: PASS (`1 passed`). Precisa dos navegadores do Playwright (`npx playwright install chromium` se faltar) e das portas 8787 e 4173 livres. Se falhar com `a rodada não andou`, rode `npm run dev:server` sozinho e confira no log se a migração `0003` foi aplicada.

- [ ] **Passo 4: commit**

```bash
git add e2e/dixit-historico.spec.ts
git commit -m "test(e2e): rodada de Diquisti aparece no histórico

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 18: verificação final e spec

**Files:**
- Modify: `docs/superpowers/specs/2026-10-17-diquisti-historico-design.md`

- [ ] **Passo 1: rodar tudo**

Run, um de cada vez:
- `npm test` → Expected: PASS nos três pacotes.
- `npm run typecheck` → Expected: sem erros (inclui `tsc -p e2e`).
- `npm run build -w web` → Expected: build sem erros (o `tsc --noEmit && vite build` do CI).
- `npm run e2e` → Expected: todos passam (os do DITU continuam iguais).

- [ ] **Passo 2: olhar na tela**

Suba `npm run dev:server` e `npm run dev:web` (em segundo plano), abra `http://localhost:5173/#/dixit`, crie uma sala, adicione 2 bots no lobby (só em dev) e jogue duas rodadas. Confira:
- no lobby, o botão "📜 histórico do Diquisti" abre `#/dixit/historico` em outra aba;
- na mesa, o "📜 histórico" embaixo do logo não encosta em nenhum assento nem na dica (com 3 e com 10 jogadores; se encostar, ajuste só o `top` do `.dx-histlink` em `dixit.css`);
- a aba histórico: quadros, faixas (rolam pro lado), partidas, abrir uma partida, clicar e rodinha pra cima numa carta, Esc fecha;
- com a janela estreita (≤ 720 px), quadros em 2 colunas e faixas rolando pro lado.

- [ ] **Passo 3: registrar as decisões na spec**

Em `docs/superpowers/specs/2026-10-17-diquisti-historico-design.md`:

1. Troque a linha

```markdown
  - `round: number`: zera em cada partida nova e soma 1 a cada narração começada.
```

por

```markdown
  - `round: number`: zera em cada partida nova e soma 1 a cada narração começada (narração refeita ou pulada
    também conta, então pode pular números; a tela numera as rodadas pela ordem dentro da partida).
  - Estado gravado antes desta versão (sala em andamento na publicação) ganha `match: 1, round: 0` ao ser lido.
```

2. Troque a linha

```markdown
- Em `#/dixit/historico`, no lugar do "vem em breve". As entradas que a estante já tem (lobby, mesa, sala que
  acabou) levam para lá.
```

por

```markdown
- Em `#/dixit/historico`, no lugar do "vem em breve". A "sala que acabou" já levava para lá; o lobby
  ("📜 histórico do Diquisti") e a mesa ("📜 histórico", embaixo do logo) ganharam o link, que abre em outra aba.
```

3. No fim do arquivo:

```markdown
## 9. Notas da implementação (2026-10-17)

- Plano: `docs/superpowers/plans/2026-10-17-diquisti-historico.md`.
- O README ainda descreve só o histórico do DITU; atualizar quando a versão de celular (que mexe no README)
  estiver na `main`.
```

- [ ] **Passo 4: commit**

```bash
git add docs/superpowers/specs/2026-10-17-diquisti-historico-design.md
git commit -m "docs: notas da implementação do histórico do Diquisti na spec

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Cobertura da spec

| Seção da spec | Tarefa(s) |
| --- | --- |
| §1 partidas, estatísticas e cartas famosas; rodadas gravadas por baixo | 3, 10, 11, 12, 14 |
| §1 partida que não chegou à meta = "não terminou", rodadas contam nas estatísticas | 3 (`finished`, estatísticas usam todas as rodadas), 12 |
| §1 abrir partida = placar final e uma linha por rodada | 12 |
| §1 tabela própria do Diquisti (abordagem A) | 4, 5 |
| §1 / §5 visual conto ilustrado | 9 (CSS), 14 (`Brushes`, tokens) |
| §2 gravar uma vez por revelação (pendente + `recordedRevealKey` + `ON CONFLICT`) | 2, 5, 15 |
| §2 `match` e `round`; id da partida; chave da revelação | 1, 2 |
| §2 campos do `DixitRoundRecord`, nomes e personagens da hora | 2 |
| §2 migração `0003` só cria; `rounds` intacta | 4 |
| §2 `recordsHistory: true`; servidor escolhe tabela pelo jogo | 15 |
| §2 sem login, sem apagar; conta a partir da publicação | 15 (nada de rota de apagar; nada de migração de dados) |
| §3 funções puras `summarizeDixitHistory`, `dixitMatches`; pessoa pelo nome; cor mais recente | 3 |
| §3 terminada × não terminada, vencedor, empate | 3 |
| §3 quem mais venceu / acha / engana / melhor narrador, mínimos, top 3 | 3, 10 |
| §3 cartas famosas (favoritas, enganaram, mural, impossíveis) | 3, 9, 11 |
| §3 números como constantes nomeadas | 3 (`DIXIT_*`) |
| §4 `GET /history/dixit`, formato, 20 por página, `before` exclusivo, stats só na 1ª, teto | 5, 6, 15 |
| §4 união por jogo; mesmos cabeçalhos e erros | 3 (`HistoryResponses`), 7, 15 |
| §5 aba no lugar do "vem em breve"; entradas levam para lá | 15, 16 |
| §5 ordem: galera, cartas famosas, partidas; "carregar mais" | 14 |
| §5 cartas reais com reserva SVG; clique e rodinha pra cima abrem `CardViewer` | 9 (`CardArt`), 14 |
| §5 celular: quadros em 2 colunas, faixas rolam pro lado | 9 (CSS), 18 (conferir) |
| §5 sem dados: texto + criar sala | 13, 14 |
| §5 erros de carga como no DITU (tentar de novo, 429 "Calma!") | 14 |
| §6 falha no D1: pendente fica no DO e é regravado | 15 (mesmo `flushRound`/alarme; `insertPending`) |
| §6 jogador que saiu no meio | 2 |
| §6 rodada forçada sem votos: grava, não conta como "alguns acharam" nem impossível | 2, 3 |
| §6 dica sempre como texto | 11 (teste com HTML), 14 |
| §6 carta de id desconhecido cai na pintura SVG | 9 (usa `CardArt`, que já faz isso) |
| §7 testes shared / server / web / E2E | 1–3 / 4–6, 15 / 7–14, 16 / 17 |
| §8 fora desta versão | nada planejado |
