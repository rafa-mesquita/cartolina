# Notas para os Planos R2–R4 do Retratim

Saíram das revisões do Plano R1 (2026-10-17). Ler antes de escrever cada plano.

## R2 — mesa no site

- **Relógio:** `countdownEndsAt` é hora do servidor e a `RoomView` não traz
  `now`. Mandar `serverNow` na mensagem `state` (ou medir a diferença no
  `welcome`) pra contagem não sair errada com o relógio do PC torto.
- **Eco do rascunho:** a visão devolve o seu próprio rascunho. A bancada não
  pode sobrescrever o que está sendo montado com esse eco (chega atrasado
  durante o arraste): o estado local manda, o do servidor só serve pra
  reconectar.
- **Quando mandar rascunho:** só depois da primeira mexida (cadarço e blocos
  nunca são "em branco", então mandar no começo faria uma obra intocada
  contar). Depois do `ready`, parar: `draft` vira `already_ready`.
- **Limite de frequência** (spec §4.4): se entrar, nunca descartar o último
  rascunho antes do "pronto"; considerar `ready` levando a obra junto.
- **Unidades da obra** (validadas no servidor; fora delas o rascunho é
  recusado e a obra congela antiga):
  - cadarço: no máximo 60 pontos por corda (`LACE_MAX_POINTS`), dentro de 0–1
    — o protótipo usa 160 pontos, reduzir antes de enviar;
  - pontos e linhas: pontos dentro de 0–1 (segurar no arraste);
  - palitos/pedras: fora de 0–1 = guardado de lado (até ±0,5 além da folha);
  - blocos: x/z em ±6, y de 0 a 20, φ de 0 a 1,6 (o three.js usa essas
    unidades); ordem das peças = `BLOCK_SHAPES`.
- **Atividade:** `ACTIVITIES` só tem `thinking`, `writing`, `dragging`;
  decidir o que vira "mexendo…" e "palpitando…".
- **Bots:** gerar obras válidas como o `sampleWork` dos testes.
- **Capa:** criar `.cover-pictures` em `web/src/screens/shelf.css`.
- **Tela vazia:** `web/src/screens/Game.tsx` devolve `null` pra sala
  `pictures`; a mesa do R2 substitui.

## R3 — fotos

- Depois que o script reescrever `photos.ts`, testar o baralho real: precisa
  de pelo menos 4 temas com 4+ fotos, senão `drawGrid` lança erro no
  "começar".

## R4 — histórico

- `runStartedAt` só muda quando a fase sai de `lobby`; no "jogar de novo"
  (`gameover → building`) não muda, então duas partidas seguidas teriam o
  mesmo id. Guardar um id da partida no `PicturesState` ou corrigir na sala.
- `pendingRecord` ainda é só do ITO: ligar `recordsHistory: true` sem o hook
  genérico (spec §4.2) não grava nada.
- Decidir se a revelação vazia (ninguém montou) entra no histórico.
