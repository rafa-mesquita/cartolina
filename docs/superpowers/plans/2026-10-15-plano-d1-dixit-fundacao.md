# Plano D1 — fundação do Dixit (sala genérica + regras) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A sala do cartolina~ passa a aceitar mais de um jogo (registro de jogos) e o Dixit existe como módulo de regras completo e testado, com o servidor criando salas de Dixit — sem nenhuma tela nova e com o ITO intacto.

**Architecture:** `shared/src/games/registry.ts` lista os jogos (`ito`, `dixit`) com módulo de regras (`GameModule`), schema zod das ações e limites. `Room` ganha `gameId`; `room.ts` delega ao registro em vez de chamar `ito.*`. O protocolo só garante `{ type }` na ação e a sala valida com o schema do jogo dela. O Dixit fica em `shared/src/games/dixit/` (tipos, baralho, pontuação pura, regras, visão com segredos, schema). O servidor guarda o jogo na criação da sala e não repassa cursor/ping em salas de Dixit.

**Tech Stack:** TypeScript 5.9, zod 3, Vitest 4, Cloudflare Workers + Durable Objects (`@cloudflare/vitest-plugin`), React 19 (só ajustes de tipo no `web/`).

**Spec:** `docs/superpowers/specs/2026-10-15-dixit-design.md` (§2 regras, §3 arquitetura, §8 erros, §9 testes). Este plano cobre o item 1 da §10 (Plano D1).

---

## Contexto para quem vai executar

- Monorepo npm workspaces: `shared/` (regras puras, sem I/O), `server/` (Worker + Durable Object), `web/` (React). Comandos na raiz da worktree: `npm test`, `npm run typecheck`, `npm test -w shared`, `npm run typecheck -w web`, etc.
- Trabalhe **sempre** na worktree `.claude/worktrees/dixit` (branch `feat/dixit`). A pasta principal do repositório tem outra sessão trabalhando no Plano 4; não mexa lá.
- Código e mensagens em **português** (comentários, mensagens de erro, nomes de teste), no mesmo estilo dos arquivos existentes. Commits no formato `feat(shared): …`, `test(server): …`, terminando com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `tsconfig.base.json` usa `strict`, `noUncheckedIndexedAccess` e `verbatimModuleSyntax`: imports só de tipo precisam de `import type` / `type X` inline; acesso por índice devolve `T | undefined` (use `!` quando o teste garante).
- O `GameModule` (em `shared/src/game.ts`) usa sintaxe de método, então `GameModule<ItoState, …>` é atribuível a `GameModule<GameState, …>`.
- A Vitest não checa tipos: rode **também** `npm run typecheck` onde o passo pedir.
- **Tarefas 1–12** só dependem do `main`. **A Tarefa 13 é uma trava:** as Tarefas 14–15 mexem em `server/src/index.ts`, que o Plano 4 reescreveu; só siga depois que o Plano 4 estiver no `main`.

## Mapa de arquivos

Criar:
- `shared/src/games/ito/schema.ts` — schema zod das ações do ITO (saindo do `protocol.ts`).
- `shared/src/games/dixit/types.ts` — fases, estado, ações, visão e constantes do Dixit.
- `shared/src/games/dixit/deck.ts` — tamanho do baralho e ids `d001…`.
- `shared/src/games/dixit/scoring.ts` — `scoreRound`, pura.
- `shared/src/games/dixit/rules.ts` — `applyDixitAction`, `dixitOnPresenceChange`, ajudantes.
- `shared/src/games/dixit/view.ts` — `dixitViewFor` (segredos) e o módulo `dixit`.
- `shared/src/games/dixit/schema.ts` — schema zod das ações do Dixit.
- `shared/src/games/registry.ts` — `GAMES`, `GameId`, `GameState`, `GameView`, `GameAction`, `isGameId`.
- `shared/test/dixit-helpers.ts`, `shared/test/dixit-deck.test.ts`, `shared/test/dixit-scoring.test.ts`, `shared/test/dixit-rules.test.ts`, `shared/test/dixit-view.test.ts`, `shared/test/dixit-schema.test.ts`, `shared/test/room-games.test.ts`.
- `server/test/dixit.test.ts`.

Modificar:
- `shared/src/protocol.ts` — envelope de ação genérico, novos códigos de erro.
- `shared/src/room.ts` — `gameId`, delegação ao registro, `RoomView` genérica, `restoreRoom`, `itoStateOf`.
- `shared/src/history.ts` — `pendingRecord` só para ITO.
- `shared/src/index.ts` — exports novos.
- `shared/test/room.test.ts`, `shared/test/history.test.ts`, `shared/test/protocol.test.ts` — ajustes.
- `web/src/...` (tipos `ItoRoomView`, `Game.tsx`, `bots.ts`, `connection.ts`) e `web/test/fixtures.ts`, `web/test/result.test.tsx`.
- `server/src/room-do.ts`, `server/test/helpers.ts` (Tarefa 12); `server/src/index.ts`, `server/test/http.test.ts` (Tarefa 14).
- `README.md` (Tarefa 15).

---

### Task 0: Preparar a worktree

**Files:** nenhum.

- [ ] **Step 1: Instalar dependências na worktree**

Run (na raiz da worktree `.claude/worktrees/dixit`): `npm install`
Expected: termina sem erro (a worktree não tem `node_modules` próprio).

- [ ] **Step 2: Linha de base verde**

Run: `npm test` e depois `npm run typecheck`
Expected: tudo passa. Se algo já falhar aqui, pare e reporte: não é deste plano.

---

### Task 1: Schema das ações do ITO sai do protocolo

Refatoração sem mudança de comportamento: o registro de jogos (Tarefa 10) precisa importar o schema do ITO sem puxar o protocolo inteiro.

**Files:**
- Create: `shared/src/games/ito/schema.ts`
- Modify: `shared/src/protocol.ts`, `shared/src/index.ts`

- [ ] **Step 1: Criar `shared/src/games/ito/schema.ts`**

```ts
import { z } from 'zod';
import type { ItoAction } from './types';

const themeSchema = z.object({
  titulo: z.string().max(200),
  min: z.string().max(100),
  max: z.string().max(100),
});

const cardId = z.string().min(1).max(64);
const rowIndex = z.number().int().min(0).max(100);

export const itoActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('setMode'), mode: z.enum(['livre', 'campanha']) }),
  z.object({ type: z.literal('start') }),
  z.object({ type: z.literal('rerollTheme') }),
  z.object({ type: z.literal('customTheme'), theme: themeSchema }),
  z.object({ type: z.literal('beginRound') }),
  z.object({ type: z.literal('place'), cardId, index: rowIndex }),
  z.object({ type: z.literal('return'), cardId }),
  z.object({ type: z.literal('clue'), cardId, text: z.string().max(200) }),
  z.object({ type: z.literal('ready'), ready: z.boolean() }),
  z.object({ type: z.literal('forceReveal') }),
  z.object({ type: z.literal('next') }),
  z.object({ type: z.literal('lobby') }),
]);

/** Falha a compilação se o schema divergir do tipo ItoAction. */
type Assert<T extends true> = T;
export type ItoActionSchemaMatches = Assert<z.infer<typeof itoActionSchema> extends ItoAction ? true : false>;
export type ItoActionTypeCovered = Assert<ItoAction extends z.infer<typeof itoActionSchema> ? true : false>;
```

- [ ] **Step 2: Tirar o schema de `shared/src/protocol.ts`**

No topo de `shared/src/protocol.ts`, troque tudo de `import { z } from 'zod';` até o fim do `itoActionSchema` (inclusive) por:

```ts
import { z } from 'zod';
import { itoActionSchema } from './games/ito/schema';
import type { RoomView } from './room';

const cardId = z.string().min(1).max(64);
const rowIndex = z.number().int().min(0).max(100);
```

(Os `cardId`/`rowIndex` continuam aqui porque o `fx.cursor` usa.) Apague também o bloco:

```ts
/** Falha a compilação se o schema divergir do tipo ItoAction. */
type Assert<T extends true> = T;
export type ActionSchemaMatches = Assert<z.infer<typeof itoActionSchema> extends ItoAction ? true : false>;
export type ActionTypeCovered = Assert<ItoAction extends z.infer<typeof itoActionSchema> ? true : false>;
```

e o `import type { ItoAction } from './games/ito/types';`, que fica sem uso.

- [ ] **Step 3: Exportar o schema**

Em `shared/src/index.ts`, adicione no fim:

```ts
export { itoActionSchema } from './games/ito/schema';
```

- [ ] **Step 4: Verificar**

Run: `npm test -w shared && npm run typecheck`
Expected: PASS (nenhum teste muda).

- [ ] **Step 5: Commit**

```bash
git add shared/src/games/ito/schema.ts shared/src/protocol.ts shared/src/index.ts
git commit -m "refactor(shared): schema das ações do ITO em arquivo próprio"
```

---

### Task 2: Tipos e baralho do Dixit

**Files:**
- Create: `shared/src/games/dixit/types.ts`, `shared/src/games/dixit/deck.ts`
- Test: `shared/test/dixit-deck.test.ts`

- [ ] **Step 1: Escrever o teste do baralho**

`shared/test/dixit-deck.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DIXIT_DECK_SIZE, dixitCardIds } from '../src/games/dixit/deck';

describe('baralho do Dixit', () => {
  it('provisório tem 84 cartas, ids d001… com 3 dígitos', () => {
    const ids = dixitCardIds();
    expect(DIXIT_DECK_SIZE).toBe(84);
    expect(ids).toHaveLength(84);
    expect(ids[0]).toBe('d001');
    expect(ids[83]).toBe('d084');
    expect(new Set(ids).size).toBe(84);
  });

  it('aceita outro tamanho', () => {
    expect(dixitCardIds(3)).toEqual(['d001', 'd002', 'd003']);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/dixit-deck.test.ts` (dentro de `shared/`)
Expected: FAIL — módulo `../src/games/dixit/deck` não existe.

- [ ] **Step 3: Criar `shared/src/games/dixit/deck.ts`**

```ts
/** Cartas do baralho. Provisório: 84 (como a caixa); o script da arte atualiza este número. */
export const DIXIT_DECK_SIZE = 84;

/** Ids estáveis das cartas: d001, d002, … (a arte fica em web/public/dixit/cards/<id>.webp). */
export function dixitCardIds(size: number = DIXIT_DECK_SIZE): string[] {
  return Array.from({ length: size }, (_, i) => `d${String(i + 1).padStart(3, '0')}`);
}
```

- [ ] **Step 4: Criar `shared/src/games/dixit/types.ts`**

```ts
export const DIXIT_MIN_PLAYERS = 3;
export const DIXIT_TARGETS = [15, 30] as const;
export type DixitTarget = (typeof DIXIT_TARGETS)[number];
/** Meta da caixa original. */
export const DIXIT_DEFAULT_TARGET: DixitTarget = 30;
export const DIXIT_CLUE_MAX = 80;

export type DixitPhase = 'lobby' | 'storytelling' | 'submitting' | 'voting' | 'reveal' | 'gameover';

/** O que aconteceu na rodada revelada (para animar e mostrar). */
export interface DixitRoundResult {
  storyteller: string;
  storyCard: string;
  clue: string;
  /** Cartas na ordem em que apareceram na votação. */
  table: string[];
  /** carta → dono */
  owners: Record<string, string>;
  /** votante → carta (só votos confirmados) */
  votes: Record<string, string>;
  /** Pontos ganhos nesta rodada por quem participou. */
  gained: Record<string, number>;
  /** Quem achou a carta do narrador. */
  found: string[];
}

export interface DixitState {
  phase: DixitPhase;
  target: DixitTarget;
  /** Todos da partida: ordem dos assentos no início; quem entra depois vai pro fim. */
  players: string[];
  /** Quem participa da rodada atual (ativos quando ela começou). */
  inRound: string[];
  scores: Record<string, number>;
  storyteller: string | null;
  deck: string[];
  discard: string[];
  hands: Record<string, string[]>;
  clue: string;
  storyCard: string | null;
  /** jogador → cartas escolhidas na etapa de escolha. */
  picks: Record<string, string[]>;
  /** votante → carta. */
  votes: Record<string, string>;
  /** Quem já confirmou na etapa atual (escolha ou votação). */
  confirmed: string[];
  /** Ordem embaralhada das cartas na votação. */
  table: string[];
  result: DixitRoundResult | null;
  winners: string[];
  /** Menos de 3 ativos na rodada: ninguém joga até voltar gente. */
  paused: boolean;
}

export type DixitAction =
  | { type: 'setTarget'; target: DixitTarget }
  | { type: 'start' }
  | { type: 'tell'; cardId: string; clue: string }
  | { type: 'submit'; cardIds: string[] }
  | { type: 'vote'; cardId: string }
  | { type: 'confirm' }
  | { type: 'forceNext' }
  | { type: 'next' }
  | { type: 'again' }
  | { type: 'lobby' };

export interface DixitTableCard {
  cardId: string;
  /** A carta é de quem está vendo. */
  mine: boolean;
}

export interface DixitView {
  phase: DixitPhase;
  target: DixitTarget;
  players: string[];
  inRound: string[];
  scores: Record<string, number>;
  storyteller: string | null;
  clue: string;
  paused: boolean;
  winners: string[];
  /** Só na revelação e no fim de jogo. */
  result: DixitRoundResult | null;
  /** Sua mão (vazia para espectador). */
  hand: string[];
  handCounts: Record<string, number>;
  deckCount: number;
  /** Carta do narrador: só ele vê antes da revelação. */
  storyCard: string | null;
  myPicks: string[];
  myVote: string | null;
  confirmed: string[];
  /** Quantas cartas já estão na mesa (narrador + quem confirmou a escolha). */
  tableCount: number;
  /** Cartas na votação/revelação, sem dono. */
  table: DixitTableCard[];
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test -w shared && npm run typecheck -w shared`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add shared/src/games/dixit shared/test/dixit-deck.test.ts
git commit -m "feat(shared): tipos e baralho provisório do Dixit"
```

---

### Task 3: Pontuação do Dixit (pura)

**Files:**
- Create: `shared/src/games/dixit/scoring.ts`
- Test: `shared/test/dixit-scoring.test.ts`

- [ ] **Step 1: Escrever os testes**

`shared/test/dixit-scoring.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { scoreRound } from '../src/games/dixit/scoring';

const four = {
  storyteller: 'n',
  storyCard: 'c0',
  inRound: ['n', 'a', 'b', 'c'],
  owners: { c0: 'n', ca: 'a', cb: 'b', cc: 'c' },
};

describe('scoreRound', () => {
  it('todos acharam: narrador 0, os outros 2', () => {
    const r = scoreRound({ ...four, votes: { a: 'c0', b: 'c0', c: 'c0' } });
    expect(r.gained).toEqual({ n: 0, a: 2, b: 2, c: 2 });
    expect(r.found).toEqual(['a', 'b', 'c']);
  });

  it('ninguém achou: narrador 0, os outros 2 + bônus por voto', () => {
    const r = scoreRound({ ...four, votes: { a: 'cb', b: 'ca', c: 'ca' } });
    expect(r.gained).toEqual({ n: 0, a: 4, b: 3, c: 2 });
    expect(r.found).toEqual([]);
  });

  it('alguns acharam: narrador e quem achou fazem 3, + bônus', () => {
    const r = scoreRound({ ...four, votes: { a: 'c0', b: 'ca', c: 'c0' } });
    expect(r.gained).toEqual({ n: 3, a: 4, b: 0, c: 3 });
    expect(r.found).toEqual(['a', 'c']);
  });

  it('3 jogadores com 2 cartas cada: bônus conta nas duas', () => {
    const r = scoreRound({
      storyteller: 'n',
      storyCard: 'c0',
      inRound: ['n', 'a', 'b'],
      owners: { c0: 'n', a1: 'a', a2: 'a', b1: 'b', b2: 'b' },
      votes: { a: 'b1', b: 'a2' },
    });
    expect(r.gained).toEqual({ n: 0, a: 3, b: 3 });
  });

  it('quem não votou não ganha os 2, mas leva o bônus', () => {
    const r = scoreRound({ ...four, votes: { a: 'cc', b: 'cc' } });
    expect(r.gained).toEqual({ n: 0, a: 2, b: 2, c: 2 });
  });

  it('sem votos ninguém pontua', () => {
    expect(scoreRound({ ...four, votes: {} }).gained).toEqual({ n: 0, a: 0, b: 0, c: 0 });
  });
});
```

(No penúltimo: ninguém achou → `a` e `b`, que votaram, fazem 2; `c` não votou, mas recebeu 2 votos → 2.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/dixit-scoring.test.ts` (em `shared/`)
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `shared/src/games/dixit/scoring.ts`**

```ts
export interface ScoreInput {
  storyteller: string;
  storyCard: string;
  /** Quem participou da rodada (todos aparecem no resultado, mesmo com 0). */
  inRound: readonly string[];
  /** carta → dono */
  owners: Readonly<Record<string, string>>;
  /** votante → carta (só votos confirmados) */
  votes: Readonly<Record<string, string>>;
}

export interface ScoreResult {
  gained: Record<string, number>;
  found: string[];
}

/**
 * Regra da caixa. "Todos" e "ninguém" contam só quem votou.
 * - Todos ou ninguém acharam: narrador 0, cada votante 2.
 * - Senão: narrador e quem achou fazem 3.
 * - Bônus: cada não-narrador ganha +1 por voto recebido em carta sua.
 */
export function scoreRound(input: ScoreInput): ScoreResult {
  const gained: Record<string, number> = Object.fromEntries(input.inRound.map((p) => [p, 0]));
  const add = (player: string, points: number) => {
    gained[player] = (gained[player] ?? 0) + points;
  };
  const voters = Object.keys(input.votes);
  const found = voters.filter((v) => input.votes[v] === input.storyCard);
  if (found.length === 0 || found.length === voters.length) {
    for (const v of voters) add(v, 2);
  } else {
    add(input.storyteller, 3);
    for (const v of found) add(v, 3);
  }
  for (const card of Object.values(input.votes)) {
    const owner = input.owners[card];
    if (owner !== undefined && owner !== input.storyteller) add(owner, 1);
  }
  return { gained, found };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run test/dixit-scoring.test.ts` (em `shared/`)
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add shared/src/games/dixit/scoring.ts shared/test/dixit-scoring.test.ts
git commit -m "feat(shared): pontuação do Dixit (regra da caixa)"
```

---

### Task 4: Regras do Dixit — lobby e início da partida

**Files:**
- Create: `shared/src/games/dixit/rules.ts`, `shared/test/dixit-helpers.ts`
- Test: `shared/test/dixit-rules.test.ts`

- [ ] **Step 1: Criar os ajudantes de teste `shared/test/dixit-helpers.ts`**

```ts
import type { ActionResult, GameContext } from '../src/game';
import { applyDixitAction, initialDixitState } from '../src/games/dixit/rules';
import type { DixitAction, DixitState } from '../src/games/dixit/types';
import { mulberry32 } from '../src/rng';

export const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `p${i}`);

/** Contexto com `p0` como host por padrão. */
export function ctxOf(active: string[], seed = 1, hostId: string | null = 'p0'): GameContext {
  return { hostId, active, rng: mulberry32(seed) };
}

export function must(res: ActionResult<DixitState>): DixitState {
  if (!res.ok) throw new Error(`ação recusada: ${res.error}`);
  return res.state;
}

export const act = (state: DixitState, playerId: string, action: DixitAction, ctx: GameContext): DixitState =>
  must(applyDixitAction(state, playerId, action, ctx));

/** Partida começada com `n` jogadores (p0…), na narração. */
export function started(n: number, seed = 1): { state: DixitState; ctx: GameContext } {
  const ctx = ctxOf(ids(n), seed);
  return { state: act(initialDixitState(), 'p0', { type: 'start' }, ctx), ctx };
}

/** Não-narradores da rodada. */
export const others = (state: DixitState): string[] => state.inRound.filter((p) => p !== state.storyteller);
```

- [ ] **Step 2: Escrever os testes**

`shared/test/dixit-rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DIXIT_DECK_SIZE } from '../src/games/dixit/deck';
import { applyDixitAction, cleanDixitClue, dixitDeckTooSmall, initialDixitState } from '../src/games/dixit/rules';
import { act, ctxOf, ids, started } from './dixit-helpers';

describe('Dixit: lobby e início', () => {
  it('estado inicial é o lobby com meta 30', () => {
    expect(initialDixitState()).toMatchObject({ phase: 'lobby', target: 30, players: [], storyteller: null });
  });

  it('host troca a meta no lobby; outros não', () => {
    const ctx = ctxOf(ids(3));
    const s = act(initialDixitState(), 'p0', { type: 'setTarget', target: 15 }, ctx);
    expect(s.target).toBe(15);
    expect(applyDixitAction(s, 'p1', { type: 'setTarget', target: 30 }, ctx)).toEqual({ ok: false, error: 'not_host' });
  });

  it('precisa de 3 jogadores ativos', () => {
    const res = applyDixitAction(initialDixitState(), 'p0', { type: 'start' }, ctxOf(ids(2)));
    expect(res).toEqual({ ok: false, error: 'need_3_players' });
  });

  it('só o host começa', () => {
    expect(applyDixitAction(initialDixitState(), 'p1', { type: 'start' }, ctxOf(ids(3)))).toEqual({ ok: false, error: 'not_host' });
  });

  it('com 4 jogadores: 6 cartas cada, narrador sorteado, placar zerado', () => {
    const { state } = started(4);
    expect(state.phase).toBe('storytelling');
    expect(state.players).toEqual(ids(4));
    expect(state.inRound).toEqual(ids(4));
    for (const p of ids(4)) expect(state.hands[p]).toHaveLength(6);
    expect(state.deck).toHaveLength(DIXIT_DECK_SIZE - 24);
    expect(state.scores).toEqual({ p0: 0, p1: 0, p2: 0, p3: 0 });
    expect(ids(4)).toContain(state.storyteller);
    const all = [...state.deck, ...Object.values(state.hands).flat()];
    expect(new Set(all).size).toBe(DIXIT_DECK_SIZE);
  });

  it('com 3 jogadores: 7 cartas cada', () => {
    const { state } = started(3);
    for (const p of ids(3)) expect(state.hands[p]).toHaveLength(7);
  });

  it('baralho mínimo é jogadores × 7', () => {
    expect(dixitDeckTooSmall(10, 69)).toBe(true);
    expect(dixitDeckTooSmall(10, 70)).toBe(false);
    expect(dixitDeckTooSmall(10)).toBe(false);
  });

  it('voltar pro lobby mantém a meta; no lobby não dá', () => {
    const ctx = ctxOf(ids(3));
    const s = act(act(initialDixitState(15), 'p0', { type: 'start' }, ctx), 'p0', { type: 'lobby' }, ctx);
    expect(s).toEqual(initialDixitState(15));
    expect(applyDixitAction(s, 'p0', { type: 'lobby' }, ctx)).toEqual({ ok: false, error: 'bad_phase' });
  });

  it('limpa a dica: espaços e até 80 caracteres', () => {
    expect(cleanDixitClue('  uma   saudade\n')).toBe('uma saudade');
    expect(Array.from(cleanDixitClue('a'.repeat(200)))).toHaveLength(80);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run test/dixit-rules.test.ts` (em `shared/`)
Expected: FAIL — `../src/games/dixit/rules` não existe.

- [ ] **Step 4: Criar `shared/src/games/dixit/rules.ts`**

```ts
import type { ActionResult, GameContext } from '../../game';
import { randomInt, shuffle, type Rng } from '../../rng';
import { DIXIT_DECK_SIZE, dixitCardIds } from './deck';
import {
  DIXIT_CLUE_MAX,
  DIXIT_DEFAULT_TARGET,
  DIXIT_MIN_PLAYERS,
  type DixitAction,
  type DixitState,
  type DixitTarget,
} from './types';

const fail = (error: string): ActionResult<DixitState> => ({ ok: false, error });
const ok = (state: DixitState): ActionResult<DixitState> => ({ ok: true, state });

/** Mão: 7 cartas com 3 jogadores, 6 com mais. */
export const dixitHandSize = (players: number): number => (players === 3 ? 7 : 6);
/** Cartas que cada não-narrador joga: 2 com 3 jogadores, 1 com mais. */
export const dixitPicksPerPlayer = (players: number): number => (players === 3 ? 2 : 1);
/** O baralho precisa cobrir as mãos e uma rodada inteira. */
export const dixitDeckTooSmall = (players: number, deckSize: number = DIXIT_DECK_SIZE): boolean => deckSize < players * 7;

export function cleanDixitClue(raw: string): string {
  return Array.from(raw.replace(/\s+/g, ' ').trim()).slice(0, DIXIT_CLUE_MAX).join('');
}

export function initialDixitState(target: DixitTarget = DIXIT_DEFAULT_TARGET): DixitState {
  return {
    phase: 'lobby',
    target,
    players: [],
    inRound: [],
    scores: {},
    storyteller: null,
    deck: [],
    discard: [],
    hands: {},
    clue: '',
    storyCard: null,
    picks: {},
    votes: {},
    confirmed: [],
    table: [],
    result: null,
    winners: [],
    paused: false,
  };
}

/** Compra até a mão cheia; baralho vazio → embaralha o descarte e continua. */
function refill(state: DixitState, playerIds: readonly string[], size: number, rng: Rng): DixitState {
  let deck = [...state.deck];
  let discard = [...state.discard];
  const hands = { ...state.hands };
  for (const id of playerIds) {
    const hand = [...(hands[id] ?? [])];
    while (hand.length < size) {
      if (deck.length === 0) {
        if (discard.length === 0) break;
        deck = shuffle(rng, discard);
        discard = [];
      }
      hand.push(deck.shift()!);
    }
    hands[id] = hand;
  }
  return { ...state, deck, discard, hands };
}

/** Próximo narrador depois de `after` na ordem da partida, entre quem está na rodada e ativo. */
function nextStoryteller(state: DixitState, active: readonly string[], after: string | null): string | null {
  const order = state.players;
  const start = after === null ? 0 : order.indexOf(after) + 1;
  const rotated = [...order.slice(start), ...order.slice(0, start)];
  return rotated.find((p) => state.inRound.includes(p) && active.includes(p)) ?? null;
}

/** Começa (ou recomeça) a narração: entra quem chegou, mãos cheias, narrador definido. */
function beginRound(state: DixitState, ctx: GameContext, storyteller: { keep: string } | { after: string | null }): DixitState {
  const joiners = ctx.active.filter((p) => !state.players.includes(p));
  const players = [...state.players, ...joiners];
  const inRound = players.filter((p) => ctx.active.includes(p));
  const scores = { ...state.scores };
  for (const p of joiners) scores[p] = 0;
  const reset: DixitState = {
    ...state,
    phase: 'storytelling',
    players,
    inRound,
    scores,
    clue: '',
    storyCard: null,
    picks: {},
    votes: {},
    confirmed: [],
    table: [],
    result: null,
    paused: inRound.length < DIXIT_MIN_PLAYERS,
  };
  const dealt = refill(reset, inRound, dixitHandSize(inRound.length), ctx.rng);
  const chosen = 'keep' in storyteller ? storyteller.keep : nextStoryteller(dealt, ctx.active, storyteller.after);
  return { ...dealt, storyteller: chosen };
}

/** Partida nova com os ativos (também usada em "jogar de novo"). */
function startMatch(state: DixitState, ctx: GameContext): ActionResult<DixitState> {
  if (ctx.active.length < DIXIT_MIN_PLAYERS) return fail('need_3_players');
  if (dixitDeckTooSmall(ctx.active.length)) return fail('deck_too_small');
  const players = [...ctx.active];
  const fresh: DixitState = {
    ...initialDixitState(state.target),
    players,
    scores: Object.fromEntries(players.map((p) => [p, 0])),
    deck: shuffle(ctx.rng, dixitCardIds()),
  };
  const first = players[randomInt(ctx.rng, players.length)]!;
  return ok(beginRound(fresh, ctx, { keep: first }));
}

export function applyDixitAction(
  state: DixitState,
  playerId: string,
  action: DixitAction,
  ctx: GameContext,
): ActionResult<DixitState> {
  const isHost = ctx.hostId === playerId;
  switch (action.type) {
    case 'setTarget':
      if (!isHost) return fail('not_host');
      if (state.phase !== 'lobby') return fail('bad_phase');
      return ok({ ...state, target: action.target });
    case 'start':
      if (!isHost) return fail('not_host');
      if (state.phase !== 'lobby') return fail('bad_phase');
      return startMatch(state, ctx);
    case 'lobby':
      if (!isHost) return fail('not_host');
      if (state.phase === 'lobby') return fail('bad_phase');
      return ok(initialDixitState(state.target));
    default:
      return fail('bad_action');
  }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run test/dixit-rules.test.ts` (em `shared/`) e `npm run typecheck -w shared`
Expected: PASS (9 testes), typecheck sem erro.

- [ ] **Step 6: Commit**

```bash
git add shared/src/games/dixit/rules.ts shared/test/dixit-helpers.ts shared/test/dixit-rules.test.ts
git commit -m "feat(shared): Dixit começa a partida (mãos, narrador, meta)"
```

---

### Task 5: Regras do Dixit — narração, escolha, votação e revelação

**Files:**
- Modify: `shared/src/games/dixit/rules.ts`, `shared/test/dixit-helpers.ts`
- Test: `shared/test/dixit-rules.test.ts`

- [ ] **Step 1: Mais ajudantes em `shared/test/dixit-helpers.ts`**

No topo, troque o import das regras por:

```ts
import { applyDixitAction, dixitPicksPerPlayer, initialDixitState } from '../src/games/dixit/rules';
```

No fim do arquivo, adicione:

```ts
/** Narrador já contou a dica (primeira carta da mão, dica "saudade"). */
export function told(n: number, seed = 1): { state: DixitState; ctx: GameContext } {
  const { state, ctx } = started(n, seed);
  const st = state.storyteller!;
  return { state: act(state, st, { type: 'tell', cardId: state.hands[st]![0]!, clue: 'saudade' }, ctx), ctx };
}

/** Todos escolheram as primeiras cartas da mão e confirmaram: votação aberta. */
export function voting(n: number, seed = 1): { state: DixitState; ctx: GameContext } {
  const start = told(n, seed);
  const ctx = start.ctx;
  let state = start.state;
  const per = dixitPicksPerPlayer(n);
  for (const p of others(state)) {
    state = act(state, p, { type: 'submit', cardIds: state.hands[p]!.slice(0, per) }, ctx);
    state = act(state, p, { type: 'confirm' }, ctx);
  }
  return { state, ctx };
}

/** Todos votam com `choose` e confirmam: revelação. */
export function revealed(
  n: number,
  choose: (state: DixitState, playerId: string) => string,
  seed = 1,
): { state: DixitState; ctx: GameContext } {
  const start = voting(n, seed);
  const ctx = start.ctx;
  let state = start.state;
  for (const p of others(state)) {
    state = act(state, p, { type: 'vote', cardId: choose(state, p) }, ctx);
    state = act(state, p, { type: 'confirm' }, ctx);
  }
  return { state, ctx };
}
```

- [ ] **Step 2: Escrever os testes**

Em `shared/test/dixit-rules.test.ts`, troque a linha de import dos ajudantes por:

```ts
import { act, ctxOf, ids, others, revealed, started, told, voting } from './dixit-helpers';
```

e adicione no fim do arquivo:

```ts
describe('Dixit: narração, escolha e votação', () => {
  it('só o narrador conta a dica, e com carta da própria mão', () => {
    const { state, ctx } = started(4);
    const st = state.storyteller!;
    const other = others(state)[0]!;
    expect(applyDixitAction(state, other, { type: 'tell', cardId: state.hands[other]![0]!, clue: 'x' }, ctx)).toEqual({
      ok: false,
      error: 'not_storyteller',
    });
    expect(applyDixitAction(state, st, { type: 'tell', cardId: 'd999', clue: 'x' }, ctx)).toEqual({ ok: false, error: 'unknown_card' });
  });

  it('contar a dica tira a carta da mão e abre a escolha', () => {
    const { state, ctx } = started(4);
    const st = state.storyteller!;
    const card = state.hands[st]![0]!;
    const s = act(state, st, { type: 'tell', cardId: card, clue: '  uma   saudade ' }, ctx);
    expect(s.phase).toBe('submitting');
    expect(s.storyCard).toBe(card);
    expect(s.clue).toBe('uma saudade');
    expect(s.hands[st]).toHaveLength(5);
    expect(s.hands[st]).not.toContain(card);
  });

  it('dica vazia vale (foi dada na call)', () => {
    const { state, ctx } = started(4);
    const st = state.storyteller!;
    expect(act(state, st, { type: 'tell', cardId: state.hands[st]![0]!, clue: '   ' }, ctx).clue).toBe('');
  });

  it('escolha: número certo de cartas, da própria mão, e dá pra trocar antes de confirmar', () => {
    const { state, ctx } = told(4);
    const st = state.storyteller!;
    const p = others(state)[0]!;
    const hand = state.hands[p]!;
    expect(applyDixitAction(state, st, { type: 'submit', cardIds: [state.hands[st]![0]!] }, ctx)).toEqual({
      ok: false,
      error: 'is_storyteller',
    });
    expect(applyDixitAction(state, p, { type: 'submit', cardIds: hand.slice(0, 2) }, ctx)).toEqual({ ok: false, error: 'wrong_count' });
    expect(applyDixitAction(state, p, { type: 'submit', cardIds: ['d999'] }, ctx)).toEqual({ ok: false, error: 'unknown_card' });
    const s = act(state, p, { type: 'submit', cardIds: [hand[0]!] }, ctx);
    expect(s.picks[p]).toEqual([hand[0]]);
    expect(act(s, p, { type: 'submit', cardIds: [hand[1]!] }, ctx).picks[p]).toEqual([hand[1]]);
  });

  it('confirmar sem escolher não dá; depois de confirmar não muda mais', () => {
    const { state, ctx } = told(4);
    const p = others(state)[0]!;
    expect(applyDixitAction(state, p, { type: 'confirm' }, ctx)).toEqual({ ok: false, error: 'nothing_chosen' });
    const s = act(act(state, p, { type: 'submit', cardIds: [state.hands[p]![0]!] }, ctx), p, { type: 'confirm' }, ctx);
    expect(s.confirmed).toEqual([p]);
    expect(applyDixitAction(s, p, { type: 'submit', cardIds: [s.hands[p]![1]!] }, ctx)).toEqual({
      ok: false,
      error: 'already_confirmed',
    });
  });

  it('com 3 jogadores cada um joga 2 cartas', () => {
    const { state, ctx } = told(3);
    const p = others(state)[0]!;
    expect(applyDixitAction(state, p, { type: 'submit', cardIds: [state.hands[p]![0]!] }, ctx)).toEqual({
      ok: false,
      error: 'wrong_count',
    });
    expect(act(state, p, { type: 'submit', cardIds: state.hands[p]!.slice(0, 2) }, ctx).picks[p]).toHaveLength(2);
  });

  it('quando todos confirmam, as cartas vão pra mesa e saem das mãos', () => {
    const { state } = voting(4);
    expect(state.phase).toBe('voting');
    expect(state.table).toHaveLength(4);
    expect(state.table).toContain(state.storyCard);
    for (const p of others(state)) {
      expect(state.hands[p]).toHaveLength(5);
      for (const c of state.picks[p]!) expect(state.table).toContain(c);
    }
    expect(state.confirmed).toEqual([]);
  });

  it('com 3 jogadores a mesa tem 5 cartas', () => {
    expect(voting(3).state.table).toHaveLength(5);
  });

  it('voto: só cartas da mesa, nunca a própria, narrador não vota', () => {
    const { state, ctx } = voting(4);
    const st = state.storyteller!;
    const p = others(state)[0]!;
    expect(applyDixitAction(state, st, { type: 'vote', cardId: state.table[0]! }, ctx)).toEqual({ ok: false, error: 'is_storyteller' });
    expect(applyDixitAction(state, p, { type: 'vote', cardId: 'd999' }, ctx)).toEqual({ ok: false, error: 'unknown_card' });
    expect(applyDixitAction(state, p, { type: 'vote', cardId: state.picks[p]![0]! }, ctx)).toEqual({ ok: false, error: 'own_card' });
    expect(act(state, p, { type: 'vote', cardId: state.storyCard! }, ctx).votes[p]).toBe(state.storyCard);
  });

  it('todos acharam: revelação com narrador 0 e os outros 2', () => {
    const { state } = revealed(4, (s) => s.storyCard!);
    const st = state.storyteller!;
    expect(state.phase).toBe('reveal');
    expect(state.scores[st]).toBe(0);
    for (const p of others(state)) expect(state.scores[p]).toBe(2);
    expect(state.result).toMatchObject({ storyteller: st, storyCard: state.storyCard, clue: 'saudade', table: state.table });
    expect(state.result!.found).toEqual(others(state));
    expect(state.discard).toEqual(state.table);
  });

  it('alguns acharam: narrador e quem achou fazem 3, com bônus', () => {
    const { state } = revealed(4, (s, p) => {
      const a = others(s)[0]!;
      return p === a ? s.storyCard! : s.picks[a]![0]!;
    });
    const [a, b, c] = others(state);
    expect(state.scores[state.storyteller!]).toBe(3);
    expect(state.scores[a!]).toBe(5);
    expect(state.scores[b!]).toBe(0);
    expect(state.scores[c!]).toBe(0);
    expect(state.result!.owners[state.storyCard!]).toBe(state.storyteller);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run test/dixit-rules.test.ts` (em `shared/`)
Expected: FAIL — os testes novos recebem `bad_action` (as ações ainda caem no `default`).

- [ ] **Step 4: Implementar em `shared/src/games/dixit/rules.ts`**

Troque o import de `./types` e adicione o de `./scoring`:

```ts
import { scoreRound } from './scoring';
import {
  DIXIT_CLUE_MAX,
  DIXIT_DEFAULT_TARGET,
  DIXIT_MIN_PLAYERS,
  type DixitAction,
  type DixitPhase,
  type DixitState,
  type DixitTarget,
} from './types';
```

Logo acima de `export function applyDixitAction`, adicione:

```ts
/** Não-narradores da rodada que estão ativos: são eles que precisam confirmar. */
function mustAct(state: DixitState, ctx: GameContext): string[] {
  return state.inRound.filter((p) => p !== state.storyteller && ctx.active.includes(p));
}

/** Por que `playerId` não pode agir nesta etapa (ou null se pode). */
function actorError(state: DixitState, playerId: string, phase: DixitPhase): string | null {
  if (state.phase !== phase) return 'bad_phase';
  if (state.paused) return 'paused';
  if (!state.inRound.includes(playerId)) return 'not_player';
  if (playerId === state.storyteller) return 'is_storyteller';
  if (state.confirmed.includes(playerId)) return 'already_confirmed';
  return null;
}

/** Só as escolhas confirmadas vão pra mesa, embaralhadas junto com a do narrador. */
function toVoting(state: DixitState, ctx: GameContext): DixitState {
  const picks: Record<string, string[]> = Object.fromEntries(state.confirmed.map((p) => [p, state.picks[p] ?? []]));
  const played = Object.values(picks).flat();
  const hands = { ...state.hands };
  for (const [p, cards] of Object.entries(picks)) hands[p] = (hands[p] ?? []).filter((c) => !cards.includes(c));
  const table = shuffle(ctx.rng, [state.storyCard!, ...played]);
  return { ...state, phase: 'voting', picks, hands, table, votes: {}, confirmed: [] };
}

/** Só votos confirmados contam. Cartas da mesa vão pro descarte. */
function toReveal(state: DixitState): DixitState {
  const storyteller = state.storyteller!;
  const storyCard = state.storyCard!;
  const votes: Record<string, string> = {};
  for (const p of state.confirmed) {
    const v = state.votes[p];
    if (v !== undefined) votes[p] = v;
  }
  const owners: Record<string, string> = { [storyCard]: storyteller };
  for (const [p, cards] of Object.entries(state.picks)) for (const c of cards) owners[c] = p;
  const { gained, found } = scoreRound({ storyteller, storyCard, inRound: state.inRound, owners, votes });
  const scores = { ...state.scores };
  for (const [p, n] of Object.entries(gained)) scores[p] = (scores[p] ?? 0) + n;
  return {
    ...state,
    phase: 'reveal',
    scores,
    votes,
    discard: [...state.discard, ...state.table],
    result: { storyteller, storyCard, clue: state.clue, table: state.table, owners, votes, gained, found },
  };
}

/** Avança a etapa quando todos os ativos que precisam confirmar confirmaram. */
function maybeAdvance(state: DixitState, ctx: GameContext): DixitState {
  if (state.paused) return state;
  const need = mustAct(state, ctx);
  if (need.length === 0 || !need.every((p) => state.confirmed.includes(p))) return state;
  if (state.phase === 'submitting') return toVoting(state, ctx);
  if (state.phase === 'voting') return toReveal(state);
  return state;
}
```

No `switch` de `applyDixitAction`, logo antes de `default:`, adicione:

```ts
    case 'tell': {
      if (state.phase !== 'storytelling') return fail('bad_phase');
      if (state.paused) return fail('paused');
      if (playerId !== state.storyteller) return fail('not_storyteller');
      const hand = state.hands[playerId] ?? [];
      if (!hand.includes(action.cardId)) return fail('unknown_card');
      return ok({
        ...state,
        phase: 'submitting',
        storyCard: action.cardId,
        clue: cleanDixitClue(action.clue),
        hands: { ...state.hands, [playerId]: hand.filter((c) => c !== action.cardId) },
        picks: {},
        confirmed: [],
      });
    }
    case 'submit': {
      const e = actorError(state, playerId, 'submitting');
      if (e) return fail(e);
      const hand = state.hands[playerId] ?? [];
      const cards = action.cardIds;
      if (cards.length !== dixitPicksPerPlayer(state.inRound.length)) return fail('wrong_count');
      if (new Set(cards).size !== cards.length || !cards.every((c) => hand.includes(c))) return fail('unknown_card');
      return ok({ ...state, picks: { ...state.picks, [playerId]: [...cards] } });
    }
    case 'vote': {
      const e = actorError(state, playerId, 'voting');
      if (e) return fail(e);
      if (!state.table.includes(action.cardId)) return fail('unknown_card');
      if ((state.picks[playerId] ?? []).includes(action.cardId)) return fail('own_card');
      return ok({ ...state, votes: { ...state.votes, [playerId]: action.cardId } });
    }
    case 'confirm': {
      if (state.phase !== 'submitting' && state.phase !== 'voting') return fail('bad_phase');
      const e = actorError(state, playerId, state.phase);
      if (e) return fail(e);
      const chosen =
        state.phase === 'submitting' ? (state.picks[playerId]?.length ?? 0) > 0 : Object.hasOwn(state.votes, playerId);
      if (!chosen) return fail('nothing_chosen');
      return ok(maybeAdvance({ ...state, confirmed: [...state.confirmed, playerId] }, ctx));
    }
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run test/dixit-rules.test.ts` (em `shared/`) e `npm run typecheck -w shared`
Expected: PASS (20 testes).

- [ ] **Step 6: Commit**

```bash
git add shared/src/games/dixit/rules.ts shared/test/dixit-helpers.ts shared/test/dixit-rules.test.ts
git commit -m "feat(shared): Dixit narra, escolhe, vota e revela com pontos"
```

---

### Task 6: Regras do Dixit — próxima rodada, fim de jogo e destravar

**Files:**
- Modify: `shared/src/games/dixit/rules.ts`
- Test: `shared/test/dixit-rules.test.ts`

- [ ] **Step 1: Escrever os testes**

Adicione no fim de `shared/test/dixit-rules.test.ts`:

```ts
describe('Dixit: fim da rodada e da partida', () => {
  it('próxima rodada: narrador seguinte na ordem e mãos cheias', () => {
    const { state, ctx } = revealed(4, (s) => s.storyCard!);
    const i = state.players.indexOf(state.storyteller!);
    const s = act(state, 'p0', { type: 'next' }, ctx);
    expect(s.phase).toBe('storytelling');
    expect(s.storyteller).toBe(state.players[(i + 1) % 4]);
    for (const p of ids(4)) expect(s.hands[p]).toHaveLength(6);
    expect(s).toMatchObject({ clue: '', storyCard: null, table: [], result: null, picks: {}, votes: {}, confirmed: [] });
    expect(s.scores).toEqual(state.scores);
  });

  it('só o host passa pra próxima, e só na revelação', () => {
    const { state, ctx } = revealed(4, (s) => s.storyCard!);
    expect(applyDixitAction(state, 'p1', { type: 'next' }, ctx)).toEqual({ ok: false, error: 'not_host' });
    expect(applyDixitAction(voting(4).state, 'p0', { type: 'next' }, ctx)).toEqual({ ok: false, error: 'bad_phase' });
  });

  it('baralho vazio: o descarte é embaralhado e vira baralho', () => {
    const { state, ctx } = revealed(4, (s) => s.storyCard!);
    const s = act({ ...state, deck: [] }, 'p0', { type: 'next' }, ctx);
    for (const p of ids(4)) expect(s.hands[p]).toHaveLength(6);
    expect(s.discard).toEqual([]);
    expect(s.deck).toEqual([]);
  });

  it('alguém chegou na meta: fim de jogo com vencedor', () => {
    const { state, ctx } = revealed(4, (s) => s.storyCard!);
    const s = act({ ...state, scores: { ...state.scores, p2: 30 } }, 'p0', { type: 'next' }, ctx);
    expect(s.phase).toBe('gameover');
    expect(s.winners).toEqual(['p2']);
  });

  it('empate no topo: todos os empatados vencem', () => {
    const { state, ctx } = revealed(4, (s) => s.storyCard!);
    const s = act({ ...state, scores: { p0: 3, p1: 31, p2: 12, p3: 31 } }, 'p0', { type: 'next' }, ctx);
    expect(s.winners).toEqual(['p1', 'p3']);
  });

  it('meta curta: 15 pontos', () => {
    const { state, ctx } = revealed(4, (s) => s.storyCard!);
    const s = act({ ...state, target: 15, scores: { ...state.scores, p1: 15 } }, 'p0', { type: 'next' }, ctx);
    expect(s.phase).toBe('gameover');
  });

  it('jogar de novo: placar zerado e mãos novas', () => {
    const { state, ctx } = revealed(4, (s) => s.storyCard!);
    const over = act({ ...state, scores: { ...state.scores, p2: 30 } }, 'p0', { type: 'next' }, ctx);
    expect(applyDixitAction(state, 'p0', { type: 'again' }, ctx)).toEqual({ ok: false, error: 'bad_phase' });
    const s = act(over, 'p0', { type: 'again' }, ctx);
    expect(s.phase).toBe('storytelling');
    expect(s.scores).toEqual({ p0: 0, p1: 0, p2: 0, p3: 0 });
    expect(s.winners).toEqual([]);
    for (const p of ids(4)) expect(s.hands[p]).toHaveLength(6);
  });

  it('destravar na narração: a vez passa pro próximo', () => {
    const { state, ctx } = started(4);
    const i = state.players.indexOf(state.storyteller!);
    const s = act(state, 'p0', { type: 'forceNext' }, ctx);
    expect(s.phase).toBe('storytelling');
    expect(s.storyteller).toBe(state.players[(i + 1) % 4]);
  });

  it('destravar na escolha: segue só com quem confirmou', () => {
    const start = told(4);
    const ctx = start.ctx;
    let state = start.state;
    expect(applyDixitAction(state, 'p0', { type: 'forceNext' }, ctx)).toEqual({ ok: false, error: 'nothing_chosen' });
    const a = others(state)[0]!;
    state = act(state, a, { type: 'submit', cardIds: [state.hands[a]![0]!] }, ctx);
    state = act(state, a, { type: 'confirm' }, ctx);
    const s = act(state, 'p0', { type: 'forceNext' }, ctx);
    expect(s.phase).toBe('voting');
    expect(s.table).toHaveLength(2);
  });

  it('destravar na votação: revela com os votos confirmados', () => {
    const start = voting(4);
    const ctx = start.ctx;
    let state = start.state;
    const a = others(state)[0]!;
    state = act(state, a, { type: 'vote', cardId: state.storyCard! }, ctx);
    state = act(state, a, { type: 'confirm' }, ctx);
    const s = act(state, 'p0', { type: 'forceNext' }, ctx);
    expect(s.phase).toBe('reveal');
    expect(Object.keys(s.result!.votes)).toEqual([a]);
  });

  it('só o host destrava', () => {
    const { state, ctx } = started(4);
    expect(applyDixitAction(state, 'p1', { type: 'forceNext' }, ctx)).toEqual({ ok: false, error: 'not_host' });
  });
});
```

(No teste do baralho vazio: na revelação o descarte tem as 4 cartas da mesa; cada um dos 4 compra 1, então o baralho e o descarte terminam vazios.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/dixit-rules.test.ts` (em `shared/`)
Expected: FAIL — `next`, `again` e `forceNext` caem no `default` (`bad_action`).

- [ ] **Step 3: Implementar em `shared/src/games/dixit/rules.ts`**

Logo acima de `export function applyDixitAction`, adicione:

```ts
/** Depois da revelação: fim de jogo se alguém chegou na meta, senão a próxima narração. */
function afterReveal(state: DixitState, ctx: GameContext): DixitState {
  const top = Math.max(...state.players.map((p) => state.scores[p] ?? 0));
  if (top >= state.target) {
    return { ...state, phase: 'gameover', winners: state.players.filter((p) => (state.scores[p] ?? 0) === top) };
  }
  return beginRound(state, ctx, { after: state.storyteller });
}
```

No `switch`, logo antes de `default:`, adicione:

```ts
    case 'forceNext': {
      if (!isHost) return fail('not_host');
      if (state.paused) return fail('paused');
      if (state.phase === 'storytelling') return ok(beginRound(state, ctx, { after: state.storyteller }));
      if (state.phase === 'submitting') {
        if (state.confirmed.length === 0) return fail('nothing_chosen');
        return ok(toVoting(state, ctx));
      }
      if (state.phase === 'voting') return ok(toReveal(state));
      return fail('bad_phase');
    }
    case 'next':
      if (!isHost) return fail('not_host');
      if (state.phase !== 'reveal') return fail('bad_phase');
      return ok(afterReveal(state, ctx));
    case 'again':
      if (!isHost) return fail('not_host');
      if (state.phase !== 'gameover') return fail('bad_phase');
      return startMatch(state, ctx);
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run test/dixit-rules.test.ts` (em `shared/`) e `npm run typecheck -w shared`
Expected: PASS (31 testes).

- [ ] **Step 5: Commit**

```bash
git add shared/src/games/dixit/rules.ts shared/test/dixit-rules.test.ts
git commit -m "feat(shared): Dixit passa a vez, termina na meta e o host destrava"
```

---

### Task 7: Regras do Dixit — presença (sair, voltar, entrar no meio)

O servidor chama `onPresenceChange` em todo `tick` (inclusive em alarmes). Ele **precisa devolver o mesmo objeto** quando nada muda, senão o Durable Object grava e transmite à toa.

**Files:**
- Modify: `shared/src/games/dixit/rules.ts`
- Test: `shared/test/dixit-rules.test.ts`

- [ ] **Step 1: Escrever os testes**

Em `shared/test/dixit-rules.test.ts`, inclua `dixitOnPresenceChange` no import de `../src/games/dixit/rules` e adicione no fim:

```ts
describe('Dixit: presença', () => {
  it('nada mudou: devolve o mesmo objeto', () => {
    for (const { state, ctx } of [started(4), told(4), voting(4), revealed(4, (s) => s.storyCard!)]) {
      expect(dixitOnPresenceChange(state, ctx)).toBe(state);
    }
    const lobby = initialDixitState();
    expect(dixitOnPresenceChange(lobby, ctxOf(ids(4)))).toBe(lobby);
  });

  it('narrador saiu antes de narrar: a vez passa pro próximo', () => {
    const { state } = started(4);
    const st = state.storyteller!;
    const i = state.players.indexOf(st);
    const s = dixitOnPresenceChange(state, ctxOf(ids(4).filter((p) => p !== st)));
    expect(s.storyteller).toBe(state.players[(i + 1) % 4]);
    expect(s.inRound).not.toContain(st);
  });

  it('quem entra durante a narração já recebe mão', () => {
    const { state } = started(4);
    const s = dixitOnPresenceChange(state, ctxOf([...ids(4), 'p9']));
    expect(s.players).toEqual([...ids(4), 'p9']);
    expect(s.inRound).toContain('p9');
    expect(s.hands.p9).toHaveLength(6);
    expect(s.scores.p9).toBe(0);
    expect(s.storyteller).toBe(state.storyteller);
  });

  it('jogador sai na escolha: a rodada segue sem ele', () => {
    const start = told(4);
    let state = start.state;
    const [a, b, c] = others(state);
    for (const p of [a!, b!]) {
      state = act(state, p, { type: 'submit', cardIds: [state.hands[p]![0]!] }, start.ctx);
      state = act(state, p, { type: 'confirm' }, start.ctx);
    }
    expect(state.phase).toBe('submitting');
    const s = dixitOnPresenceChange(state, ctxOf(ids(4).filter((p) => p !== c)));
    expect(s.phase).toBe('voting');
    expect(s.table).toHaveLength(3);
  });

  it('jogador sai na votação: revela sem ele', () => {
    const start = voting(4);
    let state = start.state;
    const [a, b, c] = others(state);
    for (const p of [a!, b!]) {
      state = act(state, p, { type: 'vote', cardId: state.storyCard! }, start.ctx);
      state = act(state, p, { type: 'confirm' }, start.ctx);
    }
    const s = dixitOnPresenceChange(state, ctxOf(ids(4).filter((p) => p !== c)));
    expect(s.phase).toBe('reveal');
    expect(Object.keys(s.result!.votes).sort()).toEqual([a, b].sort());
  });

  it('menos de 3 ativos: pausa, e volta sozinho quando a pessoa volta', () => {
    const start = told(3);
    const [a, b] = others(start.state);
    const paused = dixitOnPresenceChange(start.state, ctxOf(ids(3).filter((p) => p !== a)));
    expect(paused.paused).toBe(true);
    expect(applyDixitAction(paused, b!, { type: 'submit', cardIds: paused.hands[b!]!.slice(0, 2) }, start.ctx)).toEqual({
      ok: false,
      error: 'paused',
    });
    const back = dixitOnPresenceChange(paused, ctxOf(ids(3)));
    expect(back.paused).toBe(false);
    expect(back.phase).toBe('submitting');
  });

  it('quem entra na votação espera e joga a próxima rodada', () => {
    const start = voting(4);
    const withNew = ctxOf([...ids(4), 'p9']);
    let state = dixitOnPresenceChange(start.state, withNew);
    expect(state.inRound).not.toContain('p9');
    for (const p of others(state)) {
      state = act(state, p, { type: 'vote', cardId: state.storyCard! }, withNew);
      state = act(state, p, { type: 'confirm' }, withNew);
    }
    const next = act(state, 'p0', { type: 'next' }, withNew);
    expect(next.inRound).toContain('p9');
    expect(next.hands.p9).toHaveLength(6);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/dixit-rules.test.ts` (em `shared/`)
Expected: FAIL — `dixitOnPresenceChange` não existe.

- [ ] **Step 3: Implementar em `shared/src/games/dixit/rules.ts`**

No fim do arquivo, adicione:

```ts
function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/**
 * Reavaliado quando alguém entra, sai ou expira a tolerância de desconexão.
 * Devolve o MESMO objeto quando nada muda (o servidor compara referência).
 */
export function dixitOnPresenceChange(state: DixitState, ctx: GameContext): DixitState {
  if (state.phase === 'storytelling') {
    // Nada foi jogado ainda: dá pra refazer a rodada com quem está aqui agora.
    const st = state.storyteller;
    const next = beginRound(state, ctx, st !== null && ctx.active.includes(st) ? { keep: st } : { after: st });
    const same =
      next.storyteller === state.storyteller &&
      next.paused === state.paused &&
      sameList(next.players, state.players) &&
      sameList(next.inRound, state.inRound);
    return same ? state : next;
  }
  if (state.phase !== 'submitting' && state.phase !== 'voting') return state;
  const paused = state.inRound.filter((p) => ctx.active.includes(p)).length < DIXIT_MIN_PLAYERS;
  const next = paused === state.paused ? state : { ...state, paused };
  return paused ? next : maybeAdvance(next, ctx);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run test/dixit-rules.test.ts` (em `shared/`) e `npm run typecheck -w shared`
Expected: PASS (38 testes).

- [ ] **Step 5: Commit**

```bash
git add shared/src/games/dixit/rules.ts shared/test/dixit-rules.test.ts
git commit -m "feat(shared): Dixit lida com quem sai, volta e entra no meio"
```

---

### Task 8: Visão do Dixit (segredos) e o módulo `dixit`

**Files:**
- Create: `shared/src/games/dixit/view.ts`
- Test: `shared/test/dixit-view.test.ts`

- [ ] **Step 1: Escrever os testes**

`shared/test/dixit-view.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { dixit, dixitViewFor } from '../src/games/dixit/view';
import { act, others, revealed, started, told, voting } from './dixit-helpers';

describe('dixitViewFor', () => {
  it('cada um vê só a própria mão', () => {
    const { state } = started(4);
    const v = dixitViewFor(state, 'p1');
    expect(v.hand).toEqual(state.hands.p1);
    expect(v.handCounts).toEqual({ p0: 6, p1: 6, p2: 6, p3: 6 });
    expect(v.deckCount).toBe(state.deck.length);
    const json = JSON.stringify(v);
    for (const c of state.hands.p2!) expect(json).not.toContain(`"${c}"`);
    expect(json).not.toContain(`"${state.deck[0]}"`);
  });

  it('espectador não vê mão nenhuma', () => {
    expect(dixitViewFor(started(4).state, null).hand).toEqual([]);
  });

  it('na escolha: carta do narrador só pra ele; escolhas só de quem escolheu', () => {
    const start = told(4);
    const st = start.state.storyteller!;
    const [a, b] = others(start.state);
    const picked = act(start.state, a!, { type: 'submit', cardIds: [start.state.hands[a!]![0]!] }, start.ctx);
    const s = act(picked, a!, { type: 'confirm' }, start.ctx);
    expect(dixitViewFor(s, st).storyCard).toBe(s.storyCard);
    expect(dixitViewFor(s, a!).myPicks).toEqual(s.picks[a!]);
    const vb = dixitViewFor(s, b!);
    expect(vb.storyCard).toBeNull();
    expect(vb.myPicks).toEqual([]);
    expect(vb.confirmed).toEqual([a]);
    expect(vb.tableCount).toBe(2);
    expect(vb.table).toEqual([]);
    const json = JSON.stringify(vb);
    expect(json).not.toContain(`"${s.storyCard}"`);
    expect(json).not.toContain(`"${s.picks[a!]![0]}"`);
  });

  it('na votação: mesa sem dono, só o meu voto, sem resultado', () => {
    const start = voting(4);
    const [a, b] = others(start.state);
    const s = act(start.state, a!, { type: 'vote', cardId: start.state.storyCard! }, start.ctx);
    const va = dixitViewFor(s, a!);
    const vb = dixitViewFor(s, b!);
    expect(va.table.map((t) => t.cardId)).toEqual(s.table);
    expect(va.table.filter((t) => t.mine).map((t) => t.cardId)).toEqual(s.picks[a!]);
    expect(va.myVote).toBe(s.storyCard);
    expect(vb.myVote).toBeNull();
    expect(vb.storyCard).toBeNull();
    expect(vb.result).toBeNull();
    expect(vb).not.toHaveProperty('votes');
    expect(vb).not.toHaveProperty('picks');
    expect(vb).not.toHaveProperty('deck');
  });

  it('na revelação: tudo aberto', () => {
    const { state } = revealed(4, (s) => s.storyCard!);
    const v = dixitViewFor(state, 'p1');
    expect(v.storyCard).toBe(state.storyCard);
    expect(v.result).toEqual(state.result);
  });

  it('o módulo junta regras e visão', () => {
    expect(dixit.id).toBe('dixit');
    expect(dixit.initialState().phase).toBe('lobby');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/dixit-view.test.ts` (em `shared/`)
Expected: FAIL — `../src/games/dixit/view` não existe.

- [ ] **Step 3: Criar `shared/src/games/dixit/view.ts`**

```ts
import type { GameModule } from '../../game';
import { applyDixitAction, dixitOnPresenceChange, initialDixitState } from './rules';
import type { DixitAction, DixitState, DixitView } from './types';

/**
 * Única fronteira de segredo do Dixit: mãos alheias, carta do narrador, escolhas e votos
 * só aparecem para quem pode ver (todo mundo, a partir da revelação).
 */
export function dixitViewFor(state: DixitState, viewerId: string | null): DixitView {
  const revealed = state.phase === 'reveal' || state.phase === 'gameover';
  const me = viewerId ?? '';
  const myPicks = viewerId === null ? [] : (state.picks[me] ?? []);
  const isStoryteller = viewerId !== null && viewerId === state.storyteller;
  const tableCount =
    state.phase === 'submitting'
      ? 1 + state.confirmed.reduce((n, p) => n + (state.picks[p]?.length ?? 0), 0)
      : state.table.length;
  return {
    phase: state.phase,
    target: state.target,
    players: state.players,
    inRound: state.inRound,
    scores: state.scores,
    storyteller: state.storyteller,
    clue: state.clue,
    paused: state.paused,
    winners: state.winners,
    result: revealed ? state.result : null,
    hand: viewerId === null ? [] : (state.hands[me] ?? []),
    handCounts: Object.fromEntries(Object.entries(state.hands).map(([p, hand]) => [p, hand.length])),
    deckCount: state.deck.length,
    storyCard: revealed || isStoryteller ? state.storyCard : null,
    myPicks,
    myVote: viewerId === null ? null : (state.votes[me] ?? null),
    confirmed: state.confirmed,
    tableCount,
    table: state.table.map((cardId) => ({
      cardId,
      mine: myPicks.includes(cardId) || (isStoryteller && cardId === state.storyCard),
    })),
  };
}

export const dixit: GameModule<DixitState, DixitAction, DixitView> = {
  id: 'dixit',
  initialState: () => initialDixitState(),
  applyAction: applyDixitAction,
  viewFor: dixitViewFor,
  onPresenceChange: dixitOnPresenceChange,
};
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run test/dixit-view.test.ts` (em `shared/`) e `npm run typecheck -w shared`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add shared/src/games/dixit/view.ts shared/test/dixit-view.test.ts
git commit -m "feat(shared): visão do Dixit esconde mãos, carta do narrador e votos"
```

---

### Task 9: Schema das ações do Dixit, erros novos e exports

**Files:**
- Create: `shared/src/games/dixit/schema.ts`
- Modify: `shared/src/protocol.ts`, `shared/src/index.ts`
- Test: `shared/test/dixit-schema.test.ts`

- [ ] **Step 1: Escrever os testes**

`shared/test/dixit-schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { dixitActionSchema } from '../src/games/dixit/schema';
import { ERROR_CODES, errorMessage } from '../src/protocol';

describe('dixitActionSchema', () => {
  it('aceita as ações do Dixit', () => {
    for (const a of [
      { type: 'setTarget', target: 15 },
      { type: 'start' },
      { type: 'tell', cardId: 'd001', clue: 'saudade' },
      { type: 'submit', cardIds: ['d002', 'd003'] },
      { type: 'vote', cardId: 'd004' },
      { type: 'confirm' },
      { type: 'forceNext' },
      { type: 'next' },
      { type: 'again' },
      { type: 'lobby' },
    ]) {
      expect(dixitActionSchema.safeParse(a).success).toBe(true);
    }
  });

  it('recusa meta fora de 15/30, escolha vazia ou grande demais, e ações do ITO', () => {
    expect(dixitActionSchema.safeParse({ type: 'setTarget', target: 20 }).success).toBe(false);
    expect(dixitActionSchema.safeParse({ type: 'submit', cardIds: [] }).success).toBe(false);
    expect(dixitActionSchema.safeParse({ type: 'submit', cardIds: ['a', 'b', 'c'] }).success).toBe(false);
    expect(dixitActionSchema.safeParse({ type: 'place', cardId: 'x', index: 0 }).success).toBe(false);
  });
});

describe('erros do Dixit', () => {
  it('têm mensagem em português', () => {
    for (const code of [
      'need_3_players',
      'not_storyteller',
      'is_storyteller',
      'own_card',
      'wrong_count',
      'nothing_chosen',
      'already_confirmed',
      'paused',
      'deck_too_small',
    ]) {
      expect(ERROR_CODES).toContain(code);
      expect(errorMessage(code)).not.toBe('Algo deu errado.');
    }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/dixit-schema.test.ts` (em `shared/`)
Expected: FAIL — schema não existe.

- [ ] **Step 3: Criar `shared/src/games/dixit/schema.ts`**

```ts
import { z } from 'zod';
import type { DixitAction } from './types';

const cardId = z.string().min(1).max(16);

export const dixitActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('setTarget'), target: z.union([z.literal(15), z.literal(30)]) }),
  z.object({ type: z.literal('start') }),
  z.object({ type: z.literal('tell'), cardId, clue: z.string().max(400) }),
  z.object({ type: z.literal('submit'), cardIds: z.array(cardId).min(1).max(2) }),
  z.object({ type: z.literal('vote'), cardId }),
  z.object({ type: z.literal('confirm') }),
  z.object({ type: z.literal('forceNext') }),
  z.object({ type: z.literal('next') }),
  z.object({ type: z.literal('again') }),
  z.object({ type: z.literal('lobby') }),
]);

/** Falha a compilação se o schema divergir do tipo DixitAction. */
type Assert<T extends true> = T;
export type DixitActionSchemaMatches = Assert<z.infer<typeof dixitActionSchema> extends DixitAction ? true : false>;
export type DixitActionTypeCovered = Assert<DixitAction extends z.infer<typeof dixitActionSchema> ? true : false>;
```

- [ ] **Step 4: Códigos de erro em `shared/src/protocol.ts`**

No array `ERROR_CODES`, depois de `'card_on_table',`, adicione:

```ts
  'need_3_players',
  'not_storyteller',
  'is_storyteller',
  'own_card',
  'wrong_count',
  'nothing_chosen',
  'already_confirmed',
  'paused',
  'deck_too_small',
```

No objeto `ERROR_MESSAGES`, depois de `card_on_table: …,`, adicione:

```ts
  need_3_players: 'Precisa de pelo menos 3 jogadores.',
  not_storyteller: 'Só quem narra escolhe a carta da dica.',
  is_storyteller: 'Quem narra só espera nesta etapa.',
  own_card: 'Não dá pra votar na própria carta.',
  wrong_count: 'Escolha o número certo de cartas.',
  nothing_chosen: 'Escolha antes de confirmar.',
  already_confirmed: 'Você já confirmou.',
  paused: 'Esperando gente: precisa de 3 pessoas na mesa.',
  deck_too_small: 'O baralho tem poucas cartas pra tanta gente.',
```

- [ ] **Step 5: Exports em `shared/src/index.ts`**

Adicione no fim:

```ts
export * from './games/dixit/types';
export { DIXIT_DECK_SIZE, dixitCardIds } from './games/dixit/deck';
export { scoreRound } from './games/dixit/scoring';
export {
  applyDixitAction,
  cleanDixitClue,
  dixitDeckTooSmall,
  dixitHandSize,
  dixitOnPresenceChange,
  dixitPicksPerPlayer,
  initialDixitState,
} from './games/dixit/rules';
export { dixit, dixitViewFor } from './games/dixit/view';
export { dixitActionSchema } from './games/dixit/schema';
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npm test -w shared && npm run typecheck`
Expected: PASS (inclusive o teste antigo "tem mensagem em português para todos os códigos de erro").

- [ ] **Step 7: Commit**

```bash
git add shared/src/games/dixit/schema.ts shared/src/protocol.ts shared/src/index.ts shared/test/dixit-schema.test.ts
git commit -m "feat(shared): schema das ações e mensagens de erro do Dixit"
```

---

### Task 10: Registro de jogos e sala genérica

Depois desta tarefa `shared` fica verde; `web` e `server` ficam com **erros de tipo** até as Tarefas 11 e 12 (os testes deles continuam passando em tempo de execução).

**Files:**
- Create: `shared/src/games/registry.ts`
- Modify: `shared/src/room.ts`, `shared/src/protocol.ts`, `shared/src/history.ts`, `shared/src/index.ts`
- Test: `shared/test/room-games.test.ts`; ajustes em `shared/test/room.test.ts`, `shared/test/history.test.ts`, `shared/test/protocol.test.ts`

- [ ] **Step 1: Escrever os testes**

`shared/test/room-games.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { GAMES, isGameId } from '../src/games/registry';
import { PLAYER_COLORS } from '../src/players';
import { parseClientMessage } from '../src/protocol';
import { mulberry32 } from '../src/rng';
import {
  createRoom,
  isDixitRoomView,
  isItoRoomView,
  itoStateOf,
  joinRoom,
  restoreRoom,
  roomAction,
  roomSummary,
  roomView,
  tick,
  type Room,
} from '../src/room';

const rng = mulberry32(3);

function dixitRoom(n: number): Room {
  let room = createRoom('ABCD', 0, null, 'dixit');
  for (let i = 0; i < n; i++) {
    const res = joinRoom(room, { token: `t${i}`, name: `P${i}`, color: PLAYER_COLORS[i]! }, `p${i}`, 0);
    if (!res.ok) throw new Error(res.error);
    room = res.room;
  }
  return room;
}

describe('registro de jogos', () => {
  it('conhece ITO e Dixit', () => {
    expect(Object.keys(GAMES)).toEqual(['ito', 'dixit']);
    expect(GAMES.dixit.minPlayers).toBe(3);
    expect(GAMES.ito.liveCursors).toBe(true);
    expect(GAMES.dixit.liveCursors).toBe(false);
    expect(isGameId('dixit')).toBe(true);
    expect(isGameId('xadrez')).toBe(false);
    expect(isGameId(undefined)).toBe(false);
  });
});

describe('sala com jogo', () => {
  it('sala nova é de ITO por padrão', () => {
    const room = createRoom('ABCD', 0);
    expect(room.gameId).toBe('ito');
    expect(itoStateOf(room)).not.toBeNull();
    expect(isItoRoomView(roomView(room, null))).toBe(true);
  });

  it('sala de Dixit começa no lobby do Dixit', () => {
    const room = createRoom('ABCD', 0, null, 'dixit');
    expect(room.gameId).toBe('dixit');
    expect(room.game.phase).toBe('lobby');
    expect(itoStateOf(room)).toBeNull();
    const view = roomView(room, null);
    expect(isDixitRoomView(view)).toBe(true);
    expect(view.gameId).toBe('dixit');
    expect(roomSummary(room)).toEqual({ game: 'dixit', phase: 'lobby', seats: [] });
  });

  it('ação é validada pelo jogo da sala', () => {
    const room = dixitRoom(3);
    expect(roomAction(room, 'p0', { type: 'beginRound' }, rng, 1)).toEqual({ ok: false, error: 'bad_action' });
    expect(roomAction(room, 'p0', { type: 'setTarget', target: 99 }, rng, 1)).toEqual({ ok: false, error: 'bad_action' });
    const res = roomAction(room, 'p0', { type: 'start' }, rng, 1);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.room.game.phase).toBe('storytelling');
      expect(res.room.runStartedAt).toBe(1);
    }
  });

  it('ação do Dixit em sala de ITO dá bad_action', () => {
    let room = createRoom('ABCD', 0);
    const res = joinRoom(room, { token: 't0', name: 'Ana', color: PLAYER_COLORS[0] }, 'p0', 0);
    if (!res.ok) throw new Error(res.error);
    room = res.room;
    expect(roomAction(room, 'p0', { type: 'tell', cardId: 'd001', clue: '' }, rng, 1)).toEqual({ ok: false, error: 'bad_action' });
  });

  it('tick usa a presença do jogo da sala', () => {
    const started = roomAction(dixitRoom(4), 'p0', { type: 'start' }, rng, 1);
    if (!started.ok) throw new Error(started.error);
    const room = started.room;
    expect(tick(room, 2, rng).game).toBe(room.game);
  });

  it('visão do Dixit esconde a mão dos outros', () => {
    const started = roomAction(dixitRoom(3), 'p0', { type: 'start' }, rng, 1);
    if (!started.ok) throw new Error(started.error);
    const view = roomView(started.room, 'p1');
    if (!isDixitRoomView(view)) throw new Error('esperava Dixit');
    expect(view.game.hand).toHaveLength(7);
    expect(view.game.handCounts.p2).toBe(7);
  });
});

describe('restoreRoom', () => {
  it('sala antiga sem gameId (e sem campos do histórico) abre como ITO', () => {
    const { gameId: _g, group: _gr, runStartedAt: _r, recordedRevealKey: _k, ...old } = createRoom('ABCD', 0);
    const room = restoreRoom(old);
    expect(room.gameId).toBe('ito');
    expect(room.group).toBeNull();
    expect(room.runStartedAt).toBeNull();
    expect(room.recordedRevealKey).toBeNull();
  });

  it('mantém o que já existe', () => {
    const room = createRoom('ABCD', 0, null, 'dixit');
    expect(restoreRoom(room)).toEqual(room);
  });
});

describe('envelope de ação', () => {
  it('aceita qualquer ação com type; sem type é mensagem inválida', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'action', action: { type: 'tell', cardId: 'd001', clue: 'x' } }))).not.toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'action', action: { cardId: 'd001' } }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'action', action: 'start' }))).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/room-games.test.ts` (em `shared/`)
Expected: FAIL — `../src/games/registry` não existe.

- [ ] **Step 3: Criar `shared/src/games/registry.ts`**

```ts
import type { z } from 'zod';
import type { GameModule } from '../game';
import { MAX_PLAYERS, MIN_PLAYERS } from '../players';
import { dixitActionSchema } from './dixit/schema';
import { DIXIT_MIN_PLAYERS, type DixitAction, type DixitState, type DixitView } from './dixit/types';
import { dixit } from './dixit/view';
import { ito } from './ito/rules';
import { itoActionSchema } from './ito/schema';
import type { ItoAction, ItoState, ItoView } from './ito/types';

export const GAME_IDS = ['ito', 'dixit'] as const;
export type GameId = (typeof GAME_IDS)[number];
export type GameState = ItoState | DixitState;
export type GameView = ItoView | DixitView;
export type GameAction = ItoAction | DixitAction;

export interface GameEntry {
  id: GameId;
  module: GameModule<GameState, GameAction, GameView>;
  /** Valida a ação recebida pelo WebSocket antes de chegar nas regras. */
  actionSchema: z.ZodTypeAny;
  minPlayers: number;
  maxPlayers: number;
  /** Cursores e ping ao vivo. No Dixit, cursor em cima de uma carta entregaria o voto. */
  liveCursors: boolean;
}

export const GAMES: Record<GameId, GameEntry> = {
  ito: { id: 'ito', module: ito, actionSchema: itoActionSchema, minPlayers: MIN_PLAYERS, maxPlayers: MAX_PLAYERS, liveCursors: true },
  dixit: {
    id: 'dixit',
    module: dixit,
    actionSchema: dixitActionSchema,
    minPlayers: DIXIT_MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    liveCursors: false,
  },
};

export function isGameId(value: unknown): value is GameId {
  return typeof value === 'string' && (GAME_IDS as readonly string[]).includes(value);
}
```

- [ ] **Step 4: Reescrever `shared/src/room.ts`**

Substitua o arquivo inteiro por:

```ts
import { GAMES, type GameAction, type GameId, type GameState, type GameView } from './games/registry';
import type { DixitView } from './games/dixit/types';
import type { ItoState, ItoView } from './games/ito/types';
import { cleanName, isPlayerColor, type PlayerColor } from './players';
import type { Rng } from './rng';

export const DISCONNECT_GRACE_MS = 30_000;
export const ROOM_TTL_MS = 6 * 60 * 60 * 1000;

export interface Seat {
  id: string;
  name: string;
  color: PlayerColor;
  connected: boolean;
  disconnectedAt: number | null;
}

export interface RoomGroup {
  id: string;
  slug: string;
  name: string;
}

export interface Room {
  code: string;
  hostId: string | null;
  seats: Seat[];
  /** token secreto → playerId público. Nunca sai do servidor. */
  tokens: Record<string, string>;
  /** Jogo da sala, fixo desde a criação. */
  gameId: GameId;
  game: GameState;
  lastActivity: number;
  /** Grupo dono da sala (histórico). `null` em salas avulsas. */
  group: RoomGroup | null;
  /** Quando o host começou a partida (saiu do lobby); identifica a campanha do ITO. */
  runStartedAt: number | null;
  /** Chave da última revelação do ITO já gravada no histórico (evita duplicar). */
  recordedRevealKey: string | null;
}

export interface SeatView {
  id: string;
  name: string;
  color: PlayerColor;
  connected: boolean;
}

export interface RoomView<G extends GameView = GameView> {
  code: string;
  hostId: string | null;
  you: string | null;
  seats: SeatView[];
  gameId: GameId;
  game: G;
  group: { slug: string; name: string } | null;
}

export type ItoRoomView = RoomView<ItoView> & { gameId: 'ito' };
export type DixitRoomView = RoomView<DixitView> & { gameId: 'dixit' };

export function isItoRoomView(view: RoomView): view is ItoRoomView {
  return view.gameId === 'ito';
}

export function isDixitRoomView(view: RoomView): view is DixitRoomView {
  return view.gameId === 'dixit';
}

export interface RoomSummary {
  game: GameId;
  phase: GameState['phase'];
  seats: SeatView[];
}

function seatView({ id, name, color, connected }: Seat): SeatView {
  return { id, name, color, connected };
}

/** Estado do ITO, ou null se a sala é de outro jogo. */
export function itoStateOf(room: Room): ItoState | null {
  return room.gameId === 'ito' ? (room.game as ItoState) : null;
}

type StoredRoom = Omit<Room, 'gameId' | 'group' | 'runStartedAt' | 'recordedRevealKey'> &
  Partial<Pick<Room, 'gameId' | 'group' | 'runStartedAt' | 'recordedRevealKey'>>;

/** Sala lida do storage: salas antigas não têm `gameId` (eram todas ITO) nem os campos do histórico. */
export function restoreRoom(stored: StoredRoom): Room {
  return {
    ...stored,
    gameId: stored.gameId ?? 'ito',
    group: stored.group ?? null,
    runStartedAt: stored.runStartedAt ?? null,
    recordedRevealKey: stored.recordedRevealKey ?? null,
  };
}

/** Resumo público da sala para quem ainda não entrou: jogo, fase e assentos (cores ocupadas). */
export function roomSummary(room: Room): RoomSummary {
  return { game: room.gameId, phase: room.game.phase, seats: room.seats.map(seatView) };
}

export type JoinError = 'room_full' | 'bad_name' | 'bad_color' | 'color_taken';
export type JoinResult = { ok: true; room: Room; playerId: string } | { ok: false; error: JoinError };
export type RoomActionResult = { ok: true; room: Room } | { ok: false; error: string };

export function createRoom(code: string, now: number, group: RoomGroup | null = null, gameId: GameId = 'ito'): Room {
  return {
    code,
    hostId: null,
    seats: [],
    tokens: {},
    gameId,
    game: GAMES[gameId].module.initialState(),
    lastActivity: now,
    group,
    runStartedAt: null,
    recordedRevealKey: null,
  };
}

function isActive(seat: Seat, now: number): boolean {
  return seat.connected || (seat.disconnectedAt !== null && now - seat.disconnectedAt < DISCONNECT_GRACE_MS);
}

export function activePlayers(room: Room, now: number): string[] {
  return room.seats.filter((s) => isActive(s, now)).map((s) => s.id);
}

export function joinRoom(
  room: Room,
  input: { token: string; name: string; color: string },
  newId: string,
  now: number,
): JoinResult {
  const name = cleanName(input.name);
  if (!name) return { ok: false, error: 'bad_name' };
  if (!isPlayerColor(input.color)) return { ok: false, error: 'bad_color' };
  const color = input.color;
  // Object.hasOwn: tokens como '__proto__' ou 'toString' não podem resolver para o protótipo.
  const known = Object.hasOwn(room.tokens, input.token) ? room.tokens[input.token] : undefined;
  const id = typeof known === 'string' ? known : newId;

  let seats = room.seats;
  let tokens = room.tokens;
  const existing = seats.find((s) => s.id === id);
  if (!existing && seats.length >= GAMES[room.gameId].maxPlayers) {
    const ghost = seats.find((s) => !isActive(s, now) && !room.game.players.includes(s.id));
    if (!ghost) return { ok: false, error: 'room_full' };
    seats = seats.filter((s) => s.id !== ghost.id);
    tokens = Object.fromEntries(Object.entries(tokens).filter(([, v]) => v !== ghost.id));
  }
  if (seats.some((s) => s.id !== id && s.color === color)) return { ok: false, error: 'color_taken' };

  const seat: Seat = { id, name, color, connected: true, disconnectedAt: null };
  seats = existing ? seats.map((s) => (s.id === id ? seat : s)) : [...seats, seat];
  const hostId = room.hostId !== null && seats.some((s) => s.id === room.hostId) ? room.hostId : id;
  return {
    ok: true,
    playerId: id,
    room: { ...room, seats, hostId, tokens: { ...tokens, [input.token]: id }, lastActivity: now },
  };
}

export function disconnect(room: Room, playerId: string, now: number): Room {
  return {
    ...room,
    seats: room.seats.map((s) => (s.id === playerId ? { ...s, connected: false, disconnectedAt: now } : s)),
    lastActivity: now,
  };
}

/** Reavalia host e regras dependentes de presença (ex.: revelação automática). */
export function tick(room: Room, now: number, rng: Rng): Room {
  const active = activePlayers(room, now);
  let hostId = room.hostId;
  if (hostId === null || !active.includes(hostId)) {
    const order = room.seats.map((s) => s.id);
    const start = hostId === null ? 0 : order.indexOf(hostId) + 1;
    const rotated = [...order.slice(start), ...order.slice(0, start)];
    const connected = new Set(room.seats.filter((s) => s.connected).map((s) => s.id));
    hostId =
      rotated.find((id) => connected.has(id)) ?? rotated.find((id) => active.includes(id)) ?? hostId;
  }
  const game = GAMES[room.gameId].module.onPresenceChange(room.game, { hostId, active, rng });
  return { ...room, hostId, game };
}

/** `action` chega do WebSocket só com `type` garantido: aqui é validada pelo schema do jogo da sala. */
export function roomAction(room: Room, playerId: string, action: unknown, rng: Rng, now: number): RoomActionResult {
  if (!room.seats.some((s) => s.id === playerId)) return { ok: false, error: 'not_member' };
  const entry = GAMES[room.gameId];
  const parsed = entry.actionSchema.safeParse(action);
  if (!parsed.success) return { ok: false, error: 'bad_action' };
  const res = entry.module.applyAction(room.game, playerId, parsed.data as GameAction, {
    hostId: room.hostId,
    active: activePlayers(room, now),
    rng,
  });
  if (!res.ok) return res;
  const startedRun = room.game.phase === 'lobby' && res.state.phase !== 'lobby';
  return {
    ok: true,
    room: { ...room, game: res.state, lastActivity: now, runStartedAt: startedRun ? now : (room.runStartedAt ?? null) },
  };
}

export function roomView(room: Room, viewerId: string | null): RoomView {
  return {
    code: room.code,
    hostId: room.hostId,
    you: viewerId,
    seats: room.seats.map(seatView),
    gameId: room.gameId,
    game: GAMES[room.gameId].module.viewFor(room.game, viewerId),
    group: room.group ? { slug: room.group.slug, name: room.group.name } : null,
  };
}

export function isExpired(room: Room, now: number): boolean {
  return now - room.lastActivity >= ROOM_TTL_MS;
}

/** Próximo momento em que o servidor precisa acordar: fim de uma tolerância de desconexão ou expiração. */
export function nextAlarmAt(room: Room, now: number): number {
  const pending = room.seats
    .filter((s) => !s.connected && s.disconnectedAt !== null)
    .map((s) => s.disconnectedAt! + DISCONNECT_GRACE_MS + 1000)
    .filter((at) => at > now);
  return Math.min(room.lastActivity + ROOM_TTL_MS, ...pending);
}

/**
 * Após um reinício do servidor, quem consta como conectado mas não tem socket vivo
 * passa a desconectado. Não é atividade: `lastActivity` não muda.
 */
export function reconcilePresence(room: Room, liveIds: ReadonlySet<string>, now: number): Room {
  const stale = room.seats.filter((s) => s.connected && !liveIds.has(s.id));
  if (stale.length === 0) return room;
  return {
    ...room,
    seats: room.seats.map((s) => (stale.includes(s) ? { ...s, connected: false, disconnectedAt: now } : s)),
  };
}
```

(Comparado ao antigo: `gameId`, `RoomView` genérica + `ItoRoomView`/`DixitRoomView`, `itoStateOf`, `restoreRoom`, `roomSummary` com `game`, `createRoom` com `gameId`, limite de assentos pelo registro, `tick`/`roomAction`/`roomView` pelo registro. `startedRun` agora é "saiu do lobby", que no ITO é o mesmo que lobby → tema.)

- [ ] **Step 5: Envelope de ação genérico em `shared/src/protocol.ts`**

Troque o import `import { itoActionSchema } from './games/ito/schema';` por nada (apague a linha) e adicione, logo depois de `const rowIndex = …`:

```ts
/** Ação do jogo: o envelope só garante `type`; a sala valida com o schema do jogo dela (`roomAction`). */
const actionEnvelope = z.object({ type: z.string().min(1).max(32) }).passthrough();
```

No `clientMessageSchema`, troque `z.object({ t: z.literal('action'), action: itoActionSchema }),` por:

```ts
  z.object({ t: z.literal('action'), action: actionEnvelope }),
```

- [ ] **Step 6: Histórico só para ITO em `shared/src/history.ts`**

Troque `import type { Room } from './room';` por `import { itoStateOf, type Room } from './room';`. Em `pendingRecord`, troque:

```ts
  if (!room.group) return null;
  const game = room.game;
```

por:

```ts
  if (!room.group) return null;
  // Só o ITO grava histórico por enquanto (o do Dixit vem num plano próprio).
  const game = itoStateOf(room);
  if (!game) return null;
```

- [ ] **Step 7: Exportar o registro em `shared/src/index.ts`**

Adicione no fim:

```ts
export * from './games/registry';
```

- [ ] **Step 8: Ajustar testes antigos de `shared/`**

`shared/test/room.test.ts`, no teste `'expõe fase e assentos públicos, sem tokens'`: o objeto esperado começa com `game: 'ito',` antes de `phase: 'lobby',`.

`shared/test/history.test.ts`:
- adicione `import type { ItoState } from '../src/games/ito/types';` aos imports;
- em `dealAndReveal`, troque `Object.values(r.game.cards)` por `Object.values((r.game as ItoState).cards)`;
- troque `expect(room.game.outcome).toBe('level_failed');` por `expect((room.game as ItoState).outcome).toBe('level_failed');`;
- troque `const wrong = room.game.reveal!.find((e) => e.error)!;` por `const wrong = (room.game as ItoState).reveal!.find((e) => e.error)!;`.

`shared/test/protocol.test.ts` não muda (as ações do ITO continuam passando pelo envelope).

- [ ] **Step 9: Rodar e ver passar**

Run: `npm test -w shared && npm run typecheck -w shared`
Expected: PASS em tudo (`room-games` com 10 testes e os antigos intactos).

- [ ] **Step 10: Commit**

```bash
git add shared/src shared/test
git commit -m "feat(shared): sala genérica com registro de jogos (ITO e Dixit)"
```

---

### Task 11: `web/` entende a sala genérica

Só tipos e uma tela de "em breve" para salas de Dixit: a mesa do Dixit é o Plano D2.

**Files:**
- Modify: `web/src/game/derive.ts`, `web/src/table/engine.ts`, `web/src/table/Hand.tsx`, `web/src/table/ReadyColumn.tsx`, `web/src/table/ResultBanner.tsx`, `web/src/table/Seat.tsx`, `web/src/table/Table.tsx`, `web/src/screens/Lobby.tsx`, `web/src/screens/Game.tsx`, `web/src/dev/bots.ts`, `web/src/net/connection.ts`, `web/test/fixtures.ts`, `web/test/result.test.tsx`

- [ ] **Step 1: Ver os erros de tipo**

Run: `npm run typecheck -w web`
Expected: FAIL — acessos como `view.game.cards` e `view.game.row` em `RoomView` (agora a união ITO | Dixit).

- [ ] **Step 2: Componentes do ITO passam a receber `ItoRoomView`**

Run (na raiz da worktree):

```bash
sed -i 's/\bRoomView\b/ItoRoomView/g' web/src/game/derive.ts web/src/table/engine.ts web/src/table/Hand.tsx web/src/table/ReadyColumn.tsx web/src/table/ResultBanner.tsx web/src/table/Seat.tsx web/src/table/Table.tsx web/src/screens/Lobby.tsx web/test/result.test.tsx
```

- [ ] **Step 3: `web/test/fixtures.ts`**

Troque o import de `type RoomView` por `type ItoRoomView` e a última linha por:

```ts
export const viewOf = (room: Room, id: string | null): ItoRoomView => roomView(room, id) as ItoRoomView;
```

- [ ] **Step 4: `web/src/screens/Game.tsx`**

Substitua o arquivo por:

```tsx
import { isItoRoomView, type RoomView } from '@cartolina/shared';
import type { ConnSnapshot, GameConn } from '../net/connection';
import { Table } from '../table/Table';
import { Lobby } from './Lobby';
import { Toasts } from './Toasts';

/** Sala de Dixit: a mesa chega no Plano D2. */
function DixitSoon() {
  return (
    <main className="screen">
      <section className="panel">
        <h2>a mesa do Dixit está sendo montada</h2>
        <p>Já dá pra criar a sala, mas a mesa chega em breve.</p>
      </section>
    </main>
  );
}

export function Game({ conn, snap, view }: { conn: GameConn; snap: ConnSnapshot; view: RoomView }) {
  return (
    <>
      {snap.status === 'reconnecting' && <div className="banner-reconnect" role="status">reconectando…</div>}
      {!isItoRoomView(view) ? (
        <DixitSoon />
      ) : view.game.phase === 'lobby' ? (
        <Lobby view={view} conn={conn} />
      ) : (
        <Table view={view} conn={conn} />
      )}
      <Toasts conn={conn} />
    </>
  );
}
```

- [ ] **Step 5: `web/src/dev/bots.ts`**

Adicione `isItoRoomView` ao import de `@cartolina/shared` e troque o método `game()` por:

```ts
  private game(): { me: string; g: ItoView } | null {
    const snap = this.conn?.getSnapshot();
    if (!snap || snap.status !== 'joined' || !snap.playerId || !snap.view || !isItoRoomView(snap.view)) return null;
    return { me: snap.playerId, g: snap.view.game };
  }
```

- [ ] **Step 6: `web/src/net/connection.ts`**

No import de `@cartolina/shared`, troque `type ItoAction` por `type GameAction`, e a assinatura `sendAction(action: ItoAction): void {` por `sendAction(action: GameAction): void {`.

- [ ] **Step 7: Rodar e ver passar**

Run: `npm run typecheck -w web && npm test -w web`
Expected: PASS. Se sobrar erro de tipo, é um ponto que lê `view.game.<campo do ITO>` com `RoomView`: troque o tipo por `ItoRoomView` (se o valor vem do `Game`/fixtures) ou estreite com `isItoRoomView`.

- [ ] **Step 8: Commit**

```bash
git add web
git commit -m "feat(web): telas do ITO usam ItoRoomView; sala de Dixit mostra 'em breve'"
```

---

### Task 12: Durable Object guarda o jogo da sala

**Files:**
- Modify: `server/src/room-do.ts`, `server/test/helpers.ts`
- Test: `server/test/dixit.test.ts`

- [ ] **Step 1: `state()` dos testes do servidor fica genérico**

Em `server/test/helpers.ts`, troque o import de `@cartolina/shared` por:

```ts
import { HEARTBEAT_PONG, type ClientMessage, type ItoRoomView, type RoomView, type ServerMessage } from '@cartolina/shared';
```

Na interface `TestClient`, troque `state(pred: (room: RoomView) => boolean): Promise<RoomView>;` por:

```ts
  /** Padrão ITO (a maioria dos testes); salas de Dixit usam `state<DixitRoomView>(…)`. */
  state<V extends RoomView = ItoRoomView>(pred: (room: V) => boolean): Promise<V>;
```

e a implementação no objeto devolvido por `connect` por:

```ts
    async state<V extends RoomView = ItoRoomView>(pred: (room: V) => boolean): Promise<V> {
      for (;;) {
        const m = await waitFor((x): x is Extract<ServerMessage, { t: 'state' }> => x.t === 'state', 'state');
        const room = m.room as V;
        if (pred(room)) return room;
      }
    },
```

Run: `npm run typecheck -w server`
Expected: PASS (os testes do ITO voltam a tipar).

- [ ] **Step 2: Escrever os testes do Dixit no servidor**

`server/test/dixit.test.ts` (a sala é criada direto no DO; a Tarefa 14 troca por `POST /rooms { game }`):

```ts
import { SELF, env } from 'cloudflare:test';
import type { DixitRoomView } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { randomCode } from '../src/codes';
import { joined, type TestClient } from './helpers';

async function newDixitRoom(): Promise<string> {
  const code = randomCode();
  const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
  const res = await stub.fetch(`https://room/init?code=${code}`, {
    method: 'POST',
    body: JSON.stringify({ group: null, game: 'dixit' }),
  });
  expect(res.status).toBe(201);
  return code;
}

/** Barreira sem fx.ping (o Dixit não repassa ping): uma ação inválida volta como erro, em ordem. */
async function errorBarrier(client: TestClient): Promise<void> {
  client.send({ t: 'action', action: { type: 'nada' } });
  expect((await client.next('error')).code).toBe('bad_action');
}

describe('Dixit no servidor', () => {
  it('GET /rooms/:code diz que a sala é de Dixit', async () => {
    const code = await newDixitRoom();
    const body = await (await SELF.fetch(`https://x/rooms/${code}`)).json();
    expect(body).toMatchObject({ exists: true, game: 'dixit', phase: 'lobby' });
  });

  it('ação do ITO em sala de Dixit dá bad_action', async () => {
    const code = await newDixitRoom();
    const [a] = await joined(code, 1);
    a!.client.send({ t: 'action', action: { type: 'beginRound' } });
    expect((await a!.client.next('error')).code).toBe('bad_action');
  });

  it('não repassa ping nem cursor', async () => {
    const code = await newDixitRoom();
    const [a, b] = await joined(code, 2);
    a!.client.send({ t: 'fx.ping', x: 0.5, y: 0.5 });
    a!.client.send({ t: 'fx.cursor', zone: 'table', x: 0.5, y: 0.5, drag: null });
    await errorBarrier(a!.client);
    await errorBarrier(b!.client);
    expect(b!.client.inbox.some((m) => m.t === 'fx.ping' || m.t === 'fx.cursor')).toBe(false);
    expect(a!.client.inbox.some((m) => m.t === 'fx.ping')).toBe(false);
  });

  it('joga uma rodada com 3 pessoas até a revelação', async () => {
    const code = await newDixitRoom();
    const players = await joined(code, 3);
    players[0]!.client.send({ t: 'action', action: { type: 'start' } });
    const views = await Promise.all(
      players.map((p) => p.client.state<DixitRoomView>((r) => r.game.phase === 'storytelling')),
    );
    const tellerId = views[0]!.game.storyteller!;
    const teller = players.find((p) => p.id === tellerId)!;
    const tellerView = views[players.indexOf(teller)]!;
    teller.client.send({ t: 'action', action: { type: 'tell', cardId: tellerView.game.hand[0]!, clue: 'saudade' } });

    const rest = players.filter((p) => p.id !== tellerId);
    for (const p of rest) {
      const v = await p.client.state<DixitRoomView>((r) => r.game.phase === 'submitting');
      expect(v.game.clue).toBe('saudade');
      expect(v.game.storyCard).toBeNull();
      p.client.send({ t: 'action', action: { type: 'submit', cardIds: v.game.hand.slice(0, 2) } });
      p.client.send({ t: 'action', action: { type: 'confirm' } });
    }
    for (const p of rest) {
      const v = await p.client.state<DixitRoomView>((r) => r.game.phase === 'voting');
      expect(v.game.table).toHaveLength(5);
      const target = v.game.table.find((t) => !t.mine)!;
      p.client.send({ t: 'action', action: { type: 'vote', cardId: target.cardId } });
      p.client.send({ t: 'action', action: { type: 'confirm' } });
    }
    const done = await teller.client.state<DixitRoomView>((r) => r.game.phase === 'reveal');
    expect(done.game.result?.storyteller).toBe(tellerId);
    expect(Object.keys(done.game.result!.votes)).toHaveLength(2);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run test/dixit.test.ts` (em `server/`)
Expected: FAIL — o `/init` ignora `game` (a sala nasce ITO: `game: 'ito'` no GET, `beginRound` não dá `bad_action`, o ping é repassado).

- [ ] **Step 4: Implementar em `server/src/room-do.ts`**

No import de `@cartolina/shared`, adicione `GAMES`, `isGameId` e `restoreRoom`.

No construtor, troque o bloco:

```ts
      // Salas gravadas antes do histórico do grupo não têm estes campos.
      this.room = {
        ...stored,
        group: stored.group ?? null,
        runStartedAt: stored.runStartedAt ?? null,
        recordedRevealKey: stored.recordedRevealKey ?? null,
      };
```

por:

```ts
      // Salas antigas não têm gameId (eram todas ITO) nem os campos do histórico.
      this.room = restoreRoom(stored);
```

No `/init`, troque:

```ts
      const body = (await request.json().catch(() => ({}))) as { group?: RoomGroup | null };
      this.room = createRoom(url.searchParams.get('code') ?? '', Date.now(), body.group ?? null);
```

por:

```ts
      const body = (await request.json().catch(() => ({}))) as { group?: RoomGroup | null; game?: unknown };
      const game = isGameId(body.game) ? body.game : 'ito';
      this.room = createRoom(url.searchParams.get('code') ?? '', Date.now(), body.group ?? null, game);
```

No `switch (msg.t)` de `webSocketMessage`, troque os casos `fx.cursor` e `fx.ping` por:

```ts
      case 'fx.cursor': {
        if (!GAMES[this.room.gameId].liveCursors) return;
        if (now - (this.lastCursor.get(playerId) ?? 0) < CURSOR_MIN_INTERVAL_MS) return;
        this.lastCursor.set(playerId, now);
        const { t: _t, ...cursor } = msg;
        this.broadcastFx({ t: 'fx.cursor', ...cursor, from: playerId }, playerId);
        return;
      }
```

e

```ts
      case 'fx.ping':
        if (!GAMES[this.room.gameId].liveCursors) return;
        this.broadcastFx({ t: 'fx.ping', from: playerId, x: msg.x, y: msg.y }, null);
        return;
```

(`stored` no construtor é lido como `Room`; `restoreRoom` aceita esse tipo porque os campos opcionais dele são um subconjunto.)

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test -w server && npm run typecheck -w server`
Expected: PASS (inclusive os testes antigos do ITO e do histórico).

- [ ] **Step 6: Tudo junto**

Run: `npm test && npm run typecheck`
Expected: PASS em `shared`, `server` e `web`.

- [ ] **Step 7: Commit**

```bash
git add server
git commit -m "feat(server): sala guarda o jogo; Dixit sem cursor nem ping"
```

---

### Task 13: TRAVA — esperar o Plano 4 entrar no `main`

As Tarefas 14 e 15 mexem em `server/src/index.ts` e `server/test/http.test.ts`, que o Plano 4 (branch `feat/plano-4-online`, outra sessão) reescreveu (CORS restrito, limite por IP, corpo de até 1 KB com `readSmallJson`).

**Files:** nenhum (só git).

- [ ] **Step 1: Ver se o Plano 4 já está no `main`**

Run: `git fetch origin && git log origin/main --oneline -30`
Expected para seguir: aparecem os commits do Plano 4 (ex.: "CORS só para o site e o dev local", "limite por IP para criar salas e grupos") e o arquivo `server/src/guard.ts` existe em `origin/main` (`git show origin/main:server/src/guard.ts | head -5`).

Se **não** estiverem: PARE aqui, reporte "Plano D1 pronto até a Tarefa 12; Tarefas 14–15 esperam o Plano 4 entrar no main" e não continue.

- [ ] **Step 2: Trazer o `main` para o `feat/dixit`**

Run: `git merge origin/main`
Conflito provável: `web/src/net/connection.ts` (o Plano 4 mexeu bastante nele). Resolva ficando com a versão do `main` e reaplicando só a mudança da Tarefa 11 Step 6 (`GameAction` no import e em `sendAction`). Em qualquer outro conflito, mantenha o comportamento do `main` e as mudanças deste plano.

- [ ] **Step 3: Verificar e commitar o merge**

Run: `npm install && npm test && npm run typecheck`
Expected: PASS. Atenção: os testes HTTP do Plano 4 comparam o corpo de `GET /rooms/:code`; se algum esperar exatamente `{ exists, phase, seats }`, acrescente `game: 'ito'` ao esperado.

```bash
git add -A
git commit -m "merge: main (Plano 4) no feat/dixit"
```

(Se o merge não teve conflito, o `git merge` já criou o commit; pule o commit manual.)

---

### Task 14: `POST /rooms { game }` e salas de grupo com jogo

**Files:**
- Modify: `server/src/index.ts`, `server/test/http.test.ts`, `server/test/dixit.test.ts`

- [ ] **Step 1: Escrever os testes**

Em `server/test/http.test.ts`, adicione `import { newGroup } from './helpers';` (junte ao import existente de `./helpers`) e, dentro do `describe('HTTP', …)`, os testes:

```ts
  it('POST /rooms sem corpo cria sala de ITO', async () => {
    const { code } = (await (await SELF.fetch('https://x/rooms', { method: 'POST' })).json()) as { code: string };
    expect(await (await SELF.fetch(`https://x/rooms/${code}`)).json()).toMatchObject({ game: 'ito' });
  });

  it('POST /rooms { game: "dixit" } cria sala de Dixit', async () => {
    const res = await SELF.fetch('https://x/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'dixit' }),
    });
    expect(res.status).toBe(201);
    const { code } = (await res.json()) as { code: string };
    expect(await (await SELF.fetch(`https://x/rooms/${code}`)).json()).toMatchObject({ game: 'dixit', phase: 'lobby' });
  });

  it('jogo desconhecido dá 400', async () => {
    const res = await SELF.fetch('https://x/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'xadrez' }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad_game' });
  });

  it('sala de grupo também escolhe o jogo', async () => {
    const slug = await newGroup();
    const res = await SELF.fetch(`https://x/groups/${slug}/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'dixit' }),
    });
    expect(res.status).toBe(201);
    const { code } = (await res.json()) as { code: string };
    expect(await (await SELF.fetch(`https://x/rooms/${code}`)).json()).toMatchObject({ game: 'dixit' });
  });
```

No teste existente `'GET /rooms/:code diz se a sala existe (case-insensitive)'`, o objeto esperado passa a ser `{ exists: true, game: 'ito', phase: 'lobby', seats: [] }` (se a Tarefa 13 já não tiver feito isso).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/http.test.ts` (em `server/`)
Expected: FAIL — `{ game: 'dixit' }` ainda cria ITO e `xadrez` dá 201.

- [ ] **Step 3: Implementar em `server/src/index.ts`**

No import de `@cartolina/shared`, adicione `isGameId` e `type GameId`.

Troque `createRoomFor` por:

```ts
async function createRoomFor(env: Env, group: RoomGroup | null, game: GameId): Promise<Response> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    const res = await stub.fetch(`https://room/init?code=${code}`, { method: 'POST', body: JSON.stringify({ group, game }) });
    if (res.status === 201) return json({ code }, 201);
  }
  return json({ error: 'no_code' }, 503);
}

/** Jogo pedido no corpo `{ game }`. Sem corpo (ou sem `game`) → ITO; jogo desconhecido → null. */
async function requestedGame(request: Request): Promise<GameId | null | typeof TOO_LARGE> {
  const body = await readSmallJson(request);
  if (body === TOO_LARGE) return TOO_LARGE;
  const game = (body as { game?: unknown } | null)?.game;
  if (game === undefined) return 'ito';
  return isGameId(game) ? game : null;
}

/** Cria a sala com o jogo pedido, ou responde 413/400. */
async function createRequestedRoom(request: Request, env: Env, group: RoomGroup | null): Promise<Response> {
  const game = await requestedGame(request);
  if (game === TOO_LARGE) return json({ error: 'too_large' }, 413);
  if (game === null) return json({ error: 'bad_game' }, 400);
  return createRoomFor(env, group, game);
}
```

Em `handle`, no `POST /rooms`, troque `return createRoomFor(env, null);` por `return createRequestedRoom(request, env, null);`. Na rota de grupo, troque `return createRoomFor(env, { id: group.id, slug: group.slug, name: group.name });` por:

```ts
      return createRequestedRoom(request, env, { id: group.id, slug: group.slug, name: group.name });
```

(`readSmallJson` e `TOO_LARGE` já são importados de `./guard` pelo Plano 4. Corpo vazio: `JSON.parse('')` lança, `readSmallJson` devolve `null`, e `requestedGame` cai em ITO.)

- [ ] **Step 4: `server/test/dixit.test.ts` passa a criar pela API**

Troque a função `newDixitRoom` e os imports do topo por:

```ts
import { SELF } from 'cloudflare:test';
import type { DixitRoomView } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { joined, type TestClient } from './helpers';

async function newDixitRoom(): Promise<string> {
  const res = await SELF.fetch('https://x/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ game: 'dixit' }),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { code: string }).code;
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test -w server && npm run typecheck -w server`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server
git commit -m "feat(server): POST /rooms e salas de grupo aceitam { game }"
```

---

### Task 15: README e verificação final

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Atualizar o `README.md`**

Na primeira linha de descrição, troque "Primeiro jogo: **ITO**." por "Jogos: **ITO** e **Dixit** (o Dixit ainda sem mesa: regras e servidor prontos).". Na seção "API do servidor", troque a linha do `POST /rooms` por:

```md
- `POST /rooms [{ game: "ito" | "dixit" }]` → `{ code }` (sem corpo: ITO; jogo desconhecido: 400 `bad_game`)
- `GET /rooms/:code` → `{ exists, game, phase, seats }` (404 com `{ exists: false }` se não existir)
```

(apagando a linha antiga do `GET /rooms/:code`). Na seção "Grupos e histórico", troque `POST /groups/:slug/rooms` → `{ code }` por `POST /groups/:slug/rooms [{ game }]` → `{ code }` e acrescente a frase "Só salas de ITO gravam histórico por enquanto.". No fim, ao lado da linha `Design: …`, acrescente:

```md
Dixit: `docs/superpowers/specs/2026-10-15-dixit-design.md` (regras em `shared/src/games/dixit/`; cada jogo se registra em `shared/src/games/registry.ts`).
```

- [ ] **Step 2: Verificação completa**

Run: `npm test && npm run typecheck && npm run build`
Expected: tudo PASS e o build do site termina (o aviso de `VITE_SERVER_URL` não definida é esperado em build local).

- [ ] **Step 3: Fumaça manual (opcional, com o servidor rodando)**

Run: `npm run dev:server` num terminal e, em outro, `npm run smoke`
Expected: a fumaça do ITO passa como antes.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: README com o Dixit e a API de jogo"
```

---

## Cobertura da spec (Plano D1)

| Spec | Onde |
|---|---|
| §2 Preparação (3–10, mão 6/7, meta 15/30, narrador sorteado) | Tarefa 4 |
| §2 Rodada (narrar, escolher 1/2, votar, revelar) | Tarefa 5 |
| §2 Pontuação | Tarefa 3, integrada na 5 |
| §2 Reposição, reembaralho, fim na meta, empate, jogar de novo, lobby | Tarefas 4 e 6 |
| §2 Baralho mínimo | Tarefa 4 (`dixitDeckTooSmall`) |
| §2 Presença (narrador sai, jogador sai, < 3 pausa, entra no meio, destravar) | Tarefas 6 e 7 |
| §3.1 Registro, `gameId`, compatibilidade com salas antigas | Tarefa 10 (+ `restoreRoom` no DO, Tarefa 12) |
| §3.2 Protocolo (envelope, sem cursor/ping no Dixit, erros) | Tarefas 9, 10 e 12 |
| §3.3 Módulo do Dixit | Tarefas 2–9 |
| §3.4 Segredos | Tarefa 8 |
| §3.5 Servidor (`POST /rooms { game }`, grupo, `GET` com `game`, sem D1 para Dixit) | Tarefas 10 (`pendingRecord`), 12 e 14 |
| §9 Testes (shared, sala genérica, server) | Tarefas 3–14 |
| §4–§7 (estante, mesa, identidade, arte) | **Plano D2** (fora deste plano) |
