# Plano M2 — Mandacaru: a mesa no site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O Mandacaru vira jogável no site (computador): lobby, mesa completa com troca, feira, cordéis, descarte, Carcará, relógio, diário, sons, fim com revanche, folha de regras, bots no dev e E2E com 3 navegadores; `playable: true`, `mobile: false`.

**Architecture:** Igual à mesa do Cúpi (`web/src/games/coup/`): `Game.tsx` escolhe `MandacaruLobby`/`MandacaruTable` por `isMandacaruRoomView`; a mesa lê só `view.game` (`MandacaruView`, com `can`) e manda `conn.sendAction(action)` com trava contra envio duplo; erros do servidor viram aviso (o servidor já manda a mensagem em português); prazos com `Date.now() + serverOffset`. O desenho e o comportamento vêm do protótipo aprovado `prototipo/hexa/` (estilo D), portado pra TypeScript/React: `art.js` → componentes SVG, `texts.js` → `texts.ts`, `sounds.js` → `sounds.ts`, `bots.js` → `web/src/dev/mandacaruBots.ts`, `index.html` → componentes.

**Tech Stack:** React 19, Vite, Vitest + @testing-library/react (jsdom), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-09-mandacaru-design.md` (§2 regras, §5 identidade, §6 mesa). Item 3 da §9. Notas do teste do protótipo: `docs/superpowers/plans/notas-para-mandacaru-m2.md` (se existir, **vale por cima** deste plano).

---

## Contexto para quem vai executar

- Worktree `.claude/worktrees/hexa`, branch `feat/hexa`. Sem merge/push (merge = publicar), nunca `git stash`; `git add` com caminhos explícitos.
- Arquivos compartilhados com outros jogos (o `CLAUDE.md` pede cuidado): `web/src/screens/Game.tsx`, `web/src/games/catalog.ts`, `web/src/dev/BotControls.tsx`, `web/test/shelf.test.tsx`, `web/test/catalog.test.ts`. Mexa só no bloco do Mandacaru.
- Modelo de cada peça: o Cúpi. Leia antes: `web/src/games/coup/CoupTable.tsx` (trava `send`, `Ui` preso a uma `key`, `useToast`, `conn.onError`), `CoupLobby.tsx`, `TopBar.tsx`, `clock.ts`, `sounds.ts`/`useCoupSounds.ts`, `RulesSheet.tsx`, `web/src/dev/coupBots.ts`, `web/test/coup-fixtures.ts`, `web/test/coup-table.test.tsx`, `e2e/cupi.spec.ts`, `e2e/helpers.ts`. Palco: `useStageFit` de `web/src/games/dixit/useStageFit.ts` (palco 1440×900, a altura manda).
- Fonte do desenho/comportamento: `prototipo/hexa/index.html`, `art.js`, `texts.js`, `sounds.js`, `bots.js`. Abra o protótipo (`npx http-server . -p 5188 -c-1` na raiz da worktree → `/prototipo/hexa/`) pra ver como cada coisa deve ficar.
- Shared: importe de `@cartolina/shared` (`isMandacaruRoomView`, `MandacaruRoomView`, `MandacaruView`, `MandacaruAction`, `RESOURCES`, `COSTS`, `CORDEIS`, `mandacaruGeometry`, `mandacaruPips`, …). O contrato: `close_deal` exige `id` (da oferta ou da proposta); `turnEndsAt`/`discardEndsAt` podem ser `null` (relógio parado).
- CSS todo em `web/src/games/mandacaru/mandacaru.css`, escopado em `.mandacaru` (classes `mc-`), com as variáveis do estilo D na raiz `.mandacaru` (tinta `#4a2e1f`, borda `#5b3a29`, terracota `#c8643b`, vermelho `#b8321f`, creme `#fff6e6`, fundo `#f3dcb4` com o brilho de sol). Fontes Bree Serif + Mulish já estão no `web/index.html`.
- Elementos clicáveis do tabuleiro com `aria-label` (ex.: "casa no canto 12", "estrada no lado 30", "Carcará no terreno 5") e `data-v`/`data-e`/`data-h`: os testes e o E2E dependem disso.
- Comandos: `npm test -w web -- mandacaru`, `npm run typecheck -w web`, `npm run build -w web`, `npm run e2e`. Commits `feat(web): …`/`test(e2e): …` terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Sobre o código neste plano:** como no M1, o plano traz completos os helpers de teste, os testes principais e as assinaturas; os componentes são porte do protótipo (a referência viva), com as regras de comportamento escritas aqui.

## Mapa de arquivos

| Arquivo | Task |
|---|---|
| `web/src/games/mandacaru/texts.ts`, `names.ts` | 1 |
| `web/src/games/mandacaru/art.tsx` | 1 |
| `web/src/games/mandacaru/sounds.ts`, `clock.ts` | 1 |
| `web/src/games/mandacaru/MandacaruLobby.tsx`, `mandacaru.css` | 2 |
| `web/src/screens/Game.tsx`, `web/src/games/catalog.ts` | 2 |
| `web/src/games/mandacaru/MandacaruTable.tsx`, `Board.tsx`, `Seats.tsx`, `TopBar.tsx`, `Hand.tsx`, `Actions.tsx`, `Diary.tsx` | 3 |
| `web/src/games/mandacaru/TradePanel.tsx`, `OfferCard.tsx`, `FeiraPanel.tsx`, `CordelChoice.tsx`, `DiscardPanel.tsx`, `EndPanel.tsx`, `RulesSheet.tsx` | 4 |
| `web/src/games/mandacaru/useMandacaruSounds.ts` | 5 |
| `web/src/dev/mandacaruBots.ts`, `web/src/dev/BotControls.tsx` | 6 |
| `e2e/mandacaru.spec.ts`, `README.md`, `CLAUDE.md` | 7 |
| `web/test/mandacaru-*.test.ts(x)`, `web/test/mandacaru-fixtures.ts` | 1–6 |

---

### Task 1: textos, nomes, arte, sons e relógio (peças puras)

**Files:** Create `texts.ts`, `names.ts`, `art.tsx`, `sounds.ts`, `clock.ts`; test `web/test/mandacaru-fixtures.ts`, `web/test/mandacaru-texts.test.ts`, `web/test/mandacaru-clock.test.ts`, `web/test/mandacaru-art.test.tsx`.

- [ ] **Step 1: fixtures** (`web/test/mandacaru-fixtures.ts`, completo)

```ts
import {
  PLAYER_COLORS,
  createRoom,
  isMandacaruRoomView,
  joinRoom,
  mandacaruStateOf,
  mulberry32,
  roomAction,
  roomView,
  type MandacaruRoomView,
  type MandacaruState,
  type Room,
} from '@cartolina/shared';

export const NAMES = ['Ana', 'Beto', 'Caio', 'Duda'];
export const T0 = 1_000_000;

/** Sala de Mandacaru no lobby com `n` pessoas (p0 é o anfitrião). */
export function mandacaruLobbyRoom(n: number): Room {
  let room = createRoom('MAND', 0, 'mandacaru');
  for (let i = 0; i < n; i++) {
    const res = joinRoom(room, { token: `t${i}`, name: NAMES[i]!, color: PLAYER_COLORS[i]! }, `p${i}`, 0);
    if (!res.ok) throw new Error(res.error);
    room = res.room;
  }
  return room;
}

export function step(room: Room, playerId: string, action: unknown, now = T0, seed = 1): Room {
  const res = roomAction(room, playerId, action, mulberry32(seed), now);
  if (!res.ok) throw new Error(`ação recusada: ${res.error}`);
  return res.room;
}

/** Sala começada (preparação) com a semente dada. */
export function mandacaruRoom(n = 3, seed = 1): Room {
  return step(mandacaruLobbyRoom(n), 'p0', { type: 'start' }, T0, seed);
}

export function viewOf(room: Room, playerId: string | null): MandacaruRoomView {
  const v = roomView(room, playerId);
  if (!isMandacaruRoomView(v)) throw new Error('não é sala de Mandacaru');
  return v;
}

/** Troca o estado do jogo da sala (pra montar situações nos testes). */
export function withGame(room: Room, edit: (s: MandacaruState) => MandacaruState): Room {
  return { ...room, game: edit(mandacaruStateOf(room)!) };
}

/** Faz a preparação toda pelo primeiro lugar de cada `can` (sala pronta pra rolar). */
export function afterSetup(room: Room): Room {
  let r = room;
  for (let i = 0; i < 20; i++) {
    const s = mandacaruStateOf(r)!;
    if (s.phase !== 'setup') return r;
    const p = s.turn!;
    const can = viewOf(r, p).game.can;
    if (can.placeHouse.length) r = step(r, p, { type: 'place_house', vertex: can.placeHouse[0]! });
    else r = step(r, p, { type: 'place_road', edge: can.placeRoad[0]! });
  }
  return r;
}
```

> Se o shared não exportar `mandacaruStateOf`, exporte-o em `shared/src/index.ts` (já existe em `room.ts`).

- [ ] **Step 2: `texts.ts`** — porte de `prototipo/hexa/texts.js`: `RES_NAME`, `TERRAIN_NAME`, `CORDEL_NAME`, `POINT_NAMES`, `resList(res)` ("2 madeira e 1 pedra"), `logLine(entry, nameOf)` → `{ text: string; strong?: string }` (uma frase por `MandacaruLogEntry`, mesmo texto do protótipo), `nameFrom(view)` (devolve `(id) => string`, "você" pra quem vê, nome do `view.seats` da sala). Sem o mapa fixo de artigos do protótipo (os nomes vêm da sala): use "de"/"com" sem artigo ("roubou 1 carta de Bia").
- [ ] **Step 3: teste dos textos** (`web/test/mandacaru-texts.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { logLine, resList } from '../src/games/mandacaru/texts';

const nameOf = (id: string) => ({ p0: 'você', p1: 'Bia', p2: 'Léo' })[id] ?? id;
const res = (p: Partial<Record<'wood' | 'brick' | 'leather' | 'beans' | 'stone', number>>) => ({ wood: 0, brick: 0, leather: 0, beans: 0, stone: 0, ...p });

describe('Mandacaru: textos', () => {
  it('lista de recursos', () => {
    expect(resList(res({ wood: 2, stone: 1 }))).toBe('2 madeira e 1 pedra');
    expect(resList(res({}))).toBe('nada');
  });

  it('roubo não diz o recurso', () => {
    expect(logLine({ t: 'steal', player: 'p1', from: 'p2' }, nameOf).text).not.toMatch(/madeira|barro|couro|feijão|pedra/);
  });

  it('dados com ganhos e banco curto', () => {
    const l = logLine({ t: 'roll', player: 'p1', dice: [3, 5], gains: { p0: res({ beans: 2 }) }, short: ['brick'] }, nameOf).text;
    expect(l).toContain('8');
    expect(l).toContain('feijão');
    expect(l).toContain('barro');
  });

  it('toda entrada do diário tem frase', () => {
    const entries = [
      { t: 'start', order: ['p0', 'p1'] },
      { t: 'place', player: 'p0', piece: 'house', at: 1 },
      { t: 'setup_gain', player: 'p0', gain: res({ wood: 1 }) },
      { t: 'discard', player: 'p1', count: 4 },
      { t: 'carcara', player: 'p1', hex: 3 },
      { t: 'build', player: 'p0', piece: 'city', at: 2 },
      { t: 'buy_cordel', player: 'p0' },
      { t: 'play', player: 'p0', kind: 'atravessador', resources: ['beans'], total: 3 },
      { t: 'trade', a: 'p0', b: 'p1', aGives: res({ wood: 2 }), bGives: res({ stone: 1 }) },
      { t: 'feira', player: 'p0', give: 'wood', gave: 4, want: 'stone', got: 1 },
      { t: 'award', award: 'longest', player: 'p2' },
      { t: 'timeout', player: 'p2' },
      { t: 'end_turn', player: 'p2' },
      { t: 'win', player: 'p1', points: 10 },
    ] as const;
    for (const e of entries) expect(logLine(e as never, nameOf).text.length).toBeGreaterThan(3);
  });
});
```

- [ ] **Step 4: `art.tsx`** — porte de `prototipo/hexa/art.js` em componentes SVG puros (sem estado): `<BoardDefs/>`, `<Hex tile cx cy/>`, `<Border/>` (terra rachada, anel 3), `<NumberToken number cx cy/>`, `<Port kind x y a b/>` (barraca), `<Road a b color/>`, `<House x y color/>`, `<City x y color/>`, `<Carcara x y/>`, `<ResIcon kind size/>`, `<DiceFace n/>`, constantes `R = 58`, `PLAYER_TINTS` (as 4 cores do estilo D na ordem dos assentos: vermelho #b8321f, azul #2f6fa8, roxo #7b4a9a, branco #f4efe3). Use `mandacaruGeometry()` pra posições. Os ids de `<defs>` com prefixo `mc-` (evitar colisão com outras mesas).
- [ ] **Step 5: teste da arte** (`web/test/mandacaru-art.test.tsx`): renderiza `<svg><BoardDefs/><Hex …/><NumberToken number={8} …/></svg>` sem erro; o 8 sai com a cor vermelha (`#b8321f`) e o 4 com a tinta.
- [ ] **Step 6: `clock.ts`** — `timeLeft(endsAt: number | null, serverNow: number): number | null` (ms restantes, mínimo 0; null = parado) e `useTurnClock(endsAt, serverOffset)` (tique de 250 ms, para quando expira ou é null); `formatClock(ms)` → `"4:12"`. Teste puro de `timeLeft`/`formatClock` (`web/test/mandacaru-clock.test.ts`): null → null; passado → 0; 252_000 → "4:12".
- [ ] **Step 7: `sounds.ts`** — molde do `web/src/games/coup/sounds.ts` (unlock depois de gesto, `loadSoundPref`, ganho geral 0,18), com os sons do `prototipo/hexa/sounds.js`: `'dice' | 'build' | 'card' | 'carcara' | 'turn' | 'win' | 'error'`. Exporte `playMandacaruSound(kind)` e `installMandacaruAudioUnlock()`.
- [ ] **Step 8:** `npm test -w web -- mandacaru` e `npm run typecheck -w web` → ok. Commit `feat(web): Mandacaru — textos, arte, relógio e sons`.

### Task 2: lobby, entrada no site e jogável

**Files:** Create `MandacaruLobby.tsx`, `mandacaru.css`; modify `web/src/screens/Game.tsx`, `web/src/games/catalog.ts`, `web/test/catalog.test.ts`, `web/test/shelf.test.tsx`; test `web/test/mandacaru-lobby.test.tsx`.

- [ ] **Lobby** no molde do `CoupLobby.tsx`, com a cara do estilo D (fundo de sol, título "Mandacaru" em Bree Serif, "faça a caatinga florir"): lista de quem está na sala com a cor, link da sala, `SoundPill`, "começar" só pro anfitrião e só com 3 ou 4 (texto "precisa de 3 a 4 pessoas" senão), `BotControls` lazy só em DEV com `game="mandacaru"`. Quem entra com 5+ vê "a mesa é de até 4: você assiste esta partida".
- [ ] **`Game.tsx`**: bloco `isMandacaruRoomView(view)` igual ao do Cúpi (lazy `MandacaruLobby`/`MandacaruTable`; `MandacaruTable` pode ser um stub que só mostra "mesa em construção" nesta task e é trocado na Task 3).
- [ ] **`catalog.ts`**: `playable: true`, `mobile: false`. Ajustar `catalog.test.ts` (`playable: true`) e `shelf.test.tsx` (nenhuma capa com "em breve").
- [ ] **Teste do lobby** (`web/test/mandacaru-lobby.test.tsx`): com 2 pessoas o anfitrião vê "começar" desabilitado e o aviso; com 3, clicar manda `{ type: 'start' }`; quem não é anfitrião não vê "começar".
- [ ] Commit `feat(web): Mandacaru jogável na estante, com lobby`.

### Task 3: a mesa (tabuleiro, jogadores, topo, mão, ações, diário)

**Files:** Create `MandacaruTable.tsx`, `Board.tsx`, `Seats.tsx`, `TopBar.tsx`, `Hand.tsx`, `Actions.tsx`, `Diary.tsx`; test `web/test/mandacaru-table.test.tsx`.

Comportamento (porte do `index.html` do protótipo):
- **`MandacaruTable`**: `.mandacaru` fixo cobrindo a tela; palco 1440×900 com `useStageFit`; `useToast` + `conn.onError` (ignora erros de entrada como o Cúpi; destrava; toca `error`); `send(action)` com trava (`sent`) que solta com visão nova, com erro ou em 4 s; `mode` de construção (`null | 'road' | 'house' | 'city'`) guardado no estado de UI e zerado quando muda a `key` (`match:log.length:phase:turn`). Quem assiste vê o tabuleiro e "você está assistindo".
- **`Board`**: SVG com `viewBox` centrado (como o protótipo), desenha borda, terrenos, fichas, feiras, estradas, casas/vilas (cor pelo índice do jogador em `view.game.players`), Carcará; os lugares clicáveis:
  - preparação: `can.placeHouse` (círculos pulsando, `aria-label="casa no canto N"`) e `can.placeRoad` (`"estrada no lado N"`);
  - `mode` road/house/city: `can.buildRoad` / `can.buildHouse` / `can.buildCity`; no `mutirao`, `can.buildRoad` sempre;
  - fase `carcara`: `can.carcara` (terrenos acesos, `"Carcará no terreno N"`).
  - clique manda a ação certa (`place_house`, `place_road`, `build_*`, `move_carcara`).
- **`Seats`** (esquerda): por jogador em `players`: cor, nome, pontos (`seats[].points`; os seus = `myPoints`), cartas, cordéis, Vaqueiros, selos de maior estrada/comitiva, destaque de quem está na vez, mini-relógio, "saiu" se desconectado; embaixo, banco e monte.
- **`TopBar`**: "sua vez · fase" / "vez da Bia", relógio (`turnEndsAt`, vermelho no último minuto, "parado" se null), dados (`view.game.dice`, animação curta ao mudar), placar da noite, botões "regras" e som.
- **`Actions`** (direita): rolar (`can.roll`), estrada/casa/vila (ligam `mode`; desabilitados se a lista do `can` está vazia), cordel (`buy_cordel`), trocar, feira, passar a vez (`can.endTurn`); "quanto custa" com `ResIcon`; aviso de fase ("escolha onde pôr o Carcará", "falta a Duda descartar"…).
- **`Hand`** (embaixo): `myRes` em cartas com quantidade; cordéis agrupados por tipo com "×N", selo "novo" e "jogar" quando em `can.play`.
- **`Diary`**: `logLine` das 8 últimas, a mais nova em cima.
- **Roubo**: com `can.steal.length > 1`, botões com os nomes; `view.game.stolen` vira aviso ("você roubou 1 pedra de Bia" / "Bia levou 1 feijão seu").

- [ ] **Teste da mesa** (`web/test/mandacaru-table.test.tsx`), no molde do `coup-table.test.tsx` (mock de `sounds`, `conn()` falsa, `mesa(view)`):

```tsx
// cabeçalho igual ao coup-table.test.tsx, trocando CoupTable → MandacaruTable, sounds do mandacaru, fixtures do mandacaru
describe('Mesa do Mandacaru', () => {
  it('na preparação, quem está na vez clica num canto e manda place_house', () => {
    const room = mandacaruRoom(3, 1);
    const turn = viewOf(room, null).game.turn!;
    const c = conn();
    mesa(viewOf(room, turn), c);
    const spot = screen.getAllByRole('button', { name: /casa no canto/ })[0]!;
    fireEvent.click(spot);
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'place_house', vertex: expect.any(Number) });
  });

  it('quem não está na vez não vê lugares', () => {
    const room = mandacaruRoom(3, 1);
    const turn = viewOf(room, null).game.turn!;
    const other = ['p0', 'p1', 'p2'].find((p) => p !== turn)!;
    mesa(viewOf(room, other));
    expect(screen.queryAllByRole('button', { name: /casa no canto/ })).toHaveLength(0);
  });

  it('rolar os dados e passar a vez', () => {
    const room = afterSetup(mandacaruRoom(3, 1));
    const turn = viewOf(room, null).game.turn!;
    const c = conn();
    mesa(viewOf(room, turn), c);
    fireEvent.click(screen.getByRole('button', { name: /rolar/ }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'roll' });
  });

  it('construir casa: o botão liga os lugares e o clique manda build_house', () => {
    // monte com withGame uma mão com madeira+barro+couro+feijão e uma estrada até um canto livre,
    // fase main e rolled: clicar "casa" mostra "casa no canto N"; clicar manda build_house
  });

  it('erro do servidor vira aviso e destrava', () => {
    const room = afterSetup(mandacaruRoom(3, 1));
    const turn = viewOf(room, null).game.turn!;
    const c = conn();
    mesa(viewOf(room, turn), c);
    fireEvent.click(screen.getByRole('button', { name: /rolar/ }));
    fail(c, 'bad_phase', 'Agora não dá pra fazer isso.');
    expect(screen.getByRole('status')).toHaveTextContent('Agora não dá pra fazer isso.');
  });

  it('relógio parado quando turnEndsAt é null', () => {
    const room = withGame(afterSetup(mandacaruRoom(3, 1)), (s) => ({ ...s, turnEndsAt: null }));
    mesa(viewOf(room, 'p0'));
    expect(screen.getByText(/parado/)).toBeTruthy();
  });

  it('quem assiste vê o tabuleiro e o aviso', () => {
    mesa(viewOf(mandacaruRoom(3, 1), null));
    expect(screen.getByText(/assistindo/)).toBeTruthy();
  });
});
```

> Complete o 4º teste com `withGame` (mão, estrada e fase `main`/`rolled`). Use os helpers de `build` do shared (`mandacaruHouseSpots`) se precisar achar um canto.

- [ ] Conferir no navegador com o servidor local (ver `CLAUDE.md` "Testar no navegador": portas próprias, `.env.development.local` sem commitar) e bots (Task 6 ainda não existe: teste com 3 abas).
- [ ] Commit `feat(web): Mandacaru — a mesa`.

### Task 4: troca, feira, cordéis, descarte, fim e regras

**Files:** Create `TradePanel.tsx`, `OfferCard.tsx`, `FeiraPanel.tsx`, `CordelChoice.tsx`, `DiscardPanel.tsx`, `EndPanel.tsx`, `RulesSheet.tsx`; test `web/test/mandacaru-panels.test.tsx`.

Porte das janelas do protótipo (Task 2 e 3 dele):
- **TradePanel** (quem está na vez, `can.offer`): +/− "você dá"/"você quer" (limitado à mão), "mandar pra mesa" → `offer`; com oferta aberta mostra cada outro jogador ✓/✗/pensando (`offer.accepted/rejected`) e "fechar com X" → `close_deal { with, source: 'offer', id: offer.id }`; lista `proposals` com "aceitar" → `close_deal { with: from, source: 'proposal', id }`; "retirar" → `cancel_offer`.
- **OfferCard** (os outros, oferta aberta, `can.respond`): "X quer dar … por …": "aceito" (desabilitado se falta carta) → `respond { offerId, accept: true }`, "não" → `accept: false`, "contraproposta" abre o TradePanel em modo proposta (invertido) → `propose`. Quem já respondeu vê a própria resposta.
- **Proposta sem oferta** (os outros, `can.propose`): botão "propor troca" abre o TradePanel em modo proposta.
- **FeiraPanel** (`can.feira`): dou X na taxa N:1 → quero Y × quantidade (limitada por mão e banco) → `feira`.
- **CordelChoice**: Chuva no sertão (2 recursos, podem repetir; só os que o banco tem) → `play_chuva`; Atravessador (1) → `play_atravessador`; Vaqueiro → `play_vaqueiro`; Mutirão → `play_mutirao` (a mesa entra em `mutirao` e o Board mostra os lados).
- **DiscardPanel** (`can.discard > 0`): +/− por recurso até o número, relógio de `discardEndsAt`, "descartar" → `discard`; quem não precisa vê "esperando X descartar".
- **EndPanel** (`over`): vencedor, pontos de cada um e de onde vieram (casas, vilas, maior estrada, maior comitiva, Pontos revelados com `POINT_NAMES`), placar da noite, "jogar de novo" só pro anfitrião → `restart`.
- **RulesSheet**: folha lateral com o resumo de §2 da spec (custos a partir de `COSTS`, o 7, troca, feira, cordéis com `CORDEL_COUNTS`, pontos, 5 min); fecha com Esc.

- [ ] **Testes** (`web/test/mandacaru-panels.test.tsx`), um por janela: oferta manda `offer` com os números certos; "fechar com Beto" manda `close_deal` com o `id` da oferta; o cartão de oferta manda `respond`; feira manda `feira` com a taxa de `can.feira`; Chuva manda os 2 recursos; descarte só habilita "descartar" com o número exato; fim mostra "jogar de novo" só pro anfitrião.
- [ ] Commit `feat(web): Mandacaru — troca, feira, cordéis, descarte, fim e regras`.

### Task 5: sons pela mudança da visão

**Files:** Create `useMandacaruSounds.ts`; test `web/test/mandacaru-sounds-hook.test.ts`.

- [ ] No molde de `useCoupSounds.ts`: compara a visão anterior com a nova (nada na primeira visão nem ao reconectar): dados mudaram → `dice`; prédio/estrada novos → `build`; sua mão ganhou carta → `card`; Carcará mudou de terreno → `carcara`; virou sua vez → `turn`; `over` → `win`. Teste com duas visões montadas pelas fixtures.
- [ ] Commit `feat(web): Mandacaru — sons`.

### Task 6: bots do dev

**Files:** Create `web/src/dev/mandacaruBots.ts`; modify `web/src/dev/BotControls.tsx`; test `web/test/mandacaru-bots.test.ts`.

- [ ] Porte do `prototipo/hexa/bots.js`: `decideMandacaru(view, rng): { key; delay; actions } | null` puro (mesmas escolhas do protótipo; a memória por jogador vira argumento/instância, e o tempo vem da hora do servidor), `mandacaruStepKey(view)`, e a classe `MandacaruBot` + registro copiados do `coupBots.ts` (`subscribeMandacaruBots`, `mandacaruBotsVersion`, `mandacaruBotsIn`, `addMandacaruBot`, `removeAllMandacaruBots`). Nunca manda `start`/`restart`. `close_deal` com `id`.
- [ ] `BotControls.tsx`: `mandacaru: import.meta.env.DEV ? { … } : NO_BOTS`.
- [ ] **Teste puro** (`web/test/mandacaru-bots.test.ts`): uma partida inteira só com `decideMandacaru` decidindo pra cada jogador pela própria visão (via `step`) termina com vencedor; nunca devolve ação de anfitrião; na preparação devolve `place_house` dentro de `can.placeHouse`.
- [ ] Conferir no navegador: lobby com "🤖 adicionar bot", partida com 2 bots até o fim.
- [ ] Commit `feat(web): Mandacaru — bots do dev`.

### Task 7: E2E e docs

**Files:** Create `e2e/mandacaru.spec.ts`; modify `README.md`, `CLAUDE.md`.

- [ ] **E2E** no molde do `e2e/cupi.spec.ts`, com 3 `newPlayer`: Ana cria a sala de Mandacaru pela estante, Beto e Caio entram, Ana começa; a preparação inteira é feita clicando nos botões `aria-label` "casa no canto"/"estrada no lado" de quem está na vez (descobre quem pela barra "sua vez"); confere que as 6 casas aparecem nas 3 telas; quem está na vez clica "rolar os dados" e o diário das 3 telas mostra a mesma soma. `WAIT = 15 s`.
- [ ] **Docs**: `CLAUDE.md` (tabela: Mandacaru "jogável no computador; histórico e celular ainda não"; seção "Como um jogo é montado" → identidade do Mandacaru: "caatinga ao sol"); README.
- [ ] `npm test`, `npm run typecheck`, `npm run build -w web`, `npm run e2e` → ok.
- [ ] Commit `test(e2e): uma partida de Mandacaru com 3 navegadores; docs`.
