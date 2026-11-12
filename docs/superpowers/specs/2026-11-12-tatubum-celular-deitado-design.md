# Tatubum no celular deitado — design

Pedido do Rafa (2026-11-12): "fui jogar lá e não está bom, o jogo tem que ser na horizontal no mobile, dá uma olhada
como o Magic Arena, Hearthstone, Lorcana etc. funcionam no mobile, e acho importante que tenha uma seta na direita pra
expandir o histórico de acontecimentos".

Decisões dele (2026-11-12):
- só o Tatubum muda agora (o Cúpi e o DITU continuam em pé);
- em pé, o Tatubum pede pra deitar, e não mantém duas mesas de celular;
- layout **B · mão à mostra** do protótipo `prototipo/tatubum-deitado/index.html` (comparado com A · mão escondida,
  como no Hearthstone e no Arena, e C · galera numa coluna na esquerda);
- o jeito de fazer: um terceiro layout da mesa que já existe (`mesa.ts`), e não encolher a mesa do computador nem
  escrever uma mesa nova.

## 1. Quando a mesa fica deitada

- **Layout novo `'land'`** em `web/src/lib/device.ts`, ao lado de `'phone'` e `'desktop'`: tela deitada e baixa,
  `(orientation: landscape) and (max-height: 500px)`. Não olha se é tela de toque: uma janela de computador baixa
  também cai nele, e é assim que dá pra testar no navegador sem emular toque.
- **Cada jogo diz como joga no celular.** `CatalogEntry` ganha `phoneOrientation?: 'portrait' | 'landscape'`, sendo
  `'portrait'` o padrão. O Tatubum fica `'landscape'`; os outros ficam como estão.
- **Aviso de virar** (`RotateNotice`) passa a receber a orientação do jogo da sala:
  - jogo `'portrait'` (DITU, Cúpi): igual a hoje, celular deitado vê "vira o celular em pé 📱";
  - jogo `'landscape'` (Tatubum): celular **em pé** (aparelho de toque, largura até 640 px) vê "vira o celular deitado
    📱↔"; deitado não vê aviso.
  - Na tela de entrar na sala ainda não se sabe o jogo antes de `getRoomInfo`: sem `info`, vale o aviso de hoje.
- O aviso fica por cima, sem desmontar nada (como hoje): a mesa embaixo segue recebendo as visões.
- A sala de espera (`KittensLobby`) também é usada deitada. Ela já é uma página que rola, então só precisa caber na
  altura de 360 a 430 px sem cortar os botões.

## 2. A mesa deitada (`kt-land`)

`KittensTable` passa o layout pra `createMesa` e pra `mesa.setLayout`, como já passa `'phone'`. Em `mesa.ts`,
`MesaLayout` ganha `'land'`, com a classe `kt-land` no palco. O palco tem o tamanho da tela (como no `'phone'`),
com escala 1 até onde couber e encolhendo abaixo de um mínimo (proposta: 740×340).

Da esquerda pra direita e de cima pra baixo (medidas pra um iPhone 14 deitado, 844×390, com o recorte da câmera
num dos lados; respeitar `env(safe-area-inset-*)`):

- **Fileira da galera, em cima:** os adversários na ordem dos assentos, com bichinho, nome, quantas cartas e as marcas
  de hoje (vez, CEGO, PULA ×n, ataque, olho do Mau-olhado, relógio do cego). Com muita gente a fileira rola pro lado
  (mesmo comportamento do `'phone'`: `clampToSeats` e `revealSeat` valem pra `'land'` também).
- **Canto direito de cima:** a faixa da vez ("SUA VEZ · 2 TURNOS", "vez do Beto").
- **Mesa, no meio:** monte (com a contagem; tocar no monte compra), carta no ar com a barrinha do Nem vem!, descarte
  com o olhinho. As espiadas (`#future`) ficam junto do monte, como hoje.
- **Mão, embaixo:** todas as cartas numa fileira só, inteiras, que rola pro lado (carta ~66 px de largura). Toque
  seleciona; tocar e segurar mostra o que a carta faz (o comportamento do `'phone'`). As cartas na frente de você
  (`#front`, Latidor e Feitiço guardados) ficam no começo da fileira, separadas.
- **Coluna da direita:** os botões JOGAR, NEM VEM! e AS CARTAS, um embaixo do outro, perto do polegar. Som fica num
  botão pequeno da coluna.
- **Setinha ◀ na borda direita, no meio da altura:** abre o diário (`#log`) numa gaveta por cima da mesa, encostada
  na direita, com ~300 px de largura; a seta ▶ na borda da gaveta fecha, e tocar fora também. Com a gaveta aberta a
  mesa continua rodando por baixo. Na mesa deitada a última linha (`#lastline`) some, porque a seta substitui ela.
- **Painéis e efeitos:** os painéis de escolha (Favor, Desarme, Peixe, Quati, Onça, Pombo, cinco, Latidor…) e a
  galeria (AS CARTAS, olhinho do descarte) aparecem centrados, com altura máxima da tela e rolagem por dentro. A carta
  grande do meio (BUM!, UFA!, AU AU!) usa `bigAt()` medindo a mesa, como no `'phone'`. Os textos de ajuda usam "toque"
  (`tx()` vale pra `'land'`).

## 3. O que sai e o que fica

- A mesa em pé do Tatubum (`'phone'`) deixa de ser vista no celular (em pé aparece o aviso de virar). O código dela
  **fica** nesta entrega e sai num segundo passo, quando a deitada estiver testada numa noite de jogo.
- O computador não muda.

## 4. Testes

- `web/test/kittens-mesa.test.ts`: layout `'land'` (classe `kt-land`, botões na coluna, seta abre e fecha o diário,
  `#lastline` escondida, "toque" nos textos).
- `web/test` do `device.ts` e do `RotateNotice`: a orientação de cada jogo escolhe o aviso.
- E2E: um jogador de celular deitado (`newPhonePlayer` com viewport 844×390) entra numa sala do Tatubum, compra uma
  carta pelo monte e abre o diário pela seta.
- Conferência no navegador em 844×390 e 740×360, com bots, antes do PR.
