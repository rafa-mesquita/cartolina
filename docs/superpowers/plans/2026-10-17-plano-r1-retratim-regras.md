# Plano R1 — Retratim: regras e base Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O Retratim (id `pictures`, nossa versão do Pictures) existe como módulo de regras completo e testado em `shared/`, a sala genérica ganha prazos controlados pelo servidor (os 30 s), e o servidor cria salas de Retratim, sem tela nova (na estante ele aparece "em breve").

**Architecture:** `shared/src/games/pictures/` traz obras por kit (schemas zod + validação), baralho/grade, saquinho de coordenadas, rodízio de kits, pontuação pura, regras (`applyPicturesAction` + `settlePictures`), visão com segredos e schema das ações. A base ganha `GameContext.now` e `GameModule.nextDeadline?`: `nextAlarmAt` acorda o Durable Object no fim da contagem, e o `tick` (que já roda no alarme) chama `onPresenceChange` = `settlePictures`, que fecha a fase.

**Tech Stack:** TypeScript 5.9, zod 3, Vitest 4, Cloudflare Workers + Durable Objects (`@cloudflare/vitest-plugin`), React 19 (só o catálogo no `web/`).

**Spec:** `docs/superpowers/specs/2026-10-17-retratim-design.md` (§2 regras, §3 kits, §4 arquitetura, §8 erros, §9 testes). Este plano é o item 3 da §10 (Plano R1). Telas, fotos e histórico ficam pros Planos R2–R4.

---

## Contexto para quem vai executar

- Monorepo npm workspaces: `shared/` (regras puras, sem I/O), `server/` (Worker + Durable Object), `web/` (React). Comandos na raiz do repositório: `npm test`, `npm run typecheck`, `npm test -w shared -- <filtro>`, `npm test -w server -- <filtro>`, `npm test -w web -- <filtro>`.
- No PowerShell do usuário `npx.ps1`/`npm.ps1` podem estar bloqueados: use o Bash, ou `npm.cmd`.
- Branch: `feat/retratim` (já existe, com a spec). Não faça merge no `main` (merge = publicar).
- Código e mensagens em **português** (comentários, erros, nomes de teste), no estilo dos arquivos existentes. Commits `feat(shared): …`, `test(server): …`, terminando com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `tsconfig.base.json` usa `strict`, `noUncheckedIndexedAccess` e `verbatimModuleSyntax`: imports só de tipo com `import type`; acesso por índice dá `T | undefined` (use `!` quando o teste garante).
- A Vitest não checa tipos: rode **também** `npm run typecheck` onde o passo pedir.
- Modelo a seguir: o Diquisti (`shared/src/games/dixit/` e `shared/test/dixit-*.test.ts`). Mesmos padrões: `fail`/`ok`, `deepFreeze` nos testes, `own()` na visão, schema com `Assert` de tipos.
- `onPresenceChange` precisa devolver **o mesmo objeto** quando nada muda (o servidor compara referência pra decidir se grava).

## Mapa de arquivos

Criar:
- `shared/src/games/pictures/works.ts`: lista de kits, constantes do material, schema zod da obra de cada kit, `workError`, `readyError`.
- `shared/src/games/pictures/types.ts`: constantes do jogo, coordenadas, fases, estado, ações, visão.
- `shared/src/games/pictures/photos.ts`: temas e baralho provisório de 100 fotos.
- `shared/src/games/pictures/grid.ts`: sorteio da grade (4 temas × 4 fotos).
- `shared/src/games/pictures/bag.ts`: saquinho de 48 fichas e tirada das coordenadas secretas.
- `shared/src/games/pictures/rotation.ts`: rodízio de kits.
- `shared/src/games/pictures/scoring.ts`: `scorePicturesRound` pura.
- `shared/src/games/pictures/rules.ts`: estado inicial, ações, `settlePictures` (contagem, fechamento, pausa).
- `shared/src/games/pictures/view.ts`: `picturesViewFor`, `picturesNextDeadline`, módulo `pictures`.
- `shared/src/games/pictures/schema.ts`: schema zod das ações.
- `shared/test/pictures-helpers.ts`, `shared/test/pictures-works.test.ts`, `shared/test/pictures-deck.test.ts`, `shared/test/pictures-scoring.test.ts`, `shared/test/pictures-rules.test.ts`, `shared/test/pictures-view.test.ts`.
- `server/test/pictures.test.ts`.

Modificar:
- `shared/src/game.ts`: `GameContext.now`, `GameModule.nextDeadline?`.
- `shared/src/room.ts`: passa `now` pro jogo; `nextAlarmAt` considera o prazo do jogo; `PicturesRoomView`.
- `shared/src/games/registry.ts`: entrada `pictures`.
- `shared/src/protocol.ts`: códigos de erro novos; "sala cheia" sem "máx. 10".
- `shared/src/index.ts`: exports do Retratim.
- `shared/test/ito-rules.test.ts`, `shared/test/dixit-helpers.ts`: `now` no contexto.
- `shared/test/room-games.test.ts`: registro com 3 jogos, sala de Retratim, prazo no alarme.
- `server/test/helpers.ts`: `newGameRoom` aceita qualquer `GameId`.
- `web/src/games/catalog.ts`, `web/test/catalog.test.ts`: Retratim na estante, "em breve".

---

### Task 1: `now` no contexto do jogo e prazo opcional

Só encanamento: nada muda de comportamento, os testes atuais continuam passando.

**Files:**
- Modify: `shared/src/game.ts`
- Modify: `shared/src/room.ts:168-200` (`tick`, `roomAction`)
- Modify: `shared/test/ito-rules.test.ts:7-9`
- Modify: `shared/test/dixit-helpers.ts:9-11`

- [ ] **Step 1: Trocar `shared/src/game.ts` inteiro por:**

```ts
import type { Rng } from './rng';

export interface GameContext {
  hostId: string | null;
  /** Jogadores conectados ou desconectados há menos de 30 s, na ordem dos assentos. */
  active: string[];
  rng: Rng;
  /** Hora do servidor (ms). Usada pelos prazos do jogo (ex.: os 30 s do Retratim). */
  now: number;
}

export type ActionResult<S> = { ok: true; state: S } | { ok: false; error: string };

export interface GameModule<S, A, V> {
  id: string;
  initialState(): S;
  applyAction(state: S, playerId: string, action: A, ctx: GameContext): ActionResult<S>;
  /** Esconde tudo que `viewerId` não pode ver. */
  viewFor(state: S, viewerId: string | null): V;
  /** Reavaliado quando alguém entra, sai, expira a tolerância de desconexão ou chega um prazo do jogo (alarme). */
  onPresenceChange(state: S, ctx: GameContext): S;
  /** Próximo prazo do jogo (ms), pro servidor acordar nele; `null` = sem prazo. Jogos sem prazo não implementam. */
  nextDeadline?(state: S): number | null;
}
```

- [ ] **Step 2: Passar `now` em `shared/src/room.ts`**

Em `tick`, troque:

```ts
  const game = GAMES[room.gameId].module.onPresenceChange(room.game, { hostId, active, rng });
```

por:

```ts
  const game = GAMES[room.gameId].module.onPresenceChange(room.game, { hostId, active, rng, now });
```

Em `roomAction`, troque:

```ts
  const res = entry.module.applyAction(room.game, playerId, parsed.data as GameAction, {
    hostId: room.hostId,
    active: activePlayers(room, now),
    rng,
  });
```

por:

```ts
  const res = entry.module.applyAction(room.game, playerId, parsed.data as GameAction, {
    hostId: room.hostId,
    active: activePlayers(room, now),
    rng,
    now,
  });
```

- [ ] **Step 3: `now` nos contextos dos testes**

Em `shared/test/ito-rules.test.ts`, troque `return { hostId, active, rng: mulberry32(seed) };` por:

```ts
  return { hostId, active, rng: mulberry32(seed), now: 0 };
```

Em `shared/test/dixit-helpers.ts`, troque `return { hostId, active, rng: mulberry32(seed) };` por:

```ts
  return { hostId, active, rng: mulberry32(seed), now: 0 };
```

- [ ] **Step 4: Rodar tudo**

Run: `npm run typecheck && npm test -w shared`
Expected: typecheck sem erro; todos os testes do `shared` PASS (nenhum teste novo).

- [ ] **Step 5: Commit**

```bash
git add shared/src/game.ts shared/src/room.ts shared/test/ito-rules.test.ts shared/test/dixit-helpers.ts
git commit -m "feat(shared): hora do servidor no contexto do jogo e prazo opcional

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: obras dos kits (`works.ts`)

**Files:**
- Create: `shared/src/games/pictures/works.ts`
- Create: `shared/test/pictures-helpers.ts` (só `sampleWork` por enquanto; o resto vem na Task 7)
- Test: `shared/test/pictures-works.test.ts`

- [ ] **Step 1: Criar `shared/test/pictures-helpers.ts` com a obra de exemplo de cada kit**

```ts
import type { KitId, Work } from '../src/games/pictures/works';

/** Uma obra válida e completa de cada kit (pode ficar "pronta"). */
export function sampleWork(kit: KitId): Work {
  switch (kit) {
    case 'cubes':
      return { kit, cells: [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5] };
    case 'laces':
      return { kit, long: [[0.1, 0.5], [0.5, 0.4], [0.9, 0.5]], short: [[0.2, 0.2], [0.4, 0.2]] };
    case 'sticks':
      return {
        kit,
        sticks: [0, 1, 2, 3].map((i) => ({ x: 0.2 + i * 0.1, y: 0.5, rot: i * 45 })),
        stones: [0, 1, 2, 3].map((i) => ({ x: 0.2 + i * 0.1, y: 0.7, rot: 0 })),
      };
    case 'blocks':
      return {
        kit,
        pieces: [0, 1, 2, 3, 4, 5].map((i) => ({ x: i - 3, y: 0, z: 0, rot: 0, lay: false })),
        camera: { theta: 0.5, phi: 0.95 },
      };
    case 'icons':
      return { kit, ids: [0, 1, 2] };
    case 'dots':
      return { kit, points: [[0.1, 0.1], [0.5, 0.9], [0.9, 0.1]], lines: [[0, 1], [1, 2]] };
  }
}
```

- [ ] **Step 2: Escrever o teste que falha, `shared/test/pictures-works.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { KITS, readyError, workError, workSchema, type Work } from '../src/games/pictures/works';
import { sampleWork } from './pictures-helpers';

const parse = (w: unknown) => workSchema.safeParse(w).success;

describe('Retratim: obras dos kits', () => {
  it('são 6 kits, na ordem do rodízio', () => {
    expect(KITS).toEqual(['cubes', 'laces', 'sticks', 'blocks', 'icons', 'dots']);
  });

  it('a obra de exemplo de cada kit passa no schema, na regra e pode ficar pronta', () => {
    for (const kit of KITS) {
      const work = sampleWork(kit);
      expect(parse(work)).toBe(true);
      expect(workError(work)).toBeNull();
      expect(readyError(work)).toBeNull();
    }
  });

  it('cubos: 16 casas, cores de 0 a 7, no máximo 3 de cada cor', () => {
    expect(parse({ kit: 'cubes', cells: Array(15).fill(null) })).toBe(false);
    expect(parse({ kit: 'cubes', cells: [8, ...Array(15).fill(null)] })).toBe(false);
    const four: Work = { kit: 'cubes', cells: [0, 0, 0, 0, ...Array(12).fill(null)] };
    expect(parse(four)).toBe(true);
    expect(workError(four)).toBe('bad_work');
  });

  it('cubos com casa vazia valem como rascunho, mas não ficam prontos', () => {
    const partial: Work = { kit: 'cubes', cells: [0, 1, ...Array(14).fill(null)] };
    expect(workError(partial)).toBeNull();
    expect(readyError(partial)).toBe('cubes_incomplete');
  });

  it('cadarços: pontos dentro da folha, de 2 a 60 por cadarço', () => {
    expect(parse({ kit: 'laces', long: [[0, 0]], short: [[0, 0], [1, 1]] })).toBe(false);
    expect(parse({ kit: 'laces', long: [[0, 0], [1.2, 0]], short: [[0, 0], [1, 1]] })).toBe(false);
    expect(parse({ kit: 'laces', long: Array(61).fill([0.5, 0.5]), short: [[0, 0], [1, 1]] })).toBe(false);
  });

  it('palitos e pedras: sempre 4 + 4; peça fora da folha (guardada de lado) é aceita até 1,5', () => {
    const base = sampleWork('sticks');
    expect(parse({ ...base, sticks: base.kit === 'sticks' ? base.sticks.slice(0, 3) : [] })).toBe(false);
    expect(parse({ kit: 'sticks', sticks: Array(4).fill({ x: 1.4, y: -0.4, rot: 0 }), stones: Array(4).fill({ x: 0, y: 0, rot: 0 }) })).toBe(true);
    expect(parse({ kit: 'sticks', sticks: Array(4).fill({ x: 2, y: 0, rot: 0 }), stones: Array(4).fill({ x: 0, y: 0, rot: 0 }) })).toBe(false);
  });

  it('blocos: uma posição por forma (6) e a câmera do artista', () => {
    expect(parse({ kit: 'blocks', pieces: [], camera: { theta: 0, phi: 1 } })).toBe(false);
    const base = sampleWork('blocks');
    expect(parse({ ...base, camera: { theta: 0, phi: 2 } })).toBe(false);
  });

  it('símbolos: ids de 0 a 18, até 5, sem repetir; pronto só com 2 ou mais', () => {
    expect(parse({ kit: 'icons', ids: [19] })).toBe(false);
    expect(parse({ kit: 'icons', ids: [0, 1, 2, 3, 4, 5] })).toBe(false);
    const repeated: Work = { kit: 'icons', ids: [3, 3] };
    expect(workError(repeated)).toBe('bad_work');
    expect(readyError({ kit: 'icons', ids: [7] })).toBe('icons_too_few');
  });

  it('pontos e linhas: até 5 pontos e 10 linhas; linha entre pontos que existem, sem repetir', () => {
    expect(parse({ kit: 'dots', points: Array(6).fill([0.5, 0.5]), lines: [] })).toBe(false);
    const pts: [number, number][] = [[0, 0], [1, 1], [0.5, 0.5]];
    expect(workError({ kit: 'dots', points: pts, lines: [[0, 3]] })).toBe('bad_work');
    expect(workError({ kit: 'dots', points: pts, lines: [[1, 1]] })).toBe('bad_work');
    expect(workError({ kit: 'dots', points: pts, lines: [[0, 1], [1, 0]] })).toBe('bad_work');
    expect(workError({ kit: 'dots', points: pts, lines: [[0, 1], [1, 2], [0, 2]] })).toBeNull();
  });

  it('sem rascunho não dá pra ficar pronto', () => {
    expect(readyError(undefined)).toBe('empty_work');
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm test -w shared -- pictures-works`
Expected: FAIL (não acha `../src/games/pictures/works`).

- [ ] **Step 4: Criar `shared/src/games/pictures/works.ts`**

```ts
import { z } from 'zod';

/** Ordem do rodízio: na rodada r, o assento i usa KITS[(i + r) % 6]. */
export const KITS = ['cubes', 'laces', 'sticks', 'blocks', 'icons', 'dots'] as const;
export type KitId = (typeof KITS)[number];

export const CUBE_CELLS = 16;
export const CUBE_COLORS = 8;
export const CUBES_PER_COLOR = 3;
export const LACE_MAX_POINTS = 60;
export const STICKS = 4;
export const STONES = 4;
/** Ordem fixa das peças do kit de blocos: a obra guarda uma posição por forma, nessa ordem. */
export const BLOCK_SHAPES = ['cube', 'brick', 'plank', 'pillar', 'roof', 'arch'] as const;
export const ICON_COUNT = 19;
export const ICONS_MIN = 2;
export const ICONS_MAX = 5;
export const DOTS_MAX = 5;
export const DOT_LINES_MAX = 10;

/** Posição relativa à folha 4:3 (0–1). */
const unit = z.number().min(0).max(1);
/** Peça solta: fora de 0–1 ela está guardada de lado e não aparece na obra. */
const loose = z.number().min(-0.5).max(1.5);
/** Giro em graus. */
const degrees = z.number().min(-3600).max(3600);
const point = z.tuple([unit, unit]);
const placed = z.object({ x: loose, y: loose, rot: degrees });

const cubesWork = z.object({
  kit: z.literal('cubes'),
  /** Linha por linha; cada casa é uma cor (0–7) ou vazia. */
  cells: z.array(z.number().int().min(0).max(CUBE_COLORS - 1).nullable()).length(CUBE_CELLS),
});

const lacesWork = z.object({
  kit: z.literal('laces'),
  long: z.array(point).min(2).max(LACE_MAX_POINTS),
  short: z.array(point).min(2).max(LACE_MAX_POINTS),
});

const sticksWork = z.object({
  kit: z.literal('sticks'),
  sticks: z.array(placed).length(STICKS),
  stones: z.array(placed).length(STONES),
});

const blocksWork = z.object({
  kit: z.literal('blocks'),
  /** Uma por forma, na ordem de BLOCK_SHAPES. `y` é a altura que a montagem calculou (quem mostra não reempilha). */
  pieces: z
    .array(
      z.object({
        x: z.number().min(-6).max(6),
        y: z.number().min(0).max(20),
        z: z.number().min(-6).max(6),
        rot: degrees,
        lay: z.boolean(),
      }),
    )
    .length(BLOCK_SHAPES.length),
  /** Câmera em radianos: θ gira em volta da mesa, φ inclina (0 = de cima). Faz parte da obra. */
  camera: z.object({ theta: z.number().min(-100).max(100), phi: z.number().min(0).max(1.6) }),
});

const iconsWork = z.object({
  kit: z.literal('icons'),
  /** Cartas escolhidas, na ordem em que ficam lado a lado. */
  ids: z.array(z.number().int().min(0).max(ICON_COUNT - 1)).max(ICONS_MAX),
});

const dotIndex = z.number().int().min(0).max(DOTS_MAX - 1);
const dotsWork = z.object({
  kit: z.literal('dots'),
  points: z.array(point).max(DOTS_MAX),
  lines: z.array(z.tuple([dotIndex, dotIndex])).max(DOT_LINES_MAX),
});

export const workSchema = z.discriminatedUnion('kit', [cubesWork, lacesWork, sticksWork, blocksWork, iconsWork, dotsWork]);
export type Work = z.infer<typeof workSchema>;
export type WorkOf<K extends KitId> = Extract<Work, { kit: K }>;

/** Falha a compilação se um kit ficar sem schema (ou sobrar schema sem kit). */
type Assert<T extends true> = T;
export type WorkKitsMatch = Assert<Work['kit'] extends KitId ? (KitId extends Work['kit'] ? true : false) : false>;

/** Regra da obra que o schema não pega (o formato já veio validado). `null` = obra válida. */
export function workError(work: Work): 'bad_work' | null {
  switch (work.kit) {
    case 'cubes': {
      const count = new Map<number, number>();
      for (const c of work.cells) if (c !== null) count.set(c, (count.get(c) ?? 0) + 1);
      return [...count.values()].some((n) => n > CUBES_PER_COLOR) ? 'bad_work' : null;
    }
    case 'icons':
      return new Set(work.ids).size === work.ids.length ? null : 'bad_work';
    case 'dots': {
      const seen = new Set<string>();
      for (const [a, b] of work.lines) {
        if (a === b || a >= work.points.length || b >= work.points.length) return 'bad_work';
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        if (seen.has(key)) return 'bad_work';
        seen.add(key);
      }
      return null;
    }
    default:
      return null;
  }
}

/** Por que essa obra ainda não pode ficar "pronta" (`null` = pode). Quando o tempo acaba, vale como está. */
export function readyError(work: Work | undefined): 'empty_work' | 'cubes_incomplete' | 'icons_too_few' | null {
  if (work === undefined) return 'empty_work';
  if (work.kit === 'cubes' && work.cells.some((c) => c === null)) return 'cubes_incomplete';
  if (work.kit === 'icons' && work.ids.length < ICONS_MIN) return 'icons_too_few';
  return null;
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test -w shared -- pictures-works && npm run typecheck -w shared`
Expected: PASS; typecheck sem erro.

- [ ] **Step 6: Commit**

```bash
git add shared/src/games/pictures/works.ts shared/test/pictures-helpers.ts shared/test/pictures-works.test.ts
git commit -m "feat(shared): obras dos 6 kits do Retratim (schema e validação)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: tipos do jogo (`types.ts`)

**Files:**
- Create: `shared/src/games/pictures/types.ts`
- Test: `shared/test/pictures-deck.test.ts` (só o bloco de coordenadas por enquanto)

- [ ] **Step 1: Escrever o teste que falha, `shared/test/pictures-deck.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { COORDS, PICTURES_COUNTDOWN_MS, PICTURES_MAX_PLAYERS, PICTURES_MIN_PLAYERS, PICTURES_ROUNDS } from '../src/games/pictures/types';

describe('Retratim: constantes e coordenadas', () => {
  it('3 a 6 pessoas, 6 rodadas, 30 s', () => {
    expect([PICTURES_MIN_PLAYERS, PICTURES_MAX_PLAYERS, PICTURES_ROUNDS, PICTURES_COUNTDOWN_MS]).toEqual([3, 6, 6, 30_000]);
  });

  it('16 coordenadas linha por linha: A1 é o índice 0, D1 o 3, A2 o 4, D4 o 15', () => {
    expect(COORDS).toHaveLength(16);
    expect(new Set(COORDS).size).toBe(16);
    expect([COORDS[0], COORDS[3], COORDS[4], COORDS[15]]).toEqual(['A1', 'D1', 'A2', 'D4']);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -w shared -- pictures-deck`
Expected: FAIL (não acha `../src/games/pictures/types`).

- [ ] **Step 3: Criar `shared/src/games/pictures/types.ts`**

```ts
import type { KitId, Work } from './works';

export const PICTURES_MIN_PLAYERS = 3;
export const PICTURES_MAX_PLAYERS = 6;
/** Cada um usa cada um dos 6 kits uma vez. */
export const PICTURES_ROUNDS = 6;
/** Tempo pra quem falta, depois que metade da mesa (arredondando pra cima) ficou pronta ou confirmou. */
export const PICTURES_COUNTDOWN_MS = 30_000;

/** Coordenadas da grade, linha por linha: índice = linha × 4 + coluna (A1 é o canto de cima à esquerda). */
export const COORDS = [
  'A1', 'B1', 'C1', 'D1',
  'A2', 'B2', 'C2', 'D2',
  'A3', 'B3', 'C3', 'D3',
  'A4', 'B4', 'C4', 'D4',
] as const;
export type Coord = (typeof COORDS)[number];

export type PicturesPhase = 'lobby' | 'building' | 'guessing' | 'reveal' | 'gameover';

/** O que aconteceu na rodada revelada (para animar e mostrar). */
export interface PicturesRoundResult {
  round: number;
  /** Artistas com obra, na ordem dos assentos: a ordem da revelação. */
  order: string[];
  secrets: Record<string, Coord>;
  kits: Record<string, KitId>;
  works: Record<string, Work>;
  /** palpiteiro → artista → coordenada (valem os colados quando a fase fechou, confirmados ou não). */
  guesses: Record<string, Record<string, Coord>>;
  /** artista → quem acertou a obra dele */
  correct: Record<string, string[]>;
  /** Pontos ganhos nesta rodada. */
  gained: Record<string, number>;
}

export interface PicturesState {
  phase: PicturesPhase;
  /** Todos da partida, na ordem dos assentos no "começar" (o assento define o kit). Quem entra depois espera a próxima. */
  players: string[];
  /** Quem joga a rodada atual (ativos quando ela começou). */
  inRound: string[];
  scores: Record<string, number>;
  /** Rodada atual, de 0 a PICTURES_ROUNDS - 1. */
  round: number;
  /** 16 ids de foto, na ordem de COORDS. Fixa a partida toda. */
  grid: string[];
  /** Fichas que sobraram no saquinho (as tiradas saem pela partida inteira). */
  bag: Coord[];
  /** jogador → coordenada secreta da rodada (pode repetir entre jogadores). */
  secrets: Record<string, Coord>;
  /** jogador → kit da rodada. */
  kits: Record<string, KitId>;
  /** jogador → último rascunho recebido (na montagem) ou obra congelada (depois). Sem entrada = obra em branco. */
  works: Record<string, Work>;
  /** Montagem: quem está pronto. */
  ready: string[];
  /** palpiteiro → artista → coordenada */
  guesses: Record<string, Record<string, Coord>>;
  /** Palpite: quem confirmou. */
  confirmed: string[];
  /** Fim da contagem de 30 s da fase atual (ms), ou null se não disparou. */
  countdownEndsAt: number | null;
  result: PicturesRoundResult | null;
  winners: string[];
  /** Menos de 3 ativos na rodada: a fase não fecha até voltar gente. */
  paused: boolean;
}

export type PicturesAction =
  | { type: 'start' }
  | { type: 'draft'; work: Work }
  | { type: 'ready'; on: boolean }
  | { type: 'guess'; artist: string; coord: Coord | null }
  | { type: 'confirm' }
  | { type: 'hurry' }
  | { type: 'next' }
  | { type: 'again' }
  | { type: 'lobby' };

export interface PicturesView {
  phase: PicturesPhase;
  players: string[];
  inRound: string[];
  scores: Record<string, number>;
  round: number;
  rounds: number;
  grid: string[];
  kits: Record<string, KitId>;
  ready: string[];
  confirmed: string[];
  countdownEndsAt: number | null;
  paused: boolean;
  winners: string[];
  /** Sua coordenada secreta (null pra espectador). */
  mySecret: Coord | null;
  /** Montagem: só a sua. Do palpite em diante: todas. */
  works: Record<string, Work>;
  /** Seus palpites (artista → coordenada). */
  myGuesses: Record<string, Coord>;
  /** Só na revelação e no fim de jogo. */
  result: PicturesRoundResult | null;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -w shared -- pictures-deck && npm run typecheck -w shared`
Expected: PASS; typecheck sem erro.

- [ ] **Step 5: Commit**

```bash
git add shared/src/games/pictures/types.ts shared/test/pictures-deck.test.ts
git commit -m "feat(shared): tipos do Retratim (estado, ações, visão, coordenadas)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: baralho, grade, saquinho e rodízio

**Files:**
- Create: `shared/src/games/pictures/photos.ts`
- Create: `shared/src/games/pictures/grid.ts`
- Create: `shared/src/games/pictures/bag.ts`
- Create: `shared/src/games/pictures/rotation.ts`
- Test: `shared/test/pictures-deck.test.ts` (acrescentar)

- [ ] **Step 1: Acrescentar ao fim de `shared/test/pictures-deck.test.ts` (e juntar os imports no topo)**

Imports do topo passam a ser:

```ts
import { describe, expect, it } from 'vitest';
import { COPIES_PER_COORD, drawSecrets, fullBag } from '../src/games/pictures/bag';
import { drawGrid } from '../src/games/pictures/grid';
import { PICTURES_DECK, PICTURES_THEMES } from '../src/games/pictures/photos';
import { kitFor, kitsForRound } from '../src/games/pictures/rotation';
import { COORDS, PICTURES_COUNTDOWN_MS, PICTURES_MAX_PLAYERS, PICTURES_MIN_PLAYERS, PICTURES_ROUNDS } from '../src/games/pictures/types';
import { KITS } from '../src/games/pictures/works';
import { mulberry32 } from '../src/rng';
```

Blocos novos:

```ts
describe('Retratim: baralho e grade', () => {
  it('100 fotos com ids p001…p100, todas com tema conhecido, pelo menos 4 por tema', () => {
    expect(PICTURES_DECK).toHaveLength(100);
    expect(PICTURES_DECK[0]!.id).toBe('p001');
    expect(PICTURES_DECK[99]!.id).toBe('p100');
    expect(new Set(PICTURES_DECK.map((p) => p.id)).size).toBe(100);
    for (const t of PICTURES_THEMES) expect(PICTURES_DECK.filter((p) => p.theme === t).length).toBeGreaterThanOrEqual(4);
  });

  it('a grade tem 16 fotos diferentes, de 4 temas com 4 fotos cada', () => {
    const grid = drawGrid(mulberry32(7));
    expect(grid).toHaveLength(16);
    expect(new Set(grid).size).toBe(16);
    const themeOf = new Map(PICTURES_DECK.map((p) => [p.id, p.theme]));
    const count = new Map<string, number>();
    for (const id of grid) count.set(themeOf.get(id)!, (count.get(themeOf.get(id)!) ?? 0) + 1);
    expect([...count.values()]).toEqual([4, 4, 4, 4]);
  });

  it('a grade muda com a semente', () => {
    expect(drawGrid(mulberry32(1))).not.toEqual(drawGrid(mulberry32(2)));
  });
});

describe('Retratim: saquinho de coordenadas', () => {
  it('48 fichas, 3 de cada coordenada', () => {
    const bag = fullBag();
    expect(bag).toHaveLength(COORDS.length * COPIES_PER_COORD);
    for (const c of COORDS) expect(bag.filter((x) => x === c)).toHaveLength(3);
  });

  it('cada tirada sai do saquinho; 6 rodadas com 6 pessoas não esvaziam', () => {
    const rng = mulberry32(3);
    let bag = fullBag();
    const players = ['a', 'b', 'c', 'd', 'e', 'f'];
    for (let r = 0; r < 6; r++) {
      const res = drawSecrets(rng, bag, players);
      expect(Object.keys(res.secrets)).toEqual(players);
      expect(res.bag).toHaveLength(bag.length - players.length);
      bag = res.bag;
    }
    expect(bag).toHaveLength(48 - 36);
  });

  it('a mesma foto pode sair pra duas pessoas (como no original)', () => {
    let repeated = false;
    for (let seed = 1; seed <= 50 && !repeated; seed++) {
      const { secrets } = drawSecrets(mulberry32(seed), fullBag(), ['a', 'b', 'c', 'd', 'e', 'f']);
      repeated = new Set(Object.values(secrets)).size < 6;
    }
    expect(repeated).toBe(true);
  });
});

describe('Retratim: rodízio de kits', () => {
  it('na rodada r o assento i usa KITS[(i + r) % 6]', () => {
    expect(kitFor(0, 0)).toBe('cubes');
    expect(kitFor(1, 0)).toBe('laces');
    expect(kitFor(0, 1)).toBe('laces');
    expect(kitFor(5, 1)).toBe('cubes');
  });

  it('com 3 a 6 pessoas, ninguém divide kit na rodada e cada um usa os 6 kits em 6 rodadas', () => {
    for (let n = 3; n <= 6; n++) {
      const players = Array.from({ length: n }, (_, i) => `p${i}`);
      const used = new Map<string, Set<string>>(players.map((p) => [p, new Set()]));
      for (let r = 0; r < PICTURES_ROUNDS; r++) {
        const kits = kitsForRound(players, players, r);
        expect(new Set(Object.values(kits)).size).toBe(n);
        for (const p of players) used.get(p)!.add(kits[p]!);
      }
      for (const p of players) expect(used.get(p)!.size).toBe(KITS.length);
    }
  });

  it('quem saiu da rodada não recebe kit, e os outros mantêm o kit do próprio assento', () => {
    const kits = kitsForRound(['p0', 'p1', 'p2', 'p3'], ['p0', 'p2', 'p3'], 0);
    expect(kits).toEqual({ p0: 'cubes', p2: 'sticks', p3: 'blocks' });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -w shared -- pictures-deck`
Expected: FAIL (não acha `bag`, `grid`, `photos`, `rotation`).

- [ ] **Step 3: Criar `shared/src/games/pictures/photos.ts`**

```ts
export const PICTURES_THEMES = ['bichos', 'casa', 'comida', 'lugares', 'transporte', 'natureza', 'gente'] as const;
export type PicturesTheme = (typeof PICTURES_THEMES)[number];

export interface PicturesPhoto {
  /** p001…p100; a imagem fica em web/public/pictures/fotos/<id>.webp (Plano R3). */
  id: string;
  theme: PicturesTheme;
}

/**
 * Quantas fotos de cada tema (100 no total). Provisório: o Plano R3 gera as fotos de verdade e o script
 * `npm run pictures:fotos` reescreve este arquivo com os temas reais.
 */
const PER_THEME: Record<PicturesTheme, number> = {
  bichos: 15,
  casa: 14,
  comida: 14,
  lugares: 15,
  transporte: 14,
  natureza: 14,
  gente: 14,
};

export const PICTURES_DECK: readonly PicturesPhoto[] = PICTURES_THEMES.flatMap((theme) =>
  Array.from({ length: PER_THEME[theme] }, () => theme),
).map((theme, i) => ({ id: `p${String(i + 1).padStart(3, '0')}`, theme }));
```

- [ ] **Step 4: Criar `shared/src/games/pictures/grid.ts`**

```ts
import { shuffle, type Rng } from '../../rng';
import { PICTURES_DECK, type PicturesPhoto } from './photos';

export const GRID_THEMES = 4;
export const GRID_PER_THEME = 4;

/** 4 temas sorteados × 4 fotos de cada, embaralhadas: a grade sempre tem fotos parecidas entre si. */
export function drawGrid(rng: Rng, deck: readonly PicturesPhoto[] = PICTURES_DECK): string[] {
  const byTheme = new Map<string, string[]>();
  for (const p of deck) byTheme.set(p.theme, [...(byTheme.get(p.theme) ?? []), p.id]);
  const themes = shuffle(
    rng,
    [...byTheme.keys()].filter((t) => byTheme.get(t)!.length >= GRID_PER_THEME),
  ).slice(0, GRID_THEMES);
  const picked = themes.flatMap((t) => shuffle(rng, byTheme.get(t)!).slice(0, GRID_PER_THEME));
  return shuffle(rng, picked);
}
```

- [ ] **Step 5: Criar `shared/src/games/pictures/bag.ts`**

```ts
import { shuffle, type Rng } from '../../rng';
import { COORDS, type Coord } from './types';

/** Como no original: 48 fichas, cada coordenada 3 vezes. */
export const COPIES_PER_COORD = 3;

export function fullBag(): Coord[] {
  return COORDS.flatMap((c) => Array.from({ length: COPIES_PER_COORD }, () => c));
}

/** Uma ficha por jogador. As tiradas saem do saquinho pela partida inteira (6 × 6 = 36 ≤ 48). */
export function drawSecrets(
  rng: Rng,
  bag: readonly Coord[],
  players: readonly string[],
): { secrets: Record<string, Coord>; bag: Coord[] } {
  let rest = shuffle(rng, bag);
  const secrets: Record<string, Coord> = {};
  for (const p of players) {
    // Nunca acontece com 6 rodadas de até 6 pessoas; é só pra não quebrar se as regras mudarem.
    if (rest.length === 0) rest = shuffle(rng, fullBag());
    secrets[p] = rest.pop()!;
  }
  return { secrets, bag: rest };
}
```

- [ ] **Step 6: Criar `shared/src/games/pictures/rotation.ts`**

```ts
import { KITS, type KitId } from './works';

export function kitFor(seat: number, round: number): KitId {
  return KITS[(seat + round) % KITS.length]!;
}

/** Kit de cada um que joga a rodada; o assento é a posição em `players` (fixa na partida). */
export function kitsForRound(players: readonly string[], inRound: readonly string[], round: number): Record<string, KitId> {
  return Object.fromEntries(
    players.flatMap((p, seat) => (inRound.includes(p) ? [[p, kitFor(seat, round)] as const] : [])),
  );
}
```

- [ ] **Step 7: Rodar e ver passar**

Run: `npm test -w shared -- pictures-deck && npm run typecheck -w shared`
Expected: PASS; typecheck sem erro.

- [ ] **Step 8: Commit**

```bash
git add shared/src/games/pictures/photos.ts shared/src/games/pictures/grid.ts shared/src/games/pictures/bag.ts shared/src/games/pictures/rotation.ts shared/test/pictures-deck.test.ts
git commit -m "feat(shared): baralho, grade, saquinho e rodízio de kits do Retratim

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: pontuação (`scoring.ts`)

**Files:**
- Create: `shared/src/games/pictures/scoring.ts`
- Test: `shared/test/pictures-scoring.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from 'vitest';
import { scorePicturesRound } from '../src/games/pictures/scoring';

const secrets = { a: 'A1', b: 'B2', c: 'C3' } as const;

describe('Retratim: pontuação (regra do original)', () => {
  it('ninguém acertou: zero pra todo mundo', () => {
    const r = scorePicturesRound({ artists: ['a', 'b', 'c'], guessers: ['a', 'b', 'c'], secrets, guesses: {} });
    expect(r.gained).toEqual({ a: 0, b: 0, c: 0 });
    expect(r.correct).toEqual({ a: [], b: [], c: [] });
  });

  it('+1 por acerto e +1 pro artista por cada um que acertou a dele', () => {
    const r = scorePicturesRound({
      artists: ['a', 'b', 'c'],
      guessers: ['a', 'b', 'c'],
      secrets,
      guesses: { b: { a: 'A1', c: 'D4' }, c: { a: 'A1', b: 'B2' } },
    });
    // a: 2 acertaram a obra dele. b: acertou a de a (+1) e c acertou a dele (+1). c: acertou a de a e a de b.
    expect(r.gained).toEqual({ a: 2, b: 2, c: 2 });
    expect(r.correct).toEqual({ a: ['b', 'c'], b: ['c'], c: [] });
  });

  it('todo mundo acertou tudo: cada um ganha 2 × (n - 1), sem penalidade', () => {
    const all = { a: { b: 'B2', c: 'C3' }, b: { a: 'A1', c: 'C3' }, c: { a: 'A1', b: 'B2' } } as const;
    const r = scorePicturesRound({ artists: ['a', 'b', 'c'], guessers: ['a', 'b', 'c'], secrets, guesses: all });
    expect(r.gained).toEqual({ a: 4, b: 4, c: 4 });
  });

  it('obra em branco (artista fora da lista) não pontua, mas o dono ainda palpita', () => {
    const r = scorePicturesRound({ artists: ['a', 'b'], guessers: ['a', 'b', 'c'], secrets, guesses: { c: { a: 'A1' } } });
    expect(r.gained).toEqual({ a: 1, b: 0, c: 1 });
    expect(r.correct).toEqual({ a: ['c'], b: [] });
  });

  it('palpite na própria obra é ignorado', () => {
    const r = scorePicturesRound({ artists: ['a'], guessers: ['a'], secrets, guesses: { a: { a: 'A1' } } });
    expect(r.gained).toEqual({ a: 0 });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -w shared -- pictures-scoring`
Expected: FAIL (não acha `scoring`).

- [ ] **Step 3: Criar `shared/src/games/pictures/scoring.ts`**

```ts
import type { Coord } from './types';

export interface PicturesScoreInput {
  /** Quem tem obra na rodada. */
  artists: readonly string[];
  /** Quem joga a rodada (palpita). */
  guessers: readonly string[];
  secrets: Record<string, Coord>;
  /** palpiteiro → artista → coordenada */
  guesses: Record<string, Record<string, Coord>>;
}

export interface PicturesScoreResult {
  gained: Record<string, number>;
  /** artista → quem acertou a obra dele */
  correct: Record<string, string[]>;
}

/** Regra do original: +1 por acerto; o artista ganha +1 por cada pessoa que acertou a obra dele. */
export function scorePicturesRound({ artists, guessers, secrets, guesses }: PicturesScoreInput): PicturesScoreResult {
  const gained: Record<string, number> = {};
  for (const p of [...artists, ...guessers]) gained[p] = 0;
  const correct: Record<string, string[]> = {};
  for (const artist of artists) {
    const secret = secrets[artist];
    const right = secret === undefined ? [] : guessers.filter((g) => g !== artist && guesses[g]?.[artist] === secret);
    correct[artist] = right;
    gained[artist] = (gained[artist] ?? 0) + right.length;
    for (const g of right) gained[g] = (gained[g] ?? 0) + 1;
  }
  return { gained, correct };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -w shared -- pictures-scoring && npm run typecheck -w shared`
Expected: PASS; typecheck sem erro.

- [ ] **Step 5: Commit**

```bash
git add shared/src/games/pictures/scoring.ts shared/test/pictures-scoring.test.ts
git commit -m "feat(shared): pontuação do Retratim igual à do Pictures

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: regras (`rules.ts`)

**Files:**
- Create: `shared/src/games/pictures/rules.ts`
- Modify: `shared/test/pictures-helpers.ts` (acrescentar contexto e atalhos)
- Test: `shared/test/pictures-rules.test.ts`

- [ ] **Step 1: Acrescentar ao `shared/test/pictures-helpers.ts`**

O arquivo inteiro passa a ser (o `sampleWork` da Task 2 continua igual):

```ts
import type { ActionResult, GameContext } from '../src/game';
import { applyPicturesAction, initialPicturesState } from '../src/games/pictures/rules';
import type { PicturesAction, PicturesState } from '../src/games/pictures/types';
import type { KitId, Work } from '../src/games/pictures/works';
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

export function must(res: ActionResult<PicturesState>): PicturesState {
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

export const act = (state: PicturesState, playerId: string, action: PicturesAction, ctx: GameContext): PicturesState =>
  must(applyPicturesAction(deepFreeze(state), playerId, action, ctx));

/** Uma obra válida e completa de cada kit (pode ficar "pronta"). */
export function sampleWork(kit: KitId): Work {
  switch (kit) {
    case 'cubes':
      return { kit, cells: [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5] };
    case 'laces':
      return { kit, long: [[0.1, 0.5], [0.5, 0.4], [0.9, 0.5]], short: [[0.2, 0.2], [0.4, 0.2]] };
    case 'sticks':
      return {
        kit,
        sticks: [0, 1, 2, 3].map((i) => ({ x: 0.2 + i * 0.1, y: 0.5, rot: i * 45 })),
        stones: [0, 1, 2, 3].map((i) => ({ x: 0.2 + i * 0.1, y: 0.7, rot: 0 })),
      };
    case 'blocks':
      return {
        kit,
        pieces: [0, 1, 2, 3, 4, 5].map((i) => ({ x: i - 3, y: 0, z: 0, rot: 0, lay: false })),
        camera: { theta: 0.5, phi: 0.95 },
      };
    case 'icons':
      return { kit, ids: [0, 1, 2] };
    case 'dots':
      return { kit, points: [[0.1, 0.1], [0.5, 0.9], [0.9, 0.1]], lines: [[0, 1], [1, 2]] };
  }
}

/** Partida começada com `n` jogadores (p0…), na montagem da rodada 0. */
export function started(n: number, seed = 1): { state: PicturesState; ctx: GameContext } {
  const ctx = ctxOf(ids(n), { seed });
  return { state: act(initialPicturesState(), 'p0', { type: 'start' }, ctx), ctx };
}

/** `who` mandam a obra de exemplo do próprio kit. */
export function drafted(state: PicturesState, who: readonly string[], ctx: GameContext): PicturesState {
  let s = state;
  for (const p of who) s = act(s, p, { type: 'draft', work: sampleWork(s.kits[p]!) }, ctx);
  return s;
}

/** Todos da rodada mandaram a obra de exemplo e ficaram prontos: palpites abertos. */
export function toGuessingPhase(state: PicturesState, ctx: GameContext): PicturesState {
  let s = drafted(state, state.inRound, ctx);
  for (const p of state.inRound) s = act(s, p, { type: 'ready', on: true }, ctx);
  return s;
}

/** Cada um palpita `choose` em todas as obras dos outros e confirma: revelação. */
export function toRevealPhase(
  state: PicturesState,
  ctx: GameContext,
  choose: (s: PicturesState, guesser: string, artist: string) => PicturesState['secrets'][string],
): PicturesState {
  let s = state;
  for (const g of s.inRound) {
    for (const artist of Object.keys(s.works)) {
      if (artist !== g) s = act(s, g, { type: 'guess', artist, coord: choose(s, g, artist) }, ctx);
    }
  }
  for (const g of state.inRound) s = act(s, g, { type: 'confirm' }, ctx);
  return s;
}

/** Palpite certo: a coordenada secreta do artista. */
export const rightGuess = (s: PicturesState, _g: string, artist: string) => s.secrets[artist]!;
```

- [ ] **Step 2: Escrever o teste que falha, `shared/test/pictures-rules.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { applyPicturesAction, initialPicturesState, settlePictures } from '../src/games/pictures/rules';
import { PICTURES_COUNTDOWN_MS, type PicturesState } from '../src/games/pictures/types';
import {
  T0,
  act,
  ctxOf,
  deepFreeze,
  drafted,
  ids,
  rightGuess,
  sampleWork,
  started,
  toGuessingPhase,
  toRevealPhase,
} from './pictures-helpers';

describe('Retratim: lobby e início', () => {
  it('estado inicial é o lobby vazio', () => {
    expect(initialPicturesState()).toMatchObject({ phase: 'lobby', players: [], round: 0, countdownEndsAt: null });
  });

  it('precisa de 3 ativos e só o host começa', () => {
    expect(applyPicturesAction(initialPicturesState(), 'p0', { type: 'start' }, ctxOf(ids(2)))).toEqual({ ok: false, error: 'need_3_players' });
    expect(applyPicturesAction(initialPicturesState(), 'p1', { type: 'start' }, ctxOf(ids(3)))).toEqual({ ok: false, error: 'not_host' });
  });

  it('com 4: montagem da rodada 0, grade de 16, uma ficha por pessoa, kits do rodízio, placar zerado', () => {
    const { state } = started(4);
    expect(state.phase).toBe('building');
    expect(state.round).toBe(0);
    expect(state.players).toEqual(ids(4));
    expect(state.inRound).toEqual(ids(4));
    expect(state.grid).toHaveLength(16);
    expect(state.bag).toHaveLength(48 - 4);
    expect(Object.keys(state.secrets)).toEqual(ids(4));
    expect(state.kits).toEqual({ p0: 'cubes', p1: 'laces', p2: 'sticks', p3: 'blocks' });
    expect(state.scores).toEqual({ p0: 0, p1: 0, p2: 0, p3: 0 });
  });

  it('voltar pro lobby zera tudo; no lobby não dá', () => {
    const { state, ctx } = started(3);
    expect(act(state, 'p0', { type: 'lobby' }, ctx)).toEqual(initialPicturesState());
    expect(applyPicturesAction(initialPicturesState(), 'p0', { type: 'lobby' }, ctx)).toEqual({ ok: false, error: 'bad_phase' });
  });
});

describe('Retratim: montagem', () => {
  it('rascunho do próprio kit fica guardado; kit errado, obra inválida e quem não joga são recusados', () => {
    const { state, ctx } = started(3);
    const s = act(state, 'p0', { type: 'draft', work: sampleWork('cubes') }, ctx);
    expect(s.works.p0).toEqual(sampleWork('cubes'));
    expect(applyPicturesAction(s, 'p0', { type: 'draft', work: sampleWork('laces') }, ctx)).toEqual({ ok: false, error: 'wrong_kit' });
    const four = { kit: 'cubes' as const, cells: [0, 0, 0, 0, ...Array<null>(12).fill(null)] };
    expect(applyPicturesAction(s, 'p0', { type: 'draft', work: four }, ctx)).toEqual({ ok: false, error: 'bad_work' });
    expect(applyPicturesAction(s, 'p9', { type: 'draft', work: sampleWork('cubes') }, ctx)).toEqual({ ok: false, error: 'not_player' });
  });

  it('pronto pede obra: sem rascunho, cubos incompletos e símbolos de menos são recusados', () => {
    const { state, ctx } = started(5);
    expect(applyPicturesAction(state, 'p0', { type: 'ready', on: true }, ctx)).toEqual({ ok: false, error: 'empty_work' });
    const partial = act(state, 'p0', { type: 'draft', work: { kit: 'cubes', cells: [0, ...Array<null>(15).fill(null)] } }, ctx);
    expect(applyPicturesAction(partial, 'p0', { type: 'ready', on: true }, ctx)).toEqual({ ok: false, error: 'cubes_incomplete' });
    expect(state.kits.p4).toBe('icons');
    const one = act(state, 'p4', { type: 'draft', work: { kit: 'icons', ids: [3] } }, ctx);
    expect(applyPicturesAction(one, 'p4', { type: 'ready', on: true }, ctx)).toEqual({ ok: false, error: 'icons_too_few' });
  });

  it('pronto trava o rascunho até desmarcar', () => {
    const { state, ctx } = started(4);
    let s = drafted(state, ['p0'], ctx);
    s = act(s, 'p0', { type: 'ready', on: true }, ctx);
    expect(applyPicturesAction(s, 'p0', { type: 'draft', work: sampleWork('cubes') }, ctx)).toEqual({ ok: false, error: 'already_ready' });
    expect(applyPicturesAction(s, 'p0', { type: 'ready', on: true }, ctx)).toEqual({ ok: false, error: 'already_ready' });
    s = act(s, 'p0', { type: 'ready', on: false }, ctx);
    expect(s.ready).toEqual([]);
    expect(act(s, 'p0', { type: 'draft', work: sampleWork('cubes') }, ctx).works.p0).toBeDefined();
  });

  it('com 4, a contagem de 30 s dispara no 2º pronto (metade arredondada pra cima)', () => {
    const { state, ctx } = started(4);
    let s = drafted(state, ['p0', 'p1'], ctx);
    s = act(s, 'p0', { type: 'ready', on: true }, ctx);
    expect(s.countdownEndsAt).toBeNull();
    s = act(s, 'p1', { type: 'ready', on: true }, ctx);
    expect(s.countdownEndsAt).toBe(T0 + PICTURES_COUNTDOWN_MS);
    expect(s.phase).toBe('building');
  });

  it('com 3, a contagem também pede 2 prontos', () => {
    const { state, ctx } = started(3);
    let s = drafted(state, ['p0', 'p1'], ctx);
    s = act(s, 'p0', { type: 'ready', on: true }, ctx);
    expect(s.countdownEndsAt).toBeNull();
    s = act(s, 'p1', { type: 'ready', on: true }, ctx);
    expect(s.countdownEndsAt).toBe(T0 + PICTURES_COUNTDOWN_MS);
  });

  it('com 5, pede 3 prontos', () => {
    const { state, ctx } = started(5);
    let s = drafted(state, ['p0', 'p1', 'p2'], ctx);
    s = act(s, 'p0', { type: 'ready', on: true }, ctx);
    s = act(s, 'p1', { type: 'ready', on: true }, ctx);
    expect(s.countdownEndsAt).toBeNull();
    s = act(s, 'p2', { type: 'ready', on: true }, ctx);
    expect(s.countdownEndsAt).toBe(T0 + PICTURES_COUNTDOWN_MS);
  });

  it('desmarcar pronto não para a contagem que já disparou', () => {
    const { state, ctx } = started(4);
    let s = drafted(state, ['p0', 'p1'], ctx);
    s = act(s, 'p0', { type: 'ready', on: true }, ctx);
    s = act(s, 'p1', { type: 'ready', on: true }, ctx);
    s = act(s, 'p1', { type: 'ready', on: false }, ctx);
    expect(s.countdownEndsAt).toBe(T0 + PICTURES_COUNTDOWN_MS);
  });

  it('todos prontos: vai pros palpites com as obras congeladas', () => {
    const { state, ctx } = started(3);
    const s = toGuessingPhase(state, ctx);
    expect(s.phase).toBe('guessing');
    expect(Object.keys(s.works)).toEqual(ids(3));
    expect(s.countdownEndsAt).toBeNull();
    expect(s.confirmed).toEqual([]);
  });

  it('acabou o tempo: fecha com o último rascunho de cada um; quem nunca mandou fica em branco', () => {
    const { state, ctx } = started(4);
    let s = drafted(state, ['p0', 'p1', 'p2'], ctx);
    s = act(s, 'p0', { type: 'ready', on: true }, ctx);
    s = act(s, 'p1', { type: 'ready', on: true }, ctx);
    const before = settlePictures(deepFreeze(s), ctxOf(ids(4), { now: T0 + PICTURES_COUNTDOWN_MS - 1 }));
    expect(before).toBe(s);
    const after = settlePictures(s, ctxOf(ids(4), { now: T0 + PICTURES_COUNTDOWN_MS }));
    expect(after.phase).toBe('guessing');
    expect(Object.keys(after.works).sort()).toEqual(['p0', 'p1', 'p2']);
  });

  it('host apressa: a contagem dispara na hora; só o host, só na montagem ou no palpite', () => {
    const { state, ctx } = started(4);
    const s = act(state, 'p0', { type: 'hurry' }, ctx);
    expect(s.countdownEndsAt).toBe(T0 + PICTURES_COUNTDOWN_MS);
    expect(act(s, 'p0', { type: 'hurry' }, ctx)).toBe(s);
    expect(applyPicturesAction(state, 'p1', { type: 'hurry' }, ctx)).toEqual({ ok: false, error: 'not_host' });
    expect(applyPicturesAction(initialPicturesState(), 'p0', { type: 'hurry' }, ctx)).toEqual({ ok: false, error: 'bad_phase' });
  });
});

describe('Retratim: palpites', () => {
  it('palpite em obra alheia fica guardado e pode trocar ou tirar até confirmar', () => {
    const { state, ctx } = started(3);
    let s = toGuessingPhase(state, ctx);
    s = act(s, 'p0', { type: 'guess', artist: 'p1', coord: 'B3' }, ctx);
    s = act(s, 'p0', { type: 'guess', artist: 'p2', coord: 'B3' }, ctx);
    expect(s.guesses.p0).toEqual({ p1: 'B3', p2: 'B3' });
    s = act(s, 'p0', { type: 'guess', artist: 'p1', coord: null }, ctx);
    expect(s.guesses.p0).toEqual({ p2: 'B3' });
    s = act(s, 'p0', { type: 'confirm' }, ctx);
    expect(applyPicturesAction(s, 'p0', { type: 'guess', artist: 'p1', coord: 'A1' }, ctx)).toEqual({ ok: false, error: 'already_confirmed' });
    expect(applyPicturesAction(s, 'p0', { type: 'confirm' }, ctx)).toEqual({ ok: false, error: 'already_confirmed' });
  });

  it('não dá pra palpitar na própria obra nem em obra em branco', () => {
    const { state, ctx } = started(4);
    let s = drafted(state, ['p0', 'p1', 'p2'], ctx);
    for (const p of ['p0', 'p1', 'p2']) s = act(s, p, { type: 'ready', on: true }, ctx);
    s = settlePictures(s, ctxOf(ids(4), { now: T0 + PICTURES_COUNTDOWN_MS }));
    expect(s.phase).toBe('guessing');
    expect(applyPicturesAction(s, 'p0', { type: 'guess', artist: 'p0', coord: 'A1' }, ctx)).toEqual({ ok: false, error: 'own_work' });
    expect(applyPicturesAction(s, 'p0', { type: 'guess', artist: 'p3', coord: 'A1' }, ctx)).toEqual({ ok: false, error: 'no_work' });
  });

  it('confirmar vale mesmo sem palpite; a contagem segue a regra da metade', () => {
    const { state, ctx } = started(4);
    let s = toGuessingPhase(state, ctx);
    s = act(s, 'p0', { type: 'confirm' }, ctx);
    expect(s.countdownEndsAt).toBeNull();
    s = act(s, 'p1', { type: 'confirm' }, ctx);
    expect(s.countdownEndsAt).toBe(T0 + PICTURES_COUNTDOWN_MS);
  });
});

describe('Retratim: revelação, rodadas e fim', () => {
  it('todos acertam tudo com 3: cada um ganha 4; ordem da revelação = assentos', () => {
    const { state, ctx } = started(3);
    const s = toRevealPhase(toGuessingPhase(state, ctx), ctx, rightGuess);
    expect(s.phase).toBe('reveal');
    expect(s.result!.order).toEqual(ids(3));
    expect(s.result!.gained).toEqual({ p0: 4, p1: 4, p2: 4 });
    expect(s.scores).toEqual({ p0: 4, p1: 4, p2: 4 });
    expect(s.result!.secrets).toEqual(state.secrets);
  });

  it('quando o tempo acaba, valem os palpites colados, mesmo sem confirmar', () => {
    const { state, ctx } = started(3);
    let s = toGuessingPhase(state, ctx);
    s = act(s, 'p1', { type: 'guess', artist: 'p0', coord: s.secrets.p0! }, ctx);
    s = act(s, 'p0', { type: 'confirm' }, ctx);
    s = act(s, 'p2', { type: 'confirm' }, ctx);
    s = settlePictures(s, ctxOf(ids(3), { now: T0 + PICTURES_COUNTDOWN_MS }));
    expect(s.phase).toBe('reveal');
    expect(s.result!.correct.p0).toEqual(['p1']);
    expect(s.result!.gained.p1).toBe(1);
  });

  it('obra em branco fica fora da revelação e não ganha ponto de artista', () => {
    const { state, ctx } = started(4);
    let s = drafted(state, ['p0', 'p1', 'p2'], ctx);
    for (const p of ['p0', 'p1', 'p2']) s = act(s, p, { type: 'ready', on: true }, ctx);
    s = settlePictures(s, ctxOf(ids(4), { now: T0 + PICTURES_COUNTDOWN_MS }));
    s = toRevealPhase(s, ctx, rightGuess);
    expect(s.result!.order).toEqual(['p0', 'p1', 'p2']);
    expect(s.result!.gained.p3).toBe(3);
  });

  it('próxima rodada: kits giram, grade fica, saquinho diminui; só o host', () => {
    const { state, ctx } = started(3);
    const s = toRevealPhase(toGuessingPhase(state, ctx), ctx, rightGuess);
    expect(applyPicturesAction(s, 'p1', { type: 'next' }, ctx)).toEqual({ ok: false, error: 'not_host' });
    const n = act(s, 'p0', { type: 'next' }, ctx);
    expect(n.phase).toBe('building');
    expect(n.round).toBe(1);
    expect(n.kits).toEqual({ p0: 'laces', p1: 'sticks', p2: 'blocks' });
    expect(n.grid).toEqual(state.grid);
    expect(n.bag).toHaveLength(48 - 6);
    expect(n.works).toEqual({});
    expect(n.scores).toEqual(s.scores);
  });

  it('depois da 6ª rodada: fim de jogo; empate dá vários vencedores; "jogar de novo" recomeça', () => {
    const start = started(3);
    const ctx = start.ctx;
    let state = start.state;
    for (let r = 0; r < 6; r++) {
      state = toRevealPhase(toGuessingPhase(state, ctx), ctx, rightGuess);
      state = act(state, 'p0', { type: 'next' }, ctx);
    }
    expect(state.phase).toBe('gameover');
    expect(state.scores).toEqual({ p0: 24, p1: 24, p2: 24 });
    expect(state.winners).toEqual(ids(3));
    const again = act(state, 'p0', { type: 'again' }, ctx);
    expect(again).toMatchObject({ phase: 'building', round: 0, scores: { p0: 0, p1: 0, p2: 0 } });
    expect(again.bag).toHaveLength(48 - 3);
  });
});

describe('Retratim: presença', () => {
  it('nada mudou: devolve o mesmo objeto (lobby, montagem e revelação)', () => {
    const lobby = initialPicturesState();
    expect(settlePictures(lobby, ctxOf(ids(3)))).toBe(lobby);
    const { state, ctx } = started(3);
    expect(settlePictures(state, ctx)).toBe(state);
    const rev = toRevealPhase(toGuessingPhase(state, ctx), ctx, rightGuess);
    expect(settlePictures(rev, ctxOf(['p0']))).toBe(rev);
  });

  it('menos de 3 ativos: pausa e cancela a contagem; voltou gente, segue', () => {
    const { state, ctx } = started(4);
    let s = drafted(state, ['p0', 'p1'], ctx);
    s = act(s, 'p0', { type: 'ready', on: true }, ctx);
    s = act(s, 'p1', { type: 'ready', on: true }, ctx);
    const paused = settlePictures(s, ctxOf(['p0', 'p1']));
    expect(paused).toMatchObject({ paused: true, countdownEndsAt: null, phase: 'building' });
    expect(settlePictures(paused, ctxOf(['p0', 'p1']))).toBe(paused);
    const back = settlePictures(paused, ctxOf(ids(4), { now: T0 + 5 }));
    expect(back.paused).toBe(false);
    expect(back.countdownEndsAt).toBe(T0 + 5 + PICTURES_COUNTDOWN_MS);
  });

  it('quem sai deixa de contar: se todos que ficaram estão prontos, fecha', () => {
    const { state, ctx } = started(4);
    let s = drafted(state, ['p0', 'p1', 'p2'], ctx);
    for (const p of ['p0', 'p1', 'p2']) s = act(s, p, { type: 'ready', on: true }, ctx);
    expect(s.phase).toBe('building');
    expect(settlePictures(s, ctxOf(['p0', 'p1', 'p2'])).phase).toBe('guessing');
  });

  it('quem chega no meio espera a próxima partida', () => {
    const { state, ctx } = started(3);
    let s = toRevealPhase(toGuessingPhase(state, ctx), ctx, rightGuess);
    s = act(s, 'p0', { type: 'next' }, ctxOf(ids(4)));
    expect(s.players).toEqual(ids(3));
    expect(s.inRound).toEqual(ids(3));
    expect(s.kits.p3).toBeUndefined();
    expect(applyPicturesAction(s, 'p3', { type: 'draft', work: sampleWork('cubes') }, ctxOf(ids(4)))).toEqual({ ok: false, error: 'not_player' });
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm test -w shared -- pictures-rules`
Expected: FAIL (não acha `../src/games/pictures/rules`).

- [ ] **Step 4: Criar `shared/src/games/pictures/rules.ts`**

```ts
import type { ActionResult, GameContext } from '../../game';
import { drawSecrets, fullBag } from './bag';
import { drawGrid } from './grid';
import { kitsForRound } from './rotation';
import { scorePicturesRound } from './scoring';
import {
  PICTURES_COUNTDOWN_MS,
  PICTURES_MIN_PLAYERS,
  PICTURES_ROUNDS,
  type PicturesAction,
  type PicturesPhase,
  type PicturesState,
} from './types';
import { readyError, workError } from './works';

const fail = (error: string): ActionResult<PicturesState> => ({ ok: false, error });
const ok = (state: PicturesState): ActionResult<PicturesState> => ({ ok: true, state });

export function initialPicturesState(): PicturesState {
  return {
    phase: 'lobby',
    players: [],
    inRound: [],
    scores: {},
    round: 0,
    grid: [],
    bag: [],
    secrets: {},
    kits: {},
    works: {},
    ready: [],
    guesses: {},
    confirmed: [],
    countdownEndsAt: null,
    result: null,
    winners: [],
    paused: false,
  };
}

/** Quem joga a rodada e está ativo agora: são eles que precisam ficar prontos / confirmar. */
function here(state: PicturesState, ctx: GameContext): string[] {
  return state.inRound.filter((p) => ctx.active.includes(p));
}

/** Montagem da rodada `round` com quem da partida está ativo. Cada um tira uma ficha e recebe o kit do assento. */
function beginRound(state: PicturesState, ctx: GameContext, round: number): PicturesState {
  const inRound = state.players.filter((p) => ctx.active.includes(p));
  const { secrets, bag } = drawSecrets(ctx.rng, state.bag, inRound);
  return {
    ...state,
    phase: 'building',
    round,
    inRound,
    secrets,
    bag,
    kits: kitsForRound(state.players, inRound, round),
    works: {},
    ready: [],
    guesses: {},
    confirmed: [],
    countdownEndsAt: null,
    result: null,
    paused: inRound.length < PICTURES_MIN_PLAYERS,
  };
}

/** Partida nova com os ativos (também usada em "jogar de novo"): grade e saquinho novos. */
function startMatch(ctx: GameContext): ActionResult<PicturesState> {
  if (ctx.active.length < PICTURES_MIN_PLAYERS) return fail('need_3_players');
  const players = [...ctx.active];
  const fresh: PicturesState = {
    ...initialPicturesState(),
    players,
    scores: Object.fromEntries(players.map((p) => [p, 0])),
    grid: drawGrid(ctx.rng),
    bag: fullBag(),
  };
  return ok(beginRound(fresh, ctx, 0));
}

/** As obras congelam como estão (quem nunca mandou rascunho fica em branco). */
function toGuessing(state: PicturesState): PicturesState {
  return { ...state, phase: 'guessing', guesses: {}, confirmed: [], countdownEndsAt: null };
}

/** Valem os palpites colados, confirmados ou não. A revelação segue a ordem dos assentos. */
function toReveal(state: PicturesState): PicturesState {
  const order = state.players.filter((p) => state.inRound.includes(p) && Object.hasOwn(state.works, p));
  const { gained, correct } = scorePicturesRound({
    artists: order,
    guessers: state.inRound,
    secrets: state.secrets,
    guesses: state.guesses,
  });
  const scores = { ...state.scores };
  for (const [p, n] of Object.entries(gained)) scores[p] = (scores[p] ?? 0) + n;
  return {
    ...state,
    phase: 'reveal',
    scores,
    countdownEndsAt: null,
    result: {
      round: state.round,
      order,
      secrets: state.secrets,
      kits: state.kits,
      works: state.works,
      guesses: state.guesses,
      correct,
      gained,
    },
  };
}

/**
 * Pausa, contagem e fechamento da montagem/palpite. Roda depois de "pronto"/"confirmar" e a cada `tick` da sala
 * (presença e alarme no fim da contagem). Devolve o MESMO objeto quando nada muda (o servidor compara referência).
 */
export function settlePictures(state: PicturesState, ctx: GameContext): PicturesState {
  if (state.phase !== 'building' && state.phase !== 'guessing') return state;
  const people = here(state, ctx);
  if (people.length < PICTURES_MIN_PLAYERS) {
    return state.paused && state.countdownEndsAt === null ? state : { ...state, paused: true, countdownEndsAt: null };
  }
  const resumed = state.paused ? { ...state, paused: false } : state;
  const done = resumed.phase === 'building' ? resumed.ready : resumed.confirmed;
  const doneHere = people.filter((p) => done.includes(p)).length;
  const timeUp = resumed.countdownEndsAt !== null && ctx.now >= resumed.countdownEndsAt;
  if (doneHere === people.length || timeUp) return resumed.phase === 'building' ? toGuessing(resumed) : toReveal(resumed);
  if (resumed.countdownEndsAt === null && doneHere >= Math.ceil(people.length / 2)) {
    return { ...resumed, countdownEndsAt: ctx.now + PICTURES_COUNTDOWN_MS };
  }
  return resumed;
}

/** Depois da revelação: fim de jogo na 6ª rodada, senão a próxima montagem. */
function afterReveal(state: PicturesState, ctx: GameContext): PicturesState {
  if (state.round + 1 >= PICTURES_ROUNDS) {
    const top = Math.max(...state.players.map((p) => state.scores[p] ?? 0));
    return { ...state, phase: 'gameover', winners: state.players.filter((p) => (state.scores[p] ?? 0) === top) };
  }
  return beginRound(state, ctx, state.round + 1);
}

/** Por que `playerId` não pode agir nesta fase (ou null se pode). */
function playerError(state: PicturesState, playerId: string, phase: PicturesPhase): string | null {
  if (state.phase !== phase) return 'bad_phase';
  if (!state.inRound.includes(playerId)) return 'not_player';
  return null;
}

export function applyPicturesAction(
  state: PicturesState,
  playerId: string,
  action: PicturesAction,
  ctx: GameContext,
): ActionResult<PicturesState> {
  const isHost = ctx.hostId === playerId;
  switch (action.type) {
    case 'start':
      if (!isHost) return fail('not_host');
      if (state.phase !== 'lobby') return fail('bad_phase');
      return startMatch(ctx);
    case 'lobby':
      if (!isHost) return fail('not_host');
      if (state.phase === 'lobby') return fail('bad_phase');
      return ok(initialPicturesState());
    case 'draft': {
      const e = playerError(state, playerId, 'building');
      if (e) return fail(e);
      if (state.ready.includes(playerId)) return fail('already_ready');
      if (action.work.kit !== state.kits[playerId]) return fail('wrong_kit');
      const bad = workError(action.work);
      if (bad) return fail(bad);
      return ok({ ...state, works: { ...state.works, [playerId]: action.work } });
    }
    case 'ready': {
      const e = playerError(state, playerId, 'building');
      if (e) return fail(e);
      if (!action.on) return ok({ ...state, ready: state.ready.filter((p) => p !== playerId) });
      if (state.ready.includes(playerId)) return fail('already_ready');
      const notYet = readyError(state.works[playerId]);
      if (notYet) return fail(notYet);
      return ok(settlePictures({ ...state, ready: [...state.ready, playerId] }, ctx));
    }
    case 'guess': {
      const e = playerError(state, playerId, 'guessing');
      if (e) return fail(e);
      if (state.confirmed.includes(playerId)) return fail('already_confirmed');
      if (action.artist === playerId) return fail('own_work');
      if (!state.inRound.includes(action.artist) || !Object.hasOwn(state.works, action.artist)) return fail('no_work');
      const rest = Object.fromEntries(Object.entries(state.guesses[playerId] ?? {}).filter(([a]) => a !== action.artist));
      const mine = action.coord === null ? rest : { ...rest, [action.artist]: action.coord };
      return ok({ ...state, guesses: { ...state.guesses, [playerId]: mine } });
    }
    case 'confirm': {
      const e = playerError(state, playerId, 'guessing');
      if (e) return fail(e);
      if (state.confirmed.includes(playerId)) return fail('already_confirmed');
      return ok(settlePictures({ ...state, confirmed: [...state.confirmed, playerId] }, ctx));
    }
    case 'hurry':
      if (!isHost) return fail('not_host');
      if (state.phase !== 'building' && state.phase !== 'guessing') return fail('bad_phase');
      if (state.countdownEndsAt !== null) return ok(state);
      return ok({ ...state, countdownEndsAt: ctx.now + PICTURES_COUNTDOWN_MS });
    case 'next':
      if (!isHost) return fail('not_host');
      if (state.phase !== 'reveal') return fail('bad_phase');
      return ok(afterReveal(state, ctx));
    case 'again':
      if (!isHost) return fail('not_host');
      if (state.phase !== 'gameover') return fail('bad_phase');
      return startMatch(ctx);
    default:
      return fail('bad_action');
  }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test -w shared -- pictures-rules && npm run typecheck -w shared`
Expected: PASS em todos; typecheck sem erro.

Se o teste "host apressa" falhar em `expect(act(s, 'p0', { type: 'hurry' }, ctx)).toBe(s)`: o `act` congela `s`, mas devolve a mesma referência; confira que o caso `hurry` devolve `ok(state)` sem copiar quando a contagem já corre.

- [ ] **Step 6: Commit**

```bash
git add shared/src/games/pictures/rules.ts shared/test/pictures-helpers.ts shared/test/pictures-rules.test.ts
git commit -m "feat(shared): regras do Retratim (montagem, contagem, palpites, revelação, fim)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: visão com segredos, prazo e schema das ações

**Files:**
- Create: `shared/src/games/pictures/view.ts`
- Create: `shared/src/games/pictures/schema.ts`
- Test: `shared/test/pictures-view.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from 'vitest';
import { picturesActionSchema } from '../src/games/pictures/schema';
import { picturesNextDeadline, picturesViewFor } from '../src/games/pictures/view';
import { PICTURES_COUNTDOWN_MS } from '../src/games/pictures/types';
import { initialPicturesState, settlePictures } from '../src/games/pictures/rules';
import { T0, act, ctxOf, drafted, rightGuess, sampleWork, started, toGuessingPhase, toRevealPhase } from './pictures-helpers';

describe('Retratim: o que cada um vê', () => {
  it('montagem: só a sua coordenada e o seu rascunho; kits e prontos de todos', () => {
    const { state, ctx } = started(3);
    const s = drafted(state, ['p0', 'p1'], ctx);
    const v = picturesViewFor(s, 'p0');
    expect(v.mySecret).toBe(s.secrets.p0);
    expect(Object.keys(v.works)).toEqual(['p0']);
    expect(v.kits).toEqual(s.kits);
    expect(JSON.stringify(v)).not.toContain('"secrets"');
    expect(v.result).toBeNull();
    expect(v.rounds).toBe(6);
  });

  it('espectador não vê coordenada nem obra na montagem', () => {
    const { state, ctx } = started(3);
    const v = picturesViewFor(drafted(state, ['p0'], ctx), null);
    expect(v.mySecret).toBeNull();
    expect(v.works).toEqual({});
  });

  it('palpite: vê as obras de todos, só os próprios palpites, e nenhuma coordenada alheia', () => {
    const { state, ctx } = started(3);
    let s = toGuessingPhase(state, ctx);
    s = act(s, 'p1', { type: 'guess', artist: 'p0', coord: 'A1' }, ctx);
    const v = picturesViewFor(s, 'p0');
    expect(Object.keys(v.works)).toEqual(['p0', 'p1', 'p2']);
    expect(v.myGuesses).toEqual({});
    expect(picturesViewFor(s, 'p1').myGuesses).toEqual({ p0: 'A1' });
    expect(v.result).toBeNull();
  });

  it('revelação: tudo aparece no resultado', () => {
    const { state, ctx } = started(3);
    const s = toRevealPhase(toGuessingPhase(state, ctx), ctx, rightGuess);
    const v = picturesViewFor(s, 'p2');
    expect(v.result?.secrets).toEqual(state.secrets);
    expect(v.result?.order).toEqual(['p0', 'p1', 'p2']);
  });
});

describe('Retratim: prazo pro servidor acordar', () => {
  it('só enquanto a contagem corre e a mesa não está pausada', () => {
    expect(picturesNextDeadline(initialPicturesState())).toBeNull();
    const { state, ctx } = started(4);
    expect(picturesNextDeadline(state)).toBeNull();
    const hurried = act(state, 'p0', { type: 'hurry' }, ctx);
    expect(picturesNextDeadline(hurried)).toBe(T0 + PICTURES_COUNTDOWN_MS);
    expect(picturesNextDeadline(settlePictures(hurried, ctxOf(['p0', 'p1'])))).toBeNull();
  });
});

describe('Retratim: schema das ações', () => {
  const ok = (a: unknown) => picturesActionSchema.safeParse(a).success;

  it('aceita as ações do jogo', () => {
    expect(ok({ type: 'start' })).toBe(true);
    expect(ok({ type: 'draft', work: sampleWork('blocks') })).toBe(true);
    expect(ok({ type: 'ready', on: false })).toBe(true);
    expect(ok({ type: 'guess', artist: 'p1', coord: 'D4' })).toBe(true);
    expect(ok({ type: 'guess', artist: 'p1', coord: null })).toBe(true);
    for (const type of ['confirm', 'hurry', 'next', 'again', 'lobby']) expect(ok({ type })).toBe(true);
  });

  it('recusa coordenada fora da grade, obra malformada e ação de outro jogo', () => {
    expect(ok({ type: 'guess', artist: 'p1', coord: 'E1' })).toBe(false);
    expect(ok({ type: 'draft', work: { kit: 'cubes', cells: [] } })).toBe(false);
    expect(ok({ type: 'ready' })).toBe(false);
    expect(ok({ type: 'tell', cardId: 'd001', clue: '' })).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -w shared -- pictures-view`
Expected: FAIL (não acha `schema`/`view`).

- [ ] **Step 3: Criar `shared/src/games/pictures/view.ts`**

```ts
import type { GameModule } from '../../game';
import { applyPicturesAction, initialPicturesState, settlePictures } from './rules';
import { PICTURES_ROUNDS, type PicturesAction, type PicturesState, type PicturesView } from './types';

/** Lê o registro só se a chave for própria (ids como '__proto__' não podem cair no protótipo). */
function own<T>(record: Record<string, T>, key: string | null): T | undefined {
  return key !== null && Object.hasOwn(record, key) ? record[key] : undefined;
}

/**
 * Única fronteira de segredo do Retratim: coordenadas e obras alheias só aparecem pra quem pode ver.
 * A visão compartilha arrays/objetos com o estado (é serializada no socket); quem consome não deve mutar.
 */
export function picturesViewFor(state: PicturesState, viewerId: string | null): PicturesView {
  const revealed = state.phase === 'reveal' || state.phase === 'gameover';
  const allWorks = state.phase === 'guessing' || revealed;
  const myWork = own(state.works, viewerId);
  return {
    phase: state.phase,
    players: state.players,
    inRound: state.inRound,
    scores: state.scores,
    round: state.round,
    rounds: PICTURES_ROUNDS,
    grid: state.grid,
    kits: state.kits,
    ready: state.ready,
    confirmed: state.confirmed,
    countdownEndsAt: state.countdownEndsAt,
    paused: state.paused,
    winners: state.winners,
    mySecret: own(state.secrets, viewerId) ?? null,
    works: allWorks ? state.works : myWork !== undefined && viewerId !== null ? { [viewerId]: myWork } : {},
    myGuesses: own(state.guesses, viewerId) ?? {},
    result: revealed ? state.result : null,
  };
}

/** O Retratim só tem prazo enquanto a contagem dos 30 s corre (e a mesa não está pausada). */
export function picturesNextDeadline(state: PicturesState): number | null {
  if (state.phase !== 'building' && state.phase !== 'guessing') return null;
  return state.paused ? null : state.countdownEndsAt;
}

export const pictures: GameModule<PicturesState, PicturesAction, PicturesView> = {
  id: 'pictures',
  initialState: () => initialPicturesState(),
  applyAction: applyPicturesAction,
  viewFor: picturesViewFor,
  onPresenceChange: settlePictures,
  nextDeadline: picturesNextDeadline,
};
```

- [ ] **Step 4: Criar `shared/src/games/pictures/schema.ts`**

```ts
import { z } from 'zod';
import { COORDS, type PicturesAction } from './types';
import { workSchema } from './works';

const coord = z.enum(COORDS);

export const picturesActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start') }),
  z.object({ type: z.literal('draft'), work: workSchema }),
  z.object({ type: z.literal('ready'), on: z.boolean() }),
  z.object({ type: z.literal('guess'), artist: z.string().min(1).max(64), coord: coord.nullable() }),
  z.object({ type: z.literal('confirm') }),
  z.object({ type: z.literal('hurry') }),
  z.object({ type: z.literal('next') }),
  z.object({ type: z.literal('again') }),
  z.object({ type: z.literal('lobby') }),
]);

/** Falha a compilação se o schema divergir do tipo PicturesAction. */
type Assert<T extends true> = T;
export type PicturesActionSchemaMatches = Assert<z.infer<typeof picturesActionSchema> extends PicturesAction ? true : false>;
export type PicturesActionTypeCovered = Assert<PicturesAction extends z.infer<typeof picturesActionSchema> ? true : false>;
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test -w shared -- pictures-view && npm run typecheck -w shared`
Expected: PASS; typecheck sem erro (o `Assert` do schema também compila).

- [ ] **Step 6: Commit**

```bash
git add shared/src/games/pictures/view.ts shared/src/games/pictures/schema.ts shared/test/pictures-view.test.ts
git commit -m "feat(shared): visão com segredos, prazo e schema das ações do Retratim

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Retratim no registro, na sala e no protocolo

**Files:**
- Modify: `shared/src/games/registry.ts`
- Modify: `shared/src/room.ts` (tipos de visão, `nextAlarmAt`)
- Modify: `shared/src/protocol.ts` (`ERROR_CODES`, `ERROR_MESSAGES`)
- Modify: `shared/src/index.ts`
- Test: `shared/test/room-games.test.ts`

- [ ] **Step 1: Escrever os testes que falham em `shared/test/room-games.test.ts`**

No import de `../src/room`, acrescente `isPicturesRoomView` e `nextAlarmAt`. Acrescente também:

```ts
import { PICTURES_COUNTDOWN_MS, type PicturesState } from '../src/games/pictures/types';
import { ERROR_CODES, errorMessage } from '../src/protocol';
import { sampleWork } from './pictures-helpers';
```

(se `parseClientMessage` já vem de `../src/protocol`, junte no mesmo import).

Troque o teste `conhece ITO e Dixit` por:

```ts
  it('conhece ITO, Dixit e Retratim', () => {
    expect(Object.keys(GAMES)).toEqual(['ito', 'dixit', 'pictures']);
    expect(GAMES.dixit.minPlayers).toBe(3);
    expect(GAMES.ito.liveCursors).toBe(true);
    expect(GAMES.dixit.liveCursors).toBe(false);
    expect(GAMES.pictures).toMatchObject({ minPlayers: 3, maxPlayers: 6, liveCursors: false, recordsHistory: false });
    expect(isGameId('dixit')).toBe(true);
    expect(isGameId('pictures')).toBe(true);
    expect(isGameId('xadrez')).toBe(false);
    expect(isGameId(undefined)).toBe(false);
  });
```

Acrescente ao fim do arquivo:

```ts
function picturesRoom(n: number): Room {
  let room = createRoom('ABCD', 0, 'pictures');
  for (let i = 0; i < n; i++) {
    const res = joinRoom(room, { token: `t${i}`, name: `P${i}`, color: PLAYER_COLORS[i]! }, `p${i}`, 0);
    if (!res.ok) throw new Error(res.error);
    room = res.room;
  }
  return room;
}

function step(room: Room, playerId: string, action: unknown, now: number): Room {
  const res = roomAction(room, playerId, action, rng, now);
  if (!res.ok) throw new Error(res.error);
  return res.room;
}

describe('sala de Retratim', () => {
  it('é de Retratim, cabe 6 e recusa o 7º', () => {
    const room = picturesRoom(6);
    expect(isPicturesRoomView(roomView(room, null))).toBe(true);
    expect(roomSummary(room)).toMatchObject({ game: 'pictures', phase: 'lobby' });
    expect(joinRoom(room, { token: 't6', name: 'P6', color: PLAYER_COLORS[6]! }, 'p6', 0)).toEqual({ ok: false, error: 'room_full' });
  });

  it('o alarme acorda no fim da contagem e o tick fecha a montagem', () => {
    let room = picturesRoom(3);
    room = step(room, 'p0', { type: 'start' }, 10);
    const game = () => room.game as PicturesState;
    for (const p of ['p0', 'p1']) {
      room = step(room, p, { type: 'draft', work: sampleWork(game().kits[p]!) }, 10);
      room = step(room, p, { type: 'ready', on: true }, 10);
    }
    expect(game().countdownEndsAt).toBe(10 + PICTURES_COUNTDOWN_MS);
    expect(nextAlarmAt(room, 10)).toBe(10 + PICTURES_COUNTDOWN_MS);
    expect(tick(room, 10 + PICTURES_COUNTDOWN_MS - 1, rng).game.phase).toBe('building');
    room = tick(room, 10 + PICTURES_COUNTDOWN_MS, rng);
    expect(game().phase).toBe('guessing');
  });

  it('sala de ITO continua acordando só pela presença e expiração', () => {
    const room = createRoom('ABCD', 0);
    expect(nextAlarmAt(room, 0)).toBe(room.lastActivity + 6 * 60 * 60 * 1000);
  });

  it('erros do Retratim têm mensagem em português', () => {
    for (const code of ['wrong_kit', 'bad_work', 'empty_work', 'cubes_incomplete', 'icons_too_few', 'already_ready', 'own_work', 'no_work']) {
      expect(ERROR_CODES).toContain(code);
      expect(errorMessage(code)).not.toBe('Algo deu errado.');
    }
    expect(errorMessage('room_full')).toBe('A sala está cheia.');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -w shared -- room-games`
Expected: FAIL (`GAMES.pictures` não existe, `isPicturesRoomView` não existe).

- [ ] **Step 3: Registrar o jogo em `shared/src/games/registry.ts`**

Imports novos (junto dos outros):

```ts
import { picturesActionSchema } from './pictures/schema';
import { PICTURES_MAX_PLAYERS, PICTURES_MIN_PLAYERS, type PicturesAction, type PicturesState, type PicturesView } from './pictures/types';
import { pictures } from './pictures/view';
```

Troque as 4 linhas de ids e uniões por:

```ts
export const GAME_IDS = ['ito', 'dixit', 'pictures'] as const;
export type GameId = (typeof GAME_IDS)[number];
export type GameState = ItoState | DixitState | PicturesState;
export type GameView = ItoView | DixitView | PicturesView;
export type GameAction = ItoAction | DixitAction | PicturesAction;
```

E acrescente a entrada depois de `dixit` em `GAMES`:

```ts
  pictures: defineGame({
    id: 'pictures',
    module: pictures,
    actionSchema: picturesActionSchema,
    minPlayers: PICTURES_MIN_PLAYERS,
    maxPlayers: PICTURES_MAX_PLAYERS,
    // Cursor em cima de uma foto entregaria o palpite.
    liveCursors: false,
    // O histórico do Retratim (com o museu) vem no Plano R4.
    recordsHistory: false,
  }),
```

- [ ] **Step 4: Visão e alarme em `shared/src/room.ts`**

Import novo (junto de `DixitView`):

```ts
import type { PicturesView } from './games/pictures/types';
```

Depois de `isDixitRoomView`, acrescente:

```ts
export type PicturesRoomView = RoomView<PicturesView> & { gameId: 'pictures' };

export function isPicturesRoomView(view: RoomView): view is PicturesRoomView {
  return view.gameId === 'pictures';
}
```

Troque `nextAlarmAt` inteiro por:

```ts
/** Próximo momento em que o servidor precisa acordar: fim de uma tolerância de desconexão, prazo do jogo ou expiração. */
export function nextAlarmAt(room: Room, now: number): number {
  const pending = room.seats
    .filter((s) => !s.connected && s.disconnectedAt !== null)
    .map((s) => s.disconnectedAt! + DISCONNECT_GRACE_MS + 1000)
    .filter((at) => at > now);
  const deadline = GAMES[room.gameId].module.nextDeadline?.(room.game) ?? null;
  if (deadline !== null && deadline > now) pending.push(deadline);
  return Math.min(room.lastActivity + ROOM_TTL_MS, ...pending);
}
```

- [ ] **Step 5: Erros em `shared/src/protocol.ts`**

No fim de `ERROR_CODES` (depois de `'deck_too_small',`), acrescente:

```ts
  'wrong_kit',
  'bad_work',
  'empty_work',
  'cubes_incomplete',
  'icons_too_few',
  'already_ready',
  'own_work',
  'no_work',
```

Em `ERROR_MESSAGES`, troque `room_full: 'A sala está cheia (máx. 10).',` por `room_full: 'A sala está cheia.',` e acrescente depois de `deck_too_small`:

```ts
  wrong_kit: 'Esse não é o seu kit nesta rodada.',
  bad_work: 'Essa obra não vale com esse kit.',
  empty_work: 'Monte alguma coisa antes de ficar pronto.',
  cubes_incomplete: 'Preencha todas as casas antes.',
  icons_too_few: 'Escolha pelo menos 2 cartas.',
  already_ready: 'Você já está pronto. Desmarque pra mexer.',
  own_work: 'Não dá pra palpitar na própria obra.',
  no_work: 'Essa pessoa não tem obra nesta rodada.',
```

- [ ] **Step 6: Exports em `shared/src/index.ts`**

Antes de `export * from './games/registry';`, acrescente:

```ts
export * from './games/pictures/types';
export * from './games/pictures/works';
export { PICTURES_DECK, PICTURES_THEMES, type PicturesPhoto, type PicturesTheme } from './games/pictures/photos';
export { drawGrid } from './games/pictures/grid';
export { kitFor, kitsForRound } from './games/pictures/rotation';
export { scorePicturesRound } from './games/pictures/scoring';
export { applyPicturesAction, initialPicturesState, settlePictures } from './games/pictures/rules';
export { pictures, picturesNextDeadline, picturesViewFor } from './games/pictures/view';
export { picturesActionSchema } from './games/pictures/schema';
```

- [ ] **Step 7: Rodar tudo do `shared` e o typecheck dele**

Run: `npm test -w shared && npm run typecheck -w shared && npm run typecheck -w server`
Expected: todos PASS, sem erro de tipo. O typecheck do `web` vai acusar `web/src/games/catalog.ts` (falta `pictures` no `Record<GameId, …>`): isso é esperado e a Task 9 corrige.

- [ ] **Step 8: Commit**

```bash
git add shared/src/games/registry.ts shared/src/room.ts shared/src/protocol.ts shared/src/index.ts shared/test/room-games.test.ts
git commit -m "feat(shared): Retratim no registro de jogos, sala acorda no prazo do jogo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Retratim na estante, "em breve"

**Files:**
- Modify: `web/src/games/catalog.ts`
- Test: `web/test/catalog.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Em `web/test/catalog.test.ts`, depois do teste `DITU e Diquisti (o Dixit) jogáveis…`, acrescente:

```ts
  it('Retratim (o Pictures) aparece na estante, mas ainda "em breve"', () => {
    const entry = catalogEntry('pictures');
    expect(entry?.name).toBe('Retratim');
    expect(entry?.players).toBe('3 a 6 pessoas');
    expect(entry?.playable).toBe(false);
    expect(entry?.hasHistory).toBe(false);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -w web -- catalog`
Expected: FAIL (`catalogEntry('pictures')` sem `name`, ou erro de tipo no `TEXT`).

- [ ] **Step 3: Acrescentar o texto em `web/src/games/catalog.ts`**

Troque o comentário `// Nomes de vitrine: …` por:

```ts
// Nomes de vitrine: o ITO aparece como DITU, o Dixit como Diquisti e o Pictures como Retratim; os ids internos não mudam.
```

E acrescente a entrada depois de `dixit` no `TEXT`:

```ts
  pictures: {
    name: 'Retratim',
    tagline: 'remonte a foto secreta com o que tiver na mão',
    rules: [
      'Na mesa há 16 fotos. Cada um tira uma coordenada secreta: essa é a sua foto.',
      'Cada rodada você recebe um kit diferente (cubos, cadarços, palitos e pedras, blocos, símbolos ou pontos e linhas) e remonta a foto do jeito que der.',
      'Depois, todo mundo palpita qual foto cada um montou: +1 por acerto, e +1 pro artista por cada um que acertou a dele.',
      '6 rodadas: cada um usa cada kit uma vez.',
    ],
    // A mesa vem no Plano R2.
    playable: false,
  },
```

- [ ] **Step 4: Rodar os testes e o typecheck do web**

Run: `npm test -w web && npm run typecheck`
Expected: todos PASS (inclusive `shelf-soon`); typecheck sem erro.

- [ ] **Step 5: Commit**

```bash
git add web/src/games/catalog.ts web/test/catalog.test.ts
git commit -m "feat(web): Retratim na estante como \"em breve\"

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: servidor cria e joga sala de Retratim

**Files:**
- Modify: `server/test/helpers.ts` (`newGameRoom`)
- Test: `server/test/pictures.test.ts`

- [ ] **Step 1: Deixar `newGameRoom` aceitar qualquer jogo**

Em `server/test/helpers.ts`, troque a assinatura

```ts
export async function newGameRoom(game: 'ito' | 'dixit' = 'ito'): Promise<string> {
```

por

```ts
export async function newGameRoom(game: GameId = 'ito'): Promise<string> {
```

e acrescente `type GameId` ao import de `@cartolina/shared` no topo do arquivo.

- [ ] **Step 2: Escrever o teste, `server/test/pictures.test.ts`**

```ts
import { SELF } from 'cloudflare:test';
import type { PicturesRoomView } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { joined, newGameRoom } from './helpers';

const isBuilding = (r: PicturesRoomView) => r.game.phase === 'building';

describe('Retratim no servidor', () => {
  it('POST /rooms { game: "pictures" } cria a sala e o GET conta que é de Retratim', async () => {
    const code = await newGameRoom('pictures');
    const body = await (await SELF.fetch(`https://x/rooms/${code}`)).json();
    expect(body).toMatchObject({ exists: true, game: 'pictures', phase: 'lobby' });
  });

  it('o histórico do Retratim ainda não existe (vem no Plano R4)', async () => {
    const res = await SELF.fetch('https://x/history/pictures');
    expect(res.status).toBe(404);
  });

  it('começa com 3: cada um vê a própria coordenada e kits diferentes; rascunho alheio não vaza', async () => {
    const code = await newGameRoom('pictures');
    const players = await joined(code, 3);
    players[0]!.client.send({ t: 'action', action: { type: 'start' } });
    const views = await Promise.all(players.map((p) => p.client.state<PicturesRoomView>(isBuilding)));
    for (const v of views) {
      expect(v.game.mySecret).toMatch(/^[A-D][1-4]$/);
      expect(v.game.grid).toHaveLength(16);
    }
    expect(new Set(Object.values(views[0]!.game.kits)).size).toBe(3);
    expect(views[0]!.game.kits[players[0]!.id]).toBe('cubes');

    const cubes = { kit: 'cubes', cells: [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5] };
    players[0]!.client.send({ t: 'action', action: { type: 'draft', work: cubes } });
    players[0]!.client.send({ t: 'action', action: { type: 'ready', on: true } });
    const seen = await players[1]!.client.state<PicturesRoomView>((r) => r.game.ready.includes(players[0]!.id));
    expect(seen.game.works).toEqual({});
    const mine = await players[0]!.client.state<PicturesRoomView>((r) => r.game.ready.includes(players[0]!.id));
    expect(mine.game.works[players[0]!.id]).toEqual(cubes);
  });

  it('kit errado volta como erro em português', async () => {
    const code = await newGameRoom('pictures');
    const players = await joined(code, 3);
    players[0]!.client.send({ t: 'action', action: { type: 'start' } });
    await players[0]!.client.state<PicturesRoomView>(isBuilding);
    players[0]!.client.send({ t: 'action', action: { type: 'draft', work: { kit: 'icons', ids: [0, 1] } } });
    const err = await players[0]!.client.next('error');
    expect(err).toMatchObject({ code: 'wrong_kit', message: 'Esse não é o seu kit nesta rodada.' });
  });
});
```

- [ ] **Step 3: Rodar**

Run: `npm test -w server -- pictures`
Expected: PASS (o servidor já delega tudo ao registro; nenhuma mudança em `server/src`). Se algum `expect` de `state` estourar o timeout, confira com `npm test -w server -- dixit` se a suíte do servidor roda nessa máquina antes de mexer em código.

- [ ] **Step 4: Rodar a suíte inteira do servidor**

Run: `npm test -w server`
Expected: todos PASS.

- [ ] **Step 5: Commit**

```bash
git add server/test/helpers.ts server/test/pictures.test.ts
git commit -m "test(server): sala de Retratim pelo WebSocket

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: conferência final

**Files:** nenhum novo.

- [ ] **Step 1: Tudo de uma vez**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck sem erro; testes de `shared`, `server` e `web` PASS; build do `web` OK.

- [ ] **Step 2: E2E do DITU continua passando (trava o deploy)**

Run: `npm run e2e`
Expected: PASS. (Precisa de servidor e web locais como no `docs/deploy.md`; se o ambiente não deixar rodar, registre isso no resumo em vez de pular calado.)

- [ ] **Step 3: Conferir que nada de tela mudou além da capa "em breve"**

Run: `git diff main --stat -- web/src`
Expected: só `web/src/games/catalog.ts`.

- [ ] **Step 4: Atualizar a ordem de construção da spec**

Em `docs/superpowers/specs/2026-10-17-retratim-design.md` §10, no item 3, troque `**Plano R1 — regras e base:**` por `**Plano R1 — regras e base** (feito, \`docs/superpowers/plans/2026-10-17-plano-r1-retratim-regras.md\`):`.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-10-17-retratim-design.md
git commit -m "docs: Plano R1 do Retratim concluído

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Não abra PR nem faça merge: publicar é decisão do usuário (merge no `main` = deploy).
