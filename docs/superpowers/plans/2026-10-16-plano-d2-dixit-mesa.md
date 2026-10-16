# Plano D2 — mesa do Diquisti (id `dixit`) no site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levar a mesa do Dixit aprovada no protótipo (`prototipo/dixit/`) para o site de verdade (React, `web/src/games/dixit/`), ligada ao servidor, com lobby próprio, bots de desenvolvimento e, depois que a estante de jogos entrar no `main`, o Dixit jogável a partir da página do jogo.

**Architecture:** A lógica que dá para testar sem tela fica em módulos puros: geometria da mesa (`geometry.ts`), cartas provisórias (`art.ts`), status e rótulos (`status.ts`) e a **linha do tempo da revelação** (`reveal.ts`, que diz o que aparece em cada instante). Os componentes React são finos e só desenham a `DixitView` que o servidor manda. O hook `useReveal` só faz o relógio andar e toca os sons. O 3D é só CSS (`rotateX` no feltro e contra-rotação nas cartas). A mão usa **arrastar e soltar** com pointer events (hook `useHandDrag`, ver "Atualização de 2026-10-16" abaixo); o resto é clique.

**Tech Stack:** React 19 + TypeScript 5.9, Vite, Vitest 4 + Testing Library (jsdom), CSS puro; regras e tipos de `@cartolina/shared` (D1).

**Spec:** `docs/superpowers/specs/2026-10-15-dixit-design.md` §5 e §6 (atualizadas com o protótipo em 2026-10-16) e `2026-10-16-estante-de-jogos-design.md` (da sessão do ITO, substitui a §4). Referência visual e de comportamento: `prototipo/dixit/index.html` (abra com o `launch.json` "prototipo-dixit", porta 5176, em `/prototipo/dixit/`).

---

## Atualização de 2026-10-16 (vale por cima das tarefas abaixo)

Depois que o plano foi escrito, o usuário testou o protótipo com a arte real e pediu mudanças. **O protótipo (`prototipo/dixit/index.html`) já tem tudo isso funcionando: é a referência de comportamento.** Onde o código de uma tarefa abaixo contradiz esta seção, vale esta seção (spec §5.1, §5.3 e §6 atualizadas).

1. **Nome Diquisti.** Tudo que o jogador vê diz "Diquisti" (título da aba, lobby, mesa, verso da carta, catálogo, textos de teste). O id interno continua `dixit` (`gameId`, pastas, classes CSS, `web/public/dixit/`, nomes de função/tipo). Tarefa 3: o verso (`CARD_BACK_SVG`) escreve `diquisti` com `font-size="22"`. Tarefa 13: `title: 'Diquisti'` no catálogo e "Diquisti tá chegando" nos testes da página do jogo.
2. **Arte real já existe** (90 cartas em `web/public/dixit/cards/d001…d090.webp`, 600×900): `REAL_ART = true` (Tarefa 3 já ajustada). `<img className="dx-art" … draggable={false}>` com `object-fit: cover`; se a imagem falhar (`onError`), mostra a pintura SVG.
3. **Arrastar e soltar na mão (Tarefas 7, 8 e 10).** Novo módulo puro `web/src/games/dixit/hand.ts` com testes: `orderHand(prev: string[], hand: string[]): string[]` (mantém a ordem local, tira o que saiu, põe o que entrou no fim), `moveCard(order, id, toIndex)` e `insertIndex(x, count)` (`clamp(round((x - 420) / 116 + (count - 1) / 2), 0, count - 1)`, `x` em px do palco dentro da mão de 840 px). Hook `useHandDrag` (pointer events, `setPointerCapture`, limiar de 6 px, `pointercancel`/`lostpointercapture` devolvem a carta sem jogar; a escala do palco vem de `getBoundingClientRect().width / largura do palco`). Durante o arrasto: a carta segue o ponteiro (`translate` + leve giro, `scale(1.08)`, sem transição, `pointer-events: none`), as outras abrem espaço no índice de inserção, o feltro ganha a classe `drop-ready` (pode jogar) e `drop-over` (está em cima: `document.elementFromPoint(x, y)?.closest('.dx-felt')`). Soltar no feltro, se for a sua vez: narrador → `tell { cardId, clue }` com a dica do painel; escolha → `submit` + `confirm` (em 3 jogadores, a 1ª carta fica pendente no estado local e só a 2ª manda `submit` com as duas; clicar na pendente devolve). Soltar em qualquer outro lugar → reordena. Clique sem arrastar → amplia. A ordem da mão fica em estado do componente da mesa (some ao recarregar; tudo bem). **Sai** o botão "contei" e o "jogar essa(s)" do painel (Tarefa 8): o texto vira "arraste a carta pra mesa" (com "1 de 2 na mesa" em 3 jogadores). Os testes de painel/mesa que clicavam nesses botões passam a disparar `pointerdown/pointermove/pointerup` (Testing Library `fireEvent.pointerDown` etc., com `document.elementFromPoint` simulado com `vi.spyOn`).
4. **Cartas soltas na fase de escolha (Tarefas 2, 7 e 10).** Em `geometry.ts`: `looseSpot(used: [number, number][], rng): [x, y, giro]` (14 sorteios em x 250–750, y 250–480, fica o mais longe das já usadas, giro de −24° a 24°; testes com `mulberry32`). Na fase `submitting`, a mesa desenha uma carta virada por jogada já feita: narrador (1) + cada jogador em `confirmed` (`dixitPicksPerPlayer` cartas) + suas pendentes; chave `${jogador}:${k}`; posição guardada num `useRef<Map>` até a fase acabar. A sua cai onde você soltou (ponto da tela → feltro, aproximado pelo retângulo do feltro), as dos outros voam do assento (`animate` com o deslocamento do centro do assento até o ponto, `translateZ(150px)`, 680 ms) e tocam `land`. `z-index` crescente: a pilha sobe. Ao passar pra `voting`: se faltar a carta de alguém (quem jogou por último já fecha a fase), ela cai solta primeiro e a arrumação espera 750 ms; depois as soltas vão pras posições de `slots(n)` (na ordem de `table`, que o servidor já sorteia) com `transition` de 750 ms em `left/top/transform` e giro voltando a 0, e viram uma a uma (atraso +820 ms). O `.tcard` ganha `rotateZ(var(--rz, 0deg))` logo depois do `translate(-50%,-100%)`.
5. **Dono da carta na revelação (Tarefas 5 e 9).** O dono aparece num **selo no topo da carta** (`.dx-owner`: pílula com personagem de 28 px + nome em DM Serif 15 px, fundo `--bg`, fio creme; o seu com borda e texto mostarda e "você"), dentro da face, `top: -15px`. Quando o selo aparece, a etiqueta "sua" sai. O rótulo "carta do narrador" sobe (`margin-bottom: 26px`) pra não bater no selo. Os votos continuam na base da carta.
6. **Numeral romano no canto da carta (Tarefas 6 e 7).** Nada pode ficar *abaixo* da carta na mesa: ela levanta pela base, então o que passa da borda de baixo afunda no feltro (o numeral virava um tracinho). O numeral vai num medalhão dentro da carta, no canto inferior esquerdo e meio pra fora (\`left: -12px; bottom: 10px\`, altura 30 px, \`min-width: 30px\`, DM Serif 15 px, fundo \`--bg\`, fio creme; votado = fundo mostarda). As fichas de voto começam em \`left: 22px\` pra não bater nele. A carta que foi da mão pra mesa some **na hora** (\`opacity: 0 !important; visibility: hidden; transition: none\`): sem o \`!important\`, o "mão apagada" de quando não é sua vez a deixava meio transparente flutuando.
7. **Dica antes da carta (Tarefas 8 e 10).** O painel do narrador tem o campo da dica e uma caixinha "vou falar a dica na call" (marcada: campo desligado e `clue: ''`). Soltar a carta no feltro só manda `tell` se `clue.trim() !== '' || falada`; senão a carta volta pra mão, toca `error`, o painel mostra "Antes de jogar a carta, escreva a dica ou marque “vou falar na call”." e a caixa da dica treme (`.need`). Durante o arrasto, sem dica o feltro ganha `drop-no` (borda e brilho `#D1495B`) no lugar de `drop-ready`/`drop-over`. O aviso no feltro muda entre "primeiro a dica: escreva ou marque “vou falar na call”" e "arraste pra cá a carta da sua dica". A caixinha zera depois de narrar. Testes: soltar sem dica não chama `onAction`; com a caixinha marcada chama `tell` com `clue: ''`; com texto, com o texto.
8. **Sons mais suaves (Tarefa 1).** Em `web/src/games/dixit/sounds.ts` (ou onde a Tarefa 1 puser), volume geral menor que o do ITO: arquivo da carta a 45% do volume pedido (os testes da Tarefa 1 passam a esperar `0.4 * 0.45 = 0.18` e `0.7 * 0.45 = 0.315`, arredondando com `toBeCloseTo`), e os sintetizados do Dixit a metade (passar `vol` já multiplicado por 0,5, sem mexer no `sounds.ts` do ITO). "tunc" de erro e "tic" de virar ainda mais baixos (0,2/0,07 e 0,15/0,05 antes do fator).

---

## Contexto para quem vai executar

- Monorepo npm workspaces: `shared/` (regras), `server/`, `web/` (React). Rode tudo na raiz da worktree `.claude/worktrees/dixit`, na **branch `feat/dixit-mesa`** (já criada, a partir do `feat/dixit` = D1, PR #5). Nunca mexa na pasta principal do repositório: outra sessão trabalha lá.
- Comandos: `npm test -w web`, `npm run typecheck -w web`, `npm run build -w web`, `npm test` e `npm run typecheck` (tudo).
- Arquivo de teste único: `cd web && npx vitest run test/<arquivo>`.
- Código, comentários, textos e nomes de teste em **português**, no estilo dos arquivos vizinhos. Commits `feat(web): …`/`test(web): …` com a linha final `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- TS estrito com `noUncheckedIndexedAccess` e `verbatimModuleSyntax` (use `import type`). A Vitest não checa tipos: rode o typecheck quando o passo pedir.
- O que o D1 já dá (de `@cartolina/shared`): `DixitRoomView` (`RoomView<DixitView> & { gameId: 'dixit' }`), `isDixitRoomView`, `DixitView`, `DixitRoundResult`, `DixitState`, `DIXIT_TARGETS`, `DIXIT_MIN_PLAYERS`, `DIXIT_CLUE_MAX`, `dixitPicksPerPlayer`, `mulberry32`, `GameAction`, `createRoom(code, now, group, gameId)`, `joinRoom`, `roomAction`, `roomView`. Campos da `DixitView`: `phase`, `target`, `players`, `inRound`, `scores`, `storyteller`, `clue`, `paused`, `winners`, `result`, `hand`, `handCounts`, `deckCount`, `storyCard`, `myPicks`, `myVote`, `confirmed`, `tableCount` e `table` (`{ cardId, mine }[]`).
- Ações do Dixit: `setTarget`, `start`, `tell { cardId, clue }`, `submit { cardIds }`, `vote { cardId }`, `confirm`, `forceNext`, `next`, `again`, `lobby`.
- **Parte A** (Tarefas 1–11) não depende da estante. **Parte B** (Tarefas 12–15) começa só depois que a estante de jogos (branch `feat/estante-jogos` da sessão do ITO) estiver no `main`; a Tarefa 12 é a trava.
- A estante muda `createRoom` para `createRoom(code, now, gameId)` (sai o grupo). Por isso, nesta parte A, as fixtures de teste do Dixit criam a sala num lugar só (`web/test/dixit-fixtures.ts`), e a Tarefa 12 ajusta essa linha.

## Mapa de arquivos

Criar em `web/src/games/dixit/`:
- `geometry.ts`: palco, trilha de casas, peões, posições das cartas na mesa e arco dos assentos (puro).
- `art.ts`: cartas provisórias em SVG geradas pelo id, verso, `REAL_ART` (ligado: as 90 cartas já existem) e `cardImageUrl` (puro).
- `status.ts`: nomes e cores por id, ordem dos assentos, status do assento e rótulo da fase (puro).
- `reveal.ts`: linha do tempo da revelação, quadro em cada instante, motivos dos pontos e frases-resumo (puro).
- `useStageFit.ts` (escala do palco) e `useReveal.ts` (relógio e sons da revelação).
- `CardArt.tsx` (arte e verso), `Brushes.tsx` (fundo de pinceladas), `CardViewer.tsx` (carta ampliada), `Felt.tsx` (feltro, trilha, peões e cartas), `Seats.tsx` (assentos e você), `Hand.tsx`, `ActionPanel.tsx`, `DixitTopBar.tsx` (com `SoundPill`), `RevealCaption.tsx`, `RoundBoard.tsx`, `DixitTable.tsx` (junta tudo), `DixitLobby.tsx` e `dixit.css`.

Criar em `web/src/dev/`: `dixitBots.ts`.

Modificar:
- `web/src/brand/sounds.ts`: som `land` e `pick` sem intervalo mínimo.
- `web/src/table/confetti.ts`: cores configuráveis.
- `web/src/screens/Game.tsx`: lobby e mesa do Dixit.
- `web/src/dev/BotControls.tsx`: bots do jogo da sala.
- `web/index.html`: fontes DM Serif Display e Nunito.

Testes em `web/test/`: `dixit-fixtures.ts`, `dixit-geometry.test.ts`, `dixit-art.test.ts`, `dixit-status.test.ts`, `dixit-reveal.test.ts`, `dixit-ui.test.tsx`, `dixit-table.test.tsx`, `dixit-lobby.test.tsx`, `dixit-bots.test.ts`; `sounds.test.ts` ganha casos. `dixit-soon.test.tsx` sai (a tela "em breve" sai).

---

# Parte A — mesa, lobby e bots (não depende da estante)

### Task 0: Preparar

- [ ] **Step 1:** `git branch --show-current` deve mostrar `feat/dixit-mesa`. Rode `npm install`, depois `npm test` e `npm run typecheck`. Tudo precisa passar antes de começar. Se algo falhar, pare e reporte.

---

### Task 1: Sons do Dixit (`land` e `pick` sem intervalo)

**Files:**
- Modify: `web/src/brand/sounds.ts`
- Test: `web/test/sounds.test.ts`

- [ ] **Step 1: Testes.** Em `web/test/sounds.test.ts`, dentro do `describe('sons de arquivo (carta)', …)`, adicione:

```ts
  it('carta pousando na mesa (land) usa o mesmo arquivo, bem mais baixo', () => {
    playSound('land', 0, 0);
    expect(played()).toHaveLength(1);
    expect(played()[0]!.volume).toBe(0.4);
    expect(played()[0]!.src).toMatch(/sounds\/card\.mp3$/);
  });

  it('escolher (pick) nunca é engolido pelo intervalo mínimo', () => {
    playSound('land', 0, 0);
    playSound('pick', 0, 10);
    expect(played().map((a) => a.volume)).toEqual([0.4, 0.7]);
  });
```

- [ ] **Step 2:** `cd web && npx vitest run test/sounds.test.ts` deve dar FAIL (`land` não existe; `pick` dentro de 80 ms é ignorado).

- [ ] **Step 3: Implementar** em `web/src/brand/sounds.ts`:
  - `SoundName` passa a ser `'card' | 'pick' | 'land' | 'slide' | 'flip' | 'error' | 'win' | 'lose' | 'join' | 'click'`.
  - `type FileSound = 'card' | 'pick' | 'land';`
  - `const POOL_OF: Record<FileSound, 'card'> = { card: 'card', pick: 'card', land: 'card' };`
  - `FILE_VOLUME`: `{ card: 1, pick: 0.7, land: 0.4 }`. No comentário, acrescente que `land` é a carta pousando na mesa do Dixit, bem mais baixa.
  - Em `playFile`, troque a primeira linha por:

```ts
  // `pick` é escolha da pessoa (personagem, carta, voto): sempre toca, mesmo colado em outro som de arquivo.
  if (name !== 'pick' && now - lastFile < FILE_GAP_MS) return;
```

  - Em `playSound`, troque `if (name === 'card' || name === 'pick') {` por `if (name === 'card' || name === 'pick' || name === 'land') {`.
  - O `SYNTH` continua tipado como `Record<Exclude<SoundName, FileSound>, …>`, então ele já exclui `land`.

- [ ] **Step 4:** `cd web && npx vitest run test/sounds.test.ts` deve dar PASS. Rode também `npm run typecheck -w web`.

- [ ] **Step 5: Commit.** `feat(web): sons do Dixit (carta pousando baixinho, escolha sempre toca)`

---

### Task 2: Geometria da mesa (pura)

**Files:**
- Create: `web/src/games/dixit/geometry.ts`
- Test: `web/test/dixit-geometry.test.ts`

- [ ] **Step 1: Testes.** `web/test/dixit-geometry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FELT_H, FELT_W, STAGE_W, fitStage, pawnSpots, seatArc, tableSlots, trackPoints } from '../src/games/dixit/geometry';

describe('trilha de casas', () => {
  it('31 casas (0…30) dentro do feltro, todas diferentes', () => {
    const cells = trackPoints(31);
    expect(cells).toHaveLength(31);
    for (const [x, y] of cells) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(FELT_W);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(FELT_H);
    }
    expect(new Set(cells.map(([x, y]) => `${Math.round(x)},${Math.round(y)}`)).size).toBe(31);
  });

  it('a casa 0 fica embaixo à esquerda e a trilha sobe pela esquerda', () => {
    const [c0, c1] = trackPoints(31);
    expect(c0![0]).toBeLessThan(100);
    expect(c0![1]).toBeGreaterThan(FELT_H / 2);
    expect(c1![1]).toBeLessThan(c0![1]);
  });
});

describe('peões', () => {
  const cells = trackPoints(31);
  it('cada um na casa dos seus pontos (máximo na última casa)', () => {
    const spots = pawnSpots(['a', 'b'], { a: 3, b: 99 }, cells);
    expect(spots.a![0]).toBeCloseTo(cells[3]![0]);
    expect(spots.b![0]).toBeCloseTo(cells[30]![0]);
  });

  it('quem divide a casa se espalha', () => {
    const spots = pawnSpots(['a', 'b', 'c'], { a: 0, b: 0, c: 0 }, cells);
    const xs = new Set(['a', 'b', 'c'].map((p) => Math.round(spots[p]![0])));
    expect(xs.size).toBeGreaterThan(1);
  });
});

describe('cartas na mesa', () => {
  it('até 5 cartas: uma fileira centrada', () => {
    const s = tableSlots(5);
    expect(new Set(s.map(([, y]) => y)).size).toBe(1);
    expect(s.reduce((n, [x]) => n + x, 0) / 5).toBeCloseTo(FELT_W / 2);
  });

  it('6 a 10 cartas: duas fileiras', () => {
    expect(new Set(tableSlots(6).map(([, y]) => y)).size).toBe(2);
    expect(tableSlots(10)).toHaveLength(10);
  });
});

describe('assentos e palco', () => {
  it('o arco é simétrico e abre com a largura', () => {
    const [x0] = seatArc(0, 5, STAGE_W);
    const [x4] = seatArc(4, 5, STAGE_W);
    expect(x0 + x4).toBeCloseTo(STAGE_W);
    expect(seatArc(0, 5, 1900)[0]).toBeLessThan(seatArc(0, 5, STAGE_W)[0] + (1900 - STAGE_W) / 2);
    expect(seatArc(0, 1, STAGE_W)).toEqual([STAGE_W / 2, 120]);
  });

  it('palco: a altura manda e a largura cresce até a janela', () => {
    expect(fitStage(1900, 900)).toEqual({ scale: 1, width: 1900 });
    expect(fitStage(1440, 450)).toEqual({ scale: 0.5, width: 2880 });
    expect(fitStage(720, 900)).toEqual({ scale: 0.5, width: 1440 });
  });
});
```

- [ ] **Step 2:** `cd web && npx vitest run test/dixit-geometry.test.ts` deve dar FAIL (módulo não existe).

- [ ] **Step 3: Implementar** `web/src/games/dixit/geometry.ts`:

```ts
/** Palco desenhado em 1440×900; a largura real cresce com a janela (ver `fitStage`). */
export const STAGE_W = 1440;
export const STAGE_H = 900;
/** Feltro em coordenadas locais (px antes do 3D). */
export const FELT_W = 1000;
export const FELT_H = 560;
export const CARD_W = 118;
export const CARD_H = 177;
export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

export type Pt = readonly [number, number];

/** Escala e largura do palco: a altura manda; a largura cresce até a da janela (sem faixas vazias). */
export function fitStage(winW: number, winH: number): { scale: number; width: number } {
  let scale = winH / STAGE_H;
  let width = winW / scale;
  if (width < STAGE_W) {
    scale = winW / STAGE_W;
    width = STAGE_W;
  }
  return { scale, width: Math.round(width) };
}

/** `n` casas igualmente espaçadas na borda do feltro: começa embaixo à esquerda e sobe (sentido horário). */
export function trackPoints(n: number): Pt[] {
  const x0 = 34, y0 = 34, x1 = FELT_W - 34, y1 = FELT_H - 34, R = 40;
  const w = x1 - x0 - 2 * R, h = y1 - y0 - 2 * R, q = (Math.PI * R) / 2;
  const seg: { len: number; at: (t: number) => Pt }[] = [
    { len: h, at: (t) => [x0, y1 - R - t * h] },
    { len: q, at: (t) => [x0 + R - R * Math.cos((t * Math.PI) / 2), y0 + R - R * Math.sin((t * Math.PI) / 2)] },
    { len: w, at: (t) => [x0 + R + t * w, y0] },
    { len: q, at: (t) => [x1 - R + R * Math.sin((t * Math.PI) / 2), y0 + R - R * Math.cos((t * Math.PI) / 2)] },
    { len: h, at: (t) => [x1, y0 + R + t * h] },
    { len: q, at: (t) => [x1 - R + R * Math.cos((t * Math.PI) / 2), y1 - R + R * Math.sin((t * Math.PI) / 2)] },
    { len: w, at: (t) => [x1 - R - t * w, y1] },
    { len: q, at: (t) => [x0 + R - R * Math.sin((t * Math.PI) / 2), y1 - R + R * Math.cos((t * Math.PI) / 2)] },
  ];
  const total = seg.reduce((a, s) => a + s.len, 0);
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    let d = (i / n) * total + 18;
    for (const s of seg) {
      if (d <= s.len) {
        out.push(s.at(d / s.len));
        break;
      }
      d -= s.len;
    }
  }
  return out;
}

/** Onde cada peão fica: casa = pontos (no máximo a última); quem divide a casa se espalha num círculo. */
export function pawnSpots(players: readonly string[], scores: Readonly<Record<string, number>>, cells: readonly Pt[]): Record<string, Pt> {
  const last = cells.length - 1;
  const byCell = new Map<number, string[]>();
  for (const p of players) {
    const k = Math.min(Math.max(scores[p] ?? 0, 0), last);
    byCell.set(k, [...(byCell.get(k) ?? []), p]);
  }
  const out: Record<string, Pt> = {};
  for (const [k, group] of byCell) {
    const [x, y] = cells[k]!;
    const m = group.length;
    group.forEach((p, j) => {
      const ang = (j / m) * Math.PI * 2;
      const rad = m > 1 ? 13 + m : 0;
      out[p] = [x + Math.cos(ang) * rad, y + 10 + Math.sin(ang) * rad * 0.5];
    });
  }
  return out;
}

/** Ponto de baixo, no centro, de cada carta na mesa: uma fileira até 5, duas de 6 em diante. */
export function tableSlots(n: number): Pt[] {
  const G = 22;
  const rows = n <= 5 ? [n] : [Math.ceil(n / 2), Math.floor(n / 2)];
  const ys = rows.length === 1 ? [395] : [262, 478];
  const out: Pt[] = [];
  rows.forEach((cnt, ri) => {
    const tot = cnt * CARD_W + (cnt - 1) * G;
    for (let i = 0; i < cnt; i++) out.push([FELT_W / 2 - tot / 2 + CARD_W / 2 + i * (CARD_W + G), ys[ri]!]);
  });
  return out;
}

/** Centro do assento `i` de `k` (os outros jogadores) num arco acima da mesa; abre com a largura extra. */
export function seatArc(i: number, k: number, width: number): Pt {
  const cx = width / 2;
  if (k === 1) return [cx, 120];
  const rx = 655 + (width - STAGE_W) * 0.42;
  const t = ((168 - (i / (k - 1)) * 156) * Math.PI) / 180;
  return [cx + rx * Math.cos(t), 392 - 272 * Math.sin(t)];
}
```

- [ ] **Step 4:** `cd web && npx vitest run test/dixit-geometry.test.ts` deve dar PASS. Rode também o typecheck do `web`.

- [ ] **Step 5: Commit.** `feat(web): geometria da mesa do Dixit (trilha, peões, cartas, assentos, palco)`

---

### Task 3: Cartas provisórias (puro)

**Files:**
- Create: `web/src/games/dixit/art.ts`
- Test: `web/test/dixit-art.test.ts`

- [ ] **Step 1: Testes.** `web/test/dixit-art.test.ts`:

```ts
import { dixitCardIds } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { CARD_BACK_SVG, REAL_ART, cardArtSvg, cardImageUrl } from '../src/games/dixit/art';

describe('cartas provisórias', () => {
  it('cada id gera sempre a mesma pintura', () => {
    expect(cardArtSvg('d007')).toBe(cardArtSvg('d007'));
  });

  it('o baralho todo é diferente entre si e é SVG válido (sem NaN/undefined)', () => {
    const all = dixitCardIds().map(cardArtSvg);
    expect(new Set(all).size).toBe(all.length);
    for (const svg of all) {
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).not.toMatch(/NaN|undefined/);
    }
  });

  it('verso e caminho da arte real', () => {
    expect(CARD_BACK_SVG).toContain('diquisti');
    expect(cardImageUrl('d001')).toMatch(/dixit\/cards\/d001\.webp$/);
    expect(REAL_ART).toBe(true); // as 90 cartas já estão em web/public/dixit/cards
  });
});
```

- [ ] **Step 2:** FAIL (módulo não existe).

- [ ] **Step 3: Implementar** `web/src/games/dixit/art.ts`. O código é portado de `prototipo/dixit/index.html` (seção "cartas provisórias"), com tipos:

```ts
import { mulberry32 } from '@cartolina/shared';

/** Arte de verdade em `web/public/dixit/cards/` (gerada por `npm run dixit:cartas`). `false` volta para as pinturas provisórias em SVG. */
export const REAL_ART = true;

/** Relativo à base do site (funciona no GitHub Pages, em subpasta). */
export function cardImageUrl(id: string): string {
  return `${import.meta.env.BASE_URL}dixit/cards/${id}.webp`;
}

type Rng = () => number;
const pick = <T>(r: Rng, arr: readonly T[]): T => arr[Math.floor(r() * arr.length)]!;
const SKIES: readonly (readonly [string, string, boolean])[] = [
  ['#14241f', '#30638e', true], ['#d1495b', '#f2a541', false], ['#8fb8de', '#f6ead2', false], ['#00798c', '#bfe0d4', false],
  ['#3a2a4a', '#c0607a', true], ['#1b2f2a', '#00798c', true], ['#f2a541', '#f6ead2', false],
];
const LANDS = ['#1b2f2a', '#2f5046', '#3d6b5c', '#5a4636', '#6b3a3a', '#24495a'];
const SIL = '#132420';
const ACC = ['#f2a541', '#d1495b', '#f6ead2', '#00798c'];

type Thing = (r: Rng, x: number, y: number, k: number, water: boolean) => string;
const tree: Thing = (_r, x, y, k) => { const h = 50 * k; return `<path d="M${x} ${y} l${-14 * k} 0 l${14 * k} ${-h} l${14 * k} ${h} Z" fill="${SIL}"/><path d="M${x} ${y - h * 0.45} l${-11 * k} 0 l${11 * k} ${-h * 0.7} l${11 * k} ${h * 0.7} Z" fill="${SIL}"/><rect x="${x - 2}" y="${y}" width="4" height="${8 * k}" fill="${SIL}"/>`; };
const house: Thing = (r, x, y, k) => { const w = 30 * k, h = 24 * k; return `<rect x="${x - w / 2}" y="${y - h}" width="${w}" height="${h}" fill="${SIL}"/><path d="M${x - w / 2 - 4} ${y - h} L${x} ${y - h - 18 * k} L${x + w / 2 + 4} ${y - h} Z" fill="${SIL}"/><rect x="${x - 4 * k}" y="${y - h + 6 * k}" width="${8 * k}" height="${8 * k}" fill="${pick(r, ACC)}"/>`; };
const door: Thing = (_r, x, y, k) => { const w = 22 * k, h = 44 * k; return `<path d="M${x - w / 2} ${y} V${y - h + w / 2} A${w / 2} ${w / 2} 0 0 1 ${x + w / 2} ${y - h + w / 2} V${y} Z" fill="#f2a541"/><path d="M${x - w / 2 - 3} ${y} V${y - h + w / 2} A${w / 2 + 3} ${w / 2 + 3} 0 0 1 ${x + w / 2 + 3} ${y - h + w / 2} V${y}" fill="none" stroke="${SIL}" stroke-width="3"/>`; };
const bird: Thing = (r, x, _y, k) => { let s = ''; for (let i = 0; i < 3; i++) { const bx = x + (r() - 0.5) * 60, by = 60 + r() * 80; s += `<path d="M${bx - 7 * k} ${by} q${3.5 * k} ${-5 * k} ${7 * k} 0 q${3.5 * k} ${-5 * k} ${7 * k} 0" fill="none" stroke="${SIL}" stroke-width="1.6"/>`; } return s; };
const balloon: Thing = (r, x, _y, k) => { const by = 70 + r() * 70; return `<path d="M${x} ${by + 16 * k} q-6 30 4 60" stroke="${SIL}" stroke-width=".8" fill="none"/><ellipse cx="${x}" cy="${by}" rx="${11 * k}" ry="${14 * k}" fill="${pick(r, ACC)}"/>`; };
const ladder: Thing = (_r, x, y, k) => { const h = 120 * k; let s = `<path d="M${x - 7} ${y} L${x - 4} ${y - h} M${x + 7} ${y} L${x + 4} ${y - h}" stroke="${SIL}" stroke-width="2"/>`; for (let i = 1; i < 9; i++) s += `<path d="M${x - 6.5 + i * 0.35} ${y - (i * h) / 9} h${13 - i * 0.7}" stroke="${SIL}" stroke-width="1.6"/>`; return s; };
const eye: Thing = (r, x, _y, k) => { const ey = 60 + r() * 60; return `<path d="M${x - 22 * k} ${ey} Q${x} ${ey - 16 * k} ${x + 22 * k} ${ey} Q${x} ${ey + 16 * k} ${x - 22 * k} ${ey} Z" fill="#f6ead2" opacity=".9"/><circle cx="${x}" cy="${ey}" r="${6 * k}" fill="${SIL}"/>`; };
const spiral: Thing = (r, x, _y, k) => { const sy = 70 + r() * 80; let d = `M${x} ${sy}`; for (let a = 0; a < 18; a++) { const R = a * 1.6 * k, t = a * 0.7; d += ` L${x + Math.cos(t) * R} ${sy + Math.sin(t) * R}`; } return `<path d="${d}" fill="none" stroke="#f6ead2" stroke-width="1.2" opacity=".85"/>`; };
const stairs: Thing = (_r, x, y, k) => { let d = `M${x - 30 * k} ${y}`; for (let i = 0; i < 6; i++) d += ` v${-9 * k} h${10 * k}`; return `<path d="${d} V${y} Z" fill="${SIL}"/>`; };
const island: Thing = (r, x, y, k, w) => { const iy = 80 + r() * 50; return `<path d="M${x - 26 * k} ${iy} h${52 * k} l${-14 * k} ${22 * k} l${-12 * k} ${10 * k} l${-12 * k} ${-12 * k} Z" fill="${SIL}"/>` + tree(r, x, iy, k * 0.45, w); };
const key: Thing = (r, x, _y, k) => { const ky = 70 + r() * 70; return `<circle cx="${x}" cy="${ky}" r="${7 * k}" fill="none" stroke="#f2a541" stroke-width="2.4"/><path d="M${x + 7 * k} ${ky} h${22 * k} v${6 * k} M${x + 22 * k} ${ky} v${5 * k}" stroke="#f2a541" stroke-width="2.4" fill="none"/>`; };
const fish: Thing = (r, x, _y, k) => { const fy = 60 + r() * 80; return `<path d="M${x - 16 * k} ${fy} Q${x} ${fy - 10 * k} ${x + 14 * k} ${fy} Q${x} ${fy + 10 * k} ${x - 16 * k} ${fy} Z M${x + 14 * k} ${fy} l${8 * k} ${-6 * k} v${12 * k} Z" fill="${pick(r, ACC)}"/>`; };
const lamp: Thing = (_r, x, y, k) => { const h = 60 * k; return `<path d="M${x} ${y} V${y - h}" stroke="${SIL}" stroke-width="2.4"/><circle cx="${x}" cy="${y - h}" r="${5 * k}" fill="#f2a541"/><circle cx="${x}" cy="${y - h}" r="${14 * k}" fill="#f2a541" opacity=".18"/>`; };
const boat: Thing = (_r, x, y, k, water) => { const by = water ? y + 34 : y; return `<path d="M${x - 18 * k} ${by} h${36 * k} l${-7 * k} ${8 * k} h${-22 * k} Z" fill="${SIL}"/><path d="M${x} ${by} V${by - 26 * k} L${x + 14 * k} ${by - 4 * k} Z" fill="#f6ead2"/>`; };
const THINGS: readonly Thing[] = [tree, house, door, bird, balloon, ladder, eye, spiral, stairs, island, key, fish, lamp, boat];

const cache = new Map<string, string>();
const n = (v: number) => Math.round(v * 10) / 10;

/** Pequena "pintura" provisória (SVG 200×300, retrato 2:3) gerada a partir do id da carta. */
export function cardArtSvg(id: string): string {
  const hit = cache.get(id);
  if (hit) return hit;
  const r = mulberry32(Number(id.replace(/\D/g, '')) * 7919 + 17);
  const W = 200, H = 300, g = `dx-sky-${id}`;
  const [s1, s2, night] = pick(r, SKIES);
  let s = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s1}"/><stop offset="1" stop-color="${s2}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#${g})"/>`;
  if (night) for (let i = 0; i < 26; i++) s += `<circle cx="${n(r() * W)}" cy="${n(r() * H * 0.6)}" r="${n(r() * 1.3 + 0.3)}" fill="#f6ead2" opacity="${n(0.4 + r() * 0.6)}"/>`;
  const cx = 30 + r() * 140, cy = 36 + r() * 90, cr = 13 + r() * 18;
  const cc = night ? '#f6ead2' : pick(r, ['#f6ead2', '#f2a541', '#d1495b']);
  s += `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(cr)}" fill="${cc}"/>`;
  if (r() < 0.45) s += `<circle cx="${n(cx + cr * 0.45)}" cy="${n(cy - cr * 0.2)}" r="${n(cr * 0.9)}" fill="${s1}"/>`;
  if (r() < 0.3) s += `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(cr + 8)}" fill="none" stroke="${cc}" stroke-width=".8" opacity=".7"/>`;
  const water = r() < 0.35, groundY = 190 + r() * 50;
  for (let i = 0; i < 3; i++) {
    const y = groundY + i * 26 - 20 + r() * 20, c = LANDS[(i + Math.floor(r() * 6)) % 6]!;
    s += `<path d="M0 ${n(y)} Q ${n(50 + r() * 50)} ${n(y - 30 - r() * 50)} ${n(100 + r() * 20)} ${n(y - r() * 10)} T ${W} ${n(y - 10 + r() * 20)} L${W} ${H} L0 ${H} Z" fill="${c}" opacity="${n(0.85 + i * 0.05)}"/>`;
  }
  if (water) {
    s += `<rect x="0" y="${n(groundY + 30)}" width="${W}" height="${H}" fill="${s1}" opacity=".85"/>`;
    for (let i = 0; i < 6; i++) s += `<path d="M${n(r() * 160)} ${n(groundY + 45 + i * 9)} h${n(15 + r() * 30)}" stroke="#f6ead2" stroke-width=".8" opacity=".5"/>`;
  }
  const count = 2 + Math.floor(r() * 2);
  for (let i = 0; i < count; i++) s += pick(r, THINGS)(r, 20 + r() * 160, groundY - 5 + r() * 25, 0.7 + r() * 0.8, water);
  for (let i = 0; i < 90; i++) s += `<circle cx="${n(r() * W)}" cy="${n(r() * H)}" r=".6" fill="#000" opacity=".12"/>`;
  s += '</svg>';
  cache.set(id, s);
  return s;
}

const ring = (k: number) =>
  `<circle cx="100" cy="150" r="${58 - k * 13}" fill="none" stroke="${k % 2 ? '#2F5046' : '#F2A541'}" stroke-width="${k % 2 ? 6 : 0.9}" opacity="${k % 2 ? 1 : 0.55}" stroke-dasharray="90 40"/>`;

/** Verso provisório: verde-floresta, espirais em mostarda e "dixit". */
export const CARD_BACK_SVG = `<svg viewBox="0 0 200 300" xmlns="http://www.w3.org/2000/svg"><rect width="200" height="300" fill="#1B2F2A"/><rect x="12" y="12" width="176" height="276" rx="6" fill="none" stroke="#F6EAD2" stroke-width=".8" opacity=".6"/>${[0, 1, 2, 3].map(ring).join('')}<text x="100" y="158" text-anchor="middle" font-family="DM Serif Display, serif" font-size="22" fill="#F6EAD2">diquisti</text></svg>`;
```

- [ ] **Step 4:** PASS. Rode também o typecheck do `web`.

- [ ] **Step 5: Commit.** `feat(web): cartas provisórias do Dixit (pinturas geradas pelo id) e verso`

---

### Task 4: Pessoas, status e rótulos (puro)

**Files:**
- Create: `web/src/games/dixit/status.ts`
- Create: `web/test/dixit-fixtures.ts` (usado daqui em diante)
- Test: `web/test/dixit-status.test.ts`

- [ ] **Step 1: Fixtures.** `web/test/dixit-fixtures.ts`:

```ts
import {
  PLAYER_COLORS,
  createRoom,
  isDixitRoomView,
  joinRoom,
  mulberry32,
  roomAction,
  roomView,
  type DixitRoomView,
  type DixitState,
  type GameAction,
  type Room,
} from '@cartolina/shared';

/** Sala de Dixit com `n` jogadores p0…: único lugar que chama `createRoom` (a estante muda a assinatura). */
export function dixitRoom(n: number): Room {
  let room = createRoom('ABCD', 0, null, 'dixit');
  for (let i = 0; i < n; i++) {
    const res = joinRoom(room, { token: `t${i}`, name: `P${i}`, color: PLAYER_COLORS[i]! }, `p${i}`, 0);
    if (!res.ok) throw new Error(res.error);
    room = res.room;
  }
  return room;
}

export function play(room: Room, id: string, action: GameAction, seed = 1): Room {
  const res = roomAction(room, id, action, mulberry32(seed), 0);
  if (!res.ok) throw new Error(`ação recusada: ${res.error}`);
  return res.room;
}

export const stateOf = (room: Room): DixitState => room.game as DixitState;

export function dixitView(room: Room, id: string | null): DixitRoomView {
  const v = roomView(room, id);
  if (!isDixitRoomView(v)) throw new Error('esperava sala de Dixit');
  return v;
}

export const started = (n = 4): Room => play(dixitRoom(n), 'p0', { type: 'start' });

export function told(n = 4, clue = 'saudade'): Room {
  const room = started(n);
  const st = stateOf(room).storyteller!;
  return play(room, st, { type: 'tell', cardId: stateOf(room).hands[st]![0]!, clue });
}

export const othersOf = (room: Room): string[] => stateOf(room).inRound.filter((p) => p !== stateOf(room).storyteller);

export function voting(n = 4): Room {
  let room = told(n);
  const per = n === 3 ? 2 : 1;
  for (const p of othersOf(room)) {
    room = play(room, p, { type: 'submit', cardIds: stateOf(room).hands[p]!.slice(0, per) });
    room = play(room, p, { type: 'confirm' });
  }
  return room;
}

/** Todos votam na carta do narrador (todo mundo achou) ou com `choose`. */
export function revealed(n = 4, choose?: (room: Room, p: string) => string): Room {
  let room = voting(n);
  for (const p of othersOf(room)) {
    room = play(room, p, { type: 'vote', cardId: choose ? choose(room, p) : stateOf(room).storyCard! });
    room = play(room, p, { type: 'confirm' });
  }
  return room;
}
```

- [ ] **Step 2: Testes.** `web/test/dixit-status.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { colorer, namer, othersAfter, phaseLabel, seatStatus } from '../src/games/dixit/status';
import { dixitView, othersOf, revealed, started, stateOf, told, voting } from './dixit-fixtures';

describe('pessoas', () => {
  it('nome de quem vê é "você"; os outros pelo assento', () => {
    const v = dixitView(started(3), 'p1');
    const name = namer(v);
    expect(name('p1')).toBe('você');
    expect(name('p0')).toBe('P0');
    expect(name('zz')).toBe('alguém');
    expect(colorer(v)('p0')).toBe(v.seats[0]!.color);
  });

  it('os outros em ordem a partir de quem vê', () => {
    expect(othersAfter(['p0', 'p1', 'p2', 'p3'], 'p2')).toEqual(['p3', 'p0', 'p1']);
    expect(othersAfter(['p0', 'p1'], null)).toEqual(['p0', 'p1']);
  });
});

describe('status do assento', () => {
  it('narração, escolha e votação', () => {
    let room = started(4);
    const st = stateOf(room).storyteller!;
    const other = othersOf(room)[0]!;
    expect(seatStatus(dixitView(room, null).game, st)).toEqual({ text: 'narrando…', tone: 'act' });
    expect(seatStatus(dixitView(room, null).game, other)).toEqual({ text: 'esperando', tone: '' });
    room = told(4);
    expect(seatStatus(dixitView(room, null).game, othersOf(room)[0]!)).toEqual({ text: 'escolhendo…', tone: 'act' });
    room = voting(4);
    expect(seatStatus(dixitView(room, null).game, othersOf(room)[0]!)).toEqual({ text: 'votando…', tone: 'act' });
  });

  it('rótulo da fase com contagem e meta', () => {
    expect(phaseLabel(dixitView(told(4), null).game)).toBe('escolha · 0 de 3 · meta 30');
    expect(phaseLabel(dixitView(revealed(4), null).game)).toBe('revelação · meta 30');
  });
});
```

- [ ] **Step 3:** FAIL (módulo não existe).

- [ ] **Step 4: Implementar** `web/src/games/dixit/status.ts`:

```ts
import type { DixitView, RoomView } from '@cartolina/shared';

/** Nome por id: quem está vendo é "você". */
export function namer(view: RoomView): (id: string) => string {
  return (id) => (id === view.you ? 'você' : (view.seats.find((s) => s.id === id)?.name ?? 'alguém'));
}

/** Cor (personagem) por id. */
export function colorer(view: RoomView): (id: string) => string {
  return (id) => view.seats.find((s) => s.id === id)?.color ?? '#D9C2A0';
}

/** Os outros jogadores, em ordem, começando depois de quem vê (quem vê fica fora). */
export function othersAfter(seatIds: readonly string[], me: string | null): string[] {
  const i = me ? seatIds.indexOf(me) : -1;
  return i >= 0 ? [...seatIds.slice(i + 1), ...seatIds.slice(0, i)] : [...seatIds];
}

export type Tone = 'act' | 'ok' | '';

/** O que aparece embaixo do personagem de cada assento. */
export function seatStatus(g: DixitView, id: string): { text: string; tone: Tone } {
  if (!g.inRound.includes(id)) return g.phase === 'lobby' || g.phase === 'gameover' ? { text: '', tone: '' } : { text: 'assistindo', tone: '' };
  const teller = g.storyteller === id;
  const done = g.confirmed.includes(id);
  switch (g.phase) {
    case 'storytelling':
      return teller ? { text: 'narrando…', tone: 'act' } : { text: 'esperando', tone: '' };
    case 'submitting':
      return teller ? { text: 'contou ✓', tone: 'ok' } : done ? { text: 'pronto ✓', tone: 'ok' } : { text: 'escolhendo…', tone: 'act' };
    case 'voting':
      return teller ? { text: 'esperando', tone: '' } : done ? { text: 'votou ✓', tone: 'ok' } : { text: 'votando…', tone: 'act' };
    default:
      return { text: '', tone: '' };
  }
}

/** Pílula do topo: fase (com contagem de quem já confirmou) e meta. */
export function phaseLabel(g: DixitView): string {
  const others = g.inRound.filter((p) => p !== g.storyteller);
  const done = others.filter((p) => g.confirmed.includes(p)).length;
  const phase = {
    lobby: 'lobby',
    storytelling: 'narração',
    submitting: `escolha · ${done} de ${others.length}`,
    voting: `votação · ${done} de ${others.length}`,
    reveal: 'revelação',
    gameover: 'fim de jogo',
  }[g.phase];
  return `${phase} · meta ${g.target}`;
}
```

- [ ] **Step 5:** PASS. Rode também o typecheck do `web`. **Commit:** `feat(web): status e nomes da mesa do Dixit, fixtures de teste`

---

### Task 5: Linha do tempo da revelação (puro)

**Files:**
- Create: `web/src/games/dixit/reveal.ts`
- Test: `web/test/dixit-reveal.test.ts`

- [ ] **Step 1: Testes.** `web/test/dixit-reveal.test.ts`:

```ts
import type { DixitRoundResult } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { buildRevealTimeline, captionText, frameAt, fooledParts, reasons, scoresDuring, summaryParts } from '../src/games/dixit/reveal';

const name = (id: string) => ({ n: 'Nina', a: 'Ana', b: 'Bia', c: 'Caio' })[id] ?? id;
const base: Omit<DixitRoundResult, 'votes' | 'gained' | 'found'> = {
  storyteller: 'n',
  storyCard: 'c0',
  clue: 'luar',
  table: ['ca', 'c0', 'cb', 'cc'],
  owners: { c0: 'n', ca: 'a', cb: 'b', cc: 'c' },
};
const some: DixitRoundResult = { ...base, votes: { a: 'c0', b: 'ca', c: 'c0' }, gained: { n: 3, a: 4, b: 0, c: 3 }, found: ['a', 'c'] };
const none: DixitRoundResult = { ...base, votes: { a: 'cb', b: 'ca', c: 'ca' }, gained: { n: 0, a: 4, b: 3, c: 2 }, found: [] };
const all: DixitRoundResult = { ...base, votes: { a: 'c0', b: 'c0', c: 'c0' }, gained: { n: 0, a: 2, b: 2, c: 2 }, found: ['a', 'b', 'c'] };

describe('frases', () => {
  it('quem achou', () => {
    expect(captionText(summaryParts(some, name))).toBe('Ana e Caio acharam a carta do narrador');
    expect(captionText(summaryParts(none, name))).toBe('ninguém achou a carta do narrador');
    expect(captionText(summaryParts(all, name))).toBe('todo mundo achou: a dica foi fácil demais');
  });

  it('quem enganou', () => {
    expect(captionText(fooledParts(none, name))).toBe('a carta de Ana enganou 2 pessoas · a carta de Bia enganou 1 pessoa');
    expect(captionText(fooledParts(all, name))).toBe('nenhuma carta enganou ninguém');
  });
});

describe('motivos dos pontos', () => {
  it('alguns acharam', () => {
    expect(reasons(some, 'n')).toEqual([{ points: 3, text: 'alguém achou a carta, mas não todos' }]);
    expect(reasons(some, 'a')).toEqual([{ points: 3, text: 'achou a carta do narrador' }, { points: 1, text: 'enganou 1 pessoa' }]);
    expect(reasons(some, 'b')).toEqual([{ points: 0, text: 'não achou a carta do narrador' }]);
  });

  it('ninguém e todos acharam; quem não votou', () => {
    expect(reasons(none, 'n')).toEqual([{ points: 0, text: 'ninguém achou a carta: quem narra não pontua' }]);
    expect(reasons(all, 'b')).toEqual([{ points: 2, text: 'todo mundo achou: +2 pra quem votou' }]);
    const partial: DixitRoundResult = { ...some, votes: { a: 'c0', b: 'ca' }, gained: { n: 3, a: 4, b: 0, c: 0 }, found: ['a'] };
    expect(reasons(partial, 'c')).toEqual([{ points: 0, text: 'não votou' }]);
  });
});

describe('linha do tempo', () => {
  const ev = buildRevealTimeline(some, ['n', 'a', 'b', 'c'], name);

  it('holofote primeiro, votos, donos, pulos e fim, em ordem crescente de tempo', () => {
    expect(ev[0]!.kind).toBe('spot');
    expect(ev.filter((e) => e.kind === 'vote')).toHaveLength(3);
    expect(ev.filter((e) => e.kind === 'owner')).toHaveLength(4);
    expect(ev.filter((e) => e.kind === 'hop')).toHaveLength(3 + 4 + 3);
    expect(ev[ev.length - 1]!.kind).toBe('done');
    for (let i = 1; i < ev.length; i++) expect(ev[i]!.at).toBeGreaterThanOrEqual(ev[i - 1]!.at);
  });

  it('quadro no começo, no holofote e no fim', () => {
    const f0 = frameAt(ev, 0);
    expect(f0).toMatchObject({ caption: null, spot: false, storyMarked: false, votes: [], owners: [], done: false });
    const f1 = frameAt(ev, ev[0]!.at);
    expect(f1.spot).toBe(true);
    expect(captionText(f1.caption!.parts)).toBe('esta era a carta de Nina, que narrou “luar”');
    const end = frameAt(ev, Infinity);
    expect(end).toMatchObject({ spot: false, storyMarked: true, done: true, caption: null });
    expect(end.votes).toHaveLength(3);
    expect(end.owners).toEqual(base.table);
    expect(end.hops).toEqual({ n: 3, a: 4, c: 3 });
  });

  it('placar durante a revelação: os pontos novos entram pulo a pulo', () => {
    const scores = { n: 13, a: 14, b: 9, c: 3 };
    expect(scoresDuring(scores, some, frameAt(ev, 0))).toEqual({ n: 10, a: 10, b: 9, c: 0 });
    expect(scoresDuring(scores, some, frameAt(ev, Infinity))).toEqual(scores);
    expect(scoresDuring(scores, null, null)).toEqual(scores);
  });
});
```

- [ ] **Step 2:** FAIL.

- [ ] **Step 3: Implementar** `web/src/games/dixit/reveal.ts`:

```ts
import type { DixitRoundResult } from '@cartolina/shared';

/** Pedaço de legenda; `em` = destaque (nome, dica). */
export interface Part {
  text: string;
  em?: boolean;
}
export interface Caption {
  step: 1 | 2 | 3 | 4;
  parts: Part[];
}
export type RevealEvent =
  | { at: number; kind: 'spot'; caption: Caption }
  | { at: number; kind: 'unspot'; caption: Caption }
  | { at: number; kind: 'caption'; caption: Caption }
  | { at: number; kind: 'vote'; voter: string; card: string; index: number }
  | { at: number; kind: 'owner'; card: string }
  | { at: number; kind: 'hop'; player: string }
  | { at: number; kind: 'done' };

/** O que aparece na mesa num instante da revelação. */
export interface RevealFrame {
  caption: Caption | null;
  /** Holofote na carta do narrador (passo 1). */
  spot: boolean;
  /** A carta do narrador já foi mostrada (fica destacada até o fim). */
  storyMarked: boolean;
  votes: { voter: string; card: string }[];
  /** Cartas cujo dono já apareceu. */
  owners: string[];
  /** Pulos de peão já dados, por jogador. */
  hops: Record<string, number>;
  done: boolean;
}

/** Tempos (ms) aprovados no protótipo. */
export const REVEAL_MS = { start: 400, spot: 2600, vote: 260, afterVotes: 500, summary: 2600, owner: 200, afterOwners: 400, fooled: 2800, hop: 190, betweenPlayers: 250, end: 500 };

type Name = (id: string) => string;

export const captionText = (parts: readonly Part[]): string => parts.map((p) => p.text).join('');

function listParts(ids: readonly string[], name: Name): Part[] {
  const out: Part[] = [];
  ids.forEach((id, i) => {
    if (i > 0) out.push({ text: i === ids.length - 1 ? ' e ' : ', ' });
    out.push({ text: name(id), em: true });
  });
  return out;
}

/** "A e B acharam a carta do narrador" / "ninguém achou…" / "todo mundo achou…". */
export function summaryParts(r: DixitRoundResult, name: Name): Part[] {
  const n = r.found.length, voters = Object.keys(r.votes).length;
  if (n === 0) return [{ text: 'ninguém achou a carta do narrador' }];
  if (n === voters) return [{ text: 'todo mundo achou: a dica foi fácil demais' }];
  return [...listParts(r.found, name), { text: ` ${n === 1 ? 'achou' : 'acharam'} a carta do narrador` }];
}

/** Quantas pessoas cada carta (que não é a do narrador) enganou, da que mais enganou pra menos. */
export function fooledCounts(r: DixitRoundResult): [string, number][] {
  const counts = new Map<string, number>();
  for (const card of Object.values(r.votes)) {
    const owner = r.owners[card];
    if (owner !== undefined && owner !== r.storyteller) counts.set(owner, (counts.get(owner) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

/** "a carta de X enganou 2 pessoas · …" (até 3). */
export function fooledParts(r: DixitRoundResult, name: Name): Part[] {
  const top = fooledCounts(r).slice(0, 3);
  if (top.length === 0) return [{ text: 'nenhuma carta enganou ninguém' }];
  const out: Part[] = [];
  top.forEach(([p, k], i) => {
    if (i > 0) out.push({ text: ' · ' });
    out.push({ text: 'a carta de ' }, { text: name(p), em: true }, { text: ` enganou ${k} ${k === 1 ? 'pessoa' : 'pessoas'}` });
  });
  return out;
}

/** Por que `p` fez os pontos da rodada (regra da caixa). */
export function reasons(r: DixitRoundResult, p: string): { points: number; text: string }[] {
  const voters = Object.keys(r.votes), n = r.found.length, allOrNone = n === 0 || n === voters.length;
  const out: { points: number; text: string }[] = [];
  if (p === r.storyteller) {
    out.push(allOrNone
      ? { points: 0, text: n === 0 ? 'ninguém achou a carta: quem narra não pontua' : 'todo mundo achou a carta: quem narra não pontua' }
      : { points: 3, text: 'alguém achou a carta, mas não todos' });
  } else if (r.votes[p] === undefined) out.push({ points: 0, text: 'não votou' });
  else if (allOrNone) out.push({ points: 2, text: n === 0 ? 'ninguém achou: +2 pra quem votou' : 'todo mundo achou: +2 pra quem votou' });
  else out.push(r.found.includes(p) ? { points: 3, text: 'achou a carta do narrador' } : { points: 0, text: 'não achou a carta do narrador' });
  const bonus = Object.values(r.votes).filter((c) => r.owners[c] === p && p !== r.storyteller).length;
  if (bonus) out.push({ points: bonus, text: `enganou ${bonus} ${bonus === 1 ? 'pessoa' : 'pessoas'}` });
  return out;
}

/** Sequência da revelação narrada; `order` = ordem em que os peões andam (assentos). */
export function buildRevealTimeline(r: DixitRoundResult, order: readonly string[], name: Name): RevealEvent[] {
  const T = REVEAL_MS;
  const ev: RevealEvent[] = [];
  let t = T.start;
  const clue: Part[] = r.clue ? [{ text: ' ' }, { text: `“${r.clue}”`, em: true }] : [];
  ev.push({ at: t, kind: 'spot', caption: { step: 1, parts: [{ text: 'esta era a carta de ' }, { text: name(r.storyteller), em: true }, { text: ', que narrou' }, ...clue] } });
  t += T.spot;
  ev.push({ at: t, kind: 'unspot', caption: { step: 2, parts: [{ text: 'os votos…' }] } });
  Object.entries(r.votes).forEach(([voter, card], index) => {
    t += T.vote;
    ev.push({ at: t, kind: 'vote', voter, card, index });
  });
  t += T.afterVotes;
  ev.push({ at: t, kind: 'caption', caption: { step: 2, parts: summaryParts(r, name) } });
  t += T.summary;
  ev.push({ at: t, kind: 'caption', caption: { step: 3, parts: [{ text: 'de quem era cada carta…' }] } });
  for (const card of r.table) {
    t += T.owner;
    ev.push({ at: t, kind: 'owner', card });
  }
  t += T.afterOwners;
  ev.push({ at: t, kind: 'caption', caption: { step: 3, parts: fooledParts(r, name) } });
  t += T.fooled;
  ev.push({ at: t, kind: 'caption', caption: { step: 4, parts: [{ text: 'os pontos da rodada…' }] } });
  for (const p of order) {
    const g = r.gained[p] ?? 0;
    if (!g) continue;
    for (let i = 0; i < g; i++) {
      t += T.hop;
      ev.push({ at: t, kind: 'hop', player: p });
    }
    t += T.betweenPlayers;
  }
  t += T.end;
  ev.push({ at: t, kind: 'done' });
  return ev;
}

/** O quadro no instante `t` (ms desde o começo da revelação; `Infinity` = pulou pro fim). */
export function frameAt(events: readonly RevealEvent[], t: number): RevealFrame {
  const f: RevealFrame = { caption: null, spot: false, storyMarked: false, votes: [], owners: [], hops: {}, done: false };
  for (const e of events) {
    if (e.at > t) break;
    switch (e.kind) {
      case 'spot':
        f.spot = true;
        f.storyMarked = true;
        f.caption = e.caption;
        break;
      case 'unspot':
        f.spot = false;
        f.caption = e.caption;
        break;
      case 'caption':
        f.caption = e.caption;
        break;
      case 'vote':
        f.votes.push({ voter: e.voter, card: e.card });
        break;
      case 'owner':
        f.owners.push(e.card);
        break;
      case 'hop':
        f.hops[e.player] = (f.hops[e.player] ?? 0) + 1;
        break;
      case 'done':
        f.done = true;
        f.caption = null;
        break;
    }
  }
  return f;
}

/** Placar que os peões mostram: durante a revelação, os pontos novos entram pulo a pulo. */
export function scoresDuring(scores: Readonly<Record<string, number>>, r: DixitRoundResult | null, frame: RevealFrame | null): Record<string, number> {
  if (!r || !frame || frame.done) return { ...scores };
  const out: Record<string, number> = {};
  for (const [p, s] of Object.entries(scores)) out[p] = s - (r.gained[p] ?? 0) + (frame.hops[p] ?? 0);
  return out;
}
```

- [ ] **Step 4:** PASS. Rode também o typecheck do `web`.

- [ ] **Step 5: Commit.** `feat(web): linha do tempo da revelação narrada do Dixit (pura)`

---

### Task 6: Identidade visual: fontes, CSS, arte, fundo e carta ampliada

**Files:**
- Modify: `web/index.html`, `web/src/table/confetti.ts`
- Create: `web/src/games/dixit/dixit.css`, `CardArt.tsx`, `Brushes.tsx`, `CardViewer.tsx`
- Test: `web/test/dixit-ui.test.tsx` (começa aqui)

- [ ] **Step 1: Fontes.** Em `web/index.html`, troque o link das fontes por:

```html
    <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;700&family=Patrick+Hand&family=DM+Serif+Display:ital@0;1&family=Nunito:wght@300;400;600&display=swap" rel="stylesheet" />
```

- [ ] **Step 2: Confete com cores.** Em `web/src/table/confetti.ts`, troque a assinatura por `export function confetti(canvas: HTMLCanvasElement | null, colors: readonly string[] = PLAYER_COLORS): () => void {` e, na criação das partículas, use `c: colors[Math.floor(Math.random() * colors.length)]!,`.

- [ ] **Step 3: CSS.** Crie `web/src/games/dixit/dixit.css`, escopado em `.dixit`. As regras são as do protótipo (`prototipo/dixit/index.html`, bloco `<style>`), com prefixo `dx-` e duas diferenças: os elementos que estavam presos a 1440 px (mesa, mão, legenda, placar, pílula) passam a usar `left: calc(50% - Xpx)`/`left: 50%`, e a raiz é `position: fixed`. Arquivo completo:

```css
.dixit {
  --bg: #233D36; --sf: #2F5046; --cream: #F6EAD2; --must: #F2A541; --mu: #B7C7B0; --deep: #1B2F2A;
  --serif: 'DM Serif Display', Georgia, serif; --ui: 'Nunito', system-ui, sans-serif;
  --spring: cubic-bezier(.34, 1.56, .64, 1);
  position: fixed; inset: 0; overflow: hidden; background: #1d332d; color: var(--cream);
  font-family: var(--ui); font-weight: 300; -webkit-user-select: none; user-select: none;
}
.dixit button { font: inherit; color: inherit; cursor: pointer; }
.dx-stage { position: absolute; left: 50%; top: 50%; height: 900px; transform-origin: 50% 50%; background: var(--bg); overflow: hidden; }
.dx-bg { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }

/* topo */
.dx-logo { position: absolute; left: 30px; top: 20px; margin: 0; font: 400 34px/1 var(--serif); letter-spacing: .5px; z-index: 8; }
.dx-logo small { display: block; font: 300 12px/1.4 var(--ui); color: var(--mu); letter-spacing: 1px; margin-top: 4px; }
.dx-clue { position: absolute; left: 50%; top: 22px; transform: translateX(-50%); display: flex; align-items: center; gap: 10px; padding: 7px 20px 7px 8px; border: .75px solid rgba(242,165,65,.7); border-radius: 999px; background: rgba(35,61,54,.85); z-index: 8; max-width: 640px; white-space: nowrap; }
.dx-clue .who { width: 30px; height: 30px; flex: none; }
.dx-clue .txt { font: italic 400 21px/1.15 var(--serif); overflow: hidden; text-overflow: ellipsis; }
.dx-clue .txt.muted { font: 300 15px/1 var(--ui); color: var(--mu); font-style: normal; }
.dx-pills { position: absolute; right: 26px; top: 22px; display: flex; gap: 10px; z-index: 8; }
.dx-pill { font: 400 13px/1 var(--ui); padding: 9px 14px 8px; border: .75px solid rgba(246,234,210,.45); border-radius: 999px; background: rgba(35,61,54,.85); white-space: nowrap; }
button.dx-pill:hover { border-color: var(--must); }

/* personagens */
.dixit .critter, .dixit .critter svg { display: block; width: 100%; height: 100%; }
.dx-seat { position: absolute; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; gap: 5px; z-index: 4; transition: left .5s var(--spring), top .5s var(--spring); }
.dx-seat.off { opacity: .5; }
.dx-av { width: 56px; height: 56px; position: relative; }
.dx-nm { font: 600 13px/1 var(--ui); letter-spacing: .3px; }
.dx-badge { position: absolute; right: -8px; top: -6px; width: 22px; height: 22px; border-radius: 50%; background: var(--must); color: var(--deep); display: grid; place-items: center; font-size: 12px; border: .75px solid var(--cream); }
.dx-tag { font: 400 11.5px/1 var(--ui); padding: 4px 9px 3px; border: .75px solid rgba(246,234,210,.4); border-radius: 999px; background: rgba(35,61,54,.9); white-space: nowrap; color: var(--mu); }
.dx-tag.ok { color: var(--deep); background: var(--mu); border-color: var(--mu); }
.dx-tag.act { color: var(--must); border-color: rgba(242,165,65,.6); }
.dx-minis { display: flex; gap: 2px; height: 14px; }
.dx-minis i { width: 9px; height: 14px; border: .6px solid rgba(246,234,210,.6); border-radius: 2px; background: var(--sf); }
.dx-float { position: absolute; left: 50%; top: -6px; font: 400 22px/1 var(--serif); color: var(--must); pointer-events: none; animation: dxFloat 1.6s ease-out forwards; }
@keyframes dxFloat { 0% { opacity: 0; transform: translate(-50%, 8px); } 15% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -34px); } }
.dx-me { position: absolute; left: 44px; bottom: 40px; display: flex; align-items: center; gap: 12px; z-index: 6; }
.dx-me .dx-av { width: 64px; height: 64px; }
.dx-me .nm { font: 400 22px/1 var(--serif); }
.dx-me .sub { font-size: 12px; color: var(--mu); margin-top: 5px; }

/* mesa 3D */
.dx-felt-wrap { position: absolute; left: calc(50% - 500px); top: 118px; width: 1000px; height: 560px; perspective: 1150px; perspective-origin: 50% 0%; z-index: 1; }
.dx-felt { position: absolute; inset: 0; transform-origin: 50% 100%; transform: rotateX(var(--tilt)); transform-style: preserve-3d; transition: transform .7s var(--spring); border-radius: 36px; background: var(--sf); border: .75px solid rgba(246,234,210,.55); box-shadow: inset 0 0 0 9px var(--sf), inset 0 0 0 9.75px rgba(246,234,210,.18); }
.dx-cell { position: absolute; width: 34px; height: 34px; margin: -17px 0 0 -17px; border: .75px solid rgba(246,234,210,.35); border-radius: 9px; display: grid; place-items: center; font: 400 13px/1 var(--serif); color: rgba(246,234,210,.5); }
.dx-cell.five { border-color: rgba(246,234,210,.6); color: var(--cream); }
.dx-cell.goal { border-color: var(--must); color: var(--must); box-shadow: 0 0 0 3px rgba(242,165,65,.15); }
.dx-pawn { position: absolute; width: 40px; height: 40px; transform-origin: 50% 100%; transform: translate(-50%, -100%) rotateX(calc(var(--tilt) * -1)); transition: left .16s linear, top .16s linear; z-index: 2; }
.dx-felt-msg { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); font: italic 400 26px/1.3 var(--serif); color: rgba(246,234,210,.55); text-align: center; width: 640px; pointer-events: none; }

/* cartas na mesa: nunca afundam no feltro (mola só subindo; sempre 2px acima; levanta ao virar) */
.dx-tcard { position: absolute; width: 118px; height: 177px; transform-origin: 50% 100%; transform-style: preserve-3d; --stand: .28; --z: 2px; --sc: 1;
  transform: translate(-50%, -100%) rotateX(calc(var(--tilt) * -1 * var(--stand))) translateZ(var(--z)) scale(var(--sc));
  transition: transform .35s cubic-bezier(.2, .8, .25, 1), opacity .5s ease, filter .5s ease; cursor: pointer; z-index: 3; }
.dx-tcard:hover, .dx-tcard.voted { --stand: 1; --z: 18px; z-index: 5; transition: transform .45s var(--spring), opacity .5s ease, filter .5s ease; }
.dx-tcard.back { cursor: default; animation: dxDrop .52s cubic-bezier(.2, .9, .3, 1); }
@keyframes dxDrop { from { opacity: 0; transform: translate(-50%, -100%) translateZ(160px) rotateZ(-8deg); } }
.dx-flip { position: absolute; inset: 0; transform-style: preserve-3d; }
.dx-tcard.flip-in .dx-flip { animation: dxFlipIn .65s cubic-bezier(.34, 1.4, .64, 1) both; animation-delay: calc(var(--i) * 120ms); }
@keyframes dxFlipIn { from { transform: translateZ(70px) rotateY(180deg); } to { transform: translateZ(0) rotateY(0); } }
.dx-face { position: absolute; inset: 0; border-radius: 4px; padding: 3px; border: .75px solid var(--cream); background: var(--bg); backface-visibility: hidden; }
.dx-art { width: 100%; height: 100%; border-radius: 2px; overflow: hidden; display: block; object-fit: cover; }
.dx-art svg { width: 100%; height: 100%; display: block; }
.dx-tcard.voted .dx-face { outline: .75px solid var(--must); outline-offset: 3px; }
.dx-tcard.story { --stand: 1; --sc: 1.16; --z: 34px; z-index: 8; transition: transform .5s var(--spring), opacity .5s ease, filter .5s ease; }
.dx-tcard.story .dx-face { outline: 1.5px solid var(--must); outline-offset: 4px; animation: dxGlow 1.8s ease-in-out infinite; }
.dx-tcard.story.spot { --sc: 1.55; --z: 90px; z-index: 9; transition: transform .7s cubic-bezier(.3, 1.7, .5, 1); }
.dx-tcard.story.spot .dx-face { outline-width: 2px; outline-offset: 6px; animation: dxGlowBig 1.4s ease-in-out infinite; }
@keyframes dxGlow { 0%, 100% { box-shadow: 0 0 18px 3px rgba(242,165,65,.3); } 50% { box-shadow: 0 0 34px 9px rgba(242,165,65,.6); } }
@keyframes dxGlowBig { 0%, 100% { box-shadow: 0 0 30px 8px rgba(242,165,65,.45); } 50% { box-shadow: 0 0 56px 18px rgba(242,165,65,.75); } }
.dx-tcard.dim { opacity: .32; filter: saturate(.35) brightness(.75); }
.dx-roman { position: absolute; left: 50%; top: 100%; transform: translateX(-50%); margin-top: 6px; font: 400 19px/1 var(--serif); }
.dx-tcard.voted .dx-roman { color: var(--must); }
.dx-tag-story { position: absolute; left: 50%; bottom: 100%; transform: translateX(-50%); margin-bottom: 12px; font: italic 400 17px/1 var(--serif); color: var(--must); white-space: nowrap; text-shadow: 0 1px 8px rgba(27,47,42,.9); animation: dxPopX .5s var(--spring); }
.dx-tokens { position: absolute; left: 4px; right: 4px; bottom: 8px; display: flex; flex-wrap: wrap; gap: 2px; justify-content: center; }
.dx-tokens span { width: 26px; height: 26px; animation: dxPop .45s var(--spring); }
.dx-owner { position: absolute; left: 50%; top: 100%; transform: translateX(-50%); margin-top: 30px; display: flex; align-items: center; gap: 5px; font: 600 12px/1 var(--ui); white-space: nowrap; animation: dxPopX .45s var(--spring); }
.dx-owner .critter { width: 22px; height: 22px; }
.dx-mine { position: absolute; top: 7px; left: 7px; font: 400 10.5px/1 var(--ui); padding: 2px 6px; border: .5px solid var(--cream); background: var(--bg); border-radius: 6px; }
.dx-zoom { position: absolute; top: 6px; right: 6px; width: 24px; height: 24px; border-radius: 50%; border: .5px solid var(--cream); background: rgba(27,47,42,.85); display: none; place-items: center; font-size: 13px; z-index: 2; padding: 0; }
.dx-tcard:hover .dx-zoom, .dx-hcard:hover .dx-zoom { display: grid; }
@keyframes dxPop { 0% { transform: scale(.2); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
@keyframes dxPopX { 0% { transform: translateX(-50%) scale(.2); opacity: 0; } 100% { transform: translateX(-50%) scale(1); opacity: 1; } }

/* mão */
.dx-hand { position: absolute; left: calc(50% - 420px); width: 840px; bottom: 0; height: 230px; z-index: 6; }
.dx-hcard { position: absolute; bottom: 20px; width: 124px; height: 186px; margin-left: -62px; transform-origin: 50% 120%; --hov: 0px; --hs: 1;
  transform: translateY(calc(var(--lift) + var(--hov))) rotate(var(--rot)) scale(var(--hs)); transition: transform .35s var(--spring), opacity .3s; cursor: pointer; border-radius: 4px; padding: 3px; border: .75px solid var(--cream); background: var(--bg); }
.dx-hcard:hover { --hov: -22px; --hs: 1.06; z-index: 5; }
.dx-hcard.sel { outline: 1.5px solid var(--must); outline-offset: 4px; }
.dx-hcard.played::after { content: 'na mesa'; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); font: italic 400 16px/1 var(--serif); color: var(--must); background: rgba(27,47,42,.85); padding: 6px 10px; border: .5px solid var(--must); border-radius: 999px; }
.dx-hand.off .dx-hcard { opacity: .5; }

/* painel */
.dx-panel { position: absolute; right: 34px; bottom: 34px; width: 270px; padding: 16px 18px; border: .75px solid rgba(246,234,210,.4); border-radius: 14px; background: rgba(27,47,42,.92); z-index: 7; }
.dx-panel h3 { margin: 0 0 6px; font: 400 22px/1.1 var(--serif); }
.dx-panel p { margin: 0 0 10px; color: var(--mu); font-size: 13.5px; line-height: 1.45; }
.dx-panel textarea { width: 100%; height: 58px; resize: none; border: .75px solid rgba(246,234,210,.4); border-radius: 10px; background: rgba(35,61,54,.9); color: var(--cream); font: italic 400 17px/1.25 var(--serif); padding: 8px 10px; outline: none; }
.dx-panel textarea:focus { border-color: var(--must); }
.dx-cnt { font-size: 11px; color: var(--mu); text-align: right; margin: 3px 0 8px; }
.dx-err { color: #ffb4a8; font-size: 12px; margin-top: 6px; min-height: 14px; }
.dx-btn { display: block; width: 100%; padding: 10px 12px; border: .75px solid var(--must); border-radius: 999px; background: var(--must); color: var(--deep) !important; font: 600 14px/1 var(--ui); transition: transform .2s var(--spring); }
.dx-btn:hover { transform: translateY(-1px); }
.dx-btn.ghost { background: none; color: var(--must) !important; margin-top: 8px; }

/* legenda, placar, aviso, carta ampliada, confete */
.dx-step { position: absolute; left: 50%; bottom: 196px; transform: translateX(-50%); display: flex; align-items: center; gap: 14px; padding: 12px 16px 12px 22px; border: .75px solid rgba(242,165,65,.75); border-radius: 16px; background: rgba(27,47,42,.95); z-index: 9; min-width: 640px; max-width: 860px; animation: dxCenterIn .4s var(--spring); }
.dx-step .n { font: 400 13px/1 var(--ui); color: var(--must); letter-spacing: 1px; white-space: nowrap; }
.dx-step .t { flex: 1; font: 400 24px/1.2 var(--serif); }
.dx-step em { color: var(--must); }
.dx-step .n, .dx-step .t { transition: opacity .18s ease; }
.dx-step.swap .n, .dx-step.swap .t { opacity: 0; }
.dx-step button { border: .75px solid rgba(246,234,210,.4); border-radius: 999px; background: none; padding: 6px 12px; font-size: 12px; color: var(--mu); white-space: nowrap; }
@keyframes dxCenterIn { 0% { opacity: 0; transform: translateX(-50%) translateY(10px) scale(.96); } 100% { opacity: 1; transform: translateX(-50%); } }
.dx-board { position: absolute; left: 50%; top: 196px; transform: translateX(-50%); width: 560px; max-height: 660px; overflow: auto; padding: 20px 22px 18px; border: .75px solid rgba(246,234,210,.5); border-radius: 16px; background: rgba(27,47,42,.97); z-index: 20; animation: dxCenterIn .4s var(--spring); }
.dx-board h3 { margin: 0 0 4px; font: 400 28px/1.1 var(--serif); }
.dx-board .sum { margin: 0 0 14px; color: var(--mu); font-size: 14px; }
.dx-board .sum em { color: var(--cream); }
.dx-row { display: grid; grid-template-columns: 34px 1fr auto auto; align-items: center; gap: 12px; padding: 9px 0; border-top: .5px solid rgba(246,234,210,.15); }
.dx-row .critter { width: 34px; height: 34px; }
.dx-row .nm { font: 600 14px/1.2 var(--ui); }
.dx-row.st .nm::after { content: ' · narrou'; font-weight: 300; color: var(--must); }
.dx-row .why { font-size: 12.5px; color: var(--mu); margin-top: 3px; line-height: 1.35; }
.dx-row .g { font: 400 26px/1 var(--serif); color: var(--must); min-width: 44px; text-align: right; }
.dx-row .g.zero { color: rgba(246,234,210,.35); }
.dx-row .tot { font-size: 12px; color: var(--mu); min-width: 58px; text-align: right; }
.dx-board .acts { display: flex; gap: 10px; margin-top: 14px; }
.dx-board .acts .dx-btn { margin: 0; }
.dx-board .wait { color: var(--mu); font-size: 13px; margin: 12px 0 0; }
.dx-board-pill { position: absolute; left: 50%; bottom: 204px; transform: translateX(-50%); z-index: 20; font-size: 14px; padding: 10px 18px 9px; border-color: rgba(242,165,65,.75); }
.dx-toast { position: absolute; left: 50%; bottom: 262px; transform: translateX(-50%); padding: 8px 16px; border-radius: 999px; background: var(--cream); color: var(--deep); font: 600 13px/1 var(--ui); z-index: 40; pointer-events: none; }
.dx-viewer { position: absolute; inset: 0; background: rgba(12,22,19,.82); z-index: 50; display: flex; align-items: center; justify-content: center; gap: 34px; }
.dx-big { width: 420px; height: 630px; padding: 5px; border: .75px solid var(--cream); border-radius: 6px; background: var(--bg); animation: dxPop .35s var(--spring); }
.dx-nav { width: 46px; height: 46px; border-radius: 50%; border: .75px solid rgba(246,234,210,.5); background: none; font-size: 22px; }
.dx-cap { position: absolute; bottom: 40px; left: 0; right: 0; text-align: center; color: var(--mu); font-size: 13px; }
.dx-cap b { font: 400 22px/1 var(--serif); color: var(--cream); display: block; margin-bottom: 6px; }
.dx-confetti { position: fixed; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 45; }

/* lobby */
.dx-lobby { position: relative; z-index: 1; min-height: 100%; display: flex; flex-direction: column; align-items: center; gap: 20px; padding: 48px 16px; overflow: auto; height: 100%; }
.dx-lobby .dx-logo { position: static; font-size: 56px; text-align: center; }
.dx-sheet { width: min(520px, 100%); padding: 22px 24px; border: .75px solid rgba(246,234,210,.45); border-radius: 18px; background: rgba(27,47,42,.92); display: flex; flex-direction: column; gap: 12px; }
.dx-sheet h2 { margin: 0; font: 400 26px/1 var(--serif); }
.dx-sheet p { margin: 0; color: var(--mu); font-size: 14px; }
.dx-people { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 10px 18px; }
.dx-people li { display: flex; align-items: center; gap: 8px; font-size: 14px; }
.dx-people li.off { opacity: .45; }
.dx-people .critter { width: 34px; height: 34px; }
.dx-targets { display: flex; gap: 10px; }
.dx-targets button { flex: 1; padding: 12px; border: .75px solid rgba(246,234,210,.4); border-radius: 12px; background: none; text-align: left; }
.dx-targets button[aria-pressed='true'] { border-color: var(--must); color: var(--must); }
.dx-targets b { display: block; font: 400 24px/1 var(--serif); }
.dx-link { width: 100%; padding: 8px 10px; border-radius: 10px; border: .75px solid rgba(246,234,210,.4); background: rgba(35,61,54,.9); color: var(--cream); }
```

- [ ] **Step 4: Componentes visuais.**

`web/src/games/dixit/CardArt.tsx`:

```tsx
import { CARD_BACK_SVG, REAL_ART, cardArtSvg, cardImageUrl } from './art';

/** Frente da carta: a arte real (quando existir) ou a pintura provisória gerada pelo id. */
export function CardArt({ id }: { id: string }) {
  if (REAL_ART) return <img className="dx-art" src={cardImageUrl(id)} alt="" draggable={false} />;
  // SVG gerado localmente a partir do id (nada vindo de jogador): seguro como HTML.
  return <div className="dx-art" dangerouslySetInnerHTML={{ __html: cardArtSvg(id) }} />;
}

export function CardBack() {
  return <div className="dx-art" dangerouslySetInnerHTML={{ __html: CARD_BACK_SVG }} />;
}
```

`web/src/games/dixit/Brushes.tsx`:

```tsx
import { mulberry32 } from '@cartolina/shared';
import { useMemo } from 'react';

const GREENS = ['#28443c', '#2a473f', '#26403a', '#2c4a41'];

/** Fundo de pinceladas suaves (verdes perto do fundo + espirais mostarda quase transparentes). */
export function Brushes({ width, height = 900 }: { width: number; height?: number }) {
  const paths = useMemo(() => {
    const r = mulberry32(5);
    const strokes = Array.from({ length: Math.round((70 * width) / 1440) }, (_, i) => {
      const x = r() * width, y = r() * height, l = 90 + r() * 200, a = r() * 50 - 25;
      return <path key={`s${i}`} d={`M${x} ${y} q${l / 2} ${a} ${l} 0`} stroke={GREENS[i % 4]} strokeWidth={4 + r() * 7} fill="none" strokeLinecap="round" />;
    });
    const spirals = [[120, 120, 60], [width - 110, 140, 50], [width - 90, height - 140, 66], [90, height - 130, 44], [width / 2, height - 40, 40]].flatMap(([x, y, R], j) =>
      [0, 1, 2, 3].map((k) => (
        <circle key={`c${j}-${k}`} cx={x} cy={y} r={R! - k * 11} stroke={k % 2 ? '#2c4a41' : '#F2A541'} strokeWidth={k % 2 ? 4 : 0.7} fill="none" opacity={k % 2 ? 1 : 0.13} strokeDasharray={`${R! * 2} ${R}`} />
      )),
    );
    return [...strokes, ...spirals];
  }, [width, height]);
  return (
    <svg className="dx-bg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      {paths}
    </svg>
  );
}
```

`web/src/games/dixit/CardViewer.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import { CardArt } from './CardArt';

interface Props {
  ids: readonly string[];
  index: number;
  label: (id: string, index: number) => string;
  onIndex: (index: number) => void;
  onClose: () => void;
}

/** Carta ampliada: setas navegam; rodinha pra baixo, Esc ou clique fora fecham. */
export function CardViewer({ ids, index, label, onIndex, onClose }: Props) {
  const opened = useRef(Date.now());
  const id = ids[index];
  const go = (d: number) => onIndex((index + d + ids.length) % ids.length);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onIndex((index - 1 + ids.length) % ids.length);
      if (e.key === 'ArrowRight') onIndex((index + 1) % ids.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ids.length, index, onClose, onIndex]);
  if (!id) return null;
  return (
    <div
      className="dx-viewer"
      role="dialog"
      aria-label="carta ampliada"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onWheel={(e) => {
        // o resto do mesmo giro que abriu não fecha na hora
        if (e.deltaY > 0 && Date.now() - opened.current > 350) onClose();
      }}
    >
      <button className="dx-nav" type="button" aria-label="carta anterior" onClick={() => go(-1)}>
        ‹
      </button>
      <div className="dx-big">
        <CardArt id={id} />
      </div>
      <button className="dx-nav" type="button" aria-label="próxima carta" onClick={() => go(1)}>
        ›
      </button>
      <div className="dx-cap">
        <b>{label(id, index)}</b>setas ‹ › navegam · rodinha pra baixo, Esc ou clique fora fecha
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Teste da carta ampliada.** Crie `web/test/dixit-ui.test.tsx`:

```tsx
import { act as rtlAct, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CardViewer } from '../src/games/dixit/CardViewer';

describe('carta ampliada', () => {
  it('Esc fecha; setas navegam; rodinha pra baixo fecha (não logo ao abrir)', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const onIndex = vi.fn();
    render(<CardViewer ids={['d001', 'd002']} index={0} label={(_id, i) => `carta ${i + 1}`} onIndex={onIndex} onClose={onClose} />);
    expect(screen.getByText('carta 1')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onIndex).toHaveBeenCalledWith(1);
    const dialog = screen.getByRole('dialog', { name: 'carta ampliada' });
    fireEvent.wheel(dialog, { deltaY: 100 });
    expect(onClose).not.toHaveBeenCalled();
    rtlAct(() => vi.advanceTimersByTime(400));
    fireEvent.wheel(dialog, { deltaY: 100 });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 6:** `cd web && npx vitest run test/dixit-ui.test.tsx` deve dar PASS. Rode também `npm run typecheck -w web` e `npm test -w web` (o confete continua funcionando no ITO, que usa a cor padrão).

- [ ] **Step 7: Commit.** `feat(web): identidade do Dixit (fontes, CSS, arte, fundo, carta ampliada)`

---

### Task 7: Feltro, assentos e mão

**Files:**
- Create: `web/src/games/dixit/Felt.tsx`, `Seats.tsx`, `Hand.tsx`
- Test: `web/test/dixit-ui.test.tsx`

- [ ] **Step 1: Testes.** Acrescente ao topo de `web/test/dixit-ui.test.tsx` os imports:

```tsx
import { Felt } from '../src/games/dixit/Felt';
import { Hand } from '../src/games/dixit/Hand';
import { Seats } from '../src/games/dixit/Seats';
import { colorer, namer } from '../src/games/dixit/status';
import { dixitView, revealed, started, told, voting } from './dixit-fixtures';
```

e no fim:

```tsx
describe('mão', () => {
  it('clicar escolhe; ⤢ amplia; fora da vez a mão fica apagada', () => {
    const onPick = vi.fn();
    const onZoom = vi.fn();
    const { container, rerender } = render(<Hand ids={['d001', 'd002']} selected={['d002']} played={[]} canPick onPick={onPick} onZoom={onZoom} />);
    fireEvent.click(screen.getByRole('button', { name: 'sua carta 1' }));
    expect(onPick).toHaveBeenCalledWith('d001');
    expect(screen.getByRole('button', { name: 'sua carta 2' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getAllByRole('button', { name: 'ampliar' })[0]!);
    expect(onZoom).toHaveBeenCalledWith('d001');
    rerender(<Hand ids={['d001']} selected={[]} played={[]} canPick={false} onPick={onPick} onZoom={onZoom} />);
    expect(container.querySelector('.dx-hand.off')).toBeTruthy();
  });
});

describe('feltro', () => {
  const props = (v: ReturnType<typeof dixitView>) => ({ view: v, name: namer(v), color: colorer(v), frame: null, scores: v.game.scores, onCard: vi.fn(), onZoom: vi.fn() });

  it('trilha 0…meta e um peão por jogador', () => {
    const v = dixitView(started(4), 'p0');
    const { container } = render(<Felt {...props(v)} />);
    expect(container.querySelectorAll('.dx-cell')).toHaveLength(31);
    expect(container.querySelectorAll('.dx-pawn')).toHaveLength(4);
    expect(screen.getByText(/está escolhendo a carta|escolha uma carta e conte uma dica/)).toBeTruthy();
  });

  it('na escolha, versos; na votação, cartas com números romanos clicáveis', () => {
    let v = dixitView(told(4), 'p0');
    const { container, rerender } = render(<Felt {...props(v)} />);
    expect(container.querySelectorAll('.dx-tcard.back')).toHaveLength(1);
    v = dixitView(voting(4), 'p0');
    const p = props(v);
    rerender(<Felt {...p} />);
    expect(screen.getByRole('button', { name: 'carta I' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'carta II' }));
    expect(p.onCard).toHaveBeenCalledWith(v.game.table[1]!.cardId);
  });

  it('no fim de jogo mostra a carta do narrador, votos e donos', () => {
    let room = revealed(4);
    room = { ...room, game: { ...room.game, phase: 'gameover' } as typeof room.game };
    const v = dixitView(room, 'p0');
    const { container } = render(<Felt {...props(v)} />);
    expect(screen.getByText('carta do narrador')).toBeTruthy();
    expect(container.querySelectorAll('.dx-tokens span')).toHaveLength(3);
    expect(container.querySelectorAll('.dx-owner')).toHaveLength(4);
  });
});

describe('assentos', () => {
  it('os outros no arco, com status; você embaixo com pontos', () => {
    const v = dixitView(told(4), 'p0');
    const { container } = render(<Seats view={v} width={1440} name={namer(v)} gained={{}} floatKey="" />);
    expect(container.querySelectorAll('.dx-seat')).toHaveLength(3);
    expect(screen.getByText('você')).toBeTruthy();
    expect(screen.getAllByText(/escolhendo…|contou ✓/).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2:** FAIL (componentes não existem).

- [ ] **Step 3: Implementar.**

`web/src/games/dixit/Hand.tsx`:

```tsx
import type { CSSProperties } from 'react';
import { CardArt } from './CardArt';

interface Props {
  ids: readonly string[];
  selected: readonly string[];
  /** Escolhidas e confirmadas (ainda na mão até a votação). */
  played: readonly string[];
  canPick: boolean;
  onPick: (id: string) => void;
  onZoom: (id: string) => void;
}

/** Sua mão, plana, em leque. A carta escolhida sobe com moldura mostarda. */
export function Hand({ ids, selected, played, canPick, onPick, onZoom }: Props) {
  const mid = (ids.length - 1) / 2;
  return (
    <div className={`dx-hand${canPick ? '' : ' off'}`}>
      {ids.map((id, i) => {
        const sel = selected.includes(id), isPlayed = played.includes(id);
        const style = { left: 420 + (i - mid) * 116, '--rot': `${(i - mid) * 2.6}deg`, '--lift': sel || isPlayed ? '-34px' : '0px' } as CSSProperties;
        return (
          <div
            key={id}
            className={`dx-hcard${sel ? ' sel' : ''}${isPlayed ? ' played' : ''}`}
            style={style}
            role="button"
            tabIndex={0}
            aria-label={`sua carta ${i + 1}`}
            aria-pressed={sel}
            data-card-id={id}
            data-zoom="hand"
            onClick={() => onPick(id)}
            onDoubleClick={() => onZoom(id)}
          >
            <CardArt id={id} />
            <button
              type="button"
              className="dx-zoom"
              aria-label="ampliar"
              onClick={(e) => {
                e.stopPropagation();
                onZoom(id);
              }}
            >
              ⤢
            </button>
          </div>
        );
      })}
    </div>
  );
}
```

`web/src/games/dixit/Felt.tsx`:

```tsx
import type { DixitRoomView } from '@cartolina/shared';
import { useMemo, type CSSProperties } from 'react';
import { Critter } from '../../screens/Critter';
import { CardArt, CardBack } from './CardArt';
import { ROMAN, pawnSpots, tableSlots, trackPoints } from './geometry';
import type { RevealFrame } from './reveal';

interface Props {
  view: DixitRoomView;
  name: (id: string) => string;
  color: (id: string) => string;
  /** Quadro da revelação (null fora dela). */
  frame: RevealFrame | null;
  /** Pontos que os peões mostram (andam pulo a pulo na revelação). */
  scores: Readonly<Record<string, number>>;
  onCard: (cardId: string) => void;
  onZoom: (cardId: string) => void;
}

/** Feltro em perspectiva: trilha de casas, peões e as cartas da rodada. */
export function Felt({ view, name, color, frame, scores, onCard, onZoom }: Props) {
  const g = view.game;
  const cells = useMemo(() => trackPoints(g.target + 1), [g.target]);
  const spots = pawnSpots(g.players, scores, cells);
  const faceUp = g.phase === 'voting' || g.phase === 'reveal' || g.phase === 'gameover';
  const slots = tableSlots(faceUp ? g.table.length : Math.max(g.tableCount, 1));
  const r = g.result;
  const over = g.phase === 'gameover';
  const votes = frame ? frame.votes : over && r ? Object.entries(r.votes).map(([voter, card]) => ({ voter, card })) : [];
  const owners = frame ? frame.owners : over && r ? r.table : [];
  const storyMarked = frame ? frame.storyMarked : over;
  const spot = !!frame?.spot;
  const message =
    g.paused ? 'esperando gente: precisa de 3 pessoas na mesa'
    : g.phase === 'storytelling' && g.storyteller ? (g.storyteller === view.you ? 'escolha uma carta e conte uma dica' : `${name(g.storyteller)} está escolhendo a carta…`)
    : null;

  return (
    <div className="dx-felt-wrap">
      <div className="dx-felt">
        {cells.map(([x, y], i) => (
          <div key={i} className={`dx-cell${i % 5 === 0 ? ' five' : ''}${i === g.target ? ' goal' : ''}`} style={{ left: x, top: y }}>
            {i % 5 === 0 || i === g.target ? i : ''}
          </div>
        ))}
        {g.players.map((p) => {
          const at = spots[p];
          if (!at) return null;
          return (
            <div key={p} className="dx-pawn" style={{ left: at[0], top: at[1], zIndex: 10 + Math.round(at[1]) }} title={`${name(p)}: ${g.scores[p] ?? 0} pontos`} aria-label={`${name(p)}: ${g.scores[p] ?? 0} pontos`}>
              <Critter color={color(p)} />
            </div>
          );
        })}
        {message && <div className="dx-felt-msg">{message}</div>}
        {g.phase === 'submitting' &&
          Array.from({ length: g.tableCount }, (_, i) => {
            const [x, y] = slots[i]!;
            return (
              <div key={`back${i}`} className="dx-tcard back" style={{ left: x, top: y }}>
                <div className="dx-flip">
                  <div className="dx-face">
                    <CardBack />
                  </div>
                </div>
              </div>
            );
          })}
        {faceUp &&
          g.table.map((t, i) => {
            const [x, y] = slots[i]!;
            const isStory = storyMarked && r?.storyCard === t.cardId;
            const tokens = votes.filter((v) => v.card === t.cardId);
            const owner = r && owners.includes(t.cardId) ? r.owners[t.cardId] : undefined;
            const cls = ['dx-tcard', g.phase === 'voting' && 'flip-in', g.phase === 'voting' && g.myVote === t.cardId && 'voted', isStory && 'story', isStory && spot && 'spot', spot && !isStory && 'dim']
              .filter(Boolean)
              .join(' ');
            return (
              <div
                key={t.cardId}
                className={cls}
                style={{ left: x, top: y, '--i': i } as CSSProperties}
                role="button"
                tabIndex={0}
                aria-label={`carta ${ROMAN[i]}`}
                data-card-id={t.cardId}
                data-zoom="table"
                onClick={() => onCard(t.cardId)}
                onDoubleClick={() => onZoom(t.cardId)}
              >
                <div className="dx-flip">
                  <div className="dx-face">
                    <CardArt id={t.cardId} />
                    {t.mine && <span className="dx-mine">sua</span>}
                    {tokens.length > 0 && (
                      <div className="dx-tokens">
                        {tokens.map((v) => (
                          <span key={v.voter} title={name(v.voter)}>
                            <Critter color={color(v.voter)} />
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {isStory && <div className="dx-tag-story">carta do narrador</div>}
                <div className="dx-roman">{ROMAN[i]}</div>
                {owner && (
                  <div className="dx-owner">
                    <Critter color={color(owner)} />
                    {name(owner)}
                  </div>
                )}
                <button
                  type="button"
                  className="dx-zoom"
                  aria-label="ampliar"
                  onClick={(e) => {
                    e.stopPropagation();
                    onZoom(t.cardId);
                  }}
                >
                  ⤢
                </button>
              </div>
            );
          })}
      </div>
    </div>
  );
}
```

`web/src/games/dixit/Seats.tsx`:

```tsx
import type { DixitRoomView } from '@cartolina/shared';
import { Critter } from '../../screens/Critter';
import { seatArc } from './geometry';
import { othersAfter, seatStatus } from './status';

interface Props {
  view: DixitRoomView;
  width: number;
  name: (id: string) => string;
  /** "+n" sobre o assento quando o peão começa a andar. */
  gained: Readonly<Record<string, number>>;
  /** Muda a cada revelação (reinicia a animação do "+n"). */
  floatKey: string;
}

/** Outros jogadores num arco acima da mesa; você embaixo à esquerda. */
export function Seats({ view, width, name, gained, floatKey }: Props) {
  const g = view.game;
  const others = othersAfter(view.seats.map((s) => s.id), view.you);
  const me = view.you ? view.seats.find((s) => s.id === view.you) : undefined;
  const myStatus = me ? seatStatus(g, me.id).text : '';
  return (
    <>
      {others.map((id, i) => {
        const seat = view.seats.find((s) => s.id === id)!;
        const [x, y] = seatArc(i, others.length, width);
        const st = seatStatus(g, id);
        return (
          <div key={id} className={`dx-seat${seat.connected ? '' : ' off'}`} style={{ left: x, top: y }} title={`${seat.name}: ${g.scores[id] ?? 0} pontos`}>
            <div className="dx-av">
              <Critter color={seat.color} />
              {g.storyteller === id && g.phase !== 'gameover' && (
                <span className="dx-badge" title="narrador">
                  ✎
                </span>
              )}
              {gained[id] ? (
                <span key={floatKey} className="dx-float">
                  +{gained[id]}
                </span>
              ) : null}
            </div>
            <div className="dx-nm">{seat.name}</div>
            <div className="dx-minis">
              {Array.from({ length: Math.min(g.handCounts[id] ?? 0, 7) }, (_, k) => (
                <i key={k} />
              ))}
            </div>
            {st.text && <div className={`dx-tag ${st.tone}`}>{st.text}</div>}
          </div>
        );
      })}
      {me && (
        <div className="dx-me" title={`você: ${g.scores[me.id] ?? 0} pontos`}>
          <div className="dx-av">
            <Critter color={me.color} />
            {g.storyteller === me.id && g.phase !== 'gameover' && <span className="dx-badge">✎</span>}
            {gained[me.id] ? (
              <span key={floatKey} className="dx-float">
                +{gained[me.id]}
              </span>
            ) : null}
          </div>
          <div>
            <div className="nm">{name(me.id)}</div>
            <div className="sub">
              {g.scores[me.id] ?? 0} pontos{myStatus ? ` · ${myStatus}` : ''}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4:** `cd web && npx vitest run test/dixit-ui.test.tsx` deve dar PASS. Rode também o typecheck do `web`.

- [ ] **Step 5: Commit.** `feat(web): feltro 3D, assentos e mão do Dixit`

---

### Task 8: Painel de ação e barra do topo

**Files:**
- Create: `web/src/games/dixit/ActionPanel.tsx`, `DixitTopBar.tsx`
- Test: `web/test/dixit-ui.test.tsx`

- [ ] **Step 1: Testes.** Acrescente aos imports de `web/test/dixit-ui.test.tsx`:

```tsx
import { ActionPanel, type PanelActions } from '../src/games/dixit/ActionPanel';
import { DixitTopBar } from '../src/games/dixit/DixitTopBar';
import { othersOf, stateOf } from './dixit-fixtures';
```

e no fim:

```tsx
const actions = (): PanelActions => ({ tell: vi.fn(), submit: vi.fn(), confirmVote: vi.fn(), next: vi.fn(), again: vi.fn(), lobby: vi.fn() });

describe('painel de ação', () => {
  it('quem narra: pede carta antes; com carta, conta a dica escrita', () => {
    const room = started(4);
    const st = stateOf(room).storyteller!;
    const v = dixitView(room, st);
    const a = actions();
    const { rerender } = render(<ActionPanel view={v} sel={[]} need={1} revealDone host={false} name={namer(v)} actions={a} />);
    fireEvent.click(screen.getByRole('button', { name: 'contei' }));
    expect(a.tell).not.toHaveBeenCalled();
    expect(screen.getByText('Escolha uma carta da sua mão primeiro.')).toBeTruthy();
    rerender(<ActionPanel view={v} sel={[v.game.hand[0]!]} need={1} revealDone host={false} name={namer(v)} actions={a} />);
    fireEvent.change(screen.getByLabelText('sua dica'), { target: { value: 'luar' } });
    fireEvent.click(screen.getByRole('button', { name: 'contei' }));
    expect(a.tell).toHaveBeenCalledWith('luar');
  });

  it('escolha: joga quando tem o número certo de cartas', () => {
    const room = told(4);
    const p = othersOf(room)[0]!;
    const v = dixitView(room, p);
    const a = actions();
    render(<ActionPanel view={v} sel={[v.game.hand[0]!]} need={1} revealDone host={false} name={namer(v)} actions={a} />);
    fireEvent.click(screen.getByRole('button', { name: 'jogar essa' }));
    expect(a.submit).toHaveBeenCalled();
  });

  it('votação: confirmar sem voto avisa', () => {
    const room = voting(4);
    const p = othersOf(room)[0]!;
    const a = actions();
    render(<ActionPanel view={dixitView(room, p)} sel={[]} need={1} revealDone host={false} name={namer(dixitView(room, p))} actions={a} />);
    fireEvent.click(screen.getByRole('button', { name: 'confirmar voto' }));
    expect(a.confirmVote).not.toHaveBeenCalled();
    expect(screen.getByText('Clique numa carta da mesa primeiro.')).toBeTruthy();
  });
});

describe('topo', () => {
  it('mostra a dica, a fase e o destravar só pro host', () => {
    const room = told(4, 'luar');
    const onForce = vi.fn();
    const v0 = dixitView(room, 'p0');
    const { rerender } = render(<DixitTopBar view={v0} name={namer(v0)} color={colorer(v0)} tilt onTilt={vi.fn()} host onForce={onForce} />);
    expect(screen.getByText('“luar”')).toBeTruthy();
    expect(screen.getByText('escolha · 0 de 3 · meta 30')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'destravar' }));
    expect(onForce).toHaveBeenCalled();
    const v1 = dixitView(room, 'p1');
    rerender(<DixitTopBar view={v1} name={namer(v1)} color={colorer(v1)} tilt onTilt={vi.fn()} host={false} onForce={onForce} />);
    expect(screen.queryByRole('button', { name: 'destravar' })).toBeNull();
  });
});
```

- [ ] **Step 2:** FAIL.

- [ ] **Step 3: Implementar.**

`web/src/games/dixit/ActionPanel.tsx`:

```tsx
import { DIXIT_CLUE_MAX, type DixitRoomView } from '@cartolina/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { captionText, summaryParts } from './reveal';

export interface PanelActions {
  tell: (clue: string) => void;
  submit: () => void;
  confirmVote: () => void;
  next: () => void;
  again: () => void;
  lobby: () => void;
}

interface Props {
  view: DixitRoomView;
  sel: readonly string[];
  /** Quantas cartas cada um joga (2 com 3 jogadores). */
  need: number;
  revealDone: boolean;
  host: boolean;
  name: (id: string) => string;
  actions: PanelActions;
}

/** Canto inferior direito: o que fazer agora. */
export function ActionPanel({ view, sel, need, revealDone, host, name, actions }: Props) {
  const g = view.game, me = view.you;
  const [clue, setClue] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => setErr(''), [g.phase, sel.length]);
  const teller = g.storyteller;
  const iAmTeller = me !== null && teller === me;
  const confirmed = me !== null && g.confirmed.includes(me);
  const others = g.inRound.filter((p) => p !== teller);
  const done = others.filter((p) => g.confirmed.includes(p)).length;
  const playing = me !== null && g.inRound.includes(me);
  const over = Object.values(g.scores).some((s) => s >= g.target);
  const error = err ? <div className="dx-err">{err}</div> : null;

  let body: ReactNode;
  if (g.paused) {
    body = (
      <>
        <h3>esperando gente</h3>
        <p>Precisa de 3 pessoas na mesa pra continuar.</p>
        {host && (
          <button className="dx-btn ghost" type="button" onClick={actions.lobby}>
            voltar pro lobby
          </button>
        )}
      </>
    );
  } else if (!playing && (g.phase === 'storytelling' || g.phase === 'submitting' || g.phase === 'voting')) {
    body = (
      <>
        <h3>assistindo</h3>
        <p>Você entra na próxima rodada.</p>
      </>
    );
  } else if (g.phase === 'storytelling') {
    body = iAmTeller ? (
      <>
        <h3>você narra</h3>
        <p>Escolha uma carta da mão e dê uma dica: uma palavra, uma frase, um som… Pode escrever aqui ou falar na call.</p>
        <textarea aria-label="sua dica" maxLength={DIXIT_CLUE_MAX} placeholder="sua dica (opcional)" value={clue} onChange={(e) => setClue(e.target.value)} />
        <div className="dx-cnt">
          {clue.length}/{DIXIT_CLUE_MAX}
        </div>
        <button
          className="dx-btn"
          type="button"
          onClick={() => {
            if (!sel[0]) return setErr('Escolha uma carta da sua mão primeiro.');
            actions.tell(clue);
            setClue('');
          }}
        >
          contei
        </button>
        {error}
      </>
    ) : (
      <>
        <h3>{teller ? `${name(teller)} narra` : 'narração'}</h3>
        <p>Esperando a carta e a dica…</p>
      </>
    );
  } else if (g.phase === 'submitting') {
    body = iAmTeller ? (
      <>
        <h3>dica dada ✓</h3>
        <p>Os outros estão escolhendo cartas que combinem com a sua dica ({done}/{others.length}).</p>
      </>
    ) : confirmed ? (
      <>
        <h3>pronto ✓</h3>
        <p>Sua carta está na mesa, virada. Esperando os outros ({done}/{others.length}).</p>
      </>
    ) : (
      <>
        <h3>engane a mesa</h3>
        <p>Escolha {need === 1 ? 'a carta da sua mão que mais combina' : 'as 2 cartas da sua mão que mais combinam'} com a dica.</p>
        <button
          className="dx-btn"
          type="button"
          onClick={() => {
            if (sel.length !== need) return setErr(need === 1 ? 'Escolha uma carta da mão.' : 'Escolha 2 cartas da mão.');
            actions.submit();
          }}
        >
          {need === 1 ? 'jogar essa' : 'jogar essas'}
        </button>
        {error}
      </>
    );
  } else if (g.phase === 'voting') {
    body = iAmTeller ? (
      <>
        <h3>votação</h3>
        <p>Todos estão tentando achar a sua carta ({done}/{others.length} votaram).</p>
      </>
    ) : confirmed ? (
      <>
        <h3>votou ✓</h3>
        <p>Esperando os outros ({done}/{others.length}).</p>
      </>
    ) : (
      <>
        <h3>qual é a do narrador?</h3>
        <p>Clique na carta que você acha que é de {teller ? name(teller) : 'quem narrou'}. Dá pra trocar até confirmar.</p>
        <button
          className="dx-btn"
          type="button"
          onClick={() => {
            if (!g.myVote) return setErr('Clique numa carta da mesa primeiro.');
            actions.confirmVote();
          }}
        >
          confirmar voto
        </button>
        {error}
      </>
    );
  } else if (g.phase === 'reveal') {
    const r = g.result;
    body = !revealDone || !r ? (
      <>
        <h3>revelando…</h3>
        <p>Quem votou em quê e de quem é cada carta.</p>
      </>
    ) : (
      <>
        <h3>{captionText(summaryParts(r, name))}</h3>
        <p>{me && r.gained[me] ? `você fez +${r.gained[me]}.` : 'você não pontuou nessa.'}</p>
        {host ? (
          <button className="dx-btn" type="button" onClick={actions.next}>
            {over ? 'ver quem venceu' : 'próxima rodada'}
          </button>
        ) : (
          <p>esperando o host…</p>
        )}
      </>
    );
  } else if (g.phase === 'gameover') {
    const w = g.winners;
    body = (
      <>
        <h3>fim de jogo!</h3>
        <p>
          {w.map(name).join(' e ')} {w.length > 1 ? 'venceram' : 'venceu'} com {g.scores[w[0] ?? ''] ?? 0} pontos.
        </p>
        {host ? (
          <>
            <button className="dx-btn" type="button" onClick={actions.again}>
              jogar de novo
            </button>
            <button className="dx-btn ghost" type="button" onClick={actions.lobby}>
              voltar pro lobby
            </button>
          </>
        ) : (
          <p>esperando o host…</p>
        )}
      </>
    );
  }
  return (
    <section className="dx-panel" aria-label="sua vez">
      {body}
    </section>
  );
}
```

`web/src/games/dixit/DixitTopBar.tsx`:

```tsx
import type { DixitRoomView } from '@cartolina/shared';
import { useState } from 'react';
import { loadSoundPref, saveSoundPref } from '../../net/identity';
import { Critter } from '../../screens/Critter';
import { phaseLabel } from './status';

/** Liga/desliga o som (mesma preferência do ITO). */
export function SoundPill() {
  const [on, setOn] = useState(loadSoundPref);
  return (
    <button
      className="dx-pill"
      type="button"
      aria-pressed={on}
      onClick={() => {
        saveSoundPref(!on);
        setOn(!on);
      }}
    >
      som: {on ? 'ligado' : 'desligado'}
    </button>
  );
}

interface Props {
  view: DixitRoomView;
  name: (id: string) => string;
  color: (id: string) => string;
  tilt: boolean;
  onTilt: () => void;
  host: boolean;
  onForce: () => void;
}

/** Logo, dica do narrador e pílulas (fase, som, mesa 3D, destravar). */
export function DixitTopBar({ view, name, color, tilt, onTilt, host, onForce }: Props) {
  const g = view.game, st = g.storyteller;
  const inRound = g.phase === 'storytelling' || g.phase === 'submitting' || g.phase === 'voting';
  return (
    <>
      <h1 className="dx-logo">
        dixit<small>sala {view.code} · cartolina~</small>
      </h1>
      <div className="dx-clue">
        {st && g.phase !== 'gameover' && (
          <span className="who">
            <Critter color={color(st)} />
          </span>
        )}
        {g.phase === 'gameover' || !st ? (
          <span className="txt muted">fim de jogo</span>
        ) : g.phase === 'storytelling' ? (
          <span className="txt muted">{st === view.you ? 'você narra esta rodada' : `${name(st)} narra esta rodada`}</span>
        ) : g.clue ? (
          <span className="txt">“{g.clue}”</span>
        ) : (
          <span className="txt muted">dica falada na call</span>
        )}
      </div>
      <div className="dx-pills">
        <span className="dx-pill">{phaseLabel(g)}</span>
        {host && inRound && !g.paused && (
          <button className="dx-pill" type="button" title="pula quem está travando a rodada" onClick={onForce}>
            destravar
          </button>
        )}
        <SoundPill />
        <button className="dx-pill" type="button" aria-pressed={tilt} onClick={onTilt}>
          mesa 3D: {tilt ? 'ligada' : 'desligada'}
        </button>
      </div>
    </>
  );
}
```

- [ ] **Step 4:** PASS. Rode também o typecheck do `web`.

- [ ] **Step 5: Commit.** `feat(web): painel de ação e topo da mesa do Dixit`

---

### Task 9: Revelação: relógio, legenda e placar da rodada

**Files:**
- Create: `web/src/games/dixit/useStageFit.ts`, `useReveal.ts`, `RevealCaption.tsx`, `RoundBoard.tsx`
- Test: `web/test/dixit-ui.test.tsx`

- [ ] **Step 1: Testes.** Acrescente aos imports de `web/test/dixit-ui.test.tsx`:

```tsx
import { RevealCaption } from '../src/games/dixit/RevealCaption';
import { RoundBoard } from '../src/games/dixit/RoundBoard';
```

e no fim:

```tsx
describe('legenda da revelação', () => {
  it('troca o texto com fade sem desmontar a caixa; pular chama onSkip', () => {
    vi.useFakeTimers();
    const onSkip = vi.fn();
    const a = { step: 1 as const, parts: [{ text: 'primeiro' }] };
    const b = { step: 2 as const, parts: [{ text: 'segundo', em: true }] };
    const { container, rerender } = render(<RevealCaption caption={a} onSkip={onSkip} />);
    const box = container.querySelector('.dx-step');
    expect(screen.getByText('primeiro')).toBeTruthy();
    rerender(<RevealCaption caption={b} onSkip={onSkip} />);
    expect(container.querySelector('.dx-step.swap')).toBeTruthy();
    rtlAct(() => vi.advanceTimersByTime(200));
    expect(screen.getByText('segundo').tagName).toBe('EM');
    expect(container.querySelector('.dx-step')).toBe(box);
    fireEvent.click(screen.getByRole('button', { name: 'pular ›' }));
    expect(onSkip).toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('placar da rodada', () => {
  it('pontos, motivos e total; próxima rodada só pro host', () => {
    const room = revealed(4);
    const v = dixitView(room, 'p0');
    const r = v.game.result!;
    const onNext = vi.fn();
    const props = { result: r, players: v.game.inRound, scores: v.game.scores, target: v.game.target, name: namer(v), color: colorer(v), onNext, onHide: vi.fn() };
    const { rerender } = render(<RoundBoard {...props} host />);
    expect(screen.getByText('placar da rodada')).toBeTruthy();
    expect(screen.getAllByText(/todo mundo achou: \+2 pra quem votou/)).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'próxima rodada' }));
    expect(onNext).toHaveBeenCalled();
    rerender(<RoundBoard {...props} host={false} />);
    expect(screen.queryByRole('button', { name: 'próxima rodada' })).toBeNull();
    expect(screen.getByText('esperando o host passar pra próxima…')).toBeTruthy();
  });
});
```

- [ ] **Step 2:** FAIL.

- [ ] **Step 3: Implementar.**

`web/src/games/dixit/useStageFit.ts`:

```ts
import { useEffect, useState } from 'react';
import { fitStage } from './geometry';

/** Escala e largura do palco para a janela atual (acompanha o redimensionamento). */
export function useStageFit(): { scale: number; width: number } {
  const [fit, setFit] = useState(() => fitStage(window.innerWidth, window.innerHeight));
  useEffect(() => {
    const onResize = () => setFit(fitStage(window.innerWidth, window.innerHeight));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return fit;
}
```

`web/src/games/dixit/useReveal.ts`:

```ts
import type { DixitRoundResult } from '@cartolina/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { playSound } from '../../brand/sounds';
import { buildRevealTimeline, frameAt, type RevealEvent, type RevealFrame } from './reveal';

function soundOf(e: RevealEvent, r: DixitRoundResult, me: string | null): void {
  if (e.kind === 'spot') playSound('join');
  else if (e.kind === 'vote') playSound('flip', e.index);
  else if (e.kind === 'owner') playSound('slide');
  else if (e.kind === 'hop') playSound('click');
  else if (e.kind === 'done' && me && (r.gained[me] ?? 0) > 0) playSound('win');
}

/**
 * Relógio da revelação narrada. `key` muda a cada revelação nova (e só aí a linha do tempo é refeita:
 * os nomes das legendas ficam os do começo). Devolve o quadro atual e `skip` (pula pro fim, sem tocar os sons do meio).
 */
export function useReveal(
  result: DixitRoundResult | null,
  key: string,
  order: readonly string[],
  name: (id: string) => string,
  me: string | null,
): { frame: RevealFrame | null; skip: () => void } {
  const [t, setT] = useState(0);
  const skipped = useRef(false);
  const last = useRef(-1);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- a linha do tempo nasce uma vez por revelação (key)
  const events = useMemo(() => (result && key ? buildRevealTimeline(result, order, name) : null), [key]);

  useEffect(() => {
    if (!events) return;
    const start = Date.now();
    skipped.current = false;
    last.current = -1;
    setT(0);
    const end = events[events.length - 1]!.at;
    const id = setInterval(() => {
      const now = skipped.current ? Infinity : Date.now() - start;
      setT(now);
      if (now >= end) clearInterval(id);
    }, 50);
    return () => clearInterval(id);
  }, [events]);

  useEffect(() => {
    if (!events || !result) return;
    let i = last.current + 1;
    for (; i < events.length && events[i]!.at <= t; i++) {
      const e = events[i]!;
      if (!skipped.current || e.kind === 'done') soundOf(e, result, me);
    }
    last.current = i - 1;
  }, [t, events, result, me]);

  return {
    frame: events ? frameAt(events, t) : null,
    skip: () => {
      skipped.current = true;
      setT(Infinity);
    },
  };
}
```

`web/src/games/dixit/RevealCaption.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import type { Caption } from './reveal';

/** Legenda numerada da revelação. A caixa fica parada; só o texto troca, com fade. */
export function RevealCaption({ caption, onSkip }: { caption: Caption | null; onSkip: () => void }) {
  const [shown, setShown] = useState<Caption | null>(caption);
  const [swap, setSwap] = useState(false);
  const shownRef = useRef<Caption | null>(caption);
  useEffect(() => {
    const show = (c: Caption | null) => {
      shownRef.current = c;
      setShown(c);
      setSwap(false);
    };
    if (!caption) return show(null);
    if (!shownRef.current) return show(caption);
    if (shownRef.current === caption) return;
    setSwap(true);
    const t = setTimeout(() => show(caption), 180);
    return () => clearTimeout(t);
  }, [caption]);
  if (!shown) return null;
  return (
    <div className={`dx-step${swap ? ' swap' : ''}`} role="status">
      <span className="n">{shown.step} de 4</span>
      <span className="t">{shown.parts.map((p, i) => (p.em ? <em key={i}>{p.text}</em> : <span key={i}>{p.text}</span>))}</span>
      <button type="button" onClick={onSkip}>
        pular ›
      </button>
    </div>
  );
}
```

`web/src/games/dixit/RoundBoard.tsx`:

```tsx
import type { DixitRoundResult } from '@cartolina/shared';
import { Critter } from '../../screens/Critter';
import { reasons, summaryParts } from './reveal';

interface Props {
  result: DixitRoundResult;
  players: readonly string[];
  scores: Readonly<Record<string, number>>;
  target: number;
  name: (id: string) => string;
  color: (id: string) => string;
  host: boolean;
  onNext: () => void;
  onHide: () => void;
}

/** Placar da rodada: quem fez quanto e por quê. Fica no centro, sem cobrir os assentos. */
export function RoundBoard({ result: r, players, scores, target, name, color, host, onNext, onHide }: Props) {
  const rows = [...players].sort((a, b) => (r.gained[b] ?? 0) - (r.gained[a] ?? 0) || Number(b === r.storyteller) - Number(a === r.storyteller));
  const over = Object.values(scores).some((s) => s >= target);
  return (
    <section className="dx-board" aria-label="placar da rodada">
      <h3>placar da rodada</h3>
      <p className="sum">
        {summaryParts(r, name).map((p, i) => (p.em ? <em key={i}>{p.text}</em> : <span key={i}>{p.text}</span>))}.
        {r.clue && (
          <>
            {' '}A dica era <em>“{r.clue}”</em>.
          </>
        )}
      </p>
      {rows.map((p) => {
        const g = r.gained[p] ?? 0;
        return (
          <div key={p} className={`dx-row${p === r.storyteller ? ' st' : ''}`}>
            <Critter color={color(p)} />
            <div>
              <div className="nm">{name(p)}</div>
              <div className="why">{reasons(r, p).map((x) => `${x.points ? `+${x.points} ` : ''}${x.text}`).join(' · ')}</div>
            </div>
            <div className={`g${g ? '' : ' zero'}`}>+{g}</div>
            <div className="tot">{scores[p] ?? 0} no total</div>
          </div>
        );
      })}
      <div className="acts">
        <button className="dx-btn ghost" type="button" onClick={onHide}>
          ver a mesa
        </button>
        {host && (
          <button className="dx-btn" type="button" onClick={onNext}>
            {over ? 'ver quem venceu' : 'próxima rodada'}
          </button>
        )}
      </div>
      {!host && <p className="wait">esperando o host passar pra próxima…</p>}
    </section>
  );
}
```

- [ ] **Step 4:** PASS. Rode também o typecheck do `web`.

- [ ] **Step 5: Commit.** `feat(web): revelação narrada do Dixit (relógio, legenda com fade, placar da rodada)`

---

### Task 10: A mesa inteira e a troca no `Game.tsx`

**Files:**
- Create: `web/src/games/dixit/DixitTable.tsx`
- Modify: `web/src/screens/Game.tsx`
- Delete: `web/test/dixit-soon.test.tsx`
- Test: `web/test/dixit-table.test.tsx`

- [ ] **Step 1: Testes.** `web/test/dixit-table.test.tsx`:

```tsx
import { act as rtlAct, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { DixitTable } from '../src/games/dixit/DixitTable';
import type { GameConn } from '../src/net/connection';
import { dixitView, othersOf, revealed, started, stateOf, told, voting } from './dixit-fixtures';

const conn = (): GameConn & { sendAction: Mock<GameConn['sendAction']> } => ({
  sendAction: vi.fn<GameConn['sendAction']>(),
  sendActivity: vi.fn(),
  sendCursor: vi.fn(),
  sendPing: vi.fn(),
  onFx: vi.fn(() => () => {}),
  onError: vi.fn(() => () => {}),
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('mesa do Dixit', () => {
  it('quem narra escolhe a carta e conta a dica', () => {
    const room = started(4);
    const st = stateOf(room).storyteller!;
    const c = conn();
    render(<DixitTable view={dixitView(room, st)} conn={c} />);
    fireEvent.click(screen.getByRole('button', { name: 'sua carta 2' }));
    fireEvent.change(screen.getByLabelText('sua dica'), { target: { value: 'luar' } });
    fireEvent.click(screen.getByRole('button', { name: 'contei' }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'tell', cardId: stateOf(room).hands[st]![1], clue: 'luar' });
  });

  it('escolher e jogar manda submit e confirm', () => {
    const room = told(4);
    const p = othersOf(room)[0]!;
    const c = conn();
    render(<DixitTable view={dixitView(room, p)} conn={c} />);
    fireEvent.click(screen.getByRole('button', { name: 'sua carta 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'jogar essa' }));
    expect(c.sendAction).toHaveBeenNthCalledWith(1, { type: 'submit', cardIds: [stateOf(room).hands[p]![0]] });
    expect(c.sendAction).toHaveBeenNthCalledWith(2, { type: 'confirm' });
  });

  it('votar clicando na carta; a própria carta não', () => {
    const room = voting(4);
    const p = othersOf(room)[0]!;
    const v = dixitView(room, p);
    const c = conn();
    render(<DixitTable view={v} conn={c} />);
    const mine = v.game.table.findIndex((t) => t.mine);
    const other = v.game.table.findIndex((t) => !t.mine);
    const roman = ['I', 'II', 'III', 'IV'];
    fireEvent.click(screen.getByRole('button', { name: `carta ${roman[mine]}` }));
    expect(c.sendAction).not.toHaveBeenCalled();
    expect(screen.getByText('Não dá pra votar na própria carta.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: `carta ${roman[other]}` }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'vote', cardId: v.game.table[other]!.cardId });
  });

  it('revelação narrada até o placar; o host passa a rodada', () => {
    const room = revealed(4);
    const c = conn();
    render(<DixitTable view={dixitView(room, 'p0')} conn={c} />);
    rtlAct(() => vi.advanceTimersByTime(600));
    expect(screen.getByText('1 de 4')).toBeTruthy();
    expect(screen.getByText('carta do narrador')).toBeTruthy();
    rtlAct(() => vi.advanceTimersByTime(30_000));
    expect(screen.getByRole('region', { name: 'placar da rodada' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'ver a mesa' }));
    expect(screen.queryByRole('region', { name: 'placar da rodada' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'placar da rodada ▸' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'próxima rodada' })[0]!);
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'next' });
  });

  it('pular leva direto ao placar', () => {
    render(<DixitTable view={dixitView(revealed(4), 'p1')} conn={conn()} />);
    rtlAct(() => vi.advanceTimersByTime(600));
    fireEvent.click(screen.getByRole('button', { name: 'pular ›' }));
    rtlAct(() => vi.advanceTimersByTime(100));
    expect(screen.getByRole('region', { name: 'placar da rodada' })).toBeTruthy();
  });

  it('rodinha pra cima numa carta da mão amplia', () => {
    const room = started(4);
    render(<DixitTable view={dixitView(room, 'p1')} conn={conn()} />);
    fireEvent.wheel(screen.getByRole('button', { name: 'sua carta 1' }), { deltaY: -100 });
    expect(screen.getByRole('dialog', { name: 'carta ampliada' })).toBeTruthy();
  });
});
```

- [ ] **Step 2:** FAIL.

- [ ] **Step 3: Implementar** `web/src/games/dixit/DixitTable.tsx`:

```tsx
import { dixitPicksPerPlayer, type DixitRoomView } from '@cartolina/shared';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type WheelEvent } from 'react';
import { playSound } from '../../brand/sounds';
import { loadTiltPref, saveTiltPref } from '../../net/identity';
import type { GameConn } from '../../net/connection';
import { confetti } from '../../table/confetti';
import { ActionPanel, type PanelActions } from './ActionPanel';
import { Brushes } from './Brushes';
import { CardViewer } from './CardViewer';
import { DixitTopBar } from './DixitTopBar';
import { Felt } from './Felt';
import { ROMAN } from './geometry';
import { Hand } from './Hand';
import { RevealCaption } from './RevealCaption';
import { RoundBoard } from './RoundBoard';
import { scoresDuring } from './reveal';
import { Seats } from './Seats';
import { colorer, namer } from './status';
import { useReveal } from './useReveal';
import { useStageFit } from './useStageFit';
import './dixit.css';

const CONFETTI = ['#F2A541', '#F6EAD2', '#D1495B', '#00798C'];

/** A mesa do Dixit: junta topo, feltro, assentos, mão, painel, revelação e carta ampliada. */
export function DixitTable({ view, conn }: { view: DixitRoomView; conn: GameConn }) {
  const g = view.game, me = view.you;
  const host = view.hostId !== null && view.hostId === me;
  const { scale, width } = useStageFit();
  const [tilt, setTilt] = useState(loadTiltPref);
  const [sel, setSel] = useState<string[]>([]);
  const [viewer, setViewer] = useState<{ kind: 'hand' | 'table'; ids: string[]; index: number } | null>(null);
  const [boardHidden, setBoardHidden] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const confettiRef = useRef<HTMLCanvasElement>(null);
  const name = useMemo(() => namer(view), [view]);
  const color = useMemo(() => colorer(view), [view]);

  const revealKey = g.phase === 'reveal' && g.result ? `${g.result.storyCard}:${g.result.table.join(',')}` : '';
  const { frame, skip } = useReveal(g.phase === 'reveal' ? g.result : null, revealKey, g.inRound, name, me);
  const revealDone = g.phase !== 'reveal' || !!frame?.done;
  const scores = scoresDuring(g.scores, g.phase === 'reveal' ? g.result : null, frame);
  const gained = frame && g.result ? Object.fromEntries(Object.keys(frame.hops).map((p) => [p, g.result!.gained[p] ?? 0])) : {};

  const iAmTeller = me !== null && g.storyteller === me;
  const confirmed = me !== null && g.confirmed.includes(me);
  const need = dixitPicksPerPlayer(g.inRound.length);
  const canPick =
    !g.paused && me !== null && g.inRound.includes(me) && ((g.phase === 'storytelling' && iAmTeller) || (g.phase === 'submitting' && !iAmTeller && !confirmed));

  // nova fase: limpa escolhas e o placar escondido
  useEffect(() => {
    setSel([]);
    setBoardHidden(false);
  }, [g.phase, g.storyteller]);

  // sons e confete de fase
  const prevPhase = useRef(g.phase);
  useEffect(() => {
    const from = prevPhase.current;
    prevPhase.current = g.phase;
    if (from === g.phase) return;
    if (g.phase === 'storytelling' && iAmTeller) playSound('join');
    if (g.phase === 'voting') g.table.forEach((_, i) => setTimeout(() => playSound('flip', i), 300 + 120 * i));
    if (g.phase === 'gameover') {
      playSound(me && g.winners.includes(me) ? 'win' : 'lose');
      return confetti(confettiRef.current, CONFETTI);
    }
    return undefined;
  }, [g.phase, g.table, g.winners, iAmTeller, me]);

  // carta pousando na mesa (baixinho)
  const prevCount = useRef(g.tableCount);
  useEffect(() => {
    if (g.phase === 'submitting' && g.tableCount > prevCount.current) playSound('land');
    prevCount.current = g.tableCount;
  }, [g.phase, g.tableCount]);

  useEffect(
    () =>
      conn.onError((_code, message) => {
        setToast(message);
        playSound('error');
      }),
    [conn],
  );
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  function openViewer(kind: 'hand' | 'table', id: string) {
    const ids = kind === 'hand' ? [...g.hand] : g.table.map((t) => t.cardId);
    const index = ids.indexOf(id);
    if (index >= 0) setViewer({ kind, ids, index });
  }

  function pick(id: string) {
    if (!canPick) return openViewer('hand', id);
    playSound('pick');
    const max = g.phase === 'storytelling' ? 1 : need;
    setSel((cur) => (cur.includes(id) ? cur.filter((c) => c !== id) : max === 1 ? [id] : [...cur, id].slice(-max)));
  }

  function clickTable(cardId: string) {
    if (g.phase !== 'voting') return openViewer('table', cardId);
    if (me === null || !g.inRound.includes(me)) return setToast('Você está assistindo esta rodada.');
    if (iAmTeller) return setToast('Quem narra não vota.');
    if (confirmed) return setToast('Você já confirmou o voto.');
    if (g.table.find((t) => t.cardId === cardId)?.mine) return setToast('Não dá pra votar na própria carta.');
    playSound('pick');
    conn.sendAction({ type: 'vote', cardId });
  }

  function onWheel(e: WheelEvent<HTMLDivElement>) {
    if (viewer || e.deltaY >= 0) return;
    const el = (e.target as Element).closest<HTMLElement>('[data-card-id]');
    if (el?.dataset.cardId) openViewer(el.dataset.zoom === 'hand' ? 'hand' : 'table', el.dataset.cardId);
  }

  const actions: PanelActions = {
    tell: (clue) => {
      if (sel[0]) conn.sendAction({ type: 'tell', cardId: sel[0], clue });
    },
    submit: () => {
      conn.sendAction({ type: 'submit', cardIds: sel });
      conn.sendAction({ type: 'confirm' });
    },
    confirmVote: () => conn.sendAction({ type: 'confirm' }),
    next: () => conn.sendAction({ type: 'next' }),
    again: () => conn.sendAction({ type: 'again' }),
    lobby: () => conn.sendAction({ type: 'lobby' }),
  };

  const stageStyle = { width, transform: `translate(-50%, -50%) scale(${scale})`, '--tilt': tilt ? '38deg' : '0deg' } as CSSProperties;
  return (
    <div className="dixit" onWheel={onWheel}>
      <div className="dx-stage" style={stageStyle}>
        <Brushes width={width} />
        <DixitTopBar
          view={view}
          name={name}
          color={color}
          tilt={tilt}
          onTilt={() => {
            saveTiltPref(!tilt);
            setTilt(!tilt);
          }}
          host={host}
          onForce={() => conn.sendAction({ type: 'forceNext' })}
        />
        <Felt view={view} name={name} color={color} frame={frame} scores={scores} onCard={clickTable} onZoom={(id) => openViewer('table', id)} />
        <Seats view={view} width={width} name={name} gained={gained} floatKey={revealKey} />
        <Hand ids={g.hand} selected={sel} played={confirmed ? g.myPicks : []} canPick={canPick} onPick={pick} onZoom={(id) => openViewer('hand', id)} />
        <ActionPanel view={view} sel={sel} need={need} revealDone={revealDone} host={host} name={name} actions={actions} />
        <RevealCaption caption={frame && !frame.done ? frame.caption : null} onSkip={skip} />
        {g.phase === 'reveal' && revealDone && g.result &&
          (boardHidden ? (
            <button className="dx-pill dx-board-pill" type="button" onClick={() => setBoardHidden(false)}>
              placar da rodada ▸
            </button>
          ) : (
            <RoundBoard result={g.result} players={g.inRound} scores={g.scores} target={g.target} name={name} color={color} host={host} onNext={actions.next} onHide={() => setBoardHidden(true)} />
          ))}
        {toast && (
          <div className="dx-toast" role="status">
            {toast}
          </div>
        )}
        {viewer && (
          <CardViewer
            ids={viewer.ids}
            index={viewer.index}
            label={(id, i) => {
              const owner = g.result?.owners[id];
              const base = viewer.kind === 'hand' ? `sua mão · ${i + 1} de ${viewer.ids.length}` : `carta ${ROMAN[i]}`;
              return owner && (g.phase === 'gameover' || revealDone) ? `${base} · de ${name(owner)}` : base;
            }}
            onIndex={(index) => setViewer((cur) => (cur ? { ...cur, index } : cur))}
            onClose={() => setViewer(null)}
          />
        )}
      </div>
      <canvas className="dx-confetti" ref={confettiRef} />
    </div>
  );
}
```

- [ ] **Step 4: `Game.tsx`.** Substitua `web/src/screens/Game.tsx` por:

```tsx
import { isDixitRoomView, isItoRoomView, type RoomView } from '@cartolina/shared';
import { DixitLobby } from '../games/dixit/DixitLobby';
import { DixitTable } from '../games/dixit/DixitTable';
import type { ConnSnapshot, GameConn } from '../net/connection';
import { Table } from '../table/Table';
import { Lobby } from './Lobby';
import { Toasts } from './Toasts';

export function Game({ conn, snap, view }: { conn: GameConn; snap: ConnSnapshot; view: RoomView }) {
  const reconnecting = snap.status === 'reconnecting' && <div className="banner-reconnect" role="status">reconectando…</div>;
  if (isDixitRoomView(view)) {
    // o Dixit tem os próprios avisos (toast na mesa)
    return (
      <>
        {reconnecting}
        {view.game.phase === 'lobby' ? <DixitLobby view={view} conn={conn} /> : <DixitTable view={view} conn={conn} />}
      </>
    );
  }
  if (!isItoRoomView(view)) return null;
  return (
    <>
      {reconnecting}
      {view.game.phase === 'lobby' ? <Lobby view={view} conn={conn} /> : <Table view={view} conn={conn} />}
      <Toasts conn={conn} />
    </>
  );
}
```

O `DixitLobby` vem na Tarefa 11. Para esta tarefa compilar, crie já um `web/src/games/dixit/DixitLobby.tsx` mínimo; a Tarefa 11 o substitui inteiro:

```tsx
import type { DixitRoomView } from '@cartolina/shared';
import type { GameConn } from '../../net/connection';

export function DixitLobby(_props: { view: DixitRoomView; conn: GameConn }) {
  return null;
}
```

Apague `web/test/dixit-soon.test.tsx`: a tela "em breve" saiu.

- [ ] **Step 5:** `cd web && npx vitest run test/dixit-table.test.tsx` deve dar PASS. Rode `npm run typecheck -w web` e `npm test -w web`. Se algum teste antigo de `Game`/`RoomScreen` com sala de Dixit esperar a tela "em breve", atualize-o para esperar a mesa (`aria-label="sua vez"`) ou o lobby.

- [ ] **Step 6: Commit.** `feat(web): mesa do Dixit ligada ao jogo (escolher, votar, revelação narrada)`

---

### Task 11: Lobby do Dixit e bots de desenvolvimento

**Files:**
- Modify: `web/src/games/dixit/DixitLobby.tsx` (substitui o mínimo da Tarefa 10)
- Create: `web/src/dev/dixitBots.ts`
- Modify: `web/src/dev/BotControls.tsx`
- Test: `web/test/dixit-lobby.test.tsx`, `web/test/dixit-bots.test.ts`

- [ ] **Step 1: Testes.**

`web/test/dixit-bots.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { decideDixit } from '../src/dev/dixitBots';
import { dixitView, othersOf, started, stateOf, told, voting } from './dixit-fixtures';

const rng = () => 0.5;

describe('decisão do bot do Dixit', () => {
  it('narra quando é a vez dele', () => {
    const room = started(4);
    const st = stateOf(room).storyteller!;
    const d = decideDixit(dixitView(room, st), rng)!;
    expect(d.actions).toHaveLength(1);
    expect(d.actions[0]).toMatchObject({ type: 'tell' });
    expect(stateOf(room).hands[st]).toContain((d.actions[0] as { cardId: string }).cardId);
  });

  it('escolhe o número certo de cartas e confirma (2 com 3 jogadores)', () => {
    const room = told(3);
    const p = othersOf(room)[0]!;
    const d = decideDixit(dixitView(room, p), rng)!;
    expect(d.actions[0]).toMatchObject({ type: 'submit' });
    expect((d.actions[0] as { cardIds: string[] }).cardIds).toHaveLength(2);
    expect(d.actions[1]).toEqual({ type: 'confirm' });
  });

  it('vota numa carta que não é a sua e confirma', () => {
    const room = voting(4);
    const p = othersOf(room)[0]!;
    const v = dixitView(room, p);
    const d = decideDixit(v, rng)!;
    const card = (d.actions[0] as { cardId: string }).cardId;
    expect(v.game.table.find((t) => t.cardId === card)?.mine).toBe(false);
    expect(d.actions[1]).toEqual({ type: 'confirm' });
  });

  it('não faz nada quando não é com ele', () => {
    const room = started(4);
    const other = othersOf(room)[0]!;
    expect(decideDixit(dixitView(room, other), rng)).toBeNull();
  });
});
```

`web/test/dixit-lobby.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, type Mock } from 'vitest';
import { DixitLobby } from '../src/games/dixit/DixitLobby';
import type { GameConn } from '../src/net/connection';
import { dixitRoom, dixitView } from './dixit-fixtures';

const conn = (): GameConn & { sendAction: Mock<GameConn['sendAction']> } => ({
  sendAction: vi.fn<GameConn['sendAction']>(),
  sendActivity: vi.fn(),
  sendCursor: vi.fn(),
  sendPing: vi.fn(),
  onFx: vi.fn(() => () => {}),
  onError: vi.fn(() => () => {}),
});

describe('lobby do Dixit', () => {
  it('host escolhe a meta e começa com 3+', () => {
    const c = conn();
    render(<DixitLobby view={dixitView(dixitRoom(3), 'p0')} conn={c} />);
    fireEvent.click(screen.getByRole('button', { name: /15/ }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'setTarget', target: 15 });
    fireEvent.click(screen.getByRole('button', { name: 'começar' }));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'start' });
  });

  it('com menos de 3, avisa em vez de começar', () => {
    const c = conn();
    render(<DixitLobby view={dixitView(dixitRoom(2), 'p0')} conn={c} />);
    fireEvent.click(screen.getByRole('button', { name: 'começar' }));
    expect(c.sendAction).not.toHaveBeenCalledWith({ type: 'start' });
    expect(screen.getByText(/precisa de pelo menos 3 pessoas/)).toBeTruthy();
  });

  it('quem não é host só espera', () => {
    render(<DixitLobby view={dixitView(dixitRoom(3), 'p1')} conn={conn()} />);
    expect(screen.queryByRole('button', { name: 'começar' })).toBeNull();
    expect(screen.getByText('esperando o host começar…')).toBeTruthy();
  });
});
```

- [ ] **Step 2:** FAIL.

- [ ] **Step 3: Implementar.**

`web/src/dev/dixitBots.ts`:

```ts
/**
 * Bots do Dixit SÓ PARA DESENVOLVIMENTO (importados via `import()` atrás de `import.meta.env.DEV`).
 * Cada bot abre o próprio WebSocket e joga como uma pessoa: narra, escolhe e vota com atrasos humanos.
 */
import { PLAYER_COLORS, dixitPicksPerPlayer, isDixitRoomView, type DixitRoomView, type GameAction } from '@cartolina/shared';
import { getRoomInfo } from '../net/api';
import { wsUrl } from '../net/config';
import { RoomConnection } from '../net/connection';

const NAMES = ['Bot Bia', 'Bot Caio', 'Bot Duda', 'Bot Enzo', 'Bot Lia', 'Bot Téo', 'Bot Nina', 'Bot Gui', 'Bot Malu'];
const CLUES = ['saudade', 'um sonho que esqueci', 'silêncio', 'voltar pra casa', 'o primeiro dia', 'coragem', 'quase', 'segredo', 'domingo à tarde', 'a última página', 'eco', 'infância', 'maré', 'promessa', 'longe demais', 'antes de dormir'];

type Rng = () => number;
const pickOne = <T>(rng: Rng, arr: readonly T[]): T => arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))]!;
function shuffled<T>(rng: Rng, arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** O que o bot faz agora (ou null). `key` identifica a etapa, pra não agir duas vezes nela. */
export function decideDixit(view: DixitRoomView, rng: Rng): { key: string; delay: number; actions: GameAction[] } | null {
  const g = view.game, me = view.you;
  if (!me || g.paused || !g.inRound.includes(me)) return null;
  const key = `${g.phase}:${g.storyteller}:${g.clue}:${g.table.length}`;
  if (g.phase === 'storytelling' && g.storyteller === me && g.hand.length) {
    const clue = rng() < 0.15 ? '' : pickOne(rng, CLUES);
    return { key, delay: 2500 + rng() * 2700, actions: [{ type: 'tell', cardId: pickOne(rng, g.hand), clue }] };
  }
  if (g.phase === 'submitting' && g.storyteller !== me && !g.confirmed.includes(me)) {
    const cardIds = shuffled(rng, g.hand).slice(0, dixitPicksPerPlayer(g.inRound.length));
    return { key, delay: 1400 + rng() * 3800, actions: [{ type: 'submit', cardIds }, { type: 'confirm' }] };
  }
  if (g.phase === 'voting' && g.storyteller !== me && !g.confirmed.includes(me)) {
    const options = g.table.filter((t) => !t.mine).map((t) => t.cardId);
    if (!options.length) return null;
    return { key, delay: 1800 + rng() * 4400, actions: [{ type: 'vote', cardId: pickOne(rng, options) }, { type: 'confirm' }] };
  }
  return null;
}

class DixitBot {
  private conn: RoomConnection | null = null;
  private unsub: (() => void) | null = null;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private planned = new Set<string>();
  private tried = new Set<string>();
  private name = '';
  constructor(readonly code: string) {}

  start(): void {
    void getRoomInfo(this.code)
      .catch(() => null)
      .then((info) => {
        const seats = info?.seats ?? [];
        const names = new Set(seats.map((s) => s.name));
        this.name = NAMES.find((n) => !names.has(n)) ?? `Bot ${Math.floor(Math.random() * 99)}`;
        seats.forEach((s) => this.tried.add(s.color));
        this.conn = new RoomConnection({ url: wsUrl(this.code), token: crypto.randomUUID(), name: this.name, color: this.nextColor() });
        this.unsub = this.conn.subscribe(this.react);
        this.conn.start();
      });
  }

  stop(): void {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers.clear();
    this.unsub?.();
    this.conn?.stop();
  }

  private nextColor(): string {
    const c = PLAYER_COLORS.find((x) => !this.tried.has(x)) ?? PLAYER_COLORS[0];
    this.tried.add(c);
    return c;
  }

  private react = (): void => {
    const snap = this.conn?.getSnapshot();
    if (!snap) return;
    if (snap.status === 'join_failed') return this.conn?.retryJoin(this.name, this.nextColor());
    if (snap.status !== 'joined' || !snap.view || !isDixitRoomView(snap.view)) return;
    const d = decideDixit(snap.view, Math.random);
    if (!d || this.planned.has(d.key)) return;
    this.planned.add(d.key);
    const t = setTimeout(() => {
      this.timers.delete(t);
      const now = this.conn?.getSnapshot().view;
      if (!now || !isDixitRoomView(now)) return;
      // decide de novo com a visão atual (a etapa pode ter mudado)
      const again = decideDixit(now, Math.random);
      if (again?.key === d.key) again.actions.forEach((a) => this.conn?.sendAction(a));
    }, d.delay);
    this.timers.add(t);
  };
}

const registry = new Set<DixitBot>();
let version = 0;
const listeners = new Set<() => void>();
const emit = () => {
  version++;
  listeners.forEach((fn) => fn());
};

export function subscribeDixitBots(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export const dixitBotsVersion = (): number => version;
export const dixitBotsIn = (code: string): number => [...registry].filter((b) => b.code === code).length;
export function addDixitBot(code: string): void {
  const bot = new DixitBot(code);
  registry.add(bot);
  bot.start();
  emit();
}
export function removeAllDixitBots(): void {
  registry.forEach((b) => b.stop());
  registry.clear();
  emit();
}
```

`web/src/dev/BotControls.tsx`: aceite `game?: 'ito' | 'dixit'` e escolha a API. Substitua o começo do componente por:

```tsx
/** Controles de bots — SÓ em dev (carregado via lazy atrás de `import.meta.env.DEV`). */
import { MAX_PLAYERS } from '@cartolina/shared';
import { useSyncExternalStore } from 'react';
import { addBot, botsIn, botsVersion, removeAllBots, subscribeBots } from './bots';
import { addDixitBot, dixitBotsIn, dixitBotsVersion, removeAllDixitBots, subscribeDixitBots } from './dixitBots';

const API = {
  ito: { subscribe: subscribeBots, version: botsVersion, count: (code: string) => botsIn(code).length, add: (code: string) => void addBot(code), removeAll: removeAllBots },
  dixit: { subscribe: subscribeDixitBots, version: dixitBotsVersion, count: dixitBotsIn, add: addDixitBot, removeAll: removeAllDixitBots },
};

export default function BotControls({ code, seats, game = 'ito' }: { code: string; seats: number; game?: 'ito' | 'dixit' }) {
  const api = API[game];
  useSyncExternalStore(api.subscribe, api.version);
  const count = api.count(code);
```

No resto do componente, troque `addBot(code)` por `api.add(code)` e `removeAllBots()` por `api.removeAll()`.

`web/src/games/dixit/DixitLobby.tsx`:

```tsx
import { DIXIT_MIN_PLAYERS, DIXIT_TARGETS, type DixitRoomView } from '@cartolina/shared';
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { roomLink } from '../../lib/router';
import type { GameConn } from '../../net/connection';
import { Critter } from '../../screens/Critter';
import { Brushes } from './Brushes';
import { SoundPill } from './DixitTopBar';
import './dixit.css';

const BotControls = import.meta.env.DEV ? lazy(() => import('../../dev/BotControls')) : null;

/** Lobby do Dixit, na identidade do jogo: quem está na mesa, meta (host) e começar. */
export function DixitLobby({ view, conn }: { view: DixitRoomView; conn: GameConn }) {
  const host = view.hostId !== null && view.hostId === view.you;
  const connected = view.seats.filter((s) => s.connected).length;
  const [copied, setCopied] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [hint, setHint] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const link = roomLink(view.code);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setShowLink(false);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setShowLink(true);
    }
  }

  return (
    <div className="dixit">
      <Brushes width={1440} />
      <main className="dx-lobby">
        <h1 className="dx-logo">
          dixit<small>sala {view.code} · cartolina~</small>
        </h1>
        <section className="dx-sheet">
          <h2>na mesa</h2>
          <ul className="dx-people">
            {view.seats.map((s) => (
              <li key={s.id} className={s.connected ? '' : 'off'}>
                <Critter color={s.color} />
                <span>
                  {s.name}
                  {s.id === view.you ? ' (você)' : ''}
                  {s.id === view.hostId ? ' · host' : ''}
                </span>
              </li>
            ))}
          </ul>
          <button className="dx-btn ghost" type="button" onClick={() => void copy()}>
            {copied ? 'link copiado!' : 'copiar link da sala'}
          </button>
          {showLink && <input className="dx-link" readOnly value={link} aria-label="link da sala" onFocus={(e) => e.currentTarget.select()} />}
          <SoundPill />
        </section>
        <section className="dx-sheet">
          <h2>partida</h2>
          <p>Até quantos pontos?</p>
          <div className="dx-targets">
            {DIXIT_TARGETS.map((t) => (
              <button key={t} type="button" aria-pressed={view.game.target === t} disabled={!host} onClick={() => conn.sendAction({ type: 'setTarget', target: t })}>
                <b>{t}</b>
                {t === 30 ? 'normal (como a caixa)' : 'curta'}
              </button>
            ))}
          </div>
          {host ? (
            <button
              className="dx-btn"
              type="button"
              onClick={() => (connected < DIXIT_MIN_PLAYERS ? setHint(`precisa de pelo menos 3 pessoas (tem ${connected})`) : conn.sendAction({ type: 'start' }))}
            >
              começar
            </button>
          ) : (
            <p>esperando o host começar…</p>
          )}
          {hint && <p role="status">{hint}</p>}
        </section>
        {BotControls && (
          <Suspense fallback={null}>
            <BotControls code={view.code} seats={view.seats.length} game="dixit" />
          </Suspense>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 4:** `cd web && npx vitest run test/dixit-lobby.test.tsx test/dixit-bots.test.ts test/bot-controls.test.tsx` deve dar PASS. Rode `npm test -w web`, `npm run typecheck -w web` e `npm run build -w web`. O build não pode conter `dixitBots`: confira com `grep -r "Bot Malu" web/dist || echo "sem bots no build"`.

- [ ] **Step 5: Teste manual com bots.** Suba `npm run dev:server` e `npm run dev:web`. Crie uma sala de Dixit com `curl -X POST http://127.0.0.1:8787/rooms -H "Content-Type: application/json" -d '{"game":"dixit"}'` e abra `http://localhost:5173/#/sala/<CÓDIGO>`. Adicione 3 bots e jogue 2 rodadas: narrando, escolhendo e votando. Confira:
  - a revelação narrada com holofote;
  - o placar da rodada;
  - os sons;
  - a rodinha sobre as cartas;
  - nada cobre os personagens;
  - nenhuma carta afunda no feltro.

  Compare com o protótipo (porta 5175) e anote diferenças no relatório.

- [ ] **Step 6: Commit.** `feat(web): lobby do Dixit e bots de desenvolvimento`

---

# Parte B — Dixit jogável na estante (depois da estante no `main`)

### Task 12: TRAVA — estante e D1 no `main`

- [ ] **Step 1:** `git fetch origin && git log origin/main --oneline -40`. Para seguir, o `main` precisa ter os commits do D1 (PR #5, "sala genérica com registro de jogos") e da estante (`web/src/games/catalog.ts`, conferível com `git show origin/main:web/src/games/catalog.ts | head -5`). Se faltar algum, PARE e reporte "D2 parte A pronta; parte B espera a estante/D1 no main".

- [ ] **Step 2:** `git merge origin/main`. Conflitos esperados e como resolver:
  - **`web/src/screens/Game.tsx`:** fique com a versão desta branch (Tarefa 10) e reaplique o que a estante tiver mudado no ramo do ITO (links de histórico, por exemplo).
  - **`web/test/dixit-fixtures.ts`:** a `createRoom` da estante não tem mais o grupo. Troque `createRoom('ABCD', 0, null, 'dixit')` por `createRoom('ABCD', 0, 'dixit')`.
  - **`web/src/dev/BotControls.tsx`:** junte as duas versões.
  - **Qualquer outro conflito:** comportamento do `main` + mudanças do Dixit.

- [ ] **Step 3:** `npm install && npm test && npm run typecheck && npm run build -w web` devem passar. Commit do merge: `merge: main (D1 + estante) no feat/dixit-mesa`, com a linha Co-Authored-By.

### Task 13: Dixit jogável no catálogo

**Files:** `web/src/games/catalog.ts` e o teste do catálogo da estante.

- [ ] **Step 1:** No teste do catálogo que a estante criou, troque a expectativa do Dixit para `playable` = `true`. Atualize também o teste da página do jogo que procura "Dixit tá chegando": a aba "jogar" do Dixit agora mostra "criar sala" e chama `createRoom('dixit', …)`. Siga o mesmo padrão do teste do ITO nesse arquivo. Rode e veja falhar.
- [ ] **Step 2:** Em `web/src/games/catalog.ts`, no `dixit`, coloque `playable: true` e troque as regras por:

```ts
    rules: [
      'O narrador escolhe uma carta da mão e dá uma dica: uma palavra, frase, som… (escrita ou na call).',
      'Os outros escolhem a carta da mão que mais combina com a dica, pra enganar a mesa.',
      'Todos votam em qual era a do narrador. Se todo mundo ou ninguém achar, quem narra não pontua.',
      'Acertou: +3. Cada voto que a sua carta enganou: +1. Ganha quem chegar na meta (30 ou 15).',
    ],
```

  Se a estante tiver deixado o selo "em breve" na capa do Dixit ligado a `playable`, ele some sozinho. Se for um texto fixo, remova.
- [ ] **Step 3:** `npm test -w web` e `npm run build -w web` devem passar. Commit: `feat(web): Dixit jogável a partir da estante`.

### Task 14: E2E de uma rodada de Dixit

**Files:** `e2e/dixit.spec.ts` (novo), seguindo os helpers de `e2e/helpers.ts`.

- [ ] **Step 1:** Leia `e2e/rodada.spec.ts` e `e2e/helpers.ts` para seguir o mesmo jeito de abrir contextos, entrar na sala e esperar estados. Escreva `e2e/dixit.spec.ts` com um teste "rodada de Dixit com 3 pessoas até o placar":
  - três contextos de navegador;
  - A abre `#/dixit`, clica em "criar sala", entra com nome e personagem; B e C entram pelo link;
  - A clica em "começar";
  - quem narra (o contexto com "você narra" no painel) clica em "sua carta 1", escreve "luar" em "sua dica" e clica em "contei";
  - os outros dois clicam em "sua carta 1" e "sua carta 2" e depois em "jogar essas" (com 3 pessoas cada um joga 2);
  - na votação, cada não-narrador clica na primeira carta da mesa que não tem o selo "sua" e confirma;
  - todos clicam em "pular ›"; A vê a região "placar da rodada".
- [ ] **Step 2:** `npm run e2e` (o config sobe os servidores; se já houver um `wrangler dev` na 8787 da pasta principal, rode com `CI=1` para subir servidores próprios). Precisa passar junto com os testes antigos.
- [ ] **Step 3:** Commit: `test(e2e): rodada de Dixit com 3 pessoas até o placar`.

### Task 15: README, verificação final e PR

- [ ] **Step 1:** README:
  - troque "o Dixit ainda sem mesa" por "Dixit jogável (cartas provisórias até a arte ficar pronta)";
  - mencione os bots do Dixit no lobby em desenvolvimento;
  - mencione o protótipo (`prototipo/dixit`, porta 5175).
- [ ] **Step 2:** `npm test && npm run typecheck && npm run build && npm run e2e` devem passar.
- [ ] **Step 3:** Push de `feat/dixit-mesa` e PR para `main` com resumo, prints da mesa e o aviso "merge publica: fora de noite de jogo". Não faça merge sem o usuário pedir.

---

## Cobertura da spec

| Spec | Onde |
|---|---|
| §4 lobby do Dixit, `Game.tsx` por `gameId`, entrar igual | Tarefas 10–11 |
| §4 (estante, página do jogo, catálogo) | Estante (sessão do ITO) + Tarefa 13 |
| §5.1 tela inteira, assentos em arco, feltro 3D sem afundar, mão, topo, painel, visualizador com rodinha, nada sobre os personagens | Tarefas 2, 6–10 |
| §5.2 trilha e peões | Tarefas 2, 7 |
| §5.3 revelação narrada (holofote, votos, donos, pontos, legenda com fade, placar com motivos, ver a mesa, host passa) | Tarefas 5, 9, 10 |
| §5.5 cartas provisórias e `REAL_ART` | Tarefas 3, 6 |
| §5.6 bots | Tarefa 11 |
| §6 identidade e sons do ITO | Tarefas 1, 6, 10 |
| §9 testes | todas as tarefas + Tarefa 14 (E2E) |
