# Tatubum — protótipo da mesa com bots

**Objetivo:** um protótipo só de front (`prototipo/tatubum/`), descartável, em que o Rafa joga uma partida inteira de
Tatubum contra 1–7 bots, pra sentir o ritmo da janela de 5 s do Nem vem!, as escolhas, a identidade em pixel art
(noite no cerrado) e as animações (spec §5.4–§5.5), antes da mesa de verdade (Plano T2).

**Arquitetura** (mesmo molde do protótipo do Retratim):

- Página estática servida por `http-server` na raiz da worktree (entrada `prototipo-tatubum`, porta 5178, no
  `.claude/launch.json`).
- **Regras reais**: `shared/src/games/kittens` empacotado com esbuild em `rules.js` (global `Tatubum`); toda ação passa
  pelo `kittensActionSchema` e por `applyKittensAction`, como no servidor. Um `setInterval` de 100 ms faz o papel do
  alarme (`settleKittens` com `now = Date.now()`).
- A tela desenha a **visão** (`kittensViewFor`) de `p0` (o humano, host). Bots `p1…p7` decidem pela visão deles.
- **Animações dirigidas pelo diário**: cada entrada nova do `log` (e cartas novas na mão) dispara um efeito na fila,
  em ordem. Isso vira a referência do T2.

**Arquivos** (`prototipo/tatubum/`):

| Arquivo | O quê |
|---|---|
| `_entry.ts` → `rules.js` | o que o protótipo usa das regras reais + mensagens de erro |
| `index.html` | palco 1440×900 escalado, CSS pixel art, telas (menu, mesa, fim), laço do jogo, entrada do humano |
| `cerrado.js` | fundo de noite no cerrado em canvas (de `ref/fundo-cerrado.html`), animado |
| `sprites.js` | sprites em pixel art das 13 cartas + verso + tatu dos assentos (mapas de caracteres → imagem) |
| `fx.js` | efeitos: voo de carta, carimbo, tremor, flash, partículas (faíscas, corações, explosão, fogos) |
| `bots.js` | bots simples (jogam, dão Nem vem!, escolhem) |
| `sounds.js` | sons 8-bit sintetizados (Web Audio), baixinhos, com botão de mudo |

**Fora do escopo:** servidor, várias pessoas, celular, histórico, arte final (Flow, Plano T3).

**Como testar:** abrir `http://localhost:5178/prototipo/tatubum/`, escolher o número de bots e jogar. O controlador
confere no navegador do app: sem erro no console, partida até o fim com 1, 3 e 7 bots, cada efeito aparecendo.
