# Ajustes da Tarefa 9 (valem por cima do texto da tarefa)

1. **"a sua carta"**: `buildRevealTimeline` e `fooledParts` (em `web/src/games/dixit/reveal.ts`, já implementados) ganharam um último parâmetro `me: string | null = null`. Sem ele, quem narrou lê "esta era a carta de você". No `useReveal`, chame `buildRevealTimeline(result, order, name, me)` (o hook já recebe `me`). Onde a tarefa usar `fooledParts`, passe `me` também. Teste no `useReveal`/legenda: com `me` = narrador, a legenda do passo 1 diz "esta era a sua carta".
2. **Sons**: no código do Diquisti use sempre `playDixitSound` de `web/src/games/dixit/sounds.ts` (mesma assinatura do `playSound`, mas mais baixo, pedido do usuário). Troque o `import { playSound } from '../../brand/sounds'` do `useReveal` por `import { playDixitSound } from './sounds'` e as chamadas.
3. **Nome**: textos que o jogador vê dizem "Diquisti".
4. O selo do dono no topo da carta já é feito pelo `Felt` (Tarefa 7); esta tarefa não mexe nele.
