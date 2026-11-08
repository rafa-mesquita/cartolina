# Tatubum: bichos sorteados por partida e 3 bichos novos

Pedido do Rafa, 2026-11-06. Aprovado por ele na conversa. O desenho geral do jogo está em
`2026-10-19-tatubum-design.md`; atualize aquela spec junto com o código.

## Sorteio de bichos

- A pool passa a ter **9 bichos**: Capivara, Mico-leão, Quati, Tamanduá, Preguiça, Tucano, **Peixe-beta** (`peixe`),
  **Onça-pintada** (`onca`) e **Sapo** (`sapo`). Cada um tem 4 cartas por pacote. Desde 2026-11-08 são **10**, com o
  **Pombo-correio** (`pombo`; ver abaixo).
- Cada partida sorteia **6 bichos** da pool (`ctx.rng`), inclusive em "jogar de novo". O **Boto** e o **Tatu Latidor**
  entram sempre. O pacote continua com 58 cartas.
- O estado guarda os bichos da partida em `bichos`, público na visão. Sala salva sem o campo vale pelos 6 bichos
  originais (`compat.ts`).
- Só os bichos da partida valem: "AS CARTAS", o pedido da Preguiça e o bicho dos dois Botos oferecem só esses.
  `parsePlay` recusa pedido ou `as` de bicho fora da partida (`bad_ask`, `bad_as`).

## Peixe-beta (par)

- Quem joga vê as **3 de cima** (escolha nova, 30 s) e decide o destino da **segunda**: fica com ela, deixa onde está ou
  manda pro fundo.
- As 3 entram na espiada de quem jogou, como no Espiar. A carta que sai do lugar atualiza as espiadas (`unpeek`), e
  mandar pro fundo segue a mesma regra do par de Quati.
- Ficar com ela **não é compra**: a vez continua, o cego segue cego e nenhum turno é gasto.
- Se ela for Tatubum e ele ficar com ela: Desarme ou explode, como no Feitiço, e o Desarme gasta o turno como sempre.
- Sem resposta em 30 s, a carta fica onde está. Monte com menos de 2 cartas: mostra o que tem e não há o que decidir, a
  jogada só atualiza a espiada.

## Onça-pintada (par)

- Quem joga vê a **carta do topo e a do fundo** e pega **uma carta do descarte**, de qualquer tipo menos Desarme.
- Vale o descarte de **antes da jogada** (sem as cartas do próprio par), como nos 4 bichos diferentes.
- O topo entra na espiada de quem jogou. A carta do fundo só aparece no painel da escolha.
- Sem opção no descarte: ele só vê as cartas e fecha. Sem resposta em 30 s, a carta é sorteada entre as opções.
- A pegada é pública, como nos 4 bichos diferentes. As cartas vistas só ele vê.

## Pombo-correio (par; pedido do Rafa, 2026-11-08)

- Até **5 cartas** (`KITTENS_POMBO_CARDS`) sorteadas do descarte de **antes da jogada** (sem as cartas do próprio par,
  como na Onça) voltam pro monte. Menos de 5 no descarte: vão todas. Descarte vazio: nada acontece.
- Uma delas, sorteada, vai pro **topo**; as outras entram em posições sorteadas do monte. O resto do monte mantém a
  ordem entre si.
- Ninguém sabe qual foi pro topo, nem quem jogou. O evento `mailed` é público e traz só os **tipos** das cartas, em ordem
  alfabética (o descarte já era público; o id de carta que está no monte não aparece pra ninguém).
- O monte mudou de ordem: as espiadas de todos somem, como no Embaralhar (com o descarte vazio, ficam). A vez continua,
  sem gastar turno. Aceita Nem vem!. Conta como bicho no trio, nos 4 bichos diferentes, no Boto e na Preguiça.
- Mesa: as cartas voam do descarte pro monte, virando de costas. Bots: jogam o par quando há descarte.

## Sapo (par, só como resposta)

- O par é **2 Sapos, Sapo + Boto ou 2 Botos**. Fora disso o Sapo não faz nada sozinho.
- **Na própria vez, o par de Sapo é recusado** (erro novo). Sapo continua contando como bicho no trio e nos 4 bichos
  diferentes, e a Preguiça pode pedi-lo.
- Só o **alvo** de uma magia no ar pode usar, dentro da janela de 5 s, com o botão **SAPO!**, parecido com o do Nem vem!.
- Magias que ele reflete: **Favor, Mau-olhado, par de Tucano e par de Latidores**. O **trio de Favor** continua imparável
  e o Sapo não o reflete.
- Refletir: o par vai pro descarte, quem mandou e o alvo trocam de lugar, e a janela recomeça com 5 s. O novo alvo pode
  refletir de volta com outro par, e qualquer um pode dar Nem vem!.
- Nem vem! que já estava na jogada: a contagem zera ao refletir. O Nem vem! depois do Sapo decide se a magia refletida vale.
- Efeito refletido:
  - **Favor:** quem mandou dá a carta pra quem refletiu. Sem carta na mão, a jogada não vale.
  - **Mau-olhado:** quem mandou fica cego.
  - **Par de Latidores:** quem mandou joga um Desarme ou explode.
  - **Par de Tucano:** a vez de quem jogou acaba do mesmo jeito, e a próxima vez dele é pulada. O alvo original não
    perde nada. Se a jogada voltar pro alvo original com outro Sapo, volta a valer o efeito normal.
- A vez não muda de dono ao refletir: `pending.by` continua sendo quem está na vez, e um campo novo guarda quem manda a
  magia agora.
- **Cego não usa Sapo**, nem por ficha. **O botão não aparece no Tucano do 1x1**, em que ninguém é pulado.
- A carta que Nem vem! anula e o par de Sapo vão pro descarte junto com a jogada. O Latidor de um par refletido vai pro
  descarte como sempre.

## Mesa

- Painéis do Peixe-beta e da Onça no estilo do Quati e do Feitiço.
- Botão **SAPO!** ao lado do Nem vem!, só pro alvo que tem o par. Sem contagem própria: usa a barra da janela.
- Animação do reflexo: a magia volta pra quem mandou, com o Sapo aparecendo no alvo. Diário: "Fulano refletiu com o SAPO!".
- Textos de ajuda só dizem o que a carta faz, sem dica de estratégia.
- Quando o dono da vez mudar de alvo, as legendas devem nomear quem manda e quem recebe.

## Artes

- As artes vêm do Google Flow, com **duas opções por bicho** pro Rafa escolher (Sapo segurando um espelho). Prompts em
  `docs/kittens/cartas-prompts.md`.

## Bots

- Jogam os pares novos: Peixe-beta e Onça como os outros bichos; Sapo só como resposta, com chance parecida com a do Nem vem!.
  Pombo-correio e Onça só com descarte.

## Testes

- Regras no `shared` (arquivo novo por bicho), simulação (`kittens-fuzz`) cobrindo o sorteio e os 3 bichos, mesa e bots no `web`.
