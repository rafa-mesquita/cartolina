# Plano C3 — Cama-Leão: mesa no site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O Cama-Leão fica jogável no site: lobby, mesa com arrasto e clique, a virada animada com letreiro e sons, placar do fim e "jogar de novo", ligados ao servidor, com bots de desenvolvimento e um E2E de 2 navegadores — portando o protótipo aprovado (`prototipo/cama-leao/`) pra React.

**Architecture:** Tudo do jogo em `web/src/games/camelio/`, no padrão do Retratim (`web/src/games/pictures/`): palco fixo 1440×900 escalado (`useStageFit` do Diquisti), CSS escopado em `.camelio` com prefixo `cl-`, toast próprio, sons próprios, lobby e mesa carregados com `lazy`. As peças puras do protótipo viram módulos TS testados (`cardArt`, `narrate`, `sounds`, `playback`, escolha do bot); a **virada continua imperativa** (`anim.ts`, porta do `anim.js`, escopada na raiz do palco) e o React só segura a mesa parada enquanto ela roda. A diferença grande pro protótipo é a rede: as jogadas chegam pelo servidor, possivelmente enquanto a sua tela ainda anima a anterior, então uma **fila de animação pura** (`playback.ts`) decide o que animar e quando pular.

**Tech Stack:** React 19, TypeScript 5.9, Vite, Vitest 4 + Testing Library (jsdom), Web Animations API, Web Audio, Playwright (E2E).

**Spec:** `docs/superpowers/specs/2026-10-19-cama-leao-design.md` §5 (mesa), §2.5 (presença), §2.7 (erros). **Referência de comportamento e visual: o protótipo aprovado pelo Rafa em 2026-10-19** (`prototipo/cama-leao/`; seção "Atualização depois do teste" do plano C2 `docs/superpowers/plans/2026-10-19-plano-c2-cama-leao-prototipo.md`). Onde este plano e o protótipo divergirem em comportamento, vale o protótipo, exceto nas "Diferenças em relação ao protótipo".

---

## Contexto para quem vai executar

- Worktree `C:\Users\rafam\Desktop\Rpositórios Github - claude\Pessoal\Jogos de tabuleiro\.claude\worktrees\camelio`, branch `feat/camelio`. Caminhos absolutos; nunca mexa na pasta mãe nem troque branch; nunca `git stash`. Sem push nem merge (decisão do Rafa). Bash (Git Bash); `rtk` não existe; prefira Write/Edit pra arquivos.
- **Portas:** outras sessões usam 5173, 5176–5179 (5178 = protótipo do Tatubum, 5179 = do Cama-Leão), 5183, 8787, 8797 e a faixa 5190–5199. Pra testes manuais use **servidor 8794** (`npx wrangler dev --port 8794 --inspector-port 9294`, dentro de `server/`) e **site 5182** (`npx vite --port 5182 --strictPort`, dentro de `web/`, com `web/.env.development.local` contendo `VITE_SERVER_URL=http://127.0.0.1:8794` — **não commitar** esse arquivo). Derrube só os seus processos.
- Monorepo: `npm test -w shared|server|web -- <filtro>`, `npm run typecheck`, `npm run build -w web`, `npm run e2e`.
- Tudo em português. Commits `feat(web): …`, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; `git add` com caminhos explícitos. `tsconfig` com `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`.
- **Modelo de código:** o Retratim no `web/`. Leia antes das tasks de tela: `web/src/games/pictures/PicturesLobby.tsx`, `PicturesTable.tsx`, `sounds.ts`, `useButtonSounds.ts`, `web/src/dev/picturesBots.ts`, `web/src/dev/BotControls.tsx`, `web/test/pictures-*.test.ts(x)` (fixtures com regras reais, `GameConn` falso), `e2e/retratim.spec.ts`, `e2e/helpers.ts`. Utilidades reaproveitadas do Diquisti: `useStageFit` (`web/src/games/dixit/useStageFit.ts`), `useToast` (`useToast.ts`), `namer`/`colorer` (`status.ts`), `SoundPill` (`DixitTopBar.tsx`).
- **Conexão:** `GameConn` (`web/src/net/connection.ts:61`): `sendAction(action)`, `onError((code, message) => …)` (ignore `JOIN_ERRORS`), `sendCursor`, `onFx`. O cursor ao vivo está ligado pro Cama-Leão (`liveCursors: true`), mas **não é obrigatório** nesta versão.
- **Modelo de comportamento:** o protótipo. Seções do `prototipo/cama-leao/index.html` (linhas aproximadas): CSS do palco 24, topo 30, personagens/bandeirinhas 66, assentos 74, picadeiro 110, arrasto 134, letreiro 147, sua mesa 159, fim 180; JS: laço `changed()` 338, `clearTable`/`playAgain`/`newGame` 394–420, `stacksHTML`/`seatFit` 439–472, `renderSeats` 482, `renderRing` 496, `renderMine` 514, letreiro (`setBanner`, `hold`, `hint`) 533–570, fim (`renderEnd`, `placeEnd`) 585–650, clique 660–702, arrasto 704+. Peças: `cards.js`/`cards.css`, `narrate.js`, `bot.js`, `anim.js`, `sounds.js`.
- Identidade circo: `--cream:#f7efe0; --canvas:#f3dcd2; --red:#c8372d; --red-dark:#9e2a22; --navy:#1f2a4a; --navy-soft:#5a6382; --gold:#e8b23a; --line:#e2c9b8`. **Rye** no logo e no título do cartaz do fim; **Fredoka** no resto (as duas já estão no `web/index.html`). Esferas: verde `#4caf50`, amarelo `#f2c230`, laranja `#f08a24`, vermelho `#e04848`, roxo `#8e5cc7`, azul `#3a8fd8`.
- Só computador: o catálogo já tem `mobile: false` e a sala mostra o aviso de celular.
- `Game.tsx` e `catalog.ts` estão na lista de arquivos compartilhados do `CLAUDE.md` (Tatubum e Cúpi também mexem neles): **só acrescente**, sem reordenar nem reformatar.

### Diferenças em relação ao protótipo (intencionais)

1. **Sem painel de dev.** Bots são conexões de verdade, só em desenvolvimento, adicionados no lobby (`BotControls`).
2. **Jogadores reais:** nomes e personagens vêm de `view.seats` (`namer`/`colorer`); "você" é `view.you`. Espectador (`view.you` fora de `players`) vê a mesa sem poder jogar e com a sua mesa embaixo substituída por "você está assistindo esta partida".
3. **Quem pode receber carta:** jogador da partida com o assento **conectado** (`seat.connected`). Desconectado aparece apagado com "caiu" (o servidor ainda aceita durante a tolerância de 30 s, mas a tela é mais rígida).
4. **Rede:** a jogada só vale quando volta do servidor. Ao soltar, o clone fica parado onde caiu até a view nova chegar (aí a virada nasce dali) ou até vir um erro / passar 4 s (aí volta voando).
5. **Fila de animação** (`playback.ts`): jogadas seguidas animam uma depois da outra; se a tela ficar mais de 2 jogadas atrás, ou mudar a partida, pula direto pro estado atual sem animar.
6. **Fim:** "jogar de novo" e "voltar pro lobby" só pro host; os outros veem "esperando o host…". "nova mesa" do protótipo não existe.
7. **Placar do fim** usa a ordem do `shared` (`camelioStandings`, Task 1), não uma conta da tela.

## Mapa de arquivos

Criar em `web/src/games/camelio/`:
- `cardArt.ts` (HTML de frente/verso, `HEX`), `Card.tsx` (`CardFront`/`CardBack` com o mesmo HTML), `camelio.css` (palco, cartas, mesa, letreiro, fim).
- `narrate.ts`, `sounds.ts`, `useButtonSounds.ts`, `playback.ts`, `usePlayback.ts`, `anim.ts`, `layout.ts` (`seatFit`, `stackLayout`, posições do arco), `useDragPlay.ts`.
- `CamelioLobby.tsx`, `CamelioTable.tsx`, `TopBar.tsx`, `Seat.tsx` (cabeçalho + pilhas, usado nos assentos e na sua mesa), `Ring.tsx`, `Banner.tsx`, `EndCard.tsx`.
- `web/src/dev/camelioBots.ts`.
- Testes: `web/test/camelio-fixtures.ts`, `camelio-art.test.tsx`, `camelio-narrate.test.ts`, `camelio-sounds.test.tsx`, `camelio-playback.test.ts`, `camelio-anim.test.ts`, `camelio-table.test.tsx`, `camelio-lobby.test.tsx`, `camelio-bots.test.ts`; `e2e/cama-leao.spec.ts`.

Modificar: `shared/src/games/camelio/scoring.ts`, `shared/src/index.ts`, `shared/test/camelio-scoring.test.ts` (Task 1); `web/src/screens/Game.tsx`, `web/src/games/catalog.ts`, `web/test/catalog.test.ts`, `web/test/shelf.test.tsx` (Task 10); `web/src/dev/BotControls.tsx`, `web/test/bot-controls.test.tsx` (Task 11); `README.md`, `CLAUDE.md` (Task 12).

---

### Task 1: placar do fim no `shared` (`camelioStandings`)

**Files:** Modify `shared/src/games/camelio/scoring.ts`, `shared/src/index.ts`; Test `shared/test/camelio-scoring.test.ts`.

- [ ] **Step 1: testes que falham** — acrescente ao fim de `shared/test/camelio-scoring.test.ts` (importe `camelioStandings` junto dos outros):

```ts
describe('placar do fim', () => {
  const players = ['p0', 'p1', 'p2', 'p3'];

  it('ordena por pontos, depois por esferas em jogo; empate divide a posição', () => {
    const scored = { p0: [C.vermelho3, C.vermelho2], p1: [], p2: [C.azul2, C.azul3], p3: [] };
    const table = { p0: [C.verde1], p1: [C.verde3], p2: [C.verde1], p3: [] };
    expect(camelioStandings(players, table, scored)).toEqual([
      { player: 'p0', points: 1, spheres: 1, place: 1 },
      { player: 'p2', points: 1, spheres: 1, place: 1 },
      { player: 'p1', points: 0, spheres: 3, place: 3 },
      { player: 'p3', points: 0, spheres: 0, place: 4 },
    ]);
  });

  it('esferas de cor já pontuada não contam', () => {
    const rows = camelioStandings(['p0'], { p0: [C.vermelho2b] }, { p0: [C.vermelho3, C.vermelho2] });
    expect(rows[0]).toMatchObject({ points: 1, spheres: 0 });
  });

  it('os primeiros são os mesmos vencedores do fim pelo monte', () => {
    const scored = { p0: [], p1: [C.azul2, C.azul3], p2: [C.vermelho3, C.vermelho2], p3: [] };
    const table = { p0: [C.verde3], p1: [C.amarelo3], p2: [C.amarelo2], p3: [] };
    const first = camelioStandings(players, table, scored).filter((r) => r.place === 1).map((r) => r.player);
    expect(first).toEqual(camelioDeckEndWinners(players, table, scored));
  });
});
```

- [ ] **Step 2:** `npm test -w shared -- camelio-scoring` → FAIL (`camelioStandings` não existe).
- [ ] **Step 3: implementar** — no fim de `scoring.ts`:

```ts
export interface CamelioStanding {
  player: string;
  points: number;
  /** Esferas na área de jogo, sem as cores já pontuadas. */
  spheres: number;
  /** 1 = primeiro; empatados (pontos e esferas) dividem a posição. */
  place: number;
}

/** Placar do fim (spec §2.4): mais pontos, depois mais esferas em jogo; a ordem dos assentos desempata só a exibição. */
export function camelioStandings(
  players: readonly string[],
  table: Readonly<Record<string, readonly number[]>>,
  scored: Readonly<Record<string, readonly number[]>>,
): CamelioStanding[] {
  const rows = players.map((player) => {
    const s = scored[player] ?? [];
    return { player, points: camelioPoints(s), spheres: camelioSpheresInPlay(table[player] ?? [], s), place: 0 };
  });
  rows.sort((a, b) => b.points - a.points || b.spheres - a.spheres);
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    r.place = prev && prev.points === r.points && prev.spheres === r.spheres ? prev.place : i + 1;
  });
  return rows;
}
```

(`Array.prototype.sort` é estável, então empatados mantêm a ordem dos assentos.) Exporte `camelioStandings` e `type CamelioStanding` no bloco do scoring em `shared/src/index.ts`.
- [ ] **Step 4:** `npm test -w shared -- camelio` e `npm run typecheck -w shared` → PASS.
- [ ] **Step 5: commit** `feat(shared): placar do fim do Cama-Leão (camelioStandings)`.

---

### Task 2: cartas no site (`cardArt.ts`, `Card.tsx`, CSS das cartas)

**Files:** Create `web/src/games/camelio/cardArt.ts`, `Card.tsx`, `camelio.css` (só a parte das cartas por enquanto); Test `web/test/camelio-art.test.tsx`.

- `cardArt.ts`: porta de `prototipo/cama-leao/cards.js` em TS: `export const HEX: Record<CamelioColor, string>`, `export function frontHtml(card: CamelioCard, w = 64): string`, `export function backHtml(back: CamelioBack, w = 64): string`, com o **mesmo** HTML, classes e `title`/`aria-label` do protótipo (o `anim.ts` usa as strings).
- `Card.tsx`: `CardFront({ card, w })` e `CardBack({ back, w })` produzindo em JSX **exatamente** a mesma marcação (mesmas classes, atributos `data-id`, `style` com `--w`, `--c`, `--a`, `--b`).
- `camelio.css`: copie `prototipo/cama-leao/cards.css` escopado em `.camelio` (todas as regras começam com `.camelio .card…`).

- [ ] **Step 1: testes que falham** em `web/test/camelio-art.test.tsx`:
  - para **todas** as 72 cartas de `CAMELIO_DECK` em `w` 46 e 64: `renderToStaticMarkup(<CardFront card={c} w={w} />)` é igual a `frontHtml(c, w)` (normalize espaços e a ordem das propriedades do `style` com um helper que parseia `style` e compara o conjunto);
  - para um verso de cada tipo (`camelioBack` de uma normal, uma bicolor, uma multi): `CardBack` == `backHtml`;
  - `frontHtml` de uma bicolor tem `aria-label` "3 esferas vermelho (bicolor)" (id 47) e `backHtml` dela "3 esferas, laranja ou vermelho".
- [ ] **Step 2:** `npm test -w web -- camelio-art` → FAIL.
- [ ] **Step 3:** implementar os três arquivos.
- [ ] **Step 4:** PASS + `npm run typecheck`.
- [ ] **Step 5: commit** `feat(web): cartas do Cama-Leão no site`.

---

### Task 3: narração e sons

**Files:** Create `web/src/games/camelio/narrate.ts`, `sounds.ts`, `useButtonSounds.ts`; Test `web/test/camelio-narrate.test.ts`, `web/test/camelio-sounds.test.tsx`.

- `narrate.ts`: porta de `prototipo/cama-leao/narrate.js`: `export function narrate(last: CamelioPlay | null, nameOf: (id: string) => string): string`. No site, `nameOf` dá "você" pra `view.you` e o nome do assento pros outros.
- `sounds.ts`: mesma estrutura de `web/src/games/pictures/sounds.ts` (`MASTER_VOLUME = 0.35`, `installAudioUnlock`, respeita `loadSoundPref()`, `reset…` só pra teste), com `export type CamelioSound = 'pick' | 'flip' | 'drop' | 'scored' | 'bust' | 'lost' | 'turn' | 'error' | 'win' | 'lose' | 'click'`, `playCamelioSound(name)`, `resetCamelioSounds()`. O `SYNTH` é o de `prototipo/cama-leao/sounds.js` (aprovado pelo Rafa), mais `click` copiado do Retratim.
- `useButtonSounds.ts`: igual ao `usePicturesSounds`, tocando `click`.

- [ ] **Step 1: testes que falham:**
  - `camelio-narrate.test.ts`: as 5 frases exatas do `prototipo/cama-leao/sim.cjs` (bust de outro, scored do monte, none pra Nina, lost do monte pra você, `narrate(null) === ''`) e "Léo ficou com um 4 vermelho: estourou!" (id 23).
  - `camelio-sounds.test.tsx`: no modelo de `web/test/pictures-sounds.test.tsx` (`fakeAudio()`), cada nome de `CamelioSound` toca sem erro depois do gesto; nada toca antes do gesto; nada toca com o som desligado (`saveSoundPref(false)`).
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS + typecheck.
- [ ] **Step 5: commit** `feat(web): narração e sons do Cama-Leão`.

---

### Task 4: fila de animação (`playback.ts`, `usePlayback.ts`)

**Files:** Create `web/src/games/camelio/playback.ts`, `usePlayback.ts`; Test `web/test/camelio-playback.test.ts`; Create `web/test/camelio-fixtures.ts`.

- [ ] **Step 1: fixtures** em `web/test/camelio-fixtures.ts`, no modelo de `pictures-fixtures.ts` (regras reais, sem objeto à mão): `camelioRoom(n)`, `play(room, id, action)`, `camelioView(room, viewer)` (usa `isCamelioRoomView`), `started(n = 2)`, `playTurn(room)` (quem tem a vez pega a aberta e fica com ela: `{ type: 'play', from: 'open', to: turn }`) e `patchGame(room, patch: Partial<CamelioState>)` (devolve a sala com `game: { ...room.game, ...patch }` — pra montar fim de partida, mesas e áreas de pontos sem jogar até lá; use ids do baralho como na tabela do plano C1, ex. 22 = vermelho 3, 20 = vermelho 2, 32/34 = azul 2/3, 8/10 = amarelo 2/3).

- [ ] **Step 2: testes que falham** em `web/test/camelio-playback.test.ts` (usando as fixtures pra gerar views v0, v1, v2, v3 de jogadas seguidas):
  - primeira view: `shown = v0`, nada pra animar;
  - `receive(v1)` com `v0` mostrado: `step()` dá `{ prev: v0, next: v1 }` e `animating = true`; `shown` continua `v0`;
  - durante a animação chega `v2`: entra na fila; `finish()` → `shown = v1` e já anima `v1 → v2`;
  - view sem jogada nova (mesmo `playCount`, ex.: alguém caiu) durante a animação **substitui** o fim da fila (não anima nada a mais);
  - sem animação, view sem jogada nova troca `shown` direto;
  - mais de `MAX_BEHIND = 2` jogadas atrasadas: a fila vira só a última e ela entra **sem** animar;
  - `match` diferente: entra sem animar (partida nova);
  - `playCount` pulando (ex.: reconectou): entra sem animar.

- [ ] **Step 3: implementar** `playback.ts` (puro, sem React):

```ts
import type { CamelioView } from '@cartolina/shared';

/** Quantas jogadas a tela pode ficar atrás antes de pular direto (sem animar). */
export const MAX_BEHIND = 2;

export interface Playback {
  /** O que está desenhado. Durante a animação, a view de antes da jogada. */
  shown: CamelioView | null;
  /** Views que chegaram e ainda não foram desenhadas, em ordem. */
  queue: CamelioView[];
  /** Animação em curso: shown → queue[0]. */
  animating: boolean;
}

export const emptyPlayback: Playback = { shown: null, queue: [], animating: false };

/** `next` é a jogada seguinte de `prev` (mesma partida, uma jogada a mais, com `last`). */
export function isNextPlay(prev: CamelioView, next: CamelioView): boolean {
  return next.match === prev.match && next.playCount === prev.playCount + 1 && next.last !== null;
}

/** Chegou uma view do servidor. */
export function receive(p: Playback, v: CamelioView): Playback {
  if (!p.shown) return { shown: v, queue: [], animating: false };
  const tail = p.queue[p.queue.length - 1] ?? p.shown;
  const sameStep = v.match === tail.match && v.playCount === tail.playCount;
  if (sameStep) {
    if (p.queue.length === 0) return p.animating ? { ...p, queue: [v] } : { ...p, shown: v };
    return { ...p, queue: [...p.queue.slice(0, -1), v] };
  }
  const queue = [...p.queue, v];
  return queue.length > MAX_BEHIND ? { ...p, queue: [v] } : { ...p, queue };
}

/** Avança: desenha direto o que não dá pra animar; devolve o que animar agora (ou null). */
export function step(p: Playback): { playback: Playback; anim: { prev: CamelioView; next: CamelioView } | null } {
  let cur = p;
  while (!cur.animating && cur.queue.length > 0 && cur.shown) {
    const next = cur.queue[0]!;
    if (isNextPlay(cur.shown, next)) return { playback: { ...cur, animating: true }, anim: { prev: cur.shown, next } };
    cur = { ...cur, shown: next, queue: cur.queue.slice(1) };
  }
  return { playback: cur, anim: null };
}

/** A animação terminou (ou foi interrompida): a view de destino passa a ser a desenhada. */
export function finish(p: Playback): Playback {
  if (!p.animating) return p;
  const [next, ...rest] = p.queue;
  return { shown: next ?? p.shown, queue: rest, animating: false };
}
```

Atenção ao caso "view sem jogada nova durante a animação com a fila vazia": não acontece (durante a animação `queue[0]` é o destino), mas o código cobre. E quando a fila tem só o destino da animação e chega uma view do mesmo passo, ela substitui o destino: a animação continua (ela usa o `next` que recebeu no começo) e, no `finish`, a view mais nova é a desenhada.

- `usePlayback.ts`: `export function usePlayback(view: CamelioView): { shown: CamelioView; anim: { prev; next } | null; done: () => void }` — guarda `Playback` num `useReducer`/`useRef`, chama `receive` a cada `view` nova (efeito por identidade da view), roda `step` e expõe `anim` enquanto `animating`. `done()` chama `finish` e roda `step` de novo. Sem a view no array de dependências de efeitos que disparam ações (ver gotcha do TanStack/`useEffect` no CLAUDE.md do hub: aqui não há TanStack, mas a regra de não colocar objeto recriado nos deps vale).

- [ ] **Step 4:** PASS (os testes do hook podem usar `renderHook` com uma view que muda via `rerender`). **Step 5: commit** `feat(web): fila de animação do Cama-Leão`.

---

### Task 5: a virada (`anim.ts`)

**Files:** Create `web/src/games/camelio/anim.ts`, `layout.ts`; Test `web/test/camelio-anim.test.ts`.

- `layout.ts`: porta de `seatFit`/`stackLayout`/`SEAT_W`/`MINE_W` (protótipo 459–473) e da posição dos assentos no arco (`renderSeats`, 482): `export function seatSlots(count: number, width: number): { x: number; y: number }[]`.
- `anim.ts`: porta de `prototipo/cama-leao/anim.js` em TS, **sem globais**: `export function playTurnAnim(root: HTMLElement, prev: CamelioView, next: CamelioView, opts: AnimOptions): { done: Promise<void>; stop(): void }`, com
  ```ts
  export interface AnimOptions {
    nameOf: (id: string) => string;
    say: (text: string) => void;
    sound: (name: CamelioSound) => void;
    /** Onde o clone estava na soltura (coordenadas do palco), só pra jogada sua de arrasto. */
    dropFrom?: { x: number; y: number; from: CamelioFrom } | null;
    layout: (pid: string, n: number) => { w: number; gap: number; pad: number };
    /** Escala do palco (a anim converte px da tela em px do palco). */
    scale: number;
  }
  ```
  Todas as buscas de DOM são **dentro de `root`** (o palco), pelos mesmos seletores do contrato do topo do `anim.js` (`.seat[data-pid]`, `.cl-mine` no lugar de `#mine`, `[data-pile="deck"] .lift > .card`, `[data-pile="open"] .lift > .card`, `.stack[data-color] > .pile`, `.sum`, `.head .flags .flag[data-color]`, `.fans .fan[data-color]`). Mantém: clone síncrono, origem escondida, teto de 4 s, `stop()` que desfaz tudo e resolve, nenhum `.cl-fly` sobrando, `transform-origin` restaurado. O `<style>` das classes `fly-*` vai pro `camelio.css` (não injete `<style>` em runtime).

- [ ] **Step 1: testes que falham** (`camelio-anim.test.ts`, jsdom não tem WAAPI: no `beforeEach`, `Element.prototype.animate = vi.fn(() => ({ finished: Promise.resolve(), cancel: vi.fn(), onfinish: null }))` e restaure no `afterEach`): monte um palco mínimo com a marcação que a mesa vai gerar (assento `p1` com uma pilha vermelha, `[data-pile]` do monte e da aberta) e, com views reais das fixtures:
  - `done` resolve pros 4 resultados (`none`, `scored`, `bust`, `lost`), chama `say` com a frase do `narrate` e `sound` com `flip` e o som do resultado;
  - depois do `done`, nenhum `.cl-fly` no DOM e nenhum elemento com `style.visibility === 'hidden'`;
  - `stop()` no meio resolve o `done` e limpa tudo;
  - teto: com `animate` devolvendo um `finished` que nunca resolve, `vi.advanceTimersByTime(4000)` resolve o `done`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS + typecheck.
- [ ] **Step 5: commit** `feat(web): a virada do Cama-Leão no site`.

---

### Task 6: a mesa — palco, topo, assentos, picadeiro, sua mesa, letreiro (sem gesto)

**Files:** Create `CamelioTable.tsx`, `TopBar.tsx`, `Seat.tsx`, `Ring.tsx`, `Banner.tsx`; Modify `camelio.css`; Test `web/test/camelio-table.test.tsx`.

- `CamelioTable({ view, conn })`: raiz `<div className="camelio" ref={rootRef} data-button-sounds="">` com o palco `cl-stage` (largura e escala de `useStageFit`, como `PicturesTable`), `TopBar`, os assentos dos outros no arco (`seatSlots`), `Ring`, `Banner`, a sua mesa (`Seat` com `mine`), o toast (`useToast`, recusas do servidor via `conn.onError`, ignorando `JOIN_ERRORS`, som `error`) e o `usePlayback(view.game)` — **tudo é desenhado a partir de `shown`**, nunca direto de `view.game`.
- Marcação e classes iguais às do protótipo, com prefixo onde o protótipo usava `id`: `#seats` → `.cl-seats`, `#ring` → `.cl-ring`, `#deck` → `[data-pile="deck"]`, `#open` → `[data-pile="open"]`, `#banner` → `.cl-banner > .txt`, `#mine` → `.cl-mine`, `#toast` → `.cl-toast`. Assentos `.seat[data-pid]` com `aria-label` "mesa de Bia" (e "sua mesa" na sua), monte `aria-label` "monte", aberta `aria-label` "carta aberta" — o E2E usa esses rótulos.
- Estados: `.turn` (holofote), `.off` (desconectado: "caiu"), `.myturn` na sua mesa; pilha `.hot` no 4/5, `.scored` em cor já pontuada; `#info` do topo com meta, monte e "último monte".
- Letreiro: frase da última jogada (via `narrate`) até a vez nova; na sua vez, a dica entra 1,1 s depois ("sua vez: arraste uma carta até a mesa de alguém (ou clique nela e depois na mesa)"); pausado: "pausado: esperando a galera voltar"; espectador: "vez de Bia"; fim: "fim: Bia ganhou! chegou a 3 cores" (o cartaz vem na Task 9).
- Som `turn` quando a vez passa a ser sua (uma vez por vez, como o `prevTurn` do protótipo).
- Espectador: no lugar da sua mesa, a faixa "você está assistindo esta partida".
- Copie o CSS do protótipo (seções 24–233) pra `camelio.css`, escopado em `.camelio`, trocando os `#id` pelas classes acima.

- [ ] **Step 1: testes que falham** em `camelio-table.test.tsx` (mock de `../src/games/camelio/sounds` e de `../src/games/camelio/anim` — `playTurnAnim` devolve `{ done: Promise.resolve(), stop: vi.fn() }`; `GameConn` falso como no `pictures-table.test.tsx`):
  - com 3 jogadores: 2 assentos com `aria-label` "mesa de P1"/"mesa de P2", "sua mesa", "monte" com a contagem 71, "carta aberta";
  - pilha com soma "x/5" certa depois de uma jogada (fixture `playTurn`);
  - desconectado aparece com "caiu";
  - espectador vê "você está assistindo esta partida";
  - erro do servidor (`notify('not_your_turn', 'Não é a sua vez.')`) vira toast.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS + typecheck.
- [ ] **Step 5: commit** `feat(web): mesa do Cama-Leão (desenho a partir da fila de animação)`.

---

### Task 7: o gesto — clique e arrasto (`useDragPlay.ts`)

**Files:** Create `web/src/games/camelio/useDragPlay.ts`; Modify `CamelioTable.tsx`, `Ring.tsx`, `Seat.tsx`, `camelio.css`; Test `web/test/camelio-table.test.tsx` (acrescentar).

- Porta do clique (protótipo 660–702) e do arrasto (704+), num hook: `useDragPlay({ rootRef, scale, canPlay, canReceive, onPlay })` devolvendo o que a mesa precisa pra desenhar (`picked`, `hoverPid`, `dimmed`, handlers de `pointerdown` pros montes e de `click` pros montes e mesas) e o `dropFrom` pendente.
- `canPlay` = é a sua vez em `shown` **e** `view.game` (não animando, não pausado, partida rolando, você joga); `canReceive(p)` = `p` está em `players` e o assento está conectado.
- **Rede (diferença 4):** `onPlay(from, to, pos)` manda `conn.sendAction({ type: 'play', from, to })` e guarda `pending = { from, to, pos }`; o clone fica parado em `pos`. Quando o `usePlayback` começar a animar uma jogada com `last.by === view.you`, passa `pending.pos` como `dropFrom` pro `playTurnAnim` e some com o clone; se vier `conn.onError` ou passarem 4 s sem a jogada, o clone volta voando (200 ms) e `pending` zera. Clique simples (carta levantada + clique na mesa) não tem `pos`: a virada nasce no monte/aberta.
- Mantém do protótipo: começar só depois de 6 px; listeners no `window`; engolir o clique depois do arrasto; cancelar com `Escape`, `pointercancel`, `e.buttons === 0` e `blur`; cancelar se a vez acabar; `.target` nos que podem receber, `.hover` no de baixo; carta original com `opacity:.35`.

- [ ] **Step 1: testes que falham** (clique; o arrasto real fica pro E2E e pra conferência no navegador):
  - na sua vez, clicar em "carta aberta" e depois em "mesa de P1" manda `{ type: 'play', from: 'open', to: 'p1' }`;
  - clicar no "monte" e depois na "sua mesa" manda `from: 'deck'` com `to` = você;
  - fora da sua vez, clicar não manda nada;
  - assento desconectado não recebe (clique não manda);
  - `Escape` solta a carta levantada.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS + typecheck.
- [ ] **Step 5: commit** `feat(web): arrastar e clicar a carta no Cama-Leão`.

---

### Task 8: a virada ligada na mesa

**Files:** Modify `CamelioTable.tsx`; Test `web/test/camelio-table.test.tsx` (acrescentar).

- Quando `usePlayback` expõe `anim`, num `useLayoutEffect` a mesa chama `playTurnAnim(stageEl, anim.prev, anim.next, { nameOf, say: setBannerText, sound: playCamelioSound, dropFrom, layout: stackLayout, scale })`, e no `done` chama `done()` do playback. Guarde o `stop` e chame no desmonte e quando o `match` mudar.
- Durante a animação a mesa desenha `shown` (a view de antes), sem `.target`/`.picked` e sem trocar o letreiro (a anim é dona dele).
- [ ] **Step 1: testes que falham** (anim mockada, controlando quando o `done` resolve com um `Promise` manual):
  - view nova com uma jogada: `playTurnAnim` é chamado uma vez com `prev`/`next` certos; até o `done` resolver, a mesa mostra a contagem antiga do monte; depois, a nova;
  - duas jogadas chegando durante a animação: a segunda anima depois da primeira;
  - partida nova (`again`): não anima e chama `stop` da animação em curso.
- [ ] **Step 2–4:** FAIL → implementar → PASS + typecheck.
- [ ] **Step 5: commit** `feat(web): virada animada na mesa do Cama-Leão`.

---

### Task 9: fim de partida

**Files:** Create `EndCard.tsx`; Modify `CamelioTable.tsx`, `camelio.css`; Test `web/test/camelio-table.test.tsx` (acrescentar).

- Porta do cartaz do protótipo (585–650): título em Rye ("você ganhou!", "Bia ganhou!", "empate: Bia e você"), motivo ("chegou a 3 cores" / "o monte acabou"), linhas de `camelioStandings` (posição, personagem, nome, bandeirinhas ou "nenhuma cor", "N esferas em jogo"), compactas a partir de 4 jogadores, posição na faixa entre os assentos e a sua mesa (`placeEnd`), e "ver a mesa" (recolhe; clicar na faixa abre).
- Botões **só do host**: "jogar de novo" (`{ type: 'again' }`) e "voltar pro lobby" (`{ type: 'lobby' }`), travados por 4 s depois do clique (como o `hostSend` do Retratim); os outros veem "esperando o host…".
- Som `win` se você está em `winners`, senão `lose` (espectador: nenhum), uma vez por `match`.
- O cartaz só aparece quando `shown.phase === 'over'` (ou seja, depois da virada da última jogada).
- [ ] **Step 1: testes que falham:** fim pela meta (`patchGame(started(3), { phase: 'over', turn: null, winners: ['p0'], endReason: 'target', scored: { p0: [22, 20, 32, 34, 8, 10], p1: [], p2: [] } })`, vista por `p0`), título "você ganhou!" e ordem das linhas; empate pelo monte com "empate: …"; host vê os dois botões e "jogar de novo" manda `again`; não-host vê "esperando o host…"; `win`/`lose` tocam uma vez.
- [ ] **Step 2–4:** FAIL → implementar → PASS + typecheck.
- [ ] **Step 5: commit** `feat(web): fim de partida do Cama-Leão`.

---

### Task 10: lobby, rota e estante jogável

**Files:** Create `CamelioLobby.tsx`; Modify `web/src/screens/Game.tsx`, `web/src/games/catalog.ts`; Test `web/test/camelio-lobby.test.tsx`, `web/test/catalog.test.ts`, `web/test/shelf.test.tsx`.

- `CamelioLobby`: porta do `PicturesLobby` com a identidade circo (logo "Cama-Leão" em Rye, "sala ABCD · cartolina~"), "na mesa" com personagens, copiar link, `SoundPill`, "começar" do host com mínimo `CAMELIO_MIN_PLAYERS` (2) e o aviso "precisa de pelo menos 2 pessoas (tem 1)", "voltar pro início", `BotControls` em dev com `game="camelio"`.
- `Game.tsx`: `lazy` de `CamelioLobby` e `CamelioTable` (chunk à parte) e o ramo `isCamelioRoomView(view)` antes do `if (!isItoRoomView(view)) return null`, com `Suspense` e o banner de reconexão, igual ao Retratim.
- `catalog.ts`: `playable: true` no `camelio` e tire o comentário "A mesa vem no Plano C3.".
- [ ] **Step 1: testes que falham:** lobby (host com 2 conectados manda `start`; com 1 mostra o aviso; erro do servidor vira toast; `Game` com view de Cama-Leão no lobby mostra "começar" — `findByRole` por causa do `lazy`); `catalog.test.ts`: o teste do Cama-Leão passa a esperar `playable: true`; `shelf.test.tsx`: o Cama-Leão não tem mais o selo "em breve" (o teste deriva do catálogo — confira que continua passando).
- [ ] **Step 2–4:** FAIL → implementar → PASS + typecheck.
- [ ] **Step 5: commit** `feat(web): lobby do Cama-Leão e estante jogável`.

---

### Task 11: bots de desenvolvimento

**Files:** Create `web/src/dev/camelioBots.ts`; Modify `web/src/dev/BotControls.tsx`; Test `web/test/camelio-bots.test.ts`, `web/test/bot-controls.test.tsx`.

- `camelioBots.ts`: no modelo de `picturesBots.ts` (conexão de verdade, registro `addCamelioBot`/`camelioBotsIn`/`subscribeCamelioBots`/`camelioBotsVersion`/`removeAllCamelioBots`). A decisão é pura e exportada: `export function decideCamelio(view: CamelioRoomView, rng: Rng): { key: string; delay: number; action: GameAction } | null` — `null` se não é a vez do bot, pausado ou fora de `playing`; senão a jogada de `chooseCamelioPlay` (porta de `prototipo/cama-leao/bot.js`, com `active` = jogadores com assento conectado). `key = \`${match}:${playCount}\``; `delay` entre 1800 e 2800 ms (dá tempo das telas animarem). O bot não faz ação de host.
- `BotControls.tsx`: `GameKey` ganha `'camelio'` e o `API` a entrada nova; o limite do botão passa a ser o do jogo (`GAMES[game].maxPlayers`) em vez do `MAX_PLAYERS` global.
- [ ] **Step 1: testes que falham:** `decideCamelio` devolve `null` fora da vez, pausado e no lobby; na vez, devolve uma jogada válida pelo `camelioActionSchema` cujo `to` é jogador conectado; com o bot podendo fechar 5 na própria mesa, ele fecha (`patchGame(started(2), { turn: 'p1', open: 20, table: { p0: [], p1: [22] } })` vista por `p1` → `{ type: 'play', from: 'open', to: 'p1' }`). `bot-controls.test.tsx`: mock do novo módulo e o botão some/desabilita com 6 assentos no Cama-Leão.
- [ ] **Step 2–4:** FAIL → implementar → PASS + typecheck.
- [ ] **Step 5: commit** `feat(web): bots de desenvolvimento do Cama-Leão`.

---

### Task 12: E2E, documentação e conferência final

**Files:** Create `e2e/cama-leao.spec.ts`; Modify `README.md`, `CLAUDE.md`.

- [ ] **Step 1: E2E** `e2e/cama-leao.spec.ts`, no modelo de `e2e/retratim.spec.ts` (`newPlayer`, `join`, `closePlayers`):
  1. Ana abre a estante, clica no link "Cama-Leão", "criar sala", entra (`join(a, 'Ana', 0)`); Bia entra pelo link (`join(b, 'Bia', 1)`); Ana clica "começar".
  2. Quatro vezes: descubra quem tem a vez (a página cujo letreiro contém "sua vez"), e nela clique em "carta aberta" e depois em "sua mesa"; espere a outra página narrar a jogada no letreiro (`ficou com`), e o "monte · N" diminuir.
  3. Uma das jogadas é por **arrasto** com `page.mouse` (centro da "carta aberta" → centro da "mesa de Ana"/"mesa de Bia" do outro jogador, com `steps: 12`).
  4. Na página de quem **não** tem a vez, clicar na "carta aberta" não muda nada (o monte não diminui).
- [ ] **Step 2:** `npm run e2e` → os E2E existentes e o novo passam.
- [ ] **Step 3: documentação.** `README.md`: linha 3 cita o Retratim e o Cama-Leão (id `camelio`); a nota do celular (linha ~46) inclui o Cama-Leão. `CLAUDE.md`: linha da tabela `| **Cama-Leão** (nosso Camelio) | \`camelio\` | jogável no computador; celular e histórico ainda não |`; a frase dos ids inclui `camelio`; identidade "circo" na lista de identidades; "Diquisti e Retratim no celular" passa a incluir o Cama-Leão.
- [ ] **Step 4: conferência final.** `npm test`, `npm run typecheck`, `npm run build -w web` verdes. Suba servidor 8794 e site 5182 (ver "Portas"), abra uma sala com 3 bots em 1280×800 e 1920×1080, jogue uma partida inteira: arrasto, clique, os 4 resultados, letreiro, sons, placar do fim, "jogar de novo"; sem erro no console. Derrube os seus processos e apague o `web/.env.development.local` se você o criou.
- [ ] **Step 5: commit** `feat: Cama-Leão jogável no site (E2E e documentação)`.

O controlador mostra a mesa pro Rafa com bots e pergunta se pode abrir o PR do C3 (merge = publicar, decisão dele).
