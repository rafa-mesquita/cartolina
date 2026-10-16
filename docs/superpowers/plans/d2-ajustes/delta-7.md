# Ajustes da Tarefa 7 (valem por cima do texto da tarefa)

O protótipo (`prototipo/dixit/index.html`) mudou depois do plano, a pedido do usuário. É a referência de comportamento:
procure `onHandDown`, `renderHand`, `playFromHand`, `renderTable`, `addLoose`, `landLoose`, `looseSpot`, `feltPoint`, `onLooseClick`.
Já existem: `web/src/games/dixit/hand.ts` (`orderHand`, `moveCard`, `insertIndex`, `handX`, `HAND_W`, `HAND_STEP`),
`geometry.ts` (`looseSpot`, `Spot`, `tableSlots`…), `sounds.ts` (`playDixitSound` — use SEMPRE este, nunca `playSound`, no código do Diquisti).
O CSS das classes abaixo vem da Tarefa 6 (`.dx-hcard.dragging`, `.dx-hcard.away`, `.dx-felt.drop-ready|drop-over|drop-no`, `.dx-tcard.loose`, `.dx-tcard.gather`, `--rz`, `.dx-roman` medalhão, `.dx-owner` selo no topo).

## 1. `Hand.tsx`: arrastar e soltar (substitui o clique-pra-escolher)
Props novas (a ordem da mão e o que está "fora" são do componente pai, a mesa da Tarefa 10):
```ts
interface Props {
  /** Cartas na ordem local (o pai usa `orderHand`). */
  ids: readonly string[];
  /** Cartas que já foram pra mesa (pendentes ou confirmadas): somem da mão na hora. */
  away: readonly string[];
  /** Pode jogar agora (sua vez de narrar ou de escolher). */
  canPlay: boolean;
  /** Narrador sem dica: soltar no feltro não joga (feltro vermelho, a carta volta). */
  blocked: boolean;
  /** Soltou no feltro podendo jogar. `at` = ponto da tela onde soltou (null pelo teclado). */
  onPlay: (id: string, at: { x: number; y: number } | null) => void;
  /** Soltou no feltro mas está bloqueado (falta a dica). */
  onBlocked: () => void;
  /** Nova ordem depois de arrastar dentro da mão. */
  onReorder: (order: string[]) => void;
  onZoom: (id: string) => void;
  /** Estado do feltro durante o arrasto, pro pai repassar ao `Felt`. */
  onDropState: (s: 'ready' | 'over' | 'no' | null) => void;
}
```
Comportamento (igual ao protótipo):
- Lógica de ponteiro num hook `web/src/games/dixit/useHandDrag.ts` (pointer events + `setPointerCapture`; limiar de 6 px antes de virar arrasto; `pointercancel`/`lostpointercapture` devolvem a carta sem jogar).
- Escala do palco = `handEl.getBoundingClientRect().width / HAND_W`. Deslocamento do arrasto em px do palco = delta da tela / escala.
- Carta arrastada: classe `dragging`, `transform: translate(dx, dy) rotate(clamp(dx / 25, -10, 10)deg) scale(1.08)`.
- As outras abrem espaço: posição de cada carta = `handX(índice na lista com a arrastada no índice de inserção, n)`; índice de inserção = `insertIndex((clientX - rect.left) / escala, n)` quando o ponteiro não está sobre o feltro.
- Sobre o feltro = `document.elementFromPoint(x, y)?.closest('.dx-felt')`. Avise `onDropState`: ao começar a arrastar, `'ready'` se `canPlay && !blocked`; em cima do feltro `'over'` (ou `'no'` se `blocked`); fora, volta a `'ready'`/`null`; ao soltar, `null`.
- Soltar em cima do feltro: `blocked` → `onBlocked()`; `canPlay` → `onPlay(id, { x: clientX, y: clientY })`; senão reordena. Soltar fora do feltro → `onReorder(moveCard(...))`. Toque `playDixitSound('pick')` ao começar a arrastar e um `playDixitSound('land')` baixinho ao reordenar.
- Clique sem arrastar → `onZoom(id)`. O botão ⤢ continua.
- Teclado: `Enter` numa carta focada → `blocked ? onBlocked() : canPlay ? onPlay(id, null) : onZoom(id)`.
- `away` → classe `away` (some); a posição é calculada só com as cartas que não estão `away`.
- Posição: `left: handX(i, n)`; giro `(i - mid) * 2.6deg` como antes.
Testes (substituem os de `onPick`): clique simples chama `onZoom`; `Enter` com `canPlay` chama `onPlay(id, null)`; `Enter` com `blocked` chama `onBlocked`; arrasto simulado (`fireEvent.pointerDown/pointerMove/pointerUp` com `clientX/clientY`, e `document.elementFromPoint` espiado com `vi.spyOn` devolvendo um elemento dentro de um `.dx-felt`) chama `onPlay` com o ponto; arrasto que termina fora do feltro chama `onReorder`; `away` some da mão. jsdom não tem `setPointerCapture`: proteja com `?.` ou crie o stub no teste.

## 2. `Felt.tsx`
Props a mais:
```ts
  /** Estado do feltro durante o arrasto (classe no `.dx-felt`). */
  dropState: 'ready' | 'over' | 'no' | null;
  /** Suas cartas que esperam a 2ª (partida de 3), em ordem. */
  pending: readonly string[];
  /** Onde você soltou cada carta sua (tela), por chave `${você}:${k}`. */
  dropPoints: Readonly<Record<string, { x: number; y: number }>>;
  /** Narrador: já tem dica (escrita ou "vou falar na call"). */
  clueReady: boolean;
  /** Clicou numa carta sua que espera a 2ª: devolve pra mão. */
  onUnpend: (k: number) => void;
```
- `dropState` → `className={'dx-felt' + (dropState ? ' drop-' + dropState : '')}`.
- **Fase `submitting`: cartas soltas.** Uma carta virada por jogada já feita: narrador (1, chave `${narrador}:0`) + cada jogador em `confirmed` (`dixitPicksPerPlayer(inRound.length)` cartas, chaves `${p}:${k}`) + suas `pending` (se você não é o narrador nem confirmou). Posição guardada num `useRef<Map<string, Spot>>` (zerado quando a fase deixa de ser `submitting`/`voting` ou a rodada muda): a sua vem de `dropPoints` convertido pra coordenada do feltro (`feltPoint`: `(x - r.left) / r.width * FELT_W`, `(y - r.top) / r.height * FELT_H`, com `r` = retângulo do `.dx-felt`; depois `clamp(x, 130, 870)`, `clamp(y + 70, 210, 520)`, giro entre −14 e 14); sem ponto, ou de outro jogador, `looseSpot(usadas, Math.random)`. Classe `loose`, `--rz` = giro, `z-index` crescente (a pilha sobe). Clique numa sua pendente → `onUnpend(k)`.
- **Animação de chegada** (em `useLayoutEffect`, só para as cartas novas; jsdom não tem `animate`: use `el.animate?.(…)`): carta de outro jogador voa do assento dele (elemento `[data-seat="${p}"]`, centro convertido com `feltPoint`) com `translateZ(150px)`, 680 ms, e toca `playDixitSound('land')`; a sua só assenta (`translateZ(70px)` → 0, 380 ms).
- **Indo pra `voting`:** se faltar a carta de alguém (quem jogou por último já fecha a fase), ela cai solta primeiro e a arrumação espera 750 ms; depois as soltas vão pras posições de `tableSlots(n)` na ordem de `table` (classe `gather`, `--rz: 0deg`) e viram uma a uma (atraso +820 ms + 120 ms por carta; som `flip` com `playDixitSound`). Use timers com limpeza no unmount.
- **Numeral** `.dx-roman` dentro da carta (o CSS posiciona no canto); **dono** `.dx-owner` (com `me` quando é você e o texto "você") DENTRO da `.dx-face`, no topo; quando o dono aparece, `dx-mine` ("sua") some.
- Mensagem do feltro na narração, quando você narra: `clueReady ? 'arraste pra cá a carta da sua dica' : 'primeiro a dica: escreva ou marque “vou falar na call”'`.
Testes a mais: em `submitting`, o número de `.dx-tcard.loose` = 1 + confirmados × cartas por jogador (+ pendentes); com `vi.useFakeTimers()`, ao passar pra `voting` as cartas terminam em `tableSlots` e sem `loose`; `dropState='no'` põe `drop-no` no feltro; o dono fica dentro de `.dx-face`.

## 3. `Seats.tsx`
Cada assento (e o seu, se houver elemento seu) ganha `data-seat={id}` (origem do voo das cartas).

## 4. Nome
Textos que o jogador vê dizem "Diquisti".
