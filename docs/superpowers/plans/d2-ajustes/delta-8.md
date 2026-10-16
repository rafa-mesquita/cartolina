# Ajustes da Tarefa 8 (valem por cima do texto da tarefa)

Depois do plano, o usuário pediu (e o protótipo `prototipo/dixit/index.html` já tem, veja `renderPanel`, `clueReady`, `needClue`):
- **Jogar carta é arrastar pro feltro** (Tarefa 7): saem os botões "contei" e "jogar essa(s)".
- **Narrador só joga depois da dica**: escrever a dica OU marcar "vou falar a dica na call".

Como soltar a carta no feltro (componente `Hand`, na mesa) precisa saber se já tem dica, **a dica sai do estado interno do painel e vira controlada pela mesa** (Tarefa 10).

## `ActionPanel` — props novas
```ts
export interface PanelActions {
  confirmVote: () => void;
  next: () => void;
  again: () => void;
  lobby: () => void;
}

interface Props {
  view: DixitRoomView;
  /** Quantas cartas cada um joga (2 com 3 jogadores). */
  need: number;
  /** Suas cartas já soltas na mesa esperando a 2ª (partida de 3). */
  pending: number;
  revealDone: boolean;
  host: boolean;
  name: (id: string) => string;
  /** Dica do narrador (controlada pela mesa). */
  clue: string;
  onClue: (clue: string) => void;
  /** "vou falar a dica na call" marcado. */
  spoken: boolean;
  onSpoken: (spoken: boolean) => void;
  /** Aumenta cada vez que o narrador soltou a carta sem dica: o painel treme e avisa. */
  needClueTick: number;
  actions: PanelActions;
}
```
(sai `sel`; saem `tell` e `submit` de `PanelActions`.)

## Narração (você narra)
```
<h3>você narra</h3>
<p>Pense numa dica pra uma carta da mão (uma palavra, uma frase, um som…). <b>Primeiro a dica</b>: escreva aqui ou marque que vai falar na call. Depois <b>arraste a carta pra mesa</b>.</p>
<div className={`dx-clue-box${shaking ? ' need' : ''}`}>
  <textarea aria-label="sua dica" maxLength={DIXIT_CLUE_MAX} placeholder="sua dica" value={clue} disabled={spoken} onChange={(e) => onClue(e.target.value)} />
  <div className="dx-cnt">{clue.length}/{DIXIT_CLUE_MAX}</div>
  <label className="dx-spoken"><input type="checkbox" checked={spoken} onChange={(e) => onSpoken(e.target.checked)} /> vou falar a dica na call</label>
</div>
{erro}
```
- Quando `needClueTick` aumenta (e a dica ainda não está pronta: `!spoken && clue.trim() === ''`): mostra o erro **"Antes de jogar a carta, escreva a dica ou marque “vou falar na call”."**, liga a classe `need` (tremida; tire depois de ~450 ms com timer limpo no unmount, ou reinicie a animação) e foca o campo se não estiver marcado "vou falar na call". O erro some quando a dica fica pronta.
- Sem botão "contei".

## Escolha (você escolhe e ainda não confirmou)
```
<h3>engane a mesa</h3>
<p>Arraste pra mesa {need === 1 ? 'a carta' : 'as 2 cartas'} da sua mão que mais combina{need === 1 ? '' : 'm'} com a dica.{need > 1 && pending > 0 && <> <b>{pending} de {need}</b> na mesa (clique nela pra desfazer).</>}</p>
```
Sem botão "jogar essa(s)".

## Testes (substituem os dois primeiros do texto)
- Narrador: tem o campo e a caixinha; digitar chama `onClue('luar')`; marcar chama `onSpoken(true)`; com `spoken`, o campo fica `disabled`; com `needClueTick` subindo de 0 pra 1 e sem dica, aparece o erro; não existe botão "contei".
- Escolha: texto "Arraste pra mesa a carta…"; com `need = 2` e `pending = 1`, mostra "1 de 2"; não existe botão "jogar essa".
- Votação: igual ao texto (confirmar sem voto avisa).
- Topo: igual ao texto.

## Nome
Textos que o jogador vê dizem "Diquisti".
