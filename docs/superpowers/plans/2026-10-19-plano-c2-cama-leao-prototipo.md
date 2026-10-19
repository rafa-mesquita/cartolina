# Plano C2 — Cama-Leão: protótipo da mesa com bots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um protótipo só de front (`prototipo/cama-leao/`) em que o Rafa joga partidas inteiras do Cama-Leão contra 1 a 5 bots: arrastar a carta até a mesa de alguém, ver a carta voar, virar e fechar/estourar, com letreiro e sons. Serve pra validar a sensação e o baralho inventado antes da mesa de verdade (Plano C3).

**Architecture:** Página estática (HTML + scripts soltos, sem framework), servida por `http-server` na raiz da worktree, como `prototipo/retratim/`. As **regras são as reais**: `shared/src/games/camelio` empacotado com esbuild em `rules.js` (global `CamaLeao`), e toda ação passa pelo `camelioActionSchema` antes de `applyCamelioAction`, igual ao servidor. As partes que o C3 vai portar ficam em arquivos próprios com contrato claro: `cards.js` (frente e verso), `bot.js` (escolha do bot), `narrate.js` (texto do letreiro), `anim.js` (a virada) e `sounds.js`. Um script Node (`sim.cjs`) roda 200 partidas só de bots com as regras reais: testa os bots sem navegador e mede o baralho (duração, fim por meta × por monte).

**Tech Stack:** HTML/CSS/JS puro (ES2020, `'use strict'`), esbuild (já em `node_modules`), Web Animations API, Web Audio sintetizado, Google Fonts (Rye + Fredoka), Node (só o `sim.cjs`).

**Spec:** `docs/superpowers/specs/2026-10-19-cama-leao-design.md` §2 (regras), §5 (mesa: identidade circo §5.1, disposição §5.2, gesto §5.3, virada §5.4, lobby/fim §5.5). Este plano é o item 2 da §8 (C2).

---

## Contexto para quem vai executar

- Worktree `C:\Users\rafam\Desktop\Rpositórios Github - claude\Pessoal\Jogos de tabuleiro\.claude\worktrees\camelio`, branch `feat/camelio` (o C1 já está nela: `shared/src/games/camelio/` completo e testado). Use **caminhos absolutos** da worktree; nunca mexa na pasta mãe nem troque branch; nunca `git stash`. Bash (Git Bash); `rtk` não existe. Prefira as ferramentas Write/Edit pra criar arquivos (heredoc grande no Bash já falhou aqui).
- **Protótipo é descartável**, mas `cards.js`, `bot.js`, `narrate.js`, `anim.js` e `sounds.js` são a referência que o C3 vai portar pra `web/src/games/camelio/`: mantenha os contratos descritos aqui.
- Nada aqui entra no site (`web/`) nem no `shared/`. **Não mexa em `shared/src`**: se achar bug nas regras, pare e reporte.
- Tudo em português (textos da tela, comentários). Commits `feat(prototipo): …`, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Como ver: a Task 1 cria a entrada `prototipo-cama-leao` no `.claude/launch.json` da worktree (porta 5178); manualmente: `npx http-server . -p 5178 -c-1` na raiz da worktree e abrir `http://localhost:5178/prototipo/cama-leao/`. O controlador confere cada task no navegador. Quem implementa confere o que der sem navegador (o `sim.cjs`, `node --check` dos scripts) e diz no relatório o que não conseguiu ver.
- Palco fixo de **1440×900**, escalado pra caber na janela usando a **largura toda** (pedido do Rafa nos protótipos anteriores: nada de faixas vazias nas laterais). Só computador.
- O jogador humano é sempre `p0` e é o host. Bots são `p1…p5`, nomes `Bia, Léo, Nina, Caio, Duda`. Personagens: `prototipo/dixit/critters.js` (`window.CRITTERS`, cor → SVG), como no Retratim.
- Pedidos antigos do Rafa que valem aqui: sons **baixos** (volume mestre 0,35); o letreiro **não pula** (caixa parada, texto troca com fade); nada cobre os personagens; o que sobrou de uma jogada some quando a próxima começa.

### Identidade "circo" (spec §5.1)

```css
:root{
  --cream:#f7efe0; --canvas:#f3dcd2; --red:#c8372d; --red-dark:#9e2a22; --navy:#1f2a4a; --navy-soft:#5a6382;
  --gold:#e8b23a; --line:#e2c9b8; --shadow:0 2px 6px rgba(31,42,74,.18);
  --logo:'Rye',Georgia,serif; /* só no logo */ --ui:'Fredoka',system-ui,sans-serif;
}
```

Cores das esferas (as mesmas do C3): verde `#4caf50`, amarelo `#f2c230`, laranja `#f08a24`, vermelho `#e04848`, roxo `#8e5cc7`, azul `#3a8fd8`. Nunca dependa só da cor: toda carta tem `title`/`aria-label` com o nome da cor.

### Regras que a tela precisa saber (resumo do spec §2)

- Na vez: pegar a **aberta** (frente à mostra) ou a do **monte** (só o verso: cor, ou esferas + 2 cores, ou esferas + "qualquer cor") e soltar na mesa de alguém (inclusive a sua). A ação é `{ type: 'play', from: 'open' | 'deck', to }`.
- A carta resolve só a cor dela, na mesa de quem recebeu: 5 exato numa cor nova **fecha** (vai pra área de pontos); passou de 5 **estoura** (cartas da cor pro descarte); cor já pontuada chegando a 5 ou mais **perde o ponto** (descarta tudo dela).
- Meta: 3 cores (4 com 2 jogadores). Fim também quando o monte acaba pela 2ª vez.
- A view (`CamaLeao.camelioViewFor(state, 'p0')`) traz tudo pronto: `open` (carta), `top` (verso), `deckCount`, `reshuffled`, `table`/`scored` (cartas inteiras por jogador), `points`, `turn`, `paused`, `last` (última jogada: `{ by, from, to, card, outcome, color, sum }`), `playCount`, `match`, `winners`, `endReason`.

## Mapa de arquivos

Criar em `prototipo/cama-leao/`:
- `_entry.ts`: o que o protótipo usa das regras reais.
- `rules.js`: gerado pelo esbuild a partir de `_entry.ts` (commitado, como no Retratim).
- `bot.js`: `window.CamaLeaoBot.choose(view, me, active, rng)` → `{ from, to }`.
- `narrate.js`: `window.narrate(last, nameOf)` → frase do letreiro.
- `sim.cjs`: 200 partidas só de bots, com as regras reais (Node).
- `cards.css` + `cards.js`: `window.CardArt.front(card, w)` e `window.CardArt.back(back, w)` (HTML).
- `cartas.html`: folha com as 72 frentes e os versos, pra conferir as cartas.
- `index.html`: palco, CSS da mesa, telas, painel de dev, laço do jogo, gesto.
- `anim.js`: `window.Anim.play(prev, next)` → `Promise` (a virada).
- `sounds.js`: `window.play(nome)` e `window.setSound(on)`.

Modificar: `.claude/launch.json` da worktree (entrada `prototipo-cama-leao`).

---

### Task 1: regras reais, bot, narração e simulação

Tudo aqui roda sem navegador.

**Files:**
- Create: `prototipo/cama-leao/_entry.ts`, `prototipo/cama-leao/rules.js` (gerado), `prototipo/cama-leao/bot.js`, `prototipo/cama-leao/narrate.js`, `prototipo/cama-leao/sim.cjs`
- Modify: `.claude/launch.json`

- [ ] **Step 1: `_entry.ts`**

```ts
// Só para o protótipo: o que a página usa das regras reais do Cama-Leão.
export { applyCamelioAction, camelioOnPresenceChange, initialCamelioState } from '../../shared/src/games/camelio/rules';
export { camelioViewFor } from '../../shared/src/games/camelio/view';
export { camelioActionSchema } from '../../shared/src/games/camelio/schema';
export { CAMELIO_DECK, camelioBack, camelioCard } from '../../shared/src/games/camelio/deck';
export { CAMELIO_COLORS, CAMELIO_EXACT } from '../../shared/src/games/camelio/types';
```

- [ ] **Step 2: gerar `rules.js`**

Run:
```bash
node_modules/.bin/esbuild prototipo/cama-leao/_entry.ts --bundle --format=iife --global-name=CamaLeao --target=es2020 --outfile=prototipo/cama-leao/rules.js --banner:js="// Gerado com esbuild a partir de shared/src/games/camelio (regras reais, só para o protótipo). Não editar à mão."
```
Expected: `prototipo/cama-leao/rules.js` criado, sem erro.

- [ ] **Step 3: `narrate.js`**

```js
'use strict';
/* Frase do letreiro pra uma jogada (spec §5.4). `nameOf(id)` dá o nome; o humano é "você". */
(function () {
  function narrate(last, nameOf) {
    if (!last) return '';
    const card = CamaLeao.camelioCard(last.card);
    const by = nameOf(last.by);
    const what = `${last.from === 'deck' ? 'o' : 'um'} ${card.spheres} ${card.color}${last.from === 'deck' ? ' do monte' : ''}`;
    const head = last.to === last.by ? `${by} ficou com ${what}` : `${by} deu ${what} pra ${nameOf(last.to)}`;
    const who = last.to === last.by ? '' : `${nameOf(last.to)} `;
    switch (last.outcome) {
      case 'scored':
        return `${head}: ${who}fechou o ${card.color}!`;
      case 'bust':
        return `${head}: ${who}estourou!`;
      case 'lost':
        return `${head}: ${who}perdeu o ponto do ${card.color}!`;
      default:
        return `${head}.`;
    }
  }
  window.narrate = narrate;
})();
```

Exemplos esperados: "Léo deu um 3 vermelho pra Bia: Bia estourou!", "Léo ficou com um 4 vermelho: estourou!", "Duda ficou com o 2 azul do monte: fechou o azul!", "você deu um 1 verde pra Nina: Nina fechou o verde!". (Com o humano o texto fica "você ficou com…", minúsculo de propósito: o letreiro começa com o nome.)

- [ ] **Step 4: `bot.js`**

O bot só olha o que um jogador vê (a view). Pra carta do monte, considera todas as cartas do baralho com o mesmo verso que não estão à vista e tira a média.

```js
'use strict';
/* Bot do protótipo (spec §5.5): fecha 5 se puder, dá carta que estoura o líder, senão fica com carta que não estoura.
   Escolhe { from, to } olhando só a view, como um jogador: devolve { from, to } ou null se não há jogada.
   Referência pros bots de dev do C3. */
(function () {
  const { CAMELIO_DECK, CAMELIO_EXACT, camelioBack } = CamaLeao;
  const sameBack = (a, b) =>
    a.kind === b.kind &&
    a.color === b.color &&
    a.spheres === b.spheres &&
    (a.colors ? a.colors[0] : undefined) === (b.colors ? b.colors[0] : undefined) &&
    (a.colors ? a.colors[1] : undefined) === (b.colors ? b.colors[1] : undefined);

  /** Soma da cor na mesa de `to` com a carta, e o que aconteceria. */
  function outcomeOf(view, to, card) {
    const sum = (view.table[to] || []).filter((c) => c.color === card.color).reduce((n, c) => n + c.spheres, 0) + card.spheres;
    const already = (view.scored[to] || []).some((c) => c.color === card.color);
    if (already) return { o: sum >= CAMELIO_EXACT ? 'lost' : 'none', sum };
    return { o: sum === CAMELIO_EXACT ? 'scored' : sum > CAMELIO_EXACT ? 'bust' : 'none', sum };
  }

  /** Quanto vale pro bot `me` a carta `card` cair na mesa de `to`. */
  function value(view, me, to, card) {
    const { o, sum } = outcomeOf(view, to, card);
    const pts = (p) => view.points[p] || 0;
    const top = Math.max(...view.players.map(pts));
    const leader = pts(to) === top && top > 0;
    if (to === me) {
      if (o === 'scored') return pts(me) + 1 >= view.target ? 100 : 10;
      if (o === 'bust') return -6;
      if (o === 'lost') return -12;
      return 1 + sum / CAMELIO_EXACT; // perto de 5 sem passar é bom
    }
    if (o === 'scored') return pts(to) + 1 >= view.target ? -100 : -8;
    // Só vale a pena estourar/derrubar o líder; quem não lidera quase não compensa (spec §5.5).
    if (o === 'bust') return leader ? 7 : 0.5;
    if (o === 'lost') return leader ? 10 : 1.5;
    return 0;
  }

  /** Cartas que podem estar atrás do verso do topo (as que estão à vista ficam de fora). */
  function behind(view) {
    const seen = new Set([view.open, ...Object.values(view.table).flat(), ...Object.values(view.scored).flat()].filter(Boolean).map((c) => c.id));
    const options = CAMELIO_DECK.filter((c) => !seen.has(c.id) && sameBack(camelioBack(c), view.top));
    return options.length ? options : CAMELIO_DECK.filter((c) => sameBack(camelioBack(c), view.top));
  }

  /** `active`: quem pode receber carta agora (jogadores da partida que estão online). */
  function choose(view, me, active, rng) {
    if (view.phase !== 'playing' || view.paused) return null;
    const targets = view.players.filter((p) => active.includes(p));
    const deckCards = view.top ? behind(view) : [];
    let best = null;
    for (const to of targets) {
      const plays = [];
      if (view.open) plays.push({ from: 'open', v: value(view, me, to, view.open) });
      if (deckCards.length) plays.push({ from: 'deck', v: deckCards.reduce((n, c) => n + value(view, me, to, c), 0) / deckCards.length });
      for (const p of plays) {
        const score = p.v + rng() * 0.5; // um pouco de sorte pra não jogar sempre igual
        if (!best || score > best.score) best = { from: p.from, to, score };
      }
    }
    return best ? { from: best.from, to: best.to } : null;
  }

  window.CamaLeaoBot = { choose, outcomeOf };
})();
```

- [ ] **Step 5: `sim.cjs`**

```js
// Confere bots e narração com as regras reais, sem navegador, e mede o baralho:
//   node prototipo/cama-leao/sim.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

global.window = global;
for (const f of ['rules.js', 'narrate.js', 'bot.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), { filename: f });
}
const { initialCamelioState, applyCamelioAction, camelioViewFor, camelioActionSchema } = CamaLeao;

function must(res, what) {
  if (!res.ok) throw new Error(`${what} recusado: ${res.error}`);
  return res.state;
}

// Frases exatas da narração (ids do baralho: 22 = vermelho 3, 20 = vermelho 2, 0 = verde 1, 47 = bicolor vermelho 3).
{
  const nomes = { p0: 'você', p1: 'Léo', p2: 'Bia', p3: 'Nina' };
  const nameOf = (p) => nomes[p];
  const casos = [
    [{ by: 'p1', from: 'open', to: 'p2', card: 22, outcome: 'bust' }, 'Léo deu um 3 vermelho pra Bia: Bia estourou!'],
    [{ by: 'p1', from: 'open', to: 'p1', card: 22, outcome: 'bust' }, 'Léo ficou com um 3 vermelho: estourou!'],
    [{ by: 'p0', from: 'deck', to: 'p0', card: 20, outcome: 'scored' }, 'você ficou com o 2 vermelho do monte: fechou o vermelho!'],
    [{ by: 'p0', from: 'open', to: 'p3', card: 0, outcome: 'none' }, 'você deu um 1 verde pra Nina.'],
    [{ by: 'p2', from: 'deck', to: 'p0', card: 47, outcome: 'lost' }, 'Bia deu o 3 vermelho do monte pra você: você perdeu o ponto do vermelho!'],
  ];
  for (const [last, esperado] of casos) {
    const got = narrate(last, nameOf);
    if (got !== esperado) throw new Error(`narração diferente:
  esperado: ${esperado}
  veio:     ${got}`);
  }
  if (narrate(null, nameOf) !== '') throw new Error('narrate(null) devia devolver ""');
  const lobby = camelioViewFor(initialCamelioState(), 'p0');
  if (CamaLeaoBot.choose(lobby, 'p0', ['p0', 'p1'], Math.random) !== null) throw new Error('bot devia devolver null no lobby');
}

const GAMES_PER_N = 40;
const report = [];
for (let n = 2; n <= 6; n++) {
  const ids = Array.from({ length: n }, (_, i) => `p${i}`);
  const ctx = { hostId: 'p0', active: ids, rng: Math.random, now: 0 };
  const stats = { target: 0, deck: 0, plays: 0, maxPlays: 0, busts: 0, lost: 0, scored: 0 };
  for (let g = 0; g < GAMES_PER_N; g++) {
    let s = must(applyCamelioAction(initialCamelioState(), 'p0', { type: 'start' }, ctx), 'start');
    let steps = 0;
    while (s.phase === 'playing') {
      const me = s.turn;
      const action = { type: 'play', ...CamaLeaoBot.choose(camelioViewFor(s, me), me, ids, Math.random) };
      const parsed = camelioActionSchema.safeParse(action);
      if (!parsed.success) throw new Error(`bot mandou ação inválida: ${JSON.stringify(action)}`);
      s = must(applyCamelioAction(s, me, parsed.data, ctx), 'play');
      const last = s.log[s.log.length - 1];
      const text = narrate(last, (p) => (p === 'p0' ? 'você' : p));
      if (typeof text !== 'string' || text.length < 10) throw new Error(`narração vazia: ${JSON.stringify(last)}`);
      if (last.outcome === 'bust') stats.busts++;
      if (last.outcome === 'lost') stats.lost++;
      if (last.outcome === 'scored') stats.scored++;
      if (++steps > 200) throw new Error('partida não acaba');
    }
    stats[s.endReason]++;
    stats.plays += steps;
    stats.maxPlays = Math.max(stats.maxPlays, steps);
  }
  report.push(
    `${n} jogadores: ${stats.target} por meta, ${stats.deck} por monte; ` +
      `${(stats.plays / GAMES_PER_N).toFixed(0)} jogadas em média (máx. ${stats.maxPlays}); ` +
      `por partida: ${(stats.scored / GAMES_PER_N).toFixed(1)} fechadas, ${(stats.busts / GAMES_PER_N).toFixed(1)} estouros, ${(stats.lost / GAMES_PER_N).toFixed(1)} pontos perdidos`,
  );
}
console.log(report.join('\n'));
console.log('ok: 200 partidas de bots terminaram sem erro');
```

- [ ] **Step 6: Rodar a simulação**

Run: `node prototipo/cama-leao/sim.cjs`
Expected: 5 linhas (2 a 6 jogadores) e `ok: 200 partidas de bots terminaram sem erro`. Copie as 5 linhas pro relatório (o Rafa vai usar pra julgar o baralho). Se der erro, conserte o protótipo; se o erro for das regras (`shared/`), pare e reporte.

- [ ] **Step 7: Entrada no `.claude/launch.json` da worktree**

Acrescente depois de `prototipo-retratim`:

```json
    {
      "name": "prototipo-cama-leao",
      "runtimeExecutable": "npx",
      "runtimeArgs": ["--yes", "http-server", ".", "-p", "5178", "-c-1", "--silent"],
      "port": 5178
    },
```

- [ ] **Step 8: Commit**

```bash
git add prototipo/cama-leao/_entry.ts prototipo/cama-leao/rules.js prototipo/cama-leao/bot.js prototipo/cama-leao/narrate.js prototipo/cama-leao/sim.cjs .claude/launch.json
git commit -m "feat(prototipo): Cama-Leão — regras reais, bot e simulação de 200 partidas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: as cartas (frente e verso)

**Files:**
- Create: `prototipo/cama-leao/cards.css`, `prototipo/cama-leao/cards.js`, `prototipo/cama-leao/cartas.html`

- [ ] **Step 1: `cards.css`**

A largura da carta vem de `--w` (px, sem unidade no cálculo: use `--w:64px`); a altura é 1,44 × a largura.

```css
/* Cartas do Cama-Leão (frente e verso). Tamanho por --w; altura = 1,44 × largura. */
.card{--w:64px;position:relative;flex:none;width:var(--w);height:calc(var(--w) * 1.44);border-radius:calc(var(--w) * .14);
  border:2px solid #f7efe0;box-shadow:0 1px 3px rgba(31,42,74,.35);box-sizing:border-box;overflow:hidden}
.card.front{background:var(--c);display:grid;place-items:center}
.card .sphs{display:grid;grid-template-columns:repeat(2,auto);gap:calc(var(--w) * .07)}
.card.n1 .sphs{grid-template-columns:auto}
.card.n3 .sph:last-child{grid-column:1 / span 2;justify-self:center}
.card .sph{width:calc(var(--w) * .25);height:calc(var(--w) * .25);border-radius:50%;
  background:radial-gradient(circle at 35% 30%,#fff 0 30%,#f3f0ea 60%,#d9d3c8 100%);box-shadow:0 0 0 1.5px rgba(31,42,74,.4)}
/* marquinha do tipo na frente (depois de revelada dá pra saber que era bicolor/multicolor) */
.card .kind{position:absolute;right:7%;top:5%;width:20%;height:14%;border-radius:50%;border:1.5px solid #f7efe0}
.card .kind-bicolor{background:linear-gradient(135deg,var(--a) 50%,var(--b) 50%)}
.card .kind-multi{background:conic-gradient(#4caf50,#f2c230,#f08a24,#e04848,#8e5cc7,#3a8fd8,#4caf50)}
/* versos */
.card.back.normal{background:
  radial-gradient(circle at 50% 100%,rgba(255,255,255,.2) 0 45%,transparent 47%) 0 0 / calc(var(--w) * .24) calc(var(--w) * .18),
  var(--c)}
.card.back.bicolor{background:linear-gradient(135deg,var(--a) 50%,var(--b) 50%)}
.card.back.multi{background:linear-gradient(180deg,#4caf50 0 16.66%,#f2c230 0 33.33%,#f08a24 0 50%,#e04848 0 66.66%,#8e5cc7 0 83.33%,#3a8fd8 0)}
.card .num{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:46%;aspect-ratio:1;border-radius:50%;
  background:#f7efe0;color:#1f2a4a;display:grid;place-items:center;font:500 calc(var(--w) * .3)/1 'Fredoka',system-ui,sans-serif;
  box-shadow:0 0 0 2px #1f2a4a}
```

- [ ] **Step 2: `cards.js`**

```js
'use strict';
/* Cartas do Cama-Leão em HTML. Referência visual pro C3 (web/src/games/camelio). */
(function () {
  const HEX = { verde: '#4caf50', amarelo: '#f2c230', laranja: '#f08a24', vermelho: '#e04848', roxo: '#8e5cc7', azul: '#3a8fd8' };
  const KIND = { normal: '', bicolor: ' (bicolor)', multi: ' (multicolor)' };
  const esferas = (n) => `${n} ${n === 1 ? 'esfera' : 'esferas'}`;

  /** Frente: a cor de verdade e as esferas. `w` = largura em px. */
  function front(card, w = 64) {
    const label = `${esferas(card.spheres)} ${card.color}${KIND[card.kind]}`;
    const pair = card.pair ? `;--a:${HEX[card.pair[0]]};--b:${HEX[card.pair[1]]}` : '';
    const badge = card.kind === 'normal' ? '' : `<span class="kind kind-${card.kind}" aria-hidden="true"></span>`;
    const sph = '<span class="sph"></span>'.repeat(card.spheres);
    return `<div class="card front n${card.spheres}" data-id="${card.id}" style="--w:${w}px;--c:${HEX[card.color]}${pair}" title="${label}" aria-label="${label}">${badge}<span class="sphs">${sph}</span></div>`;
  }

  /** Verso do topo do monte (`CamelioBack`): só o que dá pra ver. */
  function back(b, w = 64) {
    if (b.kind === 'normal') {
      const label = `carta ${b.color} virada`;
      return `<div class="card back normal" style="--w:${w}px;--c:${HEX[b.color]}" title="${label}" aria-label="${label}"></div>`;
    }
    if (b.kind === 'bicolor') {
      const label = `${esferas(b.spheres)}, ${b.colors[0]} ou ${b.colors[1]}`;
      return `<div class="card back bicolor" style="--w:${w}px;--a:${HEX[b.colors[0]]};--b:${HEX[b.colors[1]]}" title="${label}" aria-label="${label}"><span class="num">${b.spheres}</span></div>`;
    }
    const label = `${esferas(b.spheres)}, qualquer cor`;
    return `<div class="card back multi" style="--w:${w}px" title="${label}" aria-label="${label}"><span class="num">${b.spheres}</span></div>`;
  }

  window.CardArt = { HEX, front, back };
})();
```

- [ ] **Step 3: `cartas.html` (folha de conferência)**

Página simples, fundo creme `#f7efe0`, fonte Fredoka (Google Fonts `Fredoka:wght@400;500`), que carrega `rules.js`, `cards.css` e `cards.js` e mostra:
1. **Frentes:** as 72 cartas de `CamaLeao.CAMELIO_DECK` em 3 blocos com título ("normais", "bicolores", "multicoloridas"), 12 por linha, `w = 64`, cada uma com o id embaixo em 11px.
2. **Versos:** um verso de cada tipo (`CamaLeao.camelioBack(card)` de uma normal de cada cor, uma bicolor de cada par, as multicoloridas de 1 e 2), em `w = 92`.
3. **Tamanhos:** a mesma carta (`id 22`) em `w = 40`, `64`, `92` e `120`, pra ver as esferas em todos os tamanhos da mesa.

```html
<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Cama-Leão · cartas</title>
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="cards.css">
<style>
body{margin:24px;background:#f7efe0;color:#1f2a4a;font:400 14px/1.4 'Fredoka',system-ui,sans-serif}
h2{font-weight:500;margin:24px 0 10px}
.row{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end}
.cell{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:11px;color:#5a6382}
</style>
</head>
<body>
<div id="out"></div>
<script src="rules.js"></script>
<script src="cards.js"></script>
<script>
'use strict';
const { CAMELIO_DECK, camelioBack } = CamaLeao;
const cell = (html, cap) => `<div class="cell">${html}<span>${cap}</span></div>`;
const kinds = { normal: 'normais', bicolor: 'bicolores', multi: 'multicoloridas' };
let html = '';
for (const [kind, title] of Object.entries(kinds)) {
  html += `<h2>${title}</h2><div class="row">${CAMELIO_DECK.filter((c) => c.kind === kind).map((c) => cell(CardArt.front(c, 64), c.id)).join('')}</div>`;
}
const backs = [
  ...CAMELIO_DECK.filter((c) => c.kind === 'normal' && c.spheres === 1).filter((c, i, a) => a.findIndex((x) => x.color === c.color) === i),
  ...CAMELIO_DECK.filter((c) => c.kind === 'bicolor' && c.spheres === 1).filter((c, i, a) => a.findIndex((x) => x.pair.join() === c.pair.join()) === i),
  ...CAMELIO_DECK.filter((c) => c.kind === 'multi' && c.color === 'verde'),
];
html += `<h2>versos</h2><div class="row">${backs.map((c) => cell(CardArt.back(camelioBack(c), 92), c.kind)).join('')}</div>`;
html += `<h2>tamanhos</h2><div class="row">${[40, 64, 92, 120].map((w) => cell(CardArt.front(CAMELIO_DECK[22], w), `${w}px`)).join('')}</div>`;
document.getElementById('out').innerHTML = html;
</script>
</body>
</html>
```

- [ ] **Step 4: Conferir sem navegador o que der**

Run: `node --check prototipo/cama-leao/cards.js`
Expected: sem saída (sintaxe ok). No relatório: "a folha precisa ser conferida no navegador em `/prototipo/cama-leao/cartas.html`".

- [ ] **Step 5: Commit**

```bash
git add prototipo/cama-leao/cards.css prototipo/cama-leao/cards.js prototipo/cama-leao/cartas.html
git commit -m "feat(prototipo): cartas do Cama-Leão (frente, verso e folha de conferência)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

O controlador abre `cartas.html` e confere: esferas legíveis em 40px, versos distinguíveis, marquinha de bicolor/multicolor na frente, nada cortado.

---

### Task 3: a mesa (palco, disposição, laço do jogo, bots e clique)

Sem animação ainda: a jogada aparece direto no lugar. O gesto aqui é só o clique (o arrasto vem na Task 4).

**Files:**
- Create: `prototipo/cama-leao/index.html`, `prototipo/cama-leao/sounds.js` (provisório)

- [ ] **Step 1: `sounds.js` provisório**

```js
'use strict';
/* Provisório: os sons chegam na Task 6. */
window.play = () => {};
window.setSound = () => {};
```

- [ ] **Step 2: `index.html`: cabeça, scripts e palco**

- `<head>`: título "Cama-Leão · protótipo da mesa"; Google Fonts `Rye` e `Fredoka:wght@400;500;600`; Tabler Icons webfont (`https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.19.0/dist/tabler-icons.min.css`); `<link rel="stylesheet" href="cards.css">`; o `:root` da identidade (seção "Identidade circo").
- `html,body`: altura 100%, `overflow:hidden`, fundo `#e9d6c6`; `body` em `var(--ui)` peso 500, cor `var(--navy)`, sem seleção de texto.
- `#app`: palco 1440×900 com `transform-origin:50% 50%`, fundo de lona listrada vertical (`repeating-linear-gradient(90deg,var(--cream) 0 44px,var(--canvas) 44px 88px)`) com uma vinheta suave nas bordas.
- Scripts no fim do `<body>`, nesta ordem: `../dixit/critters.js`, `rules.js`, `cards.js`, `narrate.js`, `bot.js`, `sounds.js`, e o script principal.
- Escala (largura toda, como no Retratim):

```js
let APPW = 1440;
function fit() {
  let sc = innerHeight / 900, w = innerWidth / sc;
  if (w < 1440) { sc = innerWidth / 1440; w = 1440; }
  APPW = Math.round(w); app.style.width = APPW + 'px';
  app.style.transform = `translate(-50%,-50%) scale(${sc})`;
}
addEventListener('resize', () => { fit(); render(shown); });
```

(`#app` com `position:absolute;left:50%;top:50%`.)

- [ ] **Step 3: estado, laço do jogo e bots (script principal)**

```js
'use strict';
/* Protótipo da mesa do Cama-Leão (descartável). Regras: shared/src/games/camelio empacotadas em rules.js. */
const $ = (s) => document.querySelector(s);
const app = $('#app');
const ME = 'p0';
const NAMES = ['você', 'Bia', 'Léo', 'Nina', 'Caio', 'Duda'];
const CRITTER_COLORS = Object.keys(window.CRITTERS);
/** Mensagens de shared/src/protocol.ts pros códigos que o Cama-Leão usa. */
const ERR = {
  not_your_turn: 'Não é a sua vez.', bad_target: 'Essa pessoa não pode ser escolhida agora.',
  not_playing: 'A partida não está rolando agora.', not_host: 'Só o host pode fazer isso.',
  bad_phase: 'Agora não dá pra fazer isso.', not_enough_players: 'Precisa de pelo menos 2 jogadores.',
};
let N = 4, SPEED = 1;
let ids = [], online = new Set(), state = null;
/** O que está desenhado agora. Durante a animação continua sendo a view de antes da jogada. */
let shown = null, animating = false, picked = null;
/** De quem era a vez no último desenho (pro som de "sua vez" tocar uma vez só). */
let prevTurn = null;

const nameOf = (p) => NAMES[Number(p.slice(1))];
const critter = (p) => window.CRITTERS[CRITTER_COLORS[Number(p.slice(1)) % CRITTER_COLORS.length]];
const active = () => ids.filter((p) => online.has(p));
const ctx = () => ({ hostId: ME, active: active(), rng: Math.random, now: Date.now() });
const view = () => CamaLeao.camelioViewFor(state, ME);
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 2400); }

/** Igual ao servidor: o schema das ações valida antes das regras. */
function act(pid, action) {
  const parsed = CamaLeao.camelioActionSchema.safeParse(action);
  if (!parsed.success) { console.error('ação inválida (bug do protótipo)', action, parsed.error); toast('Ação inválida (bug do protótipo — veja o console)'); return false; }
  const res = CamaLeao.applyCamelioAction(state, pid, parsed.data, ctx());
  if (!res.ok) { if (pid === ME) { toast(ERR[res.error] || res.error); play('error'); } return false; }
  state = res.state; changed(); return true;
}
/** O "servidor" reavaliando presença (alguém caiu ou voltou, no painel de dev). */
function presence() { const next = CamaLeao.camelioOnPresenceChange(state, ctx()); if (next !== state) { state = next; changed(); } }

/** Toda mudança passa aqui: jogada nova anima a partir do que está desenhado; o resto só redesenha. */
function changed() {
  if (animating) return; // o fim da animação chama changed() de novo
  const v = view();
  const fresh = shown && v.last && v.match === shown.match && v.playCount === shown.playCount + 1;
  if (fresh) {
    animating = true; picked = null;
    Anim.play(shown, v).then(() => { animating = false; shown = null; changed(); });
    return;
  }
  if (v.phase === 'playing' && v.turn === ME && prevTurn !== ME) play('turn');
  prevTurn = v.turn;
  shown = v; render(v); scheduleBot(v);
}

let botTimer = 0;
function cancelBot() { clearTimeout(botTimer); botTimer = 0; }
function scheduleBot(v) {
  cancelBot();
  if (v.phase !== 'playing' || v.paused || !v.turn || v.turn === ME || !online.has(v.turn)) return;
  const p = v.turn;
  botTimer = setTimeout(() => {
    botTimer = 0;
    if (animating || !state || state.turn !== p || state.paused) return;
    const choice = CamaLeaoBot.choose(CamaLeao.camelioViewFor(state, p), p, active(), Math.random);
    act(p, { type: 'play', ...choice });
  }, (900 + Math.random() * 900) * SPEED);
}

function newGame() {
  cancelBot(); picked = null; animating = false; shown = null; prevTurn = null;
  ids = Array.from({ length: N }, (_, i) => `p${i}`);
  online = new Set(ids);
  state = CamaLeao.initialCamelioState();
  act(ME, { type: 'start' });
  renderDev();
}
```

Antes da Task 5 não existe `anim.js`; no script principal, logo depois das constantes, deixe:

```js
// A virada de verdade chega na Task 5 (anim.js); até lá a jogada só aparece no lugar.
window.Anim = window.Anim || { play: () => Promise.resolve() };
```

E `shown = null` no `.then` faz o `changed()` seguinte redesenhar a view nova (o `fresh` fica falso).

- [ ] **Step 4: disposição e desenho (`render(v)`)**

`render(v)` reconstrói o conteúdo de 4 regiões com `innerHTML` (simples e suficiente pro protótipo). Coordenadas no palco (largura `APPW`, altura 900):

1. **`#top`** (altura 72, faixa creme com borda inferior tracejada `var(--line)`): à esquerda o logo "Cama-Leão" em `var(--logo)` 38px `var(--red)`; no centro `#info` em 14px `var(--navy-soft)`: `meta: <b>3 cores</b> · monte <b>41</b>` e, depois do reembaralho, ` · <b>último monte</b>`; à direita os botões redondos de som (`ti-volume`/`ti-volume-off`) e de dev (`ti-adjustments`).
2. **`#seats`** (os outros, `top: 86`, altura 300): um `.seat[data-pid]` por adversário, espalhados na largura toda num arco. Pra `k` adversários na ordem dos assentos, o centro do i-ésimo fica em `x = APPW * (i + 1) / (k + 1)` e `y = 20 + 40 * (1 - Math.sin(Math.PI * (i + 1) / (k + 1)))` (os das pontas um pouco mais baixos). Cada assento, 230px de largura:
   - cabeçalho: personagem (`critter(p)`, 44px), nome em 15px 600, e as **bandeirinhas** dos pontos: um triângulo 14×16 por cor pontuada (`clip-path:polygon(0 0,100% 50%,0 100%)` na cor, `title` = "pontuou o vermelho");
   - `.stacks`: uma `.stack[data-color]` por cor que tem carta na área de jogo, na ordem de `CAMELIO_COLORS`. A pilha empilha as cartas na vertical (`CardArt.front(c, 46)`, cada uma com `margin-top:-50px` exceto a primeira, então aparecem as faixas de cima com as esferas) e embaixo a soma `.sum` "3/5"; com 4 a soma ganha a classe `.hot` (vermelho, negrito, pulsando devagar); numa cor já pontuada a pilha ganha `.scored` (contorno tracejado dourado) e a soma "2/5 ⚑".
   - estados: `.seat.turn` (holofote: `radial-gradient` dourado translúcido atrás do assento e nome sublinhado em `var(--gold)`); `.seat.off` (opacity .45, `filter:grayscale(1)`, rótulo "caiu" no lugar das bandeirinhas); `.seat.target` (pode receber: contorno 2px tracejado `var(--red)` só enquanto `picked` não é null); `.seat.hover` (contorno cheio e leve escala 1.03).
3. **`#ring`** (o picadeiro, centro em `x = APPW/2`, `y = 470`, elipse 620×230 com borda dupla vermelha e listras de lona mais fortes por dentro): `#deck` à esquerda do centro (três versos empilhados deslocados 2px de fundo, e o de cima é `CardArt.back(v.top, 92)`; embaixo "monte · 41"), `#open` à direita (`CardArt.front(v.open, 92)`, embaixo "aberta"). No modo clique, a carta escolhida (`picked`) fica levantada (`translateY(-14px)` e sombra maior). Acima do picadeiro, `#banner` (o letreiro): caixa fixa de 720×46 centrada, fundo `var(--navy)`, texto creme 17px; nesta task só mostra a dica da vez ("sua vez: escolha uma carta e depois a mesa de alguém" / "vez de Léo" / "pausado: esperando a galera voltar") — a Task 5 passa a narrar as jogadas nela.
4. **`#mine`** (a sua mesa, embaixo, `bottom: 18`, altura 260, largura `APPW - 120`, centrada): mesmo `.seat[data-pid="p0"]` (pra receber carta), com cartas de `w = 64` e `margin-top:-70px`, personagem 56px, e à direita a **área de pontos**: as cartas guardadas de cada cor pontuada, em leque pequeno (`w = 40`), com a bandeirinha. Quando é a sua vez, `#mine.myturn` ganha brilho dourado na borda.

Assentos e mesas são `data-pid`; quem está em `v.players` e online pode receber.

- [ ] **Step 5: o clique (gesto mínimo)**

```js
function canPlay() { return !animating && state && state.phase === 'playing' && !state.paused && state.turn === ME; }
function canReceive(p) { return state.players.includes(p) && online.has(p); }
/** Clica na aberta ou no monte: levanta a carta (clicar de novo solta). */
function pick(from) {
  if (!canPlay()) { if (state.phase === 'playing') toast(ERR.not_your_turn); return; }
  if (from === 'deck' && !shown.top) return;
  picked = picked === from ? null : from; play('pick'); render(shown);
}
/** Clica numa mesa com a carta levantada: joga. */
function dropOn(p) {
  if (!picked || !canReceive(p)) return;
  const from = picked; picked = null;
  act(ME, { type: 'play', from, to: p });
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && picked) { picked = null; render(shown); } });
```

Ligue os cliques por delegação no `#app` (`#deck` → `pick('deck')`, `#open` → `pick('open')`, `.seat[data-pid]` → `dropOn(pid)`).

- [ ] **Step 6: painel de dev**

`#dev` (abre no botão `ti-adjustments`, canto superior direito, cartão creme): 
- "jogadores": botões 2–6 (troca `N` e chama `newGame()`);
- "bots": rápido / normal / lento (`SPEED` = .4 / 1 / 2);
- "online": um botão por bot (`Bia`, `Léo`…) que liga/desliga `online` daquele bot e chama `presence()` — serve pra ver a vez pular e a pausa;
- "nova partida" (`newGame()`); link "ver as cartas" (`cartas.html`, nova aba).

`fit(); newGame();` no fim do script.

- [ ] **Step 7: Conferir sem navegador o que der**

Run: `node --check prototipo/cama-leao/narrate.js && node --check prototipo/cama-leao/bot.js && node prototipo/cama-leao/sim.cjs`
Expected: sem erro (o `index.html` em si só dá pra ver no navegador; diga isso no relatório).

- [ ] **Step 8: Commit**

```bash
git add prototipo/cama-leao/index.html prototipo/cama-leao/sounds.js
git commit -m "feat(prototipo): mesa do Cama-Leão com bots (clique, sem animação)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

O controlador confere no navegador (1280×800 e 1920×1080): partida de 4 inteira jogando por clique; bots jogando sozinhos; somas "x/5" certas; "4/5" destacado; bandeirinhas aparecendo; desligar o bot da vez pula a vez; deixar só você online pausa; nada cortado nas pontas com 5 adversários; sem erro no console.

---

### Task 4: arrastar a carta

**Files:**
- Modify: `prototipo/cama-leao/index.html`

- [ ] **Step 1: arrasto com Pointer Events**

Na sua vez, `pointerdown` na aberta ou no topo do monte começa o arrasto **depois de 6px** de movimento (antes disso continua valendo o clique da Task 3). Durante o arrasto:
- um clone da carta (`CardArt.front` pra aberta, `CardArt.back` pro monte, `w = 92`) segue o ponteiro com o centro sob o cursor, levemente girado (`rotate(-4deg)`), sombra grande, `pointer-events:none`, dentro do `#app` (converta coordenadas da tela pro palco dividindo pela escala atual);
- a carta original fica com `opacity:.35`;
- os assentos que podem receber ganham `.target`; o que está sob o ponteiro (`document.elementFromPoint` → `.closest('.seat[data-pid]')`) ganha `.hover`.

Ao soltar sobre um assento válido: `act(ME, { type: 'play', from, to })`. Ao soltar fora (ou `Escape`, ou `pointercancel`): o clone volta voando pro lugar em 200ms e some. Use `setPointerCapture` no elemento de origem.

```js
const DRAG_START_PX = 6;
let drag = null; // { from, x0, y0, clone, started }
function stageScale() { return app.getBoundingClientRect().width / APPW; }
function toStage(e) { const r = app.getBoundingClientRect(), s = stageScale(); return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s }; }
function seatUnder(e) { const el = document.elementFromPoint(e.clientX, e.clientY); const seat = el && el.closest('.seat[data-pid]'); return seat && canReceive(seat.dataset.pid) ? seat : null; }
```

- [ ] **Step 2: textos**

A dica da vez no letreiro passa a ser "sua vez: arraste uma carta até a mesa de alguém (ou clique nela e depois na mesa)".

- [ ] **Step 3: Commit**

```bash
git add prototipo/cama-leao/index.html
git commit -m "feat(prototipo): arrastar a carta até a mesa de alguém

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

O controlador confere: arrastar a aberta e a do monte pra si e pros outros; soltar fora devolve; clique continua funcionando; nada arrasta fora da sua vez.

---

### Task 5: a virada (animação e letreiro)

**Files:**
- Create: `prototipo/cama-leao/anim.js`
- Modify: `prototipo/cama-leao/index.html` (carregar `anim.js` antes do script principal, tirar o `Anim` provisório)

- [ ] **Step 1: contrato de `anim.js`**

```js
/**
 * window.Anim.play(prev, next) → Promise que resolve quando a jogada `next.last` terminou de aparecer.
 * `prev` é a view desenhada (antes da jogada), `next` a de depois. Durante a animação o DOM ainda é o de `prev`.
 * Usa: #deck e #open (origem), .seat[data-pid] e .stack[data-color] (destino), #banner (letreiro), window.play (sons).
 * Não muda estado de jogo; só cria elementos temporários dentro do #app e os remove no fim.
 */
```

- [ ] **Step 2: a sequência (spec §5.4)**

Com `last = next.last`, `card = CamaLeao.camelioCard(last.card)`:

1. **Letreiro:** `say(narrate(last, nameOf))` — a caixa do `#banner` não muda de tamanho nem de lugar; o texto antigo some em 120ms e o novo entra em 160ms (`opacity`). (`nameOf` vem do index: passe como terceiro argumento opcional `Anim.play(prev, next, { nameOf })`.)
2. **Voo:** um clone parte da origem (`#open .card` ou o verso de cima do `#deck`) e vai até o destino: a `.stack[data-color="<cor>"]` do assento de `last.to` se existir, senão o fim da `.stacks` dele (ou da sua mesa). 450ms, `cubic-bezier(.2,.8,.2,1)`, encolhendo pro tamanho das cartas daquela mesa (46 nos assentos, 64 na sua). Som `flip` na saída.
3. **Vira:** se veio do monte, o clone é um "flip" (duas faces, verso = `CardArt.back(prev.top)`, frente = `CardArt.front(card)`, `backface-visibility:hidden`) que gira `rotateY(180deg)` nos últimos 200ms do voo. Sem perspectiva exagerada: a mesa é plana, nada pode "afundar".
4. **Resultado** (pausa de 200ms antes):
   - `none`: o clone encaixa (pequeno quique de 6px) e some quando a view nova é desenhada; som `drop`.
   - `scored`: as cartas daquela cor na mesa de `last.to` (as de `prev` + o clone) brilham em dourado 300ms e sobem juntas até o cabeçalho do assento (onde nasce a bandeirinha), encolhendo e sumindo em 450ms; som `scored`.
   - `bust`: a pilha treme (±4px, 3 vezes, 240ms) e cai (`translateY(60px) rotate(12deg)`, `opacity:0`, 450ms); som `bust`.
   - `lost`: como `bust`, e a bandeirinha daquela cor no cabeçalho cai junto; som `lost`.
5. Resolve a Promise; o index redesenha com a view nova (a carta "assenta" no lugar certo).

Duração total entre ~0,9 s (`none`) e ~1,6 s (`scored`/`bust`). Nenhum elemento temporário pode sobrar no DOM depois do `resolve` (confira com `document.querySelectorAll('.fly').length === 0`).

- [ ] **Step 3: o index usa o `anim.js`**

Carregue `<script src="anim.js"></script>` antes do script principal, apague a linha `window.Anim = window.Anim || …` e troque a chamada por `Anim.play(shown, v, { nameOf })`. O letreiro, fora das animações, volta a mostrar a dica da vez **só quando a próxima vez começa** (a frase da jogada fica até lá).

- [ ] **Step 4: Commit**

```bash
git add prototipo/cama-leao/anim.js prototipo/cama-leao/index.html
git commit -m "feat(prototipo): a virada do Cama-Leão (voo, vira, fecha/estoura) e letreiro

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

O controlador confere os quatro resultados (dá pra provocar com o painel: partida de 2 e jogar cartas pra si), que bots esperam a animação, e que o letreiro não pula.

---

### Task 6: sons de picadeiro

**Files:**
- Modify: `prototipo/cama-leao/sounds.js` (troca o provisório), `prototipo/cama-leao/index.html` (botão de som)

- [ ] **Step 1: `sounds.js`**

Copie de `prototipo/retratim/sounds.js` as partes genéricas **sem mudar**: `MASTER_VOL = .35`, `NOTE`, `ac()`, `unlock()` e os listeners de gesto, `tone()` e `noise()`, `window.play` e `window.setSound`. Troque o comentário do topo para "Sons do Cama-Leão: sintetizados (Web Audio), baixinhos e de picadeiro." e troque o `SYNTH` por:

```js
  const SYNTH = {
    /** pegou uma carta */
    pick: (c) => { noise(c, { dur: .05, vol: .07, freq: 2600, freqTo: 1800, q: .8 }); },
    /** a carta voa e vira: rufar curtinho */
    flip: (c) => { for (let i = 0; i < 5; i++) noise(c, { t: i * .045, dur: .035, vol: .05 + i * .01, freq: 900, q: 1.2 }); },
    /** encaixou sem nada acontecer */
    drop: (c) => { noise(c, { dur: .04, vol: .08, freq: 1400, q: 1 }); tone(c, { f: 220, dur: .08, type: 'triangle', vol: .05 }); },
    /** fechou 5: fanfarra curta */
    scored: (c) => [67, 72, 76, 79].forEach((n, i) => tone(c, { f: NOTE(n), t: i * .08, dur: i === 3 ? .5 : .16, type: 'square', vol: .045, partial: 2 })),
    /** estourou: buum de circo (bumbo + prato) */
    bust: (c) => { tone(c, { f: 110, dur: .45, vol: .2, glideTo: 45 }); noise(c, { t: .02, dur: .35, vol: .07, freq: 5000, freqTo: 2500, q: .6 }); },
    /** perdeu o ponto: fiu descendente */
    lost: (c) => { tone(c, { f: NOTE(84), dur: .55, type: 'triangle', vol: .08, glideTo: NOTE(60) }); },
    /** sua vez */
    turn: (c) => { tone(c, { f: NOTE(81), dur: .35, vol: .09, partial: 2 }); tone(c, { f: NOTE(88), t: .09, dur: .45, vol: .07, partial: 2 }); },
    error: (c) => { tone(c, { f: 130, dur: .22, vol: .13, glideTo: 85 }); noise(c, { dur: .06, vol: .04, freq: 400 }); },
    win: (c) => [72, 76, 79, 84].forEach((n, i) => tone(c, { f: NOTE(n), t: i * .1, dur: .55, type: 'triangle', vol: .12, partial: 2 })),
    lose: (c) => [72, 67, 64].forEach((n, i) => tone(c, { f: NOTE(n), t: i * .14, dur: .4, type: 'triangle', vol: .08 })),
  };
```

- [ ] **Step 2: botão de som**

O botão de som do topo liga/desliga (`setSound`) e lembra a escolha no `localStorage` (chave `cama-leao.sound`, com `try/catch`, como no Retratim). Confira que os sons já estão chamados: `pick` (Task 3/4), `flip`/`drop`/`scored`/`bust`/`lost` (Task 5), `turn` e `error` (Task 3).

- [ ] **Step 3: Commit**

```bash
git add prototipo/cama-leao/sounds.js prototipo/cama-leao/index.html
git commit -m "feat(prototipo): sons de picadeiro do Cama-Leão (baixinhos)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: fim de partida e jogar de novo

**Files:**
- Modify: `prototipo/cama-leao/index.html`

- [ ] **Step 1: placar do fim**

Quando `v.phase === 'over'` (depois da animação da última jogada), aparece `#end`: um cartaz de circo centrado (520px, fundo creme, borda dupla vermelha, sem cobrir o topo nem a sua mesa inteira):
- título em `var(--logo)` 34px vermelho: "você ganhou!", "Bia ganhou!" ou, com `winners.length > 1`, "empate: Bia e você";
- motivo em 15px: "chegou a 3 cores" (ou 4) quando `endReason === 'target'`, "o monte acabou" quando `'deck'`;
- uma linha por jogador, do mais pontos pro menos (desempate: mais esferas em jogo, como no spec §2.4): personagem 32px, nome, as bandeirinhas e "N esferas em jogo";
- botões "jogar de novo" (`act(ME, { type: 'again' })`, que começa com quem ficou em último) e "nova mesa" (`newGame()`).

Som `win` se `p0` está em `winners`, senão `lose`.

- [ ] **Step 2: limpeza entre partidas**

`again` e `newGame` não podem deixar nada da partida anterior: some o `#end`, o letreiro volta pra dica da vez, nenhum `.fly` sobra, `picked = null`. A partida nova (`match` diferente) **não** anima (o `fresh` do `changed()` já confere `match`).

- [ ] **Step 3: Commit**

```bash
git add prototipo/cama-leao/index.html
git commit -m "feat(prototipo): fim de partida e jogar de novo no Cama-Leão

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: o Rafa joga (controlador, com o Rafa)

**Files:** nenhum novo (ajustes que surgirem viram commits `fix(prototipo): …`).

- [ ] **Step 1:** subir `prototipo-cama-leao` (`preview_start`) e mandar o link pro Rafa, com as 5 linhas do `sim.cjs` (pra julgar o baralho: partidas longas demais? muito fim por monte?).
- [ ] **Step 2:** pedir pra ele jogar pelo menos uma partida com 2 e uma com 4, e perguntar, uma coisa de cada vez: o arrasto está gostoso? a virada se entende? o letreiro ajuda? os sons? o baralho (cartas demais/de menos, meta de 3 cores)?
- [ ] **Step 3:** aplicar os ajustes pedidos (um commit por ajuste), anotar na memória do projeto o que ele aprovou e o que muda pro C3, e registrar no fim deste plano uma seção "Atualização depois do teste" com as decisões.
- [ ] **Step 4:** quando ele disser que está bom, o protótipo está aprovado: próximo passo é o plano C3 (mesa no site), portando `cards.js`, `bot.js`, `narrate.js`, `anim.js` e `sounds.js`.
