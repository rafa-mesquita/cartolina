# cartolina~ — Plano 3: histórico permanente do grupo (D1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grupos permanentes com link secreto (`#/g/<slug>`) cuja página mostra todas as partidas jogadas em salas do grupo (fila revelada com dicas) e estatísticas da galera, com as rodadas gravadas automaticamente num banco Cloudflare D1 a cada revelação.

**Architecture:** A lógica é pura no `shared/` (`history.ts`: montar o registro de uma rodada a partir do `Room`, chave anti-duplicata, estatísticas). O `server/` ganha o binding D1 `DB` com uma migração (`groups`, `rounds`), um módulo de acesso a dados (`history-db.ts`), três rotas (`POST /groups`, `GET /groups/:slug`, `POST /groups/:slug/rooms`) e, no `RoomDO`, a gravação da rodada dentro do `commit()` quando a sala é de um grupo e entra em `reveal`. O `web/` ganha a rota `#/g/<slug>` (página do grupo), a criação de grupo no início, a lista de grupos lembrados e links da sala para o histórico.

**Tech Stack:** Cloudflare D1 (SQLite), `@cloudflare/vitest-plugin` (`readD1Migrations` + `applyD1Migrations`), Wrangler 4, React 19, TypeScript 5.9, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-10-15-cartolina-ito-design.md` §11 · **Notas:** `docs/superpowers/plans/notas-para-planos-3-e-4.md`

**Branch:** `feat/plano-3-historico` (a partir de `feat/plano-2-web`).

**Decisões deste plano:**
- `groups.id` é UUID interno; o `slug` (10 caracteres `[a-z0-9]`, sem ambíguos) é o segredo que vai no link. Quem tem o link vê o histórico (sem login).
- A sala de um grupo guarda `group: { id, slug, name }` no `Room`. O `RoomView` expõe só `{ slug, name }` (quem está na sala é do grupo).
- Gravação: no `commit()` do DO, se `pendingRecord(room)` devolve algo (sala de grupo, fase `reveal`, chave de revelação ainda não gravada), insere no D1 e marca `recordedRevealKey`. Falha no D1 é logada e não bloqueia o jogo (tenta de novo no próximo commit).
- Rodada pulada (`next` durante a ordenação) nunca chega em `reveal`, então não é gravada — de propósito.
- `campaignId` = `${roomCode}-${runStartedAt}`, onde `runStartedAt` é o instante em que o host clicou "começar" (lobby → tema). Todas as rodadas daquela campanha compartilham o id; a última traz `won`/`lost`.
- Estatísticas por **nome** do jogador (tokens não são estáveis entre dispositivos) e cor (para desenhar o personagem). Calculadas no servidor sobre até 5000 rodadas a cada `GET` (pequeno para um grupo de amigos).
- Paginação: 20 rodadas por página, mais recentes primeiro, cursor `before=<playedAt>`.
- O `database_id` no `wrangler.jsonc` é um placeholder para desenvolvimento local; o Plano 4 cria o banco real e troca o id.

---

## Mapa de arquivos

```
shared/src/room.ts                  + RoomGroup, Room.group/runStartedAt/recordedRevealKey, RoomView.group
shared/src/history.ts               cleanGroupName, RoundRecord, revealKey, pendingRecord, summarizeHistory, GroupResponse
shared/src/index.ts                 + export * from './history'
shared/test/history.test.ts
server/migrations/0001_init.sql     tabelas groups e rounds
server/wrangler.jsonc               + d1_databases (DB)
server/vitest.config.ts             migrações aplicadas nos testes
server/test/apply-migrations.ts     setup dos testes
server/test/env.d.ts                + TEST_MIGRATIONS
server/package.json                 + script db:migrate
server/src/codes.ts                 + randomSlug, SLUG_RE
server/src/history-db.ts            createGroup, findGroup, insertRound, listRounds, allRounds
server/src/index.ts                 rotas /groups
server/src/room-do.ts               /init com grupo; gravação no commit()
server/test/history-db.test.ts
server/test/groups.test.ts
server/test/helpers.ts              + newGroupRoom, playRound
web/src/net/api.ts                  + createGroup, getGroup, createGroupRoom
web/src/lib/router.ts               + rota group, goToGroup, groupLink
web/src/net/identity.ts             + loadGroups, rememberGroup
web/src/screens/Home.tsx            seção "grupos"
web/src/screens/GroupPage.tsx       página do grupo
web/src/screens/group.css
web/src/App.tsx                     + rota group
web/src/screens/Lobby.tsx           link "histórico do grupo"
web/src/table/TopBar.tsx            pílula com o nome do grupo
web/test/groups-ui.test.tsx
README.md, package.json (raiz), .claude/launch.json
```

---

### Task 1: `Room` sabe de qual grupo é e quando a partida começou

**Files:**
- Modify: `shared/src/room.ts`
- Test: `shared/test/room.test.ts`

- [ ] **Step 1: Testes que falham** — acrescente ao fim de `shared/test/room.test.ts` (adicione `roomView` e `createRoom` ao import se faltarem):

```ts
describe('grupo e início da partida', () => {
  const group = { id: 'g-1', slug: 'abcdefghjk', name: 'Galera' };

  it('sala avulsa não tem grupo; sala de grupo expõe só slug e nome na visão', () => {
    expect(createRoom('ABCD', T0).group).toBeNull();
    const joined = joinRoom(createRoom('ABCD', T0, group), { token: 't0', name: 'Ana', color: PLAYER_COLORS[0] }, 'p0', T0);
    if (!joined.ok) throw new Error(joined.error);
    const room = joined.room;
    expect(roomView(room, 'p0').group).toEqual({ slug: 'abcdefghjk', name: 'Galera' });
    expect(JSON.stringify(roomView(room, 'p0'))).not.toContain('g-1');
  });

  it('marca runStartedAt quando o host começa (lobby → tema) e mantém nas rodadas seguintes', () => {
    let room = roomWith(2);
    expect(room.runStartedAt).toBeNull();
    const started = roomAction(room, 'id-tok0', { type: 'start' }, rng, T0 + 50);
    if (!started.ok) throw new Error(started.error);
    room = started.room;
    expect(room.runStartedAt).toBe(T0 + 50);
    const dealt = roomAction(room, 'id-tok0', { type: 'beginRound' }, rng, T0 + 90);
    if (!dealt.ok) throw new Error(dealt.error);
    expect(dealt.room.runStartedAt).toBe(T0 + 50);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -w shared -- room` → FAIL (`group`/`runStartedAt` inexistentes).

- [ ] **Step 3: Implementar em `shared/src/room.ts`**

Acrescente antes de `export interface Room`:
```ts
export interface RoomGroup {
  id: string;
  slug: string;
  name: string;
}
```
No `interface Room`, acrescente os campos:
```ts
  /** Grupo dono da sala (histórico). `null` em salas avulsas. */
  group: RoomGroup | null;
  /** Quando o host clicou "começar" (lobby → tema); identifica a campanha. */
  runStartedAt: number | null;
  /** Chave da última revelação já gravada no histórico (evita duplicar). */
  recordedRevealKey: string | null;
```
No `interface RoomView`, acrescente:
```ts
  group: { slug: string; name: string } | null;
```
Troque `createRoom` por:
```ts
export function createRoom(code: string, now: number, group: RoomGroup | null = null): Room {
  return {
    code,
    hostId: null,
    seats: [],
    tokens: {},
    game: ito.initialState(),
    lastActivity: now,
    group,
    runStartedAt: null,
    recordedRevealKey: null,
  };
}
```
No fim de `roomAction`, troque o `return { ok: true, room: … }` por:
```ts
  const startedRun = room.game.phase === 'lobby' && res.state.phase === 'theme';
  return {
    ok: true,
    room: { ...room, game: res.state, lastActivity: now, runStartedAt: startedRun ? now : (room.runStartedAt ?? null) },
  };
```
Em `roomView`, acrescente ao objeto retornado:
```ts
    group: room.group ? { slug: room.group.slug, name: room.group.name } : null,
```
(Salas salvas antes deste plano não têm esses campos; `room.group ? … : null` e `?? null` tratam `undefined`.)

- [ ] **Step 4: Rodar** — `npm test -w shared`, `npm test -w server`, `npm test -w web`, `npm run typecheck` → PASS. Se algum teste existente comparar um `Room`/`RoomView` inteiro com `toEqual`, acrescente os campos novos (`group: null`, `runStartedAt: null`, `recordedRevealKey: null`) na expectativa.

- [ ] **Step 5: Commit**

```bash
git add shared server web
git commit -m "feat(shared): sala sabe do grupo e do início da partida

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Histórico puro — registro da rodada, anti-duplicata e estatísticas

**Files:**
- Create: `shared/src/history.ts`, `shared/test/history.test.ts`
- Modify: `shared/src/index.ts`

- [ ] **Step 1: Testes** — `shared/test/history.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  PLAYER_COLORS,
  cleanGroupName,
  createRoom,
  joinRoom,
  mulberry32,
  pendingRecord,
  revealKey,
  roomAction,
  summarizeHistory,
  type ItoAction,
  type Room,
  type RoundRecord,
} from '../src/index';

const GROUP = { id: 'g-1', slug: 'abcdefghjk', name: 'Galera' };

function play(room: Room, id: string, action: ItoAction, now = 100): Room {
  const res = roomAction(room, id, action, mulberry32(7), now);
  if (!res.ok) throw new Error(res.error);
  return res.room;
}

function revealedRoom(mode: 'livre' | 'campanha' = 'livre', group: typeof GROUP | null = GROUP): Room {
  let room = createRoom('ABCD', 0, group);
  for (const [i, name] of ['Ana', 'Bia'].entries()) {
    const res = joinRoom(room, { token: `t${i}`, name, color: PLAYER_COLORS[i]! }, `p${i}`, 0);
    if (!res.ok) throw new Error(res.error);
    room = res.room;
  }
  room = play(room, 'p0', { type: 'setMode', mode });
  room = play(room, 'p0', { type: 'start' }, 50);
  room = play(room, 'p0', { type: 'beginRound' });
  room = play(room, 'p0', { type: 'clue', cardId: 'p0:0', text: '  Paris ' });
  room = play(room, 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
  room = play(room, 'p1', { type: 'place', cardId: 'p1:0', index: 1 });
  return play(room, 'p0', { type: 'forceReveal' });
}

describe('cleanGroupName', () => {
  it('limpa espaços e limita a 40 caracteres', () => {
    expect(cleanGroupName('  Galera   da call ')).toBe('Galera da call');
    expect(cleanGroupName('   ')).toBeNull();
    expect(cleanGroupName('x'.repeat(41))).toBeNull();
    expect(cleanGroupName('😀'.repeat(40))).toBe('😀'.repeat(40));
  });
});

describe('pendingRecord', () => {
  it('monta o registro da rodada revelada de uma sala de grupo', () => {
    const room = revealedRoom();
    const pending = pendingRecord(room, 1234, 'r-1');
    expect(pending).not.toBeNull();
    const r = pending!.record;
    expect(r).toMatchObject({ id: 'r-1', roomCode: 'ABCD', playedAt: 1234, mode: 'livre', level: 1, campaignId: null });
    expect(['round_won', 'round_lost']).toContain(r.outcome);
    expect(r.theme.titulo).toBeTruthy();
    expect(r.players).toEqual([
      { name: 'Ana', color: PLAYER_COLORS[0] },
      { name: 'Bia', color: PLAYER_COLORS[1] },
    ]);
    expect(r.cards.map((c) => c.name)).toEqual(['Ana', 'Bia']);
    expect(r.cards[0]!.clue).toBe('Paris');
    expect(r.errors).toBe(r.cards.filter((c) => c.error).length);
    expect(pending!.key).toBe(revealKey(room.game));
  });

  it('não grava de novo a mesma revelação', () => {
    const room = revealedRoom();
    const key = pendingRecord(room, 1, 'r')!.key;
    expect(pendingRecord({ ...room, recordedRevealKey: key }, 2, 'r2')).toBeNull();
  });

  it('sala avulsa ou fora da revelação não grava', () => {
    expect(pendingRecord(revealedRoom('livre', null), 1, 'r')).toBeNull();
    expect(pendingRecord(createRoom('ABCD', 0, GROUP), 1, 'r')).toBeNull();
  });

  it('campanha usa o início da partida como id da campanha', () => {
    const r = pendingRecord(revealedRoom('campanha'), 1, 'r')!.record;
    expect(r.campaignId).toBe('ABCD-50');
  });
});

function rec(over: Partial<RoundRecord>): RoundRecord {
  return {
    id: Math.random().toString(36),
    roomCode: 'ABCD',
    playedAt: 0,
    mode: 'livre',
    level: 1,
    outcome: 'round_won',
    errors: 0,
    campaignId: null,
    theme: { titulo: 'Comidas', min: 'odeio', max: 'amo' },
    players: [],
    cards: [],
    ...over,
  };
}

const card = (name: string, error = false) => ({ name, color: PLAYER_COLORS[0], value: 10, clue: 'x', error });

describe('summarizeHistory', () => {
  it('sem rodadas tudo zera', () => {
    expect(summarizeHistory([])).toEqual({
      rounds: 0,
      livreRounds: 0,
      livreWins: 0,
      campaigns: 0,
      campaignsWon: 0,
      bestStreak: 0,
      sharpest: null,
      topThemes: [],
    });
  });

  it('conta vitórias no livre, campanhas e a maior sequência sem erro em ordem cronológica', () => {
    const s = summarizeHistory([
      rec({ playedAt: 3, errors: 1, outcome: 'round_lost' }),
      rec({ playedAt: 1 }),
      rec({ playedAt: 2 }),
      rec({ playedAt: 4 }),
      rec({ playedAt: 5, mode: 'campanha', outcome: 'won' }),
      rec({ playedAt: 6, mode: 'campanha', outcome: 'lost', errors: 2 }),
    ]);
    expect(s.rounds).toBe(6);
    expect(s.livreRounds).toBe(4);
    expect(s.livreWins).toBe(3);
    expect(s.campaigns).toBe(2);
    expect(s.campaignsWon).toBe(1);
    expect(s.bestStreak).toBe(2);
  });

  it('mais certeiro precisa de pelo menos 3 cartas', () => {
    const s = summarizeHistory([
      rec({ cards: [card('Ana'), card('Ana'), card('Ana', true), card('Bia'), card('Bia')] }),
      rec({ cards: [card('Ana'), card('Caio'), card('Caio'), card('Caio')] }),
    ]);
    expect(s.sharpest).toMatchObject({ name: 'Caio', cards: 3, correct: 3, accuracy: 1 });
  });

  it('temas mais jogados (top 5, empate em ordem alfabética)', () => {
    const t = (titulo: string) => rec({ theme: { titulo, min: 'a', max: 'b' } });
    const s = summarizeHistory([t('B'), t('A'), t('B'), t('C'), t('D'), t('E'), t('F')]);
    expect(s.topThemes).toEqual([
      { titulo: 'B', count: 2 },
      { titulo: 'A', count: 1 },
      { titulo: 'C', count: 1 },
      { titulo: 'D', count: 1 },
      { titulo: 'E', count: 1 },
    ]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -w shared -- history` → FAIL.

- [ ] **Step 3: `shared/src/history.ts`**

```ts
import type { ItoMode, ItoOutcome, ItoState, Theme } from './games/ito/types';
import type { PlayerColor } from './players';
import type { Room } from './room';

export const GROUP_NAME_MAX = 40;
export const SHARPEST_MIN_CARDS = 3;

export function cleanGroupName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, ' ');
  const length = Array.from(name).length;
  return length >= 1 && length <= GROUP_NAME_MAX ? name : null;
}

export interface RoundPlayer {
  name: string;
  color: PlayerColor;
}

export interface RoundCard {
  name: string;
  color: PlayerColor;
  value: number;
  clue: string;
  error: boolean;
}

/** Uma rodada revelada, como fica gravada no histórico do grupo. */
export interface RoundRecord {
  id: string;
  roomCode: string;
  playedAt: number;
  mode: ItoMode;
  level: number;
  outcome: ItoOutcome;
  errors: number;
  campaignId: string | null;
  theme: Theme;
  players: RoundPlayer[];
  /** Na ordem da fila revelada. */
  cards: RoundCard[];
}

export interface PlayerStat {
  name: string;
  color: PlayerColor;
  cards: number;
  correct: number;
  accuracy: number;
}

export interface HistoryStats {
  rounds: number;
  livreRounds: number;
  livreWins: number;
  campaigns: number;
  campaignsWon: number;
  /** Maior sequência de rodadas seguidas sem nenhum erro. */
  bestStreak: number;
  /** Quem mais acerta a posição (mín. 3 cartas). */
  sharpest: PlayerStat | null;
  topThemes: { titulo: string; count: number }[];
}

export interface GroupInfo {
  slug: string;
  name: string;
  createdAt: number;
}

/** Resposta de `GET /groups/:slug`. */
export interface GroupResponse {
  group: GroupInfo;
  rounds: RoundRecord[];
  stats: HistoryStats;
  nextBefore: number | null;
}

/** Identifica uma revelação (ids das cartas se repetem entre rodadas, então entra o valor). */
export function revealKey(game: ItoState): string | null {
  if (game.phase !== 'reveal' || !game.reveal) return null;
  return game.reveal.map((e) => `${e.cardId}=${e.value}`).join('|');
}

/** Registro a gravar se a sala é de um grupo e está numa revelação ainda não gravada. */
export function pendingRecord(room: Room, now: number, id: string): { key: string; record: RoundRecord } | null {
  if (!room.group) return null;
  const game = room.game;
  const key = revealKey(game);
  if (!key || key === room.recordedRevealKey || !game.outcome || !game.theme || !game.reveal) return null;
  const seatOf = (playerId: string) => room.seats.find((s) => s.id === playerId);
  const players = game.players.flatMap((playerId) => {
    const seat = seatOf(playerId);
    return seat ? [{ name: seat.name, color: seat.color }] : [];
  });
  const cards = game.reveal.flatMap((entry) => {
    const seat = seatOf(entry.owner);
    if (!seat) return [];
    const clue = game.cards[entry.cardId]?.clue.trim() ?? '';
    return [{ name: seat.name, color: seat.color, value: entry.value, clue, error: entry.error }];
  });
  return {
    key,
    record: {
      id,
      roomCode: room.code,
      playedAt: now,
      mode: game.mode,
      level: game.level,
      outcome: game.outcome,
      errors: game.reveal.filter((e) => e.error).length,
      campaignId: game.mode === 'campanha' ? `${room.code}-${room.runStartedAt ?? 0}` : null,
      theme: game.theme,
      players,
      cards,
    },
  };
}

export function summarizeHistory(rounds: readonly RoundRecord[]): HistoryStats {
  const ordered = [...rounds].sort((a, b) => a.playedAt - b.playedAt);
  let streak = 0;
  let bestStreak = 0;
  let livreRounds = 0;
  let livreWins = 0;
  let campaigns = 0;
  let campaignsWon = 0;
  const players = new Map<string, PlayerStat>();
  const themes = new Map<string, number>();
  for (const r of ordered) {
    streak = r.errors === 0 ? streak + 1 : 0;
    bestStreak = Math.max(bestStreak, streak);
    if (r.mode === 'livre') {
      livreRounds++;
      if (r.outcome === 'round_won') livreWins++;
    }
    if (r.outcome === 'won' || r.outcome === 'lost') {
      campaigns++;
      if (r.outcome === 'won') campaignsWon++;
    }
    themes.set(r.theme.titulo, (themes.get(r.theme.titulo) ?? 0) + 1);
    for (const c of r.cards) {
      const p = players.get(c.name) ?? { name: c.name, color: c.color, cards: 0, correct: 0, accuracy: 0 };
      p.cards++;
      if (!c.error) p.correct++;
      p.color = c.color;
      p.accuracy = p.correct / p.cards;
      players.set(c.name, p);
    }
  }
  const sharpest =
    [...players.values()]
      .filter((p) => p.cards >= SHARPEST_MIN_CARDS)
      .sort((a, b) => b.accuracy - a.accuracy || b.cards - a.cards || a.name.localeCompare(b.name))[0] ?? null;
  const topThemes = [...themes.entries()]
    .map(([titulo, count]) => ({ titulo, count }))
    .sort((a, b) => b.count - a.count || a.titulo.localeCompare(b.titulo))
    .slice(0, 5);
  return { rounds: ordered.length, livreRounds, livreWins, campaigns, campaignsWon, bestStreak, sharpest, topThemes };
}
```

- [ ] **Step 4: `shared/src/index.ts`** — acrescente `export * from './history';`.

- [ ] **Step 5: Rodar** — `npm test -w shared && npm run typecheck -w shared` → PASS.

- [ ] **Step 6: Commit**

```bash
git add shared
git commit -m "feat(shared): registro de rodada, anti-duplicata e estatísticas do histórico

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: D1 no servidor — migração, testes com banco e acesso a dados

**Files:**
- Create: `server/migrations/0001_init.sql`, `server/test/apply-migrations.ts`, `server/src/history-db.ts`, `server/test/history-db.test.ts`
- Modify: `server/wrangler.jsonc`, `server/vitest.config.ts`, `server/test/env.d.ts`, `server/package.json`, `server/src/codes.ts`, `server/worker-configuration.d.ts` (gerado)

- [ ] **Step 1: Migração** — `server/migrations/0001_init.sql`:

```sql
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rounds (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id),
  room_code TEXT NOT NULL,
  played_at INTEGER NOT NULL,
  mode TEXT NOT NULL,
  level INTEGER NOT NULL,
  outcome TEXT NOT NULL,
  errors INTEGER NOT NULL,
  campaign_id TEXT,
  theme_json TEXT NOT NULL,
  players_json TEXT NOT NULL,
  cards_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS rounds_group_played ON rounds (group_id, played_at DESC);
```

- [ ] **Step 2: Binding** — em `server/wrangler.jsonc`, acrescente (o id é placeholder para desenvolvimento local; o Plano 4 cria o banco real e troca):

```jsonc
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "cartolina",
      "database_id": "00000000-0000-0000-0000-000000000000",
      "migrations_dir": "migrations"
    }
  ],
```
Depois rode `npm run types -w server` → `worker-configuration.d.ts` passa a ter `DB: D1Database` no `Env`.

- [ ] **Step 3: Script local** — em `server/package.json`, acrescente o script `"db:migrate": "wrangler d1 migrations apply cartolina --local"`. Rode `npm run db:migrate -w server` e confirme que aplica `0001_init.sql` sem pedir confirmação interativa (se pedir, use `npx wrangler d1 migrations apply cartolina --local` uma vez à mão e anote no relatório). Rodar de novo deve dizer que não há migrações pendentes.

- [ ] **Step 4: Testes com D1** — substitua `server/vitest.config.ts` por:

```ts
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// Os testes usam códigos de sala e slugs aleatórios e únicos, então não dependem de isolamento de storage entre testes.
export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: { bindings: { TEST_MIGRATIONS: await readD1Migrations('./migrations') } },
    })),
  ],
  test: { setupFiles: ['./test/apply-migrations.ts'] },
});
```
`server/test/apply-migrations.ts`:
```ts
import { applyD1Migrations, env } from 'cloudflare:test';

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
```
`server/test/env.d.ts` (substitua):
```ts
declare module 'cloudflare:test' {
  interface ProvidedEnv extends Env {
    TEST_MIGRATIONS: D1Migration[];
  }
}
```
Rode `npm test -w server` → os 30 testes existentes continuam PASS (agora com o banco migrado).

- [ ] **Step 5: Slug** — acrescente em `server/src/codes.ts`:

```ts
/** Slug do grupo: 10 caracteres sem ambíguos (vai no link secreto `#/g/<slug>`). */
export const SLUG_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const SLUG_RE = new RegExp(`^[${SLUG_ALPHABET}]{10}$`);

export function randomSlug(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => SLUG_ALPHABET[b % SLUG_ALPHABET.length]).join('');
}
```

- [ ] **Step 6: Teste do acesso a dados** — `server/test/history-db.test.ts`:

```ts
import { env } from 'cloudflare:test';
import type { RoundRecord } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { SLUG_RE } from '../src/codes';
import { allRounds, createGroup, findGroup, insertRound, listRounds } from '../src/history-db';

function rec(playedAt: number): RoundRecord {
  return {
    id: crypto.randomUUID(),
    roomCode: 'ABCD',
    playedAt,
    mode: 'livre',
    level: 1,
    outcome: 'round_won',
    errors: 0,
    campaignId: null,
    theme: { titulo: 'Comidas', min: 'odeio', max: 'amo' },
    players: [{ name: 'Ana', color: '#8EC5FF' }],
    cards: [{ name: 'Ana', color: '#8EC5FF', value: 42, clue: 'pizza', error: false }],
  };
}

describe('history-db', () => {
  it('cria e encontra grupo pelo slug', async () => {
    const g = await createGroup(env.DB, 'Galera', 1000);
    expect(g.slug).toMatch(SLUG_RE);
    expect(await findGroup(env.DB, g.slug)).toEqual(g);
    expect(await findGroup(env.DB, 'zzzzzzzzzz')).toBeNull();
  });

  it('grava e lista rodadas (mais recentes primeiro, com paginação)', async () => {
    const g = await createGroup(env.DB, 'Galera', 1000);
    for (const t of [10, 30, 20]) await insertRound(env.DB, g.id, rec(t));
    const page1 = await listRounds(env.DB, g.id, null, 2);
    expect(page1.map((r) => r.playedAt)).toEqual([30, 20]);
    const page2 = await listRounds(env.DB, g.id, 20, 2);
    expect(page2.map((r) => r.playedAt)).toEqual([10]);
    expect(page1[0]).toEqual(expect.objectContaining({ roomCode: 'ABCD', theme: { titulo: 'Comidas', min: 'odeio', max: 'amo' } }));
    expect(page1[0]!.cards[0]).toEqual({ name: 'Ana', color: '#8EC5FF', value: 42, clue: 'pizza', error: false });
    expect((await allRounds(env.DB, g.id)).map((r) => r.playedAt)).toEqual([10, 20, 30]);
  });

  it('rodadas de um grupo não aparecem em outro', async () => {
    const a = await createGroup(env.DB, 'A', 1);
    const b = await createGroup(env.DB, 'B', 1);
    await insertRound(env.DB, a.id, rec(5));
    expect(await listRounds(env.DB, b.id, null, 20)).toEqual([]);
  });
});
```

- [ ] **Step 7: Rodar e ver falhar** — `npm test -w server -- history-db` → FAIL (módulo inexistente).

- [ ] **Step 8: `server/src/history-db.ts`**

```ts
import type { RoundRecord } from '@cartolina/shared';
import { randomSlug } from './codes';

export interface GroupRow {
  id: string;
  slug: string;
  name: string;
  created_at: number;
}

interface RoundRow {
  id: string;
  group_id: string;
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

const ROUND_COLS =
  'id, group_id, room_code, played_at, mode, level, outcome, errors, campaign_id, theme_json, players_json, cards_json';
/** Limite de rodadas lidas para estatísticas (um grupo de amigos fica bem abaixo disso). */
export const STATS_ROUNDS_CAP = 5000;

export async function createGroup(db: D1Database, name: string, now: number): Promise<GroupRow> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const row: GroupRow = { id: crypto.randomUUID(), slug: randomSlug(), name, created_at: now };
    try {
      await db
        .prepare('INSERT INTO groups (id, slug, name, created_at) VALUES (?, ?, ?, ?)')
        .bind(row.id, row.slug, row.name, row.created_at)
        .run();
      return row;
    } catch (err) {
      if (!String(err).includes('UNIQUE')) throw err;
    }
  }
  throw new Error('slug_collision');
}

export async function findGroup(db: D1Database, slug: string): Promise<GroupRow | null> {
  return (await db.prepare('SELECT id, slug, name, created_at FROM groups WHERE slug = ?').bind(slug).first<GroupRow>()) ?? null;
}

export async function insertRound(db: D1Database, groupId: string, r: RoundRecord): Promise<void> {
  await db
    .prepare(`INSERT INTO rounds (${ROUND_COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      r.id,
      groupId,
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

/** Mais recentes primeiro; `before` pagina por `played_at` (exclusivo). */
export async function listRounds(db: D1Database, groupId: string, before: number | null, limit: number): Promise<RoundRecord[]> {
  const stmt =
    before === null
      ? db.prepare(`SELECT ${ROUND_COLS} FROM rounds WHERE group_id = ? ORDER BY played_at DESC, id DESC LIMIT ?`).bind(groupId, limit)
      : db
          .prepare(`SELECT ${ROUND_COLS} FROM rounds WHERE group_id = ? AND played_at < ? ORDER BY played_at DESC, id DESC LIMIT ?`)
          .bind(groupId, before, limit);
  const { results } = await stmt.all<RoundRow>();
  return results.map(fromRow);
}

/** Em ordem cronológica, para estatísticas. */
export async function allRounds(db: D1Database, groupId: string): Promise<RoundRecord[]> {
  const { results } = await db
    .prepare(`SELECT ${ROUND_COLS} FROM rounds WHERE group_id = ? ORDER BY played_at ASC, id ASC LIMIT ?`)
    .bind(groupId, STATS_ROUNDS_CAP)
    .all<RoundRow>();
  return results.map(fromRow);
}
```

- [ ] **Step 9: Rodar** — `npm test -w server` (3×) e `npm run typecheck` → PASS.

- [ ] **Step 10: Commit**

```bash
git add server
git commit -m "feat(server): banco D1 com grupos e rodadas, migração e acesso a dados

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Rotas de grupo e gravação automática na revelação

**Files:**
- Modify: `server/src/index.ts`, `server/src/room-do.ts`, `server/test/helpers.ts`
- Create: `server/test/groups.test.ts`

- [ ] **Step 1: Helpers de teste** — acrescente ao fim de `server/test/helpers.ts`:

```ts
export async function newGroup(name = 'Galera'): Promise<string> {
  const res = await SELF.fetch('https://x/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (res.status !== 201) throw new Error(`criar grupo falhou: ${res.status}`);
  return ((await res.json()) as { slug: string }).slug;
}

export async function newGroupRoom(name = 'Galera'): Promise<{ slug: string; code: string }> {
  const slug = await newGroup(name);
  const res = await SELF.fetch(`https://x/groups/${slug}/rooms`, { method: 'POST' });
  if (res.status !== 201) throw new Error(`criar sala do grupo falhou: ${res.status}`);
  return { slug, code: ((await res.json()) as { code: string }).code };
}

/** Dois jogadores jogam uma rodada livre até a revelação (host força a revelação). */
export async function playRound(code: string): Promise<{ client: TestClient; id: string; token: string }[]> {
  const players = await joined(code, 2);
  const [a, b] = players;
  a!.client.send({ t: 'action', action: { type: 'start' } });
  await a!.client.state((r) => r.game.phase === 'theme');
  a!.client.send({ t: 'action', action: { type: 'beginRound' } });
  const ra = await a!.client.state((r) => r.game.phase === 'sorting');
  const cardA = Object.values(ra.game.cards).find((c) => c.owner === a!.id)!;
  const cardB = Object.values(ra.game.cards).find((c) => c.owner === b!.id)!;
  a!.client.send({ t: 'action', action: { type: 'clue', cardId: cardA.id, text: 'Paris' } });
  a!.client.send({ t: 'action', action: { type: 'place', cardId: cardA.id, index: 0 } });
  await b!.client.state((r) => r.game.row.length === 1);
  b!.client.send({ t: 'action', action: { type: 'place', cardId: cardB.id, index: 1 } });
  await a!.client.state((r) => r.game.row.length === 2);
  a!.client.send({ t: 'action', action: { type: 'forceReveal' } });
  await a!.client.state((r) => r.game.phase === 'reveal');
  return players;
}
```

- [ ] **Step 2: Testes** — `server/test/groups.test.ts`:

```ts
import { SELF } from 'cloudflare:test';
import type { GroupResponse, RoomView } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { connect, newGroup, newGroupRoom, playRound } from './helpers';

const getGroup = async (slug: string, qs = '') => SELF.fetch(`https://x/groups/${slug}${qs}`);

describe('grupos: HTTP', () => {
  it('cria grupo com nome limpo e devolve o slug', async () => {
    const res = await SELF.fetch('https://x/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '  Galera   da call ' }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { slug: string; name: string };
    expect(body.name).toBe('Galera da call');
    expect(body.slug).toMatch(/^[a-z0-9]{10}$/);
  });

  it('recusa nome inválido', async () => {
    const res = await SELF.fetch('https://x/groups', { method: 'POST', body: JSON.stringify({ name: '   ' }) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad_group_name' });
  });

  it('grupo novo vem vazio; slug desconhecido dá 404', async () => {
    const slug = await newGroup('Vazio');
    const res = await getGroup(slug);
    expect(res.status).toBe(200);
    const body = (await res.json()) as GroupResponse;
    expect(body.group).toMatchObject({ slug, name: 'Vazio' });
    expect(body.rounds).toEqual([]);
    expect(body.stats.rounds).toBe(0);
    expect(body.nextBefore).toBeNull();
    expect((await getGroup('zzzzzzzzzz')).status).toBe(404);
  });

  it('cria sala do grupo, e a sala sabe do grupo', async () => {
    const { slug, code } = await newGroupRoom('Galera');
    const c = await connect(code);
    c.send({ t: 'join', token: crypto.randomUUID(), name: 'Ana', color: '#8EC5FF' });
    await c.next('welcome');
    const room: RoomView = await c.state(() => true);
    expect(room.group).toEqual({ slug, name: 'Galera' });
    expect((await SELF.fetch(`https://x/groups/zzzzzzzzzz/rooms`, { method: 'POST' })).status).toBe(404);
  });
});

describe('grupos: gravação na revelação', () => {
  it('grava a rodada revelada uma vez só', async () => {
    const { slug, code } = await newGroupRoom('Galera');
    const [a, b] = await playRound(code);
    const first = (await (await getGroup(slug)).json()) as GroupResponse;
    expect(first.rounds).toHaveLength(1);
    const r = first.rounds[0]!;
    expect(r.roomCode).toBe(code);
    expect(r.mode).toBe('livre');
    expect(r.players.map((p) => p.name)).toEqual(['P0', 'P1']);
    expect(r.cards).toHaveLength(2);
    expect(r.cards.find((c) => c.name === 'P0')!.clue).toBe('Paris');
    expect(first.stats.rounds).toBe(1);

    // um novo commit (alguém sai da sala) não duplica a rodada
    b!.client.ws.close(1000, 'tchau');
    await a!.client.state((v) => v.seats.some((s) => !s.connected));
    const again = (await (await getGroup(slug)).json()) as GroupResponse;
    expect(again.rounds).toHaveLength(1);
  });

  it('sala avulsa não aparece em grupo nenhum', async () => {
    const slug = await newGroup('Outro');
    const res = await SELF.fetch('https://x/rooms', { method: 'POST' });
    const { code } = (await res.json()) as { code: string };
    await playRound(code);
    const body = (await (await getGroup(slug)).json()) as GroupResponse;
    expect(body.rounds).toEqual([]);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar** — `npm test -w server -- groups` → FAIL (rotas inexistentes).

- [ ] **Step 4: `server/src/index.ts`** — substitua o arquivo inteiro por:

```ts
import { cleanGroupName, summarizeHistory, type GroupResponse, type RoomGroup } from '@cartolina/shared';
import { CODE_RE, SLUG_RE, randomCode } from './codes';
import { allRounds, createGroup, findGroup, listRounds } from './history-db';
import { RoomDO } from './room-do';

export { RoomDO };

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const PAGE_SIZE = 20;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

async function createRoomFor(env: Env, group: RoomGroup | null): Promise<Response> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    const res = await stub.fetch(`https://room/init?code=${code}`, { method: 'POST', body: JSON.stringify({ group }) });
    if (res.status === 201) return json({ code }, 201);
  }
  return json({ error: 'no_code' }, 503);
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    if (request.method === 'POST' && url.pathname === '/rooms') return createRoomFor(env, null);

    if (request.method === 'POST' && url.pathname === '/groups') {
      const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
      const name = typeof body?.name === 'string' ? cleanGroupName(body.name) : null;
      if (!name) return json({ error: 'bad_group_name' }, 400);
      const group = await createGroup(env.DB, name, Date.now());
      return json({ slug: group.slug, name: group.name }, 201);
    }

    const groupMatch = url.pathname.match(/^\/groups\/([^/]+)(\/rooms)?$/);
    if (groupMatch) {
      const slug = groupMatch[1]!;
      if (!SLUG_RE.test(slug)) return json({ error: 'not_found' }, 404);
      const group = await findGroup(env.DB, slug);
      if (!group) return json({ error: 'not_found' }, 404);
      if (groupMatch[2]) {
        if (request.method !== 'POST') return json({ error: 'not_found' }, 404);
        return createRoomFor(env, { id: group.id, slug: group.slug, name: group.name });
      }
      const beforeParam = url.searchParams.get('before');
      const before = beforeParam && /^\d+$/.test(beforeParam) ? Number(beforeParam) : null;
      const rounds = await listRounds(env.DB, group.id, before, PAGE_SIZE);
      const body: GroupResponse = {
        group: { slug: group.slug, name: group.name, createdAt: group.created_at },
        rounds,
        stats: summarizeHistory(await allRounds(env.DB, group.id)),
        nextBefore: rounds.length === PAGE_SIZE ? rounds[rounds.length - 1]!.playedAt : null,
      };
      return json(body);
    }

    const roomMatch = url.pathname.match(/^\/rooms\/([^/]+)(\/ws)?$/);
    if (roomMatch) {
      const code = roomMatch[1]!.toUpperCase();
      if (!CODE_RE.test(code)) return json({ error: 'not_found' }, 404);
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      if (roomMatch[2]) return stub.fetch(request);
      const res = await stub.fetch('https://room/exists');
      return json(await res.json(), res.status);
    }

    return json({ error: 'not_found' }, 404);
  },
} satisfies ExportedHandler<Env>;
```

- [ ] **Step 5: `server/src/room-do.ts`**
  - Imports de `@cartolina/shared`: acrescente `pendingRecord` e `type RoomGroup`. Import local: `import { insertRound } from './history-db';`.
  - No bloco `/init`, troque a criação da sala por:

```ts
    if (url.pathname === '/init') {
      if (this.room) return new Response('taken', { status: 409 });
      const body = (await request.json().catch(() => ({}))) as { group?: RoomGroup | null };
      this.room = createRoom(url.searchParams.get('code') ?? '', Date.now(), body.group ?? null);
      await this.commit();
      return new Response('ok', { status: 201 });
    }
```
  - Em `commit()`, logo depois de `this.room = tick(this.room, Date.now(), Math.random);` e antes de `await this.ctx.storage.put('room', this.room);`, acrescente:

```ts
    // Sala de grupo entrou numa revelação nova: grava no histórico (falha no D1 não trava o jogo; tenta de novo no próximo commit).
    const pending = pendingRecord(this.room, Date.now(), crypto.randomUUID());
    if (pending && this.room.group) {
      try {
        await insertRound(this.env.DB, this.room.group.id, pending.record);
        this.room = { ...this.room, recordedRevealKey: pending.key };
      } catch (err) {
        console.error('falha ao gravar rodada no histórico', err);
      }
    }
```

- [ ] **Step 6: Rodar** — `npm test -w server` (3×), `npm test`, `npm run typecheck` → PASS.

- [ ] **Step 7: Commit**

```bash
git add server
git commit -m "feat(server): rotas de grupo e gravação da rodada no histórico ao revelar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Web — API, rota e grupos lembrados

**Files:**
- Modify: `web/src/net/api.ts`, `web/src/lib/router.ts`, `web/src/net/identity.ts`
- Test: `web/test/groups-api.test.ts` (criar)

- [ ] **Step 1: Testes** — crie `web/test/groups-api.test.ts`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { parseHash } from '../src/lib/router';
import { createGroup, createGroupRoom, getGroup } from '../src/net/api';
import { loadGroups, rememberGroup } from '../src/net/identity';

const fakeFetch = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('rota do grupo', () => {
  it('reconhece #/g/<slug>', () => {
    expect(parseHash('#/g/abcdefghjk')).toEqual({ name: 'group', slug: 'abcdefghjk' });
    expect(parseHash('#/g/ABC')).toEqual({ name: 'home' });
  });
});

describe('api de grupos', () => {
  it('createGroup manda o nome e devolve slug', async () => {
    const f = fakeFetch(201, { slug: 'abcdefghjk', name: 'Galera' });
    await expect(createGroup('Galera', f, 'http://s')).resolves.toEqual({ slug: 'abcdefghjk', name: 'Galera' });
    expect(f).toHaveBeenCalledWith('http://s/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Galera' }),
    });
  });

  it('getGroup pagina com before e devolve null quando não existe', async () => {
    const f = fakeFetch(200, { group: {}, rounds: [], stats: {}, nextBefore: null });
    await getGroup('abcdefghjk', 123, f, 'http://s');
    expect(f).toHaveBeenCalledWith('http://s/groups/abcdefghjk?before=123');
    await expect(getGroup('abcdefghjk', null, fakeFetch(404, {}), 'http://s')).resolves.toBeNull();
  });

  it('createGroupRoom devolve o código', async () => {
    await expect(createGroupRoom('abcdefghjk', fakeFetch(201, { code: 'KXQ7' }), 'http://s')).resolves.toBe('KXQ7');
  });
});

describe('grupos lembrados', () => {
  it('guarda os mais recentes primeiro, sem repetir, no máximo 8', () => {
    for (let i = 0; i < 10; i++) rememberGroup({ slug: `abcdefgh${String.fromCharCode(97 + i)}${i % 2 ? 'k' : 'm'}`, name: `G${i}` });
    rememberGroup({ slug: 'abcdefghak', name: 'G0 de novo' });
    const groups = loadGroups();
    expect(groups).toHaveLength(8);
    expect(groups[0]).toEqual({ slug: 'abcdefghak', name: 'G0 de novo' });
    expect(new Set(groups.map((g) => g.slug)).size).toBe(8);
  });

  it('ignora lixo no storage', () => {
    localStorage.setItem('cartolina.groups', '{"x":1}');
    expect(loadGroups()).toEqual([]);
  });
});
```

(Os slugs do teste usam só letras/dígitos válidos do alfabeto `[a-z0-9]`; o `loadGroups` valida `^[a-z0-9]{10}$`.)

- [ ] **Step 2: Rodar e ver falhar** — `npm test -w web -- groups-api` → FAIL.

- [ ] **Step 3: `web/src/net/api.ts`** — troque o import de tipos por `import type { GroupResponse, RoomSummary } from '@cartolina/shared';` e acrescente ao fim:

```ts
export async function createGroup(name: string, fetcher: typeof fetch = fetch, base: string = SERVER_URL): Promise<{ slug: string; name: string }> {
  const res = await fetcher(`${base}/groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`group_create_failed_${res.status}`);
  return (await res.json()) as { slug: string; name: string };
}

export async function getGroup(
  slug: string,
  before: number | null = null,
  fetcher: typeof fetch = fetch,
  base: string = SERVER_URL,
): Promise<GroupResponse | null> {
  const qs = before === null ? '' : `?before=${before}`;
  const res = await fetcher(`${base}/groups/${slug}${qs}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`group_failed_${res.status}`);
  return (await res.json()) as GroupResponse;
}

export async function createGroupRoom(slug: string, fetcher: typeof fetch = fetch, base: string = SERVER_URL): Promise<string> {
  const res = await fetcher(`${base}/groups/${slug}/rooms`, { method: 'POST' });
  if (!res.ok) throw new Error(`create_failed_${res.status}`);
  return ((await res.json()) as { code: string }).code;
}
```

- [ ] **Step 4: `web/src/lib/router.ts`** — troque `Route` e `parseHash` por:

```ts
export type Route = { name: 'home' } | { name: 'room'; code: string } | { name: 'group'; slug: string };

export function parseHash(hash: string): Route {
  const room = hash.match(/^#\/sala\/([A-Za-z0-9]{4})$/);
  if (room) return { name: 'room', code: room[1]!.toUpperCase() };
  const group = hash.match(/^#\/g\/([a-z0-9]{10})$/);
  if (group) return { name: 'group', slug: group[1]! };
  return { name: 'home' };
}
```
E acrescente ao fim:
```ts
export function goToGroup(slug: string): void {
  window.location.hash = `#/g/${slug}`;
}

/** Link completo do grupo (é o segredo: quem tem vê o histórico). */
export function groupLink(slug: string): string {
  return `${window.location.origin}${window.location.pathname}#/g/${slug}`;
}
```

- [ ] **Step 5: `web/src/net/identity.ts`** — acrescente ao fim (usa os helpers `safeGet`/`safeSet` já existentes no arquivo):

```ts
const GROUPS_KEY = 'cartolina.groups';
const MAX_GROUPS = 8;
const localStore = () => window.localStorage;

export interface RememberedGroup {
  slug: string;
  name: string;
}

export function loadGroups(): RememberedGroup[] {
  try {
    const raw = JSON.parse(safeGet(localStore, GROUPS_KEY) ?? '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (g): g is RememberedGroup =>
          !!g && typeof g === 'object' && typeof (g as RememberedGroup).name === 'string' && /^[a-z0-9]{10}$/.test(String((g as RememberedGroup).slug)),
      )
      .slice(0, MAX_GROUPS);
  } catch {
    return [];
  }
}

export function rememberGroup(group: RememberedGroup): void {
  const next = [group, ...loadGroups().filter((g) => g.slug !== group.slug)].slice(0, MAX_GROUPS);
  safeSet(localStore, GROUPS_KEY, JSON.stringify(next));
}
```

- [ ] **Step 6: Rodar** — `npm test -w web && npm run typecheck` → PASS.

- [ ] **Step 7: Commit**

```bash
git add web
git commit -m "feat(web): API, rota e grupos lembrados

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Web — criar e abrir grupos no início

**Files:**
- Modify: `web/src/screens/Home.tsx`, `web/src/brand/global.css`
- Test: `web/test/groups-ui.test.tsx` (acrescentar)

- [ ] **Step 1: Testes** — crie `web/test/groups-ui.test.tsx` (as Tasks 7 e 8 acrescentam a ele). A API é trocada por mocks com `vi.mock` (espiar export de módulo ESM não é confiável), por isso fica separado dos testes da API pura:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from '../src/net/api';
import { loadGroups, rememberGroup } from '../src/net/identity';
import { Home } from '../src/screens/Home';

vi.mock('../src/net/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/net/api')>();
  return { ...actual, createGroup: vi.fn(), getGroup: vi.fn(), createGroupRoom: vi.fn() };
});

afterEach(() => {
  vi.mocked(api.createGroup).mockReset();
  vi.mocked(api.getGroup).mockReset();
  vi.mocked(api.createGroupRoom).mockReset();
});

describe('Home: grupos', () => {
  it('cria grupo, lembra dele e vai para a página do grupo', async () => {
    const spy = vi.mocked(api.createGroup).mockResolvedValue({ slug: 'abcdefghjk', name: 'Galera' });
    render(<Home />);
    fireEvent.change(screen.getByLabelText('nome do grupo'), { target: { value: ' Galera ' } });
    fireEvent.click(screen.getByRole('button', { name: 'criar grupo' }));
    await waitFor(() => expect(window.location.hash).toBe('#/g/abcdefghjk'));
    expect(spy).toHaveBeenCalledWith('Galera');
    expect(loadGroups()[0]).toEqual({ slug: 'abcdefghjk', name: 'Galera' });
    spy.mockReset();
    window.location.hash = '';
  });

  it('nome vazio mostra erro', () => {
    render(<Home />);
    fireEvent.click(screen.getByRole('button', { name: 'criar grupo' }));
    expect(screen.getByText('Dá um nome pro grupo (até 40 letras).')).toBeTruthy();
  });

  it('lista os grupos lembrados como links', () => {
    rememberGroup({ slug: 'abcdefghjk', name: 'Galera' });
    render(<Home />);
    expect(screen.getByRole('link', { name: 'Galera' }).getAttribute('href')).toBe('#/g/abcdefghjk');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -w web -- groups-ui` → FAIL.

- [ ] **Step 3: `web/src/screens/Home.tsx`** — substitua o arquivo inteiro por:

```tsx
import { GROUP_NAME_MAX, cleanGroupName } from '@cartolina/shared';
import { useState, type FormEvent } from 'react';
import { goToGroup, goToRoom } from '../lib/router';
import { createGroup, createRoom } from '../net/api';
import { loadGroups, rememberGroup } from '../net/identity';

export function Home() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groupName, setGroupName] = useState('');
  const [groupBusy, setGroupBusy] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [groups] = useState(loadGroups);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      goToRoom(await createRoom());
    } catch {
      setError('Não deu pra criar a sala. O servidor tá ligado?');
    } finally {
      setBusy(false);
    }
  }

  function enter(e: FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (/^[A-Z0-9]{4}$/.test(c)) goToRoom(c);
    else setError('O código da sala tem 4 letras.');
  }

  async function newGroup(e: FormEvent) {
    e.preventDefault();
    const name = cleanGroupName(groupName);
    if (!name) {
      setGroupError(`Dá um nome pro grupo (até ${GROUP_NAME_MAX} letras).`);
      return;
    }
    setGroupBusy(true);
    setGroupError(null);
    try {
      const group = await createGroup(name);
      rememberGroup(group);
      goToGroup(group.slug);
    } catch {
      setGroupError('Não deu pra criar o grupo. O servidor tá ligado?');
    } finally {
      setGroupBusy(false);
    }
  }

  return (
    <main className="screen">
      <h1 className="logo big">
        cartolina<span>~</span>
      </h1>
      <p className="tagline">jogos de tabuleiro pra jogar com a galera na call</p>
      <section className="panel">
        <h2>ITO</h2>
        <p>Cada um recebe um número secreto de 1 a 100. Sem dizer o número, use o tema pra dar dicas e coloquem as cartas em ordem juntos.</p>
        <button className="btn" onClick={create} disabled={busy}>
          {busy ? 'criando…' : 'criar sala'}
        </button>
        <form className="row-inline" onSubmit={enter}>
          <input
            className="text-in"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="KXQ7"
            maxLength={4}
            aria-label="código da sala"
          />
          <button className="sbtn solid" type="submit">
            entrar na sala
          </button>
        </form>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
      <section className="panel">
        <h2>grupos</h2>
        <p>Um grupo guarda o histórico das partidas da galera: quem jogou, as dicas de cada um e os resultados.</p>
        {groups.length > 0 && (
          <ul className="group-list">
            {groups.map((g) => (
              <li key={g.slug}>
                <a href={`#/g/${g.slug}`}>{g.name}</a>
              </li>
            ))}
          </ul>
        )}
        <form className="row-inline" onSubmit={newGroup}>
          <input
            className="text-in"
            aria-label="nome do grupo"
            placeholder="Galera da call"
            value={groupName}
            maxLength={GROUP_NAME_MAX * 2}
            onChange={(e) => setGroupName(e.target.value)}
          />
          <button className="sbtn solid" type="submit" disabled={groupBusy}>
            criar grupo
          </button>
        </form>
        {groupError && (
          <p className="error" role="alert">
            {groupError}
          </p>
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 4: CSS** — acrescente ao fim de `web/src/brand/global.css`:

```css
.group-list { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
.group-list a {
  display: inline-block; font: 500 16px/1 var(--font-ui); color: var(--ink); text-decoration: none; padding: 8px 12px 7px;
  border: 2px solid var(--ink); border-radius: 999px 990px 999px 980px; background: var(--kraft);
}
.group-list a:hover { background: var(--pink); }
```

- [ ] **Step 5: Rodar** — `npm test -w web && npm run typecheck` → PASS.

- [ ] **Step 6: Commit**

```bash
git add web
git commit -m "feat(web): criar e abrir grupos na tela inicial

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Web — página do grupo

**Files:**
- Create: `web/src/screens/GroupPage.tsx`, `web/src/screens/group.css`
- Modify: `web/src/App.tsx`
- Test: `web/test/groups-ui.test.tsx` (acrescentar)

- [ ] **Step 1: Testes** — acrescente ao fim de `web/test/groups-ui.test.tsx` (e os imports `GroupPage`, `summarizeHistory`, `type GroupResponse`, `type RoundRecord` no topo):

```tsx
const ROUND = (id: string, playedAt: number, over: Partial<RoundRecord> = {}): RoundRecord => ({
  id,
  roomCode: 'KXQ7',
  playedAt,
  mode: 'livre',
  level: 1,
  outcome: 'round_lost',
  errors: 1,
  campaignId: null,
  theme: { titulo: 'Lugares que você quer visitar', min: 'nunca iria', max: 'sonho de vida' },
  players: [
    { name: 'Ana', color: '#8EC5FF' },
    { name: 'Bia', color: '#FF8FAB' },
  ],
  cards: [
    { name: 'Ana', color: '#8EC5FF', value: 60, clue: 'Paris', error: false },
    { name: 'Bia', color: '#FF8FAB', value: 12, clue: 'Cracolândia', error: true },
  ],
  ...over,
});

function response(rounds: RoundRecord[], nextBefore: number | null): GroupResponse {
  return { group: { slug: 'abcdefghjk', name: 'Galera', createdAt: 0 }, rounds, stats: summarizeHistory(rounds), nextBefore };
}

describe('GroupPage', () => {
  it('mostra números, partidas e expande a fila revelada', async () => {
    const spy = vi.mocked(api.getGroup).mockResolvedValue(response([ROUND('r1', 2000)], null));
    render(<GroupPage slug="abcdefghjk" />);
    expect(await screen.findByRole('heading', { name: 'Galera' })).toBeTruthy();
    expect(screen.getByText('rodadas').parentElement!.textContent).toContain('1');
    const head = screen.getByRole('button', { name: /Lugares que você quer visitar/ });
    expect(head.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(head);
    expect(head.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Cracolândia')).toBeTruthy();
    expect(screen.getByText('Paris')).toBeTruthy();
    expect(loadGroups()[0]).toEqual({ slug: 'abcdefghjk', name: 'Galera' });
    spy.mockReset();
  });

  it('carrega mais partidas com o cursor', async () => {
    const spy = vi
      .mocked(api.getGroup)
      .mockResolvedValueOnce(response([ROUND('r2', 3000)], 3000))
      .mockResolvedValueOnce(response([ROUND('r1', 1000, { theme: { titulo: 'Comidas', min: 'a', max: 'b' } })], null));
    render(<GroupPage slug="abcdefghjk" />);
    fireEvent.click(await screen.findByRole('button', { name: 'carregar mais' }));
    expect(await screen.findByRole('button', { name: /Comidas/ })).toBeTruthy();
    expect(spy).toHaveBeenLastCalledWith('abcdefghjk', 3000);
    expect(screen.queryByRole('button', { name: 'carregar mais' })).toBeNull();
    spy.mockReset();
  });

  it('cria sala do grupo e vai pra ela', async () => {
    const g = vi.mocked(api.getGroup).mockResolvedValue(response([], null));
    const c = vi.mocked(api.createGroupRoom).mockResolvedValue('KXQ7');
    render(<GroupPage slug="abcdefghjk" />);
    fireEvent.click(await screen.findByRole('button', { name: 'criar sala do grupo' }));
    await waitFor(() => expect(window.location.hash).toBe('#/sala/KXQ7'));
    expect(screen.getByText('Nenhuma partida ainda. Crie uma sala do grupo e bora jogar!')).toBeTruthy();
    g.mockReset();
    c.mockReset();
    window.location.hash = '';
  });

  it('grupo inexistente', async () => {
    const spy = vi.mocked(api.getGroup).mockResolvedValue(null);
    render(<GroupPage slug="abcdefghjk" />);
    expect(await screen.findByText('grupo não encontrado')).toBeTruthy();
    spy.mockReset();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -w web -- groups-ui` → FAIL.

- [ ] **Step 3: `web/src/screens/GroupPage.tsx`**

```tsx
import type { GroupResponse, ItoOutcome, RoundCard, RoundRecord } from '@cartolina/shared';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { critterSvg } from '../brand/critters';
import { goHome, goToRoom, groupLink } from '../lib/router';
import { createGroupRoom, getGroup } from '../net/api';
import { rememberGroup } from '../net/identity';
import './group.css';

const OUTCOME: Record<ItoOutcome, { label: string; good: boolean }> = {
  round_won: { label: 'vitória', good: true },
  round_lost: { label: 'errou', good: false },
  level_cleared: { label: 'nível ✓', good: true },
  won: { label: 'zerou a campanha', good: true },
  lost: { label: 'acabaram as vidas', good: false },
};

const dateFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const dayFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' });

function CritterIcon({ color, title, className = 'mini-avatar' }: { color: string; title?: string; className?: string }) {
  return <span className={className} title={title} dangerouslySetInnerHTML={{ __html: critterSvg(color) }} />;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

function MiniCard({ card }: { card: RoundCard }) {
  return (
    <div className={`mini-card ${card.error ? 'err' : ''}`} style={{ '--c': card.color } as CSSProperties}>
      <CritterIcon color={card.color} className="mini-badge" />
      <div className="mini-num">{card.value}</div>
      <div className="mini-clue">{card.clue || '…'}</div>
      <div className="mini-name">{card.name}</div>
      {card.error && (
        <div className="mini-x" role="img" aria-label="fora de ordem">
          ✕
        </div>
      )}
    </div>
  );
}

function RoundItem({ round, open, onToggle }: { round: RoundRecord; open: boolean; onToggle(): void }) {
  const outcome = OUTCOME[round.outcome];
  return (
    <li className="round">
      <button type="button" className="round-head" aria-expanded={open} onClick={onToggle}>
        <span className="round-date">{dateFmt.format(new Date(round.playedAt))}</span>
        <span className="round-theme">{round.theme.titulo}</span>
        <span className="round-mode">{round.mode === 'livre' ? 'livre' : `campanha · nível ${round.level}`}</span>
        <span className={`round-outcome ${outcome.good ? 'good' : 'bad'}`}>{outcome.label}</span>
        <span className="round-players">
          {round.players.map((p) => (
            <CritterIcon key={p.name} color={p.color} title={p.name} />
          ))}
        </span>
      </button>
      {open && (
        <div className="round-body">
          <p className="round-scale">
            <b>1</b> {round.theme.min} · <b>100</b> {round.theme.max}
          </p>
          <div className="mini-row">
            {round.cards.map((c, i) => (
              <MiniCard key={i} card={c} />
            ))}
          </div>
        </div>
      )}
    </li>
  );
}

export function GroupPage({ slug }: { slug: string }) {
  const [data, setData] = useState<GroupResponse | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    setFailed(false);
    getGroup(slug)
      .then((d) => {
        setData(d);
        if (d) rememberGroup({ slug, name: d.group.name });
      })
      .catch(() => setFailed(true));
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function loadMore() {
    if (!data || data.nextBefore === null) return;
    setLoadingMore(true);
    try {
      const more = await getGroup(slug, data.nextBefore);
      if (more) setData({ ...data, rounds: [...data.rounds, ...more.rounds], nextBefore: more.nextBefore });
    } catch {
      setFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }

  async function newRoom() {
    setCreating(true);
    try {
      goToRoom(await createGroupRoom(slug));
    } catch {
      setFailed(true);
    } finally {
      setCreating(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(groupLink(slug));
    } catch {
      return; // sem clipboard (http fora de localhost): o link está na barra de endereço
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  const header = (
    <h1 className="logo">
      cartolina<span>~</span>
    </h1>
  );

  if (data === undefined && failed) {
    return (
      <main className="screen">
        {header}
        <section className="panel">
          <h2>não deu pra falar com o servidor</h2>
          <button className="btn" type="button" onClick={load}>
            tentar de novo
          </button>
        </section>
      </main>
    );
  }
  if (data === undefined) {
    return (
      <main className="screen">
        {header}
        <p className="hint">carregando…</p>
      </main>
    );
  }
  if (data === null) {
    return (
      <main className="screen">
        {header}
        <section className="panel">
          <h2>grupo não encontrado</h2>
          <p>Confere se o link está completo.</p>
          <button className="btn" type="button" onClick={goHome}>
            voltar pro início
          </button>
        </section>
      </main>
    );
  }

  const { group, rounds, stats } = data;
  const winRate = stats.livreRounds ? `${Math.round((stats.livreWins / stats.livreRounds) * 100)}%` : '—';
  return (
    <main className="screen group-page">
      {header}
      <section className="panel">
        <h2>{group.name}</h2>
        <p>grupo criado em {dayFmt.format(new Date(group.createdAt))}</p>
        <div className="row-inline">
          <button className="btn" type="button" onClick={() => void newRoom()} disabled={creating}>
            {creating ? 'criando…' : 'criar sala do grupo'}
          </button>
          <button className="sbtn" type="button" onClick={() => void copyLink()}>
            {copied ? 'link copiado!' : 'copiar link do grupo'}
          </button>
        </div>
        <p className="hint">Quem tem o link do grupo vê o histórico. Partidas jogadas em salas criadas aqui entram sozinhas.</p>
        {failed && (
          <p className="error" role="alert">
            Algo deu errado agora há pouco. Tenta de novo.
          </p>
        )}
      </section>

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

      <section className="panel">
        <h2>partidas</h2>
        {rounds.length === 0 ? (
          <p>Nenhuma partida ainda. Crie uma sala do grupo e bora jogar!</p>
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
      </section>
    </main>
  );
}
```

- [ ] **Step 4: `web/src/screens/group.css`**

```css
.group-page .panel { width: min(760px, 100%); }
.group-page h3 { margin: 4px 0 6px; font: 700 17px/1 var(--font-ui); }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
.stat {
  display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; background: var(--kraft); border: 2px solid var(--ink);
  border-radius: 16px 12px 15px 11px;
}
.stat b { font: 700 30px/1 var(--font-ui); }
.stat span { font: 17px/1.1 var(--font-hand); opacity: 0.8; }
.highlight { display: flex; align-items: center; gap: 10px; }
.mini-avatar { display: inline-block; width: 30px; height: 30px; flex: none; }
.mini-avatar svg, .mini-badge svg { width: 100%; height: 100%; overflow: visible; }
.theme-list { margin: 0; padding-left: 22px; font: 19px/1.35 var(--font-hand); }
.theme-list span { opacity: 0.6; }

.round-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.round { border: 2px solid var(--ink); border-radius: 16px 12px 15px 11px; background: var(--kraft); overflow: hidden; }
.round-head {
  width: 100%; display: grid; grid-template-columns: auto 1fr auto auto auto; gap: 10px; align-items: center; padding: 10px 12px;
  background: none; border: none; cursor: pointer; text-align: left; color: var(--ink);
}
.round-head[aria-expanded='true'] { background: var(--paper); border-bottom: 2px dashed rgba(59, 47, 47, 0.3); }
.round-date { font: 500 13px/1 var(--font-ui); opacity: 0.7; white-space: nowrap; }
.round-theme { font: 700 16px/1.15 var(--font-ui); }
.round-mode { font: 16px/1 var(--font-hand); opacity: 0.8; white-space: nowrap; }
.round-outcome { font: 700 12px/1 var(--font-ui); padding: 4px 9px 3px; border: 2px solid var(--ink); border-radius: 999px; white-space: nowrap; }
.round-outcome.good { background: var(--ok); }
.round-outcome.bad { background: var(--pink); }
.round-players { display: flex; gap: 2px; }
.round-players .mini-avatar { width: 24px; height: 24px; }
.round-body { padding: 12px 14px 16px; background: var(--paper); }
.round-scale { margin: 0 0 10px; font: 18px/1.2 var(--font-hand); }
.round-scale b { font: 700 13px/1 var(--font-ui); background: var(--kraft); border: 2px solid var(--ink); border-radius: 8px 6px 7px 5px; padding: 1px 5px; }
.mini-row { display: flex; gap: 8px; flex-wrap: wrap; }
.mini-card {
  position: relative; width: 86px; min-height: 112px; border: 2px solid var(--ink); border-radius: var(--r); background: var(--c);
  box-shadow: 2px 3px 0 var(--ink); padding: 6px; display: flex; flex-direction: column; align-items: center; gap: 4px;
}
.mini-card.err { border-color: var(--pink2); }
.mini-badge { width: 24px; height: 24px; align-self: flex-start; }
.mini-num { font: 700 24px/1 var(--font-ui); background: var(--paper); border: 2px solid var(--ink); border-radius: 8px 6px 7px 5px; padding: 3px 6px 2px; }
.mini-clue { font: 16px/1 var(--font-hand); text-align: center; overflow-wrap: anywhere; }
.mini-name { margin-top: auto; font: 500 11px/1 var(--font-ui); opacity: 0.75; }
.mini-x {
  position: absolute; right: -10px; top: -10px; width: 28px; height: 28px; border-radius: 50%; background: var(--pink2);
  border: 2px solid var(--ink); color: var(--paper); font: 700 16px/24px var(--font-ui); text-align: center;
}
@media (max-width: 560px) {
  .round-head { grid-template-columns: 1fr auto; }
  .round-date, .round-mode { grid-column: 1 / -1; }
}
```

- [ ] **Step 5: `web/src/App.tsx`** — substitua por:

```tsx
import { useHashRoute } from './lib/router';
import { GroupPage } from './screens/GroupPage';
import { Home } from './screens/Home';
import { RoomScreen } from './screens/RoomScreen';

export function App() {
  const route = useHashRoute();
  if (route.name === 'room') return <RoomScreen key={route.code} code={route.code} />;
  if (route.name === 'group') return <GroupPage key={route.slug} slug={route.slug} />;
  return <Home />;
}
```

- [ ] **Step 6: Rodar** — `npm test -w web && npm run typecheck && npm run build` → PASS.

- [ ] **Step 7: Commit**

```bash
git add web
git commit -m "feat(web): página do grupo com números e partidas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Sala ↔ grupo, scripts e README

**Files:**
- Modify: `web/src/screens/Lobby.tsx`, `web/src/table/TopBar.tsx`, `package.json` (raiz), `.claude/launch.json`, `README.md`
- Test: `web/test/groups-ui.test.tsx` (acrescentar)

- [ ] **Step 1: Testes** — acrescente ao fim de `web/test/groups-ui.test.tsx` (imports de `Lobby`, `TopBar`, `makeRoom`, `viewOf` do `./fixtures`):

```tsx
describe('sala de grupo', () => {
  const conn = () => ({
    sendAction: vi.fn(),
    sendActivity: vi.fn(),
    sendCursor: vi.fn(),
    sendPing: vi.fn(),
    onFx: vi.fn(() => () => {}),
    onError: vi.fn(() => () => {}),
  });
  const groupView = () => ({ ...viewOf(makeRoom(2), 'p0'), group: { slug: 'abcdefghjk', name: 'Galera' } });

  it('lobby mostra o link do histórico do grupo', () => {
    render(<Lobby view={groupView()} conn={conn()} />);
    expect(screen.getByRole('link', { name: '📜 histórico de Galera' }).getAttribute('href')).toBe('#/g/abcdefghjk');
  });

  it('mesa mostra o nome do grupo no topo', () => {
    render(<TopBar view={groupView()} />);
    expect(screen.getByRole('link', { name: 'Galera' }).getAttribute('href')).toBe('#/g/abcdefghjk');
  });

  it('sala avulsa não mostra nada de grupo', () => {
    render(<Lobby view={viewOf(makeRoom(2), 'p0')} conn={conn()} />);
    expect(screen.queryByText(/histórico de/)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -w web -- groups-ui` → FAIL.

- [ ] **Step 3: `web/src/screens/Lobby.tsx`** — no primeiro `<section className="panel">` (o da sala), logo depois do botão/área de "copiar link da sala", acrescente:

```tsx
        {view.group && (
          <a className="sbtn" href={`#/g/${view.group.slug}`} target="_blank" rel="noopener">
            📜 histórico de {view.group.name}
          </a>
        )}
```

- [ ] **Step 4: `web/src/table/TopBar.tsx`** — dentro de `<div className="pills">`, antes do botão da sala, acrescente:

```tsx
        {view.group && (
          <a className="pill" href={`#/g/${view.group.slug}`} target="_blank" rel="noopener" title="histórico do grupo">
            {view.group.name}
          </a>
        )}
```
E em `web/src/table/table.css`, acrescente `.pills a.pill { color: var(--ink); text-decoration: none; }`.

- [ ] **Step 5: Scripts** — no `package.json` da raiz, troque `"dev:server": "npm run dev -w server"` por `"dev:server": "npm run db:migrate -w server && npm run dev -w server"`. Em `.claude/launch.json`, na configuração `server`, troque `"runtimeArgs": ["run", "dev", "-w", "server"]` por `"runtimeArgs": ["run", "dev:server"]`.

- [ ] **Step 6: README** — acrescente uma seção depois de "Desenvolvimento":

````markdown
## Grupos e histórico

- Na tela inicial, **criar grupo** gera um link secreto (`#/g/<slug>`). Quem tem o link vê o histórico.
- Salas criadas na página do grupo gravam cada rodada revelada (tema, quem jogou, a fila com números e dicas, resultado) no banco **Cloudflare D1** `cartolina`.
- A página do grupo mostra números (rodadas, % de vitórias no livre, campanhas zeradas, maior sequência sem erro), quem mais acerta a posição, os temas mais jogados e as partidas (clique pra ver a fila revelada).
- Em desenvolvimento, `npm run dev:server` aplica as migrações no D1 local antes de subir (`npm run db:migrate -w server`).
- API: `POST /groups { name }` → `{ slug, name }` · `GET /groups/:slug[?before=<ms>]` → grupo, 20 rodadas, estatísticas e cursor · `POST /groups/:slug/rooms` → `{ code }`.
````

- [ ] **Step 7: Verificação completa** — `npm test`, `npm run typecheck`, `npm run build` → PASS. Com o servidor local reiniciado por `npm run dev:server` (o controlador pode fazer isso), rode `npm run smoke` → `ok`.

- [ ] **Step 8: Commit**

```bash
git add web package.json .claude/launch.json README.md
git commit -m "feat: sala ligada ao grupo, migração local automática e README do histórico

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 9: Teste com o usuário** (controlador): criar grupo, criar sala do grupo, jogar uma rodada com bots, abrir a página do grupo e conferir a partida, as dicas e os números; jogar uma campanha curta e ver o agrupamento.

---

## Cobertura da spec §11

| Requisito | Task |
|---|---|
| Grupo com nome e link secreto `#/g/<slug>`, sem login | 3, 4, 5 |
| Página do grupo: criar sala, lista de partidas, estatísticas | 6, 7 |
| Salas do grupo ligadas a ele; salas avulsas sem histórico | 1, 4 |
| Gravar a cada revelação: data, modo, nível, tema, jogadores, fila (dono, número, dica, erro), erros, outcome | 2, 4 |
| `campaignId` comum às rodadas de uma campanha | 1, 2 |
| Partidas expansíveis com a fila revelada | 7 |
| Números gerais e destaques por nome (mais certeiro, temas, maior sequência) | 2, 7 |
| D1 com `groups` e `rounds`; gravação pelo DO | 3, 4 |
| Rotas `POST /groups`, `GET /groups/:slug`, `POST /groups/:slug/rooms` | 4 |
| Banco real em produção (`database_id`) | Plano 4 |
