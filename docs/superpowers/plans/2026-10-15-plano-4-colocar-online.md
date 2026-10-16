# Plano 4 — colocar o cartolina online — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** publicar o cartolina (site no GitHub Pages, servidor na Cloudflare) com publicação automática a cada push no `main`, protegido por testes de ponta a ponta, e com os ajustes que só importam online.

**Architecture:** um workflow do GitHub Actions roda checagens → E2E (Playwright contra `wrangler dev` + `vite preview`) → migração remota do D1 + `wrangler deploy` → build do site com `VITE_SERVER_URL` + GitHub Pages. O servidor ganha CORS por origem, limitador por IP (binding opcional de Rate Limiting) e limite de corpo; o cliente manda cursor com menos frequência, para de reconectar em sala que acabou e mostra aviso no celular.

**Tech Stack:** Cloudflare Workers + Durable Objects + D1 (wrangler 4), React 19 + Vite 8, Vitest 4, `@cloudflare/vitest-plugin`, Playwright, GitHub Actions + GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-10-15-plano-4-online-design.md`.

**Branch:** `feat/plano-4-online` (já criada a partir do `main`, com a spec commitada).

---

## Convenções do repositório (leia antes de qualquer task)

- Monorepo com npm workspaces: `shared/`, `server/`, `web/`. Rode tudo da raiz.
  - Testes: `npm test` (todos) ou `npm run test -w server` / `npm run test -w web`.
  - Um arquivo só: `npm run test -w web -- test/connection.test.ts`.
  - Tipos: `npm run typecheck`. Build do site: `npm run build`.
- Windows + PowerShell. Encadeie com `;` e confira `$?` ou rode um comando por vez. **Não** use `&&` no PowerShell 5.1.
- Textos de interface em PT-BR informal; comentários de código em PT-BR, curtos.
- Commits terminam com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- TypeScript estrito com `noUncheckedIndexedAccess` e `verbatimModuleSyntax` (use `import type` para tipos).
- Testes do servidor usam `SELF.fetch` de `cloudflare:test` e os helpers em `server/test/helpers.ts`. Esses helpers **não** mandam `Origin` nem `CF-Connecting-IP`, e assim devem continuar funcionando.
- Testes do web usam jsdom + Testing Library. `web/test/setup.ts` limpa `sessionStorage` e `localStorage` depois de cada teste.

## Mapa de arquivos

| Arquivo | O que muda |
|---|---|
| `server/src/guard.ts` (novo) | `allowedOrigin`, `underLimit`, `readSmallJson`, `MAX_BODY_BYTES`, `TOO_LARGE`, tipo `Limiter` |
| `server/src/index.ts` | CORS por origem, `Origin` no WebSocket, 413, 429 |
| `server/wrangler.jsonc` | `vars.ALLOWED_ORIGINS`, `ratelimits` e depois o `database_id` real |
| `server/worker-configuration.d.ts` | regenerado com `npm run types -w server` |
| `server/test/guard.test.ts` (novo), `server/test/http.test.ts` | testes |
| `web/src/net/errors.ts` (novo) | `isTooMany`, `TOO_MANY_MESSAGE` |
| `web/src/screens/Home.tsx`, `web/src/screens/GroupPage.tsx` | mensagem do 429; aviso no celular (Home) |
| `web/src/net/connection.ts` | ritmo novo do cursor; checagem de sala que acabou |
| `web/src/screens/RoomScreen.tsx` | `roomExists` na conexão; tela "essa sala acabou" |
| `web/src/lib/device.ts` (novo), `web/src/screens/PhoneNotice.tsx` (novo), `web/src/App.tsx` | aviso no celular |
| `e2e/` (novo), `package.json` da raiz, `.gitignore` | Playwright |
| `.github/workflows/deploy.yml` (novo) | publicação automática |
| `docs/deploy.md` (novo), `README.md` | passo a passo e primeira noite |

---

### Task 1: CORS por origem e `Origin` no WebSocket

**Files:**
- Create: `server/src/guard.ts`
- Create: `server/test/guard.test.ts`
- Modify: `server/src/index.ts`
- Modify: `server/wrangler.jsonc`
- Modify: `server/test/http.test.ts`
- Regenerate: `server/worker-configuration.d.ts`

- [ ] **Step 1: Adicionar a var no `wrangler.jsonc`**

Em `server/wrangler.jsonc`, logo depois de `"compatibility_flags"`, acrescente:

```jsonc
  "vars": { "ALLOWED_ORIGINS": "https://rafa-mesquita.github.io" },
```

Depois regenere os tipos:

Run: `npm run types -w server`
Expected: `server/worker-configuration.d.ts` reescrito, agora com `ALLOWED_ORIGINS: "https://rafa-mesquita.github.io";` dentro de `Env`.

- [ ] **Step 2: Escrever os testes que falham**

Crie `server/test/guard.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { allowedOrigin } from '../src/guard';

const PAGES = 'https://rafa-mesquita.github.io';

describe('allowedOrigin', () => {
  it('aceita a origem do Pages e as locais (qualquer porta)', () => {
    expect(allowedOrigin(PAGES, PAGES)).toBe(PAGES);
    expect(allowedOrigin('http://localhost:5173', PAGES)).toBe('http://localhost:5173');
    expect(allowedOrigin('http://127.0.0.1:4173', PAGES)).toBe('http://127.0.0.1:4173');
    expect(allowedOrigin('http://localhost', PAGES)).toBe('http://localhost');
  });

  it('lista separada por vírgula, com espaços', () => {
    expect(allowedOrigin('https://b.example', `${PAGES}, https://b.example`)).toBe('https://b.example');
  });

  it('recusa o resto (inclusive parecidos)', () => {
    expect(allowedOrigin(null, PAGES)).toBeNull();
    expect(allowedOrigin('https://evil.example', PAGES)).toBeNull();
    expect(allowedOrigin('https://rafa-mesquita.github.io.evil.example', PAGES)).toBeNull();
    expect(allowedOrigin('http://localhost.evil.example', PAGES)).toBeNull();
    expect(allowedOrigin('https://localhost:5173', PAGES)).toBeNull();
  });
});
```

Em `server/test/http.test.ts`, troque a linha
`expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');`
por
`expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull(); // sem Origin (fora do navegador): sem CORS`

No teste `'OPTIONS responde CORS'`, mande uma origem permitida (sem `Origin` não há mais cabeçalhos de CORS):
`const res = await SELF.fetch('https://x/rooms', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } });`

e acrescente, dentro do `describe('HTTP', ...)`:

```ts
  it('CORS: devolve a origem só se ela for permitida', async () => {
    const pages = await SELF.fetch('https://x/rooms/ZZZZ', { headers: { Origin: 'https://rafa-mesquita.github.io' } });
    expect(pages.headers.get('Access-Control-Allow-Origin')).toBe('https://rafa-mesquita.github.io');
    expect(pages.headers.get('Vary')).toContain('Origin');
    const local = await SELF.fetch('https://x/rooms', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } });
    expect(local.status).toBe(204);
    expect(local.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    const evil = await SELF.fetch('https://x/rooms/ZZZZ', { headers: { Origin: 'https://evil.example' } });
    expect(evil.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('WebSocket: origem de fora dá 403; local e sem Origin entram', async () => {
    const code = await newRoomCode();
    const evil = await SELF.fetch(`https://x/rooms/${code}/ws`, { headers: { Upgrade: 'websocket', Origin: 'https://evil.example' } });
    expect(evil.status).toBe(403);
    const local = await SELF.fetch(`https://x/rooms/${code}/ws`, { headers: { Upgrade: 'websocket', Origin: 'http://localhost:5173' } });
    expect(local.status).toBe(101);
    local.webSocket?.accept();
    local.webSocket?.close();
  });
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm run test -w server -- test/guard.test.ts test/http.test.ts`
Expected: FAIL, porque `../src/guard` ainda não existe e o ACAO ainda é `*`.

- [ ] **Step 4: Implementar**

Crie `server/src/guard.ts`:

```ts
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * Devolve a origem se ela pode falar com o servidor (o site publicado ou o dev local), ou null.
 * `allowed` é a var `ALLOWED_ORIGINS`: origens separadas por vírgula.
 */
export function allowedOrigin(origin: string | null, allowed: string): string | null {
  if (!origin) return null;
  if (LOCAL_ORIGIN.test(origin)) return origin;
  const list = allowed
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.includes(origin) ? origin : null;
}
```

Em `server/src/index.ts`:

1. Troque o import e o bloco `CORS`/`json`. Ficam assim:

```ts
import { cleanGroupName, summarizeHistory, type GroupResponse, type RoomGroup } from '@cartolina/shared';
import { CODE_RE, SLUG_RE, randomCode } from './codes';
import { allowedOrigin } from './guard';
import { allRounds, createGroup, findGroup, listRounds, type GroupRow } from './history-db';
import { RoomDO } from './room-do';

export { RoomDO };

const PAGE_SIZE = 20;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** CORS só para origens permitidas. 101 (upgrade de WebSocket) passa intacto: os headers dele são imutáveis. */
function withCors(res: Response, origin: string | null): Response {
  if (res.status === 101) return res;
  const out = new Response(res.body, res);
  out.headers.append('Vary', 'Origin');
  if (origin) {
    out.headers.set('Access-Control-Allow-Origin', origin);
    out.headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    out.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  }
  return out;
}
```

2. Mude a assinatura de `handle` para receber a origem crua e a permitida, e troque a primeira linha do OPTIONS e o ramo de WebSocket:

```ts
async function handle(request: Request, env: Env, rawOrigin: string | null, origin: string | null): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
```

e, no bloco `roomMatch`, troque `if (roomMatch[2]) return stub.fetch(request);` por:

```ts
    if (roomMatch[2]) {
      // Navegador de outro site tentando abrir o WebSocket: recusa. Sem Origin (scripts, testes) segue.
      if (rawOrigin && !origin) return json({ error: 'forbidden_origin' }, 403);
      return stub.fetch(request);
    }
```

3. O `export default` fica:

```ts
export default {
  async fetch(request, env): Promise<Response> {
    const rawOrigin = request.headers.get('Origin');
    const origin = allowedOrigin(rawOrigin, env.ALLOWED_ORIGINS);
    try {
      return withCors(await handle(request, env, rawOrigin, origin), origin);
    } catch (err) {
      console.error('erro no Worker', err);
      return withCors(json({ error: 'internal' }, 500), origin);
    }
  },
} satisfies ExportedHandler<Env>;
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm run test -w server`
Expected: PASS, todos (os 46 antigos + os novos).

Run: `npm run typecheck -w server`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add server/src/guard.ts server/src/index.ts server/wrangler.jsonc server/worker-configuration.d.ts server/test/guard.test.ts server/test/http.test.ts
git commit -m "feat(server): CORS só para o site e o dev local; WebSocket confere a origem"
```

---

### Task 2: Limites contra abuso (429 e 413)

**Files:**
- Modify: `server/src/guard.ts`
- Modify: `server/src/index.ts`
- Modify: `server/wrangler.jsonc`
- Regenerate: `server/worker-configuration.d.ts`
- Modify: `server/test/guard.test.ts`, `server/test/http.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Acrescente em `server/test/guard.test.ts` (ajuste o import para trazer tudo):

```ts
import { MAX_BODY_BYTES, TOO_LARGE, allowedOrigin, readSmallJson, underLimit, type Limiter } from '../src/guard';

describe('underLimit', () => {
  const limiter = (success: boolean): Limiter & { keys: string[] } => {
    const keys: string[] = [];
    return { keys, limit: async ({ key }) => (keys.push(key), { success }) };
  };

  it('sem binding ou sem IP: sempre pode', async () => {
    expect(await underLimit(undefined, '203.0.113.7')).toBe(true);
    const l = limiter(false);
    expect(await underLimit(l, null)).toBe(true);
    expect(l.keys).toEqual([]);
  });

  it('com binding e IP: pergunta ao limitador usando o IP como chave', async () => {
    const ok = limiter(true);
    expect(await underLimit(ok, '203.0.113.7')).toBe(true);
    expect(ok.keys).toEqual(['203.0.113.7']);
    expect(await underLimit(limiter(false), '203.0.113.7')).toBe(false);
  });
});

describe('readSmallJson', () => {
  const req = (body: string, headers: Record<string, string> = {}) =>
    new Request('https://x/groups', { method: 'POST', body, headers });

  it('lê JSON pequeno; JSON inválido vira null', async () => {
    expect(await readSmallJson(req('{"name":"Galera"}'))).toEqual({ name: 'Galera' });
    expect(await readSmallJson(req('{oops'))).toBeNull();
  });

  it('corpo acima do limite é recusado', async () => {
    const big = JSON.stringify({ name: 'x'.repeat(MAX_BODY_BYTES) });
    expect(await readSmallJson(req(big))).toBe(TOO_LARGE);
  });
});
```

Acrescente em `server/test/http.test.ts`:

```ts
  it('corpo grande demais dá 413', async () => {
    const res = await SELF.fetch('https://x/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x'.repeat(2000) }),
    });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'too_large' });
  });

  it('criar grupo: o 6º pedido do mesmo IP no minuto dá 429', async () => {
    const ip = `198.51.100.${Math.floor(Math.random() * 250) + 1}`;
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await SELF.fetch('https://x/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
        body: JSON.stringify({ name: `Galera ${i}` }),
      });
      statuses.push(res.status);
    }
    expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test -w server -- test/guard.test.ts test/http.test.ts`
Expected: FAIL (`underLimit`/`readSmallJson` não existem; sem 413/429).

- [ ] **Step 3: Implementar o `guard.ts`**

Acrescente ao fim de `server/src/guard.ts`:

```ts
/** Maior corpo aceito num POST (o maior uso real é `{ "name": "<até 40 letras>" }`). */
export const MAX_BODY_BYTES = 1024;
export const TOO_LARGE = Symbol('too_large');

/** Lê um corpo JSON pequeno. Maior que o limite → `TOO_LARGE`; JSON inválido → null. */
export async function readSmallJson(request: Request, max = MAX_BODY_BYTES): Promise<unknown> {
  const declared = Number(request.headers.get('Content-Length') ?? '0');
  if (declared > max) return TOO_LARGE;
  const text = await request.text();
  if (new TextEncoder().encode(text).length > max) return TOO_LARGE;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** O que usamos do binding de Rate Limiting da Cloudflare. */
export interface Limiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/**
 * true = pode seguir. Sem binding (ambiente sem o limitador) ou sem IP (testes, scripts): segue.
 * Em produção a Cloudflare sempre manda `CF-Connecting-IP`.
 */
export async function underLimit(limiter: Limiter | undefined, ip: string | null): Promise<boolean> {
  if (!limiter || !ip) return true;
  return (await limiter.limit({ key: ip })).success;
}
```

- [ ] **Step 4: Bindings no `wrangler.jsonc`**

Em `server/wrangler.jsonc`, depois de `"vars"`, acrescente:

```jsonc
  // Rate Limiting (opcional no código): se o plano grátis recusar, apague este bloco e o resto continua igual.
  "ratelimits": [
    { "name": "ROOM_LIMITER", "namespace_id": "1001", "simple": { "limit": 10, "period": 60 } },
    { "name": "GROUP_LIMITER", "namespace_id": "1002", "simple": { "limit": 5, "period": 60 } }
  ],
```

Run: `npm run types -w server`
Expected: `worker-configuration.d.ts` com `ROOM_LIMITER` e `GROUP_LIMITER`.

- [ ] **Step 5: Usar no `index.ts`**

Em `server/src/index.ts`:

1. Import: `import { MAX_BODY_BYTES, TOO_LARGE, allowedOrigin, readSmallJson, underLimit, type Limiter } from './guard';`
2. Acima de `handle`, acrescente:

```ts
/** O binding pode não existir (removido do wrangler.jsonc se o plano não tiver): lê sem depender do tipo gerado. */
function limiterOf(env: Env, name: 'ROOM_LIMITER' | 'GROUP_LIMITER'): Limiter | undefined {
  return (env as unknown as Partial<Record<typeof name, Limiter>>)[name];
}

const tooMany = () => json({ error: 'too_many' }, 429);
```

3. No começo de `handle`, depois do OPTIONS:

```ts
  const ip = request.headers.get('CF-Connecting-IP');
  if (request.method === 'POST' && Number(request.headers.get('Content-Length') ?? '0') > MAX_BODY_BYTES) {
    return json({ error: 'too_large' }, 413);
  }

  if (request.method === 'POST' && url.pathname === '/rooms') {
    if (!(await underLimit(limiterOf(env, 'ROOM_LIMITER'), ip))) return tooMany();
    return createRoomFor(env, null);
  }

  if (request.method === 'POST' && url.pathname === '/groups') {
    if (!(await underLimit(limiterOf(env, 'GROUP_LIMITER'), ip))) return tooMany();
    const body = await readSmallJson(request);
    if (body === TOO_LARGE) return json({ error: 'too_large' }, 413);
    const raw = (body as { name?: unknown } | null)?.name;
    const name = typeof raw === 'string' ? cleanGroupName(raw) : null;
    if (!name) return json({ error: 'bad_group_name' }, 400);
    const group = await createGroup(env.DB, name, Date.now());
    return json({ slug: group.slug, name: group.name }, 201);
  }
```

(isso substitui os dois blocos antigos de `POST /rooms` e `POST /groups`.)

4. No bloco de grupo, troque `if (wantsRoom) return createRoomFor(...)` por:

```ts
    if (wantsRoom) {
      if (!(await underLimit(limiterOf(env, 'ROOM_LIMITER'), ip))) return tooMany();
      return createRoomFor(env, { id: group.id, slug: group.slug, name: group.name });
    }
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npm run test -w server`
Expected: PASS.

> **Se só o teste "6º pedido dá 429" falhar com seis 201:** o Miniflare desta versão não aplica o limite. Nesse caso troque o teste por um que só confere que pedidos **com** `CF-Connecting-IP` continuam dando 201 (o binding existe e não quebra nada). A regra em si já está coberta pelos testes de `underLimit`. Anote a troca no relatório da task.

Run: `npm run typecheck -w server`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add server/src/guard.ts server/src/index.ts server/wrangler.jsonc server/worker-configuration.d.ts server/test/guard.test.ts server/test/http.test.ts
git commit -m "feat(server): limite por IP para criar salas e grupos, e corpo de até 1 KB"
```

---

### Task 3: Site mostra "calma!" no 429

**Files:**
- Create: `web/src/net/errors.ts`
- Modify: `web/src/screens/Home.tsx`
- Modify: `web/src/screens/GroupPage.tsx`
- Modify: `web/test/groups-ui.test.tsx`

- [ ] **Step 1: Escrever os testes que falham**

Em `web/test/groups-ui.test.tsx`:

1. No `vi.mock('../src/net/api', ...)` (linha ~13), acrescente `createRoom: vi.fn()` ao objeto devolvido:
   `return { ...actual, createGroup: vi.fn(), getGroup: vi.fn(), createGroupRoom: vi.fn(), createRoom: vi.fn() };`
2. No `beforeEach` que já faz `mockReset`, acrescente `vi.mocked(api.createRoom).mockReset();`.
3. Acrescente um `describe` novo no fim do arquivo:

```tsx
describe('pedidos demais (429)', () => {
  const CALMA = 'Calma! Tenta de novo em um minutinho.';

  it('criar sala na tela inicial', async () => {
    vi.mocked(api.createRoom).mockRejectedValue(new Error('create_failed_429'));
    render(<Home />);
    fireEvent.click(screen.getByRole('button', { name: 'criar sala' }));
    expect((await screen.findByRole('alert')).textContent).toBe(CALMA);
  });

  it('criar grupo', async () => {
    vi.mocked(api.createGroup).mockRejectedValue(new Error('group_create_failed_429'));
    render(<Home />);
    fireEvent.change(screen.getByLabelText('nome do grupo'), { target: { value: 'Galera' } });
    fireEvent.click(screen.getByRole('button', { name: 'criar grupo' }));
    expect((await screen.findByRole('alert')).textContent).toBe(CALMA);
  });

  it('criar sala do grupo', async () => {
    vi.mocked(api.getGroup).mockResolvedValue(response([], null));
    vi.mocked(api.createGroupRoom).mockRejectedValue(new Error('create_failed_429'));
    render(<GroupPage slug="abcdefghjk" />);
    fireEvent.click(await screen.findByRole('button', { name: 'criar sala do grupo' }));
    expect(await screen.findByText(CALMA)).toBeTruthy();
  });
});
```

(`Home`, `GroupPage`, `response`, `render`, `screen` e `fireEvent` já são importados/definidos nesse arquivo; se algum não for, importe de onde os outros testes do arquivo importam.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test -w web -- test/groups-ui.test.tsx`
Expected: FAIL nos 3 testes novos (aparecem as mensagens genéricas).

- [ ] **Step 3: Implementar**

Crie `web/src/net/errors.ts`:

```ts
/** O servidor recusou por excesso de pedidos (429). As funções de `api.ts` lançam `<algo>_<status>`. */
export function isTooMany(err: unknown): boolean {
  return err instanceof Error && err.message.endsWith('_429');
}

export const TOO_MANY_MESSAGE = 'Calma! Tenta de novo em um minutinho.';
```

Em `web/src/screens/Home.tsx`:
- import: `import { TOO_MANY_MESSAGE, isTooMany } from '../net/errors';`
- em `create()`, troque o `catch { ... }` por:

```ts
    } catch (err) {
      setError(isTooMany(err) ? TOO_MANY_MESSAGE : 'Não deu pra criar a sala. O servidor tá ligado?');
```

- em `newGroup`, troque o corpo do `catch (err)` por:

```ts
      // 400: o servidor recusou o nome (ex.: só símbolos); 429: pedidos demais; o resto é falha de rede/servidor
      const rejected = err instanceof Error && err.message.endsWith('_400');
      setGroupError(rejected ? 'Nome inválido.' : isTooMany(err) ? TOO_MANY_MESSAGE : 'Não deu pra criar o grupo. O servidor tá ligado?');
```

Em `web/src/screens/GroupPage.tsx`:
- import: `import { TOO_MANY_MESSAGE, isTooMany } from '../net/errors';`
- em `newRoom()`, troque o `catch { setRoomError(...) }` por:

```ts
    } catch (err) {
      setRoomError(isTooMany(err) ? TOO_MANY_MESSAGE : 'Não deu pra criar a sala. Tenta de novo.');
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test -w web`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add web/src/net/errors.ts web/src/screens/Home.tsx web/src/screens/GroupPage.tsx web/test/groups-ui.test.tsx
git commit -m "feat(web): aviso de \"calma!\" quando o servidor recusa por pedidos demais"
```

---

### Task 4: Cursor mais leve

Regras (spec §3.1):
- **Cursor solto:** no máximo ~12 envios/s (84 ms).
- **Arrastando:** no máximo 20/s (50 ms).
- **Posição repetida:** não é reenviada.
- **Mouse parado:** a última posição é reenviada a cada 2 s, para o cursor não sumir nos outros (`REMOTE_STALE_MS` = 6 s em `engine.ts`) e o arrasto não cair.
- **Aba escondida ou janela sem foco:** o cursor solto não é enviado, nem o reenvio de 2 s. Mudanças de arrasto (pegar/soltar) sempre saem.

**Files:**
- Modify: `web/src/net/connection.ts`
- Modify: `web/test/connection.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Em `web/test/connection.test.ts`, **apague** o teste `'cursor: o primeiro sai na hora, os seguintes no máximo a ~30 Hz com o valor mais recente'` e acrescente no lugar:

```ts
  describe('cursor', () => {
    const hover = (x: number) => ({ zone: 'table' as const, x, y: 0.5, drag: null });
    const dragging = (x: number) => ({ zone: 'table' as const, x, y: 0.5, drag: { cardId: 'p0:0', index: null } });
    const sentXs = () => last().messages().filter((m) => m.t === 'fx.cursor').map((m) => m.x);

    beforeEach(() => {
      vi.spyOn(document, 'hasFocus').mockReturnValue(true);
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    });
    afterEach(() => vi.restoreAllMocks());

    it('solto: o primeiro sai na hora, depois no máximo a cada 84 ms com o valor mais recente', () => {
      const conn = make();
      last().open();
      conn.sendCursor(hover(0.1));
      conn.sendCursor(hover(0.2));
      conn.sendCursor(hover(0.3));
      expect(sentXs()).toEqual([0.1]);
      vi.advanceTimersByTime(83);
      expect(sentXs()).toEqual([0.1]);
      vi.advanceTimersByTime(1);
      expect(sentXs()).toEqual([0.1, 0.3]);
    });

    it('arrastando: até 20 por segundo (50 ms)', () => {
      const conn = make();
      last().open();
      conn.sendCursor(dragging(0.1));
      conn.sendCursor(dragging(0.2));
      vi.advanceTimersByTime(50);
      expect(sentXs()).toEqual([0.1, 0.2]);
    });

    it('posição repetida não sai de novo; parado, reenvia a cada 2 s', () => {
      const conn = make();
      last().open();
      conn.sendCursor(hover(0.4));
      vi.advanceTimersByTime(100);
      conn.sendCursor(hover(0.4));
      vi.advanceTimersByTime(100);
      expect(sentXs()).toEqual([0.4]);
      vi.advanceTimersByTime(2000);
      expect(sentXs()).toEqual([0.4, 0.4]);
      vi.advanceTimersByTime(2000);
      expect(sentXs()).toEqual([0.4, 0.4, 0.4]);
    });

    it('janela sem foco: cursor solto e reenvio não saem; soltar a carta sai', () => {
      const conn = make();
      last().open();
      conn.sendCursor(dragging(0.5));
      vi.mocked(document.hasFocus).mockReturnValue(false);
      vi.advanceTimersByTime(100);
      conn.sendCursor(hover(0.6)); // soltou a carta: muda o arrasto, sai mesmo sem foco
      vi.advanceTimersByTime(100);
      conn.sendCursor(hover(0.7)); // solto e sem foco: não sai
      vi.advanceTimersByTime(5000); // nem o reenvio
      expect(sentXs()).toEqual([0.5, 0.6]);
    });

    it('stop cancela o reenvio', () => {
      const conn = make();
      last().open();
      conn.sendCursor(hover(0.1));
      const socket = last();
      conn.stop();
      vi.advanceTimersByTime(5000);
      expect(socket.messages().filter((m) => m.t === 'fx.cursor')).toHaveLength(1);
    });
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test -w web -- test/connection.test.ts`
Expected: FAIL nos testes de cursor (intervalo de 34 ms, sem deduplicação nem reenvio).

- [ ] **Step 3: Implementar**

Em `web/src/net/connection.ts`:

1. Troque `export const CURSOR_INTERVAL_MS = 34;` por:

```ts
/** Cota grátis da Cloudflare: cada ~20 mensagens recebidas contam 1 requisição. Cursor solto ~12/s, arrastando 20/s. */
export const CURSOR_IDLE_INTERVAL_MS = 84;
export const CURSOR_DRAG_INTERVAL_MS = 50;
/** Parado, reenvia a última posição de tempos em tempos (os outros escondem cursor sem notícia há 6 s). */
export const CURSOR_KEEPALIVE_MS = 2000;
```

2. Acima da classe, acrescente:

```ts
const sameCursor = (a: CursorFx, b: CursorFx): boolean =>
  a.zone === b.zone && a.x === b.x && a.y === b.y && a.drag?.cardId === b.drag?.cardId && a.drag?.index === b.drag?.index;

/** Aba visível e janela com foco (sem `document`, como em testes de Node, conta como ativa). */
const windowActive = (): boolean =>
  typeof document === 'undefined' || (document.visibilityState !== 'hidden' && document.hasFocus());
```

3. Nos campos da classe, depois de `private cursorTimer ...`, acrescente:

```ts
  private lastCursor: CursorFx | null = null;
  private keepaliveTimer: ReturnType<typeof setTimeout> | null = null;
```

4. Substitua o método `sendCursor` inteiro por:

```ts
  /**
   * Cursor com ritmo: ~12/s solto, 20/s arrastando, com o valor mais recente no fim do intervalo.
   * Posição repetida não sai; parado, `keepalive` reenvia. Sem foco, só mudanças de arrasto saem.
   */
  sendCursor(cursor: CursorFx): void {
    const latest = this.pendingCursor ?? this.lastCursor;
    if (latest && sameCursor(cursor, latest)) return;
    const dragChanged = Boolean(cursor.drag) !== Boolean(this.lastCursor?.drag);
    if (!dragChanged && !cursor.drag && !windowActive()) return;
    const interval = cursor.drag ? CURSOR_DRAG_INTERVAL_MS : CURSOR_IDLE_INTERVAL_MS;
    const wait = this.lastCursorAt + interval - Date.now();
    if (wait <= 0 && !this.cursorTimer) {
      this.flushCursor(cursor);
      return;
    }
    this.pendingCursor = cursor;
    if (this.cursorTimer) return;
    this.cursorTimer = setTimeout(() => {
      this.cursorTimer = null;
      const next = this.pendingCursor;
      this.pendingCursor = null;
      if (next) this.flushCursor(next);
    }, Math.max(0, wait));
  }

  private flushCursor(cursor: CursorFx): void {
    this.lastCursorAt = Date.now();
    this.lastCursor = cursor;
    this.send({ t: 'fx.cursor', ...cursor });
    if (this.keepaliveTimer) clearTimeout(this.keepaliveTimer);
    this.keepaliveTimer = setTimeout(() => {
      this.keepaliveTimer = null;
      const c = this.lastCursor;
      if (c && !this.stopped && windowActive()) this.flushCursor(c);
    }, CURSOR_KEEPALIVE_MS);
  }
```

5. Em `clearTimers()`, acrescente antes das atribuições a `null`:

```ts
    if (this.keepaliveTimer) clearTimeout(this.keepaliveTimer);
    this.keepaliveTimer = null;
```

> Nota: `windowActive()` lê `document.hasFocus()`. Os outros testes de `connection.test.ts` não mandam cursor, então não dependem disso.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test -w web`
Expected: PASS (todos, inclusive `bots.test.ts`, que usa `sendCursor` por um objeto falso).

Run: `npm run typecheck -w web`
Expected: sem erros. Se algum arquivo importava `CURSOR_INTERVAL_MS`, troque para `CURSOR_IDLE_INTERVAL_MS`.

- [ ] **Step 5: Conferir a sensação no localhost**

Com `npm run dev:server` e `npm run dev:web` rodando, abra `http://localhost:5173`, crie uma sala, entre, adicione 2 bots ("🤖 adicionar bot") e comece uma rodada. Os cursores dos bots e as cartas que eles arrastam devem andar macios, sem pulos visíveis.

Se ficarem "aos trancos", em `web/src/table/engine.ts` (`createRemote`, linhas ~932-933) baixe a rigidez das molas do cursor remoto de `new Spring(start[0], 380, 0.92)` / `new Spring(start[1], 380, 0.92)` para `260, 0.95`. Confira de novo.

- [ ] **Step 6: Commit**

```bash
git add web/src/net/connection.ts web/test/connection.test.ts
git commit -m "feat(web): cursor mais leve (12/s solto, 20/s arrastando, nada parado ou sem foco)"
```

(inclua `web/src/table/engine.ts` se mudou a mola no Step 5.)

---

### Task 5: Sala que acabou

**Files:**
- Modify: `web/src/net/connection.ts`
- Modify: `web/src/screens/RoomScreen.tsx`
- Modify: `web/test/connection.test.ts`
- Modify: `web/test/room-screen.test.tsx`

- [ ] **Step 1: Escrever os testes da conexão que falham**

Em `web/test/connection.test.ts`, mude `make()` para aceitar opções extras:

```ts
function make(extra: Partial<ConnOptions> = {}) {
  const conn = new RoomConnection({
    url: 'ws://s/rooms/ABCD/ws',
    token: TOKEN,
    name: 'Ana',
    color: '#8EC5FF',
    createSocket: (url) => new FakeSocket(url),
    ...extra,
  });
  made.push(conn);
  conn.start();
  return conn;
}
```

(import: `import { RoomConnection, type ConnOptions, type SocketLike } from '../src/net/connection';`)

E acrescente, dentro do `describe('RoomConnection', ...)`:

```ts
  /** Três falhas seguidas sem conseguir abrir (backoff 1 s, 2 s). */
  function failThreeTimes() {
    last().drop(1006);
    vi.advanceTimersByTime(1000);
    last().drop(1006);
    vi.advanceTimersByTime(2000);
    last().drop(1006);
  }

  it('3 falhas seguidas: pergunta se a sala existe; se não, para e vira gone', async () => {
    const roomExists = vi.fn(async () => false);
    const conn = make({ roomExists });
    last().drop(1006);
    vi.advanceTimersByTime(1000);
    last().drop(1006);
    expect(roomExists).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    last().drop(1006);
    expect(roomExists).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(conn.getSnapshot().status).toBe('gone'));
    const sockets = FakeSocket.all.length;
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.all).toHaveLength(sockets);
  });

  it('a sala existe: continua tentando', async () => {
    const roomExists = vi.fn(async () => true);
    const conn = make({ roomExists });
    failThreeTimes();
    await Promise.resolve();
    await Promise.resolve();
    expect(conn.getSnapshot().status).toBe('reconnecting');
    const sockets = FakeSocket.all.length;
    vi.advanceTimersByTime(4000);
    expect(FakeSocket.all.length).toBe(sockets + 1);
  });

  it('erro de rede na checagem: continua tentando', async () => {
    const conn = make({ roomExists: vi.fn(async () => Promise.reject(new Error('offline'))) });
    failThreeTimes();
    await Promise.resolve();
    await Promise.resolve();
    expect(conn.getSnapshot().status).toBe('reconnecting');
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test -w web -- test/connection.test.ts`
Expected: FAIL (`roomExists` não existe e nunca é chamado).

- [ ] **Step 3: Implementar na conexão**

Em `web/src/net/connection.ts`:

1. Em `ConnOptions`, acrescente:

```ts
  /** Pergunta ao servidor se a sala ainda existe (usada depois de várias falhas seguidas de conexão). */
  roomExists?: () => Promise<boolean>;
```

2. Acima da classe: `const GONE_CHECK_AFTER = 3;`
3. Campo da classe: `private checkingRoom = false;`
4. Em `handleClose`, troque o final (a partir de `const delay = ...`) por:

```ts
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.attempt);
    this.attempt++;
    this.setSnap({ status: 'reconnecting' });
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.open();
    }, delay);
    if (this.attempt >= GONE_CHECK_AFTER) this.checkRoomGone();
  }

  /** Sala que expirou dá 404 no upgrade (visto como 1006) para sempre: depois de algumas falhas, confere. */
  private checkRoomGone(): void {
    const check = this.opts.roomExists;
    if (!check || this.checkingRoom) return;
    this.checkingRoom = true;
    check().then(
      (exists) => {
        this.checkingRoom = false;
        if (exists || this.stopped || this.snap.status !== 'reconnecting') return;
        if (this.retryTimer) clearTimeout(this.retryTimer);
        this.retryTimer = null;
        this.setSnap({ status: 'gone' });
      },
      () => {
        this.checkingRoom = false; // sem rede: segue tentando
      },
    );
  }
```

(O `}` que fechava `handleClose` passa a fechar logo depois do `if (this.attempt >= ...)`, como mostrado.)

- [ ] **Step 4: Rodar os testes da conexão**

Run: `npm run test -w web -- test/connection.test.ts`
Expected: PASS.

- [ ] **Step 5: Escrever os testes da tela que falham**

Em `web/test/room-screen.test.tsx`:

1. Troque o mock por:
   `vi.mock('../src/net/api', () => ({ getRoomInfo: vi.fn(), createRoom: vi.fn(), createGroupRoom: vi.fn() }));`
2. Import: `import { createGroupRoom, createRoom, getRoomInfo, type RoomInfo } from '../src/net/api';`
3. Acrescente dentro do `describe('RoomScreen', ...)`:

```tsx
  it('sala que acabou: oferece criar outra', async () => {
    mocked.mockResolvedValue(info());
    vi.mocked(createRoom).mockResolvedValue('WXYZ');
    markJoined('ABCD', { name: 'Ana', color: '#8EC5FF' });
    renderRoom();
    await waitFor(() => expect(FakeSocket.all).toHaveLength(1));
    act(() => last().drop(4004));
    expect(await screen.findByText('essa sala acabou')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'voltar pro grupo' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'criar sala nova' }));
    await waitFor(() => expect(window.location.hash).toBe('#/sala/WXYZ'));
  });

  it('sala de grupo que acabou: cria outra sala do grupo e mostra o link do grupo', async () => {
    mocked.mockResolvedValue(info());
    vi.mocked(createGroupRoom).mockResolvedValue('QRST');
    markJoined('ABCD', { name: 'Ana', color: '#8EC5FF' });
    renderRoom();
    await waitFor(() => expect(FakeSocket.all).toHaveLength(1));
    act(() => {
      last().open();
      last().receive({ t: 'welcome', playerId: 'p0', code: 'ABCD' });
      last().receive({ t: 'state', room: { ...viewOf(makeRoom(2), 'p0'), group: { slug: 'abcdefghjk', name: 'Galera' } } });
    });
    act(() => last().drop(4004));
    expect(await screen.findByText('essa sala acabou')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'voltar pro grupo' }).getAttribute('href')).toBe('#/g/abcdefghjk');
    fireEvent.click(screen.getByRole('button', { name: 'criar sala nova' }));
    await waitFor(() => expect(createGroupRoom).toHaveBeenCalledWith('abcdefghjk'));
    await waitFor(() => expect(window.location.hash).toBe('#/sala/QRST'));
  });
```

No `beforeEach` desse arquivo, acrescente `vi.mocked(createRoom).mockReset(); vi.mocked(createGroupRoom).mockReset(); window.location.hash = '';`.

- [ ] **Step 6: Rodar e ver falhar**

Run: `npm run test -w web -- test/room-screen.test.tsx`
Expected: FAIL (a tela atual diz "sala não encontrada").

- [ ] **Step 7: Implementar na tela**

Em `web/src/screens/RoomScreen.tsx`:

1. Imports: troque as linhas de router e api por:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoomView } from '@cartolina/shared';
import { goHome, goToRoom } from '../lib/router';
import { createGroupRoom, createRoom, getRoomInfo, type RoomInfo } from '../net/api';
import { TOO_MANY_MESSAGE, isTooMany } from '../net/errors';

/** `{ slug, name }` do grupo da sala, como vem na `RoomView`. */
type RoomGroupView = NonNullable<RoomView['group']>;
```

2. `connect` passa a mandar a checagem:

```ts
function connect(code: string, profile: Profile, createSocket?: ConnOptions['createSocket']): RoomConnection {
  return new RoomConnection({
    url: wsUrl(code),
    token: getToken(),
    name: profile.name,
    color: profile.color,
    createSocket,
    roomExists: () => getRoomInfo(code).then((info) => info !== null),
  });
}
```

3. Acrescente o componente, abaixo de `Message`:

```tsx
/** A sala expirou ou fechou: oferece outra (do mesmo grupo, se era de grupo). */
function RoomGone({ group }: { group: RoomGroupView | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function again() {
    setBusy(true);
    setError(null);
    try {
      goToRoom(group ? await createGroupRoom(group.slug) : await createRoom());
    } catch (err) {
      setError(isTooMany(err) ? TOO_MANY_MESSAGE : 'Não deu pra criar a sala. Tenta de novo.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="screen">
      <h1 className="logo">
        cartolina<span>~</span>
      </h1>
      <section className="panel">
        <h2>essa sala acabou</h2>
        <p>Ela expirou ou foi fechada. Bora abrir outra?</p>
        <button className="btn" type="button" disabled={busy} onClick={() => void again()}>
          {busy ? 'criando…' : 'criar sala nova'}
        </button>
        {group && (
          <a className="sbtn" href={`#/g/${group.slug}`}>
            voltar pro grupo
          </a>
        )}
        <button className="sbtn" type="button" onClick={goHome}>
          voltar pro início
        </button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
```

4. Na renderização, troque

```tsx
  if (info === null || status === 'gone') {
    return <Message title="sala não encontrada" text="Essa sala não existe ou expirou. Crie uma nova no início." />;
  }
```

por

```tsx
  if (status === 'gone') return <RoomGone group={snap?.view?.group ?? null} />;
  if (info === null) {
    return <Message title="sala não encontrada" text="Essa sala não existe ou expirou. Crie uma nova no início." />;
  }
```

- [ ] **Step 8: Rodar e ver passar**

Run: `npm run test -w web`
Expected: PASS (todos).

Run: `npm run typecheck -w web`
Expected: sem erros.

- [ ] **Step 9: Commit**

```bash
git add web/src/net/connection.ts web/src/screens/RoomScreen.tsx web/test/connection.test.ts web/test/room-screen.test.tsx
git commit -m "feat(web): sala que acabou para de reconectar e oferece criar outra"
```

---

### Task 6: Aviso no celular

**Files:**
- Create: `web/src/lib/device.ts`
- Create: `web/src/screens/PhoneNotice.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/screens/Home.tsx`
- Create: `web/test/phone.test.tsx`

- [ ] **Step 1: Escrever os testes que falham**

Crie `web/test/phone.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { PHONE_TEXT } from '../src/screens/PhoneNotice';
import { Home } from '../src/screens/Home';

vi.mock('../src/net/api', () => ({ getRoomInfo: vi.fn(() => new Promise(() => {})), createRoom: vi.fn(), createGroup: vi.fn() }));

function phone(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

describe('aviso no celular', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.location.hash = '';
  });

  it('no celular, a sala mostra o aviso em vez do jogo', () => {
    phone(true);
    window.location.hash = '#/sala/ABCD';
    render(<App />);
    expect(screen.getByText(PHONE_TEXT)).toBeTruthy();
    expect(screen.queryByText('carregando…')).toBeNull();
  });

  it('no celular, a tela inicial troca "criar sala" pelo aviso (grupos continuam)', () => {
    phone(true);
    render(<Home />);
    expect(screen.queryByRole('button', { name: 'criar sala' })).toBeNull();
    expect(screen.getByText(PHONE_TEXT)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'criar grupo' })).toBeTruthy();
  });

  it('no computador, nada muda', () => {
    phone(false);
    render(<Home />);
    expect(screen.getByRole('button', { name: 'criar sala' })).toBeTruthy();
    expect(screen.queryByText(PHONE_TEXT)).toBeNull();
  });

  it('sem matchMedia (navegador velho, jsdom): conta como computador', () => {
    vi.stubGlobal('matchMedia', undefined);
    render(<Home />);
    expect(screen.getByRole('button', { name: 'criar sala' })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test -w web -- test/phone.test.tsx`
Expected: FAIL (`PhoneNotice` não existe).

- [ ] **Step 3: Implementar**

Crie `web/src/lib/device.ts`:

```ts
import { useSyncExternalStore } from 'react';

/** Aparelho de toque (sem hover, ponteiro grosso): por enquanto o jogo é só pra computador. Janela estreita de PC não conta. */
export const PHONE_QUERY = '(hover: none) and (pointer: coarse)';

function media(): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(PHONE_QUERY) : null;
}

function subscribe(onChange: () => void): () => void {
  const m = media();
  m?.addEventListener('change', onChange);
  return () => m?.removeEventListener('change', onChange);
}

export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, () => media()?.matches ?? false, () => false);
}
```

Crie `web/src/screens/PhoneNotice.tsx`:

```tsx
import { goHome } from '../lib/router';

export const PHONE_TEXT = 'o cartolina por enquanto é pra jogar no computador 💻';

/** Sala aberta no celular: o jogo ainda não funciona com toque/tela pequena. */
export function PhoneNotice() {
  return (
    <main className="screen">
      <h1 className="logo">
        cartolina<span>~</span>
      </h1>
      <section className="panel">
        <h2>abre no computador</h2>
        <p>{PHONE_TEXT}</p>
        <p>Manda o link pra você mesmo e abre no PC. O histórico do grupo funciona no celular.</p>
        <button className="btn" type="button" onClick={goHome}>
          voltar pro início
        </button>
      </section>
    </main>
  );
}
```

Em `web/src/App.tsx`:

```tsx
import { useIsPhone } from './lib/device';
import { useHashRoute } from './lib/router';
import { GroupPage } from './screens/GroupPage';
import { Home } from './screens/Home';
import { PhoneNotice } from './screens/PhoneNotice';
import { RoomScreen } from './screens/RoomScreen';

export function App() {
  const route = useHashRoute();
  const phone = useIsPhone();
  if (route.name === 'room') return phone ? <PhoneNotice /> : <RoomScreen key={route.code} code={route.code} />;
  if (route.name === 'group') return <GroupPage key={route.slug} slug={route.slug} />;
  return <Home />;
}
```

Em `web/src/screens/Home.tsx`:
- imports: `import { useIsPhone } from '../lib/device';` e `import { PHONE_TEXT } from './PhoneNotice';`
- dentro de `Home()`, no topo: `const phone = useIsPhone();`
- no painel do ITO, troque o `<button className="btn" ...>` e o `<form className="row-inline" onSubmit={enter}>…</form>` por:

```tsx
        {phone ? (
          <p className="hint">{PHONE_TEXT}</p>
        ) : (
          <>
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
          </>
        )}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test -w web`
Expected: PASS (todos).

- [ ] **Step 5: Conferir no navegador**

Com os servidores locais rodando, abra `http://localhost:5173` em modo celular com toque (DevTools com emulação de dispositivo; só estreitar a janela não ativa o aviso):
- o painel do ITO mostra o aviso e o de grupos continua;
- `#/sala/ABCD` mostra "abre no computador".

Volte para a largura de desktop: tudo normal.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/device.ts web/src/screens/PhoneNotice.tsx web/src/App.tsx web/src/screens/Home.tsx web/test/phone.test.tsx
git commit -m "feat(web): aviso de \"abre no computador\" no celular"
```

---

### Task 7: E2E com Playwright

**Files:**
- Modify: `package.json` (raiz)
- Modify: `.gitignore`
- Create: `e2e/playwright.config.ts`
- Create: `e2e/helpers.ts`
- Create: `e2e/rodada.spec.ts`

- [ ] **Step 1: Instalar**

Run: `npm install -D @playwright/test`
Run: `npx playwright install chromium`
Expected: `@playwright/test` em `devDependencies` da raiz e o Chromium baixado.

Em `package.json` da raiz, acrescente em `scripts`:

```json
    "e2e": "playwright test -c e2e/playwright.config.ts"
```

Em `.gitignore`, acrescente:

```
test-results/
playwright-report/
```

- [ ] **Step 2: Configuração**

Crie `e2e/playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

const CI = Boolean(process.env.CI);

/**
 * Sobe o servidor local (com a migração do D1) e o build de produção do site (sem bots),
 * e joga com navegadores de verdade. O build aponta pro servidor local por padrão.
 */
export default defineConfig({
  testDir: '.',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: CI ? 1 : 0,
  reporter: CI ? [['list'], ['html', { open: 'never', outputFolder: '../playwright-report' }]] : 'list',
  outputDir: '../test-results',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } }],
  webServer: [
    { command: 'npm run dev:server', cwd: '..', port: 8787, reuseExistingServer: !CI, timeout: 120_000 },
    {
      command: 'npm run build -w web && npm run preview -w web -- --port 4173 --strictPort --host 127.0.0.1',
      cwd: '..',
      port: 4173,
      reuseExistingServer: !CI,
      timeout: 180_000,
    },
  ],
});
```

> No Windows o `&&` dentro de `command` roda em `cmd.exe`, onde funciona. No CI roda em `sh`.

- [ ] **Step 3: Helpers**

Crie `e2e/helpers.ts`:

```ts
import { expect, type Browser, type Page } from '@playwright/test';

/** Página num contexto próprio: cada jogador tem seu token (como navegadores diferentes). */
export async function newPlayer(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

/** Entra na sala aberta na página com o nome e o personagem de índice `critter`. */
export async function join(page: Page, name: string, critter: number): Promise<void> {
  await page.getByLabel('seu nome').fill(name);
  await page.locator('button[data-sound="pick"]').nth(critter).click();
  await page.getByRole('button', { name: 'entrar', exact: true }).click();
}

/** Escreve a dica e arrasta a carta da mão até o meio da mesa. */
export async function placeMyCard(page: Page, clue: string): Promise<void> {
  await page.getByPlaceholder('escreve uma dica…').fill(clue);
  const card = page.locator('[data-hand-slot] .hcard .mynum').first();
  const felt = page.locator('.felt');
  const from = (await card.boundingBox())!;
  const to = (await felt.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height * 0.6, { steps: 15 });
  await page.mouse.up();
  await expect(page.locator('[data-hand-slot]').first()).toHaveClass(/away/);
}

/** Host `a` e `b` já entraram na sala: começa, dá as cartas, os dois colocam, ficam prontos e veem a revelação. */
export async function playRound(a: Page, b: Page, clues: [string, string]): Promise<void> {
  await expect(a.getByText('Bia', { exact: true }).first()).toBeVisible();
  await a.getByRole('button', { name: 'começar' }).click();
  await a.getByRole('button', { name: 'dar as cartas' }).click();
  await placeMyCard(a, clues[0]);
  await placeMyCard(b, clues[1]);
  await a.getByRole('button', { name: 'tô pronto' }).click();
  await b.getByRole('button', { name: 'tô pronto' }).click();
  await expect(a.getByRole('dialog')).toBeVisible({ timeout: 30_000 });
  await expect(b.getByRole('dialog')).toBeVisible({ timeout: 30_000 });
}
```

- [ ] **Step 4: Os testes**

Crie `e2e/rodada.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { join, newPlayer, playRound } from './helpers';

test('build de produção não tem bots', async ({ browser }) => {
  const a = await newPlayer(browser);
  await a.goto('/');
  await a.getByRole('button', { name: 'criar sala' }).click();
  await expect(a).toHaveURL(/#\/sala\/[A-Z0-9]{4}$/);
  await join(a, 'Ana', 0);
  await expect(a.getByRole('button', { name: 'começar' })).toBeVisible();
  await expect(a.getByRole('button', { name: /adicionar bot/ })).toHaveCount(0);
});

test('rodada livre com dois navegadores', async ({ browser }) => {
  const a = await newPlayer(browser);
  const b = await newPlayer(browser);
  await a.goto('/');
  await a.getByRole('button', { name: 'criar sala' }).click();
  await expect(a).toHaveURL(/#\/sala\/[A-Z0-9]{4}$/);
  await join(a, 'Ana', 0);
  await b.goto(a.url());
  await join(b, 'Bia', 1);

  await playRound(a, b, ['praia', 'neve']);

  // O resultado bate com os números revelados, na ordem da fila.
  const values = (await a.locator('.row .rcard .bignum').allTextContents()).map(Number);
  expect(values).toHaveLength(2);
  const sorted = values.every((v, i) => i === 0 || values[i - 1]! < v);
  await expect(a.getByRole('dialog')).toHaveAttribute('aria-label', sorted ? 'vitória' : 'xi, errou essa');
  // As dicas chegaram (inclusive escritas logo antes de arrastar).
  await expect(a.locator('.row .rcard', { hasText: 'praia' })).toHaveCount(1);
  await expect(a.locator('.row .rcard', { hasText: 'neve' })).toHaveCount(1);
});

test('rodada numa sala de grupo aparece no histórico', async ({ browser }) => {
  const a = await newPlayer(browser);
  const b = await newPlayer(browser);
  await a.goto('/');
  await a.getByLabel('nome do grupo').fill('Galera E2E');
  await a.getByRole('button', { name: 'criar grupo' }).click();
  await expect(a).toHaveURL(/#\/g\/[a-z0-9]{10}$/);
  const groupUrl = a.url();
  await a.getByRole('button', { name: 'criar sala do grupo' }).click();
  await expect(a).toHaveURL(/#\/sala\/[A-Z0-9]{4}$/);
  await join(a, 'Ana', 0);
  await b.goto(a.url());
  await join(b, 'Bia', 1);

  await playRound(a, b, ['farol', 'iglu']);

  await a.goto(groupUrl);
  // A gravação no D1 acontece logo depois da revelação: recarrega até aparecer.
  await expect(async () => {
    await a.reload();
    await expect(a.locator('[aria-controls]')).toHaveCount(1, { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await a.locator('[aria-controls]').first().click();
  await expect(a.getByText('farol')).toBeVisible();
});
```

- [ ] **Step 5: Rodar**

Pare os servidores locais que estiverem nas portas 8787/5173 só se der conflito (`reuseExistingServer` reaproveita o 8787 fora do CI).

Run: `npm run e2e`
Expected: 3 passed.

Se algum seletor não bater:
- confira a classe/atributo real com o DevTools e ajuste o helper (as referências são `web/src/table/Hand.tsx`, `web/src/table/engine.ts` e `web/src/table/ResultBanner.tsx`);
- registre o ajuste no relatório.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore e2e/
git commit -m "test(e2e): rodada livre, sala de grupo e build sem bots com Playwright"
```

---

### Task 8: Publicação automática (GitHub Actions)

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Escrever o workflow**

Crie `.github/workflows/deploy.yml`:

```yaml
name: deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

# Uma publicação por vez; a próxima espera a anterior terminar.
concurrency:
  group: deploy
  cancel-in-progress: false

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build

  e2e:
    needs: check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: |
            playwright-report/
            test-results/

  server:
    needs: e2e
    runs-on: ubuntu-latest
    env:
      CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      # Migração antes do Worker: o Worker novo nunca roda contra um banco sem as tabelas.
      - run: npx wrangler d1 migrations apply cartolina --remote
        working-directory: server
      - run: npx wrangler deploy
        working-directory: server

  web:
    needs: server
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - name: confere SERVER_URL
        env:
          SERVER_URL: ${{ vars.SERVER_URL }}
        run: |
          if [ -z "$SERVER_URL" ]; then
            echo "::error::defina a variável SERVER_URL (Settings → Secrets and variables → Actions → Variables) com o endereço do Worker"
            exit 1
          fi
      - run: npm ci
      - run: npm run build -w web
        env:
          VITE_SERVER_URL: ${{ vars.SERVER_URL }}
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: web/dist
      - id: deploy
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Validar a sintaxe**

Run: `npx --yes js-yaml .github/workflows/deploy.yml`
Expected: imprime o workflow como JSON, sem erro de parse. (O GitHub também aponta erro de sintaxe na aba Actions no primeiro push.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: publicação automática (checagens, E2E, Cloudflare e GitHub Pages)"
```

> O workflow só roda em push no `main`. Ele vai rodar de verdade quando o PR deste plano for mergeado, **depois** da Task 10 (configuração).

---

### Task 9: Passo a passo do deploy e da primeira noite

**Files:**
- Create: `docs/deploy.md`
- Modify: `README.md`

- [ ] **Step 1: Escrever `docs/deploy.md`**

```markdown
# Colocar o cartolina online

O site fica no GitHub Pages (`https://rafa-mesquita.github.io/cartolina/`) e o
servidor na Cloudflare (`https://cartolina-server.<seu-subdominio>.workers.dev`).
Tudo no plano grátis. A cada push no `main`, o GitHub Actions testa e publica
sozinho (`.github/workflows/deploy.yml`); se um teste falhar, nada é publicado.

## Configuração (uma vez só)

1. **Conta na Cloudflare.** Entre em https://dash.cloudflare.com (ou crie a
   conta: é grátis e não pede cartão). Abra **Workers & Pages** uma vez; se
   pedir, escolha o seu subdomínio `*.workers.dev`.
2. **Login do wrangler no PC.** Na raiz do repositório:
   `npx wrangler login` → aprove no navegador.
3. **Banco D1 de produção.** Dentro de `server/`:
   `npx wrangler d1 create cartolina --binding DB`. Copie o `database_id` que
   aparecer para `server/wrangler.jsonc` (no lugar dos zeros) e faça commit. O
   id não é segredo. Se o wrangler perguntar se pode atualizar a configuração,
   ele só deve mudar o `database_id` da entrada `DB` que já existe. Confira
   o `server/wrangler.jsonc` depois: o binding `DB` e o
   `migrations_dir: "migrations"` precisam continuar lá. Se mais alguma coisa
   mudou, desfaça (`git checkout server/wrangler.jsonc`) e cole o id na mão.
4. **Token pro GitHub publicar.** No painel da Cloudflare: **My Profile → API
   Tokens → Create Token → modelo "Edit Cloudflare Workers"** e acrescente a
   permissão **Account → D1 → Edit**. Copie o token (ele só aparece uma vez).
5. **Segredos no GitHub.** Em https://github.com/rafa-mesquita/cartolina →
   **Settings → Secrets and variables → Actions → New repository secret**:
   - `CLOUDFLARE_API_TOKEN` = o token do passo 4;
   - `CLOUDFLARE_ACCOUNT_ID` = o Account ID (aparece na página inicial de
     **Workers & Pages**, na lateral).
6. **Pages.** **Settings → Pages → Build and deployment → Source: GitHub
   Actions**.
7. **Primeira publicação.** Faça push no `main` (ou rode o workflow em
   **Actions → deploy → Run workflow**). O job `server` publica o Worker e
   mostra o endereço dele no log. O job `web` vai falhar pedindo a variável
   `SERVER_URL` — é esperado.
8. **Endereço do servidor.** **Settings → Secrets and variables → Actions →
   Variables → New repository variable**: `SERVER_URL` =
   `https://cartolina-server.<seu-subdominio>.workers.dev` (sem barra no fim).
   Rode o workflow de novo: agora o site sai.

Se o `wrangler deploy` reclamar de `ratelimits` (limitador não disponível no
plano), apague o bloco `ratelimits` de `server/wrangler.jsonc`: o servidor
funciona sem ele.

## Conferir depois de publicar

- `SERVER_URL=https://cartolina-server.<subdominio>.workers.dev npm run smoke`
  → deve terminar com `ok`.
- Abrir o site, criar uma sala e jogar uma rodada com alguém (ou com uma aba
  anônima).

## Primeira noite

- Crie o grupo no site e mande o **link do grupo** no Discord. Cada um abre no
  **computador** (no celular aparece um aviso).
- Do grupo, clique em **criar sala do grupo** e mande o link da sala. As
  rodadas jogadas ali entram no histórico sozinhas.
- Travou alguma coisa? **Recarregue a página**: carta e assento são mantidos.
- No dia seguinte, veja quanto da cota foi usado: painel da Cloudflare →
  **Workers & Pages → cartolina-server → Metrics** e **D1 → cartolina**. O
  plano grátis tem 100 mil requisições por dia.
```

- [ ] **Step 2: README**

No `README.md`, acrescente uma seção no fim:

```markdown
## Online

O site e o servidor são publicados sozinhos a cada push no `main`, se os testes
passarem. Configuração, conferência e roteiro da primeira noite em
[docs/deploy.md](docs/deploy.md).

Testes de ponta a ponta (sobem servidor e site e jogam com o Chromium):

    npm run e2e
```

- [ ] **Step 3: Detalhes de produção (spec §3.6)**

- Rode `git grep -n -E "console\.(log|debug)" -- web/src`. Esperado: nada. Se aparecer algo, apague.
- Confira que `web/index.html` tem `<title>cartolina~</title>` e o `<link rel="icon" ...>`. Os dois já existem.

- [ ] **Step 4: Commit**

```bash
git add docs/deploy.md README.md
git commit -m "docs: passo a passo do deploy e da primeira noite"
```

---

### Task 10: Configuração e primeira publicação (com o usuário)

Esta task **não é de subagente**: o controlador faz junto com o usuário. As etapas de login, conta, token e segredos são **do usuário**. O Claude pode abrir as páginas no **Chrome pessoal do usuário** e mostrar onde clicar, mas não digita senhas nem copia ou cola tokens.

- [ ] **Step 1: Escolher o Chrome certo**
  - Rode `list_connected_browsers` (Claude in Chrome).
  - O candidato a Chrome pessoal é o deviceId `075ef505-b286-43c7-b853-e7e8bdf2e28b` (ver memória `reference-chrome-pessoal`). **Confirme com o usuário antes do `select_browser`.**
  - Nunca use `09c9271c-…`, que é o Chrome do colega.

- [ ] **Step 2: Conta e subdomínio**
  - **(usuário)** Entrar em dash.cloudflare.com, ou criar a conta.
  - Abrir Workers & Pages e escolher o subdomínio `*.workers.dev`.

- [ ] **Step 3: Login do wrangler**
  - **(usuário)** Rodar `npx wrangler login` num terminal e aprovar no navegador. O Claude pode abrir o terminal com o comando pronto.
  - Conferir com `npx wrangler whoami`.

- [ ] **Step 4: D1 de produção**

Run (em `server/`): `npx wrangler d1 create cartolina --binding DB`
Expected: imprime um `database_id` (UUID). Se perguntar se pode atualizar a configuração, ele só deve mudar o `database_id` da entrada `DB`; depois confira que o binding `DB` e o `migrations_dir: "migrations"` continuam em `server/wrangler.jsonc` (se mais algo mudou, desfaça e cole o id na mão).

- Troque o `database_id` de zeros em `server/wrangler.jsonc` por esse UUID.
- Rode `npm test` e confirme que passa (os testes usam D1 local, o id não muda nada).
- Commit:

```bash
git add server/wrangler.jsonc
git commit -m "chore(server): id do banco D1 de produção"
```

- [ ] **Step 5: Token e segredos**
  - **(usuário)** Criar o token (modelo "Edit Cloudflare Workers" + D1 Edit).
  - **(usuário)** Cadastrar `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` nos segredos do repositório.
  - Conferir com `gh secret list --repo rafa-mesquita/cartolina`: devem aparecer os dois nomes.

- [ ] **Step 6: Pages**
  - **(usuário)** Settings → Pages → Source: GitHub Actions. O Claude pode abrir a página.

- [ ] **Step 7: PR, revisão final e merge**
  - Fazer push da branch e abrir o PR do Plano 4.
  - Rodar a revisão final (subagente revisor).
  - Com aprovação explícita do usuário, fazer o merge.
  - O merge dispara o workflow. Acompanhe com `gh run watch --repo rafa-mesquita/cartolina`:
    - `check`, `e2e` e `server` devem passar;
    - `web` falha pedindo `SERVER_URL`, como esperado.

- [ ] **Step 8: `SERVER_URL` e segunda rodada**
  - Pegar no log do job `server` o endereço `https://cartolina-server.<sub>.workers.dev`.
  - Run: `gh variable set SERVER_URL --repo rafa-mesquita/cartolina --body "https://cartolina-server.<sub>.workers.dev"`
  - Run: `gh workflow run deploy --repo rafa-mesquita/cartolina` e acompanhar até ficar verde.

- [ ] **Step 9: Conferir em produção**

Run: `$env:SERVER_URL = "https://cartolina-server.<sub>.workers.dev"; npm run smoke`
Expected: termina com `ok`.

Depois:
- abrir `https://rafa-mesquita.github.io/cartolina/` no navegador do painel;
- criar um grupo e uma sala do grupo;
- jogar uma rodada com o usuário (ou com um segundo contexto);
- conferir que a rodada aparece no histórico do grupo.

- [ ] **Step 10: Fechar**
  - Atualizar a memória do projeto com os endereços de produção.
  - Escrever a entrada do journal, se o projeto tiver `docs/journal/`.
  - Avisar o usuário com o link do site e o roteiro da primeira noite (`docs/deploy.md`).

---

## Fora deste plano

- **Plano 5:** celular jogável.
- **Plano 6:** manual de marca (`#/marca` e `docs/marca.md`).
- **Notas do Plano 3, para quando o grupo crescer:** estatísticas em SQL e cursor de paginação composto.
