# Plano D2 — ajustes por tarefa e onde paramos

Os arquivos `delta-N.md` valem **por cima** do texto da Tarefa N do `2026-10-16-plano-d2-dixit-mesa.md`
(o plano foi escrito antes das mudanças pedidas no protótipo: arrastar e soltar, cartas soltas, selo do dono,
numeral em medalhão, dica obrigatória, sons mais suaves, nome Diquisti). Cada implementador lê a tarefa + o delta.

## Onde paramos (2026-10-16, fim do dia)

Execução da Parte A com subagentes (uma tarefa por vez; revisão de conformidade e depois de qualidade).

| Tarefa | Estado | Commits |
|---|---|---|
| 0 Preparar | ok | — |
| 1 Sons (`land`, `pick`, `playDixitSound` mais baixo) | aprovada | 0918b71, 01f681c |
| 2 Geometria + `looseSpot` + `hand.ts` | aprovada | 180e778, d55ac94, a6ba662 |
| 3 Cartas provisórias e verso | aprovada | 7690133, de919eb |
| 4 Status, rótulos e fixtures | aprovada | dc3588a, 08106d2 |
| 5 Linha do tempo da revelação (`me` → "a sua carta") | aprovada | a86b4b3, 803fe69 |
| 6 Identidade visual (CSS, CardArt, fundo, carta ampliada) | implementada; conformidade ✅; **falta a revisão de qualidade** | 16d22eb |
| 7 Feltro, assentos e mão (+ `delta-7.md`) | a fazer | |
| 8 Painel e topo (+ `delta-8.md`) | a fazer | |
| 9 Revelação na tela (+ `delta-9.md`) | a fazer | |
| 10 Mesa inteira e `Game.tsx` (+ `delta-10.md`) | a fazer | |
| 11 Lobby e bots | a fazer | |

Lembretes para quem continuar:
- Use `playDixitSound` (não `playSound`) em todo o código do Diquisti.
- A Tarefa 6 declarou `--lift`/`--rot` padrão no `.dx-hcard` e manteve `preserve-3d` no `.dx-tcard`; o CSS ainda não foi visto no navegador (só a partir da Tarefa 10).
- Depois da 11: revisão final do conjunto e teste da mesa no navegador.
