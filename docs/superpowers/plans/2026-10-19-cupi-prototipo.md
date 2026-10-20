# Cúpi — protótipo da mesa com bots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um protótipo só de front (`prototipo/coup/`), descartável, em que o usuário joga partidas inteiras de Cúpi contra 1–5 bots, no computador e no celular em pé, pra sentir o ritmo da janela de 10 s, dos blefes e das dúvidas antes da mesa de verdade (Plano C2).

**Architecture:** Página estática (HTML + scripts soltos, sem framework), servida por `http-server` na raiz do repo, como os protótipos do Diquisti e do Retratim. As **regras são as reais**: `shared/src/games/coup` empacotado com esbuild em `rules.js` (global `Cupi`); toda ação passa pelo `coupActionSchema` antes de `applyCoupAction`, igual ao servidor; um `setInterval` de 200 ms faz o papel do alarme (`settleCoup` com `now`). A tela lê só `coupViewFor(state, 'p0')` (o que o jogador veria), e os bots decidem só pela própria visão. Assim o protótipo testa também a interface `CoupView`/`CoupCan` que a mesa do C2 vai usar.

**Tech Stack:** HTML/CSS/JS puro (ES2020, `'use strict'`), esbuild (já no `node_modules`), Tabler Icons webfont por CDN, Google Fonts (Bebas Neue, Oswald), Web Audio sintetizado (sons copiados do protótipo do Retratim).

**Spec:** `docs/superpowers/specs/2026-10-19-cupi-design.md` §2 (regras), §5 (telas e identidade), §4.3 (sons). Mockups aprovados no brainstorming: identidade **B "cartaz de propaganda"**; PC com oponentes em cima, palco no meio, mão e ações embaixo, diário na coluna da direita; celular em pé na mesma ordem.

---

## Contexto para quem vai executar

- Worktree `C:\Users\rafam\Desktop\Rpositórios Github - claude\Pessoal\Jogos de tabuleiro\.claude\worktrees\cupi`, branch `feat/cupi`. Sem push, sem merge, nunca `git stash`. Use o Bash (no Git Bash o `rtk` não existe).
- **Protótipo é descartável.** Nada aqui entra no site (`web/`) nem no `shared/`. Não mexa em `shared/src`: se achar um bug nas regras, pare e reporte.
- Tudo em português (textos da tela, comentários). Commits `feat(prototipo): …`, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Como ver: `npx http-server . -p 5178 -c-1` na raiz da worktree e abrir `http://localhost:5178/prototipo/coup/`. O controlador confere cada task no navegador; quem implementa confere ao menos que a página carrega e que o JS não tem erro de sintaxe (`node --check` em cada `.js` solto; o script inline pode ser extraído pra conferir).
- O jogador humano é sempre `p0` e é o anfitrião. Bots são `p1…p5`.
- **Computador:** palco fixo de **1440×900**, escalado pra caber na janela (`fit()`, como em `prototipo/retratim/index.html`). **Celular** (`matchMedia('(max-width: 640px)')`): sem palco fixo, layout fluido em pé (Task 4).

### Identidade "cartaz de propaganda" (spec §5.4)

```css
:root{
  --cream:#efe6d2; --felt:#e4d7bb; --paper:#f7f0e0; --ink:#1d1a17; --ink-soft:#6b6152; --red:#c8312b;
  --disp:'Bebas Neue',Impact,sans-serif; --ui:'Oswald',system-ui,sans-serif;
}
```

Fontes: `https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Oswald:wght@400;500&display=swap`. Contornos pretos de 2 px, cantos quase retos (3–6 px), botões de reação grandes (vermelho cheio pra duvidar/bloquear, contorno preto pra deixa). Mesa **plana**.

### Personagens e ações (textos da tela)

```js
const CHAR = {
  duke:       { nome: 'Duque',      icon: 'ti-crown' },
  assassin:   { nome: 'Assassino',  icon: 'ti-sword' },
  captain:    { nome: 'Capitão',    icon: 'ti-anchor' },
  ambassador: { nome: 'Embaixador', icon: 'ti-world' },
  contessa:   { nome: 'Condessa',   icon: 'ti-diamond' },
};
const ACTION = {
  income:      { nome: 'renda',         dica: '+1' },
  foreignAid:  { nome: 'ajuda externa', dica: '+2 · o Duque bloqueia' },
  coup:        { nome: 'golpe',         dica: '−7 · alvo perde carta' },
  tax:         { nome: 'taxar',         dica: 'Duque · +3' },
  assassinate: { nome: 'assassinar',    dica: 'Assassino · −3 · alvo perde carta' },
  steal:       { nome: 'extorquir',     dica: 'Capitão · tira 2' },
  exchange:    { nome: 'trocar',        dica: 'Embaixador · troca cartas' },
};
```

Os ganhos vêm de `Cupi.COUP_GAIN` e os custos de `Cupi.COUP_COST` (não escreva os números à mão no código; os textos acima são só rótulos).

## Mapa de arquivos

Criar em `prototipo/coup/`:
- `_entry.ts`: o que o protótipo usa das regras reais.
- `rules.js`: gerado pelo esbuild a partir de `_entry.ts` (commitado, como nos outros protótipos).
- `texts.js`: `CHAR`, `ACTION`, frases do diário e da declaração (`window.Txt`).
- `bots.js`: decisão dos bots a partir da visão (`window.Bot`).
- `sounds.js`: sons sintetizados (cópia adaptada de `prototipo/retratim/sounds.js`).
- `index.html`: palco, CSS, telas, painel de dev, laço do jogo.

Modificar: `.claude/launch.json` (versionado; acrescente a entrada `prototipo-cupi`).

---

### Task 1: esqueleto, regras reais, laço, bots e uma tela simples que já joga

**Files:**
- Create: `prototipo/coup/_entry.ts`, `prototipo/coup/rules.js` (gerado), `prototipo/coup/texts.js`, `prototipo/coup/bots.js`, `prototipo/coup/sounds.js` (provisório), `prototipo/coup/index.html`
- Modify: `.claude/launch.json`

- [ ] **Step 1: `_entry.ts`**

```ts
// Só para o protótipo: o que a página usa das regras reais do Cúpi.
export { applyCoupAction, initialCoupState, settleCoup } from '../../shared/src/games/coup/rules';
export { coupViewFor } from '../../shared/src/games/coup/view';
export { coupActionSchema } from '../../shared/src/games/coup/schema';
export {
  COUP_ACTION_KINDS,
  COUP_BLOCKERS,
  COUP_CHARACTERS,
  COUP_CLAIM,
  COUP_COST,
  COUP_GAIN,
  COUP_TARGETED,
  COUP_WINDOW_MS,
} from '../../shared/src/games/coup/types';
```

- [ ] **Step 2: gerar `rules.js`**

Run:
```bash
node_modules/.bin/esbuild prototipo/coup/_entry.ts --bundle --format=iife --global-name=Cupi --target=es2020 --outfile=prototipo/coup/rules.js --banner:js="// Gerado com esbuild a partir de shared/src/games/coup (regras reais, só para o protótipo). Não editar à mão."
```
Expected: `prototipo/coup/rules.js` criado sem erro; `node -e "require('./prototipo/coup/rules.js')"` não lança (o IIFE define `var Cupi` no escopo do módulo; confira as chaves com `node -e "const fs=require('fs');eval(fs.readFileSync('prototipo/coup/rules.js','utf8')+';console.log(Object.keys(Cupi))')"`).

- [ ] **Step 3: `texts.js`**

Define `window.Txt = { CHAR, ACTION, name(id), declaration(view), logLine(entry), lossTitle(reason) }`:
- `name(id)`: `NAMES[Number(id.slice(1))]` com `NAMES = ['você','Bia','Léo','Nina','Caio','Duda']` (exporte `NAMES` também).
- `declaration(view)` (palco, durante a janela): a partir de `view.declared` e `view.block`:
  - janela `action`: com personagem → "Bia diz: sou **Duque** e pega 3" / "… e assassina Léo" / "… e extorque Léo" / "… e troca cartas"; ajuda externa → "Bia pede ajuda externa (+2)";
  - janela `block`: "Léo bloqueia como **Capitão**" (e embaixo, menor, a ação bloqueada);
  - janela `blockOnly`: "Léo pode bloquear o Assassino com a **Condessa**".
  Use `<b>` no personagem (a tela pinta de vermelho). "você" em vez do nome quando for `p0` ("você diz: sou Duque…", "você bloqueia…").
- `logLine(entry)` (diário), por `entry.t`: `start` "Partida nova. Começa Bia."; `act` (como a declaração, no passado: "Bia disse Duque", "Caio pediu ajuda externa", "você deu o golpe em Léo", "Nina pegou renda"); `challenge` "Léo duvidou de Bia: **tinha** o Duque" / "… **não tinha** o Duque"; `block` "Léo bloqueou como Capitão"; `blocked` "a ação de Bia foi bloqueada"; `resolved` com `amount` quando faz sentido ("Bia pegou 3", "Bia tirou 2 de Léo"; golpe/assassinato/troca: omitir, a linha `lose` conta); `lose` "Léo perdeu um Capitão"; `out` "Léo está fora"; `win` "Bia tomou o poder".
- `lossTitle(reason)` (painel de perder carta): `coup` "Você levou um golpe", `assassinated` "Você foi assassinado", `challengeWrong` "Você errou a dúvida", `caught` "Pegaram seu blefe". Subtítulo fixo: "Escolha a carta que vai revelar".

- [ ] **Step 4: `bots.js`**

`window.Bot = { decide(view, me, rnd) }` devolve uma ação (`CoupAction`) ou `null`, usando só a visão de `me`:
- `can.lose` → revela a carta da qual tem mais cópias; se empate, ao acaso.
- `can.keep > 0` → fica com as `keep` cartas "melhores" em ordem de preferência `duke, captain, assassin, contessa, ambassador` (escolhe do conjunto `myCards + myDrawn`).
- `can.act.length` → se `can.act` só tem `coup`, golpe no alvo com mais cartas viradas pra baixo (empate: mais moedas). Senão, com 7+ moedas e `coup` disponível, golpe com 70% de chance. Senão escolhe entre as ações disponíveis: as **honestas** (sem personagem, ou com personagem que está em `myCards`) têm peso 3; os **blefes** têm peso `BLUFF` (padrão 0,6; painel de dev). Alvo das ações com alvo: entre `can.targets`, preferindo quem tem mais moedas (extorquir) ou mais cartas (assassinar). Manda `{type:'act', kind, target?}`.
- `can.pass` (janela aberta pra ele): manda sempre com `windowId: view.window.id`.
  - pode bloquear (`can.block.length`): se tem a carta de bloqueio → bloqueia (100%); senão blefa o bloqueio com 25% quando é alvo, 10% na ajuda externa.
  - pode duvidar (`can.challenge`): chance base `DOUBT` (padrão 0,15; painel); ×3 se o bot tem 2 cópias do personagem declarado; ×2 se o bot é o alvo e perderia a última carta.
  - senão "deixa".
- Senão `null`.
`rnd` é uma função `() => número em [0,1)` (o `Math.random`), pra dar pra trocar se precisar.

- [ ] **Step 5: `sounds.js` provisório**

```js
'use strict';
/* Provisório: sons chegam na Task 3. */
window.play = () => {};
window.setSound = () => {};
```

- [ ] **Step 6: `index.html` — laço do jogo e tela simples**

Estrutura (referência: `prototipo/retratim/index.html` pra `fit()`, `toast()`, painel `#dev`):
1. `<head>`: fontes, Tabler `https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.19.0/dist/tabler-icons.min.css`, CSS com as variáveis da identidade.
2. Scripts nesta ordem: `rules.js`, `texts.js`, `bots.js`, `sounds.js`, script principal inline.
3. Estado e laço:

```js
const ME = 'p0';
let N = 4, SPEED = 1, state = null, away = new Set();
const ids = () => Array.from({ length: N }, (_, i) => `p${i}`);
const ctx = () => ({ hostId: ME, active: ids().filter((p) => !away.has(p)), rng: Math.random, now: Date.now() });
const view = (p = ME) => Cupi.coupViewFor(state, p);

/** Igual ao servidor: o schema das ações valida antes das regras. */
function act(pid, action) {
  const parsed = Cupi.coupActionSchema.safeParse(action);
  if (!parsed.success) { console.error('ação inválida (bug do protótipo)', action, parsed.error); toast('Ação inválida (bug do protótipo — veja o console)'); return false; }
  const res = Cupi.applyCoupAction(state, pid, parsed.data, ctx());
  if (!res.ok) { if (pid === ME) { toast(ERR[res.error] || res.error); play('error'); } return false; }
  state = res.state; changed(); return true;
}
/** O "alarme" do servidor: fecha a janela no prazo e joga pelos ausentes. */
setInterval(() => { if (!state) return; const next = Cupi.settleCoup(state, ctx()); if (next !== state) { state = next; changed(); } else renderClock(); }, 200);
```

`ERR`: as mensagens PT-BR de `shared/src/protocol.ts` pros códigos que o Cúpi usa (`not_your_turn`, `not_enough_coins`, `must_coup`, `bad_target`, `cannot_react`, `already_passed`, `window_closed`, `not_losing`, `bad_exchange`, `bad_block`, `not_owner`, `not_player`, `bad_phase`, `not_enough_players`, `room_full`).

`newGame()`: limpa os timers dos bots, `away.clear()`, `state = Cupi.initialCoupState()`, `act(ME, {type:'start'})`. `restart()` (botão do fim): `act(ME, {type:'restart'})` (o placar da noite continua).

4. **Bots** (`scheduleBots()`, chamado no `changed()`): pra cada bot com algo a fazer (`Bot.decide(view(p), p, Math.random) !== null`) e sem plano marcado pra chave `${state.match}:${state.log.length}:${state.window?.id ?? '-'}:${p}`, agenda a jogada com atraso: na vez dele `between(1200, 3000) * SPEED`; numa janela `between(1500, 7000) * SPEED` (e 15% das vezes o bot não responde, deixando o tempo correr); perdendo carta/troca `between(900, 2000) * SPEED`. Na hora de jogar, recalcula `Bot.decide` com a visão **atual** (a janela pode ter mudado) e manda. Bots ausentes (`away`) não jogam: o automático das regras cuida.
5. **Tela simples** (a Task 2 troca pela mesa de verdade): uma coluna com o estado em texto (fase, de quem é a vez, moedas e cartas de cada um, `Txt.declaration` se houver janela + segundos restantes), seus botões vindos **só** de `view().can` (ações → se tem alvo, um botão por alvo em `can.targets`; reação → duvidar / bloquear como X / deixa, sempre com `windowId`; perder → um botão por carta; troca → checkboxes + confirmar; fim → "jogar de novo") e o diário (`Txt.logLine` de cada entrada, mais nova embaixo).
6. **Painel de dev** (⚙, canto): jogadores 2–6 (reinicia), velocidade dos bots (rápido 0,4 / normal 1 / lento 2), bots blefam (pouco 0,2 / normal 0,6 / muito 1,2 → `BLUFF`), bots duvidam (pouco 0,05 / normal 0,15 / muito 0,35 → `DOUBT`), "ver as cartas dos bots" (mostra as cartas viradas pra baixo de cada bot, lidas do `state` — só no protótipo), "eu saio da mesa" (põe/tira `p0` de `away`, pra ver o automático), "um bot sai" (alterna o primeiro bot vivo em `away`), "nova partida". Texto curto explicando que é um protótipo.

- [ ] **Step 7: launch.json**

Acrescente em `.claude/launch.json` (dentro de `configurations`, depois de `prototipo-retratim`):

```json
    {
      "name": "prototipo-cupi",
      "runtimeExecutable": "npx",
      "runtimeArgs": ["--yes", "http-server", ".", "-p", "5178", "-c-1", "--silent"],
      "port": 5178
    },
```

- [ ] **Step 8: conferir e commitar**

`node --check` em `texts.js`, `bots.js`, `sounds.js`; extraia o script inline do `index.html` pra um arquivo temporário no scratchpad e rode `node --check` nele. Commit:

```bash
git add prototipo/coup .claude/launch.json
git commit -m "feat(prototipo): Cúpi — esqueleto com regras reais, bots e tela simples

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: a mesa do computador (identidade cartaz)

**Files:**
- Modify: `prototipo/coup/index.html`

Troque a tela simples pela mesa do mockup aprovado (palco 1440×900 escalado por `fit()`), mantendo o laço e os bots da Task 1. Requisitos:

1. **Fundo e moldura:** papel creme (`--cream`) com uma faixa vermelha fina no alto (como a capa da estante); no canto esquerdo do topo, "CÚPI" em `--disp` 44 px; à direita, o placar da noite numa linha ("placar da noite: Bia 2 · você 1 · …", nomes de `Txt.NAMES`, só quem tem `wins`), o botão de som e o ⚙.
2. **Oponentes (em cima)**, em linha, centralizados, na ordem dos assentos a partir de quem vem depois de você: nome em `--disp` 22 px, as 2 cartas pequenas (verso vermelho com um emblema simples — um círculo e uma estrela em SVG ou `ti-star` — pra virada pra baixo; carta de papel com o ícone e o nome riscados pra virada pra cima), moedas com `ti-coin`. O da vez ganha contorno vermelho de 2 px; quem saiu fica com 45% de opacidade e "fora" no lugar das moedas; ausente (`away`) ganha "ausente" pequeno. **Escolhendo alvo**, os assentos de `can.targets` ficam clicáveis (contorno pulsando) e um aviso no palco diz "escolha o alvo · cancelar".
3. **Palco (meio)**: caixa `--felt` com contorno preto 2 px. Cantos: "tesouro N" e "baralho N". No centro:
   - fora de janela: "vez de Bia" (ou "**sua vez**" em vermelho);
   - na janela: `Txt.declaration(view)` em `--disp` 34 px, a **barra dos 10 s** (largura = tempo restante / `COUP_WINDOW_MS`, vermelha, anima suave), os botões de reação **grandes** (de `can`: "duvidar", "bloquear como X" para cada `can.block`, "deixa"), e embaixo, pequeno, "Léo deixou · Nina deixou · faltam você e Caio" (de `window.passed` vs `window.eligible`);
   - quando você não pode reagir na janela, no lugar dos botões: "esperando os outros…".
   Esconda os botões da janela quando o tempo local passar de `window.endsAt` (a visão não tem relógio).
4. **Sua área (embaixo)**: suas cartas viradas pra baixo grandes (≈120×168, papel `--paper`, ícone vermelho 34 px, nome em `--disp`), suas perdidas menores e riscadas ao lado, "você · N moedas" em `--disp`, e as **7 ações** em botões (nome + dica pequena; as fora de `can.act` ficam apagadas; o personagem que você tem fica com um pontinho vermelho de "você tem", via `COUP_CLAIM` × `myCards`). Ação com alvo → modo "escolher alvo" (item 2). Fora da sua vez, as ações ficam apagadas.
5. **Diário (coluna direita, ~260 px)**: título "diário" em `--disp`, linhas de `Txt.logLine` (mais nova embaixo, rola sozinho), a última em destaque.
6. **Painéis sobre a sua área** (não cobrem os oponentes nem o palco):
   - **perder carta** (`can.lose`): `Txt.lossTitle(loss.reason)` + "Escolha a carta que vai revelar" + suas cartas clicáveis (a escolhida ganha contorno vermelho) + botão "revelar X";
   - **trocar** (`can.keep`): "Fique com N das M cartas" + `myCards` + `myDrawn` (as compradas marcadas "nova") selecionáveis + "ficar com essas";
   - **fim** (`phase === 'over'`): "Bia tomou o poder" em `--disp` 44 px vermelho, "ficou com …" (`winnerCards`), "saíram: …" (`out` em ordem), o placar da noite, e "jogar de novo" (você é o anfitrião).
7. Quando alguém (outro) está escolhendo carta perdida ou trocando, o palco diz "Léo está escolhendo a carta que perde…" / "Nina está trocando cartas…".

Conferir com `node --check` no script extraído; commit `feat(prototipo): Cúpi — mesa do computador na identidade cartaz`.

---

### Task 3: momentos narrados e sons

**Files:**
- Modify: `prototipo/coup/index.html`, `prototipo/coup/sounds.js`

1. **Momentos** (spec §5: o grupo precisa entender o que aconteceu): quando o diário ganha uma entrada `challenge`, `blocked`, `out` ou `win`, o palco mostra por **2,2 s** um "momento" por cima do conteúdo normal (sem bloquear os botões do painel de perder carta, que aparece embaixo):
   - `challenge` com `had: true`: "Léo duvidou!" e a carta do desafiado vira pra cima no palco (`claim`), com "Bia tinha o Duque" em vermelho;
   - `challenge` com `had: false`: "Léo duvidou!" e "Bia blefou!" com um carimbo "BLEFE" girado em vermelho;
   - `blocked`: "bloqueado!" com o personagem do bloqueio;
   - `out`: "Léo está fora";
   - `win`: não precisa (a tela do fim já mostra).
   Os momentos entram numa fila (dois seguidos aparecem um depois do outro) e somem sozinhos.
2. **Sons** (`sounds.js`, adaptado de `prototipo/retratim/sounds.js`, baixinhos — o usuário acha os do DITU altos): `turn` (sua vez: duas notinhas), `declare` (alguém declarou: estalo de papel), `tick` (cada segundo dos **3 últimos** da janela, bem baixo, só se você pode reagir), `challenge` (dúvida: batida grave curta), `reveal` (carta virando), `bluff` (blefe pego: duas notas descendo), `lose` (perdeu carta), `coin` (moedas entrando: tilintar curto, quando suas moedas sobem), `win`, `error`. Botão de som no topo liga/desliga.

Commit `feat(prototipo): Cúpi — momentos narrados e sons`.

---

### Task 4: celular em pé

**Files:**
- Modify: `prototipo/coup/index.html`

Com `matchMedia('(max-width: 640px)')` (e em pé), a página deixa de usar o palco 1440×900 e vira um layout fluido de altura da tela (`100dvh`), na ordem do mockup aprovado:
1. topo fino: "CÚPI", placar da noite resumido (só o seu e o do líder), som e ⚙;
2. oponentes numa grade de até 5 colunas (nome 13 px, cartinhas 16×22, moedas);
3. **última linha do diário** numa faixa (toque abre o diário inteiro numa folha que sobe de baixo, com "fechar");
4. palco (ocupa o espaço que sobra): declaração em `--disp` 24 px, barra dos 10 s, botões de reação **grandes** (altura ≥ 48 px, lado a lado se couberem, senão empilhados);
5. sua mão (cartas ≈ 64×90) + "N moedas";
6. ações numa grade 4 × 2 (botões ≥ 44 px de altura).
Os painéis de perder carta, troca e fim viram uma folha que sobe de baixo. Celular deitado: aviso "vira o celular em pé". Tudo funciona com toque (sem hover). Ao voltar pra largura de computador, volta o palco.

Commit `feat(prototipo): Cúpi — celular em pé`.

---

### Task 5: teste com o usuário

Sem código: o controlador abre `prototipo-cupi`, joga uma partida no computador (1280×800) e uma no celular (preset mobile), confere no console que não há erro, tira prints dos momentos principais (janela aberta, dúvida, perder carta, troca, fim) e deixa pro usuário jogar. Os pedidos do usuário viram ajustes neste protótipo e notas pro Plano C2.
