# Mandacaru — protótipo jogável Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma página estática em `prototipo/hexa/` onde o Rafa joga uma partida inteira de Mandacaru contra 2 ou 3 bots, com as **regras reais** e a cara do estilo D, pra testar jogabilidade e tela antes da mesa do site (M2).

**Architecture:** Igual ao protótipo do Cúpi (`docs/superpowers/plans/2026-10-19-cupi-prototipo.md`): HTML + scripts soltos, sem framework, servido por `http-server`. As regras de `shared/src/games/mandacaru` são empacotadas com esbuild em `prototipo/hexa/rules.js` (global `Manda`). Toda ação passa por `mandacaruActionSchema` e `applyMandacaruAction`; um `setInterval` de 250 ms faz o papel do alarme (`settleMandacaru` com `now`). A tela lê só `mandacaruViewFor(state, 'p0')`; os bots decidem só pela própria visão. Assim o protótipo testa o contrato `MandacaruView`/`MandacaruCan` que a mesa do M2 vai usar.

**Tech Stack:** HTML/CSS/JS puro (ES2020, `'use strict'`), esbuild (já no `node_modules`), Google Fonts (Bree Serif, Mulish), Web Audio sintetizado.

**Spec:** `docs/superpowers/specs/2026-11-09-mandacaru-design.md` (§2 regras, §5 identidade, §6 mesa). Item 2 da §9.

---

## Contexto para quem vai executar

- Worktree `.claude/worktrees/hexa`, branch `feat/hexa`. Não troque a branch da pasta mãe, sem merge/push, nunca `git stash` puro.
- O protótipo visual de 4 estilos já existe em `prototipo/hexa/` (`index.html`, `board.js`, `temas.js`); o escolhido é o **D · Mandacaru** (objeto `D` em `temas.js`: cores, `defs`, `hex`, `ocean`, `token`, `port`, `road`, `settle`, `city`, `robber`, ícones). A página antiga de 4 estilos vira `prototipo/hexa/estilos.html` (guardada pra referência); a jogável é a nova `index.html`.
- **Coordenadas**: a geometria real (`Manda.geometry()`) usa unidade = raio do hexágono. Desenhe com `R = 58` multiplicando `x`/`y` da geometria. Os índices de terreno/canto/lado/feira são os da geometria real (não os do `board.js` antigo, que é só do protótipo visual e pode ser apagado da página jogável).
- Como ver: `npx http-server . -p 5186 -c-1` **na raiz da worktree** e abrir `http://localhost:5186/prototipo/hexa/`. Quem implementa confere que a página carrega sem erro no console e que dá pra jogar até o fim com bots; `node --check` em cada `.js` solto.
- Textos da tela em português, nomes do tema: madeira, barro, couro, feijão, pedra; caatinga, barreiro, malhada, roçado, lajedo, rio seco; casa, vila, estrada, cordel; Vaqueiro, Ponto, Mutirão, Chuva no sertão, Atravessador; Carcará; feira; maior estrada, maior comitiva.
- Commits `proto(mandacaru): …` terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Mapa de arquivos (`prototipo/hexa/`)

| Arquivo | O quê |
|---|---|
| `_entry.ts` | exports das regras reais pro bundle |
| `rules.js` | gerado pelo esbuild (commitado; não editar à mão) |
| `art.js` | desenho SVG do estilo D (portado do `D` de `temas.js` + ícones), em coordenadas da geometria real |
| `texts.js` | nomes do tema e frases do diário a partir de `MandacaruLogEntry` |
| `bots.js` | `Bot.decide(view, me, rnd)` → ação ou null |
| `sounds.js` | sons suaves (dados, construir, carta, Carcará, vez, vitória) |
| `index.html` | a mesa jogável (estado, laço, render, cliques) |
| `estilos.html` | a página antiga dos 4 estilos (renomeada) |

---

### Task 1: regras reais, laço, bots e a mesa que já joga

**Files:** Create `_entry.ts`, `rules.js`, `art.js`, `texts.js`, `bots.js`, novo `index.html`; rename `index.html` → `estilos.html`.

- [ ] **Step 1: `_entry.ts` e bundle**

```ts
// Só para o protótipo: o que a página usa das regras reais do Mandacaru.
export { applyMandacaruAction, initialMandacaruState } from '../../shared/src/games/mandacaru/rules';
export { settleMandacaru } from '../../shared/src/games/mandacaru/auto';
export { mandacaruViewFor, mandacaruNextDeadline } from '../../shared/src/games/mandacaru/view';
export { mandacaruActionSchema } from '../../shared/src/games/mandacaru/schema';
export { geometry, pips } from '../../shared/src/games/mandacaru/board';
export { portRates, points } from '../../shared/src/games/mandacaru/build';
export * from '../../shared/src/games/mandacaru/types';
```

```bash
node_modules/.bin/esbuild prototipo/hexa/_entry.ts --bundle --format=iife --global-name=Manda --target=es2020 --outfile=prototipo/hexa/rules.js --banner:js="// Gerado com esbuild a partir de shared/src/games/mandacaru (regras reais, só para o protótipo). Não editar à mão."
```

- [ ] **Step 2: `art.js`** — `window.Art = { defs, hex(h, tile), border(h), token(h, number), port(p, kind), road(a, b, color), house(x, y, color), city(x, y, color), carcara(x, y), icon(kind, style, size), COLORS }` portando o estilo D de `temas.js` (mesmas cores, filtros, padrões, Carcará, feiras de toldo). A borda de terra rachada: os 18 hexágonos do anel 3 (calcule como em `board.js`, `ring(3)`) desenhados com `x,y` de `SQ3*(q+r/2)`, `1.5*r`. As feiras usam `Manda.geometry().ports[i]` (`vertices` dão as pontas; a barraca fica a 0,55 R pra fora do meio do lado, na direção oposta ao centro do terreno `hex`).
- [ ] **Step 3: `texts.js`** — `window.Txt = { RES: {wood:'madeira',…}, TERRAIN: {...}, CORDEL: {vaqueiro:'Vaqueiro', point:'Ponto', mutirao:'Mutirão', chuva:'Chuva no sertão', atravessador:'Atravessador'}, POINT_NAMES: ['Igrejinha','Açude','Cisterna','Escola','Casa de Farinha'], line(entry, nameOf) }` — uma frase curta por tipo de entrada (ex.: `roll` → "Bia tirou 8: Rafa ganhou 2 feijão, Duda 1 pedra."; `short` → "faltou barro no banco: ninguém recebeu"; `steal` → "o Carcará da Bia levou uma carta do Léo"; `trade` → "Rafa trocou 2 madeira por 1 pedra com a Duda"; `award` → "Duda agora tem a maior estrada (+2)"; `timeout` → "acabou o tempo do Léo"; `win` → "Bia venceu com 10 pontos!").
- [ ] **Step 4: `bots.js`** — `window.Bot = { decide(view, me, rnd) }`, só pela visão:
  - preparação: casa no `can.placeHouse` com maior soma de `pips` dos terrenos em volta (+1 por recurso diferente); estrada sorteada de `can.placeRoad`;
  - `can.discard > 0`: descarta primeiro os recursos de que tem mais;
  - `can.roll`: joga Vaqueiro se o Carcará está num terreno encostado num prédio seu e `can.play` tem `vaqueiro`; senão rola;
  - `can.carcara`: terreno com mais `pips` × prédios dos outros e nenhum seu (prefere o líder em pontos);
  - `can.steal`: quem tem mais cartas;
  - `mutirao`: estrada de `can.buildRoad` mais perto de um canto livre;
  - fase principal (na vez dele): vila › casa › cordel › estrada (estrada só se não há lugar de casa ao alcance) › jogar cordel (Chuva: os 2 recursos que faltam pra próxima meta; Atravessador: o recurso que mais falta; Mutirão se há lugar) › feira se sobra algo na taxa e falta algo pra meta › às vezes (20%) oferta pra mesa (dá 1 do que mais tem, pede 1 do que falta) › passa a vez;
  - fora da vez com oferta aberta (`can.respond`): aceita se tem o `want` da oferta, o `give` dela tem algo que falta pra meta dele, e não está dando algo que também falta; senão recusa. Responde uma vez por oferta.
  - "meta" = a primeira construção possível na ordem vila › casa › cordel › estrada; "falta" = custo − mão.
- [ ] **Step 5: `index.html` (a mesa)** — palco fixo 1440×900 escalado pra caber (`transform: scale`), layout do estilo D (`estilos.html`, estilo D): jogadores à esquerda (cor, nome, pontos visíveis, 🂠 cartas, 📜 cordéis, Vaqueiros, selos de maior estrada/comitiva, quem está na vez destacado, ⏱ relógio do turno), tabuleiro no centro, à direita os botões (rolar, construir estrada/casa/vila, comprar cordel, trocar, feira, passar a vez) + "quanto custa" + diário, embaixo a sua mão (cartas com quantidade, cordéis com selo "novo").
  - **Estado e laço**: lobby simples (2 ou 3 bots, nomes Bia, Duda, Léo; você é `p0` e anfitrião) → `start`. `send(player, action)` = `mandacaruActionSchema.parse` + `applyMandacaruAction` com `ctx = { hostId: 'p0', active: [...], rng: Math.random, now: Date.now() }`; erro aparece num aviso curto. `setInterval(250)`: `settleMandacaru` com `now`, e, se a vez/decisão é de bot, depois de 700–1100 ms pede `Bot.decide` e manda.
  - **Cliques no tabuleiro**: só os lugares do `can` aparecem (círculos pulsando nos cantos, traços pulsando nos lados, terrenos acesos pro Carcará). Na preparação já aparecem sozinhos; no jogo, o botão "construir estrada/casa/vila" liga o modo e o clique manda a ação. Mutirão: lados aparecem até acabar.
  - **Dados**: dois dados com animação curta (300 ms) e a soma grande por 1 s.
  - Nada de troca/feira/cordel/descarte nesta task além do que for preciso pra jogar até o fim: o descarte do 7 pode ser automático nesta task (deixe o prazo de 60 s vencer) e os cordéis só "comprar".
- [ ] **Step 6:** conferir no navegador uma partida inteira com 3 bots até "venceu"; console sem erro.
- [ ] **Step 7: Commit** `proto(mandacaru): mesa jogável com as regras reais e bots`

### Task 2: troca, feira, cordéis, descarte e Carcará na tela

- [ ] **Troca**: painel com duas colunas (você dá / você quer) e +/− por recurso; "mandar pra mesa". Os bots respondem; cada resposta aparece no painel (✓ aceito / ✗ não). "Fechar com fulano" nos que aceitaram. Propostas de bots não existem no protótipo, mas o painel mostra `view.proposals` se houver.
- [ ] **Quando um bot oferece** (vez dele): cartão de oferta no centro-alto com "aceito" / "não" (respond) e "contraproposta" (abre o painel preenchido invertido → `propose`).
- [ ] **Feira**: painel "dou [recurso] na taxa X:1 → quero [recurso] × quantidade", taxas de `can.feira`.
- [ ] **Cordéis**: cada cordel velho na mão tem "jogar" (se em `can.play`). Chuva no sertão: escolher 2 recursos. Atravessador: escolher 1. Mutirão: liga o modo estrada.
- [ ] **Descarte do 7**: janela com +/− por recurso até o número pedido, relógio de 60 s, "descartar".
- [ ] **Roubo**: quando `can.steal` tem mais de um, os nomes aparecem pra escolher. O `view.stolen` mostra "você roubou 1 pedra" / "o Carcará levou 1 feijão seu".
- [ ] Conferir no navegador e commit `proto(mandacaru): troca, feira, cordéis, descarte e Carcará`.

### Task 3: diário, sons, fim de partida e regras

- [ ] Diário com `Txt.line` (últimas 8, a mais nova em cima). Sons suaves (`sounds.js`): dados, construir, carta, Carcará, sua vez, vitória — baixos (o Rafa acha os sons do DITU altos).
- [ ] Relógio do turno: fica vermelho no último minuto.
- [ ] Fim: painel com os pontos de todos, de onde vieram, cordéis de Ponto revelados, placar da noite (`view.wins`) e "jogar de novo" (`restart`).
- [ ] Botão "regras" abre uma folha lateral com o resumo da spec §2 (custos, 7, troca, cordéis, pontos).
- [ ] Commit `proto(mandacaru): diário, sons, fim de partida e regras`.

### Task 4: teste com o Rafa

- [ ] Abrir no painel do navegador pra ele; anotar o que ele pedir em `docs/superpowers/plans/notas-para-mandacaru-m2.md`.
