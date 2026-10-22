# Plano C4 do Cama-Leão: histórico de partidas

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** cada partida terminada de Cama-Leão (id `camelio`) é gravada uma vez só no D1 e aparece na aba
`#/camelio/historico`, no visual de circo: as partidas (com a linha do tempo dos lances que importam) e a galera
(vitórias e os títulos domador, sabotador, palhaço e Papai Noel).

**Arquitetura:** é o mesmo caminho do histórico do Tatubum (`kittens`), que é o modelo mais novo:
- uma função pura no `shared` monta o registro a partir da sala (`pendingCamelioRecord`) e entra no
  `pendingHistoryRecord`;
- o Durable Object guarda o pendente no mesmo `put` do estado e grava com `INSERT … ON CONFLICT DO NOTHING` numa
  tabela própria (`camelio_matches`, migração 0006);
- `GET /history/camelio` devolve 20 partidas por página, com as estatísticas da galera só na primeira;
- o site ganha `CamelioHistory` em `web/src/games/camelio/history/`.

Nenhuma regra do jogo muda: o estado já guarda `log`, `match`, `winners` e `endReason`.

**Tecnologias:** TypeScript, Vitest (shared, server com `@cloudflare/vitest-pool-workers`, web com Testing Library),
Cloudflare Worker + Durable Object + D1, React 19 + Vite, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-19-cama-leao-design.md` §6. Modelos no código:
- shared: `shared/src/games/kittens/record.ts` e `summary.ts`;
- servidor: `server/src/kittens-history-db.ts`, `kittens-history-page.ts` e `server/test/kittens-history-route.test.ts`;
- site: `web/src/games/kittens/history/*` e `web/test/kittens-history.test.tsx`;
- E2E: `e2e/tatubum-historico.spec.ts`.

**Branch:** `feat/camelio-historico`, saída da `feat/camelio` (PR #27, ainda aberto) com o `main` mesclado. O PR
deste plano é **empilhado** (base `feat/camelio`). Depois do merge do #27, a branch é rebaseada pro `main`.

---

## Decisões que refinam o spec

1. **Coluna `match_id`** (não `match_key`): o Cúpi e o Tatubum usam `match_id`. A chave anti-duplicata continua
   `UNIQUE (room_code, match_id)`, com `match_id = ${sala}-${runStartedAt}-${match}`.
2. **Jogadas, vencedores e placar apontam pra posição em `players`**, em vez de repetir o nome. Uma partida tem 70 a
   140 jogadas, então assim o JSON fica menor (as estatísticas leem até 5000 partidas). E nome repetido na sala não
   embaralha nada. O nome e a cor de cada pessoa ficam uma vez só, em `players`.
3. **Títulos com empate mostram todos os empatados.** Exemplo: "Ana e Beto, 3 vezes". Ninguém ganha título com zero.
4. **A galera mostra todo mundo que já jogou.** Ordem: mais vitórias, depois menos partidas, depois o nome. Não tem
   mínimo de partidas, porque os títulos do spec são absolutos ("mais vitórias", "mais estouros").
5. **Migração 0006**: é o próximo número livre no `main` hoje (0005 é a do Tatubum). Se o `main` ganhar uma 0006
   antes deste PR entrar, renumere a migração e o teste dela.

## Arquivos

| Arquivo | O que é |
|---|---|
| `shared/src/games/camelio/record.ts` (novo) | tipos do registro, `camelioMatchId`, `pendingCamelioRecord` |
| `shared/src/games/camelio/summary.ts` (novo) | `CamelioStats`, `summarizeCamelioHistory` |
| `shared/src/room.ts` | `camelioStateOf` |
| `shared/src/history.ts` | `CamelioHistoryResponse`, caso `camelio` em `HistoryResponses`, `PendingHistoryRecord` e `pendingHistoryRecord` |
| `shared/src/games/registry.ts` | `camelio.recordsHistory: true` |
| `shared/src/index.ts` | exporta `record` e `summary` do camelio |
| `shared/test/camelio-record.test.ts`, `camelio-summary.test.ts` (novos) | TDD do registro e das estatísticas |
| `server/migrations/0006_camelio_matches.sql` (nova) | só cria a tabela e o índice |
| `server/src/camelio-history-db.ts`, `camelio-history-page.ts` (novos) | insert, listagem e página |
| `server/src/room-do.ts`, `server/src/index.ts` | caso `camelio` no pendente e na rota |
| `server/test/migration-0006.test.ts`, `camelio-history-route.test.ts` (novos), `camelio.test.ts` | testes |
| `web/src/games/camelio/history/` (novo) | `CamelioHistory.tsx`, `useCamelioHistory.ts`, `camelio-history.css`, `texts.ts` |
| `web/src/screens/GamePage.tsx` | caso `camelio` mostra `<CamelioHistory />` |
| `web/test/camelio-history.test.tsx` (novo) | componentes |
| `e2e/camelio-historico.spec.ts` (novo) | partida por WebSocket → aparece na aba |
| `CLAUDE.md`, `README.md`, spec §6 | documentação |

Ordem: as tarefas 1 a 3 (shared) são em sequência. Depois, as 4 (servidor) e 5 (site) rodam em paralelo, porque não
mexem nos mesmos arquivos. A 6 (E2E e docs) vem por último.

Comandos (na raiz da worktree):
- `npx vitest run --root shared <arquivo>`;
- `npm test -w server`;
- `npm test -w web`;
- `npm run typecheck`.

---

### Tarefa 1: registro da partida (shared)

**Arquivos:**
- Criar: `shared/src/games/camelio/record.ts`
- Modificar: `shared/src/room.ts` (perto de `kittensStateOf`)
- Teste: `shared/test/camelio-record.test.ts`

- [ ] **Passo 1: `camelioStateOf` em `shared/src/room.ts`**

Acrescente o import de tipo `CamelioState` (junto do `CamelioView` que já está lá) e, logo depois de
`kittensStateOf`:

```ts
export function camelioStateOf(room: Room): CamelioState | null {
  return room.gameId === 'camelio' ? (room.game as CamelioState) : null;
}
```

- [ ] **Passo 2: escrever o teste que falha (`shared/test/camelio-record.test.ts`)**

```ts
import { describe, expect, it } from 'vitest';
import { camelioMatchId, pendingCamelioRecord } from '../src/games/camelio/record';
import type { CamelioPlay, CamelioState } from '../src/games/camelio/types';
import { PLAYER_COLORS } from '../src/players';
import { createRoom, joinRoom, type Room } from '../src/room';
import { C, playing } from './camelio-helpers';

const ANA = { name: 'Ana', color: PLAYER_COLORS[0] };
const BETO = { name: 'Beto', color: PLAYER_COLORS[1] };
const CAIO = { name: 'Caio', color: PLAYER_COLORS[2] };

/** Sala de Cama-Leão com Ana, Beto e Caio (p0…p2), já com o jogo no estado dado. */
function roomWith(game: CamelioState, names = ['Ana', 'Beto', 'Caio']): Room {
  let room = createRoom('CAMA', 0, 'camelio');
  names.forEach((name, i) => {
    const res = joinRoom(room, { token: `t${i}`, name, color: PLAYER_COLORS[i]! }, `p${i}`, 0);
    if (!res.ok) throw new Error(res.error);
    room = res.room;
  });
  return { ...room, runStartedAt: 500, game };
}

const play = (p: Partial<CamelioPlay>): CamelioPlay => ({
  by: 'p0',
  from: 'deck',
  to: 'p0',
  card: C.verde1,
  outcome: 'none',
  color: 'verde',
  sum: 1,
  ...p,
});

/** Fim por meta: Beto (p1) chegou a 3 cores; Ana deu o 5 do vermelho pra ele. */
function over(): CamelioState {
  return playing(3, {
    phase: 'over',
    match: 2,
    turn: null,
    table: { p0: [C.azul2], p1: [], p2: [C.verde1, C.verde3] },
    scored: { p0: [C.amarelo2, C.amarelo3], p1: [C.vermelho2, C.vermelho3, C.verde2, C.verde3, C.azul2, C.azul3], p2: [] },
    winners: ['p1'],
    endReason: 'target',
    log: [
      play({ by: 'p0', to: 'p1', from: 'open', card: C.vermelho3, color: 'vermelho', outcome: 'scored', sum: 5 }),
      play({ by: 'p2', to: 'p2', card: C.vermelho4, color: 'vermelho', outcome: 'bust', sum: 7 }),
      play({ by: 'p1', to: 'p0', card: C.amarelo3, color: 'amarelo', outcome: 'none', sum: 3 }),
    ],
  });
}

describe('registro da partida do Cama-Leão', () => {
  it('partida no meio ou no lobby não grava', () => {
    expect(pendingCamelioRecord(roomWith(playing(3)), 9000, 'x')).toBeNull();
    expect(pendingCamelioRecord(roomWith(playing(3, { phase: 'lobby', match: 0 })), 9000, 'x')).toBeNull();
  });

  it('partida terminada vira registro com pessoas, vencedores por posição, placar e jogadas', () => {
    const room = roomWith(over());
    const got = pendingCamelioRecord(room, 9000, 'id-1');
    expect(got?.key).toBe('CAMA-500-2');
    expect(got?.key).toBe(camelioMatchId(room, over()));
    const r = got!.record;
    expect(r).toMatchObject({ id: 'id-1', matchId: 'CAMA-500-2', roomCode: 'CAMA', playedAt: 9000, target: 3, endReason: 'target' });
    expect(r.players).toEqual([ANA, BETO, CAIO]);
    expect(r.winners).toEqual([1]);
    expect(r.final).toEqual([
      { colors: ['amarelo'], spheres: 2 },
      { colors: ['vermelho', 'verde', 'azul'], spheres: 0 },
      { colors: [], spheres: 4 },
    ]);
    expect(r.plays).toEqual([
      { by: 0, to: 1, from: 'open', card: { color: 'vermelho', spheres: 3, kind: 'normal' }, outcome: 'scored', sum: 5 },
      { by: 2, to: 2, from: 'deck', card: { color: 'vermelho', spheres: 4, kind: 'normal' }, outcome: 'bust', sum: 7 },
      { by: 1, to: 0, from: 'deck', card: { color: 'amarelo', spheres: 3, kind: 'normal' }, outcome: 'none', sum: 3 },
    ]);
  });

  it('carta bicolor guarda o tipo e a cor de verdade', () => {
    const s = { ...over(), log: [play({ card: C.bicVermelho3, color: 'vermelho', sum: 3 })] };
    expect(pendingCamelioRecord(roomWith(s), 1, 'x')!.record.plays[0]!.card).toEqual({ color: 'vermelho', spheres: 3, kind: 'bicolor' });
  });

  it('vitória dividida guarda os dois', () => {
    const s = { ...over(), winners: ['p0', 'p2'], endReason: 'deck' as const };
    expect(pendingCamelioRecord(roomWith(s), 1, 'x')!.record).toMatchObject({ winners: [0, 2], endReason: 'deck' });
  });

  it('partida já gravada (mesma chave) não grava de novo; a próxima partida grava', () => {
    const room = { ...roomWith(over()), recordedRevealKey: 'CAMA-500-2' };
    expect(pendingCamelioRecord(room, 1, 'x')).toBeNull();
    expect(pendingCamelioRecord({ ...room, game: { ...over(), match: 3 } }, 1, 'x')?.key).toBe('CAMA-500-3');
  });

  it('partida com bot não grava', () => {
    expect(pendingCamelioRecord(roomWith(over(), ['Ana', 'Bot Zé', 'Caio']), 1, 'x')).toBeNull();
  });

  it('jogador sem assento: não grava (defesa)', () => {
    const s = { ...over(), players: ['p0', 'p1', 'p9'] };
    expect(pendingCamelioRecord(roomWith(s), 1, 'x')).toBeNull();
  });
});
```

Confira os ids de `C` em `shared/test/camelio-helpers.ts`. `C.amarelo2 + C.amarelo3` são 5 esferas amarelas, então
"amarelo" é uma cor pontuada. `final.spheres` é `camelioSpheresInPlay(table, scored)`. Se algum id do teste não for
o que o comentário diz, ajuste o **teste** pelo `deck.ts`, nunca o baralho.

- [ ] **Passo 3: rodar e ver falhar**

Rode `npx vitest run --root shared test/camelio-record.test.ts`. Esperado: FAIL, porque `record.ts` não existe.

- [ ] **Passo 4: implementar `shared/src/games/camelio/record.ts`**

```ts
import { isBotName, type PlayerColor } from '../../players';
import { camelioStateOf, type Room } from '../../room';
import { camelioCard } from './deck';
import { camelioScoredColors, camelioSpheresInPlay } from './scoring';
import type { CamelioColor, CamelioEndReason, CamelioFrom, CamelioKind, CamelioOutcome, CamelioState } from './types';

/** Pessoa como estava na hora da partida (trocar de nome depois não mexe no passado). */
export interface CamelioPerson {
  name: string;
  color: PlayerColor;
}

/** A frente da carta, sem id (o histórico não depende do baralho de hoje). */
export interface CamelioRecordCard {
  color: CamelioColor;
  spheres: number;
  kind: CamelioKind;
}

/** Uma jogada gravada. `by` e `to` são posições em `players`. */
export interface CamelioRecordPlay {
  by: number;
  to: number;
  from: CamelioFrom;
  card: CamelioRecordCard;
  outcome: CamelioOutcome;
  /** Esferas da cor na mesa de `to` logo depois da carta. */
  sum: number;
}

/** Como cada um terminou: cores pontuadas e esferas na mesa (em cores não pontuadas, o desempate). */
export interface CamelioFinal {
  colors: CamelioColor[];
  spheres: number;
}

/** Uma partida terminada do Cama-Leão, como fica gravada no histórico. */
export interface CamelioMatchRecord {
  id: string;
  /** `${sala}-${início da sessão}-${partida}`: muda a cada "começar" e "jogar de novo". */
  matchId: string;
  roomCode: string;
  /** Quando a partida acabou. */
  playedAt: number;
  /** Pontos (cores) pra ganhar nessa partida. */
  target: number;
  endReason: CamelioEndReason;
  /** Quem jogou, na ordem dos assentos. */
  players: CamelioPerson[];
  /** Posições em `players` de quem ganhou (mais de uma = vitória dividida). */
  winners: number[];
  /** Placar final, na mesma ordem de `players`. */
  final: CamelioFinal[];
  /** Todas as jogadas, na ordem. */
  plays: CamelioRecordPlay[];
}

/** Id da partida: muda a cada partida (`match`) e a cada sessão que sai do lobby (`runStartedAt`). */
export function camelioMatchId(room: Room, state: CamelioState): string {
  return `${room.code}-${room.runStartedAt ?? 0}-${state.match}`;
}

/**
 * Registro a gravar se a sala do Cama-Leão terminou uma partida ainda não gravada (a chave é o id da partida). Partida
 * que volta pro lobby antes do fim não chega a `over`: não grava. Não olha `GAMES.camelio.recordsHistory`: esse portão
 * fica em `pendingHistoryRecord`.
 */
export function pendingCamelioRecord(room: Room, now: number, id: string): { key: string; record: CamelioMatchRecord } | null {
  const state = camelioStateOf(room);
  if (!state || state.phase !== 'over' || state.endReason === null) return null;
  const key = camelioMatchId(room, state);
  if (key === room.recordedRevealKey) return null;
  const people = state.players.flatMap((p) => {
    const seat = room.seats.find((s) => s.id === p);
    return seat ? [{ name: seat.name, color: seat.color }] : [];
  });
  // Defesa: jogador sem assento sumiria em silêncio do registro (e da checagem de bot); melhor não gravar.
  if (people.length !== state.players.length) return null;
  // Partida de teste com bot não suja o histórico (aberto a todos).
  if (people.some((p) => isBotName(p.name))) return null;
  const pos = new Map(state.players.map((p, i) => [p, i]));
  return {
    key,
    record: {
      id,
      matchId: key,
      roomCode: room.code,
      playedAt: now,
      target: state.target,
      endReason: state.endReason,
      players: people,
      winners: state.winners.flatMap((w) => (pos.has(w) ? [pos.get(w)!] : [])),
      final: state.players.map((p) => {
        const table = state.table[p] ?? [];
        const scored = state.scored[p] ?? [];
        return { colors: camelioScoredColors(scored), spheres: camelioSpheresInPlay(table, scored) };
      }),
      plays: state.log.map((x) => {
        const card = camelioCard(x.card);
        return {
          by: pos.get(x.by) ?? -1,
          to: pos.get(x.to) ?? -1,
          from: x.from,
          card: { color: card.color, spheres: card.spheres, kind: card.kind },
          outcome: x.outcome,
          sum: x.sum,
        };
      }),
    },
  };
}
```

`table` e `scored` vêm de um `Record` com chave do jogador. Se o lint/TS reclamar de `?? []` desnecessário, mantenha
assim mesmo: é defesa pra sala salva antes.

- [ ] **Passo 5: rodar e ver passar**

Rode `npx vitest run --root shared test/camelio-record.test.ts`. Esperado: PASS.

- [ ] **Passo 6: commit**

```bash
git add shared/src/games/camelio/record.ts shared/src/room.ts shared/test/camelio-record.test.ts
git commit -m "feat(camelio): registro da partida pro histórico"
```

---

### Tarefa 2: estatísticas da galera (shared)

**Arquivos:**
- Criar: `shared/src/games/camelio/summary.ts`
- Teste: `shared/test/camelio-summary.test.ts`

Regras do spec §6.2 (com as decisões 3 e 4 acima):
- **galera**: todo mundo que jogou, com `wins` e `matches`; ordem: `wins` desc, `matches` asc, nome (`pt-BR`). Vitória
  dividida conta 1 vitória pra cada um.
- **domador**: maior `wins`;
- **sabotador**: jogadas com `by !== to` e `outcome` `bust` ou `lost`, contadas pra quem deu (`by`);
- **palhaço**: jogadas com `by === to` e `bust` ou `lost`, contadas pra `by`;
- **Papai Noel**: jogadas com `by !== to` e `scored`, contadas pra `by`.

Título = todos os empatados no máximo, em ordem alfabética; `null` se o máximo é 0. Pessoas são identificadas pelo nome
(como no Tatubum), com a cor da partida mais recente em que apareceram.

- [ ] **Passo 1: escrever o teste que falha (`shared/test/camelio-summary.test.ts`)**

```ts
import { describe, expect, it } from 'vitest';
import type { CamelioMatchRecord, CamelioRecordPlay } from '../src/games/camelio/record';
import { summarizeCamelioHistory } from '../src/games/camelio/summary';
import { PLAYER_COLORS } from '../src/players';

const ANA = { name: 'Ana', color: PLAYER_COLORS[0] };
const BETO = { name: 'Beto', color: PLAYER_COLORS[1] };
const CAIO = { name: 'Caio', color: PLAYER_COLORS[2] };

const p = (by: number, to: number, outcome: CamelioRecordPlay['outcome']): CamelioRecordPlay => ({
  by,
  to,
  from: 'deck',
  card: { color: 'verde', spheres: 2, kind: 'normal' },
  outcome,
  sum: 5,
});

function match(i: number, players: CamelioMatchRecord['players'], winners: number[], plays: CamelioRecordPlay[] = []): CamelioMatchRecord {
  return {
    id: `m${i}`,
    matchId: `R-1-${i}`,
    roomCode: 'R',
    playedAt: 1000 + i,
    target: 3,
    endReason: 'target',
    players,
    winners,
    final: players.map(() => ({ colors: [], spheres: 0 })),
    plays,
  };
}

describe('estatísticas da galera do Cama-Leão', () => {
  it('sem partidas: galera vazia e nenhum título', () => {
    expect(summarizeCamelioHistory([])).toEqual({ galera: [], domador: null, sabotador: null, palhaco: null, papaiNoel: null });
  });

  it('galera: vitórias e partidas de todo mundo, por vitórias, depois menos partidas, depois nome', () => {
    const s = summarizeCamelioHistory([
      match(1, [ANA, BETO], [0]),
      match(2, [ANA, BETO, CAIO], [2]),
      match(3, [ANA, BETO], [0, 1]), // dividida: 1 pra cada
    ]);
    expect(s.galera).toEqual([
      { ...ANA, wins: 2, matches: 3 },
      { ...CAIO, wins: 1, matches: 1 },
      { ...BETO, wins: 1, matches: 3 },
    ]);
    expect(s.domador).toEqual({ holders: [ANA], count: 2 });
  });

  it('sabotador, palhaço e Papai Noel saem das jogadas', () => {
    const s = summarizeCamelioHistory([
      match(1, [ANA, BETO, CAIO], [1], [
        p(0, 1, 'bust'), // Ana sabota Beto
        p(0, 2, 'lost'), // Ana sabota Caio
        p(1, 1, 'bust'), // Beto palhaço
        p(2, 2, 'lost'), // Caio palhaço
        p(2, 2, 'bust'), // Caio palhaço de novo
        p(1, 0, 'scored'), // Beto Papai Noel
        p(0, 0, 'scored'), // fechar na própria mesa não é presente
        p(2, 0, 'none'),
      ]),
    ]);
    expect(s.sabotador).toEqual({ holders: [ANA], count: 2 });
    expect(s.palhaco).toEqual({ holders: [CAIO], count: 2 });
    expect(s.papaiNoel).toEqual({ holders: [BETO], count: 1 });
  });

  it('empate no título mostra todos, em ordem alfabética', () => {
    const s = summarizeCamelioHistory([match(1, [BETO, ANA], [0, 1], [p(0, 1, 'scored'), p(1, 0, 'scored')])]);
    expect(s.domador).toEqual({ holders: [ANA, BETO], count: 1 });
    expect(s.papaiNoel).toEqual({ holders: [ANA, BETO], count: 1 });
  });

  it('a cor é a da partida mais recente', () => {
    const anaNova = { name: 'Ana', color: PLAYER_COLORS[3] };
    const s = summarizeCamelioHistory([match(2, [anaNova, BETO], [0]), match(1, [ANA, BETO], [0])]);
    expect(s.galera[0]).toEqual({ ...anaNova, wins: 2, matches: 2 });
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Rode `npx vitest run --root shared test/camelio-summary.test.ts`. Esperado: FAIL, porque o módulo não existe.

- [ ] **Passo 3: implementar `shared/src/games/camelio/summary.ts`**

```ts
import type { PlayerColor } from '../../players';
import type { CamelioMatchRecord, CamelioPerson } from './record';

/** Uma pessoa na galera: vitórias (dividida conta pra cada um) em quantas partidas. */
export interface CamelioGaleraEntry {
  name: string;
  color: PlayerColor;
  wins: number;
  matches: number;
}

/** Quem tem o título (todos os empatados no máximo, em ordem alfabética) e quantas vezes. */
export interface CamelioTitle {
  holders: CamelioPerson[];
  count: number;
}

/** Estatísticas da galera (só na primeira página do histórico). */
export interface CamelioStats {
  galera: CamelioGaleraEntry[];
  /** Mais vitórias. */
  domador: CamelioTitle | null;
  /** Mais estouros ou pontos perdidos causados nos outros (`by != to`, `bust`/`lost`). */
  sabotador: CamelioTitle | null;
  /** Mais estouros ou pontos perdidos na própria mesa (`by == to`, `bust`/`lost`). */
  palhaco: CamelioTitle | null;
  /** Mais vezes deu 5 de bandeja pros outros (`by != to`, `scored`). */
  papaiNoel: CamelioTitle | null;
}

interface Tally {
  name: string;
  color: PlayerColor;
  matches: number;
  wins: number;
  sabotador: number;
  palhaco: number;
  papaiNoel: number;
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'pt-BR');

function title(tallies: readonly Tally[], count: (t: Tally) => number): CamelioTitle | null {
  const max = Math.max(0, ...tallies.map(count));
  if (max === 0) return null;
  const holders = tallies
    .filter((t) => count(t) === max)
    .sort(byName)
    .map((t) => ({ name: t.name, color: t.color }));
  return { holders, count: max };
}

/** A galera e os quatro títulos. Pessoas pelo nome, com a cor da partida mais recente em que apareceram. */
export function summarizeCamelioHistory(matches: readonly CamelioMatchRecord[]): CamelioStats {
  const ordered = [...matches].sort((a, b) => a.playedAt - b.playedAt);
  const tallies = new Map<string, Tally>();
  const tallyOf = (p: CamelioPerson): Tally => {
    const t = tallies.get(p.name) ?? { name: p.name, color: p.color, matches: 0, wins: 0, sabotador: 0, palhaco: 0, papaiNoel: 0 };
    t.color = p.color;
    tallies.set(p.name, t);
    return t;
  };
  for (const m of ordered) {
    // Mesmo nome duas vezes na partida (não deveria acontecer): conta uma partida só.
    const seen = new Set<string>();
    for (const p of m.players) {
      const t = tallyOf(p);
      if (!seen.has(p.name)) t.matches++;
      seen.add(p.name);
    }
    for (const w of new Set(m.winners)) {
      const who = m.players[w];
      if (who) tallyOf(who).wins++;
    }
    for (const x of m.plays) {
      const who = m.players[x.by];
      if (!who) continue;
      const bad = x.outcome === 'bust' || x.outcome === 'lost';
      if (x.by !== x.to && bad) tallyOf(who).sabotador++;
      else if (x.by === x.to && bad) tallyOf(who).palhaco++;
      else if (x.by !== x.to && x.outcome === 'scored') tallyOf(who).papaiNoel++;
    }
  }
  const all = [...tallies.values()];
  return {
    galera: all
      .map((t) => ({ name: t.name, color: t.color, wins: t.wins, matches: t.matches }))
      .sort((a, b) => b.wins - a.wins || a.matches - b.matches || byName(a, b)),
    domador: title(all, (t) => t.wins),
    sabotador: title(all, (t) => t.sabotador),
    palhaco: title(all, (t) => t.palhaco),
    papaiNoel: title(all, (t) => t.papaiNoel),
  };
}
```

- [ ] **Passo 4: rodar e ver passar**

Rode `npx vitest run --root shared test/camelio-summary.test.ts`. Esperado: PASS.

- [ ] **Passo 5: commit**

```bash
git add shared/src/games/camelio/summary.ts shared/test/camelio-summary.test.ts
git commit -m "feat(camelio): estatísticas da galera (domador, sabotador, palhaço, Papai Noel)"
```

---

### Tarefa 3: ligar no histórico e no registro (shared)

**Arquivos:**
- Modificar: `shared/src/history.ts`, `shared/src/games/registry.ts`, `shared/src/index.ts`
- Testes: `shared/test/camelio-record.test.ts` (acrescentar), `shared/test/registry-history.test.ts` e
  `shared/test/history.test.ts` (só se algum teste afirmar que o camelio não grava)

- [ ] **Passo 1: teste do portão (acrescente em `camelio-record.test.ts`)**

```ts
import { pendingHistoryRecord } from '../src/history';
import { GAMES } from '../src/games/registry';

describe('pendingHistoryRecord no Cama-Leão', () => {
  it('o Cama-Leão grava histórico e o pendente vem marcado com o jogo', () => {
    expect(GAMES.camelio.recordsHistory).toBe(true);
    const got = pendingHistoryRecord(roomWith(over()), 9000, 'id-1');
    expect(got).toMatchObject({ game: 'camelio', key: 'CAMA-500-2', record: { id: 'id-1', winners: [1] } });
  });
});
```

Rode e veja falhar (`recordsHistory` ainda é `false`).

- [ ] **Passo 2: `shared/src/games/registry.ts`**

No `camelio: defineGame({ … })`, troque `recordsHistory: false` por `recordsHistory: true`.

- [ ] **Passo 3: `shared/src/history.ts`**

Acrescente nos imports:

```ts
import { pendingCamelioRecord, type CamelioMatchRecord } from './games/camelio/record';
import type { CamelioStats } from './games/camelio/summary';
```

Depois de `KittensHistoryResponse`:

```ts
/** Resposta de `GET /history/camelio`: 20 partidas por página, da mais nova pra mais velha; estatísticas só na primeira. */
export interface CamelioHistoryResponse {
  game: 'camelio';
  matches: CamelioMatchRecord[];
  /** Só na primeira página (sem `before`); nas seguintes vem `null`. */
  stats: CamelioStats | null;
  /** Fim da última partida da página (exclusivo na próxima), ou null se acabou. */
  nextBefore: number | null;
}
```

Em `HistoryResponses`, troque as duas linhas do camelio (o comentário "ainda não grava" e o `camelio: never;`) por
`camelio: CamelioHistoryResponse;`.

Em `PendingHistoryRecord`, acrescente `| { game: 'camelio'; key: string; record: CamelioMatchRecord }`.

Em `pendingHistoryRecord`, troque o `case 'camelio': return null; // …` por:

```ts
    case 'camelio': {
      const pending = pendingCamelioRecord(room, now, id);
      return pending ? { game: 'camelio', ...pending } : null;
    }
```

- [ ] **Passo 4: `shared/src/index.ts`**

Logo depois das linhas do camelio que já existem:

```ts
export * from './games/camelio/record';
export * from './games/camelio/summary';
```

- [ ] **Passo 5: rodar tudo do shared e o typecheck**

Rode `npx vitest run --root shared` e depois `npm run typecheck -w shared`. Esperado: tudo verde.

Se algum teste de `registry-history.test.ts` ou `history.test.ts` afirmar que o camelio não grava, atualize-o pro
comportamento novo (grava). Não apague testes dos outros jogos.

O `npm run typecheck` da raiz vai acusar `server/src/index.ts` (o `throw` do camelio continua compilando, mas o tipo da
resposta mudou) e talvez o `room-do.ts`. Isso é a Tarefa 4: não mexa no servidor aqui.

- [ ] **Passo 6: commit**

```bash
git add shared/src/history.ts shared/src/games/registry.ts shared/src/index.ts shared/test/
git commit -m "feat(camelio): Cama-Leão grava histórico (pendingHistoryRecord e resposta da rota)"
```

---

### Tarefa 4: servidor (migração, banco, rota) — pode rodar em paralelo com a 5

**Arquivos:**
- Criar: `server/migrations/0006_camelio_matches.sql`, `server/src/camelio-history-db.ts`,
  `server/src/camelio-history-page.ts`
- Modificar: `server/src/room-do.ts`, `server/src/index.ts`, `server/test/camelio.test.ts`
- Testes: `server/test/migration-0006.test.ts`, `server/test/camelio-history-route.test.ts`

- [ ] **Passo 1: migração `server/migrations/0006_camelio_matches.sql`**

```sql
-- Histórico do Cama-Leão: tabela própria; as dos outros jogos não mudam.
-- Só cria coisas, então é segura para aplicar sozinha na publicação.
CREATE TABLE IF NOT EXISTS camelio_matches (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  room_code TEXT NOT NULL,
  played_at INTEGER NOT NULL,
  -- o CamelioMatchRecord inteiro; as colunas acima servem para filtrar e ordenar.
  record_json TEXT NOT NULL,
  -- a mesma partida gravada de novo vira no-op.
  UNIQUE (room_code, match_id)
);

CREATE INDEX IF NOT EXISTS camelio_matches_played ON camelio_matches (played_at DESC);
```

- [ ] **Passo 2: teste da migração (`server/test/migration-0006.test.ts`)**

Copie `server/test/migration-0005.test.ts` e troque:
- `TEST_MIGRATIONS[4]` → `[5]`, `/^0005/` → `/^0006/`;
- `kittens_matches` → `camelio_matches`, `kittens_matches_played` → `camelio_matches_played`;
- o código de sala `MGR5` → `MGR6` (e `'MGR5-1-1'` → `'MGR6-1-1'`, ids `mgr6-a`/`mgr6-b`);
- o `not.toMatch` passa a ser `/dixit_rounds|coup_matches|kittens_matches/`;
- o último teste confere que `kittens_matches` continua com as mesmas 5 colunas (título "a tabela do Tatubum
  continua igual").

Rode `npm test -w server -- migration-0006`. Esperado: PASS, porque o pool de testes aplica todas as migrações da
pasta. Se não passar, veja como o `TEST_MIGRATIONS` é montado em `server/vitest.config.*`.

- [ ] **Passo 3: `server/src/camelio-history-db.ts` e `camelio-history-page.ts`**

```ts
// server/src/camelio-history-db.ts
import type { CamelioMatchRecord } from '@cartolina/shared';
import { STATS_ROUNDS_CAP } from './history-db';

/** Idempotente por (sala, partida): gravar a mesma partida de novo não duplica. */
export async function insertCamelioMatch(db: D1Database, r: CamelioMatchRecord): Promise<void> {
  await db
    .prepare(
      `INSERT INTO camelio_matches (id, match_id, room_code, played_at, record_json)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (room_code, match_id) DO NOTHING`,
    )
    .bind(r.id, r.matchId, r.roomCode, r.playedAt, JSON.stringify(r))
    .run();
}

/**
 * Partidas mais recentes primeiro (pelo fim); `before` pagina por esse fim (exclusivo). Mesma limitação do Tatubum: duas
 * partidas que terminam no mesmo ms bem na divisa de uma página fazem a segunda ser pulada (improvável).
 */
export async function listCamelioMatches(db: D1Database, before: number | null, limit: number): Promise<CamelioMatchRecord[]> {
  const order = 'ORDER BY played_at DESC, id DESC LIMIT ?';
  const stmt =
    before === null
      ? db.prepare(`SELECT record_json FROM camelio_matches ${order}`).bind(limit)
      : db.prepare(`SELECT record_json FROM camelio_matches WHERE played_at < ? ${order}`).bind(before, limit);
  const { results } = await stmt.all<{ record_json: string }>();
  return results.map((r) => JSON.parse(r.record_json) as CamelioMatchRecord);
}

/** As partidas mais recentes (até `cap`), pras estatísticas da galera. */
export async function allCamelioMatches(db: D1Database, cap = STATS_ROUNDS_CAP): Promise<CamelioMatchRecord[]> {
  return listCamelioMatches(db, null, cap);
}
```

```ts
// server/src/camelio-history-page.ts
import { summarizeCamelioHistory, type CamelioHistoryResponse } from '@cartolina/shared';
import { allCamelioMatches, listCamelioMatches } from './camelio-history-db';
import { HISTORY_PAGE_SIZE } from './history-db';

/** Uma página do histórico do Cama-Leão: 20 partidas, da mais nova pra mais velha; estatísticas só na primeira. */
export async function camelioHistoryPage(db: D1Database, before: number | null): Promise<CamelioHistoryResponse> {
  // Uma a mais que a página só para saber se existe próxima.
  const rows = await listCamelioMatches(db, before, HISTORY_PAGE_SIZE + 1);
  const matches = rows.slice(0, HISTORY_PAGE_SIZE);
  return {
    game: 'camelio',
    matches,
    // Lê até STATS_ROUNDS_CAP partidas: caro demais para repetir a cada "carregar mais".
    stats: before === null ? summarizeCamelioHistory(await allCamelioMatches(db)) : null,
    nextBefore: rows.length > HISTORY_PAGE_SIZE ? matches[matches.length - 1]!.playedAt : null,
  };
}
```

- [ ] **Passo 4: `server/src/room-do.ts`**

- importe `type CamelioMatchRecord` de `@cartolina/shared` e `insertCamelioMatch` de `./camelio-history-db`;
- em `PendingRound`, acrescente `| { game: 'camelio'; key: string; record: CamelioMatchRecord }`;
- em `insertPending`, antes do `else` final, acrescente
  `else if (round.game === 'camelio') await insertCamelioMatch(db, round.record);`;
- atualize o comentário de `PendingRound` ("no Cúpi e no Tatubum" → "no Cúpi, no Tatubum e no Cama-Leão").

- [ ] **Passo 5: `server/src/index.ts`**

Importe `camelioHistoryPage` e troque o `case 'camelio':` do `historyPageOf` (o `throw`) por:

```ts
    case 'camelio':
      return camelioHistoryPage(env.DB, before);
```

- [ ] **Passo 6: `server/test/camelio.test.ts`**

O teste "o histórico do Cama-Leão ainda não existe (vem no Plano C4)" passa a ser:

```ts
  it('GET /history/camelio responde (o Cama-Leão grava histórico)', async () => {
    const res = await SELF.fetch('https://x/history/camelio');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { game: string }).game).toBe('camelio');
  });
```

- [ ] **Passo 7: `server/test/camelio-history-route.test.ts`**

Siga `server/test/kittens-history-route.test.ts` (mesmos `rowsOf`, `waitForRows` e `pendingCount`, trocando a tabela
pra `camelio_matches`). Os testes são:

1. `GAMES.camelio.recordsHistory` é `true`.
2. **Partida terminada grava uma vez só, esvazia a fila do DO e aparece em `GET /history/camelio`.** Use a mesma
   partida de `camelio.test.ts`: o host acompanha o estado e quem tem a vez faz `play { from: 'deck', to: si mesmo }`,
   até `phase === 'over'` (no máximo 200 jogadas). Depois confira:
   - `waitForRows` → 1 linha, com `match_id` casando `^${code}-\d+-1$`;
   - fecha o WebSocket de um jogador, espera 200 ms e continua com 1 linha;
   - a fila do DO fica vazia;
   - `GET /history/camelio` → 200, `Cache-Control: no-cache`, `game: 'camelio'`, `stats` não nulo;
   - o registro lido direto do D1 tem `players.map(name)` `['P0','P1']`;
   - `plays.length` é o `playCount` final da view;
   - todas as jogadas têm `by === to` (cada um jogou pra si);
   - `winners` traz posições válidas e não fica vazio;
   - `endReason` é `'target'` ou `'deck'`.
3. **"Jogar de novo" grava a segunda partida:** depois de `again`, joga até o fim de novo; agora são 2 linhas (`-1` e
   `-2`). Se isso deixar o teste 2 lento demais (mais de 20 s), junte os dois num teste só.
4. **Partida com bot não grava.** Monte o registro por `pendingHistoryRecord` direto, não pelo servidor: os bots só
   existem no site. Se não for simples, pule este, porque o shared já cobre.
5. `before` inválido dá 400 (`{ error: 'bad_before' }`).
6. **Paginação:** insere 21 registros com `insertCamelioMatch` (sala `PGC6`, `playedAt = base + i`, com
   `base = Date.now() + 10_000_000`). Confira:
   - a página 1 tem 20, `matches[0].id === 'pgc6-21'`, `nextBefore === base + 2`;
   - `stats.domador` traz `{ holders: [A], count: 21 }`, com A vencendo todas;
   - a página 2 traz `pgc6-1` e `stats` nulo;
   - no `finally`, apaga as linhas da sala `PGC6`.
7. **A mesma partida gravada de novo não duplica** (sala `DUP6`).

Pra montar um `CamelioMatchRecord` de teste, use:

```ts
function record(code: string, i: number, playedAt: number): CamelioMatchRecord {
  return {
    id: `${code.toLowerCase()}-${i}`,
    matchId: `${code}-1-${i}`,
    roomCode: code,
    playedAt,
    target: 4,
    endReason: 'target',
    players: [A, B],
    winners: [0],
    final: [
      { colors: ['verde', 'amarelo', 'laranja', 'vermelho'], spheres: 0 },
      { colors: [], spheres: 3 },
    ],
    plays: [{ by: 1, to: 0, from: 'deck', card: { color: 'verde', spheres: 2, kind: 'normal' }, outcome: 'scored', sum: 5 }],
  };
}
```

- [ ] **Passo 8: rodar**

Rode `npm test -w server` e `npm run typecheck`. Esperado: tudo verde.

- [ ] **Passo 9: commit**

```bash
git add server/
git commit -m "feat(server): histórico do Cama-Leão (migração 0006, gravação e GET /history/camelio)"
```

---

### Tarefa 5: a aba do histórico no site (visual de circo) — pode rodar em paralelo com a 4

**Arquivos:**
- Criar: `web/src/games/camelio/history/useCamelioHistory.ts`, `CamelioHistory.tsx`, `camelio-history.css`, `texts.ts`
- Modificar: `web/src/screens/GamePage.tsx`
- Teste: `web/test/camelio-history.test.tsx`

**Identidade visual (circo, como a mesa em `web/src/games/camelio/camelio.css`):**
- creme `#f7efe0`, lona `#f3dcd2`, vermelho `#c8372d` / `#9e2a22`, azul-marinho `#1f2a4a`;
- fonte Fredoka no texto e Rye nos títulos (as duas já carregam em `web/index.html`; confira o nome exato da família lá
  e em `camelio.css`);
- topo do painel com **lona listrada** (`repeating-linear-gradient` vermelho/creme) e uma barra de bandeirinhas
  (triângulos com `clip-path` ou `conic-gradient`) logo abaixo;
- cartões das partidas em creme com borda azul-marinho;
- títulos da galera como "cartazes" (ingressos) com borda vermelha serrilhada (`radial-gradient` nas bordas, ou
  `border: dashed` se ficar mais limpo);
- cores dos jogadores pelo `Critter` (`web/src/screens/Critter.tsx`); cores das esferas por `HEX` em
  `web/src/games/camelio/cardArt.ts`.

Tudo escopado em `.cl-history`, com classes `cl-hx-*`. A largura acompanha os outros históricos
(`width: min(760px, 100%)`). Não use `position: fixed` nem mexa no CSS global.

- [ ] **Passo 1: `texts.ts` (textos puros, fáceis de testar)**

```ts
import type { CamelioMatchRecord, CamelioRecordPlay } from '@cartolina/shared';

/** "Ana", "Ana e Beto", "Ana, Beto e Caio". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

export const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** "Ana venceu" ou "Ana e Beto dividiram a vitória". */
export function winnersText(m: CamelioMatchRecord): string {
  const names = m.winners.map((i) => m.players[i]?.name ?? '?');
  return names.length > 1 ? `${joinNames(names)} dividiram a vitória` : `${names[0] ?? 'ninguém'} venceu`;
}

/** "chegou a 3 cores" ou "o monte acabou". */
export function reasonText(m: CamelioMatchRecord): string {
  return m.endReason === 'target' ? `chegou a ${m.target} cores` : 'o monte acabou';
}

/** Só os lances que importam: fechou, estourou, perdeu o ponto. */
export const keyPlays = (m: CamelioMatchRecord): { n: number; play: CamelioRecordPlay }[] =>
  m.plays.flatMap((play, i) => (play.outcome === 'none' ? [] : [{ n: i + 1, play }]));

/** O que aconteceu, do ponto de vista de quem recebeu: "Beto fechou o vermelho", "Caio estourou o azul (7)". */
export function outcomeText(m: CamelioMatchRecord, play: CamelioRecordPlay): string {
  const to = m.players[play.to]?.name ?? '?';
  const color = play.card.color;
  if (play.outcome === 'scored') return `${to} fechou o ${color}`;
  if (play.outcome === 'bust') return `${to} estourou o ${color} (${play.sum})`;
  return `${to} perdeu o ponto do ${color} (${play.sum})`;
}

/** Quem deu pra quem: "Ana deu pra Beto" ou "Ana ficou com a carta". */
export function givenText(m: CamelioMatchRecord, play: CamelioRecordPlay): string {
  const by = m.players[play.by]?.name ?? '?';
  if (play.by === play.to) return `${by} ficou com a carta`;
  return `${by} deu pra ${m.players[play.to]?.name ?? '?'}`;
}
```

- [ ] **Passo 2: `useCamelioHistory.ts`**

Copie `web/src/games/kittens/history/useKittensHistory.ts` e troque:
- `KittensHistoryResponse` → `CamelioHistoryResponse`;
- `'kittens'` → `'camelio'`;
- "Tatubum" → "Cama-Leão" nos comentários;
- o nome do hook e da interface.

A lógica (geração, trava do "carregar mais", junta sem repetir, mantém `stats` da primeira página) fica igual.

- [ ] **Passo 3: `CamelioHistory.tsx`**

Estrutura (mesmos estados do `KittensHistory`: falha com "tentar de novo", `carregando…`, `null` = "Esse jogo ainda
não tem histórico.", vazio):

```
<div className="cl-history">
  (vazio) <section className="cl-hx-empty"><h2>Nenhuma partida de Cama-Leão ainda.</h2>
          <p>O picadeiro está vazio. Joguem uma e ela aparece aqui.</p></section>
  (com partidas)
  <section className="cl-hx-galera" aria-labelledby=…><h2>a galera</h2>
    <div className="cl-hx-titles">   ← 4 cartazes, cada um <section aria-labelledby> com <h3>
      domador     · "mais vitórias"                          · holders + plural(count,'vitória','vitórias')
      sabotador   · "mais estouros causados nos outros"      · holders + plural(count,'vez','vezes')
      palhaço     · "mais estouros na própria mesa"          · holders + plural(count,'vez','vezes')
      Papai Noel  · "mais 5 de bandeja pros outros"          · holders + plural(count,'vez','vezes')
      (título null → <p className="cl-hx-muted">ninguém ainda</p>)
      holders: Critter de cada um + joinNames(nomes)
    </div>
    <ol className="cl-hx-wins" aria-label="vitórias">  ← a galera inteira
      <li> Critter · <b>nome</b> · `${plural(wins,'vitória','vitórias')} em ${plural(matches,'partida','partidas')}`
    </ol>
  </section>
  <section><h2>partidas</h2>
    <ol className="cl-hx-list"> MatchCard… </ol>
    "carregar mais" / erro, como no Tatubum (classes cl-hx-btn, cl-hx-more, cl-hx-error)
  </section>
</div>
```

`MatchCard` (`<li className="cl-hx-match">`):
- `<p className="cl-hx-meta">`: a data (mesmo `Intl.DateTimeFormat` do Tatubum), `N jogadores` e
  `reasonText(m)`;
- `<h3 className="cl-hx-winner">` com o Critter do primeiro vencedor e `winnersText(m)`;
- `<ol className="cl-hx-score" aria-label="placar">`: os jogadores em ordem de pontos (desc), depois esferas na mesa (desc), depois na ordem dos
  assentos. Cada um mostra:
  - o Critter e o nome;
  - `<span className="cl-hx-pts">{plural(colors.length,'ponto','pontos')}</span>`;
  - uma bolinha por cor pontuada (`<i className="cl-hx-dot" style={{ background: HEX[color] }} title={color} />`);
  - se `endReason === 'deck'`, `· N esferas na mesa`;
  - vencedor com a classe `cl-hx-won`.
- botão `<button className="cl-hx-toggle" aria-expanded={open}>`, com o texto `ver os lances (N)` ou
  `esconder os lances` (N = `keyPlays(m).length`). Clicar abre/fecha;
- aberto: `<ol className="cl-hx-timeline" aria-label="lances que importam">`. Cada `<li>` traz:
  - `<span className="cl-hx-n">{n}ª</span>`;
  - uma cartinha (`<i className="cl-hx-chip" style={{ background: HEX[card.color] }}>{card.spheres}</i>`; bicolor e
    multicolor ganham a marquinha como na mesa, se for simples);
  - `<span>{givenText}</span>` e `<b>{outcomeText}</b>`;
  - classe por resultado: `cl-hx-scored`, `cl-hx-bust`, `cl-hx-lost`;
  - sem lances: `<p className="cl-hx-muted">nenhum lance marcante</p>`.

`aria-label` do `li` da partida: `[data, winnersText, reasonText, "jogaram " + joinNames(nomes)].join(' · ')`, como
no Tatubum.

- [ ] **Passo 4: `GamePage.tsx`**

Importe `CamelioHistory` e troque o `case 'camelio'` ("vem em breve") por `return <CamelioHistory />;`.

- [ ] **Passo 5: testes `web/test/camelio-history.test.tsx`**

Siga `web/test/kittens-history.test.tsx` (mesmo jeito de simular o `fetch` / `getHistory`). Casos:
1. Carregando, depois mostra as partidas com `winnersText` e `reasonText`. Exemplos: "Ana venceu", "chegou a 3 cores"
   e, numa dividida, "Ana e Beto dividiram a vitória" e "o monte acabou".
2. O placar fica na ordem de pontos, com as bolinhas das cores.
3. Clicar em "ver os lances (2)" abre a linha do tempo só com os lances que não são `none`, com os textos "Ana deu pra
   Beto" e "Beto fechou o vermelho". Clicar de novo fecha.
4. A galera mostra os quatro títulos (regiões "domador", "sabotador", "palhaço", "Papai Noel"), "ninguém ainda" no
   título nulo e a lista de vitórias.
5. Vazio: "Nenhuma partida de Cama-Leão ainda.".
6. Falha: "não deu pra falar com o servidor", e "tentar de novo" recarrega.
7. "Carregar mais" junta a segunda página sem repetir e mantém a galera.
8. Unitários de `texts.ts`: `joinNames`, `winnersText`, `outcomeText` nos 3 resultados e `givenText` pra si mesmo.

Rode `npm test -w web -- camelio-history` e depois `npm run typecheck`. Esperado: verde.

- [ ] **Passo 6: commit**

```bash
git add web/src/games/camelio/history web/src/screens/GamePage.tsx web/test/camelio-history.test.tsx
git commit -m "feat(web): aba histórico do Cama-Leão no visual de circo"
```

---

### Tarefa 6: E2E e documentação

**Arquivos:**
- Criar: `e2e/camelio-historico.spec.ts`
- Modificar: `CLAUDE.md` (tabela de jogos: Cama-Leão "jogável no computador, com histórico; celular ainda não"),
  `README.md` (se citar o histórico por jogo) e o spec §6.1 (as decisões 1 e 2 deste plano)

- [ ] **Passo 1: `e2e/camelio-historico.spec.ts`**

Modelo: `e2e/tatubum-historico.spec.ts`. A função `playCamelioMatchDirect(page, names)`, dentro do `page.evaluate`:
1. cria a sala com `POST /rooms { game: 'camelio' }`;
2. conecta duas pessoas (o primeiro é o host) e espera os 2 assentos;
3. manda `start`;
4. a cada estado novo, quem tem a vez (`view.game.turn === c.id`, `phase === 'playing'` e `!paused`) manda
   `{ type: 'play', from: 'deck', to: c.id }` e marca `fresh = false`. São no máximo 3000 passos de 30 ms;
5. com `phase === 'over'`, devolve os nomes dos vencedores (`view.game.winners` → `seats`) e fecha os sockets.

O teste:

```ts
test('partida de Cama-Leão terminada aparece no histórico, com os lances', async ({ browser }) => {
  const page = await newPlayer(browser);
  await page.goto('/');
  const stamp = String(Date.now() % 100_000);
  const names: [string, string] = [`Ana${stamp}`, `Beto${stamp}`];
  const winners = await playCamelioMatchDirect(page, names);

  await page.goto('/#/camelio/historico');
  // A gravação no D1 acontece logo depois do fim: recarrega até aparecer (o histórico acumula as partidas de outras execuções).
  const match = page.locator('.cl-hx-match').filter({ hasText: names[0] }).filter({ hasText: names[1] });
  await expect(async () => {
    await page.reload();
    await expect(match).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await expect(match.locator('.cl-hx-winner')).toContainText(winners[0]!);
  await match.getByRole('button', { name: /ver os lances/ }).click();
  await expect(match.locator('.cl-hx-timeline li').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'a galera' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'domador' })).toBeVisible();
});
```

Jogando tudo pra si mesmo, a partida sempre tem lance marcante: ou alguém chega à meta fechando cores, ou o monte acaba
depois de estouros.

- [ ] **Passo 2: rodar o E2E**

Rode `npm run e2e -- camelio-historico`. Ele sobe o servidor na 8787 e o site. Se a 8787 estiver ocupada por outra
sessão, veja `e2e/playwright.config.ts` pra rodar em outra porta, ou rode só no CI do PR. Esperado: PASS.

- [ ] **Passo 3: docs**

- `CLAUDE.md`: na linha do Cama-Leão da tabela, troque "celular e histórico ainda não" por "com histórico; celular
  ainda não".
- Spec §6.1: anote as decisões 1 e 2 (coluna `match_id`; posições em `players`) e o número 0006 da migração.

- [ ] **Passo 4: commit**

```bash
git add e2e/camelio-historico.spec.ts CLAUDE.md README.md docs/superpowers/specs/2026-10-19-cama-leao-design.md
git commit -m "test(e2e): histórico do Cama-Leão; docs do C4"
```

---

## Pronto quando

- `npm test`, `npm run typecheck`, `npm run build -w web` e o E2E estão verdes;
- o Rafa viu a aba `#/camelio/historico` no site local, com partidas de verdade (jogadas por WebSocket no servidor
  local);
- o PR empilhado está aberto (base `feat/camelio`), sem merge.
