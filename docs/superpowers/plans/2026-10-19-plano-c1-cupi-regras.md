# Plano C1 — Cúpi: regras e base Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O Cúpi (id `coup`, nossa versão do Coup básico) existe como módulo de regras completo e testado em `shared/`, registrado no jogo da sala (com o prazo de 10 s acordando o servidor), e aparece na estante como "em breve", sem mesa ainda.

**Architecture:** `shared/src/games/coup/` traz tipos e tabelas das ações (`types.ts`), baralho (`deck.ts`), consultas puras sobre a mesa (`table.ts`), a máquina de estados (`rules.ts`: vez → janela de reação → bloqueio → dúvida → perder carta → troca → fim, mais o automático de quem está ausente em `settleCoup`), a visão com segredos e o "o que você pode fazer agora" (`view.ts`) e o schema zod das ações (`schema.ts`). A sala genérica já acorda no `nextDeadline` (vem do Retratim) e chama `onPresenceChange` = `settleCoup`, que fecha a janela vencida.

**Tech Stack:** TypeScript 5.9, zod 3, Vitest 4, Cloudflare Workers + Durable Objects (`@cloudflare/vitest-plugin`), React 19 (só catálogo e estante no `web/`).

**Spec:** `docs/superpowers/specs/2026-10-19-cupi-design.md` (§2 regras, §4.1 módulo, §7 erros, §8 testes). Este plano é o item 1 da §9 (Plano C1). Protótipo, mesa, artes e histórico ficam pros próximos planos.

---

## Contexto para quem vai executar

- Trabalhe na worktree `.claude/worktrees/cupi`, branch `feat/cupi` (já tem o spec). **Não troque a branch da pasta mãe** e não faça merge no `main` (merge = publicar). Nunca use `git stash` puro.
- Monorepo npm workspaces: `shared/` (regras puras, sem I/O), `server/` (Worker + Durable Object), `web/` (React). Comandos na raiz da worktree: `npm test -w shared -- <filtro>`, `npm test -w server -- <filtro>`, `npm test -w web -- <filtro>`, `npm run typecheck`.
- Se a worktree não tiver `node_modules`, rode `npm install` nela antes do primeiro teste.
- No Git Bash do Windows o `rtk` não existe: rode `git`/`npm` direto. No PowerShell, use `npm.cmd`/`npx.cmd`.
- Código, comentários, mensagens de erro e nomes de teste em **português**, no estilo dos arquivos existentes. Commits `feat(shared): …`, `test(server): …`, terminando com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `tsconfig.base.json` usa `strict`, `noUncheckedIndexedAccess` e `verbatimModuleSyntax`: imports só de tipo com `import type`; acesso por índice dá `T | undefined` (use `!` quando o teste garante).
- A Vitest não checa tipos: rode **também** `npm run typecheck -w shared` onde o passo pedir.
- Modelo a seguir: o Retratim (`shared/src/games/pictures/` e `shared/test/pictures-*.test.ts`). Mesmos padrões: `fail`/`ok`, `deepFreeze` nos testes, `own()` na visão, schema com `Assert` de tipos.
- `onPresenceChange` (`settleCoup`) precisa devolver **o mesmo objeto** quando nada muda (o servidor compara referência pra decidir se grava).
- Ids internos em inglês (`duke`, `foreignAid`…); o site mostra os nomes em português (Duque, ajuda externa…) a partir do Plano C2.

### Decisões de implementação (detalham o spec)

- **Perder carta com uma só virada pra baixo é automático**: não há escolha, então a regra já vira a carta (o spec diz "quem perde escolhe"; com uma carta a escolha é única).
- O diário são dados (`CoupLogEntry`, em `types.ts`), não texto; o spec citava um `log.ts`, mas só os tipos bastam.
- `recordsHistory` fica `false` até o Plano C4 (como o Retratim antes do R4); `/history/coup` responde 404.
- O placar de vitórias da noite (`wins`) e o número da partida (`match`) vivem no estado do jogo e passam de uma partida pra outra no "jogar de novo" (`restart`).
- Quem começa a revanche é o `winner` da partida anterior, se estiver entre os ativos; senão, sorteado.

### Atualizações durante a execução (2026-10-19)

Valem por cima do código das tasks abaixo:

- **Reação depois do prazo não vale:** `reactError` recebe `ctx` e devolve `window_closed` com `ctx.now >= window.endsAt`.
- **Id por janela:** `CoupWindow.id` vem de `CoupState.windowSeq` (que não zera no "jogar de novo"); `pass`/`challenge`/`block` levam `windowId?: number` e, se ele não for o da janela aberta, `window_closed`. Assim um "duvidar" atrasado não vira dúvida do bloqueio que abriu logo depois. O site sempre manda o `windowId`; o schema da Task 6 precisa aceitá-lo (sem isso o zod descarta o campo).
- O bloqueio virou a função `block(state, by, as, ctx)` em `rules.ts`, ao lado de `challenge`.
- **Alvos válidos na visão (Task 6):** `CoupCan.targets` lista em quem as ações com alvo podem mirar na sua vez (outros vivos); a mesa e os bots usam isso em vez de refazer a regra.
- **Tesouro vazio no automático (Task 5):** o ausente dá golpe também com 7+ moedas quando o tesouro está vazio (`mustCoup` em `settleOnce`); sem isso, 6 ausentes esvaziavam o tesouro com todos entre 8 e 9 moedas e a partida nunca acabava. Spec §2 atualizado.

## Mapa de arquivos

Criar:
- `shared/src/games/coup/types.ts`: constantes, personagens, ações e suas tabelas (personagem declarado, custo, alvo, bloqueadores), estado, diário, ações do jogador, visão.
- `shared/src/games/coup/deck.ts`: as 15 cartas e o baralho embaralhado.
- `shared/src/games/coup/table.ts`: consultas puras (cartas viradas pra baixo, vivos, moedas, tesouro, próximo vivo, quem bloqueia, por que uma ação não vale, se dá pra duvidar/bloquear, diferença de cartas).
- `shared/src/games/coup/rules.ts`: estado inicial, `applyCoupAction`, `settleCoup`.
- `shared/src/games/coup/view.ts`: `coupViewFor`, `coupNextDeadline`, módulo `coup`.
- `shared/src/games/coup/schema.ts`: schema zod das ações.
- `shared/test/coup-helpers.ts`, `shared/test/coup-deck.test.ts`, `shared/test/coup-table.test.ts`, `shared/test/coup-rules.test.ts`, `shared/test/coup-challenge.test.ts`, `shared/test/coup-auto.test.ts`, `shared/test/coup-view.test.ts`, `shared/test/coup-random.test.ts`.
- `server/test/coup.test.ts`.

Modificar:
- `shared/src/games/registry.ts` (registro), `shared/src/room.ts` (`CoupRoomView`), `shared/src/protocol.ts` (erros), `shared/src/history.ts` (caso `coup` sem histórico), `shared/src/index.ts` (exports), `shared/test/room-games.test.ts`.
- `server/src/index.ts` (caso `coup` no `switch` do histórico).
- `web/src/games/catalog.ts`, `web/src/screens/GamePage.tsx`, `web/src/screens/shelf.css`, `web/index.html` (fontes), `web/test/catalog.test.ts`.
- `README.md`, `CLAUDE.md` (Cúpi na lista de jogos).

---

### Task 1: tipos e baralho

**Files:**
- Create: `shared/src/games/coup/types.ts`
- Create: `shared/src/games/coup/deck.ts`
- Test: `shared/test/coup-deck.test.ts`

- [ ] **Step 1: Escrever o teste que falha, `shared/test/coup-deck.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { fullDeck, shuffledDeck } from '../src/games/coup/deck';
import {
  COUP_ACTION_KINDS,
  COUP_BLOCKERS,
  COUP_CHARACTERS,
  COUP_CLAIM,
  COUP_COST,
  COUP_TARGETED,
} from '../src/games/coup/types';
import { mulberry32 } from '../src/rng';

describe('Cúpi: baralho e tabelas', () => {
  it('15 cartas: 3 de cada um dos 5 personagens', () => {
    const deck = fullDeck();
    expect(deck).toHaveLength(15);
    for (const c of COUP_CHARACTERS) expect(deck.filter((d) => d === c)).toHaveLength(3);
  });

  it('o baralho embaralhado tem as mesmas cartas e depende só do sorteio', () => {
    const a = shuffledDeck(mulberry32(1));
    expect([...a].sort()).toEqual([...fullDeck()].sort());
    expect(shuffledDeck(mulberry32(1))).toEqual(a);
    expect(shuffledDeck(mulberry32(2))).not.toEqual(a);
  });

  it('tabelas das ações seguem o Coup básico', () => {
    expect(COUP_ACTION_KINDS).toEqual(['income', 'foreignAid', 'coup', 'tax', 'assassinate', 'steal', 'exchange']);
    expect(COUP_CLAIM).toEqual({
      income: null,
      foreignAid: null,
      coup: null,
      tax: 'duke',
      assassinate: 'assassin',
      steal: 'captain',
      exchange: 'ambassador',
    });
    expect(COUP_COST.coup).toBe(7);
    expect(COUP_COST.assassinate).toBe(3);
    expect(COUP_ACTION_KINDS.filter((k) => COUP_TARGETED[k])).toEqual(['coup', 'assassinate', 'steal']);
    expect(COUP_BLOCKERS.foreignAid).toEqual(['duke']);
    expect(COUP_BLOCKERS.assassinate).toEqual(['contessa']);
    expect(COUP_BLOCKERS.steal).toEqual(['captain', 'ambassador']);
    expect(COUP_BLOCKERS.tax).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -w shared -- coup-deck`
Expected: FAIL (`Cannot find module '../src/games/coup/deck'`).

- [ ] **Step 3: Criar `shared/src/games/coup/types.ts`**

```ts
export const COUP_MIN_PLAYERS = 2;
export const COUP_MAX_PLAYERS = 6;
/** Janela pra duvidar/bloquear (decisão do usuário, 2026-10-19). Quem clica "deixa" encurta. */
export const COUP_WINDOW_MS = 10_000;
/** Moedas da caixa: o tesouro é isso menos as moedas dos jogadores. */
export const COUP_TOTAL_COINS = 50;
export const COUP_START_COINS = 2;
/** Com tantas moedas ou mais, a única ação é o golpe. */
export const COUP_MUST_COUP_AT = 10;
export const COUP_COPIES = 3;

/** Personagens (ids internos; o site mostra Duque, Assassino, Capitão, Embaixador e Condessa). */
export const COUP_CHARACTERS = ['duke', 'assassin', 'captain', 'ambassador', 'contessa'] as const;
export type CoupCharacter = (typeof COUP_CHARACTERS)[number];

/** Ações: renda, ajuda externa, golpe, taxar, assassinar, extorquir, trocar. */
export const COUP_ACTION_KINDS = ['income', 'foreignAid', 'coup', 'tax', 'assassinate', 'steal', 'exchange'] as const;
export type CoupActionKind = (typeof COUP_ACTION_KINDS)[number];

/** Personagem que a ação declara (null = qualquer um pode fazer e ninguém duvida). */
export const COUP_CLAIM: Record<CoupActionKind, CoupCharacter | null> = {
  income: null,
  foreignAid: null,
  coup: null,
  tax: 'duke',
  assassinate: 'assassin',
  steal: 'captain',
  exchange: 'ambassador',
};

/** Custo pago na hora da declaração. */
export const COUP_COST: Record<CoupActionKind, number> = {
  income: 0,
  foreignAid: 0,
  coup: 7,
  tax: 0,
  assassinate: 3,
  steal: 0,
  exchange: 0,
};

/** A ação tem alvo (outro jogador vivo). */
export const COUP_TARGETED: Record<CoupActionKind, boolean> = {
  income: false,
  foreignAid: false,
  coup: true,
  tax: false,
  assassinate: true,
  steal: true,
  exchange: false,
};

/** Com que personagens dá pra bloquear a ação ([] = ninguém bloqueia). */
export const COUP_BLOCKERS: Record<CoupActionKind, readonly CoupCharacter[]> = {
  income: [],
  foreignAid: ['duke'],
  coup: [],
  tax: [],
  assassinate: ['contessa'],
  steal: ['captain', 'ambassador'],
  exchange: [],
};

export interface CoupCard {
  character: CoupCharacter;
  /** Virada pra cima = perdida (fica à vista de todos). */
  revealed: boolean;
}

export interface CoupHand {
  coins: number;
  /** Sempre 2 cartas; as viradas pra baixo são as que ainda valem. */
  cards: CoupCard[];
}

/** A ação da vez em andamento. */
export interface CoupDeclared {
  actor: string;
  kind: CoupActionKind;
  target: string | null;
}

export interface CoupBlock {
  by: string;
  as: CoupCharacter;
}

/** action: duvidar/bloquear a ação; block: duvidar do bloqueio; blockOnly: só o alvo bloqueia (depois de uma dúvida errada). */
export type CoupWindowKind = 'action' | 'block' | 'blockOnly';

export interface CoupWindow {
  kind: CoupWindowKind;
  /** Quem pode reagir nesta janela (vivos, na ordem dos assentos). */
  eligible: string[];
  /** Quem já clicou "deixa" (ou está ausente). */
  passed: string[];
  /** Fim do prazo (ms, hora do servidor). */
  endsAt: number;
}

/** coup/assassinated: alvo da ação; challengeWrong: duvidou e errou; caught: foi pego blefando. */
export type CoupLossReason = 'coup' | 'assassinated' | 'challengeWrong' | 'caught';

/**
 * O que acontece depois da carta perdida: next = vez seguinte; resolve = a ação acontece; proceed = a ação segue
 * (pode abrir a janela só de bloqueio pro alvo); blocked = a ação foi bloqueada.
 */
export type CoupThen = 'next' | 'resolve' | 'proceed' | 'blocked';

export interface CoupLoss {
  player: string;
  reason: CoupLossReason;
  then: CoupThen;
}

/** Uma linha do diário (dados; o site escreve a frase). */
export type CoupLogEntry =
  | { t: 'start'; first: string }
  | { t: 'act'; actor: string; kind: CoupActionKind; target: string | null }
  | { t: 'challenge'; by: string; of: string; claim: CoupCharacter; had: boolean }
  | { t: 'block'; by: string; as: CoupCharacter }
  | { t: 'blocked'; actor: string; kind: CoupActionKind; by: string; as: CoupCharacter }
  | { t: 'resolved'; actor: string; kind: CoupActionKind; target: string | null; amount: number }
  | { t: 'lose'; player: string; card: CoupCharacter }
  | { t: 'out'; player: string }
  | { t: 'win'; player: string };

export type CoupPhase = 'lobby' | 'turn' | 'reaction' | 'losing' | 'exchange' | 'over';

export interface CoupState {
  phase: CoupPhase;
  /** Partidas começadas nesta sala (1 na primeira). */
  match: number;
  /** Quem joga a partida, na ordem dos assentos no começo. Quem entra depois assiste e joga a próxima. */
  players: string[];
  hands: Record<string, CoupHand>;
  /** Baralho (topo = índice 0). Não vai pra visão. */
  deck: CoupCharacter[];
  /** De quem é a vez (null fora da partida). */
  turn: string | null;
  declared: CoupDeclared | null;
  block: CoupBlock | null;
  window: CoupWindow | null;
  loss: CoupLoss | null;
  /** Na troca: as 2 cartas compradas, fora do baralho até a escolha. */
  drawn: CoupCharacter[];
  /** Ordem em que saíram. */
  out: string[];
  winner: string | null;
  /** Placar de vitórias da noite, por jogador (sobrevive ao "jogar de novo"). */
  wins: Record<string, number>;
  /** Diário da partida (recomeça a cada partida). */
  log: CoupLogEntry[];
}

export type CoupAction =
  | { type: 'start' }
  /** "jogar de novo" (só o anfitrião, no fim da partida). */
  | { type: 'restart' }
  | { type: 'act'; kind: CoupActionKind; target?: string }
  /** "deixa" */
  | { type: 'pass' }
  | { type: 'challenge' }
  | { type: 'block'; as: CoupCharacter }
  | { type: 'lose'; card: CoupCharacter }
  | { type: 'exchange'; keep: CoupCharacter[] };

export interface CoupSeat {
  id: string;
  coins: number;
  /** Quantas cartas viradas pra baixo. */
  hidden: number;
  /** As cartas já perdidas (à vista). */
  revealed: CoupCharacter[];
  out: boolean;
}

/** O que quem vê pode fazer agora (a mesa mostra só esses botões; as regras conferem de novo). */
export interface CoupCan {
  /** Ações que dá pra declarar (só na sua vez). */
  act: CoupActionKind[];
  challenge: boolean;
  /** Personagens com que dá pra bloquear agora. */
  block: CoupCharacter[];
  pass: boolean;
  /** Você precisa escolher a carta que vai revelar. */
  lose: boolean;
  /** Na sua troca: quantas cartas ficam (0 = não é sua troca). */
  keep: number;
}

export interface CoupView {
  phase: CoupPhase;
  match: number;
  players: string[];
  seats: CoupSeat[];
  turn: string | null;
  declared: CoupDeclared | null;
  block: CoupBlock | null;
  window: CoupWindow | null;
  /** Quem está escolhendo a carta perdida, e por quê. */
  loss: { player: string; reason: CoupLossReason } | null;
  deckSize: number;
  treasury: number;
  out: string[];
  winner: string | null;
  /** As cartas com que o vencedor terminou (só no fim). */
  winnerCards: CoupCharacter[];
  wins: Record<string, number>;
  log: CoupLogEntry[];
  /** Suas cartas viradas pra baixo ([] pra quem assiste). */
  myCards: CoupCharacter[];
  /** Na sua troca: as 2 cartas compradas. */
  myDrawn: CoupCharacter[];
  can: CoupCan;
}
```

- [ ] **Step 4: Criar `shared/src/games/coup/deck.ts`**

```ts
import { shuffle, type Rng } from '../../rng';
import { COUP_CHARACTERS, COUP_COPIES, type CoupCharacter } from './types';

/** As 15 cartas, 3 de cada personagem, na ordem de COUP_CHARACTERS. */
export function fullDeck(): CoupCharacter[] {
  return COUP_CHARACTERS.flatMap((c) => Array<CoupCharacter>(COUP_COPIES).fill(c));
}

export function shuffledDeck(rng: Rng): CoupCharacter[] {
  return shuffle(rng, fullDeck());
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test -w shared -- coup-deck && npm run typecheck -w shared`
Expected: PASS, sem erro de tipo.

- [ ] **Step 6: Commit**

```bash
git add shared/src/games/coup/types.ts shared/src/games/coup/deck.ts shared/test/coup-deck.test.ts
git commit -m "feat(shared): Cúpi — tipos, tabelas das ações e baralho

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: consultas da mesa (`table.ts`)

**Files:**
- Create: `shared/src/games/coup/table.ts`
- Test: `shared/test/coup-table.test.ts`

- [ ] **Step 1: Escrever o teste que falha, `shared/test/coup-table.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import {
  actError,
  alive,
  blockersOf,
  canBlock,
  canChallenge,
  coinsOf,
  hiddenOf,
  isAlive,
  nextAlive,
  treasury,
  without,
} from '../src/games/coup/table';
import type { CoupCharacter, CoupState, CoupWindow } from '../src/games/coup/types';

/** Mesa mínima: cada jogador com moedas e cartas [personagem, virada pra cima?]. */
function st(hands: Record<string, { coins?: number; cards: [CoupCharacter, boolean][] }>): CoupState {
  const players = Object.keys(hands);
  return {
    phase: 'turn',
    match: 1,
    players,
    hands: Object.fromEntries(
      players.map((p) => [
        p,
        { coins: hands[p]!.coins ?? 2, cards: hands[p]!.cards.map(([character, revealed]) => ({ character, revealed })) },
      ]),
    ),
    deck: [],
    turn: players[0]!,
    declared: null,
    block: null,
    window: null,
    loss: null,
    drawn: [],
    out: [],
    winner: null,
    wins: {},
    log: [],
  };
}

const three = () =>
  st({
    p0: { cards: [['duke', false], ['captain', false]] },
    p1: { cards: [['contessa', true], ['assassin', true]] },
    p2: { coins: 5, cards: [['ambassador', true], ['duke', false]] },
  });

const win = (kind: CoupWindow['kind']): CoupWindow => ({ kind, eligible: [], passed: [], endsAt: 0 });

describe('Cúpi: consultas da mesa', () => {
  it('cartas viradas pra baixo, vivos e moedas', () => {
    const s = three();
    expect(hiddenOf(s, 'p0')).toEqual(['duke', 'captain']);
    expect(hiddenOf(s, 'p2')).toEqual(['duke']);
    expect(hiddenOf(s, 'p9')).toEqual([]);
    expect(hiddenOf(s, '__proto__')).toEqual([]);
    expect(isAlive(s, 'p1')).toBe(false);
    expect(alive(s)).toEqual(['p0', 'p2']);
    expect(coinsOf(s, 'p2')).toBe(5);
    expect(coinsOf(s, 'p9')).toBe(0);
  });

  it('tesouro = 50 menos as moedas dos jogadores', () => {
    expect(treasury(three())).toBe(50 - 2 - 2 - 5);
  });

  it('próximo vivo pula quem saiu e dá a volta', () => {
    const s = three();
    expect(nextAlive(s, 'p0')).toBe('p2');
    expect(nextAlive(s, 'p2')).toBe('p0');
    expect(nextAlive(s, 'p1')).toBe('p2');
  });

  it('quem bloqueia: ajuda externa, qualquer outro vivo; extorquir/assassinar, só o alvo vivo; taxar, ninguém', () => {
    const s = st({
      p0: { cards: [['duke', false], ['captain', false]] },
      p1: { cards: [['contessa', false], ['assassin', false]] },
      p2: { cards: [['ambassador', true], ['duke', true]] },
      p3: { cards: [['captain', false], ['duke', false]] },
    });
    expect(blockersOf(s, { actor: 'p0', kind: 'foreignAid', target: null })).toEqual(['p1', 'p3']);
    expect(blockersOf(s, { actor: 'p0', kind: 'steal', target: 'p1' })).toEqual(['p1']);
    expect(blockersOf(s, { actor: 'p0', kind: 'assassinate', target: 'p2' })).toEqual([]);
    expect(blockersOf(s, { actor: 'p0', kind: 'tax', target: null })).toEqual([]);
  });

  it('por que a ação não vale', () => {
    const s = three();
    expect(actError(s, 'p0', 'income', null)).toBeNull();
    expect(actError(s, 'p0', 'income', 'p2')).toBe('bad_target');
    expect(actError(s, 'p0', 'steal', null)).toBe('bad_target');
    expect(actError(s, 'p0', 'steal', 'p0')).toBe('bad_target');
    expect(actError(s, 'p0', 'steal', 'p1')).toBe('bad_target');
    expect(actError(s, 'p0', 'steal', 'p2')).toBeNull();
    expect(actError(s, 'p0', 'assassinate', 'p2')).toBe('not_enough_coins');
    expect(actError(s, 'p2', 'assassinate', 'p0')).toBeNull();
    expect(actError(s, 'p2', 'coup', 'p0')).toBe('not_enough_coins');
    const rich = { ...s, hands: { ...s.hands, p0: { ...s.hands.p0!, coins: 10 } } };
    expect(actError(rich, 'p0', 'tax', null)).toBe('must_coup');
    expect(actError(rich, 'p0', 'coup', 'p2')).toBeNull();
  });

  it('dá pra duvidar: da ação que declara personagem e de bloqueio; não da ajuda externa nem na janela só de bloqueio', () => {
    const s = three();
    expect(canChallenge(s)).toBe(false);
    expect(canChallenge({ ...s, declared: { actor: 'p0', kind: 'tax', target: null }, window: win('action') })).toBe(true);
    expect(canChallenge({ ...s, declared: { actor: 'p0', kind: 'foreignAid', target: null }, window: win('action') })).toBe(false);
    expect(canChallenge({ ...s, declared: { actor: 'p0', kind: 'foreignAid', target: null }, window: win('block') })).toBe(true);
    expect(canChallenge({ ...s, declared: { actor: 'p0', kind: 'steal', target: 'p2' }, window: win('blockOnly') })).toBe(false);
  });

  it('dá pra bloquear: só quem bloqueia a ação, e não na janela do bloqueio', () => {
    const s = { ...three(), declared: { actor: 'p0', kind: 'steal' as const, target: 'p2' } };
    expect(canBlock({ ...s, window: win('action') }, 'p2')).toBe(true);
    expect(canBlock({ ...s, window: win('action') }, 'p0')).toBe(false);
    expect(canBlock({ ...s, window: win('blockOnly') }, 'p2')).toBe(true);
    expect(canBlock({ ...s, window: win('block') }, 'p2')).toBe(false);
    expect(canBlock(three(), 'p2')).toBe(false);
  });

  it('tira cópias de cartas (troca)', () => {
    expect(without(['duke', 'duke', 'captain'], ['duke'])).toEqual(['duke', 'captain']);
    expect(without(['duke', 'captain'], ['duke', 'duke'])).toBeNull();
    expect(without(['duke', 'captain'], [])).toEqual(['duke', 'captain']);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -w shared -- coup-table`
Expected: FAIL (`Cannot find module '../src/games/coup/table'`).

- [ ] **Step 3: Criar `shared/src/games/coup/table.ts`**

```ts
import {
  COUP_BLOCKERS,
  COUP_CLAIM,
  COUP_COST,
  COUP_MUST_COUP_AT,
  COUP_TARGETED,
  COUP_TOTAL_COINS,
  type CoupActionKind,
  type CoupCharacter,
  type CoupDeclared,
  type CoupState,
} from './types';

/** Lê o registro só se a chave for própria (ids como '__proto__' não podem cair no protótipo). */
export function own<T>(record: Record<string, T>, key: string | null): T | undefined {
  return key !== null && Object.hasOwn(record, key) ? record[key] : undefined;
}

/** Cartas viradas pra baixo de `player` (as que ainda valem). */
export function hiddenOf(state: CoupState, player: string): CoupCharacter[] {
  return (own(state.hands, player)?.cards ?? []).filter((c) => !c.revealed).map((c) => c.character);
}

export function isAlive(state: CoupState, player: string): boolean {
  return hiddenOf(state, player).length > 0;
}

/** Quem ainda tem carta, na ordem dos assentos. */
export function alive(state: CoupState): string[] {
  return state.players.filter((p) => isAlive(state, p));
}

export function coinsOf(state: CoupState, player: string): number {
  return own(state.hands, player)?.coins ?? 0;
}

/** Moedas no tesouro: as 50 da caixa menos as dos jogadores. */
export function treasury(state: CoupState): number {
  return COUP_TOTAL_COINS - state.players.reduce((sum, p) => sum + coinsOf(state, p), 0);
}

/** Próximo vivo depois de `from`, na ordem dos assentos (dá a volta). */
export function nextAlive(state: CoupState, from: string): string | null {
  const n = state.players.length;
  const i = state.players.indexOf(from);
  for (let k = 1; k <= n; k++) {
    const p = state.players[(i + k) % n]!;
    if (isAlive(state, p)) return p;
  }
  return null;
}

/** Quem pode bloquear: na ajuda externa, qualquer outro vivo; em assassinar/extorquir, só o alvo (se vivo). */
export function blockersOf(state: CoupState, declared: CoupDeclared): string[] {
  if (COUP_BLOCKERS[declared.kind].length === 0) return [];
  if (declared.kind === 'foreignAid') return alive(state).filter((p) => p !== declared.actor);
  return declared.target !== null && isAlive(state, declared.target) ? [declared.target] : [];
}

/** Por que `actor` não pode declarar `kind` contra `target` (ou null se pode). Não confere fase nem vez. */
export function actError(state: CoupState, actor: string, kind: CoupActionKind, target: string | null): string | null {
  const coins = coinsOf(state, actor);
  if (coins >= COUP_MUST_COUP_AT && kind !== 'coup') return 'must_coup';
  if (coins < COUP_COST[kind]) return 'not_enough_coins';
  if (!COUP_TARGETED[kind]) return target === null ? null : 'bad_target';
  if (target === null || target === actor || !isAlive(state, target)) return 'bad_target';
  return null;
}

/** Dá pra duvidar na janela aberta? Do bloqueio, sempre; da ação, só se ela declara personagem. */
export function canChallenge(state: CoupState): boolean {
  const w = state.window;
  if (w === null || state.declared === null) return false;
  if (w.kind === 'block') return true;
  return w.kind === 'action' && COUP_CLAIM[state.declared.kind] !== null;
}

/** `player` pode bloquear na janela aberta? (na da ação ou na só de bloqueio, se é quem bloqueia essa ação) */
export function canBlock(state: CoupState, player: string): boolean {
  if (state.window === null || state.window.kind === 'block' || state.declared === null) return false;
  return blockersOf(state, state.declared).includes(player);
}

/** Tira de `pool` uma cópia de cada carta de `take`; null se alguma não estiver lá. */
export function without(pool: readonly CoupCharacter[], take: readonly CoupCharacter[]): CoupCharacter[] | null {
  const left = [...pool];
  for (const c of take) {
    const i = left.indexOf(c);
    if (i < 0) return null;
    left.splice(i, 1);
  }
  return left;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -w shared -- coup-table && npm run typecheck -w shared`
Expected: PASS, sem erro de tipo.

- [ ] **Step 5: Commit**

```bash
git add shared/src/games/coup/table.ts shared/test/coup-table.test.ts
git commit -m "feat(shared): Cúpi — consultas da mesa (vivos, tesouro, bloqueadores, validação)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: regras — início, ações, janela de reação, perder carta, troca e fim

Nesta task as ações `challenge` e `block` ainda respondem `bad_action` (entram na Task 4) e `settleCoup` só fecha a janela (o automático dos ausentes entra na Task 5).

**Files:**
- Create: `shared/src/games/coup/rules.ts`
- Create: `shared/test/coup-helpers.ts`
- Test: `shared/test/coup-rules.test.ts`

- [ ] **Step 1: Criar os helpers dos testes, `shared/test/coup-helpers.ts`**

```ts
import type { ActionResult, GameContext } from '../src/game';
import { fullDeck } from '../src/games/coup/deck';
import { applyCoupAction, initialCoupState } from '../src/games/coup/rules';
import { without } from '../src/games/coup/table';
import type { CoupAction, CoupCharacter, CoupState } from '../src/games/coup/types';
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

export function must(res: ActionResult<CoupState>): CoupState {
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

export const tryAct = (state: CoupState, playerId: string, action: CoupAction, ctx: GameContext): ActionResult<CoupState> =>
  applyCoupAction(deepFreeze(state), playerId, action, ctx);

export const act = (state: CoupState, playerId: string, action: CoupAction, ctx: GameContext): CoupState =>
  must(tryAct(state, playerId, action, ctx));

/**
 * Mesa montada à mão, na vez de `turn` (padrão: o primeiro), todos com 2 moedas (ou `coins`).
 * O baralho é o que sobra das 15, na ordem de `fullDeck` (duke, assassin, captain, ambassador, contessa), ou `deck`.
 */
export function table(
  hands: Record<string, CoupCharacter[]>,
  opts: { coins?: Record<string, number>; turn?: string; deck?: CoupCharacter[] } = {},
): CoupState {
  const players = Object.keys(hands);
  const used = players.flatMap((p) => hands[p]!);
  return {
    ...initialCoupState(),
    phase: 'turn',
    match: 1,
    players,
    hands: Object.fromEntries(
      players.map((p) => [p, { coins: opts.coins?.[p] ?? 2, cards: hands[p]!.map((character) => ({ character, revealed: false })) }]),
    ),
    deck: opts.deck ?? without(fullDeck(), used)!,
    turn: opts.turn ?? players[0]!,
    wins: Object.fromEntries(players.map((p) => [p, 0])),
  };
}

/** A carta `index` de `player` já perdida (virada pra cima); sem carta escondida, ele entra em `out`. */
export function withLost(state: CoupState, player: string, index: number): CoupState {
  const hand = state.hands[player]!;
  const cards = hand.cards.map((c, i) => (i === index ? { ...c, revealed: true } : c));
  const gone = cards.every((c) => c.revealed);
  return {
    ...state,
    hands: { ...state.hands, [player]: { coins: gone ? 0 : hand.coins, cards } },
    out: gone ? [...state.out, player] : state.out,
  };
}

/** Todos da janela aberta que ainda não deixaram clicam "deixa". */
export function allPass(state: CoupState, ctx: GameContext): CoupState {
  const w = state.window!;
  let s = state;
  for (const p of w.eligible) if (!w.passed.includes(p)) s = act(s, p, { type: 'pass' }, ctx);
  return s;
}

/** Todas as cartas da partida (mãos, baralho e compradas na troca), em ordem alfabética. */
export function cardsOf(state: CoupState): CoupCharacter[] {
  return [...state.players.flatMap((p) => state.hands[p]!.cards.map((c) => c.character)), ...state.deck, ...state.drawn].sort();
}

/** Mesa de 3 usada em vários testes. */
export const THREE: Record<string, CoupCharacter[]> = {
  p0: ['duke', 'captain'],
  p1: ['contessa', 'assassin'],
  p2: ['ambassador', 'duke'],
};
```

- [ ] **Step 2: Escrever os testes que falham, `shared/test/coup-rules.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { fullDeck } from '../src/games/coup/deck';
import { applyCoupAction, initialCoupState, settleCoup } from '../src/games/coup/rules';
import { hiddenOf } from '../src/games/coup/table';
import { COUP_WINDOW_MS, type CoupState } from '../src/games/coup/types';
import { T0, THREE, act, allPass, cardsOf, ctxOf, ids, table, tryAct, withLost } from './coup-helpers';

const ctx3 = ctxOf(ids(3));

describe('Cúpi: início', () => {
  it('estado inicial é o lobby vazio', () => {
    expect(initialCoupState()).toMatchObject({ phase: 'lobby', match: 0, players: [], turn: null, wins: {}, log: [] });
  });

  it('precisa de 2 ativos, só o host começa e só no lobby', () => {
    expect(applyCoupAction(initialCoupState(), 'p0', { type: 'start' }, ctxOf(['p0']))).toEqual({ ok: false, error: 'not_enough_players' });
    expect(applyCoupAction(initialCoupState(), 'p1', { type: 'start' }, ctx3)).toEqual({ ok: false, error: 'not_host' });
    expect(tryAct(table(THREE), 'p0', { type: 'start' }, ctx3)).toEqual({ ok: false, error: 'bad_phase' });
  });

  it('com 4: 2 cartas e 2 moedas cada, baralho com 7, vez de alguém da partida, placar zerado', () => {
    const s = act(initialCoupState(), 'p0', { type: 'start' }, ctxOf(ids(4)));
    expect(s.phase).toBe('turn');
    expect(s.match).toBe(1);
    expect(s.players).toEqual(ids(4));
    for (const p of ids(4)) {
      expect(s.hands[p]!.coins).toBe(2);
      expect(hiddenOf(s, p)).toHaveLength(2);
    }
    expect(s.deck).toHaveLength(7);
    expect(ids(4)).toContain(s.turn);
    expect(s.wins).toEqual({ p0: 0, p1: 0, p2: 0, p3: 0 });
    expect(s.log).toEqual([{ t: 'start', first: s.turn }]);
    expect(cardsOf(s)).toEqual([...fullDeck()].sort());
  });

  it('com 2: quem começa recebe 1 moeda', () => {
    for (const seed of [1, 2, 3, 4]) {
      const s = act(initialCoupState(), 'p0', { type: 'start' }, ctxOf(ids(2), { seed }));
      const other = s.turn === 'p0' ? 'p1' : 'p0';
      expect(s.hands[s.turn!]!.coins).toBe(1);
      expect(s.hands[other]!.coins).toBe(2);
    }
  });

  it('jogar de novo: só no fim, começa quem venceu, placar e número da partida continuam', () => {
    const over: CoupState = { ...table(THREE), phase: 'over', turn: null, winner: 'p1', wins: { p0: 0, p1: 1 } };
    expect(tryAct(table(THREE), 'p0', { type: 'restart' }, ctx3)).toEqual({ ok: false, error: 'bad_phase' });
    expect(tryAct(over, 'p1', { type: 'restart' }, ctx3)).toEqual({ ok: false, error: 'not_host' });
    const s = act(over, 'p0', { type: 'restart' }, ctxOf(['p0', 'p1', 'p3']));
    expect(s.phase).toBe('turn');
    expect(s.match).toBe(2);
    expect(s.players).toEqual(['p0', 'p1', 'p3']);
    expect(s.turn).toBe('p1');
    expect(s.wins).toEqual({ p0: 0, p1: 1, p3: 0 });
    expect(s.winner).toBeNull();
    expect(s.out).toEqual([]);
  });
});

describe('Cúpi: ações sem reação', () => {
  it('renda: +1 e a vez passa', () => {
    const s = act(table(THREE), 'p0', { type: 'act', kind: 'income' }, ctx3);
    expect(s.hands.p0!.coins).toBe(3);
    expect(s.phase).toBe('turn');
    expect(s.turn).toBe('p1');
    expect(s.declared).toBeNull();
    expect(s.log).toEqual([
      { t: 'act', actor: 'p0', kind: 'income', target: null },
      { t: 'resolved', actor: 'p0', kind: 'income', target: null, amount: 1 },
    ]);
  });

  it('golpe: paga 7, o alvo escolhe a carta que perde e a vez passa', () => {
    let s = act(table(THREE, { coins: { p0: 7 } }), 'p0', { type: 'act', kind: 'coup', target: 'p1' }, ctx3);
    expect(s.hands.p0!.coins).toBe(0);
    expect(s.phase).toBe('losing');
    expect(s.loss).toEqual({ player: 'p1', reason: 'coup', then: 'next' });
    s = act(s, 'p1', { type: 'lose', card: 'assassin' }, ctx3);
    expect(s.hands.p1!.cards).toEqual([
      { character: 'contessa', revealed: false },
      { character: 'assassin', revealed: true },
    ]);
    expect(s.phase).toBe('turn');
    expect(s.turn).toBe('p1');
    expect(s.loss).toBeNull();
  });

  it('perder carta: só quem está perdendo, e só carta que tem virada pra baixo', () => {
    const s = act(table(THREE, { coins: { p0: 7 } }), 'p0', { type: 'act', kind: 'coup', target: 'p1' }, ctx3);
    expect(tryAct(s, 'p2', { type: 'lose', card: 'duke' }, ctx3)).toEqual({ ok: false, error: 'not_losing' });
    expect(tryAct(s, 'p1', { type: 'lose', card: 'duke' }, ctx3)).toEqual({ ok: false, error: 'not_owner' });
    expect(tryAct(table(THREE), 'p0', { type: 'lose', card: 'duke' }, ctx3)).toEqual({ ok: false, error: 'not_losing' });
  });

  it('golpe na última carta: perde direto, sai sem moedas; sobrando um, ele vence', () => {
    const ctx = ctxOf(ids(2));
    const start = withLost(table({ p0: ['duke', 'captain'], p1: ['contessa', 'assassin'] }, { coins: { p0: 7, p1: 4 } }), 'p1', 0);
    const s = act(start, 'p0', { type: 'act', kind: 'coup', target: 'p1' }, ctx);
    expect(s.phase).toBe('over');
    expect(s.winner).toBe('p0');
    expect(s.turn).toBeNull();
    expect(s.out).toEqual(['p1']);
    expect(s.hands.p1!.coins).toBe(0);
    expect(s.wins).toEqual({ p0: 1, p1: 0 });
    expect(s.log.slice(-3)).toEqual([
      { t: 'lose', player: 'p1', card: 'assassin' },
      { t: 'out', player: 'p1' },
      { t: 'win', player: 'p0' },
    ]);
  });

  it('a vez pula quem saiu', () => {
    const start = withLost(withLost(table(THREE), 'p1', 0), 'p1', 1);
    expect(act(start, 'p0', { type: 'act', kind: 'income' }, ctx3).turn).toBe('p2');
  });

  it('ações recusadas', () => {
    const s = table(THREE);
    expect(tryAct(s, 'p1', { type: 'act', kind: 'income' }, ctx3)).toEqual({ ok: false, error: 'not_your_turn' });
    expect(tryAct(s, 'p9', { type: 'act', kind: 'income' }, ctx3)).toEqual({ ok: false, error: 'not_player' });
    expect(tryAct(s, 'p0', { type: 'act', kind: 'coup', target: 'p1' }, ctx3)).toEqual({ ok: false, error: 'not_enough_coins' });
    expect(tryAct(s, 'p0', { type: 'act', kind: 'steal' }, ctx3)).toEqual({ ok: false, error: 'bad_target' });
    expect(tryAct(s, 'p0', { type: 'act', kind: 'income', target: 'p1' }, ctx3)).toEqual({ ok: false, error: 'bad_target' });
    const rich = table(THREE, { coins: { p0: 10 } });
    expect(tryAct(rich, 'p0', { type: 'act', kind: 'income' }, ctx3)).toEqual({ ok: false, error: 'must_coup' });
    const waiting = act(s, 'p0', { type: 'act', kind: 'tax' }, ctx3);
    expect(tryAct(waiting, 'p0', { type: 'act', kind: 'income' }, ctx3)).toEqual({ ok: false, error: 'bad_phase' });
  });
});

describe('Cúpi: janela de reação', () => {
  it('taxar abre 10 s pros outros vivos; todos deixam e o +3 vem na hora', () => {
    let s = act(table(THREE), 'p0', { type: 'act', kind: 'tax' }, ctx3);
    expect(s.phase).toBe('reaction');
    expect(s.declared).toEqual({ actor: 'p0', kind: 'tax', target: null });
    expect(s.window).toEqual({ kind: 'action', eligible: ['p1', 'p2'], passed: [], endsAt: T0 + COUP_WINDOW_MS });
    s = act(s, 'p1', { type: 'pass' }, ctx3);
    expect(s.window!.passed).toEqual(['p1']);
    expect(tryAct(s, 'p1', { type: 'pass' }, ctx3)).toEqual({ ok: false, error: 'already_passed' });
    expect(tryAct(s, 'p0', { type: 'pass' }, ctx3)).toEqual({ ok: false, error: 'cannot_react' });
    expect(tryAct(s, 'p9', { type: 'pass' }, ctx3)).toEqual({ ok: false, error: 'not_player' });
    s = act(s, 'p2', { type: 'pass' }, ctx3);
    expect(s.hands.p0!.coins).toBe(5);
    expect(s.phase).toBe('turn');
    expect(s.turn).toBe('p1');
    expect(s.window).toBeNull();
    expect(tryAct(s, 'p1', { type: 'pass' }, ctx3)).toEqual({ ok: false, error: 'window_closed' });
  });

  it('no prazo a ação passa; antes dele nada muda (mesmo objeto)', () => {
    const s = act(table(THREE), 'p0', { type: 'act', kind: 'tax' }, ctx3);
    expect(settleCoup(s, ctxOf(ids(3), { now: T0 + COUP_WINDOW_MS - 1 }))).toBe(s);
    const done = settleCoup(s, ctxOf(ids(3), { now: T0 + COUP_WINDOW_MS }));
    expect(done.phase).toBe('turn');
    expect(done.hands.p0!.coins).toBe(5);
  });

  it('ajuda externa: a janela é de quem pode bloquear (todos os outros); ninguém bloqueia, +2', () => {
    let s = act(table(THREE), 'p0', { type: 'act', kind: 'foreignAid' }, ctx3);
    expect(s.window!.eligible).toEqual(['p1', 'p2']);
    s = allPass(s, ctx3);
    expect(s.hands.p0!.coins).toBe(4);
  });

  it('extorquir tira 2 do alvo, ou o que ele tiver', () => {
    const steal = (coins: number) =>
      allPass(act(table(THREE, { coins: { p1: coins } }), 'p0', { type: 'act', kind: 'steal', target: 'p1' }, ctx3), ctx3);
    expect(steal(5).hands.p0!.coins).toBe(4);
    expect(steal(5).hands.p1!.coins).toBe(3);
    expect(steal(1).hands.p0!.coins).toBe(3);
    expect(steal(0).hands.p0!.coins).toBe(2);
    expect(steal(0).log.at(-1)).toEqual({ t: 'resolved', actor: 'p0', kind: 'steal', target: 'p1', amount: 0 });
  });

  it('assassinar: paga 3 na declaração; deixado, o alvo perde uma carta', () => {
    let s = act(table(THREE, { coins: { p0: 3 } }), 'p0', { type: 'act', kind: 'assassinate', target: 'p1' }, ctx3);
    expect(s.hands.p0!.coins).toBe(0);
    s = allPass(s, ctx3);
    expect(s.loss).toEqual({ player: 'p1', reason: 'assassinated', then: 'next' });
  });

  it('trocar: compra 2, fica com 2 das 4 e devolve o resto ao baralho', () => {
    const ctx = ctxOf(ids(2));
    const start = table({ p0: ['duke', 'captain'], p1: ['contessa', 'assassin'] });
    let s = allPass(act(start, 'p0', { type: 'act', kind: 'exchange' }, ctx), ctx);
    expect(s.phase).toBe('exchange');
    expect(s.drawn).toEqual(['duke', 'duke']);
    expect(s.deck).toHaveLength(9);
    expect(tryAct(s, 'p0', { type: 'exchange', keep: ['duke'] }, ctx)).toEqual({ ok: false, error: 'bad_exchange' });
    expect(tryAct(s, 'p0', { type: 'exchange', keep: ['contessa', 'duke'] }, ctx)).toEqual({ ok: false, error: 'bad_exchange' });
    expect(tryAct(s, 'p1', { type: 'exchange', keep: ['contessa', 'assassin'] }, ctx)).toEqual({ ok: false, error: 'not_your_turn' });
    s = act(s, 'p0', { type: 'exchange', keep: ['duke', 'duke'] }, ctx);
    expect(hiddenOf(s, 'p0')).toEqual(['duke', 'duke']);
    expect(s.drawn).toEqual([]);
    expect(s.deck).toHaveLength(11);
    expect(s.turn).toBe('p1');
    expect(cardsOf(s)).toEqual(cardsOf(start));
  });

  it('trocar com uma carta viva: fica com 1 das 3; a perdida continua à vista', () => {
    const ctx = ctxOf(ids(2));
    const start = withLost(table({ p0: ['duke', 'captain'], p1: ['contessa', 'assassin'] }), 'p0', 0);
    let s = allPass(act(start, 'p0', { type: 'act', kind: 'exchange' }, ctx), ctx);
    expect(tryAct(s, 'p0', { type: 'exchange', keep: ['duke', 'captain'] }, ctx)).toEqual({ ok: false, error: 'bad_exchange' });
    s = act(s, 'p0', { type: 'exchange', keep: ['duke'] }, ctx);
    expect(s.hands.p0!.cards).toEqual([
      { character: 'duke', revealed: true },
      { character: 'duke', revealed: false },
    ]);
    expect(cardsOf(s)).toEqual(cardsOf(start));
  });

  it('tesouro quase vazio: ganha só o que tem', () => {
    const s = allPass(act(table(THREE, { coins: { p1: 24, p2: 23 } }), 'p0', { type: 'act', kind: 'tax' }, ctx3), ctx3);
    expect(s.hands.p0!.coins).toBe(3);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm test -w shared -- coup-rules`
Expected: FAIL (`Cannot find module '../src/games/coup/rules'`).

- [ ] **Step 4: Criar `shared/src/games/coup/rules.ts`**

```ts
import type { ActionResult, GameContext } from '../../game';
import { randomInt, shuffle } from '../../rng';
import { shuffledDeck } from './deck';
import { actError, alive, blockersOf, coinsOf, hiddenOf, isAlive, nextAlive, treasury, without } from './table';
import {
  COUP_CLAIM,
  COUP_COST,
  COUP_MIN_PLAYERS,
  COUP_START_COINS,
  COUP_WINDOW_MS,
  type CoupAction,
  type CoupActionKind,
  type CoupCharacter,
  type CoupLogEntry,
  type CoupLossReason,
  type CoupState,
  type CoupThen,
  type CoupWindowKind,
} from './types';

const fail = (error: string): ActionResult<CoupState> => ({ ok: false, error });
const ok = (state: CoupState): ActionResult<CoupState> => ({ ok: true, state });

/** Quanto renda, ajuda externa e taxar rendem. */
const GAIN = { income: 1, foreignAid: 2, tax: 3 } as const;

export function initialCoupState(): CoupState {
  return {
    phase: 'lobby',
    match: 0,
    players: [],
    hands: {},
    deck: [],
    turn: null,
    declared: null,
    block: null,
    window: null,
    loss: null,
    drawn: [],
    out: [],
    winner: null,
    wins: {},
    log: [],
  };
}

const logged = (state: CoupState, entry: CoupLogEntry): CoupState => ({ ...state, log: [...state.log, entry] });

function withCoins(state: CoupState, player: string, delta: number): CoupState {
  const hand = state.hands[player]!;
  return { ...state, hands: { ...state.hands, [player]: { ...hand, coins: hand.coins + delta } } };
}

/** Partida nova com os ativos (também no "jogar de novo"); começa quem venceu a anterior, se estiver jogando. */
function startMatch(state: CoupState, ctx: GameContext): ActionResult<CoupState> {
  if (ctx.active.length < COUP_MIN_PLAYERS) return fail('not_enough_players');
  const players = [...ctx.active];
  const deck = shuffledDeck(ctx.rng);
  const first =
    state.winner !== null && players.includes(state.winner) ? state.winner : players[randomInt(ctx.rng, players.length)]!;
  const hands: CoupState['hands'] = {};
  players.forEach((p, i) => {
    hands[p] = {
      // Regra oficial do jogo de 2: quem começa recebe 1 moeda.
      coins: players.length === 2 && p === first ? 1 : COUP_START_COINS,
      cards: [deck[2 * i]!, deck[2 * i + 1]!].map((character) => ({ character, revealed: false })),
    };
  });
  const wins = { ...state.wins };
  for (const p of players) wins[p] = wins[p] ?? 0;
  return ok({
    ...initialCoupState(),
    phase: 'turn',
    match: state.match + 1,
    players,
    hands,
    deck: deck.slice(2 * players.length),
    turn: first,
    wins,
    log: [{ t: 'start', first }],
  });
}

function openWindow(state: CoupState, kind: CoupWindowKind, eligible: string[], ctx: GameContext): CoupState {
  return { ...state, phase: 'reaction', window: { kind, eligible, passed: [], endsAt: ctx.now + COUP_WINDOW_MS } };
}

/** A vez passa pro próximo vivo, limpando a jogada. */
function endTurn(state: CoupState): CoupState {
  return {
    ...state,
    phase: 'turn',
    turn: nextAlive(state, state.turn!),
    declared: null,
    block: null,
    window: null,
    loss: null,
    drawn: [],
  };
}

function finish(state: CoupState, winner: string): CoupState {
  return logged(
    {
      ...state,
      phase: 'over',
      winner,
      turn: null,
      declared: null,
      block: null,
      window: null,
      loss: null,
      drawn: [],
      wins: { ...state.wins, [winner]: (state.wins[winner] ?? 0) + 1 },
    },
    { t: 'win', player: winner },
  );
}

/** Declara a ação: paga o custo e abre a janela de reação, ou resolve direto (renda, golpe). */
function declare(state: CoupState, actor: string, kind: CoupActionKind, target: string | null, ctx: GameContext): CoupState {
  const declared = { actor, kind, target };
  const paid = COUP_COST[kind] > 0 ? withCoins(state, actor, -COUP_COST[kind]) : state;
  const s = logged({ ...paid, declared, block: null }, { t: 'act', actor, kind, target });
  if (COUP_CLAIM[kind] !== null) return openWindow(s, 'action', alive(s).filter((p) => p !== actor), ctx);
  const blockers = blockersOf(s, declared);
  return blockers.length > 0 ? openWindow(s, 'action', blockers, ctx) : resolveAction(s, ctx);
}

/** A ação acontece (ninguém impediu). Alvo que já saiu: a ação termina sem efeito. */
function resolveAction(state: CoupState, ctx: GameContext): CoupState {
  const d = state.declared!;
  const s: CoupState = { ...state, window: null, block: null };
  const done = (next: CoupState, amount: number) =>
    logged(next, { t: 'resolved', actor: d.actor, kind: d.kind, target: d.target, amount });
  switch (d.kind) {
    case 'income':
    case 'foreignAid':
    case 'tax': {
      const amount = Math.min(GAIN[d.kind], treasury(s));
      return endTurn(done(withCoins(s, d.actor, amount), amount));
    }
    case 'steal': {
      if (!isAlive(s, d.target!)) return endTurn(s);
      const amount = Math.min(2, coinsOf(s, d.target!));
      return endTurn(done(withCoins(withCoins(s, d.target!, -amount), d.actor, amount), amount));
    }
    case 'coup':
    case 'assassinate':
      if (!isAlive(s, d.target!)) return endTurn(s);
      return startLoss(done(s, 0), d.target!, d.kind === 'coup' ? 'coup' : 'assassinated', 'next', ctx);
    case 'exchange':
      return done({ ...s, phase: 'exchange', drawn: s.deck.slice(0, 2), deck: s.deck.slice(2) }, 0);
  }
}

/** A ação foi bloqueada: a vez passa (as moedas do Assassino ficam perdidas). */
function blocked(state: CoupState): CoupState {
  const d = state.declared!;
  const b = state.block!;
  return endTurn(logged(state, { t: 'blocked', actor: d.actor, kind: d.kind, by: b.by, as: b.as }));
}

/** Ninguém reagiu a tempo: a ação acontece, ou o bloqueio vale. */
function closeWindow(state: CoupState, ctx: GameContext): CoupState {
  return state.window!.kind === 'block' ? blocked(state) : resolveAction(state, ctx);
}

/** `player` perde uma carta: escolhe, ou perde direto se só tiver uma virada pra baixo. */
function startLoss(state: CoupState, player: string, reason: CoupLossReason, then: CoupThen, ctx: GameContext): CoupState {
  const s: CoupState = { ...state, phase: 'losing', window: null, loss: { player, reason, then } };
  const hidden = hiddenOf(s, player);
  return hidden.length === 1 ? loseCard(s, hidden[0]!, ctx) : s;
}

/** Vira a carta pra cima; sem carta escondida, o jogador sai. Sobrando um, ele vence; senão segue o que a perda interrompeu. */
function loseCard(state: CoupState, card: CoupCharacter, ctx: GameContext): CoupState {
  const { player, then } = state.loss!;
  const hand = state.hands[player]!;
  const i = hand.cards.findIndex((c) => !c.revealed && c.character === card);
  const cards = hand.cards.map((c, j) => (j === i ? { ...c, revealed: true } : c));
  const gone = cards.every((c) => c.revealed);
  let s = logged(
    { ...state, loss: null, hands: { ...state.hands, [player]: { coins: gone ? 0 : hand.coins, cards } } },
    { t: 'lose', player, card },
  );
  if (gone) s = logged({ ...s, out: [...s.out, player] }, { t: 'out', player });
  const left = alive(s);
  if (left.length === 1) return finish(s, left[0]!);
  switch (then) {
    case 'next':
      return endTurn(s);
    case 'resolve':
      return resolveAction(s, ctx);
    case 'blocked':
      return blocked(s);
    case 'proceed': {
      // Dúvida errada da ação: se ela ainda pode ser bloqueada, o alvo tem a janela só de bloqueio.
      const blockers = blockersOf(s, s.declared!);
      return blockers.length > 0 ? openWindow(s, 'blockOnly', blockers, ctx) : resolveAction(s, ctx);
    }
  }
}

/** Fecha a troca: `keep` fica na mão (no lugar das cartas viradas pra baixo), o resto volta pro baralho embaralhado. */
function finishExchange(state: CoupState, player: string, keep: CoupCharacter[], ctx: GameContext): CoupState {
  const hand = state.hands[player]!;
  const back = without([...hiddenOf(state, player), ...state.drawn], keep)!;
  const rest = [...keep];
  const cards = hand.cards.map((c) => (c.revealed ? c : { character: rest.shift()!, revealed: false }));
  return endTurn({
    ...state,
    deck: shuffle(ctx.rng, [...state.deck, ...back]),
    drawn: [],
    hands: { ...state.hands, [player]: { ...hand, cards } },
  });
}

/**
 * Fecha a janela de reação quando todos que podiam reagir deixaram ou o prazo acabou. Roda depois de cada ação e a
 * cada `tick` da sala (presença e alarme no prazo). Devolve o MESMO objeto quando nada muda (o servidor compara referência).
 */
export function settleCoup(state: CoupState, ctx: GameContext): CoupState {
  if (state.phase !== 'reaction' || state.window === null) return state;
  const w = state.window;
  const allPassed = w.eligible.every((p) => w.passed.includes(p));
  return allPassed || ctx.now >= w.endsAt ? closeWindow(state, ctx) : state;
}

/** Por que `playerId` não pode reagir na janela aberta (ou null se pode). */
function reactError(state: CoupState, playerId: string): string | null {
  if (state.phase !== 'reaction' || state.window === null) return 'window_closed';
  if (!state.players.includes(playerId)) return 'not_player';
  if (!state.window.eligible.includes(playerId)) return 'cannot_react';
  if (state.window.passed.includes(playerId)) return 'already_passed';
  return null;
}

const settled = (res: ActionResult<CoupState>, ctx: GameContext): ActionResult<CoupState> =>
  res.ok ? ok(settleCoup(res.state, ctx)) : res;

export function applyCoupAction(
  state: CoupState,
  playerId: string,
  action: CoupAction,
  ctx: GameContext,
): ActionResult<CoupState> {
  const isHost = ctx.hostId === playerId;
  switch (action.type) {
    case 'start':
      if (!isHost) return fail('not_host');
      if (state.phase !== 'lobby') return fail('bad_phase');
      return settled(startMatch(state, ctx), ctx);
    case 'restart':
      if (!isHost) return fail('not_host');
      if (state.phase !== 'over') return fail('bad_phase');
      return settled(startMatch(state, ctx), ctx);
    case 'act': {
      if (state.phase !== 'turn') return fail('bad_phase');
      if (!state.players.includes(playerId)) return fail('not_player');
      if (state.turn !== playerId) return fail('not_your_turn');
      const target = action.target ?? null;
      const e = actError(state, playerId, action.kind, target);
      if (e) return fail(e);
      return ok(settleCoup(declare(state, playerId, action.kind, target, ctx), ctx));
    }
    case 'pass': {
      const e = reactError(state, playerId);
      if (e) return fail(e);
      const w = state.window!;
      return ok(settleCoup({ ...state, window: { ...w, passed: [...w.passed, playerId] } }, ctx));
    }
    case 'challenge':
    case 'block':
      // Dúvidas e bloqueios entram na Task 4.
      return fail('bad_action');
    case 'lose':
      if (state.phase !== 'losing' || state.loss?.player !== playerId) return fail('not_losing');
      if (!hiddenOf(state, playerId).includes(action.card)) return fail('not_owner');
      return ok(settleCoup(loseCard(state, action.card, ctx), ctx));
    case 'exchange': {
      if (state.phase !== 'exchange') return fail('bad_phase');
      if (state.turn !== playerId) return fail('not_your_turn');
      const mine = hiddenOf(state, playerId);
      if (action.keep.length !== mine.length || without([...mine, ...state.drawn], action.keep) === null) {
        return fail('bad_exchange');
      }
      return ok(settleCoup(finishExchange(state, playerId, action.keep, ctx), ctx));
    }
    default:
      return fail('bad_action');
  }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test -w shared -- coup && npm run typecheck -w shared`
Expected: PASS em `coup-deck`, `coup-table` e `coup-rules`, sem erro de tipo.

- [ ] **Step 6: Commit**

```bash
git add shared/src/games/coup/rules.ts shared/test/coup-helpers.ts shared/test/coup-rules.test.ts
git commit -m "feat(shared): Cúpi — vez, janela de 10 s, perder carta, troca e fim de partida

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: dúvidas e bloqueios

**Files:**
- Modify: `shared/src/games/coup/rules.ts`
- Test: `shared/test/coup-challenge.test.ts`

- [ ] **Step 1: Escrever os testes que falham, `shared/test/coup-challenge.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { settleCoup } from '../src/games/coup/rules';
import { hiddenOf } from '../src/games/coup/table';
import { COUP_WINDOW_MS } from '../src/games/coup/types';
import { T0, THREE, act, allPass, cardsOf, ctxOf, ids, table, tryAct } from './coup-helpers';

const ctx = ctxOf(ids(3));

describe('Cúpi: dúvida da ação', () => {
  it('quem tinha a carta mostra, troca por outra do baralho, e quem duvidou perde; depois a ação acontece', () => {
    const start = table(THREE);
    let s = act(act(start, 'p0', { type: 'act', kind: 'tax' }, ctx), 'p1', { type: 'challenge' }, ctx);
    expect(s.log.at(-1)).toEqual({ t: 'challenge', by: 'p1', of: 'p0', claim: 'duke', had: true });
    expect(s.phase).toBe('losing');
    expect(s.loss).toEqual({ player: 'p1', reason: 'challengeWrong', then: 'proceed' });
    expect(hiddenOf(s, 'p0')).toHaveLength(2);
    expect(cardsOf(s)).toEqual(cardsOf(start));
    expect(tryAct(s, 'p2', { type: 'challenge' }, ctx)).toEqual({ ok: false, error: 'window_closed' });
    s = act(s, 'p1', { type: 'lose', card: 'contessa' }, ctx);
    expect(s.hands.p0!.coins).toBe(5);
    expect(s.turn).toBe('p1');
  });

  it('quem blefou perde uma carta e a ação não acontece', () => {
    let s = act(table(THREE, { turn: 'p1' }), 'p1', { type: 'act', kind: 'tax' }, ctx);
    s = act(s, 'p2', { type: 'challenge' }, ctx);
    expect(s.log.at(-1)).toEqual({ t: 'challenge', by: 'p2', of: 'p1', claim: 'duke', had: false });
    expect(s.loss).toEqual({ player: 'p1', reason: 'caught', then: 'next' });
    s = act(s, 'p1', { type: 'lose', card: 'assassin' }, ctx);
    expect(s.hands.p1!.coins).toBe(2);
    expect(s.turn).toBe('p2');
  });

  it('ajuda externa não tem o que duvidar', () => {
    const s = act(table(THREE), 'p0', { type: 'act', kind: 'foreignAid' }, ctx);
    expect(tryAct(s, 'p1', { type: 'challenge' }, ctx)).toEqual({ ok: false, error: 'cannot_react' });
  });

  it('Assassino pego blefando recebe as 3 moedas de volta', () => {
    let s = act(table(THREE, { coins: { p0: 3 } }), 'p0', { type: 'act', kind: 'assassinate', target: 'p1' }, ctx);
    s = act(s, 'p2', { type: 'challenge' }, ctx);
    expect(s.hands.p0!.coins).toBe(3);
    s = act(s, 'p0', { type: 'lose', card: 'captain' }, ctx);
    expect(hiddenOf(s, 'p1')).toHaveLength(2);
    expect(s.turn).toBe('p1');
  });

  it('o alvo duvida do Assassino e erra: perde uma, ganha a janela só de bloqueio e, deixando, perde a outra', () => {
    const start = table({ p0: ['assassin', 'captain'], p1: ['contessa', 'duke'], p2: ['ambassador', 'duke'] }, { coins: { p0: 3 } });
    let s = act(start, 'p0', { type: 'act', kind: 'assassinate', target: 'p1' }, ctx);
    s = act(s, 'p1', { type: 'challenge' }, ctx);
    s = act(s, 'p1', { type: 'lose', card: 'duke' }, ctx);
    expect(s.phase).toBe('reaction');
    expect(s.window).toEqual({ kind: 'blockOnly', eligible: ['p1'], passed: [], endsAt: T0 + COUP_WINDOW_MS });
    expect(tryAct(s, 'p1', { type: 'challenge' }, ctx)).toEqual({ ok: false, error: 'cannot_react' });
    s = act(s, 'p1', { type: 'pass' }, ctx);
    expect(s.out).toEqual(['p1']);
    expect(s.turn).toBe('p2');
  });

  it('na janela só de bloqueio o alvo pode bloquear com a Condessa', () => {
    const start = table({ p0: ['assassin', 'captain'], p1: ['contessa', 'duke'], p2: ['ambassador', 'duke'] }, { coins: { p0: 3 } });
    let s = act(start, 'p0', { type: 'act', kind: 'assassinate', target: 'p1' }, ctx);
    s = act(act(s, 'p2', { type: 'challenge' }, ctx), 'p2', { type: 'lose', card: 'duke' }, ctx);
    expect(s.window!.kind).toBe('blockOnly');
    s = act(s, 'p1', { type: 'block', as: 'contessa' }, ctx);
    expect(s.window).toMatchObject({ kind: 'block', eligible: ['p0', 'p2'] });
  });
});

describe('Cúpi: bloqueio', () => {
  it('extorsão: só o alvo bloqueia, e só como Capitão ou Embaixador', () => {
    const s = act(table(THREE), 'p0', { type: 'act', kind: 'steal', target: 'p1' }, ctx);
    expect(tryAct(s, 'p2', { type: 'block', as: 'captain' }, ctx)).toEqual({ ok: false, error: 'cannot_react' });
    expect(tryAct(s, 'p1', { type: 'block', as: 'duke' }, ctx)).toEqual({ ok: false, error: 'bad_block' });
    const b = act(s, 'p1', { type: 'block', as: 'ambassador' }, ctx);
    expect(b.block).toEqual({ by: 'p1', as: 'ambassador' });
    expect(b.log.at(-1)).toEqual({ t: 'block', by: 'p1', as: 'ambassador' });
    expect(b.window).toEqual({ kind: 'block', eligible: ['p0', 'p2'], passed: [], endsAt: T0 + COUP_WINDOW_MS });
    expect(tryAct(b, 'p1', { type: 'challenge' }, ctx)).toEqual({ ok: false, error: 'cannot_react' });
    expect(tryAct(b, 'p0', { type: 'block', as: 'captain' }, ctx)).toEqual({ ok: false, error: 'cannot_react' });
  });

  it('ajuda externa: qualquer um bloqueia como Duque; ninguém duvida, a ação é bloqueada', () => {
    let s = act(act(table(THREE), 'p0', { type: 'act', kind: 'foreignAid' }, ctx), 'p2', { type: 'block', as: 'duke' }, ctx);
    s = allPass(s, ctx);
    expect(s.hands.p0!.coins).toBe(2);
    expect(s.log.at(-1)).toEqual({ t: 'blocked', actor: 'p0', kind: 'foreignAid', by: 'p2', as: 'duke' });
    expect(s.turn).toBe('p1');
  });

  it('Assassino bloqueado pela Condessa: as 3 moedas ficam perdidas', () => {
    let s = act(table(THREE, { coins: { p0: 3 } }), 'p0', { type: 'act', kind: 'assassinate', target: 'p1' }, ctx);
    s = allPass(act(s, 'p1', { type: 'block', as: 'contessa' }, ctx), ctx);
    expect(s.hands.p0!.coins).toBe(0);
    expect(hiddenOf(s, 'p1')).toHaveLength(2);
  });

  it('bloqueio vale quando o prazo acaba', () => {
    const s = act(act(table(THREE), 'p0', { type: 'act', kind: 'steal', target: 'p1' }, ctx), 'p1', { type: 'block', as: 'captain' }, ctx);
    const done = settleCoup(s, ctxOf(ids(3), { now: T0 + COUP_WINDOW_MS }));
    expect(done.log.at(-1)).toMatchObject({ t: 'blocked' });
    expect(done.hands.p1!.coins).toBe(2);
  });
});

describe('Cúpi: dúvida do bloqueio', () => {
  it('quem bloqueou tinha a carta: quem duvidou perde e a ação fica bloqueada', () => {
    const start = table({ p0: ['duke', 'captain'], p1: ['captain', 'contessa'], p2: ['ambassador', 'duke'] });
    let s = act(act(start, 'p0', { type: 'act', kind: 'steal', target: 'p1' }, ctx), 'p1', { type: 'block', as: 'captain' }, ctx);
    s = act(s, 'p0', { type: 'challenge' }, ctx);
    expect(s.log.at(-1)).toEqual({ t: 'challenge', by: 'p0', of: 'p1', claim: 'captain', had: true });
    expect(s.loss).toEqual({ player: 'p0', reason: 'challengeWrong', then: 'blocked' });
    expect(cardsOf(s)).toEqual(cardsOf(start));
    s = act(s, 'p0', { type: 'lose', card: 'duke' }, ctx);
    expect(s.log.at(-1)).toMatchObject({ t: 'blocked', by: 'p1', as: 'captain' });
    expect(s.hands.p1!.coins).toBe(2);
    expect(s.turn).toBe('p1');
  });

  it('quem bloqueou blefou: perde uma carta e a ação acontece', () => {
    let s = act(act(table(THREE), 'p0', { type: 'act', kind: 'steal', target: 'p1' }, ctx), 'p1', { type: 'block', as: 'ambassador' }, ctx);
    s = act(s, 'p2', { type: 'challenge' }, ctx);
    expect(s.loss).toEqual({ player: 'p1', reason: 'caught', then: 'resolve' });
    s = act(s, 'p1', { type: 'lose', card: 'assassin' }, ctx);
    expect(s.hands.p0!.coins).toBe(4);
    expect(s.hands.p1!.coins).toBe(0);
    expect(s.turn).toBe('p1');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -w shared -- coup-challenge`
Expected: FAIL (`ação recusada: bad_action` nos testes que duvidam ou bloqueiam).

- [ ] **Step 3: Implementar em `shared/src/games/coup/rules.ts`**

No import de `./table`, acrescente `canBlock` e `canChallenge`:

```ts
import { actError, alive, blockersOf, canBlock, canChallenge, coinsOf, hiddenOf, isAlive, nextAlive, treasury, without } from './table';
```

Depois de `finishExchange`, acrescente:

```ts
/** A última carta `card` de `player` volta pro baralho, que é embaralhado, e ele compra outra (dúvida que falhou). */
function swapCard(state: CoupState, player: string, card: CoupCharacter, ctx: GameContext): CoupState {
  const hand = state.hands[player]!;
  const deck = shuffle(ctx.rng, [...state.deck, card]);
  const i = hand.cards.findIndex((c) => !c.revealed && c.character === card);
  const cards = hand.cards.map((c, j) => (j === i ? { character: deck[0]!, revealed: false } : c));
  return { ...state, deck: deck.slice(1), hands: { ...state.hands, [player]: { ...hand, cards } } };
}

/** `by` duvida de quem declarou (a ação, ou o bloqueio na janela do bloqueio). */
function challenge(state: CoupState, by: string, ctx: GameContext): CoupState {
  const onBlock = state.window!.kind === 'block';
  const d = state.declared!;
  const of = onBlock ? state.block!.by : d.actor;
  const claim = onBlock ? state.block!.as : COUP_CLAIM[d.kind]!;
  const had = hiddenOf(state, of).includes(claim);
  const s = logged({ ...state, window: null }, { t: 'challenge', by, of, claim, had });
  if (had) return startLoss(swapCard(s, of, claim, ctx), by, 'challengeWrong', onBlock ? 'blocked' : 'proceed', ctx);
  // Pego blefando: as moedas do Assassino voltam (só ficam perdidas quando ele é bloqueado).
  const refunded = !onBlock && d.kind === 'assassinate' ? withCoins(s, d.actor, COUP_COST.assassinate) : s;
  return startLoss(refunded, of, 'caught', onBlock ? 'resolve' : 'next', ctx);
}
```

Em `applyCoupAction`, troque o bloco

```ts
    case 'challenge':
    case 'block':
      // Dúvidas e bloqueios entram na Task 4.
      return fail('bad_action');
```

por

```ts
    case 'challenge': {
      const e = reactError(state, playerId);
      if (e) return fail(e);
      if (!canChallenge(state)) return fail('cannot_react');
      return ok(settleCoup(challenge(state, playerId, ctx), ctx));
    }
    case 'block': {
      const e = reactError(state, playerId);
      if (e) return fail(e);
      if (!canBlock(state, playerId)) return fail('cannot_react');
      if (!COUP_BLOCKERS[state.declared!.kind].includes(action.as)) return fail('bad_block');
      const s = logged({ ...state, block: { by: playerId, as: action.as } }, { t: 'block', by: playerId, as: action.as });
      return ok(settleCoup(openWindow(s, 'block', alive(s).filter((p) => p !== playerId), ctx), ctx));
    }
```

E no import de `./types`, acrescente `COUP_BLOCKERS` (logo antes de `COUP_CLAIM`).

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -w shared -- coup && npm run typecheck -w shared`
Expected: PASS em todos os `coup-*`, sem erro de tipo.

- [ ] **Step 5: Commit**

```bash
git add shared/src/games/coup/rules.ts shared/test/coup-challenge.test.ts
git commit -m "feat(shared): Cúpi — dúvidas, bloqueios e a janela só de bloqueio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: automático de quem está ausente

**Files:**
- Modify: `shared/src/games/coup/rules.ts` (`settleCoup`)
- Test: `shared/test/coup-auto.test.ts`

- [ ] **Step 1: Escrever os testes que falham, `shared/test/coup-auto.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { initialCoupState, settleCoup } from '../src/games/coup/rules';
import { hiddenOf } from '../src/games/coup/table';
import { THREE, act, allPass, ctxOf, ids, table } from './coup-helpers';

const all = ctxOf(ids(3));
const without = (gone: string) => ctxOf(ids(3).filter((p) => p !== gone));

describe('Cúpi: automático de quem está ausente', () => {
  it('nada a fazer: devolve o mesmo objeto', () => {
    const s = table(THREE);
    expect(settleCoup(s, all)).toBe(s);
  });

  it('na vez do ausente: renda', () => {
    const s = settleCoup(table(THREE), without('p0'));
    expect(s.hands.p0!.coins).toBe(3);
    expect(s.turn).toBe('p1');
  });

  it('ausente com 10 moedas: golpe num alvo sorteado', () => {
    const s = settleCoup(table(THREE, { coins: { p0: 10 } }), without('p0'));
    expect(s.hands.p0!.coins).toBe(3);
    expect(s.phase).toBe('losing');
    expect(['p1', 'p2']).toContain(s.loss!.player);
  });

  it('na janela, ausente conta como "deixa" na hora; se só faltava ele, resolve sem esperar', () => {
    let s = act(table(THREE), 'p0', { type: 'act', kind: 'tax' }, all);
    s = settleCoup(s, without('p2'));
    expect(s.window!.passed).toEqual(['p2']);
    s = act(s, 'p1', { type: 'pass' }, without('p2'));
    expect(s.hands.p0!.coins).toBe(5);
  });

  it('ausente que perde carta: uma sorteada (e a vez dele, se vier, também é automática)', () => {
    const s = act(table(THREE, { coins: { p0: 7 } }), 'p0', { type: 'act', kind: 'coup', target: 'p1' }, all);
    const done = settleCoup(s, without('p1'));
    expect(hiddenOf(done, 'p1')).toHaveLength(1);
    expect(done.hands.p1!.coins).toBe(3);
    expect(done.turn).toBe('p2');
  });

  it('ausente na própria troca: fica com as que tinha', () => {
    const s = allPass(act(table(THREE), 'p0', { type: 'act', kind: 'exchange' }, all), all);
    expect(s.phase).toBe('exchange');
    const done = settleCoup(s, without('p0'));
    expect(hiddenOf(done, 'p0')).toEqual(['duke', 'captain']);
    expect(done.deck).toHaveLength(s.deck.length + 2);
    expect(done.turn).toBe('p1');
  });

  it('todo mundo ausente: a partida termina sozinha', () => {
    const started = act(initialCoupState(), 'p0', { type: 'start' }, ctxOf(ids(6)));
    const done = settleCoup(started, ctxOf([]));
    expect(done.phase).toBe('over');
    expect(done.out).toHaveLength(5);
    expect(done.wins[done.winner!]).toBe(1);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -w shared -- coup-auto`
Expected: FAIL (a renda/golpe/carta automáticos não acontecem; o teste "nada a fazer" passa).

- [ ] **Step 3: Trocar `settleCoup` em `shared/src/games/coup/rules.ts`**

No import de `./types`, acrescente `COUP_MUST_COUP_AT` (depois de `COUP_MIN_PLAYERS`).

Troque a função `settleCoup` inteira (com o comentário de cima) por:

```ts
/** Teto de passos automáticos por chamada: todo mundo ausente ainda termina a partida, mas sem laço infinito. */
const AUTO_STEPS = 1000;

const away = (ctx: GameContext, player: string) => !ctx.active.includes(player);

/**
 * Um passo: fecha a janela (todos deixaram, ou o prazo acabou) ou joga por um ausente (mais de 30 s fora):
 * na vez dele, renda (golpe num alvo sorteado com 10+); na janela, "deixa"; perdendo, uma carta sorteada;
 * na troca, fica com as que tinha. Devolve o mesmo objeto se não há o que fazer.
 */
function settleOnce(state: CoupState, ctx: GameContext): CoupState {
  switch (state.phase) {
    case 'reaction': {
      const w = state.window!;
      const absent = w.eligible.filter((p) => !w.passed.includes(p) && away(ctx, p));
      const passed = absent.length > 0 ? [...w.passed, ...absent] : w.passed;
      const next = absent.length > 0 ? { ...state, window: { ...w, passed } } : state;
      const allPassed = w.eligible.every((p) => passed.includes(p));
      return allPassed || ctx.now >= w.endsAt ? closeWindow(next, ctx) : next;
    }
    case 'turn': {
      const p = state.turn!;
      if (!away(ctx, p)) return state;
      if (coinsOf(state, p) < COUP_MUST_COUP_AT) return declare(state, p, 'income', null, ctx);
      const others = alive(state).filter((x) => x !== p);
      return declare(state, p, 'coup', others[randomInt(ctx.rng, others.length)]!, ctx);
    }
    case 'losing': {
      const p = state.loss!.player;
      if (!away(ctx, p)) return state;
      const hidden = hiddenOf(state, p);
      return loseCard(state, hidden[randomInt(ctx.rng, hidden.length)]!, ctx);
    }
    case 'exchange': {
      const p = state.turn!;
      return away(ctx, p) ? finishExchange(state, p, hiddenOf(state, p), ctx) : state;
    }
    default:
      return state;
  }
}

/**
 * Fecha janelas e joga pelos ausentes até não haver o que fazer. Roda depois de cada ação e a cada `tick` da sala
 * (presença e alarme no prazo). Devolve o MESMO objeto quando nada muda (o servidor compara referência).
 */
export function settleCoup(input: CoupState, ctx: GameContext): CoupState {
  let state = input;
  for (let i = 0; i < AUTO_STEPS; i++) {
    const next = settleOnce(state, ctx);
    if (next === state) return state;
    state = next;
  }
  return state;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -w shared -- coup && npm run typecheck -w shared`
Expected: PASS em todos os `coup-*`, sem erro de tipo.

- [ ] **Step 5: Commit**

```bash
git add shared/src/games/coup/rules.ts shared/test/coup-auto.test.ts
git commit -m "feat(shared): Cúpi — automático de quem está ausente

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: visão com segredos, prazo e schema das ações

**Files:**
- Create: `shared/src/games/coup/view.ts`
- Create: `shared/src/games/coup/schema.ts`
- Test: `shared/test/coup-view.test.ts`

- [ ] **Step 1: Escrever os testes que falham, `shared/test/coup-view.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { initialCoupState } from '../src/games/coup/rules';
import { coupActionSchema } from '../src/games/coup/schema';
import type { CoupState } from '../src/games/coup/types';
import { coup, coupNextDeadline, coupViewFor } from '../src/games/coup/view';
import { T0, THREE, act, allPass, ctxOf, ids, table, withLost } from './coup-helpers';

const ctx = ctxOf(ids(3));

describe('Cúpi: visão', () => {
  it('cada um vê só as próprias cartas viradas pra baixo; quem assiste não vê nenhuma', () => {
    const s = withLost(table(THREE), 'p2', 0);
    const v0 = coupViewFor(s, 'p0');
    expect(v0.myCards).toEqual(['duke', 'captain']);
    expect(v0.seats).toEqual([
      { id: 'p0', coins: 2, hidden: 2, revealed: [], out: false },
      { id: 'p1', coins: 2, hidden: 2, revealed: [], out: false },
      { id: 'p2', coins: 2, hidden: 1, revealed: ['ambassador'], out: false },
    ]);
    expect(coupViewFor(s, 'p1').myCards).toEqual(['contessa', 'assassin']);
    expect(coupViewFor(s, null).myCards).toEqual([]);
    expect(coupViewFor(s, 'p9').myCards).toEqual([]);
    expect(v0.deckSize).toBe(9);
    expect(v0.treasury).toBe(44);
  });

  it('nada de baralho nem carta alheia escondida na visão', () => {
    // A única Condessa fora do baralho está com p1; o baralho tem as outras duas.
    const s = table({ p0: ['duke', 'captain'], p1: ['contessa', 'assassin'], p2: ['ambassador', 'duke'] });
    const v = coupViewFor(s, 'p0');
    expect(Object.keys(v)).not.toContain('deck');
    expect(Object.keys(v)).not.toContain('hands');
    expect(Object.keys(v)).not.toContain('drawn');
    expect(JSON.stringify(v)).not.toContain('contessa');
  });

  it('as cartas compradas na troca só aparecem pra quem troca', () => {
    const s = allPass(act(table(THREE), 'p0', { type: 'act', kind: 'exchange' }, ctx), ctx);
    expect(coupViewFor(s, 'p0').myDrawn).toEqual(s.drawn);
    expect(coupViewFor(s, 'p0').can.keep).toBe(2);
    expect(coupViewFor(s, 'p1').myDrawn).toEqual([]);
    expect(coupViewFor(s, 'p1').can.keep).toBe(0);
  });

  it('o que dá pra fazer na sua vez depende das moedas', () => {
    expect(coupViewFor(table(THREE), 'p0').can.act).toEqual(['income', 'foreignAid', 'tax', 'steal', 'exchange']);
    expect(coupViewFor(table(THREE, { coins: { p0: 7 } }), 'p0').can.act).toEqual([
      'income',
      'foreignAid',
      'coup',
      'tax',
      'assassinate',
      'steal',
      'exchange',
    ]);
    expect(coupViewFor(table(THREE, { coins: { p0: 10 } }), 'p0').can.act).toEqual(['coup']);
    expect(coupViewFor(table(THREE), 'p1').can.act).toEqual([]);
  });

  it('na janela: o alvo pode bloquear, os outros só duvidar, e quem agiu nada', () => {
    const s = act(table(THREE), 'p0', { type: 'act', kind: 'steal', target: 'p1' }, ctx);
    expect(coupViewFor(s, 'p1').can).toEqual({
      act: [],
      challenge: true,
      block: ['captain', 'ambassador'],
      pass: true,
      lose: false,
      keep: 0,
    });
    expect(coupViewFor(s, 'p2').can).toMatchObject({ challenge: true, block: [], pass: true });
    expect(coupViewFor(s, 'p0').can).toMatchObject({ challenge: false, block: [], pass: false });
    const passed = act(s, 'p2', { type: 'pass' }, ctx);
    expect(coupViewFor(passed, 'p2').can.pass).toBe(false);
  });

  it('perdendo carta: só quem perde vê o botão; o motivo é público', () => {
    const s = act(table(THREE, { coins: { p0: 7 } }), 'p0', { type: 'act', kind: 'coup', target: 'p1' }, ctx);
    expect(coupViewFor(s, 'p1').can.lose).toBe(true);
    expect(coupViewFor(s, 'p2').can.lose).toBe(false);
    expect(coupViewFor(s, 'p2').loss).toEqual({ player: 'p1', reason: 'coup' });
  });

  it('no fim aparecem as cartas do vencedor', () => {
    const over: CoupState = { ...table(THREE), phase: 'over', turn: null, winner: 'p2' };
    expect(coupViewFor(over, 'p0').winnerCards).toEqual(['ambassador', 'duke']);
    expect(coupViewFor(table(THREE), 'p0').winnerCards).toEqual([]);
  });

  it('prazo só com a janela aberta', () => {
    expect(coupNextDeadline(table(THREE))).toBeNull();
    expect(coupNextDeadline(act(table(THREE), 'p0', { type: 'act', kind: 'tax' }, ctx))).toBe(T0 + 10_000);
    expect(coupNextDeadline(initialCoupState())).toBeNull();
  });

  it('o módulo junta regras, visão e prazo', () => {
    expect(coup.id).toBe('coup');
    expect(coup.initialState()).toEqual(initialCoupState());
    expect(coup.nextDeadline).toBe(coupNextDeadline);
  });
});

describe('Cúpi: schema das ações', () => {
  it('aceita as ações válidas', () => {
    for (const a of [
      { type: 'start' },
      { type: 'restart' },
      { type: 'act', kind: 'income' },
      { type: 'act', kind: 'steal', target: 'p1' },
      { type: 'pass' },
      { type: 'challenge' },
      { type: 'block', as: 'contessa' },
      { type: 'lose', card: 'duke' },
      { type: 'exchange', keep: ['duke', 'captain'] },
    ]) {
      expect(coupActionSchema.safeParse(a).success).toBe(true);
    }
  });

  it('o id da janela chega às regras (não é descartado)', () => {
    expect(coupActionSchema.parse({ type: 'pass', windowId: 3 })).toEqual({ type: 'pass', windowId: 3 });
    expect(coupActionSchema.parse({ type: 'challenge', windowId: 3 })).toEqual({ type: 'challenge', windowId: 3 });
    expect(coupActionSchema.parse({ type: 'block', as: 'duke', windowId: 3 })).toEqual({ type: 'block', as: 'duke', windowId: 3 });
    expect(coupActionSchema.safeParse({ type: 'pass', windowId: -1 }).success).toBe(false);
    expect(coupActionSchema.safeParse({ type: 'pass', windowId: 1.5 }).success).toBe(false);
  });

  it('recusa ação, personagem ou troca inválidos', () => {
    for (const a of [
      { type: 'act', kind: 'fly' },
      { type: 'act', kind: 'steal', target: '' },
      { type: 'block', as: 'king' },
      { type: 'lose' },
      { type: 'exchange', keep: [] },
      { type: 'exchange', keep: ['duke', 'duke', 'duke'] },
      { type: 'dance' },
    ]) {
      expect(coupActionSchema.safeParse(a).success).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -w shared -- coup-view`
Expected: FAIL (`Cannot find module '../src/games/coup/schema'`).

- [ ] **Step 3: Criar `shared/src/games/coup/view.ts`**

```ts
import type { GameModule } from '../../game';
import { applyCoupAction, initialCoupState, settleCoup } from './rules';
import { actError, alive, canBlock, canChallenge, hiddenOf, own, treasury } from './table';
import {
  COUP_ACTION_KINDS,
  COUP_BLOCKERS,
  COUP_TARGETED,
  type CoupAction,
  type CoupCan,
  type CoupSeat,
  type CoupState,
  type CoupView,
} from './types';

const NOTHING: CoupCan = { act: [], challenge: false, block: [], pass: false, lose: false, keep: 0 };

/** O que `me` pode fazer agora (a mesa mostra só esses botões; as regras conferem de novo). */
function canFor(state: CoupState, me: string | null): CoupCan {
  if (me === null) return NOTHING;
  switch (state.phase) {
    case 'turn': {
      if (state.turn !== me) return NOTHING;
      const someone = alive(state).find((p) => p !== me) ?? null;
      return { ...NOTHING, act: COUP_ACTION_KINDS.filter((k) => actError(state, me, k, COUP_TARGETED[k] ? someone : null) === null) };
    }
    case 'reaction': {
      const w = state.window!;
      if (!w.eligible.includes(me) || w.passed.includes(me)) return NOTHING;
      return {
        ...NOTHING,
        pass: true,
        challenge: canChallenge(state),
        block: canBlock(state, me) ? [...COUP_BLOCKERS[state.declared!.kind]] : [],
      };
    }
    case 'losing':
      return { ...NOTHING, lose: state.loss?.player === me };
    case 'exchange':
      return { ...NOTHING, keep: state.turn === me ? hiddenOf(state, me).length : 0 };
    default:
      return NOTHING;
  }
}

function seatOf(state: CoupState, id: string): CoupSeat {
  const hand = own(state.hands, id);
  const cards = hand?.cards ?? [];
  return {
    id,
    coins: hand?.coins ?? 0,
    hidden: cards.filter((c) => !c.revealed).length,
    revealed: cards.filter((c) => c.revealed).map((c) => c.character),
    out: state.out.includes(id),
  };
}

/**
 * Única fronteira de segredo do Cúpi: cartas viradas pra baixo dos outros, o baralho e as compradas na troca
 * nunca saem daqui. A visão compartilha arrays/objetos com o estado (é serializada no socket); quem consome não deve mutar.
 */
export function coupViewFor(state: CoupState, viewerId: string | null): CoupView {
  const me = viewerId !== null && state.players.includes(viewerId) ? viewerId : null;
  return {
    phase: state.phase,
    match: state.match,
    players: state.players,
    seats: state.players.map((id) => seatOf(state, id)),
    turn: state.turn,
    declared: state.declared,
    block: state.block,
    window: state.window,
    loss: state.loss ? { player: state.loss.player, reason: state.loss.reason } : null,
    deckSize: state.deck.length,
    treasury: treasury(state),
    out: state.out,
    winner: state.winner,
    winnerCards: state.phase === 'over' && state.winner !== null ? hiddenOf(state, state.winner) : [],
    wins: state.wins,
    log: state.log,
    myCards: me !== null ? hiddenOf(state, me) : [],
    myDrawn: me !== null && state.phase === 'exchange' && state.turn === me ? state.drawn : [],
    can: canFor(state, me),
  };
}

/** O Cúpi só tem prazo com a janela de reação aberta. */
export function coupNextDeadline(state: CoupState): number | null {
  return state.phase === 'reaction' && state.window !== null ? state.window.endsAt : null;
}

export const coup: GameModule<CoupState, CoupAction, CoupView> = {
  id: 'coup',
  initialState: () => initialCoupState(),
  applyAction: applyCoupAction,
  viewFor: coupViewFor,
  onPresenceChange: settleCoup,
  nextDeadline: coupNextDeadline,
};
```

- [ ] **Step 4: Criar `shared/src/games/coup/schema.ts`**

```ts
import { z } from 'zod';
import { COUP_ACTION_KINDS, COUP_CHARACTERS, type CoupAction } from './types';

const character = z.enum(COUP_CHARACTERS);
/** Id da janela que o jogador viu (sem ele o zod descartaria o campo e a reação atrasada voltaria a valer). */
const windowId = z.number().int().nonnegative().optional();

export const coupActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start') }),
  z.object({ type: z.literal('restart') }),
  z.object({ type: z.literal('act'), kind: z.enum(COUP_ACTION_KINDS), target: z.string().min(1).max(64).optional() }),
  z.object({ type: z.literal('pass'), windowId }),
  z.object({ type: z.literal('challenge'), windowId }),
  z.object({ type: z.literal('block'), as: character, windowId }),
  z.object({ type: z.literal('lose'), card: character }),
  z.object({ type: z.literal('exchange'), keep: z.array(character).min(1).max(2) }),
]);

/** Falha a compilação se o schema divergir do tipo CoupAction. */
type Assert<T extends true> = T;
export type CoupActionSchemaMatches = Assert<z.infer<typeof coupActionSchema> extends CoupAction ? true : false>;
export type CoupActionTypeCovered = Assert<CoupAction extends z.infer<typeof coupActionSchema> ? true : false>;
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test -w shared -- coup && npm run typecheck -w shared`
Expected: PASS em todos os `coup-*`, sem erro de tipo.

- [ ] **Step 6: Commit**

```bash
git add shared/src/games/coup/view.ts shared/src/games/coup/schema.ts shared/test/coup-view.test.ts
git commit -m "feat(shared): Cúpi — visão com segredos, o que cada um pode fazer, prazo e schema

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: partidas sorteadas do começo ao fim

Teste de propriedade: jogadores que só olham a própria visão (`can`) jogam ao acaso; nenhuma jogada pode ser recusada, nenhuma carta some e toda partida termina.

**Files:**
- Test: `shared/test/coup-random.test.ts`

- [ ] **Step 1: Escrever o teste, `shared/test/coup-random.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { GameContext } from '../src/game';
import { fullDeck } from '../src/games/coup/deck';
import { applyCoupAction, initialCoupState } from '../src/games/coup/rules';
import { treasury } from '../src/games/coup/table';
import { COUP_TARGETED, type CoupAction, type CoupState } from '../src/games/coup/types';
import { coupViewFor } from '../src/games/coup/view';
import { mulberry32, randomInt, shuffle, type Rng } from '../src/rng';
import { T0, cardsOf, ids } from './coup-helpers';

/** Uma jogada sorteada pra `me`, só com o que a visão dele mostra (como um bot faria); null = nada a fazer. */
function randomMove(state: CoupState, me: string, rng: Rng): CoupAction | null {
  const view = coupViewFor(state, me);
  const can = view.can;
  if (can.lose) return { type: 'lose', card: view.myCards[randomInt(rng, view.myCards.length)]! };
  if (can.keep > 0) return { type: 'exchange', keep: shuffle(rng, [...view.myCards, ...view.myDrawn]).slice(0, can.keep) };
  if (can.act.length > 0) {
    const kind = can.act[randomInt(rng, can.act.length)]!;
    if (!COUP_TARGETED[kind]) return { type: 'act', kind };
    return { type: 'act', kind, target: can.targets[randomInt(rng, can.targets.length)]! };
  }
  if (!can.pass) return null;
  // Como o site: a reação leva o id da janela que o jogador viu.
  const windowId = view.window!.id;
  const r = rng();
  if (can.challenge && r < 0.15) return { type: 'challenge', windowId };
  if (can.block.length > 0 && r < 0.35) return { type: 'block', as: can.block[randomInt(rng, can.block.length)]!, windowId };
  return { type: 'pass', windowId };
}

function playOut(n: number, seed: number): CoupState {
  const rng = mulberry32(seed);
  const ctx: GameContext = { hostId: 'p0', active: ids(n), rng, now: T0 };
  const start = applyCoupAction(initialCoupState(), 'p0', { type: 'start' }, ctx);
  if (!start.ok) throw new Error(start.error);
  let state = start.state;
  const deck = [...fullDeck()].sort();
  for (let step = 0; step < 3000; step++) {
    if (state.phase === 'over') return state;
    const moves = state.players.flatMap((p) => {
      const move = randomMove(state, p, rng);
      return move ? [{ p, move }] : [];
    });
    if (moves.length === 0) throw new Error(`ninguém pode jogar na fase ${state.phase}`);
    const { p, move } = moves[randomInt(rng, moves.length)]!;
    const res = applyCoupAction(state, p, move, ctx);
    if (!res.ok) throw new Error(`${p} ${JSON.stringify(move)} recusada: ${res.error}`);
    state = res.state;
    expect(cardsOf(state)).toEqual(deck);
    expect(treasury(state)).toBeGreaterThanOrEqual(0);
    for (const q of state.players) expect(state.hands[q]!.coins).toBeGreaterThanOrEqual(0);
  }
  throw new Error('a partida não acabou');
}

describe('Cúpi: partidas sorteadas', () => {
  it.each([2, 3, 4, 5, 6])('com %i jogadores, 20 partidas terminam sem jogada recusada nem carta sumida', (n) => {
    for (let seed = 1; seed <= 20; seed++) {
      const state = playOut(n, seed * 31 + n);
      expect(state.winner).not.toBeNull();
      expect(state.out).toHaveLength(n - 1);
      expect(state.wins[state.winner!]).toBe(1);
    }
  });
});
```

- [ ] **Step 2: Rodar**

Run: `npm test -w shared -- coup-random`
Expected: PASS. Se falhar com "recusada" ou carta sumida, é bug nas regras: use a `superpowers:systematic-debugging`, reproduza com a semente que falhou num teste pequeno em `coup-rules`/`coup-challenge`, corrija em `rules.ts` e só então volte aqui.

- [ ] **Step 3: Commit**

```bash
git add shared/test/coup-random.test.ts
git commit -m "test(shared): Cúpi — partidas sorteadas do começo ao fim

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Cúpi no registro, na sala, no protocolo e no histórico (sem histórico ainda)

**Files:**
- Modify: `shared/src/games/registry.ts`
- Modify: `shared/src/room.ts`
- Modify: `shared/src/protocol.ts`
- Modify: `shared/src/history.ts`
- Modify: `shared/src/index.ts`
- Modify: `server/src/index.ts`
- Test: `shared/test/room-games.test.ts`

- [ ] **Step 1: Escrever os testes que falham em `shared/test/room-games.test.ts`**

No import de `../src/room`, acrescente `isCoupRoomView`. Acrescente também:

```ts
import { COUP_WINDOW_MS, type CoupState } from '../src/games/coup/types';
```

Troque o teste `conhece ITO, Dixit e Retratim` por:

```ts
  it('conhece ITO, Dixit, Retratim e Cúpi', () => {
    expect(Object.keys(GAMES)).toEqual(['ito', 'dixit', 'pictures', 'coup']);
    expect(GAMES.dixit.minPlayers).toBe(3);
    expect(GAMES.ito.liveCursors).toBe(true);
    expect(GAMES.dixit.liveCursors).toBe(false);
    expect(GAMES.pictures).toMatchObject({ minPlayers: 3, maxPlayers: 6, liveCursors: false, recordsHistory: false });
    expect(GAMES.coup).toMatchObject({ minPlayers: 2, maxPlayers: 6, liveCursors: false, recordsHistory: false });
    expect(isGameId('dixit')).toBe(true);
    expect(isGameId('pictures')).toBe(true);
    expect(isGameId('coup')).toBe(true);
    expect(isGameId('xadrez')).toBe(false);
    expect(isGameId(undefined)).toBe(false);
  });
```

Acrescente ao fim do arquivo (o `step` e o `rng` já existem no arquivo):

```ts
function coupRoom(n: number): Room {
  let room = createRoom('ABCD', 0, 'coup');
  for (let i = 0; i < n; i++) {
    const res = joinRoom(room, { token: `t${i}`, name: `P${i}`, color: PLAYER_COLORS[i]! }, `p${i}`, 0);
    if (!res.ok) throw new Error(res.error);
    room = res.room;
  }
  return room;
}

describe('sala de Cúpi', () => {
  it('é de Cúpi, cabe 6 e recusa o 7º', () => {
    const room = coupRoom(6);
    expect(isCoupRoomView(roomView(room, null))).toBe(true);
    expect(roomSummary(room)).toMatchObject({ game: 'coup', phase: 'lobby' });
    expect(joinRoom(room, { token: 't6', name: 'P6', color: PLAYER_COLORS[6]! }, 'p6', 0)).toEqual({ ok: false, error: 'room_full' });
  });

  it('o alarme acorda no fim da janela e o tick deixa a ação passar', () => {
    let room = coupRoom(2);
    room = step(room, 'p0', { type: 'start' }, 10);
    const game = () => room.game as CoupState;
    const first = game().turn!;
    room = step(room, first, { type: 'act', kind: 'tax' }, 10);
    expect(nextAlarmAt(room, 10)).toBe(10 + COUP_WINDOW_MS);
    expect(tick(room, 10 + COUP_WINDOW_MS - 1, rng).game.phase).toBe('reaction');
    room = tick(room, 10 + COUP_WINDOW_MS, rng);
    expect(game().phase).toBe('turn');
    // No jogo de 2 quem começa tem 1 moeda.
    expect(game().hands[first]!.coins).toBe(4);
  });

  it('a visão da sala esconde as cartas dos outros', () => {
    let room = coupRoom(2);
    room = step(room, 'p0', { type: 'start' }, 10);
    const view = roomView(room, 'p1');
    if (!isCoupRoomView(view)) throw new Error('sala de Cúpi');
    expect(view.game.myCards).toHaveLength(2);
    expect(view.game.seats.map((s) => s.hidden)).toEqual([2, 2]);
  });

  it('erros do Cúpi têm mensagem em português', () => {
    for (const code of [
      'not_your_turn',
      'not_enough_coins',
      'must_coup',
      'bad_target',
      'cannot_react',
      'already_passed',
      'window_closed',
      'not_losing',
      'bad_exchange',
      'bad_block',
    ]) {
      expect(ERROR_CODES).toContain(code);
      expect(errorMessage(code)).not.toBe('Algo deu errado.');
    }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -w shared -- room-games`
Expected: FAIL (`GAMES.coup` não existe, `isCoupRoomView` não existe).

- [ ] **Step 3: Registrar o jogo em `shared/src/games/registry.ts`**

Imports novos (junto dos outros):

```ts
import { coupActionSchema } from './coup/schema';
import { COUP_MAX_PLAYERS, COUP_MIN_PLAYERS, type CoupAction, type CoupState, type CoupView } from './coup/types';
import { coup } from './coup/view';
```

Troque as 5 linhas de ids e uniões por:

```ts
export const GAME_IDS = ['ito', 'dixit', 'pictures', 'coup'] as const;
export type GameId = (typeof GAME_IDS)[number];
export type GameState = ItoState | DixitState | PicturesState | CoupState;
export type GameView = ItoView | DixitView | PicturesView | CoupView;
export type GameAction = ItoAction | DixitAction | PicturesAction | CoupAction;
```

E acrescente a entrada depois de `pictures` em `GAMES`:

```ts
  coup: defineGame({
    id: 'coup',
    module: coup,
    actionSchema: coupActionSchema,
    minPlayers: COUP_MIN_PLAYERS,
    maxPlayers: COUP_MAX_PLAYERS,
    // Cursor em cima de um assento entregaria o alvo antes da hora.
    liveCursors: false,
    // O histórico do Cúpi (as partidas) vem no Plano C4.
    recordsHistory: false,
  }),
```

- [ ] **Step 4: Visão da sala em `shared/src/room.ts`**

Import novo (junto de `PicturesView`):

```ts
import type { CoupView } from './games/coup/types';
```

Depois de `isPicturesRoomView`, acrescente:

```ts
export type CoupRoomView = RoomView<CoupView> & { gameId: 'coup' };

export function isCoupRoomView(view: RoomView): view is CoupRoomView {
  return view.gameId === 'coup';
}
```

- [ ] **Step 5: Erros em `shared/src/protocol.ts`**

No fim de `ERROR_CODES` (depois de `'no_work',`), acrescente:

```ts
  'not_your_turn',
  'not_enough_coins',
  'must_coup',
  'bad_target',
  'cannot_react',
  'already_passed',
  'window_closed',
  'not_losing',
  'bad_exchange',
  'bad_block',
```

E no fim de `ERROR_MESSAGES` (depois de `no_work`), acrescente:

```ts
  not_your_turn: 'Não é a sua vez.',
  not_enough_coins: 'Faltam moedas pra essa ação.',
  must_coup: 'Com 10 moedas ou mais, só dá pra dar o golpe.',
  bad_target: 'Escolha outro alvo.',
  cannot_react: 'Você não pode fazer isso nesta jogada.',
  already_passed: 'Você já deixou passar.',
  window_closed: 'Alguém reagiu primeiro.',
  not_losing: 'Não é você que perde carta agora.',
  bad_exchange: 'Fique com o mesmo número de cartas que você tinha.',
  bad_block: 'Esse personagem não bloqueia essa ação.',
```

- [ ] **Step 6: Cúpi sem histórico em `shared/src/history.ts`**

Em `HistoryResponses`, depois de `pictures: never;`, acrescente:

```ts
  /** O Cúpi ainda não grava histórico (vem no Plano C4): a rota responde 404 antes de chegar aqui. */
  coup: never;
```

Em `pendingHistoryRecord`, depois do `case 'pictures':` (e do `return null;` dele), acrescente:

```ts
    case 'coup':
      return null; // o histórico do Cúpi vem no Plano C4
```

- [ ] **Step 7: Exports em `shared/src/index.ts`**

Antes de `export * from './games/registry';`, acrescente:

```ts
export * from './games/coup/types';
export { fullDeck as coupFullDeck } from './games/coup/deck';
export { applyCoupAction, initialCoupState, settleCoup } from './games/coup/rules';
export { coup, coupNextDeadline, coupViewFor } from './games/coup/view';
export { coupActionSchema } from './games/coup/schema';
```

- [ ] **Step 8: Caso `coup` no histórico do servidor, `server/src/index.ts`**

Em `historyPageOf`, depois do `case 'pictures':` (e do `throw` dele), acrescente:

```ts
    case 'coup':
      // sem `recordsHistory` a rota já respondeu 404; o histórico do Cúpi vem no Plano C4
      throw new Error('o Cúpi ainda não tem histórico');
```

- [ ] **Step 9: Rodar os testes e o typecheck do `shared` e do `server`**

Run: `npm test -w shared && npm run typecheck -w shared && npm run typecheck -w server`
Expected: todos PASS, sem erro de tipo. O typecheck do `web` vai acusar `web/src/games/catalog.ts` (falta `coup` no `Record<GameId, …>`) e o `switch` de `web/src/screens/GamePage.tsx`: isso é esperado e a Task 9 corrige. Se o typecheck do `shared`/`server` acusar outro `switch` exaustivo por jogo, acrescente um `case 'coup'` seguindo o do `pictures` ao lado.

- [ ] **Step 10: Commit**

```bash
git add shared/src/games/registry.ts shared/src/room.ts shared/src/protocol.ts shared/src/history.ts shared/src/index.ts server/src/index.ts shared/test/room-games.test.ts
git commit -m "feat(shared): Cúpi no registro de jogos, na sala e nos erros

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Cúpi na estante, "em breve"

**Files:**
- Modify: `web/src/games/catalog.ts`
- Modify: `web/src/screens/GamePage.tsx`
- Modify: `web/src/screens/shelf.css`
- Modify: `web/index.html`
- Test: `web/test/catalog.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Em `web/test/catalog.test.ts`, depois do teste `Retratim (o Pictures) aparece na estante…`, acrescente:

```ts
  it('Cúpi (o Coup) aparece na estante, mas ainda "em breve"', () => {
    const entry = catalogEntry('coup');
    expect(entry?.name).toBe('Cúpi');
    expect(entry?.players).toBe('2 a 6 pessoas');
    expect(entry?.playable).toBe(false);
    expect(entry?.hasHistory).toBe(false);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -w web -- catalog`
Expected: FAIL (`catalogEntry('coup')` sem `name`).

- [ ] **Step 3: Acrescentar o texto em `web/src/games/catalog.ts`**

Troque o comentário `// Nomes de vitrine: …` por:

```ts
// Nomes de vitrine: o ITO aparece como DITU, o Dixit como Diquisti, o Pictures como Retratim e o Coup como Cúpi; os ids internos não mudam.
```

E acrescente a entrada depois de `pictures` no `TEXT`:

```ts
  coup: {
    name: 'Cúpi',
    tagline: 'blefe, duvide e tome o poder',
    rules: [
      'Cada um tem 2 cartas secretas de personagem e 2 moedas.',
      'Na sua vez, faça uma ação. Algumas dizem que você é um personagem (Duque, Assassino, Capitão, Embaixador ou Condessa): pode ser verdade ou blefe.',
      'Os outros têm 10 segundos pra duvidar ou bloquear. Quem erra a dúvida, ou é pego blefando, perde uma carta.',
      'Com 7 moedas dá pra dar o golpe; com 10, é obrigatório. Quem perde as 2 cartas sai; o último com carta vence.',
    ],
    // A mesa (computador e celular) vem no Plano C2.
    playable: false,
  },
```

- [ ] **Step 4: Aba de histórico em `web/src/screens/GamePage.tsx`**

Em `HistoryTab`, depois do `case 'pictures':` (e do `return` dele), acrescente:

```tsx
    case 'coup':
      // o histórico do Cúpi vem no Plano C4
      return (
        <section className="panel">
          <p>O histórico do Cúpi vem em breve.</p>
        </section>
      );
```

- [ ] **Step 5: Capa da estante e fontes**

Em `web/index.html`, na `<link href="https://fonts.googleapis.com/css2?…">`, troque `&family=Quicksand:wght@500;600;700&display=swap` por `&family=Quicksand:wght@500;600;700&family=Bebas+Neue&family=Oswald:wght@400;500&display=swap`.

Em `web/src/screens/shelf.css`, depois do bloco `.cover-pictures::after { … }`, acrescente:

```css
/* Cúpi: cartaz de propaganda, papel creme com faixa vermelha no alto */
.cover-coup { background: linear-gradient(#c8312b 0 16px, #efe6d2 16px); color: #1d1a17; }
.cover-coup b { font: 400 48px/0.95 'Bebas Neue', Impact, sans-serif; letter-spacing: 0.03em; }
.cover-coup span { font: 400 14px/1.25 'Oswald', system-ui, sans-serif; color: #6b6152; }
```

E depois de `.cover-pictures.mini::before, .cover-pictures.mini::after { display: none; }`, acrescente:

```css
.cover-coup.mini { font: 400 22px/1 'Bebas Neue', Impact, sans-serif; }
```

- [ ] **Step 6: Rodar os testes e o typecheck**

Run: `npm test -w web && npm run typecheck`
Expected: todos PASS (inclusive `shelf` e `shelf-soon`); typecheck sem erro. Se o typecheck do `web` acusar outro `switch` exaustivo ou `Record<GameId, …>` sem `coup`, acrescente o caso seguindo o do `pictures` ao lado (sem mesa: nada de componente novo).

- [ ] **Step 7: Conferir a capa no navegador**

Suba o site numa porta livre (a 5173 costuma estar ocupada por outra sessão): crie uma entrada **temporária** em `.claude/launch.json` da pasta mãe com `"cwd"` apontando pra `web/` da worktree, `"runtimeExecutable": "npx.cmd"`, `"runtimeArgs": ["vite", "--port", "5191", "--strictPort"]`, `"port": 5191`; abra com `preview_start`, emule 1280×800 (`resize_window`) e confira que a capa do Cúpi aparece na estante com o selo "em breve", a faixa vermelha e o título em Bebas Neue. Tire um print e **remova a entrada temporária** do `launch.json`.

- [ ] **Step 8: Commit**

```bash
git add web/src/games/catalog.ts web/src/screens/GamePage.tsx web/src/screens/shelf.css web/index.html web/test/catalog.test.ts
git commit -m "feat(web): Cúpi na estante como \"em breve\"

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: servidor cria e joga sala de Cúpi

**Files:**
- Test: `server/test/coup.test.ts`

- [ ] **Step 1: Escrever o teste, `server/test/coup.test.ts`**

```ts
import { SELF } from 'cloudflare:test';
import type { CoupRoomView } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { joined, newGameRoom } from './helpers';

const playing = (r: CoupRoomView) => r.game.phase === 'turn';

describe('Cúpi no servidor', () => {
  it('POST /rooms { game: "coup" } cria a sala e o GET conta que é de Cúpi', async () => {
    const code = await newGameRoom('coup');
    const body = await (await SELF.fetch(`https://x/rooms/${code}`)).json();
    expect(body).toMatchObject({ exists: true, game: 'coup', phase: 'lobby' });
  });

  it('o histórico do Cúpi ainda não existe (vem no Plano C4)', async () => {
    const res = await SELF.fetch('https://x/history/coup');
    expect(res.status).toBe(404);
  });

  it('começa com 2: cada um vê só as próprias cartas e a mesma vez', async () => {
    const code = await newGameRoom('coup');
    const players = await joined(code, 2);
    players[0]!.client.send({ t: 'action', action: { type: 'start' } });
    const views = await Promise.all(players.map((p) => p.client.state<CoupRoomView>(playing)));
    for (const v of views) {
      expect(v.game.myCards).toHaveLength(2);
      expect(v.game.seats.map((s) => s.hidden)).toEqual([2, 2]);
      expect(v.game.deckSize).toBe(11);
    }
    expect(views[0]!.game.turn).toBe(views[1]!.game.turn);
  });

  it('jogar fora da vez volta erro em português', async () => {
    const code = await newGameRoom('coup');
    const players = await joined(code, 2);
    players[0]!.client.send({ t: 'action', action: { type: 'start' } });
    const view = await players[0]!.client.state<CoupRoomView>(playing);
    const other = players.find((p) => p.id !== view.game.turn)!;
    other.client.send({ t: 'action', action: { type: 'act', kind: 'income' } });
    const err = await other.client.next('error');
    expect(err).toMatchObject({ code: 'not_your_turn', message: 'Não é a sua vez.' });
  });
});
```

- [ ] **Step 2: Rodar**

Run: `npm test -w server -- coup`
Expected: PASS (o servidor delega tudo ao registro; nenhuma mudança em `server/src` além da Task 8). Se algum `state` estourar o tempo, confira com `npm test -w server -- pictures` se a suíte do servidor roda nessa máquina antes de mexer em código.

- [ ] **Step 3: Rodar a suíte inteira do servidor**

Run: `npm test -w server`
Expected: todos PASS.

- [ ] **Step 4: Commit**

```bash
git add server/test/coup.test.ts
git commit -m "test(server): sala de Cúpi pelo WebSocket

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: conferência final

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: README**

Na primeira linha de descrição do `README.md` (a que lista os jogos), acrescente depois do Diquisti: `e **Cúpi**, a nossa versão do Coup (id \`coup\`; regras prontas, mesa em construção)`. Ajuste a pontuação da frase pra continuar lendo bem.

- [ ] **Step 2: CLAUDE.md**

Na tabela de jogos do `CLAUDE.md`, acrescente a linha:

```markdown
| **Cúpi** (nosso Coup) | `coup` | regras prontas; mesa (computador e celular) em construção |
```

E troque `O id interno nunca muda: rotas, banco, registro e testes usam \`ito\`/\`dixit\`/\`pictures\`.` por `O id interno nunca muda: rotas, banco, registro e testes usam \`ito\`/\`dixit\`/\`pictures\`/\`coup\`.`

- [ ] **Step 3: Tudo junto**

Run: `npm test && npm run typecheck && npm run build -w web`
Expected: todos os testes PASS (shared, server, web), typecheck sem erro, build do site ok.

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: Cúpi na lista de jogos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Não fazer merge**

O C1 fica na branch `feat/cupi`, sem PR e sem merge (merge = publicar, e o Cúpi ainda não é jogável). Próximo passo: o protótipo com bots (`prototipo/coup/`), num plano próprio.
