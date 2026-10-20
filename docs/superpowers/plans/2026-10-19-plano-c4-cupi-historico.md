# Plano C4 — Cúpi: histórico de partidas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toda partida de Cúpi que termina (sem bot) fica gravada no D1, e a aba "histórico" do Cúpi (`#/coup/historico`) lista as partidas, da mais nova pra mais velha: quando, quem jogou, quem venceu (com as cartas) e a ordem em que os outros saíram.

**Architecture:** Igual ao Diquisti (`docs/superpowers/specs/2026-10-17-diquisti-historico-design.md`): uma função pura no `shared` (`pendingCoupRecord`) monta o registro quando a sala chega em `over`; o Durable Object guarda o pendente no mesmo `put` do estado e grava com `INSERT … ON CONFLICT DO NOTHING` numa tabela própria (`coup_matches`, migração `0004` que **só cria**). `GET /history/coup` devolve 20 partidas por página com cursor `nextBefore`; sem estatísticas por enquanto (`stats: null`). No site, `web/src/games/coup/history/` com o hook de carga e a lista na identidade "cartaz".

**Tech Stack:** TypeScript, Vitest, Cloudflare Workers + D1 (`@cloudflare/vitest-plugin`), React 19.

**Spec:** `docs/superpowers/specs/2026-10-19-cupi-design.md` §6 (histórico: só as partidas). O C1 deixou `recordsHistory: false` e casos `coup` provisórios em `shared/src/history.ts`, `server/src/index.ts` e `web/src/screens/GamePage.tsx`; este plano troca todos.

---

## Contexto para quem vai executar

- Worktree `C:\Users\rafam\Desktop\Rpositórios Github - claude\Pessoal\Jogos de tabuleiro\.claude\worktrees\cupi`, branch `feat/cupi`. Sem push, sem merge (merge = publicar; a migração roda sozinha em produção), nunca `git stash`. No Git Bash o `rtk` não existe.
- Modelo a seguir em tudo: o histórico do Diquisti — `shared/src/games/dixit/record.ts`, `shared/src/history.ts`, `server/migrations/0003_dixit_rounds.sql`, `server/src/dixit-history-db.ts`, `server/src/dixit-history-page.ts`, `server/src/room-do.ts` (`PendingRound`, `insertPending`), `server/test/migration-0003.test.ts`, `server/test/dixit-history-route.test.ts`, `web/src/games/dixit/history/useDixitHistory.ts` e `web/test/dixit-history*.test.tsx`.
- **Migração só cria** (tabela/índice). Nunca `DROP`/`ALTER`/`DELETE`/`UPDATE`/`INSERT` nela.
- **Partida com bot não grava** (`isBotName`, nomes começando com "Bot ").
- Código, comentários e testes em português. Commits terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Comandos: `npm test -w shared`, `npm test -w server`, `npm test -w web`, `npm run typecheck` (raiz), `npm run build -w web`.

## Mapa de arquivos

Criar:
- `shared/src/games/coup/record.ts` — `CoupPerson`, `CoupMatchRecord`, `coupMatchId`, `pendingCoupRecord`.
- `shared/test/coup-record.test.ts`.
- `server/migrations/0004_coup_matches.sql`, `server/src/coup-history-db.ts`, `server/src/coup-history-page.ts`.
- `server/test/migration-0004.test.ts`, `server/test/coup-history-route.test.ts`.
- `web/src/games/coup/names.ts` (nomes dos personagens em português, que a mesa do C2 também vai usar).
- `web/src/games/coup/history/useCoupHistory.ts`, `CoupHistory.tsx`, `coup-history.css`.
- `web/test/coup-history.test.tsx`.

Modificar:
- `shared/src/room.ts` (`coupStateOf`), `shared/src/history.ts`, `shared/src/games/registry.ts` (`recordsHistory: true`), `shared/src/index.ts`, `shared/test/room-games.test.ts`.
- `server/src/room-do.ts`, `server/src/index.ts`, `server/test/coup.test.ts`.
- `web/src/screens/GamePage.tsx`, `web/test/catalog.test.ts`.

---

### Task 1: o registro da partida no `shared`

**Files:**
- Create: `shared/src/games/coup/record.ts`, `shared/test/coup-record.test.ts`
- Modify: `shared/src/room.ts`, `shared/src/history.ts`, `shared/src/games/registry.ts`, `shared/src/index.ts`, `shared/test/room-games.test.ts`

- [ ] **Step 1: Escrever o teste que falha, `shared/test/coup-record.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { coupMatchId, pendingCoupRecord } from '../src/games/coup/record';
import type { CoupState } from '../src/games/coup/types';
import { pendingHistoryRecord } from '../src/history';
import { PLAYER_COLORS } from '../src/players';
import { createRoom, joinRoom, type Room } from '../src/room';
import { THREE, table, withLost } from './coup-helpers';

/** Sala de Cúpi com Ana, Beto e Caio (p0…p2), já com o jogo no estado dado. */
function roomWith(game: CoupState, names = ['Ana', 'Beto', 'Caio']): Room {
  let room = createRoom('CUPI', 0, 'coup');
  names.forEach((name, i) => {
    const res = joinRoom(room, { token: `t${i}`, name, color: PLAYER_COLORS[i]! }, `p${i}`, 0);
    if (!res.ok) throw new Error(res.error);
    room = res.room;
  });
  return { ...room, runStartedAt: 500, game };
}

/** Fim de partida: Caio saiu primeiro, depois Ana; Beto venceu com o Assassino. */
function over(): CoupState {
  let s = table(THREE);
  s = withLost(withLost(s, 'p2', 0), 'p2', 1);
  s = withLost(withLost(s, 'p0', 0), 'p0', 1);
  s = withLost(s, 'p1', 0);
  return { ...s, phase: 'over', turn: null, winner: 'p1', out: ['p2', 'p0'], match: 3 };
}

describe('Cúpi: registro da partida pro histórico', () => {
  it('partida terminada vira registro com quem jogou, ordem de saída, vencedor e as cartas dele', () => {
    const pending = pendingCoupRecord(roomWith(over()), 9000, 'r1');
    expect(pending).toEqual({
      key: 'CUPI-500-3',
      record: {
        id: 'r1',
        matchId: 'CUPI-500-3',
        roomCode: 'CUPI',
        playedAt: 9000,
        players: [
          { name: 'Ana', color: PLAYER_COLORS[0] },
          { name: 'Beto', color: PLAYER_COLORS[1] },
          { name: 'Caio', color: PLAYER_COLORS[2] },
        ],
        out: [
          { name: 'Caio', color: PLAYER_COLORS[2] },
          { name: 'Ana', color: PLAYER_COLORS[0] },
        ],
        winner: { name: 'Beto', color: PLAYER_COLORS[1] },
        winnerCards: ['assassin'],
      },
    });
  });

  it('a mesma partida não grava duas vezes', () => {
    const room = roomWith(over());
    expect(pendingCoupRecord({ ...room, recordedRevealKey: 'CUPI-500-3' }, 9000, 'r1')).toBeNull();
  });

  it('partida em andamento não grava', () => {
    expect(pendingCoupRecord(roomWith(table(THREE)), 9000, 'r1')).toBeNull();
  });

  it('partida com bot não grava', () => {
    expect(pendingCoupRecord(roomWith(over(), ['Ana', 'Bot Léo', 'Caio']), 9000, 'r1')).toBeNull();
  });

  it('o id muda a cada partida e a cada sessão', () => {
    const room = roomWith(over());
    expect(coupMatchId(room, over())).toBe('CUPI-500-3');
    expect(coupMatchId({ ...room, runStartedAt: 700 }, { ...over(), match: 4 })).toBe('CUPI-700-4');
  });

  it('o registro geral do histórico manda a partida pro Cúpi', () => {
    expect(pendingHistoryRecord(roomWith(over()), 9000, 'r1')).toMatchObject({ game: 'coup', key: 'CUPI-500-3' });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -w shared -- coup-record`
Expected: FAIL (`Cannot find module '../src/games/coup/record'`).

- [ ] **Step 3: `coupStateOf` em `shared/src/room.ts`**

Junto do import de `CoupView`, troque por `import type { CoupState, CoupView } from './games/coup/types';` e, depois de `dixitStateOf`, acrescente:

```ts
/** Estado do Cúpi, ou null se a sala é de outro jogo. */
export function coupStateOf(room: Room): CoupState | null {
  return room.gameId === 'coup' ? (room.game as CoupState) : null;
}
```

- [ ] **Step 4: Criar `shared/src/games/coup/record.ts`**

```ts
import { isBotName, type PlayerColor } from '../../players';
import { coupStateOf, type Room } from '../../room';
import { hiddenOf } from './table';
import type { CoupCharacter, CoupState } from './types';

/** Pessoa como estava na hora da partida (trocar de nome depois não mexe no passado). */
export interface CoupPerson {
  name: string;
  color: PlayerColor;
}

/** Uma partida terminada do Cúpi, como fica gravada no histórico. */
export interface CoupMatchRecord {
  id: string;
  /** `${sala}-${início da sessão}-${partida}`: muda a cada "começar" e "jogar de novo". */
  matchId: string;
  roomCode: string;
  /** Quando a partida acabou. */
  playedAt: number;
  /** Quem jogou, na ordem dos assentos. */
  players: CoupPerson[];
  /** Na ordem em que saíram. */
  out: CoupPerson[];
  winner: CoupPerson;
  /** As cartas com que o vencedor terminou (as viradas pra baixo). */
  winnerCards: CoupCharacter[];
}

/** Id da partida: muda a cada partida (`match`) e a cada sessão que sai do lobby (`runStartedAt`). */
export function coupMatchId(room: Room, state: CoupState): string {
  return `${room.code}-${room.runStartedAt ?? 0}-${state.match}`;
}

/**
 * Registro a gravar se a sala do Cúpi terminou uma partida ainda não gravada (a chave é o id da partida).
 * Não olha `GAMES.coup.recordsHistory`: esse portão fica em `pendingHistoryRecord`.
 */
export function pendingCoupRecord(room: Room, now: number, id: string): { key: string; record: CoupMatchRecord } | null {
  const state = coupStateOf(room);
  if (!state || state.phase !== 'over' || state.winner === null) return null;
  const key = coupMatchId(room, state);
  if (key === room.recordedRevealKey) return null;
  const person = (playerId: string): CoupPerson | null => {
    const seat = room.seats.find((s) => s.id === playerId);
    return seat ? { name: seat.name, color: seat.color } : null;
  };
  const people = (ids: readonly string[]) => ids.flatMap((p) => {
    const x = person(p);
    return x ? [x] : [];
  });
  const winner = person(state.winner);
  // Defesa: quem jogou sempre tem assento (assentos de quem jogou não são reaproveitados); hoje não acontece.
  if (!winner) return null;
  const players = people(state.players);
  // Partida de teste com bot não suja o histórico (aberto a todos).
  if (players.some((p) => isBotName(p.name))) return null;
  return {
    key,
    record: {
      id,
      matchId: key,
      roomCode: room.code,
      playedAt: now,
      players,
      out: people(state.out),
      winner,
      winnerCards: hiddenOf(state, state.winner),
    },
  };
}
```

- [ ] **Step 5: `shared/src/history.ts`**

Import novo, junto do do Diquisti:

```ts
import { pendingCoupRecord, type CoupMatchRecord } from './games/coup/record';
```

Depois de `DixitHistoryResponse`, acrescente:

```ts
/** Resposta de `GET /history/coup`: 20 partidas por página, da mais nova pra mais velha (sem estatísticas por enquanto). */
export interface CoupHistoryResponse {
  game: 'coup';
  matches: CoupMatchRecord[];
  stats: null;
  /** Fim da última partida da página (exclusivo na próxima), ou null se acabou. */
  nextBefore: number | null;
}
```

Em `HistoryResponses`, troque `coup: never;` (e o comentário dele) por `coup: CoupHistoryResponse;`.

Em `PendingHistoryRecord`, acrescente a variante `| { game: 'coup'; key: string; record: CoupMatchRecord }`.

Em `pendingHistoryRecord`, troque o `case 'coup': return null; …` por:

```ts
    case 'coup': {
      const pending = pendingCoupRecord(room, now, id);
      return pending ? { game: 'coup', ...pending } : null;
    }
```

- [ ] **Step 6: Registro e exports**

Em `shared/src/games/registry.ts`, na entrada `coup`: `recordsHistory: true` e troque o comentário por `// Cada partida terminada vai pro histórico (sem bots).`

Em `shared/src/index.ts`, depois de `export * from './games/coup/types';`, acrescente `export * from './games/coup/record';`.

Em `shared/test/room-games.test.ts`, no teste `conhece ITO, Dixit, Retratim e Cúpi`, troque o `recordsHistory: false` do `coup` por `true`.

- [ ] **Step 7: Rodar e ver passar**

Run: `npm test -w shared && npm run typecheck -w shared`
Expected: PASS. (O typecheck do `server` e do `web` pode acusar o tipo novo de `HistoryResponses.coup` e de `PendingRound`; as Tasks 2 e 3 resolvem.)

- [ ] **Step 8: Commit**

```bash
git add shared/src/games/coup/record.ts shared/test/coup-record.test.ts shared/src/room.ts shared/src/history.ts shared/src/games/registry.ts shared/src/index.ts shared/test/room-games.test.ts
git commit -m "feat(shared): Cúpi — registro da partida pro histórico

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: tabela, gravação e rota no servidor

**Files:**
- Create: `server/migrations/0004_coup_matches.sql`, `server/src/coup-history-db.ts`, `server/src/coup-history-page.ts`, `server/test/migration-0004.test.ts`, `server/test/coup-history-route.test.ts`
- Modify: `server/src/room-do.ts`, `server/src/index.ts`, `server/test/coup.test.ts`

- [ ] **Step 1: Migração `server/migrations/0004_coup_matches.sql`**

```sql
-- Histórico do Cúpi: tabela própria; as dos outros jogos não mudam.
-- Só cria coisas, então é segura para aplicar sozinha na publicação.
CREATE TABLE IF NOT EXISTS coup_matches (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  room_code TEXT NOT NULL,
  played_at INTEGER NOT NULL,
  -- o CoupMatchRecord inteiro; as colunas acima servem para filtrar e ordenar.
  record_json TEXT NOT NULL,
  -- a mesma partida gravada de novo vira no-op.
  UNIQUE (room_code, match_id)
);

CREATE INDEX IF NOT EXISTS coup_matches_played ON coup_matches (played_at DESC);
```

- [ ] **Step 2: Teste da migração, `server/test/migration-0004.test.ts`** (no molde do `migration-0003.test.ts`)

Casos:
1. "só cria coisas e nunca toca nas tabelas dos outros jogos": `env.TEST_MIGRATIONS[3]` tem nome `0004…`; o SQL sem comentários tem `CREATE TABLE IF NOT EXISTS coup_matches` e não tem `DROP|ALTER|DELETE|UPDATE|INSERT`, nem `\brounds\b`, nem `dixit_rounds`.
2. "cria coup_matches com as colunas e o índice": colunas `['id','match_id','room_code','played_at','record_json']` e o índice `coup_matches_played`.
3. "a mesma partida na mesma sala só entra uma vez": dois `INSERT … ON CONFLICT (room_code, match_id) DO NOTHING` com ids diferentes e a mesma sala/partida → 1 linha.
4. "as tabelas do DITU e do Diquisti continuam iguais": colunas de `rounds` e de `dixit_rounds` como no `migration-0003.test.ts`.

- [ ] **Step 3: `server/src/coup-history-db.ts`**

```ts
import type { CoupMatchRecord } from '@cartolina/shared';

/** Idempotente por (sala, partida): gravar a mesma partida de novo não duplica. */
export async function insertCoupMatch(db: D1Database, r: CoupMatchRecord): Promise<void> {
  await db
    .prepare(
      `INSERT INTO coup_matches (id, match_id, room_code, played_at, record_json)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (room_code, match_id) DO NOTHING`,
    )
    .bind(r.id, r.matchId, r.roomCode, r.playedAt, JSON.stringify(r))
    .run();
}

/** Partidas mais recentes primeiro (pelo fim); `before` pagina por esse fim (exclusivo). */
export async function listCoupMatches(db: D1Database, before: number | null, limit: number): Promise<CoupMatchRecord[]> {
  const order = 'ORDER BY played_at DESC, id DESC LIMIT ?';
  const stmt =
    before === null
      ? db.prepare(`SELECT record_json FROM coup_matches ${order}`).bind(limit)
      : db.prepare(`SELECT record_json FROM coup_matches WHERE played_at < ? ${order}`).bind(before, limit);
  const { results } = await stmt.all<{ record_json: string }>();
  return results.map((r) => JSON.parse(r.record_json) as CoupMatchRecord);
}
```

- [ ] **Step 4: `server/src/coup-history-page.ts`**

```ts
import type { CoupHistoryResponse } from '@cartolina/shared';
import { listCoupMatches } from './coup-history-db';
import { HISTORY_PAGE_SIZE } from './history-db';

/** Uma página do histórico do Cúpi: 20 partidas, da mais nova pra mais velha. */
export async function coupHistoryPage(db: D1Database, before: number | null): Promise<CoupHistoryResponse> {
  // Uma a mais que a página só para saber se existe próxima.
  const rows = await listCoupMatches(db, before, HISTORY_PAGE_SIZE + 1);
  const matches = rows.slice(0, HISTORY_PAGE_SIZE);
  return {
    game: 'coup',
    matches,
    stats: null,
    nextBefore: rows.length > HISTORY_PAGE_SIZE ? matches[matches.length - 1]!.playedAt : null,
  };
}
```

- [ ] **Step 5: `server/src/room-do.ts`**

Import `insertCoupMatch` de `./coup-history-db` e `type CoupMatchRecord` de `@cartolina/shared`. Em `PendingRound`, acrescente a variante `| { game: 'coup'; key: string; record: CoupMatchRecord }`. Em `insertPending`:

```ts
  if (round.game === 'dixit') await insertDixitRound(db, round.record, round.key);
  else if (round.game === 'coup') await insertCoupMatch(db, round.record);
  else await insertRound(db, 'ito', round.record, round.key);
```

- [ ] **Step 6: `server/src/index.ts`**

Import `coupHistoryPage` de `./coup-history-page` e troque o `case 'coup': throw …` de `historyPageOf` por `case 'coup': return coupHistoryPage(env.DB, before);`.

- [ ] **Step 7: Teste de ponta a ponta no servidor, `server/test/coup-history-route.test.ts`**

No molde de `dixit-history-route.test.ts` (leia `server/test/helpers.ts` pra `joined`, `newGameRoom`, `client.state`, `client.next`):
1. "o registro diz que o Cúpi grava histórico": `GAMES.coup.recordsHistory === true`.
2. "partida terminada grava uma vez só e aparece em GET /history/coup":
   - sala de Cúpi com 2 jogadores (`joined(code, 2)`; os nomes não começam com "Bot "), `start`;
   - laço até `phase === 'over'` (no máximo ~200 passos): a cada estado novo, o jogador cuja visão tem algo a fazer age — `can.lose` → `{type:'lose', card: myCards[0]}`; `can.act` contém `coup` → `{type:'act', kind:'coup', target: can.targets[0]}`; senão `{type:'act', kind:'income'}`. Com 2 jogadores, renda e golpe não abrem janela, então não há reação;
   - espera a linha aparecer no D1 (como `waitForRows` do Diquisti) e confere 1 linha com `match_id` `^${code}-\d+-1$`;
   - `GET /history/coup` responde 200, `game: 'coup'`, e entre as `matches` está a da sala, com 2 `players`, 1 em `out` e o `winner` sendo quem não saiu;
   - um commit a mais (alguém fecha o socket) não grava de novo (continua 1 linha).
3. "paginação": insere 21 partidas direto com `insertCoupMatch` (sala própria, `playedAt` crescente) e confere que a primeira página tem 20 e `nextBefore` = `playedAt` da 20ª, e a segunda (`?before=`) traz as restantes daquela sala.

- [ ] **Step 8: `server/test/coup.test.ts`**

Troque o teste "o histórico do Cúpi ainda não existe (vem no Plano C4)" por "o histórico do Cúpi responde", conferindo `status 200` e `game: 'coup'` no corpo.

- [ ] **Step 9: Rodar**

Run: `npm test -w server && npm run typecheck -w server && npm run typecheck -w shared`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add server/migrations/0004_coup_matches.sql server/src/coup-history-db.ts server/src/coup-history-page.ts server/src/room-do.ts server/src/index.ts server/test/migration-0004.test.ts server/test/coup-history-route.test.ts server/test/coup.test.ts
git commit -m "feat(server): histórico do Cúpi no D1 e em GET /history/coup

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: a aba "histórico" do Cúpi no site

**Files:**
- Create: `web/src/games/coup/names.ts`, `web/src/games/coup/history/useCoupHistory.ts`, `web/src/games/coup/history/CoupHistory.tsx`, `web/src/games/coup/history/coup-history.css`, `web/test/coup-history.test.tsx`
- Modify: `web/src/screens/GamePage.tsx`, `web/test/catalog.test.ts`

- [ ] **Step 1: `web/src/games/coup/names.ts`**

```ts
import type { CoupCharacter } from '@cartolina/shared';

/** Nomes dos personagens na tela (ids internos em inglês). */
export const CHARACTER_NAMES: Record<CoupCharacter, string> = {
  duke: 'Duque',
  assassin: 'Assassino',
  captain: 'Capitão',
  ambassador: 'Embaixador',
  contessa: 'Condessa',
};
```

- [ ] **Step 2: Testes que falham, `web/test/coup-history.test.tsx`**

No molde de `web/test/dixit-history.test.tsx` (mock de `getHistory` em `../src/net/api`), com um fixture de 2 partidas (`CoupMatchRecord`, cores de `PLAYER_COLORS`):
1. carregando → mostra "carregando…";
2. com partidas: cada uma mostra a data, "Beto tomou o poder", as cartas do vencedor em português ("Assassino"), quem jogou (os nomes, com o personagem/bichinho `Critter` de cada cor) e "saíram: Caio → Ana";
3. sem partidas: "Nenhuma partida de Cúpi ainda." e um convite curto ("Joguem uma e ela aparece aqui.");
4. "ver mais" aparece quando `nextBefore` não é null, chama `getHistory('coup', nextBefore)` e junta as partidas (sem repetir `id`);
5. falha de rede → mensagem de erro com "tentar de novo"; 429 → a mensagem `TOO_MANY_MESSAGE`.

Run: `npm test -w web -- coup-history` → FAIL (componente não existe).

- [ ] **Step 3: `useCoupHistory.ts`**

Cópia adaptada de `web/src/games/dixit/history/useDixitHistory.ts`: mesma estrutura (`data`, `loadFailed`, `loadingMore`, `moreError`, `reload`, `loadMore`, geração que invalida respostas velhas, trava síncrona do "ver mais"), com `getHistory('coup', …)`, juntando `matches` sem repetir `id`, e sem estatísticas (`stats` é sempre `null`).

- [ ] **Step 4: `CoupHistory.tsx` + `coup-history.css`**

- Lista `<ol className="cph-list">` de partidas; cada `<li className="cph-match">` é um cartão de papel creme (`#f7f0e0`), contorno preto 2 px, cantos 4 px, com:
  - linha de cima: a data (`Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })`) e "N jogadores";
  - título em Bebas Neue 26 px: "<Critter/> **Beto** tomou o poder", com as cartas do vencedor como selinhos vermelhos ("Assassino");
  - "jogaram:" com o `Critter` e o nome de cada um;
  - "saíram: Caio → Ana" (em ordem; texto pequeno `#6b6152`).
- Estados: carregando, erro (com "tentar de novo" → `reload`), vazio, e o botão "ver mais" (com "carregando…" e `moreError`).
- Fundo da aba no tom da identidade (creme `#efe6d2`, faixa vermelha fina no alto), fontes `Bebas Neue`/`Oswald` (já carregadas no `index.html`).
- Acessível: `aria-label` em cada partida com a frase inteira ("19 out 21:30 · Beto tomou o poder com Assassino · jogaram Ana, Beto e Caio · saíram Caio e Ana").

- [ ] **Step 5: `GamePage.tsx` e catálogo**

Em `HistoryTab`, troque o `case 'coup'` provisório por `return <CoupHistory />;` (import do componente). Em `web/test/catalog.test.ts`, no teste do Cúpi, troque `expect(entry?.hasHistory).toBe(false)` por `toBe(true)`.

- [ ] **Step 6: Rodar**

Run: `npm test -w web && npm run typecheck && npm run build -w web`
Expected: PASS, typecheck limpo, build ok.

- [ ] **Step 7: Conferir no navegador**

Com um servidor local (`npx wrangler dev --port 8798 --inspector-port 9238` em `server/`) e o site numa porta livre apontando pra ele (`VITE_SERVER_URL`), abra `#/coup/historico`: vazio mostra o convite; depois de gravar uma partida (pode ser inserindo direto no D1 local com `npx wrangler d1 execute cartolina --local --command "…"` usando um `record_json` válido), ela aparece. Desligue tudo no fim. (O controlador pode fazer este passo.)

- [ ] **Step 8: Commit**

```bash
git add web/src/games/coup web/src/screens/GamePage.tsx web/test/coup-history.test.tsx web/test/catalog.test.ts
git commit -m "feat(web): aba de histórico do Cúpi

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: conferência final

- [ ] `npm test` (raiz), `npm run typecheck`, `npm run build -w web`, `npm run e2e`: tudo verde.
- [ ] README: na seção "Jogos e histórico", uma linha dizendo que o Cúpi (`coup`) grava cada partida terminada na tabela `coup_matches` (migração `0004`) e que a aba mostra as partidas.
- [ ] Commit `docs: histórico do Cúpi no README`. Sem merge.
