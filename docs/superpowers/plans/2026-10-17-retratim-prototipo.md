# Retratim — protótipo da mesa com bots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um protótipo só de front (`prototipo/retratim/`), descartável, em que o usuário joga uma partida inteira do Retratim contra 2–5 bots: montar com os 6 kits, palpitar na galeria e ver a revelação narrada, pra validar a sensação antes da mesa de verdade (Plano R2).

**Architecture:** Página estática (HTML + scripts soltos, sem framework), servida por `http-server` na raiz do repo, como o protótipo do Diquisti (`prototipo/dixit/`). As **regras são as reais**: `shared/src/games/pictures` empacotado com esbuild em `rules.js` (global `Retratim`), e toda ação passa pelo schema zod das ações antes de `applyPicturesAction`, igual ao servidor. Um `setInterval` faz o papel do alarme (`settlePictures` com `now`). Cada kit é um arquivo com três funções (`build`, `show`, `random`) e a obra trafega no formato `Work` do R1, nas unidades validadas pelo servidor, então o código dos kits vira a referência do R2.

**Tech Stack:** HTML/CSS/JS puro (ES2020, `'use strict'`), esbuild (já no `node_modules`), three.js r128 por CDN (só no kit de blocos), Tabler Icons webfont por CDN, Web Audio sintetizado.

**Spec:** `docs/superpowers/specs/2026-10-17-retratim-design.md` §2 (regras), §3 (kits), §5 (telas, identidade, sons). Notas: `docs/superpowers/plans/notas-para-retratim-r2-r4.md` (seção R2 vale aqui também: unidades da obra, eco do rascunho, quando mandar rascunho).

**Referências de comportamento aprovadas pelo usuário** (abrir no navegador, mesmo servidor): `prototipo/retratim/ref/cubos-e-palitos.html`, `ref/corda.html`, `ref/blocos-3d.html`, `ref/pontos-e-linhas.html`. O texto no topo de cada uma diz o que mudou depois da aprovação.

---

## Contexto para quem vai executar

- Repo `C:\Users\rafam\Desktop\Rpositórios Github - claude\Pessoal\Jogos de tabuleiro`, branch `feat/retratim`. Sem push, sem merge. Use o Bash (no PowerShell `npx.ps1` pode estar bloqueado; use `npx.cmd`).
- **Protótipo é descartável**, mas o formato das obras (`Work`) e as unidades **não**: o R2 vai portar os kits daqui. Siga as unidades da seção "Unidades da obra" à risca.
- Nada aqui entra no site (`web/`) nem no `shared/`. Não mexa em `shared/src` (se achar um bug nas regras, pare e reporte).
- Tudo em português (textos da tela, comentários). Commits `feat(prototipo): …`, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Como ver: `npx http-server . -p 5177 -c-1` na raiz e abrir `http://localhost:5177/prototipo/retratim/` (a Task 1 cria a entrada `prototipo-retratim` no `.claude/launch.json`). O controlador confere cada task no navegador; quem implementa confere pelo menos que a página carrega sem erro no console (ex.: `npx playwright` não é necessário; um `node -e` que só faz `require` não serve pra DOM, então descreva no relatório o que não deu pra ver).
- Palco fixo de **1440×900**, escalado pra caber na janela (`fit()`, como em `prototipo/dixit/index.html`). Só computador.
- O jogador humano é sempre `p0` e é o host. Bots são `p1…p5`.

### Identidade "álbum de fotos" (spec §5.5)

```css
:root{
  --kraft:#eadbc0; --paper:#f6eedd; --edge:#d3bf99; --ink:#3b2f2f; --ink-soft:#7d6a58;
  --blue:#2f5aa8; --tape:rgba(242,165,65,.75); --photo-border:#fbf7ef; --ok:#3b6d11; --no:#a3958a;
  --hand:'Caveat',cursive; --ui:'Nunito',system-ui,sans-serif;
}
```

Fontes: Google Fonts `Caveat:wght@500;700` e `Nunito:wght@300;400;600`. Fundo do palco = página de álbum em kraft; fotos com borda branca de 6 px (`--photo-border`) e sombrinha de papel `0 1px 2px rgba(59,47,47,.25)`; fitinha (`--tape`) levemente girada; títulos em `--hand`; destaques em tinta azul `--blue`. Bichinhos (critters) dos jogadores: reaproveite `prototipo/dixit/critters.js` (`window.CRITTERS`, cor → SVG).

### Unidades da obra (validadas pelo `workSchema`; fora disso a ação é recusada)

| Kit | Obra | Unidades |
|---|---|---|
| `cubes` | `{kit, cells: (0..7 \| null)[16]}` | linha por linha; máx. 3 casas por cor |
| `laces` | `{kit, long: [x,y][], short: [x,y][]}` | 2–60 pontos por corda, x e y em 0–1 (relativos à folha 4:3) |
| `sticks` | `{kit, sticks: {x,y,rot}[4], stones: {x,y,rot}[4]}` | x,y relativos à folha; fora de 0–1 (até −0,5/1,5) = guardada de lado; `rot` em graus |
| `blocks` | `{kit, pieces: {x,y,z,rot,lay}[6], camera: {theta, phi}}` | ordem `BLOCK_SHAPES` = cubo, tijolo, prancha, pilar, telhado, arco; x/z em ±6, y 0–20 (altura calculada), `rot` em graus, `lay` booleano; câmera em radianos, φ 0–1,6 |
| `icons` | `{kit, ids: number[]}` | 0–18, sem repetir, até 5 (pronto pede 2) |
| `dots` | `{kit, points: [x,y][], lines: [i,j][]}` | até 5 pontos em 0–1, até 10 linhas entre pontos existentes, sem repetir |

A folha de montagem é sempre **4:3**. Converter px ↔ unidade relativa dividindo pela largura/altura da folha.

## Mapa de arquivos

Criar em `prototipo/retratim/`:
- `_entry.ts`: o que o protótipo usa das regras reais.
- `rules.js`: gerado pelo esbuild a partir de `_entry.ts` (commitado, como no Diquisti).
- `index.html`: palco, CSS, telas (montagem, galeria, revelação, placar, fim), painel de dev, laço do jogo.
- `photos.js`: fotos provisórias (placeholder) e troca automática pela foto real quando existir.
- `random.js`: obra aleatória válida de cada kit (bots).
- `sounds.js`: sons sintetizados, baixinhos.
- `kits/cubes.js`, `kits/icons.js`, `kits/dots.js`, `kits/sticks.js`, `kits/laces.js`, `kits/blocks.js`: cada um registra `window.Kits[id] = { build, show }`.

Modificar: `.claude/launch.json` (entrada `prototipo-retratim`).

### Contrato dos kits (todas as tasks de kit seguem)

```js
/**
 * window.Kits[kitId] = {
 *   // Monta a bancada dentro de `el` (já com tamanho 4:3). `work` é o rascunho atual ou null (bancada nova).
 *   // Chama onChange(work) a cada mudança (o chamador decide quando mandar o rascunho).
 *   // Devolve { destroy() } — remove listeners, cancela animações, solta o WebGL.
 *   build(el, work, onChange) { ... return { destroy() {} }; },
 *   // Desenha a obra (só leitura) dentro de `el`, em qualquer tamanho 4:3. Sem interação.
 *   show(el, work) { ... },
 * };
 */
```

---

### Task 1: esqueleto, regras reais, laço do jogo e montagem sem kits

**Files:**
- Create: `prototipo/retratim/_entry.ts`, `prototipo/retratim/rules.js` (gerado), `prototipo/retratim/index.html`, `prototipo/retratim/photos.js`, `prototipo/retratim/random.js`, `prototipo/retratim/sounds.js` (provisório)
- Modify: `.claude/launch.json`

- [ ] **Step 1: `_entry.ts`**

```ts
// Só para o protótipo: o que a página usa das regras reais do Retratim.
export { applyPicturesAction, initialPicturesState, settlePictures } from '../../shared/src/games/pictures/rules';
export { picturesViewFor } from '../../shared/src/games/pictures/view';
export { picturesActionSchema } from '../../shared/src/games/pictures/schema';
export { COORDS, PICTURES_COUNTDOWN_MS, PICTURES_ROUNDS } from '../../shared/src/games/pictures/types';
export { PICTURES_DECK } from '../../shared/src/games/pictures/photos';
export { BLOCK_SHAPES, ICON_COUNT, KITS, isBlankWork, readyError } from '../../shared/src/games/pictures/works';
```

E um `prototipo/retratim/sounds.js` provisório (a Task 8 troca pelo de verdade):

```js
'use strict';
/* Provisório: sons chegam na Task 8. */
window.play = () => {};
window.setSound = () => {};
```

- [ ] **Step 2: gerar `rules.js`**

Run:
```bash
node_modules/.bin/esbuild prototipo/retratim/_entry.ts --bundle --format=iife --global-name=Retratim --target=es2020 --outfile=prototipo/retratim/rules.js --banner:js="// Gerado com esbuild a partir de shared/src/games/pictures (regras reais, só para o protótipo). Não editar à mão."
```
Expected: `prototipo/retratim/rules.js` criado, sem erro. `node -e "global.window=global; require('./prototipo/retratim/rules.js'); console.log(Object.keys(Retratim))"` lista as exportações (o IIFE define `var Retratim`; se o `require` não expuser, confira abrindo a página).

- [ ] **Step 3: `random.js` (obras aleatórias válidas, pros bots)**

```js
'use strict';
/* Obra aleatória e válida de cada kit (bots do protótipo). Unidades = workSchema do R1. */
(function () {
  const r = (a, b) => a + Math.random() * (b - a);
  const ri = (n) => Math.floor(Math.random() * n);
  const shuffle = (xs) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = ri(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  /** Caminho ondulado dentro da folha (0–1), com n pontos. */
  function wavy(n, cx, cy, span) {
    const pts = []; let a = r(0, Math.PI * 2), x = cx, y = cy;
    for (let i = 0; i < n; i++) {
      pts.push([Math.min(.98, Math.max(.02, x)), Math.min(.98, Math.max(.02, y))]);
      a += r(-.6, .6); x += Math.cos(a) * span / n; y += Math.sin(a) * span / n * 1.33;
    }
    return pts.map(([px, py]) => [Math.round(px * 1000) / 1000, Math.round(py * 1000) / 1000]);
  }
  window.RandomWork = {
    cubes() {
      const bag = shuffle([0, 1, 2, 3, 4, 5, 6, 7].flatMap((c) => [c, c, c]));
      return { kit: 'cubes', cells: bag.slice(0, 16) };
    },
    laces() {
      return { kit: 'laces', long: wavy(60, r(.2, .8), r(.2, .8), 1.4), short: wavy(30, r(.2, .8), r(.2, .8), .6) };
    },
    sticks() {
      const p = () => ({ x: Math.round(r(.15, .85) * 1000) / 1000, y: Math.round(r(.15, .85) * 1000) / 1000, rot: ri(12) * 15 });
      return { kit: 'sticks', sticks: [p(), p(), p(), p()], stones: [p(), p(), p(), p()] };
    },
    blocks() {
      return {
        kit: 'blocks',
        pieces: Array.from({ length: 6 }, () => ({ x: Math.round(r(-3, 3) * 100) / 100, y: 0, z: Math.round(r(-3, 3) * 100) / 100, rot: ri(24) * 15, lay: Math.random() < .3 })),
        camera: { theta: Math.round(r(-1, 1) * 100) / 100, phi: Math.round(r(.3, 1.2) * 100) / 100 },
      };
    },
    icons() {
      return { kit: 'icons', ids: shuffle(Array.from({ length: 19 }, (_, i) => i)).slice(0, 2 + ri(4)) };
    },
    dots() {
      const n = 3 + ri(3);
      const points = Array.from({ length: n }, () => [Math.round(r(.1, .9) * 1000) / 1000, Math.round(r(.1, .9) * 1000) / 1000]);
      const lines = []; for (let i = 0; i < n - 1; i++) lines.push([i, i + 1]);
      if (n > 3 && Math.random() < .5) lines.push([0, n - 1]);
      return { kit: 'dots', points, lines };
    },
  };
})();
```

Nota: o `y` dos blocos aleatórios é 0 e o `show` usa o `y` como veio (não reempilha), então peças de bot podem se atravessar. Aceitável no protótipo.

- [ ] **Step 4: `photos.js` (fotos provisórias)**

Cada foto do baralho (`Retratim.PICTURES_DECK`, ids `p001…p100` com tema) vira um placeholder: fundo na cor do tema (com variação de tom por foto), um ícone Tabler grande do tema (posição/tamanho/rotação variando por foto, pra fotos do mesmo tema ficarem **parecidas mas distinguíveis**) e uma legenda pequena (ex.: "bichos · 07"). Se existir a foto real em `../../web/public/pictures/fotos/<id>.webp`, ela substitui o placeholder (`<img onerror>` volta pro placeholder).

```js
'use strict';
/* Fotos provisórias do protótipo: ícone do tema sobre cor, variando por foto. A foto real, quando existir, ganha. */
(function () {
  const THEME = {
    bichos: { hue: 28, icons: ['ti-dog', 'ti-cat', 'ti-fish', 'ti-butterfly', 'ti-feather', 'ti-paw'] },
    casa: { hue: 200, icons: ['ti-armchair', 'ti-lamp', 'ti-cup', 'ti-bed', 'ti-key', 'ti-clock'] },
    comida: { hue: 8, icons: ['ti-pizza', 'ti-apple', 'ti-bread', 'ti-ice-cream', 'ti-coffee', 'ti-cheese'] },
    lugares: { hue: 260, icons: ['ti-building-lighthouse', 'ti-building-church', 'ti-building-bridge', 'ti-tent', 'ti-building-castle', 'ti-home'] },
    transporte: { hue: 220, icons: ['ti-car', 'ti-bike', 'ti-plane', 'ti-bus', 'ti-sailboat', 'ti-train'] },
    natureza: { hue: 110, icons: ['ti-tree', 'ti-mountain', 'ti-flower', 'ti-leaf', 'ti-sun', 'ti-cloud-rain'] },
    gente: { hue: 330, icons: ['ti-hand-stop', 'ti-walk', 'ti-run', 'ti-swimming', 'ti-yoga', 'ti-hand-finger'] },
  };
  const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
  const byId = new Map(Retratim.PICTURES_DECK.map((p) => [p.id, p]));
  /** HTML de uma foto (placeholder + tentativa da real). */
  window.photoHTML = function (id) {
    const p = byId.get(id); const t = THEME[p.theme]; const h = hash(id);
    const icon = t.icons[h % t.icons.length];
    const light = 62 + (h >> 4) % 18, sat = 30 + (h >> 9) % 25;
    const size = 46 + (h >> 13) % 26, rot = ((h >> 17) % 31) - 15, dx = ((h >> 21) % 30) - 15, dy = ((h >> 25) % 20) - 10;
    const n = id.slice(1);
    return `<div class="ph" style="background:hsl(${t.hue} ${sat}% ${light}%)">`
      + `<i class="ti ${icon}" style="font-size:${size}%;transform:translate(${dx}%,${dy}%) rotate(${rot}deg)"></i>`
      + `<span class="ph-cap">${p.theme} · ${n}</span>`
      + `<img src="../../web/public/pictures/fotos/${id}.webp" alt="" onerror="this.remove()">`
      + `</div>`;
  };
})();
```

CSS correspondente (no `index.html`): `.ph{position:relative;width:100%;height:100%;overflow:hidden;display:grid;place-items:center;color:rgba(59,47,47,.55)}` · `.ph i{font-size:…}` usa `font-size` relativo ao contêiner (defina `container-type:size` no `.ph` e use `font-size:calc(var(--s)*1cqh)`; ou simplesmente `font-size:56px` fixo nas miniaturas e escale com `transform` — escolha o que ficar mais simples e consistente) · `.ph img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}` · `.ph-cap{position:absolute;left:6px;bottom:4px;font:600 10px var(--ui);color:rgba(59,47,47,.6)}`.

- [ ] **Step 5: `index.html`: palco, laço e montagem (sem kits ainda)**

Requisitos (a referência de estrutura é `prototipo/dixit/index.html`: `fit()`, `act()`, `changed()`, `scheduleBots()`, `later()`, `toast()`, painel `#dev`):

1. `<head>`: fontes (Caveat, Nunito), Tabler Icons webfont `https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.19.0/dist/tabler-icons.min.css`, CSS com as variáveis da identidade.
2. Scripts, nesta ordem: `../dixit/critters.js`, `rules.js`, `photos.js`, `random.js`, `sounds.js` (pode ser um stub vazio `window.play=()=>{}` até a Task 8), `kits/*.js` (os que existirem; a página não pode quebrar se um kit faltar: mostre "kit ainda não feito no protótipo" e um botão "usar obra aleatória" que manda `RandomWork[kit]()` como rascunho), e o script principal inline.
3. Estado e laço:

```js
const ME = 'p0';
let N = 4, SPEED = 1, BOT_HIT = .5, ids = [], state = null, prevPhase = null;
const NAMES = ['você', 'Bia', 'Léo', 'Nina', 'Caio', 'Duda'];
const COLORS = Object.keys(window.CRITTERS);
const ctx = () => ({ hostId: ME, active: ids, rng: Math.random, now: Date.now() });
const view = () => Retratim.picturesViewFor(state, ME);

/** Igual ao servidor: o schema das ações valida antes das regras. */
function act(pid, action, quiet) {
  const parsed = Retratim.picturesActionSchema.safeParse(action);
  if (!parsed.success) { console.error('ação inválida (bug do protótipo)', action, parsed.error); toast('Ação inválida (bug do protótipo — veja o console)'); return false; }
  const res = Retratim.applyPicturesAction(state, pid, parsed.data, ctx());
  if (!res.ok) { if (!quiet) { toast(ERR[res.error] || res.error); play('error'); } return false; }
  state = res.state; changed(); return true;
}
/** O "alarme" do servidor: reavalia contagem/fechamento/pausa. */
setInterval(() => { if (!state) return; const next = Retratim.settlePictures(state, ctx()); if (next !== state) { state = next; changed(); } else renderClock(); }, 200);
```

`ERR` com as mensagens PT-BR de `shared/src/protocol.ts` pros códigos do Retratim (`wrong_kit`, `bad_work`, `empty_work`, `cubes_incomplete`, `icons_too_few`, `already_ready`, `own_work`, `no_work`, `already_confirmed`, `not_player`, `bad_phase`, `paused`, `need_3_players`).

`newGame()`: limpa timers, `ids = p0…p(N-1)`, `state = initialPicturesState()`, `act(ME, {type:'start'})`.

4. **Topo** (sempre): à esquerda "Retratim" em `--hand` 44 px; no meio "rodada X de 6 · kit: <nome do kit>" (nomes: cubos coloridos, cadarços, palitos e pedras, blocos, símbolos, pontos e linhas); à direita os **selinhos** de cada jogador (bichinho 28 px + nome + estado: "mexendo…", "pronto ✓", "palpitando…", "confirmou ✓"), o **relógio** (pílula "faltam 0:24" em tinta azul quando `countdownEndsAt` existe; some quando não), o botão de som e o ⚙ do painel de dev.
5. **Montagem** (`phase === 'building'`):
   - Esquerda: a **grade 4×4** de fotos (cada foto 4:3 com borda branca), coordenadas A–D em cima e 1–4 do lado em `--hand`. Sua foto secreta com contorno tracejado azul de 3 px, só pra você.
   - Direita: cartão "sua foto secreta **B3**" com fitinha (`--tape`), a **bancada** (folha 4:3, ~600×450, fundo `--paper`, borda `--edge`) com `Kits[meuKit].build(...)`, e o botão **"estou pronto"** (vira "desmarcar pronto" quando pronto; a bancada fica com 60% de opacidade e sem interação enquanto pronto).
   - Rascunho: `onChange(work)` guarda a obra local e manda `draft` no máximo a cada 2 s (último sempre enviado; nunca antes da primeira mexida). "estou pronto" manda o `draft` pendente na hora e depois `ready {on:true}`; erro de `readyError` vira toast (`cubes_incomplete` → "Faltam N casas" contando as vazias).
   - **Eco:** ao re-renderizar, NUNCA recriar a bancada por causa do eco do próprio rascunho. Recriar só quando a rodada ou o kit muda.
6. **Bots** (`scheduleBots()` como no Diquisti, chave por rodada+fase+bot): na montagem, depois de `between(3000, 9000) * SPEED` mandam `draft` com `RandomWork[kit]()` e logo `ready {on:true}`; um bot a cada partida (sorteado) "demora": só fica pronto depois de 40 s, pra a contagem dos 30 s aparecer. Nas outras fases, nada ainda (Tasks 6–7).
7. **Painel de dev** (⚙): jogadores 3–6 (reinicia), velocidade dos bots (rápido 0,4 / normal 1 / lento 2), bots acertam (20% / 50% / 80%, usado na Task 6), **"trocar meu kit"** (6 botões; troca o `kits` do `state` entre você e quem tem o kit escolhido — mexida direta no estado, só no protótipo; recria a bancada), "apressar" (`hurry`), "nova partida". Texto curto explicando que é um protótipo.
8. Fases ainda sem tela (`guessing`, `reveal`, `gameover`): mostrar uma faixa "fase X — tela vem na Task N" e, se `p0` for o host e a fase for `reveal`, um botão "próxima rodada" que manda `next`. Assim a partida já anda do começo ao fim.

- [ ] **Step 6: launch.json**

Acrescente em `.claude/launch.json` (dentro de `configurations`):

```json
    {
      "name": "prototipo-retratim",
      "runtimeExecutable": "npx",
      "runtimeArgs": ["--yes", "http-server", ".", "-p", "5177", "-c-1", "--silent"],
      "port": 5177
    }
```

- [ ] **Step 7: Conferir e commitar**

Confira que a página abre em `http://localhost:5177/prototipo/retratim/` sem erro no console, que a grade mostra 16 fotos provisórias, que o relógio aparece quando 2 bots ficam prontos e que, usando "usar obra aleatória" + "estou pronto", a fase passa pro palpite.

```bash
git add prototipo/retratim/_entry.ts prototipo/retratim/sounds.js prototipo/retratim/rules.js prototipo/retratim/index.html prototipo/retratim/photos.js prototipo/retratim/random.js .claude/launch.json
git commit -m "feat(prototipo): Retratim — esqueleto com regras reais, bots e montagem

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`.claude/launch.json` já é versionado.)

---

### Task 2: kits de cubos, símbolos e pontos e linhas

**Files:** Create `prototipo/retratim/kits/cubes.js`, `kits/icons.js`, `kits/dots.js`; Modify `index.html` (incluir os scripts).

Cada arquivo segue o **contrato dos kits**. Visual na identidade álbum (papel, tinta), não no cinza do widget de referência.

- [ ] **Step 1: `kits/cubes.js`.** Referência: `ref/cubos-e-palitos.html` (parte dos cubos). Mudanças obrigatórias:
  - Só **4×4**. Paleta de **8 cores** (`#E24B4A`, `#EF9F27`, `#F2D14B`, `#639922`, `#378ADD`, `#7F77DD`, `#F6EEDD`, `#2C2C2A`) com **contador** de cubos restantes (3 por cor) em cada botão; cor esgotada fica apagada e não pinta.
  - Clicar numa casa com a cor ativa pinta; clicar de novo com a mesma cor esvazia (devolve o cubo). Pintar por cima com outra cor devolve o cubo antigo.
  - Arrastar com o botão apertado pinta várias casas (se houver cubo).
  - Texto pequeno embaixo: "faltam N casas" (ou "pronto pra ficar pronto!" quando cheia).
  - `onChange({kit:'cubes', cells})` a cada mudança.
  - `show`: grade 4×4 de quadradinhos com cantos levemente arredondados e um brilho sutil de cubo (gradiente simples), centralizada na folha 4:3.
- [ ] **Step 2: `kits/icons.js`.** Lista fixa dos 19 ícones (índice = id): `ti-circle, ti-square, ti-triangle, ti-arrow-up, ti-arrow-right, ti-wave-sine, ti-sun, ti-moon, ti-cloud, ti-flame, ti-droplet, ti-leaf, ti-home, ti-eye, ti-heart, ti-star, ti-bolt, ti-user, ti-paw` (exporte como `window.ICON_NAMES` pro R2 copiar pro `shared`).
  - Em cima, a "mão" com as 19 cartas pequenas (cartinhas de papel com o ícone); clicar põe a carta na fila (até 5) e clicar de novo tira.
  - A fila fica no meio da folha, cartas grandes lado a lado; arrastar na fila reordena (pode ser com setinhas ◀ ▶ em cada carta, se o arraste ficar complicado).
  - Texto: "escolha de 2 a 5 cartas".
  - `show`: as cartas da fila lado a lado, centralizadas.
- [ ] **Step 3: `kits/dots.js`.** Referência: `ref/pontos-e-linhas.html`, igual, com pontos em tinta azul e linhas em tinta. Coordenadas convertidas pra 0–1 e **presas dentro da folha** durante o arraste. `show`: pontos e linhas.
- [ ] **Step 4:** incluir os 3 scripts no `index.html`. Conferir à mão com "trocar meu kit" (painel de dev): cada kit monta, manda rascunho válido (sem toast de "ação inválida"), fica pronto, e a obra do bot no mesmo kit aparece certa quando a galeria existir (por ora, confira o `show` chamando `Kits.cubes.show(el, RandomWork.cubes())` no console).
- [ ] **Step 5: Commit** `feat(prototipo): Retratim — kits de cubos, símbolos e pontos`.

---

### Task 3: kit de palitos e pedras

**Files:** Create `prototipo/retratim/kits/sticks.js`; Modify `index.html`.

- [ ] **Step 1:** Referência `ref/cubos-e-palitos.html` (parte dos palitos), com **4 palitos + 4 pedras**:
  - Palito: comprimento 0,30 da largura da folha, espessura 0,018; madeira (`#BA7517`/`#633806`).
  - Pedras: 4 tamanhos fixos (raios em fração da largura: [0,045×0,035], [0,035×0,03], [0,05×0,038], [0,03×0,026]), cinza (`#888780`/`#444441`).
  - Começam **guardadas** numa faixa à direita, fora da folha (x entre 1,05 e 1,4): o elemento de montagem é mais largo que a folha e a parte de fora é a "gaveta". A folha 4:3 fica bem marcada; o que está fora dela não conta (é o que o `isBlankWork` e o `show` consideram).
  - Clique seleciona e mostra a alça azul; arrastar a alça gira; rodinha gira 15°; clicar no vazio tira a seleção.
  - `onChange` com x/y relativos à **folha** (gaveta = valores > 1).
  - `show`: só as peças dentro de 0–1, na folha.
- [ ] **Step 2:** Conferir (trocar meu kit → palitos e pedras): girar pela alça e pela rodinha, devolver peça pra gaveta, pronto sem nenhuma peça na folha dá o toast de "Monte alguma coisa antes de ficar pronto".
- [ ] **Step 3: Commit** `feat(prototipo): Retratim — kit de palitos e pedras`.

---

### Task 4: kit de cadarços (duas cordas)

**Files:** Create `prototipo/retratim/kits/laces.js`; Modify `index.html`.

- [ ] **Step 1:** Física **exatamente** a de `ref/corda.html` (janela com queda suave, `pull` só quando estica, `relax` com mínimo 0,85·L, `clamp` na folha), com:
  - **Duas cordas**: longa (comprimento total 1,6 × largura da folha, 160 pontos internos) e curta (0,7 × largura, 70 pontos), cores diferentes (longa coral `#D85A30`/`#712B13`; curta azul-petróleo `#1D9E75`/`#085041`), as duas com as pontas metálicas.
  - K fixo = 9 (sem o controle deslizante). Pegar o ponto mais perto entre as duas cordas (raio 26 px).
  - Estado inicial: as duas emboladas (como o `init` da referência), lado a lado.
  - Ao mudar (fim de cada arraste, e durante o arraste no máximo a cada 300 ms), reamostrar cada corda pra no máximo 60 pontos e mandar em 0–1:

```js
/** Reamostra uma corda (pontos em px) pra `n` pontos igualmente espaçados ao longo dela, em 0–1 da folha. */
function resample(P, n, W, H) {
  const acc = [0];
  for (let i = 1; i < P.length; i++) acc.push(acc[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y));
  const total = acc[acc.length - 1], out = [];
  for (let k = 0; k < n; k++) {
    const d = total * k / (n - 1);
    let i = 1; while (i < acc.length - 1 && acc[i] < d) i++;
    const t = (d - acc[i - 1]) / ((acc[i] - acc[i - 1]) || 1);
    const x = P[i - 1].x + (P[i].x - P[i - 1].x) * t, y = P[i - 1].y + (P[i].y - P[i - 1].y) * t;
    out.push([Math.round(Math.min(1, Math.max(0, x / W)) * 1000) / 1000, Math.round(Math.min(1, Math.max(0, y / H)) * 1000) / 1000]);
  }
  return out;
}
```

  (60 pontos pra longa, 30 pra curta.) Se `build` receber uma obra (`work` não nulo), reconstrua cada corda reamostrando a polilinha recebida pro número de pontos internos (mesma função ao contrário, em px).
  - `show`: desenha as duas polilinhas com a mesma aparência da montagem (traço grosso, borda escura, tracejado claro, pontas metálicas), suavizadas com curvas quadráticas.
- [ ] **Step 2:** Conferir: as duas cordas mexem independentes, o comprimento não muda, o rascunho mandado tem ≤ 60 pontos (sem toast de ação inválida), o `show` do bot de cadarços fica parecido com a montagem.
- [ ] **Step 3: Commit** `feat(prototipo): Retratim — kit de cadarços com duas cordas`.

---

### Task 5: kit de blocos 3D

**Files:** Create `prototipo/retratim/kits/blocks.js`; Modify `index.html`.

- [ ] **Step 1:** three.js r128 carregado **só quando preciso** (injetar `<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js">` na primeira chamada de `build`/`show`; enquanto carrega, mostrar "carregando os blocos…"; se falhar, "não deu pra carregar os blocos" + botão "tentar de novo").
- [ ] **Step 2: `build`**: a cena de `ref/blocos-3d.html` (mesa, papel 8×8, luz, sombras, `settle`, menu flutuante ao soltar, legendas, rodinha gira a mesa, arrastar o fundo inclina, botão de espalhar), com **6 formas na ordem `BLOCK_SHAPES`**: cubo `Box(1,1,1)`, tijolo `Box(2,.6,1)`, prancha `Box(3.2,.25,.8)`, pilar `Cylinder(.35,.35,2.2)`, telhado `ext(tri,1)`, arco `ext(arc,.8)`. Posição inicial espalhada na borda do papel. Ao mudar (fim do arraste, girar, deitar, mexer na câmera), `onChange` com:

```js
{ kit: 'blocks',
  pieces: B.map((b) => ({ x: round2(clamp(b.position.x, -6, 6)), y: round2(clamp(b.position.y, 0, 20)), z: round2(clamp(b.position.z, -6, 6)),
                          rot: Math.round(b.userData.ry * 180 / Math.PI) % 3600, lay: !!b.userData.lay })),
  camera: { theta: round2(((th % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI), phi: round2(clamp(ph, 0, 1.6)) } }
```

  (`round2 = (v) => Math.round(v * 100) / 100`). Se `build` receber obra, posicione as peças e a câmera a partir dela.
- [ ] **Step 3: `show`**: um **renderizador compartilhado** (um só `WebGLRenderer` fora da tela) desenha a obra com a câmera salva e devolve uma imagem (`toDataURL`) colocada num `<img>` dentro de `el`; cache por `JSON.stringify(work)`. Assim a galeria com várias obras 3D não abre vários contextos WebGL.
- [ ] **Step 4: `destroy`** solta o renderer da montagem (`renderer.dispose()`, remove listeners).
- [ ] **Step 5:** Conferir: montar, empilhar, girar pelo menu, inclinar e girar a câmera, ficar pronto; a miniatura da obra (console: `Kits.blocks.show(el, work)`) sai no mesmo ângulo.
- [ ] **Step 6: Commit** `feat(prototipo): Retratim — kit de blocos 3D`.

---

### Task 6: galeria de palpites

**Files:** Modify `prototipo/retratim/index.html`.

- [ ] **Step 1: tela `guessing`** (spec §5.2):
  - Esquerda: a mesma grade 4×4, agora **clicável** (cursor de mão, foto realça ao passar o mouse).
  - Direita: as obras dos outros (`view.works`, menos a sua) em **molduras de álbum** (folha 4:3 com `Kits[kit].show`, cantoneiras ou borda branca), com bichinho + nome do artista e o nome do kit embaixo. 2 colunas; se não couber, rolagem só nessa área.
  - Clicar numa obra seleciona (moldura com contorno azul); clicar numa foto **cola uma fitinha "B3"** (tinta azul, `--tape`, girada uns graus) no canto da obra. Clicar em outra foto troca; clicar na fitinha tira (`coord: null`). Teclado opcional: com obra selecionada, digitar "b3" também cola.
  - Uma **lupa** em cada obra abre a obra grande (sobreposição; Esc ou clique fora fecha).
  - Botão **"confirmar palpites"** (mostra "faltam N obras sem palpite" antes; confirma assim mesmo). Depois de confirmar, tudo fica travado e aparece "esperando a galera…".
  - Selinhos do topo: "palpitando…" / "confirmou ✓"; relógio igual à montagem.
- [ ] **Step 2: bots palpitam**: depois de `between(4000, 12000) * SPEED`, cada bot palpita em todas as obras alheias: com chance `BOT_HIT` acerta (`state.secrets[artista]`, o protótipo pode ler o estado inteiro), senão uma coordenada aleatória; depois confirma. Um bot sorteado por rodada só confirma depois de 40 s (contagem aparece).
- [ ] **Step 3:** Conferir: colar/trocar/tirar fitinha, lupa, confirmar, contagem, passagem automática pra revelação.
- [ ] **Step 4: Commit** `feat(prototipo): Retratim — galeria de palpites`.

---

### Task 7: revelação narrada, placar da rodada e fim de jogo

**Files:** Modify `prototipo/retratim/index.html`.

- [ ] **Step 1: revelação** (spec §5.3), dirigida por `view.result` (ordem `result.order`), uma obra por vez, avançando sozinha (tempos × `SPEED`):
  1. (0,9 s) A obra **cresce** pro centro da página, numa moldura grande, com o artista e o kit.
  2. (1,2 s) As **fitinhas** de quem palpitou aparecem uma a uma ao redor da obra, cada uma com o bichinho de quem palpitou e a coordenada.
  3. (1,2 s) A **foto verdadeira descola da grade** (a miniatura voa e cresce até o lado da obra, com uma leve rotação de papel) e toca o clique de câmera.
  4. (0,8 s) Fitinhas certas ganham **✓ verde**; erradas ficam acinzentadas.
  5. (1 s) Os **pontos sobem** ("+1", "+2"…) por cima dos selinhos do topo, e o placar dos selinhos atualiza.
  Botão discreto "pular" que vai direto pro fim da revelação. Obras em branco não aparecem; se `result.order` estiver vazio, mostre "ninguém montou nada nesta rodada" e siga.
- [ ] **Step 2: placar da rodada**: cartão de álbum com cada jogador (bichinho, nome, ganho da rodada `result.gained`, total), ordenado pelo total; botão **"próxima rodada"** (só você, que é o host; os bots não clicam).
- [ ] **Step 3: fim de jogo** (`gameover`): página final do álbum com o ranking (vencedores com uma estrelinha; empate mostra todos), confete de papel picado leve (pode portar o de `prototipo/dixit/index.html`), botões "jogar de novo" (`again`) e "voltar pro lobby" (`lobby` → recomeça direto com `start` no protótipo).
- [ ] **Step 4:** Conferir uma partida inteira de 6 rodadas com 3 e com 6 jogadores (velocidade rápida).
- [ ] **Step 5: Commit** `feat(prototipo): Retratim — revelação narrada, placar e fim`.

---

### Task 8: sons e acabamento

**Files:** Create `prototipo/retratim/sounds.js`; Modify `index.html`.

- [ ] **Step 1: `sounds.js`**, sintetizado (Web Audio, como `prototipo/dixit/index.html`), **volume geral 0,35** (o usuário acha os sons do ITO altos): `tape` (fitinha colando: ruído curto filtrado + estalinho), `peel` (fitinha saindo), `shutter` (clique de câmera: dois estalos de ruído bem curtos), `plim` (pontos: nota suave), `ready` (alguém ficou pronto: toque de papel), `tick` (últimos 5 s da contagem, bem baixinho), `error`, `win`. Exporte `window.play(name)` e um liga/desliga (`window.setSound(on)`), ligado ao botão de som do topo.
- [ ] **Step 2:** Tocar: `tape`/`peel` nos palpites, `shutter` no passo 3 da revelação, `plim` nos pontos, `ready` quando você ou um bot fica pronto/confirma, `tick` nos 5 s finais, `win` no fim se você venceu.
- [ ] **Step 3: acabamento**: conferir textos em português, nenhum erro no console numa partida inteira, sem `debugger`/`console.log` sobrando (os `console.error` de "ação inválida" ficam).
- [ ] **Step 4: Commit** `feat(prototipo): Retratim — sons baixinhos e acabamento`.

---

### Task 9: teste com o usuário

- [ ] Abrir o protótipo pro usuário (`prototipo-retratim`, `/prototipo/retratim/`) e pedir pra jogar pelo menos uma partida, passando por todos os kits com "trocar meu kit".
- [ ] Anotar o que ele pedir de mudança. O que for decisão de jogo vai pra spec (§2/§3/§5); o que for de tela vira ajuste aqui no protótipo até ele aprovar. Só depois disso escrever o Plano R2 (portar pro `web/`).
