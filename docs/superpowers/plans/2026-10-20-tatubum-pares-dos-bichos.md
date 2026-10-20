# Tatubum: par de cada bicho e trio do Desarme — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Os combos do Tatubum seguem as regras novas do Rafa (2026-10-20): cada par de bicho tem efeito próprio, par só de bichos, e qualquer trio rouba um Desarme. Nas regras (`shared/`), nos bots e no protótipo.

**Architecture:** A jogada continua `par`/`trio`; o efeito do par sai do tipo da 1ª carta. Os efeitos dos combos moram num arquivo novo `combos.ts`, chamado por `resolve.ts`. O par de Mico reaproveita a escolha `favor`; o par de Quati abre a escolha nova `quati` (fica/fundo, com segredo em `view.ts`); Tamanduá, Preguiça, Capivara e o trio resolvem na hora.

**Tech Stack:** TypeScript, Vitest (`shared/`, `web/`), zod, esbuild (bundle do protótipo).

**Spec:** `docs/superpowers/specs/2026-10-19-tatubum-design.md`, seção "Combos" e "Par de cada bicho (pedido do Rafa, 2026-10-20)". Resumo:

| Combo | Pede | Efeito |
|---|---|---|
| Par de Mico | adversário com carta | ele escolhe uma carta pra te dar (fluxo do Favor) |
| Par de Quati | — | só você vê a de cima; fica ou vai pro fundo (sem escolha: fica) |
| Par de Tamanduá | — | compra 2 de cima; Tatubum vai pro fundo sem gastar Desarme; **a vez continua** |
| Par de Preguiça | um bicho | puxa esse bicho de um adversário sorteado entre os que têm; senão, de dentro do monte; senão, nada |
| Par de Capivara | — | todos **menos você** passam 1 carta ao acaso pro próximo na ordem da vez |
| Trio (3 iguais de qualquer tipo) | — | rouba um Desarme de um adversário sorteado entre os que têm; ninguém tem: nada |
| 2 cartas de ação iguais | — | não formam par (`bad_combo`) |

**Comandos** (da raiz do worktree `.claude/worktrees/tatubum`; no Windows, `npm.cmd` se `npm` não achar):
- Shared: dentro de `shared/`, `npx vitest run [arquivo]` e `npx tsc --noEmit -p .`
- Web: dentro de `web/`, `npx vitest run test/kittens-bots.test.ts` e `npx tsc --noEmit -p .`
- Server: dentro de `server/`, `npx vitest run test/kittens.test.ts`

---

## Arquivos

- Modify `shared/src/games/kittens/types.ts` — escolha `quati` e a visão dela, eventos novos, `choose.keep`.
- Modify `shared/src/games/kittens/schema.ts` — `keep`.
- Modify `shared/src/games/kittens/play.ts` — par só de bicho; alvo no Mico; bicho pedido na Preguiça; trio sem alvo.
- Modify `shared/src/protocol.ts` — texto do `bad_ask`.
- Create `shared/src/games/kittens/combos.ts` — `applyPair`, `applyTrio`.
- Modify `shared/src/games/kittens/turn.ts` — `moveCard` (sai de `resolve.ts`).
- Modify `shared/src/games/kittens/resolve.ts` — `par`/`trio` chamam `combos.ts`.
- Modify `shared/src/games/kittens/choices.ts`, `rules.ts`, `view.ts` — escolha do Quati.
- Create `shared/test/kittens-pairs.test.ts`; Modify `shared/test/kittens-play.test.ts`, `kittens-combos.test.ts`, `kittens-view.test.ts`, `kittens-fuzz.test.ts`.
- Modify `web/src/dev/kittensBots.ts`, `web/test/kittens-bots.test.ts`.
- Modify `prototipo/tatubum/_entry.ts`, `bots.js`, `index.html`, `sprites.js`; rebuild `rules.js`.

---

### Task 1: Tipos, schema e regras de montagem dos combos

**Files:**
- Modify: `shared/src/games/kittens/types.ts`, `schema.ts`, `play.ts`, `shared/src/protocol.ts`
- Modify: `shared/src/games/kittens/view.ts`, `choices.ts`, `rules.ts`, `resolve.ts` (só o mínimo pra compilar)
- Modify: `shared/test/kittens-play.test.ts`

- [ ] **Step 1: Testes que falham** — em `shared/test/kittens-play.test.ts`:
  - Troque o teste `'par, trio e 5 diferentes'` por:

```ts
  it('par, trio e 5 diferentes', () => {
    const s = table({ hands: { ...hands(), p0: [...hands().p0, 'mico-1'] } });
    expect(act(s, 'p0', play({ cards: ['mico-0', 'mico-1'], target: 'p1' }), ctx).pending!.play).toEqual({
      kind: 'par',
      cards: ['mico-0', 'mico-1'],
      target: 'p1',
      ask: null,
    });
    // Trio não tem alvo nem pedido: o que vier é ignorado.
    expect(
      act(s, 'p0', play({ cards: ['capivara-0', 'capivara-1', 'capivara-2'], target: 'p1', ask: 'favor' }), ctx).pending!.play,
    ).toEqual({ kind: 'trio', cards: ['capivara-0', 'capivara-1', 'capivara-2'], target: null, ask: null });
    expect(act(s, 'p0', play({ cards: ['capivara-0', 'mico-0', 'quati-0', 'tamandua-0', 'preguica-0'] }), ctx).pending!.play.kind).toBe(
      'cinco',
    );
  });
```

  - Troque o teste `'combo vale com quaisquer cartas, não só bichos'` por:

```ts
  it('par só de bichos; trio e 5 diferentes valem com quaisquer cartas', () => {
    const s = table({ hands: { p0: ['ataque-0', 'ataque-1', 'ataque-2', 'pular-0', 'cafune-0', 'mico-0', 'nemvem-0'], p1: ['mico-1'], p2: [] } });
    expect(refuse(s, 'p0', play({ cards: ['ataque-0', 'ataque-1'], target: 'p1' }), ctx)).toBe('bad_combo');
    expect(act(s, 'p0', play({ cards: ['ataque-0', 'ataque-1', 'ataque-2'] }), ctx).pending!.play.kind).toBe('trio');
    expect(act(s, 'p0', play({ cards: ['ataque-0', 'pular-0', 'cafune-0', 'mico-0', 'nemvem-0'] }), ctx).pending!.play.kind).toBe('cinco');
  });
```

  - No `it.each` de `'alvo e pedido'`, troque as linhas de par e trio (as 4 de `['capivara-0', 'capivara-1']` e as 2 de trio) por:

```ts
    [{ cards: ['mico-0', 'mico-1'] }, 'bad_target'],
    [{ cards: ['mico-0', 'mico-1'], target: 'p0' }, 'bad_target'],
    [{ cards: ['mico-0', 'mico-1'], target: 'p2' }, 'bad_target'],
    [{ cards: ['mico-0', 'mico-1'], target: 'p9' }, 'bad_target'],
    [{ cards: ['preguica-0', 'preguica-1'] }, 'bad_ask'],
    [{ cards: ['preguica-0', 'preguica-1'], ask: 'ataque' }, 'bad_ask'],
```

  e em `hands()` troque `'mico-0',` por `'mico-0', 'mico-1',` e `'preguica-0',` por `'preguica-0', 'preguica-1',`. (A linha `[{ cards: ['favor-1'], target: 'p2' }, 'bad_target']` fica.)

  - Acrescente, depois desse `it.each`:

```ts
  it('par de Preguiça leva o bicho pedido; Quati, Tamanduá e Capivara não pedem nada', () => {
    const s = table({
      hands: { p0: ['preguica-0', 'preguica-1', 'quati-0', 'quati-1', 'tamandua-0', 'tamandua-1', 'capivara-0', 'capivara-1'], p1: ['mico-1'], p2: [] },
    });
    expect(act(s, 'p0', play({ cards: ['preguica-0', 'preguica-1'], ask: 'mico', target: 'p1' }), ctx).pending!.play).toEqual({
      kind: 'par',
      cards: ['preguica-0', 'preguica-1'],
      target: null,
      ask: 'mico',
    });
    for (const cards of [['quati-0', 'quati-1'], ['tamandua-0', 'tamandua-1'], ['capivara-0', 'capivara-1']]) {
      expect(act(s, 'p0', play({ cards, target: 'p1', ask: 'mico' }), ctx).pending!.play).toEqual({ kind: 'par', cards, target: null, ask: null });
    }
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run (em `shared/`): `npx vitest run test/kittens-play.test.ts`
Expected: FAIL (2 ataques ainda formam par; trio ainda pede alvo; Preguiça não pede bicho).

- [ ] **Step 3: Tipos** — em `types.ts`:

1. Troque `KittensChoice` por:

```ts
export type KittensChoice =
  /** Quem desarmou escolhe onde o `tatu` volta no monte. */
  | { kind: 'cafune'; who: string; tatu: string; deadline: number }
  /** `who` (o alvo do Favor ou do par de Mico) escolhe uma carta da mão pra dar pra `to`. */
  | { kind: 'favor'; who: string; to: string; deadline: number }
  /** `who` escolhe uma carta de `options` (o descarte de antes da jogada de 5 diferentes). */
  | { kind: 'cinco'; who: string; options: string[]; deadline: number }
  /** Par de Quati: `who` vê a carta de cima do monte e decide se ela fica ou vai pro fundo. */
  | { kind: 'quati'; who: string; deadline: number };
```

2. Troque `KittensChoiceView` por:

```ts
/** Escolha como os jogadores veem: sem o id do tatu escondido; a carta de cima do Quati só pra quem escolhe. */
export type KittensChoiceView =
  | { kind: 'cafune'; who: string; deadline: number }
  /** `card` = a carta de cima, só pra quem escolhe (null pros outros). */
  | { kind: 'quati'; who: string; deadline: number; card: string | null }
  | Extract<KittensChoice, { kind: 'favor' | 'cinco' }>;
```

3. Em `KittensPlay`, troque os comentários de `target` e `ask` por `/** Favor e par de Mico. */` e `/** Par de Preguiça: o bicho pedido. */`.

4. Em `KittensEvent`, apague as linhas de `stole` e `asked` e acrescente, antes de `| { t: 'win'; by: string };`:

```ts
  /** Par de Quati: a carta de cima foi pro fundo (`moved`) ou ficou. Ninguém vê qual era. */
  | { t: 'delayed'; by: string; moved: boolean }
  /** Par de Tamanduá: quantos Tatubuns comprados foram pro fundo. */
  | { t: 'buried'; by: string; tatus: number }
  /** Par de Preguiça: `from` = quem deu, ou null quando veio do monte; `card` null = ninguém tinha, nem o monte. */
  | { t: 'called'; by: string; ask: KittensCardKind; from: string | null; card: string | null }
  /** Roda de capivara: `from` passou `card` pra `to` (só os dois veem). */
  | { t: 'passed'; from: string; to: string; card: string | null }
  /** Trio: roubou o Desarme `card` de `from` (null quando ninguém tinha). */
  | { t: 'grabbed'; by: string; from: string | null; card: string | null }
```

5. Em `KittensAction`, troque a linha de `choose` (e o comentário) por:

```ts
  /** Desarme: `position` (0 = topo, tamanho do monte = fundo, ou 'random'); Favor/Mico e 5 diferentes: `card`; Quati: `keep`. */
  | { type: 'choose'; card?: string; position?: number | 'random'; keep?: boolean }
```

6. Comentário de `KITTENS_CHOICE_MS`: `/** Prazo das escolhas pessoais (Desarme, Favor/Mico, 5 diferentes, Quati); depois o servidor escolhe. */`

Em `schema.ts`, no objeto de `choose`, depois de `position`: `keep: z.boolean().optional(),`.

Em `shared/src/protocol.ts`, troque a mensagem `bad_ask: 'Escolha qual carta pedir.',` por `bad_ask: 'Escolha qual bicho puxar.',`.

- [ ] **Step 4: Montagem dos combos** — troque `play.ts` inteiro por:

```ts
import { KITTENS_ACTION_KINDS, KITTENS_BICHOS, kittensKindOf, type KittensActionKind, type KittensCardKind } from './cards';
import type { KittensPlay, KittensPlayKind, KittensState } from './types';

const isBicho = (k: KittensCardKind): boolean => (KITTENS_BICHOS as readonly string[]).includes(k);

/** O que as cartas formam: carta de ação sozinha, par (só de bichos), trio ou 5 diferentes (spec §2, "Combos"). */
function playKindOf(kinds: KittensCardKind[]): KittensPlayKind | null {
  const same = kinds.every((k) => k === kinds[0]);
  if (kinds.length === 1) {
    return (KITTENS_ACTION_KINDS as readonly string[]).includes(kinds[0]!) ? (kinds[0] as KittensActionKind) : null;
  }
  if (kinds.length === 2 && same && isBicho(kinds[0]!)) return 'par';
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
  const kinds = cards.map((c) => kittensKindOf(c)!);
  const kind = playKindOf(kinds);
  if (kind === null) return 'bad_combo';
  let target: string | null = null;
  if (kind === 'favor' || (kind === 'par' && kinds[0] === 'mico')) {
    const t = action.target;
    if (t === undefined || t === p || !s.alive.includes(t) || (s.hands[t]?.length ?? 0) === 0) return 'bad_target';
    target = t;
  }
  let ask: KittensCardKind | null = null;
  if (kind === 'par' && kinds[0] === 'preguica') {
    if (action.ask === undefined || !isBicho(action.ask)) return 'bad_ask';
    ask = action.ask;
  }
  return { kind, cards: [...cards], target, ask };
}
```

Atualize o comentário de `KITTENS_BICHOS` em `cards.ts`: `/** Os 5 bichos: sozinhos não fazem nada; em par, cada um tem efeito próprio (spec "Par de cada bicho"). */`

- [ ] **Step 5: O mínimo pra compilar** (as Tasks 2–4 trocam por código de verdade):
  - `view.ts`: troque `choiceView` pelo da Task 3, Step 3 (já pronto lá) e a chamada por `choice: choiceView(state, viewerId),`.
  - `choices.ts`: no fim do `switch` de `chooseAtRandom`, acrescente `default: return { ...s, choice: null };`.
  - `rules.ts`: no `switch (c.kind)` do `choose`, acrescente `default: return fail('bad_choice');`.
  - `resolve.ts`: os `case 'par'` e `case 'trio'` usam eventos que sumiram (`stole`/`asked`); troque os dois blocos, por enquanto, por `case 'par': case 'trio': return s;`, e tire `randomInt`/`kittensKindOf`/`moveCard` sem uso.

- [ ] **Step 6: Rodar**

Run (em `shared/`): `npx tsc --noEmit -p .` → sem erros. `npx vitest run test/kittens-play.test.ts test/kittens-schema.test.ts` → PASS. (Os testes de `kittens-combos`, `kittens-view` e o fuzz que dependem dos efeitos antigos podem falhar agora; as Tasks 2–5 os acertam.)

- [ ] **Step 7: Commit**

```bash
git add shared/src shared/test/kittens-play.test.ts
git commit -m "feat(tatubum): tipos e montagem dos combos novos (par só de bichos, trio sem alvo)"
```

---

### Task 2: `combos.ts` — os 5 pares e o trio

**Files:**
- Create: `shared/src/games/kittens/combos.ts`
- Modify: `shared/src/games/kittens/turn.ts`, `resolve.ts`
- Create: `shared/test/kittens-pairs.test.ts`
- Modify: `shared/test/kittens-combos.test.ts`, `shared/test/kittens-view.test.ts`

- [ ] **Step 1: Testes que falham** — crie `shared/test/kittens-pairs.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
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

/** p0 joga `action` e a janela de 5 s passa sem Nem vem!. */
function resolved(action: KittensAction, opts: { draw?: string[]; hands?: Record<string, string[]>; peek?: string[] } = {}): KittensState {
  const base = table({ hands: opts.hands ?? hands(), draw: opts.draw ?? DRAW });
  const withPeek = opts.peek ? { ...base, peek: { who: 'p0', cards: opts.peek } } : base;
  return settleKittens(act(withPeek, 'p0', action, ctx), at(5000));
}
const par = (cards: string[], extra: { target?: string; ask?: KittensAction extends never ? never : any } = {}): KittensAction => ({
  type: 'play',
  cards,
  ...extra,
});

describe('par de Mico: o adversário escolhe o que te dar', () => {
  it('abre a escolha do Favor pro alvo', () => {
    const s = resolved(par(['mico-0', 'mico-1'], { target: 'p1' }));
    expect(s.choice).toEqual({ kind: 'favor', who: 'p1', to: 'p0', deadline: T0 + 5000 + KITTENS_CHOICE_MS });
    const given = act(s, 'p1', { type: 'choose', card: 'pular-5' }, at(5000));
    expect(given.hands.p0).toContain('pular-5');
    expect(given.log.at(-1)).toMatchObject({ ev: { t: 'gave', from: 'p1', to: 'p0', card: 'pular-5' }, seenBy: ['p1', 'p0'] });
  });
});

describe('par de Tamanduá: compra 2, tatu vai pro fundo, a vez continua', () => {
  it('sem tatu: as 2 de cima vão pra mão e a vez segue', () => {
    const s = resolved(par(['tamandua-0', 'tamandua-1']));
    expect(s.hands.p0).toEqual(expect.arrayContaining(['pular-9', 'embaralhar-9']));
    expect(s.draw).toEqual(['cafune-9']);
    expect(s).toMatchObject({ current: 'p0', owed: 1, choice: null });
    const draws = s.log.filter((e) => e.ev.t === 'draw');
    expect(draws.map((e) => e.ev)).toEqual([
      { t: 'draw', by: 'p0', card: 'pular-9' },
      { t: 'draw', by: 'p0', card: 'embaralhar-9' },
    ]);
    expect(draws.every((e) => JSON.stringify(e.seenBy) === '["p0"]')).toBe(true);
    expect(s.log.some((e) => e.ev.t === 'buried')).toBe(false);
  });

  it('Tatubum comprado vai pro fundo sem gastar Desarme; todos sabem quantos', () => {
    const s = resolved(par(['tamandua-0', 'tamandua-1']), { draw: ['cafune-9', 'tatubum-0', 'pular-9'] });
    expect(s.draw).toEqual(['tatubum-0', 'cafune-9']);
    expect(s.hands.p0).toContain('pular-9');
    expect(s.alive).toContain('p0');
    expect(s.log.at(-1)).toMatchObject({ ev: { t: 'buried', by: 'p0', tatus: 1 }, seenBy: null });
  });

  it('dois Tatubuns: os dois vão pro fundo; monte com 1 carta: compra só ela', () => {
    const two = resolved(par(['tamandua-0', 'tamandua-1']), { draw: ['pular-9', 'tatubum-0', 'tatubum-1'] });
    expect(two.draw.slice(0, 2).sort()).toEqual(['tatubum-0', 'tatubum-1']);
    expect(two.draw.at(-1)).toBe('pular-9');
    expect(two.log.at(-1)!.ev).toEqual({ t: 'buried', by: 'p0', tatus: 2 });
    const one = resolved(par(['tamandua-0', 'tamandua-1']), { draw: ['tatubum-0'] });
    expect(one.draw).toEqual(['tatubum-0']);
    expect(one.log.at(-1)!.ev).toEqual({ t: 'buried', by: 'p0', tatus: 1 });
  });

  it('a espiada some (o topo mudou)', () => {
    expect(resolved(par(['tamandua-0', 'tamandua-1']), { peek: ['pular-9', 'embaralhar-9', 'cafune-9'] }).peek).toBeNull();
  });
});

describe('par de Preguiça: puxa o bicho pedido', () => {
  it('de um adversário sorteado entre os que têm', () => {
    const s = resolved(par(['preguica-0', 'preguica-1'], { ask: 'quati' }), {
      hands: { ...hands(), p1: ['ataque-5', 'quati-7'], p2: ['quati-8'] },
    });
    const ev = s.log.at(-1)!.ev;
    if (ev.t !== 'called') throw new Error('esperava called');
    expect(['p1', 'p2']).toContain(ev.from);
    expect(ev.card).toMatch(/^quati-[78]$/);
    expect(s.hands.p0).toContain(ev.card);
    expect(s.hands[ev.from!]).not.toContain(ev.card);
    expect(s.log.at(-1)!.seenBy).toBeNull();
  });

  it('ninguém tem: procura no monte; nem no monte: nada', () => {
    const fromDraw = resolved(par(['preguica-0', 'preguica-1'], { ask: 'mico' }), { draw: ['mico-7', 'embaralhar-9', 'pular-9'] });
    expect(fromDraw.hands.p0).toContain('mico-7');
    expect(fromDraw.draw).toEqual(['embaralhar-9', 'pular-9']);
    expect(fromDraw.log.at(-1)!.ev).toEqual({ t: 'called', by: 'p0', ask: 'mico', from: null, card: 'mico-7' });
    const nothing = resolved(par(['preguica-0', 'preguica-1'], { ask: 'mico' }));
    expect(nothing.draw).toEqual(DRAW);
    expect(nothing.log.at(-1)!.ev).toEqual({ t: 'called', by: 'p0', ask: 'mico', from: null, card: null });
  });

  it('não puxa de si mesmo', () => {
    const s = resolved(par(['preguica-0', 'preguica-1'], { ask: 'capivara' }));
    expect(s.log.at(-1)!.ev).toEqual({ t: 'called', by: 'p0', ask: 'capivara', from: null, card: null });
    expect(s.hands.p0!.filter((c) => c.startsWith('capivara'))).toHaveLength(2);
  });
});

describe('par de Capivara: todos menos você passam uma carta pro próximo', () => {
  it('você não passa, mas recebe do jogador antes de você', () => {
    const before = hands();
    const s = resolved(par(['capivara-0', 'capivara-1']));
    const passes = s.log.filter((e) => e.ev.t === 'passed');
    expect(passes.map((e) => e.ev)).toEqual([
      expect.objectContaining({ from: 'p1', to: 'p2' }),
      expect.objectContaining({ from: 'p2', to: 'p0' }),
    ]);
    for (const { ev, seenBy } of passes) {
      if (ev.t !== 'passed') throw new Error('esperava passed');
      expect(seenBy).toEqual([ev.from, ev.to]);
      expect(before[ev.from]).toContain(ev.card);
      expect(s.hands[ev.to]).toContain(ev.card);
    }
    expect(s.hands.p0).toHaveLength(10); // 11 − 2 do par + 1 que recebeu
    expect(s.hands.p1).toHaveLength(1);
    expect(s.hands.p2).toHaveLength(1);
    expect(s).toMatchObject({ current: 'p0', owed: 1 });
  });

  it('quem está sem carta não passa', () => {
    const s = resolved(par(['capivara-0', 'capivara-1']), { hands: { ...hands(), p2: [] } });
    expect(s.log.filter((e) => e.ev.t === 'passed').map((e) => e.ev)).toEqual([expect.objectContaining({ from: 'p1', to: 'p2' })]);
    expect(s.hands.p2).toHaveLength(1);
  });

  it('quem não deu nem recebeu não vê a carta', () => {
    const s = resolved(par(['capivara-0', 'capivara-1']));
    const p1p2 = kittensViewFor(s, 'p0').log.find((e) => e.ev.t === 'passed' && e.ev.from === 'p1');
    expect(p1p2!.ev).toMatchObject({ t: 'passed', from: 'p1', to: 'p2', card: null });
  });
});

describe('trio: rouba um Desarme', () => {
  const trio = (): KittensAction => ({ type: 'play', cards: ['ataque-0', 'ataque-1', 'ataque-2'] });
  const withTrio = (others: Record<string, string[]>) => ({ p0: ['ataque-0', 'ataque-1', 'ataque-2'], ...others });

  it('de um adversário sorteado entre os que têm Desarme; todos veem', () => {
    const s = resolved(trio(), { hands: withTrio({ p1: ['pular-5'], p2: ['cafune-4', 'mico-4'] }) });
    expect(s.hands.p0).toEqual(['cafune-4']);
    expect(s.hands.p2).toEqual(['mico-4']);
    expect(s.log.at(-1)).toMatchObject({ ev: { t: 'grabbed', by: 'p0', from: 'p2', card: 'cafune-4' }, seenBy: null });
  });

  it('ninguém tem Desarme: nada acontece', () => {
    const s = resolved(trio(), { hands: withTrio({ p1: ['pular-5'], p2: [] }) });
    expect(s.hands.p1).toEqual(['pular-5']);
    expect(s.log.at(-1)!.ev).toEqual({ t: 'grabbed', by: 'p0', from: null, card: null });
  });
});
```

Corrija o tipo do helper `par` se o compilador reclamar: use `extra: { target?: string; ask?: KittensCardKind } = {}` importando `KittensCardKind` de `../src/games/kittens/cards`.

- [ ] **Step 2: Rodar e ver falhar**

Run (em `shared/`): `npx vitest run test/kittens-pairs.test.ts`
Expected: FAIL (par e trio ainda não fazem nada).

- [ ] **Step 3: `moveCard` em `turn.ts`** — apague `moveCard` de `resolve.ts` (se ainda existir) e acrescente em `turn.ts`:

```ts
/** Passa `card` da mão de `from` pra de `to`. */
export function moveCard(s: KittensState, from: string, to: string, card: string): KittensState {
  return { ...s, hands: { ...s.hands, [from]: s.hands[from]!.filter((c) => c !== card), [to]: [...s.hands[to]!, card] } };
}
```

- [ ] **Step 4: Criar `combos.ts`**:

```ts
import type { GameContext } from '../../game';
import { randomInt, type Rng } from '../../rng';
import { kittensKindOf, type KittensCardKind } from './cards';
import { logged, moveCard, nextAlive } from './turn';
import { KITTENS_CHOICE_MS, type KittensPlay, type KittensState } from './types';

const isKind = (k: KittensCardKind) => (c: string) => kittensKindOf(c) === k;

/** Par de Tamanduá: compra as 2 de cima; Tatubum vai pro fundo (sem gastar Desarme), o resto pra mão. A vez continua. */
function tamandua(s: KittensState, by: string): KittensState {
  const n = Math.min(2, s.draw.length);
  const taken = s.draw.slice(-n).reverse(); // a de cima primeiro
  const tatus = taken.filter(isKind('tatubum'));
  const kept = taken.filter((c) => !isKind('tatubum')(c));
  let next: KittensState = {
    ...s,
    draw: [...tatus, ...s.draw.slice(0, s.draw.length - n)],
    peek: null,
    hands: { ...s.hands, [by]: [...s.hands[by]!, ...kept] },
  };
  for (const card of kept) next = logged(next, { t: 'draw', by, card }, [by]);
  return tatus.length > 0 ? logged(next, { t: 'buried', by, tatus: tatus.length }) : next;
}

/** Par de Preguiça: puxa um `ask` de um adversário sorteado entre os que têm; ninguém tem, procura no monte. */
function preguica(s: KittensState, by: string, ask: KittensCardKind, rng: Rng): KittensState {
  const holders = s.alive.filter((p) => p !== by && s.hands[p]!.some(isKind(ask)));
  if (holders.length > 0) {
    const from = holders[randomInt(rng, holders.length)]!;
    const card = s.hands[from]!.find(isKind(ask))!;
    return logged(moveCard(s, from, by, card), { t: 'called', by, ask, from, card });
  }
  const inDraw = s.draw.filter(isKind(ask));
  if (inDraw.length === 0) return logged(s, { t: 'called', by, ask, from: null, card: null });
  const card = inDraw[randomInt(rng, inDraw.length)]!;
  const next: KittensState = { ...s, draw: s.draw.filter((c) => c !== card), peek: null, hands: { ...s.hands, [by]: [...s.hands[by]!, card] } };
  return logged(next, { t: 'called', by, ask, from: null, card });
}

/** Roda de capivara: todos os vivos menos `by` passam, ao mesmo tempo, uma carta ao acaso pro próximo vivo. */
function roda(s: KittensState, by: string, rng: Rng): KittensState {
  const passes = s.alive
    .filter((p) => p !== by && s.hands[p]!.length > 0)
    .map((p) => {
      const hand = s.hands[p]!;
      return { from: p, to: nextAlive(s, p)!, card: hand[randomInt(rng, hand.length)]! };
    });
  const hands = { ...s.hands };
  for (const { from, card } of passes) hands[from] = hands[from]!.filter((c) => c !== card);
  for (const { to, card } of passes) hands[to] = [...hands[to]!, card];
  return passes.reduce((acc, x) => logged(acc, { t: 'passed', ...x }, [x.from, x.to]), { ...s, hands });
}

/** O efeito de um par de bicho que não foi cancelado (spec "Par de cada bicho"). */
export function applyPair(s: KittensState, by: string, play: KittensPlay, ctx: GameContext): KittensState {
  const deadline = ctx.now + KITTENS_CHOICE_MS;
  switch (kittensKindOf(play.cards[0]!)) {
    case 'mico':
      return { ...s, choice: { kind: 'favor', who: play.target!, to: by, deadline } };
    case 'quati':
      return { ...s, choice: { kind: 'quati', who: by, deadline } };
    case 'tamandua':
      return tamandua(s, by);
    case 'preguica':
      return preguica(s, by, play.ask!, ctx.rng);
    case 'capivara':
      return roda(s, by, ctx.rng);
    default:
      return s; // parsePlay só deixa passar par de bicho
  }
}

/** Trio: rouba um Desarme de um adversário sorteado entre os que têm (todos veem). */
export function applyTrio(s: KittensState, by: string, ctx: GameContext): KittensState {
  const holders = s.alive.filter((p) => p !== by && s.hands[p]!.some(isKind('cafune')));
  if (holders.length === 0) return logged(s, { t: 'grabbed', by, from: null, card: null });
  const from = holders[randomInt(ctx.rng, holders.length)]!;
  const card = s.hands[from]!.find(isKind('cafune'))!;
  return logged(moveCard(s, from, by, card), { t: 'grabbed', by, from, card });
}
```

- [ ] **Step 5: Usar em `resolve.ts`** — troque o `case 'par': case 'trio': return s;` provisório por:

```ts
    case 'par':
      return applyPair(s, by, play, ctx);
    case 'trio':
      return applyTrio(s, by, ctx);
```

importando `applyPair, applyTrio` de `./combos`.

- [ ] **Step 6: Ajustar testes antigos**
  - `shared/test/kittens-combos.test.ts`: apague os testes `'par: rouba uma carta ao acaso; só os dois veem qual'` e `'trio: pede pelo nome; …'` (cobertos agora por `kittens-pairs.test.ts`). Se sobrar import sem uso, tire.
  - `shared/test/kittens-view.test.ts`, no bloco de `pairAir` (linhas que montam o par de Capivara com alvo e conferem `stole`), troque por:

```ts
    const rodaAir = act(
      table({ hands: { p0: ['capivara-0', 'capivara-1'], p1: ['mico-0'], p2: [] }, draw: ['pular-0', 'quati-0'] }),
      'p0',
      { type: 'play', cards: ['capivara-0', 'capivara-1'] },
      ctxOf(ids(3)),
    );
    const passed = settleKittens(rodaAir, later);
    const last = (viewer: string | null) => kittensViewFor(passed, viewer).log.at(-1)!.ev;
    expect(last('p1')).toMatchObject({ t: 'passed', from: 'p1', to: 'p2', card: 'mico-0' });
    expect(last('p2')).toMatchObject({ t: 'passed', card: 'mico-0' });
    expect(last('p0')).toMatchObject({ t: 'passed', card: null });
    expect(last(null)).toMatchObject({ t: 'passed', card: null });
```

- [ ] **Step 7: Rodar e ver passar**

Run (em `shared/`): `npx vitest run test/kittens-pairs.test.ts test/kittens-combos.test.ts test/kittens-view.test.ts test/kittens-play.test.ts` → PASS (o describe do Quati vem na Task 3). `npx tsc --noEmit -p .` → sem erros.

- [ ] **Step 8: Commit**

```bash
git add shared/src/games/kittens shared/test
git commit -m "feat(tatubum): pares de Mico, Tamanduá, Preguiça e Capivara; trio rouba Desarme"
```

---

### Task 3: Quati — fica ou vai pro fundo

**Files:**
- Modify: `shared/src/games/kittens/choices.ts`, `rules.ts`, `view.ts`
- Modify: `shared/test/kittens-pairs.test.ts`

- [ ] **Step 1: Testes que falham** — acrescente em `kittens-pairs.test.ts`:

```ts
describe('par de Quati: a carta de cima fica ou vai pro fundo', () => {
  const fuca = () => resolved(par(['quati-0', 'quati-1']));

  it('abre a escolha; só quem jogou vê a carta de cima', () => {
    const s = fuca();
    expect(s.choice).toEqual({ kind: 'quati', who: 'p0', deadline: T0 + 5000 + KITTENS_CHOICE_MS });
    expect(kittensViewFor(s, 'p0').choice).toEqual({ ...s.choice, card: 'pular-9' });
    expect(kittensViewFor(s, 'p1').choice).toEqual({ ...s.choice, card: null });
    expect(kittensViewFor(s, null).choice).toEqual({ ...s.choice, card: null });
    expect(JSON.stringify(kittensViewFor(s, 'p1'))).not.toContain('"pular-9"');
  });

  it('FUNDO: vai pro fundo; todos sabem que foi, ninguém sabe qual', () => {
    const s = act(fuca(), 'p0', { type: 'choose', keep: false }, at(5000));
    expect(s.draw).toEqual(['pular-9', 'cafune-9', 'embaralhar-9']);
    expect(s).toMatchObject({ choice: null, current: 'p0', owed: 1 });
    expect(s.log.at(-1)).toMatchObject({ ev: { t: 'delayed', by: 'p0', moved: true }, seenBy: null });
  });

  it('FICA: nada muda no monte', () => {
    const s = act(fuca(), 'p0', { type: 'choose', keep: true }, at(5000));
    expect(s.draw).toEqual(DRAW);
    expect(s.log.at(-1)!.ev).toEqual({ t: 'delayed', by: 'p0', moved: false });
  });

  it('sem resposta, a carta fica; só quem jogou escolhe', () => {
    expect(refuse(fuca(), 'p0', { type: 'choose' }, at(5000))).toBe('bad_choice');
    expect(refuse(fuca(), 'p1', { type: 'choose', keep: false }, at(5000))).toBe('not_your_choice');
    const late = settleKittens(fuca(), at(5000 + KITTENS_CHOICE_MS));
    expect(late.draw).toEqual(DRAW);
    expect(late.choice).toBeNull();
    expect(late.log.at(-1)!.ev).toEqual({ t: 'delayed', by: 'p0', moved: false });
  });

  it('mandar pro fundo apaga a espiada', () => {
    const s = resolved(par(['quati-0', 'quati-1']), { peek: ['pular-9', 'embaralhar-9', 'cafune-9'] });
    expect(act(s, 'p0', { type: 'choose', keep: false }, at(5000)).peek).toBeNull();
    expect(act(s, 'p0', { type: 'choose', keep: true }, at(5000)).peek).not.toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run (em `shared/`): `npx vitest run test/kittens-pairs.test.ts -t Quati`
Expected: FAIL (`choose` do Quati cai no `default` provisório).

- [ ] **Step 3: Implementar**

`choices.ts` — acrescente:

```ts
/** Par de Quati: a carta de cima fica (`keep`) ou vai pro fundo. Todos sabem se foi, ninguém sabe qual. */
export function delayTop(s: KittensState, c: Choice<'quati'>, keep: boolean): KittensState {
  const draw = keep ? s.draw : [s.draw.at(-1)!, ...s.draw.slice(0, -1)];
  return logged({ ...s, draw, choice: null, peek: keep ? s.peek : null }, { t: 'delayed', by: c.who, moved: !keep });
}
```

e troque o `default` provisório de `chooseAtRandom` por:

```ts
    case 'quati':
      // Sem resposta, a carta fica onde está (nada muda pra ninguém).
      return delayTop(s, c, true);
```

(o `switch` cobre todos os tipos; sem `default`). Comentário de `chooseAtRandom`: `/** Prazo vencido (ou quem escolhe caiu de vez): o servidor escolhe ao acaso (no Quati, a carta fica). */`

`rules.ts` — importe `delayTop` de `./choices` e troque o `default` provisório do `switch (c.kind)` por:

```ts
        case 'quati':
          if (action.keep === undefined) return fail('bad_choice');
          return ok(delayTop(s, c, action.keep));
```

`view.ts` — `choiceView` (se a Task 1 ainda não trocou):

```ts
/**
 * A escolha como `viewerId` vê: sem o id do tatu que está sendo escondido (com ele, quem assiste poderia saber onde o
 * tatu foi parar); a carta de cima do Quati só pra quem escolhe.
 */
function choiceView(state: KittensState, viewerId: string | null): KittensChoiceView | null {
  const c = state.choice;
  if (c === null) return null;
  switch (c.kind) {
    case 'cafune': {
      const { kind, who, deadline } = c;
      return { kind, who, deadline };
    }
    case 'quati':
      return { ...c, card: viewerId !== null && viewerId === c.who ? (state.draw.at(-1) ?? null) : null };
    default:
      return c;
  }
}
```

com `choice: choiceView(state, viewerId),` na visão; tire `KittensChoice` do import se ficar sem uso.

- [ ] **Step 4: Rodar e ver passar**

Run (em `shared/`): `npx vitest run test/kittens-pairs.test.ts` e `npx tsc --noEmit -p .` → PASS, sem erros.

- [ ] **Step 5: Commit**

```bash
git add shared/src/games/kittens shared/test/kittens-pairs.test.ts
git commit -m "feat(tatubum): par de Quati decide se a carta de cima vai pro fundo"
```

---

### Task 4: Fuzz, servidor e suíte inteira

**Files:**
- Modify: `shared/test/kittens-fuzz.test.ts`

- [ ] **Step 1: Fuzz responde o Quati e pede bicho na Preguiça** — em `randomAction`:
  - No bloco da escolha, antes do `return` final (5 diferentes), acrescente:

```ts
    if (c.kind === 'quati') return { type: 'choose', keep: r() < 0.5 };
```

  - Na jogada, troque `ask: pick(r, KITTENS_CARD_KINDS)` por `ask: pick(r, KITTENS_BICHOS)` (importe `KITTENS_BICHOS` de `../src/games/kittens/cards`; tire `KITTENS_CARD_KINDS` do import se ficar sem uso).
  - Em `cardsToPlay`, os pares sorteados podem ser de cartas de ação (vão ser recusados, `bad_combo`) — tudo bem, recusa não muda o estado; mas pra exercitar mais os bichos, troque `const pairs = groups.filter((g) => g.length >= 2);` por `const pairs = groups.filter((g) => g.length >= 2 && (KITTENS_BICHOS as readonly string[]).includes(kittensKindOf(g[0]!)!));`.

- [ ] **Step 2: Segredo com o Quati** — na conferência de segredo, troque a linha do `secret` por:

```ts
  // Quem joga o Quati vê a carta de cima; quem espiou vê as 3 de cima (aqui: o monte todo liberado pra ele).
  const sees = (c: string) =>
    (viewer !== null && viewer === s.peek?.who) || (s.choice?.kind === 'quati' && viewer === s.choice.who && c === s.draw.at(-1));
  const secret = [...s.draw.filter((c) => !sees(c)), ...(s.choice?.kind === 'cafune' ? [s.choice.tatu] : [])];
```

Atenção: a Preguiça puxa do monte e o Tamanduá compra 2; a carta que saiu do monte aparece no diário de quem pegou (e o `called` é público). Isso não é vazamento: a checagem só olha o que ainda está no monte.

- [ ] **Step 3: Rodar tudo**

Run (em `shared/`): `npx vitest run` → PASS (inclui as 900 partidas do fuzz). `npx tsc --noEmit -p .` → sem erros.
Run (em `server/`): `npx vitest run test/kittens.test.ts` → PASS (se algum teste do servidor joga par com alvo de Capivara ou trio com pedido, troque pelo par de Mico com alvo).

- [ ] **Step 4: Commit**

```bash
git add shared/test server/test
git commit -m "test(tatubum): fuzz com os combos novos"
```

---

### Task 5: Bots (site e protótipo)

**Files:**
- Modify: `web/src/dev/kittensBots.ts`, `web/test/kittens-bots.test.ts`, `prototipo/tatubum/bots.js`

- [ ] **Step 1: Testes que falham** — acrescente em `web/test/kittens-bots.test.ts`, dentro do `describe`:

```ts
  it('escolha do Quati: manda Tatubum pro fundo e deixa o resto', () => {
    const choice = (card: string) => ({ kind: 'quati' as const, who: 'p1', deadline: 9000, card });
    const tatu = p1View([], { current: 'p1', choice: choice('tatubum-0') });
    expect(decideKittens(tatu, newKittensMemory(), () => 0.5)!.action).toEqual({ type: 'choose', keep: false });
    const calm = p1View([], { current: 'p1', choice: choice('pular-0') });
    expect(decideKittens(calm, newKittensMemory(), () => 0.5)!.action).toEqual({ type: 'choose', keep: true });
  });

  it('par de Capivara vai sem alvo; par de Preguiça pede um bicho; trio vai sem alvo', () => {
    const base = viewOf(started(3), 'p0');
    const play = (hand: string[]) => decideKittens(withGame(base, { hand, peek: null }), newKittensMemory(), () => 0)!.action;
    expect(play(['capivara-0', 'capivara-1'])).toEqual({ type: 'play', cards: ['capivara-0', 'capivara-1'] });
    const lazy = play(['preguica-0', 'preguica-1']);
    expect(lazy).toMatchObject({ type: 'play', cards: ['preguica-0', 'preguica-1'] });
    expect(['capivara', 'mico', 'quati', 'tamandua', 'preguica']).toContain((lazy as { ask: string }).ask);
    expect(play(['ataque-0', 'ataque-1', 'ataque-2'])).toEqual({ type: 'play', cards: ['ataque-0', 'ataque-1', 'ataque-2'] });
  });
```

(Confira antes como `decideKittens` devolve a jogada: se for `{ type: 'play', ...play }`, os `expect` valem. Com `rng = () => 0` o bot sempre quer jogar e pega a 1ª opção; com mãos de só um combo, a 1ª opção é ele. Se `g.owed >= 2` estiver forçando ataque na visão base, ponha `owed: 1` no `withGame`.)

- [ ] **Step 2: Rodar e ver falhar**

Run (em `web/`): `npx vitest run test/kittens-bots.test.ts` → FAIL.

- [ ] **Step 3: Implementar em `kittensBots.ts`**
  - Apague `const ASKS …`.
  - Em `choosePlay`, troque o laço `for (const b of BICHOS) { … }` por:

```ts
  for (const b of BICHOS) {
    const list = byKind.get(b) ?? [];
    if (list.length < 2) continue;
    const pair = list.slice(0, 2);
    if (b === 'mico') {
      if (targets.length) options.push({ cards: pair, target: pickOne(rng, targets) });
    } else if (b === 'preguica') {
      options.push({ cards: pair, ask: pickOne(rng, BICHOS) });
    } else {
      options.push({ cards: pair });
    }
  }
  // Trio de qualquer carta: rouba um Desarme.
  for (const list of byKind.values()) if (list.length >= 3 && rng() < 0.5) options.push({ cards: list.slice(0, 3) });
```

  - No bloco "Espiou e o de cima é tatu: foge.", depois do `for` das cartas de ação, acrescente:

```ts
    const quati = byKind.get('quati');
    if (quati && quati.length >= 2) return { cards: quati.slice(0, 2) };
```

  - Em `decideKittens`, no bloco da escolha, antes do trecho do `cinco` (`if (!c.options.length) return null;`), acrescente:

```ts
    if (c.kind === 'quati') {
      const keep = c.card === null || kittensKindOf(c.card) !== 'tatubum';
      return { key, delay: between(rng, 900, 1600), action: { type: 'choose', keep } };
    }
```

- [ ] **Step 4: Rodar e ver passar**

Run (em `web/`): `npx vitest run test/kittens-bots.test.ts` e `npx tsc --noEmit -p .` → PASS, sem erros.

- [ ] **Step 5: Bots do protótipo** — em `prototipo/tatubum/bots.js`, mesmas regras:
  - Troque o laço dos bichos em `choosePlay` por:

```js
    for (const b of BICHOS) {
      const list = byKind[b] ?? [];
      if (list.length < 2) continue;
      const pair = list.slice(0, 2);
      if (b === 'mico') { if (tgs.length) options.push({ cards: pair, target: pick(tgs) }); }
      else if (b === 'preguica') options.push({ cards: pair, ask: pick(BICHOS) });
      else options.push({ cards: pair });
    }
    for (const list of Object.values(byKind)) if (list.length >= 3 && Math.random() < 0.5) options.push({ cards: list.slice(0, 3) });
```

  - No "foge", depois do `for`: `if ((byKind.quati?.length ?? 0) >= 2) return { cards: byKind.quati.slice(0, 2) };`
  - Em `decide`, dentro de `if (v.choice && v.choice.who === me)`, antes do trecho do `pref`:

```js
        if (c.kind === 'quati') {
          const keep = !c.card || kind(c.card) !== 'tatubum';
          return { action: { type: 'choose', keep }, delay: between(900, 1600) };
        }
```

- [ ] **Step 6: Commit**

```bash
git add web/src/dev/kittensBots.ts web/test/kittens-bots.test.ts prototipo/tatubum/bots.js
git commit -m "feat(tatubum): bots jogam os combos novos"
```

---

### Task 6: Protótipo — jogar, escolher, ver e entender

**Files:**
- Modify: `prototipo/tatubum/_entry.ts`, `index.html`, `sprites.js`; rebuild `rules.js`

- [ ] **Step 1: Rebuild das regras** (da raiz do worktree; `_entry.ts` já exporta `KITTENS_CARD_KINDS`, `kittensKindOf` etc.; acrescente `KITTENS_BICHOS` na linha de `cards`):

```bash
./node_modules/.bin/esbuild prototipo/tatubum/_entry.ts --bundle --format=iife --global-name=Tatubum --target=es2020 --outfile=prototipo/tatubum/rules.js "--banner:js=// Gerado com esbuild a partir de prototipo/tatubum/_entry.ts (não editar à mão)."
```

- [ ] **Step 2: Montar a jogada certa** — em `index.html`:
  - `selectedPlay` (espelho de `play.ts`): troque `if (kinds.length === 2 && same) return 'par';` por `if (kinds.length === 2 && same && T.KITTENS_BICHOS.includes(kinds[0])) return 'par';`.
  - Troque `const needsTarget = …` por:

```js
/** Favor e par de Mico pedem um adversário; par de Preguiça pede um bicho. */
const needsTarget = (kind, ids) => kind === 'favor' || (kind === 'par' && kindOf(ids[0]) === 'mico');
const needsAsk = (kind, ids) => kind === 'par' && kindOf(ids[0]) === 'preguica';
```

  - Em `dropPlay`, logo antes de `if (needsTarget(kind)) {`, acrescente `if (needsAsk(kind, ids)) { mode = { type: 'ask', play: { cards: ids } }; captionText = 'Que bicho você quer puxar?'; render(); return; }` e troque `needsTarget(kind)` por `needsTarget(kind, ids)`.
  - Em `playSelected`, troque `if (kind === 'favor' || kind === 'par' || kind === 'trio') {` por:

```js
  if (needsAsk(kind, play.cards)) {
    mode = { type: 'ask', play };
    captionText = 'Que bicho você quer puxar?';
    render();
    return;
  }
  if (needsTarget(kind, play.cards)) {
```

  - Em `chooseTarget`, apague o desvio `if (mode.kind === 'trio') { … }` (o trio não tem mais alvo).
  - No painel `mode?.type === 'ask'` de `renderPanel`, troque o título/texto e a lista por:

```js
    panel.innerHTML = `<h2>QUE BICHO VOCÊ PUXA?</h2><p>Vem de um adversário que tenha; se ninguém tiver, do monte.</p><div class="row"></div>`;
    const row = panel.querySelector('.row');
    T.KITTENS_BICHOS.forEach((k) => {
      row.appendChild(button(cardName(k), () => send({ ...mode.play, ask: k }), 'small'));
    });
```

  (o botão CANCELAR continua.)

- [ ] **Step 3: Painel do Quati** — em `renderPanel`, depois do bloco `else if (c.kind === 'cinco') { … }`:

```js
  } else if (c.kind === 'quati') {
    panel.innerHTML = `<h2>A CARTA DE CIMA ${timer}</h2><p>Só você vê. Fica em cima ou vai pro fundo?</p><div class="cards"></div><div class="row"></div>`;
    if (c.card) panel.querySelector('.cards').appendChild(cardEl(c.card));
    const row = panel.querySelector('.row');
    row.appendChild(button('FICA EM CIMA', () => dispatch(ME, { type: 'choose', keep: true }), 'small'));
    row.appendChild(button('PRO FUNDO', () => dispatch(ME, { type: 'choose', keep: false }), 'yellow'));
```

  E o Favor que vem de par de Mico usa o mesmo painel do Favor (nada a fazer).

- [ ] **Step 4: Diário** — em `rawText`:
  - Apague os `case 'stole'` e `case 'asked'`.
  - No objeto do `case 'resolved'`, troque as linhas `par:` e `trio:` por:

```js
        par: `${whose(PAIR_LABEL[kindOf(prevPending?.play.cards[0] ?? 'mico-0')] ?? 'PAR')} valeu!`,
        trio: `${whose('TRIO')} valeu!`,
```

  - Antes de `case 'win'`, acrescente:

```js
    case 'delayed': return ev.moved ? `${n(ev.by)} mandou a carta de cima pro fundo` : `${n(ev.by)} deixou a carta de cima onde estava`;
    case 'buried': return `${n(ev.by)} mandou ${ev.tatus === 1 ? 'um TATUBUM' : 'dois TATUBUNS'} pro fundo!`;
    case 'called':
      if (!ev.card) return `Ninguém tinha ${cardName(ev.ask)}, nem o monte`;
      return ev.from ? `${n(ev.by)} puxou ${cardName(ev.ask)} de ${n(ev.from)}` : `${n(ev.by)} puxou ${cardName(ev.ask)} do monte`;
    case 'passed': return ev.card ? `${n(ev.from)} passou ${cardName(kindOf(ev.card))} pra ${n(ev.to)}` : `${n(ev.from)} passou uma carta pra ${n(ev.to)}`;
    case 'grabbed': return ev.from ? `${n(ev.by)} roubou o DESARME de ${n(ev.from)}!` : 'Ninguém tinha Desarme pra roubar';
```

  - Perto de `PLAY_LABEL`:

```js
/** Nome do par no diário, pelo bicho. */
const PAIR_LABEL = { mico: 'PAR DE MICO', quati: 'PAR DE QUATI', tamandua: 'PAR DE TAMANDUÁ', preguica: 'PAR DE PREGUIÇA', capivara: 'RODA DE CAPIVARA' };
```

  Confira que `prevPending` chega em `textOf` pros eventos `resolved` (é o mesmo usado no texto do Favor); se não chegar, o `?? 'PAR'` cobre.

- [ ] **Step 5: Animações** — na fila de efeitos:
  - No grupo `case 'gave': case 'stole': case 'asked': case 'picked':`, troque por `case 'gave': case 'passed': case 'called': case 'grabbed': case 'picked':` e ajuste as duas linhas de origem/destino:

```js
      if ((ev.t === 'called' || ev.t === 'grabbed') && !ev.card) { await Fx.wait(700); break; }
      const src = ev.t === 'picked' ? 'discard' : ev.t === 'called' && !ev.from ? 'deck' : ev.from;
      const from = src === 'discard' ? $('#discard') : src === 'deck' ? $('#deck .stack') : src === ME && card && rects[card] ? rects[card] : anchorOf(src);
      const toP = ev.t === 'picked' || ev.t === 'called' || ev.t === 'grabbed' ? ev.by : ev.to;
```

  (apague a linha antiga `if (ev.t === 'asked' && !card) …` e as antigas `const from = …`/`const toP = …`; o resto do bloco fica.) Na roda, use `dur: ev.t === 'passed' ? 360 : 520` no `Fx.fly`.
  - Antes de `case 'win'`:

```js
    case 'delayed':
    case 'buried': {
      say(text);
      Sound.play('card');
      if (ev.t === 'buried' || ev.moved) {
        const deck = $('#deck .stack');
        const from = ev.t === 'buried' ? anchorOf(ev.by) : deck;
        await Fx.fly({ node: ev.t === 'buried' ? cardEl('tatubum-0') : cardEl(null, { back: true }), from, to: deck, dur: 520 });
      } else {
        await Fx.wait(500);
      }
      break;
    }
```

- [ ] **Step 6: Textos das cartas**
  - `sprites.js`, `hint` dos 5 bichos:

```js
    capivara: { band: '#3b8a4a', hint: 'par: roda' },
    mico: { band: '#3b8a4a', hint: 'par: me dá uma' },
    quati: { band: '#3b8a4a', hint: 'par: vê a de cima' },
    tamandua: { band: '#3b8a4a', hint: 'par: compra 2' },
    preguica: { band: '#3b8a4a', hint: 'par: puxa um bicho' },
```

  - `index.html`, troque `PAIR_TEXT` e `detailOf` por:

```js
const COMBO_TEXT = '<br><b>TRIO</b> (3 cartas iguais de qualquer tipo): você rouba um <b>Desarme</b> de um adversário que tenha.<br><b>5 DIFERENTES</b>: você pega a carta que quiser do descarte.<br>Combos podem levar Nem vem!.';
const PAIR_DETAIL = {
  mico: '<b>PAR DE MICO</b>: escolha um adversário; ele escolhe uma carta da mão dele pra te dar. Só vocês dois sabem qual foi.',
  quati: '<b>PAR DE QUATI</b>: só você vê a carta de cima do monte e decide se ela fica em cima ou vai pro fundo. Todo mundo sabe se foi pro fundo, ninguém sabe qual era.',
  tamandua: '<b>PAR DE TAMANDUÁ</b>: você compra 2 cartas de cima. Se vier <b>Tatubum</b>, ele vai pro fundo do monte sem você gastar Desarme. A vez continua: depois você ainda compra normalmente.',
  preguica: '<b>PAR DE PREGUIÇA</b>: diga um bicho; você puxa essa carta de um adversário que tenha (sorteado). Se ninguém tiver, procura no monte.',
  capivara: '<b>RODA DE CAPIVARA</b>: todo mundo, menos você, passa uma carta ao acaso pro próximo da vez. Você recebe a do jogador antes de você.',
};
const detailOf = (k) => DETAIL[k] ?? `Sozinho não faz nada.<br>${PAIR_DETAIL[k]}${COMBO_TEXT}`;
```

  - Em `DETAIL`, no fim dos textos das cartas de ação (Ataque, Pular, Favor, Embaralhar, Espiar, Nem vem!), não há mais "par de ação"; se algum texto citar par/trio pelo nome, ajuste ao trio novo.
  - Galeria (`ABOUT`): uma linha por bicho, e no `.map` tire o caso `k === 'capivara' ? 'BICHOS (5 TIPOS)'` pra cada bicho aparecer com o próprio nome; acrescente os 4 bichos que faltarem na lista da galeria. Textos:

```js
  capivara: 'Par: todo mundo, menos você, passa uma carta pro próximo.',
  mico: 'Par: um adversário escolhe uma carta pra te dar.',
  quati: 'Par: vê a de cima e decide se vai pro fundo.',
  tamandua: 'Par: compra 2; Tatubum vai pro fundo. A vez continua.',
  preguica: 'Par: puxa o bicho que você pedir.',
```

  e a nota do rodapé da galeria (combos) passa a dizer: `Combos: PAR só de bichos (cada um faz uma coisa) · TRIO de qualquer carta rouba um Desarme · 5 DIFERENTES pega uma do descarte. Toda carta jogada fica 5 s no ar pra alguém dar Nem vem!.`

- [ ] **Step 7: Conferir no navegador** — `http://localhost:5179/prototipo/tatubum/` (se o servidor estático não estiver no ar, suba com a entrada temporária no `.claude/launch.json` do repositório pai, como nas sessões anteriores). Começar partida e, no console, dar ao humano pares de cada bicho e um trio:
  - Capivara, Tamanduá, Quati e trio: arrastar pra mesa joga sem pedir nada; Mico arrastado pra um assento; Preguiça abre a lista de bichos.
  - Painel do Quati mostra a carta de cima com os dois botões; Favor do Mico aparece pro bot alvo (e o humano recebe a carta).
  - Tamanduá com Tatubum em cima: o tatu vai pro fundo, o diário diz, e a vez continua (botão COMPRAR ainda lá).
  - Diário com "puxou … do monte", "passou … pra …", "roubou o DESARME de …".
  - Zoom de cada bicho explica o próprio par; dica da mão sem encostar na arte.
  - Console sem erros.

- [ ] **Step 8: Commit**

```bash
git add prototipo/tatubum
git commit -m "feat(tatubum): protótipo com os combos novos (pares, trio do Desarme, painéis, diário e textos)"
```

---

## Depois deste plano

- No T2 (mesa do site), `QuatiPanel`, o seletor de bicho da Preguiça, os textos novos e as animações entram junto com a mesa (o spec já descreve).
- Histórico (T4): nenhuma estatística nova.
