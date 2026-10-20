# Tatubum: par de cada bicho — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada par de bicho do Tatubum ganha efeito próprio (Mico afana, Quati fuça, Tamanduá compra do fundo, Preguiça deixa pra depois, Capivara faz a roda), nas regras (`shared/`), nos bots e no protótipo.

**Architecture:** A jogada continua `par`; o efeito sai do tipo da 1ª carta (`kittensPairEffect`). Os efeitos moram num arquivo novo `pairs.ts`, chamado por `resolve.ts`. Quati e Preguiça abrem escolhas novas (`KittensChoice`), com o segredo resolvido em `view.ts`. A compra sai de `rules.ts` pra `draw.ts` (Tamanduá precisa dela dentro da resolução, e `rules.ts → settle.ts → resolve.ts` faria import circular).

**Tech Stack:** TypeScript, Vitest (`shared/`, `web/`), zod, esbuild (bundle do protótipo).

**Spec:** `docs/superpowers/specs/2026-10-19-tatubum-design.md`, seção "Par de cada bicho (pedido do Rafa, 2026-10-20)".

**Comandos** (rodar da raiz do worktree `.claude/worktrees/tatubum`; no Windows use `npm.cmd` se `npm` não achar):
- Testes do shared: `npm test -w shared` (ou `npx vitest run` dentro de `shared/`)
- Um arquivo: `npx vitest run test/kittens-pairs.test.ts` dentro de `shared/`
- Tipos: `npx tsc --noEmit -p shared` e `npx tsc --noEmit -p web`
- Testes do web: `npm test -w web`

---

## Arquivos

- Modify `shared/src/games/kittens/cards.ts` — `KittensPairEffect`, `kittensPairEffect()`.
- Modify `shared/src/games/kittens/types.ts` — escolhas `quati`/`preguica`, visão delas, eventos `delayed`/`passed`, `from: 'bottom'`, ação `choose.keep`.
- Modify `shared/src/games/kittens/schema.ts` — `keep`.
- Modify `shared/src/games/kittens/play.ts` — alvo só pra pares que precisam.
- Create `shared/src/games/kittens/draw.ts` — `drawCard` (topo ou fundo), tirado de `rules.ts`.
- Create `shared/src/games/kittens/pairs.ts` — `applyPair` (os 5 efeitos + par de ação).
- Modify `shared/src/games/kittens/turn.ts` — `moveCard` (sai de `resolve.ts`).
- Modify `shared/src/games/kittens/resolve.ts` — `case 'par'` chama `applyPair`.
- Modify `shared/src/games/kittens/choices.ts` — `takeFromHand`, `delayTop`, ao acaso.
- Modify `shared/src/games/kittens/rules.ts` — usa `draw.ts`; `choose` pra Quati/Preguiça.
- Modify `shared/src/games/kittens/settle.ts` — alvo do Quati que sai cancela a escolha.
- Modify `shared/src/games/kittens/view.ts` — `choiceView` com segredo por quem olha.
- Create `shared/test/kittens-pairs.test.ts`; Modify `shared/test/kittens-play.test.ts`, `kittens-combos.test.ts`, `kittens-fuzz.test.ts`.
- Modify `web/src/dev/kittensBots.ts`, `web/test/kittens-bots.test.ts`.
- Modify `prototipo/tatubum/bots.js`, `prototipo/tatubum/index.html`, `prototipo/tatubum/sprites.js`; rebuild `prototipo/tatubum/rules.js`.

---

### Task 1: Tipos, schema e alvo do par

**Files:**
- Modify: `shared/src/games/kittens/cards.ts`
- Modify: `shared/src/games/kittens/types.ts`
- Modify: `shared/src/games/kittens/schema.ts`
- Modify: `shared/src/games/kittens/play.ts`
- Modify: `shared/test/kittens-play.test.ts`
- Create: `shared/test/kittens-pairs.test.ts`

- [ ] **Step 1: Teste que falha** — crie `shared/test/kittens-pairs.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { kittensPairEffect } from '../src/games/kittens/cards';
import { settleKittens } from '../src/games/kittens/settle';
import { kittensViewFor } from '../src/games/kittens/view';
import { KITTENS_CHOICE_MS, type KittensAction, type KittensState } from '../src/games/kittens/types';
import { T0, act, ctxOf, ids, refuse, table } from './kittens-helpers';

const ctx = ctxOf(ids(3));
const at = (ms: number) => ctxOf(ids(3), { now: T0 + ms });
const hands = (): Record<string, string[]> => ({
  p0: ['mico-0', 'mico-1', 'quati-0', 'quati-1', 'tamandua-0', 'tamandua-1', 'preguica-0', 'preguica-1', 'capivara-0', 'capivara-1', 'favor-0'],
  p1: ['ataque-5', 'pular-5'],
  p2: ['espiar-5'],
});
/** Monte: o topo é o FIM do array. */
const DRAW = ['cafune-9', 'embaralhar-9', 'pular-9'];

const par = (cards: string[], target?: string): KittensAction => ({ type: 'play', cards, ...(target ? { target } : {}) });

/** p0 joga o par e a janela de 5 s passa sem Nem vem!. */
function resolved(
  cards: string[],
  target?: string,
  opts: { draw?: string[]; hands?: Record<string, string[]>; owed?: number } = {},
): KittensState {
  const s = act(table({ hands: opts.hands ?? hands(), draw: opts.draw ?? DRAW, owed: opts.owed }), 'p0', par(cards, target), ctx);
  return settleKittens(s, at(5000));
}

describe('efeito de cada par', () => {
  it('cada bicho tem o seu; par de carta de ação afana', () => {
    expect(kittensPairEffect('mico-3')).toBe('afana');
    expect(kittensPairEffect('quati-0')).toBe('fuca');
    expect(kittensPairEffect('tamandua-1')).toBe('lingua');
    expect(kittensPairEffect('preguica-2')).toBe('depois');
    expect(kittensPairEffect('capivara-4')).toBe('roda');
    expect(kittensPairEffect('ataque-0')).toBe('afana');
  });

  it('Mico, Quati e par de ação pedem alvo; Tamanduá, Preguiça e Capivara não', () => {
    const s = table({ hands: { ...hands(), p0: [...hands().p0!, 'ataque-0', 'ataque-1'] }, draw: DRAW });
    expect(refuse(s, 'p0', par(['mico-0', 'mico-1']), ctx)).toBe('bad_target');
    expect(refuse(s, 'p0', par(['quati-0', 'quati-1']), ctx)).toBe('bad_target');
    expect(refuse(s, 'p0', par(['ataque-0', 'ataque-1']), ctx)).toBe('bad_target');
    for (const cards of [['tamandua-0', 'tamandua-1'], ['preguica-0', 'preguica-1'], ['capivara-0', 'capivara-1']]) {
      expect(act(s, 'p0', par(cards, 'p1'), ctx).pending!.play).toEqual({ kind: 'par', cards, target: null, ask: null });
    }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run (em `shared/`): `npx vitest run test/kittens-pairs.test.ts`
Expected: FAIL — `kittensPairEffect` não existe.

- [ ] **Step 3: Implementar** — em `cards.ts`, no fim do arquivo:

```ts
/** Efeito de um par (spec "Par de cada bicho"): cada bicho tem o seu; par de carta que não é bicho = afana. */
export type KittensPairEffect = 'afana' | 'fuca' | 'lingua' | 'depois' | 'roda';

const PAIR_EFFECT: Record<(typeof KITTENS_BICHOS)[number], KittensPairEffect> = {
  mico: 'afana',
  quati: 'fuca',
  tamandua: 'lingua',
  preguica: 'depois',
  capivara: 'roda',
};

/** O efeito do par formado por cartas do tipo de `card`. */
export function kittensPairEffect(card: string): KittensPairEffect {
  const kind = kittensKindOf(card);
  return kind !== null && kind in PAIR_EFFECT ? PAIR_EFFECT[kind as keyof typeof PAIR_EFFECT] : 'afana';
}

/** Pares que roubam de alguém (precisam de alvo com carta na mão). */
export const kittensPairNeedsTarget = (card: string): boolean => ['afana', 'fuca'].includes(kittensPairEffect(card));
```

Atualize também o comentário de `KITTENS_BICHOS` para: `/** Os 5 bichos: sozinhos não fazem nada; em par, cada um tem efeito próprio (kittensPairEffect). */`

Em `types.ts`:

1. Troque o tipo `KittensChoice` por:

```ts
export type KittensChoice =
  /** Quem desarmou escolhe onde o `tatu` volta no monte. */
  | { kind: 'cafune'; who: string; tatu: string; deadline: number }
  /** `who` (o alvo do Favor) escolhe uma carta da mão pra dar pra `to`. */
  | { kind: 'favor'; who: string; to: string; deadline: number }
  /** `who` escolhe uma carta de `options` (o descarte de antes da jogada de 5 diferentes). */
  | { kind: 'cinco'; who: string; options: string[]; deadline: number }
  /** Par de Quati: `who` vê a mão de `from` e escolhe a carta que leva. */
  | { kind: 'quati'; who: string; from: string; deadline: number }
  /** Par de Preguiça: `who` vê a carta de cima do monte e decide se ela fica ou vai pro fundo. */
  | { kind: 'preguica'; who: string; deadline: number };
```

2. Troque `KittensChoiceView` por:

```ts
/** Escolha como os jogadores veem: sem o id do tatu escondido; mão do alvo e carta de cima só pra quem escolhe. */
export type KittensChoiceView =
  | { kind: 'cafune'; who: string; deadline: number }
  /** `options` = a mão do `from`, só pra quem escolhe (null pros outros). */
  | { kind: 'quati'; who: string; from: string; deadline: number; options: string[] | null }
  /** `card` = a carta de cima, só pra quem escolhe (null pros outros). */
  | { kind: 'preguica'; who: string; deadline: number; card: string | null }
  | Extract<KittensChoice, { kind: 'favor' | 'cinco' }>;
```

3. Em `KittensEvent`, troque as linhas de `draw`, `cafune` e `boom` e acrescente `delayed` e `passed`:

```ts
  /** `from: 'bottom'` = comprou do fundo (par de Tamanduá). */
  | { t: 'draw'; by: string; card: string | null; from?: 'bottom' }
  /** Comprou um Tatubum e usou o Desarme. */
  | { t: 'cafune'; by: string; from?: 'bottom' }
  | { t: 'hid'; by: string }
  | { t: 'boom'; by: string; from?: 'bottom' }
```

e, antes de `| { t: 'win'; by: string };`:

```ts
  /** Par de Preguiça: a carta de cima foi pro fundo (`moved`) ou ficou. Ninguém vê qual era. */
  | { t: 'delayed'; by: string; moved: boolean }
  /** Roda de capivara: `from` passou `card` pra `to` (só os dois veem). */
  | { t: 'passed'; from: string; to: string; card: string | null }
```

4. Em `KittensAction`, troque a linha de `choose` (e o comentário) por:

```ts
  /**
   * Desarme: `position` (0 = topo, tamanho do monte = fundo, ou 'random'); Favor, 5 diferentes e Quati: `card`;
   * Preguiça: `keep` (true = a carta de cima fica, false = vai pro fundo).
   */
  | { type: 'choose'; card?: string; position?: number | 'random'; keep?: boolean }
```

5. Atualize o comentário de `KITTENS_CHOICE_MS` para: `/** Prazo das escolhas pessoais (Desarme, Favor, 5 diferentes, Quati, Preguiça); depois o servidor escolhe. */`

Em `schema.ts`, no objeto de `choose`, acrescente depois de `position`:

```ts
    keep: z.boolean().optional(),
```

Em `play.ts`, troque o import da 1ª linha por:

```ts
import { KITTENS_ACTION_KINDS, kittensKindOf, kittensPairNeedsTarget, type KittensActionKind, type KittensCardKind } from './cards';
```

e o bloco do alvo por:

```ts
  let target: string | null = null;
  if (kind === 'favor' || kind === 'trio' || (kind === 'par' && kittensPairNeedsTarget(cards[0]!))) {
```

(o resto do bloco não muda).

- [ ] **Step 4: Ajustar os testes antigos que usavam par de Capivara com alvo** — em `shared/test/kittens-play.test.ts`:
  - No teste `'par, trio e 5 diferentes'`, a mão `hands()` não tem 2 micos. Troque o primeiro `expect` por um par de Mico, acrescentando `'mico-1'` à mão: mude a linha `'mico-0',` de `hands()` para `'mico-0', 'mico-1',` e o `expect` para:

```ts
    expect(act(s, 'p0', play({ cards: ['mico-0', 'mico-1'], target: 'p1' }), ctx).pending!.play).toEqual({
      kind: 'par',
      cards: ['mico-0', 'mico-1'],
      target: 'p1',
      ask: null,
    });
```

  - No `it.each` de `'alvo e pedido'`, troque as 4 linhas de `['capivara-0', 'capivara-1']` por `['mico-0', 'mico-1']` (mesmos alvos e mesmo erro `bad_target`).

- [ ] **Step 5: Rodar e ver passar**

Run (em `shared/`): `npx vitest run test/kittens-pairs.test.ts test/kittens-play.test.ts test/kittens-schema.test.ts`
Expected: PASS. (`kittens-combos.test.ts` ainda passa: o efeito do par só muda na Task 3.)
Run: `npx tsc --noEmit -p shared` — vai falhar em `view.ts` (`choiceView` não cobre os tipos novos) e em `choices.ts` (switch sem `quati`/`preguica`). Pra esta task ficar verde, faça o mínimo:
  - `view.ts`: troque `choiceView` pelo da Task 4, Step 3 (já pronto lá).
  - `choices.ts`: no fim do `switch` de `chooseAtRandom`, acrescente temporariamente `default: return { ...s, choice: null };` (a Task 4 e a Task 5 trocam por casos reais).
  - `rules.ts`: no `switch (c.kind)` de `choose`, acrescente temporariamente `default: return fail('bad_choice');`.
Rode de novo: `npx tsc --noEmit -p shared` → sem erros; `npx vitest run` → tudo passa.

- [ ] **Step 6: Commit**

```bash
git add shared/src/games/kittens shared/test/kittens-pairs.test.ts shared/test/kittens-play.test.ts
git commit -m "feat(tatubum): tipos do par de cada bicho e alvo só pra quem rouba"
```

---

### Task 2: Compra em `draw.ts` (topo ou fundo)

**Files:**
- Create: `shared/src/games/kittens/draw.ts`
- Modify: `shared/src/games/kittens/rules.ts`
- Modify: `shared/src/games/kittens/turn.ts`
- Modify: `shared/src/games/kittens/resolve.ts`

Refatoração sem mudar comportamento (os testes de compra existentes cobrem): a Task 3 usa o fundo.

- [ ] **Step 1: Criar `draw.ts`**:

```ts
import type { GameContext } from '../../game';
import { kittensKindOf } from './cards';
import { eliminate, logged, spendTurn } from './turn';
import { KITTENS_CHOICE_MS, type KittensState } from './types';

/**
 * `p` compra a de cima (ou a do fundo, no par de Tamanduá). Tatubum: com Desarme, abre a escolha de onde esconder;
 * sem, explode. Carta comum: gasta 1 turno.
 */
export function drawCard(s: KittensState, p: string, ctx: GameContext, from: 'top' | 'bottom' = 'top'): KittensState {
  const bottom = from === 'bottom';
  const card = bottom ? s.draw[0]! : s.draw.at(-1)!;
  const draw = bottom ? s.draw.slice(1) : s.draw.slice(0, -1);
  const where = bottom ? { from: 'bottom' as const } : {};
  const hand = s.hands[p]!;
  if (kittensKindOf(card) !== 'tatubum') {
    return spendTurn(logged({ ...s, draw, hands: { ...s.hands, [p]: [...hand, card] } }, { t: 'draw', by: p, card, ...where }, [p]));
  }
  const cafune = hand.find((c) => kittensKindOf(c) === 'cafune');
  if (cafune === undefined) return eliminate(logged({ ...s, draw }, { t: 'boom', by: p, ...where }), p, [card]);
  return logged(
    {
      ...s,
      draw,
      peek: null,
      hands: { ...s.hands, [p]: hand.filter((c) => c !== cafune) },
      discard: [...s.discard, cafune],
      choice: { kind: 'cafune', who: p, tatu: card, deadline: ctx.now + KITTENS_CHOICE_MS },
    },
    { t: 'cafune', by: p, ...where },
  );
}
```

- [ ] **Step 2: Tirar a compra de `rules.ts`** — apague a função `drawCard` inteira (e o comentário dela) de `rules.ts`; acrescente `import { drawCard } from './draw';`; tire `KITTENS_CHOICE_MS` do import de `./types` se ficar sem uso; tire `eliminate` e `logged`/`spendTurn` do import de `./turn` só se o compilador apontar sem uso (o `logged` continua usado em `play` e `nope`).

- [ ] **Step 3: Mover `moveCard` pra `turn.ts`** — apague `moveCard` de `resolve.ts` e acrescente em `turn.ts` (exportado):

```ts
/** Passa `card` da mão de `from` pra de `to`. */
export function moveCard(s: KittensState, from: string, to: string, card: string): KittensState {
  return { ...s, hands: { ...s.hands, [from]: s.hands[from]!.filter((c) => c !== card), [to]: [...s.hands[to]!, card] } };
}
```

Em `resolve.ts`, importe `moveCard` de `./turn`.

- [ ] **Step 4: Rodar tudo**

Run (em `shared/`): `npx tsc --noEmit -p .` e `npx vitest run`
Expected: sem erros de tipo; todos os testes passam (nada mudou de comportamento).

- [ ] **Step 5: Commit**

```bash
git add shared/src/games/kittens
git commit -m "refactor(tatubum): compra em draw.ts, do topo ou do fundo"
```

---

### Task 3: `pairs.ts` — Mico, Tamanduá e Capivara

**Files:**
- Create: `shared/src/games/kittens/pairs.ts`
- Modify: `shared/src/games/kittens/resolve.ts`
- Modify: `shared/test/kittens-pairs.test.ts`
- Modify: `shared/test/kittens-combos.test.ts`

- [ ] **Step 1: Testes que falham** — acrescente em `kittens-pairs.test.ts`:

```ts
describe('Mico: afana', () => {
  it('rouba uma carta ao acaso do alvo; só os dois veem qual', () => {
    const s = resolved(['mico-0', 'mico-1'], 'p1');
    expect(s.hands.p1).toHaveLength(1);
    const stolen = s.hands.p0!.find((c) => c === 'ataque-5' || c === 'pular-5');
    expect(stolen).toBeDefined();
    expect(s.log.at(-1)).toMatchObject({ ev: { t: 'stole', from: 'p1', to: 'p0', card: stolen }, seenBy: ['p1', 'p0'] });
    expect(s).toMatchObject({ current: 'p0', owed: 1 });
  });
});

describe('Tamanduá: língua comprida', () => {
  it('compra a carta do fundo e termina a vez', () => {
    const s = resolved(['tamandua-0', 'tamandua-1']);
    expect(s.hands.p0).toContain('cafune-9');
    expect(s.draw).toEqual(['embaralhar-9', 'pular-9']);
    expect(s).toMatchObject({ current: 'p1', owed: 1 });
    expect(s.log.at(-1)).toMatchObject({ ev: { t: 'draw', by: 'p0', card: 'cafune-9', from: 'bottom' }, seenBy: ['p0'] });
  });

  it('sob ataque, gasta só um dos turnos', () => {
    const s = resolved(['tamandua-0', 'tamandua-1'], undefined, { owed: 2 });
    expect(s).toMatchObject({ current: 'p0', owed: 1 });
  });

  it('Tatubum no fundo: com Desarme abre a escolha; sem, explode', () => {
    const tatuNoFundo = ['tatubum-0', 'embaralhar-9', 'pular-9'];
    const comDesarme = resolved(['tamandua-0', 'tamandua-1'], undefined, {
      draw: tatuNoFundo,
      hands: { ...hands(), p0: [...hands().p0!, 'cafune-0'] },
    });
    expect(comDesarme.choice).toMatchObject({ kind: 'cafune', who: 'p0', tatu: 'tatubum-0' });
    expect(comDesarme.log.at(-1)!.ev).toEqual({ t: 'cafune', by: 'p0', from: 'bottom' });
    const semDesarme = resolved(['tamandua-0', 'tamandua-1'], undefined, { draw: tatuNoFundo });
    expect(semDesarme.alive).not.toContain('p0');
    expect(semDesarme.log.map((e) => e.ev)).toContainEqual({ t: 'boom', by: 'p0', from: 'bottom' });
  });
});

describe('Capivara: roda', () => {
  it('cada vivo passa uma carta ao acaso pro próximo, todos ao mesmo tempo', () => {
    const before = hands();
    const s = resolved(['capivara-0', 'capivara-1']);
    const passes = s.log.filter((e) => e.ev.t === 'passed');
    expect(passes.map((e) => e.ev)).toEqual([
      expect.objectContaining({ from: 'p0', to: 'p1' }),
      expect.objectContaining({ from: 'p1', to: 'p2' }),
      expect.objectContaining({ from: 'p2', to: 'p0' }),
    ]);
    for (const { ev, seenBy } of passes) {
      if (ev.t !== 'passed') throw new Error('esperava passed');
      expect(seenBy).toEqual([ev.from, ev.to]);
      expect(before[ev.from]).toContain(ev.card);
      expect(s.hands[ev.to]).toContain(ev.card);
    }
    expect(s.hands.p0).toHaveLength(9); // 11 − 2 do par − 1 que deu + 1 que recebeu
    expect(s.hands.p1).toHaveLength(2);
    expect(s.hands.p2).toHaveLength(1);
    expect(s).toMatchObject({ current: 'p0', owed: 1 });
  });

  it('quem está sem carta só recebe', () => {
    const s = resolved(['capivara-0', 'capivara-1'], undefined, { hands: { ...hands(), p2: [] } });
    expect(s.log.filter((e) => e.ev.t === 'passed').map((e) => e.ev)).toEqual([
      expect.objectContaining({ from: 'p0', to: 'p1' }),
      expect.objectContaining({ from: 'p1', to: 'p2' }),
    ]);
    expect(s.hands.p2).toHaveLength(1);
    expect(s.hands.p0).toHaveLength(8);
  });

  it('quem não deu nem recebeu não vê a carta', () => {
    const s = resolved(['capivara-0', 'capivara-1']);
    const p0p1 = kittensViewFor(s, 'p2').log.find((e) => e.ev.t === 'passed' && e.ev.from === 'p0');
    expect(p0p1!.ev).toMatchObject({ t: 'passed', from: 'p0', to: 'p1', card: null });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run (em `shared/`): `npx vitest run test/kittens-pairs.test.ts`
Expected: FAIL — Tamanduá e Capivara ainda roubam ao acaso.

- [ ] **Step 3: Criar `pairs.ts`**:

```ts
import type { GameContext } from '../../game';
import { randomInt, type Rng } from '../../rng';
import { kittensPairEffect } from './cards';
import { drawCard } from './draw';
import { logged, moveCard, nextAlive } from './turn';
import { KITTENS_CHOICE_MS, type KittensPlay, type KittensState } from './types';

/** Roda de capivara: cada vivo com carta passa uma ao acaso pro próximo vivo, todos ao mesmo tempo (mãos de antes). */
function roda(s: KittensState, rng: Rng): KittensState {
  const passes = s.alive
    .filter((p) => s.hands[p]!.length > 0)
    .map((p) => {
      const hand = s.hands[p]!;
      return { from: p, to: nextAlive(s, p)!, card: hand[randomInt(rng, hand.length)]! };
    });
  const hands = { ...s.hands };
  for (const { from, card } of passes) hands[from] = hands[from]!.filter((c) => c !== card);
  for (const { to, card } of passes) hands[to] = [...hands[to]!, card];
  return passes.reduce((acc, x) => logged(acc, { t: 'passed', ...x }, [x.from, x.to]), { ...s, hands });
}

/** O efeito de um par que não foi cancelado (spec "Par de cada bicho"). */
export function applyPair(s: KittensState, by: string, play: KittensPlay, ctx: GameContext): KittensState {
  switch (kittensPairEffect(play.cards[0]!)) {
    case 'afana': {
      const hand = s.hands[play.target!]!;
      const card = hand[randomInt(ctx.rng, hand.length)]!;
      return logged(moveCard(s, play.target!, by, card), { t: 'stole', from: play.target!, to: by, card }, [play.target!, by]);
    }
    case 'fuca':
      return { ...s, choice: { kind: 'quati', who: by, from: play.target!, deadline: ctx.now + KITTENS_CHOICE_MS } };
    case 'lingua':
      return drawCard(s, by, ctx, 'bottom');
    case 'depois':
      return { ...s, choice: { kind: 'preguica', who: by, deadline: ctx.now + KITTENS_CHOICE_MS } };
    case 'roda':
      return roda(s, ctx.rng);
  }
}
```

- [ ] **Step 4: Usar em `resolve.ts`** — troque o `case 'par': { … }` inteiro de `applyEffect` por:

```ts
    case 'par':
      return applyPair(s, by, play, ctx);
```

Importe `applyPair` de `./pairs`; tire `randomInt` do import de `../../rng` se ficar sem uso.

- [ ] **Step 5: Ajustar o teste antigo de par** — em `shared/test/kittens-combos.test.ts`:
  - Em `hands()`, troque `'mico-0'` por `'mico-0', 'mico-1'`.
  - No teste `'par: rouba uma carta ao acaso; só os dois veem qual'`, troque `cards: ['capivara-0', 'capivara-1']` por `cards: ['mico-0', 'mico-1']` e o nome do teste por `'par de Mico: rouba uma carta ao acaso; só os dois veem qual'`.
  - Rode `npx vitest run test/kittens-combos.test.ts`; se algum teste de 5 diferentes contava o tamanho da mão do p0, ajuste o número (+1 pelo `mico-1`).

- [ ] **Step 6: Rodar e ver passar**

Run (em `shared/`): `npx vitest run test/kittens-pairs.test.ts test/kittens-combos.test.ts` → PASS (os testes de Quati e Preguiça ainda não existem). `npx tsc --noEmit -p .` → sem erros.

- [ ] **Step 7: Commit**

```bash
git add shared/src/games/kittens shared/test
git commit -m "feat(tatubum): par de Mico afana, Tamanduá compra do fundo, Capivara faz a roda"
```

---

### Task 4: Quati — fuça a mão do alvo

**Files:**
- Modify: `shared/src/games/kittens/choices.ts`
- Modify: `shared/src/games/kittens/rules.ts`
- Modify: `shared/src/games/kittens/settle.ts`
- Modify: `shared/src/games/kittens/view.ts`
- Modify: `shared/test/kittens-pairs.test.ts`

- [ ] **Step 1: Testes que falham** — acrescente em `kittens-pairs.test.ts`:

```ts
describe('Quati: fuça', () => {
  const fuca = () => resolved(['quati-0', 'quati-1'], 'p1');

  it('abre a escolha; só quem jogou vê a mão do alvo', () => {
    const s = fuca();
    expect(s.choice).toEqual({ kind: 'quati', who: 'p0', from: 'p1', deadline: T0 + 5000 + KITTENS_CHOICE_MS });
    expect(kittensViewFor(s, 'p0').choice).toEqual({ ...s.choice, options: ['ataque-5', 'pular-5'] });
    expect(kittensViewFor(s, 'p1').choice).toEqual({ ...s.choice, options: null });
    expect(kittensViewFor(s, 'p2').choice).toEqual({ ...s.choice, options: null });
    expect(kittensViewFor(s, null).choice).toEqual({ ...s.choice, options: null });
  });

  it('quem jogou escolhe a carta; só os dois veem qual', () => {
    const s = fuca();
    expect(refuse(s, 'p1', { type: 'choose', card: 'pular-5' }, at(5000))).toBe('not_your_choice');
    expect(refuse(s, 'p0', { type: 'choose', card: 'espiar-5' }, at(5000))).toBe('bad_choice');
    expect(refuse(s, 'p0', { type: 'choose' }, at(5000))).toBe('bad_choice');
    const took = act(s, 'p0', { type: 'choose', card: 'pular-5' }, at(5000));
    expect(took.hands.p1).toEqual(['ataque-5']);
    expect(took.hands.p0).toContain('pular-5');
    expect(took).toMatchObject({ choice: null, current: 'p0', owed: 1 });
    expect(took.log.at(-1)).toMatchObject({ ev: { t: 'stole', from: 'p1', to: 'p0', card: 'pular-5' }, seenBy: ['p1', 'p0'] });
  });

  it('sem escolha, no fim do prazo leva uma ao acaso', () => {
    const late = settleKittens(fuca(), at(5000 + KITTENS_CHOICE_MS));
    expect(late.choice).toBeNull();
    expect(late.hands.p1).toHaveLength(1);
  });

  it('se o alvo cai de vez, a escolha some', () => {
    const gone = settleKittens(fuca(), ctxOf(['p0', 'p2'], { now: T0 + 5000 }));
    expect(gone.alive).not.toContain('p1');
    expect(gone.choice).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run (em `shared/`): `npx vitest run test/kittens-pairs.test.ts -t Quati`
Expected: FAIL (escolha `quati` sem tratamento em `choose`, visão sem `options`).

- [ ] **Step 3: Implementar**

Em `choices.ts`, acrescente:

```ts
/** Par de Quati: `who` leva `card` da mão de `from`. Só os dois veem qual carta foi. */
export function takeFromHand(s: KittensState, c: Choice<'quati'>, card: string): KittensState {
  return logged({ ...moveCard(s, c.from, c.who, card), choice: null }, { t: 'stole', from: c.from, to: c.who, card }, [c.from, c.who]);
}
```

(importe `moveCard` de `./turn`) e, em `chooseAtRandom`, troque o `default` provisório da Task 1 por:

```ts
    case 'quati': {
      const hand = s.hands[c.from]!;
      return hand.length === 0 ? { ...s, choice: null } : takeFromHand(s, c, hand[randomInt(rng, hand.length)]!);
    }
    default:
      return { ...s, choice: null };
```

(o `default` some na Task 5.)

Em `rules.ts`, importe `takeFromHand` de `./choices` e, no `switch (c.kind)` do `choose`, antes do `default` provisório:

```ts
        case 'quati':
          if (action.card === undefined || !s.hands[c.from]!.includes(action.card)) return fail('bad_choice');
          return ok(takeFromHand(s, c, action.card));
```

Em `settle.ts`, troque a linha `else if (s.choice?.kind === 'favor' && s.choice.to === p) s = { ...s, choice: null };` por:

```ts
  // Quem ia receber o Favor, ou o alvo do Quati, saiu: a escolha perde o sentido.
  else if ((s.choice?.kind === 'favor' && s.choice.to === p) || (s.choice?.kind === 'quati' && s.choice.from === p)) {
    s = { ...s, choice: null };
  }
```

Em `view.ts`, troque a função `choiceView` (e o comentário dela) por:

```ts
/**
 * A escolha como `viewerId` vê: sem o id do tatu que está sendo escondido (com ele, quem assiste poderia saber onde o
 * tatu foi parar); a mão do alvo do Quati e a carta de cima da Preguiça só pra quem escolhe.
 */
function choiceView(state: KittensState, viewerId: string | null): KittensChoiceView | null {
  const c = state.choice;
  if (c === null) return null;
  const mine = viewerId !== null && viewerId === c.who;
  switch (c.kind) {
    case 'cafune': {
      const { kind, who, deadline } = c;
      return { kind, who, deadline };
    }
    case 'quati':
      return { ...c, options: mine ? (own(state.hands, c.from) ?? []) : null };
    case 'preguica':
      return { ...c, card: mine ? (state.draw.at(-1) ?? null) : null };
    default:
      return c;
  }
}
```

e na montagem da visão troque `choice: choiceView(state.choice),` por `choice: choiceView(state, viewerId),`. Tire `KittensChoice` do import de `./types` se ficar sem uso.

- [ ] **Step 4: Rodar e ver passar**

Run (em `shared/`): `npx vitest run` e `npx tsc --noEmit -p .`
Expected: PASS, sem erros de tipo.

- [ ] **Step 5: Commit**

```bash
git add shared/src/games/kittens shared/test/kittens-pairs.test.ts
git commit -m "feat(tatubum): par de Quati fuça a mão do alvo"
```

---

### Task 5: Preguiça — deixa pra depois

**Files:**
- Modify: `shared/src/games/kittens/choices.ts`
- Modify: `shared/src/games/kittens/rules.ts`
- Modify: `shared/test/kittens-pairs.test.ts`

- [ ] **Step 1: Testes que falham** — acrescente em `kittens-pairs.test.ts`:

```ts
describe('Preguiça: deixa pra depois', () => {
  const depois = () => resolved(['preguica-0', 'preguica-1']);

  it('abre a escolha; só quem jogou vê a carta de cima', () => {
    const s = depois();
    expect(s.choice).toEqual({ kind: 'preguica', who: 'p0', deadline: T0 + 5000 + KITTENS_CHOICE_MS });
    expect(kittensViewFor(s, 'p0').choice).toEqual({ ...s.choice, card: 'pular-9' });
    expect(kittensViewFor(s, 'p1').choice).toEqual({ ...s.choice, card: null });
    expect(JSON.stringify(kittensViewFor(s, 'p1'))).not.toContain('"pular-9"');
  });

  it('FUNDO: a de cima vai pro fundo; todos sabem que foi, ninguém sabe qual', () => {
    const s = act(depois(), 'p0', { type: 'choose', keep: false }, at(5000));
    expect(s.draw).toEqual(['pular-9', 'cafune-9', 'embaralhar-9']);
    expect(s).toMatchObject({ choice: null, current: 'p0', owed: 1 });
    expect(s.log.at(-1)).toEqual({ n: expect.any(Number), ev: { t: 'delayed', by: 'p0', moved: true }, seenBy: null });
  });

  it('FICA: nada muda no monte', () => {
    const s = act(depois(), 'p0', { type: 'choose', keep: true }, at(5000));
    expect(s.draw).toEqual(DRAW);
    expect(s.log.at(-1)!.ev).toEqual({ t: 'delayed', by: 'p0', moved: false });
  });

  it('sem escolha, a carta fica onde está', () => {
    expect(refuse(depois(), 'p0', { type: 'choose' }, at(5000))).toBe('bad_choice');
    const late = settleKittens(depois(), at(5000 + KITTENS_CHOICE_MS));
    expect(late.draw).toEqual(DRAW);
    expect(late.choice).toBeNull();
    expect(late.log.at(-1)!.ev).toEqual({ t: 'delayed', by: 'p0', moved: false });
  });

  it('mandar pro fundo apaga a espiada (o topo mudou)', () => {
    const s = act({ ...depois(), peek: { who: 'p0', cards: ['pular-9', 'embaralhar-9', 'cafune-9'] } }, 'p0', { type: 'choose', keep: false }, at(5000));
    expect(s.peek).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run (em `shared/`): `npx vitest run test/kittens-pairs.test.ts -t Preguiça`
Expected: FAIL (`choose` da Preguiça cai no `default` provisório → `bad_choice`).

- [ ] **Step 3: Implementar**

Em `choices.ts`, acrescente:

```ts
/** Par de Preguiça: a carta de cima fica (`keep`) ou vai pro fundo. Todos sabem se foi, ninguém sabe qual. */
export function delayTop(s: KittensState, c: Choice<'preguica'>, keep: boolean): KittensState {
  const draw = keep ? s.draw : [s.draw.at(-1)!, ...s.draw.slice(0, -1)];
  return logged({ ...s, draw, choice: null, peek: keep ? s.peek : null }, { t: 'delayed', by: c.who, moved: !keep });
}
```

e, em `chooseAtRandom`, troque o `default` provisório por:

```ts
    case 'preguica':
      // Sem resposta, a carta fica onde está (nada muda pra ninguém).
      return delayTop(s, c, true);
```

(o `switch` agora cobre todos os tipos; sem `default`.) Atualize o comentário de `chooseAtRandom` para `/** Prazo vencido (ou quem escolhe caiu de vez): o servidor escolhe ao acaso (a Preguiça deixa a carta onde está). */`

Em `rules.ts`, importe `delayTop` de `./choices` e troque o `default` provisório do `switch (c.kind)` por:

```ts
        case 'preguica':
          if (action.keep === undefined) return fail('bad_choice');
          return ok(delayTop(s, c, action.keep));
```

- [ ] **Step 4: Rodar e ver passar**

Run (em `shared/`): `npx vitest run` e `npx tsc --noEmit -p .`
Expected: PASS, sem erros de tipo.

- [ ] **Step 5: Commit**

```bash
git add shared/src/games/kittens shared/test/kittens-pairs.test.ts
git commit -m "feat(tatubum): par de Preguiça deixa a carta de cima pra depois"
```

---

### Task 6: Fuzz com as escolhas novas

**Files:**
- Modify: `shared/test/kittens-fuzz.test.ts`

- [ ] **Step 1: Ensinar o fuzz a responder Quati e Preguiça** — em `randomAction`, troque o bloco da escolha por:

```ts
  if (c && c.who === p && r() < 0.8) {
    if (c.kind === 'cafune') return { type: 'choose', position: r() < 0.2 ? 'random' : Math.floor(r() * (s.draw.length + 2)) };
    if (c.kind === 'favor') return { type: 'choose', card: pick(r, hand) ?? 'ataque-0' };
    if (c.kind === 'quati') return { type: 'choose', card: pick(r, s.hands[c.from] ?? []) ?? 'ataque-0' };
    if (c.kind === 'preguica') return { type: 'choose', keep: r() < 0.5 };
    return { type: 'choose', card: pick(r, c.options) ?? 'ataque-0' };
  }
```

- [ ] **Step 2: Segredo com as escolhas novas** — na conferência de segredo, troque as linhas de `secret`/`leaked` por:

```ts
  // Quem joga a Preguiça vê a carta de cima; quem espiou vê as 3 de cima (aqui: o monte todo liberado pra ele).
  const sees = (c: string) =>
    (viewer !== null && viewer === s.peek?.who) || (s.choice?.kind === 'preguica' && viewer === s.choice.who && c === s.draw.at(-1));
  const secret = [...s.draw.filter((c) => !sees(c)), ...(s.choice?.kind === 'cafune' ? [s.choice.tatu] : [])];
  // Mão do alvo do Quati: só quem escolhe vê.
  if (s.choice?.kind === 'quati' && viewer !== s.choice.who && viewer !== s.choice.from) secret.push(...(s.hands[s.choice.from] ?? []));
  const leaked = secret.filter((c) => json.includes(`"${c}"`));
```

Atenção: a mão do alvo pode aparecer pra um terceiro no diário só se ele estava no `seenBy` de um evento antigo daquela carta. Se o fuzz acusar vazamento nesse caso, restrinja a checagem ao campo `choice` da visão: troque `json` por `JSON.stringify(kittensViewFor(s, viewer).choice)` só nessa linha da mão do alvo (separe em duas checagens: a do monte com `json`, a do Quati com o `choice`).

- [ ] **Step 3: Rodar**

Run (em `shared/`): `npx vitest run test/kittens-fuzz.test.ts` e depois `npx vitest run`
Expected: PASS (as 900 partidas acabam, nenhuma carta some/duplica, nada vaza).

- [ ] **Step 4: Commit**

```bash
git add shared/test/kittens-fuzz.test.ts
git commit -m "test(tatubum): fuzz com Quati e Preguiça"
```

---

### Task 7: Bots (site e protótipo)

**Files:**
- Modify: `web/src/dev/kittensBots.ts`
- Modify: `web/test/kittens-bots.test.ts`
- Modify: `prototipo/tatubum/bots.js`

- [ ] **Step 1: Testes que falham** — acrescente em `web/test/kittens-bots.test.ts`, dentro do `describe`:

```ts
  it('escolha do Quati: leva a melhor carta da mão do alvo', () => {
    const v = p1View(['mico-1'], {
      current: 'p1',
      choice: { kind: 'quati', who: 'p1', from: 'p0', deadline: 9000, options: ['capivara-3', 'cafune-2'] },
    });
    expect(decideKittens(v, newKittensMemory(), () => 0.5)!.action).toEqual({ type: 'choose', card: 'cafune-2' });
  });

  it('escolha da Preguiça: manda Tatubum pro fundo e deixa o resto', () => {
    const choice = (card: string) => ({ kind: 'preguica' as const, who: 'p1', deadline: 9000, card });
    const tatu = p1View([], { current: 'p1', choice: choice('tatubum-0') });
    expect(decideKittens(tatu, newKittensMemory(), () => 0.5)!.action).toEqual({ type: 'choose', keep: false });
    const calm = p1View([], { current: 'p1', choice: choice('pular-0') });
    expect(decideKittens(calm, newKittensMemory(), () => 0.5)!.action).toEqual({ type: 'choose', keep: true });
  });

  it('par de Capivara, Tamanduá e Preguiça vai sem alvo', () => {
    const v = withGame(viewOf(started(3), 'p0'), { hand: ['capivara-0', 'capivara-1'], peek: null });
    const d = decideKittens(v, newKittensMemory(), () => 0)!;
    expect(d.action).toEqual({ type: 'play', cards: ['capivara-0', 'capivara-1'] });
  });
```

(Antes de rodar, confira como o arquivo monta a jogada do bot: se `decideKittens` devolve `{ type: 'play', ...play }`, o último `expect` vale como está; com `rng = () => 0` o bot sempre quer jogar e escolhe a 1ª opção. Se a 1ª opção não for o par por causa da ordem de `options`, ajuste a mão do teste pra só ter o par.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -w web -- kittens-bots` (ou `npx vitest run test/kittens-bots.test.ts` dentro de `web/`)
Expected: FAIL.

- [ ] **Step 3: Implementar em `kittensBots.ts`**

No topo, importe `kittensPairNeedsTarget` de `@cartolina/shared` (junto dos outros imports).

Em `choosePlay`, troque o laço `for (const b of BICHOS) { … }` por:

```ts
  for (const b of BICHOS) {
    const list = byKind.get(b) ?? [];
    if (list.length >= 3 && targets.length && rng() < 0.5) {
      options.push({ cards: list.slice(0, 3), target: pickOne(rng, targets), ask: pickOne(rng, ASKS) });
    } else if (list.length >= 2) {
      if (!kittensPairNeedsTarget(list[0]!)) options.push({ cards: list.slice(0, 2) });
      else if (targets.length) options.push({ cards: list.slice(0, 2), target: pickOne(rng, targets) });
    }
  }
```

e, no bloco "Espiou e o de cima é tatu: foge.", depois do `for` das cartas de ação, acrescente:

```ts
    const fundo = byKind.get('tamandua');
    if (fundo && fundo.length >= 2) return { cards: fundo.slice(0, 2) };
```

Em `decideKittens`, no bloco `if (g.choice && g.choice.who === me) { … }`, troque o trecho final (de `if (!c.options.length) return null;` até o `return` do `cinco`) por:

```ts
    const pref: KittensCardKind[] = ['cafune', 'nemvem', 'ataque', 'pular', 'espiar'];
    const best = (options: string[]) => pref.map((k) => options.find((x) => kittensKindOf(x) === k)).find(Boolean) ?? pickOne(rng, options);
    if (c.kind === 'preguica') {
      const keep = c.card === null || kittensKindOf(c.card) !== 'tatubum';
      return { key, delay: between(rng, 900, 1600), action: { type: 'choose', keep } };
    }
    const options = c.kind === 'quati' ? (c.options ?? []) : c.options;
    if (!options.length) return null;
    return { key, delay: between(rng, 900, 1600), action: { type: 'choose', card: best(options) } };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -w web -- kittens-bots` e `npx tsc --noEmit -p web`
Expected: PASS, sem erros de tipo.

- [ ] **Step 5: Bots do protótipo** — em `prototipo/tatubum/bots.js`:
  - Logo no começo do arquivo (perto de `BICHOS`), acrescente:

```js
  /** Pares que roubam de alguém (espelho de kittensPairNeedsTarget). */
  const PAIR_NEEDS_TARGET = new Set(['mico', 'quati']);
```

  - No laço dos bichos de `choosePlay`, troque o `else if (list.length >= 2 && tgs.length) { … }` por:

```js
      } else if (list.length >= 2) {
        if (!PAIR_NEEDS_TARGET.has(b)) options.push({ cards: list.slice(0, 2) });
        else if (tgs.length) options.push({ cards: list.slice(0, 2), target: pick(tgs) });
      }
```

  - No bloco "Espiou e o de cima é tatu: foge.", depois do `for`, acrescente:

```js
      if ((byKind.tamandua?.length ?? 0) >= 2) return { cards: byKind.tamandua.slice(0, 2) };
```

  - Em `decide`, dentro de `if (v.choice && v.choice.who === me)`, antes do trecho do `pref` (5 diferentes), acrescente:

```js
        if (c.kind === 'preguica') {
          const keep = !c.card || kind(c.card) !== 'tatubum';
          return { action: { type: 'choose', keep }, delay: between(900, 1600) };
        }
```

  e troque as duas linhas finais (`const best = …` e o `return`) por:

```js
        const options = c.kind === 'quati' ? (c.options ?? []) : c.options;
        if (!options.length) return null;
        const best = pref.map((k) => options.find((x) => kind(x) === k)).find(Boolean) ?? pick(options);
        return { action: { type: 'choose', card: best }, delay: between(900, 1600) };
```

- [ ] **Step 6: Commit**

```bash
git add web/src/dev/kittensBots.ts web/test/kittens-bots.test.ts prototipo/tatubum/bots.js
git commit -m "feat(tatubum): bots sabem jogar os pares novos"
```

---

### Task 8: Protótipo — jogar, escolher, ver e entender

**Files:**
- Modify: `prototipo/tatubum/_entry.ts`
- Modify: `prototipo/tatubum/index.html`
- Modify: `prototipo/tatubum/sprites.js`
- Rebuild: `prototipo/tatubum/rules.js`

- [ ] **Step 1: Exportar o efeito do par pro protótipo** — em `prototipo/tatubum/_entry.ts`, troque a linha de `cards` por:

```ts
export { KITTENS_CARD_KINDS, KITTENS_CARD_NAMES, kittensKindOf, kittensPairEffect, kittensPairNeedsTarget } from '../../shared/src/games/kittens/cards';
```

e rebuild (da raiz do worktree):

```bash
./node_modules/.bin/esbuild prototipo/tatubum/_entry.ts --bundle --format=iife --global-name=Tatubum --target=es2020 --outfile=prototipo/tatubum/rules.js "--banner:js=// Gerado com esbuild a partir de prototipo/tatubum/_entry.ts (não editar à mão)."
```

- [ ] **Step 2: Alvo só quando o par rouba** — em `index.html`:
  - Troque `const needsTarget = (kind) => kind === 'favor' || kind === 'par' || kind === 'trio';` por:

```js
/** Favor, trio e os pares que roubam (Mico, Quati, par de ação) pedem um adversário. */
const needsTarget = (kind, ids) => kind === 'favor' || kind === 'trio' || (kind === 'par' && T.kittensPairNeedsTarget(ids[0]));
```

  - Em `dropPlay`, troque `if (needsTarget(kind)) {` por `if (needsTarget(kind, ids)) {`.
  - Em `playSelected`, troque `if (kind === 'favor' || kind === 'par' || kind === 'trio') {` por `if (needsTarget(kind, play.cards)) {`.

- [ ] **Step 3: Painéis do Quati e da Preguiça** — em `renderPanel`, depois do bloco `else if (c.kind === 'cinco') { … }`, acrescente:

```js
  } else if (c.kind === 'quati') {
    panel.innerHTML = `<h2>FUÇANDO A MÃO DE ${nameOf(c.from).toUpperCase()} ${timer}</h2><p>Escolha a carta que você leva.</p><div class="cards"></div>`;
    const row = panel.querySelector('.cards');
    (c.options ?? []).forEach((id) => {
      const el = cardEl(id);
      el.onclick = () => dispatch(ME, { type: 'choose', card: id });
      row.appendChild(el);
    });
  } else if (c.kind === 'preguica') {
    panel.innerHTML = `<h2>DEIXA PRA DEPOIS? ${timer}</h2><p>Só você vê a carta de cima do monte.</p><div class="cards"></div><div class="row"></div>`;
    if (c.card) panel.querySelector('.cards').appendChild(cardEl(c.card));
    const row = panel.querySelector('.row');
    row.appendChild(button('FICA EM CIMA', () => dispatch(ME, { type: 'choose', keep: true }), 'small'));
    row.appendChild(button('PRO FUNDO', () => dispatch(ME, { type: 'choose', keep: false }), 'yellow'));
```

(o `}` que fecha o último `else if` continua o mesmo que fechava o `cinco`.)

- [ ] **Step 4: Diário** — em `rawText`:
  - Troque o `case 'draw'` por:

```js
    case 'draw': {
      const where = ev.from === 'bottom' ? ' do fundo' : '';
      return ev.card ? `Você comprou ${cardName(kindOf(ev.card))}${where}` : `${n(ev.by)} comprou uma carta${where}`;
    }
```

  - No objeto do `case 'resolved'`, troque `par: \`${whose('PAR')} valeu!\`,` por:

```js
        par: `${whose(PAIR_LABEL[T.kittensPairEffect(prevPending?.play.cards[0] ?? 'ataque-0')])} valeu!`,
```

  - Antes de `case 'win'`, acrescente:

```js
    case 'delayed': return ev.moved ? `${n(ev.by)} mandou a carta de cima pro fundo` : `${n(ev.by)} deixou a carta de cima onde estava`;
    case 'passed': return ev.card ? `${n(ev.from)} passou ${cardName(kindOf(ev.card))} pra ${n(ev.to)}` : `${n(ev.from)} passou uma carta pra ${n(ev.to)}`;
```

  - Perto de `PLAY_LABEL`, acrescente:

```js
/** Nome do par no diário, pelo efeito. */
const PAIR_LABEL = { afana: 'PAR DE MICO', fuca: 'PAR DE QUATI', lingua: 'PAR DE TAMANDUÁ', depois: 'PAR DE PREGUIÇA', roda: 'RODA DE CAPIVARA' };
```

  Confira se `prevPending` chega em `textOf` pros eventos `resolved` (é o mesmo usado no texto do Favor); se não chegar, use `'PAR'`.

- [ ] **Step 5: Animações** — na fila de efeitos:
  - Junte `'passed'` ao grupo `case 'gave': case 'stole': case 'asked': case 'picked':` (vira `case 'passed':` antes do bloco). O código já lê `ev.from`, `ev.to` e `ev.card` (de verso quando `card` é null). Pra roda não demorar com 8 jogadores, use `dur: ev.t === 'passed' ? 360 : 520` no `Fx.fly`.
  - Acrescente antes de `case 'win'`:

```js
    case 'delayed': {
      say(text);
      Sound.play('card');
      if (ev.moved) {
        const deck = $('#deck .stack');
        await Fx.fly({ node: cardEl(null, { back: true }), from: deck, to: deck, dur: 520, arc: 70 });
      } else {
        await Fx.wait(500);
      }
      break;
    }
```

  (se `Fx.fly` não aceitar `arc`, tire a opção; o importante é a carta sair do monte e voltar.)

- [ ] **Step 6: Textos das cartas** — 
  - Em `sprites.js`, troque os `hint` dos 5 bichos (linhas `capivara:` … `preguica:`) por:

```js
    capivara: { band: '#3b8a4a', hint: 'par: roda' },
    mico: { band: '#3b8a4a', hint: 'par: afana' },
    quati: { band: '#3b8a4a', hint: 'par: fuça' },
    tamandua: { band: '#3b8a4a', hint: 'par: do fundo' },
    preguica: { band: '#3b8a4a', hint: 'par: pra depois' },
```

  - Em `index.html`, troque `PAIR_TEXT` e `detailOf` por:

```js
const COMBO_TEXT = '<br><b>TRIO</b> (3 iguais): você diz o nome de uma carta; se o adversário tiver, tem que te dar.<br><b>5 DIFERENTES</b>: você pega a carta que quiser do descarte.<br>Combos podem levar Nem vem!.';
const PAIR_DETAIL = {
  mico: '<b>PAR DE MICO · AFANA</b>: você rouba uma carta ao acaso de um adversário.',
  quati: '<b>PAR DE QUATI · FUÇA</b>: você vê a mão inteira de um adversário e escolhe a carta que leva. Só vocês dois sabem qual foi.',
  tamandua: '<b>PAR DE TAMANDUÁ · LÍNGUA COMPRIDA</b>: você termina a vez comprando a carta <b>do fundo</b> do monte. Ótimo pra fugir de um Tatubum escondido em cima (mas se o tatu estiver no fundo…).',
  preguica: '<b>PAR DE PREGUIÇA · DEIXA PRA DEPOIS</b>: só você vê a carta de cima do monte e decide se ela fica ou vai pro fundo. Todo mundo sabe se você mandou pro fundo, ninguém sabe qual era.',
  capivara: '<b>RODA DE CAPIVARA</b>: todo mundo passa, ao mesmo tempo, uma carta ao acaso pro próximo da vez. Cada um só vê o que deu e o que recebeu.',
};
const detailOf = (k) => DETAIL[k] ?? `Sozinho não faz nada.<br>${PAIR_DETAIL[k]}${COMBO_TEXT}`;
```

  - Em `ABOUT` (galeria), troque a linha `capivara:` por uma linha por bicho com o resumo do par, e no `.map` da galeria tire o caso `k === 'capivara' ? 'BICHOS (5 TIPOS)'` pra cada bicho aparecer com o próprio nome. Textos:

```js
  capivara: 'Par: todo mundo passa uma carta ao acaso pro próximo.',
  mico: 'Par: rouba uma carta ao acaso de um adversário.',
  quati: 'Par: vê a mão de um adversário e escolhe a que leva.',
  tamandua: 'Par: termina a vez comprando a carta do fundo.',
  preguica: 'Par: vê a de cima e decide se vai pro fundo.',
```

  (se a galeria lista só um bicho, acrescente os outros 4 na lista de tipos que ela mostra.)

- [ ] **Step 7: Conferir no navegador** — abrir `http://localhost:5179/prototipo/tatubum/` (servidor estático do protótipo; se não estiver no ar, suba com a entrada temporária no `.claude/launch.json` do repositório pai, como nas sessões anteriores), começar uma partida e, no console, dar ao humano pares de cada bicho pra testar:
  - Par de Capivara/Tamanduá/Preguiça jogado arrastando pra mesa (sem pedir alvo); Mico/Quati arrastando pra um assento.
  - Painel do Quati mostra a mão do alvo e leva a carta clicada; painel da Preguiça mostra a carta de cima e os dois botões.
  - Diário com "do fundo", "mandou a carta de cima pro fundo", "passou … pra …".
  - Zoom de cada bicho explica o próprio par; dica da mão ("par: fuça" etc.) sem encostar na arte.
  - Console sem erros.

- [ ] **Step 8: Commit**

```bash
git add prototipo/tatubum
git commit -m "feat(tatubum): protótipo com o par de cada bicho (painéis, diário, animações e textos)"
```

---

## Depois deste plano

- No T2 (mesa do site), os painéis `QuatiPanel` e `PreguicaPanel`, os textos novos e a animação da roda entram junto com o resto da mesa (o spec já descreve).
- Histórico (T4): nenhuma estatística nova; "rei do Nem vem!" continua igual.
