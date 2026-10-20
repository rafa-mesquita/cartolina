# Plano C2 — Cúpi: a mesa de verdade (computador e celular) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O Cúpi fica jogável no site, no computador e no celular em pé: criar sala pela estante, lobby, mesa na identidade "cartaz" com a janela de 10 s, dúvidas, bloqueios, perder carta, troca, momentos narrados, sons, fim com placar da noite e "jogar de novo"; bots só em desenvolvimento; E2E com 3 navegadores (um celular).

**Architecture:** Porta do protótipo aprovado (`prototipo/coup/`) pro React, no molde do Retratim/Diquisti em `web/src/games/<id>/`. A mesa lê só a visão do servidor (`CoupRoomView`: `view.game` = `CoupView` com `can`, `window.id`, `targets`, `log`) e manda ações pelo `conn.sendAction` (reações sempre com `windowId`). Partes puras e testadas: textos (frases como dados, não HTML), relógio da janela na hora do servidor, fila de momentos, decisão dos bots. Um só conjunto de componentes; o layout troca com `useLayout()` (`'phone'` até 640 px): no computador, palco 1440×900 escalado (`useStageFit`); no celular, layout fluido em pé com folhas que sobem de baixo.

**Tech Stack:** React 19 + Vite, Vitest + Testing Library, Playwright (E2E), `@tabler/icons-webfont` (já dependência), Web Audio sintetizado.

**Spec:** `docs/superpowers/specs/2026-10-19-cupi-design.md` §5 (telas e identidade), §4.3 (web), §7 (erros), §8 (testes). **Referência de comportamento e visual: o protótipo, aprovado pelo usuário em 2026-10-19** (`prototipo/coup/index.html`, `texts.js`, `bots.js`, `sounds.js`).

---

## Contexto para quem vai executar

- Worktree `C:\Users\rafam\Desktop\Rpositórios Github - claude\Pessoal\Jogos de tabuleiro\.claude\worktrees\cupi`, branch `feat/cupi`. Sem push, sem merge (merge = publicar), nunca `git stash`. No Git Bash o `rtk` não existe; no PowerShell use `npm.cmd`/`npx.cmd`.
- Comandos: `npm test -w web -- <filtro>`, `npm test -w shared`, `npm run typecheck` (raiz), `npm run build -w web`, `npm run e2e`.
- Tudo em português (textos da tela, comentários, testes). Commits `feat(web): …`/`test(e2e): …`, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. `git add` com caminhos explícitos.
- **Modelos de código** (leia antes de cada task de tela): `web/src/games/pictures/PicturesLobby.tsx`, `PicturesTable.tsx`, `useCountdown.ts`, `sounds.ts`, `useButtonSounds.ts`; `web/src/games/dixit/useStageFit.ts`, `useToast.ts`, `DixitTopBar.tsx` (`SoundPill`); `web/src/dev/picturesBots.ts` e `web/test/pictures-*.test.ts(x)`; `web/src/screens/Game.tsx`; `web/src/lib/device.ts` (`useLayout`); E2E `e2e/retratim.spec.ts`, `e2e/celular.spec.ts`, `e2e/helpers.ts` (`newPlayer`, `newPhonePlayer`).
- **Mapa do protótipo** (`prototipo/coup/index.html`): CSS — palco 23, cartas 37, oponentes 61, palco 75, sua área 127, diário 166, celular 197; JS — laço 367, bots 444, tela 473 (`opponents` 491, `stageHTML` 521, `renderMe` 563, `renderPanel` 580, `renderLog` 606, placar 617), relógio 650, momentos 666, sons pelo que mudou 700, cliques 739.
- **Identidade "cartaz de propaganda"** (spec §5.4): `--cream:#efe6d2; --felt:#e4d7bb; --paper:#f7f0e0; --ink:#1d1a17; --ink-soft:#6b6152; --red:#c8312b`; Bebas Neue nos títulos/nomes/declaração, Oswald no resto (fontes já no `web/index.html`); contornos pretos 2 px, cantos 3–6 px; mesa plana. Todo o CSS fica dentro de `.coup` (raiz) em `web/src/games/coup/coup.css`.
- **Nomes reais**: os nomes vêm dos assentos da sala (`view.seats`: `name`, `color`), não da lista fixa do protótipo; quem vê a si mesmo lê "você". Bichinhos com `<Critter color>` (`web/src/screens/Critter.tsx`).
- **Hora do servidor**: `window.endsAt` está na hora do servidor; use `Date.now() + serverOffset` (o `Game.tsx` passa `snap.serverOffset`).
- **Sempre** mande `windowId: view.game.window.id` em `pass`/`challenge`/`block`.
- A visão não tem relógio: depois de `endsAt`, a mesa esconde os botões da janela e mostra "tempo esgotado…" até o servidor fechar.
- Arquivos compartilhados que esta etapa mexe: `web/src/screens/Game.tsx`, `web/src/games/catalog.ts`, `web/src/dev/BotControls.tsx`, `web/test/shelf.test.tsx`. Se houver outra sessão mexendo neles, combine antes.

### Diferenças intencionais em relação ao protótipo

1. Sem painel de dev; bots são conexões de verdade (só em `npm run dev:web`), adicionados no lobby (`BotControls`).
2. "Jogar de novo" só pro anfitrião (`view.hostId === view.you`); os outros veem "esperando o anfitrião…".
3. Quem assiste (entrou no meio) vê a mesa sem a sua área e com "você está assistindo — joga a próxima".
4. Desconectado aparece como "saiu" no assento (`seat.connected === false`); o automático do servidor joga por ele depois de 30 s.

## Mapa de arquivos

Criar em `web/src/games/coup/`:
- `texts.ts` — frases (palco, diário, perder carta) como dados; rótulos das ações.
- `Phrase.tsx` — desenha uma frase (personagem em vermelho).
- `clock.ts` — `windowLeft` puro + `useWindowClock`.
- `moments.ts` — momentos a partir de entradas novas do diário (puro) + `useMoments` (fila de 2,2 s).
- `sounds.ts`, `useCoupSounds.ts`.
- `CoupLobby.tsx`, `CoupTable.tsx`, `TopBar.tsx`, `Seats.tsx`, `Stage.tsx`, `MyArea.tsx`, `Diary.tsx`, `Panels.tsx` (perder carta, troca, fim), `Moment.tsx`, `CardFace.tsx`, `coup.css`.
- Acrescentar a `names.ts` (já existe): `CHARACTER_ICONS`.
- `web/src/dev/coupBots.ts`.
- Testes: `web/test/coup-fixtures.ts`, `coup-texts.test.ts`, `coup-clock.test.ts`, `coup-moments.test.ts`, `coup-lobby.test.tsx`, `coup-table.test.tsx`, `coup-phone.test.tsx`, `coup-bots.test.ts`, `coup-sounds.test.ts`; `e2e/cupi.spec.ts`.

Modificar: `web/src/screens/Game.tsx`, `web/src/games/catalog.ts`, `web/src/dev/BotControls.tsx`, `web/test/catalog.test.ts`, `web/test/shelf.test.tsx`, `README.md`, `CLAUDE.md`.

---

### Task 1: fixtures, textos e frases (puros)

**Files:** Create `web/test/coup-fixtures.ts`, `web/src/games/coup/texts.ts`, `web/src/games/coup/Phrase.tsx`, `web/test/coup-texts.test.ts`; Modify `web/src/games/coup/names.ts`.

- [ ] **Step 1: `coup-fixtures.ts`** — salas de Cúpi de verdade, pelas regras do `shared`:

```ts
import {
  PLAYER_COLORS,
  createRoom,
  isCoupRoomView,
  joinRoom,
  mulberry32,
  roomAction,
  roomView,
  type CoupRoomView,
  type Room,
} from '@cartolina/shared';

export const NAMES = ['Ana', 'Beto', 'Caio', 'Duda', 'Eva', 'Fabi'];
export const T0 = 1_000_000;

/** Sala de Cúpi com `n` pessoas (p0 é o anfitrião), começada com a semente dada. */
export function coupRoom(n: number, seed = 1): Room {
  let room = createRoom('CUPI', 0, 'coup');
  for (let i = 0; i < n; i++) {
    const res = joinRoom(room, { token: `t${i}`, name: NAMES[i]!, color: PLAYER_COLORS[i]! }, `p${i}`, 0);
    if (!res.ok) throw new Error(res.error);
    room = res.room;
  }
  return step(room, 'p0', { type: 'start' }, T0, seed);
}

/** Aplica uma ação pela sala (schema + regras, como o servidor). */
export function step(room: Room, playerId: string, action: unknown, now = T0, seed = 1): Room {
  const res = roomAction(room, playerId, action, mulberry32(seed), now);
  if (!res.ok) throw new Error(`ação recusada: ${res.error}`);
  return res.room;
}

/** Visão da sala pra `playerId` (null = quem assiste). */
export function viewOf(room: Room, playerId: string | null): CoupRoomView {
  const v = roomView(room, playerId);
  if (!isCoupRoomView(v)) throw new Error('não é sala de Cúpi');
  return v;
}

/** Quem é a vez agora. */
export const turnOf = (room: Room): string => viewOf(room, null).game.turn!;
```

- [ ] **Step 2: `names.ts`** — acrescente os ícones (Tabler) dos personagens, como no protótipo:

```ts
/** Ícone de cada personagem (Tabler) até as artes do Flow (Plano C3). */
export const CHARACTER_ICONS: Record<CoupCharacter, string> = {
  duke: 'ti-crown',
  assassin: 'ti-sword',
  captain: 'ti-anchor',
  ambassador: 'ti-world',
  contessa: 'ti-diamond',
};
```

- [ ] **Step 3: testes que falham, `coup-texts.test.ts`** — porta das frases do `prototipo/coup/texts.js`, agora como dados. Uma frase é `Phrase = (string | { char: CoupCharacter })[]`; `nameOf(id)` vem da visão (`'você'` pra quem vê). Casos:
  - `actionLabel('tax')` → `{ name: 'taxar', hint: 'Duque · +3' }` (números de `COUP_GAIN`/`COUP_COST`); as 7 ações.
  - `declaration(game, nameOf)` com janela `action` de taxar de Beto → `['Beto diz: sou ', {char:'duke'}, ' e pega 3']`; de você → `'você diz: sou '…`; ajuda externa → `['Beto pede ajuda externa (+2)']`; extorquir Caio → `… ' e extorque Caio'`; janela `block` → `['Caio bloqueia como ', {char:'captain'}]` + `sub` com a ação bloqueada; janela `blockOnly` → `['Caio pode bloquear o Assassino com a ', {char:'contessa'}]`.
  - `logLine(entry, nameOf)` pra cada `t` do diário (`start`, `act` com e sem personagem/alvo, `challenge` tinha/não tinha, `block`, `blocked` — "sua ação foi bloqueada" quando o ator é você —, `resolved` com `amount` em renda/ajuda/taxar/extorquir e `null` (sem linha) em golpe/assassinato/troca, `lose`, `out`, `win`).
  - `lossTitle(reason)` → "Você levou um golpe" / "Você foi assassinado" / "Você errou a dúvida" / "Pegaram seu blefe".
  - `phraseText(phrase)` → texto corrido (pros `aria-label` e testes).

- [ ] **Step 4: implementar `texts.ts`** (porta fiel do `texts.js`, mesmas frases) e **`Phrase.tsx`**:

```tsx
import type { CoupCharacter } from '@cartolina/shared';
import { CHARACTER_NAMES } from './names';

export type PhrasePart = string | { char: CoupCharacter };
export type Phrase = PhrasePart[];

/** Frase com o personagem destacado (em vermelho, via CSS `.ph-char`). */
export function PhraseView({ phrase }: { phrase: Phrase }) {
  return (
    <>
      {phrase.map((p, i) => (typeof p === 'string' ? p : <b key={i} className="ph-char">{CHARACTER_NAMES[p.char]}</b>))}
    </>
  );
}
```

(`Phrase`/`PhrasePart` podem morar em `texts.ts` e o componente importar de lá.)

- [ ] **Step 5:** `npm test -w web -- coup-texts && npm run typecheck` → PASS. **Commit** `feat(web): Cúpi — textos e frases da mesa`.

---

### Task 2: relógio da janela, momentos e sons (puros + hooks)

**Files:** Create `clock.ts`, `moments.ts`, `sounds.ts`, `useCoupSounds.ts`; Test `coup-clock.test.ts`, `coup-moments.test.ts`, `coup-sounds.test.ts`.

- [ ] **Step 1: `clock.ts`** (teste primeiro):

```ts
/** Milissegundos que faltam na janela (nunca negativo). */
export const windowLeft = (endsAt: number, serverNow: number): number => Math.max(0, endsAt - serverNow);

/**
 * Relógio da janela aberta, na hora do servidor (`Date.now() + serverOffset`), atualizando a cada 100 ms
 * enquanto corre. `null` sem janela. `expired` = o prazo passou (a mesa esconde os botões).
 */
export function useWindowClock(endsAt: number | null, serverOffset: number): { msLeft: number; expired: boolean } | null;
```

Testes (`vi.useFakeTimers()` + `renderHook`): sem janela → `null`; com `endsAt` 10 s à frente → `msLeft` cai e `expired` vira `true` ao passar; `serverOffset` desloca a conta; para de atualizar depois de expirar.

- [ ] **Step 2: `moments.ts`** (teste primeiro) — porta da seção "momentos" do protótipo:

```ts
export type Moment =
  | { kind: 'challenge'; by: string; of: string; claim: CoupCharacter; had: boolean }
  | { kind: 'blocked'; by: string; as: CoupCharacter }
  | { kind: 'out'; player: string };

/** Momentos das entradas novas do diário (de `from` em diante): dúvida, bloqueio que valeu, saída. */
export function momentsFrom(log: readonly CoupLogEntry[], from: number): Moment[];

/**
 * Fila de momentos: cada um fica 2,2 s; o próximo entra em seguida. Zera quando `match` muda ou a partida acaba
 * (`over`). Devolve o momento atual (ou null).
 */
export function useMoments(log: readonly CoupLogEntry[], match: number, over: boolean): Moment | null;
```

Testes: `momentsFrom` ignora `act`/`lose`/`resolved`; pega `challenge`, `blocked` (a entrada já traz `by` e `as`) e `out`; `useMoments` mostra o primeiro, troca depois de 2,2 s, some no fim; nova partida limpa; `over` limpa.

- [ ] **Step 3: `sounds.ts`** — porta de `prototipo/coup/sounds.js` no molde de `web/src/games/pictures/sounds.ts` (`loadSoundPref`, `AudioContext` só depois de gesto, ganho geral 0,28): `turn`, `declare`, `tick`, `challenge`, `reveal`, `bluff`, `lose`, `coin`, `win`, `end`, `error`, `click`. `export function playCoupSound(name: CoupSound)`. Teste no molde de `pictures-sounds.test.tsx`: som desligado não cria `AudioContext`; todo nome toca sem lançar (mock).

- [ ] **Step 4: `useCoupSounds(view, clock)`** — porta da seção "sons pelo que mudou": compara com a visão anterior (refs) e toca, com 260 ms entre sons juntos: `declare` (entrada `act` nova de outro), `challenge` + `reveal`/`bluff` (dúvida), `lose` (você perdeu carta), `coin` (suas moedas subiram), `turn` (a vez passou a ser sua), `win` (você venceu) / `end` (outro venceu); `tick` uma vez por segundo nos 3 últimos segundos da janela **só se** `can.pass`. Nada toca na primeira visão (montagem da mesa). Sem teste de tela além do que a Task 4 cobre.

- [ ] **Step 5:** `npm test -w web -- coup-clock coup-moments coup-sounds && npm run typecheck` → PASS. **Commit** `feat(web): Cúpi — relógio da janela, momentos e sons`.

---

### Task 3: catálogo jogável, rota, lobby e mesa mínima

**Files:** Create `CoupLobby.tsx`, `CoupTable.tsx` (mínima), `coup.css` (início); Modify `web/src/screens/Game.tsx`, `web/src/games/catalog.ts`, `web/test/catalog.test.ts`, `web/test/shelf.test.tsx`; Test `web/test/coup-lobby.test.tsx`.

- [ ] **Step 1: testes que falham** — `coup-lobby.test.tsx` (molde `pictures-lobby.test.tsx`): anfitrião com 2+ conectados clica "começar" → `sendAction({type:'start'})`; sozinho, "começar" mostra "precisa de pelo menos 2 pessoas" e não manda; quem não é anfitrião vê "esperando o anfitrião começar…"; mostra o código da sala e "copiar link da sala"; com 6 na sala, "a mesa está cheia (6)". Catálogo: Cúpi `playable: true`, `mobile: true`; estante sem nenhum selo "em breve" (`queryByText('em breve')` nulo) e com o link `#/coup`.
- [ ] **Step 2: `CoupLobby`** no molde do `PicturesLobby` (bichinhos + nomes, "(você)", "· anfitrião", link da sala, `SoundPill`, "começar", "voltar pro início", `BotControls` só em DEV com `game="coup"` — a entrada no `BotControls` vem na Task 6; até lá ele ignora o jogo), na identidade cartaz: "CÚPI" em Bebas Neue 64 px com a faixa vermelha no alto, papel creme, "como jogar" curto (as 4 linhas do catálogo). No celular (≤ 640 px) a mesma coluna, botões ≥ 44 px.
- [ ] **Step 3: rota** em `Game.tsx`, como o Retratim, com chunk à parte:

```tsx
const CoupLobby = lazy(() => import('../games/coup/CoupLobby').then((m) => ({ default: m.CoupLobby })));
const CoupTable = lazy(() => import('../games/coup/CoupTable').then((m) => ({ default: m.CoupTable })));
// …
  if (isCoupRoomView(view)) {
    // Sala de Cúpi (id interno `coup`): mesa com os próprios avisos; serve computador e celular.
    return (
      <>
        {reconnecting}
        <Suspense fallback={null}>
          {view.game.phase === 'lobby' ? <CoupLobby view={view} conn={conn} /> : <CoupTable view={view} conn={conn} serverOffset={snap.serverOffset} />}
        </Suspense>
      </>
    );
  }
```

`CoupTable` mínima por enquanto ("mesa em construção" + a fase).

- [ ] **Step 4: catálogo** — `playable: true`, `mobile: true` (tire o comentário do C2).
- [ ] **Step 5:** `npm test -w web && npm run typecheck` → PASS. **Commit** `feat(web): Cúpi — lobby, rota e estante jogável`.

---

### Task 4: a mesa do computador

**Files:** Create `CoupTable.tsx` (completa), `TopBar.tsx`, `Seats.tsx`, `Stage.tsx`, `MyArea.tsx`, `Diary.tsx`, `Panels.tsx`, `Moment.tsx`, `CardFace.tsx`, `coup.css`; Test `web/test/coup-table.test.tsx`.

Porta das seções "tela", "momentos" e "cliques" do protótipo, com o mesmo visual. Requisitos:

1. **`CoupTable`**: raiz `<div className="coup" data-button-sounds>`; no computador, palco 1440×900 com `useStageFit` (Diquisti); toast do palco (`useToast`) ligado a `conn.onError` (ignora `JOIN_ERRORS`; toca `error`); `useWindowClock(game.window?.endsAt ?? null, serverOffset)`; `useMoments`; `useCoupSounds`; estado local só da interface: modo "escolher alvo" (`aiming: CoupActionKind | null`), carta escolhida pra perder, cartas marcadas na troca. Tudo que é jogo vem de `view.game` (`CoupView`).
2. **`TopBar`**: faixa vermelha fina, "CÚPI" (Bebas 44 px), placar da noite ("placar da noite: Beto 2 · você 1", só quem tem `wins`, nomes dos assentos; quem saiu da sala aparece pelo nome guardado no assento), `SoundPill`.
3. **`Seats`** (oponentes em linha, a partir de quem vem depois de você): nome, `<Critter>`, 2 cartinhas (`CardFace` verso vermelho com estrela; perdida = ícone riscado, nome no `title`), moedas `ti-coin`; da vez = contorno vermelho; fora = 45% + "fora"; desconectado = "saiu". **Escolhendo alvo**: assentos de `can.targets` viram botões (`aria-label="mirar em Beto"`), pulsando; clique manda `{type:'act', kind: aiming, target}`; Esc ou "cancelar" sai do modo.
4. **`Stage`** (feltro, contorno 2 px): "tesouro N" e "baralho N" nos cantos; fora de janela "vez de Beto"/"**sua vez**"; na janela: `declaration` (Bebas 34 px) + `sub`, barra (largura = `msLeft / COUP_WINDOW_MS`) com os segundos, botões grandes de `can` (`duvidar`, `bloquear como X` pra cada `can.block`, `deixa`; todos com `windowId`), linha "Ana deixou · faltam você e Caio" (de `passed`/`eligible`, "você" pra quem vê); sem botões pra você: "esperando os outros…"; `expired`: "tempo esgotado…" no lugar dos botões; outro escolhendo carta/trocando: "Caio está escolhendo a carta que perde…"/"Duda está trocando cartas…"; você escolhendo alvo: "escolha o alvo lá em cima · cancelar".
5. **`Moment`** sobre o palco (dúvida com a carta virando "Beto tinha o Duque" / carimbo "BLEFE"; "bloqueado!" com a carta; "Caio está fora"). Se `can.pass` (você pode reagir), vira faixa compacta no alto do palco que não bloqueia cliques.
6. **`MyArea`**: suas cartas viradas pra baixo (`CardFace` grande 120×168, ícone vermelho + nome), perdidas menores riscadas (de `seats[eu].revealed`), "você · N moedas", as 7 ações (rótulo + dica de `actionLabel`; fora de `can.act` apagadas e `disabled`; "você tem" quando `COUP_CLAIM[k]` está em `myCards`). Ação com alvo → modo alvo; sem alvo → manda direto. Quem assiste: "você está assistindo — joga a próxima" no lugar da área.
7. **`Diary`** (coluna 260 px): "diário", `logLine` de cada entrada (pula `null`), mais nova embaixo, rola sozinho, última destacada.
8. **`Panels`** sobre a sua área: perder carta (`can.lose`: `lossTitle(loss.reason)` + "Escolha a carta que vai revelar" + cartas clicáveis + "revelar X" → `{type:'lose', card}`); troca (`can.keep`: "Fique com N das M cartas", `myCards` + `myDrawn` marcadas "nova", "ficar com essas" habilitado só com N marcadas → `{type:'exchange', keep}`); fim (`phase === 'over'`: "Beto tomou o poder" Bebas 44 px vermelho, "ficou com …" (`winnerCards`), "saíram: Caio → Ana", placar da noite em destaque, "jogar de novo" → `{type:'restart'}` só pro anfitrião, senão "esperando o anfitrião…").

**Testes** (`coup-table.test.tsx`, molde `pictures-table.test.tsx`; mocke `./sounds`; use as fixtures da Task 1 e um `conn` falso com `sendAction: vi.fn()` e `onError` que guarda o callback):
- na sua vez aparecem as ações de `can.act` habilitadas; "renda" manda `{type:'act', kind:'income'}`;
- "extorquir" entra no modo alvo; clicar no assento de Beto manda `{type:'act', kind:'steal', target:'p1'}`; Esc cancela sem mandar;
- numa janela de taxar de outro, aparecem "duvidar"/"deixa"; "deixa" manda `{type:'pass', windowId: <id da janela>}`; o alvo de uma extorsão vê "bloquear como Capitão" e "bloquear como Embaixador";
- com o relógio passado do `endsAt` (fake timers + `serverOffset`), os botões somem e aparece "tempo esgotado…";
- perdendo carta: painel com o título certo; escolher e "revelar" manda `{type:'lose', card}`;
- troca: "ficar com essas" só habilita com o número certo; manda `{type:'exchange', keep}`;
- fim: anfitrião vê "jogar de novo" (manda `restart`), outro vê "esperando o anfitrião…";
- erro do servidor (`onError('window_closed', 'Essa janela já fechou.')`) vira toast;
- quem assiste vê "você está assistindo".

- [ ] **Step 1:** testes que falham. **Step 2:** componentes + CSS (porta). **Step 3:** `npm test -w web && npm run typecheck && npm run build -w web` → PASS. **Commit** `feat(web): Cúpi — mesa do computador`.

---

### Task 5: celular em pé

**Files:** Modify `CoupTable.tsx`, componentes da mesa, `coup.css`; Test `web/test/coup-phone.test.tsx`.

Porta da seção "celular" do protótipo, com os mesmos componentes: com `useLayout() === 'phone'`, a raiz ganha `coup--phone`, sem palco fixo (`100dvh`, sem rolagem), nesta ordem: topo fino (CÚPI, placar resumido "você N · líder M", som); oponentes em grade de até 5 colunas (cartinhas 16×22); faixa com a última linha do diário (toque abre o diário inteiro numa folha que sobe de baixo, com "fechar" e fundo escurecido); palco ocupando o resto (declaração 24 px, barra, botões de reação ≥ 52 px lado a lado); sua mão (64×90) + moedas; ações em grade 4 × 2 (≥ 44 px, sem a dica). Painéis de perder carta, troca e fim viram folhas de baixo. O aviso de celular deitado já existe (`RotateNotice`). Hover só em `(hover: hover)`.

**Testes** (molde `phone-table.test.tsx`: mock de `matchMedia` pra `(max-width: 640px)`): a raiz tem `coup--phone`; a faixa do diário mostra a última linha e abre/fecha a folha; os botões de reação e as ações existem e mandam as mesmas ações do computador; o painel de perder carta aparece como folha.

- [ ] Testes que falham → implementar → `npm test -w web && npm run typecheck` → PASS. **Commit** `feat(web): Cúpi — celular em pé`.

---

### Task 6: bots de desenvolvimento

**Files:** Create `web/src/dev/coupBots.ts`; Modify `web/src/dev/BotControls.tsx`, `CoupLobby.tsx`; Test `web/test/coup-bots.test.ts`.

- [ ] Molde: `web/src/dev/picturesBots.ts` + `web/test/pictures-bots.test.ts`. Função pura, porta de `prototipo/coup/bots.js`:

```ts
/** O que o bot faz agora (ou null). `key` identifica a etapa, pra não agir duas vezes nela. */
export function decideCoup(view: CoupRoomView, rng: () => number): { key: string; delay: number; actions: GameAction[] } | null;
```

  - `key = ${match}:${log.length}:${window?.id ?? '-'}`;
  - perder carta (`can.lose`): revela a carta de que tem mais cópias; delay 0,9–2 s;
  - troca (`can.keep`): fica com as melhores (`duke, captain, assassin, contessa, ambassador`); delay 0,9–2 s;
  - na vez (`can.act`): golpe obrigatório no alvo com mais cartas; com 7+ e golpe disponível, golpe em 70%; senão sorteia com peso 3 pras honestas e 0,6 pros blefes; alvo entre `can.targets` (mais moedas pra extorquir, mais cartas pros outros); delay 1,2–3 s;
  - janela (`can.pass`): sempre com `windowId`; bloqueia com 100% se tem a carta, blefa o bloqueio com 25% (alvo) ou 10% (ajuda externa); duvida com 15% (×3 com 2 cópias do declarado; ×2 se é o alvo e perderia a última carta); senão "deixa"; 15% das vezes não responde (deixa o tempo correr); delay 1,5–7 s;
  - nunca `start`/`restart`.
- [ ] A classe do bot (conexão própria, nomes `BOT_NAMES`, "Bot …" pra não gravar histórico) no molde do `PicturesBot`; ao disparar, recalcula `decideCoup` com a visão **atual** (a janela pode ter mudado) antes de mandar.
- [ ] `BotControls`: entrada `coup` no `API` e no tipo `GameKey`; `CoupLobby` passa `game="coup"`.
- [ ] Testes de `decideCoup` (cada ramo; sempre `windowId` nas reações; nunca ação de anfitrião; `null` quando não há nada). **Commit** `feat(web): Cúpi — bots de desenvolvimento`.

---

### Task 7: E2E e conferência final

**Files:** Create `e2e/cupi.spec.ts`; Modify `README.md`, `CLAUDE.md`, `docs/superpowers/specs/2026-10-19-cupi-design.md` (§9: C2 feito).

- [ ] **Step 1: `e2e/cupi.spec.ts`** (molde `e2e/retratim.spec.ts` + `e2e/celular.spec.ts`): 3 jogadores (a e b no computador com `newPlayer`, c no celular com `newPhonePlayer`); a cria a sala pelo link "Cúpi" da estante, todos entram, o anfitrião começa.
  1. Quem tem "sua vez" (descubra olhando as três páginas) clica "renda": as três telas mostram as moedas dele subindo 1 e a vez passando.
  2. Quem tem a vez agora clica "taxar": os outros dois veem a janela com "duvidar" e "deixa"; os dois clicam "deixa" → as três telas mostram +3 e o diário "… pegou 3".
  3. Quem tem a vez clica "extorquir" e mira no próximo jogador; o alvo clica "bloquear como Capitão"; os outros dois clicam "deixa" na janela do bloqueio → o diário mostra "… foi bloqueada" e as moedas não mudam.
  Use as frases e rótulos da tela (`getByRole('button', { name: … })`), com tempo de espera folgado (a janela é de 10 s).
- [ ] **Step 2:** `npm run typecheck && npm test && npm run build && npm run e2e` → tudo PASS (inclusive os E2E dos outros jogos e "build de produção não tem bots").
- [ ] **Step 3: conferência no navegador** (controlador): subir servidor e site locais (portas livres, `VITE_SERVER_URL`), jogar uma partida com bots no computador (1280×800) e outra no celular (preset mobile), comparar com o protótipo (visual, ritmo, momentos, sons).
- [ ] **Step 4: docs** — README e CLAUDE.md: Cúpi jogável no computador e no celular (tabela de jogos do CLAUDE.md e a seção "Celular" do README: "O **Cúpi** joga no celular em pé desde o começo"); spec §9 item 3 marcado como feito. **Commits** `test(e2e): Cúpi com três navegadores (um celular)` e `docs: Cúpi jogável`.

Não abra PR nem faça merge: publicar é decisão do usuário. Lembrete pra ele: com o C2 no `main`, o Cúpi fica jogável em produção com ícones no lugar das artes até o C3 (artes no Flow).
