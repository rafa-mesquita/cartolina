# Plano T1 — Tatubum: regras Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O Tatubum (id `kittens`, nossa versão do Exploding Kittens com tatu-bola) existe como módulo de regras completo e testado em `shared/`, registrado na sala genérica (o servidor cria salas de Tatubum e o alarme resolve a janela do Nem vem!), e aparece na estante como "em breve", sem mesa ainda.

**Architecture:** `shared/src/games/kittens/` com arquivos pequenos: `cards.ts` (tipos de carta e ids), `deck.ts` (baralho por número de jogadores e distribuição), `types.ts` (estado, ações, visão), `turn.ts` (diário, vez, eliminação, vitória), `play.ts` (lê a jogada), `choices.ts` (Cafuné, Favor, 5 diferentes e escolha ao acaso), `resolve.ts` (carta no ar → efeito), `settle.ts` (presença e prazos), `rules.ts` (ações), `view.ts` (segredos, prazo e o módulo), `schema.ts` (zod). A carta no ar fica em `pending` com `resolvesAt`; `nextDeadline` devolve esse prazo (ou o da escolha) e o alarme do Durable Object chama `onPresenceChange` = `settleKittens`, que resolve. A sala genérica não muda.

**Tech Stack:** TypeScript 5.9, zod 3, Vitest 4, Cloudflare Workers + Durable Objects (`@cloudflare/vitest-plugin`), React 19 (só catálogo e página do jogo no `web/`).

**Spec:** `docs/superpowers/specs/2026-10-19-tatubum-design.md` (§2 regras, §3 baralho, §4 arquitetura, §7 erros, §8 testes). Este plano é o item 1 da §9 (Plano T1). Protótipo, mesa (T2) e artes (T3) vêm depois.

---

## Contexto para quem vai executar

- Worktree: `.claude/worktrees/tatubum`, branch `feat/tatubum` (já tem a spec). **Rode tudo de dentro da worktree.** Não faça merge no `main` (merge = publicar). Nunca `git stash` puro.
- Monorepo npm workspaces: `shared/` (regras puras, sem I/O), `server/` (Worker + Durable Object), `web/` (React). Comandos na raiz da worktree: `npm test -w shared -- <filtro>`, `npm test -w server -- <filtro>`, `npm test -w web -- <filtro>`, `npm run typecheck`, `npm test`, `npm run build -w web`. Se a worktree não tiver `node_modules`, rode `npm install` primeiro.
- No PowerShell do usuário `npx.ps1`/`npm.ps1` podem estar bloqueados: use o Bash, ou `npm.cmd`. O `rtk` não existe no Git Bash.
- Código e mensagens em **português** (comentários, erros, nomes de teste), no estilo dos arquivos existentes. Commits `feat(shared): …`, `test(server): …`, terminando com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `tsconfig.base.json` usa `strict` e `noUncheckedIndexedAccess`: acesso por índice dá `T | undefined` (use `!` quando o teste garante); imports só de tipo com `import type`.
- A Vitest não checa tipos: rode **também** `npm run typecheck` onde o passo pedir.
- Modelo a seguir: o Retratim (`shared/src/games/pictures/`, `shared/test/pictures-*.test.ts`). Mesmos padrões: `fail`/`ok`, `deepFreeze` nos testes, `own()` na visão, schema com `Assert` de tipos.
- `onPresenceChange` (aqui `settleKittens`) precisa devolver **o mesmo objeto** quando nada muda (o servidor compara referência pra decidir se grava).
- Sorteio só pelo `ctx.rng`; hora só por `ctx.now`.
- **Monte:** o topo é o **fim** do array (`draw.at(-1)` é a próxima carta comprada).
- **Sessão em paralelo:** o Cama-Leão (`camelio`) está sendo feito em outra worktree e também mexe em `registry.ts`, `room.ts`, `history.ts`, `protocol.ts`, `index.ts`, `catalog.ts`, `GamePage.tsx`, `server/src/index.ts` e `shared/test/room-games.test.ts`. Não mexa na worktree dele. Quem mergear depois resolve o conflito (normalmente é somar as duas entradas).

## Mapa de arquivos

Criar:
- `shared/src/games/kittens/cards.ts`: tipos de carta, nomes, `kittensCardId`, `kittensKindOf`.
- `shared/src/games/kittens/deck.ts`: pacote, `kittensBaseDeck`, `kittensDeal`.
- `shared/src/games/kittens/types.ts`: constantes, fases, jogada, carta no ar, escolhas, diário, estado, ações, visão.
- `shared/src/games/kittens/turn.ts`: `logged`, `nextAlive`, `passTo`, `spendTurn`, `tatusIn`, `checkWin`, `eliminate`.
- `shared/src/games/kittens/play.ts`: `parsePlay` (carta sozinha ou combo, alvo, nome pedido).
- `shared/src/games/kittens/choices.ts`: `hideTatu`, `giveFavor`, `pickFromDiscard`, `chooseAtRandom`.
- `shared/src/games/kittens/resolve.ts`: `resolvePending`.
- `shared/src/games/kittens/settle.ts`: `settleKittens`.
- `shared/src/games/kittens/rules.ts`: `initialKittensState`, `applyKittensAction`.
- `shared/src/games/kittens/view.ts`: `kittensViewFor`, `kittensNextDeadline`, módulo `kittens`.
- `shared/src/games/kittens/schema.ts`: `kittensActionSchema`.
- `shared/test/kittens-helpers.ts` e os testes `kittens-deck`, `kittens-start`, `kittens-draw`, `kittens-play`, `kittens-resolve`, `kittens-combos`, `kittens-presence`, `kittens-view`, `kittens-schema` (`.test.ts`).
- `server/test/kittens.test.ts`.

Modificar:
- `shared/src/games/registry.ts`: entrada `kittens`.
- `shared/src/room.ts`: `KittensRoomView`, `isKittensRoomView`.
- `shared/src/history.ts`: caso `kittens` → `null`.
- `shared/src/protocol.ts`: códigos de erro novos com mensagem.
- `shared/src/index.ts`: exports do Tatubum.
- `shared/test/room-games.test.ts`: registro com 4 jogos e sala de Tatubum.
- `server/src/index.ts`: caso `kittens` na página de histórico.
- `web/src/games/catalog.ts`, `web/test/catalog.test.ts`, `web/test/shelf.test.tsx`: Tatubum "em breve".
- `web/src/screens/GamePage.tsx`: caso `kittens` na aba de histórico.

---

### Task 1: Cartas e baralho

**Files:**
- Create: `shared/src/games/kittens/cards.ts`
- Create: `shared/src/games/kittens/deck.ts`
- Test: `shared/test/kittens-deck.test.ts`

- [ ] **Step 1: Write the failing test**

`shared/test/kittens-deck.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { KITTENS_CARD_KINDS, kittensCardId, kittensKindOf } from '../src/games/kittens/cards';
import { KITTENS_PACK_SIZE, kittensBaseDeck, kittensDeal, kittensPacksFor } from '../src/games/kittens/deck';
import { mulberry32 } from '../src/rng';

const count = (cards: readonly string[], kind: string) => cards.filter((c) => kittensKindOf(c) === kind).length;
const ps = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

describe('cartas do Tatubum', () => {
  it('o id carrega o tipo', () => {
    expect(kittensCardId('ataque', 3)).toBe('ataque-3');
    expect(kittensKindOf('ataque-3')).toBe('ataque');
    expect(kittensKindOf('mico-0')).toBe('mico');
    expect(kittensKindOf('xadrez-1')).toBeNull();
    expect(kittensKindOf('ataque')).toBeNull();
    expect(KITTENS_CARD_KINDS).toHaveLength(13);
  });
});

describe('baralho', () => {
  it('um pacote tem 46 cartas, nas quantidades do original, sem Tatubum nem Cafuné', () => {
    const deck = kittensBaseDeck(5);
    expect(deck).toHaveLength(KITTENS_PACK_SIZE);
    expect(count(deck, 'nemvem')).toBe(5);
    expect(count(deck, 'ataque')).toBe(4);
    expect(count(deck, 'pular')).toBe(4);
    expect(count(deck, 'favor')).toBe(4);
    expect(count(deck, 'embaralhar')).toBe(4);
    expect(count(deck, 'espiar')).toBe(5);
    for (const bicho of ['capivara', 'mico', 'quati', 'tamandua', 'preguica']) expect(count(deck, bicho)).toBe(4);
    expect(count(deck, 'tatubum')).toBe(0);
    expect(count(deck, 'cafune')).toBe(0);
    expect(new Set(deck).size).toBe(deck.length);
  });

  it('2 pacotes a partir de 6 jogadores', () => {
    expect([2, 5, 6, 8].map(kittensPacksFor)).toEqual([1, 1, 2, 2]);
    const deck = kittensBaseDeck(6);
    expect(deck).toHaveLength(2 * KITTENS_PACK_SIZE);
    expect(new Set(deck).size).toBe(deck.length);
  });

  it.each([
    [2, 35],
    [5, 17],
    [6, 57],
    [8, 45],
  ])('com %i jogadores: 1 Cafuné + 7 na mão; monte com %i cartas, 2 Cafunés e n − 1 tatus', (n, drawSize) => {
    const players = ps(n);
    const { hands, draw } = kittensDeal(mulberry32(7), players);
    for (const p of players) {
      expect(hands[p]).toHaveLength(8);
      expect(count(hands[p]!, 'cafune')).toBe(1);
      expect(count(hands[p]!, 'tatubum')).toBe(0);
    }
    expect(draw).toHaveLength(drawSize);
    expect(count(draw, 'tatubum')).toBe(n - 1);
    expect(count(draw, 'cafune')).toBe(2);
    const all = [...Object.values(hands).flat(), ...draw];
    expect(new Set(all).size).toBe(all.length);
  });

  it('mesma semente, mesma distribuição', () => {
    expect(kittensDeal(mulberry32(3), ps(4))).toEqual(kittensDeal(mulberry32(3), ps(4)));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w shared -- kittens-deck`
Expected: FAIL (módulos `cards`/`deck` não existem).

- [ ] **Step 3: Write `cards.ts`**

`shared/src/games/kittens/cards.ts`:

```ts
/** Tipos de carta do Tatubum (id interno `kittens`). Cada carta física tem id `<tipo>-<n>` (ex.: `ataque-3`). */
export const KITTENS_CARD_KINDS = [
  'tatubum',
  'cafune',
  'nemvem',
  'ataque',
  'pular',
  'favor',
  'embaralhar',
  'espiar',
  'capivara',
  'mico',
  'quati',
  'tamandua',
  'preguica',
] as const;
export type KittensCardKind = (typeof KITTENS_CARD_KINDS)[number];

/** Nome que o jogador vê. */
export const KITTENS_CARD_NAMES: Record<KittensCardKind, string> = {
  tatubum: 'Tatubum',
  cafune: 'Cafuné',
  nemvem: 'Nem vem!',
  ataque: 'Ataque',
  pular: 'Pular',
  favor: 'Favor',
  embaralhar: 'Embaralhar',
  espiar: 'Espiar',
  capivara: 'Capivara',
  mico: 'Mico-leão',
  quati: 'Quati',
  tamandua: 'Tamanduá',
  preguica: 'Preguiça',
};

/** Cartas que fazem algo jogadas sozinhas (todas aceitam Nem vem!). */
export const KITTENS_ACTION_KINDS = ['ataque', 'pular', 'favor', 'embaralhar', 'espiar'] as const;
export type KittensActionKind = (typeof KITTENS_ACTION_KINDS)[number];

/** Os 5 bichos: sozinhos não fazem nada, só em combo. */
export const KITTENS_BICHOS = ['capivara', 'mico', 'quati', 'tamandua', 'preguica'] as const;

export function kittensCardId(kind: KittensCardKind, n: number): string {
  return `${kind}-${n}`;
}

/** Tipo de uma carta pelo id; `null` se o id não é de carta do Tatubum. */
export function kittensKindOf(id: string): KittensCardKind | null {
  const cut = id.lastIndexOf('-');
  if (cut <= 0) return null;
  const kind = id.slice(0, cut);
  return (KITTENS_CARD_KINDS as readonly string[]).includes(kind) ? (kind as KittensCardKind) : null;
}
```

- [ ] **Step 4: Write `deck.ts`**

`shared/src/games/kittens/deck.ts`:

```ts
import { shuffle, type Rng } from '../../rng';
import { kittensCardId, type KittensCardKind } from './cards';

/** Um pacote: tudo menos Tatubum e Cafuné, nas quantidades do jogo original. */
export const KITTENS_PACK: Partial<Record<KittensCardKind, number>> = {
  nemvem: 5,
  ataque: 4,
  pular: 4,
  favor: 4,
  embaralhar: 4,
  espiar: 5,
  capivara: 4,
  mico: 4,
  quati: 4,
  tamandua: 4,
  preguica: 4,
};
export const KITTENS_PACK_SIZE = 46;
/** Cartas do baralho na mão inicial, além do Cafuné de cada um. */
export const KITTENS_HAND_START = 7;
/** Cafunés que vão pro monte além do de cada um (sempre 2: decisão de 2026-10-19). */
export const KITTENS_EXTRA_CAFUNES = 2;

/** Com 8 a mão inicial gasta 56 cartas: a partir de 6 jogadores entram 2 pacotes. */
export function kittensPacksFor(players: number): number {
  return players >= 6 ? 2 : 1;
}

/** As cartas dos pacotes (sem Tatubum e Cafuné), numeradas por tipo. */
export function kittensBaseDeck(players: number): string[] {
  const packs = kittensPacksFor(players);
  const cards: string[] = [];
  for (const [kind, count] of Object.entries(KITTENS_PACK) as [KittensCardKind, number][]) {
    for (let i = 0; i < count * packs; i++) cards.push(kittensCardId(kind, i));
  }
  return cards;
}

export interface KittensDeal {
  hands: Record<string, string[]>;
  /** Monte embaralhado: o topo é o FIM do array. */
  draw: string[];
}

/** Preparação (spec §2): 1 Cafuné + 7 cartas pra cada um; no monte, o resto + 2 Cafunés + (n − 1) Tatubuns. */
export function kittensDeal(rng: Rng, players: readonly string[]): KittensDeal {
  const n = players.length;
  const pool = shuffle(rng, kittensBaseDeck(n));
  const hands: Record<string, string[]> = {};
  players.forEach((p, i) => {
    hands[p] = [kittensCardId('cafune', i), ...pool.slice(i * KITTENS_HAND_START, (i + 1) * KITTENS_HAND_START)];
  });
  const rest = pool.slice(n * KITTENS_HAND_START);
  const extras = Array.from({ length: KITTENS_EXTRA_CAFUNES }, (_, i) => kittensCardId('cafune', n + i));
  const tatus = Array.from({ length: n - 1 }, (_, i) => kittensCardId('tatubum', i));
  return { hands, draw: shuffle(rng, [...rest, ...extras, ...tatus]) };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -w shared -- kittens-deck`
Expected: PASS (7 testes).

- [ ] **Step 6: Commit**

```bash
git add shared/src/games/kittens/cards.ts shared/src/games/kittens/deck.ts shared/test/kittens-deck.test.ts
git commit -m "feat(shared): cartas e baralho do Tatubum" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Tipos, estado inicial e começar

**Files:**
- Create: `shared/src/games/kittens/types.ts`
- Create: `shared/src/games/kittens/rules.ts`
- Create: `shared/test/kittens-helpers.ts`
- Test: `shared/test/kittens-start.test.ts`

- [ ] **Step 1: Write `types.ts`** (só tipos e constantes; os testes do passo 3 dependem dele)

`shared/src/games/kittens/types.ts`:

```ts
import type { KittensCardKind } from './cards';

export const KITTENS_MIN_PLAYERS = 2;
export const KITTENS_MAX_PLAYERS = 8;
/** Janela do Nem vem! (decisão do usuário, 2026-10-19): sempre corre, mesmo se ninguém tiver Nem vem!. */
export const KITTENS_NOPE_MS = 5_000;
/** Prazo das escolhas pessoais (Cafuné, Favor, 5 diferentes); depois o servidor escolhe ao acaso. */
export const KITTENS_CHOICE_MS = 30_000;
/** Quantas entradas do diário ficam no estado. */
export const KITTENS_LOG_SIZE = 30;

export type KittensPhase = 'lobby' | 'playing' | 'gameover';

/** O que uma jogada faz: carta de ação sozinha ou combo. */
export type KittensPlayKind = 'ataque' | 'pular' | 'favor' | 'embaralhar' | 'espiar' | 'par' | 'trio' | 'cinco';

export interface KittensPlay {
  kind: KittensPlayKind;
  cards: string[];
  /** Favor, par e trio. */
  target: string | null;
  /** Trio: o tipo de carta pedido. */
  ask: KittensCardKind | null;
}

/** Carta no ar: resolve em `resolvesAt`; cada Nem vem! empurra o prazo (spec §4.2). */
export interface KittensPending {
  by: string;
  play: KittensPlay;
  nopes: { by: string; card: string }[];
  resolvesAt: number;
}

export type KittensChoice =
  /** Quem desarmou escolhe onde o `tatu` volta no monte. */
  | { kind: 'cafune'; who: string; tatu: string; deadline: number }
  /** `who` (o alvo do Favor) escolhe uma carta da mão pra dar pra `to`. */
  | { kind: 'favor'; who: string; to: string; deadline: number }
  /** `who` escolhe uma carta de `options` (o descarte de antes da jogada de 5 diferentes). */
  | { kind: 'cinco'; who: string; options: string[]; deadline: number };

/** Espiar: as 3 de cima, a do topo primeiro, só pra `who`. */
export interface KittensPeek {
  who: string;
  cards: string[];
}

/** Evento do diário. A `card` de um evento só aparece pra quem está no `seenBy` da entrada. */
export type KittensEvent =
  | { t: 'play'; by: string; play: KittensPlayKind; target: string | null; ask: KittensCardKind | null }
  | { t: 'nope'; by: string }
  /** A carta no ar resolveu; `canceled` = Nem vem! ímpar, ou quem jogou/alvo saiu antes. */
  | { t: 'resolved'; by: string; play: KittensPlayKind; canceled: boolean }
  | { t: 'draw'; by: string; card: string | null }
  /** Comprou um Tatubum e usou o Cafuné. */
  | { t: 'cafune'; by: string }
  | { t: 'hid'; by: string }
  | { t: 'boom'; by: string }
  /** Caiu e não voltou em 30 s. */
  | { t: 'left'; by: string }
  | { t: 'gave'; from: string; to: string; card: string | null }
  | { t: 'stole'; from: string; to: string; card: string | null }
  | { t: 'asked'; from: string; to: string; ask: KittensCardKind; card: string | null }
  | { t: 'picked'; by: string; card: string | null }
  | { t: 'win'; by: string };

export interface KittensLogEntry {
  n: number;
  ev: KittensEvent;
  /** Quem vê a carta do evento; `null` = todos. */
  seenBy: string[] | null;
}

export interface KittensState {
  phase: KittensPhase;
  /** Todos da partida, na ordem dos assentos no "começar". Quem entra depois assiste. */
  players: string[];
  alive: string[];
  hands: Record<string, string[]>;
  /** Monte: o topo é o FIM do array. */
  draw: string[];
  discard: string[];
  /** Fora do jogo: Tatubuns que explodiram, mãos de quem saiu e tatus tirados do monte. */
  out: string[];
  current: string | null;
  /** Turnos que `current` ainda deve, contando o atual. */
  owed: number;
  pending: KittensPending | null;
  choice: KittensChoice | null;
  peek: KittensPeek | null;
  log: KittensLogEntry[];
  /** Número da próxima entrada do diário. */
  seq: number;
  winner: string | null;
}

export type KittensAction =
  | { type: 'start' }
  | { type: 'play'; cards: string[]; target?: string; ask?: KittensCardKind }
  | { type: 'nope' }
  | { type: 'draw' }
  /** Cafuné: `position` (0 = topo, tamanho do monte = fundo, ou 'random'); Favor e 5 diferentes: `card`. */
  | { type: 'choose'; card?: string; position?: number | 'random' }
  | { type: 'again' }
  | { type: 'lobby' };

export interface KittensView {
  phase: KittensPhase;
  players: string[];
  alive: string[];
  current: string | null;
  owed: number;
  /** Sua mão (vazia pra espectador). */
  hand: string[];
  handCounts: Record<string, number>;
  drawCount: number;
  tatusInDraw: number;
  discard: string[];
  out: string[];
  pending: KittensPending | null;
  choice: KittensChoice | null;
  /** As 3 de cima, só pra quem espiou. */
  peek: string[] | null;
  peekBy: string | null;
  log: { n: number; ev: KittensEvent }[];
  winner: string | null;
}
```

- [ ] **Step 2: Write the test helpers**

`shared/test/kittens-helpers.ts`:

```ts
import type { ActionResult, GameContext } from '../src/game';
import { applyKittensAction, initialKittensState } from '../src/games/kittens/rules';
import type { KittensAction, KittensState } from '../src/games/kittens/types';
import { mulberry32 } from '../src/rng';

export const T0 = 1_000_000;

export const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `p${i}`);

/** Contexto com `p0` como host e relógio em T0, por padrão. */
export function ctxOf(
  active: string[],
  { seed = 1, hostId = 'p0', now = T0 }: { seed?: number; hostId?: string | null; now?: number } = {},
): GameContext {
  return { hostId, active, rng: mulberry32(seed), now };
}

export function must(res: ActionResult<KittensState>): KittensState {
  if (!res.ok) throw new Error(`ação recusada: ${res.error}`);
  return res.state;
}

/** Congela o objeto inteiro: qualquer mutação das regras estoura (ESM é strict). */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

export const act = (state: KittensState, playerId: string, action: KittensAction, ctx: GameContext): KittensState =>
  must(applyKittensAction(deepFreeze(state), playerId, action, ctx));

/** O código de erro de uma ação que tem que ser recusada. */
export function refuse(state: KittensState, playerId: string, action: KittensAction, ctx: GameContext): string {
  const res = applyKittensAction(deepFreeze(state), playerId, action, ctx);
  if (res.ok) throw new Error('esperava recusa');
  return res.error;
}

/** Partida começada com `n` jogadores (p0…), vez de p0. */
export function started(n: number, seed = 1): { state: KittensState; ctx: GameContext } {
  const ctx = ctxOf(ids(n), { seed });
  return { state: act(initialKittensState(), 'p0', { type: 'start' }, ctx), ctx };
}

/** Mesa montada à mão: jogadores = chaves de `hands` (na ordem), todos vivos, vez de `current`. Monte: topo = fim. */
export function table(opts: {
  hands: Record<string, string[]>;
  draw?: string[];
  discard?: string[];
  current?: string;
  owed?: number;
}): KittensState {
  const players = Object.keys(opts.hands);
  return {
    ...initialKittensState(),
    phase: 'playing',
    players,
    alive: [...players],
    hands: opts.hands,
    draw: opts.draw ?? [],
    discard: opts.discard ?? [],
    current: opts.current ?? players[0]!,
    owed: opts.owed ?? 1,
  };
}
```

- [ ] **Step 3: Write the failing test**

`shared/test/kittens-start.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyKittensAction, initialKittensState } from '../src/games/kittens/rules';
import { act, ctxOf, ids, refuse, started } from './kittens-helpers';

describe('começar', () => {
  it('precisa de 2 ativos', () => {
    expect(applyKittensAction(initialKittensState(), 'p0', { type: 'start' }, ctxOf(['p0']))).toEqual({
      ok: false,
      error: 'not_enough_players',
    });
  });

  it('só o host começa', () => {
    expect(refuse(initialKittensState(), 'p1', { type: 'start' }, ctxOf(ids(3)))).toBe('not_host');
  });

  it('distribui 8 cartas pra cada um e a vez é do primeiro assento', () => {
    const { state } = started(3);
    expect(state).toMatchObject({
      phase: 'playing',
      players: ids(3),
      alive: ids(3),
      current: 'p0',
      owed: 1,
      pending: null,
      choice: null,
      peek: null,
      winner: null,
      discard: [],
      out: [],
    });
    for (const p of ids(3)) expect(state.hands[p]).toHaveLength(8);
    expect(state.draw).toHaveLength(46 - 21 + 2 + 2);
  });

  it('não começa de novo no meio da partida', () => {
    const { state, ctx } = started(3);
    expect(refuse(state, 'p0', { type: 'start' }, ctx)).toBe('bad_phase');
  });
});

describe('lobby e jogar de novo', () => {
  it('o host volta pro lobby', () => {
    const { state, ctx } = started(3);
    expect(act(state, 'p0', { type: 'lobby' }, ctx)).toEqual(initialKittensState());
    expect(refuse(state, 'p1', { type: 'lobby' }, ctx)).toBe('not_host');
    expect(refuse(initialKittensState(), 'p0', { type: 'lobby' }, ctx)).toBe('bad_phase');
  });

  it('"jogar de novo" só no fim, e começa outra partida com quem está ativo', () => {
    const { state, ctx } = started(3);
    expect(refuse(state, 'p0', { type: 'again' }, ctx)).toBe('bad_phase');
    const over = { ...state, phase: 'gameover' as const, winner: 'p1', current: null };
    const again = act(over, 'p0', { type: 'again' }, ctxOf(['p0', 'p1']));
    expect(again).toMatchObject({ phase: 'playing', players: ['p0', 'p1'], winner: null, current: 'p0' });
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -w shared -- kittens-start`
Expected: FAIL (`rules` não existe).

- [ ] **Step 5: Write `rules.ts` (esqueleto com começar/lobby/jogar de novo)**

`shared/src/games/kittens/rules.ts`:

```ts
import type { ActionResult, GameContext } from '../../game';
import { kittensDeal } from './deck';
import { KITTENS_MIN_PLAYERS, type KittensAction, type KittensState } from './types';

const fail = (error: string): ActionResult<KittensState> => ({ ok: false, error });
const ok = (state: KittensState): ActionResult<KittensState> => ({ ok: true, state });

export function initialKittensState(): KittensState {
  return {
    phase: 'lobby',
    players: [],
    alive: [],
    hands: {},
    draw: [],
    discard: [],
    out: [],
    current: null,
    owed: 0,
    pending: null,
    choice: null,
    peek: null,
    log: [],
    seq: 0,
    winner: null,
  };
}

/** Partida nova com os ativos (também usada em "jogar de novo"). A sala já limita a 8 pessoas. */
function startMatch(ctx: GameContext): ActionResult<KittensState> {
  if (ctx.active.length < KITTENS_MIN_PLAYERS) return fail('not_enough_players');
  const players = [...ctx.active];
  const { hands, draw } = kittensDeal(ctx.rng, players);
  return ok({ ...initialKittensState(), phase: 'playing', players, alive: [...players], hands, draw, current: players[0]!, owed: 1 });
}

export function applyKittensAction(
  state: KittensState,
  playerId: string,
  action: KittensAction,
  ctx: GameContext,
): ActionResult<KittensState> {
  const s = state;
  const isHost = ctx.hostId === playerId;
  switch (action.type) {
    case 'start':
      if (!isHost) return fail('not_host');
      if (s.phase !== 'lobby') return fail('bad_phase');
      return startMatch(ctx);
    case 'lobby':
      if (!isHost) return fail('not_host');
      if (s.phase === 'lobby') return fail('bad_phase');
      return ok(initialKittensState());
    case 'again':
      if (!isHost) return fail('not_host');
      if (s.phase !== 'gameover') return fail('bad_phase');
      return startMatch(ctx);
    default:
      return fail('bad_action');
  }
}
```

(A variável `s` vira o estado "acertado" pelo `settleKittens` na Task 5; por isso já existe.)

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -w shared -- kittens-start`
Expected: PASS (6 testes).

- [ ] **Step 7: Commit**

```bash
git add shared/src/games/kittens/types.ts shared/src/games/kittens/rules.ts shared/test/kittens-helpers.ts shared/test/kittens-start.test.ts
git commit -m "feat(shared): estado e começo da partida do Tatubum" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Comprar, explodir e Cafuné

**Files:**
- Create: `shared/src/games/kittens/turn.ts`
- Create: `shared/src/games/kittens/choices.ts`
- Modify: `shared/src/games/kittens/rules.ts`
- Test: `shared/test/kittens-draw.test.ts`

- [ ] **Step 1: Write the failing test**

`shared/test/kittens-draw.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { KITTENS_CHOICE_MS } from '../src/games/kittens/types';
import { T0, act, ctxOf, ids, refuse, table } from './kittens-helpers';

const ctx = ctxOf(ids(3));

describe('comprar', () => {
  it('compra a de cima e passa a vez; só quem comprou vê a carta no diário', () => {
    const s = table({ hands: { p0: [], p1: [], p2: [] }, draw: ['pular-0', 'mico-0'] });
    const after = act(s, 'p0', { type: 'draw' }, ctx);
    expect(after.hands.p0).toEqual(['mico-0']);
    expect(after.draw).toEqual(['pular-0']);
    expect(after).toMatchObject({ current: 'p1', owed: 1 });
    expect(after.log.at(-1)).toEqual({ n: 0, ev: { t: 'draw', by: 'p0', card: 'mico-0' }, seenBy: ['p0'] });
  });

  it('sob ataque, comprar gasta só 1 dos turnos', () => {
    const s = table({ hands: { p0: [], p1: [], p2: [] }, draw: ['pular-0', 'mico-0'], owed: 2 });
    expect(act(s, 'p0', { type: 'draw' }, ctx)).toMatchObject({ current: 'p0', owed: 1 });
  });

  it('fora da vez não compra; quem já saiu também não', () => {
    const s = table({ hands: { p0: [], p1: [], p2: [] }, draw: ['mico-0'] });
    expect(refuse(s, 'p1', { type: 'draw' }, ctx)).toBe('not_your_turn');
    expect(refuse({ ...s, alive: ['p0', 'p1'] }, 'p2', { type: 'draw' }, ctx)).toBe('not_alive');
  });
});

describe('Tatubum sem Cafuné', () => {
  it('explode: a mão e o tatu saem do jogo e a vez passa com 1 turno', () => {
    const s = table({ hands: { p0: ['mico-0'], p1: [], p2: [] }, draw: ['pular-0', 'tatubum-0'], owed: 2 });
    const after = act(s, 'p0', { type: 'draw' }, ctx);
    expect(after.alive).toEqual(['p1', 'p2']);
    expect(after.hands.p0).toEqual([]);
    expect(after.out).toEqual(['tatubum-0', 'mico-0']);
    expect(after.draw).toEqual(['pular-0']);
    expect(after).toMatchObject({ phase: 'playing', current: 'p1', owed: 1 });
    expect(after.log.at(-1)!.ev).toEqual({ t: 'boom', by: 'p0' });
  });

  it('com 2 jogadores, quem sobra vence', () => {
    const s = table({ hands: { p0: [], p1: [] }, draw: ['tatubum-0'] });
    const after = act(s, 'p0', { type: 'draw' }, ctxOf(ids(2)));
    expect(after).toMatchObject({ phase: 'gameover', winner: 'p1', current: null, alive: ['p1'], pending: null, choice: null });
    expect(after.log.at(-1)!.ev).toEqual({ t: 'win', by: 'p1' });
  });
});

describe('Tatubum com Cafuné', () => {
  const defusing = () =>
    act(
      table({ hands: { p0: ['cafune-0', 'mico-0'], p1: [], p2: [] }, draw: ['pular-0', 'quati-0', 'tatubum-0'] }),
      'p0',
      { type: 'draw' },
      ctx,
    );

  it('o Cafuné vai pro descarte e abre a escolha de onde esconder o tatu', () => {
    const after = defusing();
    expect(after.hands.p0).toEqual(['mico-0']);
    expect(after.discard).toEqual(['cafune-0']);
    expect(after.draw).toEqual(['pular-0', 'quati-0']);
    expect(after.choice).toEqual({ kind: 'cafune', who: 'p0', tatu: 'tatubum-0', deadline: T0 + KITTENS_CHOICE_MS });
    expect(after.current).toBe('p0');
    expect(after.log.at(-1)!.ev).toEqual({ t: 'cafune', by: 'p0' });
    expect(refuse(after, 'p0', { type: 'draw' }, ctx)).toBe('waiting_choice');
  });

  it.each([
    [0, ['pular-0', 'quati-0', 'tatubum-0']],
    [1, ['pular-0', 'tatubum-0', 'quati-0']],
    [2, ['tatubum-0', 'pular-0', 'quati-0']],
  ])('esconde o tatu %i abaixo do topo e passa a vez', (position, draw) => {
    const after = act(defusing(), 'p0', { type: 'choose', position }, ctx);
    expect(after.draw).toEqual(draw);
    expect(after).toMatchObject({ choice: null, current: 'p1', owed: 1 });
    expect(after.log.at(-1)!.ev).toEqual({ t: 'hid', by: 'p0' });
  });

  it('aleatório põe em algum lugar; posição fora do monte ou de outra pessoa não vale', () => {
    const after = act(defusing(), 'p0', { type: 'choose', position: 'random' }, ctx);
    expect([...after.draw].sort()).toEqual(['pular-0', 'quati-0', 'tatubum-0']);
    expect(refuse(defusing(), 'p0', { type: 'choose', position: 3 }, ctx)).toBe('bad_choice');
    expect(refuse(defusing(), 'p0', { type: 'choose' }, ctx)).toBe('bad_choice');
    expect(refuse(defusing(), 'p1', { type: 'choose', position: 0 }, ctx)).toBe('not_your_choice');
  });

  it('sob ataque, o Cafuné gasta 1 turno e a vez continua', () => {
    const s = table({ hands: { p0: ['cafune-0'], p1: [], p2: [] }, draw: ['pular-0', 'tatubum-0'], owed: 2 });
    const hid = act(act(s, 'p0', { type: 'draw' }, ctx), 'p0', { type: 'choose', position: 0 }, ctx);
    expect(hid).toMatchObject({ current: 'p0', owed: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w shared -- kittens-draw`
Expected: FAIL (`draw` cai no `default` → `bad_action`).

- [ ] **Step 3: Write `turn.ts`**

`shared/src/games/kittens/turn.ts`:

```ts
import { kittensKindOf } from './cards';
import { KITTENS_LOG_SIZE, type KittensEvent, type KittensState } from './types';

/** Acrescenta ao diário (só as últimas KITTENS_LOG_SIZE ficam). `seenBy`: quem vê a carta do evento (null = todos). */
export function logged(state: KittensState, ev: KittensEvent, seenBy: string[] | null = null): KittensState {
  return { ...state, log: [...state.log, { n: state.seq, ev, seenBy }].slice(-KITTENS_LOG_SIZE), seq: state.seq + 1 };
}

/** Próximo vivo depois de `from`, na ordem dos assentos (`from` pode já ter saído). */
export function nextAlive(state: KittensState, from: string): string | null {
  const order = state.players;
  const start = order.indexOf(from);
  for (let k = 1; k <= order.length; k++) {
    const p = order[(start + k) % order.length]!;
    if (p !== from && state.alive.includes(p)) return p;
  }
  return null;
}

/** A vez vai pra `next` com `owed` turnos; o Espiar de quem jogava some. */
export function passTo(state: KittensState, next: string | null, owed: number): KittensState {
  return { ...state, current: next, owed, peek: null };
}

/** Gasta 1 turno de quem está na vez (comprar, Pular, Cafuné); acabaram os turnos, passa a vez. */
export function spendTurn(state: KittensState): KittensState {
  if (state.owed > 1) return { ...state, owed: state.owed - 1, peek: null };
  return passTo(state, nextAlive(state, state.current!), 1);
}

export function tatusIn(cards: readonly string[]): number {
  return cards.filter((c) => kittensKindOf(c) === 'tatubum').length;
}

/** Sobrou 1 vivo (ou ninguém): fim de jogo. */
export function checkWin(state: KittensState): KittensState {
  if (state.alive.length > 1) return state;
  const winner = state.alive[0] ?? null;
  const ended: KittensState = { ...state, phase: 'gameover', winner, current: null, owed: 0, pending: null, choice: null, peek: null };
  return winner === null ? ended : logged(ended, { t: 'win', by: winner });
}

/**
 * `p` sai da partida (explodiu ou caiu de vez): a mão (e `extraOut`, ex.: o tatu que explodiu) vai pra fora do jogo.
 * Se o monte ficou com mais tatus que vivos − 1 (quem caiu de vez), um tatu sai também. Se era a vez de `p`, a vez
 * passa pro próximo vivo com 1 turno (os turnos devidos se perdem).
 */
export function eliminate(state: KittensState, p: string, extraOut: string[] = []): KittensState {
  const alive = state.alive.filter((x) => x !== p);
  let draw = state.draw;
  let out = [...state.out, ...extraOut, ...(state.hands[p] ?? [])];
  if (tatusIn(draw) > alive.length - 1) {
    const i = draw.findIndex((c) => kittensKindOf(c) === 'tatubum');
    out = [...out, draw[i]!];
    draw = draw.filter((_, k) => k !== i);
  }
  let next: KittensState = { ...state, alive, draw, out, hands: { ...state.hands, [p]: [] } };
  if (state.current === p) next = passTo(next, nextAlive(next, p), 1);
  return checkWin(next);
}
```

- [ ] **Step 4: Write `choices.ts` (só o Cafuné por enquanto)**

`shared/src/games/kittens/choices.ts`:

```ts
import { randomInt, type Rng } from '../../rng';
import { logged, spendTurn } from './turn';
import type { KittensChoice, KittensState } from './types';

type Choice<K extends KittensChoice['kind']> = Extract<KittensChoice, { kind: K }>;

/** Cafuné: o tatu volta pro monte `position` cartas abaixo do topo (0 = topo, tamanho do monte = fundo). Gasta 1 turno. */
export function hideTatu(s: KittensState, c: Choice<'cafune'>, position: number | 'random', rng: Rng): KittensState {
  const pos = position === 'random' ? randomInt(rng, s.draw.length + 1) : position;
  const at = s.draw.length - pos;
  const draw = [...s.draw.slice(0, at), c.tatu, ...s.draw.slice(at)];
  return spendTurn(logged({ ...s, draw, choice: null }, { t: 'hid', by: c.who }));
}
```

- [ ] **Step 5: Add `draw` and `choose` to `rules.ts`**

Em `shared/src/games/kittens/rules.ts`, troque os imports do topo por:

```ts
import type { ActionResult, GameContext } from '../../game';
import { kittensKindOf } from './cards';
import { hideTatu } from './choices';
import { kittensDeal } from './deck';
import { eliminate, logged, spendTurn } from './turn';
import { KITTENS_CHOICE_MS, KITTENS_MIN_PLAYERS, type KittensAction, type KittensState } from './types';
```

Acrescente, logo depois de `startMatch`:

```ts
/** Por que `p` não pode jogar nem comprar agora (ou null se pode). */
function turnError(s: KittensState, p: string): string | null {
  if (s.phase !== 'playing') return 'bad_phase';
  if (!s.alive.includes(p)) return 'not_alive';
  if (s.pending) return 'card_in_air';
  if (s.choice) return 'waiting_choice';
  if (s.current !== p) return 'not_your_turn';
  return null;
}

/** Compra a de cima. Tatubum: com Cafuné, abre a escolha de onde esconder; sem, explode. */
function drawCard(s: KittensState, p: string, ctx: GameContext): KittensState {
  const card = s.draw.at(-1)!;
  const draw = s.draw.slice(0, -1);
  const hand = s.hands[p]!;
  if (kittensKindOf(card) !== 'tatubum') {
    return spendTurn(logged({ ...s, draw, hands: { ...s.hands, [p]: [...hand, card] } }, { t: 'draw', by: p, card }, [p]));
  }
  const cafune = hand.find((c) => kittensKindOf(c) === 'cafune');
  if (cafune === undefined) return eliminate(logged({ ...s, draw }, { t: 'boom', by: p }), p, [card]);
  return logged(
    {
      ...s,
      draw,
      peek: null,
      hands: { ...s.hands, [p]: hand.filter((c) => c !== cafune) },
      discard: [...s.discard, cafune],
      choice: { kind: 'cafune', who: p, tatu: card, deadline: ctx.now + KITTENS_CHOICE_MS },
    },
    { t: 'cafune', by: p },
  );
}
```

E, dentro do `switch` de `applyKittensAction`, antes do `default`:

```ts
    case 'draw': {
      const e = turnError(s, playerId);
      if (e) return fail(e);
      return ok(drawCard(s, playerId, ctx));
    }
    case 'choose': {
      if (s.phase !== 'playing') return fail('bad_phase');
      const c = s.choice;
      if (!c || c.who !== playerId) return fail('not_your_choice');
      if (c.kind === 'cafune') {
        const { position } = action;
        if (position === undefined || (position !== 'random' && position > s.draw.length)) return fail('bad_choice');
        return ok(hideTatu(s, c, position, ctx.rng));
      }
      return fail('bad_choice');
    }
```

(O monte nunca está vazio na hora de comprar: enquanto há 2+ vivos ele tem `vivos − 1 ≥ 1` tatus.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -w shared -- kittens`
Expected: PASS (deck, start e draw).

- [ ] **Step 7: Commit**

```bash
git add shared/src/games/kittens/turn.ts shared/src/games/kittens/choices.ts shared/src/games/kittens/rules.ts shared/test/kittens-draw.test.ts
git commit -m "feat(shared): comprar, explodir e Cafuné no Tatubum" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Jogar cartas e Nem vem!

**Files:**
- Create: `shared/src/games/kittens/play.ts`
- Modify: `shared/src/games/kittens/rules.ts`
- Test: `shared/test/kittens-play.test.ts`

- [ ] **Step 1: Write the failing test**

`shared/test/kittens-play.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { KITTENS_NOPE_MS, type KittensAction } from '../src/games/kittens/types';
import { T0, act, ctxOf, ids, refuse, table } from './kittens-helpers';

const ctx = ctxOf(ids(3));
const hands = () => ({
  p0: [
    'ataque-0',
    'favor-1',
    'nemvem-0',
    'capivara-0',
    'capivara-1',
    'capivara-2',
    'mico-0',
    'quati-0',
    'tamandua-0',
    'preguica-0',
    'cafune-0',
    'pular-0',
  ],
  p1: ['nemvem-1', 'favor-0'],
  p2: [] as string[],
});
type Play = Omit<Extract<KittensAction, { type: 'play' }>, 'type'>;
const play = (p: Play): KittensAction => ({ type: 'play', ...p });

describe('jogar', () => {
  it('a carta de ação vai pro ar com 5 s de janela', () => {
    const after = act(table({ hands: hands() }), 'p0', play({ cards: ['ataque-0'] }), ctx);
    expect(after.pending).toEqual({
      by: 'p0',
      play: { kind: 'ataque', cards: ['ataque-0'], target: null, ask: null },
      nopes: [],
      resolvesAt: T0 + KITTENS_NOPE_MS,
    });
    expect(after.hands.p0).not.toContain('ataque-0');
    expect(after.log.at(-1)!.ev).toEqual({ t: 'play', by: 'p0', play: 'ataque', target: null, ask: null });
  });

  it.each<[string[], string]>([
    [[], 'bad_combo'],
    [['nemvem-0'], 'bad_combo'],
    [['cafune-0'], 'bad_combo'],
    [['mico-0'], 'bad_combo'],
    [['mico-0', 'quati-0'], 'bad_combo'],
    [['capivara-0', 'capivara-0'], 'bad_combo'],
    [['capivara-0', 'capivara-1', 'capivara-2', 'mico-0', 'quati-0'], 'bad_combo'],
    [['favor-0'], 'not_in_hand'],
  ])('%j não vale (%s)', (cards, error) => {
    expect(refuse(table({ hands: hands() }), 'p0', play({ cards }), ctx)).toBe(error);
  });

  it('par, trio e 5 diferentes', () => {
    const s = table({ hands: hands() });
    expect(act(s, 'p0', play({ cards: ['capivara-0', 'capivara-1'], target: 'p1' }), ctx).pending!.play).toEqual({
      kind: 'par',
      cards: ['capivara-0', 'capivara-1'],
      target: 'p1',
      ask: null,
    });
    expect(
      act(s, 'p0', play({ cards: ['capivara-0', 'capivara-1', 'capivara-2'], target: 'p1', ask: 'favor' }), ctx).pending!.play,
    ).toEqual({ kind: 'trio', cards: ['capivara-0', 'capivara-1', 'capivara-2'], target: 'p1', ask: 'favor' });
    expect(act(s, 'p0', play({ cards: ['capivara-0', 'mico-0', 'quati-0', 'tamandua-0', 'preguica-0'] }), ctx).pending!.play.kind).toBe(
      'cinco',
    );
  });

  it('combo vale com quaisquer cartas, não só bichos', () => {
    const s = table({ hands: { p0: ['ataque-0', 'ataque-1', 'pular-0', 'cafune-0', 'mico-0', 'nemvem-0'], p1: ['mico-1'], p2: [] } });
    expect(act(s, 'p0', play({ cards: ['ataque-0', 'ataque-1'], target: 'p1' }), ctx).pending!.play.kind).toBe('par');
    expect(act(s, 'p0', play({ cards: ['ataque-0', 'pular-0', 'cafune-0', 'mico-0', 'nemvem-0'] }), ctx).pending!.play.kind).toBe('cinco');
  });

  it.each<[Play, string]>([
    [{ cards: ['capivara-0', 'capivara-1'] }, 'bad_target'],
    [{ cards: ['capivara-0', 'capivara-1'], target: 'p0' }, 'bad_target'],
    [{ cards: ['capivara-0', 'capivara-1'], target: 'p2' }, 'bad_target'],
    [{ cards: ['capivara-0', 'capivara-1'], target: 'p9' }, 'bad_target'],
    [{ cards: ['favor-1'], target: 'p2' }, 'bad_target'],
    [{ cards: ['capivara-0', 'capivara-1', 'capivara-2'], target: 'p1' }, 'bad_ask'],
    [{ cards: ['capivara-0', 'capivara-1', 'capivara-2'], target: 'p1', ask: 'tatubum' }, 'bad_ask'],
  ])('alvo e pedido: %j → %s', (p, error) => {
    expect(refuse(table({ hands: hands() }), 'p0', play(p), ctx)).toBe(error);
  });

  it('alvo que não precisa é ignorado', () => {
    const after = act(table({ hands: hands() }), 'p0', play({ cards: ['ataque-0'], target: 'p1' }), ctx);
    expect(after.pending!.play.target).toBeNull();
  });

  it('com carta no ar ninguém joga nem compra; fora da vez não joga', () => {
    const air = act(table({ hands: hands() }), 'p0', play({ cards: ['ataque-0'] }), ctx);
    expect(refuse(air, 'p0', play({ cards: ['pular-0'] }), ctx)).toBe('card_in_air');
    expect(refuse(air, 'p0', { type: 'draw' }, ctx)).toBe('card_in_air');
    expect(refuse(table({ hands: hands() }), 'p1', play({ cards: ['favor-0'], target: 'p0' }), ctx)).toBe('not_your_turn');
  });
});

describe('Nem vem!', () => {
  const air = () => act(table({ hands: hands() }), 'p0', play({ cards: ['ataque-0'] }), ctx);

  it('qualquer vivo com Nem vem! dá, e a janela recomeça', () => {
    const later = ctxOf(ids(3), { now: T0 + 3000 });
    const noped = act(air(), 'p1', { type: 'nope' }, later);
    expect(noped.pending!.nopes).toEqual([{ by: 'p1', card: 'nemvem-1' }]);
    expect(noped.pending!.resolvesAt).toBe(T0 + 3000 + KITTENS_NOPE_MS);
    expect(noped.hands.p1).toEqual(['favor-0']);
    expect(noped.log.at(-1)!.ev).toEqual({ t: 'nope', by: 'p1' });
    const back = act(noped, 'p0', { type: 'nope' }, later);
    expect(back.pending!.nopes.map((n) => n.by)).toEqual(['p1', 'p0']);
  });

  it('sem Nem vem! na mão, sem carta no ar ou já fora do jogo, não dá', () => {
    expect(refuse(air(), 'p2', { type: 'nope' }, ctx)).toBe('no_nope');
    expect(refuse(table({ hands: hands() }), 'p1', { type: 'nope' }, ctx)).toBe('nothing_to_nope');
    expect(refuse({ ...air(), alive: ['p0', 'p2'] }, 'p1', { type: 'nope' }, ctx)).toBe('not_alive');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w shared -- kittens-play`
Expected: FAIL (`play`/`nope` caem no `default`).

- [ ] **Step 3: Write `play.ts`**

`shared/src/games/kittens/play.ts`:

```ts
import { KITTENS_ACTION_KINDS, kittensKindOf, type KittensActionKind, type KittensCardKind } from './cards';
import type { KittensPlay, KittensPlayKind, KittensState } from './types';

/** O que as cartas formam: carta de ação sozinha, par, trio ou 5 diferentes (spec §2). */
function playKindOf(kinds: KittensCardKind[]): KittensPlayKind | null {
  const same = kinds.every((k) => k === kinds[0]);
  if (kinds.length === 1) {
    return (KITTENS_ACTION_KINDS as readonly string[]).includes(kinds[0]!) ? (kinds[0] as KittensActionKind) : null;
  }
  if (kinds.length === 2 && same) return 'par';
  if (kinds.length === 3 && same) return 'trio';
  if (kinds.length === 5 && new Set(kinds).size === 5) return 'cinco';
  return null;
}

/** Lê a jogada de `p`. Devolve o código de erro se não vale. Alvo e pedido que a jogada não usa são ignorados. */
export function parsePlay(
  s: KittensState,
  p: string,
  action: { cards: string[]; target?: string; ask?: KittensCardKind },
): KittensPlay | string {
  const { cards } = action;
  const hand = s.hands[p] ?? [];
  if (cards.length === 0 || new Set(cards).size !== cards.length) return 'bad_combo';
  if (!cards.every((c) => hand.includes(c))) return 'not_in_hand';
  const kind = playKindOf(cards.map((c) => kittensKindOf(c)!));
  if (kind === null) return 'bad_combo';
  let target: string | null = null;
  if (kind === 'favor' || kind === 'par' || kind === 'trio') {
    const t = action.target;
    if (t === undefined || t === p || !s.alive.includes(t) || (s.hands[t]?.length ?? 0) === 0) return 'bad_target';
    target = t;
  }
  let ask: KittensCardKind | null = null;
  if (kind === 'trio') {
    if (action.ask === undefined || action.ask === 'tatubum') return 'bad_ask';
    ask = action.ask;
  }
  return { kind, cards: [...cards], target, ask };
}
```

- [ ] **Step 4: Add `play` and `nope` to `rules.ts`**

Em `shared/src/games/kittens/rules.ts`, acrescente aos imports:

```ts
import { parsePlay } from './play';
```

e troque a linha de import de `./types` por:

```ts
import { KITTENS_CHOICE_MS, KITTENS_MIN_PLAYERS, KITTENS_NOPE_MS, type KittensAction, type KittensState } from './types';
```

Dentro do `switch`, antes do `default`:

```ts
    case 'play': {
      const e = turnError(s, playerId);
      if (e) return fail(e);
      const play = parsePlay(s, playerId, action);
      if (typeof play === 'string') return fail(play);
      const hand = s.hands[playerId]!.filter((c) => !play.cards.includes(c));
      const next: KittensState = {
        ...s,
        hands: { ...s.hands, [playerId]: hand },
        pending: { by: playerId, play, nopes: [], resolvesAt: ctx.now + KITTENS_NOPE_MS },
      };
      return ok(logged(next, { t: 'play', by: playerId, play: play.kind, target: play.target, ask: play.ask }));
    }
    case 'nope': {
      if (s.phase !== 'playing') return fail('bad_phase');
      if (!s.alive.includes(playerId)) return fail('not_alive');
      if (!s.pending) return fail('nothing_to_nope');
      const card = s.hands[playerId]!.find((c) => kittensKindOf(c) === 'nemvem');
      if (card === undefined) return fail('no_nope');
      const pending = {
        ...s.pending,
        nopes: [...s.pending.nopes, { by: playerId, card }],
        resolvesAt: ctx.now + KITTENS_NOPE_MS,
      };
      const hands = { ...s.hands, [playerId]: s.hands[playerId]!.filter((c) => c !== card) };
      return ok(logged({ ...s, pending, hands }, { t: 'nope', by: playerId }));
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -w shared -- kittens`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add shared/src/games/kittens/play.ts shared/src/games/kittens/rules.ts shared/test/kittens-play.test.ts
git commit -m "feat(shared): jogadas, combos e Nem vem! do Tatubum" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: A carta no ar resolve (Ataque, Pular, Embaralhar, Espiar)

**Files:**
- Create: `shared/src/games/kittens/resolve.ts`
- Create: `shared/src/games/kittens/settle.ts`
- Modify: `shared/src/games/kittens/rules.ts`
- Test: `shared/test/kittens-resolve.test.ts`

- [ ] **Step 1: Write the failing test**

`shared/test/kittens-resolve.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { settleKittens } from '../src/games/kittens/settle';
import { T0, act, ctxOf, ids, refuse, table } from './kittens-helpers';

const ctx = ctxOf(ids(3));
const at = (ms: number) => ctxOf(ids(3), { now: T0 + ms });
const DRAW = ['mico-0', 'quati-0', 'tamandua-0', 'preguica-0'];

/** p0 joga `cards` (tem também um Nem vem!); p1 tem Nem vem! e Favor; p2 tem uma capivara. */
function played(cards: string[], { owed = 1, draw = DRAW }: { owed?: number; draw?: string[] } = {}) {
  const s = table({ hands: { p0: [...cards, 'nemvem-0'], p1: ['nemvem-1', 'favor-0'], p2: ['capivara-3'] }, draw, owed });
  return act(s, 'p0', { type: 'play', cards }, ctx);
}

describe('carta no ar', () => {
  it('antes do prazo nada muda (o mesmo objeto)', () => {
    const air = played(['ataque-0']);
    expect(settleKittens(air, at(4999))).toBe(air);
  });

  it('Ataque: o próximo joga 2 turnos e a carta vai pro descarte', () => {
    const s = settleKittens(played(['ataque-0']), at(5000));
    expect(s).toMatchObject({ pending: null, current: 'p1', owed: 2 });
    expect(s.discard).toEqual(['ataque-0']);
    expect(s.log.at(-1)!.ev).toEqual({ t: 'resolved', by: 'p0', play: 'ataque', canceled: false });
  });

  it('Ataque de quem estava sob ataque acumula: 2 → 4', () => {
    expect(settleKittens(played(['ataque-0'], { owed: 2 }), at(5000))).toMatchObject({ current: 'p1', owed: 4 });
  });

  it('Nem vem! em número ímpar cancela; par deixa valer', () => {
    const one = act(played(['ataque-0']), 'p1', { type: 'nope' }, at(1000));
    const canceled = settleKittens(one, at(6000));
    expect(canceled).toMatchObject({ pending: null, current: 'p0', owed: 1 });
    expect(canceled.discard).toEqual(['ataque-0', 'nemvem-1']);
    expect(canceled.log.at(-1)!.ev).toEqual({ t: 'resolved', by: 'p0', play: 'ataque', canceled: true });
    const two = act(one, 'p0', { type: 'nope' }, at(2000));
    expect(settleKittens(two, at(7000))).toMatchObject({ current: 'p1', owed: 2 });
  });

  it('cada Nem vem! empurra o prazo', () => {
    const one = act(played(['ataque-0']), 'p1', { type: 'nope' }, at(4000));
    expect(settleKittens(one, at(5000))).toBe(one);
    expect(settleKittens(one, at(9000)).pending).toBeNull();
  });

  it('Nem vem! que chega depois do prazo é tarde: a carta já resolveu', () => {
    expect(refuse(played(['ataque-0']), 'p1', { type: 'nope' }, at(5000))).toBe('nothing_to_nope');
  });

  it('Pular gasta 1 turno', () => {
    expect(settleKittens(played(['pular-0']), at(5000))).toMatchObject({ current: 'p1', owed: 1 });
    expect(settleKittens(played(['pular-0'], { owed: 2 }), at(5000))).toMatchObject({ current: 'p0', owed: 1 });
  });

  it('Embaralhar mexe no monte e apaga o Espiar', () => {
    const s = { ...played(['embaralhar-0']), peek: { who: 'p0', cards: ['preguica-0'] } };
    const after = settleKittens(s, at(5000));
    expect([...after.draw].sort()).toEqual([...DRAW].sort());
    expect(after.peek).toBeNull();
    expect(after.current).toBe('p0');
  });

  it('Espiar mostra as 3 de cima (a do topo primeiro) e some quando ele compra', () => {
    const after = settleKittens(played(['espiar-0']), at(5000));
    expect(after.peek).toEqual({ who: 'p0', cards: ['preguica-0', 'tamandua-0', 'quati-0'] });
    expect(after.draw).toEqual(DRAW);
    expect(after).toMatchObject({ current: 'p0', owed: 1 });
    expect(act(after, 'p0', { type: 'draw' }, at(5000)).peek).toBeNull();
  });

  it('fora de partida nada muda', () => {
    const lobby = { ...played(['ataque-0']), phase: 'lobby' as const };
    expect(settleKittens(lobby, at(9000))).toBe(lobby);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w shared -- kittens-resolve`
Expected: FAIL (`settle` não existe).

- [ ] **Step 3: Write `resolve.ts`**

`shared/src/games/kittens/resolve.ts` (os efeitos de Favor, par, trio e 5 diferentes entram na Task 6; por enquanto eles só descartam):

```ts
import type { GameContext } from '../../game';
import { shuffle } from '../../rng';
import { logged, nextAlive, passTo, spendTurn } from './turn';
import type { KittensPlay, KittensState } from './types';

/** O efeito da jogada que não foi cancelada. `before` = descarte de antes da jogada. */
function applyEffect(s: KittensState, by: string, play: KittensPlay, ctx: GameContext): KittensState {
  switch (play.kind) {
    case 'ataque':
      // Quem estava sob ataque (owed ≥ 2) passa os turnos que devia + 2 (spec §2).
      return passTo(s, nextAlive(s, by), 2 + (s.owed >= 2 ? s.owed : 0));
    case 'pular':
      return spendTurn(s);
    case 'embaralhar':
      return { ...s, draw: shuffle(ctx.rng, s.draw), peek: null };
    case 'espiar':
      return { ...s, peek: { who: by, cards: s.draw.slice(-3).reverse() } };
    default:
      return s;
  }
}

/**
 * A carta no ar resolve (prazo vencido): Nem vem! em número ímpar cancela (spec §4.2). Também não vale se quem jogou
 * ou o alvo já saiu. A jogada e os Nem vem! vão pro descarte em qualquer caso.
 */
export function resolvePending(s: KittensState, ctx: GameContext): KittensState {
  const p = s.pending!;
  const { by, play } = p;
  const base: KittensState = { ...s, pending: null, discard: [...s.discard, ...play.cards, ...p.nopes.map((n) => n.card)] };
  const targetOk = play.target === null || (base.alive.includes(play.target) && (base.hands[play.target]?.length ?? 0) > 0);
  const canceled = p.nopes.length % 2 === 1 || !base.alive.includes(by) || !targetOk;
  const done = logged(base, { t: 'resolved', by, play: play.kind, canceled });
  return canceled ? done : applyEffect(done, by, play, ctx);
}
```

- [ ] **Step 4: Write `settle.ts`**

`shared/src/games/kittens/settle.ts`:

```ts
import type { GameContext } from '../../game';
import { resolvePending } from './resolve';
import type { KittensState } from './types';

/**
 * Prazos (e, na Task 7, presença). Roda antes de cada ação, a cada `tick` da sala e no alarme.
 * Devolve o MESMO objeto quando nada muda (o servidor compara referência).
 */
export function settleKittens(state: KittensState, ctx: GameContext): KittensState {
  if (state.phase !== 'playing') return state;
  let s = state;
  if (s.pending && ctx.now >= s.pending.resolvesAt) s = resolvePending(s, ctx);
  return s;
}
```

- [ ] **Step 5: Settle before each action in `rules.ts`**

Em `shared/src/games/kittens/rules.ts`, acrescente o import:

```ts
import { settleKittens } from './settle';
```

e troque a linha `const s = state;` de `applyKittensAction` por:

```ts
  // Prazo vencido resolve antes: Nem vem! que chega depois do fim da janela não vale (spec §7).
  const s = settleKittens(state, ctx);
```

(Se a ação for recusada, o estado acertado não é gravado; o alarme da sala acerta de novo logo em seguida.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -w shared -- kittens`
Expected: PASS (todos os `kittens-*`).

- [ ] **Step 7: Commit**

```bash
git add shared/src/games/kittens/resolve.ts shared/src/games/kittens/settle.ts shared/src/games/kittens/rules.ts shared/test/kittens-resolve.test.ts
git commit -m "feat(shared): carta no ar resolve no prazo (Ataque acumula, Nem vem! par/ímpar)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Favor, combos e escolhas com prazo

**Files:**
- Modify: `shared/src/games/kittens/choices.ts`
- Modify: `shared/src/games/kittens/resolve.ts`
- Modify: `shared/src/games/kittens/settle.ts`
- Modify: `shared/src/games/kittens/rules.ts`
- Test: `shared/test/kittens-combos.test.ts`

- [ ] **Step 1: Write the failing test**

`shared/test/kittens-combos.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { settleKittens } from '../src/games/kittens/settle';
import { KITTENS_CHOICE_MS, type KittensAction } from '../src/games/kittens/types';
import { T0, act, ctxOf, ids, refuse, table } from './kittens-helpers';

const ctx = ctxOf(ids(3));
const at = (ms: number) => ctxOf(ids(3), { now: T0 + ms });
const hands = () => ({
  p0: ['favor-0', 'capivara-0', 'capivara-1', 'capivara-2', 'mico-0', 'quati-0', 'tamandua-0', 'preguica-0'],
  p1: ['ataque-5', 'pular-5'],
  p2: ['espiar-5'],
});

/** p0 joga `action` e a janela de 5 s passa sem Nem vem!. */
function resolved(action: KittensAction, discard: string[] = []) {
  const s = act(table({ hands: hands(), discard, draw: ['pular-9', 'mico-9'] }), 'p0', action, ctx);
  return settleKittens(s, at(5000));
}

describe('Favor', () => {
  const favor: KittensAction = { type: 'play', cards: ['favor-0'], target: 'p1' };

  it('o alvo escolhe o que dar; só os dois veem qual carta', () => {
    const s = resolved(favor);
    expect(s.choice).toEqual({ kind: 'favor', who: 'p1', to: 'p0', deadline: T0 + 5000 + KITTENS_CHOICE_MS });
    expect(refuse(s, 'p0', { type: 'draw' }, at(5000))).toBe('waiting_choice');
    expect(refuse(s, 'p0', { type: 'choose', card: 'ataque-5' }, at(5000))).toBe('not_your_choice');
    expect(refuse(s, 'p1', { type: 'choose', card: 'mico-0' }, at(5000))).toBe('bad_choice');
    expect(refuse(s, 'p1', { type: 'choose' }, at(5000))).toBe('bad_choice');
    const given = act(s, 'p1', { type: 'choose', card: 'pular-5' }, at(5000));
    expect(given.hands.p1).toEqual(['ataque-5']);
    expect(given.hands.p0).toContain('pular-5');
    expect(given).toMatchObject({ choice: null, current: 'p0', owed: 1 });
    expect(given.log.at(-1)).toMatchObject({ ev: { t: 'gave', from: 'p1', to: 'p0', card: 'pular-5' }, seenBy: ['p1', 'p0'] });
  });

  it('sem resposta, no fim do prazo vai uma carta ao acaso', () => {
    const late = settleKittens(resolved(favor), at(5000 + KITTENS_CHOICE_MS));
    expect(late.choice).toBeNull();
    expect(late.hands.p1).toHaveLength(1);
    expect(late.hands.p0).toHaveLength(8);
  });
});

describe('combos', () => {
  it('par: rouba uma carta ao acaso; só os dois veem qual', () => {
    const s = resolved({ type: 'play', cards: ['capivara-0', 'capivara-1'], target: 'p1' });
    expect(s.hands.p1).toHaveLength(1);
    const stolen = s.hands.p0.find((c) => c === 'ataque-5' || c === 'pular-5');
    expect(stolen).toBeDefined();
    expect(s.log.at(-1)).toMatchObject({ ev: { t: 'stole', from: 'p1', to: 'p0', card: stolen }, seenBy: ['p1', 'p0'] });
  });

  it('trio: pede pelo nome; se o alvo tiver, entrega; se não, nada', () => {
    const trio = ['capivara-0', 'capivara-1', 'capivara-2'];
    const got = resolved({ type: 'play', cards: trio, target: 'p1', ask: 'pular' });
    expect(got.hands.p1).toEqual(['ataque-5']);
    expect(got.hands.p0).toContain('pular-5');
    expect(got.log.at(-1)!.ev).toEqual({ t: 'asked', from: 'p1', to: 'p0', ask: 'pular', card: 'pular-5' });
    const none = resolved({ type: 'play', cards: trio, target: 'p1', ask: 'favor' });
    expect(none.hands.p1).toEqual(['ataque-5', 'pular-5']);
    expect(none.log.at(-1)!.ev).toEqual({ t: 'asked', from: 'p1', to: 'p0', ask: 'favor', card: null });
  });

  it('5 diferentes: escolhe do descarte de antes da jogada', () => {
    const cinco: KittensAction = { type: 'play', cards: ['capivara-0', 'mico-0', 'quati-0', 'tamandua-0', 'preguica-0'] };
    const s = resolved(cinco, ['ataque-7', 'espiar-7']);
    expect(s.choice).toEqual({ kind: 'cinco', who: 'p0', options: ['ataque-7', 'espiar-7'], deadline: T0 + 5000 + KITTENS_CHOICE_MS });
    expect(refuse(s, 'p0', { type: 'choose', card: 'mico-0' }, at(5000))).toBe('bad_choice');
    const picked = act(s, 'p0', { type: 'choose', card: 'espiar-7' }, at(5000));
    expect(picked.discard).not.toContain('espiar-7');
    expect(picked.hands.p0).toContain('espiar-7');
    expect(picked.choice).toBeNull();
    expect(picked.log.at(-1)!.ev).toEqual({ t: 'picked', by: 'p0', card: 'espiar-7' });
    const late = settleKittens(s, at(5000 + KITTENS_CHOICE_MS));
    expect(late.choice).toBeNull();
    expect(late.hands.p0.filter((c) => c === 'ataque-7' || c === 'espiar-7')).toHaveLength(1);
  });

  it('5 diferentes com o descarte vazio: nada acontece', () => {
    const s = resolved({ type: 'play', cards: ['capivara-0', 'mico-0', 'quati-0', 'tamandua-0', 'preguica-0'] });
    expect(s.choice).toBeNull();
    expect(s.current).toBe('p0');
  });
});

describe('Cafuné sem resposta', () => {
  it('no fim do prazo o tatu vai pra um lugar ao acaso e a vez passa', () => {
    const s = act(table({ hands: { p0: ['cafune-0'], p1: [], p2: [] }, draw: ['mico-0', 'tatubum-0'] }), 'p0', { type: 'draw' }, ctx);
    expect(settleKittens(s, at(KITTENS_CHOICE_MS - 1))).toBe(s);
    const late = settleKittens(s, at(KITTENS_CHOICE_MS));
    expect(late.choice).toBeNull();
    expect([...late.draw].sort()).toEqual(['mico-0', 'tatubum-0']);
    expect(late.current).toBe('p1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w shared -- kittens-combos`
Expected: FAIL (Favor não abre escolha, par/trio não movem carta).

- [ ] **Step 3: Complete `choices.ts`**

Acrescente ao fim de `shared/src/games/kittens/choices.ts`:

```ts
/** Favor: `who` dá `card` pra `to`. Só os dois veem qual carta foi. */
export function giveFavor(s: KittensState, c: Choice<'favor'>, card: string): KittensState {
  const hands = {
    ...s.hands,
    [c.who]: s.hands[c.who]!.filter((x) => x !== card),
    [c.to]: [...s.hands[c.to]!, card],
  };
  return logged({ ...s, hands, choice: null }, { t: 'gave', from: c.who, to: c.to, card }, [c.who, c.to]);
}

/** 5 diferentes: `who` pega `card` do descarte (todos veem). */
export function pickFromDiscard(s: KittensState, c: Choice<'cinco'>, card: string): KittensState {
  const hands = { ...s.hands, [c.who]: [...s.hands[c.who]!, card] };
  return logged({ ...s, discard: s.discard.filter((x) => x !== card), hands, choice: null }, { t: 'picked', by: c.who, card });
}

/** Prazo vencido (ou quem escolhe caiu de vez): o servidor escolhe ao acaso. */
export function chooseAtRandom(s: KittensState, rng: Rng): KittensState {
  const c = s.choice!;
  switch (c.kind) {
    case 'cafune':
      return hideTatu(s, c, 'random', rng);
    case 'favor': {
      const hand = s.hands[c.who]!;
      return hand.length === 0 ? { ...s, choice: null } : giveFavor(s, c, hand[randomInt(rng, hand.length)]!);
    }
    case 'cinco': {
      const options = c.options.filter((x) => s.discard.includes(x));
      return options.length === 0 ? { ...s, choice: null } : pickFromDiscard(s, c, options[randomInt(rng, options.length)]!);
    }
  }
}
```

- [ ] **Step 4: Complete the effects in `resolve.ts`**

Em `shared/src/games/kittens/resolve.ts`, troque os imports por:

```ts
import type { GameContext } from '../../game';
import { randomInt, shuffle } from '../../rng';
import { kittensKindOf } from './cards';
import { logged, nextAlive, passTo, spendTurn } from './turn';
import { KITTENS_CHOICE_MS, type KittensPlay, type KittensState } from './types';

/** Passa `card` da mão de `from` pra de `to`. */
function moveCard(s: KittensState, from: string, to: string, card: string): KittensState {
  return { ...s, hands: { ...s.hands, [from]: s.hands[from]!.filter((c) => c !== card), [to]: [...s.hands[to]!, card] } };
}
```

troque a assinatura e o `switch` de `applyEffect` por (agora recebe `before`, o descarte de antes da jogada):

```ts
function applyEffect(s: KittensState, by: string, play: KittensPlay, before: string[], ctx: GameContext): KittensState {
  switch (play.kind) {
    case 'ataque':
      // Quem estava sob ataque (owed ≥ 2) passa os turnos que devia + 2 (spec §2).
      return passTo(s, nextAlive(s, by), 2 + (s.owed >= 2 ? s.owed : 0));
    case 'pular':
      return spendTurn(s);
    case 'embaralhar':
      return { ...s, draw: shuffle(ctx.rng, s.draw), peek: null };
    case 'espiar':
      return { ...s, peek: { who: by, cards: s.draw.slice(-3).reverse() } };
    case 'favor':
      return { ...s, choice: { kind: 'favor', who: play.target!, to: by, deadline: ctx.now + KITTENS_CHOICE_MS } };
    case 'par': {
      const hand = s.hands[play.target!]!;
      const card = hand[randomInt(ctx.rng, hand.length)]!;
      return logged(moveCard(s, play.target!, by, card), { t: 'stole', from: play.target!, to: by, card }, [play.target!, by]);
    }
    case 'trio': {
      const card = s.hands[play.target!]!.find((c) => kittensKindOf(c) === play.ask) ?? null;
      const moved = card === null ? s : moveCard(s, play.target!, by, card);
      return logged(moved, { t: 'asked', from: play.target!, to: by, ask: play.ask!, card });
    }
    case 'cinco':
      return before.length === 0
        ? s
        : { ...s, choice: { kind: 'cinco', who: by, options: before, deadline: ctx.now + KITTENS_CHOICE_MS } };
  }
}
```

e, em `resolvePending`, troque a última linha por:

```ts
  return canceled ? done : applyEffect(done, by, play, s.discard, ctx);
```

(`s.discard` ainda é o descarte de antes: a jogada só entra no descarte em `base`.)

- [ ] **Step 5: Choice deadline in `settle.ts`**

Em `shared/src/games/kittens/settle.ts`, acrescente o import:

```ts
import { chooseAtRandom } from './choices';
```

e, antes da linha do `pending`:

```ts
  if (s.choice && ctx.now >= s.choice.deadline) s = chooseAtRandom(s, ctx.rng);
```

- [ ] **Step 6: Favor and 5-different choices in `rules.ts`**

Em `shared/src/games/kittens/rules.ts`, troque o import de `./choices` por:

```ts
import { giveFavor, hideTatu, pickFromDiscard } from './choices';
```

e troque o `case 'choose'` inteiro por:

```ts
    case 'choose': {
      if (s.phase !== 'playing') return fail('bad_phase');
      const c = s.choice;
      if (!c || c.who !== playerId) return fail('not_your_choice');
      switch (c.kind) {
        case 'cafune': {
          const { position } = action;
          if (position === undefined || (position !== 'random' && position > s.draw.length)) return fail('bad_choice');
          return ok(hideTatu(s, c, position, ctx.rng));
        }
        case 'favor':
          if (action.card === undefined || !s.hands[playerId]!.includes(action.card)) return fail('bad_choice');
          return ok(giveFavor(s, c, action.card));
        case 'cinco':
          if (action.card === undefined || !c.options.includes(action.card) || !s.discard.includes(action.card)) {
            return fail('bad_choice');
          }
          return ok(pickFromDiscard(s, c, action.card));
      }
    }
```

(Se o TypeScript reclamar de "fallthrough" no `case 'choose'`, é porque o `switch` interno não é visto como exaustivo: acrescente `return fail('bad_choice');` depois dele.)

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test -w shared -- kittens` e `npm run typecheck`
Expected: PASS nos dois.

- [ ] **Step 8: Commit**

```bash
git add shared/src/games/kittens/choices.ts shared/src/games/kittens/resolve.ts shared/src/games/kittens/settle.ts shared/src/games/kittens/rules.ts shared/test/kittens-combos.test.ts
git commit -m "feat(shared): Favor, combos e escolhas com prazo de 30 s no Tatubum" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Presença (quem cai de vez sai do jogo)

**Files:**
- Modify: `shared/src/games/kittens/settle.ts`
- Test: `shared/test/kittens-presence.test.ts`

- [ ] **Step 1: Write the failing test**

`shared/test/kittens-presence.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { settleKittens } from '../src/games/kittens/settle';
import { T0, act, ctxOf, ids, table } from './kittens-helpers';

const all = ids(3);
/** Ativos sem `p` (a tolerância de 30 s de `p` já acabou). */
const without = (p: string, ms = 0) => ctxOf(all.filter((x) => x !== p), { now: T0 + ms });

describe('presença', () => {
  it('todo mundo presente: o mesmo objeto', () => {
    const s = table({ hands: { p0: [], p1: [], p2: [] }, draw: ['tatubum-0', 'tatubum-1'] });
    expect(settleKittens(s, ctxOf(all))).toBe(s);
  });

  it('quem caiu de vez sai: mão fora do jogo e um tatu sai do monte', () => {
    const s = table({ hands: { p0: ['mico-0'], p1: ['quati-0'], p2: [] }, draw: ['tatubum-0', 'pular-0', 'tatubum-1'] });
    const after = settleKittens(s, without('p1'));
    expect(after.alive).toEqual(['p0', 'p2']);
    expect(after.hands.p1).toEqual([]);
    expect(after.out).toEqual(['quati-0', 'tatubum-0']);
    expect(after.draw).toEqual(['pular-0', 'tatubum-1']);
    expect(after.current).toBe('p0');
    expect(after.log.at(-1)!.ev).toEqual({ t: 'left', by: 'p1' });
  });

  it('se era a vez de quem saiu, o próximo começa com 1 turno', () => {
    const s = table({ hands: { p0: [], p1: [], p2: [] }, draw: ['tatubum-0', 'tatubum-1'], owed: 2 });
    expect(settleKittens(s, without('p0'))).toMatchObject({ current: 'p1', owed: 1 });
  });

  it('com 2, quem fica vence', () => {
    const s = table({ hands: { p0: [], p1: [] }, draw: ['tatubum-0'] });
    expect(settleKittens(s, ctxOf(['p0']))).toMatchObject({ phase: 'gameover', winner: 'p0' });
  });

  it('a escolha de quem saiu é feita ao acaso antes', () => {
    const s = {
      ...table({ hands: { p0: ['mico-0'], p1: ['quati-0', 'pular-0'], p2: [] }, draw: ['tatubum-0', 'tatubum-1'] }),
      choice: { kind: 'favor' as const, who: 'p1', to: 'p0', deadline: T0 + 30_000 },
    };
    const after = settleKittens(s, without('p1'));
    expect(after.hands.p0).toHaveLength(2);
    expect(after.choice).toBeNull();
    expect(after.alive).toEqual(['p0', 'p2']);
  });

  it('se quem ia receber o Favor sai, a escolha some', () => {
    const s = {
      ...table({ hands: { p0: [], p1: ['quati-0'], p2: [] }, draw: ['tatubum-0', 'tatubum-1'] }),
      choice: { kind: 'favor' as const, who: 'p1', to: 'p0', deadline: T0 + 30_000 },
    };
    expect(settleKittens(s, without('p0'))).toMatchObject({ choice: null, current: 'p1' });
  });

  it('o tatu que está na mão de quem escolhe onde esconder conta: sai um tatu do monte', () => {
    // p0 comprou um tatu e está escolhendo (o tatu não está no monte); p1 cai de vez.
    const s = {
      ...table({ hands: { p0: [], p1: [], p2: [] }, draw: ['mico-0', 'tatubum-1'] }),
      choice: { kind: 'cafune' as const, who: 'p0', tatu: 'tatubum-0', deadline: T0 + 30_000 },
    };
    const after = settleKittens(s, without('p1'));
    expect(after.draw).toEqual(['mico-0']);
    expect(after.out).toEqual(['tatubum-1']);
    const hid = act(after, 'p0', { type: 'choose', position: 0 }, without('p1'));
    expect(hid.draw.filter((c) => c.startsWith('tatubum'))).toHaveLength(1);
  });

  it('a carta no ar de quem saiu não faz efeito', () => {
    const air = act(table({ hands: { p0: ['ataque-0'], p1: [], p2: [] } }), 'p0', { type: 'play', cards: ['ataque-0'] }, ctxOf(all));
    const gone = settleKittens(air, without('p0', 1000));
    expect(gone.current).toBe('p1');
    const done = settleKittens(gone, without('p0', 5000));
    expect(done).toMatchObject({ pending: null, current: 'p1', owed: 1 });
    expect(done.log.at(-1)!.ev).toEqual({ t: 'resolved', by: 'p0', play: 'ataque', canceled: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w shared -- kittens-presence`
Expected: FAIL (ninguém é eliminado).

- [ ] **Step 3: Elimination in `settle.ts`**

Substitua `shared/src/games/kittens/settle.ts` inteiro por:

```ts
import type { GameContext } from '../../game';
import { chooseAtRandom } from './choices';
import { resolvePending } from './resolve';
import { eliminate, logged } from './turn';
import type { KittensState } from './types';

/** `p` caiu e não voltou em 30 s: a escolha dele é feita ao acaso e ele sai como se tivesse explodido. */
function leave(state: KittensState, p: string, ctx: GameContext): KittensState {
  let s = state;
  if (s.choice?.who === p) s = chooseAtRandom(s, ctx.rng);
  else if (s.choice?.kind === 'favor' && s.choice.to === p) s = { ...s, choice: null };
  return eliminate(logged(s, { t: 'left', by: p }), p);
}

/**
 * Presença e prazos. Roda antes de cada ação, a cada `tick` da sala e no alarme. Ordem: quem caiu de vez sai;
 * escolha vencida é feita ao acaso; carta no ar vencida resolve. Devolve o MESMO objeto quando nada muda.
 */
export function settleKittens(state: KittensState, ctx: GameContext): KittensState {
  if (state.phase !== 'playing') return state;
  let s = state;
  for (const p of state.alive.filter((x) => !ctx.active.includes(x))) {
    if (s.phase !== 'playing') break;
    s = leave(s, p, ctx);
  }
  if (s.phase !== 'playing') return s;
  if (s.choice && ctx.now >= s.choice.deadline) s = chooseAtRandom(s, ctx.rng);
  if (s.pending && ctx.now >= s.pending.resolvesAt) s = resolvePending(s, ctx);
  return s;
}
```

- [ ] **Step 4: Count the tatu being hidden in `eliminate`** (achado da revisão da Task 3)

Enquanto alguém escolhe onde esconder o tatu (`choice.kind === 'cafune'`), esse tatu não está no monte. Em `shared/src/games/kittens/turn.ts`, dentro de `eliminate`, troque o `if (tatusIn(draw) > alive.length - 1) {` por:

```ts
  // O tatu que alguém está escondendo (Cafuné) ainda não voltou pro monte, mas conta.
  const held = state.choice?.kind === 'cafune' ? 1 : 0;
  if (tatusIn(draw) > 0 && tatusIn(draw) + held > alive.length - 1) {
```

e atualize o comentário de `eliminate` pra dizer "mais tatus (contando o que está sendo escondido) que vivos − 1".

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -w shared -- kittens`
Expected: PASS (todos os `kittens-*`).

- [ ] **Step 6: Commit**

```bash
git add shared/src/games/kittens/settle.ts shared/src/games/kittens/turn.ts shared/test/kittens-presence.test.ts
git commit -m "feat(shared): quem cai de vez sai do Tatubum (e leva um tatu do monte)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Visão, prazo, módulo e schema

**Files:**
- Create: `shared/src/games/kittens/view.ts`
- Create: `shared/src/games/kittens/schema.ts`
- Test: `shared/test/kittens-view.test.ts`
- Test: `shared/test/kittens-schema.test.ts`

- [ ] **Step 1: Write the failing tests**

`shared/test/kittens-view.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { initialKittensState } from '../src/games/kittens/rules';
import { kittens, kittensNextDeadline, kittensViewFor } from '../src/games/kittens/view';
import { T0, act, ctxOf, ids, table } from './kittens-helpers';

const s = {
  ...table({
    hands: { p0: ['mico-0', 'nemvem-0'], p1: ['quati-0'], p2: [] },
    draw: ['pular-0', 'tatubum-0', 'espiar-0'],
    discard: ['ataque-0'],
  }),
  peek: { who: 'p0', cards: ['espiar-0', 'tatubum-0', 'pular-0'] },
};

describe('visão do Tatubum', () => {
  it('mão só a sua; dos outros, a quantidade; monte só em números', () => {
    const v = kittensViewFor(s, 'p1');
    expect(v.hand).toEqual(['quati-0']);
    expect(v.handCounts).toEqual({ p0: 2, p1: 1, p2: 0 });
    expect(v).toMatchObject({ drawCount: 3, tatusInDraw: 1, discard: ['ataque-0'], current: 'p0', owed: 1 });
    expect(JSON.stringify(v)).not.toContain('mico-0');
    expect(JSON.stringify(v)).not.toContain('espiar-0');
  });

  it('o Espiar só aparece pra quem espiou', () => {
    expect(kittensViewFor(s, 'p0')).toMatchObject({ peek: ['espiar-0', 'tatubum-0', 'pular-0'], peekBy: 'p0' });
    expect(kittensViewFor(s, 'p1')).toMatchObject({ peek: null, peekBy: 'p0' });
  });

  it('espectador não tem mão', () => {
    expect(kittensViewFor(s, null).hand).toEqual([]);
    expect(kittensViewFor(s, 'p9').hand).toEqual([]);
  });

  it('o diário esconde a carta de quem não pode ver', () => {
    const drawn = act(table({ hands: { p0: [], p1: [], p2: [] }, draw: ['mico-0'] }), 'p0', { type: 'draw' }, ctxOf(ids(3)));
    expect(kittensViewFor(drawn, 'p0').log.at(-1)).toEqual({ n: 0, ev: { t: 'draw', by: 'p0', card: 'mico-0' } });
    expect(kittensViewFor(drawn, 'p1').log.at(-1)).toEqual({ n: 0, ev: { t: 'draw', by: 'p0', card: null } });
  });
});

describe('prazo do Tatubum', () => {
  it('só com carta no ar ou escolha aberta', () => {
    expect(kittensNextDeadline(initialKittensState())).toBeNull();
    expect(kittensNextDeadline(s)).toBeNull();
    const air = act(table({ hands: { p0: ['ataque-0'], p1: [], p2: [] } }), 'p0', { type: 'play', cards: ['ataque-0'] }, ctxOf(ids(3)));
    expect(kittensNextDeadline(air)).toBe(T0 + 5000);
    const choosing = { ...s, choice: { kind: 'cafune' as const, who: 'p0', tatu: 'tatubum-9', deadline: T0 + 30_000 } };
    expect(kittensNextDeadline(choosing)).toBe(T0 + 30_000);
    expect(kittensNextDeadline({ ...air, phase: 'gameover' })).toBeNull();
  });

  it('módulo kittens', () => {
    expect(kittens.id).toBe('kittens');
    expect(kittens.initialState()).toEqual(initialKittensState());
  });
});
```

`shared/test/kittens-schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { kittensActionSchema } from '../src/games/kittens/schema';

const valid = (a: unknown) => kittensActionSchema.safeParse(a).success;

describe('schema das ações do Tatubum', () => {
  it('aceita as ações do jogo', () => {
    for (const a of [
      { type: 'start' },
      { type: 'play', cards: ['ataque-0'] },
      { type: 'play', cards: ['capivara-0', 'capivara-1', 'capivara-2'], target: 'p1', ask: 'favor' },
      { type: 'nope' },
      { type: 'draw' },
      { type: 'choose', position: 'random' },
      { type: 'choose', position: 3 },
      { type: 'choose', card: 'mico-0' },
      { type: 'again' },
      { type: 'lobby' },
    ]) {
      expect(valid(a)).toBe(true);
    }
  });

  it('recusa o que não é ação do Tatubum', () => {
    for (const a of [
      { type: 'play', cards: [] },
      { type: 'play', cards: ['a-0', 'a-1', 'a-2', 'a-3', 'a-4', 'a-5'] },
      { type: 'play', cards: ['ataque-0'], ask: 'xadrez' },
      { type: 'choose', position: -1 },
      { type: 'choose', position: 1.5 },
      { type: 'boom' },
    ]) {
      expect(valid(a)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w shared -- kittens-view kittens-schema`
Expected: FAIL (`view`/`schema` não existem).

- [ ] **Step 3: Write `view.ts`**

`shared/src/games/kittens/view.ts`:

```ts
import type { GameModule } from '../../game';
import { applyKittensAction, initialKittensState } from './rules';
import { settleKittens } from './settle';
import { tatusIn } from './turn';
import type { KittensAction, KittensEvent, KittensState, KittensView } from './types';

/** Lê o registro só se a chave for própria (ids como '__proto__' não podem cair no protótipo). */
function own<T>(record: Record<string, T>, key: string | null): T | undefined {
  return key !== null && Object.hasOwn(record, key) ? record[key] : undefined;
}

/** Tira a carta de um evento (pra quem não está no `seenBy`). */
function hideCard(ev: KittensEvent): KittensEvent {
  return 'card' in ev ? ({ ...ev, card: null } as KittensEvent) : ev;
}

/**
 * Única fronteira de segredo do Tatubum: mãos, monte, Espiar e cartas do diário só pra quem pode ver (spec §4.3).
 * A visão compartilha arrays/objetos com o estado (é serializada no socket); quem consome não deve mutar.
 */
export function kittensViewFor(state: KittensState, viewerId: string | null): KittensView {
  const peek = state.peek;
  return {
    phase: state.phase,
    players: state.players,
    alive: state.alive,
    current: state.current,
    owed: state.owed,
    hand: own(state.hands, viewerId) ?? [],
    handCounts: Object.fromEntries(state.players.map((p) => [p, state.hands[p]?.length ?? 0])),
    drawCount: state.draw.length,
    tatusInDraw: tatusIn(state.draw),
    discard: state.discard,
    out: state.out,
    pending: state.pending,
    choice: state.choice,
    peek: peek !== null && peek.who === viewerId ? peek.cards : null,
    peekBy: peek?.who ?? null,
    log: state.log.map(({ n, ev, seenBy }) => ({
      n,
      ev: seenBy === null || (viewerId !== null && seenBy.includes(viewerId)) ? ev : hideCard(ev),
    })),
    winner: state.winner,
  };
}

/** Prazo da carta no ar ou da escolha aberta (nunca os dois ao mesmo tempo). */
export function kittensNextDeadline(state: KittensState): number | null {
  if (state.phase !== 'playing') return null;
  return state.pending?.resolvesAt ?? state.choice?.deadline ?? null;
}

export const kittens: GameModule<KittensState, KittensAction, KittensView> = {
  id: 'kittens',
  initialState: () => initialKittensState(),
  applyAction: applyKittensAction,
  viewFor: kittensViewFor,
  onPresenceChange: settleKittens,
  nextDeadline: kittensNextDeadline,
};
```

- [ ] **Step 4: Write `schema.ts`**

`shared/src/games/kittens/schema.ts`:

```ts
import { z } from 'zod';
import { KITTENS_CARD_KINDS } from './cards';
import type { KittensAction } from './types';

const cardId = z.string().min(1).max(32);

export const kittensActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start') }),
  z.object({
    type: z.literal('play'),
    cards: z.array(cardId).min(1).max(5),
    target: z.string().min(1).max(64).optional(),
    ask: z.enum(KITTENS_CARD_KINDS).optional(),
  }),
  z.object({ type: z.literal('nope') }),
  z.object({ type: z.literal('draw') }),
  z.object({
    type: z.literal('choose'),
    card: cardId.optional(),
    position: z.union([z.number().int().min(0).max(200), z.literal('random')]).optional(),
  }),
  z.object({ type: z.literal('again') }),
  z.object({ type: z.literal('lobby') }),
]);

/** Falha a compilação se o schema divergir do tipo KittensAction. */
type Assert<T extends true> = T;
export type KittensActionSchemaMatches = Assert<z.infer<typeof kittensActionSchema> extends KittensAction ? true : false>;
export type KittensActionTypeCovered = Assert<KittensAction extends z.infer<typeof kittensActionSchema> ? true : false>;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -w shared -- kittens` e `npm run typecheck`
Expected: PASS nos dois.

- [ ] **Step 6: Commit**

```bash
git add shared/src/games/kittens/view.ts shared/src/games/kittens/schema.ts shared/test/kittens-view.test.ts shared/test/kittens-schema.test.ts
git commit -m "feat(shared): visão com segredos, prazo e schema do Tatubum" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Registro, sala, erros e exports

**Files:**
- Modify: `shared/src/games/registry.ts`
- Modify: `shared/src/room.ts`
- Modify: `shared/src/history.ts:193`
- Modify: `shared/src/protocol.ts`
- Modify: `shared/src/index.ts`
- Modify: `server/src/index.ts:83`
- Test: `shared/test/room-games.test.ts`

- [ ] **Step 1: Write the failing test**

Em `shared/test/room-games.test.ts`:

1. Acrescente aos imports:

```ts
import { KITTENS_NOPE_MS, type KittensState } from '../src/games/kittens/types';
```

e `isKittensRoomView` na lista importada de `../src/room`.

2. No teste `'conhece ITO, Dixit e Retratim'`, troque o nome pra `'conhece ITO, Dixit, Retratim e Tatubum'`, a primeira expectativa por:

```ts
    expect(Object.keys(GAMES)).toEqual(['ito', 'dixit', 'pictures', 'kittens']);
```

e acrescente antes do fim do teste:

```ts
    expect(GAMES.kittens).toMatchObject({ minPlayers: 2, maxPlayers: 8, liveCursors: false, recordsHistory: false });
    expect(isGameId('kittens')).toBe(true);
```

3. No fim do arquivo:

```ts
function kittensRoom(n: number): Room {
  let room = createRoom('ABCD', 0, 'kittens');
  for (let i = 0; i < n; i++) {
    const res = joinRoom(room, { token: `t${i}`, name: `P${i}`, color: PLAYER_COLORS[i]! }, `p${i}`, 0);
    if (!res.ok) throw new Error(res.error);
    room = res.room;
  }
  return room;
}

describe('sala de Tatubum', () => {
  it('é de Tatubum, cabe 8 e recusa o 9º', () => {
    const room = kittensRoom(8);
    expect(isKittensRoomView(roomView(room, null))).toBe(true);
    expect(roomSummary(room)).toMatchObject({ game: 'kittens', phase: 'lobby' });
    expect(joinRoom(room, { token: 't8', name: 'P8', color: PLAYER_COLORS[8]! }, 'p8', 0)).toEqual({ ok: false, error: 'room_full' });
  });

  it('o alarme acorda no fim da janela do Nem vem! e o tick resolve a carta', () => {
    let room = step(kittensRoom(3), 'p0', { type: 'start' }, 10);
    const game = room.game as KittensState;
    // Um Ataque com id próprio na mão de p0, pra não depender do sorteio.
    room = { ...room, game: { ...game, hands: { ...game.hands, p0: ['ataque-99', ...game.hands.p0!] } } };
    room = step(room, 'p0', { type: 'play', cards: ['ataque-99'] }, 20);
    expect(nextAlarmAt(room, 20)).toBe(20 + KITTENS_NOPE_MS);
    expect(tick(room, 20 + KITTENS_NOPE_MS - 1, rng).game).toBe(room.game);
    expect(tick(room, 20 + KITTENS_NOPE_MS, rng).game).toMatchObject({ pending: null, current: 'p1', owed: 2 });
  });

  it('erros do Tatubum têm mensagem em português', () => {
    for (const code of [
      'not_alive',
      'card_in_air',
      'waiting_choice',
      'not_your_turn',
      'not_in_hand',
      'bad_combo',
      'bad_target',
      'bad_ask',
      'nothing_to_nope',
      'no_nope',
      'not_your_choice',
      'bad_choice',
    ]) {
      expect(ERROR_CODES).toContain(code);
      expect(errorMessage(code)).not.toBe('Algo deu errado.');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w shared -- room-games`
Expected: FAIL (`kittens` não está no registro; `isKittensRoomView` não existe).

- [ ] **Step 3: Register the game**

Em `shared/src/games/registry.ts`, acrescente aos imports:

```ts
import { kittensActionSchema } from './kittens/schema';
import { KITTENS_MAX_PLAYERS, KITTENS_MIN_PLAYERS, type KittensAction, type KittensState, type KittensView } from './kittens/types';
import { kittens } from './kittens/view';
```

troque as quatro linhas dos ids e uniões por:

```ts
export const GAME_IDS = ['ito', 'dixit', 'pictures', 'kittens'] as const;
export type GameId = (typeof GAME_IDS)[number];
export type GameState = ItoState | DixitState | PicturesState | KittensState;
export type GameView = ItoView | DixitView | PicturesView | KittensView;
export type GameAction = ItoAction | DixitAction | PicturesAction | KittensAction;
```

e acrescente ao fim de `GAMES` (depois da entrada `pictures`):

```ts
  kittens: defineGame({
    id: 'kittens',
    module: kittens,
    actionSchema: kittensActionSchema,
    minPlayers: KITTENS_MIN_PLAYERS,
    maxPlayers: KITTENS_MAX_PLAYERS,
    // Cursor em cima de uma carta da mão entregaria a jogada.
    liveCursors: false,
    // O histórico do Tatubum vem num plano próprio.
    recordsHistory: false,
  }),
```

- [ ] **Step 4: Room view, history case and error codes**

Em `shared/src/room.ts`, acrescente o import:

```ts
import type { KittensView } from './games/kittens/types';
```

e, logo depois de `isPicturesRoomView`:

```ts
export type KittensRoomView = RoomView<KittensView> & { gameId: 'kittens' };

export function isKittensRoomView(view: RoomView): view is KittensRoomView {
  return view.gameId === 'kittens';
}
```

Em `shared/src/history.ts`, no `switch` de `pendingHistoryRecord`, depois do `case 'pictures'`:

```ts
    case 'kittens':
      return null; // o histórico do Tatubum vem num plano próprio
```

Em `shared/src/protocol.ts`, acrescente ao fim de `ERROR_CODES` (antes de `] as const`):

```ts
  'not_alive',
  'card_in_air',
  'waiting_choice',
  'not_your_turn',
  'not_in_hand',
  'bad_combo',
  'bad_target',
  'bad_ask',
  'nothing_to_nope',
  'no_nope',
  'not_your_choice',
  'bad_choice',
```

e ao fim de `ERROR_MESSAGES`:

```ts
  not_alive: 'Você já saiu dessa partida: agora só assiste.',
  card_in_air: 'Espera a carta no ar resolver.',
  waiting_choice: 'Esperando uma escolha.',
  not_your_turn: 'Não é a sua vez.',
  not_in_hand: 'Essa carta não está na sua mão.',
  bad_combo: 'Essas cartas não formam jogada.',
  bad_target: 'Escolha um adversário vivo com carta na mão.',
  bad_ask: 'Escolha qual carta pedir.',
  nothing_to_nope: 'Não tem carta no ar pra dar Nem vem!.',
  no_nope: 'Você não tem Nem vem!.',
  not_your_choice: 'Essa escolha não é sua.',
  bad_choice: 'Escolha inválida.',
```

Em `server/src/index.ts`, no `switch` de `historyPageOf`, depois do `case 'pictures'`:

```ts
    case 'kittens':
      // sem `recordsHistory` a rota já respondeu 404; o histórico do Tatubum vem num plano próprio
      throw new Error('o Tatubum ainda não tem histórico');
```

- [ ] **Step 5: Exports**

Em `shared/src/index.ts`, antes de `export * from './games/registry';`:

```ts
export * from './games/kittens/types';
export * from './games/kittens/cards';
export {
  KITTENS_EXTRA_CAFUNES,
  KITTENS_HAND_START,
  KITTENS_PACK,
  KITTENS_PACK_SIZE,
  kittensBaseDeck,
  kittensDeal,
  kittensPacksFor,
} from './games/kittens/deck';
export { applyKittensAction, initialKittensState } from './games/kittens/rules';
export { settleKittens } from './games/kittens/settle';
export { kittens, kittensNextDeadline, kittensViewFor } from './games/kittens/view';
export { kittensActionSchema } from './games/kittens/schema';
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -w shared`, `npm run typecheck -w shared` e `npm run typecheck -w server`
Expected: PASS nos três. Se o typecheck acusar outro `switch` exaustivo por `GameId` (`never`) fora dos já tratados (`history.ts`, `server/src/index.ts`), acrescente o caso `kittens` do mesmo jeito.

O typecheck do `web` (e por isso o `npm run typecheck` da raiz) falha até a Task 10, em `web/src/games/catalog.ts` (`TEXT` sem `kittens`) e `GamePage.tsx` (`switch` sem `kittens`). Está certo: a Task 10 resolve.

- [ ] **Step 7: Commit**

```bash
git add shared/src/games/registry.ts shared/src/room.ts shared/src/history.ts shared/src/protocol.ts shared/src/index.ts server/src/index.ts shared/test/room-games.test.ts
git commit -m "feat(shared): Tatubum no registro de jogos (2 a 8, sem histórico ainda)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Servidor e estante

**Files:**
- Create: `server/test/kittens.test.ts`
- Modify: `web/src/games/catalog.ts`
- Modify: `web/src/screens/GamePage.tsx:66-85`
- Test: `web/test/catalog.test.ts`, `web/test/shelf.test.tsx`

- [ ] **Step 1: Write the failing tests**

`server/test/kittens.test.ts`:

```ts
import { SELF } from 'cloudflare:test';
import type { KittensRoomView } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { joined, newGameRoom } from './helpers';

const isPlaying = (r: KittensRoomView) => r.game.phase === 'playing';

describe('Tatubum no servidor', () => {
  it('POST /rooms { game: "kittens" } cria a sala e o GET conta que é de Tatubum', async () => {
    const code = await newGameRoom('kittens');
    const body = await (await SELF.fetch(`https://x/rooms/${code}`)).json();
    expect(body).toMatchObject({ exists: true, game: 'kittens', phase: 'lobby' });
  });

  it('o histórico do Tatubum ainda não existe', async () => {
    const res = await SELF.fetch('https://x/history/kittens');
    expect(res.status).toBe(404);
  });

  it('começa com 2: cada um vê só a própria mão de 8 cartas', async () => {
    const code = await newGameRoom('kittens');
    const players = await joined(code, 2);
    players[0]!.client.send({ t: 'action', action: { type: 'start' } });
    const views = await Promise.all(players.map((p) => p.client.state<KittensRoomView>(isPlaying)));
    for (const v of views) {
      expect(v.game.hand).toHaveLength(8);
      expect(v.game.handCounts).toEqual({ [players[0]!.id]: 8, [players[1]!.id]: 8 });
      expect(v.game.current).toBe(players[0]!.id);
    }
    expect(views[0]!.game.hand).not.toEqual(views[1]!.game.hand);
  });

  it('comprar fora da vez volta erro em português', async () => {
    const code = await newGameRoom('kittens');
    const players = await joined(code, 2);
    players[0]!.client.send({ t: 'action', action: { type: 'start' } });
    await players[1]!.client.state<KittensRoomView>(isPlaying);
    players[1]!.client.send({ t: 'action', action: { type: 'draw' } });
    const err = await players[1]!.client.next('error');
    expect(err).toMatchObject({ code: 'not_your_turn', message: 'Não é a sua vez.' });
  });
});
```

Em `web/test/catalog.test.ts`, acrescente dentro do `describe`:

```ts
  it('Tatubum (o Exploding Kittens) aparece na estante, ainda "em breve"', () => {
    const entry = catalogEntry('kittens');
    expect(entry?.name).toBe('Tatubum');
    expect(entry?.players).toBe('2 a 8 pessoas');
    expect(entry?.playable).toBe(false);
    expect(entry?.hasHistory).toBe(false);
    expect(entry?.mobile).toBe(false);
  });
```

Em `web/test/shelf.test.tsx`, no teste `'uma capa por jogo, que leva pra página do jogo'`, troque a linha do `em breve` por:

```ts
    expect(screen.getByRole('link', { name: /Tatubum/ }).getAttribute('href')).toBe('#/kittens');
    expect(screen.getAllByText('em breve')).toHaveLength(1); // só o Tatubum, que ainda não tem mesa
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w server -- kittens` e `npm test -w web -- catalog shelf`
Expected: o servidor já passa (o registro da Task 9 basta) ou falha só no build do worker se algo do `index.ts` faltou; o web FALHA (`catalogEntry('kittens')` sem texto).

- [ ] **Step 3: Catalog entry**

Em `web/src/games/catalog.ts`, troque o comentário de cima do `TEXT` por:

```ts
// Nomes de vitrine: o ITO aparece como DITU, o Dixit como Diquisti, o Pictures como Retratim e o Exploding Kittens como
// Tatubum; os ids internos não mudam.
```

e acrescente ao fim de `TEXT` (depois de `pictures`):

```ts
  kittens: {
    name: 'Tatubum',
    tagline: 'compre do monte e torça pra não vir o tatu',
    rules: [
      'Todo mundo compra do mesmo monte, e lá dentro tem tatus-bola com o pavio aceso.',
      'Comprou o Tatubum sem ter Cafuné? Explodiu, tá fora. Com Cafuné, você esconde o tatu de volta onde quiser.',
      'Na sua vez, jogue quantas cartas quiser (Ataque, Pular, Espiar, Favor…) e termine comprando. Nem vem! cancela qualquer jogada.',
      'Quem sobrar vivo vence.',
    ],
    playable: false,
    mobile: false,
  },
```

- [ ] **Step 4: History tab case**

Em `web/src/screens/GamePage.tsx`, no `switch` de `HistoryTab`, depois do `case 'pictures'` (antes do `default`):

```tsx
    case 'kittens':
      // o histórico do Tatubum vem num plano próprio
      return (
        <section className="panel">
          <p>O histórico do Tatubum vem em breve.</p>
        </section>
      );
```

(`web/src/screens/Game.tsx` não muda: sala de Tatubum ainda não tem mesa e o jogo não é `playable`, então a estante não oferece criar sala. A mesa entra no Plano T2.)

- [ ] **Step 5: Run everything**

Run, na raiz da worktree:
- `npm test`
- `npm run typecheck`
- `npm run build -w web`

Expected: tudo PASS. (O E2E roda no CI; nada nele muda neste plano.)

- [ ] **Step 6: Commit**

```bash
git add server/test/kittens.test.ts web/src/games/catalog.ts web/src/screens/GamePage.tsx web/test/catalog.test.ts web/test/shelf.test.tsx
git commit -m "feat(web): Tatubum na estante (em breve) e teste do servidor" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Depois deste plano

- **Protótipo** (`prototipo/tatubum/`): mesa só de front com bots e estas regras empacotadas (como `prototipo/retratim/`), usando o fundo aprovado em `prototipo/tatubum/ref/fundo-cerrado.html`. Plano próprio.
- **Plano T2 — mesa no site**, **T3 — artes em pixel art** e, depois, histórico e celular (spec §9).
- Não abrir PR nem mergear sem o Rafa pedir.
