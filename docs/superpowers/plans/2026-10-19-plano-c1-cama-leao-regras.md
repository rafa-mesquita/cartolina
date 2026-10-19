# Plano C1 — Cama-Leão: regras e base Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O Cama-Leão (id `camelio`, nossa versão do Camelio) existe como módulo de regras completo e testado em `shared/`, o servidor cria salas dele, e a estante mostra a capa de circo com o selo "em breve" (sem mesa ainda).

**Architecture:** `shared/src/games/camelio/` traz o baralho fixo de 72 cartas (`deck.ts`), as contas puras de esferas e pontos (`scoring.ts`), as regras (`rules.ts`: começar, jogar, jogar de novo, presença), a visão que esconde só a frente do topo do monte (`view.ts`) e o schema zod das ações (`schema.ts`). O registro ganha a entrada `camelio`; a sala e o servidor já são genéricos, só os `switch` exaustivos por jogo (histórico e página do jogo) ganham um caso "ainda não tem histórico".

**Tech Stack:** TypeScript 5.9, zod 3, Vitest 4, Cloudflare Workers + Durable Objects (`@cloudflare/vitest-plugin`), React 19 (só catálogo, capa e um `switch` no `web/`).

**Spec:** `docs/superpowers/specs/2026-10-19-cama-leao-design.md` (§2 regras, §3 estado, §4 servidor, §5.6 catálogo, §7 testes). Este plano é o item 1 da §8 (C1). Protótipo, mesa e histórico ficam pros planos C2–C4.

---

## Contexto para quem vai executar

- Trabalhe na worktree `.claude/worktrees/camelio` (branch `feat/camelio`, já tem o spec e este plano). **Não** mexa na pasta mãe do repositório nem troque a branch dela. **Não** use `git stash` puro. **Não** faça merge no `main` (merge = publicar; é decisão do Rafa).
- Monorepo npm workspaces: `shared/` (regras puras, sem I/O), `server/` (Worker + Durable Object), `web/` (React). Comandos na raiz da worktree: `npm test`, `npm run typecheck`, `npm test -w shared -- <filtro>`, `npm test -w server -- <filtro>`, `npm test -w web -- <filtro>`.
- Use o Bash (Git Bash). O `rtk` não existe nele: rode `git`/`npm` direto. No PowerShell do Rafa, `npx.cmd`/`npm.cmd`.
- Código, comentários, nomes de teste e mensagens em **português**, no estilo dos arquivos existentes. Commits `feat(shared): …`, `test(server): …`, terminando com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `tsconfig.base.json` usa `strict`, `noUncheckedIndexedAccess` e `verbatimModuleSyntax`: imports só de tipo com `import type`; acesso por índice dá `T | undefined` (use `!` quando o teste garante, ou `?? []`).
- A Vitest não checa tipos: rode **também** `npm run typecheck` onde o passo pedir.
- Modelo a seguir: o Diquisti (`shared/src/games/dixit/`, `shared/test/dixit-*.test.ts`). Mesmos padrões: `fail`/`ok`, `deepFreeze` nos testes (qualquer mutação das regras estoura), schema com `Assert` de tipos.
- `onPresenceChange` precisa devolver **o mesmo objeto** quando nada muda (o servidor compara referência pra decidir se grava).
- Sorteio só pelo `ctx.rng`; nada de `Math.random`/`Date.now` nas regras.

### Outros jogos sendo feitos ao mesmo tempo

Em 2026-10-19 outras duas sessões também estão fazendo um "jogo 4": o **Tatubum** (id `kittens`, branch `feat/tatubum`) e o **Cúpi** (id `coup`, branch `feat/cupi`, que também chama os planos de C1–C4; não confunda). Os três acrescentam coisas nos mesmos lugares: `GAME_IDS`/`GAMES` e os tipos união do `registry.ts`, `ERROR_CODES`/`ERROR_MESSAGES` do `protocol.ts`, `room.ts`, `history.ts`, `index.ts`, os `switch` de `server/src/index.ts` e `GamePage.tsx`, `catalog.ts`, `shelf.css`, `index.html` e o teste `conhece …` do `room-games.test.ts` (que lista os ids na ordem).

- Neste plano, **só acrescente**; não reordene nem reformate o que existe (conflito menor).
- Quem fizer merge depois resolve o conflito mantendo **as duas** entradas. A ordem em `GAME_IDS` (e na estante) é a ordem de chegada no `main`.
- Código de erro com o mesmo nome em dois jogos (ex.: `not_your_turn` no Cúpi) fica **uma vez só** na lista, com uma mensagem que sirva pros dois.
- Migração do D1 (só no C4): use o próximo número livre no `main` na hora, não um número reservado agora.

### Ids fixos do baralho (pra ler os testes)

O baralho é montado sempre na mesma ordem (Task 1). Cores na ordem do círculo: verde, amarelo, laranja, vermelho, roxo, azul.

| ids | tipo | conteúdo |
|---|---|---|
| 0–35 | normal | 6 por cor, esferas 1, 1, 2, 2, 3, 4. Verde 0–5, amarelo 6–11, laranja 12–17, vermelho 18–23, roxo 24–29, azul 30–35 (ex.: 18 = vermelho 1, 20 = vermelho 2, 22 = vermelho 3, 23 = vermelho 4) |
| 36–59 | bicolor | 4 por par (A, B) de cores vizinhas: A1, B1, A3, B3. Pares: verde-amarelo 36–39, amarelo-laranja 40–43, laranja-vermelho 44–47, vermelho-roxo 48–51, roxo-azul 52–55, azul-verde 56–59 (ex.: 47 = vermelho 3 com verso laranja/vermelho). **Atualizado depois da execução:** o plano foi executado com A1, A2, B2, B3, e a revisão final trocou por A1, B1, A3, B3 (o verso de 1 ou 3 esferas entregava a cor); os blocos de código abaixo mostram a versão original. |
| 60–71 | multicolor | 2 por cor, esferas 1 e 2: verde 60–61, amarelo 62–63, laranja 64–65, vermelho 66–67, roxo 68–69, azul 70–71 |

## Mapa de arquivos

Criar:
- `shared/src/games/camelio/types.ts`: constantes, cores, carta, verso, estado, ações, visão.
- `shared/src/games/camelio/deck.ts`: baralho fixo de 72 cartas, `camelioCard`, `camelioCardIds`, `camelioBack`.
- `shared/src/games/camelio/scoring.ts`: somas de esferas, pontos, `resolveCamelioPlay`, vencedores no fim do monte.
- `shared/src/games/camelio/rules.ts`: estado inicial, `applyCamelioAction`, `camelioOnPresenceChange`, `camelioTarget`.
- `shared/src/games/camelio/view.ts`: `camelioViewFor` e o módulo `camelio`.
- `shared/src/games/camelio/schema.ts`: schema zod das ações.
- `shared/test/camelio-helpers.ts`, `shared/test/camelio-deck.test.ts`, `shared/test/camelio-scoring.test.ts`, `shared/test/camelio-rules.test.ts`, `shared/test/camelio-presence.test.ts`, `shared/test/camelio-view.test.ts`.
- `server/test/camelio.test.ts`.

Modificar:
- `shared/src/games/registry.ts`: entrada `camelio`.
- `shared/src/protocol.ts`: códigos de erro `not_your_turn`, `bad_target`, `not_playing`.
- `shared/src/room.ts`: `CamelioRoomView`, `isCamelioRoomView`.
- `shared/src/history.ts`: `HistoryResponses.camelio: never`, caso `camelio` em `pendingHistoryRecord`.
- `shared/src/index.ts`: exports do Cama-Leão.
- `shared/test/room-games.test.ts`: registro com 4 jogos, sala de Cama-Leão, erros novos.
- `server/src/index.ts`: caso `camelio` em `historyPageOf`.
- `web/src/screens/GamePage.tsx`: caso `camelio` em `HistoryTab`.
- `web/src/games/catalog.ts`, `web/test/catalog.test.ts`: Cama-Leão na estante, "em breve".
- `web/src/screens/shelf.css`, `web/index.html`: capa de circo e fonte Rye.

---

### Task 0: Preparar a worktree

**Files:** nenhum.

- [ ] **Step 1: Instalar dependências na worktree**

Run: `npm install`
Expected: termina sem erro (a worktree começa sem `node_modules`).

- [ ] **Step 2: Linha de base verde**

Run: `npm test && npm run typecheck`
Expected: tudo PASS. Se algo já falhar aqui, pare e avise (não é deste plano).

---

### Task 1: Tipos e baralho

**Files:**
- Create: `shared/src/games/camelio/types.ts`
- Create: `shared/src/games/camelio/deck.ts`
- Create: `shared/test/camelio-helpers.ts`
- Test: `shared/test/camelio-deck.test.ts`

- [ ] **Step 1: Criar `shared/src/games/camelio/types.ts`**

```ts
export const CAMELIO_MIN_PLAYERS = 2;
export const CAMELIO_MAX_PLAYERS = 6;
/** Esferas exatas de uma cor pra pontuar. */
export const CAMELIO_EXACT = 5;

/** Cores na ordem do círculo: as bicolores juntam cores vizinhas. */
export const CAMELIO_COLORS = ['verde', 'amarelo', 'laranja', 'vermelho', 'roxo', 'azul'] as const;
export type CamelioColor = (typeof CAMELIO_COLORS)[number];

export type CamelioKind = 'normal' | 'bicolor' | 'multi';

/** Uma carta, com a frente (cor de verdade e esferas). */
export interface CamelioCard {
  id: number;
  kind: CamelioKind;
  color: CamelioColor;
  spheres: number;
  /** Bicolor: as duas cores do verso (a de verdade é uma delas). Nas outras, null. */
  pair: [CamelioColor, CamelioColor] | null;
}

/** O que dá pra ver de uma carta virada pra baixo. */
export type CamelioBack =
  | { kind: 'normal'; color: CamelioColor }
  | { kind: 'bicolor'; spheres: number; colors: [CamelioColor, CamelioColor] }
  | { kind: 'multi'; spheres: number };

export type CamelioPhase = 'lobby' | 'playing' | 'over';
export type CamelioFrom = 'open' | 'deck';
export type CamelioOutcome = 'none' | 'scored' | 'bust' | 'lost';
export type CamelioEndReason = 'target' | 'deck';

/** Uma jogada: quem pegou, de onde, pra quem deu e o que aconteceu. */
export interface CamelioPlay {
  by: string;
  from: CamelioFrom;
  to: string;
  card: number;
  outcome: CamelioOutcome;
  color: CamelioColor;
  /** Esferas da cor na mesa de `to` logo depois da carta (antes de descartar ou guardar). */
  sum: number;
}

export interface CamelioState {
  phase: CamelioPhase;
  /** Quem joga a partida, na ordem dos assentos do começo. */
  players: string[];
  /** Ids das cartas; o topo é o último. */
  deck: number[];
  /** Carta aberta ao lado do monte. */
  open: number | null;
  discard: number[];
  /** O descarte já virou monte uma vez nesta partida. */
  reshuffled: boolean;
  /** Área de jogo de cada um. */
  table: Record<string, number[]>;
  /** Área de pontos de cada um (as cartas das cores fechadas). */
  scored: Record<string, number[]>;
  turn: string | null;
  /** Pontos (cores) pra ganhar: 4 com 2 jogadores, 3 com 3 a 6. */
  target: number;
  /** Menos de 2 jogadores da partida ativos: ninguém joga até voltar gente. */
  paused: boolean;
  /** Toda jogada da partida (animação e, no C4, histórico). */
  log: CamelioPlay[];
  winners: string[];
  endReason: CamelioEndReason | null;
  /** Partida da sala: 0 no lobby, +1 a cada `start` e `again`. */
  match: number;
}

export type CamelioAction =
  | { type: 'start' }
  | { type: 'play'; from: CamelioFrom; to: string }
  | { type: 'again' }
  | { type: 'lobby' };

export interface CamelioView {
  phase: CamelioPhase;
  players: string[];
  target: number;
  turn: string | null;
  paused: boolean;
  match: number;
  /** Carta aberta, com a frente. */
  open: CamelioCard | null;
  /** Só o verso do topo do monte (a frente nunca sai do servidor). */
  top: CamelioBack | null;
  deckCount: number;
  discardCount: number;
  reshuffled: boolean;
  table: Record<string, CamelioCard[]>;
  scored: Record<string, CamelioCard[]>;
  points: Record<string, number>;
  /** Última jogada (pra animar), ou null antes da primeira. */
  last: CamelioPlay | null;
  /** Quantas jogadas a partida já teve: muda a cada jogada, mesmo se a anterior for igual. */
  playCount: number;
  winners: string[];
  endReason: CamelioEndReason | null;
}
```

- [ ] **Step 2: Criar `shared/test/camelio-helpers.ts`**

(O `rules.ts` ainda não existe; este arquivo só passa a compilar na Task 3. Até lá, só o `camelio-deck.test.ts` o importa, e só a constante `C`, que não depende das regras. Por isso as funções que usam as regras ficam pra Task 3.)

```ts
/** Cartas usadas nos testes (ids fixos do baralho, ver a tabela no plano C1 e `deck.ts`). */
export const C = {
  verde1: 0,
  verde2: 2,
  verde3: 4,
  amarelo2: 8,
  amarelo3: 10,
  vermelho1: 18,
  vermelho2: 20,
  vermelho2b: 21,
  vermelho3: 22,
  vermelho4: 23,
  azul1: 30,
  azul2: 32,
  azul3: 34,
  /** Bicolor laranja/vermelho, de verdade vermelho 2. */
  bicVermelho2: 46,
} as const;
```

- [ ] **Step 3: Escrever o teste `shared/test/camelio-deck.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { CAMELIO_DECK, CAMELIO_DECK_SIZE, camelioBack, camelioCard, camelioCardIds } from '../src/games/camelio/deck';
import { CAMELIO_COLORS, type CamelioKind } from '../src/games/camelio/types';
import { C } from './camelio-helpers';

const ofKind = (kind: CamelioKind) => CAMELIO_DECK.filter((c) => c.kind === kind);

describe('baralho do Cama-Leão', () => {
  it('tem 72 cartas: 36 normais, 24 bicolores e 12 multicoloridas', () => {
    expect(CAMELIO_DECK_SIZE).toBe(72);
    expect(ofKind('normal')).toHaveLength(36);
    expect(ofKind('bicolor')).toHaveLength(24);
    expect(ofKind('multi')).toHaveLength(12);
  });

  it('o id é a posição no baralho', () => {
    CAMELIO_DECK.forEach((card, i) => expect(card.id).toBe(i));
    expect(camelioCardIds()).toEqual(Array.from({ length: 72 }, (_, i) => i));
  });

  it('cada cor tem normais 1, 1, 2, 2, 3, 4', () => {
    for (const color of CAMELIO_COLORS) {
      const spheres = ofKind('normal')
        .filter((c) => c.color === color)
        .map((c) => c.spheres);
      expect(spheres).toEqual([1, 1, 2, 2, 3, 4]);
    }
  });

  it('bicolores: 4 por par de cores vizinhas, A1 A2 B2 B3', () => {
    CAMELIO_COLORS.forEach((a, i) => {
      const b = CAMELIO_COLORS[(i + 1) % CAMELIO_COLORS.length]!;
      const cards = ofKind('bicolor').filter((c) => c.pair?.[0] === a && c.pair?.[1] === b);
      expect(cards.map((c) => [c.color, c.spheres])).toEqual([
        [a, 1],
        [a, 2],
        [b, 2],
        [b, 3],
      ]);
    });
  });

  it('multicoloridas: 1 e 2 esferas em cada cor', () => {
    for (const color of CAMELIO_COLORS) {
      expect(ofKind('multi').filter((c) => c.color === color).map((c) => c.spheres)).toEqual([1, 2]);
    }
  });

  it('cada cor soma 24 esferas', () => {
    for (const color of CAMELIO_COLORS) {
      const total = CAMELIO_DECK.filter((c) => c.color === color).reduce((n, c) => n + c.spheres, 0);
      expect(total).toBe(24);
    }
  });

  it('ids que os testes usam batem com o baralho', () => {
    expect(camelioCard(C.verde1)).toMatchObject({ kind: 'normal', color: 'verde', spheres: 1 });
    expect(camelioCard(C.verde2)).toMatchObject({ kind: 'normal', color: 'verde', spheres: 2 });
    expect(camelioCard(C.verde3)).toMatchObject({ kind: 'normal', color: 'verde', spheres: 3 });
    expect(camelioCard(C.amarelo2)).toMatchObject({ kind: 'normal', color: 'amarelo', spheres: 2 });
    expect(camelioCard(C.amarelo3)).toMatchObject({ kind: 'normal', color: 'amarelo', spheres: 3 });
    expect(camelioCard(C.vermelho1)).toMatchObject({ kind: 'normal', color: 'vermelho', spheres: 1 });
    expect(camelioCard(C.vermelho2)).toMatchObject({ kind: 'normal', color: 'vermelho', spheres: 2 });
    expect(camelioCard(C.vermelho2b)).toMatchObject({ kind: 'normal', color: 'vermelho', spheres: 2 });
    expect(camelioCard(C.vermelho3)).toMatchObject({ kind: 'normal', color: 'vermelho', spheres: 3 });
    expect(camelioCard(C.vermelho4)).toMatchObject({ kind: 'normal', color: 'vermelho', spheres: 4 });
    expect(camelioCard(C.azul1)).toMatchObject({ kind: 'normal', color: 'azul', spheres: 1 });
    expect(camelioCard(C.azul2)).toMatchObject({ kind: 'normal', color: 'azul', spheres: 2 });
    expect(camelioCard(C.azul3)).toMatchObject({ kind: 'normal', color: 'azul', spheres: 3 });
    expect(camelioCard(C.bicVermelho2)).toMatchObject({ kind: 'bicolor', color: 'vermelho', spheres: 2, pair: ['laranja', 'vermelho'] });
    expect(camelioCard(59)).toMatchObject({ kind: 'bicolor', color: 'verde', spheres: 3, pair: ['azul', 'verde'] });
    expect(camelioCard(71)).toMatchObject({ kind: 'multi', color: 'azul', spheres: 2, pair: null });
  });

  it('carta desconhecida estoura', () => {
    expect(() => camelioCard(72)).toThrow();
    expect(() => camelioCard(-1)).toThrow();
  });
});

describe('verso da carta', () => {
  it('normal mostra só a cor', () => {
    expect(camelioBack(camelioCard(C.vermelho3))).toEqual({ kind: 'normal', color: 'vermelho' });
  });

  it('bicolor mostra as esferas e as duas cores', () => {
    expect(camelioBack(camelioCard(C.bicVermelho2))).toEqual({ kind: 'bicolor', spheres: 2, colors: ['laranja', 'vermelho'] });
  });

  it('multicolor mostra só as esferas', () => {
    expect(camelioBack(camelioCard(71))).toEqual({ kind: 'multi', spheres: 2 });
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `npm test -w shared -- camelio-deck`
Expected: FAIL (`Cannot find module '../src/games/camelio/deck'` ou parecido).

- [ ] **Step 5: Criar `shared/src/games/camelio/deck.ts`**

```ts
import { CAMELIO_COLORS, type CamelioBack, type CamelioCard, type CamelioColor } from './types';

const NORMAL_SPHERES = [1, 1, 2, 2, 3, 4] as const;
const MULTI_SPHERES = [1, 2] as const;

/**
 * Distribuição inventada (a oficial do Camelio não foi achada; spec §2.1): 6 cores,
 * 36 normais + 24 bicolores + 12 multicoloridas. A ordem é fixa: o id é a posição.
 */
function buildDeck(): CamelioCard[] {
  const cards: CamelioCard[] = [];
  const add = (card: Omit<CamelioCard, 'id'>) => cards.push({ id: cards.length, ...card });
  for (const color of CAMELIO_COLORS) {
    for (const spheres of NORMAL_SPHERES) add({ kind: 'normal', color, spheres, pair: null });
  }
  CAMELIO_COLORS.forEach((a, i) => {
    const b: CamelioColor = CAMELIO_COLORS[(i + 1) % CAMELIO_COLORS.length]!;
    const faces: [CamelioColor, number][] = [
      [a, 1],
      [a, 2],
      [b, 2],
      [b, 3],
    ];
    for (const [color, spheres] of faces) add({ kind: 'bicolor', color, spheres, pair: [a, b] });
  });
  for (const color of CAMELIO_COLORS) {
    for (const spheres of MULTI_SPHERES) add({ kind: 'multi', color, spheres, pair: null });
  }
  return cards;
}

export const CAMELIO_DECK: readonly CamelioCard[] = buildDeck();
export const CAMELIO_DECK_SIZE = CAMELIO_DECK.length;

export function camelioCard(id: number): CamelioCard {
  const card = CAMELIO_DECK[id];
  if (!card) throw new Error(`carta do Cama-Leão desconhecida: ${id}`);
  return card;
}

export const camelioCardIds = (): number[] => CAMELIO_DECK.map((c) => c.id);

/** O que aparece com a carta virada pra baixo. */
export function camelioBack(card: CamelioCard): CamelioBack {
  switch (card.kind) {
    case 'normal':
      return { kind: 'normal', color: card.color };
    case 'bicolor':
      return { kind: 'bicolor', spheres: card.spheres, colors: [...card.pair!] };
    case 'multi':
      return { kind: 'multi', spheres: card.spheres };
  }
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npm test -w shared -- camelio-deck`
Expected: PASS (todos os testes do arquivo).

- [ ] **Step 7: Commit**

```bash
git add shared/src/games/camelio/types.ts shared/src/games/camelio/deck.ts shared/test/camelio-helpers.ts shared/test/camelio-deck.test.ts
git commit -m "feat(shared): tipos e baralho de 72 cartas do Cama-Leão

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Contas de esferas e pontos

**Files:**
- Create: `shared/src/games/camelio/scoring.ts`
- Test: `shared/test/camelio-scoring.test.ts`

- [ ] **Step 1: Escrever o teste `shared/test/camelio-scoring.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import {
  camelioDeckEndWinners,
  camelioPoints,
  camelioScoredColors,
  camelioSpheresInPlay,
  camelioSphereSum,
  resolveCamelioPlay,
} from '../src/games/camelio/scoring';
import { C } from './camelio-helpers';

describe('somas', () => {
  it('soma as esferas de uma cor, pela cor de verdade', () => {
    expect(camelioSphereSum([C.vermelho3, C.azul1, C.bicVermelho2], 'vermelho')).toBe(5);
    expect(camelioSphereSum([C.vermelho3, C.azul1], 'azul')).toBe(1);
    expect(camelioSphereSum([], 'verde')).toBe(0);
  });

  it('pontos = cores distintas na área de pontos', () => {
    expect(camelioPoints([])).toBe(0);
    expect(camelioPoints([C.vermelho3, C.vermelho2, C.azul2, C.azul3])).toBe(2);
    expect(camelioScoredColors([C.vermelho3, C.vermelho2, C.azul2, C.azul3])).toEqual(['vermelho', 'azul']);
  });

  it('esferas em jogo não contam as cores já pontuadas', () => {
    expect(camelioSpheresInPlay([C.vermelho2b, C.azul1, C.azul3], [C.vermelho3, C.vermelho2])).toBe(4);
  });
});

describe('resolveCamelioPlay', () => {
  it('nada acontece abaixo de 5', () => {
    expect(resolveCamelioPlay([], [], C.vermelho3)).toEqual({
      table: [C.vermelho3],
      scored: [],
      discarded: [],
      outcome: 'none',
      sum: 3,
    });
  });

  it('5 exato numa cor nova fecha: as cartas da cor vão pra área de pontos', () => {
    expect(resolveCamelioPlay([C.vermelho3, C.azul1], [], C.vermelho2)).toEqual({
      table: [C.azul1],
      scored: [C.vermelho3, C.vermelho2],
      discarded: [],
      outcome: 'scored',
      sum: 5,
    });
  });

  it('bicolor e multicolor contam pela cor de verdade', () => {
    expect(resolveCamelioPlay([C.vermelho3], [], C.bicVermelho2).outcome).toBe('scored');
  });

  it('passou de 5 numa cor nova estoura: as cartas da cor vão pro descarte', () => {
    expect(resolveCamelioPlay([C.vermelho4, C.azul1], [], C.vermelho2)).toEqual({
      table: [C.azul1],
      scored: [],
      discarded: [C.vermelho4, C.vermelho2],
      outcome: 'bust',
      sum: 6,
    });
  });

  it('cor já pontuada chegando a 5 exato perde o ponto e descarta tudo dela', () => {
    expect(resolveCamelioPlay([C.vermelho1, C.azul1], [C.vermelho3, C.vermelho2, C.azul2, C.azul3], C.vermelho4)).toEqual({
      table: [C.azul1],
      scored: [C.azul2, C.azul3],
      discarded: [C.vermelho1, C.vermelho4, C.vermelho3, C.vermelho2],
      outcome: 'lost',
      sum: 5,
    });
  });

  it('cor já pontuada passando de 5 também perde o ponto', () => {
    const res = resolveCamelioPlay([C.vermelho2b], [C.vermelho3, C.vermelho2], C.vermelho4);
    expect(res.outcome).toBe('lost');
    expect(res.sum).toBe(6);
    expect(res.scored).toEqual([]);
    expect(res.table).toEqual([]);
  });

  it('cor já pontuada abaixo de 5 é segura', () => {
    expect(resolveCamelioPlay([], [C.vermelho3, C.vermelho2], C.vermelho2b)).toEqual({
      table: [C.vermelho2b],
      scored: [C.vermelho3, C.vermelho2],
      discarded: [],
      outcome: 'none',
      sum: 2,
    });
  });

  it('não muda os arrays recebidos', () => {
    const table = Object.freeze([C.vermelho4]) as number[];
    const scored = Object.freeze([]) as number[];
    expect(() => resolveCamelioPlay(table, scored, C.vermelho2)).not.toThrow();
  });
});

describe('vencedores no fim do monte', () => {
  const players = ['p0', 'p1', 'p2'];

  it('ganha quem tem mais pontos', () => {
    const scored = { p0: [C.vermelho3, C.vermelho2], p1: [], p2: [C.vermelho3, C.vermelho2, C.azul2, C.azul3] };
    expect(camelioDeckEndWinners(players, { p0: [], p1: [], p2: [] }, scored)).toEqual(['p2']);
  });

  it('empate em pontos: mais esferas em jogo', () => {
    const scored = { p0: [C.vermelho3, C.vermelho2], p1: [C.azul2, C.azul3], p2: [] };
    const table = { p0: [C.verde1], p1: [C.verde3], p2: [] };
    expect(camelioDeckEndWinners(players, table, scored)).toEqual(['p1']);
  });

  it('empate em tudo: vitória dividida', () => {
    const scored = { p0: [C.vermelho3, C.vermelho2], p1: [C.azul2, C.azul3], p2: [] };
    const table = { p0: [C.verde3], p1: [C.amarelo3], p2: [] };
    expect(camelioDeckEndWinners(players, table, scored)).toEqual(['p0', 'p1']);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -w shared -- camelio-scoring`
Expected: FAIL (`Cannot find module '../src/games/camelio/scoring'`).

- [ ] **Step 3: Criar `shared/src/games/camelio/scoring.ts`**

```ts
import { camelioCard } from './deck';
import { CAMELIO_EXACT, type CamelioColor, type CamelioOutcome } from './types';

/** Soma das esferas da cor `color` (pela cor de verdade, frente da carta). */
export function camelioSphereSum(ids: readonly number[], color: CamelioColor): number {
  return ids.reduce((n, id) => {
    const card = camelioCard(id);
    return card.color === color ? n + card.spheres : n;
  }, 0);
}

/** Cores com ponto, na ordem em que aparecem na área de pontos. */
export function camelioScoredColors(scored: readonly number[]): CamelioColor[] {
  return [...new Set(scored.map((id) => camelioCard(id).color))];
}

/** Pontos = cores distintas na área de pontos (no máximo 1 por cor). */
export const camelioPoints = (scored: readonly number[]): number => camelioScoredColors(scored).length;

/** Esferas na área de jogo, sem as cores já pontuadas (desempate no fim do monte). */
export function camelioSpheresInPlay(table: readonly number[], scored: readonly number[]): number {
  const done = camelioScoredColors(scored);
  return table.reduce((n, id) => {
    const card = camelioCard(id);
    return done.includes(card.color) ? n : n + card.spheres;
  }, 0);
}

export interface CamelioPlayResolution {
  table: number[];
  scored: number[];
  /** Cartas que saem da mesa pro descarte. */
  discarded: number[];
  outcome: CamelioOutcome;
  /** Esferas da cor na área de jogo logo depois da carta. */
  sum: number;
}

/**
 * Põe `cardId` na área de jogo e resolve só a cor dela (spec §2.3):
 * cor nova com 5 exato fecha; cor nova acima de 5 estoura; cor já pontuada chegando a 5 ou mais perde o ponto.
 */
export function resolveCamelioPlay(table: readonly number[], scored: readonly number[], cardId: number): CamelioPlayResolution {
  const { color } = camelioCard(cardId);
  const ofColor = (id: number) => camelioCard(id).color === color;
  const next = [...table, cardId];
  const sum = camelioSphereSum(next, color);
  const already = scored.some(ofColor);
  const rest = next.filter((id) => !ofColor(id));
  const same = next.filter(ofColor);
  if (already && sum >= CAMELIO_EXACT) {
    return { table: rest, scored: scored.filter((id) => !ofColor(id)), discarded: [...same, ...scored.filter(ofColor)], outcome: 'lost', sum };
  }
  if (!already && sum === CAMELIO_EXACT) {
    return { table: rest, scored: [...scored, ...same], discarded: [], outcome: 'scored', sum };
  }
  if (!already && sum > CAMELIO_EXACT) {
    return { table: rest, scored: [...scored], discarded: same, outcome: 'bust', sum };
  }
  return { table: next, scored: [...scored], discarded: [], outcome: 'none', sum };
}

/** Fim do monte: mais pontos; empate → mais esferas em jogo; empate → todos os empatados (vitória dividida). */
export function camelioDeckEndWinners(
  players: readonly string[],
  table: Readonly<Record<string, readonly number[]>>,
  scored: Readonly<Record<string, readonly number[]>>,
): string[] {
  const keyOf = (p: string): [number, number] => {
    const s = scored[p] ?? [];
    return [camelioPoints(s), camelioSpheresInPlay(table[p] ?? [], s)];
  };
  let best: string[] = [];
  let top: [number, number] | null = null;
  for (const p of players) {
    const key = keyOf(p);
    if (top === null || key[0] > top[0] || (key[0] === top[0] && key[1] > top[1])) {
      top = key;
      best = [p];
    } else if (key[0] === top[0] && key[1] === top[1]) {
      best.push(p);
    }
  }
  return best;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -w shared -- camelio-scoring`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/src/games/camelio/scoring.ts shared/test/camelio-scoring.test.ts
git commit -m "feat(shared): contas de esferas, pontos e estouro do Cama-Leão

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Regras — começar, voltar pro lobby, jogar de novo

**Files:**
- Create: `shared/src/games/camelio/rules.ts`
- Modify: `shared/test/camelio-helpers.ts`
- Test: `shared/test/camelio-rules.test.ts`

- [ ] **Step 1: Completar `shared/test/camelio-helpers.ts`**

Troque o arquivo inteiro por:

```ts
import type { ActionResult, GameContext } from '../src/game';
import { applyCamelioAction, initialCamelioState } from '../src/games/camelio/rules';
import type { CamelioAction, CamelioState } from '../src/games/camelio/types';
import { mulberry32 } from '../src/rng';

/** Cartas usadas nos testes (ids fixos do baralho, ver a tabela no plano C1 e `deck.ts`). */
export const C = {
  verde1: 0,
  verde2: 2,
  verde3: 4,
  amarelo2: 8,
  amarelo3: 10,
  vermelho1: 18,
  vermelho2: 20,
  vermelho2b: 21,
  vermelho3: 22,
  vermelho4: 23,
  azul1: 30,
  azul2: 32,
  azul3: 34,
  /** Bicolor laranja/vermelho, de verdade vermelho 2. */
  bicVermelho2: 46,
} as const;

export const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `p${i}`);

/** Contexto com `p0` como host por padrão. */
export function ctxOf(active: string[], seed = 1, hostId: string | null = 'p0'): GameContext {
  return { hostId, active, rng: mulberry32(seed), now: 0 };
}

export function must(res: ActionResult<CamelioState>): CamelioState {
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

export const act = (state: CamelioState, playerId: string, action: CamelioAction, ctx: GameContext): CamelioState =>
  must(applyCamelioAction(deepFreeze(state), playerId, action, ctx));

export const tryAct = (state: CamelioState, playerId: string, action: CamelioAction, ctx: GameContext): ActionResult<CamelioState> =>
  applyCamelioAction(deepFreeze(state), playerId, action, ctx);

/**
 * Partida no meio, montada à mão: `n` jogadores (p0…), `p0` na vez, mesas vazias,
 * monte `[verde1, verde2]` (topo = último) e aberta `azul1`. `over` troca qualquer campo.
 */
export function playing(n: number, over: Partial<CamelioState> = {}): CamelioState {
  const players = ids(n);
  return {
    ...initialCamelioState(),
    phase: 'playing',
    match: 1,
    players,
    table: Object.fromEntries(players.map((p) => [p, []])),
    scored: Object.fromEntries(players.map((p) => [p, []])),
    turn: 'p0',
    target: n === 2 ? 4 : 3,
    deck: [C.verde1, C.verde2],
    open: C.azul1,
    ...over,
  };
}

/** Todas as cartas da partida, de todos os lugares (pra conferir que nenhuma some nem duplica). */
export function allCards(state: CamelioState): number[] {
  return [
    ...state.deck,
    ...(state.open === null ? [] : [state.open]),
    ...state.discard,
    ...Object.values(state.table).flat(),
    ...Object.values(state.scored).flat(),
  ];
}
```

- [ ] **Step 2: Escrever o teste `shared/test/camelio-rules.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { applyCamelioAction, camelioTarget, initialCamelioState } from '../src/games/camelio/rules';
import { act, allCards, C, ctxOf, ids, playing, tryAct } from './camelio-helpers';

describe('estado inicial e meta', () => {
  it('começa no lobby, sem partida', () => {
    expect(initialCamelioState()).toMatchObject({ phase: 'lobby', players: [], match: 0, turn: null, winners: [], endReason: null });
  });

  it('meta: 4 cores com 2 jogadores, 3 com 3 a 6', () => {
    expect(camelioTarget(2)).toBe(4);
    expect(camelioTarget(3)).toBe(3);
    expect(camelioTarget(6)).toBe(3);
  });
});

describe('começar', () => {
  it('host começa com 3: monte de 71, uma aberta, mesas vazias, meta 3', () => {
    const s = act(initialCamelioState(), 'p0', { type: 'start' }, ctxOf(ids(3)));
    expect(s.phase).toBe('playing');
    expect(s.players).toEqual(['p0', 'p1', 'p2']);
    expect(s.deck).toHaveLength(71);
    expect(s.open).not.toBeNull();
    expect(new Set(allCards(s)).size).toBe(72);
    expect(s.table).toEqual({ p0: [], p1: [], p2: [] });
    expect(s.scored).toEqual({ p0: [], p1: [], p2: [] });
    expect(s.target).toBe(3);
    expect(s.players).toContain(s.turn);
    expect(s.match).toBe(1);
    expect(s.log).toEqual([]);
    expect(s.reshuffled).toBe(false);
  });

  it('com 2 jogadores a meta é 4', () => {
    expect(act(initialCamelioState(), 'p0', { type: 'start' }, ctxOf(ids(2))).target).toBe(4);
  });

  it('quem começa é sorteado', () => {
    const firsts = new Set<string | null>();
    for (let seed = 1; seed <= 20; seed++) firsts.add(act(initialCamelioState(), 'p0', { type: 'start' }, ctxOf(ids(3), seed)).turn);
    expect(firsts.size).toBeGreaterThan(1);
  });

  it('o monte vem embaralhado', () => {
    const a = act(initialCamelioState(), 'p0', { type: 'start' }, ctxOf(ids(3), 1));
    const b = act(initialCamelioState(), 'p0', { type: 'start' }, ctxOf(ids(3), 2));
    expect(a.deck).not.toEqual(b.deck);
  });

  it('recusa: só host, só no lobby, precisa de 2', () => {
    expect(tryAct(initialCamelioState(), 'p1', { type: 'start' }, ctxOf(ids(3)))).toEqual({ ok: false, error: 'not_host' });
    expect(tryAct(initialCamelioState(), 'p0', { type: 'start' }, ctxOf(['p0']))).toEqual({ ok: false, error: 'not_enough_players' });
    expect(tryAct(playing(3), 'p0', { type: 'start' }, ctxOf(ids(3)))).toEqual({ ok: false, error: 'bad_phase' });
  });

  it('ação desconhecida é recusada', () => {
    const res = applyCamelioAction(initialCamelioState(), 'p0', { type: 'xyz' } as never, ctxOf(ids(3)));
    expect(res).toEqual({ ok: false, error: 'bad_action' });
  });
});

describe('voltar pro lobby', () => {
  it('host volta pro lobby de qualquer fase de jogo, mantendo o número da partida', () => {
    const s = act(playing(3, { match: 2 }), 'p0', { type: 'lobby' }, ctxOf(ids(3)));
    expect(s).toEqual({ ...initialCamelioState(), match: 2 });
  });

  it('recusa: só host, e não no lobby', () => {
    expect(tryAct(playing(3), 'p1', { type: 'lobby' }, ctxOf(ids(3)))).toEqual({ ok: false, error: 'not_host' });
    expect(tryAct(initialCamelioState(), 'p0', { type: 'lobby' }, ctxOf(ids(3)))).toEqual({ ok: false, error: 'bad_phase' });
  });
});

describe('jogar de novo', () => {
  const over = (scored: Record<string, number[]>, table: Record<string, number[]>, winners: string[]) =>
    playing(3, { phase: 'over', turn: null, winners, endReason: 'target', scored, table });

  it('partida nova com quem está ativo; começa quem ficou em último', () => {
    const prev = over(
      { p0: [C.vermelho3, C.vermelho2], p1: [C.azul2, C.azul3], p2: [] },
      { p0: [], p1: [], p2: [C.amarelo3] },
      ['p1'],
    );
    const s = act(prev, 'p0', { type: 'again' }, ctxOf(ids(3)));
    expect(s.phase).toBe('playing');
    expect(s.match).toBe(2);
    expect(s.turn).toBe('p2');
    expect(s.deck).toHaveLength(71);
    expect(s.table).toEqual({ p0: [], p1: [], p2: [] });
    expect(s.winners).toEqual([]);
    expect(s.endReason).toBeNull();
  });

  it('empate em pontos: começa quem tem menos esferas na mesa', () => {
    const prev = over({ p0: [], p1: [C.azul2, C.azul3], p2: [] }, { p0: [], p1: [], p2: [C.amarelo3] }, ['p1']);
    expect(act(prev, 'p0', { type: 'again' }, ctxOf(ids(3))).turn).toBe('p0');
  });

  it('empate em tudo: o primeiro depois do vencedor, na ordem dos assentos', () => {
    const prev = over({ p0: [], p1: [C.azul2, C.azul3], p2: [] }, { p0: [], p1: [], p2: [] }, ['p1']);
    expect(act(prev, 'p0', { type: 'again' }, ctxOf(ids(3))).turn).toBe('p2');
  });

  it('quem não está mais aqui não começa', () => {
    const prev = over({ p0: [C.vermelho3, C.vermelho2], p1: [C.azul2, C.azul3], p2: [] }, { p0: [], p1: [], p2: [] }, ['p1']);
    const s = act(prev, 'p0', { type: 'again' }, ctxOf(['p0', 'p1']));
    expect(s.players).toEqual(['p0', 'p1']);
    expect(s.turn).toBe('p0');
    expect(s.target).toBe(4);
  });

  it('recusa: só host, só no fim', () => {
    expect(tryAct(playing(3), 'p0', { type: 'again' }, ctxOf(ids(3)))).toEqual({ ok: false, error: 'bad_phase' });
    const prev = over({ p0: [], p1: [], p2: [] }, { p0: [], p1: [], p2: [] }, ['p1']);
    expect(tryAct(prev, 'p1', { type: 'again' }, ctxOf(ids(3)))).toEqual({ ok: false, error: 'not_host' });
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm test -w shared -- camelio-rules`
Expected: FAIL (`Cannot find module '../src/games/camelio/rules'`).

- [ ] **Step 4: Criar `shared/src/games/camelio/rules.ts`**

O `play` entra na Task 4; aqui ele só recusa com `bad_action`, pra o `switch` já ficar completo.

```ts
import type { ActionResult, GameContext } from '../../game';
import { randomInt, shuffle } from '../../rng';
import { camelioCardIds } from './deck';
import { camelioPoints, camelioSpheresInPlay } from './scoring';
import { CAMELIO_MIN_PLAYERS, type CamelioAction, type CamelioState } from './types';

const fail = (error: string): ActionResult<CamelioState> => ({ ok: false, error });
const ok = (state: CamelioState): ActionResult<CamelioState> => ({ ok: true, state });

/** Meta: pontos em 4 cores com 2 jogadores, 3 com 3 a 6. */
export const camelioTarget = (players: number): number => (players === 2 ? 4 : 3);

export function initialCamelioState(): CamelioState {
  return {
    phase: 'lobby',
    players: [],
    deck: [],
    open: null,
    discard: [],
    reshuffled: false,
    table: {},
    scored: {},
    turn: null,
    target: 3,
    paused: false,
    log: [],
    winners: [],
    endReason: null,
    match: 0,
  };
}

/** `players` girado pra começar logo depois de `after` (ou do começo, se `after` não estiver lá). */
function rotateAfter(players: readonly string[], after: string | null): string[] {
  const start = after === null ? 0 : players.indexOf(after) + 1;
  return [...players.slice(start), ...players.slice(0, start)];
}

/**
 * "Jogar de novo": começa quem ficou em último na partida anterior (menos pontos, depois menos esferas em jogo),
 * procurando a partir de quem vem depois do (primeiro) vencedor. Quem chegou agora não jogou a anterior e conta como zero.
 */
function loserOf(prev: CamelioState, players: readonly string[]): string {
  const order = [
    ...rotateAfter(prev.players, prev.winners[0] ?? null).filter((p) => players.includes(p)),
    ...players.filter((p) => !prev.players.includes(p)),
  ];
  const keyOf = (p: string): [number, number] => {
    const scored = prev.scored[p] ?? [];
    return [camelioPoints(scored), camelioSpheresInPlay(prev.table[p] ?? [], scored)];
  };
  let pick = order[0]!;
  for (const p of order) {
    const [pts, sph] = keyOf(p);
    const [bestPts, bestSph] = keyOf(pick);
    if (pts < bestPts || (pts === bestPts && sph < bestSph)) pick = p;
  }
  return pick;
}

/** Partida nova com os ativos (também usada em "jogar de novo"). */
function startMatch(state: CamelioState, ctx: GameContext, again: boolean): ActionResult<CamelioState> {
  if (ctx.active.length < CAMELIO_MIN_PLAYERS) return fail('not_enough_players');
  const players = [...ctx.active];
  const deck = shuffle(ctx.rng, camelioCardIds());
  const open = deck.pop()!;
  const turn = again ? loserOf(state, players) : players[randomInt(ctx.rng, players.length)]!;
  return ok({
    ...initialCamelioState(),
    phase: 'playing',
    match: state.match + 1,
    players,
    deck,
    open,
    table: Object.fromEntries(players.map((p) => [p, []])),
    scored: Object.fromEntries(players.map((p) => [p, []])),
    turn,
    target: camelioTarget(players.length),
  });
}

export function applyCamelioAction(
  state: CamelioState,
  playerId: string,
  action: CamelioAction,
  ctx: GameContext,
): ActionResult<CamelioState> {
  const isHost = ctx.hostId === playerId;
  switch (action.type) {
    case 'start':
      if (!isHost) return fail('not_host');
      if (state.phase !== 'lobby') return fail('bad_phase');
      return startMatch(state, ctx, false);
    case 'again':
      if (!isHost) return fail('not_host');
      if (state.phase !== 'over') return fail('bad_phase');
      return startMatch(state, ctx, true);
    case 'lobby':
      if (!isHost) return fail('not_host');
      if (state.phase === 'lobby') return fail('bad_phase');
      return ok({ ...initialCamelioState(), match: state.match });
    default:
      return fail('bad_action');
  }
}
```

Atenção à ordem no teste `recusa: só host, só no fim`: `again` de `p0` (host) numa partida em andamento dá `bad_phase`; `again` de `p1` (não host) no fim dá `not_host`. O código acima confere host antes da fase, então `p0` + `playing` → `bad_phase` e `p1` + `over` → `not_host`. Confere.

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test -w shared -- camelio`
Expected: PASS (deck, scoring e rules).

- [ ] **Step 6: Commit**

```bash
git add shared/src/games/camelio/rules.ts shared/test/camelio-helpers.ts shared/test/camelio-rules.test.ts
git commit -m "feat(shared): Cama-Leão começa, volta pro lobby e joga de novo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Regras — a jogada

**Files:**
- Modify: `shared/src/games/camelio/rules.ts`
- Test: `shared/test/camelio-rules.test.ts` (acrescentar)

- [ ] **Step 1: Acrescentar ao fim de `shared/test/camelio-rules.test.ts`**

Acrescente também `camelioCard` aos imports do topo do arquivo:

```ts
import { camelioCard } from '../src/games/camelio/deck';
```

E, no fim do arquivo:

```ts
describe('jogar', () => {
  const ctx3 = ctxOf(ids(3));

  it('pegar a aberta e ficar com ela: a do topo do monte vira a nova aberta, a vez passa', () => {
    const s = act(playing(3, { open: C.vermelho3, deck: [C.verde1, C.azul1] }), 'p0', { type: 'play', from: 'open', to: 'p0' }, ctx3);
    expect(s.table.p0).toEqual([C.vermelho3]);
    expect(s.open).toBe(C.azul1);
    expect(s.deck).toEqual([C.verde1]);
    expect(s.turn).toBe('p1');
    expect(s.log).toEqual([{ by: 'p0', from: 'open', to: 'p0', card: C.vermelho3, outcome: 'none', color: 'vermelho', sum: 3 }]);
  });

  it('pegar do monte e dar pra alguém: a aberta fica', () => {
    const s = act(playing(3, { open: C.vermelho3, deck: [C.verde1, C.azul1] }), 'p0', { type: 'play', from: 'deck', to: 'p2' }, ctx3);
    expect(s.table.p2).toEqual([C.azul1]);
    expect(s.table.p0).toEqual([]);
    expect(s.open).toBe(C.vermelho3);
    expect(s.deck).toEqual([C.verde1]);
    expect(s.turn).toBe('p1');
    expect(s.log[0]).toMatchObject({ by: 'p0', from: 'deck', to: 'p2', card: C.azul1 });
  });

  it('fechar 5 guarda as cartas na área de pontos', () => {
    const s = act(
      playing(3, { table: { p0: [], p1: [C.vermelho3], p2: [] }, open: C.vermelho2 }),
      'p0',
      { type: 'play', from: 'open', to: 'p1' },
      ctx3,
    );
    expect(s.table.p1).toEqual([]);
    expect(s.scored.p1).toEqual([C.vermelho3, C.vermelho2]);
    expect(s.log[0]!.outcome).toBe('scored');
    expect(s.phase).toBe('playing');
  });

  it('estourar manda as cartas da cor pro descarte', () => {
    const s = act(
      playing(3, { table: { p0: [C.vermelho4], p1: [], p2: [] }, open: C.vermelho2 }),
      'p0',
      { type: 'play', from: 'open', to: 'p0' },
      ctx3,
    );
    expect(s.table.p0).toEqual([]);
    expect(s.discard).toEqual([C.vermelho4, C.vermelho2]);
    expect(s.log[0]!.outcome).toBe('bust');
  });

  it('a vez pula quem não está ativo', () => {
    const s = act(playing(3), 'p0', { type: 'play', from: 'open', to: 'p0' }, ctxOf(['p0', 'p2']));
    expect(s.turn).toBe('p2');
  });

  it('chegar à meta acaba na hora, mesmo sendo quem recebeu', () => {
    const s = act(
      playing(3, {
        scored: { p0: [], p1: [C.vermelho3, C.vermelho2, C.azul2, C.azul3], p2: [] },
        table: { p0: [], p1: [C.verde3], p2: [] },
        open: C.verde2,
      }),
      'p0',
      { type: 'play', from: 'open', to: 'p1' },
      ctx3,
    );
    expect(s).toMatchObject({ phase: 'over', winners: ['p1'], endReason: 'target', turn: null });
  });

  it('com 2 jogadores, 3 cores não bastam; 4 ganham', () => {
    const three = playing(2, {
      scored: { p0: [C.vermelho3, C.vermelho2, C.azul2, C.azul3], p1: [] },
      table: { p0: [C.verde3], p1: [] },
      open: C.verde2,
    });
    expect(act(three, 'p0', { type: 'play', from: 'open', to: 'p0' }, ctxOf(ids(2))).phase).toBe('playing');
    const four = playing(2, {
      scored: { p0: [C.vermelho3, C.vermelho2, C.azul2, C.azul3, C.amarelo2, C.amarelo3], p1: [] },
      table: { p0: [C.verde3], p1: [] },
      open: C.verde2,
    });
    expect(act(four, 'p0', { type: 'play', from: 'open', to: 'p0' }, ctxOf(ids(2)))).toMatchObject({
      phase: 'over',
      winners: ['p0'],
      endReason: 'target',
    });
  });

  it('monte vazio: o descarte vira monte uma vez', () => {
    const s = act(
      playing(3, { open: C.vermelho3, deck: [C.azul1], discard: [C.verde1, C.verde2] }),
      'p0',
      { type: 'play', from: 'deck', to: 'p0' },
      ctx3,
    );
    expect([...s.deck].sort((a, b) => a - b)).toEqual([C.verde1, C.verde2]);
    expect(s.discard).toEqual([]);
    expect(s.reshuffled).toBe(true);
    expect(s.open).toBe(C.vermelho3);
    expect(s.phase).toBe('playing');
  });

  it('pegar a aberta com 1 carta no monte: ela vira a aberta e o descarte vira monte', () => {
    const s = act(
      playing(3, { open: C.vermelho3, deck: [C.azul1], discard: [C.verde1] }),
      'p0',
      { type: 'play', from: 'open', to: 'p0' },
      ctx3,
    );
    expect(s.open).toBe(C.azul1);
    expect(s.deck).toEqual([C.verde1]);
    expect(s.reshuffled).toBe(true);
  });

  it('monte acaba de novo: fim por monte, ganha quem tem mais pontos', () => {
    const s = act(
      playing(3, {
        open: C.vermelho3,
        deck: [C.azul1],
        discard: [C.verde1],
        reshuffled: true,
        scored: { p0: [], p1: [C.amarelo2, C.amarelo3], p2: [] },
      }),
      'p0',
      { type: 'play', from: 'deck', to: 'p0' },
      ctx3,
    );
    expect(s).toMatchObject({ phase: 'over', endReason: 'deck', winners: ['p1'], turn: null });
  });

  it('monte acaba sem descarte nenhum: fim por monte já na primeira vez', () => {
    const s = act(playing(3, { open: C.vermelho3, deck: [C.azul1], discard: [] }), 'p0', { type: 'play', from: 'deck', to: 'p0' }, ctx3);
    expect(s).toMatchObject({ phase: 'over', endReason: 'deck', winners: ['p0'] });
  });

  it('meta vem antes do fim do monte', () => {
    const s = act(
      playing(3, {
        scored: { p0: [C.vermelho3, C.vermelho2, C.azul2, C.azul3], p1: [], p2: [] },
        table: { p0: [C.verde3], p1: [], p2: [] },
        open: C.vermelho1,
        deck: [C.verde2],
        reshuffled: true,
      }),
      'p0',
      { type: 'play', from: 'deck', to: 'p0' },
      ctx3,
    );
    expect(s).toMatchObject({ phase: 'over', endReason: 'target', winners: ['p0'] });
  });

  it('recusas', () => {
    expect(tryAct(playing(3), 'p1', { type: 'play', from: 'open', to: 'p1' }, ctx3)).toEqual({ ok: false, error: 'not_your_turn' });
    expect(tryAct(playing(3), 'p0', { type: 'play', from: 'open', to: 'p9' }, ctx3)).toEqual({ ok: false, error: 'bad_target' });
    expect(tryAct(playing(3), 'p0', { type: 'play', from: 'open', to: 'p2' }, ctxOf(['p0', 'p1']))).toEqual({ ok: false, error: 'bad_target' });
    expect(tryAct(initialCamelioState(), 'p0', { type: 'play', from: 'open', to: 'p0' }, ctx3)).toEqual({ ok: false, error: 'not_playing' });
    expect(tryAct(playing(3, { paused: true }), 'p0', { type: 'play', from: 'open', to: 'p0' }, ctx3)).toEqual({ ok: false, error: 'not_playing' });
    const over = playing(3, { phase: 'over', turn: null, winners: ['p0'], endReason: 'target' });
    expect(tryAct(over, 'p0', { type: 'play', from: 'open', to: 'p0' }, ctx3)).toEqual({ ok: false, error: 'not_playing' });
  });
});

describe('partida inteira (simulação)', () => {
  it('nenhuma carta some nem duplica e a partida sempre termina', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const ctx = ctxOf(ids(4), seed);
      let s = act(initialCamelioState(), 'p0', { type: 'start' }, ctx);
      let steps = 0;
      while (s.phase === 'playing') {
        const from = ctx.rng() < 0.5 ? 'open' : 'deck';
        const to = s.players[Math.floor(ctx.rng() * s.players.length)]!;
        s = act(s, s.turn!, { type: 'play', from, to }, ctx);
        const cards = allCards(s);
        expect(cards).toHaveLength(72);
        expect(new Set(cards).size).toBe(72);
        steps++;
        expect(steps).toBeLessThan(150);
      }
      expect(s.phase).toBe('over');
      expect(s.winners.length).toBeGreaterThan(0);
      for (const entry of s.log) expect(entry.color).toBe(camelioCard(entry.card).color);
    }
  });
});
```

(`allCards` conta 72 só se a aberta não sumir: quando o monte acaba com a carta aberta na mesa, ela continua em `open`, então a conta fecha.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -w shared -- camelio-rules`
Expected: FAIL nos testes de `jogar` e `simulação` (`ação recusada: bad_action`).

- [ ] **Step 3: Implementar a jogada em `shared/src/games/camelio/rules.ts`**

Troque os imports do topo por:

```ts
import type { ActionResult, GameContext } from '../../game';
import { randomInt, shuffle } from '../../rng';
import { camelioCard, camelioCardIds } from './deck';
import { camelioDeckEndWinners, camelioPoints, camelioSpheresInPlay, resolveCamelioPlay } from './scoring';
import { CAMELIO_MIN_PLAYERS, type CamelioAction, type CamelioFrom, type CamelioPlay, type CamelioState } from './types';
```

Logo depois de `rotateAfter`, acrescente:

```ts
/** Próximo jogador da partida depois de `after` que está ativo (pode ser o próprio `after`, se só ele estiver). */
function nextActive(players: readonly string[], active: readonly string[], after: string): string | null {
  return rotateAfter(players, after).find((p) => active.includes(p)) ?? null;
}
```

Antes de `applyCamelioAction`, acrescente:

```ts
/** Uma vez (spec §2.3): pega a carta, põe na mesa de `to`, resolve, repõe a aberta, confere meta e monte, passa a vez. */
function play(state: CamelioState, playerId: string, from: CamelioFrom, to: string, ctx: GameContext): ActionResult<CamelioState> {
  if (state.phase !== 'playing' || state.paused) return fail('not_playing');
  if (state.turn !== playerId) return fail('not_your_turn');
  if (!state.players.includes(to) || !ctx.active.includes(to)) return fail('bad_target');

  const deck = [...state.deck];
  let open = state.open;
  let card: number;
  if (from === 'open') {
    if (open === null) return fail('not_playing');
    card = open;
    open = deck.pop() ?? null;
  } else {
    const top = deck.pop();
    if (top === undefined) return fail('not_playing');
    card = top;
  }

  const res = resolveCamelioPlay(state.table[to] ?? [], state.scored[to] ?? [], card);
  const entry: CamelioPlay = { by: playerId, from, to, card, outcome: res.outcome, color: camelioCard(card).color, sum: res.sum };
  let next: CamelioState = {
    ...state,
    deck,
    open,
    discard: [...state.discard, ...res.discarded],
    table: { ...state.table, [to]: res.table },
    scored: { ...state.scored, [to]: res.scored },
    log: [...state.log, entry],
  };

  if (camelioPoints(res.scored) >= state.target) {
    return ok({ ...next, phase: 'over', turn: null, winners: [to], endReason: 'target' });
  }
  if (next.deck.length === 0) {
    if (!next.reshuffled && next.discard.length > 0) {
      next = { ...next, deck: shuffle(ctx.rng, next.discard), discard: [], reshuffled: true };
    } else {
      return ok({
        ...next,
        phase: 'over',
        turn: null,
        winners: camelioDeckEndWinners(next.players, next.table, next.scored),
        endReason: 'deck',
      });
    }
  }
  return ok({ ...next, turn: nextActive(next.players, ctx.active, playerId) });
}
```

No `switch` de `applyCamelioAction`, antes do `default`, acrescente:

```ts
    case 'play':
      return play(state, playerId, action.from, action.to, ctx);
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -w shared -- camelio`
Expected: PASS (deck, scoring e rules, inclusive a simulação).

- [ ] **Step 5: Commit**

```bash
git add shared/src/games/camelio/rules.ts shared/test/camelio-rules.test.ts
git commit -m "feat(shared): a jogada do Cama-Leão (fechar, estourar, monte e meta)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Regras — presença

**Files:**
- Modify: `shared/src/games/camelio/rules.ts`
- Test: `shared/test/camelio-presence.test.ts`

- [ ] **Step 1: Escrever o teste `shared/test/camelio-presence.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { camelioOnPresenceChange, initialCamelioState } from '../src/games/camelio/rules';
import { ctxOf, deepFreeze, ids, playing } from './camelio-helpers';

const presence = (state: Parameters<typeof camelioOnPresenceChange>[0], active: string[]) =>
  camelioOnPresenceChange(deepFreeze(state), ctxOf(active));

describe('presença no Cama-Leão', () => {
  it('nada mudou: devolve o mesmo objeto', () => {
    const s = playing(3);
    expect(presence(s, ids(3))).toBe(s);
  });

  it('lobby e fim de jogo não mudam', () => {
    const lobby = initialCamelioState();
    expect(presence(lobby, [])).toBe(lobby);
    const over = playing(3, { phase: 'over', turn: null, winners: ['p0'], endReason: 'target' });
    expect(presence(over, ['p0'])).toBe(over);
  });

  it('quem estava na vez saiu: a vez passa pro próximo ativo', () => {
    expect(presence(playing(3), ['p1', 'p2'])).toMatchObject({ turn: 'p1', paused: false });
    expect(presence(playing(3), ['p2'])).toMatchObject({ turn: 'p0', paused: true });
  });

  it('saiu quem não estava na vez: só a mesa dele fica apagada (nada muda nas regras)', () => {
    const s = playing(3);
    expect(presence(s, ['p0', 'p1'])).toBe(s);
  });

  it('menos de 2 ativos pausa; voltando gente, despausa', () => {
    const paused = presence(playing(3), ['p0']);
    expect(paused).toMatchObject({ paused: true, turn: 'p0' });
    expect(presence(paused, ['p0', 'p1'])).toMatchObject({ paused: false, turn: 'p0' });
  });

  it('despausa sem quem estava na vez: a vez passa', () => {
    const paused = presence(playing(3), ['p1']);
    expect(paused).toMatchObject({ paused: true, turn: 'p0' });
    expect(presence(paused, ['p1', 'p2'])).toMatchObject({ paused: false, turn: 'p1' });
  });

  it('quem entra no meio não entra na partida', () => {
    const s = playing(3);
    expect(presence(s, ['p0', 'p1', 'p2', 'p3'])).toBe(s);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -w shared -- camelio-presence`
Expected: FAIL (`camelioOnPresenceChange` não é exportado).

- [ ] **Step 3: Acrescentar ao fim de `shared/src/games/camelio/rules.ts`**

```ts
/**
 * Reavaliado quando alguém entra, sai ou expira a tolerância de desconexão (spec §2.5).
 * Devolve o MESMO objeto quando nada muda (o servidor compara referência).
 */
export function camelioOnPresenceChange(state: CamelioState, ctx: GameContext): CamelioState {
  if (state.phase !== 'playing') return state;
  const here = state.players.filter((p) => ctx.active.includes(p));
  const paused = here.length < CAMELIO_MIN_PLAYERS;
  const turn =
    !paused && state.turn !== null && !ctx.active.includes(state.turn)
      ? nextActive(state.players, ctx.active, state.turn)
      : state.turn;
  if (paused === state.paused && turn === state.turn) return state;
  return { ...state, paused, turn };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -w shared -- camelio`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/src/games/camelio/rules.ts shared/test/camelio-presence.test.ts
git commit -m "feat(shared): presença no Cama-Leão (pula a vez e pausa com menos de 2)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Visão, módulo e schema

**Files:**
- Create: `shared/src/games/camelio/view.ts`
- Create: `shared/src/games/camelio/schema.ts`
- Test: `shared/test/camelio-view.test.ts`

- [ ] **Step 1: Escrever o teste `shared/test/camelio-view.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { camelioCard } from '../src/games/camelio/deck';
import { initialCamelioState } from '../src/games/camelio/rules';
import { camelioActionSchema } from '../src/games/camelio/schema';
import { camelio, camelioViewFor } from '../src/games/camelio/view';
import { act, C, ctxOf, ids, playing } from './camelio-helpers';

describe('visão do Cama-Leão', () => {
  it('o topo do monte só mostra o verso', () => {
    const v = camelioViewFor(playing(3, { deck: [C.verde1, C.vermelho3], open: C.azul1 }), 'p1');
    expect(v.top).toEqual({ kind: 'normal', color: 'vermelho' });
    expect(v.deckCount).toBe(2);
    expect(v.open).toEqual(camelioCard(C.azul1));
  });

  it('a frente do topo e a ordem do monte nunca saem', () => {
    const s = act(initialCamelioState(), 'p0', { type: 'start' }, ctxOf(ids(3)));
    const v = camelioViewFor(s, 'p0');
    expect(v).not.toHaveProperty('deck');
    expect(v).not.toHaveProperty('discard');
    expect(v.top).not.toHaveProperty('id');
    const topCard = camelioCard(s.deck[s.deck.length - 1]!);
    if (topCard.kind !== 'normal') expect(JSON.stringify(v.top)).not.toContain(`"color":"${topCard.color}"`);
  });

  it('mesas e pontos abertos pra todo mundo, com as cartas inteiras', () => {
    const s = playing(3, {
      table: { p0: [C.vermelho3], p1: [], p2: [C.azul1] },
      scored: { p0: [], p1: [C.amarelo2, C.amarelo3], p2: [] },
    });
    for (const viewer of ['p0', 'p1', null]) {
      const v = camelioViewFor(s, viewer);
      expect(v.table.p0).toEqual([camelioCard(C.vermelho3)]);
      expect(v.table.p2).toEqual([camelioCard(C.azul1)]);
      expect(v.scored.p1).toEqual([camelioCard(C.amarelo2), camelioCard(C.amarelo3)]);
      expect(v.points).toEqual({ p0: 0, p1: 1, p2: 0 });
    }
  });

  it('última jogada e contagem de jogadas', () => {
    const s0 = playing(3);
    expect(camelioViewFor(s0, 'p0')).toMatchObject({ last: null, playCount: 0 });
    const s1 = act(s0, 'p0', { type: 'play', from: 'open', to: 'p1' }, ctxOf(ids(3)));
    expect(camelioViewFor(s1, 'p0')).toMatchObject({ last: { by: 'p0', to: 'p1', from: 'open', card: C.azul1 }, playCount: 1 });
  });

  it('monte vazio no fim: sem topo', () => {
    const s = playing(3, { phase: 'over', deck: [], turn: null, winners: ['p0'], endReason: 'deck' });
    expect(camelioViewFor(s, 'p0')).toMatchObject({ top: null, deckCount: 0, winners: ['p0'], endReason: 'deck' });
  });

  it('o módulo junta as peças', () => {
    expect(camelio.id).toBe('camelio');
    expect(camelio.initialState()).toEqual(initialCamelioState());
  });
});

describe('schema das ações do Cama-Leão', () => {
  it('aceita as ações certas', () => {
    for (const a of [{ type: 'start' }, { type: 'again' }, { type: 'lobby' }, { type: 'play', from: 'open', to: 'p1' }, { type: 'play', from: 'deck', to: 'p0' }]) {
      expect(camelioActionSchema.safeParse(a).success).toBe(true);
    }
  });

  it('recusa as erradas', () => {
    for (const a of [
      { type: 'play', from: 'mao', to: 'p1' },
      { type: 'play', from: 'open', to: '' },
      { type: 'play', from: 'open' },
      { type: 'play', to: 'p1' },
      { type: 'tell' },
    ]) {
      expect(camelioActionSchema.safeParse(a).success).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -w shared -- camelio-view`
Expected: FAIL (`Cannot find module '../src/games/camelio/view'`).

- [ ] **Step 3: Criar `shared/src/games/camelio/view.ts`**

```ts
import type { GameModule } from '../../game';
import { camelioBack, camelioCard } from './deck';
import { applyCamelioAction, camelioOnPresenceChange, initialCamelioState } from './rules';
import { camelioPoints } from './scoring';
import type { CamelioAction, CamelioCard, CamelioState, CamelioView } from './types';

const cardsOf = (ids: readonly number[]): CamelioCard[] => ids.map(camelioCard);

const mapRecord = <T>(record: Record<string, number[]>, fn: (ids: number[]) => T): Record<string, T> =>
  Object.fromEntries(Object.entries(record).map(([p, ids]) => [p, fn(ids)]));

/**
 * Única fronteira de segredo do Cama-Leão: o topo do monte sai só como verso.
 * Ids e ordem do monte e do descarte nunca saem (o id do topo entregaria a frente, porque o baralho é público).
 * Todo o resto é aberto, igual pra todo mundo.
 */
export function camelioViewFor(state: CamelioState, _viewerId: string | null): CamelioView {
  const topId = state.deck[state.deck.length - 1];
  return {
    phase: state.phase,
    players: state.players,
    target: state.target,
    turn: state.turn,
    paused: state.paused,
    match: state.match,
    open: state.open === null ? null : camelioCard(state.open),
    top: topId === undefined ? null : camelioBack(camelioCard(topId)),
    deckCount: state.deck.length,
    discardCount: state.discard.length,
    reshuffled: state.reshuffled,
    table: mapRecord(state.table, cardsOf),
    scored: mapRecord(state.scored, cardsOf),
    points: mapRecord(state.scored, camelioPoints),
    last: state.log[state.log.length - 1] ?? null,
    playCount: state.log.length,
    winners: state.winners,
    endReason: state.endReason,
  };
}

export const camelio: GameModule<CamelioState, CamelioAction, CamelioView> = {
  id: 'camelio',
  initialState: () => initialCamelioState(),
  applyAction: applyCamelioAction,
  viewFor: camelioViewFor,
  onPresenceChange: camelioOnPresenceChange,
};
```

- [ ] **Step 4: Criar `shared/src/games/camelio/schema.ts`**

```ts
import { z } from 'zod';
import type { CamelioAction } from './types';

export const camelioActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start') }),
  z.object({ type: z.literal('play'), from: z.enum(['open', 'deck']), to: z.string().min(1).max(64) }),
  z.object({ type: z.literal('again') }),
  z.object({ type: z.literal('lobby') }),
]);

/** Falha a compilação se o schema divergir do tipo CamelioAction. */
type Assert<T extends true> = T;
export type CamelioActionSchemaMatches = Assert<z.infer<typeof camelioActionSchema> extends CamelioAction ? true : false>;
export type CamelioActionTypeCovered = Assert<CamelioAction extends z.infer<typeof camelioActionSchema> ? true : false>;
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test -w shared -- camelio`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add shared/src/games/camelio/view.ts shared/src/games/camelio/schema.ts shared/test/camelio-view.test.ts
git commit -m "feat(shared): visão (só o verso do topo) e schema das ações do Cama-Leão

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Registro, sala, erros e os `switch` por jogo

Colocar `camelio` em `GAME_IDS` quebra a compilação de todo `switch` exaustivo por jogo. Esta task faz tudo junto e só termina com o `npm run typecheck` verde.

**Files:**
- Modify: `shared/src/games/registry.ts`
- Modify: `shared/src/protocol.ts`
- Modify: `shared/src/room.ts`
- Modify: `shared/src/history.ts`
- Modify: `shared/src/index.ts`
- Modify: `server/src/index.ts`
- Modify: `web/src/screens/GamePage.tsx`
- Modify: `web/src/games/catalog.ts`
- Test: `shared/test/room-games.test.ts`

- [ ] **Step 1: Escrever os testes em `shared/test/room-games.test.ts`**

Troque o teste `conhece ITO, Dixit e Retratim` por:

```ts
  it('conhece ITO, Dixit, Retratim e Cama-Leão', () => {
    expect(Object.keys(GAMES)).toEqual(['ito', 'dixit', 'pictures', 'camelio']);
    expect(GAMES.dixit.minPlayers).toBe(3);
    expect(GAMES.ito.liveCursors).toBe(true);
    expect(GAMES.dixit.liveCursors).toBe(false);
    expect(GAMES.pictures).toMatchObject({ minPlayers: 3, maxPlayers: 6, liveCursors: false, recordsHistory: false });
    expect(GAMES.camelio).toMatchObject({ minPlayers: 2, maxPlayers: 6, liveCursors: true, recordsHistory: false });
    expect(isGameId('dixit')).toBe(true);
    expect(isGameId('pictures')).toBe(true);
    expect(isGameId('camelio')).toBe(true);
    expect(isGameId('xadrez')).toBe(false);
    expect(isGameId(undefined)).toBe(false);
  });
```

Acrescente `isCamelioRoomView` à lista de imports de `'../src/room'` e, no fim do arquivo:

```ts
function camelioRoom(n: number): Room {
  let room = createRoom('ABCD', 0, 'camelio');
  for (let i = 0; i < n; i++) {
    const res = joinRoom(room, { token: `t${i}`, name: `P${i}`, color: PLAYER_COLORS[i]! }, `p${i}`, 0);
    if (!res.ok) throw new Error(res.error);
    room = res.room;
  }
  return room;
}

describe('sala de Cama-Leão', () => {
  it('é de Cama-Leão, cabe 6 e recusa o 7º', () => {
    const room = camelioRoom(6);
    expect(isCamelioRoomView(roomView(room, null))).toBe(true);
    expect(roomSummary(room)).toMatchObject({ game: 'camelio', phase: 'lobby' });
    expect(joinRoom(room, { token: 't6', name: 'P6', color: PLAYER_COLORS[6]! }, 'p6', 0)).toEqual({ ok: false, error: 'room_full' });
  });

  it('começa com 2 pela sala e a jogada passa pelo schema', () => {
    let room = step(camelioRoom(2), 'p0', { type: 'start' }, 10);
    expect(room.game.phase).toBe('playing');
    expect(room.runStartedAt).toBe(10);
    expect(roomAction(room, 'p0', { type: 'play', from: 'mao', to: 'p1' }, rng, 11)).toEqual({ ok: false, error: 'bad_action' });
    const turn = (room.game as { turn: string }).turn;
    room = step(room, turn, { type: 'play', from: 'open', to: turn }, 11);
    const view = roomView(room, 'p0');
    if (!isCamelioRoomView(view)) throw new Error('esperava Cama-Leão');
    expect(view.game.playCount).toBe(1);
  });

  it('sem prazo de jogo: acorda só pela presença e expiração', () => {
    const room = step(camelioRoom(2), 'p0', { type: 'start' }, 10);
    expect(nextAlarmAt(room, 10)).toBe(room.lastActivity + 6 * 60 * 60 * 1000);
  });

  it('erros do Cama-Leão têm mensagem em português', () => {
    for (const code of ['not_your_turn', 'bad_target', 'not_playing']) {
      expect(ERROR_CODES).toContain(code);
      expect(errorMessage(code)).not.toBe('Algo deu errado.');
    }
  });
});
```

(`step`, `rng` e os imports de `ERROR_CODES`/`errorMessage`/`nextAlarmAt`/`roomAction`/`roomSummary`/`roomView`/`joinRoom`/`createRoom`/`PLAYER_COLORS` já existem no arquivo.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -w shared -- room-games`
Expected: FAIL (`createRoom(..., 'camelio')` sem entrada no registro / `isCamelioRoomView` não existe).

- [ ] **Step 3: Registro em `shared/src/games/registry.ts`**

Acrescente aos imports:

```ts
import { camelioActionSchema } from './camelio/schema';
import { CAMELIO_MAX_PLAYERS, CAMELIO_MIN_PLAYERS, type CamelioAction, type CamelioState, type CamelioView } from './camelio/types';
import { camelio } from './camelio/view';
```

Troque as quatro linhas de tipos por:

```ts
export const GAME_IDS = ['ito', 'dixit', 'pictures', 'camelio'] as const;
export type GameId = (typeof GAME_IDS)[number];
export type GameState = ItoState | DixitState | PicturesState | CamelioState;
export type GameView = ItoView | DixitView | PicturesView | CamelioView;
export type GameAction = ItoAction | DixitAction | PicturesAction | CamelioAction;
```

E, dentro de `GAMES`, depois da entrada `pictures`:

```ts
  camelio: defineGame({
    id: 'camelio',
    module: camelio,
    actionSchema: camelioActionSchema,
    minPlayers: CAMELIO_MIN_PLAYERS,
    maxPlayers: CAMELIO_MAX_PLAYERS,
    // Tudo é aberto na mesa (só o topo do monte é segredo, e o cursor não entrega nada).
    liveCursors: true,
    // O histórico do Cama-Leão vem no Plano C4.
    recordsHistory: false,
  }),
```

- [ ] **Step 4: Erros em `shared/src/protocol.ts`**

Em `ERROR_CODES`, depois de `'no_work',`, acrescente:

```ts
  'not_your_turn',
  'bad_target',
  'not_playing',
```

Em `ERROR_MESSAGES`, depois de `no_work: …,`, acrescente:

```ts
  not_your_turn: 'Não é a sua vez.',
  bad_target: 'Essa pessoa não pode receber carta agora.',
  not_playing: 'A partida não está rolando agora.',
```

- [ ] **Step 5: Visão da sala em `shared/src/room.ts`**

Acrescente aos imports:

```ts
import type { CamelioView } from './games/camelio/types';
```

E, logo depois de `isPicturesRoomView`:

```ts
export type CamelioRoomView = RoomView<CamelioView> & { gameId: 'camelio' };

export function isCamelioRoomView(view: RoomView): view is CamelioRoomView {
  return view.gameId === 'camelio';
}
```

- [ ] **Step 6: Histórico em `shared/src/history.ts`**

Em `HistoryResponses`, depois de `pictures: never;`:

```ts
  /** O Cama-Leão ainda não grava histórico (vem no C4): a rota responde 404 antes de chegar aqui. */
  camelio: never;
```

Em `pendingHistoryRecord`, depois do `case 'pictures': return null; …`:

```ts
    case 'camelio':
      return null; // histórico do Cama-Leão vem no C4
```

- [ ] **Step 7: Exports em `shared/src/index.ts`**

Antes de `export * from './games/registry';`:

```ts
export * from './games/camelio/types';
export { CAMELIO_DECK, CAMELIO_DECK_SIZE, camelioBack, camelioCard, camelioCardIds } from './games/camelio/deck';
export {
  camelioDeckEndWinners,
  camelioPoints,
  camelioScoredColors,
  camelioSphereSum,
  camelioSpheresInPlay,
  resolveCamelioPlay,
  type CamelioPlayResolution,
} from './games/camelio/scoring';
export { applyCamelioAction, camelioOnPresenceChange, camelioTarget, initialCamelioState } from './games/camelio/rules';
export { camelio, camelioViewFor } from './games/camelio/view';
export { camelioActionSchema } from './games/camelio/schema';
```

- [ ] **Step 8: Servidor em `server/src/index.ts`**

Em `historyPageOf`, depois do `case 'pictures': …throw…`:

```ts
    case 'camelio':
      // sem `recordsHistory` a rota já respondeu 404; o histórico do Cama-Leão vem no C4
      throw new Error('o Cama-Leão ainda não tem histórico');
```

- [ ] **Step 9: Site em `web/src/screens/GamePage.tsx`**

Em `HistoryTab`, depois do `case 'pictures': … );`:

```tsx
    case 'camelio':
      // histórico do Cama-Leão vem no C4
      return (
        <section className="panel">
          <p>O histórico do Cama-Leão vem em breve.</p>
        </section>
      );
```

- [ ] **Step 10: Entrada no catálogo (`web/src/games/catalog.ts`)**

O `TEXT: Record<GameId, …>` do catálogo não compila sem o jogo novo. Troque o comentário dos nomes de vitrine por:

```ts
// Nomes de vitrine: o ITO aparece como DITU, o Dixit como Diquisti, o Pictures como Retratim e o Camelio como Cama-Leão; os ids internos não mudam.
```

E, dentro de `TEXT`, depois da entrada `pictures`:

```ts
  camelio: {
    name: 'Cama-Leão',
    tagline: 'junte 5 esferas certinhas e empurre o resto pros amigos',
    rules: [
      'Na sua vez, pegue a carta aberta ou a do monte, que só mostra metade: a cor ou as esferas.',
      'Antes de virar, decida: fica com ela ou dá pra alguém, que é obrigado a pegar.',
      'Exatamente 5 esferas de uma cor valem 1 ponto. Passou de 5, perde as cartas da cor (e o ponto, se já tinha).',
      'Ganha quem pontuar 3 cores (4 com 2 jogadores).',
    ],
    // A mesa vem no Plano C3.
    playable: false,
    mobile: false,
  },
```

- [ ] **Step 11: Rodar testes e tipos**

Run: `npm test && npm run typecheck`
Expected: PASS nos dois. Se o `typecheck` reclamar de outro `switch` exaustivo por `GameId` que este plano não listou, acrescente nele um caso `camelio` no mesmo espírito ("ainda não tem", sem comportamento novo) e anote no relatório da task.

- [ ] **Step 12: Commit**

```bash
git add shared/src/games/registry.ts shared/src/protocol.ts shared/src/room.ts shared/src/history.ts shared/src/index.ts shared/test/room-games.test.ts server/src/index.ts web/src/screens/GamePage.tsx web/src/games/catalog.ts
git commit -m "feat: Cama-Leão no registro de jogos, na sala e nos erros

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Teste do servidor

**Files:**
- Test: `server/test/camelio.test.ts`

- [ ] **Step 1: Escrever `server/test/camelio.test.ts`**

```ts
import { SELF } from 'cloudflare:test';
import type { CamelioRoomView } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { joined, newGameRoom } from './helpers';

const isPlaying = (r: CamelioRoomView) => r.game.phase === 'playing';

describe('Cama-Leão no servidor', () => {
  it('POST /rooms { game: "camelio" } cria a sala e o GET conta que é de Cama-Leão', async () => {
    const code = await newGameRoom('camelio');
    const body = await (await SELF.fetch(`https://x/rooms/${code}`)).json();
    expect(body).toMatchObject({ exists: true, game: 'camelio', phase: 'lobby' });
  });

  it('o histórico do Cama-Leão ainda não existe (vem no Plano C4)', async () => {
    const res = await SELF.fetch('https://x/history/camelio');
    expect(res.status).toBe(404);
  });

  it('dois jogadores: começa, joga e a vez passa; o topo do monte só mostra o verso', async () => {
    const code = await newGameRoom('camelio');
    const players = await joined(code, 2);
    players[0]!.client.send({ t: 'action', action: { type: 'start' } });
    const views = await Promise.all(players.map((p) => p.client.state<CamelioRoomView>(isPlaying)));
    const v = views[0]!;
    expect(v.game.deckCount).toBe(71);
    expect(v.game.target).toBe(4);
    expect(v.game.top).not.toBeNull();
    expect(v.game.top).not.toHaveProperty('id');
    expect(v.game).not.toHaveProperty('deck');

    const turn = v.game.turn!;
    const me = players.find((p) => p.id === turn)!;
    const other = players.find((p) => p.id !== turn)!;
    me.client.send({ t: 'action', action: { type: 'play', from: 'open', to: other.id } });
    const after = await other.client.state<CamelioRoomView>((r) => r.game.playCount === 1);
    expect(after.game.turn).toBe(other.id);
    expect(after.game.last).toMatchObject({ by: me.id, to: other.id, from: 'open', outcome: 'none' });
    expect(after.game.table[other.id]).toHaveLength(1);
  });

  it('jogar fora da vez volta como erro em português', async () => {
    const code = await newGameRoom('camelio');
    const players = await joined(code, 2);
    players[0]!.client.send({ t: 'action', action: { type: 'start' } });
    const v = await players[0]!.client.state<CamelioRoomView>(isPlaying);
    const waiting = players.find((p) => p.id !== v.game.turn)!;
    waiting.client.send({ t: 'action', action: { type: 'play', from: 'deck', to: waiting.id } });
    const err = await waiting.client.next('error');
    expect(err).toMatchObject({ code: 'not_your_turn', message: 'Não é a sua vez.' });
  });
});
```

(A primeira jogada de uma partida nunca fecha nem estoura: a mesa está vazia e nenhuma carta tem mais de 4 esferas. Por isso `outcome: 'none'` é garantido.)

- [ ] **Step 2: Rodar**

Run: `npm test -w server -- camelio`
Expected: PASS (o servidor já é genérico; o teste confirma). Se falhar, o problema está no registro (Task 7), não no servidor: não crie código por jogo em `server/src/`.

- [ ] **Step 3: Commit**

```bash
git add server/test/camelio.test.ts
git commit -m "test(server): sala de Cama-Leão de ponta a ponta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Estante — teste do catálogo, capa de circo e fonte

A entrada do catálogo já entrou na Task 7 (sem ela o `typecheck` não passava). Aqui vêm o teste dela, a capa e a fonte. Só se **acrescentam** regras de CSS novas com prefixo `camelio`; nada do que existe muda.

**Files:**
- Modify: `web/src/screens/shelf.css`
- Modify: `web/index.html`
- Test: `web/test/catalog.test.ts`

- [ ] **Step 1: Escrever o teste em `web/test/catalog.test.ts`**

Acrescente, dentro do `describe`, no fim:

```ts
  it('Cama-Leão (o Camelio) aparece na estante, ainda em breve', () => {
    const entry = catalogEntry('camelio');
    expect(entry?.name).toBe('Cama-Leão');
    expect(entry?.players).toBe('2 a 6 pessoas');
    expect(entry?.playable).toBe(false);
    expect(entry?.mobile).toBe(false);
    expect(entry?.hasHistory).toBe(false);
    expect(entry?.rules.length).toBeGreaterThan(0);
  });
```

Run: `npm test -w web -- catalog`
Expected: PASS (a entrada veio na Task 7; este teste trava o que ela promete).

- [ ] **Step 2: Capa de circo em `web/src/screens/shelf.css`**

Depois do bloco `.cover-pictures::after { … }`, acrescente:

```css
/* Cama-Leão: lona de circo listrada, letreiro vermelho */
.cover-camelio { background: repeating-linear-gradient(90deg, #f7efe0 0 18px, #f3dcd2 18px 36px); color: #1f2a4a; }
.cover-camelio b { font: 400 32px/1.05 'Rye', Georgia, serif; color: #c8372d; }
.cover-camelio span { font: 500 14px/1.25 'Fredoka', system-ui, sans-serif; }
```

Depois de `.cover-pictures.mini::before, .cover-pictures.mini::after { display: none; }`:

```css
.cover-camelio.mini { font: 400 12px/1.1 'Rye', Georgia, serif; color: #c8372d; }
```

Depois de `.game-pictures { … }`:

```css
.game-camelio { --game: #c8372d; --game-ink: #f7efe0; }
```

- [ ] **Step 3: Fonte Rye em `web/index.html`**

Na linha do Google Fonts, troque `family=Fredoka:wght@500;700` por `family=Fredoka:wght@400;500;700` e acrescente `&family=Rye` antes de `&display=swap`. A linha fica:

```html
    <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;700&family=Patrick+Hand&family=DM+Serif+Display:ital@0;1&family=Nunito:wght@300;400;600&family=Caveat:wght@700&family=Quicksand:wght@500;600;700&family=Rye&display=swap" rel="stylesheet" />
```

- [ ] **Step 4: Rodar**

Run: `npm test -w web -- catalog && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/test/catalog.test.ts web/src/screens/shelf.css web/index.html
git commit -m "feat(web): Cama-Leão na estante, com capa de circo e selo em breve

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Conferência final

**Files:** nenhum novo.

- [ ] **Step 1: Tudo verde**

Run: `npm test && npm run typecheck && npm run build -w web`
Expected: PASS nos três (o build roda `tsc --noEmit && vite build`).

- [ ] **Step 2: Olhar a estante no navegador**

Suba o site da worktree numa porta própria (a 5173 e a 8787 podem ser de outra sessão): em `web/`, `npx vite --port 5181 --strictPort` (pelo `preview_start`, com entrada **temporária** no `.claude/launch.json` da pasta mãe, removida logo depois). Emule 1280×800. Confira:
- a capa do Cama-Leão aparece na estante, listrada, com o nome em Rye vermelho e o selo "em breve";
- `#/camelio` mostra "O Cama-Leão tá chegando!", as 4 regras e "2 a 6 pessoas";
- a aba histórico mostra "O histórico do Cama-Leão vem em breve.";
- DITU, Diquisti e Retratim continuam iguais.

Tire um print da estante pro relatório. Pare o servidor de preview ao terminar.

- [ ] **Step 3: Relatório**

Resumo pro Rafa: o que entrou (regras testadas, sala, estante "em breve"), números de testes (`shared`, `server`, `web`), e o próximo passo (Plano C2, o protótipo). Nada de merge nem de PR sem ele pedir.
