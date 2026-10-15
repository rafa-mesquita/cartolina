# cartolina~ — Plano 1: fundação, regras do ITO e servidor de salas

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Monorepo com as regras completas do ITO em TypeScript puro (testadas) e um servidor Cloudflare (Worker + Durable Object) que hospeda salas, sincroniza o estado por WebSocket e repassa cursores — tudo testado, pronto para a interface web do Plano 2.

**Architecture:** `shared/` contém lógica pura e determinística (regras do ITO, gerenciamento de sala, protocolo validado com zod). `server/` é uma casca fina: o Worker roteia HTTP, e cada sala é um Durable Object que guarda o `Room` no storage, aplica ações via `shared/` e envia a cada jogador apenas a visão dele (`roomView`). Mensagens `fx.*` (cursor, atividade, ping) são só repassadas.

**Tech Stack:** Node 24, npm workspaces, TypeScript 5.9, Vitest 3, zod 3, Cloudflare Wrangler 4, Durable Objects (SQLite, WebSocket Hibernation API), `@cloudflare/vitest-pool-workers`.

**Spec:** `docs/superpowers/specs/2026-10-15-cartolina-ito-design.md`

**Planos seguintes (escritos após este):** Plano 2 — `web/` jogável (identidade cartolina, lobby, mesa com assentos, arrasto ao vivo, revelação). Plano 3 — mesa 3D 38°, manual de marca `#/marca`, deploy GitHub Actions, E2E Playwright.

**Desvios deliberados da spec (simplificações):**
- O protocolo envia ações do jogo como `{ t: 'action', action: ItoAction }` em vez de um tipo de mensagem por ação. Os nomes das ações mapeiam 1:1 a tabela da spec (`lobby.setMode` → `setMode`, `card.place` → `place`, etc.).
- As fases `revealing` + `result` viram uma única fase `reveal` (com `reveal[]` e `outcome`); a animação carta a carta e a tela de resultado são responsabilidade do cliente.
- `fx.cursor.drag` inclui `index` (posição de destino na fila) para a fila abrir o espaço tracejado nos outros clientes.

---

## Mapa de arquivos

```
package.json                     workspaces + scripts raiz
tsconfig.base.json               config TS compartilhada
.gitignore
README.md                        como rodar
shared/
  package.json
  tsconfig.json
  src/index.ts                   re-exporta a API pública
  src/rng.ts                     PRNG seedável + shuffle
  src/players.ts                 cores, limites, validação de nome/dica
  src/game.ts                    interface GameModule + GameContext
  src/room.ts                    sala: entrar, desconectar, host, ações, visão, alarmes
  src/protocol.ts                schemas zod, tipos de mensagem, mensagens de erro
  src/games/ito/types.ts         tipos do ITO
  src/games/ito/themes.ts        ~100 temas PT-BR, sorteio, validação de tema próprio
  src/games/ito/scoring.ts       revelação e resultado
  src/games/ito/rules.ts         máquina de estados do ITO + visão por jogador
  test/rng.test.ts
  test/players.test.ts
  test/ito-scoring.test.ts
  test/ito-themes.test.ts
  test/ito-rules.test.ts
  test/room.test.ts
  test/protocol.test.ts
server/
  package.json
  tsconfig.json
  wrangler.jsonc
  vitest.config.ts
  worker-configuration.d.ts      gerado por `wrangler types`
  src/index.ts                   Worker: rotas HTTP + CORS
  src/room-do.ts                 Durable Object RoomDO
  test/env.d.ts
  test/helpers.ts                cliente WebSocket de teste
  test/http.test.ts
  test/room-do.test.ts
```

---

### Task 1: Monorepo

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.gitignore`, `shared/package.json`, `shared/tsconfig.json`, `shared/src/index.ts`

- [ ] **Step 1: Criar `package.json` na raiz**

```json
{
  "name": "cartolina",
  "private": true,
  "workspaces": ["shared", "server"],
  "scripts": {
    "test": "npm run test --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present"
  }
}
```

- [ ] **Step 2: Criar `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "noEmit": true
  }
}
```

- [ ] **Step 3: Criar `.gitignore`**

```
node_modules/
dist/
.wrangler/
.dev.vars
*.log
```

- [ ] **Step 4: Criar `shared/package.json`**

```json
{
  "name": "@cartolina/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 5: Criar `shared/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "include": ["src", "test"]
}
```

- [ ] **Step 6: Criar `shared/src/index.ts` vazio por enquanto**

```ts
export {};
```

- [ ] **Step 7: Instalar dependências**

Run:
```bash
npm install -D typescript@~5.9.0 vitest@^3.2.0
npm install -w shared zod@^3.24.0
```
Expected: instala sem erros; cria `package-lock.json` e `node_modules/@cartolina/shared` (symlink).

- [ ] **Step 8: Verificar typecheck**

Run: `npm run typecheck`
Expected: termina sem erros.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.base.json .gitignore shared
git commit -m "chore: monorepo com workspace shared

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: RNG e jogadores

**Files:**
- Create: `shared/src/rng.ts`, `shared/src/players.ts`
- Test: `shared/test/rng.test.ts`, `shared/test/players.test.ts`

- [ ] **Step 1: Escrever testes que falham**

`shared/test/rng.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { mulberry32, randomInt, shuffle } from '../src/rng';

describe('rng', () => {
  it('é determinístico para a mesma seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('gera valores em [0, 1)', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('randomInt fica em [0, max)', () => {
    const r = mulberry32(1);
    for (let i = 0; i < 500; i++) {
      const v = randomInt(r, 5);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(5);
    }
  });

  it('shuffle devolve uma permutação sem alterar a entrada', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const out = shuffle(mulberry32(3), input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
  });
});
```

`shared/test/players.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { CLUE_MAX, PLAYER_COLORS, cleanClue, cleanName, isPlayerColor } from '../src/players';

describe('players', () => {
  it('tem 10 cores distintas', () => {
    expect(PLAYER_COLORS).toHaveLength(10);
    expect(new Set(PLAYER_COLORS).size).toBe(10);
  });

  it('isPlayerColor aceita só cores da paleta', () => {
    expect(isPlayerColor('#8EC5FF')).toBe(true);
    expect(isPlayerColor('#000000')).toBe(false);
    expect(isPlayerColor(3)).toBe(false);
  });

  it('cleanName apara espaços e limita a 16 caracteres', () => {
    expect(cleanName('  Ana   Paula ')).toBe('Ana Paula');
    expect(cleanName('   ')).toBeNull();
    expect(cleanName('a'.repeat(17))).toBeNull();
    expect(cleanName('a'.repeat(16))).toBe('a'.repeat(16));
  });

  it('cleanClue colapsa espaços e corta no limite', () => {
    expect(cleanClue('  Paris   e   Roma')).toBe('Paris e Roma');
    expect(cleanClue('x'.repeat(100))).toHaveLength(CLUE_MAX);
    expect(cleanClue('Paris ')).toBe('Paris ');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -w shared`
Expected: FAIL — `Cannot find module '../src/rng'` / `'../src/players'`.

- [ ] **Step 3: Implementar `shared/src/rng.ts`**

```ts
/** Gerador pseudoaleatório: devolve números em [0, 1). */
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomInt(rng: Rng, maxExclusive: number): number {
  return Math.floor(rng() * maxExclusive);
}

export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
```

- [ ] **Step 4: Implementar `shared/src/players.ts`**

```ts
export const PLAYER_COLORS = [
  '#8EC5FF',
  '#FF8FAB',
  '#7EDDB5',
  '#C7B3FF',
  '#FFD07A',
  '#FFB38A',
  '#9EE6F0',
  '#E6B8E0',
  '#C9E27A',
  '#D9C2A0',
] as const;

export type PlayerColor = (typeof PLAYER_COLORS)[number];

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;
export const NAME_MAX = 16;
export const CLUE_MAX = 40;

export function isPlayerColor(value: unknown): value is PlayerColor {
  return typeof value === 'string' && (PLAYER_COLORS as readonly string[]).includes(value);
}

export function cleanName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, ' ');
  return name.length >= 1 && name.length <= NAME_MAX ? name : null;
}

/** Mantém espaço no fim para não atrapalhar quem está digitando. */
export function cleanClue(raw: string): string {
  return raw.replace(/\s+/g, ' ').trimStart().slice(0, CLUE_MAX);
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test -w shared`
Expected: PASS (8 testes).

- [ ] **Step 6: Commit**

```bash
git add shared
git commit -m "feat(shared): rng seedável e utilitários de jogador

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Tipos do ITO, interface de jogo e pontuação

**Files:**
- Create: `shared/src/game.ts`, `shared/src/games/ito/types.ts`, `shared/src/games/ito/scoring.ts`
- Test: `shared/test/ito-scoring.test.ts`

- [ ] **Step 1: Criar `shared/src/game.ts`**

```ts
import type { Rng } from './rng';

export interface GameContext {
  hostId: string | null;
  /** Jogadores conectados ou desconectados há menos de 30 s, na ordem dos assentos. */
  active: string[];
  rng: Rng;
}

export type ActionResult<S> = { ok: true; state: S } | { ok: false; error: string };

export interface GameModule<S, A, V> {
  id: string;
  initialState(): S;
  applyAction(state: S, playerId: string, action: A, ctx: GameContext): ActionResult<S>;
  /** Esconde tudo que `viewerId` não pode ver. */
  viewFor(state: S, viewerId: string | null): V;
  /** Reavaliado quando alguém entra, sai ou expira a tolerância de desconexão. */
  onPresenceChange(state: S, ctx: GameContext): S;
}
```

- [ ] **Step 2: Criar `shared/src/games/ito/types.ts`**

```ts
export type ItoMode = 'livre' | 'campanha';
export type ItoPhase = 'lobby' | 'theme' | 'sorting' | 'reveal';
export type ItoOutcome = 'round_won' | 'round_lost' | 'level_cleared' | 'won' | 'lost';

export interface Theme {
  titulo: string;
  min: string;
  max: string;
}

export interface ItoCard {
  id: string;
  owner: string;
  value: number;
  clue: string;
}

export interface RevealEntry {
  cardId: string;
  owner: string;
  value: number;
  error: boolean;
}

export interface ItoState {
  phase: ItoPhase;
  mode: ItoMode;
  /** Participantes da rodada atual, na ordem dos assentos. */
  players: string[];
  level: number;
  lives: number;
  theme: Theme | null;
  usedThemes: number[];
  cards: Record<string, ItoCard>;
  /** Ids das cartas na fila, da esquerda (1) para a direita (100). */
  row: string[];
  ready: string[];
  reveal: RevealEntry[] | null;
  outcome: ItoOutcome | null;
}

export type ItoAction =
  | { type: 'setMode'; mode: ItoMode }
  | { type: 'start' }
  | { type: 'rerollTheme' }
  | { type: 'customTheme'; theme: Theme }
  | { type: 'beginRound' }
  | { type: 'place'; cardId: string; index: number }
  | { type: 'return'; cardId: string }
  | { type: 'clue'; cardId: string; text: string }
  | { type: 'ready'; ready: boolean }
  | { type: 'forceReveal' }
  | { type: 'next' };

export interface ItoCardView {
  id: string;
  owner: string;
  clue: string;
  /** `null` quando o número é segredo para quem está vendo. */
  value: number | null;
}

export interface ItoView extends Omit<ItoState, 'cards' | 'usedThemes'> {
  cards: Record<string, ItoCardView>;
}

export const CAMPAIGN_LIVES = 3;
export const CAMPAIGN_LEVELS = 3;
```

- [ ] **Step 3: Escrever o teste que falha**

`shared/test/ito-scoring.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { computeReveal, resolveOutcome } from '../src/games/ito/scoring';
import type { ItoCard } from '../src/games/ito/types';

function cardsFrom(values: number[]): { row: string[]; cards: Record<string, ItoCard> } {
  const cards: Record<string, ItoCard> = {};
  const row = values.map((value, i) => {
    const id = `p${i}:0`;
    cards[id] = { id, owner: `p${i}`, value, clue: '' };
    return id;
  });
  return { row, cards };
}

describe('computeReveal', () => {
  it('não marca erro quando está em ordem crescente', () => {
    const { row, cards } = cardsFrom([10, 20, 30]);
    expect(computeReveal(row, cards).map((e) => e.error)).toEqual([false, false, false]);
  });

  it('marca a carta menor que a maior já revelada', () => {
    const { row, cards } = cardsFrom([10, 30, 20]);
    expect(computeReveal(row, cards).map((e) => e.error)).toEqual([false, false, true]);
  });

  it('compara com o maior valor anterior, não só com o vizinho', () => {
    const { row, cards } = cardsFrom([50, 10, 20, 60]);
    expect(computeReveal(row, cards).map((e) => e.error)).toEqual([false, true, true, false]);
  });

  it('inclui dono e valor na ordem da fila', () => {
    const { row, cards } = cardsFrom([5, 7]);
    expect(computeReveal(row, cards)).toEqual([
      { cardId: 'p0:0', owner: 'p0', value: 5, error: false },
      { cardId: 'p1:0', owner: 'p1', value: 7, error: false },
    ]);
  });
});

describe('resolveOutcome', () => {
  it('modo livre: vitória sem erros, derrota com erro, vidas intactas', () => {
    expect(resolveOutcome('livre', 1, 3, 0)).toEqual({ lives: 3, outcome: 'round_won' });
    expect(resolveOutcome('livre', 1, 3, 2)).toEqual({ lives: 3, outcome: 'round_lost' });
  });

  it('campanha: cada erro custa uma vida', () => {
    expect(resolveOutcome('campanha', 1, 3, 1)).toEqual({ lives: 2, outcome: 'level_cleared' });
  });

  it('campanha: vidas zeradas é derrota, nunca negativas', () => {
    expect(resolveOutcome('campanha', 2, 2, 5)).toEqual({ lives: 0, outcome: 'lost' });
  });

  it('campanha: passar do nível 3 com vida é vitória', () => {
    expect(resolveOutcome('campanha', 3, 1, 0)).toEqual({ lives: 1, outcome: 'won' });
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `npm test -w shared -- ito-scoring`
Expected: FAIL — `Cannot find module '../src/games/ito/scoring'`.

- [ ] **Step 5: Implementar `shared/src/games/ito/scoring.ts`**

```ts
import { CAMPAIGN_LEVELS, type ItoCard, type ItoMode, type ItoOutcome, type RevealEntry } from './types';

export function computeReveal(row: string[], cards: Record<string, ItoCard>): RevealEntry[] {
  let max = 0;
  return row.map((cardId) => {
    const card = cards[cardId]!;
    const error = card.value < max;
    max = Math.max(max, card.value);
    return { cardId, owner: card.owner, value: card.value, error };
  });
}

export function resolveOutcome(
  mode: ItoMode,
  level: number,
  livesBefore: number,
  errors: number,
): { lives: number; outcome: ItoOutcome } {
  if (mode === 'livre') {
    return { lives: livesBefore, outcome: errors === 0 ? 'round_won' : 'round_lost' };
  }
  const lives = Math.max(0, livesBefore - errors);
  if (lives === 0) return { lives, outcome: 'lost' };
  if (level >= CAMPAIGN_LEVELS) return { lives, outcome: 'won' };
  return { lives, outcome: 'level_cleared' };
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npm test -w shared`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add shared
git commit -m "feat(shared): tipos do ITO e cálculo de revelação

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Temas

**Files:**
- Create: `shared/src/games/ito/themes.ts`
- Test: `shared/test/ito-themes.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

`shared/test/ito-themes.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { THEMES, THEME_LIMITS, cleanTheme, pickTheme } from '../src/games/ito/themes';
import { mulberry32 } from '../src/rng';

describe('THEMES', () => {
  it('tem pelo menos 100 temas válidos e únicos', () => {
    expect(THEMES.length).toBeGreaterThanOrEqual(100);
    expect(new Set(THEMES.map((t) => t.titulo)).size).toBe(THEMES.length);
    for (const t of THEMES) {
      expect(cleanTheme(t)).toEqual(t);
    }
  });
});

describe('pickTheme', () => {
  it('não repete temas já usados', () => {
    const rng = mulberry32(9);
    let used: number[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < THEMES.length; i++) {
      const res = pickTheme(rng, used);
      expect(seen.has(res.theme.titulo)).toBe(false);
      seen.add(res.theme.titulo);
      used = res.used;
    }
    expect(used).toHaveLength(THEMES.length);
  });

  it('recomeça quando todos foram usados', () => {
    const all = THEMES.map((_, i) => i);
    const res = pickTheme(mulberry32(1), all);
    expect(res.used).toHaveLength(1);
  });
});

describe('cleanTheme', () => {
  it('apara espaços', () => {
    expect(cleanTheme({ titulo: '  Pizzas ', min: ' ruim', max: 'boa ' })).toEqual({
      titulo: 'Pizzas',
      min: 'ruim',
      max: 'boa',
    });
  });

  it('rejeita campos vazios ou longos demais', () => {
    expect(cleanTheme({ titulo: '', min: 'a', max: 'b' })).toBeNull();
    expect(cleanTheme({ titulo: 'x'.repeat(THEME_LIMITS.titulo + 1), min: 'a', max: 'b' })).toBeNull();
    expect(cleanTheme({ titulo: 'ok', min: 'x'.repeat(THEME_LIMITS.extremo + 1), max: 'b' })).toBeNull();
    expect(cleanTheme({ titulo: 'ok', min: 'a', max: '  ' })).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -w shared -- ito-themes`
Expected: FAIL — `Cannot find module '../src/games/ito/themes'`.

- [ ] **Step 3: Implementar `shared/src/games/ito/themes.ts`**

```ts
import { randomInt, type Rng } from '../../rng';
import type { Theme } from './types';

export const THEME_LIMITS = { titulo: 60, extremo: 30 } as const;

const RAW: ReadonlyArray<readonly [string, string, string]> = [
  ['Lugares que você quer visitar', 'nunca iria', 'sonho de vida'],
  ['Comidas que você gosta', 'odeio', 'amo demais'],
  ['Animais mais perigosos', 'inofensivo', 'mortal'],
  ['Coisas mais caras', 'de graça', 'uma fortuna'],
  ['Superpoderes mais úteis', 'inútil', 'muito útil'],
  ['Filmes mais assustadores', 'nada assustador', 'não dormi'],
  ['Coisas que dão mais vergonha', 'zero vergonha', 'quero sumir'],
  ['Profissões mais difíceis', 'moleza', 'dificílima'],
  ['Personagens mais fortes', 'fraquinho', 'invencível'],
  ['Coisas mais fedidas', 'cheiro bom', 'insuportável'],
  ['Presentes de aniversário', 'decepcionante', 'perfeito'],
  ['Lugares pra um primeiro encontro', 'péssimo', 'ideal'],
  ['Esportes mais difíceis', 'qualquer um faz', 'só atleta de elite'],
  ['Coisas mais barulhentas', 'silencioso', 'ensurdecedor'],
  ['Músicas pra cantar no karaokê', 'ninguém canta', 'todo mundo canta'],
  ['Coisas mais pesadas', 'levinho', 'pesadíssimo'],
  ['Comidas mais apimentadas', 'sem ardor', 'fogo na boca'],
  ['Habilidades num apocalipse zumbi', 'inútil', 'salva vidas'],
  ['Desculpas pra faltar num compromisso', 'ninguém acredita', 'convincente'],
  ['Coisas mais fofas', 'nada fofo', 'fofura extrema'],
  ['Invenções mais importantes', 'dispensável', 'mudou o mundo'],
  ['Coisas que você faria por R$ 100', 'nunca', 'na hora'],
  ['Lugares pra se esconder', 'te acham na hora', 'ninguém acha'],
  ['Coisas mais nojentas', 'tranquilo', 'vomitei'],
  ['Bebidas', 'horrível', 'maravilhosa'],
  ['Séries pra maratonar', 'larguei no 1º episódio', 'vi tudo num fim de semana'],
  ['Coisas que te deixam com raiva', 'nem ligo', 'fico possesso'],
  ['Animais de estimação', 'não quero nunca', 'quero agora'],
  ['Jogos de tabuleiro', 'chato', 'viciante'],
  ['Coisas mais rápidas', 'lentíssimo', 'velocidade da luz'],
  ['Celebridades pra conhecer', 'passo', 'ídolo'],
  ['Matérias da escola', 'detestava', 'amava'],
  ['Coisas pra levar numa ilha deserta', 'inútil', 'essencial'],
  ['Sobremesas', 'dispensável', 'divina'],
  ['Coisas mais românticas', 'nada romântico', 'romântico demais'],
  ['Coisas mais perigosas de fazer', 'seguro', 'loucura total'],
  ['Cheiros', 'horrível', 'delicioso'],
  ['Trabalhos', 'pesadelo', 'emprego dos sonhos'],
  ['Coisas que dão medo', 'nenhum medo', 'pavor'],
  ['Coisas mais antigas', 'novinho', 'pré-histórico'],
  ['Tamanho das coisas', 'minúsculo', 'gigantesco'],
  ['Nomes de bebê', 'ninguém usa', 'todo mundo usa'],
  ['Coisas que você faz no domingo', 'nunca faço', 'sempre faço'],
  ['Talentos escondidos', 'inútil', 'impressionante'],
  ['Vilões', 'bonzinho', 'maligno'],
  ['Compras se ganhasse na loteria', 'nem pensaria', 'primeira compra'],
  ['Comidas de festa infantil', 'ninguém come', 'acaba primeiro'],
  ['Coisas difíceis de aprender', 'fácil', 'impossível'],
  ['Coisas que você faria pra ficar famoso', 'jamais', 'faria agora'],
  ['Lugares mais frios', 'calorão', 'congelante'],
  ['Coisas mais estressantes', 'relaxante', 'colapso nervoso'],
  ['Comidas de café da manhã', 'nunca de manhã', 'café perfeito'],
  ['Lanches de madrugada', 'sem graça', 'salvou a noite'],
  ['Coisas úteis numa viagem', 'nem fez falta', 'indispensável'],
  ['Mentiras mais comuns', 'ninguém fala', 'todo mundo fala'],
  ['Jeitos de procrastinar', 'nunca faço', 'faço sempre'],
  ['Coisas mais satisfatórias', 'irritante', 'satisfação pura'],
  ['Pets exóticos', 'normalzinho', 'muito estranho'],
  ['Mortes em filme de terror', 'improvável', 'clichê'],
  ['Coisas que te fazem rir', 'nada engraçado', 'choro de rir'],
  ['Coisas que sua avó diria', 'nunca diria', 'diz toda hora'],
  ['Coisas sem as quais você não vive', 'vivo sem', 'não vivo sem'],
  ['Desenhos animados', 'esqueci que existe', 'marcou a infância'],
  ['Pratos de restaurante', 'barato', 'exorbitante'],
  ['Dores', 'leve', 'insuportável'],
  ['Coisas que você faz no banho', 'nunca', 'sempre'],
  ['Desafios físicos', 'moleza', 'impossível'],
  ['Comidas estranhas', 'normal', 'bizarro'],
  ['Coisas que te dão sono', 'desperta', 'apago na hora'],
  ['Meios de transporte', 'péssimo', 'perfeito'],
  ['Lugares pra morar', 'nunca moraria', 'moraria amanhã'],
  ['Habilidades na cozinha', 'queimo água', 'chef'],
  ['Coisas que você faria numa festa', 'jamais', 'primeiro a fazer'],
  ['Coisas mais inteligentes', 'burrice', 'genialidade'],
  ['Animais que você venceria numa briga', 'perco feio', 'ganho fácil'],
  ['Defeitos de vizinho', 'tolerável', 'insuportável'],
  ['Fantasias de carnaval', 'sem graça', 'genial'],
  ['Coisas que você faz sozinho em casa', 'nunca', 'sempre'],
  ['Coisas mais duradouras', 'dura um segundo', 'eterno'],
  ['Aplicativos do celular', 'apagaria agora', 'não vivo sem'],
  ['Coisas mais brasileiras', 'nada brasileiro', 'Brasil raiz'],
  ['Ingredientes de pizza', 'nunca na pizza', 'indispensável'],
  ['Coisas mais quentes', 'gelado', 'escaldante'],
  ['Momentos constrangedores', 'de boa', 'traumático'],
  ['Hobbies', 'entediante', 'apaixonante'],
  ['Coisas que crianças adoram', 'odeiam', 'adoram'],
  ['Coisas difíceis de esconder dos pais', 'fácil', 'impossível'],
  ['Atividades num dia de chuva', 'tédio', 'perfeito'],
  ['Coisas pra salvar de um incêndio', 'deixaria', 'salvaria primeiro'],
  ['Tarefas que um robô faria', 'humano ganha', 'robô ganha fácil'],
  ['Clichês de novela', 'raro', 'sempre acontece'],
  ['Coisas mais viciantes', 'larga fácil', 'impossível largar'],
  ['Destinos de lua de mel', 'nunca', 'perfeito'],
  ['Coisas mais bonitas', 'feio', 'lindíssimo'],
  ['Coisas que você faria por um amigo', 'nem pensar', 'faria sem pensar'],
  ['Profissões mais respeitadas', 'nenhum respeito', 'muito respeitada'],
  ['Coisas mais misteriosas', 'óbvio', 'mistério total'],
  ['Coisas que dão nostalgia', 'nada', 'muita saudade'],
  ['Comidas de churrasco', 'ninguém pega', 'acaba primeiro'],
  ['Frases difíceis de dizer', 'fácil', 'travei'],
  ['Sons', 'irritante', 'relaxante'],
  ['Animais mais inteligentes', 'pouco esperto', 'gênio'],
];

export const THEMES: readonly Theme[] = RAW.map(([titulo, min, max]) => ({ titulo, min, max }));

export function pickTheme(rng: Rng, used: readonly number[]): { theme: Theme; used: number[] } {
  const all = THEMES.map((_, i) => i);
  const available = all.filter((i) => !used.includes(i));
  const exhausted = available.length === 0;
  const pool = exhausted ? all : available;
  const index = pool[randomInt(rng, pool.length)]!;
  return { theme: THEMES[index]!, used: [...(exhausted ? [] : used), index] };
}

export function cleanTheme(input: Theme): Theme | null {
  const titulo = input.titulo.trim();
  const min = input.min.trim();
  const max = input.max.trim();
  const fits = (s: string, limit: number) => s.length >= 1 && s.length <= limit;
  if (!fits(titulo, THEME_LIMITS.titulo)) return null;
  if (!fits(min, THEME_LIMITS.extremo) || !fits(max, THEME_LIMITS.extremo)) return null;
  return { titulo, min, max };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -w shared`
Expected: PASS. Se `tem pelo menos 100 temas` falhar por algum extremo com mais de 30 caracteres, encurte o texto daquele tema (não aumente o limite).

- [ ] **Step 5: Commit**

```bash
git add shared
git commit -m "feat(shared): 100+ temas do ITO e validação de tema próprio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Regras do ITO — lobby, tema e distribuição

**Files:**
- Create: `shared/src/games/ito/rules.ts`
- Test: `shared/test/ito-rules.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

`shared/test/ito-rules.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { GameContext } from '../src/game';
import { applyItoAction, initialItoState } from '../src/games/ito/rules';
import type { ItoAction, ItoState } from '../src/games/ito/types';
import { mulberry32 } from '../src/rng';

export function ctx(active: string[], hostId: string | null = active[0] ?? null, seed = 1): GameContext {
  return { hostId, active, rng: mulberry32(seed) };
}

export function act(state: ItoState, playerId: string, action: ItoAction, c: GameContext): ItoState {
  const res = applyItoAction(state, playerId, action, c);
  if (!res.ok) throw new Error(`ação recusada: ${res.error}`);
  return res.state;
}

export function errorOf(state: ItoState, playerId: string, action: ItoAction, c: GameContext): string {
  const res = applyItoAction(state, playerId, action, c);
  if (res.ok) throw new Error('esperava erro');
  return res.error;
}

/** Leva um jogo de `players` até a fase de ordenação. */
export function toSorting(players: string[], mode: 'livre' | 'campanha' = 'livre'): ItoState {
  const c = ctx(players);
  let s = initialItoState();
  s = act(s, players[0]!, { type: 'setMode', mode }, c);
  s = act(s, players[0]!, { type: 'start' }, c);
  return act(s, players[0]!, { type: 'beginRound' }, c);
}

describe('lobby', () => {
  it('começa no lobby, modo livre, 3 vidas', () => {
    const s = initialItoState();
    expect(s.phase).toBe('lobby');
    expect(s.mode).toBe('livre');
    expect(s.lives).toBe(3);
  });

  it('só o host muda o modo', () => {
    const c = ctx(['a', 'b']);
    expect(errorOf(initialItoState(), 'b', { type: 'setMode', mode: 'campanha' }, c)).toBe('not_host');
    expect(act(initialItoState(), 'a', { type: 'setMode', mode: 'campanha' }, c).mode).toBe('campanha');
  });

  it('precisa de 2 jogadores ativos para começar', () => {
    expect(errorOf(initialItoState(), 'a', { type: 'start' }, ctx(['a']))).toBe('not_enough_players');
  });

  it('start vai para a fase de tema com os ativos como jogadores', () => {
    const s = act(initialItoState(), 'a', { type: 'start' }, ctx(['a', 'b', 'c']));
    expect(s.phase).toBe('theme');
    expect(s.players).toEqual(['a', 'b', 'c']);
    expect(s.theme).not.toBeNull();
    expect(s.usedThemes).toHaveLength(1);
    expect(s.level).toBe(1);
  });

  it('não dá pra começar fora do lobby', () => {
    const c = ctx(['a', 'b']);
    const s = act(initialItoState(), 'a', { type: 'start' }, c);
    expect(errorOf(s, 'a', { type: 'start' }, c)).toBe('bad_phase');
  });
});

describe('tema', () => {
  const c = ctx(['a', 'b']);
  const inTheme = () => act(initialItoState(), 'a', { type: 'start' }, c);

  it('host sorteia outro tema sem repetir', () => {
    const s0 = inTheme();
    const s1 = act(s0, 'a', { type: 'rerollTheme' }, ctx(['a', 'b'], 'a', 99));
    expect(s1.theme?.titulo).not.toBe(s0.theme?.titulo);
    expect(s1.usedThemes).toHaveLength(2);
  });

  it('host define tema próprio (limpo)', () => {
    const s = act(inTheme(), 'a', { type: 'customTheme', theme: { titulo: ' Pizzas ', min: 'ruim', max: 'boa' } }, c);
    expect(s.theme).toEqual({ titulo: 'Pizzas', min: 'ruim', max: 'boa' });
  });

  it('rejeita tema inválido e não-host', () => {
    expect(errorOf(inTheme(), 'a', { type: 'customTheme', theme: { titulo: '', min: 'a', max: 'b' } }, c)).toBe('bad_theme');
    expect(errorOf(inTheme(), 'b', { type: 'rerollTheme' }, c)).toBe('not_host');
  });
});

describe('distribuição', () => {
  it('modo livre: 1 carta por jogador, valores únicos de 1 a 100', () => {
    const s = toSorting(['a', 'b', 'c', 'd']);
    expect(s.phase).toBe('sorting');
    const cards = Object.values(s.cards);
    expect(cards).toHaveLength(4);
    expect(new Set(cards.map((x) => x.value)).size).toBe(4);
    for (const card of cards) {
      expect(card.value).toBeGreaterThanOrEqual(1);
      expect(card.value).toBeLessThanOrEqual(100);
      expect(card.clue).toBe('');
    }
    expect(cards.map((x) => x.owner).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(s.row).toEqual([]);
  });

  it('campanha nível 1 dá 1 carta por jogador', () => {
    const s = toSorting(['a', 'b'], 'campanha');
    expect(Object.values(s.cards)).toHaveLength(2);
  });

  it('10 jogadores no nível 3 recebem 30 cartas únicas', () => {
    const players = Array.from({ length: 10 }, (_, i) => `p${i}`);
    const c = ctx(players);
    let s = toSorting(players, 'campanha');
    s = { ...s, phase: 'theme', level: 3 };
    s = act(s, 'p0', { type: 'beginRound' }, c);
    const values = Object.values(s.cards).map((x) => x.value);
    expect(values).toHaveLength(30);
    expect(new Set(values).size).toBe(30);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -w shared -- ito-rules`
Expected: FAIL — `Cannot find module '../src/games/ito/rules'`.

- [ ] **Step 3: Implementar `shared/src/games/ito/rules.ts`**

```ts
import type { ActionResult, GameContext } from '../../game';
import { MIN_PLAYERS } from '../../players';
import { shuffle } from '../../rng';
import { cleanTheme, pickTheme } from './themes';
import { CAMPAIGN_LIVES, type ItoAction, type ItoCard, type ItoPhase, type ItoState } from './types';

const fail = (error: string): ActionResult<ItoState> => ({ ok: false, error });
const ok = (state: ItoState): ActionResult<ItoState> => ({ ok: true, state });

function hostOnly(isHost: boolean, state: ItoState, phase: ItoPhase): string | null {
  if (!isHost) return 'not_host';
  if (state.phase !== phase) return 'bad_phase';
  return null;
}

export function initialItoState(): ItoState {
  return {
    phase: 'lobby',
    mode: 'livre',
    players: [],
    level: 1,
    lives: CAMPAIGN_LIVES,
    theme: null,
    usedThemes: [],
    cards: {},
    row: [],
    ready: [],
    reveal: null,
    outcome: null,
  };
}

function toThemePhase(state: ItoState, players: string[], level: number, lives: number, ctx: GameContext): ItoState {
  const { theme, used } = pickTheme(ctx.rng, state.usedThemes);
  return {
    ...state,
    phase: 'theme',
    players,
    level,
    lives,
    theme,
    usedThemes: used,
    cards: {},
    row: [],
    ready: [],
    reveal: null,
    outcome: null,
  };
}

function deal(state: ItoState, ctx: GameContext): ItoState {
  const perPlayer = state.mode === 'campanha' ? state.level : 1;
  const values = shuffle(
    ctx.rng,
    Array.from({ length: 100 }, (_, i) => i + 1),
  );
  const cards: Record<string, ItoCard> = {};
  let next = 0;
  for (const owner of state.players) {
    for (let n = 0; n < perPlayer; n++) {
      const id = `${owner}:${n}`;
      cards[id] = { id, owner, value: values[next++]!, clue: '' };
    }
  }
  return { ...state, phase: 'sorting', cards, row: [], ready: [] };
}

export function applyItoAction(
  state: ItoState,
  playerId: string,
  action: ItoAction,
  ctx: GameContext,
): ActionResult<ItoState> {
  const isHost = ctx.hostId === playerId;
  switch (action.type) {
    case 'setMode': {
      const e = hostOnly(isHost, state, 'lobby');
      if (e) return fail(e);
      return ok({ ...state, mode: action.mode });
    }
    case 'start': {
      const e = hostOnly(isHost, state, 'lobby');
      if (e) return fail(e);
      if (ctx.active.length < MIN_PLAYERS) return fail('not_enough_players');
      return ok(toThemePhase(state, [...ctx.active], 1, CAMPAIGN_LIVES, ctx));
    }
    case 'rerollTheme': {
      const e = hostOnly(isHost, state, 'theme');
      if (e) return fail(e);
      const { theme, used } = pickTheme(ctx.rng, state.usedThemes);
      return ok({ ...state, theme, usedThemes: used });
    }
    case 'customTheme': {
      const e = hostOnly(isHost, state, 'theme');
      if (e) return fail(e);
      const theme = cleanTheme(action.theme);
      if (!theme) return fail('bad_theme');
      return ok({ ...state, theme });
    }
    case 'beginRound': {
      const e = hostOnly(isHost, state, 'theme');
      if (e) return fail(e);
      return ok(deal(state, ctx));
    }
    default:
      return fail('bad_action');
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -w shared`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared
git commit -m "feat(shared): ITO lobby, tema e distribuição de cartas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Regras do ITO — fila, dicas e prontos

**Files:**
- Modify: `shared/src/games/ito/rules.ts`
- Test: `shared/test/ito-rules.test.ts` (acrescentar ao fim)

- [ ] **Step 1: Acrescentar testes ao fim de `shared/test/ito-rules.test.ts`**

```ts
describe('fila e dicas', () => {
  const c = ctx(['a', 'b', 'c']);

  it('dono coloca carta na fila na posição pedida', () => {
    let s = toSorting(['a', 'b', 'c']);
    s = act(s, 'a', { type: 'place', cardId: 'a:0', index: 0 }, c);
    s = act(s, 'b', { type: 'place', cardId: 'b:0', index: 0 }, c);
    s = act(s, 'c', { type: 'place', cardId: 'c:0', index: 1 }, c);
    expect(s.row).toEqual(['b:0', 'c:0', 'a:0']);
  });

  it('reposicionar move a carta sem duplicar', () => {
    let s = toSorting(['a', 'b', 'c']);
    s = act(s, 'a', { type: 'place', cardId: 'a:0', index: 0 }, c);
    s = act(s, 'b', { type: 'place', cardId: 'b:0', index: 1 }, c);
    s = act(s, 'a', { type: 'place', cardId: 'a:0', index: 5 }, c);
    expect(s.row).toEqual(['b:0', 'a:0']);
  });

  it('índice é limitado ao tamanho da fila', () => {
    let s = toSorting(['a', 'b', 'c']);
    s = act(s, 'a', { type: 'place', cardId: 'a:0', index: 99 }, c);
    expect(s.row).toEqual(['a:0']);
  });

  it('não move carta alheia nem carta inexistente', () => {
    const s = toSorting(['a', 'b', 'c']);
    expect(errorOf(s, 'b', { type: 'place', cardId: 'a:0', index: 0 }, c)).toBe('not_owner');
    expect(errorOf(s, 'b', { type: 'place', cardId: 'zz:0', index: 0 }, c)).toBe('unknown_card');
  });

  it('return tira a carta da fila', () => {
    let s = toSorting(['a', 'b', 'c']);
    s = act(s, 'a', { type: 'place', cardId: 'a:0', index: 0 }, c);
    s = act(s, 'a', { type: 'return', cardId: 'a:0' }, c);
    expect(s.row).toEqual([]);
  });

  it('dono escreve dica limpa', () => {
    let s = toSorting(['a', 'b', 'c']);
    s = act(s, 'a', { type: 'clue', cardId: 'a:0', text: '  Paris   Texas' }, c);
    expect(s.cards['a:0']?.clue).toBe('Paris Texas');
    expect(errorOf(s, 'b', { type: 'clue', cardId: 'a:0', text: 'x' }, c)).toBe('not_owner');
  });

  it('ações de carta fora da ordenação são recusadas', () => {
    const s = act(initialItoState(), 'a', { type: 'start' }, c);
    expect(errorOf(s, 'a', { type: 'place', cardId: 'a:0', index: 0 }, c)).toBe('bad_phase');
  });
});

describe('prontos', () => {
  const c = ctx(['a', 'b']);

  it('não fica pronto com carta fora da fila', () => {
    const s = toSorting(['a', 'b']);
    expect(errorOf(s, 'a', { type: 'ready', ready: true }, c)).toBe('cards_missing');
  });

  it('espectador não pode ficar pronto', () => {
    const s = toSorting(['a', 'b']);
    expect(errorOf(s, 'z', { type: 'ready', ready: true }, ctx(['a', 'b', 'z']))).toBe('not_player');
  });

  it('mexer na carta ou na dica tira o pronto', () => {
    let s = toSorting(['a', 'b']);
    s = act(s, 'a', { type: 'place', cardId: 'a:0', index: 0 }, c);
    s = act(s, 'a', { type: 'ready', ready: true }, c);
    expect(s.ready).toEqual(['a']);
    s = act(s, 'a', { type: 'clue', cardId: 'a:0', text: 'oi' }, c);
    expect(s.ready).toEqual([]);
    s = act(s, 'a', { type: 'ready', ready: true }, c);
    s = act(s, 'a', { type: 'place', cardId: 'a:0', index: 0 }, c);
    expect(s.ready).toEqual([]);
  });

  it('desmarcar pronto', () => {
    let s = toSorting(['a', 'b']);
    s = act(s, 'a', { type: 'place', cardId: 'a:0', index: 0 }, c);
    s = act(s, 'a', { type: 'ready', ready: true }, c);
    s = act(s, 'a', { type: 'ready', ready: false }, c);
    expect(s.ready).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -w shared -- ito-rules`
Expected: FAIL — vários testes com `ação recusada: bad_action`.

- [ ] **Step 3: Implementar — em `shared/src/games/ito/rules.ts`**

Acrescentar o import de `cleanClue` (substitua a linha `import { MIN_PLAYERS } from '../../players';`):
```ts
import { MIN_PLAYERS, cleanClue } from '../../players';
```

Acrescentar estas funções logo acima de `export function applyItoAction`:
```ts
function unready(state: ItoState, playerId: string): ItoState {
  return { ...state, ready: state.ready.filter((p) => p !== playerId) };
}

function ownCard(state: ItoState, playerId: string, cardId: string): ItoCard | string {
  if (state.phase !== 'sorting') return 'bad_phase';
  const card = state.cards[cardId];
  if (!card) return 'unknown_card';
  if (card.owner !== playerId) return 'not_owner';
  return card;
}
```

Acrescentar estes `case` dentro do `switch`, imediatamente antes de `default:`:
```ts
    case 'place': {
      const card = ownCard(state, playerId, action.cardId);
      if (typeof card === 'string') return fail(card);
      const row = state.row.filter((id) => id !== card.id);
      const index = Math.min(Math.max(0, Math.trunc(action.index)), row.length);
      row.splice(index, 0, card.id);
      return ok(unready({ ...state, row }, playerId));
    }
    case 'return': {
      const card = ownCard(state, playerId, action.cardId);
      if (typeof card === 'string') return fail(card);
      return ok(unready({ ...state, row: state.row.filter((id) => id !== card.id) }, playerId));
    }
    case 'clue': {
      const card = ownCard(state, playerId, action.cardId);
      if (typeof card === 'string') return fail(card);
      const cards = { ...state.cards, [card.id]: { ...card, clue: cleanClue(action.text) } };
      return ok(unready({ ...state, cards }, playerId));
    }
    case 'ready': {
      if (state.phase !== 'sorting') return fail('bad_phase');
      if (!state.players.includes(playerId)) return fail('not_player');
      if (!action.ready) return ok(unready(state, playerId));
      const mine = Object.values(state.cards).filter((c) => c.owner === playerId);
      if (!mine.every((c) => state.row.includes(c.id))) return fail('cards_missing');
      return ok({ ...unready(state, playerId), ready: [...unready(state, playerId).ready, playerId] });
    }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -w shared`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared
git commit -m "feat(shared): ITO fila, dicas e prontos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Regras do ITO — revelação, campanha, próxima rodada e visão

**Files:**
- Modify: `shared/src/games/ito/rules.ts`
- Test: `shared/test/ito-rules.test.ts` (acrescentar ao fim)

- [ ] **Step 1: Acrescentar testes ao fim de `shared/test/ito-rules.test.ts`**

Acrescentar `itoViewFor, maybeReveal` ao import de `../src/games/ito/rules` no topo do arquivo:
```ts
import { applyItoAction, initialItoState, itoViewFor, maybeReveal } from '../src/games/ito/rules';
```

Acrescentar ao fim:
```ts
/** Força valores conhecidos nas cartas para testes determinísticos. */
function withValues(state: ItoState, values: Record<string, number>): ItoState {
  const cards = { ...state.cards };
  for (const [id, value] of Object.entries(values)) cards[id] = { ...cards[id]!, value };
  return { ...state, cards };
}

function placeAll(state: ItoState, order: string[], c: GameContext): ItoState {
  let s = state;
  order.forEach((cardId, i) => {
    s = act(s, cardId.split(':')[0]!, { type: 'place', cardId, index: i }, c);
  });
  return s;
}

function readyAll(state: ItoState, players: string[], c: GameContext): ItoState {
  return players.reduce((s, p) => act(s, p, { type: 'ready', ready: true }, c), state);
}

describe('revelação', () => {
  const c = ctx(['a', 'b']);

  it('revela sozinho quando todos ficam prontos', () => {
    let s = withValues(toSorting(['a', 'b']), { 'a:0': 10, 'b:0': 80 });
    s = placeAll(s, ['a:0', 'b:0'], c);
    s = readyAll(s, ['a', 'b'], c);
    expect(s.phase).toBe('reveal');
    expect(s.outcome).toBe('round_won');
    expect(s.reveal?.map((e) => e.value)).toEqual([10, 80]);
  });

  it('modo livre perde com carta fora de ordem', () => {
    let s = withValues(toSorting(['a', 'b']), { 'a:0': 90, 'b:0': 20 });
    s = readyAll(placeAll(s, ['a:0', 'b:0'], c), ['a', 'b'], c);
    expect(s.outcome).toBe('round_lost');
    expect(s.reveal?.map((e) => e.error)).toEqual([false, true]);
  });

  it('ignora jogador inativo na contagem de prontos', () => {
    let s = withValues(toSorting(['a', 'b']), { 'a:0': 10, 'b:0': 80 });
    s = placeAll(s, ['a:0', 'b:0'], c);
    s = act(s, 'a', { type: 'ready', ready: true }, c);
    expect(s.phase).toBe('sorting');
    s = maybeReveal(s, ctx(['a']));
    expect(s.phase).toBe('reveal');
  });

  it('não revela sozinho se faltar carta na fila', () => {
    let s = toSorting(['a', 'b']);
    s = act(s, 'a', { type: 'place', cardId: 'a:0', index: 0 }, c);
    s = act(s, 'a', { type: 'ready', ready: true }, c);
    expect(maybeReveal(s, ctx(['a'])).phase).toBe('sorting');
  });

  it('host força revelação só com todas as cartas na fila', () => {
    let s = toSorting(['a', 'b']);
    expect(errorOf(s, 'a', { type: 'forceReveal' }, c)).toBe('cards_missing');
    s = placeAll(s, ['a:0', 'b:0'], c);
    expect(errorOf(s, 'b', { type: 'forceReveal' }, c)).toBe('not_host');
    expect(act(s, 'a', { type: 'forceReveal' }, c).phase).toBe('reveal');
  });
});

describe('campanha', () => {
  const c = ctx(['a', 'b']);

  function playLevel(s: ItoState, valuesInRowOrder: number[]): ItoState {
    const order = [...s.players.flatMap((p) => Object.values(s.cards).filter((x) => x.owner === p).map((x) => x.id))];
    const values: Record<string, number> = {};
    order.forEach((id, i) => {
      values[id] = valuesInRowOrder[i]!;
    });
    let next = withValues(s, values);
    next = placeAll(next, order, c);
    return readyAll(next, s.players, c);
  }

  it('sobe de nível com tema novo e mais cartas', () => {
    let s = toSorting(['a', 'b'], 'campanha');
    s = playLevel(s, [10, 20]);
    expect(s.outcome).toBe('level_cleared');
    const tema1 = s.theme?.titulo;
    s = act(s, 'a', { type: 'next' }, c);
    expect(s.phase).toBe('theme');
    expect(s.level).toBe(2);
    expect(s.theme?.titulo).not.toBe(tema1);
    s = act(s, 'a', { type: 'beginRound' }, c);
    expect(Object.values(s.cards)).toHaveLength(4);
  });

  it('perde vidas por erro e termina em derrota', () => {
    let s = toSorting(['a', 'b'], 'campanha');
    s = playLevel(s, [50, 10]);
    expect(s.lives).toBe(2);
    expect(s.outcome).toBe('level_cleared');
    s = act(act(s, 'a', { type: 'next' }, c), 'a', { type: 'beginRound' }, c);
    s = playLevel(s, [90, 80, 70, 60]);
    expect(s.lives).toBe(0);
    expect(s.outcome).toBe('lost');
    s = act(s, 'a', { type: 'next' }, c);
    expect(s.phase).toBe('lobby');
    expect(s.mode).toBe('campanha');
  });

  it('vence ao passar do nível 3', () => {
    let s = toSorting(['a', 'b'], 'campanha');
    s = playLevel(s, [1, 2]);
    s = act(act(s, 'a', { type: 'next' }, c), 'a', { type: 'beginRound' }, c);
    s = playLevel(s, [1, 2, 3, 4]);
    s = act(act(s, 'a', { type: 'next' }, c), 'a', { type: 'beginRound' }, c);
    s = playLevel(s, [1, 2, 3, 4, 5, 6]);
    expect(s.outcome).toBe('won');
  });

  it('next durante a ordenação descarta a rodada sem perder vida', () => {
    let s = toSorting(['a', 'b'], 'campanha');
    s = act(s, 'a', { type: 'next' }, c);
    expect(s.phase).toBe('theme');
    expect(s.level).toBe(1);
    expect(s.lives).toBe(3);
  });

  it('modo livre: next após revelar começa nova rodada com os ativos', () => {
    let s = withValues(toSorting(['a', 'b']), { 'a:0': 1, 'b:0': 2 });
    s = readyAll(placeAll(s, ['a:0', 'b:0'], c), ['a', 'b'], c);
    s = act(s, 'a', { type: 'next' }, ctx(['a', 'b', 'c']));
    expect(s.phase).toBe('theme');
    expect(s.players).toEqual(['a', 'b', 'c']);
  });

  it('next exige host, fase certa e 2 ativos', () => {
    const s = toSorting(['a', 'b']);
    expect(errorOf(s, 'b', { type: 'next' }, c)).toBe('not_host');
    expect(errorOf(s, 'a', { type: 'next' }, ctx(['a']))).toBe('not_enough_players');
    expect(errorOf(initialItoState(), 'a', { type: 'next' }, c)).toBe('bad_phase');
  });
});

describe('visão por jogador', () => {
  const c = ctx(['a', 'b']);

  it('esconde números alheios antes da revelação', () => {
    const s = toSorting(['a', 'b']);
    const v = itoViewFor(s, 'a');
    expect(v.cards['a:0']?.value).toBe(s.cards['a:0']?.value);
    expect(v.cards['b:0']?.value).toBeNull();
    expect(JSON.stringify(itoViewFor(s, null))).not.toContain(`"value":${s.cards['b:0']?.value}`);
    expect('usedThemes' in v).toBe(false);
  });

  it('mostra todos os números na revelação', () => {
    let s = toSorting(['a', 'b']);
    s = act(placeAll(s, ['a:0', 'b:0'], c), 'a', { type: 'forceReveal' }, c);
    const v = itoViewFor(s, 'a');
    expect(v.cards['b:0']?.value).toBe(s.cards['b:0']?.value);
  });

  it('dicas são visíveis para todos', () => {
    let s = toSorting(['a', 'b']);
    s = act(s, 'b', { type: 'clue', cardId: 'b:0', text: 'Japão' }, c);
    expect(itoViewFor(s, 'a').cards['b:0']?.clue).toBe('Japão');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -w shared -- ito-rules`
Expected: FAIL — `itoViewFor`/`maybeReveal` não exportados.

- [ ] **Step 3: Implementar — em `shared/src/games/ito/rules.ts`**

Substituir as linhas de import do topo por:
```ts
import type { ActionResult, GameContext, GameModule } from '../../game';
import { MIN_PLAYERS, cleanClue } from '../../players';
import { shuffle } from '../../rng';
import { computeReveal, resolveOutcome } from './scoring';
import { cleanTheme, pickTheme } from './themes';
import {
  CAMPAIGN_LIVES,
  type ItoAction,
  type ItoCard,
  type ItoPhase,
  type ItoState,
  type ItoView,
} from './types';
```

Acrescentar logo acima de `export function applyItoAction`:
```ts
function allCardsInRow(state: ItoState): boolean {
  return state.row.length === Object.keys(state.cards).length;
}

function reveal(state: ItoState): ItoState {
  const entries = computeReveal(state.row, state.cards);
  const errors = entries.filter((e) => e.error).length;
  const { lives, outcome } = resolveOutcome(state.mode, state.level, state.lives, errors);
  return { ...state, phase: 'reveal', reveal: entries, lives, outcome };
}

/** Revela quando todos os participantes ativos estão prontos e todas as cartas estão na fila. */
export function maybeReveal(state: ItoState, ctx: GameContext): ItoState {
  if (state.phase !== 'sorting' || !allCardsInRow(state)) return state;
  const mustBeReady = state.players.filter((p) => ctx.active.includes(p));
  if (mustBeReady.length === 0) return state;
  if (!mustBeReady.every((p) => state.ready.includes(p))) return state;
  return reveal(state);
}

function next(state: ItoState, ctx: GameContext): ActionResult<ItoState> {
  if (state.phase !== 'sorting' && state.phase !== 'reveal') return fail('bad_phase');
  if (state.phase === 'reveal' && (state.outcome === 'won' || state.outcome === 'lost')) {
    return ok({ ...initialItoState(), mode: state.mode, usedThemes: state.usedThemes });
  }
  if (ctx.active.length < MIN_PLAYERS) return fail('not_enough_players');
  const players = [...ctx.active];
  if (state.phase === 'sorting') return ok(toThemePhase(state, players, state.level, state.lives, ctx));
  if (state.outcome === 'level_cleared') return ok(toThemePhase(state, players, state.level + 1, state.lives, ctx));
  return ok(toThemePhase(state, players, 1, CAMPAIGN_LIVES, ctx));
}
```

No `case 'ready'`, trocar o `return` final (a linha com `ready: [...unready(...`) por:
```ts
      const readied = unready(state, playerId);
      return ok(maybeReveal({ ...readied, ready: [...readied.ready, playerId] }, ctx));
```

Acrescentar estes `case` antes de `default:`:
```ts
    case 'forceReveal': {
      const e = hostOnly(isHost, state, 'sorting');
      if (e) return fail(e);
      if (!allCardsInRow(state)) return fail('cards_missing');
      return ok(reveal(state));
    }
    case 'next': {
      if (!isHost) return fail('not_host');
      return next(state, ctx);
    }
```

Acrescentar ao fim do arquivo:
```ts
export function itoViewFor(state: ItoState, viewerId: string | null): ItoView {
  const showAll = state.phase === 'reveal';
  const cards: ItoView['cards'] = {};
  for (const card of Object.values(state.cards)) {
    cards[card.id] = {
      id: card.id,
      owner: card.owner,
      clue: card.clue,
      value: showAll || card.owner === viewerId ? card.value : null,
    };
  }
  const { usedThemes: _usedThemes, cards: _cards, ...rest } = state;
  return { ...rest, cards };
}

export const ito: GameModule<ItoState, ItoAction, ItoView> = {
  id: 'ito',
  initialState: initialItoState,
  applyAction: applyItoAction,
  viewFor: itoViewFor,
  onPresenceChange: maybeReveal,
};
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -w shared`
Expected: PASS (todos os arquivos).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck -w shared`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add shared
git commit -m "feat(shared): ITO revelação, campanha, próxima rodada e visão por jogador

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Sala (entrar, presença, host, ações, visão, alarmes)

**Files:**
- Create: `shared/src/room.ts`
- Test: `shared/test/room.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

`shared/test/room.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS } from '../src/players';
import { mulberry32 } from '../src/rng';
import {
  DISCONNECT_GRACE_MS,
  ROOM_TTL_MS,
  activePlayers,
  createRoom,
  disconnect,
  isExpired,
  joinRoom,
  nextAlarmAt,
  roomAction,
  roomView,
  tick,
  type Room,
} from '../src/room';

const T0 = 1_000_000;
const rng = mulberry32(1);

function join(room: Room, token: string, name: string, colorIndex: number, now = T0) {
  const res = joinRoom(room, { token, name, color: PLAYER_COLORS[colorIndex]! }, `id-${token}`, now);
  if (!res.ok) throw new Error(res.error);
  return res;
}

function roomWith(n: number): Room {
  let room = createRoom('ABCD', T0);
  for (let i = 0; i < n; i++) room = join(room, `tok${i}`, `P${i}`, i).room;
  return room;
}

describe('joinRoom', () => {
  it('primeiro a entrar vira host', () => {
    const res = join(createRoom('ABCD', T0), 'tok0', 'Ana', 0);
    expect(res.playerId).toBe('id-tok0');
    expect(res.room.hostId).toBe('id-tok0');
    expect(res.room.seats).toHaveLength(1);
  });

  it('mesmo token reconecta no mesmo assento', () => {
    let room = roomWith(2);
    room = disconnect(room, 'id-tok0', T0 + 10);
    const res = join(room, 'tok0', 'Ana 2', 0, T0 + 20);
    expect(res.playerId).toBe('id-tok0');
    expect(res.room.seats).toHaveLength(2);
    expect(res.room.seats[0]).toMatchObject({ name: 'Ana 2', connected: true, disconnectedAt: null });
  });

  it('valida nome e cor', () => {
    const room = createRoom('ABCD', T0);
    expect(joinRoom(room, { token: 't', name: '  ', color: PLAYER_COLORS[0] }, 'x', T0)).toEqual({ ok: false, error: 'bad_name' });
    expect(joinRoom(room, { token: 't', name: 'A', color: '#000000' }, 'x', T0)).toEqual({ ok: false, error: 'bad_color' });
  });

  it('recusa cor já usada por outro jogador', () => {
    const room = roomWith(1);
    expect(joinRoom(room, { token: 'novo', name: 'B', color: PLAYER_COLORS[0] }, 'x', T0)).toEqual({ ok: false, error: 'color_taken' });
  });

  it('recusa o 11º jogador', () => {
    const room = roomWith(10);
    expect(joinRoom(room, { token: 'novo', name: 'X', color: PLAYER_COLORS[0] }, 'x', T0)).toEqual({ ok: false, error: 'room_full' });
  });

  it('com sala cheia, reaproveita assento de quem saiu há mais de 30 s e não está jogando', () => {
    let room = roomWith(10);
    room = disconnect(room, 'id-tok3', T0);
    const later = T0 + DISCONNECT_GRACE_MS + 1;
    const res = joinRoom(room, { token: 'novo', name: 'X', color: PLAYER_COLORS[3] }, 'id-novo', later);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.room.seats).toHaveLength(10);
      expect(res.room.seats.some((s) => s.id === 'id-tok3')).toBe(false);
    }
  });
});

describe('presença e host', () => {
  it('desconectado continua ativo durante a tolerância', () => {
    let room = roomWith(2);
    room = disconnect(room, 'id-tok1', T0);
    expect(activePlayers(room, T0 + DISCONNECT_GRACE_MS - 1)).toEqual(['id-tok0', 'id-tok1']);
    expect(activePlayers(room, T0 + DISCONNECT_GRACE_MS)).toEqual(['id-tok0']);
  });

  it('host passa para o próximo ativo depois da tolerância', () => {
    let room = roomWith(3);
    room = disconnect(room, 'id-tok0', T0);
    expect(tick(room, T0 + 1000, rng).hostId).toBe('id-tok0');
    expect(tick(room, T0 + DISCONNECT_GRACE_MS, rng).hostId).toBe('id-tok1');
  });

  it('host volta a existir quando alguém entra numa sala sem host ativo', () => {
    let room = roomWith(1);
    room = disconnect(room, 'id-tok0', T0);
    room = tick(room, T0 + DISCONNECT_GRACE_MS, rng);
    const res = join(room, 'tokX', 'X', 5, T0 + DISCONNECT_GRACE_MS + 1);
    expect(tick(res.room, T0 + DISCONNECT_GRACE_MS + 1, rng).hostId).toBe('id-tokX');
  });
});

describe('roomAction e roomView', () => {
  it('aplica ação do jogo com os ativos', () => {
    const room = roomWith(2);
    const res = roomAction(room, 'id-tok0', { type: 'start' }, rng, T0 + 5);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.room.game.phase).toBe('theme');
      expect(res.room.game.players).toEqual(['id-tok0', 'id-tok1']);
      expect(res.room.lastActivity).toBe(T0 + 5);
    }
  });

  it('recusa quem não está na sala e repassa erro do jogo', () => {
    const room = roomWith(2);
    expect(roomAction(room, 'intruso', { type: 'start' }, rng, T0)).toEqual({ ok: false, error: 'not_member' });
    expect(roomAction(room, 'id-tok1', { type: 'start' }, rng, T0)).toEqual({ ok: false, error: 'not_host' });
  });

  it('visão não vaza tokens e marca quem está vendo', () => {
    const room = roomWith(2);
    const view = roomView(room, 'id-tok1');
    expect(view.you).toBe('id-tok1');
    expect(view).not.toHaveProperty('tokens');
    expect(JSON.stringify(view)).not.toContain('"tok0"');
    expect(view.seats[0]).toEqual({ id: 'id-tok0', name: 'P0', color: PLAYER_COLORS[0], connected: true });
  });
});

describe('alarmes', () => {
  it('sem desconexões, o alarme é a expiração', () => {
    const room = roomWith(2);
    expect(nextAlarmAt(room, T0)).toBe(T0 + ROOM_TTL_MS);
  });

  it('com desconexão recente, o alarme é logo após a tolerância', () => {
    const room = disconnect(roomWith(2), 'id-tok1', T0 + 100);
    expect(nextAlarmAt(room, T0 + 200)).toBe(T0 + 100 + DISCONNECT_GRACE_MS + 1000);
  });

  it('expira após 6 h sem atividade', () => {
    const room = roomWith(1);
    expect(isExpired(room, T0 + ROOM_TTL_MS - 1)).toBe(false);
    expect(isExpired(room, T0 + ROOM_TTL_MS)).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -w shared -- room`
Expected: FAIL — `Cannot find module '../src/room'`.

- [ ] **Step 3: Implementar `shared/src/room.ts`**

```ts
import { ito } from './games/ito/rules';
import type { ItoAction, ItoState, ItoView } from './games/ito/types';
import { MAX_PLAYERS, cleanName, isPlayerColor, type PlayerColor } from './players';
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

export interface Room {
  code: string;
  hostId: string | null;
  seats: Seat[];
  /** token secreto → playerId público. Nunca sai do servidor. */
  tokens: Record<string, string>;
  game: ItoState;
  lastActivity: number;
}

export interface SeatView {
  id: string;
  name: string;
  color: PlayerColor;
  connected: boolean;
}

export interface RoomView {
  code: string;
  hostId: string | null;
  you: string | null;
  seats: SeatView[];
  game: ItoView;
}

export type JoinError = 'room_full' | 'bad_name' | 'bad_color' | 'color_taken';
export type JoinResult = { ok: true; room: Room; playerId: string } | { ok: false; error: JoinError };
export type RoomActionResult = { ok: true; room: Room } | { ok: false; error: string };

export function createRoom(code: string, now: number): Room {
  return { code, hostId: null, seats: [], tokens: {}, game: ito.initialState(), lastActivity: now };
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
  const id = room.tokens[input.token] ?? newId;

  let seats = room.seats;
  const existing = seats.find((s) => s.id === id);
  if (!existing && seats.length >= MAX_PLAYERS) {
    const ghost = seats.find((s) => !isActive(s, now) && !room.game.players.includes(s.id));
    if (!ghost) return { ok: false, error: 'room_full' };
    seats = seats.filter((s) => s.id !== ghost.id);
  }
  if (seats.some((s) => s.id !== id && s.color === color)) return { ok: false, error: 'color_taken' };

  const seat: Seat = { id, name, color, connected: true, disconnectedAt: null };
  seats = existing ? seats.map((s) => (s.id === id ? seat : s)) : [...seats, seat];
  const hostId = room.hostId !== null && seats.some((s) => s.id === room.hostId) ? room.hostId : id;
  return {
    ok: true,
    playerId: id,
    room: { ...room, seats, hostId, tokens: { ...room.tokens, [input.token]: id }, lastActivity: now },
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
    hostId = rotated.find((id) => active.includes(id)) ?? hostId;
  }
  const game = ito.onPresenceChange(room.game, { hostId, active, rng });
  return { ...room, hostId, game };
}

export function roomAction(room: Room, playerId: string, action: ItoAction, rng: Rng, now: number): RoomActionResult {
  if (!room.seats.some((s) => s.id === playerId)) return { ok: false, error: 'not_member' };
  const res = ito.applyAction(room.game, playerId, action, {
    hostId: room.hostId,
    active: activePlayers(room, now),
    rng,
  });
  if (!res.ok) return res;
  return { ok: true, room: { ...room, game: res.state, lastActivity: now } };
}

export function roomView(room: Room, viewerId: string | null): RoomView {
  return {
    code: room.code,
    hostId: room.hostId,
    you: viewerId,
    seats: room.seats.map(({ id, name, color, connected }) => ({ id, name, color, connected })),
    game: ito.viewFor(room.game, viewerId),
  };
}

export function isExpired(room: Room, now: number): boolean {
  return now - room.lastActivity >= ROOM_TTL_MS;
}

/** Próximo momento em que o servidor precisa acordar: fim de uma tolerância de desconexão ou expiração. */
export function nextAlarmAt(room: Room, now: number): number {
  const pending = room.seats
    .filter((s) => !s.connected && s.disconnectedAt !== null && now - s.disconnectedAt < DISCONNECT_GRACE_MS)
    .map((s) => s.disconnectedAt! + DISCONNECT_GRACE_MS + 1000);
  return Math.min(room.lastActivity + ROOM_TTL_MS, ...pending);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -w shared`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared
git commit -m "feat(shared): sala com entrada, reconexão, host e alarmes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Protocolo e API pública do `shared`

**Files:**
- Create: `shared/src/protocol.ts`
- Modify: `shared/src/index.ts`
- Test: `shared/test/protocol.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

`shared/test/protocol.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { ERROR_MESSAGES, parseClientMessage } from '../src/protocol';

const parse = (v: unknown) => parseClientMessage(JSON.stringify(v));

describe('parseClientMessage', () => {
  it('aceita join válido', () => {
    expect(parse({ t: 'join', token: 'abcdefgh-1234', name: 'Ana', color: '#8EC5FF' })).toEqual({
      t: 'join',
      token: 'abcdefgh-1234',
      name: 'Ana',
      color: '#8EC5FF',
    });
  });

  it('aceita ações do ITO', () => {
    expect(parse({ t: 'action', action: { type: 'place', cardId: 'a:0', index: 2 } })).not.toBeNull();
    expect(parse({ t: 'action', action: { type: 'customTheme', theme: { titulo: 'x', min: 'a', max: 'b' } } })).not.toBeNull();
  });

  it('aceita fx de cursor com e sem arrasto', () => {
    expect(parse({ t: 'fx.cursor', zone: 'table', x: 0.5, y: 0.2, drag: null })).not.toBeNull();
    expect(parse({ t: 'fx.cursor', zone: 'hand', x: 0.1, y: 0.9, drag: { cardId: 'a:0', index: 1 } })).not.toBeNull();
  });

  it('rejeita lixo', () => {
    expect(parseClientMessage('não é json')).toBeNull();
    expect(parseClientMessage(42)).toBeNull();
    expect(parse({ t: 'hack' })).toBeNull();
    expect(parse({ t: 'action', action: { type: 'place', cardId: 'a:0', index: -1 } })).toBeNull();
    expect(parse({ t: 'join', token: 'curto', name: 'A', color: '#8EC5FF' })).toBeNull();
    expect(parse({ t: 'fx.ping', x: 50, y: 0 })).toBeNull();
  });

  it('tem mensagem em português para todos os códigos de erro conhecidos', () => {
    for (const code of [
      'not_host', 'bad_phase', 'not_owner', 'unknown_card', 'not_enough_players', 'cards_missing',
      'bad_theme', 'not_player', 'bad_action', 'room_full', 'bad_name', 'bad_color', 'color_taken',
      'not_member', 'bad_message', 'not_joined',
    ]) {
      expect(ERROR_MESSAGES[code]).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -w shared -- protocol`
Expected: FAIL — `Cannot find module '../src/protocol'`.

- [ ] **Step 3: Implementar `shared/src/protocol.ts`**

```ts
import { z } from 'zod';
import type { ItoAction } from './games/ito/types';
import type { RoomView } from './room';

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
]);

/** Coordenadas normalizadas; uma pequena folga permite cursor um pouco fora do feltro. */
const coord = z.number().min(-1).max(2);

export const ACTIVITIES = ['thinking', 'writing', 'dragging'] as const;
export type Activity = (typeof ACTIVITIES)[number];

export const clientMessageSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('join'), token: z.string().min(8).max(64), name: z.string().max(100), color: z.string().max(16) }),
  z.object({ t: z.literal('action'), action: itoActionSchema }),
  z.object({
    t: z.literal('fx.cursor'),
    zone: z.enum(['table', 'hand']),
    x: coord,
    y: coord,
    drag: z.object({ cardId, index: rowIndex.nullable() }).nullable(),
  }),
  z.object({ t: z.literal('fx.activity'), activity: z.enum(ACTIVITIES) }),
  z.object({ t: z.literal('fx.ping'), x: coord, y: coord }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type CursorFx = Omit<Extract<ClientMessage, { t: 'fx.cursor' }>, 't'>;

/** Falha a compilação se o schema divergir do tipo ItoAction. */
type Assert<T extends true> = T;
export type ActionSchemaMatches = Assert<z.infer<typeof itoActionSchema> extends ItoAction ? true : false>;

export type ServerMessage =
  | { t: 'welcome'; playerId: string; code: string }
  | { t: 'state'; room: RoomView }
  | ({ t: 'fx.cursor'; from: string } & CursorFx)
  | { t: 'fx.activity'; from: string; activity: Activity }
  | { t: 'fx.ping'; from: string; x: number; y: number }
  | { t: 'error'; code: string; message: string };

export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== 'string') return null;
  try {
    const result = clientMessageSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export const ERROR_MESSAGES: Record<string, string> = {
  not_host: 'Só o host pode fazer isso.',
  bad_phase: 'Agora não dá pra fazer isso.',
  not_owner: 'Essa carta não é sua.',
  unknown_card: 'Carta não encontrada.',
  not_enough_players: 'Precisa de pelo menos 2 jogadores.',
  cards_missing: 'Ainda tem carta fora da mesa.',
  bad_theme: 'Tema inválido.',
  not_player: 'Você está assistindo esta rodada.',
  bad_action: 'Ação desconhecida.',
  room_full: 'A sala está cheia (máx. 10).',
  bad_name: 'Escolha um nome de 1 a 16 letras.',
  bad_color: 'Cor inválida.',
  color_taken: 'Essa cor já foi escolhida.',
  not_member: 'Você não está nesta sala.',
  bad_message: 'Mensagem inválida.',
  not_joined: 'Entre na sala primeiro.',
};
```

- [ ] **Step 4: Substituir `shared/src/index.ts`**

```ts
export * from './game';
export * from './players';
export * from './protocol';
export * from './rng';
export * from './room';
export * from './games/ito/types';
export { THEMES, THEME_LIMITS, cleanTheme, pickTheme } from './games/ito/themes';
export { computeReveal, resolveOutcome } from './games/ito/scoring';
export { applyItoAction, initialItoState, ito, itoViewFor, maybeReveal } from './games/ito/rules';
```

- [ ] **Step 5: Rodar testes e typecheck**

Run: `npm test -w shared && npm run typecheck -w shared`
Expected: PASS e sem erros de tipo.

- [ ] **Step 6: Commit**

```bash
git add shared
git commit -m "feat(shared): protocolo validado com zod e API pública

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Servidor — scaffold do Worker e rotas HTTP

**Files:**
- Create: `server/package.json`, `server/tsconfig.json`, `server/wrangler.jsonc`, `server/vitest.config.ts`, `server/src/index.ts`, `server/src/room-do.ts` (mínimo), `server/test/env.d.ts`, `server/test/http.test.ts`
- Generated: `server/worker-configuration.d.ts`

- [ ] **Step 1: Criar `server/package.json`**

```json
{
  "name": "@cartolina/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "types": "wrangler types",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@cartolina/shared": "*"
  }
}
```

- [ ] **Step 2: Criar `server/wrangler.jsonc`**

```jsonc
{
  "$schema": "../node_modules/wrangler/config-schema.json",
  "name": "cartolina-server",
  "main": "src/index.ts",
  "compatibility_date": "2025-09-01",
  "compatibility_flags": ["nodejs_compat"],
  "durable_objects": {
    "bindings": [{ "name": "ROOMS", "class_name": "RoomDO" }]
  },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["RoomDO"] }]
}
```

- [ ] **Step 3: Instalar dependências do servidor**

Run:
```bash
npm install -D -w server wrangler@^4 @cloudflare/vitest-pool-workers
npm view @cloudflare/vitest-pool-workers peerDependencies
```
Expected: instala; o segundo comando mostra a faixa de `vitest` exigida. Se a faixa não incluir a `vitest` da raiz (instalada na Task 1), alinhe a raiz: `npm install -D vitest@<versão dentro da faixa>` e rode `npm test -w shared` de novo (deve continuar PASS).

- [ ] **Step 4: Criar `server/src/room-do.ts` mínimo (só para os bindings existirem)**

```ts
import { DurableObject } from 'cloudflare:workers';

export class RoomDO extends DurableObject<Env> {
  async fetch(): Promise<Response> {
    return new Response('not_found', { status: 404 });
  }
}
```

- [ ] **Step 5: Criar `server/src/index.ts`**

```ts
import { RoomDO } from './room-do';

export { RoomDO };

export const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_RE = new RegExp(`^[${ROOM_ALPHABET}]{4}$`);

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

export function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (b) => ROOM_ALPHABET[b % ROOM_ALPHABET.length]).join('');
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    if (request.method === 'POST' && url.pathname === '/rooms') {
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = randomCode();
        const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
        const res = await stub.fetch(`https://room/init?code=${code}`, { method: 'POST' });
        if (res.status === 201) return json({ code }, 201);
      }
      return json({ error: 'no_code' }, 503);
    }

    const match = url.pathname.match(/^\/rooms\/([^/]+)(\/ws)?$/);
    if (match) {
      const code = match[1]!.toUpperCase();
      if (!CODE_RE.test(code)) return json({ error: 'not_found' }, 404);
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      if (match[2]) return stub.fetch(request);
      const res = await stub.fetch('https://room/exists');
      return json(await res.json(), res.status);
    }

    return json({ error: 'not_found' }, 404);
  },
} satisfies ExportedHandler<Env>;
```

- [ ] **Step 6: Gerar tipos do Worker**

Run: `npm run types -w server`
Expected: cria `server/worker-configuration.d.ts` contendo `interface Env` com `ROOMS: DurableObjectNamespace<...RoomDO>`.

- [ ] **Step 7: Criar `server/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "types": ["./worker-configuration.d.ts", "@cloudflare/vitest-pool-workers"]
  },
  "include": ["src", "test", "worker-configuration.d.ts"]
}
```

- [ ] **Step 8: Criar `server/vitest.config.ts`**

```ts
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        singleWorker: true,
        // WebSockets abertos em Durable Objects não combinam com storage isolado por teste.
        isolatedStorage: false,
        wrangler: { configPath: './wrangler.jsonc' },
      },
    },
  },
});
```

Se a versão instalada de `@cloudflare/vitest-pool-workers` não exportar `defineWorkersConfig` (API mudou), siga o README do pacote em `node_modules/@cloudflare/vitest-pool-workers/README.md` para a forma atual, mantendo as três opções acima (`singleWorker`, `isolatedStorage: false`, `configPath`).

- [ ] **Step 9: Criar `server/test/env.d.ts`**

```ts
declare module 'cloudflare:test' {
  interface ProvidedEnv extends Env {}
}
```

- [ ] **Step 10: Escrever o teste HTTP (falha até a Task 11 implementar `/init` e `/exists`)**

`server/test/http.test.ts`:
```ts
import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { ROOM_ALPHABET } from '../src/index';

describe('HTTP', () => {
  it('POST /rooms cria sala com código de 4 letras do alfabeto', async () => {
    const res = await SELF.fetch('https://x/rooms', { method: 'POST' });
    expect(res.status).toBe(201);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    const { code } = (await res.json()) as { code: string };
    expect(code).toHaveLength(4);
    for (const ch of code) expect(ROOM_ALPHABET).toContain(ch);
  });

  it('GET /rooms/:code diz se a sala existe (case-insensitive)', async () => {
    const { code } = (await (await SELF.fetch('https://x/rooms', { method: 'POST' })).json()) as { code: string };
    const ok = await SELF.fetch(`https://x/rooms/${code.toLowerCase()}`);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ exists: true });
  });

  it('sala inexistente ou código inválido dá 404', async () => {
    expect((await SELF.fetch('https://x/rooms/ZZZZ')).status).toBe(404);
    expect((await SELF.fetch('https://x/rooms/1111')).status).toBe(404);
    expect((await SELF.fetch('https://x/qualquer')).status).toBe(404);
  });

  it('OPTIONS responde CORS', async () => {
    const res = await SELF.fetch('https://x/rooms', { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });
});
```

- [ ] **Step 11: Rodar e ver falhar do jeito esperado**

Run: `npm test -w server`
Expected: os testes `POST /rooms` e `GET /rooms/:code` FALHAM (o DO mínimo devolve 404 → `no_code` 503); `404` e `OPTIONS` PASSAM. Isso confirma que o pool de workers está funcionando.

- [ ] **Step 12: Commit**

```bash
git add package.json package-lock.json server
git commit -m "chore(server): scaffold do Worker, rotas HTTP e testes com pool de workers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Durable Object — sala, entrada por WebSocket e estado

**Files:**
- Modify: `server/src/room-do.ts` (substituir inteiro)
- Create: `server/test/helpers.ts`, `server/test/room-do.test.ts`

- [ ] **Step 1: Criar `server/test/helpers.ts`**

```ts
import { SELF } from 'cloudflare:test';
import type { ClientMessage, RoomView, ServerMessage } from '@cartolina/shared';

export async function newRoomCode(): Promise<string> {
  const res = await SELF.fetch('https://x/rooms', { method: 'POST' });
  if (res.status !== 201) throw new Error(`criar sala falhou: ${res.status}`);
  return ((await res.json()) as { code: string }).code;
}

export interface TestClient {
  ws: WebSocket;
  send(msg: ClientMessage): void;
  next<T extends ServerMessage['t']>(t: T): Promise<Extract<ServerMessage, { t: T }>>;
  state(pred: (room: RoomView) => boolean): Promise<RoomView>;
  inbox: ServerMessage[];
}

export async function connect(code: string): Promise<TestClient> {
  const res = await SELF.fetch(`https://x/rooms/${code}/ws`, { headers: { Upgrade: 'websocket' } });
  if (res.status !== 101 || !res.webSocket) throw new Error(`upgrade falhou: ${res.status}`);
  const ws = res.webSocket;
  ws.accept();
  const inbox: ServerMessage[] = [];
  let wake: (() => void) | null = null;
  ws.addEventListener('message', (event) => {
    inbox.push(JSON.parse(event.data as string) as ServerMessage);
    wake?.();
  });

  async function waitFor<M extends ServerMessage>(match: (m: ServerMessage) => m is M, label: string): Promise<M> {
    const deadline = Date.now() + 3000;
    for (;;) {
      const i = inbox.findIndex(match);
      if (i >= 0) return inbox.splice(i, 1)[0] as M;
      if (Date.now() > deadline) throw new Error(`timeout esperando ${label}; inbox: ${JSON.stringify(inbox)}`);
      await new Promise<void>((resolve) => {
        wake = resolve;
        setTimeout(resolve, 50);
      });
    }
  }

  return {
    ws,
    inbox,
    send: (msg) => ws.send(JSON.stringify(msg)),
    next: (t) => waitFor((m): m is Extract<ServerMessage, { t: typeof t }> => m.t === t, t),
    async state(pred) {
      for (;;) {
        const m = await waitFor((x): x is Extract<ServerMessage, { t: 'state' }> => x.t === 'state', 'state');
        if (pred(m.room)) return m.room;
      }
    },
  };
}

export const COLORS = ['#8EC5FF', '#FF8FAB', '#7EDDB5', '#C7B3FF'] as const;

export async function joined(code: string, n: number): Promise<{ client: TestClient; id: string }[]> {
  const out: { client: TestClient; id: string }[] = [];
  for (let i = 0; i < n; i++) {
    const client = await connect(code);
    client.send({ t: 'join', token: `token-${code}-${i}`, name: `P${i}`, color: COLORS[i]! });
    const welcome = await client.next('welcome');
    out.push({ client, id: welcome.playerId });
  }
  return out;
}
```

Nota: `Date.now()` no runtime de Workers só avança após I/O; o `setTimeout(resolve, 50)` garante esse avanço.

- [ ] **Step 2: Escrever o teste que falha**

`server/test/room-do.test.ts`:
```ts
import { env, runInDurableObject } from 'cloudflare:test';
import type { Room } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { COLORS, connect, joined, newRoomCode } from './helpers';

describe('RoomDO: entrada', () => {
  it('join devolve welcome e estado com o assento', async () => {
    const code = await newRoomCode();
    const a = await connect(code);
    a.send({ t: 'join', token: 'token-aaaa-1', name: 'Ana', color: COLORS[0] });
    const welcome = await a.next('welcome');
    expect(welcome.code).toBe(code);
    const room = await a.state((r) => r.seats.length === 1);
    expect(room.you).toBe(welcome.playerId);
    expect(room.hostId).toBe(welcome.playerId);
    expect(room.game.phase).toBe('lobby');
  });

  it('outros jogadores recebem o novo estado', async () => {
    const code = await newRoomCode();
    const [a] = await joined(code, 1);
    const b = await connect(code);
    b.send({ t: 'join', token: 'token-bbbb-1', name: 'Bia', color: COLORS[1] });
    await b.next('welcome');
    const room = await a!.client.state((r) => r.seats.length === 2);
    expect(room.seats.map((s) => s.name)).toEqual(['P0', 'Bia']);
  });

  it('reconectar com o mesmo token mantém o playerId', async () => {
    const code = await newRoomCode();
    const first = await connect(code);
    first.send({ t: 'join', token: 'token-recon-1', name: 'Ana', color: COLORS[0] });
    const w1 = await first.next('welcome');
    const second = await connect(code);
    second.send({ t: 'join', token: 'token-recon-1', name: 'Ana', color: COLORS[0] });
    const w2 = await second.next('welcome');
    expect(w2.playerId).toBe(w1.playerId);
    const room = await second.state((r) => r.seats.length === 1);
    expect(room.seats[0]?.connected).toBe(true);
  });

  it('mensagem inválida ou ação antes do join dá erro', async () => {
    const code = await newRoomCode();
    const a = await connect(code);
    a.ws.send('lixo');
    expect((await a.next('error')).code).toBe('bad_message');
    a.send({ t: 'action', action: { type: 'start' } });
    expect((await a.next('error')).code).toBe('not_joined');
  });

  it('erro de entrada é reportado (cor repetida)', async () => {
    const code = await newRoomCode();
    await joined(code, 1);
    const b = await connect(code);
    b.send({ t: 'join', token: 'token-outro-1', name: 'B', color: COLORS[0] });
    const err = await b.next('error');
    expect(err.code).toBe('color_taken');
    expect(err.message).toBe('Essa cor já foi escolhida.');
  });

  it('persiste a sala no storage', async () => {
    const code = await newRoomCode();
    await joined(code, 2);
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    await runInDurableObject(stub, async (_instance, state) => {
      const room = await state.storage.get<Room>('room');
      expect(room?.seats).toHaveLength(2);
      expect(Object.keys(room?.tokens ?? {})).toHaveLength(2);
    });
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm test -w server`
Expected: FAIL — `criar sala falhou: 503` / `upgrade falhou: 404`.

- [ ] **Step 4: Implementar `server/src/room-do.ts` (substituir inteiro)**

```ts
import { DurableObject } from 'cloudflare:workers';
import {
  ERROR_MESSAGES,
  createRoom,
  disconnect,
  isExpired,
  joinRoom,
  nextAlarmAt,
  parseClientMessage,
  roomAction,
  roomView,
  tick,
  type Room,
  type ServerMessage,
} from '@cartolina/shared';

interface Attachment {
  playerId: string | null;
}

const CURSOR_MIN_INTERVAL_MS = 25;

export class RoomDO extends DurableObject<Env> {
  private room: Room | null = null;
  private lastCursor = new Map<string, number>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.room = (await ctx.storage.get<Room>('room')) ?? null;
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/init') {
      if (this.room) return new Response('taken', { status: 409 });
      this.room = createRoom(url.searchParams.get('code') ?? '', Date.now());
      await this.commit();
      return new Response('ok', { status: 201 });
    }

    if (url.pathname === '/exists') {
      return Response.json({ exists: this.room !== null }, { status: this.room ? 200 : 404 });
    }

    if (url.pathname.endsWith('/ws')) {
      if (!this.room) return new Response('not_found', { status: 404 });
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ playerId: null } satisfies Attachment);
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('not_found', { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (!this.room) {
      ws.close(4004, 'not_found');
      return;
    }
    const msg = parseClientMessage(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    if (!msg) return this.sendError(ws, 'bad_message');
    const now = Date.now();

    if (msg.t === 'join') {
      const res = joinRoom(this.room, { token: msg.token, name: msg.name, color: msg.color }, crypto.randomUUID(), now);
      if (!res.ok) return this.sendError(ws, res.error);
      for (const other of this.socketsOf(res.playerId)) {
        if (other === ws) continue;
        other.serializeAttachment({ playerId: null } satisfies Attachment);
        other.close(4000, 'replaced');
      }
      ws.serializeAttachment({ playerId: res.playerId } satisfies Attachment);
      this.room = tick(res.room, now, Math.random);
      this.send(ws, { t: 'welcome', playerId: res.playerId, code: this.room.code });
      await this.commit();
      return;
    }

    const playerId = this.attachment(ws).playerId;
    if (!playerId) return this.sendError(ws, 'not_joined');

    switch (msg.t) {
      case 'action': {
        const res = roomAction(this.room, playerId, msg.action, Math.random, now);
        if (!res.ok) return this.sendError(ws, res.error);
        this.room = res.room;
        await this.commit();
        return;
      }
      case 'fx.cursor': {
        if (now - (this.lastCursor.get(playerId) ?? 0) < CURSOR_MIN_INTERVAL_MS) return;
        this.lastCursor.set(playerId, now);
        const { t: _t, ...cursor } = msg;
        this.broadcastFx({ t: 'fx.cursor', from: playerId, ...cursor }, playerId);
        return;
      }
      case 'fx.activity':
        this.broadcastFx({ t: 'fx.activity', from: playerId, activity: msg.activity }, playerId);
        return;
      case 'fx.ping':
        this.broadcastFx({ t: 'fx.ping', from: playerId, x: msg.x, y: msg.y }, null);
        return;
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, reason);
    } catch {
      // já fechado
    }
    await this.handleGone(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.handleGone(ws);
  }

  async alarm(): Promise<void> {
    if (!this.room) return;
    const now = Date.now();
    if (isExpired(this.room, now)) {
      for (const ws of this.ctx.getWebSockets()) ws.close(4004, 'expired');
      this.room = null;
      await this.ctx.storage.deleteAll();
      return;
    }
    this.room = tick(this.room, now, Math.random);
    await this.commit();
  }

  private async handleGone(ws: WebSocket): Promise<void> {
    const playerId = this.attachment(ws).playerId;
    if (!this.room || !playerId) return;
    ws.serializeAttachment({ playerId: null } satisfies Attachment);
    if (this.socketsOf(playerId).length > 0) return;
    this.room = disconnect(this.room, playerId, Date.now());
    await this.commit();
  }

  private attachment(ws: WebSocket): Attachment {
    return (ws.deserializeAttachment() as Attachment | null) ?? { playerId: null };
  }

  private socketsOf(playerId: string): WebSocket[] {
    return this.ctx.getWebSockets().filter((s) => this.attachment(s).playerId === playerId);
  }

  private async commit(): Promise<void> {
    if (!this.room) return;
    await this.ctx.storage.put('room', this.room);
    await this.ctx.storage.setAlarm(nextAlarmAt(this.room, Date.now()));
    for (const ws of this.ctx.getWebSockets()) {
      const playerId = this.attachment(ws).playerId;
      if (playerId) this.send(ws, { t: 'state', room: roomView(this.room, playerId) });
    }
  }

  private broadcastFx(msg: ServerMessage, exclude: string | null): void {
    for (const ws of this.ctx.getWebSockets()) {
      const playerId = this.attachment(ws).playerId;
      if (playerId && playerId !== exclude) this.send(ws, msg);
    }
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // socket fechando; o close handler cuida da presença
    }
  }

  private sendError(ws: WebSocket, code: string): void {
    this.send(ws, { t: 'error', code, message: ERROR_MESSAGES[code] ?? 'Algo deu errado.' });
  }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test -w server`
Expected: PASS em `http.test.ts` e `room-do.test.ts`.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: sem erros nos dois workspaces.

- [ ] **Step 7: Commit**

```bash
git add server
git commit -m "feat(server): RoomDO com entrada por WebSocket, reconexão e persistência

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Durable Object — rodada completa, fx e desconexão

**Files:**
- Test: `server/test/room-do.test.ts` (acrescentar ao fim)
- Modify: `server/src/room-do.ts` somente se algum teste revelar defeito

- [ ] **Step 1: Acrescentar testes ao fim de `server/test/room-do.test.ts`**

```ts
describe('RoomDO: jogo', () => {
  it('joga uma rodada livre completa', async () => {
    const code = await newRoomCode();
    const [a, b] = await joined(code, 2);
    a!.client.send({ t: 'action', action: { type: 'start' } });
    await a!.client.state((r) => r.game.phase === 'theme');
    a!.client.send({ t: 'action', action: { type: 'beginRound' } });
    const roomA = await a!.client.state((r) => r.game.phase === 'sorting');
    const roomB = await b!.client.state((r) => r.game.phase === 'sorting');

    const cardA = Object.values(roomA.game.cards).find((c) => c.owner === a!.id)!;
    const cardB = Object.values(roomB.game.cards).find((c) => c.owner === b!.id)!;
    expect(cardA.value).not.toBeNull();
    expect(roomA.game.cards[cardB.id]?.value).toBeNull();

    a!.client.send({ t: 'action', action: { type: 'clue', cardId: cardA.id, text: 'Paris' } });
    a!.client.send({ t: 'action', action: { type: 'place', cardId: cardA.id, index: 0 } });
    await b!.client.state((r) => r.game.row.length === 1 && r.game.cards[cardA.id]?.clue === 'Paris');
    b!.client.send({ t: 'action', action: { type: 'place', cardId: cardB.id, index: 1 } });
    a!.client.send({ t: 'action', action: { type: 'ready', ready: true } });
    b!.client.send({ t: 'action', action: { type: 'ready', ready: true } });

    const done = await a!.client.state((r) => r.game.phase === 'reveal');
    const values = done.game.reveal!.map((e) => e.value);
    expect(values).toHaveLength(2);
    expect(done.game.outcome).toBe(values[0]! < values[1]! ? 'round_won' : 'round_lost');
    expect(done.game.cards[cardB.id]?.value).toBe(values[1]);
  });

  it('erros de regra voltam só para quem errou', async () => {
    const code = await newRoomCode();
    const [, b] = await joined(code, 2);
    b!.client.send({ t: 'action', action: { type: 'start' } });
    expect((await b!.client.next('error')).code).toBe('not_host');
  });
});

describe('RoomDO: fx', () => {
  it('cursor vai para os outros e não volta para quem enviou', async () => {
    const code = await newRoomCode();
    const [a, b] = await joined(code, 2);
    a!.client.send({ t: 'fx.cursor', zone: 'table', x: 0.25, y: 0.5, drag: { cardId: 'x:0', index: 1 } });
    const got = await b!.client.next('fx.cursor');
    expect(got).toEqual({ t: 'fx.cursor', from: a!.id, zone: 'table', x: 0.25, y: 0.5, drag: { cardId: 'x:0', index: 1 } });
    await new Promise((r) => setTimeout(r, 100));
    expect(a!.client.inbox.some((m) => m.t === 'fx.cursor')).toBe(false);
  });

  it('ping vai para todos, inclusive quem enviou', async () => {
    const code = await newRoomCode();
    const [a, b] = await joined(code, 2);
    a!.client.send({ t: 'fx.ping', x: 0.5, y: 0.5 });
    expect((await a!.client.next('fx.ping')).from).toBe(a!.id);
    expect((await b!.client.next('fx.ping')).from).toBe(a!.id);
  });

  it('atividade é repassada', async () => {
    const code = await newRoomCode();
    const [a, b] = await joined(code, 2);
    a!.client.send({ t: 'fx.activity', activity: 'writing' });
    expect(await b!.client.next('fx.activity')).toEqual({ t: 'fx.activity', from: a!.id, activity: 'writing' });
  });
});

describe('RoomDO: desconexão', () => {
  it('fechar o socket marca o jogador como desconectado para os outros', async () => {
    const code = await newRoomCode();
    const [a, b] = await joined(code, 2);
    b!.client.ws.close(1000, 'tchau');
    const room = await a!.client.state((r) => r.seats.find((s) => s.id === b!.id)?.connected === false);
    expect(room.seats).toHaveLength(2);
  });

  it('socket substituído por reconexão não derruba o jogador', async () => {
    const code = await newRoomCode();
    const [a] = await joined(code, 2);
    const again = await connect(code);
    again.send({ t: 'join', token: `token-${code}-1`, name: 'P1', color: COLORS[1] });
    await again.next('welcome');
    await new Promise((r) => setTimeout(r, 150));
    const states = a!.client.inbox.filter((m) => m.t === 'state');
    const latest = states[states.length - 1];
    expect(latest?.t).toBe('state');
    if (latest?.t === 'state') expect(latest.room.seats.every((s) => s.connected)).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar**

Run: `npm test -w server`
Expected: PASS. Se `socket substituído…` falhar com o jogador desconectado, o defeito está no fluxo de `join` do `RoomDO`: o attachment do socket antigo precisa ser zerado **antes** do `close`, para que `handleGone` o ignore.

- [ ] **Step 3: Rodar a suíte inteira e o typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS em `shared` e `server`; sem erros de tipo.

- [ ] **Step 4: Commit**

```bash
git add server
git commit -m "test(server): rodada completa, fx e desconexão no RoomDO

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Fumaça local e README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Subir o servidor local**

Run (em background): `npm run dev -w server`
Expected: `Ready on http://localhost:8787`.

- [ ] **Step 2: Criar sala e consultar**

Run:
```bash
curl -s -X POST http://localhost:8787/rooms
```
Expected: `{"code":"XXXX"}` (4 letras). Depois:
```bash
curl -s http://localhost:8787/rooms/XXXX
```
Expected: `{"exists":true}`. Pare o `wrangler dev`.

- [ ] **Step 3: Criar `README.md`**

````markdown
# cartolina~

Jogos de tabuleiro pra jogar com os amigos na call. Primeiro jogo: **ITO**.

## Estrutura

- `shared/` — regras dos jogos, sala e protocolo (TypeScript puro, testado)
- `server/` — Cloudflare Worker + Durable Object (uma instância por sala)
- `web/` — site (Plano 2)

## Desenvolvimento

```bash
npm install
npm test            # todos os testes
npm run typecheck
npm run dev -w server   # servidor local em http://localhost:8787
```

## API do servidor

- `POST /rooms` → `{ code }`
- `GET /rooms/:code` → `{ exists }` (404 se não existir)
- `GET /rooms/:code/ws` → WebSocket; protocolo em `shared/src/protocol.ts`

Design: `docs/superpowers/specs/2026-10-15-cartolina-ito-design.md`
````

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: README com estrutura e comandos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Cobertura da spec neste plano

| Spec | Onde |
|---|---|
| §2 regras, modos, contagem de erros | Tasks 3, 5, 6, 7 |
| §2 temas (lista + próprio) | Tasks 4, 5 |
| §3.1 GameModule / viewFor esconde segredo | Tasks 3, 7 |
| §3.2 código de sala, token, persistência, host 30 s, espectador, sala cheia, expiração 6 h | Tasks 8, 10, 11 |
| §3.3 protocolo | Task 9 (+ desvio documentado) |
| §3.4 fases | Tasks 5–7 (+ desvio documentado) |
| §6 erros: ação inválida, sala inexistente, sala cheia, host some, desconectado | Tasks 7, 8, 10, 11, 12 |
| §7 testes shared/server | Todas |
| §4, §5, §8, mesa 3D, E2E, reconexão com backoff no cliente | Planos 2 e 3 |
