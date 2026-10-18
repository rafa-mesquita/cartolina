# Plano 5 — jogar pelo celular (design)

Data: 2026-10-17. Hoje o celular mostra "abre no computador" nas salas
(`web/src/lib/device.ts`: `(hover: none) and (pointer: coarse)`). O Plano 5 faz
o **DITU** (id `ito`) e o **Diquisti** (id `dixit`) jogáveis no celular **em pé**,
pensando primeiro no celular. O **Pictures** fica para depois e continua com o
aviso.

## 0. Decisões (usuário, 2026-10-17)

- **Orientação:** só em pé (retrato).
  - Com o celular deitado e a tela baixa, aparece o aviso "vira o celular em pé".
  - Tablet e computador seguem com o layout atual, que já aceita toque.
- **DITU — fila em pé:** o 1 fica no topo e o 100 embaixo, com a mesa plana; a
  inclinação 3D fica só no computador. Cada carta vira uma faixa larga com a
  dica inteira.
- **DITU — mesa do celular separada (abordagem A):**
  - Os componentes React novos usam as mesmas regras e as mesmas ações do
    servidor (`place`, `move`, `clue`, `ready`, …).
  - O motor da mesa do computador (`web/src/table/engine.ts`) não é alterado.
- **Diquisti:**
  - A mão vira uma faixa que desliza.
  - O voto fica numa grade de 2 colunas.
  - A carta grande ocupa a tela toda, desliza para o lado e tem o botão
    "jogar esta" ou "votar nesta".
  - O placar vira uma linha de bichinhos; o tabuleiro completo abre no botão
    "ver placar".
  - **Tocar e confirmar, e arrastar também funciona.**
- **Ordem:** duas etapas, com um PR cada.
  1. Base + DITU.
  2. Diquisti, combinado com a sessão do Dixit, que está fazendo o histórico do
     Diquisti, para as duas não mexerem nos mesmos arquivos da mesa ao mesmo
     tempo.

## 1. Base comum (`web/`)

### 1.1 Modo celular

- `web/src/lib/device.ts` ganha `useLayout(): 'phone' | 'desktop'`.
  - É `'phone'` quando a tela está em pé e estreita: `(max-width: 640px)`.
  - Mede a largura, não o tipo de aparelho, e acompanha mudanças, por exemplo
    janela redimensionada ou celular girado.
  - O teste usa `matchMedia` falso, como hoje.
- **Celular deitado:**
  - Detecção: `(pointer: coarse) and (orientation: landscape) and (max-height: 500px)`.
  - Mostra por cima da sala um aviso "vira o celular em pé 📱". Não desconecta
    nem desmonta a mesa.
- O `PHONE_QUERY`/`useIsPhone` atual continua só para o aviso de jogos que
  ainda não funcionam no celular (ver 1.2).

### 1.2 Catálogo diz quem funciona no celular

- `CatalogEntry` ganha `mobile: boolean`: DITU `true`, Diquisti `true` (depois
  da etapa 2; até lá, `false`).
- Os jogos que vierem depois, como o Pictures, começam com `mobile: false`.
- **Aparelho de toque com jogo `mobile: false`:** a página do jogo mostra o
  aviso (`PHONE_TEXT`) no lugar de "criar sala". A rota da sala mostra o
  `PhoneNotice` quando o jogo da sala não é `mobile`; o jogo vem de
  `GET /rooms/:code`, que já devolve `game`.
- **Aparelho de toque com jogo `mobile: true`:** a página mostra "criar sala" e
  "entrar com código", como no computador.
- **Estante:** a linha "tem um código?" volta a aparecer no celular, e a sala
  decide.

### 1.3 Telas compartilhadas no celular

- **Entrar na sala** (`JoinForm`): campo de nome e grade de personagens com
  alvos de pelo menos 44px; o botão "entrar" fica visível com o teclado aberto.
- **Lobby** (DITU e Diquisti): painéis em coluna única, largura total, sem
  rolagem lateral. Os botões de modo e de meta são grandes o bastante para o
  dedo.
- **Estante e página do jogo:** as cartas da estante encolhem para caber duas
  lado a lado em 360px. As abas e os painéis ocupam a largura toda.
- Nenhuma tela com rolagem lateral em 360px.

## 2. DITU no celular (etapa 1)

Componentes novos em `web/src/table/phone/`. Quando `useLayout() === 'phone'`,
`Game.tsx` usa a `PhoneTable` no lugar da `Table` do computador.

- **Topo:**
  - Uma linha com as pílulas sala, modo e vidas/nível na campanha.
  - Abaixo, uma faixa de bichinhos dos jogadores com o status de cada um
    (escrevendo, arrastando, pronto ✓, desconectado), na ordem dos assentos.
- **Tema:** cartão compacto com o título e os extremos ("1 = …", "100 = …").
  Na fase de tema, o painel do host (sortear, escrever, dar as cartas) aparece
  no lugar da fila.
- **Fila em pé (`PhoneRow`):**
  - Lista vertical na ordem do servidor: o 1 em cima, o 100 embaixo.
  - Cada carta é uma faixa com o bichinho do dono e a dica, ou "…" se não
    tiver dica.
  - A carta de quem está vendo tem destaque. Uma carta carregada por outra
    pessoa fica translúcida.
  - Rola quando não cabe.
- **Mão (`PhoneHand`):** barra fixa embaixo com as cartas da pessoa (o número
  grande) e o botão "tô pronto". Com várias cartas (campanha), a barra desliza
  para o lado. As cartas já na fila aparecem esmaecidas com "tá na fila ↑".
- **Dica:** tocar numa carta da mão abre um painel de baixo para cima
  (`ClueSheet`) com um campo grande e o botão "ok".
  - Valem as regras de hoje: a dica só muda com a carta na mão, e o envio tem
    debounce.
  - Uma dica pendente é enviada antes de a carta ir para a fila (a mesma
    correção do computador).
- **Colocar e mover cartas (os dois jeitos):**
  - **Tocar:**
    - Tocar numa carta da mão ou da fila a seleciona.
    - Os espaços entre as faixas, e as pontas, viram botões "aqui".
    - Tocar num "aqui" envia `place` (carta da mão) ou `move` (carta da fila).
    - Tocar na carta selecionada de novo, ou fora, cancela.
  - **Arrastar:**
    - Segurar a carta e arrastar faz aparecer o espaço onde ela vai cair.
    - Perto das bordas a fila rola sozinha.
    - Soltar fora da fila devolve a carta (se for da mão) ou a mantém no lugar.
    - Os gestos usam pointer events, com `touch-action` para não brigar com a
      rolagem.
  - **Permissões:** as regras de quem pode o quê não mudam. Qualquer
    participante move uma carta da fila; só o dono coloca da mão, tira da fila
    ou muda a dica. O que não é permitido simplesmente não fica selecionável.
- **Celular e computador na mesma sala:**
  - **O que o celular envia:** ao arrastar, o mesmo `fx.cursor` de hoje. Nele,
    `drag.index` é a posição na fila em ordem do servidor, e `x`/`y` são a
    posição equivalente na fila deitada. Assim quem está no PC vê o cursor e o
    espaço no lugar certo.
  - **O que o celular recebe:** não mostra cursores de outras pessoas.
    Quando alguém arrasta, a faixa da carta fica translúcida e o espaço abre na
    posição recebida.
- **Revelação:** as faixas viram uma a uma, em ordem, mostrando o número, com
  ✕ nas fora de ordem e os mesmos sons do computador. O resultado usa o mesmo
  `ResultBanner`, em tela cheia, com o "ver a mesa".
- **Ritmo de rede:** o mesmo do Plano 4 (12/s, 20/s arrastando). No celular, o
  cursor só sai durante o arrasto, porque não existe mouse passando.

## 3. Diquisti no celular (etapa 2)

Quando `useLayout() === 'phone'`, as peças de `web/src/games/dixit/` ganham o
layout em pé (CSS e variações dos componentes). Nada muda no computador.

- **Topo:**
  - A pílula de fase e meta e a sala.
  - Abaixo, uma linha de bichinhos com os pontos.
  - O botão "ver placar" abre o tabuleiro de peões (`RoundBoard`) por cima.
- **Mão:**
  - Uma faixa horizontal que desliza.
  - Tocar seleciona a carta; tocar de novo, ou o botão de lupa, abre a carta
    grande.
  - Arrastar da faixa para o feltro joga a carta, como no computador.
- **Narrador:** o campo da história (ou "falei na call") fica acima da faixa, e
  o botão "contar com esta carta" fica embaixo.
- **Escolha dos outros:** o botão "jogar esta" no lugar de "contar".
- **Voto:**
  - As cartas da mesa ficam numa grade de 2 colunas, com o numeral romano, e a
    grade rola.
  - Tocar marca a carta; o botão "votar na III" confirma.
  - A própria carta não pode ser votada, como hoje.
- **Carta grande (`CardViewer`):**
  - Ocupa a tela toda e desliza para o lado entre as cartas da mão ou da mesa.
  - Tem o botão de ação da fase ("jogar esta" ou "votar nesta") e "✕ fechar".
- **Revelação narrada:** em tela cheia, passo a passo, como no computador.
- **Feltro:** sem inclinação no celular. As cartas soltas e a arrumação viram a
  grade da votação.

## 4. Testes

- **Unitários:**
  - Mapeamento da fila em pé: o índice da faixa e do espaço, de e para a ordem
    do servidor, e a posição equivalente na fila deitada para o `fx.cursor`.
  - Seleção por toque e os alvos "aqui".
  - Regras de permissão na seleção.
  - `useLayout` com `matchMedia` falso.
  - Catálogo `mobile`.
- **Componentes** (Testing Library), no layout de celular:
  - `PhoneTable` montada em cada fase (tema, escolha, revelação).
  - `ClueSheet`.
  - A barra da mão com várias cartas.
  - O aviso de celular deitado.
  - Diquisti: faixa da mão, grade de voto, carta grande com ação, "ver placar".
- **E2E (Playwright):** um contexto de celular (emulação de aparelho com toque,
  em pé) e um de computador jogam juntos:
  - uma rodada livre de DITU, em que o celular coloca a carta por toque e
    escreve a dica no painel;
  - na etapa 2, uma rodada de Diquisti, em que o celular joga e vota por toque.
- **Manual:** antes de publicar cada etapa, o usuário testa no próprio celular
  pelo site no ar.

## 5. Fora de escopo

- Pictures no celular.
- Celular deitado, além do aviso.
- Layout próprio para tablet, que usa o do computador.
- Manual de marca (Plano 6).
- Trocar a mesa 3D do computador.
