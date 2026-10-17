# Plano 5, etapa 1 — base do celular + DITU no celular — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** jogar DITU (id `ito`) num celular em pé, com a fila de cartas na vertical (1 no topo, 100 embaixo), colocando e movendo cartas por toque ("aqui") ou arrastando. O computador não muda nada.

**Architecture:**
- **Detecção:** um hook de layout (`useLayout`) decide entre `'phone'` (tela de até 640px de largura) e `'desktop'`.
- **No celular**, o `Game.tsx` monta uma mesa nova, `PhoneTable` (componentes React em `web/src/table/phone/`). Ela usa as mesmas ações do servidor (`place`, `return`, `clue`, `ready`…) e os mesmos helpers puros da fila (`effectiveRow`, `intentSettled`, `rowEntries` em `web/src/table/rowLayout.ts`). O motor imperativo do computador (`engine.ts`) não é tocado.
- **Catálogo:** ganha `mobile`. Só jogos `mobile: true` ficam disponíveis em aparelho de toque.

**Tech Stack:** React 19 + Vite 8, Vitest 4 + jsdom + Testing Library, Playwright (E2E com emulação de celular).

**Spec:** `docs/superpowers/specs/2026-10-17-plano-5-celular-design.md`. A etapa 2 (Diquisti) tem plano próprio, depois.

**Branch:** `feat/plano-5-celular` (já criada a partir do `main`, com a spec).

---

## Convenções do repositório

- **Rodar da raiz** (npm workspaces `shared/`, `server/`, `web/`, mais `e2e/`):
  - Um arquivo: `npm run test -w web -- test/x.test.tsx`.
  - Tudo: `npm test`, `npm run typecheck`, `npm run build`, `npm run e2e`.
- **Shell:** Windows + PowerShell 5.1. Não tem `&&`: use `;`.
- **Código:** TypeScript estrito, com `noUncheckedIndexedAccess` e `verbatimModuleSyntax` (`import type`). Textos de tela em PT-BR informal, comentários em PT-BR curtos.
- **Commits:** terminam com linha em branco + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Fixtures de teste:** `web/test/fixtures.ts` tem `makeRoom(n)`, `sortingRoom(n)`, `viewOf(room, playerId)` e `act(room, playerId, action)`. Use-os; leia o arquivo antes.
- **Nomes de tela:** "DITU" e "Diquisti". Os ids internos continuam `ito` e `dixit`.
- **E2E:** o servidor local limita a 10 salas por minuto por IP. Espere 1 minuto entre execuções de `npm run e2e`.

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `web/src/lib/device.ts` | `useMedia` genérico, `useLayout()`, `useIsLandscapePhone()` e o `useIsPhone` de hoje |
| `web/src/games/catalog.ts` | `CatalogEntry.mobile` (DITU `true`, Diquisti `false` até a etapa 2) |
| `web/src/App.tsx`, `web/src/screens/RoomScreen.tsx`, `web/src/screens/GamePage.tsx`, `web/src/screens/Home.tsx` | Aviso só para jogos sem `mobile`; aviso de celular deitado |
| `web/src/screens/RotateNotice.tsx` (novo) | Aviso "vira o celular em pé" |
| `web/src/table/phone/phoneRowLogic.ts` (novo) | Lógica pura da fila em pé: alvos "aqui", quem pode pegar o quê, cursor equivalente pro PC, posição pelo dedo |
| `web/src/table/phone/usePhoneReveal.ts` (novo) | Revelação passo a passo com o mesmo ritmo e sons do computador |
| `web/src/table/phone/PhoneRow.tsx` (novo) | Fila em pé (faixas, alvos "aqui", vão de arrasto remoto, revelação) |
| `web/src/table/phone/PhoneHand.tsx` + `ClueSheet.tsx` (novos) | Barra da mão e painel da dica |
| `web/src/table/phone/usePhoneDrag.ts` (novo) | Arrastar com o dedo/mouse, rolagem automática, cursor para o PC |
| `web/src/table/phone/PhoneTable.tsx` + `phone.css` (novos) | Monta a mesa do celular e liga tudo à conexão |
| `web/src/screens/Game.tsx` | Escolhe `PhoneTable` ou `Table` pelo layout |
| `web/src/screens/JoinForm.tsx`, CSS de lobby/estante | Ajustes para 360px |
| `e2e/celular.spec.ts` (novo) | Rodada de DITU com um jogador no celular e outro no PC |

---

### Task 1: layout do celular e aviso de celular deitado

**Files:**
- Modify: `web/src/lib/device.ts`
- Create: `web/src/screens/RotateNotice.tsx`
- Create: `web/test/device.test.tsx`

- [ ] **Step 1: Testes que falham**

Crie `web/test/device.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LANDSCAPE_PHONE_QUERY, PHONE_LAYOUT_QUERY, useIsLandscapePhone, useLayout } from '../src/lib/device';
import { RotateNotice } from '../src/screens/RotateNotice';

function media(matching: string[]) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: matching.includes(query), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
}

function LayoutProbe() {
  return <p>{useLayout()}</p>;
}
function LandscapeProbe() {
  return <p>{useIsLandscapePhone() ? 'deitado' : 'ok'}</p>;
}

describe('layout do celular', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('tela estreita é "phone"; o resto é "desktop"', () => {
    expect(PHONE_LAYOUT_QUERY).toBe('(max-width: 640px)');
    media([PHONE_LAYOUT_QUERY]);
    const { unmount } = render(<LayoutProbe />);
    expect(screen.getByText('phone')).toBeTruthy();
    unmount();
    media([]);
    render(<LayoutProbe />);
    expect(screen.getByText('desktop')).toBeTruthy();
  });

  it('sem matchMedia (navegador velho, jsdom): desktop', () => {
    vi.stubGlobal('matchMedia', undefined);
    render(<LayoutProbe />);
    expect(screen.getByText('desktop')).toBeTruthy();
  });

  it('celular deitado com tela baixa é detectado', () => {
    expect(LANDSCAPE_PHONE_QUERY).toBe('(pointer: coarse) and (orientation: landscape) and (max-height: 500px)');
    media([LANDSCAPE_PHONE_QUERY]);
    render(<LandscapeProbe />);
    expect(screen.getByText('deitado')).toBeTruthy();
  });

  it('aviso de virar o celular só aparece deitado', () => {
    media([]);
    const { container, unmount } = render(<RotateNotice />);
    expect(container.innerHTML).toBe('');
    unmount();
    media([LANDSCAPE_PHONE_QUERY]);
    render(<RotateNotice />);
    expect(screen.getByRole('alert').textContent).toContain('vira o celular em pé');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test -w web -- test/device.test.tsx`
Expected: FAIL (exports novos não existem).

- [ ] **Step 3: Implementar**

Substitua `web/src/lib/device.ts` por:

```ts
import { useSyncExternalStore } from 'react';

/** Aparelho de toque (sem hover, ponteiro grosso): só jogos `mobile` do catálogo ficam liberados nele. */
export const PHONE_QUERY = '(hover: none) and (pointer: coarse)';
/** Layout de celular: tela em pé e estreita (mede a largura, não o aparelho). */
export const PHONE_LAYOUT_QUERY = '(max-width: 640px)';
/** Celular deitado com a tela baixa: pede pra virar em pé. */
export const LANDSCAPE_PHONE_QUERY = '(pointer: coarse) and (orientation: landscape) and (max-height: 500px)';

function mediaOf(query: string): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(query) : null;
}

/** Acompanha uma media query; sem `matchMedia`, é sempre falso. */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const m = mediaOf(query);
      m?.addEventListener('change', onChange);
      return () => m?.removeEventListener('change', onChange);
    },
    () => mediaOf(query)?.matches ?? false,
    () => false,
  );
}

export function useIsPhone(): boolean {
  return useMedia(PHONE_QUERY);
}

export type Layout = 'phone' | 'desktop';

export function useLayout(): Layout {
  return useMedia(PHONE_LAYOUT_QUERY) ? 'phone' : 'desktop';
}

export function useIsLandscapePhone(): boolean {
  return useMedia(LANDSCAPE_PHONE_QUERY);
}
```

> O `subscribe` muda de identidade a cada render. Se o `useSyncExternalStore` reclamar ou ressubscrever demais, memorize com `useCallback(…, [query])`. O teste continua igual.

Crie `web/src/screens/RotateNotice.tsx`:

```tsx
import { useIsLandscapePhone } from '../lib/device';

/** Celular deitado: a mesa é feita pra jogar em pé. Fica por cima, sem desmontar nada. */
export function RotateNotice() {
  if (!useIsLandscapePhone()) return null;
  return (
    <div className="rotate-notice" role="alert">
      <p>vira o celular em pé 📱</p>
    </div>
  );
}
```

E em `web/src/brand/global.css` acrescente:

```css
.rotate-notice { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; background: var(--kraft); }
.rotate-notice p { font: 700 24px/1.2 var(--font-ui); text-align: center; padding: 24px; }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test -w web`
Expected: PASS (inclusive `phone.test.tsx`, que usa `useIsPhone`).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/device.ts web/src/screens/RotateNotice.tsx web/src/brand/global.css web/test/device.test.tsx
git commit -m "feat(web): layout de celular pela largura e aviso de celular deitado"
```

---

### Task 2: catálogo diz quem funciona no celular

**Files:**
- Modify: `web/src/games/catalog.ts`, `web/src/App.tsx`, `web/src/screens/RoomScreen.tsx`, `web/src/screens/GamePage.tsx`, `web/src/screens/Home.tsx`
- Modify (testes): `web/test/catalog.test.ts`, `web/test/phone.test.tsx`, `web/test/room-screen.test.tsx`

Hoje: em aparelho de toque, a rota da sala mostra sempre o `PhoneNotice`, a aba jogar troca "criar sala" pelo aviso, e a estante esconde "tem um código?". Agora isso vale só para jogo com `mobile: false`.

- [ ] **Step 1: Testes que falham**

Em `web/test/catalog.test.ts`:

```ts
  it('DITU funciona no celular; Diquisti ainda não (etapa 2)', () => {
    expect(catalogEntry('ito')?.mobile).toBe(true);
    expect(catalogEntry('dixit')?.mobile).toBe(false);
  });
```

Em `web/test/phone.test.tsx`, ajuste e acrescente casos (aparelho de toque via `phone(true)`, que já existe no arquivo):
- **Página do DITU no celular:** mostra "criar sala" e "entrar na sala" (antes mostrava o aviso).
- **Página do Diquisti no celular:** mostra o `PHONE_TEXT` e nenhum "criar sala".
- **Estante no celular:** mostra a linha "tem um código?".
- **App com `#/sala/ABCD` no celular:** não mostra mais o aviso direto. Renderiza a `RoomScreen`, que pergunta ao servidor; com `getRoomInfo` mockado nunca resolvendo, aparece "carregando…".

Em `web/test/room-screen.test.tsx`:

```tsx
  it('celular: sala de jogo sem versão de celular mostra o aviso', async () => {
    vi.stubGlobal('matchMedia', vi.fn((q: string) => ({ matches: q === '(hover: none) and (pointer: coarse)', media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    mocked.mockResolvedValue({ exists: true, game: 'dixit', phase: 'lobby', seats: [] });
    renderRoom();
    expect(await screen.findByText(/pra jogar no computador/)).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it('celular: sala de DITU entra normalmente', async () => {
    vi.stubGlobal('matchMedia', vi.fn((q: string) => ({ matches: q === '(hover: none) and (pointer: coarse)', media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    mocked.mockResolvedValue({ exists: true, game: 'ito', phase: 'lobby', seats: [] });
    renderRoom();
    expect(await screen.findByLabelText('seu nome')).toBeTruthy();
    vi.unstubAllGlobals();
  });
```

(Ajuste o formato do `info()` ao que o arquivo já usa: `RoomInfo` tem `game` desde o D1 do Dixit.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test -w web -- test/catalog.test.ts test/phone.test.tsx test/room-screen.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

1. **`catalog.ts`:**
   - `CatalogEntry` ganha `/** Joga no celular (aparelho de toque). Sem isso, o celular vê "abre no computador". */ mobile: boolean;`
   - Em `TEXT`: `ito: { …, mobile: true }` e `dixit: { …, mobile: false }`. Se `TEXT` omite campos via `Omit<…>`, inclua `mobile` lá.
2. **`App.tsx`:** a rota da sala sempre renderiza `<RoomScreen key={route.code} code={route.code} />`. O aviso sai daqui, e `useIsPhone`/`PhoneNotice` deixam de ser importados se não sobrarem usos.
3. **`RoomScreen.tsx`:** depois de `info` carregar, antes de montar a conexão ou o formulário, aplique o aviso. O `<RotateNotice />` vai dentro do retorno da tela da sala (formulário, lobby e mesa), por cima, e não aparece no `PhoneNotice`.

```tsx
  const phone = useIsPhone();
  // … depois de `if (info === null) …`:
  if (phone && info && !catalogEntry(info.game)?.mobile) return <PhoneNotice />;
```

   O hook `useIsPhone()` fica no topo do componente, junto dos outros hooks, e não depois de um `return`.
4. **`GamePage.tsx` (aba jogar):** a condição do aviso passa de `phone` para `phone && !entry.mobile`.
5. **`Home.tsx`:** a linha "tem um código?" volta a aparecer sempre. Remova o `useIsPhone` dela.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test -w web`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A web
git commit -m "feat(web): catálogo diz quem joga no celular; DITU liberado no celular"
```

---

### Task 3: lógica pura da fila em pé

**Files:**
- Create: `web/src/table/phone/phoneRowLogic.ts`
- Create: `web/test/phone-row-logic.test.ts`

- [ ] **Step 1: Testes que falham**

Crie `web/test/phone-row-logic.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FH, FW, ROW_Y } from '../src/table/constants';
import { rowEntries } from '../src/table/rowLayout';
import { canPick, deskCursor, posFromY, slotTargets } from '../src/table/phone/phoneRowLogic';
import { act, sortingRoom, viewOf } from './fixtures';

describe('alvos "aqui" da fila em pé', () => {
  it('carta da mão: um alvo em cada espaço, com o índice do servidor', () => {
    expect(slotTargets(['a', 'b'], 'h')).toEqual([
      { pos: 0, index: 0 },
      { pos: 1, index: 1 },
      { pos: 2, index: 2 },
    ]);
  });

  it('carta da fila: some o alvo antes e depois dela (não mudaria nada) e o índice ignora ela', () => {
    // fila a b c, movendo b: posições 1 e 2 são "ficar onde está"
    expect(slotTargets(['a', 'b', 'c'], 'b')).toEqual([
      { pos: 0, index: 0 },
      { pos: 3, index: 2 },
    ]);
  });

  it('fila vazia: um alvo só', () => {
    expect(slotTargets([], 'h')).toEqual([{ pos: 0, index: 0 }]);
  });
});

describe('quem pode pegar o quê', () => {
  it('na escolha: minha carta da mão sim; carta da fila de qualquer um sim; carta da mão dos outros não', () => {
    let room = sortingRoom(2);
    room = act(room, 'p1', { type: 'place', cardId: 'p1:0', index: 0 });
    const v = viewOf(room, 'p0');
    expect(canPick(v, 'p0:0')).toBe(true);
    expect(canPick(v, 'p1:0')).toBe(true);
  });

  it('fora da escolha, ou assistindo, ninguém pega nada', () => {
    const watching = viewOf(sortingRoom(2), null);
    expect(canPick(watching, 'p0:0')).toBe(false);
    let room = sortingRoom(2);
    room = act(room, 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
    room = act(room, 'p1', { type: 'place', cardId: 'p1:0', index: 1 });
    room = act(room, 'p0', { type: 'forceReveal' });
    expect(canPick(viewOf(room, 'p0'), 'p0:0')).toBe(false);
  });
});

describe('cursor equivalente pra quem está no PC', () => {
  it('é o ponto do vão na fila deitada, normalizado pelo feltro', () => {
    const gap = rowEntries(['a', 'b'], [{ owner: '_', index: 1 }]).find((e) => e.kind === 'gap')!;
    expect(deskCursor(['a', 'h', 'b'], 'h', 1)).toEqual({ zone: 'table', x: gap.x / FW, y: ROW_Y / FH });
  });
});

describe('posição pelo dedo', () => {
  const rects = [
    { top: 0, bottom: 40 },
    { top: 50, bottom: 90 },
    { top: 100, bottom: 140 },
  ];
  it('acima do meio da primeira faixa = 0; entre faixas conta as metades', () => {
    expect(posFromY(5, rects)).toBe(0);
    expect(posFromY(30, rects)).toBe(1);
    expect(posFromY(95, rects)).toBe(2);
    expect(posFromY(500, rects)).toBe(3);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test -w web -- test/phone-row-logic.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

Crie `web/src/table/phone/phoneRowLogic.ts`:

```ts
import type { ItoRoomView } from '@cartolina/shared';
import { isPlaying } from '../../game/derive';
import { FH, FW, ROW_Y } from '../constants';
import { rowEntries } from '../rowLayout';

/** Um espaço "aqui" na fila em pé: `pos` = posição visual (0 = antes da 1ª faixa); `index` = índice do `place` no servidor. */
export interface SlotTarget {
  pos: number;
  index: number;
}

/**
 * Espaços onde `movingId` pode cair. O índice do servidor ignora a própria carta. Se ela já está na fila,
 * os espaços colados nela (antes e depois) somem: soltar ali não muda nada.
 */
export function slotTargets(row: readonly string[], movingId: string): SlotTarget[] {
  const at = row.indexOf(movingId);
  const out: SlotTarget[] = [];
  for (let pos = 0; pos <= row.length; pos++) {
    if (at >= 0 && (pos === at || pos === at + 1)) continue;
    out.push({ pos, index: row.slice(0, pos).filter((id) => id !== movingId).length });
  }
  return out;
}

/**
 * Pode pegar a carta agora? Só na escolha e só quem joga a rodada. Carta da fila: qualquer um move.
 * Carta fora da fila: só o dono (a mão é dele).
 */
export function canPick(view: ItoRoomView, cardId: string): boolean {
  if (view.game.phase !== 'sorting' || !isPlaying(view)) return false;
  const card = view.game.cards[cardId];
  if (!card) return false;
  return view.game.row.includes(cardId) || card.owner === view.you;
}

/** Onde estaria o vão na fila deitada do PC (pra quem está no computador ver o arrasto do celular no lugar certo). */
export function deskCursor(row: readonly string[], cardId: string, index: number): { zone: 'table'; x: number; y: number } {
  const base = row.filter((id) => id !== cardId);
  const gap = rowEntries(base, [{ owner: '_', index }]).find((e) => e.kind === 'gap');
  return { zone: 'table', x: (gap?.x ?? FW / 2) / FW, y: ROW_Y / FH };
}

/** Posição visual (0..n) pelo y do dedo: conta quantas faixas têm o meio acima dele. */
export function posFromY(y: number, rects: ReadonlyArray<{ top: number; bottom: number }>): number {
  let n = 0;
  for (const r of rects) if ((r.top + r.bottom) / 2 < y) n++;
  return n;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test -w web -- test/phone-row-logic.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/table/phone/phoneRowLogic.ts web/test/phone-row-logic.test.ts
git commit -m "feat(web): lógica da fila em pé do celular (alvos, permissões, cursor pro PC)"
```

---

### Task 4: revelação passo a passo do celular

**Files:**
- Create: `web/src/table/phone/usePhoneReveal.ts`
- Create: `web/test/phone-reveal.test.tsx`

Ritmo igual ao computador (`engine.ts`, `syncReveal`/`flipCard`):
- a primeira carta vira em 750 ms e cada uma das seguintes 620 ms depois, com o som `flip` (índice i);
- carta errada: som `error` 330 ms depois de virar;
- no fim, mais 500 ms, som `win`/`lose` e `done`.

Se a tela monta já com a revelação pronta (recarregou no meio), tudo aparece de uma vez, sem som.

- [ ] **Step 1: Testes que falham**

Crie `web/test/phone-reveal.test.tsx`:

```tsx
import { act as rtlAct, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ItoRoomView } from '@cartolina/shared';
import { usePhoneReveal } from '../src/table/phone/usePhoneReveal';
import { act, sortingRoom, viewOf } from './fixtures';

function revealedView(): ItoRoomView {
  let room = sortingRoom(2);
  room = act(room, 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
  room = act(room, 'p1', { type: 'place', cardId: 'p1:0', index: 1 });
  room = act(room, 'p0', { type: 'forceReveal' });
  return viewOf(room, 'p0') as ItoRoomView;
}

function Probe({ view, sound }: { view: ItoRoomView; sound: (n: string, i?: number) => void }) {
  const r = usePhoneReveal(view, sound, false);
  return <p>{`${r.shown}|${r.done}`}</p>;
}

describe('revelação no celular', () => {
  it('vira uma carta por vez, com sons, e termina com vitória ou derrota', () => {
    vi.useFakeTimers();
    try {
      const sound = vi.fn();
      const view = revealedView();
      render(<Probe view={view} sound={sound} />);
      expect(screen.getByText('0|false')).toBeTruthy();
      rtlAct(() => void vi.advanceTimersByTime(750));
      expect(screen.getByText('1|false')).toBeTruthy();
      expect(sound).toHaveBeenCalledWith('flip', 0);
      rtlAct(() => void vi.advanceTimersByTime(620));
      expect(screen.getByText('2|false')).toBeTruthy();
      rtlAct(() => void vi.advanceTimersByTime(1000));
      expect(screen.getByText('2|true')).toBeTruthy();
      const won = view.game.outcome === 'round_won';
      expect(sound).toHaveBeenCalledWith(won ? 'win' : 'lose');
    } finally {
      vi.useRealTimers();
    }
  });

  it('montou já revelado (recarregou): tudo de uma vez, sem som', () => {
    const sound = vi.fn();
    function Instant({ view }: { view: ItoRoomView }) {
      const r = usePhoneReveal(view, sound, true);
      return <p>{`${r.shown}|${r.done}`}</p>;
    }
    render(<Instant view={revealedView()} />);
    expect(screen.getByText('2|true')).toBeTruthy();
    expect(sound).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test -w web -- test/phone-reveal.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Crie `web/src/table/phone/usePhoneReveal.ts`:

```ts
import type { ItoRoomView } from '@cartolina/shared';
import { useEffect, useState } from 'react';

const FIRST_MS = 750;
const STEP_MS = 620;
const ERROR_MS = 330;
const END_MS = 500;

export interface PhoneReveal {
  /** Quantas cartas da revelação já viraram (na ordem de `game.reveal`). */
  shown: number;
  /** Terminou (mostra o resultado). */
  done: boolean;
}

/**
 * Revelação passo a passo, com o ritmo e os sons do computador. `instant`: a tela montou já com a revelação
 * pronta (recarregou), então mostra tudo sem som.
 */
export function usePhoneReveal(view: ItoRoomView, sound: (name: 'flip' | 'error' | 'win' | 'lose', index?: number) => void, instant: boolean): PhoneReveal {
  const reveal = view.game.phase === 'reveal' ? (view.game.reveal ?? []) : [];
  // Ids se repetem entre rodadas: a chave leva o valor também (igual à mesa do computador).
  const key = reveal.map((e) => `${e.cardId}=${e.value}`).join('|');
  const [state, setState] = useState<{ key: string; shown: number; done: boolean }>(() =>
    instant && key ? { key, shown: reveal.length, done: true } : { key: '', shown: 0, done: false },
  );

  useEffect(() => {
    if (!key) {
      setState({ key: '', shown: 0, done: false });
      return;
    }
    if (state.key === key) return;
    setState({ key, shown: 0, done: false });
    const won = view.game.outcome === 'round_won' || view.game.outcome === 'level_cleared' || view.game.outcome === 'won';
    const timers: number[] = [];
    let t = FIRST_MS;
    reveal.forEach((e, i) => {
      timers.push(
        window.setTimeout(() => {
          setState((s) => (s.key === key ? { ...s, shown: i + 1 } : s));
          sound('flip', i);
        }, t),
      );
      if (e.error) timers.push(window.setTimeout(() => sound('error'), t + ERROR_MS));
      t += STEP_MS;
    });
    timers.push(
      window.setTimeout(() => {
        setState((s) => (s.key === key ? { ...s, done: true } : s));
        sound(won ? 'win' : 'lose');
      }, t - STEP_MS + END_MS),
    );
    return () => timers.forEach((id) => clearTimeout(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só a chave da revelação reinicia a sequência
  }, [key]);

  return state.key === key ? { shown: state.shown, done: state.done } : { shown: 0, done: false };
}
```

> **Conferência do teste:** com 2 cartas, o fim cai em 750 + 620 + 500 = 1870 ms, e o teste avança 750 + 620 + 1000. Se o `useEffect` com `state.key` der problema no StrictMode (duas montagens), o teste mostra; ajuste para um `useRef` com a chave já iniciada.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test -w web -- test/phone-reveal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/table/phone/usePhoneReveal.ts web/test/phone-reveal.test.tsx
git commit -m "feat(web): revelação passo a passo da mesa do celular"
```

---

### Task 5: a fila em pé (`PhoneRow`)

**Files:**
- Create: `web/src/table/phone/PhoneRow.tsx`
- Create: `web/src/table/phone/phone.css`
- Create: `web/test/phone-row.test.tsx`

A fila é só apresentação. Quem decide o que mandar ao servidor é a `PhoneTable` (Task 8), via callbacks.

```ts
export interface PhoneRowProps {
  view: ItoRoomView;
  /** Fila mostrada (do servidor + minha intenção pendente). */
  row: readonly string[];
  /** Carta selecionada pra mover/colocar (da mão ou da fila), ou null. */
  selected: string | null;
  /** Vãos de arrastos (meu ou de outros), em posição visual. */
  gaps: ReadonlyArray<{ owner: string; pos: number }>;
  /** Cartas sendo carregadas (ficam translúcidas). */
  carried: ReadonlySet<string>;
  /** Quantas cartas da revelação já viraram (0 fora da revelação). */
  shown: number;
  onPick(cardId: string): void;
  onTarget(index: number): void;
  /** "voltar pra mão" (só aparece com uma carta minha da fila selecionada). */
  onReturn(cardId: string): void;
}
```

- [ ] **Step 1: Testes que falham**

Crie `web/test/phone-row.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ItoRoomView } from '@cartolina/shared';
import { PhoneRow } from '../src/table/phone/PhoneRow';
import { act, sortingRoom, viewOf } from './fixtures';

function placedView() {
  let room = sortingRoom(3);
  room = act(room, 'p0', { type: 'clue', cardId: 'p0:0', text: 'gato' });
  room = act(room, 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
  room = act(room, 'p1', { type: 'clue', cardId: 'p1:0', text: 'chuva' });
  room = act(room, 'p1', { type: 'place', cardId: 'p1:0', index: 1 });
  return viewOf(room, 'p0') as ItoRoomView;
}

const base = (view: ItoRoomView) => ({
  view,
  row: view.game.row,
  selected: null as string | null,
  gaps: [],
  carried: new Set<string>(),
  shown: 0,
  onPick: vi.fn(),
  onTarget: vi.fn(),
  onReturn: vi.fn(),
});

describe('fila em pé', () => {
  it('mostra as faixas em ordem, do 1 (topo) ao 100 (embaixo), com a dica', () => {
    const view = placedView();
    render(<PhoneRow {...base(view)} />);
    const strips = screen.getAllByRole('button', { name: /gato|chuva/ });
    expect(strips.map((s) => s.textContent)).toEqual([expect.stringContaining('gato'), expect.stringContaining('chuva')]);
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('100')).toBeTruthy();
  });

  it('tocar numa faixa avisa quem foi tocado', () => {
    const p = base(placedView());
    render(<PhoneRow {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /chuva/ }));
    expect(p.onPick).toHaveBeenCalledWith('p1:0');
  });

  it('com carta selecionada: aparecem os "aqui" com o índice do servidor', () => {
    const p = { ...base(placedView()), selected: 'p2:0' };
    render(<PhoneRow {...p} />);
    const here = screen.getAllByRole('button', { name: 'aqui' });
    expect(here).toHaveLength(3);
    fireEvent.click(here[2]!);
    expect(p.onTarget).toHaveBeenCalledWith(2);
  });

  it('minha carta da fila selecionada: dá pra voltar pra mão', () => {
    const p = { ...base(placedView()), selected: 'p0:0' };
    render(<PhoneRow {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'voltar pra mão' }));
    expect(p.onReturn).toHaveBeenCalledWith('p0:0');
  });

  it('carta de outra pessoa selecionada: sem "voltar pra mão"', () => {
    render(<PhoneRow {...base(placedView())} selected="p1:0" />);
    expect(screen.queryByRole('button', { name: 'voltar pra mão' })).toBeNull();
  });

  it('vão de arrasto e carta carregada', () => {
    const view = placedView();
    const { container } = render(<PhoneRow {...base(view)} gaps={[{ owner: 'p1', pos: 1 }]} carried={new Set(['p1:0'])} />);
    expect(container.querySelectorAll('.p-gap')).toHaveLength(1);
    expect(container.querySelector('[data-card="p1:0"]')?.classList.contains('carried')).toBe(true);
  });
});
```

> Na revelação, as faixas mostram o número das cartas já viradas (`shown`) e um ✕ nas erradas. Acrescente um teste: com uma `view` revelada e `shown=1`, a primeira faixa tem o número e a segunda não. Use o `revealedView` da Task 4, copiado para este arquivo.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test -w web -- test/phone-row.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Crie `web/src/table/phone/PhoneRow.tsx`:

```tsx
import type { ItoRoomView } from '@cartolina/shared';
import { Fragment, type CSSProperties } from 'react';
import { Critter } from '../../screens/Critter';
import { slotTargets } from './phoneRowLogic';

export interface PhoneRowProps {
  view: ItoRoomView;
  row: readonly string[];
  selected: string | null;
  gaps: ReadonlyArray<{ owner: string; pos: number }>;
  carried: ReadonlySet<string>;
  shown: number;
  onPick(cardId: string): void;
  onTarget(index: number): void;
  onReturn(cardId: string): void;
}

/** Fila em pé: 1 no topo, 100 embaixo. Cada carta é uma faixa com o bichinho do dono e a dica. */
export function PhoneRow({ view, row, selected, gaps, carried, shown, onPick, onTarget, onReturn }: PhoneRowProps) {
  const colorOf = (owner: string) => view.seats.find((s) => s.id === owner)?.color ?? '#D9C2A0';
  const reveal = view.game.reveal ?? [];
  const revealed = new Map(reveal.slice(0, shown).map((e) => [e.cardId, e]));
  const targets = selected ? slotTargets(row, selected) : [];
  const targetAt = (pos: number) => targets.find((t) => t.pos === pos);
  const gapsAt = (pos: number) => gaps.filter((g) => g.pos === pos);
  const mineSelectedInRow = selected !== null && row.includes(selected) && view.game.cards[selected]?.owner === view.you;

  const slot = (pos: number) => (
    <Fragment key={`s${pos}`}>
      {gapsAt(pos).map((g) => (
        <div key={g.owner} className="p-gap" style={{ '--c': colorOf(g.owner) } as CSSProperties} aria-hidden="true" />
      ))}
      {targetAt(pos) && (
        <button type="button" className="p-here" data-sound="click" onClick={() => onTarget(targetAt(pos)!.index)}>
          aqui
        </button>
      )}
    </Fragment>
  );

  return (
    <div className="p-row" aria-label="fila de cartas">
      <div className="p-end">1 · {view.game.theme?.min ?? ''}</div>
      {slot(0)}
      {row.map((id, i) => {
        const card = view.game.cards[id];
        if (!card) return null;
        const r = revealed.get(id);
        return (
          <Fragment key={id}>
            <button
              type="button"
              data-card={id}
              data-sound="none"
              className={`p-strip ${selected === id ? 'sel' : ''} ${carried.has(id) ? 'carried' : ''} ${card.owner === view.you ? 'mine' : ''} ${r?.error ? 'err' : ''}`}
              style={{ '--c': colorOf(card.owner) } as CSSProperties}
              onClick={() => onPick(id)}
            >
              <span className="p-badge">
                <Critter color={colorOf(card.owner)} />
              </span>
              <span className="p-clue">{card.clue.trim() || '…'}</span>
              {r && <span className="p-num">{r.value}</span>}
              {r?.error && (
                <span className="p-x" role="img" aria-label="fora de ordem">
                  ✕
                </span>
              )}
            </button>
            {slot(i + 1)}
          </Fragment>
        );
      })}
      <div className="p-end">100 · {view.game.theme?.max ?? ''}</div>
      {mineSelectedInRow && (
        <button type="button" className="sbtn p-return" onClick={() => onReturn(selected!)}>
          voltar pra mão
        </button>
      )}
    </div>
  );
}
```

> **Detalhes de nome acessível:**
> - O `aria-label` da fila não deve cobrir os nomes das faixas: o nome de cada faixa é o texto dela (a dica e, revelada, o número).
> - Os textos "1"/"100" dos extremos aparecem como "1 · …" e "100 · …".
> - O teste usa `getByText('1')` e `getByText('100')`. Se ficar ambíguo, ponha os números num `<b>` próprio e ajuste o teste para `getByText('1', { selector: 'b' })`.

Crie `web/src/table/phone/phone.css` (importado pela `PhoneTable` na Task 8; neste task, importe no `PhoneRow.tsx` com `import './phone.css';` para o build pegar):

```css
/* Mesa do celular (DITU em pé). */
.p-row { display: flex; flex-direction: column; gap: 6px; padding: 8px; overflow-y: auto; overscroll-behavior: contain; }
.p-end { font: 600 13px/1.2 var(--font-ui); opacity: 0.65; text-align: center; }
.p-strip {
  position: relative; display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 6px 10px; text-align: left;
  border: 2px solid var(--ink); border-radius: var(--r); background: var(--c); color: var(--ink); box-shadow: 2px 3px 0 var(--ink);
  font: 19px/1.1 var(--font-hand); touch-action: none; user-select: none; -webkit-user-select: none;
}
.p-strip.mine { outline: 3px solid var(--paper); outline-offset: -5px; }
.p-strip.sel { transform: translateX(6px); box-shadow: 4px 5px 0 var(--ink); }
.p-strip.carried { opacity: 0.35; }
.p-strip.err { border-color: var(--pink2); }
.p-badge { width: 30px; height: 30px; flex: none; }
.p-clue { flex: 1; overflow-wrap: anywhere; }
.p-num { flex: none; min-width: 40px; text-align: center; font: 700 22px/1 var(--font-ui); background: var(--paper); border: 2px solid var(--ink); border-radius: 8px 6px 7px 5px; padding: 4px; }
.p-x { position: absolute; right: -6px; top: -8px; font: 700 22px/1 var(--font-ui); color: var(--pink2); }
.p-gap { height: 46px; border: 3px dashed var(--c); border-radius: var(--r); }
.p-here { height: 36px; border: 2px dashed var(--ink); border-radius: var(--r); background: transparent; font: 600 15px/1 var(--font-ui); }
.p-return { align-self: center; }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test -w web -- test/phone-row.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/table/phone/PhoneRow.tsx web/src/table/phone/phone.css web/test/phone-row.test.tsx
git commit -m "feat(web): fila em pé do celular (faixas, alvos 'aqui', vão de arrasto e revelação)"
```

---

### Task 6: mão e painel da dica

**Files:**
- Create: `web/src/table/phone/PhoneHand.tsx`, `web/src/table/phone/ClueSheet.tsx`
- Create: `web/test/phone-hand.test.tsx`

Comportamento:
- A barra da mão lista as cartas da pessoa (`cardsOf(view, you)`).
- Na fila, a carta aparece esmaecida com "tá na fila ↑" e o toque seleciona a carta da fila.
- Na mão:
  - um toque seleciona para colocar (`onPick`);
  - o botãozinho "✎ dica" abre o `ClueSheet`.
- **`ClueSheet`:** painel fixo embaixo, com `textarea` grande (`maxLength=CLUE_MAX`) e o botão "ok".
  - Debounce de 350 ms, e só manda `clue` se o texto mudou. É a mesma regra do `Hand.tsx` do computador; leia `web/src/table/Hand.tsx` e reaproveite a lógica (`flush`, `pending`, `latest`).
  - "ok" ou tocar fora fecha e manda o pendente na hora.
  - Carta na fila: o painel não abre ("tira a carta da fila pra mudar a dica").
- **Antes de colocar a carta** (seleção + "aqui", ou arrasto), a `PhoneTable` chama o `flush` exposto pelo `ClueSheet`, por `ref` ou callback. Assim uma dica digitada não se perde, a mesma correção do computador.

- [ ] **Step 1: Testes que falham**

Crie `web/test/phone-hand.test.tsx`:

```tsx
import { act as rtlAct, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, type Mock } from 'vitest';
import type { GameConn } from '../src/net/connection';
import { ClueSheet } from '../src/table/phone/ClueSheet';
import { PhoneHand } from '../src/table/phone/PhoneHand';
import { act, sortingRoom, viewOf } from './fixtures';

const conn = (): GameConn & { sendAction: Mock<GameConn['sendAction']> } => ({
  sendAction: vi.fn<GameConn['sendAction']>(),
  sendActivity: vi.fn(),
  sendCursor: vi.fn(),
  sendPing: vi.fn(),
  onFx: vi.fn(() => () => {}),
  onError: vi.fn(() => () => {}),
});

describe('mão do celular', () => {
  it('mostra o meu número; toque seleciona; "✎ dica" abre o painel', () => {
    const view = viewOf(sortingRoom(2), 'p0');
    const onPick = vi.fn();
    const onEdit = vi.fn();
    render(<PhoneHand view={view} row={[]} selected={null} onPick={onPick} onEdit={onEdit} />);
    const mine = view.game.cards['p0:0']!;
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${mine.value}`) }));
    expect(onPick).toHaveBeenCalledWith('p0:0');
    fireEvent.click(screen.getByRole('button', { name: '✎ dica' }));
    expect(onEdit).toHaveBeenCalledWith('p0:0');
  });

  it('carta já na fila aparece esmaecida e sem editar dica', () => {
    const room = act(sortingRoom(2), 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
    render(<PhoneHand view={viewOf(room, 'p0')} row={['p0:0']} selected={null} onPick={vi.fn()} onEdit={vi.fn()} />);
    expect(screen.getByText('tá na fila ↑')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '✎ dica' })).toBeNull();
  });
});

describe('painel da dica', () => {
  it('escreve com debounce e manda na hora ao tocar "ok"', () => {
    vi.useFakeTimers();
    try {
      const c = conn();
      const onClose = vi.fn();
      render(<ClueSheet view={viewOf(sortingRoom(2), 'p0')} cardId="p0:0" conn={c} onClose={onClose} />);
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'gato' } });
      expect(c.sendAction).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'ok' }));
      expect(c.sendAction).toHaveBeenCalledWith({ type: 'clue', cardId: 'p0:0', text: 'gato' });
      expect(onClose).toHaveBeenCalled();
      rtlAct(() => void vi.advanceTimersByTime(1000));
      expect(c.sendAction).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test -w web -- test/phone-hand.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`web/src/table/phone/PhoneHand.tsx`:

```tsx
import type { ItoRoomView } from '@cartolina/shared';
import type { CSSProperties } from 'react';
import { cardsOf } from '../../game/derive';
import { Critter } from '../../screens/Critter';

export function PhoneHand({
  view,
  row,
  selected,
  onPick,
  onEdit,
}: {
  view: ItoRoomView;
  row: readonly string[];
  selected: string | null;
  onPick(cardId: string): void;
  onEdit(cardId: string): void;
}) {
  if (!view.you) return null;
  const color = view.seats.find((s) => s.id === view.you)?.color ?? '#D9C2A0';
  const sorting = view.game.phase === 'sorting';
  return (
    <div className="p-hand" style={{ '--c': color } as CSSProperties}>
      {cardsOf(view, view.you).map((card) => {
        const inRow = row.includes(card.id);
        return (
          <div key={card.id} className={`p-hcard ${inRow ? 'away' : ''} ${selected === card.id ? 'sel' : ''}`}>
            <button type="button" className="p-hnum" data-sound="none" data-card={card.id} disabled={!sorting} onClick={() => onPick(card.id)}>
              {card.value}
              <span className="p-hclue">{inRow ? 'tá na fila ↑' : card.clue.trim() || 'sem dica'}</span>
            </button>
            {!inRow && sorting && (
              <button type="button" className="p-edit" onClick={() => onEdit(card.id)}>
                ✎ dica
              </button>
            )}
            <span className="p-hbadge">
              <Critter color={color} />
            </span>
          </div>
        );
      })}
    </div>
  );
}
```

`web/src/table/phone/ClueSheet.tsx`, com a lógica do debounce copiada de `web/src/table/Hand.tsx` (`CLUE_DEBOUNCE_MS`, `flush`, `pending`, `latest`) e o `flush` exposto via `useImperativeHandle`:

```tsx
import { CLUE_MAX, type ItoRoomView } from '@cartolina/shared';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { GameConn } from '../../net/connection';

const CLUE_DEBOUNCE_MS = 350;

export interface ClueSheetHandle {
  /** Manda agora a dica pendente (antes de a carta ir pra fila). */
  flush(): void;
}

export const ClueSheet = forwardRef<ClueSheetHandle, { view: ItoRoomView; cardId: string; conn: GameConn; onClose(): void }>(function ClueSheet(
  { view, cardId, conn, onClose },
  ref,
) {
  const card = view.game.cards[cardId];
  const [text, setText] = useState(card?.clue ?? '');
  const timer = useRef(0);
  const pending = useRef<string | null>(null);
  const latest = useRef({ clue: card?.clue ?? '', conn });
  useEffect(() => {
    latest.current = { clue: card?.clue ?? '', conn };
  });

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const value = pending.current;
    pending.current = null;
    if (value !== null && value !== latest.current.clue) latest.current.conn.sendAction({ type: 'clue', cardId, text: value });
  }, [cardId]);
  useImperativeHandle(ref, () => ({ flush }), [flush]);
  useEffect(() => flush, [flush]);

  const close = () => {
    flush();
    onClose();
  };

  return (
    <div className="p-sheet-veil" onClick={close}>
      <div className="p-sheet" role="dialog" aria-label="dica da carta" onClick={(e) => e.stopPropagation()}>
        <p className="p-sheet-num">{card?.value}</p>
        <textarea
          autoFocus
          rows={3}
          maxLength={CLUE_MAX}
          placeholder="escreve uma dica…"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            pending.current = e.target.value;
            clearTimeout(timer.current);
            timer.current = window.setTimeout(flush, CLUE_DEBOUNCE_MS);
          }}
        />
        <button type="button" className="btn" onClick={close}>
          ok
        </button>
      </div>
    </div>
  );
});
```

> O computador também manda `sendActivity('writing')` com throttle de 1,5 s ao digitar. Copie isso do `Hand.tsx` (`ACTIVITY_THROTTLE_MS`), para quem está no PC ver "escrevendo…".

Acrescente em `phone.css`:

```css
.p-hand { display: flex; gap: 10px; overflow-x: auto; padding: 8px; scroll-snap-type: x mandatory; }
.p-hcard { position: relative; flex: none; scroll-snap-align: center; display: flex; flex-direction: column; align-items: stretch; gap: 4px; }
.p-hcard.away { opacity: 0.45; }
.p-hcard.sel .p-hnum { transform: translateY(-6px); box-shadow: 4px 6px 0 var(--ink); }
.p-hnum {
  min-width: 110px; min-height: 76px; padding: 8px 10px 6px 36px; display: flex; flex-direction: column; align-items: flex-start;
  border: 2px solid var(--ink); border-radius: var(--r); background: var(--c); box-shadow: 2px 3px 0 var(--ink);
  font: 700 30px/1 var(--font-ui); color: var(--ink); touch-action: none; user-select: none; -webkit-user-select: none;
}
.p-hclue { font: 16px/1.1 var(--font-hand); max-width: 160px; text-align: left; }
.p-hbadge { position: absolute; left: 6px; top: 8px; width: 24px; height: 24px; pointer-events: none; }
.p-edit { border: 2px dashed var(--ink); border-radius: 8px; background: var(--paper); font: 600 14px/1 var(--font-ui); padding: 6px; }
.p-sheet-veil { position: fixed; inset: 0; z-index: 40; background: rgba(59, 47, 47, 0.35); display: flex; align-items: flex-end; }
.p-sheet { width: 100%; background: var(--paper); border-top: 2px solid var(--ink); border-radius: 16px 16px 0 0; padding: 14px 16px calc(14px + env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 10px; }
.p-sheet-num { margin: 0; font: 700 28px/1 var(--font-ui); }
.p-sheet textarea { font: 22px/1.2 var(--font-hand); border: 2px solid var(--ink); border-radius: 10px; padding: 10px; background: var(--kraft); resize: none; }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test -w web -- test/phone-hand.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/table/phone/PhoneHand.tsx web/src/table/phone/ClueSheet.tsx web/src/table/phone/phone.css web/test/phone-hand.test.tsx
git commit -m "feat(web): mão do celular e painel da dica"
```

---

### Task 7: arrastar com o dedo (e mouse)

**Files:**
- Create: `web/src/table/phone/usePhoneDrag.ts`
- Create: `web/test/phone-drag.test.tsx`

Regras:
- **Início do arrasto:** o `pointerdown` numa carta que pode ser pega (`canPick`) prepara o arrasto.
  - Mouse: começa depois de mover 6 px.
  - Toque: começa depois de segurar 220 ms sem mover mais de 10 px. Se mover antes, é rolagem: cancela e deixa rolar.
- **Durante o arrasto:**
  - A posição visual alvo vem de `posFromY(clientY, rects das faixas)`. As faixas são `[data-card]` dentro do container da fila, sem a carta arrastada.
  - O índice do servidor sai de `slotTargets(row, cardId)` pela posição. Posição sem alvo (colada na própria carta) vira "nenhum".
  - Manda `conn.sendActivity('dragging')` uma vez, e `conn.sendCursor({ ...deskCursor(row, cardId, index), drag: { cardId, index } })` a cada mudança de alvo.
  - Com o dedo a menos de 56 px da borda de cima ou de baixo do container, rola 8 px por quadro (`requestAnimationFrame`).
- **Ao soltar:**
  - Com alvo: `onDrop(cardId, index)`.
  - Sem alvo: nada; a carta volta.
  - Em ambos os casos manda `sendCursor({ ...deskCursor(…), drag: null })` e `sendActivity('thinking')`.
- **Clique:** um toque curto, sem arrasto, continua sendo clique (seleção, Task 5/6). O hook não chama `preventDefault` no `pointerdown` antes de decidir.

Interface:

```ts
export interface PhoneDrag {
  /** Carta sendo arrastada por mim, ou null. */
  dragging: string | null;
  /** Posição visual do vão do meu arrasto (pra `PhoneRow.gaps`), ou null. */
  pos: number | null;
  /** Liga no `onPointerDown` das faixas e cartas da mão. */
  onPointerDown(e: React.PointerEvent, cardId: string): void;
}
export function usePhoneDrag(opts: {
  container: React.RefObject<HTMLElement | null>;
  row: readonly string[];
  canPick(cardId: string): boolean;
  conn: Pick<GameConn, 'sendCursor' | 'sendActivity'>;
  onDrop(cardId: string, index: number): void;
}): PhoneDrag;
```

- [ ] **Step 1: Testes que falham**

Crie `web/test/phone-drag.test.tsx`. Use um componente de teste com um container e três `div[data-card]`, cada uma com `getBoundingClientRect` mockado, por exemplo:

```ts
el.getBoundingClientRect = () => ({ top: 0, bottom: 40, left: 0, right: 300, height: 40, width: 300, x: 0, y: 0, toJSON() {} })
```

e as faixas seguintes em 50–90 e 100–140. Dispare `pointerdown`/`pointermove`/`pointerup` com `fireEvent` e `pointerType`. Casos:

1. **Mouse:** `pointerdown` na carta da mão "h", `pointermove` para y=95 (posição 2) e `pointerup`.
   - `onDrop('h', 2)`.
   - `sendCursor` chamado com `drag: { cardId: 'h', index: 2 }` e, no fim, `drag: null`.
   - `sendActivity('dragging')` e depois `('thinking')`.
2. **Toque segurado:** `pointerType: 'touch'`, `pointerdown`, avança 220 ms (fake timers) e `pointermove` para y=30 (posição 1). `dragging === 'h'` e `pos === 1`.
3. **Toque que mexe antes de 220 ms** (rolagem): `pointerdown`, `pointermove` 20 px em 50 ms e `pointerup`. Não houve `onDrop` nem `sendCursor`.
4. **Carta que não pode ser pega** (`canPick` → false): nada acontece.
5. **Arrastar a carta da fila "b" para o lugar onde já está:** posição colada nela, sem alvo. Sem `onDrop`, e o cursor final vem com `drag: null`.

(Os listeners de `pointermove`/`pointerup` ficam no `window` enquanto o arrasto existe. Dispare os eventos no `window` com `fireEvent.pointerMove(window, { clientY, pointerType })`. Se o jsdom não tiver `PointerEvent`, faça um polyfill no topo do teste: `class PointerEvent extends MouseEvent { pointerType: string; constructor(t, i = {}) { super(t, i); this.pointerType = i.pointerType ?? 'mouse'; } }`.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test -w web -- test/phone-drag.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar `usePhoneDrag.ts`**

Implementação esperada, que segue as regras acima:

```ts
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import type { GameConn } from '../../net/connection';
import { deskCursor, posFromY, slotTargets } from './phoneRowLogic';

const MOUSE_START_PX = 6;
const TOUCH_HOLD_MS = 220;
const TOUCH_SLOP_PX = 10;
const EDGE_PX = 56;
const EDGE_STEP_PX = 8;

export interface PhoneDrag {
  dragging: string | null;
  pos: number | null;
  onPointerDown(e: ReactPointerEvent, cardId: string): void;
}

export function usePhoneDrag(opts: {
  container: RefObject<HTMLElement | null>;
  row: readonly string[];
  canPick(cardId: string): boolean;
  conn: Pick<GameConn, 'sendCursor' | 'sendActivity'>;
  onDrop(cardId: string, index: number): void;
}): PhoneDrag {
  const [dragging, setDragging] = useState<string | null>(null);
  const [pos, setPos] = useState<number | null>(null);
  const live = useRef(opts);
  live.current = opts;
  const state = useRef<{ cardId: string; startY: number; startX: number; touch: boolean; active: boolean; y: number; index: number | null; hold: number; raf: number } | null>(null);

  const targetFor = useCallback((cardId: string, y: number) => {
    const box = live.current.container.current;
    const rects = box
      ? Array.from(box.querySelectorAll<HTMLElement>('[data-card]'))
          .filter((el) => el.dataset.card !== cardId && live.current.row.includes(el.dataset.card ?? ''))
          .map((el) => el.getBoundingClientRect())
      : [];
    // posFromY conta faixas sem a carta arrastada: converte pra posição visual na fila com ela.
    const withoutPos = posFromY(y, rects);
    const at = live.current.row.indexOf(cardId);
    const visual = at >= 0 && withoutPos > at ? withoutPos + 1 : withoutPos;
    const t = slotTargets(live.current.row, cardId).find((s) => s.pos === visual);
    return { visual, index: t ? t.index : null };
  }, []);

  const finish = useCallback((drop: boolean) => {
    const s = state.current;
    state.current = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    if (!s) return;
    clearTimeout(s.hold);
    cancelAnimationFrame(s.raf);
    if (s.active) {
      const { conn, row, onDrop } = live.current;
      conn.sendCursor({ ...deskCursor(row, s.cardId, s.index ?? 0), drag: null });
      conn.sendActivity('thinking');
      if (drop && s.index !== null) onDrop(s.cardId, s.index);
    }
    setDragging(null);
    setPos(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers estáveis abaixo
  }, []);

  const activate = useCallback(() => {
    const s = state.current;
    if (!s || s.active) return;
    s.active = true;
    setDragging(s.cardId);
    live.current.conn.sendActivity('dragging');
    const edge = () => {
      const cur = state.current;
      const box = live.current.container.current;
      if (!cur || !box) return;
      const r = box.getBoundingClientRect();
      if (cur.y < r.top + EDGE_PX) box.scrollTop -= EDGE_STEP_PX;
      else if (cur.y > r.bottom - EDGE_PX) box.scrollTop += EDGE_STEP_PX;
      cur.raf = requestAnimationFrame(edge);
    };
    s.raf = requestAnimationFrame(edge);
  }, []);

  function onMove(e: PointerEvent) {
    const s = state.current;
    if (!s) return;
    s.y = e.clientY;
    if (!s.active) {
      const moved = Math.hypot(e.clientX - s.startX, e.clientY - s.startY);
      if (s.touch) {
        if (moved > TOUCH_SLOP_PX) finish(false); // mexeu antes de segurar: é rolagem
        return;
      }
      if (moved < MOUSE_START_PX) return;
      activate();
    }
    e.preventDefault();
    const { visual, index } = targetFor(s.cardId, e.clientY);
    setPos(index === null ? null : visual);
    if (index !== s.index) {
      s.index = index;
      live.current.conn.sendCursor({ ...deskCursor(live.current.row, s.cardId, index ?? 0), drag: { cardId: s.cardId, index: index ?? null } });
    }
  }
  function onUp() {
    finish(true);
  }
  function onCancel() {
    finish(false);
  }

  useEffect(() => () => finish(false), [finish]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent, cardId: string) => {
      if (!live.current.canPick(cardId) || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const touch = e.pointerType !== 'mouse';
      state.current = { cardId, startX: e.clientX, startY: e.clientY, y: e.clientY, touch, active: false, index: null, hold: 0, raf: 0 };
      if (touch) state.current.hold = window.setTimeout(activate, TOUCH_HOLD_MS);
      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers via refs
    [activate],
  );

  return { dragging, pos, onPointerDown };
}
```

> **Ajuste fino esperado:**
> - As funções `onMove`/`onUp`/`onCancel` são recriadas a cada render. Para o `removeEventListener` funcionar, guarde-as num `useRef` criado uma vez, ou declare tudo dentro de um `useRef(() => …)`.
> - Mantenha o comportamento testado e escreva o código como achar mais limpo, sem mudar a interface.
> - `drag.index: null` é aceito pelo protocolo (`rowIndex.nullable()`).

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test -w web -- test/phone-drag.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/table/phone/usePhoneDrag.ts web/test/phone-drag.test.tsx
git commit -m "feat(web): arrastar cartas na fila em pé (dedo e mouse) com cursor pro PC"
```

---

### Task 8: a mesa do celular (`PhoneTable`) ligada ao jogo

**Files:**
- Create: `web/src/table/phone/PhoneTable.tsx`
- Modify: `web/src/screens/Game.tsx`, `web/src/table/phone/phone.css`
- Create: `web/test/phone-table.test.tsx`

**O que a `PhoneTable` faz:**
- **Topo:** uma linha com o `TopBar` atual, que mostra sala, modo e vidas. Abaixo, `.p-seats` com um bichinho por assento (`Avatar`) e a etiqueta de `seatStatus(view, seat, activity)`, igual ao computador.
- **Tema:** o `ThemeCard` atual. Na fase `theme`, o host vê o `ThemePanel` no lugar da fila e os outros veem "o host tá escolhendo o tema…".
- **Fila:**
  - A fila mostrada é `effectiveRow(view.game.row, pending, carriedByOthers)`, com `pending: Intent | null` (de `rowLayout.ts`).
  - O `pending` é limpo quando `intentSettled(view.game.row, pending, Date.now())`, verificado a cada `view` nova.
  - Ao colocar a carta (seleção + "aqui" ou arrasto):
    1. faz o `flush` do `ClueSheet` aberto, se houver;
    2. cria `pending = { kind: 'place', cardId, index, after: <carta antes na fila do servidor sem a minha> , at: Date.now() }`;
    3. `conn.sendAction({ type: 'place', cardId, index })`;
    4. toca `playSound('card')`.
  - "voltar pra mão": `pending = { kind: 'return', … }` e `sendAction({ type: 'return', cardId })`.
- **Arrastos dos outros:** `conn.onFx` guarda `fx.cursor` com `drag` por pessoa (`{ cardId, index, at }`).
  - Vira `gaps` (posição visual = `toVisibleIndex(row, view.game.row, cardId, index)`) e `carried`.
  - Expira em 6 s sem notícia, que é o `REMOTE_STALE_MS` do computador.
  - Quando o `fx.cursor` chega com `drag: null`, o vão some e toca `playSound('slide')` (alguém mexeu na fila).
  - `fx.activity` alimenta as etiquetas, como no `Table.tsx`.
- **Erros:** em `conn.onError`, os códigos `not_owner`, `unknown_card` e `bad_phase` limpam o `pending`, que é o rollback.
- **Seleção:**
  - Tocar numa carta que `canPick` seleciona; tocar de novo, ou tocar fora da fila, desseleciona.
  - Tocar numa carta da mão quando já tem outra selecionada troca a seleção.
- **Rodapé:**
  - O `PhoneHand`.
  - O `ReadyColumn` atual, que recebe um "snapshot" montado na hora: `{ row, inFlight: carried, dragging: drag.dragging, revealing: phase === 'reveal' && !reveal.done }`.
  - Para o host na fase `sorting`, "revelar agora" e "pular rodada", com o mesmo `confirm` do computador.
  - O `SoundToggle`.
- **Revelação:**
  - `usePhoneReveal(view, playSound, mountedInReveal)`. `mountedInReveal` é verdadeiro se a primeira `view` que a mesa viu já estava em `reveal`; guarde isso num `useRef` na montagem.
  - Quando `done`, mostra o `ResultBanner` atual.
- **Avisos:** `Toasts` (já no `Game.tsx`) e `RotateNotice`.
- **Rolagem:** a fila (`.p-row`) é a única área que rola. O topo e o rodapé ficam fixos (`.p-table { display:flex; flex-direction:column; height:100dvh }`).

**`Game.tsx`:** com `const layout = useLayout();`, o ramo do DITU fica `view.game.phase === 'lobby' ? <Lobby …/> : layout === 'phone' ? <PhoneTable view={view} conn={conn} /> : <Table view={view} conn={conn} />`.

- [ ] **Step 1: Testes que falham**

Crie `web/test/phone-table.test.tsx`. Use o `conn()` falso (cópia do de `table-ui.test.tsx`, com `onFx` guardando o listener para disparar `fx`) e as fixtures:

1. **Tema:** host vê "dar as cartas"; não-host vê "o host tá escolhendo o tema…".
2. **Colocar por toque:** em `sortingRoom(2)` vista por `p0`, tocar no meu número na mão e depois no primeiro "aqui" chama `sendAction({ type: 'place', cardId: 'p0:0', index: 0 })`, e a faixa aparece na hora (intenção pendente).
3. **Dica pendente:** abrir "✎ dica", digitar "gato", tocar no meu número e depois em "aqui". O `clue` é enviado **antes** do `place`; confira a ordem das chamadas.
4. **Arrasto de outra pessoa:** disparar `fx.cursor` de `p1` com `drag: { cardId: 'p1:0', index: 0 }` mostra um `.p-gap`; o mesmo `fx` com `drag: null` tira o vão.
5. **"tô pronto":** depois que a minha carta está na fila do servidor, o botão manda `ready`.
6. **Revelação:** com fake timers e uma sala revelada desde a montagem, o resultado aparece direto (`role="dialog"`). Com a sala passando de `sorting` para `reveal` via `rerender`, o resultado só aparece depois da sequência.
7. **`Game.tsx`:** com `matchMedia` falso casando `(max-width: 640px)`, uma sala de DITU em `sorting` mostra a fila em pé (`aria-label="fila de cartas"`) e não o `.felt` do computador.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test -w web -- test/phone-table.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Escreva a `PhoneTable` seguindo o comportamento acima e reaproveitando o que já existe:
- `TopBar`, `ThemeCard`, `ThemePanel`, `ReadyColumn`, `ResultBanner`, `Avatar`, `SoundToggle`;
- `seatStatus`, `isHost`, `cardsOf` de `game/derive`;
- `effectiveRow`, `intentSettled`, `toVisibleIndex` e o tipo `Intent` de `rowLayout`;
- `canPick` de `phoneRowLogic`;
- `PhoneRow`, `PhoneHand`, `ClueSheet`, `usePhoneDrag` e `usePhoneReveal` das tasks anteriores.

Acrescente em `phone.css`:

```css
.p-table { display: flex; flex-direction: column; height: 100dvh; overflow: hidden; }
.p-table .topbar { position: static; }
.p-seats { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; padding: 4px 8px; }
.p-seat { display: flex; flex-direction: column; align-items: center; gap: 2px; font: 500 11px/1 var(--font-ui); }
.p-seat .avatar { width: 30px; height: 30px; }
.p-mid { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.p-mid .theme { position: static; margin: 4px auto; transform: none; }
.p-mid .p-row { flex: 1; min-height: 0; }
.p-foot { border-top: 2px solid var(--ink); background: var(--paper); padding-bottom: env(safe-area-inset-bottom); }
.p-foot .ready-col { padding: 6px 8px; }
.p-host { display: flex; gap: 8px; justify-content: center; padding: 4px 8px; }
```

> Confira no CSS atual (`table.css`) como `.theme`, `.topbar` e `.ready-col` estão posicionados e ajuste os seletores de `.p-table` para que fiquem no fluxo da coluna, sem `position: absolute`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test -w web; npm run typecheck -w web`
Expected: PASS.

- [ ] **Step 5: Conferir no navegador**

Com `npm run dev:server` e `npm run dev:web`:
1. Abra `http://localhost:5173` em tamanho de celular (DevTools, 390×844 com toque).
2. Crie uma sala de DITU, entre e adicione 2 bots ("🤖 adicionar bot").
3. Jogue uma rodada:
   - dica pelo painel;
   - colocar por toque ("aqui") e por arrasto (segurar e arrastar);
   - "tô pronto";
   - revelação.
4. Abra a mesma sala numa janela de computador, com outro jogador, e confira que o arrasto do celular aparece no PC.

Anote no relatório o que ficou estranho.

- [ ] **Step 6: Commit**

```bash
git add -A web
git commit -m "feat(web): mesa do DITU no celular (fila em pé, mão, dica, arrasto, revelação)"
```

---

### Task 9: telas compartilhadas em 360px

**Files:**
- Modify: `web/src/screens/JoinForm.tsx` (se precisar), `web/src/brand/global.css`, `web/src/screens/shelf.css`, `web/src/table/table.css` (lobby, se for de lá)
- Create: `web/test/phone-screens.test.tsx`

Objetivos (spec §1.3):
- **Entrar na sala:** grade de personagens com alvos de 44×44 px ou mais; nome e "entrar" visíveis.
- **Lobby do DITU:** coluna única, botões de modo grandes, sem rolagem lateral.
- **Estante:** duas cartas lado a lado em 360px (cada carta com até ~150px de largura); página do jogo com abas e painéis na largura toda.
- **Nenhuma rolagem lateral em 360px.**

- [ ] **Step 1: Teste (o que dá pra testar no jsdom)**

Crie `web/test/phone-screens.test.tsx`:
- o `JoinForm` renderiza um botão de personagem por cor (sanidade, para não quebrar);
- o `<RotateNotice />` entra na tela da sala: renderize a `RoomScreen` com `matchMedia` casando `LANDSCAPE_PHONE_QUERY` e uma sala de DITU, e confira o `role="alert"` "vira o celular em pé".

O layout visual em si se confere no Step 3.

- [ ] **Step 2: CSS**

Use media queries `@media (max-width: 640px)` nos arquivos de cada tela. Pontos de partida:

```css
/* global.css */
@media (max-width: 640px) {
  .screen { padding: 24px 12px; gap: 14px; }
  .logo.big { font-size: 46px; }
  .panel { width: 100%; }
  .swatches { gap: 10px; }
  .swatch { width: 44px; height: 44px; }
  .modes { flex-direction: column; }
}
/* shelf.css */
@media (max-width: 640px) {
  .shelf { gap: 14px; }
  .cover { width: 150px; height: 200px; }
  .cover b { font-size: 26px; }
}
```

Ajuste aos seletores reais: abra cada tela em 360px no DevTools e corrija o que transbordar.

- [ ] **Step 3: Conferir no navegador**

Em 360×740 e em 390×844, passe por estante → página do DITU → criar sala → entrar → lobby → mesa. Nenhuma tela pode ter rolagem lateral. Confira com:

```js
document.documentElement.scrollWidth <= innerWidth
```

no console de cada tela.

- [ ] **Step 4: Rodar tudo e commit**

Run: `npm test; npm run typecheck; npm run build`
Expected: PASS.

```bash
git add -A web
git commit -m "feat(web): telas de entrada, lobby e estante ajustadas pro celular"
```

---

### Task 10: E2E com um jogador no celular e outro no PC

**Files:**
- Create: `e2e/celular.spec.ts`
- Modify: `e2e/helpers.ts` (helper para contexto de celular)

- [ ] **Step 1: Helper**

Em `e2e/helpers.ts`:

```ts
import { devices } from '@playwright/test';

/** Página num contexto de celular em pé, com toque (Pixel 7). */
export async function newPhonePlayer(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ ...devices['Pixel 7'] });
  contexts.push(context); // mesma lista que newPlayer usa pra fechar no afterEach
  return context.newPage();
}
```

(Use o nome real da lista de contextos do arquivo.)

- [ ] **Step 2: O teste**

Crie `e2e/celular.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { closePlayers, join, newPhonePlayer, newPlayer } from './helpers';

test.afterEach(closePlayers);

test('rodada de DITU com um jogador no celular e outro no PC', async ({ browser }) => {
  const pc = await newPlayer(browser);
  const cel = await newPhonePlayer(browser);
  await pc.goto('/#/ito');
  await pc.getByRole('button', { name: 'criar sala' }).click();
  await expect(pc).toHaveURL(/#\/sala\/[A-Z0-9]{4}$/);
  await join(pc, 'Ana', 0);
  await cel.goto(pc.url());
  await join(cel, 'Bia', 1);

  await expect(pc.getByText('Bia', { exact: true }).first()).toBeVisible();
  await pc.getByRole('button', { name: 'começar' }).click();
  await pc.getByRole('button', { name: 'dar as cartas' }).click();

  // Celular: dica pelo painel, colocar por toque.
  await expect(cel.getByRole('region', { name: 'fila de cartas' }).or(cel.getByLabel('fila de cartas'))).toBeVisible();
  await cel.getByRole('button', { name: '✎ dica' }).tap();
  await cel.getByRole('dialog', { name: 'dica da carta' }).getByRole('textbox').fill('iglu');
  await cel.getByRole('button', { name: 'ok' }).tap();
  await cel.locator('.p-hnum').first().tap();
  await cel.getByRole('button', { name: 'aqui' }).first().tap();

  // PC: coloca a carta dele (helper do arquivo de rodada) e os dois ficam prontos.
  await pc.getByPlaceholder('escreve uma dica…').fill('praia');
  // … arrastar a carta do PC como em `placeMyCard` do helpers.ts
  await cel.getByRole('button', { name: 'tô pronto' }).tap();
  await pc.getByRole('button', { name: 'tô pronto' }).click();

  await expect(pc.getByRole('dialog')).toBeVisible({ timeout: 30_000 });
  await expect(cel.getByRole('dialog')).toBeVisible({ timeout: 30_000 });
  await expect(cel.locator('.p-strip', { hasText: 'iglu' })).toHaveCount(1);
  await expect(pc.locator('.row .rcard', { hasText: 'iglu' })).toHaveCount(1);
});
```

Troque o comentário `// … arrastar a carta do PC` pela chamada real ao `placeMyCard(pc, 'praia')` de `helpers.ts`, que já escreve a dica e arrasta; tire então a linha do `fill` acima dela. Ajuste os seletores ao que a `PhoneTable` realmente renderiza.

- [ ] **Step 3: Rodar**

Espere 1 minuto desde o último E2E.
Run: `npm run e2e`
Expected: os 3 testes antigos + este passam.

- [ ] **Step 4: Commit**

```bash
git add e2e/celular.spec.ts e2e/helpers.ts
git commit -m "test(e2e): rodada de DITU com um jogador no celular e outro no PC"
```

---

### Task 11: docs e fechamento

- [ ] **README:** acrescente uma seção "Celular": o DITU joga no celular em pé, o Diquisti vem na etapa 2 e o Pictures só no computador, com uma linha sobre `useLayout` e o catálogo `mobile`.
- [ ] **`docs/deploy.md` "Primeira noite":** quem estiver no celular pode jogar DITU, segurando o celular em pé.
- [ ] Commit: `docs: celular no README e no roteiro da primeira noite`.
- [ ] **Controlador + usuário:** revisão final, PR, e teste do usuário no próprio celular pelo site no ar antes do merge. Se o usuário preferir, faça o merge primeiro e ele testa em produção, porque o DITU no PC não muda. Merge com o OK do usuário, fora de noite de jogo.

---

## Fora deste plano

Diquisti no celular (etapa 2, plano próprio, combinado com a sessão do Dixit); Pictures no celular; celular deitado além do aviso; tablet.
