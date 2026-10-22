# cartolina~ — Cúpi: regras e explicação das cartas dentro da mesa (design)

Data: 2026-10-20. Pedido do Rafa depois de o Cúpi ir ao ar: "tem que ter as regras dentro do jogo, e explicação do
que cada carta faz, dentro do próprio jogo". Só o Cúpi (decisão dele). Formato escolhido nos mockups: **as duas
coisas** — uma colinha completa num botão "regras" e uma dica rápida em cima de cada carta e ação.

## 1. Texto num lugar só

`web/src/games/coup/rules.ts` gera todos os textos das regras **a partir das tabelas do `shared`** (`COUP_CLAIM`,
`COUP_COST`, `COUP_GAIN`, `COUP_BLOCKERS`, `COUP_MUST_COUP_AT`, `COUP_WINDOW_MS`) e dos nomes em `names.ts`.
Assim a colinha e as dicas nunca contradizem o jogo. Exporta:

- `ACTION_ROWS`: as 7 ações, cada uma com nome, quem diz ser (ou "—"), efeito ("+1", "−7, alvo perde carta",
  "tira 2 do alvo", "compra 2, devolve 2"…) e quem bloqueia ("ninguém" / personagens).
- `CHARACTER_INFO`: os 5 personagens, cada um com "na sua vez" (ação e efeito, ou "nenhuma ação" pra Condessa) e
  "bloqueia" (o que barra, ou "nada").
- `HOW_IT_WORKS`: objetivo + uns 6 itens curtos (janela de 10 s com duvidar/bloquear/deixa; dúvida certa e errada;
  bloqueio pode ser duvidado; perder carta e sair; troca; golpe obrigatório com 10 moedas).
- `actionTip(kind)`, `characterTip(c)`, `reactionTip(kind)`: a frase da dica rápida (ex.: "Duque · na sua vez:
  taxar, pega 3 · bloqueia a ajuda externa"; "duvidar · se ela não tiver a carta, ela perde uma; se tiver, você
  perde"; "deixa · não reage nesta janela").

## 2. Botão "regras" e a colinha

- Botão "regras" no topo da mesa, no computador e no celular (ao lado do som).
- **Computador:** a colinha abre como painel à direita, por cima da coluna do diário (largura ~380 px), sem tampar o
  palco; rola sozinha se precisar; "fechar ✕" e Esc fecham.
- **Celular:** folha que sobe de baixo, igual à do diário (fundo escurecido, "fechar", Esc, toque no fundo).
- Conteúdo, nesta ordem: **objetivo** (uma linha), **ações** (tabela de `ACTION_ROWS`), **personagens** (os 5 com a
  arte em miniatura, nome, "na sua vez" e "bloqueia"), **como funciona** (`HOW_IT_WORKS`).
- A partida continua com a colinha aberta. **Se abrir uma janela em que você pode reagir, a colinha fecha
  sozinha** (pra não perder os 10 s); o mesmo quando você precisa perder carta ou trocar.
- Foco: abre no "fechar"; ao fechar volta pro botão "regras". Folha/painel com `role="dialog"` e rótulo "regras".
- Identidade cartaz (creme/papel/tinta/vermelho, Bebas Neue e Oswald), tudo dentro de `.coup`.

## 3. Dica rápida nas cartas e ações

- Onde: suas cartas viradas pra baixo, os 7 botões de ação e os botões da janela (duvidar, bloquear como X, deixa).
- **Computador:** aparece ao passar o mouse (e ao focar pelo teclado), num balão escuro acima do elemento.
- **Celular:** segurar o dedo ~450 ms mostra o balão; soltar o dedo depois disso **não** dispara a ação; o balão some
  ao tocar em outro lugar ou depois de 3 s.
- Acessível: o texto fica ligado ao elemento por `aria-describedby` (leitor de tela ouve sem precisar do balão).
- O balão nunca sai da tela (encosta na borda) e não pega cliques.

## 4. Testes

- `rules.ts`: cada linha de `ACTION_ROWS` e `CHARACTER_INFO` bate com as tabelas do `shared` (quem diz ser, custo,
  ganho, bloqueadores); a Condessa não tem ação; nada de número escrito à mão que contradiga as constantes.
- Colinha: o botão abre e fecha (botão, Esc, fundo no celular); o foco vai pro "fechar" e volta pro botão; fecha
  sozinha quando a visão nova tem `can.pass`, `can.lose` ou `can.keep`; no celular é folha, no computador painel.
- Dica: hover mostra o texto certo; `aria-describedby` presente; no celular, segurar mostra a dica e não manda a
  ação; toque normal continua mandando a ação.

## Fora de escopo

Regras dentro dos outros jogos; tutorial passo a passo; mudar o "como jogar" do lobby.
