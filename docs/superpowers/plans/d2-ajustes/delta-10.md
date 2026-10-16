# Ajustes da Tarefa 10 (valem por cima do texto da tarefa)

As Tarefas 7 e 8 foram implementadas com APIs novas (arrastar e soltar, cartas soltas, dica controlada). Leia os componentes
reais em `web/src/games/dixit/` (`Hand.tsx`, `useHandDrag.ts`, `Felt.tsx`, `Seats.tsx`, `ActionPanel.tsx`, `handOrder.ts` — renomeado de `hand.ts` na Tarefa 7, porque no Windows `./hand` e `./Hand` se confundiam —, `loose.ts`, `sounds.ts`)
antes de montar a mesa: **o código da `DixitTable` no texto da tarefa usa as APIs antigas (`sel`, `onPick`, `tell`, `submit`) e
precisa ser adaptado**. Referência de comportamento: `prototipo/dixit/index.html` (`playFromHand`, `onLooseClick`, `clueReady`, `needClue`).

## Estado da mesa (`DixitTable`)
- `handOrder` (string[]) → a mão mostrada é `orderHand(handOrder, g.hand)` (de `./handOrder`); `onReorder` guarda a nova ordem.
- `pending` (string[]): suas cartas soltas esperando a 2ª (só partida de 3). Zera quando a fase muda.
- `dropPoints` (Record<string, {x, y}>): onde você soltou cada carta, **chave = id da carta** (a Tarefa 7 guarda as suas cartas pelo id). Zera quando a rodada/fase de escolha acaba.
- `clue` (string) e `spoken` (boolean): a dica do narrador e o "vou falar a dica na call". Zeram depois de narrar e quando muda o narrador.
- `needClueTick` (number): sobe quando o narrador solta a carta sem dica.
- `dropState` ('ready' | 'over' | 'no' | null): vem do `Hand` (`onDropState`) e vai pro `Felt`.

## Regras de jogar
- `clueReady = spoken || clue.trim() !== ''`; `blocked = fase storytelling && você narra && !clueReady`.
- `canPlay` como o `canPick` do texto (sua vez de narrar ou de escolher, sem pausa).
- `away = [...pending, ...(confirmed ? g.myPicks : [])]`.
- `onPlay(id, at)`:
  - narrador: guarda `dropPoints[id] = at` (se `at`), manda `{ type: 'tell', cardId: id, clue: spoken ? '' : clue }`, zera `clue`/`spoken`;
  - escolha: guarda `dropPoints[id] = at` (se `at`); se `need === 1` manda `submit { cardIds: [id] }` e `confirm`; senão acrescenta em `pending` e, quando `pending.length === need`, manda `submit` com as `need` cartas e `confirm`.
- `onBlocked`: `needClueTick + 1` e `playDixitSound('error')`.
- `onUnpend(cardId)`: tira a carta de `pending` e de `dropPoints` (pelo id; nada a deslocar).
- `Felt` recebe `dropState`, `pending`, `dropPoints`, `clueReady`, `onUnpend`; `ActionPanel` recebe `need`, `pending={pending.length}`, `clue`, `onClue`, `spoken`, `onSpoken`, `needClueTick` (sem `sel`, sem `tell`/`submit`).

## Sons
- Sempre `playDixitSound` (de `./sounds`), nunca `playSound`, em todo o código do Diquisti.
- O `Felt` já toca o pouso de cada carta solta: **tire** o `playSound('land')` por `tableCount` da mesa (senão toca dobrado).
- Cliques de botão: veja como `web/src/brand/buttonSounds.ts` é instalado no app. O Diquisti deve usar o clique mais baixo (`playDixitSound('click')`) sem tocar dois cliques. Se a função aceitar outro `play` (ela aceita), instale com `playDixitSound` enquanto a mesa estiver montada e garanta que o global não toque junto; se isso exigir mexer em código fora do Diquisti de um jeito arriscado, deixe como está e anote no relatório.

## Testes (substituem os de `tell`/`submit` do texto)
Use o teclado no `Hand` (Enter numa carta focada = soltar no feltro) pra não depender de simular arrasto:
- narrador digita a dica no painel e dá Enter numa carta → `sendAction({ type: 'tell', cardId, clue: 'luar' })`;
- narrador sem dica dá Enter → nada é enviado e aparece "Antes de jogar a carta, escreva a dica ou marque “vou falar na call”.";
- narrador marca "vou falar a dica na call" e dá Enter → `tell` com `clue: ''`;
- quem escolhe dá Enter numa carta → `submit` com a carta e depois `confirm`.
Mantenha os outros testes do texto (troca no `Game.tsx`, votação etc.).

## Nome
Textos que o jogador vê dizem "Diquisti" (também no `Game.tsx`).

## Carta ampliada (da revisão da Tarefa 6)
- Ao ver a mesa no navegador: se aparecer um contorno em volta do overlay inteiro quando a carta ampliada abre, acrescente `.dixit .dx-viewer:focus { outline: none; }` no `dixit.css`.
- Rodinha pra cima sobre uma carta da mão ou da mesa abre o `CardViewer`; rodinha pra baixo fecha (como no protótipo).

## Contrato com o `Felt` (da revisão da Tarefa 7)
- Atualize `pending` e `dropPoints` **no mesmo evento** (o mesmo handler do `onPlay`, para o React juntar os dois `setState`). O `Felt` decide o lugar da carta quando ela aparece em `pending`/`myPicks`/`storyCard`; se o ponto chegar depois, a carta cai num lugar sorteado.
- O ponto do narrador também vai em `dropPoints[cardId]` antes de mandar o `tell`.
