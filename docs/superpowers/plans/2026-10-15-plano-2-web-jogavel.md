# cartolina~ — Plano 2: web jogável (mesa e arrasto conectados ao servidor real)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um site React (`web/`) em que 2–10 amigos criam/entram numa sala e jogam rodadas completas de ITO no `localhost`, com a mesa inclinada a 38°, arrasto de cartas com molas, cursores e arrastos dos outros ao vivo, revelação animada e resultado — tudo ligado ao servidor do Plano 1.

**Architecture:** O React cuida das telas (início, entrada, lobby) e dos controles da mesa (assentos, mão com dicas, botões). A mesa em si (feltro 3D, fila, buracos, cartas voando, cursores remotos, pings, flip da revelação) é um **motor imperativo** em TypeScript (`TableEngine`), portado do protótipo aprovado `prototipo/index.html` (molas + homografia + um único `requestAnimationFrame`). O motor recebe `RoomView` do servidor e eventos `fx.*`, e emite intenções (`place`, `return`, cursor, atividade, ping). O estado do jogo continua 100% autoritativo no servidor; o motor só faz otimismo local (intenção pendente) e desfaz se o servidor recusar.

**Tech Stack:** React 19, Vite 8 (com @vitejs/plugin-react 6; o plano previa Vite 7, trocado para ter uma única versão do Vite na árvore), TypeScript 5.9, Vitest 4 (jsdom) + Testing Library, `@cartolina/shared` (workspace), Cloudflare Worker/Durable Object do Plano 1.

**Spec:** `docs/superpowers/specs/2026-10-15-cartolina-ito-design.md` · **Notas herdadas:** `docs/superpowers/plans/notas-para-plano-2.md` · **Referência de UX:** `prototipo/index.html`

**Branch:** se o PR do Plano 1 já estiver mergeado, crie `feat/plano-2-web` a partir de `main`; senão, a partir de `feat/plano-1-fundacao`.

**Fora deste plano:** Plano 3 = histórico do grupo (spec §11); Plano 4 = layout de celular/toque, manual de marca `#/marca`, deploy (Pages + Cloudflare), E2E com Playwright, rate limit.

**Decisões deste plano:**
- O token do jogador fica no `sessionStorage` (cada aba = um jogador; recarregar mantém o assento). Nome e cor ficam no `localStorage`.
- `SERVER_URL` padrão é `http://127.0.0.1:8787` (no Windows, `localhost` pode resolver para `::1` e o `wrangler dev` escuta em IPv4).
- Inclinação de carta é determinística a partir do id (todo mundo vê a mesma carta torta igual).
- O índice de `place` enviado ao servidor é traduzido do que o jogador vê (`toServerIndex`), porque cartas que outros estão carregando ficam escondidas da fila local.

---

## Mapa de arquivos

```
shared/src/room.ts                 + roomSummary, reconcilePresence
shared/src/protocol.ts             + ERROR_CODES/ErrorCode/errorMessage, CLOSE_*, HEARTBEAT_*
shared/src/players.ts              cleanName por code points
server/src/liveness.ts             decisão pura de heartbeat
server/src/room-do.ts              /exists com resumo, reconcilePresence, heartbeat, varredura
web/
  package.json, vite.config.ts, tsconfig.json, index.html
  test/setup.ts, test/fixtures.ts
  src/main.tsx, src/App.tsx
  src/brand/tokens.css, src/brand/global.css
  src/lib/router.ts                rotas por hash
  src/net/config.ts                URL do servidor
  src/net/api.ts                   POST /rooms, GET /rooms/:code
  src/net/identity.ts              token, perfil, preferências
  src/net/connection.ts            RoomConnection (WS, reconexão, heartbeat, throttle de cursor)
  src/net/useConnSnapshot.ts       hook React
  src/game/derive.ts               seletores sobre RoomView
  src/screens/Home.tsx, RoomScreen.tsx, JoinForm.tsx, Lobby.tsx, Game.tsx, Toasts.tsx, Avatar.tsx
  src/table/constants.ts, spring.ts, homography.ts, rowLayout.ts, seatLayout.ts
  src/table/engine.ts              TableEngine
  src/table/table.css
  src/table/Table.tsx, Seat.tsx, Hand.tsx, ReadyColumn.tsx, ThemePanel.tsx, ThemeCard.tsx, TopBar.tsx, ResultBanner.tsx
  src/table/confetti.ts
scripts/smoke.mjs                  fumaça WS de ponta a ponta contra o wrangler dev
.claude/launch.json                + configs server e web
```

---

### Task 1: Resumo público da sala em `GET /rooms/:code`

A tela de entrada precisa saber as cores já usadas e a fase antes de entrar.

**Files:**
- Modify: `shared/src/room.ts`, `server/src/room-do.ts`
- Test: `shared/test/room.test.ts`, `server/test/http.test.ts`, `server/test/room-do.test.ts`

- [ ] **Step 1: Teste em `shared/test/room.test.ts`** — adicione `roomSummary` ao import de `'../src/room'` e acrescente ao fim:

```ts
describe('roomSummary', () => {
  it('expõe fase e assentos públicos, sem tokens', () => {
    const summary = roomSummary(roomWith(2));
    expect(summary).toEqual({
      phase: 'lobby',
      seats: [
        { id: 'id-tok0', name: 'P0', color: PLAYER_COLORS[0], connected: true },
        { id: 'id-tok1', name: 'P1', color: PLAYER_COLORS[1], connected: true },
      ],
    });
    expect(JSON.stringify(summary)).not.toContain('"tok0"');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -w shared -- room` → FAIL (`roomSummary` não existe).

- [ ] **Step 3: Implementar em `shared/src/room.ts`**

Troque o import de tipos do jogo por:
```ts
import type { ItoAction, ItoPhase, ItoState, ItoView } from './games/ito/types';
```
Logo após `export interface RoomView { … }` acrescente:
```ts
export interface RoomSummary {
  phase: ItoPhase;
  seats: SeatView[];
}

function seatView({ id, name, color, connected }: Seat): SeatView {
  return { id, name, color, connected };
}

/** Resumo público da sala para quem ainda não entrou: fase e assentos (cores ocupadas). */
export function roomSummary(room: Room): RoomSummary {
  return { phase: room.game.phase, seats: room.seats.map(seatView) };
}
```
E em `roomView`, troque `seats: room.seats.map(({ id, name, color, connected }) => ({ id, name, color, connected })),` por `seats: room.seats.map(seatView),`.

- [ ] **Step 4: `server/src/room-do.ts`** — importe `roomSummary` de `@cartolina/shared` e troque o bloco `/exists` por:

```ts
    if (url.pathname === '/exists') {
      if (!this.room) return Response.json({ exists: false }, { status: 404 });
      return Response.json({ exists: true, ...roomSummary(this.room) });
    }
```

- [ ] **Step 5: Ajustar `server/test/http.test.ts`** — no teste `GET /rooms/:code diz se a sala existe (case-insensitive)`, troque `expect(await ok.json()).toEqual({ exists: true });` por:

```ts
    expect(await ok.json()).toEqual({ exists: true, phase: 'lobby', seats: [] });
```

- [ ] **Step 6: Teste no DO** — em `server/test/room-do.test.ts`, adicione `SELF` ao import de `cloudflare:test` e acrescente dentro de `describe('RoomDO: entrada', …)`:

```ts
  it('GET /rooms/:code lista quem já está na sala', async () => {
    const code = await newRoomCode();
    await joined(code, 2);
    const res = await SELF.fetch(`https://x/rooms/${code}`);
    const body = (await res.json()) as { exists: boolean; phase: string; seats: { name: string; color: string }[] };
    expect(body.exists).toBe(true);
    expect(body.phase).toBe('lobby');
    expect(body.seats.map((s) => s.name)).toEqual(['P0', 'P1']);
    expect(body.seats.map((s) => s.color)).toEqual([COLORS[0], COLORS[1]]);
  });
```

- [ ] **Step 7: Rodar** — `npm test && npm run typecheck` → PASS.

- [ ] **Step 8: Commit**

```bash
git add shared server
git commit -m "feat: resumo público da sala em GET /rooms/:code

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Reconciliação pura, códigos tipados e nome por code points

**Files:**
- Modify: `shared/src/room.ts`, `shared/src/protocol.ts`, `shared/src/players.ts`, `server/src/room-do.ts`
- Test: `shared/test/room.test.ts`, `shared/test/protocol.test.ts`, `shared/test/players.test.ts`

- [ ] **Step 1: Testes que falham**

Em `shared/test/room.test.ts`, adicione `reconcilePresence` ao import e acrescente:
```ts
describe('reconcilePresence', () => {
  it('não muda nada quando todos os conectados têm socket', () => {
    const room = roomWith(2);
    expect(reconcilePresence(room, new Set(['id-tok0', 'id-tok1']), T0 + 5)).toBe(room);
  });

  it('marca como desconectado quem não tem socket vivo, sem contar como atividade', () => {
    const room = roomWith(2);
    const next = reconcilePresence(room, new Set(['id-tok0']), T0 + 5);
    expect(next.seats[1]).toMatchObject({ id: 'id-tok1', connected: false, disconnectedAt: T0 + 5 });
    expect(next.seats[0]?.connected).toBe(true);
    expect(next.lastActivity).toBe(room.lastActivity);
  });
});
```

Em `shared/test/protocol.test.ts`, troque o import por `import { CLOSE_GONE, CLOSE_REPLACED, CLOSE_TIMEOUT, ERROR_CODES, errorMessage, parseClientMessage } from '../src/protocol';` e substitua o teste `tem mensagem em português para todos os códigos de erro conhecidos` por:
```ts
  it('tem mensagem em português para todos os códigos de erro', () => {
    for (const code of ERROR_CODES) expect(errorMessage(code)).not.toBe('Algo deu errado.');
    expect(errorMessage('codigo_inventado')).toBe('Algo deu errado.');
  });

  it('expõe os códigos de fechamento do WebSocket', () => {
    expect([CLOSE_REPLACED, CLOSE_TIMEOUT, CLOSE_GONE]).toEqual([4000, 4002, 4004]);
  });
```

Em `shared/test/players.test.ts`, acrescente:
```ts
  it('cleanName conta emoji como um caractere', () => {
    expect(cleanName('😀'.repeat(16))).toBe('😀'.repeat(16));
    expect(cleanName('😀'.repeat(17))).toBeNull();
  });
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -w shared` → FAIL.

- [ ] **Step 3: `shared/src/room.ts`** — acrescente ao fim:

```ts
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

- [ ] **Step 4: `shared/src/protocol.ts`** — substitua o bloco `export const ERROR_MESSAGES … };` inteiro por:

```ts
export const ERROR_CODES = [
  'not_host',
  'bad_phase',
  'not_owner',
  'unknown_card',
  'not_enough_players',
  'cards_missing',
  'bad_theme',
  'not_player',
  'bad_action',
  'room_full',
  'bad_name',
  'bad_color',
  'color_taken',
  'not_member',
  'bad_message',
  'not_joined',
  'already_joined',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
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
  already_joined: 'Você já entrou nesta sala.',
};

export function errorMessage(code: string): string {
  return (ERROR_CODES as readonly string[]).includes(code) ? ERROR_MESSAGES[code as ErrorCode] : 'Algo deu errado.';
}

/** Códigos de fechamento do WebSocket enviados pelo servidor. */
export const CLOSE_REPLACED = 4000;
export const CLOSE_TIMEOUT = 4002;
export const CLOSE_GONE = 4004;

/** Heartbeat: o cliente manda "ping" de tempos em tempos; o servidor responde "pong" sozinho. */
export const HEARTBEAT_PING = 'ping';
export const HEARTBEAT_PONG = 'pong';
export const HEARTBEAT_INTERVAL_MS = 15_000;
```

- [ ] **Step 5: `shared/src/players.ts`** — substitua `cleanName` por:

```ts
export function cleanName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, ' ');
  const length = Array.from(name).length;
  return length >= 1 && length <= NAME_MAX ? name : null;
}
```

- [ ] **Step 6: `server/src/room-do.ts`**
  - No import de `@cartolina/shared`: remova `ERROR_MESSAGES`, `disconnect` continua; adicione `CLOSE_GONE`, `CLOSE_REPLACED`, `errorMessage`, `reconcilePresence`.
  - Substitua o corpo do `blockConcurrencyWhile` do construtor por:

```ts
    ctx.blockConcurrencyWhile(async () => {
      this.room = (await ctx.storage.get<Room>('room')) ?? null;
      if (!this.room) return;
      // Após um restart, `connected` pode estar obsoleto: quem não tem socket vivo está desconectado.
      const live = new Set(
        ctx.getWebSockets().map((s) => this.attachment(s).playerId).filter((id): id is string => id !== null),
      );
      const now = Date.now();
      const reconciled = reconcilePresence(this.room, live, now);
      if (reconciled !== this.room) {
        this.room = reconciled;
        await ctx.storage.put('room', this.room);
        await ctx.storage.setAlarm(nextAlarmAt(this.room, now));
      }
    });
```
  - Troque os literais: `this.safeClose(other, 4000, 'replaced')` → `this.safeClose(other, CLOSE_REPLACED, 'replaced')`; `this.safeClose(ws, 4004, 'not_found')` → `CLOSE_GONE`; `this.safeClose(ws, 4004, 'expired')` → `CLOSE_GONE`.
  - Troque o corpo de `sendError` por `this.send(ws, { t: 'error', code, message: errorMessage(code) });`.

- [ ] **Step 7: Rodar** — `npm test && npm run typecheck` → PASS.

- [ ] **Step 8: Commit**

```bash
git add shared server
git commit -m "refactor: reconcilePresence pura, códigos tipados e nome por code points

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Heartbeat no servidor (auto-response + varredura)

Celular que dorme ou perde rede não manda close; sem heartbeat o assento fica "conectado" por minutos.

**Files:**
- Create: `server/src/liveness.ts`, `server/test/liveness.test.ts`
- Modify: `server/src/room-do.ts`, `server/test/helpers.ts`, `server/test/room-do.test.ts`

- [ ] **Step 1: Teste puro** — `server/test/liveness.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { HEARTBEAT_TIMEOUT_MS, SWEEP_INTERVAL_MS, isStale, nextWakeAt } from '../src/liveness';

describe('liveness', () => {
  it('socket que pingou há pouco não está vencido', () => {
    expect(isStale(1_000, 0, 1_000 + HEARTBEAT_TIMEOUT_MS)).toBe(false);
    expect(isStale(1_000, 0, 1_001 + HEARTBEAT_TIMEOUT_MS)).toBe(true);
  });

  it('sem nenhum ping, conta a partir da conexão', () => {
    expect(isStale(null, 5_000, 5_000 + HEARTBEAT_TIMEOUT_MS)).toBe(false);
    expect(isStale(null, 5_000, 5_001 + HEARTBEAT_TIMEOUT_MS)).toBe(true);
  });

  it('com sockets abertos acorda pelo menos a cada varredura', () => {
    expect(nextWakeAt(1_000_000, 2, 100)).toBe(100 + SWEEP_INTERVAL_MS);
    expect(nextWakeAt(500, 2, 100)).toBe(500);
    expect(nextWakeAt(1_000_000, 0, 100)).toBe(1_000_000);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -w server -- liveness` → FAIL.

- [ ] **Step 3: `server/src/liveness.ts`**

```ts
/** Sem ping há mais que isso, o socket é considerado morto (cliente pinga a cada 15 s). */
export const HEARTBEAT_TIMEOUT_MS = 45_000;
/** Enquanto houver sockets, o DO acorda pelo menos neste intervalo para varrer os mortos. */
export const SWEEP_INTERVAL_MS = 20_000;

export function isStale(lastPingAt: number | null, acceptedAt: number, now: number): boolean {
  return now - (lastPingAt ?? acceptedAt) > HEARTBEAT_TIMEOUT_MS;
}

export function nextWakeAt(roomAlarmAt: number, openSockets: number, now: number): number {
  return openSockets > 0 ? Math.min(roomAlarmAt, now + SWEEP_INTERVAL_MS) : roomAlarmAt;
}
```

- [ ] **Step 4: Ajustar o cliente de teste** — em `server/test/helpers.ts`:
  - Acrescente `raw: string[];` à interface `TestClient`.
  - Crie `const raw: string[] = [];` ao lado de `inbox`, e no listener de `message` trate texto não-JSON antes do `JSON.parse`:

```ts
  ws.addEventListener('message', (event) => {
    const data = event.data as string;
    if (data === 'pong') {
      raw.push(data);
      wake?.();
      return;
    }
    inbox.push(JSON.parse(data) as ServerMessage);
    wake?.();
  });
```
  - Inclua `raw` no objeto retornado por `connect`.

- [ ] **Step 5: Teste de integração** — em `server/test/room-do.test.ts`, acrescente:

```ts
describe('RoomDO: heartbeat', () => {
  it('responde "pong" a "ping" sem gerar erro', async () => {
    const code = await newRoomCode();
    const [a] = await joined(code, 1);
    a!.client.ws.send('ping');
    const deadline = Date.now() + 2000;
    while (!a!.client.raw.includes('pong') && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
    expect(a!.client.raw).toContain('pong');
    await barrier(a!.client);
    expect(a!.client.inbox.some((m) => m.t === 'error')).toBe(false);
  });
});
```
(`barrier` já existe em `helpers.ts`; importe-o se ainda não estiver no import.)

- [ ] **Step 6: Implementar no `server/src/room-do.ts`**
  - Imports: adicione `HEARTBEAT_PING`, `HEARTBEAT_PONG`, `CLOSE_TIMEOUT` de `@cartolina/shared` e `import { isStale, nextWakeAt } from './liveness';`.
  - `interface Attachment` ganha `acceptedAt?: number;`.
  - Primeira linha do construtor, depois de `super(ctx, env);`:
```ts
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(HEARTBEAT_PING, HEARTBEAT_PONG));
```
  - No construtor, troque `await ctx.storage.setAlarm(nextAlarmAt(this.room, now));` por `await ctx.storage.setAlarm(nextWakeAt(nextAlarmAt(this.room, now), ctx.getWebSockets().length, now));`.
  - No upgrade de WebSocket: `server.serializeAttachment({ playerId: null, acceptedAt: Date.now() } satisfies Attachment);`
  - No `join` bem-sucedido: `ws.serializeAttachment({ playerId: res.playerId, acceptedAt: this.attachment(ws).acceptedAt } satisfies Attachment);`
  - Em `alarm()`, depois do bloco de expiração e antes de `this.room = tick(...)`, chame `this.sweepStaleSockets(now);`.
  - Em `commit()`, troque `await this.ctx.storage.setAlarm(nextAlarmAt(this.room, Date.now()));` por `await this.scheduleAlarm();`.
  - Acrescente os métodos privados:

```ts
  private async scheduleAlarm(): Promise<void> {
    if (!this.room) return;
    const now = Date.now();
    await this.ctx.storage.setAlarm(nextWakeAt(nextAlarmAt(this.room, now), this.ctx.getWebSockets().length, now));
  }

  /** Fecha sockets sem heartbeat e desconecta o jogador se não sobrou outro socket dele. */
  private sweepStaleSockets(now: number): void {
    for (const ws of this.ctx.getWebSockets()) {
      const att = this.attachment(ws);
      const lastPing = this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? null;
      if (!isStale(lastPing, att.acceptedAt ?? now, now)) continue;
      ws.serializeAttachment({ playerId: null, replaced: true } satisfies Attachment);
      this.safeClose(ws, CLOSE_TIMEOUT, 'timeout');
      if (att.playerId && this.room && this.socketsOf(att.playerId).length === 0) {
        this.room = disconnect(this.room, att.playerId, now);
      }
    }
  }
```

- [ ] **Step 7: Rodar 3×** — `npm test -w server` (três vezes) e `npm run typecheck` → PASS sempre. Se `setWebSocketAutoResponse` não responder no ambiente de teste, reporte BLOCKED com o erro (não remova o teste).

- [ ] **Step 8: Commit**

```bash
git add server
git commit -m "feat(server): heartbeat por auto-response e varredura de sockets mortos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Workspace `web/` (Vite + React + identidade base)

**Files:**
- Create: `web/package.json`, `web/vite.config.ts`, `web/tsconfig.json`, `web/index.html`, `web/test/setup.ts`, `web/src/main.tsx`, `web/src/App.tsx`, `web/src/lib/router.ts`, `web/src/brand/tokens.css`, `web/src/brand/global.css`, `web/test/router.test.ts`
- Modify: `package.json` (raiz), `.claude/launch.json`, `.gitignore`

- [ ] **Step 1: `web/package.json`**

```json
{
  "name": "@cartolina/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@cartolina/shared": "*"
  }
}
```

- [ ] **Step 2: Raiz** — em `package.json`, `"workspaces": ["shared", "server", "web"]` e acrescente aos scripts:

```json
    "dev:server": "npm run dev -w server",
    "dev:web": "npm run dev -w web",
    "build": "npm run build -w web",
```
Em `.gitignore`, acrescente `web/dist/`.

- [ ] **Step 3: Instalar**

```bash
npm install -w web react@^19 react-dom@^19
npm install -D -w web vite@^7 @vitejs/plugin-react @types/react @types/react-dom jsdom @testing-library/react @testing-library/dom
```
Expected: instala sem erro de peer. Se o npm reclamar de peer entre `vitest` (raiz, 4.x) e `vite`, use a faixa de `vite` que o `npm view vitest@4 peerDependencies` aceitar.

- [ ] **Step 4: `web/vite.config.ts`**

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  test: { environment: 'jsdom', setupFiles: ['./test/setup.ts'] },
});
```

- [ ] **Step 5: `web/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": ["vite/client"]
  },
  "include": ["src", "test", "vite.config.ts"]
}
```

- [ ] **Step 6: `web/test/setup.ts`**

```ts
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
});
```

- [ ] **Step 7: `web/index.html`**

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>cartolina~</title>
    <link
      rel="icon"
      href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect x='5' y='2' width='22' height='28' rx='5' fill='%23FF8FAB' stroke='%233B2F2F' stroke-width='2.5'/%3E%3Ctext x='16' y='22' font-size='18' text-anchor='middle' font-family='sans-serif' font-weight='700' fill='%233B2F2F'%3E~%3C/text%3E%3C/svg%3E"
    />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;700&family=Patrick+Hand&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 8: `web/src/brand/tokens.css`**

```css
:root {
  --kraft: #eadbc0;
  --paper: #f6eedd;
  --ink: #3b2f2f;
  --pink: #ff8fab;
  --pink2: #e0567a;
  --edge: #d3bf99;
  --ok: #7eddb5;
  --warm: #ffe7b3;
  --disabled: #e3d2b3;
  --r: 14px 10px 13px 9px;
  --font-ui: 'Fredoka', system-ui, sans-serif;
  --font-hand: 'Patrick Hand', 'Comic Sans MS', cursive;
}
```

- [ ] **Step 9: `web/src/brand/global.css`**

```css
* { box-sizing: border-box; }
html, body, #root { margin: 0; height: 100%; }
body {
  background-color: var(--kraft);
  background-image:
    radial-gradient(rgba(59, 47, 47, 0.06) 1px, transparent 1.3px),
    radial-gradient(rgba(255, 255, 255, 0.28) 1px, transparent 1.3px);
  background-size: 7px 7px, 11px 11px;
  background-position: 0 0, 3px 5px;
  color: var(--ink);
  font-family: var(--font-ui);
  font-weight: 500;
}
button, input, textarea { font: inherit; color: inherit; }

.logo { font: 700 30px/1 var(--font-ui); letter-spacing: -0.5px; margin: 0; }
.logo span { color: var(--pink2); }
.logo.big { font-size: 64px; }

.screen { min-height: 100%; display: flex; flex-direction: column; align-items: center; gap: 20px; padding: 48px 16px; }
.tagline { font: 22px/1.2 var(--font-hand); margin: 0; opacity: 0.8; text-align: center; }
.panel {
  width: min(520px, 100%); background: var(--paper); border: 2px solid var(--ink);
  border-radius: 24px 18px 22px 16px; box-shadow: 4px 5px 0 var(--ink); padding: 22px 24px;
  display: flex; flex-direction: column; gap: 14px;
}
.panel h2 { margin: 0; font: 700 22px/1 var(--font-ui); }
.panel p { margin: 0; font: 19px/1.25 var(--font-hand); }

.btn {
  font: 700 19px/1 var(--font-ui); padding: 14px 22px 13px; background: var(--pink); border: 2px solid var(--ink);
  border-radius: 16px 12px 15px 11px; box-shadow: 3px 4px 0 var(--ink); color: var(--ink); cursor: pointer; white-space: nowrap;
}
.btn:active { box-shadow: 1px 1px 0 var(--ink); transform: translate(2px, 3px); }
.btn[disabled] {
  background: var(--disabled); color: rgba(59, 47, 47, 0.6); cursor: not-allowed;
  box-shadow: 3px 4px 0 rgba(59, 47, 47, 0.4); border-color: rgba(59, 47, 47, 0.6);
}
.btn[disabled]:active { transform: none; }
.btn.ready { background: var(--ok); }
.sbtn {
  font: 500 15px/1 var(--font-ui); padding: 9px 13px 8px; background: var(--paper); border: 2px dashed var(--ink);
  border-radius: 12px 9px 11px 8px; cursor: pointer; color: var(--ink);
}
.sbtn.solid { border-style: solid; box-shadow: 2px 3px 0 var(--ink); }
.pill {
  font: 500 15px/1 var(--font-ui); padding: 8px 14px 7px; border: 2px solid var(--ink);
  border-radius: 999px 990px 999px 980px; background: var(--paper); white-space: nowrap;
}
.avatar {
  width: 52px; height: 52px; border-radius: 50% 46% 52% 47%; background: var(--c); border: 2px solid var(--ink);
  display: grid; place-items: center; font: 700 22px/1 var(--font-ui); box-shadow: 2px 3px 0 var(--ink); flex: none;
}
.tag {
  display: inline-block; font: 500 13px/1 var(--font-ui); padding: 4px 10px 3px; border: 2px solid var(--ink);
  border-radius: 999px; background: var(--paper); white-space: nowrap;
}
.tag[data-s='escrevendo'] { background: var(--warm); }
.tag[data-s='arrastando'] { background: var(--pink); }
.tag[data-s='pronto'] { background: var(--ok); }
.tag[data-s='desconectado'], .tag[data-s='assistindo'] { opacity: 0.6; }

.field { display: flex; flex-direction: column; gap: 6px; font: 500 15px/1 var(--font-ui); }
.text-in {
  padding: 10px 12px; border: 2px solid var(--ink); border-radius: 12px 9px 11px 8px; background: var(--paper);
  font: 21px/1 var(--font-hand); outline: none; min-width: 0;
}
.text-in:focus { box-shadow: 0 0 0 3px var(--pink); }
.swatches { display: flex; flex-wrap: wrap; gap: 8px; }
.swatch {
  width: 38px; height: 38px; border-radius: 50% 46% 52% 47%; border: 2px solid var(--ink);
  background: var(--c); cursor: pointer; padding: 0;
}
.swatch[aria-pressed='true'] { box-shadow: 0 0 0 3px var(--paper), 0 0 0 5px var(--ink); }
.swatch:disabled { opacity: 0.25; cursor: not-allowed; }
.error { color: var(--pink2); font: 19px/1.2 var(--font-hand); margin: 0; }
.hint { font: 19px/1.2 var(--font-hand); opacity: 0.75; margin: 0; }
.row-inline { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }

.seat-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.seat-list li { display: flex; align-items: center; gap: 10px; font: 500 18px/1 var(--font-ui); }
.seat-list li.off { opacity: 0.5; }
.seat-list .avatar { width: 38px; height: 38px; font-size: 16px; }
.modes { display: flex; gap: 10px; flex-wrap: wrap; }
.mode {
  flex: 1 1 180px; text-align: left; padding: 12px 14px; border: 2px solid var(--ink);
  border-radius: 16px 12px 15px 11px; background: var(--kraft); cursor: pointer;
}
.mode.on { background: var(--pink); box-shadow: 3px 4px 0 var(--ink); }
.mode:disabled { cursor: default; }
.mode b { display: block; font: 700 18px/1 var(--font-ui); margin-bottom: 4px; }
.mode span { font: 17px/1.15 var(--font-hand); }

.toasts {
  position: fixed; left: 50%; top: 16px; transform: translateX(-50%); display: flex; flex-direction: column;
  gap: 8px; z-index: 80; pointer-events: none;
}
.toast {
  background: var(--paper); border: 2px solid var(--ink); border-radius: 12px 9px 11px 8px; padding: 8px 14px;
  font: 19px/1 var(--font-hand); box-shadow: 2px 3px 0 var(--ink);
}
.banner-reconnect {
  position: fixed; left: 0; right: 0; top: 0; z-index: 90; background: var(--pink); border-bottom: 2px solid var(--ink);
  text-align: center; font: 700 15px/1 var(--font-ui); padding: 8px;
}
```

- [ ] **Step 10: Teste do roteador** — `web/test/router.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseHash } from '../src/lib/router';

describe('parseHash', () => {
  it('início', () => {
    expect(parseHash('')).toEqual({ name: 'home' });
    expect(parseHash('#/')).toEqual({ name: 'home' });
  });

  it('sala com código normalizado', () => {
    expect(parseHash('#/sala/kxq7')).toEqual({ name: 'room', code: 'KXQ7' });
  });

  it('qualquer outra coisa volta pro início', () => {
    expect(parseHash('#/sala/abc')).toEqual({ name: 'home' });
    expect(parseHash('#/marca')).toEqual({ name: 'home' });
  });
});
```

- [ ] **Step 11: Rodar e ver falhar** — `npm test -w web` → FAIL (módulo inexistente).

- [ ] **Step 12: `web/src/lib/router.ts`**

```ts
import { useEffect, useState } from 'react';

export type Route = { name: 'home' } | { name: 'room'; code: string };

export function parseHash(hash: string): Route {
  const match = hash.match(/^#\/sala\/([A-Za-z0-9]{4})$/);
  return match ? { name: 'room', code: match[1]!.toUpperCase() } : { name: 'home' };
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function goToRoom(code: string): void {
  window.location.hash = `#/sala/${code}`;
}

export function goHome(): void {
  window.location.hash = '#/';
}
```

- [ ] **Step 13: `web/src/App.tsx` (provisório; a Task 9 substitui)**

```tsx
import { useHashRoute } from './lib/router';

export function App() {
  const route = useHashRoute();
  return (
    <main className="screen">
      <h1 className="logo big">
        cartolina<span>~</span>
      </h1>
      <p className="tagline">{route.name === 'room' ? `sala ${route.code}` : 'em construção'}</p>
    </main>
  );
}
```

- [ ] **Step 14: `web/src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './brand/tokens.css';
import './brand/global.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 15: `.claude/launch.json`** — substitua inteiro por:

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "prototipo",
      "runtimeExecutable": "npx",
      "runtimeArgs": ["--yes", "http-server", "prototipo", "-p", "5174", "-c-1", "--silent"],
      "port": 5174
    },
    {
      "name": "server",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev", "-w", "server"],
      "port": 8787
    },
    {
      "name": "web",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev", "-w", "web"],
      "port": 5173
    }
  ]
}
```

- [ ] **Step 16: Verificar** — `npm test -w web`, `npm run typecheck`, `npm run build` → PASS (build gera `web/dist/`).

- [ ] **Step 17: Commit**

```bash
git add package.json package-lock.json .gitignore .claude/launch.json web
git commit -m "chore(web): workspace Vite + React com identidade base e rotas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Rede básica — config, API HTTP e identidade

**Files:**
- Create: `web/src/net/config.ts`, `web/src/net/api.ts`, `web/src/net/identity.ts`
- Test: `web/test/net-basics.test.ts`

- [ ] **Step 1: Testes** — `web/test/net-basics.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createRoom, getRoomInfo } from '../src/net/api';
import { wsUrl } from '../src/net/config';
import { getToken, loadProfile, loadTiltPref, markJoined, saveProfile, saveTiltPref, wasJoined } from '../src/net/identity';

function fakeFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

describe('config', () => {
  it('troca http por ws e https por wss', () => {
    expect(wsUrl('ABCD', 'http://127.0.0.1:8787')).toBe('ws://127.0.0.1:8787/rooms/ABCD/ws');
    expect(wsUrl('ABCD', 'https://x.workers.dev')).toBe('wss://x.workers.dev/rooms/ABCD/ws');
  });
});

describe('api', () => {
  it('createRoom devolve o código', async () => {
    const f = fakeFetch(201, { code: 'KXQ7' });
    await expect(createRoom(f, 'http://s')).resolves.toBe('KXQ7');
    expect(f).toHaveBeenCalledWith('http://s/rooms', { method: 'POST' });
  });

  it('createRoom falha com erro claro', async () => {
    await expect(createRoom(fakeFetch(503, { error: 'no_code' }), 'http://s')).rejects.toThrow('create_failed_503');
  });

  it('getRoomInfo devolve resumo ou null quando não existe', async () => {
    const info = { exists: true, phase: 'lobby', seats: [] };
    await expect(getRoomInfo('KXQ7', fakeFetch(200, info), 'http://s')).resolves.toEqual(info);
    await expect(getRoomInfo('ZZZZ', fakeFetch(404, { exists: false }), 'http://s')).resolves.toBeNull();
  });
});

describe('identity', () => {
  it('token é estável na aba', () => {
    const t = getToken();
    expect(t).toMatch(/^[0-9a-f-]{36}$/);
    expect(getToken()).toBe(t);
  });

  it('perfil válido é salvo e lido; inválido vira null', () => {
    expect(loadProfile()).toBeNull();
    saveProfile({ name: 'Ana', color: '#8EC5FF' });
    expect(loadProfile()).toEqual({ name: 'Ana', color: '#8EC5FF' });
    localStorage.setItem('cartolina.profile', JSON.stringify({ name: 'X', color: '#000000' }));
    expect(loadProfile()).toBeNull();
  });

  it('lembra em quais salas a aba já entrou', () => {
    expect(wasJoined('ABCD')).toBe(false);
    markJoined('ABCD');
    expect(wasJoined('ABCD')).toBe(true);
  });

  it('preferência de mesa 3D começa ligada', () => {
    expect(loadTiltPref()).toBe(true);
    saveTiltPref(false);
    expect(loadTiltPref()).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -w web -- net-basics` → FAIL.

- [ ] **Step 3: `web/src/net/config.ts`**

```ts
/** URL HTTP do servidor. Em dev, 127.0.0.1 evita o `localhost` resolver para IPv6 no Windows. */
export const SERVER_URL: string = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? 'http://127.0.0.1:8787';

export function wsUrl(code: string, base: string = SERVER_URL): string {
  return `${base.replace(/^http/, 'ws')}/rooms/${code}/ws`;
}
```

- [ ] **Step 4: `web/src/net/api.ts`**

```ts
import type { RoomSummary } from '@cartolina/shared';
import { SERVER_URL } from './config';

export type RoomInfo = { exists: true } & RoomSummary;

export async function createRoom(fetcher: typeof fetch = fetch, base: string = SERVER_URL): Promise<string> {
  const res = await fetcher(`${base}/rooms`, { method: 'POST' });
  if (!res.ok) throw new Error(`create_failed_${res.status}`);
  return ((await res.json()) as { code: string }).code;
}

export async function getRoomInfo(code: string, fetcher: typeof fetch = fetch, base: string = SERVER_URL): Promise<RoomInfo | null> {
  const res = await fetcher(`${base}/rooms/${code}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`info_failed_${res.status}`);
  return (await res.json()) as RoomInfo;
}
```

- [ ] **Step 5: `web/src/net/identity.ts`**

```ts
import { isPlayerColor, type PlayerColor } from '@cartolina/shared';

const TOKEN_KEY = 'cartolina.token';
const PROFILE_KEY = 'cartolina.profile';
const TILT_KEY = 'cartolina.tilt';
const joinedKey = (code: string) => `cartolina.joined.${code}`;

export interface Profile {
  name: string;
  color: PlayerColor;
}

/** Um token por aba: duas abas são dois jogadores; recarregar a aba mantém o assento. */
export function getToken(): string {
  let token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) {
    token = crypto.randomUUID();
    sessionStorage.setItem(TOKEN_KEY, token);
  }
  return token;
}

export function loadProfile(): Profile | null {
  try {
    const raw = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null') as { name?: unknown; color?: unknown } | null;
    if (raw && typeof raw.name === 'string' && isPlayerColor(raw.color)) return { name: raw.name, color: raw.color };
  } catch {
    // perfil corrompido: ignora
  }
  return null;
}

export function saveProfile(profile: Profile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function wasJoined(code: string): boolean {
  return sessionStorage.getItem(joinedKey(code)) === '1';
}

export function markJoined(code: string): void {
  sessionStorage.setItem(joinedKey(code), '1');
}

export function loadTiltPref(): boolean {
  return localStorage.getItem(TILT_KEY) !== 'off';
}

export function saveTiltPref(on: boolean): void {
  localStorage.setItem(TILT_KEY, on ? 'on' : 'off');
}
```

- [ ] **Step 6: Rodar** — `npm test -w web && npm run typecheck` → PASS.

- [ ] **Step 7: Commit**

```bash
git add web
git commit -m "feat(web): config do servidor, API HTTP e identidade por aba

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `RoomConnection` (WebSocket, reconexão, heartbeat, throttle de cursor)

**Files:**
- Create: `web/src/net/connection.ts`, `web/src/net/useConnSnapshot.ts`
- Test: `web/test/connection.test.ts`

- [ ] **Step 1: Testes** — `web/test/connection.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomConnection, type SocketLike } from '../src/net/connection';

class FakeSocket implements SocketLike {
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  closedWith: number | null = null;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  constructor(public url: string) {
    FakeSocket.all.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close(code?: number) {
    this.closedWith = code ?? 1000;
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  receive(msg: unknown) {
    this.onmessage?.({ data: typeof msg === 'string' ? msg : JSON.stringify(msg) });
  }
  drop(code: number) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
  messages() {
    return this.sent.filter((s) => s !== 'ping').map((s) => JSON.parse(s) as { t: string; [k: string]: unknown });
  }
}

const TOKEN = '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b';
const last = () => FakeSocket.all[FakeSocket.all.length - 1]!;

function make() {
  const conn = new RoomConnection({
    url: 'ws://s/rooms/ABCD/ws',
    token: TOKEN,
    name: 'Ana',
    color: '#8EC5FF',
    createSocket: (url) => new FakeSocket(url),
  });
  conn.start();
  return conn;
}

describe('RoomConnection', () => {
  beforeEach(() => {
    FakeSocket.all = [];
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('abre o socket e manda join ao conectar', () => {
    const conn = make();
    expect(last().url).toBe('ws://s/rooms/ABCD/ws');
    expect(conn.getSnapshot().status).toBe('connecting');
    last().open();
    expect(conn.getSnapshot().status).toBe('joining');
    expect(last().messages()).toEqual([{ t: 'join', token: TOKEN, name: 'Ana', color: '#8EC5FF' }]);
  });

  it('welcome e state atualizam o snapshot e avisam assinantes', () => {
    const conn = make();
    const spy = vi.fn();
    conn.subscribe(spy);
    last().open();
    last().receive({ t: 'welcome', playerId: 'p1', code: 'ABCD' });
    last().receive({ t: 'state', room: { code: 'ABCD', you: 'p1' } });
    const snap = conn.getSnapshot();
    expect(snap.status).toBe('joined');
    expect(snap.playerId).toBe('p1');
    expect(snap.view).toEqual({ code: 'ABCD', you: 'p1' });
    expect(spy).toHaveBeenCalled();
  });

  it('erro de entrada vira join_failed e retryJoin tenta de novo no mesmo socket', () => {
    const conn = make();
    last().open();
    last().receive({ t: 'error', code: 'color_taken', message: 'Essa cor já foi escolhida.' });
    expect(conn.getSnapshot()).toMatchObject({ status: 'join_failed', joinError: 'color_taken' });
    conn.retryJoin('Ana', '#FF8FAB');
    expect(FakeSocket.all).toHaveLength(1);
    expect(last().messages().at(-1)).toEqual({ t: 'join', token: TOKEN, name: 'Ana', color: '#FF8FAB' });
    expect(conn.getSnapshot()).toMatchObject({ status: 'joining', joinError: null });
  });

  it('outros erros vão para onError sem mudar o status', () => {
    const conn = make();
    const onError = vi.fn();
    conn.onError(onError);
    last().open();
    last().receive({ t: 'welcome', playerId: 'p1', code: 'ABCD' });
    last().receive({ t: 'error', code: 'not_host', message: 'Só o host pode fazer isso.' });
    expect(onError).toHaveBeenCalledWith('not_host', 'Só o host pode fazer isso.');
    expect(conn.getSnapshot().status).toBe('joined');
  });

  it('fx vai para onFx; pong é ignorado', () => {
    const conn = make();
    const onFx = vi.fn();
    conn.onFx(onFx);
    last().open();
    last().receive('pong');
    last().receive({ t: 'fx.ping', from: 'p2', x: 0.5, y: 0.5 });
    expect(onFx).toHaveBeenCalledTimes(1);
    expect(onFx).toHaveBeenCalledWith({ t: 'fx.ping', from: 'p2', x: 0.5, y: 0.5 });
  });

  it('reconecta com backoff exponencial e zera ao conseguir abrir', () => {
    const conn = make();
    last().open();
    last().drop(1006);
    expect(conn.getSnapshot().status).toBe('reconnecting');
    vi.advanceTimersByTime(999);
    expect(FakeSocket.all).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.all).toHaveLength(2);
    last().drop(1006);
    vi.advanceTimersByTime(1999);
    expect(FakeSocket.all).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.all).toHaveLength(3);
    last().open();
    last().drop(1006);
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.all).toHaveLength(4);
  });

  it('não reconecta quando substituído por outra aba ou quando a sala sumiu', () => {
    const a = make();
    last().open();
    last().drop(4000);
    expect(a.getSnapshot().status).toBe('replaced');
    const b = make();
    last().open();
    last().drop(4004);
    expect(b.getSnapshot().status).toBe('gone');
    vi.advanceTimersByTime(20_000);
    expect(FakeSocket.all).toHaveLength(2);
  });

  it('manda ping a cada 15 s enquanto aberto', () => {
    make();
    last().open();
    vi.advanceTimersByTime(15_000);
    expect(last().sent.filter((s) => s === 'ping')).toHaveLength(1);
    vi.advanceTimersByTime(15_000);
    expect(last().sent.filter((s) => s === 'ping')).toHaveLength(2);
  });

  it('cursor: o primeiro sai na hora, os seguintes no máximo a ~30 Hz com o valor mais recente', () => {
    const conn = make();
    last().open();
    const cursor = (x: number) => ({ zone: 'table' as const, x, y: 0.5, drag: null });
    conn.sendCursor(cursor(0.1));
    conn.sendCursor(cursor(0.2));
    conn.sendCursor(cursor(0.3));
    expect(last().messages().filter((m) => m.t === 'fx.cursor').map((m) => m.x)).toEqual([0.1]);
    vi.advanceTimersByTime(34);
    expect(last().messages().filter((m) => m.t === 'fx.cursor').map((m) => m.x)).toEqual([0.1, 0.3]);
  });

  it('stop fecha e não reconecta; ações só saem com o socket aberto', () => {
    const conn = make();
    conn.sendAction({ type: 'start' });
    expect(last().sent).toEqual([]);
    last().open();
    conn.sendAction({ type: 'start' });
    expect(last().messages().at(-1)).toEqual({ t: 'action', action: { type: 'start' } });
    conn.stop();
    expect(last().closedWith).toBe(1000);
    last().drop(1000);
    vi.advanceTimersByTime(20_000);
    expect(FakeSocket.all).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -w web -- connection` → FAIL.

- [ ] **Step 3: `web/src/net/connection.ts`**

```ts
import {
  CLOSE_GONE,
  CLOSE_REPLACED,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_PING,
  HEARTBEAT_PONG,
  type Activity,
  type ClientMessage,
  type CursorFx,
  type ItoAction,
  type RoomView,
  type ServerMessage,
} from '@cartolina/shared';

export type ConnStatus = 'connecting' | 'joining' | 'joined' | 'reconnecting' | 'join_failed' | 'replaced' | 'gone';

export interface ConnSnapshot {
  status: ConnStatus;
  playerId: string | null;
  view: RoomView | null;
  joinError: string | null;
}

export type FxEvent = Extract<ServerMessage, { t: 'fx.cursor' | 'fx.activity' | 'fx.ping' }>;

export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number }) => void) | null;
}

export interface ConnOptions {
  url: string;
  token: string;
  name: string;
  color: string;
  createSocket?: (url: string) => SocketLike;
}

/** Erros que só acontecem ao entrar; com eles o socket fica aberto esperando nova tentativa. */
export const JOIN_ERRORS: ReadonlySet<string> = new Set(['room_full', 'bad_name', 'bad_color', 'color_taken']);
export const CURSOR_INTERVAL_MS = 34;
const OPEN = 1;
const MAX_BACKOFF_MS = 10_000;

/** O que a mesa precisa da conexão (facilita testar componentes com um objeto falso). */
export type GameConn = Pick<RoomConnection, 'sendAction' | 'sendActivity' | 'sendCursor' | 'sendPing' | 'onFx' | 'onError'>;

const defaultSocket = (url: string): SocketLike => new WebSocket(url) as unknown as SocketLike;

export class RoomConnection {
  private ws: SocketLike | null = null;
  private snap: ConnSnapshot = { status: 'connecting', playerId: null, view: null, joinError: null };
  private listeners = new Set<() => void>();
  private fxListeners = new Set<(fx: FxEvent) => void>();
  private errorListeners = new Set<(code: string, message: string) => void>();
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private lastCursorAt = -Infinity;
  private pendingCursor: CursorFx | null = null;
  private cursorTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private opts: ConnOptions) {}

  start(): void {
    this.stopped = false;
    this.open();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimers();
    const ws = this.ws;
    this.ws = null;
    ws?.close(1000, 'bye');
  }

  getSnapshot = (): ConnSnapshot => this.snap;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  onFx(fn: (fx: FxEvent) => void): () => void {
    this.fxListeners.add(fn);
    return () => {
      this.fxListeners.delete(fn);
    };
  }

  onError(fn: (code: string, message: string) => void): () => void {
    this.errorListeners.add(fn);
    return () => {
      this.errorListeners.delete(fn);
    };
  }

  sendAction(action: ItoAction): void {
    this.send({ t: 'action', action });
  }

  sendActivity(activity: Activity): void {
    this.send({ t: 'fx.activity', activity });
  }

  sendPing(x: number, y: number): void {
    this.send({ t: 'fx.ping', x, y });
  }

  /** Limita a ~30 Hz; se chegar no meio do intervalo, envia o mais recente quando o intervalo acabar. */
  sendCursor(cursor: CursorFx): void {
    const now = Date.now();
    const wait = this.lastCursorAt + CURSOR_INTERVAL_MS - now;
    if (wait <= 0 && !this.cursorTimer) {
      this.lastCursorAt = now;
      this.send({ t: 'fx.cursor', ...cursor });
      return;
    }
    this.pendingCursor = cursor;
    if (this.cursorTimer) return;
    this.cursorTimer = setTimeout(() => {
      this.cursorTimer = null;
      const next = this.pendingCursor;
      this.pendingCursor = null;
      if (next) {
        this.lastCursorAt = Date.now();
        this.send({ t: 'fx.cursor', ...next });
      }
    }, Math.max(0, wait));
  }

  retryJoin(name: string, color: string): void {
    this.opts = { ...this.opts, name, color };
    this.setSnap({ status: 'joining', joinError: null });
    if (this.ws && this.ws.readyState === OPEN) this.sendJoin();
    else this.open();
  }

  private open(): void {
    if (this.stopped) return;
    const ws = (this.opts.createSocket ?? defaultSocket)(this.opts.url);
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.attempt = 0;
      this.setSnap({ status: 'joining' });
      this.sendJoin();
      this.startHeartbeat();
    };
    ws.onmessage = (ev) => {
      if (this.ws === ws) this.handle(ev.data);
    };
    ws.onclose = (ev) => {
      if (this.ws === ws) this.handleClose(ev.code);
    };
  }

  private sendJoin(): void {
    this.send({ t: 'join', token: this.opts.token, name: this.opts.name, color: this.opts.color });
  }

  private handle(data: unknown): void {
    if (typeof data !== 'string' || data === HEARTBEAT_PONG) return;
    let msg: ServerMessage;
    try {
      msg = JSON.parse(data) as ServerMessage;
    } catch {
      return;
    }
    switch (msg.t) {
      case 'welcome':
        this.setSnap({ status: 'joined', playerId: msg.playerId, joinError: null });
        return;
      case 'state':
        this.setSnap({ view: msg.room });
        return;
      case 'error':
        if (this.snap.status === 'joining' && JOIN_ERRORS.has(msg.code)) {
          this.setSnap({ status: 'join_failed', joinError: msg.code });
        }
        this.errorListeners.forEach((fn) => fn(msg.code, msg.message));
        return;
      default:
        this.fxListeners.forEach((fn) => fn(msg));
    }
  }

  private handleClose(code: number): void {
    this.stopHeartbeat();
    this.ws = null;
    if (this.stopped) return;
    if (code === CLOSE_REPLACED) return this.setSnap({ status: 'replaced' });
    if (code === CLOSE_GONE) return this.setSnap({ status: 'gone' });
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.attempt);
    this.attempt++;
    this.setSnap({ status: 'reconnecting' });
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.open();
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeat = setInterval(() => {
      if (this.ws && this.ws.readyState === OPEN) this.ws.send(HEARTBEAT_PING);
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  private clearTimers(): void {
    this.stopHeartbeat();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.cursorTimer) clearTimeout(this.cursorTimer);
    this.retryTimer = null;
    this.cursorTimer = null;
  }

  private send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === OPEN) this.ws.send(JSON.stringify(msg));
  }

  private setSnap(patch: Partial<ConnSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((fn) => fn());
  }
}
```

Nota: no teste de "reconecta com backoff", `stop()` não é chamado, e o `join_failed` não bloqueia reconexão de propósito (o socket continua aberto; se cair, reconecta e tenta entrar de novo com os dados atuais).

- [ ] **Step 4: `web/src/net/useConnSnapshot.ts`**

```ts
import { useSyncExternalStore } from 'react';
import type { ConnSnapshot, RoomConnection } from './connection';

const noopSubscribe = () => () => {};
const getNull = () => null;

export function useConnSnapshot(conn: RoomConnection | null): ConnSnapshot | null {
  return useSyncExternalStore(conn ? conn.subscribe : noopSubscribe, conn ? conn.getSnapshot : getNull);
}
```

- [ ] **Step 5: Rodar** — `npm test -w web && npm run typecheck` → PASS.

- [ ] **Step 6: Commit**

```bash
git add web
git commit -m "feat(web): RoomConnection com reconexão, heartbeat e throttle de cursor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Seletores do jogo e posição dos assentos

**Files:**
- Create: `web/test/fixtures.ts`, `web/src/game/derive.ts`, `web/src/table/seatLayout.ts`
- Test: `web/test/derive.test.ts`, `web/test/seat-layout.test.ts`

- [ ] **Step 1: `web/test/fixtures.ts`** (salas reais construídas com as regras do `shared`)

```ts
import { PLAYER_COLORS, createRoom, joinRoom, mulberry32, roomAction, roomView, type ItoAction, type Room, type RoomView } from '@cartolina/shared';

export function makeRoom(n: number): Room {
  let room = createRoom('ABCD', 0);
  for (let i = 0; i < n; i++) {
    const res = joinRoom(room, { token: `t${i}`, name: `P${i}`, color: PLAYER_COLORS[i]! }, `p${i}`, 0);
    if (!res.ok) throw new Error(res.error);
    room = res.room;
  }
  return room;
}

export function act(room: Room, playerId: string, action: ItoAction, seed = 1): Room {
  const res = roomAction(room, playerId, action, mulberry32(seed), 0);
  if (!res.ok) throw new Error(`ação recusada: ${res.error}`);
  return res.room;
}

export function sortingRoom(n: number): Room {
  return act(act(makeRoom(n), 'p0', { type: 'start' }), 'p0', { type: 'beginRound' });
}

export const viewOf = (room: Room, id: string | null): RoomView => roomView(room, id);
```

- [ ] **Step 2: Testes** — `web/test/derive.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { allMineInRow, backsOf, cardsOf, handCards, initialOf, isHost, isPlaying, readyCount, seatStatus } from '../src/game/derive';
import { act, makeRoom, sortingRoom, viewOf } from './fixtures';

describe('derive', () => {
  it('host e participação', () => {
    const room = sortingRoom(2);
    expect(isHost(viewOf(room, 'p0'))).toBe(true);
    expect(isHost(viewOf(room, 'p1'))).toBe(false);
    expect(isPlaying(viewOf(room, 'p1'))).toBe(true);
    expect(isPlaying(viewOf(room, null))).toBe(false);
  });

  it('mão: lugar de cada carta minha', () => {
    let room = sortingRoom(2);
    room = act(room, 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
    const view = viewOf(room, 'p0');
    expect(handCards(view, view.game.row, new Set()).map((h) => h.place)).toEqual(['row']);
    expect(handCards(view, [], new Set()).map((h) => h.place)).toEqual(['hand']);
    expect(handCards(view, [], new Set(['p0:0'])).map((h) => h.place)).toEqual(['drag']);
    expect(handCards(view, [], new Set())[0]?.card.value).not.toBeNull();
  });

  it('costas no assento somem quando a carta está na fila ou sendo carregada', () => {
    const view = viewOf(sortingRoom(2), 'p0');
    expect(backsOf(view, 'p1', [], new Set())).toEqual([true]);
    expect(backsOf(view, 'p1', ['p1:0'], new Set())).toEqual([false]);
    expect(backsOf(view, 'p1', [], new Set(['p1:0']))).toEqual([false]);
  });

  it('status do assento', () => {
    let room = sortingRoom(2);
    const seat = (r = room) => viewOf(r, 'p0').seats[1]!;
    expect(seatStatus(viewOf(room, 'p0'), seat(), undefined)).toBe('pensando');
    expect(seatStatus(viewOf(room, 'p0'), seat(), 'writing')).toBe('escrevendo…');
    expect(seatStatus(viewOf(room, 'p0'), seat(), 'dragging')).toBe('arrastando…');
    room = act(room, 'p1', { type: 'place', cardId: 'p1:0', index: 0 });
    room = act(room, 'p1', { type: 'ready', ready: true });
    expect(seatStatus(viewOf(room, 'p0'), seat(room), 'writing')).toBe('pronto ✓');
    const off = { ...seat(room), connected: false };
    expect(seatStatus(viewOf(room, 'p0'), off, undefined)).toBe('desconectado');
  });

  it('quem entrou depois do início assiste', () => {
    const room = sortingRoom(2);
    const view = viewOf(room, 'p0');
    const spectator = { id: 'p9', name: 'Zé', color: '#C9E27A' as const, connected: true };
    expect(seatStatus(view, spectator, undefined)).toBe('assistindo');
  });

  it('contagem de prontos considera só participantes conectados', () => {
    let room = sortingRoom(3);
    room = act(room, 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
    room = act(room, 'p0', { type: 'ready', ready: true });
    expect(readyCount(viewOf(room, 'p0'))).toEqual({ ready: 1, total: 3 });
  });

  it('todas as minhas cartas na fila', () => {
    const view = viewOf(sortingRoom(2), 'p0');
    expect(allMineInRow(view, [])).toBe(false);
    expect(allMineInRow(view, ['p0:0'])).toBe(true);
    expect(allMineInRow(viewOf(makeRoom(2), 'p0'), [])).toBe(false);
  });

  it('cardsOf ordena por id e initialOf pega a primeira letra', () => {
    const view = viewOf(sortingRoom(2), 'p0');
    expect(cardsOf(view, 'p1').map((c) => c.id)).toEqual(['p1:0']);
    expect(initialOf('  ana')).toBe('A');
    expect(initialOf('😀x')).toBe('😀');
  });
});
```

`web/test/seat-layout.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { arrangeSeats } from '../src/table/seatLayout';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

describe('arrangeSeats', () => {
  it('ordem começa logo depois de mim e dá a volta', () => {
    expect(arrangeSeats(ids(4), 'p2').map((s) => s.id)).toEqual(['p3', 'p0', 'p1']);
  });

  it('1 ou 2 outros ficam no topo', () => {
    expect(arrangeSeats(ids(2), 'p0')).toEqual([{ id: 'p1', side: 'top', pos: 0.5 }]);
    expect(arrangeSeats(ids(3), 'p0').map((s) => s.side)).toEqual(['top', 'top']);
  });

  it('3 a 6 outros: um de cada lado', () => {
    expect(arrangeSeats(ids(4), 'p0').map((s) => s.side)).toEqual(['left', 'top', 'right']);
    expect(arrangeSeats(ids(7), 'p0').map((s) => s.side)).toEqual(['left', 'top', 'top', 'top', 'top', 'right']);
  });

  it('7 a 9 outros: dois de cada lado, esquerda de baixo pra cima', () => {
    const seats = arrangeSeats(ids(10), 'p0');
    expect(seats.map((s) => s.side)).toEqual(['left', 'left', 'top', 'top', 'top', 'top', 'top', 'right', 'right']);
    expect(seats[0]!.pos).toBeGreaterThan(seats[1]!.pos);
    expect(seats[7]!.pos).toBeLessThan(seats[8]!.pos);
  });

  it('posições no topo são equidistantes', () => {
    expect(arrangeSeats(ids(4), 'p0').filter((s) => s.side === 'top').map((s) => s.pos)).toEqual([0.5]);
    expect(arrangeSeats(ids(3), 'p0').map((s) => s.pos)).toEqual([1 / 3, 2 / 3]);
  });

  it('sem "eu" (espectador sem assento) mostra todos', () => {
    expect(arrangeSeats(ids(2), null).map((s) => s.id)).toEqual(['p0', 'p1']);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar** — `npm test -w web` → FAIL.

- [ ] **Step 4: `web/src/game/derive.ts`**

```ts
import type { Activity, ItoCardView, RoomView, SeatView } from '@cartolina/shared';

export type CardPlace = 'hand' | 'row' | 'drag';

export interface HandCard {
  card: ItoCardView;
  place: CardPlace;
}

export type SeatStatus = 'desconectado' | 'assistindo' | 'pronto ✓' | 'escrevendo…' | 'arrastando…' | 'pensando';

export function isHost(view: RoomView): boolean {
  return view.you !== null && view.hostId === view.you;
}

export function isPlaying(view: RoomView): boolean {
  return view.you !== null && view.game.players.includes(view.you);
}

export function cardsOf(view: RoomView, owner: string): ItoCardView[] {
  return Object.values(view.game.cards)
    .filter((c) => c.owner === owner)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function handCards(view: RoomView, row: readonly string[], inFlight: ReadonlySet<string>): HandCard[] {
  if (!view.you) return [];
  return cardsOf(view, view.you).map((card) => ({
    card,
    place: inFlight.has(card.id) ? 'drag' : row.includes(card.id) ? 'row' : 'hand',
  }));
}

/** Uma entrada por carta do dono: `true` = ainda na mão (mostra costas), `false` = slot vazio. */
export function backsOf(view: RoomView, owner: string, row: readonly string[], inFlight: ReadonlySet<string>): boolean[] {
  return cardsOf(view, owner).map((c) => !row.includes(c.id) && !inFlight.has(c.id));
}

export function seatStatus(view: RoomView, seat: SeatView, activity: Activity | undefined): SeatStatus {
  if (!seat.connected) return 'desconectado';
  const { phase, players, ready } = view.game;
  if (phase !== 'lobby' && !players.includes(seat.id)) return 'assistindo';
  if (phase === 'sorting' && ready.includes(seat.id)) return 'pronto ✓';
  if (activity === 'writing') return 'escrevendo…';
  if (activity === 'dragging') return 'arrastando…';
  return 'pensando';
}

export function readyCount(view: RoomView): { ready: number; total: number } {
  const connected = new Set(view.seats.filter((s) => s.connected).map((s) => s.id));
  const players = view.game.players.filter((p) => connected.has(p));
  return { ready: players.filter((p) => view.game.ready.includes(p)).length, total: players.length };
}

export function allMineInRow(view: RoomView, row: readonly string[]): boolean {
  const mine = view.you ? cardsOf(view, view.you) : [];
  return mine.length > 0 && mine.every((c) => row.includes(c.id));
}

export function initialOf(name: string): string {
  return (Array.from(name.trim())[0] ?? '?').toUpperCase();
}
```

- [ ] **Step 5: `web/src/table/seatLayout.ts`**

```ts
export type Side = 'left' | 'top' | 'right';

export interface SeatSlot {
  id: string;
  side: Side;
  /** 0–1 ao longo do lado: no topo, da esquerda pra direita; nas laterais, de cima pra baixo. */
  pos: number;
}

/**
 * Eu fico embaixo; os outros seguem em sentido horário a partir da minha esquerda:
 * lateral esquerda (de baixo pra cima), topo (esquerda → direita), lateral direita (de cima pra baixo).
 */
export function arrangeSeats(seatIds: readonly string[], me: string | null): SeatSlot[] {
  const i = me ? seatIds.indexOf(me) : -1;
  const others = i >= 0 ? [...seatIds.slice(i + 1), ...seatIds.slice(0, i)] : [...seatIds];
  const n = others.length;
  const perSide = n >= 7 ? 2 : n >= 3 ? 1 : 0;
  const top = n - 2 * perSide;
  const sidePos = (j: number, fromBottom: boolean) => {
    if (perSide === 1) return 0.5;
    const order = fromBottom ? [0.68, 0.32] : [0.32, 0.68];
    return order[j]!;
  };
  const slots: SeatSlot[] = [];
  let k = 0;
  for (let j = 0; j < perSide; j++) slots.push({ id: others[k++]!, side: 'left', pos: sidePos(j, true) });
  for (let j = 0; j < top; j++) slots.push({ id: others[k++]!, side: 'top', pos: (j + 1) / (top + 1) });
  for (let j = 0; j < perSide; j++) slots.push({ id: others[k++]!, side: 'right', pos: sidePos(j, false) });
  return slots;
}
```

- [ ] **Step 6: Rodar** — `npm test -w web && npm run typecheck` → PASS.

- [ ] **Step 7: Commit**

```bash
git add web
git commit -m "feat(web): seletores do jogo e posição dos assentos ao redor da mesa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Matemática da mesa (molas, homografia, fila)

Port fiel do protótipo, com tipos e testes.

**Files:**
- Create: `web/src/table/constants.ts`, `web/src/table/spring.ts`, `web/src/table/homography.ts`, `web/src/table/rowLayout.ts`
- Test: `web/test/table-math.test.ts`

- [ ] **Step 1: Testes** — `web/test/table-math.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CW, FH, FW, NAT_STEP, ROW_S, ROW_X0, ROW_X1, ROW_Y } from '../src/table/constants';
import { applyH, inv3, solveH } from '../src/table/homography';
import {
  INTENT_TTL_MS,
  cursorFromLocal,
  effectiveRow,
  inRowZone,
  insertIndex,
  intentSettled,
  rowEntries,
  toServerIndex,
  toVisibleIndex,
} from '../src/table/rowLayout';
import { Spring } from '../src/table/spring';

const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('Spring', () => {
  it('converge para o alvo e para', () => {
    const s = new Spring(0, 300, 0.8);
    s.t = 10;
    for (let i = 0; i < 300; i++) s.step(1 / 60);
    expect(s.v).toBe(10);
    expect(s.vel).toBe(0);
    expect(s.resting).toBe(true);
  });

  it('snap fixa valor e alvo', () => {
    const s = new Spring(0).snap(5);
    expect([s.v, s.t, s.vel]).toEqual([5, 5, 0]);
  });

  it('dt grande não explode (substeps)', () => {
    const s = new Spring(0, 1400, 0.92);
    s.t = 100;
    s.step(0.5);
    expect(Number.isFinite(s.v)).toBe(true);
    expect(Math.abs(s.v)).toBeLessThan(200);
  });
});

describe('homografia', () => {
  const src = [[0, 0], [FW, 0], [0, FH], [FW, FH]] as const;

  it('identidade', () => {
    const H = solveH(src, src);
    const [x, y] = applyH(H, 123, 45);
    close(x, 123);
    close(y, 45);
  });

  it('trapézio (mesa inclinada) e volta', () => {
    const dst = [[100, 50], [800, 50], [0, 400], [900, 400]] as const;
    const H = solveH(src, dst);
    const [x0, y0] = applyH(H, 0, 0);
    close(x0, 100, 1e-4);
    close(y0, 50, 1e-4);
    const [sx, sy] = applyH(H, 300, 200);
    const [lx, ly] = applyH(inv3(H), sx, sy);
    close(lx, 300, 1e-4);
    close(ly, 200, 1e-4);
  });
});

describe('rowEntries', () => {
  it('uma carta fica no centro', () => {
    expect(rowEntries(['a'], [])).toEqual([{ kind: 'card', id: 'a', x: FW / 2, slot: 0 }]);
  });

  it('poucas cartas ficam a NAT_STEP e centradas', () => {
    const xs = rowEntries(['a', 'b', 'c'], []).map((e) => e.x);
    close(xs[1]! - xs[0]!, NAT_STEP);
    close(xs[1]!, FW / 2);
  });

  it('muitas cartas comprimem dentro da faixa', () => {
    const row = Array.from({ length: 20 }, (_, i) => `c${i}`);
    const xs = rowEntries(row, []).map((e) => e.x);
    const w = CW * ROW_S;
    expect(xs[1]! - xs[0]!).toBeLessThan(NAT_STEP);
    expect(xs[0]!).toBeGreaterThanOrEqual(ROW_X0 + w / 2 - 1e-6);
    expect(xs[19]!).toBeLessThanOrEqual(ROW_X1 - w / 2 + 1e-6);
  });

  it('buraco entra no índice pedido e é limitado ao tamanho', () => {
    expect(rowEntries(['a', 'b'], [{ owner: 'x', index: 1 }]).map((e) => (e.kind === 'card' ? e.id : `gap:${e.owner}`))).toEqual(['a', 'gap:x', 'b']);
    expect(rowEntries(['a'], [{ owner: 'x', index: 9 }]).map((e) => e.kind)).toEqual(['card', 'gap']);
  });

  it('insertIndex conta cartas à esquerda do ponto', () => {
    const entries = rowEntries(['a', 'b', 'c'], []);
    expect(insertIndex(entries, 0)).toBe(0);
    expect(insertIndex(entries, (entries[1]!.x + entries[2]!.x) / 2)).toBe(2);
    expect(insertIndex(entries, FW)).toBe(3);
  });
});

describe('intenções otimistas', () => {
  it('place move a carta; return tira; em voo some da fila visível', () => {
    expect(effectiveRow(['a', 'b'], { kind: 'place', cardId: 'm', index: 1, at: 0 }, new Set())).toEqual(['a', 'm', 'b']);
    expect(effectiveRow(['a', 'm', 'b'], { kind: 'place', cardId: 'm', index: 0, at: 0 }, new Set())).toEqual(['m', 'a', 'b']);
    expect(effectiveRow(['a', 'm'], { kind: 'return', cardId: 'm', at: 0 }, new Set())).toEqual(['a']);
    expect(effectiveRow(['a', 'b'], null, new Set(['b']))).toEqual(['a']);
  });

  it('intenção resolve quando o servidor concorda ou expira', () => {
    const place = { kind: 'place' as const, cardId: 'm', index: 1, at: 0 };
    expect(intentSettled(['a', 'b'], place, 10)).toBe(false);
    expect(intentSettled(['a', 'm', 'b'], place, 10)).toBe(true);
    expect(intentSettled(['a', 'b'], place, INTENT_TTL_MS + 1)).toBe(true);
    expect(intentSettled(['a'], { kind: 'return', cardId: 'm', at: 0 }, 10)).toBe(true);
  });

  it('toServerIndex compensa cartas escondidas (sendo carregadas por outros)', () => {
    const server = ['a', 'b', 'c'];
    const visible = ['a', 'c'];
    expect(toServerIndex(visible, server, 'm', 0)).toBe(0);
    expect(toServerIndex(visible, server, 'm', 1)).toBe(1);
    expect(toServerIndex(visible, server, 'm', 2)).toBe(3);
  });

  it('toServerIndex ignora a própria carta na fila do servidor', () => {
    expect(toServerIndex(['a', 'b'], ['m', 'a', 'b'], 'm', 2)).toBe(2);
  });

  it('toVisibleIndex é o inverso aproximado', () => {
    expect(toVisibleIndex(['a', 'c'], ['a', 'b', 'c'], 'm', 2)).toBe(1);
    expect(toVisibleIndex(['a', 'c'], ['a', 'b', 'c'], 'm', 3)).toBe(2);
  });
});

describe('zonas', () => {
  it('cursor na mesa vira coordenada normalizada; fora vira mão', () => {
    expect(cursorFromLocal(FW / 2, FH / 2)).toEqual({ zone: 'table', x: 0.5, y: 0.5 });
    expect(cursorFromLocal(FW / 2, FH + 200)).toEqual({ zone: 'hand', x: 0, y: 0 });
  });

  it('zona da fila', () => {
    expect(inRowZone(FW / 2, ROW_Y)).toBe(true);
    expect(inRowZone(FW / 2, 20)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -w web -- table-math` → FAIL.

- [ ] **Step 3: `web/src/table/constants.ts`**

```ts
/** Feltro em coordenadas locais (px antes do tilt/escala). */
export const FW = 900;
export const FH = 480;
/** Linha onde as cartas assentam. */
export const ROW_Y = 318;
/** Carta: largura/altura base. */
export const CW = 88;
export const CH = 120;
/** Escala da carta na fila e na mão. */
export const ROW_S = 0.85;
export const HAND_S = 1.2;
/** Inclinação padrão da mesa e perspectiva. */
export const TILT = 38;
export const PERSP = 900;
/** Faixa útil da fila e passo natural entre cartas. */
export const ROW_X0 = 96;
export const ROW_X1 = FW - 96;
export const NAT_STEP = CW * ROW_S + 10;
```

- [ ] **Step 4: `web/src/table/spring.ts`**

```ts
/** Mola amortecida (Euler semi-implícito com substeps fixos a 240 Hz). */
export class Spring {
  v: number;
  t: number;
  vel = 0;
  k = 0;
  c = 0;

  constructor(v = 0, k = 300, zeta = 0.8) {
    this.v = v;
    this.t = v;
    this.set(k, zeta);
  }

  set(k: number, zeta: number): this {
    this.k = k;
    this.c = 2 * zeta * Math.sqrt(k);
    return this;
  }

  snap(v: number): this {
    this.v = v;
    this.t = v;
    this.vel = 0;
    return this;
  }

  get resting(): boolean {
    return this.vel === 0 && this.v === this.t;
  }

  step(dt: number): number {
    if (this.resting) return this.v;
    const n = Math.max(1, Math.ceil(dt * 240));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = -this.k * (this.v - this.t) - this.c * this.vel;
      this.vel += a * h;
      this.v += this.vel * h;
    }
    if (Math.abs(this.v - this.t) < 1e-4 && Math.abs(this.vel) < 1e-3) {
      this.v = this.t;
      this.vel = 0;
    }
    return this.v;
  }
}
```

- [ ] **Step 5: `web/src/table/homography.ts`**

```ts
export type Point = readonly [number, number];
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

/** Homografia que leva os 4 pontos `src` aos 4 pontos `dst` (eliminação de Gauss com pivô parcial). */
export function solveH(src: readonly Point[], dst: readonly Point[]): Mat3 {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i]!;
    const [u, v] = dst[i]!;
    A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -x * v, -y * v]);
    b.push(v);
  }
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r]![c]!) > Math.abs(A[p]![c]!)) p = r;
    [A[c], A[p]] = [A[p]!, A[c]!];
    [b[c], b[p]] = [b[p]!, b[c]!];
    const pivot = A[c]!;
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const row = A[r]!;
      const f = row[c]! / pivot[c]!;
      if (!f) continue;
      for (let k = c; k < 8; k++) row[k] = row[k]! - f * pivot[k]!;
      b[r] = b[r]! - f * b[c]!;
    }
  }
  const h = b.map((v, i) => v / A[i]![i]!);
  return [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!, 1];
}

export function inv3(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    A / det,
    -(b * i - c * h) / det,
    (b * f - c * e) / det,
    B / det,
    (a * i - c * g) / det,
    -(a * f - c * d) / det,
    C / det,
    -(a * h - b * g) / det,
    (a * e - b * d) / det,
  ];
}

export function applyH(m: Mat3, x: number, y: number): [number, number] {
  const w = m[6] * x + m[7] * y + m[8];
  return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w];
}
```

- [ ] **Step 6: `web/src/table/rowLayout.ts`**

```ts
import { CW, FH, FW, NAT_STEP, ROW_S, ROW_X0, ROW_X1, ROW_Y } from './constants';

export interface GapSpec {
  owner: string;
  index: number;
}

export type RowEntry =
  | { kind: 'card'; id: string; x: number; slot: number }
  | { kind: 'gap'; owner: string; x: number; slot: number };

/** Posições x (coordenadas do feltro) das cartas e buracos, centradas e comprimidas se não couberem. */
export function rowEntries(row: readonly string[], gaps: readonly GapSpec[]): RowEntry[] {
  const n = row.length;
  const clamped = gaps.map((g) => ({ owner: g.owner, index: Math.max(0, Math.min(g.index, n)) }));
  const items: Array<{ kind: 'card'; id: string } | { kind: 'gap'; owner: string }> = [];
  for (let i = 0; i <= n; i++) {
    for (const g of clamped) if (g.index === i) items.push({ kind: 'gap', owner: g.owner });
    if (i < n) items.push({ kind: 'card', id: row[i]! });
  }
  const m = items.length;
  const w = CW * ROW_S;
  const step = m > 1 ? Math.min(NAT_STEP, (ROW_X1 - ROW_X0 - w) / (m - 1)) : 0;
  const x0 = FW / 2 - (w + step * (m - 1)) / 2 + w / 2;
  return items.map((it, slot) => ({ ...it, x: x0 + slot * step, slot }));
}

/** Índice de inserção (entre as cartas visíveis) para um ponto x do feltro. */
export function insertIndex(entries: readonly RowEntry[], lx: number): number {
  let n = 0;
  for (const e of entries) if (e.kind === 'card' && e.x < lx) n++;
  return n;
}

export type Intent =
  | { kind: 'place'; cardId: string; index: number; at: number }
  | { kind: 'return'; cardId: string; at: number };

export const INTENT_TTL_MS = 1500;

/** Fila que este cliente mostra: a do servidor + minha intenção pendente − cartas em voo. */
export function effectiveRow(serverRow: readonly string[], pending: Intent | null, inFlight: ReadonlySet<string>): string[] {
  let row = [...serverRow];
  if (pending) {
    row = row.filter((id) => id !== pending.cardId);
    if (pending.kind === 'place') row.splice(Math.min(pending.index, row.length), 0, pending.cardId);
  }
  return row.filter((id) => !inFlight.has(id));
}

export function intentSettled(serverRow: readonly string[], pending: Intent, now: number): boolean {
  if (now - pending.at > INTENT_TTL_MS) return true;
  return pending.kind === 'place'
    ? serverRow.indexOf(pending.cardId) === pending.index
    : !serverRow.includes(pending.cardId);
}

/** Converte "índice entre as cartas que eu vejo" para o índice que o servidor espera em `place`. */
export function toServerIndex(visible: readonly string[], server: readonly string[], cardId: string, index: number): number {
  const base = server.filter((id) => id !== cardId);
  if (index <= 0) return 0;
  const prev = visible[index - 1];
  const pos = prev === undefined ? -1 : base.indexOf(prev);
  return pos >= 0 ? pos + 1 : Math.min(index, base.length);
}

/** Inverso de `toServerIndex`: onde abrir o buraco de um arrasto remoto na fila que eu vejo. */
export function toVisibleIndex(visible: readonly string[], server: readonly string[], cardId: string, index: number): number {
  const before = new Set(server.filter((id) => id !== cardId).slice(0, index));
  return visible.filter((id) => before.has(id)).length;
}

export function cursorFromLocal(lx: number, ly: number): { zone: 'table' | 'hand'; x: number; y: number } {
  const inside = lx > -60 && lx < FW + 60 && ly > -60 && ly < FH + 60;
  if (!inside) return { zone: 'hand', x: 0, y: 0 };
  const clamp = (v: number) => Math.max(-1, Math.min(2, v));
  return { zone: 'table', x: clamp(lx / FW), y: clamp(ly / FH) };
}

export function inRowZone(lx: number, ly: number): boolean {
  return lx > -40 && lx < FW + 40 && ly > ROW_Y - 150 && ly < FH + 50;
}
```

- [ ] **Step 7: Rodar** — `npm test -w web && npm run typecheck` → PASS.

- [ ] **Step 8: Commit**

```bash
git add web
git commit -m "feat(web): molas, homografia e layout da fila (port do protótipo)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Telas — início, entrada, lobby

**Files:**
- Create: `web/src/screens/Avatar.tsx`, `Home.tsx`, `JoinForm.tsx`, `RoomScreen.tsx`, `Lobby.tsx`, `Game.tsx`, `Toasts.tsx`
- Modify: `web/src/App.tsx`
- Test: `web/test/screens.test.tsx`

- [ ] **Step 1: Testes** — `web/test/screens.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GameConn } from '../src/net/connection';
import { JoinForm } from '../src/screens/JoinForm';
import { Lobby } from '../src/screens/Lobby';
import { makeRoom, viewOf } from './fixtures';

function fakeConn(): GameConn & { sendAction: ReturnType<typeof vi.fn> } {
  return {
    sendAction: vi.fn(),
    sendActivity: vi.fn(),
    sendCursor: vi.fn(),
    sendPing: vi.fn(),
    onFx: vi.fn(() => () => {}),
    onError: vi.fn(() => () => {}),
  };
}

describe('JoinForm', () => {
  it('desabilita cores ocupadas e exige nome', () => {
    const onSubmit = vi.fn();
    render(<JoinForm takenColors={['#8EC5FF']} initial={null} busy={false} error={null} onSubmit={onSubmit} />);
    expect(screen.getByRole('button', { name: 'cor #8EC5FF' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'entrar' }));
    expect(screen.getByText('Escolha um nome de 1 a 16 letras.')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('envia nome limpo e a cor escolhida', () => {
    const onSubmit = vi.fn();
    render(<JoinForm takenColors={[]} initial={null} busy={false} error={null} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText('seu nome'), { target: { value: '  Ana  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'cor #FF8FAB' }));
    fireEvent.click(screen.getByRole('button', { name: 'entrar' }));
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Ana', color: '#FF8FAB' });
  });

  it('mostra o erro vindo do servidor', () => {
    render(<JoinForm takenColors={[]} initial={null} busy={false} error="color_taken" onSubmit={() => {}} />);
    expect(screen.getByText('Essa cor já foi escolhida.')).toBeTruthy();
  });
});

describe('Lobby', () => {
  it('host escolhe o modo e começa', () => {
    const conn = fakeConn();
    render(<Lobby view={viewOf(makeRoom(2), 'p0')} conn={conn} />);
    fireEvent.click(screen.getByRole('button', { name: /campanha/ }));
    expect(conn.sendAction).toHaveBeenCalledWith({ type: 'setMode', mode: 'campanha' });
    fireEvent.click(screen.getByRole('button', { name: 'começar' }));
    expect(conn.sendAction).toHaveBeenCalledWith({ type: 'start' });
  });

  it('host sozinho não consegue começar', () => {
    render(<Lobby view={viewOf(makeRoom(1), 'p0')} conn={fakeConn()} />);
    expect(screen.getByRole('button', { name: 'começar' })).toBeDisabled();
  });

  it('quem não é host espera', () => {
    render(<Lobby view={viewOf(makeRoom(2), 'p1')} conn={fakeConn()} />);
    expect(screen.queryByRole('button', { name: 'começar' })).toBeNull();
    expect(screen.getByText('esperando o host começar…')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -w web -- screens` → FAIL.

- [ ] **Step 3: `web/src/screens/Avatar.tsx`**

```tsx
import type { CSSProperties } from 'react';
import { initialOf } from '../game/derive';

export function Avatar({ name, color, anchor }: { name: string; color: string; anchor?: string }) {
  return (
    <div className="avatar" style={{ '--c': color } as CSSProperties} data-seat-anchor={anchor}>
      {initialOf(name)}
    </div>
  );
}
```

- [ ] **Step 4: `web/src/screens/Home.tsx`**

```tsx
import { useState, type FormEvent } from 'react';
import { goToRoom } from '../lib/router';
import { createRoom } from '../net/api';

export function Home() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      goToRoom(await createRoom());
    } catch {
      setError('Não deu pra criar a sala. O servidor tá ligado?');
    } finally {
      setBusy(false);
    }
  }

  function enter(e: FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (/^[A-Z0-9]{4}$/.test(c)) goToRoom(c);
    else setError('O código da sala tem 4 letras.');
  }

  return (
    <main className="screen">
      <h1 className="logo big">
        cartolina<span>~</span>
      </h1>
      <p className="tagline">jogos de tabuleiro pra jogar com a galera na call</p>
      <section className="panel">
        <h2>ITO</h2>
        <p>Cada um recebe um número secreto de 1 a 100. Sem dizer o número, use o tema pra dar dicas e coloquem as cartas em ordem juntos.</p>
        <button className="btn" onClick={create} disabled={busy}>
          {busy ? 'criando…' : 'criar sala'}
        </button>
        <form className="row-inline" onSubmit={enter}>
          <input
            className="text-in"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="KXQ7"
            maxLength={4}
            aria-label="código da sala"
          />
          <button className="sbtn solid" type="submit">
            entrar na sala
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </section>
    </main>
  );
}
```

- [ ] **Step 5: `web/src/screens/JoinForm.tsx`**

```tsx
import { PLAYER_COLORS, cleanName, errorMessage, NAME_MAX, type PlayerColor } from '@cartolina/shared';
import { useState, type CSSProperties, type FormEvent } from 'react';
import type { Profile } from '../net/identity';

interface Props {
  takenColors: readonly string[];
  initial: Profile | null;
  busy: boolean;
  error: string | null;
  onSubmit(profile: Profile): void;
}

export function JoinForm({ takenColors, initial, busy, error, onSubmit }: Props) {
  const firstFree = PLAYER_COLORS.find((c) => !takenColors.includes(c)) ?? PLAYER_COLORS[0];
  const [name, setName] = useState(initial?.name ?? '');
  const [color, setColor] = useState<PlayerColor>(
    initial && !takenColors.includes(initial.color) ? initial.color : firstFree,
  );
  const [localError, setLocalError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const clean = cleanName(name);
    if (!clean) {
      setLocalError(errorMessage('bad_name'));
      return;
    }
    setLocalError(null);
    onSubmit({ name: clean, color });
  }

  const shown = localError ?? (error ? errorMessage(error) : null);
  return (
    <form className="panel" onSubmit={submit}>
      <h2>quem é você?</h2>
      <label className="field">
        seu nome
        <input
          className="text-in"
          aria-label="seu nome"
          value={name}
          maxLength={NAME_MAX * 2}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ana"
          autoFocus
        />
      </label>
      <div className="field">
        sua cor
        <div className="swatches">
          {PLAYER_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className="swatch"
              aria-label={`cor ${c}`}
              aria-pressed={c === color}
              disabled={takenColors.includes(c)}
              style={{ '--c': c } as CSSProperties}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
      </div>
      {shown && <p className="error">{shown}</p>}
      <button className="btn" type="submit" disabled={busy}>
        {busy ? 'entrando…' : 'entrar'}
      </button>
    </form>
  );
}
```

- [ ] **Step 6: `web/src/screens/Toasts.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { JOIN_ERRORS, type GameConn } from '../net/connection';

export function Toasts({ conn }: { conn: Pick<GameConn, 'onError'> }) {
  const [items, setItems] = useState<{ id: number; text: string }[]>([]);
  useEffect(
    () =>
      conn.onError((code, message) => {
        if (JOIN_ERRORS.has(code)) return;
        const id = Date.now() + Math.random();
        setItems((xs) => [...xs, { id, text: message }]);
        setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3200);
      }),
    [conn],
  );
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="toast">
          {t.text}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 7: `web/src/screens/Lobby.tsx`**

```tsx
import { MIN_PLAYERS, type ItoMode, type RoomView } from '@cartolina/shared';
import { isHost } from '../game/derive';
import type { GameConn } from '../net/connection';
import { Avatar } from './Avatar';

const MODES: { mode: ItoMode; title: string; text: string }[] = [
  { mode: 'livre', title: 'livre', text: '1 carta por pessoa. Acertou a ordem, ganhou. Joga quantas rodadas quiser.' },
  { mode: 'campanha', title: 'campanha', text: '3 vidas e 3 níveis (1, 2 e 3 cartas por pessoa). Cada carta fora de ordem custa uma vida.' },
];

export function Lobby({ view, conn }: { view: RoomView; conn: GameConn }) {
  const host = isHost(view);
  const connected = view.seats.filter((s) => s.connected).length;
  const link = `${window.location.origin}${window.location.pathname}#/sala/${view.code}`;
  return (
    <main className="screen">
      <h1 className="logo">
        cartolina<span>~</span>
      </h1>
      <section className="panel">
        <h2>sala {view.code}</h2>
        <ul className="seat-list">
          {view.seats.map((s) => (
            <li key={s.id} className={s.connected ? '' : 'off'}>
              <Avatar name={s.name} color={s.color} />
              <span>
                {s.name}
                {s.id === view.you ? ' (você)' : ''}
                {s.id === view.hostId ? ' · host' : ''}
              </span>
            </li>
          ))}
        </ul>
        <button className="sbtn" type="button" onClick={() => void navigator.clipboard?.writeText(link)}>
          copiar link da sala
        </button>
      </section>
      <section className="panel">
        <h2>modo</h2>
        <div className="modes">
          {MODES.map((m) => (
            <button
              key={m.mode}
              type="button"
              className={`mode ${view.game.mode === m.mode ? 'on' : ''}`}
              disabled={!host}
              onClick={() => conn.sendAction({ type: 'setMode', mode: m.mode })}
            >
              <b>{m.title}</b>
              <span>{m.text}</span>
            </button>
          ))}
        </div>
        {host ? (
          <button className="btn" type="button" disabled={connected < MIN_PLAYERS} onClick={() => conn.sendAction({ type: 'start' })}>
            começar
          </button>
        ) : (
          <p className="hint">esperando o host começar…</p>
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 8: `web/src/screens/Game.tsx`** (provisório: a Task 11 troca o placeholder pela `Table`)

```tsx
import type { RoomView } from '@cartolina/shared';
import type { ConnSnapshot, GameConn } from '../net/connection';
import { Lobby } from './Lobby';
import { Toasts } from './Toasts';

export function Game({ conn, snap, view }: { conn: GameConn; snap: ConnSnapshot; view: RoomView }) {
  return (
    <>
      {snap.status === 'reconnecting' && <div className="banner-reconnect">reconectando…</div>}
      {view.game.phase === 'lobby' ? (
        <Lobby view={view} conn={conn} />
      ) : (
        <main className="screen">
          <p className="hint">mesa em construção (fase {view.game.phase})</p>
        </main>
      )}
      <Toasts conn={conn} />
    </>
  );
}
```

- [ ] **Step 9: `web/src/screens/RoomScreen.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react';
import { goHome } from '../lib/router';
import { getRoomInfo, type RoomInfo } from '../net/api';
import { wsUrl } from '../net/config';
import { RoomConnection } from '../net/connection';
import { getToken, loadProfile, markJoined, saveProfile, wasJoined, type Profile } from '../net/identity';
import { useConnSnapshot } from '../net/useConnSnapshot';
import { Game } from './Game';
import { JoinForm } from './JoinForm';

function connect(code: string, profile: Profile): RoomConnection {
  return new RoomConnection({ url: wsUrl(code), token: getToken(), name: profile.name, color: profile.color });
}

function Message({ title, text }: { title: string; text: string }) {
  return (
    <main className="screen">
      <h1 className="logo">
        cartolina<span>~</span>
      </h1>
      <section className="panel">
        <h2>{title}</h2>
        <p>{text}</p>
        <button className="btn" type="button" onClick={goHome}>
          voltar pro início
        </button>
      </section>
    </main>
  );
}

export function RoomScreen({ code }: { code: string }) {
  const [info, setInfo] = useState<RoomInfo | null | undefined>(undefined);
  const [conn, setConn] = useState<RoomConnection | null>(null);
  const snap = useConnSnapshot(conn);

  const refresh = useCallback(() => {
    getRoomInfo(code)
      .then(setInfo)
      .catch(() => setInfo(null));
  }, [code]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!conn) return;
    conn.start();
    return () => conn.stop();
  }, [conn]);

  // Recarregou a página numa sala em que esta aba já tinha entrado: entra de novo sozinho.
  useEffect(() => {
    if (!info || conn || !wasJoined(code)) return;
    const profile = loadProfile();
    if (profile) setConn(connect(code, profile));
  }, [info, conn, code]);

  const status = snap?.status;
  useEffect(() => {
    if (status === 'joined') markJoined(code);
    if (status === 'join_failed') refresh();
  }, [status, code, refresh]);

  if (info === undefined) return <Message title="carregando…" text="procurando a sala" />;
  if (info === null || status === 'gone') {
    return <Message title="sala não encontrada" text="Essa sala não existe ou expirou. Crie uma nova no início." />;
  }
  if (status === 'replaced') {
    return <Message title="você abriu a sala em outra aba" text="Continue jogando na outra aba, ou recarregue esta pra voltar." />;
  }
  if (conn && snap && snap.status !== 'join_failed' && snap.view) {
    return <Game conn={conn} snap={snap} view={snap.view} />;
  }

  const busy = !!snap && (snap.status === 'connecting' || snap.status === 'joining');
  const submit = (profile: Profile) => {
    saveProfile(profile);
    if (conn) conn.retryJoin(profile.name, profile.color);
    else setConn(connect(code, profile));
  };
  const initial = loadProfile();
  const takenColors = info.seats.map((s) => s.color).filter((c) => c !== initial?.color || !wasJoined(code));
  return (
    <main className="screen">
      <h1 className="logo">
        cartolina<span>~</span>
      </h1>
      <p className="tagline">sala {code}</p>
      <JoinForm takenColors={takenColors} initial={initial} busy={busy} error={snap?.joinError ?? null} onSubmit={submit} />
    </main>
  );
}
```

- [ ] **Step 10: `web/src/App.tsx`** (substituir inteiro)

```tsx
import { useHashRoute } from './lib/router';
import { Home } from './screens/Home';
import { RoomScreen } from './screens/RoomScreen';

export function App() {
  const route = useHashRoute();
  return route.name === 'room' ? <RoomScreen key={route.code} code={route.code} /> : <Home />;
}
```

- [ ] **Step 11: Rodar** — `npm test -w web && npm run typecheck && npm run build` → PASS.

- [ ] **Step 12: Fumaça manual rápida (só se houver navegador disponível; senão pule e diga no relatório)** — suba `npm run dev:server` e `npm run dev:web` (em background), abra `http://localhost:5173`, crie sala, entre com nome/cor numa aba e com outra cor numa segunda aba: o lobby das duas deve listar os dois e o host deve conseguir começar (a mesa ainda é placeholder). Encerre os servidores.

- [ ] **Step 13: Commit**

```bash
git add web
git commit -m "feat(web): telas de início, entrada e lobby ligadas ao servidor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Motor da mesa (`TableEngine`) e estilos

Port do protótipo para um motor que consome `RoomView` e eventos remotos. Funções puras já testadas na Task 8; aqui há um teste de fumaça em jsdom.

**Files:**
- Create: `web/src/table/engine.ts`, `web/src/table/table.css`
- Test: `web/test/engine.test.ts`

- [ ] **Step 1: Teste de fumaça** — `web/test/engine.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TableEngine, type EngineDom } from '../src/table/engine';
import { act, sortingRoom, viewOf } from './fixtures';

function dom(): EngineDom {
  const make = () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    return el;
  };
  return { wrap: make(), felt: make(), row: make(), overlay: make(), cursors: make(), tip: make(), markers: [make(), make(), make(), make()] };
}

const handlers = () => ({ place: vi.fn(), ret: vi.fn(), cursor: vi.fn(), activity: vi.fn(), ping: vi.fn(), revealDone: vi.fn() });

describe('TableEngine (fumaça)', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('mostra a fila do servidor e avisa assinantes', () => {
    let room = sortingRoom(2);
    room = act(room, 'p1', { type: 'place', cardId: 'p1:0', index: 0 });
    const d = dom();
    const engine = new TableEngine(d, handlers());
    const spy = vi.fn();
    engine.subscribe(spy);
    engine.update(viewOf(room, 'p0'));
    expect(engine.getSnapshot().row).toEqual(['p1:0']);
    expect(spy).toHaveBeenCalled();
    expect(d.row.querySelectorAll('.rcard')).toHaveLength(1);
    engine.destroy();
  });

  it('nova rodada tira as cartas antigas da fila', () => {
    let room = sortingRoom(2);
    room = act(room, 'p1', { type: 'place', cardId: 'p1:0', index: 0 });
    const engine = new TableEngine(dom(), handlers());
    engine.update(viewOf(room, 'p0'));
    room = act(room, 'p0', { type: 'next' });
    engine.update(viewOf(room, 'p0'));
    expect(engine.getSnapshot().row).toEqual([]);
    engine.destroy();
  });

  it('rollback volta para a fila do servidor', () => {
    const engine = new TableEngine(dom(), handlers());
    engine.update(viewOf(sortingRoom(2), 'p0'));
    engine.rollback();
    expect(engine.getSnapshot().row).toEqual([]);
    engine.destroy();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -w web -- engine` → FAIL.

- [ ] **Step 3: `web/src/table/engine.ts`**

```ts
import type { Activity, CursorFx, ItoCardView, RevealEntry, RoomView } from '@cartolina/shared';
import { CW, FH, FW, HAND_S, PERSP, ROW_S, ROW_Y, TILT } from './constants';
import { applyH, inv3, solveH, type Mat3 } from './homography';
import {
  cursorFromLocal,
  effectiveRow,
  inRowZone,
  insertIndex,
  intentSettled,
  rowEntries,
  toServerIndex,
  toVisibleIndex,
  type GapSpec,
  type Intent,
  type RowEntry,
} from './rowLayout';
import { Spring } from './spring';

export interface EngineDom {
  wrap: HTMLElement;
  felt: HTMLElement;
  row: HTMLElement;
  overlay: HTMLElement;
  cursors: HTMLElement;
  tip: HTMLElement;
  markers: HTMLElement[];
}

export interface EngineHandlers {
  place(cardId: string, index: number): void;
  ret(cardId: string): void;
  cursor(fx: CursorFx): void;
  activity(activity: Activity): void;
  ping(x: number, y: number): void;
  revealDone(): void;
}

export interface EngineSnapshot {
  /** Fila que este cliente mostra (servidor + intenção pendente − cartas em voo). */
  row: readonly string[];
  /** Cartas fora da fila e fora da mão: sendo carregadas ou voando. */
  inFlight: ReadonlySet<string>;
  revealing: boolean;
}

export type RemoteCursorFx = CursorFx & { from: string };

type SpringKey = 'x' | 'y' | 'z' | 'stand' | 'rs' | 'wob' | 'flip' | 'shake' | 'stamp';

interface RowCard {
  id: string;
  owner: string;
  el: HTMLElement;
  flipEl: HTMLElement;
  faceA: HTMLElement;
  faceB: HTMLElement;
  stampEl: HTMLElement;
  tilt: number;
  landing: boolean;
  shown: boolean;
  appear: 'snap' | 'pop' | null;
  paintedA: string;
  paintedB: string;
  sp: Record<SpringKey, Spring>;
}

interface Overlay {
  cardId: string;
  owner: string;
  el: HTMLElement;
  flipEl: HTMLElement;
  tilt: number;
  x: Spring;
  y: Spring;
  s: Spring;
  rot: Spring;
  rx: Spring;
  fl: Spring;
  home: (() => [number, number, number, number] | null) | null;
  homeT: number;
}

interface Gap {
  el: HTMLElement;
  x: Spring;
  s: Spring;
  active: boolean;
  index: number;
  fresh: boolean;
  slot: number;
}

interface Remote {
  id: string;
  el: HTMLElement;
  x: Spring;
  y: Spring;
  target: { zone: 'table' | 'hand'; lx: number; ly: number };
  lastSeen: number;
  drag: { cardId: string; o: Overlay } | null;
}

interface PingFx {
  el: HTMLElement;
  rings: HTMLElement[];
  dot: HTMLElement;
  r1: Spring;
  r2: Spring;
  d: Spring;
  born: number;
}

const REMOTE_STALE_MS = 6000;
const WAIT_DROP_MS = 400;
const CURSOR_SVG =
  '<svg width="22" height="27" viewBox="0 0 22 27"><path d="M3 3 L3 22 L8 17.4 L11.4 25 L15 23.4 L11.7 16 L18.6 15.6 Z" style="fill:var(--c)" stroke="#3B2F2F" stroke-width="2" stroke-linejoin="round"/></svg>';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
const initial = (name: string) => (Array.from(name.trim())[0] ?? '?').toUpperCase();
const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) => a.size === b.size && [...a].every((x) => b.has(x));

/** Inclinação fixa por carta, igual em todos os clientes. */
function tiltFor(id: string): number {
  let h = 2166136261;
  for (const ch of id) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 600) / 100 - 3;
}

export class TableEngine {
  private view: RoomView | null = null;
  private serverRow: string[] = [];
  private pending: Intent | null = null;
  private visible: string[] = [];
  private entries: RowEntry[] = [];
  private cards = new Map<string, RowCard>();
  private dying: RowCard[] = [];
  private overlays = new Set<Overlay>();
  private inFlight = new Map<string, Overlay>();
  private waiting = new Map<string, { o: Overlay; since: number }>();
  private gaps = new Map<string, Gap>();
  private remotes = new Map<string, Remote>();
  private pings: PingFx[] = [];
  private H: Mat3 | null = null;
  private Hi: Mat3 | null = null;
  private hDirty = true;
  private tilt = new Spring(TILT, 110, 0.68);
  private scale = new Spring(1, 110, 0.8);
  private tiltOn = true;
  private ptr = { x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0 };
  private pendingDrag: { cardId: string; from: 'hand' | 'row'; sx: number; sy: number } | null = null;
  private drag: { cardId: string; from: 'hand' | 'row'; o: Overlay; offX: number; offY: number } | null = null;
  private revealKey: string | null = null;
  private revealing = false;
  private revealTimers: number[] = [];
  private lastDown = { t: 0, x: 0, y: 0 };
  private tipSpring = new Spring(0, 500, 0.5);
  private tipTimer = 0;
  private raf = 0;
  private last = 0;
  private first = true;
  private listeners = new Set<() => void>();
  private snap: EngineSnapshot = { row: [], inFlight: new Set(), revealing: false };
  private cleanup: Array<() => void> = [];

  constructor(
    private dom: EngineDom,
    private handlers: EngineHandlers,
  ) {
    const on = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void) => {
      window.addEventListener(type, fn);
      this.cleanup.push(() => window.removeEventListener(type, fn));
    };
    on('pointermove', (e) => this.onPointerMove(e));
    on('pointerup', () => {
      this.pendingDrag = null;
      if (this.drag) this.endDrag(false);
    });
    on('pointercancel', () => {
      this.pendingDrag = null;
      if (this.drag) this.endDrag(true);
    });
    on('blur', () => {
      this.pendingDrag = null;
      if (this.drag) this.endDrag(true);
    });
    on('resize', () => this.fit(false));
    const feltDown = (e: PointerEvent) => this.onFeltDown(e);
    dom.felt.addEventListener('pointerdown', feltDown);
    this.cleanup.push(() => dom.felt.removeEventListener('pointerdown', feltDown));
    this.fit(true);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  // ---------- API pública ----------

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = (): EngineSnapshot => this.snap;

  update(view: RoomView): void {
    const first = this.first;
    this.first = false;
    this.view = view;
    this.serverRow = [...view.game.row];
    if (this.pending && intentSettled(this.serverRow, this.pending, performance.now())) this.pending = null;

    for (const [id, rc] of this.cards) {
      if (view.game.cards[id]) continue;
      this.cards.delete(id);
      rc.sp.rs.t = 0;
      rc.sp.z.t = 0;
      this.dying.push(rc);
    }
    for (const o of [...this.overlays]) {
      if (view.game.cards[o.cardId]) continue;
      this.inFlight.delete(o.cardId);
      this.waiting.delete(o.cardId);
      this.removeOverlay(o);
    }
    if (this.drag && !view.game.cards[this.drag.cardId]) this.drag = null;
    for (const r of this.remotes.values()) {
      if (r.drag && !view.game.cards[r.drag.cardId]) r.drag = null;
      if (!view.seats.some((s) => s.id === r.id)) {
        r.el.remove();
        this.remotes.delete(r.id);
      }
    }

    for (const rc of this.cards.values()) this.paint(rc);
    for (const [id, w] of this.waiting) {
      if (!this.serverRow.includes(id)) continue;
      this.waiting.delete(id);
      this.land(w.o);
    }
    this.reconcile(first);
    this.syncReveal(first);
    this.emit();
  }

  remoteCursor(fx: RemoteCursorFx): void {
    const view = this.view;
    if (!view || fx.from === view.you || !view.seats.some((s) => s.id === fx.from)) return;
    const r = this.remotes.get(fx.from) ?? this.createRemote(fx.from);
    r.lastSeen = performance.now();
    r.target = { zone: fx.zone, lx: fx.x * FW, ly: fx.y * FH };
    r.el.style.opacity = '1';
    if (this.revealing || view.game.phase !== 'sorting') {
      if (r.drag) this.remoteDrop(r);
      return;
    }
    if (fx.drag) {
      if (r.drag && r.drag.cardId !== fx.drag.cardId) this.remoteDrop(r);
      if (!r.drag) this.remotePickup(r, fx.drag.cardId);
      if (r.drag) {
        if (fx.drag.index === null) this.clearGap(r.id);
        else this.setGap(r.id, toVisibleIndex(this.visible, this.serverRow, r.drag.cardId, fx.drag.index));
      }
    } else if (r.drag) {
      this.remoteDrop(r);
    }
  }

  remotePing(from: string, x: number, y: number): void {
    if (!this.view || from === this.view.you) return;
    this.ping(x * FW, y * FH, this.colorOf(from));
  }

  /** Chamado pela mão (React) no pointerdown de uma carta minha. */
  beginHandDrag(cardId: string, e: PointerEvent): void {
    if (e.button !== 0 || this.revealing || !this.H || this.view?.game.phase !== 'sorting') return;
    e.preventDefault();
    this.pendingDrag = { cardId, from: 'hand', sx: e.clientX, sy: e.clientY };
  }

  setTilt(on: boolean, instant = false): void {
    this.tiltOn = on;
    if (instant) this.tilt.snap(on ? TILT : 0);
    else this.tilt.t = on ? TILT : 0;
    this.fit(instant);
  }

  /** O servidor recusou uma ação minha: volta para a fila do servidor. */
  rollback(): void {
    this.pending = null;
    this.reconcile(false);
    this.emit();
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.revealTimers.forEach((t) => clearTimeout(t));
    clearTimeout(this.tipTimer);
    this.cleanup.forEach((fn) => fn());
    for (const rc of this.cards.values()) rc.el.remove();
    for (const rc of this.dying) rc.el.remove();
    for (const o of this.overlays) o.el.remove();
    for (const r of this.remotes.values()) r.el.remove();
    for (const g of this.gaps.values()) g.el.remove();
    for (const p of this.pings) p.el.remove();
    document.body.classList.remove('grabbing');
    this.listeners.clear();
  }

  // ---------- fila ----------

  private reconcile(snapIn: boolean): void {
    const view = this.view;
    if (!view) return;
    this.visible = effectiveRow(this.serverRow, this.pending, new Set(this.inFlight.keys()));
    for (const id of this.visible) {
      const rc = this.cards.get(id) ?? this.createCard(id);
      if (!rc || rc.shown) continue;
      rc.shown = true;
      rc.appear = snapIn ? 'snap' : 'pop';
      rc.el.style.display = '';
    }
    for (const rc of this.cards.values()) {
      if (!rc.shown || this.visible.includes(rc.id)) continue;
      rc.shown = false;
      rc.el.style.display = 'none';
      if (rc.owner !== view.you && this.H && !this.inFlight.has(rc.id)) this.flyHomeFromRow(rc);
    }
    this.relayout();
  }

  private relayout(): void {
    const gaps: GapSpec[] = [];
    for (const [owner, g] of this.gaps) if (g.active) gaps.push({ owner, index: g.index });
    this.entries = rowEntries(this.visible, gaps);
    for (const e of this.entries) {
      if (e.kind === 'card') {
        const rc = this.cards.get(e.id);
        if (!rc) continue;
        const z = 1 + e.slot * 0.7;
        rc.sp.x.t = e.x;
        rc.sp.z.t = z;
        if (rc.appear) {
          rc.sp.x.snap(e.x);
          rc.sp.z.snap(z);
          rc.sp.y.snap(0);
          rc.sp.stand.snap(0);
          if (rc.appear === 'pop') {
            rc.sp.rs.snap(0.6);
            rc.sp.rs.t = 1;
          } else rc.sp.rs.snap(1);
          rc.appear = null;
        }
      } else {
        const g = this.gaps.get(e.owner);
        if (!g) continue;
        if (g.fresh) {
          g.x.snap(e.x);
          g.fresh = false;
        } else g.x.t = e.x;
        g.slot = e.slot;
      }
    }
  }

  private createCard(id: string): RowCard | null {
    const view = this.view;
    const card = view?.game.cards[id];
    if (!view || !card) return null;
    const el = document.createElement('div');
    el.className = `card rcard${card.owner === view.you ? ' mine' : ''}`;
    el.style.setProperty('--c', this.colorOf(card.owner));
    el.style.display = 'none';
    el.innerHTML = '<div class="flip"><div class="face a"></div><div class="face b num"></div></div><div class="xstamp">✕</div>';
    const flipEl = el.firstElementChild as HTMLElement;
    const rc: RowCard = {
      id,
      owner: card.owner,
      el,
      flipEl,
      faceA: flipEl.children[0] as HTMLElement,
      faceB: flipEl.children[1] as HTMLElement,
      stampEl: el.lastElementChild as HTMLElement,
      tilt: tiltFor(id),
      landing: false,
      shown: false,
      appear: null,
      paintedA: '',
      paintedB: '',
      sp: {
        x: new Spring(FW / 2, 230, 0.72),
        y: new Spring(0, 300, 0.75),
        z: new Spring(1, 320, 0.72),
        stand: new Spring(0, 230, 0.86),
        rs: new Spring(1, 420, 0.42),
        wob: new Spring(0, 520, 0.2),
        flip: new Spring(0, 150, 0.6),
        shake: new Spring(0, 1100, 0.1),
        stamp: new Spring(0, 520, 0.42),
      },
    };
    el.addEventListener('pointerdown', (e) => this.onRowCardDown(e, rc));
    this.dom.row.appendChild(el);
    this.cards.set(id, rc);
    this.paint(rc);
    return rc;
  }

  private paint(rc: RowCard): void {
    const card = this.view?.game.cards[rc.id];
    if (!card) return;
    const a = this.frontHTML(card);
    if (a !== rc.paintedA) {
      rc.faceA.innerHTML = a;
      rc.paintedA = a;
    }
    const b = this.numHTML(card);
    if (b !== rc.paintedB) {
      rc.faceB.innerHTML = b;
      rc.paintedB = b;
    }
  }

  private clueHTML(card: ItoCardView): string {
    return card.clue.trim() ? esc(card.clue) : '<span class="noclue">…</span>';
  }

  private frontHTML(card: ItoCardView): string {
    const mine = card.owner === this.view?.you && card.value !== null;
    return (
      `<div class="badge">${esc(initial(this.nameOf(card.owner)))}</div>` +
      (mine ? `<div class="mynum">${card.value}</div>` : '') +
      `<div class="clue">${this.clueHTML(card)}</div>`
    );
  }

  private numHTML(card: ItoCardView): string {
    return (
      `<div class="band"></div><div class="badge">${esc(initial(this.nameOf(card.owner)))}</div>` +
      `<div class="bignum">${card.value ?? '?'}</div><div class="clue mini">${this.clueHTML(card)}</div>`
    );
  }

  private nameOf(id: string): string {
    return this.view?.seats.find((s) => s.id === id)?.name ?? '?';
  }

  private colorOf(id: string): string {
    return this.view?.seats.find((s) => s.id === id)?.color ?? '#D9C2A0';
  }

  // ---------- buracos ----------

  private ensureGap(owner: string): Gap {
    let g = this.gaps.get(owner);
    if (g) return g;
    const el = document.createElement('div');
    el.className = 'gap';
    el.style.setProperty('--c', this.colorOf(owner));
    el.innerHTML = `<b>${esc(initial(this.nameOf(owner)))}</b>`;
    el.style.display = 'none';
    this.dom.row.appendChild(el);
    g = { el, x: new Spring(FW / 2, 260, 0.8), s: new Spring(0, 320, 0.62), active: false, index: 0, fresh: true, slot: 0 };
    this.gaps.set(owner, g);
    return g;
  }

  private setGap(owner: string, index: number): void {
    const g = this.ensureGap(owner);
    if (!g.active) {
      g.active = true;
      g.fresh = true;
      g.s.snap(0.55);
      g.s.t = 1;
      g.el.style.display = 'block';
    }
    g.index = index;
  }

  private clearGap(owner: string): void {
    const g = this.gaps.get(owner);
    if (g?.active) {
      g.active = false;
      g.s.t = 0;
    }
  }

  private hideGap(owner: string): void {
    const g = this.gaps.get(owner);
    if (!g) return;
    g.active = false;
    g.s.snap(0);
    g.el.style.display = 'none';
  }

  // ---------- overlays (cartas fora do feltro, de frente pra câmera) ----------

  private makeOverlay(cardId: string, x: number, y: number, s: number, rx: number, fl: number, k = 1400, zeta = 0.92): Overlay | null {
    const card = this.view?.game.cards[cardId];
    if (!card) return null;
    const el = document.createElement('div');
    el.className = 'card ocard';
    el.style.setProperty('--c', this.colorOf(card.owner));
    el.innerHTML = `<div class="flip"><div class="face a">${this.frontHTML(card)}</div><div class="face b back"><div class="tilde">~</div></div></div>`;
    this.dom.overlay.appendChild(el);
    const o: Overlay = {
      cardId,
      owner: card.owner,
      el,
      flipEl: el.firstElementChild as HTMLElement,
      tilt: tiltFor(cardId),
      x: new Spring(x, k, zeta),
      y: new Spring(y, k, zeta),
      s: new Spring(s, 380, 0.62),
      rot: new Spring(0, 300, 0.45),
      rx: new Spring(rx, 260, 0.7),
      fl: new Spring(fl, 190, 0.72),
      home: null,
      homeT: 0,
    };
    o.rx.t = 0;
    o.fl.t = 0;
    this.overlays.add(o);
    this.writeOverlay(o);
    return o;
  }

  private writeOverlay(o: Overlay): void {
    o.el.style.transform =
      `translate(${o.x.v.toFixed(2)}px,${o.y.v.toFixed(2)}px) perspective(700px) rotateX(${o.rx.v.toFixed(2)}deg) ` +
      `rotate(${(o.rot.v + o.tilt).toFixed(2)}deg) scale(${Math.max(0.01, o.s.v).toFixed(4)})`;
    o.flipEl.style.transform = `rotateY(${(o.fl.v * 180).toFixed(2)}deg)`;
  }

  private removeOverlay(o: Overlay): void {
    o.el.remove();
    this.overlays.delete(o);
  }

  /** Overlay → fila: a carta "deita" no plano 3D do feltro e assenta com mola. */
  private land(o: Overlay): void {
    const rc = this.cards.get(o.cardId) ?? this.createCard(o.cardId);
    this.inFlight.delete(o.cardId);
    this.hideGap(o.owner);
    if (rc && this.H) {
      const th = (this.tilt.v * Math.PI) / 180;
      const Z0 = 18 + 40 * Math.sin(th);
      let [lx, ly] = this.toLocal(o.x.v, o.y.v);
      const hs = this.hScale(lx, ly);
      [lx, ly] = this.toLocal(o.x.v, o.y.v + Z0 * Math.sin(th) * hs);
      const sp = rc.sp;
      sp.x.snap(lx);
      sp.x.vel = (o.x.vel / hs) * 0.5;
      sp.y.snap(ly - ROW_Y);
      sp.y.vel = (o.y.vel / hs) * 0.5;
      sp.y.t = 0;
      sp.z.snap(Z0);
      sp.stand.snap(1);
      sp.stand.t = 0;
      sp.rs.snap(o.s.v / (ROW_S * hs) / (1 + (Z0 * Math.cos(th)) / PERSP));
      sp.rs.t = 1;
      sp.wob.snap(o.rot.v);
      sp.wob.t = 0;
      rc.landing = true;
      rc.shown = true;
      rc.appear = null;
      rc.el.style.display = '';
    }
    this.removeOverlay(o);
    this.reconcile(false);
    this.emit();
  }

  /** Overlay → volta pra minha mão (minha carta) ou pro assento do dono (carta alheia, de costas). */
  private sendHome(o: Overlay): void {
    o.x.set(240, 0.74);
    o.y.set(240, 0.74);
    o.homeT = performance.now();
    const mine = o.owner === this.view?.you;
    o.home = () => {
      const sel = mine ? `[data-hand-slot="${o.cardId}"]` : `[data-seat-anchor="${o.owner}"]`;
      const el = document.querySelector<HTMLElement>(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return mine ? [r.left + r.width / 2, r.top + r.height / 2, HAND_S, 0] : [r.left + r.width / 2, r.top + r.height / 2, 0.35, 1];
    };
  }

  private finishHome(o: Overlay): void {
    this.removeOverlay(o);
    if (this.inFlight.get(o.cardId) === o) this.inFlight.delete(o.cardId);
    this.reconcile(false);
    this.emit();
  }

  private flyHomeFromRow(rc: RowCard): void {
    const lx = rc.sp.x.v;
    const ly = ROW_Y + rc.sp.y.v;
    const [x, y] = this.toScreen(lx, ly);
    const o = this.makeOverlay(rc.id, x, y, ROW_S * rc.sp.rs.v * this.hScale(lx, ly), this.tilt.v, 0);
    if (!o) return;
    this.inFlight.set(rc.id, o);
    this.sendHome(o);
  }

  // ---------- arrasto local ----------

  private onRowCardDown(e: PointerEvent, rc: RowCard): void {
    const view = this.view;
    if (e.button !== 0 || !this.H || this.revealing || !view || view.game.phase !== 'sorting') return;
    if (rc.owner === view.you) {
      e.preventDefault();
      e.stopPropagation();
      this.pendingDrag = { cardId: rc.id, from: 'row', sx: e.clientX, sy: e.clientY };
    } else {
      rc.sp.wob.vel += (Math.random() < 0.5 ? -1 : 1) * 480;
      rc.sp.rs.vel += 0.5;
      this.showTip(`ei, essa carta é de ${this.nameOf(rc.owner)}!`, e.clientX, e.clientY);
    }
  }

  private onPointerMove(e: PointerEvent): void {
    this.ptr.x = e.clientX;
    this.ptr.y = e.clientY;
    const p = this.pendingDrag;
    if (p && !this.drag && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 4) this.startDrag();
    this.emitCursor();
  }

  private emitCursor(): void {
    const me = this.view?.you;
    if (!this.Hi || !me) return;
    const [lx, ly] = this.toLocal(this.ptr.x, this.ptr.y);
    const g = this.gaps.get(me);
    const drag = this.drag
      ? { cardId: this.drag.cardId, index: g?.active ? toServerIndex(this.visible, this.serverRow, this.drag.cardId, g.index) : null }
      : null;
    this.handlers.cursor({ ...cursorFromLocal(lx, ly), drag });
  }

  private startDrag(): void {
    const p = this.pendingDrag;
    this.pendingDrag = null;
    const me = this.view?.you;
    if (!p || !me) return;
    let x: number;
    let y: number;
    let s: number;
    let rx = 0;
    if (p.from === 'hand') {
      const slot = document.querySelector<HTMLElement>(`[data-hand-slot="${p.cardId}"]`);
      if (!slot) return;
      const r = slot.getBoundingClientRect();
      x = r.left + r.width / 2;
      y = r.top + r.height / 2;
      s = HAND_S;
    } else {
      const rc = this.cards.get(p.cardId);
      if (!rc?.shown) return;
      const lx = rc.sp.x.v;
      const ly = ROW_Y + rc.sp.y.v;
      [x, y] = this.toScreen(lx, ly);
      s = ROW_S * rc.sp.rs.v * this.hScale(lx, ly);
      rx = this.tilt.v;
      this.setGap(me, Math.max(0, this.visible.indexOf(rc.id)));
      this.gaps.get(me)!.s.snap(1);
    }
    const o = this.makeOverlay(p.cardId, x, y, s, rx, 0);
    if (!o) return;
    o.s.t = HAND_S * 1.07;
    this.inFlight.set(p.cardId, o);
    if (this.pending?.cardId === p.cardId) this.pending = null;
    this.drag = { cardId: p.cardId, from: p.from, o, offX: (this.ptr.x - x) / s, offY: (this.ptr.y - y) / s };
    document.body.classList.add('grabbing');
    this.handlers.activity('dragging');
    this.reconcile(false);
    this.emit();
  }

  private updateDrag(): void {
    const d = this.drag;
    const me = this.view?.you;
    if (!d || !me) return;
    const o = d.o;
    o.x.t = this.ptr.x - d.offX * o.s.v;
    o.y.t = this.ptr.y - d.offY * o.s.v;
    const [lx, ly] = this.toLocal(this.ptr.x, this.ptr.y);
    if (inRowZone(lx, ly)) {
      this.setGap(me, insertIndex(this.entries, lx));
      o.s.t = ROW_S * this.hScale(clamp(lx, 0, FW), ROW_Y) * 1.06;
    } else {
      this.clearGap(me);
      o.s.t = HAND_S * 1.07;
    }
    o.rot.t = clamp(this.ptr.vx * 0.014, -14, 14);
    o.rx.t = clamp(-this.ptr.vy * 0.006, -10, 10);
  }

  private endDrag(forceHome: boolean): void {
    const d = this.drag;
    const me = this.view?.you;
    if (!d || !me) return;
    if (!forceHome) this.updateDrag();
    this.drag = null;
    document.body.classList.remove('grabbing');
    const g = this.gaps.get(me);
    const now = performance.now();
    if (!forceHome && g?.active) {
      const index = toServerIndex(this.visible, this.serverRow, d.cardId, g.index);
      this.pending = { kind: 'place', cardId: d.cardId, index, at: now };
      this.handlers.place(d.cardId, index);
      this.land(d.o);
    } else {
      this.clearGap(me);
      if (d.from === 'row') {
        this.pending = { kind: 'return', cardId: d.cardId, at: now };
        this.handlers.ret(d.cardId);
      }
      this.sendHome(d.o);
    }
    this.handlers.activity('thinking');
    this.emitCursor();
    this.emit();
  }

  // ---------- remotos ----------

  private createRemote(id: string): Remote {
    const el = document.createElement('div');
    el.className = 'cursor';
    el.style.setProperty('--c', this.colorOf(id));
    el.innerHTML = `${CURSOR_SVG}<span>${esc(this.nameOf(id))}</span>`;
    this.dom.cursors.appendChild(el);
    const start = this.seatPoint(id) ?? [window.innerWidth / 2, window.innerHeight / 2];
    const r: Remote = {
      id,
      el,
      x: new Spring(start[0], 380, 0.92),
      y: new Spring(start[1], 380, 0.92),
      target: { zone: 'hand', lx: 0, ly: 0 },
      lastSeen: performance.now(),
      drag: null,
    };
    this.remotes.set(id, r);
    return r;
  }

  private seatPoint(id: string): [number, number] | null {
    const el = document.querySelector<HTMLElement>(`[data-seat-anchor="${id}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return [r.left + r.width / 2 + 10, r.top + r.height / 2 + 10];
  }

  private remotePickup(r: Remote, cardId: string): void {
    const card = this.view?.game.cards[cardId];
    if (!card || card.owner !== r.id || this.inFlight.has(cardId)) return;
    let o: Overlay | null = null;
    const waiting = this.waiting.get(cardId);
    if (waiting) {
      this.waiting.delete(cardId);
      o = waiting.o;
    } else {
      const rc = this.cards.get(cardId);
      if (rc?.shown && this.H) {
        const lx = rc.sp.x.v;
        const ly = ROW_Y + rc.sp.y.v;
        const [x, y] = this.toScreen(lx, ly);
        o = this.makeOverlay(cardId, x, y, ROW_S * rc.sp.rs.v * this.hScale(lx, ly), this.tilt.v, 0);
      } else {
        const [x, y] = this.seatPoint(r.id) ?? [r.x.v, r.y.v];
        o = this.makeOverlay(cardId, x, y, 0.35, 0, 1, 520, 0.8);
        if (o) o.s.t = 1;
      }
    }
    if (!o) return;
    o.home = null;
    this.inFlight.set(cardId, o);
    r.drag = { cardId, o };
    this.reconcile(false);
    this.emit();
  }

  private remoteDrop(r: Remote): void {
    const d = r.drag;
    if (!d) return;
    r.drag = null;
    // Normalmente o `state` do place/return chega antes do cursor sem arrasto.
    if (this.serverRow.includes(d.cardId)) this.land(d.o);
    else this.waiting.set(d.cardId, { o: d.o, since: performance.now() });
  }

  // ---------- ping ----------

  private onFeltDown(e: PointerEvent): void {
    const now = performance.now();
    const me = this.view?.you;
    if (now - this.lastDown.t < 340 && Math.hypot(e.clientX - this.lastDown.x, e.clientY - this.lastDown.y) < 14 && this.Hi && me) {
      const [lx, ly] = this.toLocal(e.clientX, e.clientY);
      this.ping(lx, ly, this.colorOf(me));
      this.handlers.ping(clamp(lx / FW, -1, 2), clamp(ly / FH, -1, 2));
      this.lastDown.t = 0;
    } else {
      this.lastDown = { t: now, x: e.clientX, y: e.clientY };
    }
  }

  private ping(lx: number, ly: number, color: string): void {
    const el = document.createElement('div');
    el.className = 'ping';
    el.style.setProperty('--c', color);
    el.innerHTML = '<i></i><i></i><b></b>';
    el.style.transform = `translate3d(${lx}px,${ly}px,3px)`;
    this.dom.row.appendChild(el);
    const rings = Array.from(el.querySelectorAll('i')) as HTMLElement[];
    const p: PingFx = { el, rings, dot: el.querySelector('b') as HTMLElement, r1: new Spring(0, 70, 0.95), r2: new Spring(0, 55, 0.95), d: new Spring(0, 600, 0.35), born: performance.now() };
    p.r1.t = 1;
    p.d.t = 1;
    this.pings.push(p);
  }

  // ---------- revelação ----------

  private syncReveal(first: boolean): void {
    const g = this.view?.game;
    if (!g) return;
    if (g.phase !== 'reveal' || !g.reveal) {
      if (this.revealKey) {
        this.revealKey = null;
        this.revealing = false;
        this.revealTimers.forEach((t) => clearTimeout(t));
        this.revealTimers = [];
      }
      return;
    }
    const key = g.reveal.map((e) => e.cardId).join('|');
    if (key === this.revealKey) return;
    this.revealKey = key;
    this.revealing = true;
    this.pendingDrag = null;
    if (this.drag) this.endDrag(true);
    for (const r of this.remotes.values()) if (r.drag) this.remoteDrop(r);
    if (first) {
      for (const e of g.reveal) this.flipCard(e, true);
      this.revealing = false;
      this.handlers.revealDone();
      return;
    }
    let t = 750;
    for (const e of g.reveal) {
      this.later(t, () => this.flipCard(e, false));
      t += 620;
    }
    this.later(t + 500, () => {
      this.revealing = false;
      this.emit();
      this.handlers.revealDone();
    });
  }

  private later(ms: number, fn: () => void): void {
    this.revealTimers.push(window.setTimeout(fn, ms));
  }

  private flipCard(e: RevealEntry, instant: boolean): void {
    const rc = this.cards.get(e.cardId);
    if (!rc) return;
    this.paint(rc);
    if (instant) {
      rc.sp.flip.snap(1);
      if (e.error) {
        rc.el.classList.add('err');
        rc.sp.stamp.snap(1);
      }
      return;
    }
    rc.sp.flip.t = 1;
    this.later(330, () => {
      if (e.error) {
        rc.el.classList.add('err');
        rc.sp.stamp.snap(2.3);
        rc.sp.stamp.t = 1;
        rc.sp.shake.vel = 950;
      } else {
        rc.sp.rs.vel += 1.4;
      }
    });
  }

  // ---------- dica (tooltip) ----------

  private showTip(text: string, x: number, y: number): void {
    const tip = this.dom.tip;
    tip.textContent = text;
    tip.style.left = `${x + 14}px`;
    tip.style.top = `${y - 42}px`;
    this.tipSpring.snap(0.5);
    this.tipSpring.t = 1;
    clearTimeout(this.tipTimer);
    this.tipTimer = window.setTimeout(() => {
      this.tipSpring.t = 0;
    }, 1000);
  }

  // ---------- geometria ----------

  private fit(snapIt: boolean): void {
    const visH = (this.tiltOn ? 0.74 : 1) * FH;
    const availW = window.innerWidth - 2 * 175;
    const availH = window.innerHeight - 210 - 110;
    const k = clamp(Math.min(availW / FW, availH / visH), 0.4, 1.12);
    if (snapIt) this.scale.snap(k);
    else this.scale.t = k;
    this.hDirty = true;
  }

  private readH(): void {
    const pts = this.dom.markers.map((el) => {
      const r = el.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2] as const;
    });
    const [a, b, c] = pts;
    if (!a || !b || !c || (a[0] === b[0] && a[1] === b[1]) || (a[0] === c[0] && a[1] === c[1])) return;
    this.H = solveH(
      [
        [0, 0],
        [FW, 0],
        [0, FH],
        [FW, FH],
      ],
      pts,
    );
    this.Hi = inv3(this.H);
  }

  private toScreen(lx: number, ly: number): [number, number] {
    return this.H ? applyH(this.H, lx, ly) : [lx, ly];
  }

  private toLocal(sx: number, sy: number): [number, number] {
    return this.Hi ? applyH(this.Hi, sx, sy) : [sx, sy];
  }

  private hScale(lx: number, ly: number): number {
    const [ax, ay] = this.toScreen(lx, ly);
    const [bx, by] = this.toScreen(lx + 10, ly);
    return Math.hypot(bx - ax, by - ay) / 10 || 1;
  }

  // ---------- snapshot ----------

  private emit(): void {
    const inFlight = new Set(this.inFlight.keys());
    const s = this.snap;
    if (s.revealing === this.revealing && sameList(s.row, this.visible) && sameSet(s.inFlight, inFlight)) return;
    this.snap = { row: [...this.visible], inFlight, revealing: this.revealing };
    this.listeners.forEach((fn) => fn());
  }

  // ---------- loop ----------

  private frame = (now: number): void => {
    const dt = Math.min(0.033, Math.max(0.001, (now - this.last) / 1000));
    this.last = now;
    this.tilt.step(dt);
    this.scale.step(dt);
    if (!this.tilt.resting || !this.scale.resting || this.hDirty || !this.H) {
      this.dom.felt.style.transform = `rotateX(${this.tilt.v.toFixed(3)}deg)`;
      this.dom.wrap.style.transform = `translateX(-50%) scale(${this.scale.v.toFixed(4)})`;
      this.readH();
      this.hDirty = false;
    }
    const p = this.ptr;
    p.vx = lerp(p.vx, (p.x - p.px) / dt, 0.3);
    p.vy = lerp(p.vy, (p.y - p.py) / dt, 0.3);
    p.px = p.x;
    p.py = p.y;

    this.updateDrag();
    this.stepRemotes(dt, now);
    this.relayout();
    this.stepCards(dt);
    this.stepGaps(dt);
    this.stepOverlays(dt, now);
    this.stepPings(dt, now);
    this.tipSpring.step(dt);
    this.dom.tip.style.opacity = this.tipSpring.v > 0.02 ? '1' : '0';
    this.dom.tip.style.transform = `scale(${Math.max(0, this.tipSpring.v).toFixed(3)})`;
    this.raf = requestAnimationFrame(this.frame);
  };

  private stepRemotes(dt: number, now: number): void {
    for (const r of this.remotes.values()) {
      if (now - r.lastSeen > REMOTE_STALE_MS) {
        r.el.style.opacity = '0';
        if (r.drag) this.remoteDrop(r);
      }
      const t = r.target.zone === 'table' && this.H ? this.toScreen(r.target.lx, r.target.ly) : this.seatPoint(r.id);
      if (t) {
        r.x.t = t[0];
        r.y.t = t[1];
      }
      r.x.step(dt);
      r.y.step(dt);
      r.el.style.transform = `translate(${r.x.v.toFixed(1)}px,${r.y.v.toFixed(1)}px)`;
      if (r.drag) {
        const o = r.drag.o;
        o.x.t = r.x.v + 8 * o.s.v;
        o.y.t = r.y.v + 22 * o.s.v;
        const [lx, ly] = this.toLocal(o.x.v, o.y.v);
        o.s.t = inRowZone(lx, ly) ? ROW_S * this.hScale(clamp(lx, 0, FW), ROW_Y) * 1.04 : 1;
        o.rot.t = clamp(r.x.vel * 0.014, -14, 14);
        o.rx.t = clamp(-r.y.vel * 0.006, -10, 10);
      }
    }
    for (const [id, w] of this.waiting) {
      if (now - w.since < WAIT_DROP_MS) continue;
      this.waiting.delete(id);
      if (this.serverRow.includes(id)) this.land(w.o);
      else {
        this.clearGap(w.o.owner);
        this.sendHome(w.o);
      }
    }
  }

  private writeCard(rc: RowCard): void {
    const sp = rc.sp;
    const f = clamp(sp.flip.v, 0, 1.2);
    const z = Math.max(0.5, sp.z.v) + Math.sin(Math.PI * clamp(f, 0, 1)) * 34;
    rc.el.style.transform =
      `translate3d(${(sp.x.v + sp.shake.v).toFixed(2)}px,${(ROW_Y + sp.y.v).toFixed(2)}px,${z.toFixed(2)}px) ` +
      `rotateX(${(-this.tilt.v * sp.stand.v).toFixed(2)}deg) rotateZ(${(rc.tilt + sp.wob.v + sp.shake.v * 0.25).toFixed(2)}deg) ` +
      `scale(${Math.max(0.001, ROW_S * sp.rs.v).toFixed(4)})`;
    rc.flipEl.style.transform = `rotateY(${(sp.flip.v * 180).toFixed(2)}deg)`;
    const st = sp.stamp.v;
    rc.stampEl.style.opacity = st > 0.02 ? '1' : '0';
    rc.stampEl.style.transform = `translateZ(6px) rotate(-10deg) scale(${Math.max(0, st).toFixed(3)})`;
  }

  private stepCards(dt: number): void {
    for (const rc of this.cards.values()) {
      if (!rc.shown) continue;
      for (const s of Object.values(rc.sp)) s.step(dt);
      if (rc.landing && rc.sp.z.v < rc.sp.z.t + 6) {
        rc.landing = false;
        rc.sp.rs.vel -= 1.5;
        rc.sp.y.vel *= 0.4;
      }
      this.writeCard(rc);
    }
    this.dying = this.dying.filter((rc) => {
      rc.sp.rs.step(dt);
      rc.sp.z.step(dt);
      this.writeCard(rc);
      if (rc.sp.rs.v >= 0.03) return true;
      rc.el.remove();
      return false;
    });
  }

  private stepGaps(dt: number): void {
    for (const g of this.gaps.values()) {
      if (g.el.style.display === 'none') continue;
      g.x.step(dt);
      g.s.step(dt);
      if (!g.active && g.s.v < 0.05) {
        g.el.style.display = 'none';
        continue;
      }
      const s = Math.max(0, g.s.v);
      g.el.style.opacity = clamp(s * 1.3, 0, 1).toFixed(3);
      g.el.style.transform = `translate3d(${g.x.v.toFixed(2)}px,${ROW_Y}px,${(0.5 + g.slot * 0.7).toFixed(2)}px) scale(${(ROW_S * s).toFixed(4)})`;
    }
  }

  private stepOverlays(dt: number, now: number): void {
    for (const o of [...this.overlays]) {
      if (o.home) {
        const t = o.home();
        if (!t) {
          this.finishHome(o);
          continue;
        }
        [o.x.t, o.y.t, o.s.t, o.fl.t] = t;
        o.rot.t = 0;
        o.rx.t = 0;
      }
      o.x.step(dt);
      o.y.step(dt);
      o.s.step(dt);
      o.rot.step(dt);
      o.rx.step(dt);
      o.fl.step(dt);
      this.writeOverlay(o);
      if (o.home) {
        const settled =
          Math.hypot(o.x.v - o.x.t, o.y.v - o.y.t) < 1.2 &&
          Math.hypot(o.x.vel, o.y.vel) < 40 &&
          Math.abs(o.s.v - o.s.t) < 0.01 &&
          Math.abs(o.fl.v - o.fl.t) < 0.02;
        if (settled || now - o.homeT > 1800) this.finishHome(o);
      }
    }
  }

  private stepPings(dt: number, now: number): void {
    this.pings = this.pings.filter((p) => {
      const age = now - p.born;
      if (age > 120) p.r2.t = 1;
      if (age > 700) p.d.t = 0;
      p.r1.step(dt);
      p.r2.step(dt);
      p.d.step(dt);
      [p.r1, p.r2].forEach((r, i) => {
        const ring = p.rings[i];
        if (!ring) return;
        ring.style.transform = `scale(${Math.max(0, r.v).toFixed(3)})`;
        ring.style.opacity = clamp(1 - r.v, 0, 1).toFixed(3);
      });
      p.dot.style.transform = `scale(${Math.max(0, p.d.v).toFixed(3)})`;
      if (age < 1600) return true;
      p.el.remove();
      return false;
    });
  }
}
```

- [ ] **Step 4: `web/src/table/table.css`** (port do CSS do protótipo para classes)

```css
body.grabbing, body.grabbing * { cursor: grabbing !important; }

.table-screen { position: fixed; inset: 0; overflow: hidden; -webkit-user-select: none; user-select: none; }
.topbar { position: absolute; left: 18px; right: 18px; top: 14px; display: flex; justify-content: space-between; align-items: flex-start; z-index: 5; pointer-events: none; }
.topbar > * { pointer-events: auto; }
.pills { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
.pill.lives { color: var(--pink2); font-weight: 700; letter-spacing: 2px; }
.pill.lives i { font-style: normal; }
.pill.lives i.lost { color: transparent; -webkit-text-stroke: 1.5px var(--ink); opacity: 0.55; }
.pill.code { cursor: pointer; }

/* assentos */
.seat { position: absolute; display: flex; align-items: center; gap: 10px; z-index: 4; }
.seat.top { transform: translateX(-50%); }
.seat.left, .seat.right { flex-direction: column; transform: translateY(-50%); }
.meta { display: flex; flex-direction: column; gap: 5px; align-items: flex-start; }
.seat.left .meta, .seat.right .meta { align-items: center; }
.name { font: 700 16px/1 var(--font-ui); }
.backs { display: flex; gap: 6px; }
.mback { width: 30px; height: 41px; border: 2px solid var(--ink); border-radius: 7px 5px 6px 4px; background: var(--pink); position: relative; overflow: hidden; }
.mback::after { content: '~'; position: absolute; inset: 0; display: grid; place-items: center; font: 700 20px/1 var(--font-ui); color: var(--ink); }
.mback.empty { background: transparent; border-style: dashed; border-color: rgba(59, 47, 47, 0.45); }
.mback.empty::after { content: ''; }

/* palco / feltro */
.stage-wrap { position: absolute; left: 50%; bottom: 210px; width: 900px; height: 480px; transform-origin: 50% 100%; z-index: 1; }
.stage { position: absolute; inset: 0; perspective: 900px; perspective-origin: 50% 50%; }
.felt {
  position: absolute; left: 0; top: 0; width: 900px; height: 480px; transform-origin: 50% 100%; transform-style: preserve-3d;
  border: 2px solid var(--ink); border-radius: 34px 26px 30px 24px; background-color: var(--paper);
  box-shadow: 0 9px 0 0 var(--edge), 0 9px 0 2px var(--ink);
}
.felt::before { content: ''; position: absolute; inset: 12px; border: 2px dashed rgba(59, 47, 47, 0.18); border-radius: 26px 20px 24px 18px; pointer-events: none; }
.theme {
  position: absolute; left: 50%; top: 30px; width: 460px; margin-left: -230px; padding: 12px 20px 14px; background: var(--kraft);
  border: 2px solid var(--ink); border-radius: 18px 12px 16px 11px; text-align: center; transform: rotate(-1.2deg); pointer-events: none;
}
.theme-title { font: 700 24px/1.05 var(--font-ui); }
.tscale { margin-top: 8px; font: 19px/1.2 var(--font-hand); }
.tscale b { font: 700 15px/1 var(--font-ui); background: var(--paper); border: 2px solid var(--ink); border-radius: 8px 6px 7px 5px; padding: 1px 6px; margin: 0 2px; }
.endmark {
  position: absolute; top: 296px; width: 46px; height: 46px; border-radius: 50% 46% 52% 47%; border: 2px solid var(--ink);
  background: var(--kraft); display: grid; place-items: center; font: 700 17px/1 var(--font-ui); pointer-events: none;
}
.endmark.m1 { left: 26px; }
.endmark.m100 { right: 26px; font-size: 14px; }
.markers, .row { position: absolute; left: -2px; top: -2px; width: 900px; height: 480px; pointer-events: none; }
.row { transform-style: preserve-3d; }
.hm { position: absolute; width: 0; height: 0; }

/* cartas */
.card { position: absolute; left: 0; top: 0; width: 88px; height: 120px; margin: -60px 0 0 -44px; transform-style: preserve-3d; will-change: transform; }
.flip { position: absolute; inset: 0; transform-style: preserve-3d; }
.face {
  position: absolute; inset: 0; border: 2px solid var(--ink); border-radius: var(--r); background: var(--c);
  backface-visibility: hidden; -webkit-backface-visibility: hidden; overflow: hidden; box-shadow: 2px 3px 0 var(--ink);
}
.face.b { transform: rotateY(180deg); }
.badge {
  position: absolute; left: 5px; top: 5px; width: 22px; height: 22px; border-radius: 50% 46% 52% 47%; background: var(--paper);
  border: 2px solid var(--ink); font: 700 11px/18px var(--font-ui); text-align: center;
}
.mynum {
  position: absolute; right: 5px; top: 4px; font: 700 18px/1 var(--font-ui); background: var(--paper); border: 2px solid var(--ink);
  border-radius: 8px 6px 7px 5px; padding: 3px 5px 2px; min-width: 30px; text-align: center;
}
.clue {
  position: absolute; left: 5px; right: 5px; top: 30px; bottom: 6px; display: flex; align-items: center; justify-content: center;
  text-align: center; font: 18px/0.98 var(--font-hand); overflow-wrap: anywhere;
}
.noclue { opacity: 0.45; font-size: 22px; }
.face.num { background: var(--paper); }
.face.num .band { position: absolute; left: 0; right: 0; top: 0; height: 26px; background: var(--c); border-bottom: 2px solid var(--ink); }
.bignum { position: absolute; left: 0; right: 0; top: 26px; bottom: 24px; display: grid; place-items: center; font: 700 40px/1 var(--font-ui); }
.clue.mini { top: auto; bottom: 4px; height: 22px; font-size: 13px; line-height: 1; opacity: 0.85; overflow: hidden; }
.face.back { background: var(--pink); }
.face.back::before { content: ''; position: absolute; inset: 6px; border: 2px dashed rgba(59, 47, 47, 0.45); border-radius: 10px 7px 9px 6px; }
.tilde { position: absolute; inset: 0; display: grid; place-items: center; font: 700 54px/1 var(--font-ui); }
.rcard { pointer-events: auto; cursor: not-allowed; touch-action: none; }
.rcard.mine { cursor: grab; }
.rcard.err .face { border-color: var(--pink2); }
.xstamp {
  position: absolute; right: -12px; top: -12px; width: 38px; height: 38px; border-radius: 50% 46% 52% 47%; background: var(--pink2);
  border: 2px solid var(--ink); color: var(--paper); font: 700 22px/34px var(--font-ui); text-align: center; opacity: 0; pointer-events: none;
}
.ocard .face { box-shadow: 2px 3px 0 var(--ink), 9px 13px 0 rgba(59, 47, 47, 0.13); }
.gap {
  position: absolute; left: 0; top: 0; width: 88px; height: 120px; margin: -60px 0 0 -44px; border: 3px dashed var(--pink2);
  border-radius: var(--r); background: rgba(255, 143, 171, 0.16); display: none;
}
.gap b {
  position: absolute; left: 50%; top: 50%; width: 26px; height: 26px; margin: -13px 0 0 -13px; border-radius: 50%; background: var(--c);
  border: 2px solid var(--ink); font: 700 12px/22px var(--font-ui); text-align: center;
}

/* pings */
.ping { position: absolute; left: 0; top: 0; width: 0; height: 0; pointer-events: none; }
.ping i, .ping b {
  position: absolute; left: -60px; top: -60px; width: 120px; height: 120px; border-radius: 50%; border: 4px solid var(--c);
  box-shadow: 0 0 0 2px var(--ink), inset 0 0 0 2px var(--ink);
}
.ping b { left: -9px; top: -9px; width: 18px; height: 18px; background: var(--c); border: 2px solid var(--ink); box-shadow: none; }

/* eu */
.me-area { position: absolute; left: 50%; bottom: 16px; transform: translateX(-50%); display: flex; align-items: flex-end; gap: 28px; z-index: 4; }
.me-id { display: flex; flex-direction: column; align-items: center; gap: 6px; padding-bottom: 10px; width: 110px; }
.hand { display: flex; gap: 20px; }
.hslot { position: relative; width: 106px; height: 144px; border-radius: var(--r); border: 2px dashed transparent; }
.hslot.dragging, .hslot.away { border-color: rgba(59, 47, 47, 0.4); }
.hslot.dragging .hcard { visibility: hidden; }
.hcard {
  left: 50%; top: 50%; cursor: grab; touch-action: none; transform: rotate(var(--tilt, 0deg)) scale(1.2);
  transition: transform 0.28s cubic-bezier(0.3, 1.6, 0.5, 1);
}
.hslot:not(.away):not(.dragging) .hcard:hover { transform: translateY(-10px) rotate(var(--tilt, 0deg)) scale(1.25); }
.hslot.away .hcard { opacity: 0.5; cursor: default; }
.hslot.away .hcard .face { background: transparent; border-style: dashed; box-shadow: none; }
.slot-note { position: absolute; left: 0; right: 0; bottom: -22px; text-align: center; font: 16px/1 var(--font-hand); opacity: 0; }
.hslot.away .slot-note { opacity: 0.8; }
.clue-in {
  position: absolute; left: 5px; right: 5px; top: 31px; bottom: 6px; resize: none; border: none; outline: none;
  background: rgba(246, 238, 221, 0.55); border-radius: 8px 6px 7px 5px; font: 17px/0.98 var(--font-hand); color: var(--ink);
  text-align: center; padding: 4px 3px; overflow: hidden; -webkit-user-select: text; user-select: text; cursor: text;
}
.clue-in:focus { background: var(--paper); box-shadow: inset 0 0 0 2px var(--ink); }
.clue-in::placeholder { color: rgba(59, 47, 47, 0.5); }
.ready-col { display: flex; flex-direction: column; align-items: center; gap: 8px; padding-bottom: 16px; width: 220px; }
.ready-hint { font: 17px/1.05 var(--font-hand); opacity: 0.75; text-align: center; min-height: 18px; margin: 0; }

/* controles e painel do tema */
.controls { position: absolute; right: 20px; bottom: 18px; display: flex; flex-direction: column; align-items: flex-end; gap: 9px; z-index: 4; }
.toggle-row { display: flex; align-items: center; gap: 8px; font: 500 15px/1 var(--font-ui); background: none; border: none; cursor: pointer; padding: 0; }
.toggle { width: 46px; height: 26px; border: 2px solid var(--ink); border-radius: 999px; background: var(--disabled); position: relative; display: inline-block; }
.toggle.on { background: var(--pink); }
.knob { position: absolute; left: 2px; top: 2px; width: 18px; height: 18px; border-radius: 50%; background: var(--paper); border: 2px solid var(--ink); transition: transform 0.25s cubic-bezier(0.3, 1.6, 0.5, 1); }
.toggle.on .knob { transform: translateX(20px); }
.theme-panel {
  position: absolute; left: 50%; top: 104px; transform: translateX(-50%); z-index: 6; display: flex; gap: 10px; align-items: center;
  flex-wrap: wrap; justify-content: center; background: var(--paper); border: 2px solid var(--ink); border-radius: 18px 12px 16px 11px;
  box-shadow: 3px 4px 0 var(--ink); padding: 12px 14px; max-width: min(760px, calc(100vw - 32px));
}
.theme-panel form { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.theme-panel .text-in { font-size: 18px; padding: 8px 10px; width: 170px; }

/* camadas */
.overlay-layer { position: fixed; inset: 0; pointer-events: none; z-index: 40; }
.cursor-layer { position: fixed; inset: 0; pointer-events: none; z-index: 45; }
.cursor { position: absolute; left: 0; top: 0; will-change: transform; transition: opacity 0.3s; }
.cursor svg { position: absolute; left: -3px; top: -3px; overflow: visible; }
.cursor span {
  position: absolute; left: 15px; top: 21px; background: var(--c); border: 2px solid var(--ink); border-radius: 999px;
  font: 700 12px/1 var(--font-ui); padding: 3px 8px 2px; white-space: nowrap;
}
.tip {
  position: fixed; left: 0; top: 0; z-index: 48; pointer-events: none; background: var(--paper); border: 2px solid var(--ink);
  border-radius: 12px 9px 11px 8px; font: 18px/1 var(--font-hand); padding: 6px 10px 5px; opacity: 0; white-space: nowrap; transform-origin: 0 100%;
}

/* resultado */
.veil { position: fixed; inset: 0; background: rgba(234, 219, 192, 0.35); z-index: 50; }
.banner {
  position: fixed; left: 50%; top: 27%; transform: translate(-50%, -50%) rotate(-1.5deg); z-index: 52; background: var(--paper);
  border: 2px solid var(--ink); border-radius: 28px 20px 26px 18px; padding: 26px 40px; text-align: center; box-shadow: 5px 7px 0 var(--ink);
  min-width: 360px; animation: pop-in 0.45s cubic-bezier(0.3, 1.6, 0.5, 1);
}
.banner.win { background: #fff3d6; }
.b-title { font: 700 52px/1 var(--font-ui); margin-bottom: 8px; }
.b-title span { color: var(--pink2); }
.b-sub { font: 23px/1.15 var(--font-hand); margin-bottom: 18px; opacity: 0.85; }
.b-actions { display: flex; gap: 10px; justify-content: center; align-items: center; flex-wrap: wrap; }
.confetti { position: fixed; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 60; }
@keyframes pop-in {
  from { transform: translate(-50%, -50%) rotate(-1.5deg) scale(0.55); }
  to { transform: translate(-50%, -50%) rotate(-1.5deg) scale(1); }
}
```

- [ ] **Step 5: Rodar** — `npm test -w web && npm run typecheck` → PASS.

- [ ] **Step 6: Commit**

```bash
git add web
git commit -m "feat(web): motor da mesa (TableEngine) portado do protótipo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Mesa em React (assentos, mão, prontos, tema) ligada ao motor

**Files:**
- Create: `web/src/table/Table.tsx`, `Seat.tsx`, `Hand.tsx`, `ReadyColumn.tsx`, `ThemePanel.tsx`, `ThemeCard.tsx`, `TopBar.tsx`
- Modify: `web/src/screens/Game.tsx`
- Test: `web/test/table-ui.test.tsx`

- [ ] **Step 1: Testes** — `web/test/table-ui.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EngineSnapshot } from '../src/table/engine';
import { ReadyColumn } from '../src/table/ReadyColumn';
import { ThemePanel } from '../src/table/ThemePanel';
import { act, makeRoom, sortingRoom, viewOf } from './fixtures';

const conn = () => ({
  sendAction: vi.fn(),
  sendActivity: vi.fn(),
  sendCursor: vi.fn(),
  sendPing: vi.fn(),
  onFx: vi.fn(() => () => {}),
  onError: vi.fn(() => () => {}),
});
const snap = (row: string[]): EngineSnapshot => ({ row, inFlight: new Set(), revealing: false });

describe('ReadyColumn', () => {
  it('pede pra colocar as cartas antes', () => {
    render(<ReadyColumn view={viewOf(sortingRoom(2), 'p0')} snap={snap([])} conn={conn()} />);
    expect(screen.getByRole('button', { name: 'tô pronto' })).toBeDisabled();
    expect(screen.getByText('bota suas cartas na fila')).toBeTruthy();
  });

  it('marca e desmarca pronto', () => {
    const c = conn();
    let room = sortingRoom(2);
    render(<ReadyColumn view={viewOf(room, 'p0')} snap={snap(['p0:0'])} conn={c} />);
    fireEvent.click(screen.getByRole('button', { name: 'tô pronto' }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'ready', ready: true });
    room = act(act(room, 'p0', { type: 'place', cardId: 'p0:0', index: 0 }), 'p0', { type: 'ready', ready: true });
    render(<ReadyColumn view={viewOf(room, 'p0')} snap={snap(['p0:0'])} conn={c} />);
    fireEvent.click(screen.getByRole('button', { name: 'pronto ✓' }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'ready', ready: false });
  });

  it('quem não joga a rodada assiste', () => {
    render(<ReadyColumn view={viewOf(sortingRoom(2), null)} snap={snap([])} conn={conn()} />);
    expect(screen.getByText('você tá assistindo essa rodada')).toBeTruthy();
  });
});

describe('ThemePanel', () => {
  const inTheme = () => act(makeRoom(2), 'p0', { type: 'start' });

  it('host sorteia, escreve tema e dá as cartas', () => {
    const c = conn();
    render(<ThemePanel view={viewOf(inTheme(), 'p0')} conn={c} />);
    fireEvent.click(screen.getByRole('button', { name: 'sortear outro' }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'rerollTheme' });
    fireEvent.click(screen.getByRole('button', { name: 'escrever tema' }));
    fireEvent.change(screen.getByLabelText('tema'), { target: { value: 'Pizzas' } });
    fireEvent.change(screen.getByLabelText('1 ='), { target: { value: 'ruim' } });
    fireEvent.change(screen.getByLabelText('100 ='), { target: { value: 'divina' } });
    fireEvent.click(screen.getByRole('button', { name: 'usar esse tema' }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'customTheme', theme: { titulo: 'Pizzas', min: 'ruim', max: 'divina' } });
    fireEvent.click(screen.getByRole('button', { name: 'dar as cartas' }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'beginRound' });
  });

  it('tema próprio incompleto mostra erro', () => {
    render(<ThemePanel view={viewOf(inTheme(), 'p0')} conn={conn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'escrever tema' }));
    fireEvent.click(screen.getByRole('button', { name: 'usar esse tema' }));
    expect(screen.getByText('preenche o tema e os dois extremos')).toBeTruthy();
  });

  it('quem não é host não vê o painel', () => {
    const { container } = render(<ThemePanel view={viewOf(inTheme(), 'p1')} conn={conn()} />);
    expect(container.innerHTML).toBe('');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -w web -- table-ui` → FAIL.

- [ ] **Step 3: `web/src/table/ThemeCard.tsx`**

```tsx
import type { Theme } from '@cartolina/shared';

export function ThemeCard({ theme }: { theme: Theme | null }) {
  if (!theme) return null;
  return (
    <div className="theme">
      <div className="theme-title">{theme.titulo}</div>
      <div className="tscale">
        <b>1</b> {theme.min} · <b>100</b> {theme.max}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: `web/src/table/ThemePanel.tsx`**

```tsx
import { THEME_LIMITS, cleanTheme, type RoomView } from '@cartolina/shared';
import { useState, type FormEvent } from 'react';
import { isHost } from '../game/derive';
import type { GameConn } from '../net/connection';

export function ThemePanel({ view, conn }: { view: RoomView; conn: GameConn }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ titulo: '', min: '', max: '' });
  const [error, setError] = useState<string | null>(null);
  if (!isHost(view)) return null;

  function submit(e: FormEvent) {
    e.preventDefault();
    const theme = cleanTheme(draft);
    if (!theme) {
      setError('preenche o tema e os dois extremos');
      return;
    }
    conn.sendAction({ type: 'customTheme', theme });
    setEditing(false);
    setError(null);
  }

  const field = (key: 'titulo' | 'min' | 'max', label: string, placeholder: string, max: number) => (
    <input
      className="text-in"
      aria-label={label}
      placeholder={placeholder}
      maxLength={max}
      value={draft[key]}
      onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
    />
  );

  return (
    <div className="theme-panel">
      {editing ? (
        <form onSubmit={submit}>
          {field('titulo', 'tema', 'tema (ex.: pizzas)', THEME_LIMITS.titulo)}
          {field('min', '1 =', '1 = …', THEME_LIMITS.extremo)}
          {field('max', '100 =', '100 = …', THEME_LIMITS.extremo)}
          <button className="sbtn solid" type="submit">
            usar esse tema
          </button>
          <button className="sbtn" type="button" onClick={() => setEditing(false)}>
            cancelar
          </button>
          {error && <p className="error">{error}</p>}
        </form>
      ) : (
        <>
          <button className="sbtn" type="button" onClick={() => conn.sendAction({ type: 'rerollTheme' })}>
            sortear outro
          </button>
          <button className="sbtn" type="button" onClick={() => setEditing(true)}>
            escrever tema
          </button>
          <button className="btn" type="button" onClick={() => conn.sendAction({ type: 'beginRound' })}>
            dar as cartas
          </button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: `web/src/table/ReadyColumn.tsx`**

```tsx
import type { RoomView } from '@cartolina/shared';
import { allMineInRow, isHost, isPlaying, readyCount } from '../game/derive';
import type { GameConn } from '../net/connection';
import type { EngineSnapshot } from './engine';

export function ReadyColumn({ view, snap, conn }: { view: RoomView; snap: EngineSnapshot; conn: GameConn }) {
  const { phase } = view.game;
  if (phase === 'theme') {
    return (
      <div className="ready-col">
        <p className="ready-hint">{isHost(view) ? 'escolhe o tema e dá as cartas' : 'o host tá escolhendo o tema…'}</p>
      </div>
    );
  }
  if (phase === 'reveal' || snap.revealing) {
    return (
      <div className="ready-col">
        <button className="btn" type="button" disabled>
          revelando…
        </button>
      </div>
    );
  }
  if (!isPlaying(view)) {
    return (
      <div className="ready-col">
        <p className="ready-hint">você tá assistindo essa rodada</p>
      </div>
    );
  }
  const me = view.you!;
  const iAmReady = view.game.ready.includes(me);
  const placed = allMineInRow(view, snap.row);
  const { ready, total } = readyCount(view);
  const hint = !placed
    ? 'bota suas cartas na fila'
    : iAmReady
      ? `esperando a galera (${ready}/${total})… clica pra desfazer`
      : `${ready}/${total} prontos`;
  return (
    <div className="ready-col">
      <button
        className={`btn ${iAmReady ? 'ready' : ''}`}
        type="button"
        disabled={!placed}
        onClick={() => conn.sendAction({ type: 'ready', ready: !iAmReady })}
      >
        {iAmReady ? 'pronto ✓' : 'tô pronto'}
      </button>
      <p className="ready-hint">{hint}</p>
    </div>
  );
}
```

- [ ] **Step 6: `web/src/table/Seat.tsx`**

```tsx
import type { Activity, RoomView, SeatView } from '@cartolina/shared';
import type { CSSProperties } from 'react';
import { backsOf, seatStatus } from '../game/derive';
import { Avatar } from '../screens/Avatar';
import type { EngineSnapshot } from './engine';
import type { SeatSlot } from './seatLayout';

function positionOf(slot: SeatSlot): CSSProperties {
  if (slot.side === 'top') return { left: `${18 + slot.pos * 64}%`, top: 12 };
  const top = `${14 + slot.pos * 52}%`;
  return slot.side === 'left' ? { left: 20, top } : { right: 20, top };
}

export function Seat({ view, seat, slot, snap, activity }: { view: RoomView; seat: SeatView; slot: SeatSlot; snap: EngineSnapshot; activity: Activity | undefined }) {
  const status = seatStatus(view, seat, activity);
  return (
    <div className={`seat ${slot.side}`} style={positionOf(slot)}>
      <Avatar name={seat.name} color={seat.color} anchor={seat.id} />
      <div className="meta">
        <div className="name">
          {seat.name}
          {seat.id === view.hostId ? ' ★' : ''}
        </div>
        <div className="tag" data-s={status.replace(/[^a-z]/g, '')}>
          {status}
        </div>
      </div>
      <div className="backs">
        {backsOf(view, seat.id, snap.row, snap.inFlight).map((inHand, i) => (
          <div key={i} className={`mback ${inHand ? '' : 'empty'}`} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: `web/src/table/Hand.tsx`**

```tsx
import { CLUE_MAX, type ItoCardView, type RoomView } from '@cartolina/shared';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { handCards, initialOf, type CardPlace } from '../game/derive';
import type { GameConn } from '../net/connection';
import type { EngineSnapshot, TableEngine } from './engine';

const CLUE_DEBOUNCE_MS = 350;

function tiltOf(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return `${(Math.abs(h) % 50) / 10 - 2.5}deg`;
}

function HandSlot({ card, place, color, name, phase, engine, conn }: {
  card: ItoCardView;
  place: CardPlace;
  color: string;
  name: string;
  phase: string;
  engine: TableEngine | null;
  conn: GameConn;
}) {
  const [text, setText] = useState(card.clue);
  const ref = useRef<HTMLTextAreaElement>(null);
  const timer = useRef(0);

  useEffect(() => {
    if (document.activeElement !== ref.current) setText(card.clue);
  }, [card.clue]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onChange = (value: string) => {
    setText(value);
    conn.sendActivity('writing');
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => conn.sendAction({ type: 'clue', cardId: card.id, text: value }), CLUE_DEBOUNCE_MS);
  };

  return (
    <div className={`hslot ${place === 'row' ? 'away' : ''} ${place === 'drag' ? 'dragging' : ''}`} data-hand-slot={card.id}>
      <div
        className="card hcard"
        style={{ '--c': color, '--tilt': tiltOf(card.id) } as CSSProperties}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('textarea') || place !== 'hand') return;
          engine?.beginHandDrag(card.id, e.nativeEvent);
        }}
      >
        <div className="face a">
          <div className="badge">{initialOf(name)}</div>
          <div className="mynum">{card.value}</div>
          <textarea
            ref={ref}
            className="clue-in"
            rows={3}
            maxLength={CLUE_MAX}
            placeholder="escreve uma dica…"
            spellCheck={false}
            value={text}
            disabled={phase !== 'sorting'}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
          />
        </div>
      </div>
      <div className="slot-note">tá na mesa ↑</div>
    </div>
  );
}

export function Hand({ view, snap, engine, conn }: { view: RoomView; snap: EngineSnapshot; engine: TableEngine | null; conn: GameConn }) {
  const me = view.seats.find((s) => s.id === view.you);
  if (!me) return null;
  return (
    <div className="hand">
      {handCards(view, snap.row, snap.inFlight).map(({ card, place }) => (
        <HandSlot key={card.id} card={card} place={place} color={me.color} name={me.name} phase={view.game.phase} engine={engine} conn={conn} />
      ))}
    </div>
  );
}
```

- [ ] **Step 8: `web/src/table/TopBar.tsx`**

```tsx
import { CAMPAIGN_LIVES, type RoomView } from '@cartolina/shared';

export function TopBar({ view }: { view: RoomView }) {
  const { mode, level, lives } = view.game;
  const copy = () => void navigator.clipboard?.writeText(`${window.location.origin}${window.location.pathname}#/sala/${view.code}`);
  return (
    <div className="topbar">
      <div className="logo">
        cartolina<span>~</span>
      </div>
      <div className="pills">
        <button className="pill code" type="button" onClick={copy} title="copiar link da sala">
          sala {view.code}
        </button>
        <span className="pill">{mode === 'livre' ? 'modo livre' : `campanha · nível ${level}`}</span>
        {mode === 'campanha' && (
          <span className="pill lives" aria-label={`${lives} vidas`}>
            {Array.from({ length: CAMPAIGN_LIVES }, (_, i) => (
              <i key={i} className={i < lives ? '' : 'lost'}>
                ♥
              </i>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 9: `web/src/table/Table.tsx`**

```tsx
import type { Activity, RoomView } from '@cartolina/shared';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { isHost, seatStatus } from '../game/derive';
import type { GameConn } from '../net/connection';
import { loadTiltPref, saveTiltPref } from '../net/identity';
import { Avatar } from '../screens/Avatar';
import { FH, FW } from './constants';
import { TableEngine, type EngineSnapshot } from './engine';
import { Hand } from './Hand';
import { ReadyColumn } from './ReadyColumn';
import { Seat } from './Seat';
import { arrangeSeats } from './seatLayout';
import { ThemeCard } from './ThemeCard';
import { ThemePanel } from './ThemePanel';
import { TopBar } from './TopBar';
import './table.css';

const EMPTY: EngineSnapshot = { row: [], inFlight: new Set(), revealing: false };
const noopSubscribe = () => () => {};
const getEmpty = () => EMPTY;
const ACTIVITY_TTL_MS = 4000;
const ROLLBACK_ERRORS = new Set(['not_owner', 'unknown_card', 'bad_phase']);

export function Table({ view, conn }: { view: RoomView; conn: GameConn }) {
  const wrap = useRef<HTMLDivElement>(null);
  const felt = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const markers = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const cursors = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<TableEngine | null>(null);
  const [tiltOn, setTiltOn] = useState(loadTiltPref);
  const [activities, setActivities] = useState<Record<string, { a: Activity; until: number }>>({});
  const [revealDone, setRevealDone] = useState(false);

  useEffect(() => {
    const e = new TableEngine(
      {
        wrap: wrap.current!,
        felt: felt.current!,
        row: row.current!,
        overlay: overlay.current!,
        cursors: cursors.current!,
        tip: tip.current!,
        markers: Array.from(markers.current!.children) as HTMLElement[],
      },
      {
        place: (cardId, index) => conn.sendAction({ type: 'place', cardId, index }),
        ret: (cardId) => conn.sendAction({ type: 'return', cardId }),
        cursor: (fx) => conn.sendCursor(fx),
        activity: (a) => conn.sendActivity(a),
        ping: (x, y) => conn.sendPing(x, y),
        revealDone: () => setRevealDone(true),
      },
    );
    e.setTilt(loadTiltPref(), true);
    setEngine(e);
    return () => e.destroy();
  }, [conn]);

  useEffect(() => {
    engine?.update(view);
  }, [engine, view]);

  useEffect(() => {
    if (view.game.phase !== 'reveal') setRevealDone(false);
  }, [view.game.phase]);

  useEffect(() => {
    if (!engine) return;
    return conn.onFx((fx) => {
      if (fx.t === 'fx.cursor') engine.remoteCursor(fx);
      else if (fx.t === 'fx.ping') engine.remotePing(fx.from, fx.x, fx.y);
      else setActivities((m) => ({ ...m, [fx.from]: { a: fx.activity, until: Date.now() + ACTIVITY_TTL_MS } }));
    });
  }, [conn, engine]);

  useEffect(() => {
    if (!engine) return;
    return conn.onError((code) => {
      if (ROLLBACK_ERRORS.has(code)) engine.rollback();
    });
  }, [conn, engine]);

  useEffect(() => {
    const t = setInterval(() => {
      setActivities((m) => {
        const now = Date.now();
        const next = Object.fromEntries(Object.entries(m).filter(([, v]) => v.until > now));
        return Object.keys(next).length === Object.keys(m).length ? m : next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const snap = useSyncExternalStore(engine ? engine.subscribe : noopSubscribe, engine ? engine.getSnapshot : getEmpty);
  const activityOf = (id: string): Activity | undefined => activities[id]?.a;
  const me = view.seats.find((s) => s.id === view.you);
  const toggleTilt = () => {
    const next = !tiltOn;
    setTiltOn(next);
    saveTiltPref(next);
    engine?.setTilt(next);
  };

  return (
    <div className="table-screen">
      <TopBar view={view} />
      {arrangeSeats(
        view.seats.map((s) => s.id),
        view.you,
      ).map((slot) => {
        const seat = view.seats.find((s) => s.id === slot.id)!;
        return <Seat key={seat.id} view={view} seat={seat} slot={slot} snap={snap} activity={activityOf(seat.id)} />;
      })}

      <div className="stage-wrap" ref={wrap}>
        <div className="stage">
          <div className="felt" ref={felt}>
            <ThemeCard theme={view.game.theme} />
            <div className="endmark m1">1</div>
            <div className="endmark m100">100</div>
            <div className="markers" ref={markers}>
              <div className="hm" style={{ left: 0, top: 0 }} />
              <div className="hm" style={{ left: FW, top: 0 }} />
              <div className="hm" style={{ left: 0, top: FH }} />
              <div className="hm" style={{ left: FW, top: FH }} />
            </div>
            <div className="row" ref={row} />
          </div>
        </div>
      </div>

      {view.game.phase === 'theme' && <ThemePanel view={view} conn={conn} />}

      <div className="me-area">
        {me && (
          <div className="me-id">
            <Avatar name={me.name} color={me.color} />
            <div className="name">você</div>
            <div className="tag" data-s={seatStatus(view, me, undefined).replace(/[^a-z]/g, '')}>
              {seatStatus(view, me, undefined)}
            </div>
          </div>
        )}
        <Hand view={view} snap={snap} engine={engine} conn={conn} />
        <ReadyColumn view={view} snap={snap} conn={conn} />
      </div>

      <div className="controls">
        <button className="toggle-row" type="button" onClick={toggleTilt} aria-pressed={tiltOn}>
          <span>mesa 3D</span>
          <span className={`toggle ${tiltOn ? 'on' : ''}`}>
            <span className="knob" />
          </span>
        </button>
        {isHost(view) && view.game.phase === 'sorting' && (
          <button className="sbtn" type="button" onClick={() => conn.sendAction({ type: 'forceReveal' })}>
            revelar agora
          </button>
        )}
      </div>

      {view.game.phase === 'reveal' && revealDone && <div data-reveal-done />}

      <div className="overlay-layer" ref={overlay} />
      <div className="cursor-layer" ref={cursors} />
      <div className="tip" ref={tip} />
    </div>
  );
}
```

(O `<div data-reveal-done />` é substituído pelo `ResultBanner` na Task 12.)

- [ ] **Step 10: `web/src/screens/Game.tsx`** — troque o placeholder da mesa pela `Table`:

```tsx
import type { RoomView } from '@cartolina/shared';
import type { ConnSnapshot, GameConn } from '../net/connection';
import { Table } from '../table/Table';
import { Lobby } from './Lobby';
import { Toasts } from './Toasts';

export function Game({ conn, snap, view }: { conn: GameConn; snap: ConnSnapshot; view: RoomView }) {
  return (
    <>
      {snap.status === 'reconnecting' && <div className="banner-reconnect">reconectando…</div>}
      {view.game.phase === 'lobby' ? <Lobby view={view} conn={conn} /> : <Table view={view} conn={conn} />}
      <Toasts conn={conn} />
    </>
  );
}
```

- [ ] **Step 11: Rodar** — `npm test -w web && npm run typecheck && npm run build` → PASS.

- [ ] **Step 12: Fumaça manual (só se houver navegador disponível; senão pule e diga no relatório — o controlador faz o playtest)** — `npm run dev:server` + `npm run dev:web`; duas abas (duas cores) na mesma sala; host começa, sorteia/escreve tema, dá as cartas. Verifique: mesa inclinada; arrastar sua carta da mão para a fila abre o buraco e assenta; na outra aba o cursor colorido aparece e a carta sai do assento, segue o cursor e assenta; reordenar funciona; soltar fora devolve pra mão; dica escrita aparece na carta das duas abas; "tô pronto" nas duas revela (as cartas viram). Encerre os servidores.

- [ ] **Step 13: Commit**

```bash
git add web
git commit -m "feat(web): mesa em React com assentos, mão, prontos e tema ligada ao motor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Resultado da rodada (banner, confete, próximas ações)

**Files:**
- Create: `web/src/table/confetti.ts`, `web/src/table/ResultBanner.tsx`
- Modify: `web/src/table/Table.tsx`
- Test: `web/test/result.test.tsx`

- [ ] **Step 1: Testes** — `web/test/result.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { resultCopy, ResultBanner } from '../src/table/ResultBanner';
import { act, sortingRoom, viewOf } from './fixtures';

const conn = () => ({
  sendAction: vi.fn(),
  sendActivity: vi.fn(),
  sendCursor: vi.fn(),
  sendPing: vi.fn(),
  onFx: vi.fn(() => () => {}),
  onError: vi.fn(() => () => {}),
});

function revealed() {
  let room = sortingRoom(2);
  room = act(room, 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
  room = act(room, 'p1', { type: 'place', cardId: 'p1:0', index: 1 });
  return act(room, 'p0', { type: 'forceReveal' });
}

describe('resultCopy', () => {
  it('textos por resultado', () => {
    expect(resultCopy('round_won', 1, 0).win).toBe(true);
    expect(resultCopy('round_lost', 1, 2)).toMatchObject({ win: false, title: 'xi, errou essa', sub: '2 cartas fora de ordem', next: 'nova rodada' });
    expect(resultCopy('level_cleared', 2, 1)).toMatchObject({ win: true, title: 'nível 2 ✓', next: 'próximo nível' });
    expect(resultCopy('lost', 3, 1)).toMatchObject({ win: false, next: 'voltar pro lobby' });
    expect(resultCopy('won', 3, 0)).toMatchObject({ win: true, next: 'voltar pro lobby' });
  });
});

describe('ResultBanner', () => {
  it('host vê próxima ação e voltar ao lobby', () => {
    const c = conn();
    render(<ResultBanner view={viewOf(revealed(), 'p0')} conn={c} />);
    fireEvent.click(screen.getByRole('button', { name: 'nova rodada' }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'next' });
    fireEvent.click(screen.getByRole('button', { name: 'voltar pro lobby' }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'lobby' });
  });

  it('quem não é host espera', () => {
    render(<ResultBanner view={viewOf(revealed(), 'p1')} conn={conn()} />);
    expect(screen.getByText('esperando o host…')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -w web -- result` → FAIL.

- [ ] **Step 3: `web/src/table/confetti.ts`**

```ts
import { PLAYER_COLORS } from '@cartolina/shared';

/** Confete simples em canvas; devolve uma função que interrompe a animação. */
export function confetti(canvas: HTMLCanvasElement | null): () => void {
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return () => {};
  const dpr = window.devicePixelRatio || 1;
  const W = window.innerWidth;
  const H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const parts = Array.from({ length: 140 }, () => ({
    x: W / 2 + (Math.random() - 0.5) * 200,
    y: H * 0.3,
    vx: (Math.random() - 0.5) * 900,
    vy: -300 - Math.random() * 700,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 12,
    w: 6 + Math.random() * 6,
    h: 10 + Math.random() * 8,
    c: PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)]!,
  }));
  let last = performance.now();
  let raf = 0;
  const step = (now: number) => {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, W, H);
    let alive = 0;
    for (const p of parts) {
      p.vy += 900 * dt;
      p.vx *= 0.99;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.r += p.vr * dt;
      if (p.y < H + 40) alive++;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      ctx.strokeStyle = '#3B2F2F';
      ctx.lineWidth = 1.5;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (alive > 0) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}
```

- [ ] **Step 4: `web/src/table/ResultBanner.tsx`**

```tsx
import type { ItoOutcome, RoomView } from '@cartolina/shared';
import { useEffect, useRef } from 'react';
import { isHost } from '../game/derive';
import type { GameConn } from '../net/connection';
import { confetti } from './confetti';

export function resultCopy(outcome: ItoOutcome, level: number, errors: number): { win: boolean; title: string; sub: string; next: string } {
  const wrong = `${errors} carta${errors === 1 ? '' : 's'} fora de ordem`;
  switch (outcome) {
    case 'round_won':
      return { win: true, title: 'vitória', sub: 'a fila tá perfeitinha, que sintonia!', next: 'nova rodada' };
    case 'round_lost':
      return { win: false, title: 'xi, errou essa', sub: wrong, next: 'nova rodada' };
    case 'level_cleared':
      return { win: true, title: `nível ${level} ✓`, sub: errors ? `${wrong}, mas ainda tem vida!` : 'sem errar nenhuma!', next: 'próximo nível' };
    case 'won':
      return { win: true, title: 'zeraram a campanha', sub: 'os três níveis, que time!', next: 'voltar pro lobby' };
    case 'lost':
      return { win: false, title: 'acabaram as vidas', sub: wrong, next: 'voltar pro lobby' };
  }
}

export function ResultBanner({ view, conn }: { view: RoomView; conn: GameConn }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const outcome = view.game.outcome ?? 'round_lost';
  const errors = view.game.reveal?.filter((e) => e.error).length ?? 0;
  const copy = resultCopy(outcome, view.game.level, errors);
  const finished = outcome === 'won' || outcome === 'lost';

  useEffect(() => (copy.win ? confetti(canvas.current) : undefined), [copy.win]);

  return (
    <>
      <div className="veil" />
      <div className={`banner ${copy.win ? 'win' : ''}`} role="dialog" aria-label={copy.title}>
        <div className="b-title">
          {copy.title}
          {copy.win && <span>~</span>}
        </div>
        <div className="b-sub">{copy.sub}</div>
        {isHost(view) ? (
          <div className="b-actions">
            <button className="btn" type="button" onClick={() => conn.sendAction({ type: 'next' })}>
              {copy.next}
            </button>
            {!finished && (
              <button className="sbtn" type="button" onClick={() => conn.sendAction({ type: 'lobby' })}>
                voltar pro lobby
              </button>
            )}
          </div>
        ) : (
          <p className="hint">esperando o host…</p>
        )}
      </div>
      <canvas className="confetti" ref={canvas} />
    </>
  );
}
```

- [ ] **Step 5: `web/src/table/Table.tsx`** — importe `ResultBanner` (`import { ResultBanner } from './ResultBanner';`) e troque `{view.game.phase === 'reveal' && revealDone && <div data-reveal-done />}` por:

```tsx
      {view.game.phase === 'reveal' && revealDone && <ResultBanner view={view} conn={conn} />}
```

- [ ] **Step 6: Rodar** — `npm test -w web && npm run typecheck && npm run build` → PASS. (Em jsdom, `canvas.getContext` devolve `null`; `confetti` já trata.)

- [ ] **Step 7: Commit**

```bash
git add web
git commit -m "feat(web): resultado da rodada com confete e próximas ações do host

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Fumaça de ponta a ponta, build e README

**Files:**
- Create: `scripts/smoke.mjs`
- Modify: `package.json` (raiz), `README.md`

- [ ] **Step 1: `scripts/smoke.mjs`** (usa o `WebSocket` global do Node 24)

```js
// Fumaça: cria sala, dois jogadores entram, jogam uma rodada livre até a revelação.
// Uso: com `npm run dev:server` rodando, `npm run smoke`.
const BASE = process.env.SERVER_URL ?? 'http://127.0.0.1:8787';
const WS = BASE.replace(/^http/, 'ws');

function client(code, name, color) {
  const ws = new WebSocket(`${WS}/rooms/${code}/ws`);
  const inbox = [];
  const waiters = [];
  ws.addEventListener('message', (e) => {
    if (e.data === 'pong') return;
    inbox.push(JSON.parse(e.data));
    waiters.splice(0).forEach((w) => w());
  });
  const until = async (pred, label) => {
    const deadline = Date.now() + 5000;
    for (;;) {
      const i = inbox.findIndex(pred);
      if (i >= 0) return inbox.splice(i, 1)[0];
      if (Date.now() > deadline) throw new Error(`timeout: ${label}`);
      await new Promise((r) => {
        waiters.push(r);
        setTimeout(r, 100);
      });
    }
  };
  const ready = new Promise((r) => ws.addEventListener('open', r));
  return {
    ws,
    until,
    async join() {
      await ready;
      ws.send(JSON.stringify({ t: 'join', token: crypto.randomUUID(), name, color }));
      return (await until((m) => m.t === 'welcome', 'welcome')).playerId;
    },
    send: (action) => ws.send(JSON.stringify({ t: 'action', action })),
    state: (pred, label) => until((m) => m.t === 'state' && pred(m.room), label).then((m) => m.room),
  };
}

const res = await fetch(`${BASE}/rooms`, { method: 'POST' });
const { code } = await res.json();
console.log('sala', code);
const a = client(code, 'Ana', '#8EC5FF');
const b = client(code, 'Bia', '#FF8FAB');
const ida = await a.join();
const idb = await b.join();
a.send({ type: 'start' });
await a.state((r) => r.game.phase === 'theme', 'theme');
a.send({ type: 'beginRound' });
const ra = await a.state((r) => r.game.phase === 'sorting', 'sorting a');
const rb = await b.state((r) => r.game.phase === 'sorting', 'sorting b');
const ca = Object.values(ra.game.cards).find((c) => c.owner === ida);
const cb = Object.values(rb.game.cards).find((c) => c.owner === idb);
a.send({ type: 'place', cardId: ca.id, index: 0 });
await b.state((r) => r.game.row.length === 1, 'row 1');
b.send({ type: 'place', cardId: cb.id, index: 1 });
await a.state((r) => r.game.row.length === 2, 'row 2');
a.send({ type: 'ready', ready: true });
b.send({ type: 'ready', ready: true });
const done = await a.state((r) => r.game.phase === 'reveal', 'reveal');
console.log('revelação', done.game.reveal.map((e) => e.value).join(' → '), done.game.outcome);
a.ws.close();
b.ws.close();
console.log('ok');
```

- [ ] **Step 2: Script na raiz** — em `package.json`, acrescente `"smoke": "node scripts/smoke.mjs"`.

- [ ] **Step 3: Rodar a fumaça** — `npm run dev:server` em background, depois `npm run smoke` → imprime `sala XXXX`, a revelação e `ok`. Pare o servidor (sem processos `wrangler`/`workerd` sobrando).

- [ ] **Step 4: Verificação completa** — `npm test`, `npm run typecheck`, `npm run build` → tudo PASS.

- [ ] **Step 5: README** — substitua a seção `## Desenvolvimento` do `README.md` por:

````markdown
## Desenvolvimento

```bash
npm install
npm test              # shared, server e web
npm run typecheck
npm run dev:server    # servidor local em http://127.0.0.1:8787
npm run dev:web       # site em http://localhost:5173
npm run smoke         # fumaça WS de ponta a ponta (com o servidor rodando)
npm run build         # build do site em web/dist
```

Para testar sozinho, abra a sala em duas abas: cada aba é um jogador (o token fica no `sessionStorage`).
O site usa `VITE_SERVER_URL` (padrão `http://127.0.0.1:8787`).
````
E troque a linha `- \`web/\` — site (Plano 2)` por `- \`web/\` — site em React; a mesa é um motor imperativo (\`web/src/table/engine.ts\`) portado de \`prototipo/\``.

- [ ] **Step 6: Commit**

```bash
git add scripts package.json README.md
git commit -m "chore: fumaça de ponta a ponta e README do site

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Playtest com o usuário** (feito pelo controlador, não pelo subagente): subir `server` e `web` pelo `.claude/launch.json`, jogar com duas abas e checar:
  1. criar sala → entrar → lobby nas duas abas; cor ocupada aparece desabilitada na segunda;
  2. host começa, sorteia e escreve tema, dá as cartas;
  3. arrastar da mão pra fila, reordenar, soltar fora; na outra aba ver cursor, carta saindo do assento, buraco e assentar;
  4. dicas aparecem nas duas abas; status "escrevendo…"/"arrastando…"/"pronto ✓" nos assentos;
  5. ping com clique duplo nas duas abas;
  6. prontos → revelação carta a carta, erro com tremidinho/✕, banner, confete na vitória;
  7. campanha: vidas, níveis 1→2→3, derrota e vitória;
  8. recarregar a aba no meio da rodada volta pro lugar; fechar uma aba → assento "desconectado" e, após 30 s, a revelação ignora quem saiu;
  9. alternar "mesa 3D".

---

## Cobertura

| Requisito | Task |
|---|---|
| Spec §4.1 telas início/entrar/lobby/sala inexistente/cheia | 9 (+ Task 1 para cores ocupadas) |
| Spec §4.2 mesa estilo Uno, assentos ao redor, status ao vivo | 7, 10, 11 |
| Spec §4.2 arrasto ao vivo, buraco, cursores, ping, flip | 8, 10, 11 |
| Spec §4.3 mesa em perspectiva 38° + opção | 10, 11 |
| Spec §4.4 molas e interpolação | 8, 10 |
| Spec §5 identidade cartolina (tokens, fontes, formas) | 4, 10 |
| Spec §6 reconexão com backoff, ação inválida desfaz, sala inexistente/cheia | 6, 9, 10, 11 |
| Notas do Plano 1: resumo da sala, reconcilePresence pura, códigos tipados, heartbeat, cleanName | 1, 2, 3, 6 |
| Celular, manual de marca, deploy, E2E | Plano 4 |

## Adições feitas durante a execução (pedidos do usuário e revisões)

- **Regra de mover:** qualquer jogador da rodada move qualquer carta já na fila; só o dono coloca da mão, tira da fila ou edita a dica (shared `movableCard`, motor, spec §2).
- **Resultado:** botão de olho "ver a mesa" + pílula para voltar ao banner; host pode "pular rodada" durante a ordenação.
- **Personagens:** 18 desenhos (`web/src/brand/critters.ts`) no lugar de cores/iniciais (entrada, lobby, assentos, selo das cartas, buraco da fila); 18 cores no `shared`.
- **Sons:** `web/public/sounds/{reveal,card}.mp3` (do autor), `web/src/brand/sounds.ts`, botão "som".
- **Bots de teste:** só em desenvolvimento (`web/src/dev/*`, carregados com `import.meta.env.DEV`), fora do build de produção.
- **Robustez:** heartbeat (auto-response + varredura no servidor, reconexão ao voltar para a aba), identidade por aba em dev e persistente em produção, correção do corte da carta ao assentar na mesa 3D, intenções otimistas ancoradas.
