# Plano M1 — Mandacaru: regras e base Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O Mandacaru (id `mandacaru`) existe como módulo de regras completo e testado em `shared/`, registrado na sala (prazos acordando o servidor), e aparece na estante como "em breve", sem mesa ainda.

**Architecture:** `shared/src/games/mandacaru/` com geometria fixa (`board.ts`), sorteio (`setup.ts`), consultas de construção (`build.ts`), produção (`production.ts`), maior estrada/comitiva (`longest.ts`), troca (`trade.ts`), cordéis (`cordel.ts`), máquina de estados (`rules.ts`), automático e prazos (`auto.ts`), visão com `can` (`view.ts`) e schema (`schema.ts`). A sala genérica já acorda no `nextDeadline` e chama `onPresenceChange` = `settleMandacaru`.

**Tech Stack:** TypeScript 5.9, zod 3, Vitest 4, Cloudflare Workers + Durable Objects (`@cloudflare/vitest-plugin`), React 19 (só catálogo e estante).

**Spec:** `docs/superpowers/specs/2026-11-09-mandacaru-design.md` (§2 regras, §4 arquitetura, §8 testes). Este plano é o item 1 da §9.

---

## Contexto para quem vai executar

- Trabalhe na worktree `.claude/worktrees/hexa`, branch `feat/hexa`. **Não troque a branch da pasta mãe**, não faça merge nem push. Nunca use `git stash` puro.
- Monorepo npm workspaces. Na raiz da worktree: `npm test -w shared -- <filtro>`, `npm test -w server -- <filtro>`, `npm test -w web -- <filtro>`, `npm run typecheck`. Se faltar `node_modules`, rode `npm install` antes.
- No Git Bash do Windows o `rtk` não existe: rode `git`/`npm` direto.
- Código, comentários, erros e nomes de teste em **português** (ids internos em inglês: `wood`, `brick`, `leather`, `beans`, `stone`; cordéis com nomes nossos: `vaqueiro`, `point`, `mutirao`, `chuva`, `atravessador`). Commits `feat(shared): …`/`test(shared): …` terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` (imports de tipo com `import type`; índice dá `T | undefined`).
- A Vitest não checa tipos: rode **também** `npm run typecheck -w shared` ao fim de cada task.
- **Modelo a seguir: o Cúpi** (`shared/src/games/coup/`, `shared/test/coup-*.test.ts`): `fail`/`ok`, estado imutável (testes usam `deepFreeze`), `settle*` devolve **o mesmo objeto** quando nada muda, visão com `can`, schema com `Assert`.
- Sorteio só por `ctx.rng` (`randomInt`, `shuffle` de `shared/src/rng.ts`); hora só por `ctx.now`.

### Sobre o código neste plano

O motor é grande. Pra não escrever tudo duas vezes, o plano traz **completos** o contrato (`types.ts`), a geometria (`board.ts`), os helpers de teste e **todos os testes**; a implementação das outras funções vem com **assinatura fixa e o comportamento exato** (o teste é a referência). Quem executa escreve a implementação mínima que passa nos testes, sem mudar assinaturas nem nomes (outras tasks dependem deles). Se um teste parecer contradizer a spec, a spec manda: pare e avise.

## Mapa de arquivos

| Arquivo | Task |
|---|---|
| `shared/src/games/mandacaru/types.ts` | 1 |
| `shared/src/games/mandacaru/board.ts` | 1 |
| `shared/src/games/mandacaru/setup.ts` | 2 |
| `shared/src/games/mandacaru/build.ts` | 2 |
| `shared/src/games/mandacaru/production.ts` | 3 |
| `shared/src/games/mandacaru/longest.ts` | 3 |
| `shared/src/games/mandacaru/cordel.ts` | 4 (monte), 7 (efeitos) |
| `shared/src/games/mandacaru/rules.ts` | 4, 5, 6, 7 |
| `shared/src/games/mandacaru/trade.ts` | 6 |
| `shared/src/games/mandacaru/auto.ts` | 8 |
| `shared/src/games/mandacaru/view.ts`, `schema.ts` | 9 |
| `shared/test/mandacaru-*.test.ts`, `shared/test/mandacaru-helpers.ts` | 1–10 |
| `shared/src/games/registry.ts`, `room.ts`, `protocol.ts`, `history.ts`, `index.ts`, `server/src/index.ts` | 11 |
| `web/src/games/catalog.ts`, `web/src/screens/GamePage.tsx`, `web/src/screens/shelf.css`, `web/index.html` | 12 |
| `server/test/mandacaru.test.ts`, `README.md`, `CLAUDE.md` | 13 |

---

### Task 1: tipos e geometria

**Files:**
- Create: `shared/src/games/mandacaru/types.ts`
- Create: `shared/src/games/mandacaru/board.ts`
- Create: `shared/test/mandacaru-helpers.ts`
- Test: `shared/test/mandacaru-board.test.ts`

- [ ] **Step 1: Criar `types.ts` (completo)**

```ts
export const MANDACARU_MIN_PLAYERS = 3;
export const MANDACARU_MAX_PLAYERS = 4;
/** Turno de 5 minutos (decisão do usuário, 2026-11-09). Vale também pra cada vez da preparação. */
export const MANDACARU_TURN_MS = 300_000;
/** Prazo do descarte quando sai 7. */
export const MANDACARU_DISCARD_MS = 60_000;
export const MANDACARU_WIN_POINTS = 10;
export const MANDACARU_BANK_EACH = 19;
/** Mais que isso na mão = descarta metade quando sai 7. */
export const MANDACARU_HAND_LIMIT = 7;
/** Tamanho máximo do diário guardado (as últimas entradas). */
export const MANDACARU_LOG_MAX = 80;
export const MANDACARU_PIECES = { road: 15, house: 5, city: 4 } as const;
export const LONGEST_ROAD_MIN = 5;
export const LARGEST_ARMY_MIN = 3;

/** Recursos (o site mostra madeira, barro, couro, feijão, pedra). */
export const RESOURCES = ['wood', 'brick', 'leather', 'beans', 'stone'] as const;
export type Resource = (typeof RESOURCES)[number];
export type Resources = Record<Resource, number>;

/** Terrenos (o site mostra caatinga, barreiro, malhada, roçado, lajedo, rio seco). */
export const TERRAINS = ['forest', 'hills', 'pasture', 'fields', 'mountains', 'desert'] as const;
export type Terrain = (typeof TERRAINS)[number];
export const TERRAIN_RESOURCE: Record<Terrain, Resource | null> = {
  forest: 'wood',
  hills: 'brick',
  pasture: 'leather',
  fields: 'beans',
  mountains: 'stone',
  desert: null,
};
export const TERRAIN_COUNTS: Record<Terrain, number> = { forest: 4, hills: 3, pasture: 4, fields: 4, mountains: 3, desert: 1 };
export const NUMBER_TOKENS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12] as const;

export type PortKind = 'generic' | Resource;
export const PORT_KINDS: readonly PortKind[] = ['generic', 'generic', 'generic', 'generic', 'wood', 'brick', 'leather', 'beans', 'stone'];

/** Cordéis (cartas de desenvolvimento). Nomes nossos. */
export const CORDEIS = ['vaqueiro', 'point', 'mutirao', 'chuva', 'atravessador'] as const;
export type CordelKind = (typeof CORDEIS)[number];
export const CORDEL_COUNTS: Record<CordelKind, number> = { vaqueiro: 14, point: 5, mutirao: 2, chuva: 2, atravessador: 2 };

export type Piece = 'road' | 'house' | 'city' | 'cordel';
const r = (wood: number, brick: number, leather: number, beans: number, stone: number): Resources => ({ wood, brick, leather, beans, stone });
export const COSTS: Record<Piece, Resources> = {
  road: r(1, 1, 0, 0, 0),
  house: r(1, 1, 1, 1, 0),
  city: r(0, 0, 0, 2, 3),
  cordel: r(0, 0, 1, 1, 1),
};
export const noResources = (): Resources => r(0, 0, 0, 0, 0);

export interface HexTile {
  terrain: Terrain;
  /** null no rio seco. */
  number: number | null;
}

/** O que foi sorteado: um item por terreno e por posição de feira da geometria, na mesma ordem. */
export interface BoardLayout {
  hexes: HexTile[];
  ports: PortKind[];
}

export interface Building {
  owner: string;
  kind: 'house' | 'city';
}

export interface CordelCard {
  kind: CordelKind;
  /** Comprado neste turno (não pode ser jogado ainda). */
  fresh: boolean;
}

export interface PlayerHand {
  res: Resources;
  cordeis: CordelCard[];
}

/** Oferta de quem está na vez pra mesa: `give` é o que ele dá, `want` o que ele quer. */
export interface Offer {
  id: number;
  give: Resources;
  want: Resources;
  accepted: string[];
  rejected: string[];
}

/** Proposta de outro jogador pra quem está na vez: `give` é o que `from` dá, `want` o que `from` quer. */
export interface Proposal {
  id: number;
  from: string;
  give: Resources;
  want: Resources;
}

/** Preparação: posição na ordem em cobra (0..2N-1) e a casa recém-posta esperando a estrada. */
export interface SetupState {
  index: number;
  house: number | null;
}

export type MandacaruPhase = 'lobby' | 'setup' | 'roll' | 'discard' | 'carcara' | 'steal' | 'main' | 'mutirao' | 'over';

/** Uma linha do diário (dados; o site escreve a frase). O recurso roubado não aparece aqui. */
export type MandacaruLogEntry =
  | { t: 'start'; order: string[] }
  | { t: 'place'; player: string; piece: 'house' | 'road'; at: number }
  | { t: 'setup_gain'; player: string; gain: Resources }
  | { t: 'roll'; player: string; dice: [number, number]; gains: Record<string, Resources>; short: Resource[] }
  | { t: 'discard'; player: string; count: number }
  | { t: 'carcara'; player: string; hex: number }
  | { t: 'steal'; player: string; from: string }
  | { t: 'build'; player: string; piece: 'road' | 'house' | 'city'; at: number }
  | { t: 'buy_cordel'; player: string }
  | { t: 'play'; player: string; kind: Exclude<CordelKind, 'point'>; resources?: Resource[]; total?: number }
  | { t: 'trade'; a: string; b: string; aGives: Resources; bGives: Resources }
  | { t: 'feira'; player: string; give: Resource; gave: number; want: Resource; got: number }
  | { t: 'award'; award: 'longest' | 'army'; player: string | null }
  | { t: 'timeout'; player: string }
  | { t: 'end_turn'; player: string }
  | { t: 'win'; player: string; points: number };

export interface MandacaruState {
  phase: MandacaruPhase;
  /** Partidas começadas nesta sala (1 na primeira). */
  match: number;
  /** Placar de vitórias da noite (sobrevive ao "jogar de novo"). */
  wins: Record<string, number>;
  /** Ordem de jogo (sorteada no começo). */
  players: string[];
  layout: BoardLayout | null;
  /** Terreno onde está o Carcará. */
  carcara: number;
  /** Por canto da geometria (54). */
  buildings: (Building | null)[];
  /** Por lado da geometria (72): dono da estrada. */
  roads: (string | null)[];
  hands: Record<string, PlayerHand>;
  bank: Resources;
  /** Monte de cordel (topo = índice 0). Não vai pra visão. */
  deck: CordelKind[];
  turn: string | null;
  setup: SetupState | null;
  /** Já rolou os dados neste turno. */
  rolled: boolean;
  dice: [number, number] | null;
  /** Quantas vezes saiu cada soma; índices 2..12 (13 posições, 0 e 1 sempre 0). */
  diceCounts: number[];
  /** Já jogou um cordel neste turno. */
  cordelPlayed: boolean;
  /** Na fase `discard`: quantas cartas cada um ainda precisa descartar (só quem precisa). */
  discards: Record<string, number>;
  /** Pra onde volta depois do Carcará/roubo. */
  afterCarcara: 'roll' | 'main';
  /** No Mutirão: quantas estradas grátis faltam. */
  mutiraoLeft: number;
  offer: Offer | null;
  proposals: Proposal[];
  /** Último id de oferta/proposta usado (não zera na revanche). */
  tradeSeq: number;
  longestRoad: string | null;
  largestArmy: string | null;
  /** Vaqueiros jogados por jogador. */
  knights: Record<string, number>;
  turnEndsAt: number | null;
  discardEndsAt: number | null;
  /** Hora do servidor quando a partida começou. */
  startedAt: number | null;
  /** Turnos completos jogados (fora da preparação). */
  turns: number;
  winner: string | null;
  /** Último roubo (o recurso só aparece pros dois envolvidos). */
  lastSteal: { thief: string; victim: string; resource: Resource } | null;
  log: MandacaruLogEntry[];
}

export type MandacaruAction =
  | { type: 'start' }
  | { type: 'restart' }
  | { type: 'place_house'; vertex: number }
  | { type: 'place_road'; edge: number }
  | { type: 'roll' }
  | { type: 'discard'; cards: Resources }
  | { type: 'move_carcara'; hex: number }
  | { type: 'steal'; from: string }
  | { type: 'build_road'; edge: number }
  | { type: 'build_house'; vertex: number }
  | { type: 'build_city'; vertex: number }
  | { type: 'buy_cordel' }
  | { type: 'play_vaqueiro' }
  | { type: 'play_mutirao' }
  | { type: 'play_chuva'; resources: [Resource, Resource] }
  | { type: 'play_atravessador'; resource: Resource }
  | { type: 'offer'; give: Resources; want: Resources }
  | { type: 'cancel_offer' }
  | { type: 'respond'; offerId: number; accept: boolean }
  /** Contraproposta ou proposta pra quem está na vez: `give` = o que você dá. */
  | { type: 'propose'; give: Resources; want: Resources }
  /** Quem está na vez fecha: com quem aceitou a oferta (`source: 'offer'`) ou aceitando a proposta dele (`'proposal'`). */
  | { type: 'close_deal'; with: string; source: 'offer' | 'proposal' }
  /** Troca com o banco: dá `give` na taxa da feira e recebe `count` (padrão 1) de `want`. */
  | { type: 'feira'; give: Resource; want: Resource; count?: number }
  | { type: 'end_turn' };

export interface MandacaruSeat {
  id: string;
  /** Pontos que todos veem (sem os cordéis de Ponto; no fim, com eles). */
  points: number;
  resCount: number;
  cordelCount: number;
  knights: number;
  roadLength: number;
  piecesLeft: { road: number; house: number; city: number };
}

/** O que quem vê pode fazer agora. Listas de lugar já filtradas por regra e por dinheiro. */
export interface MandacaruCan {
  placeHouse: number[];
  placeRoad: number[];
  roll: boolean;
  /** Quantas cartas você precisa descartar agora (0 = nada). */
  discard: number;
  carcara: number[];
  steal: string[];
  buildRoad: number[];
  buildHouse: number[];
  buildCity: number[];
  buyCordel: boolean;
  /** Cordéis que dá pra jogar agora. */
  play: Exclude<CordelKind, 'point'>[];
  /** Taxa da feira por recurso dado (4, 3 ou 2); vazio fora da sua fase principal. */
  feira: Partial<Record<Resource, number>>;
  /** Pode mandar oferta pra mesa (quem está na vez, fase principal). */
  offer: boolean;
  /** Pode responder a oferta aberta / mandar proposta (os outros, na fase principal de alguém). */
  respond: boolean;
  propose: boolean;
  endTurn: boolean;
}

export interface MandacaruView {
  phase: MandacaruPhase;
  match: number;
  wins: Record<string, number>;
  players: string[];
  layout: BoardLayout | null;
  carcara: number;
  buildings: (Building | null)[];
  roads: (string | null)[];
  bank: Resources;
  deckSize: number;
  turn: string | null;
  setup: SetupState | null;
  rolled: boolean;
  dice: [number, number] | null;
  diceCounts: number[];
  /** Quem ainda precisa descartar e quantas (público). */
  discards: Record<string, number>;
  mutiraoLeft: number;
  offer: Offer | null;
  proposals: Proposal[];
  longestRoad: string | null;
  largestArmy: string | null;
  seats: MandacaruSeat[];
  turnEndsAt: number | null;
  discardEndsAt: number | null;
  winner: string | null;
  log: MandacaruLogEntry[];
  /** Suas cartas (null pra quem assiste). */
  myRes: Resources | null;
  myCordeis: CordelCard[];
  /** Seus pontos contando os cordéis de Ponto (null pra quem assiste). */
  myPoints: number | null;
  /** Só no fim: cordéis de Ponto de cada um. */
  pointCards: Record<string, number> | null;
  /** O último roubo, só pra quem roubou e quem foi roubado. */
  stolen: { thief: string; victim: string; resource: Resource } | null;
  can: MandacaruCan;
}
```

- [ ] **Step 2: Criar `board.ts` (completo)**

```ts
/**
 * Geometria fixa do tabuleiro (não depende do sorteio). Hexágonos em pé, coordenadas axiais (q, r),
 * unidade = raio do hexágono. Cantos de cada terreno no sentido horário a partir do de cima.
 */
export interface GeoHex {
  q: number;
  r: number;
  x: number;
  y: number;
  /** 6 cantos (ids), no sentido horário a partir do de cima. */
  corners: number[];
  /** 6 lados: lado i liga corners[i] e corners[(i+1)%6]. */
  edges: number[];
  /** Terrenos vizinhos. */
  neighbors: number[];
}

export interface GeoVertex {
  x: number;
  y: number;
  hexes: number[];
  edges: number[];
  /** Cantos a um lado de distância. */
  neighbors: number[];
}

export interface GeoEdge {
  a: number;
  b: number;
  hexes: number[];
}

export interface GeoPort {
  edge: number;
  vertices: [number, number];
  /** O terreno da costa encostado na feira. */
  hex: number;
}

export interface Geometry {
  radius: number;
  hexes: GeoHex[];
  vertices: GeoVertex[];
  edges: GeoEdge[];
  /** Lados da costa (um terreno só), em volta da ilha, ordenados pelo ângulo do meio do lado. */
  coast: number[];
  ports: GeoPort[];
}

const SQ3 = Math.sqrt(3);
const DIRS: [number, number][] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
/** Posições das 9 feiras na costa de 30 lados (raio 2); nenhuma divide canto com outra. */
const PORT_SLOTS_R2 = [0, 3, 7, 10, 13, 17, 20, 23, 27];

function build(radius: number): Geometry {
  const coords: [number, number][] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= radius) coords.push([q, r]);
    }
  }
  const index = new Map(coords.map(([q, r], i) => [`${q},${r}`, i]));
  const vertices: GeoVertex[] = [];
  const vkey = new Map<string, number>();
  const edges: GeoEdge[] = [];
  const ekey = new Map<string, number>();

  const hexes: GeoHex[] = coords.map(([q, r], h) => {
    const x = SQ3 * (q + r / 2);
    const y = 1.5 * r;
    const corners: number[] = [];
    for (let i = 0; i < 6; i++) {
      const ang = (Math.PI / 180) * (60 * i - 90);
      const vx = x + Math.cos(ang);
      const vy = y + Math.sin(ang);
      const k = `${Math.round(vx * 1000)},${Math.round(vy * 1000)}`;
      let v = vkey.get(k);
      if (v === undefined) {
        v = vertices.length;
        vkey.set(k, v);
        vertices.push({ x: vx, y: vy, hexes: [], edges: [], neighbors: [] });
      }
      vertices[v]!.hexes.push(h);
      corners.push(v);
    }
    const hexEdges: number[] = [];
    for (let i = 0; i < 6; i++) {
      const a = corners[i]!;
      const b = corners[(i + 1) % 6]!;
      const k = a < b ? `${a}-${b}` : `${b}-${a}`;
      let e = ekey.get(k);
      if (e === undefined) {
        e = edges.length;
        ekey.set(k, e);
        edges.push({ a: Math.min(a, b), b: Math.max(a, b), hexes: [] });
        vertices[a]!.edges.push(e);
        vertices[b]!.edges.push(e);
        vertices[a]!.neighbors.push(b);
        vertices[b]!.neighbors.push(a);
      }
      edges[e]!.hexes.push(h);
      hexEdges.push(e);
    }
    const neighbors = DIRS.map(([dq, dr]) => index.get(`${q + dq},${r + dr}`)).filter((n): n is number => n !== undefined);
    return { q, r, x, y, corners, edges: hexEdges, neighbors };
  });

  const mid = (e: GeoEdge) => ({ x: (vertices[e.a]!.x + vertices[e.b]!.x) / 2, y: (vertices[e.a]!.y + vertices[e.b]!.y) / 2 });
  const coast = edges
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.hexes.length === 1)
    .map(({ e, i }) => ({ i, ang: Math.atan2(mid(e).y, mid(e).x) }))
    .sort((a, b) => a.ang - b.ang)
    .map(({ i }) => i);

  const slots = radius === 2 ? PORT_SLOTS_R2 : [];
  const ports: GeoPort[] = slots.map((s) => {
    const edge = coast[s]!;
    const e = edges[edge]!;
    return { edge, vertices: [e.a, e.b], hex: e.hexes[0]! };
  });

  return { radius, hexes, vertices, edges, coast, ports };
}

let cached: Geometry | null = null;

/** A geometria do tabuleiro de 19 (calculada uma vez). */
export function geometry(): Geometry {
  cached ??= build(2);
  return cached;
}

/** Chance de um número sair em 36 (2 e 12 = 1, 6 e 8 = 5; 7 ou null = 0). */
export function pips(n: number | null): number {
  return n === null || n === 7 ? 0 : 6 - Math.abs(7 - n);
}
```

- [ ] **Step 3: Criar `shared/test/mandacaru-helpers.ts` (completo)**

```ts
import type { ActionResult, GameContext } from '../src/game';
import { geometry } from '../src/games/mandacaru/board';
import { applyMandacaruAction, initialMandacaruState } from '../src/games/mandacaru/rules';
import {
  MANDACARU_BANK_EACH,
  RESOURCES,
  noResources,
  type BoardLayout,
  type CordelCard,
  type CordelKind,
  type MandacaruAction,
  type MandacaruState,
  type Resources,
  type Terrain,
} from '../src/games/mandacaru/types';
import { mulberry32 } from '../src/rng';

export const T0 = 1_000_000;
export const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `p${i}`);

export function ctxOf(
  active: string[],
  { seed = 1, hostId = 'p0', now = T0 }: { seed?: number; hostId?: string | null; now?: number } = {},
): GameContext {
  return { hostId, active, rng: mulberry32(seed), now };
}

export function must<S>(res: ActionResult<S>): S {
  if (!res.ok) throw new Error(`ação recusada: ${res.error}`);
  return res.state;
}

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

export const tryAct = (s: MandacaruState, p: string, a: MandacaruAction, ctx: GameContext): ActionResult<MandacaruState> =>
  applyMandacaruAction(deepFreeze(s), p, a, ctx);
export const act = (s: MandacaruState, p: string, a: MandacaruAction, ctx: GameContext): MandacaruState => must(tryAct(s, p, a, ctx));

export const res = (partial: Partial<Resources> = {}): Resources => ({ ...noResources(), ...partial });

/**
 * Tabuleiro fixo dos testes (índice = terreno da geometria, ordem q crescente e depois r).
 * O 9 é o centro (0,0) e é o rio seco.
 */
const T: [Terrain, number | null][] = [
  ['forest', 11], ['pasture', 12], ['fields', 9], ['hills', 4], ['mountains', 3],
  ['forest', 6], ['pasture', 4], ['fields', 5], ['forest', 10], ['desert', null],
  ['hills', 8], ['mountains', 10], ['pasture', 2], ['fields', 9], ['forest', 3],
  ['pasture', 11], ['hills', 6], ['mountains', 5], ['fields', 8],
];
export const FIXED_LAYOUT: BoardLayout = {
  hexes: T.map(([terrain, number]) => ({ terrain, number })),
  ports: ['generic', 'wood', 'generic', 'brick', 'generic', 'leather', 'generic', 'beans', 'stone'],
};
export const DESERT = 9;

export interface MainOpts {
  players?: string[];
  turn?: string;
  phase?: MandacaruState['phase'];
  hands?: Record<string, Partial<Resources>>;
  cordeis?: Record<string, (CordelKind | CordelCard)[]>;
  /** canto → dono (casa) */
  houses?: Record<number, string>;
  /** canto → dono (vila) */
  cities?: Record<number, string>;
  /** lado → dono */
  roads?: Record<number, string>;
  deck?: CordelKind[];
  rolled?: boolean;
  carcara?: number;
  now?: number;
}

/**
 * Mesa montada à mão, já depois da preparação. O banco é 19 de cada menos o que está nas mãos.
 * Padrão: 3 jogadores p0..p2, vez do p0, fase `main` com dados rolados, Carcará no rio seco.
 */
export function table(opts: MainOpts = {}): MandacaruState {
  const g = geometry();
  const players = opts.players ?? ids(3);
  const hands: MandacaruState['hands'] = {};
  const bank = res(Object.fromEntries(RESOURCES.map((r) => [r, MANDACARU_BANK_EACH])));
  for (const p of players) {
    const h = res(opts.hands?.[p]);
    for (const r of RESOURCES) bank[r] -= h[r];
    const cordeis = (opts.cordeis?.[p] ?? []).map((c) => (typeof c === 'string' ? { kind: c, fresh: false } : c));
    hands[p] = { res: h, cordeis };
  }
  const buildings: MandacaruState['buildings'] = g.vertices.map(() => null);
  for (const [v, owner] of Object.entries(opts.houses ?? {})) buildings[Number(v)] = { owner, kind: 'house' };
  for (const [v, owner] of Object.entries(opts.cities ?? {})) buildings[Number(v)] = { owner, kind: 'city' };
  const roads: MandacaruState['roads'] = g.edges.map(() => null);
  for (const [e, owner] of Object.entries(opts.roads ?? {})) roads[Number(e)] = owner;
  const now = opts.now ?? T0;
  return {
    ...initialMandacaruState(),
    phase: opts.phase ?? 'main',
    match: 1,
    wins: Object.fromEntries(players.map((p) => [p, 0])),
    players,
    layout: FIXED_LAYOUT,
    carcara: opts.carcara ?? DESERT,
    buildings,
    roads,
    hands,
    bank,
    deck: opts.deck ?? ['vaqueiro', 'point', 'mutirao', 'chuva', 'atravessador'],
    turn: opts.turn ?? players[0]!,
    rolled: opts.rolled ?? (opts.phase ?? 'main') !== 'roll',
    knights: Object.fromEntries(players.map((p) => [p, 0])),
    turnEndsAt: now + 300_000,
    startedAt: now,
  };
}

/** Atalhos de geometria pros testes. */
export const geo = geometry;
export const corner = (hex: number, i: number): number => geometry().hexes[hex]!.corners[i]!;
export const side = (hex: number, i: number): number => geometry().hexes[hex]!.edges[i]!;
/** Lado entre dois cantos vizinhos. */
export function edgeBetween(a: number, b: number): number {
  const e = geometry().edges.findIndex((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
  if (e < 0) throw new Error(`cantos ${a} e ${b} não são vizinhos`);
  return e;
}
```

> O helper importa `rules.ts` (`applyMandacaruAction`, `initialMandacaruState`), que só nasce na Task 4. Na Task 1, crie `rules.ts` provisório com só isto, e a Task 4 o completa:
>
> ```ts
> import type { ActionResult, GameContext } from '../../game';
> import { geometry } from './board';
> import { MANDACARU_BANK_EACH, noResources, type MandacaruAction, type MandacaruState } from './types';
>
> export function initialMandacaruState(): MandacaruState {
>   const g = geometry();
>   const bank = noResources();
>   for (const k of Object.keys(bank) as (keyof typeof bank)[]) bank[k] = MANDACARU_BANK_EACH;
>   return {
>     phase: 'lobby', match: 0, wins: {}, players: [], layout: null, carcara: 0,
>     buildings: g.vertices.map(() => null), roads: g.edges.map(() => null), hands: {}, bank, deck: [],
>     turn: null, setup: null, rolled: false, dice: null, diceCounts: Array(13).fill(0), cordelPlayed: false,
>     discards: {}, afterCarcara: 'main', mutiraoLeft: 0, offer: null, proposals: [], tradeSeq: 0,
>     longestRoad: null, largestArmy: null, knights: {}, turnEndsAt: null, discardEndsAt: null,
>     startedAt: null, turns: 0, winner: null, lastSteal: null, log: [],
>   };
> }
>
> export function applyMandacaruAction(state: MandacaruState, _p: string, _a: MandacaruAction, _ctx: GameContext): ActionResult<MandacaruState> {
>   return { ok: false, error: 'bad_action' };
> }
> ```

- [ ] **Step 4: Escrever o teste da geometria** (`shared/test/mandacaru-board.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { geometry, pips } from '../src/games/mandacaru/board';

describe('Mandacaru: geometria do tabuleiro', () => {
  const g = geometry();

  it('tem 19 terrenos, 54 cantos, 72 lados, 30 lados de costa e 9 feiras', () => {
    expect(g.hexes).toHaveLength(19);
    expect(g.vertices).toHaveLength(54);
    expect(g.edges).toHaveLength(72);
    expect(g.coast).toHaveLength(30);
    expect(g.ports).toHaveLength(9);
  });

  it('o terreno 9 é o centro e tem 6 vizinhos', () => {
    expect(g.hexes[9]).toMatchObject({ q: 0, r: 0 });
    expect(g.hexes[9]!.neighbors).toHaveLength(6);
  });

  it('cada terreno tem 6 cantos e 6 lados distintos, e o lado i liga os cantos i e i+1', () => {
    for (const h of g.hexes) {
      expect(new Set(h.corners).size).toBe(6);
      expect(new Set(h.edges).size).toBe(6);
      h.edges.forEach((e, i) => {
        const pair = [h.corners[i]!, h.corners[(i + 1) % 6]!].sort((a, b) => a - b);
        expect([g.edges[e]!.a, g.edges[e]!.b]).toEqual(pair);
      });
    }
  });

  it('cantos têm 2 ou 3 vizinhos, 1 a 3 terrenos e vizinhança simétrica', () => {
    g.vertices.forEach((v, i) => {
      expect([2, 3]).toContain(v.neighbors.length);
      expect(v.hexes.length).toBeGreaterThanOrEqual(1);
      expect(v.hexes.length).toBeLessThanOrEqual(3);
      expect(v.edges).toHaveLength(v.neighbors.length);
      for (const n of v.neighbors) expect(g.vertices[n]!.neighbors).toContain(i);
    });
  });

  it('a costa é um anel: lados seguidos dividem um canto', () => {
    g.coast.forEach((e, i) => {
      const next = g.coast[(i + 1) % g.coast.length]!;
      const a = g.edges[e]!;
      const b = g.edges[next]!;
      expect([a.a, a.b].some((v) => v === b.a || v === b.b)).toBe(true);
      expect(a.hexes).toHaveLength(1);
    });
  });

  it('nenhuma feira divide canto com outra, e os cantos dela são da costa', () => {
    const used = g.ports.flatMap((p) => p.vertices);
    expect(new Set(used).size).toBe(18);
    for (const p of g.ports) expect(g.coast).toContain(p.edge);
  });

  it('a geometria é calculada uma vez só', () => {
    expect(geometry()).toBe(g);
  });

  it('chance dos números', () => {
    expect([2, 3, 4, 5, 6, 8, 9, 10, 11, 12].map(pips)).toEqual([1, 2, 3, 4, 5, 5, 4, 3, 2, 1]);
    expect(pips(7)).toBe(0);
    expect(pips(null)).toBe(0);
  });
});
```

- [ ] **Step 5: Rodar** `npm test -w shared -- mandacaru-board` → PASS (8 testes). `npm run typecheck -w shared` → sem erro.

- [ ] **Step 6: Commit**

```bash
git add shared/src/games/mandacaru shared/test/mandacaru-helpers.ts shared/test/mandacaru-board.test.ts
git commit -m "feat(shared): Mandacaru — tipos e geometria do tabuleiro"
```

---

### Task 2: sorteio do tabuleiro e consultas de construção

**Files:**
- Create: `shared/src/games/mandacaru/setup.ts`
- Create: `shared/src/games/mandacaru/build.ts`
- Test: `shared/test/mandacaru-setup.test.ts`, `shared/test/mandacaru-build.test.ts`

**Assinaturas (fixas):**

```ts
// setup.ts
/** Sorteia terrenos, fichas (6 e 8 nunca vizinhos; refaz até dar) e feiras. */
export function randomLayout(rng: Rng): BoardLayout;
/** Índice do rio seco no layout. */
export function desertOf(layout: BoardLayout): number;

// build.ts
export function canAfford(have: Resources, cost: Resources): boolean;
/** Tira `cost` da mão de `player` e devolve ao banco (não confere se dá; chame canAfford antes). */
export function pay(state: MandacaruState, player: string, cost: Resources): MandacaruState;
/** Dá `gain` do banco pro jogador (não confere o banco). */
export function grant(state: MandacaruState, player: string, gain: Resources): MandacaruState;
export function piecesLeft(state: MandacaruState, player: string): { road: number; house: number; city: number };
/** Cantos onde `player` pode pôr casa. `setup: true` dispensa a estrada ligada. Não olha peças nem custo. */
export function houseSpots(state: MandacaruState, player: string, setup: boolean): number[];
/** Lados onde `player` pode pôr estrada. Com `from`, só os encostados nesse canto (preparação). Não olha peças nem custo. */
export function roadSpots(state: MandacaruState, player: string, from?: number): number[];
/** Cantos com casa de `player` (onde dá pra subir vila). */
export function citySpots(state: MandacaruState, player: string): number[];
/** Taxa da feira por recurso dado: 2 (feira do recurso), 3 (feira comum) ou 4. */
export function portRates(state: MandacaruState, player: string): Record<Resource, number>;
/** Pontos de `player`: casas, vilas, maior estrada, maior comitiva e, com `hidden`, os cordéis de Ponto. */
export function points(state: MandacaruState, player: string, hidden: boolean): number;
export function handSize(res: Resources): number;
```

**Comportamento:**
- `randomLayout`: `shuffle` dos terrenos (contagens de `TERRAIN_COUNTS`, na ordem de `TERRAINS`), depois, em laço, `shuffle` das `NUMBER_TOKENS` distribuídas na ordem dos terrenos que não são rio seco, até nenhum terreno com 6/8 ter vizinho (`geometry().hexes[i].neighbors`) com 6/8; depois `shuffle(PORT_KINDS)`.
- `houseSpots`: canto vazio, todos os `neighbors` vazios; sem `setup`, algum `edges` do canto com estrada de `player`.
- `roadSpots`: lado vazio; com `from`: o lado encosta em `from`. Sem `from`: para algum dos dois cantos `v` do lado, `buildings[v]?.owner === player`, **ou** (`buildings[v]` é null ou é de `player`) e algum outro lado de `v` tem estrada de `player`. (Casa de outro no canto corta a ligação.)
- `portRates`: começa 4 pra tudo; para cada feira da geometria com prédio de `player` em um dos `vertices`: `generic` → `min(atual, 3)` pra todos; recurso → 2 pra esse.
- `points`: casa 1, vila 2, +2 se `longestRoad === player`, +2 se `largestArmy === player`, + (com `hidden`) quantidade de cordéis `point` na mão.

- [ ] **Step 1: Teste do sorteio** (`shared/test/mandacaru-setup.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { geometry } from '../src/games/mandacaru/board';
import { desertOf, randomLayout } from '../src/games/mandacaru/setup';
import { NUMBER_TOKENS, PORT_KINDS, TERRAIN_COUNTS, TERRAINS } from '../src/games/mandacaru/types';
import { mulberry32 } from '../src/rng';

const sorted = <T>(a: readonly T[]) => [...a].sort();

describe('Mandacaru: sorteio do tabuleiro', () => {
  it('usa todos os terrenos, fichas e feiras, com o rio seco sem número', () => {
    const l = randomLayout(mulberry32(7));
    for (const t of TERRAINS) expect(l.hexes.filter((h) => h.terrain === t)).toHaveLength(TERRAIN_COUNTS[t]);
    expect(sorted(l.hexes.filter((h) => h.number !== null).map((h) => h.number))).toEqual(sorted(NUMBER_TOKENS));
    expect(l.hexes[desertOf(l)]!).toEqual({ terrain: 'desert', number: null });
    expect(sorted(l.ports)).toEqual(sorted(PORT_KINDS));
  });

  it('6 e 8 nunca ficam vizinhos (200 sementes)', () => {
    const g = geometry();
    for (let seed = 1; seed <= 200; seed++) {
      const l = randomLayout(mulberry32(seed));
      const hot = (i: number) => l.hexes[i]!.number === 6 || l.hexes[i]!.number === 8;
      g.hexes.forEach((h, i) => {
        if (hot(i)) for (const n of h.neighbors) expect(hot(n), `semente ${seed}`).toBe(false);
      });
    }
  });

  it('a mesma semente dá o mesmo tabuleiro; outra semente, outro', () => {
    expect(randomLayout(mulberry32(3))).toEqual(randomLayout(mulberry32(3)));
    expect(randomLayout(mulberry32(3))).not.toEqual(randomLayout(mulberry32(4)));
  });
});
```

- [ ] **Step 2: Teste das consultas** (`shared/test/mandacaru-build.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { canAfford, citySpots, grant, handSize, houseSpots, pay, piecesLeft, points, portRates, roadSpots } from '../src/games/mandacaru/build';
import { COSTS } from '../src/games/mandacaru/types';
import { corner, edgeBetween, geo, res, table } from './mandacaru-helpers';

describe('Mandacaru: construção', () => {
  it('custo: dá ou não dá, pagar devolve ao banco, ganhar tira do banco', () => {
    expect(canAfford(res({ wood: 1, brick: 1 }), COSTS.road)).toBe(true);
    expect(canAfford(res({ wood: 1 }), COSTS.road)).toBe(false);
    const s = table({ hands: { p0: { wood: 2, brick: 1 } } });
    const paid = pay(s, 'p0', COSTS.road);
    expect(paid.hands.p0!.res).toMatchObject({ wood: 1, brick: 0 });
    expect(paid.bank.wood).toBe(s.bank.wood + 1);
    const got = grant(s, 'p1', res({ stone: 2 }));
    expect(got.hands.p1!.res.stone).toBe(2);
    expect(got.bank.stone).toBe(s.bank.stone - 2);
    expect(handSize(res({ wood: 2, beans: 3 }))).toBe(5);
  });

  it('casa na preparação: qualquer canto vazio longe 2 lados de outra casa', () => {
    const v = corner(9, 0);
    const s = table({ houses: { [v]: 'p1' } });
    const spots = houseSpots(s, 'p0', true);
    expect(spots).not.toContain(v);
    for (const n of geo().vertices[v]!.neighbors) expect(spots).not.toContain(n);
    expect(spots).toHaveLength(54 - 1 - geo().vertices[v]!.neighbors.length);
  });

  it('casa no jogo: precisa de estrada sua encostada', () => {
    const a = corner(9, 0);
    const b = geo().vertices[a]!.neighbors[0]!;
    const c = geo().vertices[b]!.neighbors.find((x) => x !== a)!;
    const s = table({ houses: { [a]: 'p0' }, roads: { [edgeBetween(a, b)]: 'p0', [edgeBetween(b, c)]: 'p0' } });
    expect(houseSpots(s, 'p0', false)).toEqual([c]); // b é vizinho da casa; c está a 2 lados
    expect(houseSpots(s, 'p1', false)).toEqual([]);
  });

  it('estrada liga na sua casa ou estrada; casa de outro no meio corta', () => {
    const a = corner(9, 0);
    const b = geo().vertices[a]!.neighbors[0]!;
    const s = table({ houses: { [a]: 'p0' } });
    const spots = roadSpots(s, 'p0');
    expect(spots.sort((x, y) => x - y)).toEqual([...geo().vertices[a]!.edges].sort((x, y) => x - y));
    const withRoad = table({ houses: { [a]: 'p0', [b]: 'p1' }, roads: { [edgeBetween(a, b)]: 'p0' } });
    // a estrada chega em b, mas b tem casa do p1: não continua por b
    for (const e of geo().vertices[b]!.edges) if (e !== edgeBetween(a, b)) expect(roadSpots(withRoad, 'p0')).not.toContain(e);
  });

  it('estrada da preparação: só encostada no canto dado', () => {
    const a = corner(5, 2);
    const s = table({ houses: { [a]: 'p0' } });
    expect(roadSpots(s, 'p0', a).sort((x, y) => x - y)).toEqual([...geo().vertices[a]!.edges].sort((x, y) => x - y));
  });

  it('vila só no lugar de casa sua; peças restantes', () => {
    const a = corner(9, 0);
    const b = corner(9, 3);
    const s = table({ houses: { [a]: 'p0' }, cities: { [b]: 'p0' }, roads: { [geo().vertices[a]!.edges[0]!]: 'p0' } });
    expect(citySpots(s, 'p0')).toEqual([a]);
    expect(piecesLeft(s, 'p0')).toEqual({ road: 14, house: 4, city: 3 });
  });

  it('feira: 4 sem nada, 3 na comum, 2 na do recurso', () => {
    const g = geo();
    const generic = g.ports[0]!; // FIXED_LAYOUT.ports[0] = generic
    const wood = g.ports[1]!; // FIXED_LAYOUT.ports[1] = wood
    expect(portRates(table(), 'p0')).toEqual({ wood: 4, brick: 4, leather: 4, beans: 4, stone: 4 });
    expect(portRates(table({ houses: { [generic.vertices[0]]: 'p0' } }), 'p0')).toEqual({ wood: 3, brick: 3, leather: 3, beans: 3, stone: 3 });
    expect(portRates(table({ cities: { [wood.vertices[1]]: 'p0' } }), 'p0')).toEqual({ wood: 2, brick: 4, leather: 4, beans: 4, stone: 4 });
  });

  it('pontos: casa 1, vila 2, prêmios 2, cordel de Ponto só com hidden', () => {
    const s = {
      ...table({ houses: { [corner(0, 0)]: 'p0' }, cities: { [corner(18, 3)]: 'p0' }, cordeis: { p0: ['point', 'vaqueiro'] } }),
      longestRoad: 'p0',
      largestArmy: 'p1',
    };
    expect(points(s, 'p0', false)).toBe(5);
    expect(points(s, 'p0', true)).toBe(6);
    expect(points(s, 'p1', false)).toBe(2);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar** — `npm test -w shared -- mandacaru-setup mandacaru-build` → FAIL (módulos inexistentes).
- [ ] **Step 4: Implementar `setup.ts` e `build.ts`** com as assinaturas e o comportamento acima.
- [ ] **Step 5: Rodar** → PASS. `npm run typecheck -w shared` → ok.
- [ ] **Step 6: Commit** `feat(shared): Mandacaru — sorteio do tabuleiro e regras de construção`

---

### Task 3: produção e maior estrada/comitiva

**Files:**
- Create: `shared/src/games/mandacaru/production.ts`, `shared/src/games/mandacaru/longest.ts`
- Test: `shared/test/mandacaru-production.test.ts`, `shared/test/mandacaru-longest.test.ts`

**Assinaturas:**

```ts
// production.ts
/** Aplica a produção da soma `roll` (≠ 7): casa 1, vila 2, nada no terreno do Carcará; banco curto (§2.3). */
export function produce(state: MandacaruState, roll: number): { state: MandacaruState; gains: Record<string, Resources>; short: Resource[] };
/** Recursos da segunda casa da preparação: 1 de cada terreno em volta de `vertex` (rio seco não rende). */
export function setupGain(state: MandacaruState, vertex: number): Resources;

// longest.ts
/** Maior caminho de estradas de `player` sem repetir lado, sem atravessar canto com prédio de outro. */
export function roadLength(state: MandacaruState, player: string): number;
/** Recalcula maior estrada e maior comitiva (§2.7) e registra no diário quando o dono muda. */
export function updateAwards(state: MandacaruState): MandacaruState;
```

**Comportamento:**
- `produce`: para cada recurso, junta o que cada jogador ganharia (terrenos com `number === roll`, exceto `carcara`; cantos do terreno com prédio). Se `bank[r] >= total`, todos recebem. Senão, se **um** jogador só ia receber, ele recebe `bank[r]`; senão ninguém recebe e `r` entra em `short`. `gains` traz só quem ganhou algo (≥1).
- `roadLength`: busca em profundidade a partir de cada canto tocado por estrada do jogador; anda por lados do jogador ainda não usados; ao **chegar** num canto com prédio de outro jogador, o caminho para ali (conta o lado, mas não continua). Devolve o maior número de lados.
- `updateAwards`: comprimentos `L` de todos.
  - Maior estrada: se há dono e `L[dono] >= 5` e `L[dono] >= max(L dos outros)`: fica. Senão: entre todos, quem tem o maior `L` com `L >= 5`; se for **um só**, ele; senão `null`.
  - Maior comitiva: `knights`; dono fica se `knights[dono] >= max(dos outros)`; senão o único maior com `>= 3`, senão mantém `null` (não tem como perder Vaqueiro, então só muda pra quem passa sozinho).
  - Cada mudança acrescenta `{ t: 'award', award, player }` ao diário (respeitando `MANDACARU_LOG_MAX`; use uma função `logged(state, entry)` exportada de `longest.ts`? Não: crie `export function logged(state, entry)` em `build.ts` e use em todo lugar — corta o começo quando passa de 80).

> Acrescente em `build.ts` (Task 2 já criou o arquivo): `export function logged(state: MandacaruState, entry: MandacaruLogEntry): MandacaruState` — devolve `{ ...state, log: [...state.log, entry].slice(-MANDACARU_LOG_MAX) }`.

- [ ] **Step 1: Teste da produção** (`shared/test/mandacaru-production.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { produce, setupGain } from '../src/games/mandacaru/production';
import { corner, res, table } from './mandacaru-helpers';

// FIXED_LAYOUT: terreno 5 = forest 6, terreno 16 = hills 6, terreno 10 = hills 8, terreno 18 = fields 8, 9 = rio seco.
describe('Mandacaru: produção', () => {
  it('casa rende 1, vila rende 2, dos terrenos com o número', () => {
    const s = table({ houses: { [corner(5, 0)]: 'p0' }, cities: { [corner(16, 0)]: 'p1' } });
    const { state, gains } = produce(s, 6);
    expect(gains).toEqual({ p0: res({ wood: 1 }), p1: res({ brick: 2 }) });
    expect(state.hands.p0!.res.wood).toBe(1);
    expect(state.bank.brick).toBe(s.bank.brick - 2);
  });

  it('o terreno com o Carcará não rende', () => {
    const s = table({ houses: { [corner(5, 0)]: 'p0' }, carcara: 5 });
    expect(produce(s, 6).gains).toEqual({});
  });

  it('banco curto com dois recebendo: ninguém recebe', () => {
    const base = table({ houses: { [corner(10, 0)]: 'p0', [corner(10, 3)]: 'p1' } });
    const s = { ...base, bank: { ...base.bank, brick: 1 } };
    const out = produce(s, 8);
    expect(out.gains).toEqual({});
    expect(out.short).toEqual(['brick']);
  });

  it('banco curto com um só recebendo: leva o que tiver', () => {
    const base = table({ cities: { [corner(10, 0)]: 'p0' } });
    const s = { ...base, bank: { ...base.bank, brick: 1 } };
    expect(produce(s, 8).gains).toEqual({ p0: res({ brick: 1 }) });
  });

  it('segunda casa da preparação: 1 de cada terreno em volta, sem o rio seco', () => {
    const s = table();
    // corner(9, 0) é o canto de cima do rio seco: encosta no 9 e em mais dois terrenos.
    const g = setupGain(s, corner(9, 0));
    expect(Object.values(g).reduce((a, b) => a + b, 0)).toBe(2);
  });
});
```

- [ ] **Step 2: Teste da maior estrada** (`shared/test/mandacaru-longest.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { roadLength, updateAwards } from '../src/games/mandacaru/longest';
import { corner, edgeBetween, geo, table } from './mandacaru-helpers';

/** Caminho de `n` lados seguindo a borda do terreno `hex` a partir do canto 0 (no máximo 6 = anel). */
function ring(hex: number, n: number): number[] {
  return geo().hexes[hex]!.edges.slice(0, n);
}
const roadsOf = (edges: number[], owner: string) => Object.fromEntries(edges.map((e) => [e, owner]));

describe('Mandacaru: maior estrada', () => {
  it('caminho reto conta os lados', () => {
    expect(roadLength(table({ roads: roadsOf(ring(9, 4), 'p0') }), 'p0')).toBe(4);
  });

  it('anel fechado de 6 conta 6 (não repete lado)', () => {
    expect(roadLength(table({ roads: roadsOf(ring(9, 6), 'p0') }), 'p0')).toBe(6);
  });

  it('bifurcação: conta o maior ramo, não a soma', () => {
    const edges = ring(9, 4);
    const v = corner(9, 1); // canto do meio do caminho
    const branch = geo().vertices[v]!.edges.find((e) => !edges.includes(e))!;
    expect(roadLength(table({ roads: roadsOf([...edges, branch], 'p0') }), 'p0')).toBe(4);
  });

  it('casa de outro no meio corta o caminho', () => {
    const s = table({ roads: roadsOf(ring(9, 5), 'p0'), houses: { [corner(9, 2)]: 'p1' } });
    expect(roadLength(s, 'p0')).toBe(3);
  });

  it('casa própria no meio não corta', () => {
    const s = table({ roads: roadsOf(ring(9, 5), 'p0'), houses: { [corner(9, 2)]: 'p0' } });
    expect(roadLength(s, 'p0')).toBe(5);
  });

  it('5 ou mais e sozinho no topo ganha; empate não tira de quem tem', () => {
    let s = updateAwards(table({ roads: { ...roadsOf(ring(9, 5), 'p0') } }));
    expect(s.longestRoad).toBe('p0');
    expect(s.log.at(-1)).toEqual({ t: 'award', award: 'longest', player: 'p0' });
    s = updateAwards({ ...s, roads: s.roads.map((o, e) => (ring(0, 5).includes(e) ? 'p1' : o)) });
    expect(s.longestRoad).toBe('p0');
  });

  it('cortado e empatado entre os outros: fica sem dono', () => {
    const base = table({
      roads: { ...roadsOf(ring(9, 6), 'p0'), ...roadsOf(ring(0, 5), 'p1'), ...roadsOf(ring(18, 5), 'p2') },
    });
    const owned = { ...updateAwards(base), longestRoad: 'p0' };
    // casa do p1 em dois cantos do anel do p0 derruba o p0 pra menos de 5
    const cut = { ...owned, buildings: owned.buildings.map((b, v) => (v === corner(9, 1) || v === corner(9, 4) ? { owner: 'p1', kind: 'house' as const } : b)) };
    expect(updateAwards(cut).longestRoad).toBeNull();
  });

  it('maior comitiva: 3 Vaqueiros e mais que todos', () => {
    const s = table();
    expect(updateAwards({ ...s, knights: { p0: 2, p1: 0, p2: 0 } }).largestArmy).toBeNull();
    const a = updateAwards({ ...s, knights: { p0: 3, p1: 0, p2: 0 } });
    expect(a.largestArmy).toBe('p0');
    expect(updateAwards({ ...a, knights: { p0: 3, p1: 3, p2: 0 } }).largestArmy).toBe('p0');
    expect(updateAwards({ ...a, knights: { p0: 3, p1: 4, p2: 0 } }).largestArmy).toBe('p1');
  });
});
```

> Se o teste "cortado e empatado" não bater por causa da geometria dos anéis (dois anéis vizinhos dividem lado), ajuste os terrenos escolhidos pra anéis que não se tocam (0 e 18 não tocam o 9? 0 é (-2,0), não é vizinho de 9; 18 é (2,0), também não), mantendo a intenção do teste.

- [ ] **Step 3: Rodar e ver falhar.**
- [ ] **Step 4: Implementar** `production.ts`, `longest.ts` e `logged` em `build.ts`.
- [ ] **Step 5: Rodar** → PASS; typecheck ok.
- [ ] **Step 6: Commit** `feat(shared): Mandacaru — produção, maior estrada e maior comitiva`

---

### Task 4: regras — começo, preparação, dados, construção, fim de turno, vitória

**Files:**
- Create: `shared/src/games/mandacaru/cordel.ts` (só o monte nesta task)
- Modify: `shared/src/games/mandacaru/rules.ts` (substitui o provisório)
- Test: `shared/test/mandacaru-rules.test.ts`

**Assinaturas:**

```ts
// cordel.ts
/** Os 25 cordéis embaralhados. */
export function shuffledCordelDeck(rng: Rng): CordelKind[];

// rules.ts
export function initialMandacaruState(): MandacaruState;
export function applyMandacaruAction(state: MandacaruState, playerId: string, action: MandacaruAction, ctx: GameContext): ActionResult<MandacaruState>;
/** Passa a vez: próximo da ordem, fase `roll`, limpa oferta/propostas, cordéis deixam de ser "novos", relógio novo. */
export function endTurn(state: MandacaruState, ctx: GameContext): MandacaruState;
/** Se quem está na vez tem 10+ (com os escondidos), termina a partida. */
export function checkWin(state: MandacaruState): MandacaruState;
/** Ordem em cobra da preparação: [...players, ...reverse]. */
export function setupOrder(players: string[]): string[];
```

**Comportamento:**
- `start` (só host, `lobby`) / `restart` (só host, `over`): ativos entre 3 e 4 (`need_3_players` com menos, `room_full` com mais). `players = shuffle(ctx.active)`; `layout = randomLayout(rng)`; `carcara = desertOf(layout)`; `deck = shuffledCordelDeck(rng)`; mãos vazias; banco 19 de cada; `knights` 0; `wins` mantém e acrescenta 0 pros novos; `match + 1`; `tradeSeq` mantém; fase `setup` com `setup = { index: 0, house: null }`, `turn = players[0]`, `turnEndsAt = now + TURN_MS`, `startedAt = now`; diário `[{ t: 'start', order: players }]`.
- `place_house` (fase `setup`, sua vez, `setup.house === null`): canto em `houseSpots(state, p, true)` senão `bad_spot`. Põe casa; `setup.house = vertex`; diário `place`. Se `setup.index >= players.length` (segunda volta), `grant(setupGain)` e diário `setup_gain`.
- `place_road` (fase `setup`, sua vez, `setup.house !== null`): lado em `roadSpots(state, p, setup.house)` senão `bad_spot`. Põe; diário `place`. Avança `index`; se acabou a ordem → fase `roll`, `turn = players[0]`, `rolled = false`; senão `turn = setupOrder[index]`; `setup.house = null`; `turnEndsAt` novo.
- `roll` (fase `roll`, sua vez): `d1 = randomInt(rng, 6) + 1`, `d2` idem; `dice`, `diceCounts[soma]++`, `rolled = true`. Soma 7: vai pro fluxo do Carcará (Task 5; nesta task, se a soma é 7, apenas fase `main` — a Task 5 troca). Senão `produce`, diário `roll` com `gains` e `short`, fase `main`.
- `build_road` (fase `main`, sua vez): `no_pieces` se acabou; `bad_spot` se fora de `roadSpots`; `cannot_afford`; paga, põe, diário `build`, `updateAwards`, `checkWin`.
- `build_house`: igual com `houseSpots(state, p, false)`.
- `build_city`: `citySpots`; vila no lugar; `no_pieces` se 4 vilas.
- `buy_cordel`: `deck_empty`, `cannot_afford`; tira o topo, entra na mão com `fresh: true`; diário `buy_cordel`; `checkWin` (cordel de Ponto pode dar a vitória).
- `end_turn` (fase `main`, sua vez): diário `end_turn`, `turns + 1`, `endTurn`, depois `checkWin` do novo jogador (vence no começo da própria vez).
- `checkWin`: se `turn` tem `points(state, turn, true) >= 10`: fase `over`, `winner`, `wins[winner]++`, `turnEndsAt = discardEndsAt = null`, diário `win`.
- Erros comuns: `not_player` (não está em `players`), `not_your_turn`, `bad_phase`.
- Depois de toda ação aceita: `ok(settleMandacaru(...))` — na Task 4 o `auto.ts` ainda não existe; deixe `const settled = (s) => s` local e a Task 8 troca.

- [ ] **Step 1: Teste** (`shared/test/mandacaru-rules.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { geometry } from '../src/games/mandacaru/board';
import { setupOrder } from '../src/games/mandacaru/rules';
import { MANDACARU_TURN_MS, type MandacaruState } from '../src/games/mandacaru/types';
import { T0, act, corner, ctxOf, edgeBetween, geo, ids, res, table, tryAct } from './mandacaru-helpers';
import { initialMandacaruState } from '../src/games/mandacaru/rules';
import { houseSpots, roadSpots } from '../src/games/mandacaru/build';

const ctx = ctxOf(ids(3));

function started(n = 3, seed = 1): MandacaruState {
  return act(initialMandacaruState(), 'p0', { type: 'start' }, ctxOf(ids(n), { seed }));
}

/** Faz a preparação inteira pondo cada casa no primeiro lugar válido e a estrada no primeiro lado. */
function afterSetup(seed = 1): MandacaruState {
  let s = started(3, seed);
  while (s.phase === 'setup') {
    const p = s.turn!;
    s = act(s, p, { type: 'place_house', vertex: houseSpots(s, p, true)[0]! }, ctx);
    s = act(s, p, { type: 'place_road', edge: roadSpots(s, p, s.setup!.house!)[0]! }, ctx);
  }
  return s;
}

describe('Mandacaru: começo', () => {
  it('só o host começa, com 3 ou 4', () => {
    const s = initialMandacaruState();
    expect(tryAct(s, 'p1', { type: 'start' }, ctxOf(ids(3)))).toEqual({ ok: false, error: 'not_host' });
    expect(tryAct(s, 'p0', { type: 'start' }, ctxOf(ids(2)))).toEqual({ ok: false, error: 'need_3_players' });
    expect(tryAct(s, 'p0', { type: 'start' }, ctxOf(ids(5)))).toEqual({ ok: false, error: 'room_full' });
  });

  it('começa na preparação, com tabuleiro, monte de 25, banco cheio e relógio de 5 min', () => {
    const s = started();
    expect(s.phase).toBe('setup');
    expect(s.match).toBe(1);
    expect([...s.players].sort()).toEqual(ids(3));
    expect(s.turn).toBe(s.players[0]);
    expect(s.deck).toHaveLength(25);
    expect(s.bank).toEqual(res({ wood: 19, brick: 19, leather: 19, beans: 19, stone: 19 }));
    expect(s.layout!.hexes[s.carcara]!.terrain).toBe('desert');
    expect(s.turnEndsAt).toBe(T0 + MANDACARU_TURN_MS);
    expect(s.log[0]).toEqual({ t: 'start', order: s.players });
  });

  it('ordem em cobra', () => {
    expect(setupOrder(['a', 'b', 'c'])).toEqual(['a', 'b', 'c', 'c', 'b', 'a']);
  });
});

describe('Mandacaru: preparação', () => {
  it('casa e depois estrada encostada; fora da vez ou fora do lugar não vale', () => {
    let s = started();
    const [a, b] = s.players;
    const v = houseSpots(s, a!, true)[0]!;
    expect(tryAct(s, b!, { type: 'place_house', vertex: v }, ctx)).toEqual({ ok: false, error: 'not_your_turn' });
    expect(tryAct(s, a!, { type: 'place_road', edge: 0 }, ctx)).toEqual({ ok: false, error: 'bad_phase' });
    s = act(s, a!, { type: 'place_house', vertex: v }, ctx);
    const far = geometry().edges.findIndex((e) => e.a !== v && e.b !== v);
    expect(tryAct(s, a!, { type: 'place_road', edge: far }, ctx)).toEqual({ ok: false, error: 'bad_spot' });
    s = act(s, a!, { type: 'place_road', edge: geo().vertices[v]!.edges[0]! }, ctx);
    expect(s.turn).toBe(b);
    expect(s.setup).toEqual({ index: 1, house: null });
  });

  it('casa colada em outra não vale', () => {
    let s = started();
    const a = s.players[0]!;
    const v = houseSpots(s, a, true)[0]!;
    s = act(s, a, { type: 'place_house', vertex: v }, ctx);
    s = act(s, a, { type: 'place_road', edge: geo().vertices[v]!.edges[0]! }, ctx);
    const n = geo().vertices[v]!.neighbors[0]!;
    expect(tryAct(s, s.turn!, { type: 'place_house', vertex: n }, ctx)).toEqual({ ok: false, error: 'bad_spot' });
  });

  it('a segunda casa rende; depois da cobra, começa o jogo na vez do primeiro', () => {
    const s = afterSetup();
    expect(s.phase).toBe('roll');
    expect(s.turn).toBe(s.players[0]);
    expect(s.buildings.filter(Boolean)).toHaveLength(6);
    expect(s.roads.filter(Boolean)).toHaveLength(6);
    const total = s.players.reduce((acc, p) => acc + Object.values(s.hands[p]!.res).reduce((a, b) => a + b, 0), 0);
    expect(total).toBeGreaterThan(0);
    expect(s.log.some((e) => e.t === 'setup_gain')).toBe(true);
  });
});

describe('Mandacaru: dados e construção', () => {
  it('rolar conta a soma, rende e vai pra fase principal', () => {
    let s = afterSetup(5);
    const p = s.turn!;
    s = act(s, p, { type: 'roll' }, ctx);
    expect(s.rolled).toBe(true);
    const sum = s.dice![0] + s.dice![1];
    expect(s.diceCounts[sum]).toBe(1);
    if (sum !== 7) expect(s.phase).toBe('main');
    expect(tryAct(s, p, { type: 'roll' }, ctx)).toEqual({ ok: false, error: 'bad_phase' });
  });

  it('constrói estrada, casa e vila pagando; sem dinheiro ou lugar não vale', () => {
    const a = corner(9, 0);
    const b = geo().vertices[a]!.neighbors[0]!;
    const c = geo().vertices[b]!.neighbors.find((x) => x !== a)!;
    let s = table({ houses: { [a]: 'p0' }, hands: { p0: { wood: 3, brick: 3, leather: 1, beans: 3, stone: 3 } } });
    s = act(s, 'p0', { type: 'build_road', edge: edgeBetween(a, b) }, ctx);
    s = act(s, 'p0', { type: 'build_road', edge: edgeBetween(b, c) }, ctx);
    s = act(s, 'p0', { type: 'build_house', vertex: c }, ctx);
    s = act(s, 'p0', { type: 'build_city', vertex: a }, ctx);
    expect(s.buildings[c]).toEqual({ owner: 'p0', kind: 'house' });
    expect(s.buildings[a]).toEqual({ owner: 'p0', kind: 'city' });
    expect(s.hands.p0!.res).toEqual(res({ wood: 0, brick: 0, leather: 0, beans: 0, stone: 0 }));
    expect(tryAct(s, 'p0', { type: 'build_road', edge: geo().vertices[c]!.edges.find((e) => s.roads[e] === null)! }, ctx)).toEqual({
      ok: false,
      error: 'cannot_afford',
    });
    expect(tryAct(table({ hands: { p0: { wood: 1, brick: 1 } } }), 'p0', { type: 'build_road', edge: 0 }, ctx)).toEqual({ ok: false, error: 'bad_spot' });
  });

  it('compra cordel novo (não dá pra jogar no mesmo turno); monte vazio não vende', () => {
    let s = table({ hands: { p0: { leather: 2, beans: 2, stone: 2 } }, deck: ['vaqueiro'] });
    s = act(s, 'p0', { type: 'buy_cordel' }, ctx);
    expect(s.hands.p0!.cordeis).toEqual([{ kind: 'vaqueiro', fresh: true }]);
    expect(s.deck).toEqual([]);
    expect(tryAct(s, 'p0', { type: 'buy_cordel' }, ctx)).toEqual({ ok: false, error: 'deck_empty' });
  });

  it('passar a vez: próximo jogador, fase roll, cordel deixa de ser novo, relógio novo', () => {
    const s0 = table({ cordeis: { p0: [{ kind: 'vaqueiro', fresh: true }] } });
    const s = act(s0, 'p0', { type: 'end_turn' }, ctxOf(ids(3), { now: T0 + 1000 }));
    expect(s.turn).toBe('p1');
    expect(s.phase).toBe('roll');
    expect(s.rolled).toBe(false);
    expect(s.hands.p0!.cordeis[0]!.fresh).toBe(false);
    expect(s.turnEndsAt).toBe(T0 + 1000 + MANDACARU_TURN_MS);
    expect(s.turns).toBe(1);
  });

  it('chega a 10 na própria vez: vence na hora', () => {
    const houses = { [corner(0, 0)]: 'p0', [corner(2, 3)]: 'p0', [corner(16, 0)]: 'p0' };
    const cities = { [corner(7, 0)]: 'p0', [corner(11, 3)]: 'p0', [corner(14, 1)]: 'p0' };
    // 3 casas + 3 vilas = 9; um cordel de Ponto comprado dá 10
    const s = act(table({ houses, cities, hands: { p0: { leather: 1, beans: 1, stone: 1 } }, deck: ['point'] }), 'p0', { type: 'buy_cordel' }, ctx);
    expect(s.phase).toBe('over');
    expect(s.winner).toBe('p0');
    expect(s.wins.p0).toBe(1);
    expect(s.log.at(-1)).toEqual({ t: 'win', player: 'p0', points: 10 });
  });
});
```

> Os cantos usados no teste da vitória (`corner(0,0)`, `corner(2,3)`, …) precisam estar a 2+ lados um do outro só pra parecer real; o `table` não confere. Se algum coincidir, troque o canto.

- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** `cordel.ts` (monte) e `rules.ts`.
- [ ] **Step 4: Rodar** `npm test -w shared -- mandacaru` → PASS; typecheck ok.
- [ ] **Step 5: Commit** `feat(shared): Mandacaru — começo, preparação, dados, construção e vitória`

---

### Task 5: o 7 — descarte, Carcará, roubo e o Vaqueiro

**Files:**
- Modify: `shared/src/games/mandacaru/rules.ts`
- Test: `shared/test/mandacaru-carcara.test.ts`

**Comportamento:**
- Soma 7 no `roll`: diário `roll` com `gains: {}`; `discards` = cada jogador com mão > 7 → `floor(n/2)`. Se houver alguém: fase `discard`, `discardEndsAt = now + DISCARD_MS`. Senão: fase `carcara`. `afterCarcara = 'main'`.
- `discard` (fase `discard`, quem está em `discards`): `cards` precisa somar exatamente o pedido e caber na mão (`bad_discard`); paga ao banco; diário `discard`; tira de `discards`. Vazio → fase `carcara`, `discardEndsAt = null`.
- `move_carcara` (fase `carcara`, sua vez): `hex` válido (0..18) e diferente do atual (`bad_spot`). Diário `carcara`. Vítimas = donos de prédio nos cantos do terreno, ≠ você, com ≥1 carta. 0 → volta pra `afterCarcara`; 1 → rouba direto; 2+ → fase `steal`.
- `steal` (fase `steal`, sua vez, `from` entre as vítimas, senão `bad_target`): recurso sorteado com peso (escolha `randomInt` sobre a lista de cartas expandida, na ordem de `RESOURCES`), passa pra você; `lastSteal`; diário `steal` (sem o recurso); volta pra `afterCarcara` (`roll` ou `main`).
- `play_vaqueiro` (fase `roll` ou `main`, sua vez): `cordel_used` se já jogou; `no_cordel` se não tem Vaqueiro velho (`fresh` false) — se só tem novo: `cordel_fresh`. Tira 1 da mão, `knights[p]++`, `cordelPlayed = true`, diário `play`, `updateAwards`, `afterCarcara` = fase atual, fase `carcara`. `checkWin` depois (a comitiva pode dar o 10).

- [ ] **Step 1: Teste** (`shared/test/mandacaru-carcara.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import type { MandacaruState } from '../src/games/mandacaru/types';
import { MANDACARU_DISCARD_MS } from '../src/games/mandacaru/types';
import { T0, act, corner, ctxOf, ids, res, table, tryAct } from './mandacaru-helpers';

/** Procura uma semente cujo primeiro roll dá 7. */
function sevenCtx() {
  for (let seed = 1; seed < 500; seed++) {
    const rng = ctxOf(ids(3), { seed }).rng;
    const d = Math.floor(rng() * 6) + 1 + Math.floor(rng() * 6) + 1;
    if (d === 7) return ctxOf(ids(3), { seed });
  }
  throw new Error('sem 7');
}

describe('Mandacaru: saiu 7', () => {
  it('quem tem mais de 7 descarta metade; os outros esperam', () => {
    const s0 = table({ phase: 'roll', hands: { p1: { wood: 5, stone: 4 }, p2: { wood: 7 } } });
    let s = act(s0, 'p0', { type: 'roll' }, sevenCtx());
    expect(s.phase).toBe('discard');
    expect(s.discards).toEqual({ p1: 4 });
    expect(s.discardEndsAt).toBe(T0 + MANDACARU_DISCARD_MS);
    expect(tryAct(s, 'p1', { type: 'discard', cards: res({ wood: 3 }) }, sevenCtx())).toEqual({ ok: false, error: 'bad_discard' });
    s = act(s, 'p1', { type: 'discard', cards: res({ wood: 2, stone: 2 }) }, sevenCtx());
    expect(s.hands.p1!.res).toEqual(res({ wood: 3, stone: 2 }));
    expect(s.phase).toBe('carcara');
    expect(s.discardEndsAt).toBeNull();
  });

  it('ninguém com mais de 7: vai direto pro Carcará', () => {
    const s = act(table({ phase: 'roll' }), 'p0', { type: 'roll' }, sevenCtx());
    expect(s.phase).toBe('carcara');
  });

  it('Carcará tem que mudar de terreno; uma vítima só = rouba direto', () => {
    let s: MandacaruState = { ...table({ houses: { [corner(5, 0)]: 'p1' }, hands: { p1: { brick: 1 } } }), phase: 'carcara' };
    expect(tryAct(s, 'p0', { type: 'move_carcara', hex: s.carcara }, ctxOf(ids(3)))).toEqual({ ok: false, error: 'bad_spot' });
    s = act(s, 'p0', { type: 'move_carcara', hex: 5 }, ctxOf(ids(3)));
    expect(s.carcara).toBe(5);
    expect(s.hands.p0!.res.brick).toBe(1);
    expect(s.hands.p1!.res.brick).toBe(0);
    expect(s.lastSteal).toEqual({ thief: 'p0', victim: 'p1', resource: 'brick' });
    expect(s.log.at(-1)).toEqual({ t: 'steal', player: 'p0', from: 'p1' });
    expect(s.phase).toBe('main');
  });

  it('duas vítimas: escolhe de quem; quem não tem carta não é vítima', () => {
    const base = table({
      houses: { [corner(5, 0)]: 'p1', [corner(5, 3)]: 'p2' },
      hands: { p1: { wood: 1 }, p2: { stone: 1 } },
    });
    let s = act({ ...base, phase: 'carcara' }, 'p0', { type: 'move_carcara', hex: 5 }, ctxOf(ids(3)));
    expect(s.phase).toBe('steal');
    expect(tryAct(s, 'p0', { type: 'steal', from: 'p0' }, ctxOf(ids(3)))).toEqual({ ok: false, error: 'bad_target' });
    s = act(s, 'p0', { type: 'steal', from: 'p2' }, ctxOf(ids(3)));
    expect(s.hands.p0!.res.stone).toBe(1);
    const empty = table({ houses: { [corner(5, 0)]: 'p1' } });
    expect(act({ ...empty, phase: 'carcara' }, 'p0', { type: 'move_carcara', hex: 5 }, ctxOf(ids(3))).phase).toBe('main');
  });

  it('Vaqueiro antes dos dados: Carcará e volta pra rolar; conta pra comitiva; 1 cordel por turno', () => {
    const base = table({ phase: 'roll', cordeis: { p0: ['vaqueiro', 'vaqueiro'] } });
    let s = act(base, 'p0', { type: 'play_vaqueiro' }, ctxOf(ids(3)));
    expect(s.phase).toBe('carcara');
    expect(s.knights.p0).toBe(1);
    s = act(s, 'p0', { type: 'move_carcara', hex: 0 }, ctxOf(ids(3)));
    expect(s.phase).toBe('roll');
    expect(tryAct(s, 'p0', { type: 'play_vaqueiro' }, ctxOf(ids(3)))).toEqual({ ok: false, error: 'cordel_used' });
  });

  it('Vaqueiro comprado neste turno não pode', () => {
    const s = table({ cordeis: { p0: [{ kind: 'vaqueiro', fresh: true }] } });
    expect(tryAct(s, 'p0', { type: 'play_vaqueiro' }, ctxOf(ids(3)))).toEqual({ ok: false, error: 'cordel_fresh' });
    expect(tryAct(table(), 'p0', { type: 'play_vaqueiro' }, ctxOf(ids(3)))).toEqual({ ok: false, error: 'no_cordel' });
  });
});
```

- [ ] **Step 2–4:** ver falhar, implementar, passar (+ typecheck).
- [ ] **Step 5: Commit** `feat(shared): Mandacaru — o 7, o Carcará e o Vaqueiro`

---

### Task 6: troca com jogadores e feira

**Files:**
- Create: `shared/src/games/mandacaru/trade.ts`
- Modify: `shared/src/games/mandacaru/rules.ts` (despacha `offer`, `cancel_offer`, `respond`, `propose`, `close_deal`, `feira`)
- Test: `shared/test/mandacaru-trade.test.ts`

**Assinaturas (`trade.ts`):** cada uma devolve `ActionResult<MandacaruState>` e recebe `(state, player, ...args)`; `rules.ts` só despacha.

```ts
export function makeOffer(state: MandacaruState, player: string, give: Resources, want: Resources): ActionResult<MandacaruState>;
export function cancelOffer(state: MandacaruState, player: string): ActionResult<MandacaruState>;
export function respond(state: MandacaruState, player: string, offerId: number, accept: boolean): ActionResult<MandacaruState>;
export function propose(state: MandacaruState, player: string, give: Resources, want: Resources): ActionResult<MandacaruState>;
export function closeDeal(state: MandacaruState, player: string, other: string, source: 'offer' | 'proposal'): ActionResult<MandacaruState>;
export function feira(state: MandacaruState, player: string, give: Resource, want: Resource, count: number): ActionResult<MandacaruState>;
/** Termos válidos: lados com 1+ carta, nenhum recurso nos dois lados, números inteiros ≥ 0. */
export function validTerms(give: Resources, want: Resources): boolean;
```

**Comportamento:**
- Tudo só com `phase === 'main'` (`bad_phase`). `makeOffer`/`cancelOffer`/`closeDeal`/`feira`: só quem está na vez (`not_your_turn`). `respond`/`propose`: só os outros jogadores (`not_your_turn` se for quem está na vez).
- `makeOffer`: `validTerms` senão `bad_trade`; precisa ter o `give` (`cannot_afford`). `tradeSeq + 1` vira o `id`; `offer = { id, give, want, accepted: [], rejected: [] }` (substitui a anterior).
- `respond`: `stale_offer` se não há oferta ou `offerId` diferente. Aceitar exige ter o `want` da oferta (`cannot_afford`). Tira o jogador de `accepted`/`rejected` e põe na lista certa.
- `propose`: `validTerms`, ter o `give`; `tradeSeq + 1`; troca a proposta anterior do mesmo jogador.
- `closeDeal(source 'offer')`: `other` em `offer.accepted` (`bad_target`); os dois precisam ter as cartas na hora (`cannot_afford`). `source 'proposal'`: proposta de `other` existe (`bad_target`); quem está na vez tem o `want` dela e `other` tem o `give`. Faz a troca, diário `{ t: 'trade', a: quem está na vez, b: other, aGives, bGives }`, `offer = null`, `proposals = []`.
- `feira`: `count` inteiro 1..19 (padrão 1); `give !== want` (`bad_trade`); paga `count * portRates[give]` de `give` (`cannot_afford`); banco precisa ter `count` de `want` (`bank_empty`); diário `feira`.
- `end_turn` (Task 4) já limpa `offer` e `proposals`.

- [ ] **Step 1: Teste** (`shared/test/mandacaru-trade.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { geometry } from '../src/games/mandacaru/board';
import { act, ctxOf, ids, res, table, tryAct } from './mandacaru-helpers';

const ctx = ctxOf(ids(3));

describe('Mandacaru: troca entre jogadores', () => {
  const base = () => table({ hands: { p0: { wood: 2, brick: 1 }, p1: { stone: 1 }, p2: { stone: 2 } } });

  it('oferta pra mesa; respostas; fecha com quem aceitou', () => {
    let s = act(base(), 'p0', { type: 'offer', give: res({ wood: 2 }), want: res({ stone: 1 }) }, ctx);
    const id = s.offer!.id;
    s = act(s, 'p1', { type: 'respond', offerId: id, accept: true }, ctx);
    s = act(s, 'p2', { type: 'respond', offerId: id, accept: false }, ctx);
    expect(s.offer).toMatchObject({ accepted: ['p1'], rejected: ['p2'] });
    expect(tryAct(s, 'p0', { type: 'close_deal', with: 'p2', source: 'offer' }, ctx)).toEqual({ ok: false, error: 'bad_target' });
    s = act(s, 'p0', { type: 'close_deal', with: 'p1', source: 'offer' }, ctx);
    expect(s.hands.p0!.res).toEqual(res({ brick: 1, stone: 1 }));
    expect(s.hands.p1!.res).toEqual(res({ wood: 2 }));
    expect(s.offer).toBeNull();
    expect(s.log.at(-1)).toEqual({ t: 'trade', a: 'p0', b: 'p1', aGives: res({ wood: 2 }), bGives: res({ stone: 1 }) });
  });

  it('termos inválidos, sem cartas, fora da vez', () => {
    const s = base();
    expect(tryAct(s, 'p0', { type: 'offer', give: res(), want: res({ stone: 1 }) }, ctx)).toEqual({ ok: false, error: 'bad_trade' });
    expect(tryAct(s, 'p0', { type: 'offer', give: res({ wood: 1 }), want: res({ wood: 1 }) }, ctx)).toEqual({ ok: false, error: 'bad_trade' });
    expect(tryAct(s, 'p0', { type: 'offer', give: res({ stone: 1 }), want: res({ wood: 1 }) }, ctx)).toEqual({ ok: false, error: 'cannot_afford' });
    expect(tryAct(s, 'p1', { type: 'offer', give: res({ stone: 1 }), want: res({ wood: 1 }) }, ctx)).toEqual({ ok: false, error: 'not_your_turn' });
    expect(tryAct({ ...s, phase: 'roll', rolled: false }, 'p0', { type: 'offer', give: res({ wood: 1 }), want: res({ stone: 1 }) }, ctx)).toEqual({
      ok: false,
      error: 'bad_phase',
    });
  });

  it('resposta pra oferta velha não vale; aceitar exige ter as cartas', () => {
    let s = act(base(), 'p0', { type: 'offer', give: res({ wood: 1 }), want: res({ stone: 2 }) }, ctx);
    const old = s.offer!.id;
    expect(tryAct(s, 'p1', { type: 'respond', offerId: old, accept: true }, ctx)).toEqual({ ok: false, error: 'cannot_afford' });
    s = act(s, 'p0', { type: 'offer', give: res({ wood: 1 }), want: res({ stone: 1 }) }, ctx);
    expect(tryAct(s, 'p1', { type: 'respond', offerId: old, accept: true }, ctx)).toEqual({ ok: false, error: 'stale_offer' });
  });

  it('proposta (contraproposta) dos outros; quem está na vez aceita', () => {
    let s = act(base(), 'p2', { type: 'propose', give: res({ stone: 2 }), want: res({ wood: 1, brick: 1 }) }, ctx);
    expect(s.proposals).toHaveLength(1);
    s = act(s, 'p2', { type: 'propose', give: res({ stone: 1 }), want: res({ brick: 1 }) }, ctx);
    expect(s.proposals).toHaveLength(1);
    s = act(s, 'p0', { type: 'close_deal', with: 'p2', source: 'proposal' }, ctx);
    expect(s.hands.p0!.res).toEqual(res({ wood: 2, stone: 1 }));
    expect(s.hands.p2!.res).toEqual(res({ stone: 1, brick: 1 }));
    expect(s.proposals).toEqual([]);
  });

  it('quem está na vez não manda proposta; passar a vez limpa tudo', () => {
    let s = base();
    expect(tryAct(s, 'p0', { type: 'propose', give: res({ wood: 1 }), want: res({ stone: 1 }) }, ctx)).toEqual({ ok: false, error: 'not_your_turn' });
    s = act(s, 'p1', { type: 'propose', give: res({ stone: 1 }), want: res({ wood: 1 }) }, ctx);
    s = act(s, 'p0', { type: 'offer', give: res({ wood: 1 }), want: res({ stone: 1 }) }, ctx);
    s = act(s, 'p0', { type: 'end_turn' }, ctx);
    expect(s.offer).toBeNull();
    expect(s.proposals).toEqual([]);
  });
});

describe('Mandacaru: feira', () => {
  it('4:1 sem feira, várias de uma vez', () => {
    const s = act(table({ hands: { p0: { wood: 8 } } }), 'p0', { type: 'feira', give: 'wood', want: 'stone', count: 2 }, ctx);
    expect(s.hands.p0!.res).toEqual(res({ stone: 2 }));
  });

  it('2:1 na feira do recurso', () => {
    const wood = geometry().ports[1]!; // FIXED_LAYOUT.ports[1] = wood
    const s = act(table({ houses: { [wood.vertices[0]]: 'p0' }, hands: { p0: { wood: 2 } } }), 'p0', { type: 'feira', give: 'wood', want: 'beans' }, ctx);
    expect(s.hands.p0!.res).toEqual(res({ beans: 1 }));
  });

  it('sem cartas, mesmo recurso, banco vazio', () => {
    const s = table({ hands: { p0: { wood: 3 } } });
    expect(tryAct(s, 'p0', { type: 'feira', give: 'wood', want: 'stone' }, ctx)).toEqual({ ok: false, error: 'cannot_afford' });
    expect(tryAct(s, 'p0', { type: 'feira', give: 'wood', want: 'wood' }, ctx)).toEqual({ ok: false, error: 'bad_trade' });
    const rich = table({ hands: { p0: { wood: 4 } } });
    expect(tryAct({ ...rich, bank: { ...rich.bank, stone: 0 } }, 'p0', { type: 'feira', give: 'wood', want: 'stone' }, ctx)).toEqual({
      ok: false,
      error: 'bank_empty',
    });
  });
});
```

- [ ] **Step 2–4:** ver falhar, implementar, passar (+ typecheck).
- [ ] **Step 5: Commit** `feat(shared): Mandacaru — troca entre jogadores e feira`

---

### Task 7: os outros cordéis

**Files:**
- Modify: `shared/src/games/mandacaru/cordel.ts`, `shared/src/games/mandacaru/rules.ts`
- Test: `shared/test/mandacaru-cordel.test.ts`

**Comportamento** (todos: fase `main` e sua vez; `cordel_used`, `cordel_fresh`, `no_cordel` como o Vaqueiro; tira o cordel da mão, `cordelPlayed = true`, diário `play`):
- `play_mutirao`: `mutiraoLeft = min(2, peças de estrada restantes)`; se 0 ou nenhum lado em `roadSpots`, fica em `main` sem efeito além de gastar; senão fase `mutirao`. Em `mutirao`, `build_road` não paga, decrementa; ao chegar a 0, ou quando não sobra lugar, volta pra `main`. `updateAwards` e `checkWin` a cada estrada.
- `play_chuva`: os 2 recursos (podem ser iguais) do banco; `bank_empty` se o banco não tem (contando o par). Diário com `resources`.
- `play_atravessador`: todos os outros entregam tudo de `resource`; diário com `resources: [resource]` e `total`.
- O `point` nunca é jogado (não tem ação).

- [ ] **Step 1: Teste** (`shared/test/mandacaru-cordel.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { act, corner, ctxOf, geo, ids, res, table, tryAct } from './mandacaru-helpers';

const ctx = ctxOf(ids(3));

describe('Mandacaru: cordéis', () => {
  it('Mutirão: 2 estradas de graça e volta pra fase principal', () => {
    const a = corner(9, 0);
    let s = act(table({ houses: { [a]: 'p0' }, cordeis: { p0: ['mutirao'] } }), 'p0', { type: 'play_mutirao' }, ctx);
    expect(s.phase).toBe('mutirao');
    expect(s.mutiraoLeft).toBe(2);
    const e1 = geo().vertices[a]!.edges[0]!;
    s = act(s, 'p0', { type: 'build_road', edge: e1 }, ctx);
    const e2 = geo().vertices[a]!.edges[1]!;
    s = act(s, 'p0', { type: 'build_road', edge: e2 }, ctx);
    expect(s.phase).toBe('main');
    expect(s.roads[e1]).toBe('p0');
    expect(s.roads[e2]).toBe('p0');
    expect(s.hands.p0!.cordeis).toEqual([]);
  });

  it('Chuva no sertão: 2 recursos do banco', () => {
    const s = act(table({ cordeis: { p0: ['chuva'] } }), 'p0', { type: 'play_chuva', resources: ['stone', 'stone'] }, ctx);
    expect(s.hands.p0!.res).toEqual(res({ stone: 2 }));
    const poor = table({ cordeis: { p0: ['chuva'] } });
    expect(tryAct({ ...poor, bank: { ...poor.bank, stone: 1 } }, 'p0', { type: 'play_chuva', resources: ['stone', 'stone'] }, ctx)).toEqual({
      ok: false,
      error: 'bank_empty',
    });
  });

  it('Atravessador: todos entregam tudo do recurso', () => {
    const s = act(
      table({ cordeis: { p0: ['atravessador'] }, hands: { p1: { beans: 3, wood: 1 }, p2: { beans: 2 } } }),
      'p0',
      { type: 'play_atravessador', resource: 'beans' },
      ctx,
    );
    expect(s.hands.p0!.res.beans).toBe(5);
    expect(s.hands.p1!.res).toEqual(res({ wood: 1 }));
    expect(s.log.at(-1)).toEqual({ t: 'play', player: 'p0', kind: 'atravessador', resources: ['beans'], total: 5 });
  });

  it('um cordel por turno, e não o comprado agora', () => {
    let s = table({ cordeis: { p0: ['chuva', 'atravessador', { kind: 'mutirao', fresh: true }] } });
    expect(tryAct(s, 'p0', { type: 'play_mutirao' }, ctx)).toEqual({ ok: false, error: 'cordel_fresh' });
    s = act(s, 'p0', { type: 'play_chuva', resources: ['wood', 'brick'] }, ctx);
    expect(tryAct(s, 'p0', { type: 'play_atravessador', resource: 'wood' }, ctx)).toEqual({ ok: false, error: 'cordel_used' });
  });
});
```

- [ ] **Step 2–4:** ver falhar, implementar, passar (+ typecheck).
- [ ] **Step 5: Commit** `feat(shared): Mandacaru — Mutirão, Chuva no sertão e Atravessador`

---

### Task 8: prazos e ausentes (`auto.ts`)

**Files:**
- Create: `shared/src/games/mandacaru/auto.ts`
- Modify: `shared/src/games/mandacaru/rules.ts` (todas as ações aceitas passam por `settleMandacaru`)
- Test: `shared/test/mandacaru-auto.test.ts`

**Assinatura:**

```ts
/** Fecha prazos e joga pelos ausentes até não haver o que fazer. Devolve o MESMO objeto quando nada muda. */
export function settleMandacaru(state: MandacaruState, ctx: GameContext): MandacaruState;
```

**Comportamento** (laço de no máximo 1000 passos, como `settleCoup`; cada passo `settleOnce`):
- `away(p) = !ctx.active.includes(p)`; `late = turnEndsAt !== null && ctx.now >= turnEndsAt`.
- `setup`: se `away(turn)` ou `late`: sem casa → casa no canto de `houseSpots(.., true)` com maior soma de `pips` dos terrenos em volta (empate: `randomInt`); com casa → estrada sorteada de `roadSpots(.., house)`. Na primeira jogada automática por prazo do turno, diário `{ t: 'timeout', player }` (uma vez por vez: só quando `late`).
- `discard`: cada um em `discards` que está `away` ou com `now >= discardEndsAt` descarta cartas sorteadas (uma a uma, `randomInt` sobre a mão expandida).
- `roll` com `away(turn)` ou `late`: rola (mesmo caminho da ação).
- `carcara` com `away(turn)` ou `late`: terreno sorteado entre os ≠ atual que têm prédio de outro e nenhum seu; se nenhum, qualquer ≠ atual.
- `steal` com `away(turn)` ou `late`: vítima sorteada.
- `mutirao` com `away(turn)` ou `late`: estrada sorteada de `roadSpots`.
- `main` com `away(turn)` ou `late`: diário `timeout` se `late`; `end_turn` (limpa oferta).
- `over`/`lobby`: nada.
- Com `late`, só a fase `discard` espera o próprio prazo (o turno resolve o resto depois).

- [ ] **Step 1: Teste** (`shared/test/mandacaru-auto.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { settleMandacaru } from '../src/games/mandacaru/auto';
import { initialMandacaruState } from '../src/games/mandacaru/rules';
import { MANDACARU_DISCARD_MS, MANDACARU_TURN_MS } from '../src/games/mandacaru/types';
import { T0, act, ctxOf, deepFreeze, ids, res, table } from './mandacaru-helpers';

describe('Mandacaru: automático', () => {
  it('nada a fazer: devolve o mesmo objeto', () => {
    const s = deepFreeze(table());
    expect(settleMandacaru(s, ctxOf(ids(3)))).toBe(s);
    const lobby = deepFreeze(initialMandacaruState());
    expect(settleMandacaru(lobby, ctxOf(ids(3)))).toBe(lobby);
  });

  it('acabou o turno na fase principal: passa a vez e anota no diário', () => {
    const s = settleMandacaru(deepFreeze(table()), ctxOf(ids(3), { now: T0 + MANDACARU_TURN_MS }));
    expect(s.turn).toBe('p1');
    expect(s.log.some((e) => e.t === 'timeout' && e.player === 'p0')).toBe(true);
  });

  it('acabou o turno antes dos dados: rola e segue', () => {
    const s = settleMandacaru(deepFreeze(table({ phase: 'roll' })), ctxOf(ids(3), { now: T0 + MANDACARU_TURN_MS }));
    expect(s.diceCounts.reduce((a, b) => a + b, 0)).toBe(1);
    expect(s.turn).not.toBe('p0');
  });

  it('ausente na vez: rola e passa na hora', () => {
    const s = settleMandacaru(deepFreeze(table({ phase: 'roll' })), ctxOf(['p1', 'p2']));
    expect(s.turn).toBe('p1');
  });

  it('descarte: prazo vencido descarta sorteado', () => {
    const s0 = { ...table({ hands: { p1: { wood: 8 } } }), phase: 'discard' as const, discards: { p1: 4 }, discardEndsAt: T0 + MANDACARU_DISCARD_MS };
    expect(settleMandacaru(deepFreeze(s0), ctxOf(ids(3), { now: T0 + 10 }))).toBe(s0);
    const s = settleMandacaru(deepFreeze(s0), ctxOf(ids(3), { now: T0 + MANDACARU_DISCARD_MS }));
    expect(s.hands.p1!.res).toEqual(res({ wood: 4 }));
    expect(s.phase).toBe('carcara');
  });

  it('preparação de ausente: põe casa e estrada', () => {
    const s0 = act(initialMandacaruState(), 'p0', { type: 'start' }, ctxOf(ids(3)));
    const first = s0.turn!;
    const s = settleMandacaru(deepFreeze(s0), ctxOf(ids(3).filter((p) => p !== first)));
    expect(s.buildings.filter((b) => b?.owner === first)).toHaveLength(s.turn === first ? 2 : 1);
    expect(s.roads.filter((o) => o === first).length).toBeGreaterThanOrEqual(1);
  });

  it('todo mundo ausente: o jogo anda sem laço infinito', () => {
    const s0 = act(initialMandacaruState(), 'p0', { type: 'start' }, ctxOf(ids(3)));
    const s = settleMandacaru(deepFreeze(s0), ctxOf([]));
    expect(s.phase === 'over' || s.turns > 10).toBe(true);
  });
});
```

- [ ] **Step 2–4:** ver falhar, implementar, passar; rodar **todos** `npm test -w shared -- mandacaru` (as ações agora passam por `settleMandacaru`) + typecheck.
- [ ] **Step 5: Commit** `feat(shared): Mandacaru — prazos de 5 min e automático de quem está ausente`

---

### Task 9: visão, `can`, prazo e schema

**Files:**
- Create: `shared/src/games/mandacaru/view.ts`, `shared/src/games/mandacaru/schema.ts`
- Test: `shared/test/mandacaru-view.test.ts`, `shared/test/mandacaru-schema.test.ts`

**Assinaturas:**

```ts
// view.ts
export function mandacaruViewFor(state: MandacaruState, viewerId: string | null): MandacaruView;
/** O menor entre o fim do turno e o fim do descarte (null fora de partida). */
export function mandacaruNextDeadline(state: MandacaruState): number | null;
export const mandacaru: GameModule<MandacaruState, MandacaruAction, MandacaruView>; // id 'mandacaru', onPresenceChange: settleMandacaru

// schema.ts
export const mandacaruActionSchema: z.ZodType<MandacaruAction>; // discriminatedUnion com Assert de tipos como o do Cúpi
```

**Comportamento da visão:** copia o público (§2.9 da spec); `deckSize`; `seats` (pontos com `points(.., false)`, ou `true` em `over`; `resCount`, `cordelCount`, `knights`, `roadLength`, `piecesLeft`); `myRes`/`myCordeis`/`myPoints` só pra quem joga; `pointCards` só em `over`; `stolen` = `lastSteal` só pro ladrão e a vítima; `can`:
- `placeHouse`/`placeRoad`: na `setup`, sua vez, conforme `setup.house`.
- `roll`: fase `roll` e sua vez. `discard`: `discards[me] ?? 0`.
- `carcara`: fase `carcara`, sua vez: todos os terrenos ≠ atual. `steal`: fase `steal`, sua vez: as vítimas.
- `buildRoad`: fase `main` com dinheiro e peça → `roadSpots`; fase `mutirao` → `roadSpots`. `buildHouse`/`buildCity`: `main`, com dinheiro e peça.
- `buyCordel`: `main`, dinheiro, monte não vazio. `play`: cordéis velhos (sem `point`) se `!cordelPlayed`; Vaqueiro também na fase `roll`.
- `feira`: `main` e sua vez → `portRates`. `offer`: `main` e sua vez. `respond`: `main`, oferta aberta, você é outro jogador. `propose`: `main`, você é outro jogador. `endTurn`: `main` e sua vez.
- Fora da partida ou quem assiste: tudo vazio/false/0.

**Schema:** recursos como `z.object({ wood: n, brick: n, leather: n, beans: n, stone: n })` com `n = z.number().int().min(0).max(19)`; `vertex` 0..53, `edge` 0..71, `hex` 0..18; `with`/`from` `z.string().min(1).max(64)`; `count` 1..19 opcional; `offerId` inteiro ≥ 0.

- [ ] **Step 1: Teste da visão** (`shared/test/mandacaru-view.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { mandacaru, mandacaruNextDeadline, mandacaruViewFor } from '../src/games/mandacaru/view';
import { MANDACARU_DISCARD_MS, MANDACARU_TURN_MS } from '../src/games/mandacaru/types';
import { T0, corner, res, table } from './mandacaru-helpers';

describe('Mandacaru: visão', () => {
  const s = {
    ...table({ hands: { p0: { wood: 2 }, p1: { stone: 3 } }, cordeis: { p0: ['point'], p1: ['vaqueiro'] }, houses: { [corner(5, 0)]: 'p0' } }),
    lastSteal: { thief: 'p0', victim: 'p1', resource: 'stone' as const },
  };

  it('você vê suas cartas; dos outros, só quantas', () => {
    const v = mandacaruViewFor(s, 'p0');
    expect(v.myRes).toEqual(res({ wood: 2 }));
    expect(v.myCordeis).toEqual([{ kind: 'point', fresh: false }]);
    expect(v.myPoints).toBe(2);
    const p1 = v.seats.find((x) => x.id === 'p1')!;
    expect(p1).toMatchObject({ resCount: 3, cordelCount: 1 });
    expect(v.seats.find((x) => x.id === 'p0')!.points).toBe(1);
    expect(JSON.stringify(v)).not.toContain('vaqueiro');
    expect(v).not.toHaveProperty('deck');
    expect(v.deckSize).toBe(5);
  });

  it('quem assiste não vê mão nenhuma; o roubo só aparece pros dois', () => {
    const w = mandacaruViewFor(s, null);
    expect(w.myRes).toBeNull();
    expect(w.myCordeis).toEqual([]);
    expect(w.stolen).toBeNull();
    expect(mandacaruViewFor(s, 'p2').stolen).toBeNull();
    expect(mandacaruViewFor(s, 'p1').stolen).toEqual(s.lastSteal);
  });

  it('no fim, os Pontos aparecem', () => {
    const v = mandacaruViewFor({ ...s, phase: 'over', winner: 'p0' }, 'p2');
    expect(v.pointCards).toEqual({ p0: 1, p1: 0, p2: 0 });
    expect(v.seats.find((x) => x.id === 'p0')!.points).toBe(2);
  });

  it('can: só quem está na vez constrói; os outros respondem e propõem', () => {
    const me = mandacaruViewFor(s, 'p0').can;
    expect(me.endTurn).toBe(true);
    expect(me.offer).toBe(true);
    expect(me.feira).toEqual({ wood: 4, brick: 4, leather: 4, beans: 4, stone: 4 });
    const other = mandacaruViewFor(s, 'p1').can;
    expect(other.endTurn).toBe(false);
    expect(other.propose).toBe(true);
    expect(other.play).toEqual([]);
  });

  it('prazo: o menor entre turno e descarte', () => {
    expect(mandacaruNextDeadline(s)).toBe(T0 + MANDACARU_TURN_MS);
    expect(mandacaruNextDeadline({ ...s, phase: 'discard', discardEndsAt: T0 + MANDACARU_DISCARD_MS })).toBe(T0 + MANDACARU_DISCARD_MS);
    expect(mandacaruNextDeadline({ ...s, phase: 'over', turnEndsAt: null })).toBeNull();
    expect(mandacaru.id).toBe('mandacaru');
  });
});
```

- [ ] **Step 2: Teste do schema** (`shared/test/mandacaru-schema.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { mandacaruActionSchema } from '../src/games/mandacaru/schema';

const R = { wood: 1, brick: 0, leather: 0, beans: 0, stone: 0 };

describe('Mandacaru: schema das ações', () => {
  it('aceita as ações válidas', () => {
    for (const a of [
      { type: 'start' },
      { type: 'place_house', vertex: 53 },
      { type: 'place_road', edge: 71 },
      { type: 'discard', cards: R },
      { type: 'move_carcara', hex: 18 },
      { type: 'steal', from: 'abc' },
      { type: 'play_chuva', resources: ['wood', 'stone'] },
      { type: 'offer', give: R, want: { ...R, wood: 0, stone: 1 } },
      { type: 'respond', offerId: 3, accept: true },
      { type: 'close_deal', with: 'x', source: 'proposal' },
      { type: 'feira', give: 'wood', want: 'beans', count: 2 },
      { type: 'end_turn' },
    ]) {
      expect(mandacaruActionSchema.safeParse(a).success, JSON.stringify(a)).toBe(true);
    }
  });

  it('recusa lugar fora do tabuleiro, recurso inventado e números quebrados', () => {
    for (const a of [
      { type: 'place_house', vertex: 54 },
      { type: 'place_road', edge: -1 },
      { type: 'move_carcara', hex: 19 },
      { type: 'play_atravessador', resource: 'ouro' },
      { type: 'discard', cards: { ...R, wood: 1.5 } },
      { type: 'feira', give: 'wood', want: 'beans', count: 0 },
      { type: 'voar' },
    ]) {
      expect(mandacaruActionSchema.safeParse(a).success, JSON.stringify(a)).toBe(false);
    }
  });
});
```

- [ ] **Step 3–5:** ver falhar, implementar, passar (+ typecheck).
- [ ] **Step 6: Commit** `feat(shared): Mandacaru — visão com segredos, o que dá pra fazer, prazo e schema`

---

### Task 10: partidas sorteadas do começo ao fim

**Files:**
- Test: `shared/test/mandacaru-random.test.ts`

- [ ] **Step 1: Teste**

```ts
import { describe, expect, it } from 'vitest';
import { mulberry32, randomInt } from '../src/rng';
import { initialMandacaruState } from '../src/games/mandacaru/rules';
import { mandacaruViewFor } from '../src/games/mandacaru/view';
import { MANDACARU_BANK_EACH, MANDACARU_PIECES, RESOURCES, type MandacaruAction, type MandacaruState, type Resources } from '../src/games/mandacaru/types';
import { act, ctxOf, ids } from './mandacaru-helpers';

/** Uma ação válida sorteada pra `p`, a partir do `can` da visão dele (null = nada a fazer). */
function pick(s: MandacaruState, p: string, rand: () => number): MandacaruAction | null {
  const v = mandacaruViewFor(s, p);
  const c = v.can;
  const one = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)]!;
  if (c.placeHouse.length) return { type: 'place_house', vertex: one(c.placeHouse) };
  if (c.placeRoad.length) return { type: 'place_road', edge: one(c.placeRoad) };
  if (c.discard > 0) {
    const cards: Resources = { wood: 0, brick: 0, leather: 0, beans: 0, stone: 0 };
    const hand = RESOURCES.flatMap((r) => Array<typeof r>(v.myRes![r]).fill(r));
    for (let i = 0; i < c.discard; i++) cards[hand.splice(Math.floor(rand() * hand.length), 1)[0]!]++;
    return { type: 'discard', cards };
  }
  if (c.carcara.length) return { type: 'move_carcara', hex: one(c.carcara) };
  if (c.steal.length) return { type: 'steal', from: one(c.steal) };
  if (c.roll) return c.play.includes('vaqueiro') && rand() < 0.3 ? { type: 'play_vaqueiro' } : { type: 'roll' };
  if (s.phase === 'mutirao' && c.buildRoad.length) return { type: 'build_road', edge: one(c.buildRoad) };
  const options: MandacaruAction[] = [];
  if (c.buildCity.length) options.push({ type: 'build_city', vertex: one(c.buildCity) });
  if (c.buildHouse.length) options.push({ type: 'build_house', vertex: one(c.buildHouse) });
  if (c.buildRoad.length && rand() < 0.5) options.push({ type: 'build_road', edge: one(c.buildRoad) });
  if (c.buyCordel) options.push({ type: 'buy_cordel' });
  for (const k of c.play) {
    if (k === 'vaqueiro') options.push({ type: 'play_vaqueiro' });
    if (k === 'mutirao') options.push({ type: 'play_mutirao' });
    if (k === 'chuva') options.push({ type: 'play_chuva', resources: [one([...RESOURCES]), one([...RESOURCES])] });
    if (k === 'atravessador') options.push({ type: 'play_atravessador', resource: one([...RESOURCES]) });
  }
  for (const [give, rate] of Object.entries(c.feira)) {
    if (v.myRes![give as keyof Resources] >= rate!) options.push({ type: 'feira', give: give as keyof Resources, want: one(RESOURCES.filter((r) => r !== give)) });
  }
  if (options.length && rand() < 0.85) return one(options);
  return c.endTurn ? { type: 'end_turn' } : null;
}

function invariants(s: MandacaruState) {
  for (const r of RESOURCES) {
    const total = s.bank[r] + s.players.reduce((a, p) => a + s.hands[p]!.res[r], 0);
    expect(total).toBe(MANDACARU_BANK_EACH);
  }
  for (const p of s.players) {
    expect(s.roads.filter((o) => o === p).length).toBeLessThanOrEqual(MANDACARU_PIECES.road);
    expect(s.buildings.filter((b) => b?.owner === p && b.kind === 'house').length).toBeLessThanOrEqual(MANDACARU_PIECES.house);
    expect(s.buildings.filter((b) => b?.owner === p && b.kind === 'city').length).toBeLessThanOrEqual(MANDACARU_PIECES.city);
  }
}

describe('Mandacaru: partidas sorteadas', () => {
  for (const n of [3, 4]) {
    for (let seed = 1; seed <= 6; seed++) {
      it(`${n} jogadores, semente ${seed}: termina sem erro e sem sumir carta`, () => {
        const rand = mulberry32(seed * 101);
        let s = act(initialMandacaruState(), 'p0', { type: 'start' }, ctxOf(ids(n), { seed }));
        for (let step = 0; step < 6000 && s.phase !== 'over'; step++) {
          // descarte: qualquer um que deve; senão quem está na vez
          const who = Object.keys(s.discards)[0] ?? s.turn!;
          const a = pick(s, who, rand);
          if (a === null) throw new Error(`travou na fase ${s.phase}`);
          s = act(s, who, a, ctxOf(ids(n), { seed: randomInt(rand, 1e9) }));
          invariants(s);
        }
        expect(s.phase).toBe('over');
      });
    }
  }
});
```

> Se alguma semente não terminar em 6000 passos (jogo aleatório constrói mal), aumente o limite ou o peso de construir antes de mexer nas regras; só mexa nas regras se o `invariants` ou o `act` falharem.

- [ ] **Step 2: Rodar** `npm test -w shared -- mandacaru-random` → PASS. Se falhar, é bug de regra: corrija na task de origem (com teste novo que reproduza).
- [ ] **Step 3: Commit** `test(shared): Mandacaru — partidas sorteadas do começo ao fim`

---

### Task 11: Mandacaru no registro, na sala, no protocolo e no histórico (sem histórico ainda)

**Files:**
- Modify: `shared/src/games/registry.ts`, `shared/src/room.ts`, `shared/src/protocol.ts`, `shared/src/history.ts`, `shared/src/index.ts`, `server/src/index.ts`
- Test: `shared/test/room-games.test.ts`

- [ ] **Step 1: Teste** — em `shared/test/room-games.test.ts`: troque a expectativa da lista de jogos pra `['ito', 'dixit', 'pictures', 'kittens', 'coup', 'mandacaru']` e acrescente:

```ts
  it('Mandacaru registrado: 3 a 4, sem cursor, sem histórico ainda', () => {
    expect(GAMES.mandacaru).toMatchObject({ minPlayers: 3, maxPlayers: 4, liveCursors: false, recordsHistory: false });
    expect(isGameId('mandacaru')).toBe(true);
  });

  it('sala de Mandacaru: visão própria e alarme no fim do turno', () => {
    let room = createRoom('ABCD', 0, 'mandacaru');
    // siga o padrão de coupRoom(n) deste arquivo pra sentar 3 jogadores e começar
    // (join dos 3, depois applyRoomAction/`start` pelo host com rng e now = 10)
    // e então:
    // expect(isMandacaruRoomView(roomView(room, null))).toBe(true);
    // expect(nextAlarmAt(room, 10)).toBe(10 + MANDACARU_TURN_MS);
  });
```

> Escreva o segundo teste completo copiando o `coupRoom(n)` e o teste "alarme" do Cúpi no mesmo arquivo (mesmas funções `createRoom`, `joinRoom`/equivalente, `roomView`, `nextAlarmAt`, `tick`), trocando `'coup'` por `'mandacaru'`, 2 por 3 jogadores e `COUP_WINDOW_MS` por `MANDACARU_TURN_MS`.

- [ ] **Step 2: Implementar**
  - `registry.ts`: importe `mandacaru`, `mandacaruActionSchema`, os tipos e as constantes; `GAME_IDS` ganha `'mandacaru'` no fim; uniões `GameState`/`GameView`/`GameAction`; entrada `mandacaru: defineGame({ id: 'mandacaru', module: mandacaru, actionSchema: mandacaruActionSchema, minPlayers: MANDACARU_MIN_PLAYERS, maxPlayers: MANDACARU_MAX_PLAYERS, liveCursors: false /* cursor na mão entregaria o recurso */, recordsHistory: false /* histórico no M3 */ })`.
  - `room.ts`: `MandacaruRoomView`, `isMandacaruRoomView`, `mandacaruStateOf`, igual aos do Cúpi.
  - `protocol.ts`: novos códigos em `ERROR_CODES` (bloco `// Mandacaru`) e mensagens:
    - `bad_spot`: 'Não dá pra construir aí.'
    - `cannot_afford`: 'Faltam cartas pra isso.'
    - `no_pieces`: 'Acabaram essas peças.'
    - `bank_empty`: 'O banco não tem essas cartas.'
    - `deck_empty`: 'Acabou o monte de cordel.'
    - `cordel_used`: 'Você já jogou um cordel neste turno.'
    - `cordel_fresh`: 'Cordel comprado agora só vale no próximo turno.'
    - `no_cordel`: 'Você não tem esse cordel.'
    - `bad_trade`: 'Troca inválida.'
    - `stale_offer`: 'Essa oferta já mudou.'
    - `bad_discard`: 'Descarte o número certo de cartas.'
  - `history.ts`: o `switch` exaustivo de `pendingHistoryRecord` ganha `case 'mandacaru': return null;` (histórico no M3); se o tipo `HistoryResponse`/mapa por jogo exigir chave, siga o que foi feito pro `pictures` (sem histórico).
  - `index.ts`: exporte `types`, `board` (`geometry`, `pips`), `setup` (`randomLayout`), `rules` (`applyMandacaruAction`, `initialMandacaruState`), `auto` (`settleMandacaru`), `view` (`mandacaru`, `mandacaruViewFor`, `mandacaruNextDeadline`), `schema`, e de `build` o que a mesa vai usar (`houseSpots`, `roadSpots`, `citySpots`, `portRates`, `points`).
  - `server/src/index.ts`: o `switch` de `/history/:game` ganha `case 'mandacaru':` respondendo como o `pictures` (404 enquanto não há histórico).
- [ ] **Step 3: Rodar** `npm test -w shared` e `npm test -w server` → PASS; `npm run typecheck -w shared -w server` ok. O typecheck do `web` vai acusar `catalog.ts`/`GamePage.tsx` — a Task 12 corrige.
- [ ] **Step 4: Commit** `feat(shared): Mandacaru no registro, na sala e no protocolo`

---

### Task 12: Mandacaru na estante, "em breve"

**Files:**
- Modify: `web/src/games/catalog.ts`, `web/src/screens/GamePage.tsx`, `web/src/screens/shelf.css`, `web/index.html`
- Test: `web/test/catalog.test.ts`

- [ ] **Step 1: Teste** — em `web/test/catalog.test.ts`, depois do teste do Cúpi:

```ts
  it('Mandacaru aparece na estante, em breve e só no computador', () => {
    const entry = catalogEntry('mandacaru');
    expect(entry).toMatchObject({ name: 'Mandacaru', playable: false, hasHistory: false, players: '3 a 4 pessoas' });
    expect(entry?.mobile).toBeFalsy();
  });
```

- [ ] **Step 2: Implementar**
  - `catalog.ts` (`TEXT.mandacaru`):
    ```ts
    mandacaru: {
      name: 'Mandacaru',
      tagline: 'faça a caatinga florir',
      rules: [
        'Cada um começa com duas casas e duas estradas na caatinga.',
        'Na sua vez, role os dados: cada terreno com o número rende madeira, barro, couro, feijão ou pedra pra quem tem casa em volta.',
        'Troque com a galera ou na feira e construa estradas, casas, vilas e cordéis.',
        'Saiu 7, o Carcará ataca: trava um terreno e rouba uma carta. Quem chega a 10 pontos na própria vez vence.',
      ],
      playable: false,
      mobile: false,
    },
    ```
  - Comentário dos nomes de vitrine ganha "e o jogo de hexágonos como Mandacaru".
  - `GamePage.tsx`: o `switch` do histórico ganha `case 'mandacaru': return null;` (ou o que o `pictures` faz).
  - `shelf.css`: capa `.cover-mandacaru` no estilo D: `background: radial-gradient(ellipse at 50% -10%, rgba(255,214,120,.65), transparent 60%), linear-gradient(#f7e6c4, #ecc896); color: #4a2e1f;` título `b` em `400 44px/1 'Bree Serif', serif`, texto em `600 14px/1.25 'Mulish', system-ui, sans-serif`; `.cover-mandacaru.mini` com `'Bree Serif'` 22px; e o mesmo ajuste do `@media` que as outras capas têm.
  - `web/index.html`: acrescente `Bree Serif` e `Mulish:wght@600;800` ao link do Google Fonts existente (siga como o Cúpi incluiu Bebas Neue/Oswald).
- [ ] **Step 3: Rodar** `npm test -w web -- catalog` → PASS; `npm run typecheck` (todos) ok; `npm run build -w web` ok.
- [ ] **Step 4: Commit** `feat(web): Mandacaru na estante, em breve`

---

### Task 13: servidor joga uma sala de Mandacaru e docs

**Files:**
- Create: `server/test/mandacaru.test.ts`
- Modify: `README.md`, `CLAUDE.md`

- [ ] **Step 1: Teste** (`server/test/mandacaru.test.ts`)

```ts
import { SELF } from 'cloudflare:test';
import type { MandacaruRoomView } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { joined, newGameRoom } from './helpers';

const playing = (r: MandacaruRoomView) => r.game.phase === 'setup';

describe('Mandacaru no servidor', () => {
  it('POST /rooms { game: "mandacaru" } cria a sala', async () => {
    const code = await newGameRoom('mandacaru');
    const body = await (await SELF.fetch(`https://x/rooms/${code}`)).json();
    expect(body).toMatchObject({ exists: true, game: 'mandacaru', phase: 'lobby' });
  });

  it('começa com 3: todos veem o mesmo tabuleiro e só as próprias cartas', async () => {
    const code = await newGameRoom('mandacaru');
    const players = await joined(code, 3);
    players[0]!.client.send({ t: 'action', action: { type: 'start' } });
    const views = await Promise.all(players.map((p) => p.client.state<MandacaruRoomView>(playing)));
    for (const v of views) {
      expect(v.game.layout!.hexes).toHaveLength(19);
      expect(v.game.myRes).not.toBeNull();
      expect(v.game).not.toHaveProperty('deck');
    }
    expect(views[0]!.game.layout).toEqual(views[1]!.game.layout);
    const turn = views[0]!.game.turn;
    const me = views.find((v) => v.you === turn)!;
    expect(me.game.can.placeHouse.length).toBeGreaterThan(0);
  });

  it('casa fora do lugar volta erro em português', async () => {
    const code = await newGameRoom('mandacaru');
    const players = await joined(code, 3);
    players[0]!.client.send({ t: 'action', action: { type: 'start' } });
    const view = await players[0]!.client.state<MandacaruRoomView>(playing);
    const p = players.find((x) => x.id === view.game.turn)!;
    p.client.send({ t: 'action', action: { type: 'place_road', edge: 0 } });
    // siga o teste "jogar fora da vez volta erro em português" do server/test/coup.test.ts pra esperar a mensagem de erro
  });
});
```

> Complete o terceiro teste copiando como o `server/test/coup.test.ts` espera a mensagem de erro (a mensagem esperada é 'Agora não dá pra fazer isso.' — `bad_phase`, porque na preparação a casa vem antes da estrada).

- [ ] **Step 2: Docs**
  - `README.md`: na lista de jogos, "**Mandacaru** — jogo de hexágonos com tema caatinga (em breve: só as regras)".
  - `CLAUDE.md`: na tabela de jogos, linha `| **Mandacaru** (hexágonos, caatinga) | \`mandacaru\` | regras prontas (M1); mesa ainda não |`; na lista de ids internos que nunca mudam, acrescente `mandacaru`.
- [ ] **Step 3: Rodar** `npm test -w server -- mandacaru` → PASS.
- [ ] **Step 4: Commit** `test(server): sala de Mandacaru; docs`

---

### Task 14: conferência final

- [ ] `npm test` (todos os workspaces) → PASS.
- [ ] `npm run typecheck` → ok.
- [ ] `npm run build -w web` → ok.
- [ ] `git log --oneline origin/main..HEAD` mostra os commits do M1 em cima do protótipo e da spec.
- [ ] Não faça merge nem push.
