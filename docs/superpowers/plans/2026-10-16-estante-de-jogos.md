# Estante de jogos e histórico por jogo — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a página inicial vira uma estante de jogos. Cada jogo tem uma página com as abas "jogar" e "histórico". Os grupos deixam de existir, e o histórico passa a ser um por jogo, aberto a todos.

**Architecture:**
- **Banco:** uma migração do D1 refaz `rounds` com a coluna `game`, guarda as rodadas existentes como `ito` e apaga `groups`.
- **`shared/`:** a sala perde o grupo, e o registro de jogos (`GAMES`, do D1 do Dixit) diz quem grava histórico.
- **Servidor:** troca as rotas `/groups*` por `GET /history/:game`.
- **Site:** ganha a estante, a página do jogo (com o histórico extraído da antiga página de grupo) e links "histórico" no lobby, na mesa e na tela de sala que acabou.

**Tech Stack:** Cloudflare Workers + Durable Objects + D1 (wrangler 4), Vitest 4 + `@cloudflare/vitest-plugin`, React 19 + Vite 8, Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-16-estante-de-jogos-design.md`.

---

## Pré-requisito (antes da Task 1)

Este plano parte do **D1 do Dixit já mergeado no `main`**: `shared/src/games/registry.ts` com `GAMES`, `GameId` e `isGameId`, além de `Room.gameId`, `POST /rooms { game }` e `restoreRoom`.

- [ ] Confirme que o D1 está no `main`:
  - Run: `git fetch origin; git log --oneline origin/main -5`
  - Expected: commits do Dixit (ex.: "sala genérica com registro de jogos") presentes.
  - Se não estiverem, **pare** e avise o controlador.
- [ ] Traga a branch para cima do `main`:
  - Run: `git checkout feat/estante-jogos; git rebase origin/main`
  - Expected: rebase limpo. A branch só tem commits de docs.
- [ ] Rode tudo e anote as contagens (vão servir de base):
  - Run: `npm test; npm run typecheck`
  - Expected: tudo verde.

## Convenções do repositório

- **Monorepo** com npm workspaces: `shared/`, `server/`, `web/`, mais `e2e/` (Playwright). Rode da raiz.
  - Um arquivo: `npm run test -w web -- test/x.test.ts`.
  - Tudo: `npm test`, `npm run typecheck`, `npm run build`, `npm run e2e`.
- **Shell:** Windows + PowerShell 5.1. Sem `&&`: use `;` ou um comando por vez. Use `npx.cmd`, porque o `npx.ps1` é bloqueado no terminal do usuário (no da ferramenta funciona).
- **TypeScript:** estrito, com `noUncheckedIndexedAccess` e `verbatimModuleSyntax` (`import type`).
- **Textos:** interface em PT-BR informal; comentários de código em PT-BR, curtos.
- **Commits:** terminam com uma linha em branco e `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **E2E:** o servidor local aplica limite de 10 salas por minuto por IP. Espere ao menos 1 minuto entre execuções de `npm run e2e`.

## Mapa de arquivos

| Arquivo | Muda |
|---|---|
| `shared/src/games/registry.ts` | `GameEntry.recordsHistory` (ITO `true`, Dixit `false`) |
| `shared/src/room.ts` | sai `RoomGroup`, `Room.group`, `RoomView.group` e o parâmetro `group` de `createRoom` |
| `shared/src/history.ts` | saem `GROUP_NAME_MAX`, `cleanGroupName`, `GroupInfo` e `GroupResponse`; entra `HistoryResponse`; `pendingRecord` usa o registro |
| `server/migrations/0002_rounds_by_game.sql` (novo) | refaz `rounds` por jogo e apaga `groups` |
| `server/src/history-db.ts` | sem grupos; filtra por `game` |
| `server/src/index.ts` | `GET /history/:game`; saem `/groups*` e `GROUP_LIMITER` |
| `server/src/room-do.ts` | `/init` sem grupo; pendente com `game` (aceita o formato antigo com `groupId`) |
| `server/src/codes.ts` | saem `SLUG_*` e `randomSlug` |
| `server/wrangler.jsonc` (+ `worker-configuration.d.ts`) | sai `GROUP_LIMITER` |
| `server/vitest.config.ts`, `server/test/env.d.ts` | binding `MIGRATION_DB` para testar a migração |
| `web/src/games/catalog.ts` (novo) | nome, frase, regras e se já dá pra jogar, por jogo |
| `web/src/net/api.ts` | `createRoom(game)` e `getHistory(game, before)`; saem as funções de grupo |
| `web/src/net/identity.ts` | saem `loadGroups`, `rememberGroup` e `RememberedGroup` |
| `web/src/lib/router.ts` | rotas `game`, redirecionamento de `#/g/` e `historyHash(game)`; saem as de grupo |
| `web/src/screens/history/` (novo) | `HistoryPanel.tsx`, `RoundItem.tsx` e `history.css` (vindos da `GroupPage`) |
| `web/src/screens/GamePage.tsx` + `shelf.css` (novos) | página do jogo com abas |
| `web/src/screens/Home.tsx` | estante + "entrar com código" |
| `web/src/App.tsx` | liga as rotas novas |
| `web/src/screens/Lobby.tsx`, `web/src/table/TopBar.tsx`, `web/src/screens/RoomScreen.tsx`, `web/src/screens/PhoneNotice.tsx` | links "histórico", sala nova do mesmo jogo, texto do aviso |
| `web/src/screens/GroupPage.tsx`, `web/src/screens/group.css` | apagados |
| `e2e/rodada.spec.ts` | o fluxo passa pela página do ITO; o histórico substitui o grupo |
| `README.md`, `docs/deploy.md`, `docs/superpowers/specs/2026-10-15-cartolina-ito-design.md` | sem grupos |

---

### Task 1: `shared` — sala sem grupo e registro diz quem grava histórico

**Files:**
- Modify: `shared/src/games/registry.ts`, `shared/src/room.ts`, `shared/src/history.ts`
- Modify (testes): `shared/test/history.test.ts`, `shared/test/room.test.ts`, `shared/test/room-games.test.ts` e qualquer outro em `shared/test/` que use `group`
- Create: `shared/test/registry-history.test.ts`

- [ ] **Step 1: Testes que falham**

Crie `shared/test/registry-history.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { GAMES, createRoom, pendingRecord } from '../src';
import { act, makeRoom } from './fixtures';

describe('histórico por jogo', () => {
  it('o registro diz quem grava histórico', () => {
    expect(GAMES.ito.recordsHistory).toBe(true);
    expect(GAMES.dixit.recordsHistory).toBe(false);
  });

  it('sala de ITO sem grupo grava a revelação', () => {
    let room = makeRoom(2);
    room = act(room, 'p0', { type: 'start' });
    room = act(room, 'p0', { type: 'beginRound' });
    room = act(room, 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
    room = act(room, 'p1', { type: 'place', cardId: 'p1:0', index: 1 });
    room = act(room, 'p0', { type: 'forceReveal' });
    const pending = pendingRecord(room, 1000, 'r1');
    expect(pending?.record.id).toBe('r1');
    expect(pending?.record.cards).toHaveLength(2);
  });

  it('sala de Dixit não grava', () => {
    const room = createRoom('ABCD', 0, 'dixit');
    expect(pendingRecord(room, 1000, 'r1')).toBeNull();
  });

  it('a sala não tem mais grupo', () => {
    const room = createRoom('ABCD', 0);
    expect('group' in room).toBe(false);
  });
});
```

> `makeRoom` e `act` vêm de `shared/test/fixtures.ts`. Se os nomes ou assinaturas lá forem diferentes, adapte só o teste (ex.: o `act` pode pedir `now`/`rng`). O formato da ação `place` segue o ITO atual.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test -w shared -- test/registry-history.test.ts`
Expected: FAIL (`recordsHistory` não existe; `createRoom('ABCD', 0, 'dixit')` cai no parâmetro `group`; a sala sem grupo não grava).

- [ ] **Step 3: Registro**

Em `shared/src/games/registry.ts`, acrescente o campo em `GameEntry` e no parâmetro de `defineGame`:

```ts
  /** Rodadas reveladas vão para o histórico do jogo (`GET /history/:game`). */
  recordsHistory: boolean;
```

Em `GAMES`, ponha `recordsHistory: true` no `ito` e `recordsHistory: false` no `dixit`.

- [ ] **Step 4: Sala sem grupo** (`shared/src/room.ts`)

1. Apague `export interface RoomGroup { ... }`.
2. Em `Room`, apague o campo `group: RoomGroup | null;` e o comentário dele.
3. Em `RoomView`, apague `group: { slug: string; name: string } | null;`.
4. O `StoredRoom` passa a aceitar o campo antigo e o `restoreRoom` passa a ignorá-lo:

```ts
type StoredRoom = Omit<Room, 'gameId' | 'runStartedAt' | 'recordedRevealKey'> &
  Partial<Pick<Room, 'gameId' | 'runStartedAt' | 'recordedRevealKey'>> & {
    /** Salas gravadas antes da estante de jogos tinham grupo; o campo é ignorado. */
    group?: unknown;
  };

/** Sala lida do storage: salas antigas não têm `gameId` (eram todas ITO) e podem ter `group` (ignorado). */
export function restoreRoom(stored: StoredRoom): Room {
  const { group: _legacyGroup, ...rest } = stored;
  return {
    ...rest,
    gameId: stored.gameId ?? 'ito',
    runStartedAt: stored.runStartedAt ?? null,
    recordedRevealKey: stored.recordedRevealKey ?? null,
  };
}
```

(Mantenha qualquer outro campo que o `restoreRoom` atual já normaliza.) Se o lint do projeto reclamar de `_legacyGroup` sem uso, use `void _legacyGroup;`.

5. `createRoom` perde o parâmetro de grupo: `export function createRoom(code: string, now: number, gameId: GameId = 'ito'): Room`. Apague `group,` do objeto criado.
6. Em `roomView`, apague a linha `group: room.group ? ... : null,`.

- [ ] **Step 5: Histórico** (`shared/src/history.ts`)

1. Apague `GROUP_NAME_MAX`, `cleanGroupName` e `GroupInfo`.
2. Troque `GroupResponse` por:

```ts
/** Resposta de `GET /history/:game`. */
export interface HistoryResponse {
  game: GameId;
  rounds: RoundRecord[];
  /** Só na primeira página (sem `before`); nas seguintes vem `null`. */
  stats: HistoryStats | null;
  nextBefore: number | null;
}
```

(import no topo de `history.ts`: `import { GAMES, type GameId } from './games/registry';`. O `room.ts` já importa o registro do mesmo jeito, e o registro não importa `history.ts`, então não há ciclo novo.)

3. Em `pendingRecord`, troque `if (!room.group) return null;` e o comentário seguinte por:

```ts
  // Só jogos que gravam histórico (hoje, o ITO).
  if (!GAMES[room.gameId].recordsHistory) return null;
```

Mantenha o `const game = itoStateOf(room); if (!game) return null;` logo abaixo: o registro do ITO é o único formato gravável por enquanto.

4. Comentário de `RoundRecord`: "como fica gravada no histórico do jogo".

- [ ] **Step 6: Ajustar os testes existentes**

Rode: `npm run test -w shared`. Corrija cada falha que vier da remoção do grupo:
- chamadas `createRoom(code, now, group, game)` viram `createRoom(code, now, game)`;
- `createRoom(code, now, someGroup)` vira `createRoom(code, now)`;
- testes de `cleanGroupName`/`GROUP_NAME_MAX` são apagados;
- testes que montavam sala "de grupo" para `pendingRecord` deixam de montar o grupo, porque toda sala de ITO grava;
- testes que checavam "sem grupo não grava" passam a checar que uma sala de Dixit não grava, se já não estiver coberto pelo teste novo;
- testes de `restoreRoom` ganham um caso: uma sala gravada com `group: { id: 'g', slug: 'abcdefghjk', name: 'X' }` volta sem `group` (`expect('group' in restored).toBe(false)`).

Use `git grep -n -i "group" -- shared` para achar tudo.
Expected: nenhuma ocorrência de `group` em `shared/src` (exceto o `group?: unknown` do `StoredRoom` e o comentário dele).

- [ ] **Step 7: Rodar e ver passar**

Run: `npm run test -w shared; npm run typecheck -w shared`
Expected: PASS. O `server` e o `web` vão quebrar no typecheck até as próximas tasks; isso é esperado.

- [ ] **Step 8: Commit**

```bash
git add shared
git commit -m "feat(shared): sala sem grupo; registro diz quais jogos gravam histórico"
```

---

### Task 2: migração `0002` — rodadas por jogo, sem grupos

**Files:**
- Create: `server/migrations/0002_rounds_by_game.sql`
- Create: `server/test/migration-0002.test.ts`
- Modify: `server/vitest.config.ts`, `server/test/env.d.ts`

- [ ] **Step 1: Binding de teste para a migração**

Em `server/vitest.config.ts`, dentro de `miniflare`, acrescente um D1 só para este teste:

```ts
      miniflare: {
        bindings: { TEST_MIGRATIONS: await readD1Migrations('./migrations') },
        // Banco vazio para testar a migração 0002 sobre dados no formato antigo.
        d1Databases: ['MIGRATION_DB'],
      },
```

Em `server/test/env.d.ts`, dentro de `interface Env`:

```ts
    MIGRATION_DB: D1Database;
```

- [ ] **Step 2: Teste que falha**

Crie `server/test/migration-0002.test.ts`:

```ts
import { applyD1Migrations, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

const OLD_ROUND = (id: string, group: string, playedAt: number) => [
  id, group, 'W8YZ', `key-${id}`, playedAt, 'livre', 1, 'round_won', 0, null,
  JSON.stringify({ titulo: 'Tarefas que um robô faria', min: 'humano', max: 'robô' }),
  JSON.stringify([{ name: 'Claude', color: '#8EC5FF' }]),
  JSON.stringify([{ name: 'Claude', color: '#8EC5FF', value: 1, clue: 'dar um abraço', error: false }]),
];

describe('migração 0002: rodadas por jogo', () => {
  it('guarda todas as rodadas antigas como ito e apaga os grupos', async () => {
    const db = env.MIGRATION_DB;
    const [m1, m2] = env.TEST_MIGRATIONS;
    expect(m1?.name).toMatch(/^0001/);
    expect(m2?.name).toMatch(/^0002/);
    await applyD1Migrations(db, [m1!]);
    await db.batch([
      db.prepare('INSERT INTO groups (id, slug, name, created_at) VALUES (?, ?, ?, ?)').bind('g1', 'abcdefghjk', 'Galera', 1),
      db.prepare('INSERT INTO groups (id, slug, name, created_at) VALUES (?, ?, ?, ?)').bind('g2', 'bcdefghjkm', 'Outra', 2),
      ...[OLD_ROUND('r1', 'g1', 100), OLD_ROUND('r2', 'g1', 200), OLD_ROUND('r3', 'g2', 300)].map((v) =>
        db
          .prepare(
            `INSERT INTO rounds (id, group_id, room_code, reveal_key, played_at, mode, level, outcome, errors, campaign_id,
             theme_json, players_json, cards_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(...v),
      ),
    ]);

    await applyD1Migrations(db, [m2!]);

    const rows = await db.prepare('SELECT id, game, played_at, cards_json FROM rounds ORDER BY played_at').all<{
      id: string; game: string; played_at: number; cards_json: string;
    }>();
    expect(rows.results.map((r) => [r.id, r.game, r.played_at])).toEqual([
      ['r1', 'ito', 100],
      ['r2', 'ito', 200],
      ['r3', 'ito', 300],
    ]);
    expect(JSON.parse(rows.results[0]!.cards_json)[0].clue).toBe('dar um abraço');
    const groups = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'groups'").all();
    expect(groups.results).toHaveLength(0);
    const cols = await db.prepare("SELECT name FROM pragma_table_info('rounds')").all<{ name: string }>();
    expect(cols.results.map((c) => c.name)).not.toContain('group_id');
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm run test -w server -- test/migration-0002.test.ts`
Expected: FAIL (`m2` indefinido, porque a migração 0002 ainda não existe).

- [ ] **Step 4: A migração**

Crie `server/migrations/0002_rounds_by_game.sql`:

```sql
-- Estante de jogos: grupos deixam de existir; o histórico passa a ser um por jogo.
-- Todas as rodadas existentes eram do ITO e continuam no histórico do ITO.
CREATE TABLE rounds_v2 (
  id TEXT PRIMARY KEY,
  game TEXT NOT NULL,
  room_code TEXT NOT NULL,
  -- chave da revelação (anti-duplicata): a mesma revelação gravada de novo vira no-op.
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
  (id, game, room_code, reveal_key, played_at, mode, level, outcome, errors, campaign_id, theme_json, players_json, cards_json)
  SELECT id, 'ito', room_code, reveal_key, played_at, mode, level, outcome, errors, campaign_id, theme_json, players_json, cards_json
  FROM rounds;

DROP TABLE rounds;
DROP TABLE groups;
ALTER TABLE rounds_v2 RENAME TO rounds;
CREATE INDEX rounds_game_played ON rounds (game, played_at DESC);
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm run test -w server -- test/migration-0002.test.ts`
Expected: PASS. Os outros testes do servidor podem falhar agora, porque ainda usam grupos (Task 3).

- [ ] **Step 6: Commit**

```bash
git add server/migrations/0002_rounds_by_game.sql server/test/migration-0002.test.ts server/vitest.config.ts server/test/env.d.ts
git commit -m "feat(server): migração 0002 guarda as rodadas como ITO e apaga os grupos"
```

---

### Task 3: servidor — histórico por jogo, sem rotas de grupo

**Files:**
- Modify: `server/src/history-db.ts`, `server/src/index.ts`, `server/src/room-do.ts`, `server/src/codes.ts`, `server/wrangler.jsonc`
- Regenerate: `server/worker-configuration.d.ts`
- Modify (testes): `server/test/helpers.ts`, `server/test/history-db.test.ts`, `server/test/http.test.ts`, `server/test/guard.test.ts` (se usar grupo)
- Delete: `server/test/groups.test.ts`
- Create: `server/test/history-route.test.ts`

- [ ] **Step 1: Helpers de teste**

Em `server/test/helpers.ts`:
- apague `newGroup` e `newGroupRoom`;
- acrescente:

```ts
/** Cria sala do jogo pedido (padrão ITO). */
export async function newGameRoom(game: 'ito' | 'dixit' = 'ito'): Promise<string> {
  const res = await SELF.fetch('https://x/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ game }),
  });
  if (res.status !== 201) throw new Error(`criar sala falhou: ${res.status}`);
  return ((await res.json()) as { code: string }).code;
}
```

- [ ] **Step 2: Testes da rota que falham**

Crie `server/test/history-route.test.ts`:

```ts
import { SELF } from 'cloudflare:test';
import type { HistoryResponse } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { newGameRoom, playRound } from './helpers';

async function history(game: string, before?: number): Promise<Response> {
  return SELF.fetch(`https://x/history/${game}${before === undefined ? '' : `?before=${before}`}`);
}

describe('GET /history/:game', () => {
  it('rodada de ITO revelada (sala comum, sem grupo) aparece no histórico do ITO', async () => {
    const code = await newGameRoom('ito');
    await playRound(code);
    let found: HistoryResponse | null = null;
    for (let i = 0; i < 20 && !found; i++) {
      const body = (await (await history('ito')).json()) as HistoryResponse;
      if (body.rounds.some((r) => r.roomCode === code)) found = body;
      else await new Promise((r) => setTimeout(r, 50));
    }
    expect(found?.game).toBe('ito');
    expect(found?.stats?.rounds).toBeGreaterThanOrEqual(1);
    const round = found!.rounds.find((r) => r.roomCode === code)!;
    expect(round.cards.map((c) => c.clue)).toContain('Paris');
  });

  it('páginas seguintes vêm sem estatísticas; before inválido dá 400', async () => {
    const page = (await (await history('ito', Date.now() + 1)).json()) as HistoryResponse;
    expect(page.stats).toBeNull();
    expect((await SELF.fetch('https://x/history/ito?before=abc')).status).toBe(400);
  });

  it('jogo sem histórico dá 404 no_history; jogo inexistente dá 404 not_found', async () => {
    const dixit = await history('dixit');
    expect(dixit.status).toBe(404);
    expect(await dixit.json()).toEqual({ error: 'no_history' });
    const xyz = await history('xyz');
    expect(xyz.status).toBe(404);
    expect(await xyz.json()).toEqual({ error: 'not_found' });
  });

  it('rotas de grupo não existem mais', async () => {
    expect((await SELF.fetch('https://x/groups', { method: 'POST', body: '{"name":"X"}' })).status).toBe(404);
    expect((await SELF.fetch('https://x/groups/abcdefghjk')).status).toBe(404);
    expect((await SELF.fetch('https://x/groups/abcdefghjk/rooms', { method: 'POST' })).status).toBe(404);
  });
});
```

> `playRound` (já existe em `helpers.ts`) joga uma rodada livre com 2 jogadores até a revelação, com a dica "Paris" na carta do primeiro.

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm run test -w server -- test/history-route.test.ts`
Expected: FAIL (a rota `/history` não existe; uma sala sem grupo ainda não grava).

- [ ] **Step 4: `history-db.ts` por jogo**

Substitua o arquivo inteiro por:

```ts
import type { GameId, RoundRecord } from '@cartolina/shared';

interface RoundRow {
  id: string;
  game: string;
  room_code: string;
  played_at: number;
  mode: string;
  level: number;
  outcome: string;
  errors: number;
  campaign_id: string | null;
  theme_json: string;
  players_json: string;
  cards_json: string;
}

const ROUND_COLS = 'id, game, room_code, played_at, mode, level, outcome, errors, campaign_id, theme_json, players_json, cards_json';
/** Limite de rodadas lidas para estatísticas (a galera fica bem abaixo disso). */
export const STATS_ROUNDS_CAP = 5000;

/** Idempotente por (jogo, sala, chave da revelação): gravar a mesma revelação de novo não duplica. */
export async function insertRound(db: D1Database, game: GameId, r: RoundRecord, revealKey: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO rounds (${ROUND_COLS}, reveal_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (game, room_code, reveal_key) DO NOTHING`,
    )
    .bind(
      r.id,
      game,
      r.roomCode,
      r.playedAt,
      r.mode,
      r.level,
      r.outcome,
      r.errors,
      r.campaignId,
      JSON.stringify(r.theme),
      JSON.stringify(r.players),
      JSON.stringify(r.cards),
      revealKey,
    )
    .run();
}

function fromRow(row: RoundRow): RoundRecord {
  return {
    id: row.id,
    roomCode: row.room_code,
    playedAt: row.played_at,
    mode: row.mode as RoundRecord['mode'],
    level: row.level,
    outcome: row.outcome as RoundRecord['outcome'],
    errors: row.errors,
    campaignId: row.campaign_id,
    theme: JSON.parse(row.theme_json) as RoundRecord['theme'],
    players: JSON.parse(row.players_json) as RoundRecord['players'],
    cards: JSON.parse(row.cards_json) as RoundRecord['cards'],
  };
}

/**
 * Mais recentes primeiro; `before` pagina por `played_at` (exclusivo). Limitação conhecida: duas rodadas
 * do mesmo jogo com o mesmo `played_at` na divisa de uma página fazem a segunda ser pulada (improvável).
 */
export async function listRounds(db: D1Database, game: GameId, before: number | null, limit: number): Promise<RoundRecord[]> {
  const stmt =
    before === null
      ? db.prepare(`SELECT ${ROUND_COLS} FROM rounds WHERE game = ? ORDER BY played_at DESC, id DESC LIMIT ?`).bind(game, limit)
      : db
          .prepare(`SELECT ${ROUND_COLS} FROM rounds WHERE game = ? AND played_at < ? ORDER BY played_at DESC, id DESC LIMIT ?`)
          .bind(game, before, limit);
  const { results } = await stmt.all<RoundRow>();
  return results.map(fromRow);
}

/** As `cap` rodadas mais recentes do jogo, em ordem cronológica, para estatísticas. */
export async function allRounds(db: D1Database, game: GameId, cap = STATS_ROUNDS_CAP): Promise<RoundRecord[]> {
  const { results } = await db
    .prepare(`SELECT ${ROUND_COLS} FROM rounds WHERE game = ? ORDER BY played_at DESC, id DESC LIMIT ?`)
    .bind(game, cap)
    .all<RoundRow>();
  return results.map(fromRow).reverse();
}
```

- [ ] **Step 5: Rotas** (`server/src/index.ts`)

1. Import:

```ts
import { GAMES, isGameId, summarizeHistory, type GameId, type HistoryResponse } from '@cartolina/shared';
import { CODE_RE, randomCode } from './codes';
import { MAX_BODY_BYTES, TOO_LARGE, allowedOrigin, readSmallJson, underLimit, type Limiter } from './guard';
import { allRounds, listRounds } from './history-db';
```

2. `createRoomFor(env, game)` sem grupo: o corpo do `/init` vira `JSON.stringify({ game })`.
3. `createRequestedRoom(request, env)` sem o parâmetro de grupo, chamando `createRoomFor(env, game)`.
4. Troque `getGroupPage` por:

```ts
async function getHistoryPage(env: Env, game: GameId, before: number | null): Promise<HistoryResponse> {
  // Uma a mais que a página só para saber se existe próxima.
  const fetched = await listRounds(env.DB, game, before, PAGE_SIZE + 1);
  const rounds = fetched.slice(0, PAGE_SIZE);
  return {
    game,
    rounds,
    // Estatísticas só na primeira página: leem até STATS_ROUNDS_CAP rodadas, caro demais para repetir a cada "ver mais".
    stats: before === null ? summarizeHistory(await allRounds(env.DB, game)) : null,
    nextBefore: fetched.length > PAGE_SIZE ? rounds[rounds.length - 1]!.playedAt : null,
  };
}
```

5. `limiterOf(env, name: 'ROOM_LIMITER')`: só o de salas.
6. Apague o bloco `POST /groups` e o bloco `groupMatch` inteiros. No lugar, acrescente:

```ts
  const historyMatch = url.pathname.match(/^\/history\/([^/]+)$/);
  if (historyMatch && request.method === 'GET') {
    const game = historyMatch[1]!;
    if (!isGameId(game)) return json({ error: 'not_found' }, 404);
    if (!GAMES[game].recordsHistory) return json({ error: 'no_history' }, 404);
    const before = parseBefore(url.searchParams.get('before'));
    if (before === undefined) return json({ error: 'bad_before' }, 400);
    return json(await getHistoryPage(env, game, before));
  }
```

7. O `POST /rooms` chama `createRequestedRoom(request, env)`.

- [ ] **Step 6: Durable Object** (`server/src/room-do.ts`)

1. Imports: tire `type RoomGroup`; acrescente `type GameId` se não houver.
2. `PendingRound` passa a ser:

```ts
interface PendingRound {
  /** Jogo do histórico. Pendentes deixados por um servidor antigo (antes da estante) têm `groupId` e eram do ITO. */
  game?: GameId;
  groupId?: string;
  key: string;
  record: RoundRecord;
}
```

3. `/init`:

```ts
      const body = ((await request.json().catch(() => null)) ?? {}) as { game?: unknown };
      const game = isGameId(body.game) ? body.game : 'ito';
      this.room = createRoom(url.searchParams.get('code') ?? '', Date.now(), game);
```

4. Acima da classe, uma função pura (exportada para teste):

```ts
/** Jogo de um pendente; os deixados por um servidor antigo (só `groupId`) eram do ITO. */
export function pendingGame(round: { game?: GameId }): GameId {
  return round.game ?? 'ito';
}
```

e no `flushRound`: `await insertRound(this.env.DB, pendingGame(round), round.record, round.key);`
5. `commit()`: troque o bloco que dependia de `group` por:

```ts
    const pending = pendingRecord(this.room, Date.now(), crypto.randomUUID());
    let queued: [string, PendingRound] | null = null;
    if (pending) {
      this.room = { ...this.room, recordedRevealKey: pending.key };
      queued = [PENDING_ROUND_PREFIX + pending.record.id, { game: this.room.gameId, key: pending.key, record: pending.record }];
      await this.ctx.storage.put<unknown>({ room: this.room, [queued[0]]: queued[1] });
    } else {
      await this.ctx.storage.put('room', this.room);
    }
```

(O `pendingRecord` já devolve `null` para jogos que não gravam histórico.)

- [ ] **Step 7: Código e config que saem**

- `server/src/codes.ts`: apague `SLUG_ALPHABET`, `SLUG_RE`, `randomSlug` e o comentário deles.
- `server/wrangler.jsonc`: no `ratelimits`, apague a entrada `GROUP_LIMITER`.
- Run: `npm run types -w server`. Expected: `worker-configuration.d.ts` sem `GROUP_LIMITER`.
- `git rm server/test/groups.test.ts`.

- [ ] **Step 8: Ajustar os outros testes do servidor**

Use `git grep -n -i -E "group|slug" -- server/test`:
- **`http.test.ts`:** o teste "criar grupo: o 6º pedido..." (com `GROUP_LIMITER`) vira o mesmo teste para salas: 11 `POST /rooms` com o mesmo `CF-Connecting-IP` (chave `test-${crypto.randomUUID()}`) → `[201 × 10, 429]`, com `it.skipIf(!('ROOM_LIMITER' in env))`. O comentário diz que 10 é o limite do `ROOM_LIMITER` no `wrangler.jsonc`. O teste de 413 que usava `POST /groups` passa a usar `POST /rooms` com o mesmo corpo grande. O teste de POST de outra origem que usava `/groups` usa `/rooms`.
- **`history-db.test.ts`:** reescreva para o formato novo. `insertRound(db, 'ito', record, key)` duas vezes não duplica. `listRounds(db, 'ito', ...)` não traz rodadas gravadas com `'dixit'`. A paginação por `before` continua.
- **`room-do.test.ts` e os outros:** troque `newGroupRoom()` por `newGameRoom()` e as asserções de grupo pela rota `/history/ito`.
- **Pendente antigo:** crie `server/test/pending-game.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { pendingGame } from '../src/room-do';

describe('pendingGame', () => {
  it('pendente novo usa o jogo gravado; antigo (só groupId) é ITO', () => {
    expect(pendingGame({ game: 'dixit' })).toBe('dixit');
    expect(pendingGame({ game: 'ito' })).toBe('ito');
    expect(pendingGame({ groupId: 'g1' } as { game?: 'ito' })).toBe('ito');
  });
});
```

- [ ] **Step 9: Rodar e ver passar**

Run: `npm run test -w server; npm run typecheck -w server`
Expected: PASS. Run: `git grep -n -i -E "group|slug" -- server/src`. Expected: só o comentário/campo `groupId` legado em `room-do.ts`.

- [ ] **Step 10: Commit**

```bash
git add -A server
git commit -m "feat(server): GET /history/:game; toda rodada de ITO vai pro histórico; saem as rotas de grupo"
```

---

### Task 4: web — dados e rotas (catálogo, API, roteador)

**Files:**
- Create: `web/src/games/catalog.ts`
- Modify: `web/src/net/api.ts`, `web/src/net/identity.ts`, `web/src/lib/router.ts`
- Modify (testes): `web/test/router.test.ts`, `web/test/groups-api.test.ts` → renomear para `web/test/history-api.test.ts`
- Create: `web/test/catalog.test.ts`

- [ ] **Step 1: Testes que falham**

Crie `web/test/catalog.test.ts`:

```ts
import { GAMES, GAME_IDS } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { CATALOG, catalogEntry } from '../src/games/catalog';

describe('catálogo de jogos do site', () => {
  it('tem uma entrada por jogo do registro, na ordem do registro', () => {
    expect(CATALOG.map((g) => g.id)).toEqual([...GAME_IDS]);
  });

  it('o histórico segue o registro', () => {
    for (const g of CATALOG) expect(g.hasHistory).toBe(GAMES[g.id].recordsHistory);
  });

  it('DITU jogável; Dixit ainda não', () => {
    expect(catalogEntry('ito')?.playable).toBe(true);
    expect(catalogEntry('dixit')?.playable).toBe(false);
    expect(catalogEntry('xyz')).toBeNull();
  });
});
```

Em `web/test/router.test.ts`, substitua os casos de grupo por:

```ts
  it('rotas da estante, do jogo e das abas', () => {
    expect(parseHash('')).toEqual({ name: 'home' });
    expect(parseHash('#/')).toEqual({ name: 'home' });
    expect(parseHash('#/ito')).toEqual({ name: 'game', game: 'ito', tab: 'jogar' });
    expect(parseHash('#/ito/historico')).toEqual({ name: 'game', game: 'ito', tab: 'historico' });
    expect(parseHash('#/dixit')).toEqual({ name: 'game', game: 'dixit', tab: 'jogar' });
    expect(parseHash('#/xyz')).toEqual({ name: 'home' });
    expect(parseHash('#/sala/abcd')).toEqual({ name: 'room', code: 'ABCD' });
  });

  it('link antigo de grupo vai pro histórico do ITO', () => {
    expect(parseHash('#/g/abcdefghjk')).toEqual({ name: 'game', game: 'ito', tab: 'historico', legacy: true });
    expect(parseHash('#/g/qualquercoisa')).toEqual({ name: 'game', game: 'ito', tab: 'historico', legacy: true });
  });
```

Renomeie `web/test/groups-api.test.ts` para `web/test/history-api.test.ts` (`git mv`). Troque o conteúdo dos testes de grupo por:

```ts
  it('createRoom manda o jogo', async () => {
    const f = fakeFetch(201, { code: 'KXQ7' });
    await expect(createRoom('dixit', f, 'http://s')).resolves.toBe('KXQ7');
    expect(f).toHaveBeenCalledWith('http://s/rooms', expect.objectContaining({ method: 'POST', body: JSON.stringify({ game: 'dixit' }) }));
  });

  it('getHistory pagina com before; 404 (jogo sem histórico) vira null', async () => {
    const f = fakeFetch(200, { game: 'ito', rounds: [], stats: null, nextBefore: null });
    await getHistory('ito', 123, f, 'http://s');
    expect(f).toHaveBeenCalledWith('http://s/history/ito?before=123');
    await expect(getHistory('dixit', null, fakeFetch(404, { error: 'no_history' }), 'http://s')).resolves.toBeNull();
    await expect(getHistory('ito', null, fakeFetch(500, {}), 'http://s')).rejects.toThrow('history_failed_500');
  });
```

(Mantenha o helper `fakeFetch` que o arquivo já tem; ajuste os imports para `createRoom` e `getHistory`.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test -w web -- test/catalog.test.ts test/router.test.ts test/history-api.test.ts`
Expected: FAIL.

- [ ] **Step 3: Catálogo**

Crie `web/src/games/catalog.ts`:

```ts
import { GAMES, GAME_IDS, isGameId, type GameId } from '@cartolina/shared';

/** O que o site mostra de cada jogo na estante e na página do jogo. */
export interface CatalogEntry {
  id: GameId;
  name: string;
  /** Frase curta da capa. */
  tagline: string;
  players: string;
  /** "como jogar", em poucas linhas. */
  rules: string[];
  /** Já dá pra criar sala e jogar (o Dixit chega no D2). */
  playable: boolean;
  /** Tem aba de histórico com partidas (segue `GAMES[id].recordsHistory`). */
  hasHistory: boolean;
}

const TEXT: Record<GameId, Omit<CatalogEntry, 'id' | 'hasHistory'>> = {
  ito: {
    name: 'DITU',
    tagline: 'adivinhem a ordem sem dizer o número',
    players: '2 a 10 pessoas',
    rules: [
      'Cada um recebe um número secreto de 1 a 100.',
      'Sem dizer o número, use o tema pra dar uma dica: quanto maior o número, mais perto do "100" do tema.',
      'Juntos, coloquem as cartas em ordem na mesa. Todo mundo pronto, as cartas viram.',
      'Modo livre: rodadas soltas. Campanha: 3 vidas e 3 níveis.',
    ],
    playable: true,
  },
  dixit: {
    name: 'Dixit',
    tagline: 'uma imagem, uma frase, muitas interpretações',
    players: '3 a 10 pessoas',
    rules: [
      'O narrador escolhe uma carta da mão e diz uma frase sobre ela.',
      'Os outros escolhem a carta da mão que mais combina com a frase.',
      'Todo mundo vota em qual era a do narrador. Nem todos podem acertar, nem ninguém.',
    ],
    playable: false,
  },
};

export const CATALOG: CatalogEntry[] = GAME_IDS.map((id) => ({ id, ...TEXT[id], hasHistory: GAMES[id].recordsHistory }));

export function catalogEntry(id: string): CatalogEntry | null {
  return isGameId(id) ? (CATALOG.find((g) => g.id === id) ?? null) : null;
}
```

- [ ] **Step 4: API** (`web/src/net/api.ts`)

1. Import: `import type { GameId, HistoryResponse, RoomSummary } from '@cartolina/shared';`
2. `createRoom` recebe o jogo:

```ts
export async function createRoom(game: GameId, fetcher: typeof fetch = fetch, base: string = SERVER_URL): Promise<string> {
  const res = await fetcher(`${base}/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ game }),
  });
  if (!res.ok) throw new Error(`create_failed_${res.status}`);
  return ((await res.json()) as { code: string }).code;
}
```

3. Apague `createGroup`, `getGroup` e `createGroupRoom`. Acrescente:

```ts
/** Histórico do jogo; `null` quando o jogo não tem histórico (404). */
export async function getHistory(
  game: GameId,
  before: number | null = null,
  fetcher: typeof fetch = fetch,
  base: string = SERVER_URL,
): Promise<HistoryResponse | null> {
  const qs = before === null ? '' : `?before=${before}`;
  const res = await fetcher(`${base}/history/${game}${qs}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`history_failed_${res.status}`);
  return (await res.json()) as HistoryResponse;
}
```

- [ ] **Step 5: Identidade**

Em `web/src/net/identity.ts`, apague `GROUPS_KEY`, `MAX_GROUPS`, `RememberedGroup`, `loadGroups` e `rememberGroup`. A chave antiga no `localStorage` fica lá e é ignorada.

- [ ] **Step 6: Roteador** (`web/src/lib/router.ts`)

Substitua o tipo `Route`, o `parseHash` e as funções de grupo:

```ts
import { isGameId, type GameId } from '@cartolina/shared';
import { useEffect, useState } from 'react';

export type GameTab = 'jogar' | 'historico';
export type Route =
  | { name: 'home' }
  | { name: 'room'; code: string }
  | { name: 'game'; game: GameId; tab: GameTab; legacy?: true };

export function parseHash(hash: string): Route {
  const room = hash.match(/^#\/sala\/([A-Za-z0-9]{4})$/);
  if (room) return { name: 'room', code: room[1]!.toUpperCase() };
  // Links antigos de grupo (#/g/<slug>): o histórico agora é do jogo.
  if (/^#\/g\/[^/]+$/.test(hash)) return { name: 'game', game: 'ito', tab: 'historico', legacy: true };
  const game = hash.match(/^#\/([a-z]+)(\/historico)?$/);
  if (game && isGameId(game[1])) return { name: 'game', game: game[1], tab: game[2] ? 'historico' : 'jogar' };
  return { name: 'home' };
}

export function gameHash(game: GameId, tab: GameTab = 'jogar'): string {
  return tab === 'historico' ? `#/${game}/historico` : `#/${game}`;
}
```

Mantenha `useHashRoute`, `goToRoom`, `goHome` e `roomLink`. Apague `goToGroup` e `groupLink`. Acrescente:

```ts
export function goToGame(game: GameId, tab: GameTab = 'jogar'): void {
  window.location.hash = gameHash(game, tab);
}
```

- [ ] **Step 7: Rodar os testes desta task**

Run: `npm run test -w web -- test/catalog.test.ts test/router.test.ts test/history-api.test.ts`
Expected: PASS. As telas ainda não compilam: as Tasks 5 a 7 resolvem isso.

- [ ] **Step 8: Commit**

```bash
git add -A web/src/games web/src/net web/src/lib web/test/catalog.test.ts web/test/router.test.ts web/test/history-api.test.ts
git commit -m "feat(web): catálogo de jogos, rotas #/<jogo> e API de histórico; saem as de grupo"
```

---

### Task 5: web — painel de histórico e página do jogo

**Files:**
- Create: `web/src/screens/history/RoundItem.tsx`, `web/src/screens/history/HistoryPanel.tsx`, `web/src/screens/history/history.css`
- Create: `web/src/screens/GamePage.tsx`, `web/src/screens/shelf.css`
- Delete: `web/src/screens/GroupPage.tsx`, `web/src/screens/group.css`
- Create: `web/test/game-page.test.tsx` (a partir de `web/test/groups-ui.test.tsx`, que é apagado)

- [ ] **Step 1: Mover os componentes de histórico**

Crie `web/src/screens/history/RoundItem.tsx` movendo **sem mudar o conteúdo** de `GroupPage.tsx`:
- `OUTCOME`, `dateFmt`, `CritterIcon`, `Stat`, `MiniCard` e `RoundItem`;
- os imports de que eles precisam (`ItoOutcome`, `RoundCard`, `RoundRecord`, `useId`, `CSSProperties`, `critterSvg`).

Exporte `CritterIcon`, `Stat` e `RoundItem`.

Crie `web/src/screens/history/history.css` com o conteúdo de `group.css`. Troque o seletor `.group-page` por `.history-page` nas duas primeiras linhas.

- [ ] **Step 2: Testes que falham**

Crie `web/test/game-page.test.tsx`. Ele reaproveita o helper `ROUND(...)` de `groups-ui.test.tsx`; copie o helper e os testes de lista e expansão de lá antes de apagar o arquivo antigo.

```tsx
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { summarizeHistory, type HistoryResponse, type RoundRecord } from '@cartolina/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../src/net/api';
import { GamePage } from '../src/screens/GamePage';

vi.mock('../src/net/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/net/api')>();
  return { ...actual, createRoom: vi.fn(), getHistory: vi.fn() };
});

// ROUND(id, playedAt, over?) — copiado de groups-ui.test.tsx
// (cole aqui o helper ROUND exatamente como estava)

function response(rounds: RoundRecord[], nextBefore: number | null): HistoryResponse {
  return { game: 'ito', rounds, stats: summarizeHistory(rounds), nextBefore };
}

describe('GamePage', () => {
  beforeEach(() => {
    vi.mocked(api.createRoom).mockReset();
    vi.mocked(api.getHistory).mockReset();
  });
  afterEach(() => {
    window.location.hash = '';
  });

  it('aba jogar: criar sala do jogo, como jogar e voltar pros jogos', async () => {
    vi.mocked(api.createRoom).mockResolvedValue('KXQ7');
    render(<GamePage game="ito" tab="jogar" />);
    expect(screen.getByRole('heading', { name: 'DITU' })).toBeTruthy();
    expect(screen.getByText(/número secreto de 1 a 100/)).toBeTruthy();
    expect(screen.getByRole('link', { name: '← jogos' }).getAttribute('href')).toBe('#/');
    fireEvent.click(screen.getByRole('button', { name: 'criar sala' }));
    await waitFor(() => expect(window.location.hash).toBe('#/sala/KXQ7'));
    expect(api.createRoom).toHaveBeenCalledWith('ito');
  });

  it('as abas são links com a rota de cada uma', () => {
    render(<GamePage game="ito" tab="jogar" />);
    expect(screen.getByRole('tab', { name: 'jogar' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'histórico' }).getAttribute('href')).toBe('#/ito/historico');
  });

  it('aba histórico: números e partidas do jogo', async () => {
    vi.mocked(api.getHistory).mockResolvedValue(response([ROUND('r1', 2000)], null));
    render(<GamePage game="ito" tab="historico" />);
    expect(await screen.findByText('rodadas')).toBeTruthy();
    expect(api.getHistory).toHaveBeenCalledWith('ito');
    expect(screen.queryByText(/grupo/i)).toBeNull();
  });

  it('histórico vazio convida a jogar', async () => {
    vi.mocked(api.getHistory).mockResolvedValue(response([], null));
    render(<GamePage game="ito" tab="historico" />);
    expect(await screen.findByText(/Nenhuma partida ainda/)).toBeTruthy();
  });

  it('Dixit: jogar e histórico dizem "em breve" e não chamam o servidor', () => {
    render(<GamePage game="dixit" tab="jogar" />);
    expect(screen.queryByRole('button', { name: 'criar sala' })).toBeNull();
    expect(screen.getByText(/Dixit tá chegando/)).toBeTruthy();
    render(<GamePage game="dixit" tab="historico" />);
    expect(screen.getByText(/histórico do Dixit vem em breve/)).toBeTruthy();
    expect(api.getHistory).not.toHaveBeenCalled();
  });

  it('link antigo de grupo mostra um aviso', async () => {
    vi.mocked(api.getHistory).mockResolvedValue(response([], null));
    render(<GamePage game="ito" tab="historico" legacy />);
    expect(screen.getByText(/grupos acabaram/)).toBeTruthy();
  });
});
```

Depois de copiar os testes de histórico que valem (lista, expandir a fila, carregar mais, stats `null` na página seguinte, erro e "tentar de novo", StrictMode e nomes repetidos) de `groups-ui.test.tsx` para este arquivo, adaptando de `getGroup(slug, …)` para `getHistory('ito', …)` e de `<GroupPage slug=… />` para `<GamePage game="ito" tab="historico" />`, apague `web/test/groups-ui.test.tsx`. Testes da Home de grupos vão pra Task 6; os de grupo puro (copiar link, nome do grupo) são descartados.

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm run test -w web -- test/game-page.test.tsx`
Expected: FAIL (`GamePage` não existe).

- [ ] **Step 4: `HistoryPanel`**

Crie `web/src/screens/history/HistoryPanel.tsx` a partir da lógica de carga e paginação de `GroupPage` (geração de requisições, `load`, `loadMore`, erros), sem grupo:

```tsx
import type { GameId, HistoryResponse } from '@cartolina/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getHistory } from '../../net/api';
import { CritterIcon, RoundItem, Stat } from './RoundItem';
import './history.css';

export function HistoryPanel({ game }: { game: GameId }) {
  const [data, setData] = useState<HistoryResponse | null | undefined>(undefined);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  /** Geração das requisições: cada carga nova (ou a desmontagem) invalida as respostas que ainda estão a caminho. */
  const generation = useRef(0);

  const load = useCallback(() => {
    const gen = ++generation.current;
    setLoadFailed(false);
    getHistory(game)
      .then((d) => {
        if (gen === generation.current) setData(d);
      })
      .catch(() => {
        if (gen === generation.current) setLoadFailed(true);
      });
  }, [game]);

  useEffect(() => {
    load();
    return () => {
      generation.current++;
    };
  }, [load]);

  async function loadMore() {
    if (!data || data.nextBefore === null) return;
    const gen = generation.current;
    const before = data.nextBefore;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const more = await getHistory(game, before);
      if (gen !== generation.current) return;
      if (!more) {
        setMoreError('Não achei mais partidas.');
        return;
      }
      setData((prev) => {
        if (!prev) return prev;
        const seen = new Set(prev.rounds.map((r) => r.id));
        return {
          ...prev,
          rounds: [...prev.rounds, ...more.rounds.filter((r) => !seen.has(r.id))],
          nextBefore: more.nextBefore,
          // páginas seguintes vêm sem estatísticas: mantém as da primeira
          stats: prev.stats ?? more.stats,
        };
      });
    } catch {
      if (gen === generation.current) setMoreError('Não deu pra carregar mais partidas. Tenta de novo.');
    } finally {
      if (gen === generation.current) setLoadingMore(false);
    }
  }

  if (data === undefined && loadFailed) {
    return (
      <section className="panel">
        <h2>não deu pra falar com o servidor</h2>
        <button className="btn" type="button" onClick={load}>
          tentar de novo
        </button>
      </section>
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

  const { rounds, stats } = data;
  const winRate = stats?.livreRounds ? `${Math.round((stats.livreWins / stats.livreRounds) * 100)}%` : '—';
  return (
    <div className="history-page">
      {stats && (
        <section className="panel">
          <h2>números</h2>
          <div className="stats">
            <Stat label="rodadas" value={String(stats.rounds)} />
            <Stat label="vitórias no livre" value={winRate} />
            <Stat label="campanhas zeradas" value={`${stats.campaignsWon}/${stats.campaigns}`} />
            <Stat label="maior sequência sem erro" value={String(stats.bestStreak)} />
          </div>
          {stats.sharpest && (
            <p className="highlight">
              <CritterIcon color={stats.sharpest.color} />
              <span>
                <b>{stats.sharpest.name}</b> é quem mais acerta a posição: {Math.round(stats.sharpest.accuracy * 100)}% de{' '}
                {stats.sharpest.cards} cartas
              </span>
            </p>
          )}
          {stats.topThemes.length > 0 && (
            <div>
              <h3>temas mais jogados</h3>
              <ol className="theme-list">
                {stats.topThemes.map((t) => (
                  <li key={t.titulo}>
                    {t.titulo} <span>({t.count})</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      )}

      <section className="panel">
        <h2>partidas</h2>
        {rounds.length === 0 ? (
          <p>Nenhuma partida ainda. Crie uma sala e bora jogar!</p>
        ) : (
          <ul className="round-list">
            {rounds.map((r) => (
              <RoundItem key={r.id} round={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} />
            ))}
          </ul>
        )}
        {data.nextBefore !== null && (
          <button className="sbtn" type="button" onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? 'carregando…' : 'carregar mais'}
          </button>
        )}
        {moreError && (
          <p className="error" role="alert">
            {moreError}
          </p>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 5: `GamePage`**

Crie `web/src/screens/GamePage.tsx`:

```tsx
import type { GameId } from '@cartolina/shared';
import { useState, type FormEvent } from 'react';
import { catalogEntry } from '../games/catalog';
import { useIsPhone } from '../lib/device';
import { gameHash, goToRoom, type GameTab } from '../lib/router';
import { createRoom } from '../net/api';
import { TOO_MANY_MESSAGE, isTooMany } from '../net/errors';
import { HistoryPanel } from './history/HistoryPanel';
import { PHONE_TEXT } from './PhoneNotice';
import './shelf.css';

/** "criar sala" + "entrar com código" de um jogo (também usado na estante, só com o código). */
export function JoinByCode() {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  function enter(e: FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (/^[A-Z0-9]{4}$/.test(c)) goToRoom(c);
    else setError('O código da sala tem 4 letras.');
  }
  return (
    <form className="row-inline" onSubmit={enter}>
      <input
        className="text-in"
        value={code}
        onChange={(e) => {
          setCode(e.target.value);
          setError(null);
        }}
        placeholder="KXQ7"
        maxLength={4}
        aria-label="código da sala"
      />
      <button className="sbtn solid" type="submit">
        entrar na sala
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function PlayTab({ game }: { game: GameId }) {
  const entry = catalogEntry(game)!;
  const phone = useIsPhone();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      goToRoom(await createRoom(game));
    } catch (err) {
      setError(isTooMany(err) ? TOO_MANY_MESSAGE : 'Não deu pra criar a sala. Tenta de novo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="panel">
        {!entry.playable ? (
          <p className="hint">O {entry.name} tá chegando! Por enquanto dá pra ver as regras aqui embaixo.</p>
        ) : phone ? (
          <p className="hint">{PHONE_TEXT}</p>
        ) : (
          <>
            <button className="btn" type="button" onClick={() => void create()} disabled={busy}>
              {busy ? 'criando…' : 'criar sala'}
            </button>
            <JoinByCode />
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </>
        )}
      </section>
      <section className="panel">
        <h2>como jogar</h2>
        <ul className="rules">
          {entry.rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className="hint">{entry.players}</p>
      </section>
    </>
  );
}

export function GamePage({ game, tab, legacy = false }: { game: GameId; tab: GameTab; legacy?: boolean }) {
  const entry = catalogEntry(game)!;
  return (
    <main className={`screen game-page cover-${game}`}>
      <h1 className="logo">
        cartolina<span>~</span>
      </h1>
      <header className="game-head">
        <a className="back-link" href="#/">
          ← jogos
        </a>
        <div className={`cover mini cover-${game}`} aria-hidden="true">
          {entry.name}
        </div>
        <div>
          <h2>{entry.name}</h2>
          <p className="tagline">{entry.tagline}</p>
        </div>
      </header>
      <nav className="tabs" role="tablist">
        {(['jogar', 'historico'] as const).map((t) => (
          <a key={t} role="tab" aria-selected={tab === t} className={`tab ${tab === t ? 'on' : ''}`} href={gameHash(game, t)}>
            {t === 'jogar' ? 'jogar' : 'histórico'}
          </a>
        ))}
      </nav>
      {legacy && <p className="hint">Os grupos acabaram: agora todo o histórico fica aqui, dentro de cada jogo.</p>}
      {tab === 'jogar' ? (
        <PlayTab game={game} />
      ) : entry.hasHistory ? (
        <HistoryPanel game={game} />
      ) : (
        <section className="panel">
          <p>O histórico do {entry.name} vem em breve.</p>
        </section>
      )}
    </main>
  );
}
```

> **Texto do Dixit:** o teste procura "Dixit tá chegando" e "histórico do Dixit vem em breve". Os textos acima geram exatamente isso a partir de `entry.name`.

- [ ] **Step 6: CSS da estante e da página do jogo**

Crie `web/src/screens/shelf.css`:

```css
/* Estante de jogos (início) e página do jogo. */
.shelf { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 18px; width: min(760px, 100%); }
.cover {
  display: flex; flex-direction: column; justify-content: flex-end; gap: 6px; min-height: 260px; padding: 18px;
  border: 2px solid var(--ink); border-radius: var(--r); box-shadow: 4px 5px 0 var(--ink); color: var(--ink);
  text-decoration: none; transition: transform 0.15s;
}
.cover:hover, .cover:focus-visible { transform: translateY(-4px) rotate(-1deg); }
.cover b { font: 700 34px/1 var(--font-ui); }
.cover span { font: 19px/1.15 var(--font-hand); }
.cover-ito { background: var(--pink); }
.cover-dixit { background: #2f5d50; color: #f4ecd8; }
.cover.mini { min-height: 0; width: 64px; height: 84px; padding: 8px; justify-content: center; align-items: center; font: 700 16px/1 var(--font-ui); box-shadow: 2px 3px 0 var(--ink); }
.cover.mini:hover { transform: none; }
.cover-badge { align-self: flex-start; font: 500 13px/1 var(--font-ui); padding: 3px 8px; border: 2px solid currentColor; border-radius: 999px; }
.game-page .panel, .game-head, .tabs { width: min(760px, 100%); }
.game-head { display: flex; align-items: center; gap: 14px; }
.game-head h2 { margin: 0; font: 700 30px/1 var(--font-ui); }
.game-head .tagline { text-align: left; }
.back-link { font: 500 16px/1 var(--font-ui); color: var(--ink); margin-right: auto; }
.tabs { display: flex; gap: 8px; border-bottom: 2px solid var(--ink); }
.tab {
  padding: 8px 16px; font: 600 17px/1 var(--font-ui); color: var(--ink); text-decoration: none;
  border: 2px solid var(--ink); border-bottom: none; border-radius: 10px 10px 0 0; background: var(--kraft); margin-bottom: -2px;
}
.tab.on { background: var(--paper); }
.rules { margin: 0; padding-left: 22px; font: 19px/1.35 var(--font-hand); }
```

- [ ] **Step 7: Apagar a página de grupo**

`git rm web/src/screens/GroupPage.tsx web/src/screens/group.css web/test/groups-ui.test.tsx`. O teste foi copiado no Step 2.

- [ ] **Step 8: Rodar e ver passar**

Run: `npm run test -w web -- test/game-page.test.tsx`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add -A web/src/screens web/test
git commit -m "feat(web): página do jogo com abas jogar e histórico; sai a página de grupo"
```

---

### Task 6: web — estante no início e rotas ligadas

**Files:**
- Modify: `web/src/screens/Home.tsx`, `web/src/App.tsx`, `web/src/screens/PhoneNotice.tsx`, `web/src/brand/global.css`
- Create: `web/test/shelf.test.tsx`
- Modify: `web/test/phone.test.tsx`, `web/test/screens.test.tsx` (se testar a Home antiga)

- [ ] **Step 1: Testes que falham**

Crie `web/test/shelf.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { Home } from '../src/screens/Home';

vi.mock('../src/net/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/net/api')>();
  return { ...actual, createRoom: vi.fn(), getHistory: vi.fn(() => new Promise(() => {})), getRoomInfo: vi.fn(() => new Promise(() => {})) };
});

describe('estante de jogos', () => {
  afterEach(() => {
    window.location.hash = '';
  });

  it('uma capa por jogo, que leva pra página do jogo', () => {
    render(<Home />);
    expect(screen.getByRole('link', { name: /DITU/ }).getAttribute('href')).toBe('#/ito');
    expect(screen.getByRole('link', { name: /Dixit/ }).getAttribute('href')).toBe('#/dixit');
    expect(screen.getByText('em breve')).toBeTruthy(); // selo na capa do Dixit
    expect(screen.queryByText(/grupo/i)).toBeNull();
  });

  it('entrar com código vai pra sala', () => {
    render(<Home />);
    fireEvent.change(screen.getByLabelText('código da sala'), { target: { value: 'kxq7' } });
    fireEvent.click(screen.getByRole('button', { name: 'entrar na sala' }));
    expect(window.location.hash).toBe('#/sala/KXQ7');
  });

  it('App: #/ito abre a página do DITU; #/g/... abre o histórico do ITO com aviso', () => {
    window.location.hash = '#/ito';
    const { unmount } = render(<App />);
    expect(screen.getByRole('heading', { name: 'DITU' })).toBeTruthy();
    unmount();
    window.location.hash = '#/g/d3jj53e9xj';
    render(<App />);
    expect(screen.getByRole('tab', { name: 'histórico' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText(/grupos acabaram/)).toBeTruthy();
  });
});
```

Em `web/test/phone.test.tsx`:
- O teste "no celular, a tela inicial troca 'criar sala' pelo aviso (grupos continuam)" vira: "no celular, a estante continua e a página do ITO troca 'criar sala' pelo aviso". Renderize `<GamePage game="ito" tab="jogar" />` e espere `PHONE_TEXT` e nenhum botão "criar sala".
- Os testes da `GroupPage` no celular saem; já estão cobertos pela página do jogo.
- O teste "no computador, nada muda" passa a usar `GamePage` (botão "criar sala" presente).

Em `web/test/screens.test.tsx` (ou onde a Home antiga for testada): apague os testes de "criar sala" e "grupos" da Home, que agora estão na página do jogo e na estante.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test -w web -- test/shelf.test.tsx test/phone.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Home = estante**

Substitua `web/src/screens/Home.tsx` inteiro por:

```tsx
import { CATALOG } from '../games/catalog';
import { JoinByCode } from './GamePage';
import './shelf.css';

export function Home() {
  return (
    <main className="screen">
      <h1 className="logo big">
        cartolina<span>~</span>
      </h1>
      <p className="tagline">jogos de tabuleiro pra jogar com a galera na call</p>
      <nav className="shelf" aria-label="jogos">
        {CATALOG.map((g) => (
          <a key={g.id} className={`cover cover-${g.id}`} href={`#/${g.id}`}>
            {!g.playable && <span className="cover-badge">em breve</span>}
            <b>{g.name}</b>
            <span>{g.tagline}</span>
          </a>
        ))}
      </nav>
      <section className="panel">
        <h2>entrar com código</h2>
        <JoinByCode />
      </section>
    </main>
  );
}
```

> No celular, "entrar com código" leva à sala, e a rota da sala já mostra o aviso, como no Plano 4. A estante continua igual.

- [ ] **Step 4: App**

Substitua `web/src/App.tsx` por:

```tsx
import { useIsPhone } from './lib/device';
import { useHashRoute } from './lib/router';
import { GamePage } from './screens/GamePage';
import { Home } from './screens/Home';
import { PhoneNotice } from './screens/PhoneNotice';
import { RoomScreen } from './screens/RoomScreen';

export function App() {
  const route = useHashRoute();
  const phone = useIsPhone();
  if (route.name === 'room') return phone ? <PhoneNotice /> : <RoomScreen key={route.code} code={route.code} />;
  if (route.name === 'game') return <GamePage key={`${route.game}/${route.tab}`} game={route.game} tab={route.tab} legacy={route.legacy} />;
  return <Home />;
}
```

- [ ] **Step 5: Textos e CSS que sobraram**

- `PhoneNotice.tsx`: troque "O histórico do grupo funciona no celular." por "O histórico dos jogos funciona no celular."
- `brand/global.css`: apague as regras `.group-list`.

- [ ] **Step 6: Rodar e ver passar**

Run: `npm run test -w web -- test/shelf.test.tsx test/phone.test.tsx test/game-page.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A web
git commit -m "feat(web): início vira estante de jogos; #/g/ antigo leva ao histórico do ITO"
```

---

### Task 7: web — links de histórico na sala e sala nova do mesmo jogo

**Files:**
- Modify: `web/src/screens/Lobby.tsx`, `web/src/table/TopBar.tsx`, `web/src/table/table.css`, `web/src/screens/RoomScreen.tsx`
- Modify (testes): `web/test/room-screen.test.tsx`, `web/test/table-ui.test.tsx`/`web/test/screens.test.tsx` (onde houver lobby/topbar com grupo)

- [ ] **Step 1: Testes que falham**

Onde hoje se testa "lobby mostra o link do histórico do grupo" e "mesa mostra o nome do grupo", troque por (use o `viewOf`/`makeRoom` dos fixtures; a view de ITO tem `gameId: 'ito'`):

```tsx
  it('lobby mostra o link do histórico do jogo', () => {
    render(<Lobby view={viewOf(makeRoom(2), 'p0')} conn={conn()} />);
    expect(screen.getByRole('link', { name: '📜 histórico do DITU' }).getAttribute('href')).toBe('#/ito/historico');
  });

  it('mesa mostra o link do histórico embaixo do logo', () => {
    const { container } = render(<TopBar view={viewOf(makeRoom(2), 'p0')} />);
    const link = screen.getByRole('link', { name: '📜 histórico' });
    expect(link.getAttribute('href')).toBe('#/ito/historico');
    expect(container.querySelector('.brandcol')?.contains(link)).toBe(true);
  });
```

Em `web/test/room-screen.test.tsx`:
- mock da api: `{ getRoomInfo: vi.fn(), createRoom: vi.fn() }`, sem `createGroupRoom`;
- o teste "sala de grupo que acabou" vira:

```tsx
  it('sala que acabou: cria outra do mesmo jogo e mostra o histórico', async () => {
    mocked.mockResolvedValue(info());
    vi.mocked(createRoom).mockResolvedValue('QRST');
    markJoined('ABCD', { name: 'Ana', color: '#8EC5FF' });
    renderRoom();
    await waitFor(() => expect(FakeSocket.all).toHaveLength(1));
    act(() => {
      last().open();
      last().receive({ t: 'welcome', playerId: 'p0', code: 'ABCD' });
      last().receive({ t: 'state', room: viewOf(makeRoom(2), 'p0') });
    });
    act(() => last().drop(4004));
    expect(await screen.findByText('essa sala acabou')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'ver o histórico' }).getAttribute('href')).toBe('#/ito/historico');
    fireEvent.click(screen.getByRole('button', { name: 'criar sala nova' }));
    await waitFor(() => expect(createRoom).toHaveBeenCalledWith('ito'));
    await waitFor(() => expect(window.location.hash).toBe('#/sala/QRST'));
  });
```

- o teste "sala que acabou: oferece criar outra" (sem view) espera `createRoom` com `'ito'`, que é o padrão sem view, e nenhum link de histórico.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test -w web`
Expected: FAIL nesses testes.

- [ ] **Step 3: Implementar**

`Lobby.tsx`: troque o bloco `{view.group && (...)}` por:

```tsx
        {catalogEntry(view.gameId)?.hasHistory && (
          <a className="sbtn" href={gameHash(view.gameId, 'historico')} target="_blank" rel="noopener">
            📜 histórico do {catalogEntry(view.gameId)!.name}
          </a>
        )}
```

(imports: `catalogEntry` de `../games/catalog`, `gameHash` de `../lib/router`.)

`TopBar.tsx`: troque o bloco do link do grupo por:

```tsx
        {/* Embaixo do logo, e não nas pílulas: ali ele empurraria as pílulas por cima dos assentos de cima. */}
        {catalogEntry(view.gameId)?.hasHistory && (
          <a className="histlink" href={gameHash(view.gameId, 'historico')} target="_blank" rel="noopener" title="histórico do jogo">
            📜 histórico
          </a>
        )}
```

`table.css`: renomeie `.grouplink` para `.histlink` (as duas regras).

`RoomScreen.tsx`:
- apague o tipo `RoomGroupView` e o import de `createGroupRoom`;
- imports: `gameHash` de `../lib/router`, `catalogEntry` de `../games/catalog` e `type GameId` de `@cartolina/shared`;
- `RoomGone` vira:

```tsx
/** A sala expirou ou fechou: oferece outra do mesmo jogo (ITO quando não deu pra saber o jogo). */
function RoomGone({ game }: { game: GameId }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasHistory = catalogEntry(game)?.hasHistory ?? false;
  async function again() {
    setBusy(true);
    setError(null);
    try {
      goToRoom(await createRoom(game));
    } catch (err) {
      setError(isTooMany(err) ? TOO_MANY_MESSAGE : 'Não deu pra criar a sala. Tenta de novo.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="screen">
      <h1 className="logo">
        cartolina<span>~</span>
      </h1>
      <section className="panel">
        <h2>essa sala acabou</h2>
        <p>Ela expirou ou foi fechada. Bora abrir outra?</p>
        <button className="btn" type="button" disabled={busy} onClick={() => void again()}>
          {busy ? 'criando…' : 'criar sala nova'}
        </button>
        {hasHistory && (
          <a className="sbtn" href={gameHash(game, 'historico')}>
            ver o histórico
          </a>
        )}
        <button className="sbtn" type="button" onClick={goHome}>
          voltar pro início
        </button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
```

- a chamada: `if (status === 'gone') return <RoomGone game={snap?.view?.gameId ?? 'ito'} />;`
- qualquer outra chamada a `createRoom()` sem argumento no arquivo passa a usar o jogo da sala (ou `'ito'`).

> **"sem view":** sem estado da sala, não dá pra saber o jogo, e o padrão é ITO, que hoje é o único jogável. O link "ver o histórico" aparece porque o ITO tem histórico. Ajuste o teste "sala que acabou: oferece criar outra" para esperar o link `#/ito/historico`.

- [ ] **Step 4: Rodar tudo do web**

Run: `npm run test -w web; npm run typecheck -w web; npm run build`
Expected: PASS. Run: `git grep -n -i -E "group|grupo" -- web/src`. Expected: só o texto do aviso "Os grupos acabaram" em `GamePage.tsx`.

- [ ] **Step 5: Commit**

```bash
git add -A web
git commit -m "feat(web): lobby, mesa e sala que acabou levam ao histórico do jogo"
```

---

### Task 8: E2E pelo caminho novo

**Files:**
- Modify: `e2e/rodada.spec.ts`

- [ ] **Step 1: Atualizar os testes**

1. Nos testes "build de produção não tem bots" e "rodada livre com dois navegadores", troque
   `await a.goto('/'); await a.getByRole('button', { name: 'criar sala' }).click();`
   por:

```ts
  await a.goto('/');
  await a.getByRole('link', { name: /DITU/ }).click();
  await expect(a).toHaveURL(/#\/ito$/);
  await a.getByRole('button', { name: 'criar sala' }).click();
```

2. Substitua o teste "rodada numa sala de grupo aparece no histórico" por:

```ts
test('rodada aparece no histórico do ITO', async ({ browser }) => {
  const a = await newPlayer(browser);
  const b = await newPlayer(browser);
  await a.goto('/#/ito');
  await a.getByRole('button', { name: 'criar sala' }).click();
  await expect(a).toHaveURL(/#\/sala\/[A-Z0-9]{4}$/);
  await join(a, 'Ana', 0);
  await b.goto(a.url());
  await join(b, 'Bia', 1);

  await playRound(a, b, 'Bia', ['farol', 'iglu']);

  await a.goto('/#/ito/historico');
  // A gravação no D1 acontece logo depois da revelação: recarrega até aparecer. A partida mais recente é a primeira.
  await expect(async () => {
    await a.reload();
    await a.locator('.round-head').first().click();
    await expect(a.getByText('farol')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
});
```

> O histórico do ITO é um só, e as execuções anteriores do E2E (e de produção, no CI não) acumulam rodadas. Por isso o teste abre a **primeira** partida da lista, a mais recente, e procura a dica dela. Se outra execução gravar no meio, o `toPass` tenta de novo. Ajuste o seletor `.round-head` se a classe for diferente em `RoundItem.tsx`.

- [ ] **Step 2: Rodar**

Pare o `wrangler dev` local se ele estiver rodando com o banco antigo e rode `npm run dev:server` uma vez, que aplica a `0002` localmente. Ou deixe o Playwright subir o servidor.
Run: `npm run e2e`
Expected: 3 passed.

- [ ] **Step 3: Commit**

```bash
git add e2e/rodada.spec.ts
git commit -m "test(e2e): fluxo pela página do ITO e rodada no histórico do jogo"
```

---

### Task 9: conferir a migração com dados reais, docs e PR

- [ ] **Step 1: Migração local com dados do formato antigo**

O D1 local (`server/.wrangler/state`) ainda tem os grupos e rodadas dos testes manuais, a menos que a Task 8 já tenha migrado.
- Antes de migrar, conte: `npx.cmd wrangler d1 execute cartolina --local --command "SELECT COUNT(*) AS n FROM rounds"` (em `server/`).
- Rode `npm run db:migrate -w server`. Expected: "0002_rounds_by_game.sql ✅".
- Conte de novo: `SELECT game, COUNT(*) AS n FROM rounds GROUP BY game`. Expected: o mesmo total, todo em `ito`.
- Abra `http://localhost:5173/#/ito/historico` com os servidores locais e confira os números e as partidas antigas.

- [ ] **Step 2: Docs**

- `README.md`: troque a seção "Grupos e histórico" por "Jogos e histórico": início = estante, `#/<jogo>` com abas jogar e histórico, histórico aberto, um por jogo.
- `docs/deploy.md`, "Primeira noite": troque "crie o grupo e mande o link do grupo" por "mande o link do site; cada um entra no ITO → criar sala (ou pelo código)". O histórico fica em `#/ito/historico`.
- `docs/superpowers/specs/2026-10-15-cartolina-ito-design.md` §11: acrescente no topo da seção "**Substituída** por `2026-10-16-estante-de-jogos-design.md` (sem grupos; histórico por jogo)".

```bash
git add README.md docs
git commit -m "docs: sem grupos; histórico por jogo na estante"
```

- [ ] **Step 3: Ponto de restauração do banco de produção (antes do merge)**

O merge aplica a `0002` no D1 de produção, e ela apaga a tabela antiga. Antes do merge:
- Run (em `server/`): `npx.cmd wrangler d1 time-travel info cartolina`. Anote o **bookmark** que ele imprime.
- Se a migração der errado em produção, a volta é: `npx.cmd wrangler d1 time-travel restore cartolina --bookmark=<bookmark>`.

Isso precisa do login do wrangler neste PC. Se não houver, use o painel da Cloudflare: D1 → cartolina → Time Travel. Também dá pra pular o passo e confiar na transação da migração, mas avise o usuário.

- [ ] **Step 4: Revisão final, PR e merge (controlador + usuário)**

- Rode a revisão final do plano inteiro (subagente revisor), com foco na migração em produção:
  - a `0002` roda **antes** do Worker novo;
  - entre a migração e o deploy, o Worker antigo tenta gravar com `group_id`, falha e deixa a rodada na fila de nova tentativa;
  - o Worker novo regrava essa rodada como `ito`, via `pendingGame`.
- Push, PR e **merge só com o OK do usuário e fora de noite de jogo**.
- Acompanhe o workflow. Depois:
  - `Invoke-RestMethod https://cartolina-server.mrlimao36.workers.dev/history/ito` mostra a rodada de 2026-10-16 (1 → 71);
  - `https://rafa-mesquita.github.io/cartolina/#/g/d3jj53e9xj` cai no histórico do ITO com o aviso.
