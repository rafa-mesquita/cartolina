import { DIXIT_CLUE_MAX, type DixitRoomView } from '@cartolina/shared';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { captionText, summaryParts } from './reveal';

/** Ações do painel. Jogar a carta é arrastar pro feltro (na mesa), então não tem botão aqui. */
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
  /** Dica do narrador (controlada pela mesa: soltar a carta precisa saber se ela existe). */
  clue: string;
  onClue: (clue: string) => void;
  /** "vou falar a dica na call" marcado. */
  spoken: boolean;
  onSpoken: (spoken: boolean) => void;
  /** Sobe cada vez que o narrador soltou a carta sem dica: o painel treme e avisa. */
  needClueTick: number;
  actions: PanelActions;
}

const SHAKE_MS = 450;
const NEED_CLUE_MSG = 'Antes de jogar a carta, escreva a dica ou marque “vou falar na call”.';

/** Canto inferior direito: o que fazer agora. */
export function ActionPanel({ view, need, pending, revealDone, host, name, clue, onClue, spoken, onSpoken, needClueTick, actions }: Props) {
  const g = view.game, me = view.you;
  const errId = useId();
  /** Tentou confirmar o voto sem ter votado. */
  const [tried, setTried] = useState(false);
  /** Soltou a carta sem dica (zera quando a dica fica pronta ou a fase muda). */
  const [warned, setWarned] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const shakeTimer = useRef<number | undefined>(undefined);
  const lastTick = useRef(needClueTick);
  const wasSpoken = useRef(spoken);
  const clueReady = spoken || clue.trim() !== '';

  useEffect(() => {
    setTried(false);
    setWarned(false);
  }, [g.phase]);

  // Dica pronta: o aviso some de vez (só volta com um novo tique).
  useEffect(() => {
    if (clueReady) setWarned(false);
  }, [clueReady]);

  // Soltou a carta sem dica: avisa, treme a caixa (reinicia a animação) e foca o campo.
  useEffect(() => {
    if (needClueTick === lastTick.current) return;
    lastTick.current = needClueTick;
    if (clueReady) return;
    setWarned(true);
    const box = boxRef.current;
    if (box) {
      box.classList.remove('need');
      void box.offsetWidth; // força o recálculo pra animação recomeçar
      box.classList.add('need');
      window.clearTimeout(shakeTimer.current);
      shakeTimer.current = window.setTimeout(() => box.classList.remove('need'), SHAKE_MS);
    }
    fieldRef.current?.focus();
  }, [needClueTick, clueReady]);

  // Desmarcou "vou falar na call" e ainda não tem dica: vai pro campo.
  useEffect(() => {
    const was = wasSpoken.current;
    wasSpoken.current = spoken;
    if (was && !spoken && !clueReady) fieldRef.current?.focus();
  }, [spoken, clueReady]);

  useEffect(() => () => window.clearTimeout(shakeTimer.current), []);

  const teller = g.storyteller;
  const iAmTeller = me !== null && teller === me;
  const confirmed = me !== null && g.confirmed.includes(me);
  const others = g.inRound.filter((p) => p !== teller);
  const done = others.filter((p) => g.confirmed.includes(p)).length;
  const playing = me !== null && g.inRound.includes(me);
  const over = Object.values(g.scores).some((s) => s >= g.target);
  const clueWarn = warned && !clueReady;
  const voteWarn = tried && !g.myVote;
  /** Contêiner fixo (só o texto muda) pro leitor de tela anunciar o aviso. */
  const alertBox = (text: string) => (
    <div className="dx-err" role="alert" id={errId}>
      {text}
    </div>
  );

  let body: ReactNode;
  if (g.paused) {
    body = (
      <>
        <h3>esperando gente</h3>
        <p>Precisa de 3 pessoas na mesa pra continuar.</p>
        {host && (
          <button className="dx-btn ghost" type="button" onClick={actions.lobby}>
            voltar pro lobby
          </button>
        )}
      </>
    );
  } else if (!playing && (g.phase === 'storytelling' || g.phase === 'submitting' || g.phase === 'voting')) {
    body = (
      <>
        <h3>assistindo</h3>
        <p>Você entra na próxima rodada.</p>
      </>
    );
  } else if (g.phase === 'storytelling') {
    body = iAmTeller ? (
      <>
        <h3>você narra</h3>
        <p>
          Pense numa dica pra uma carta da mão (uma palavra, uma frase, um som…). <b>Primeiro a dica</b>: escreva aqui ou marque que vai falar na call. Depois{' '}
          <b>arraste a carta pra mesa</b>.
        </p>
        <div className="dx-clue-box" ref={boxRef}>
          <textarea
            ref={fieldRef}
            aria-label="sua dica"
            maxLength={DIXIT_CLUE_MAX}
            placeholder="sua dica"
            value={clue}
            disabled={spoken}
            aria-describedby={errId}
            aria-invalid={clueWarn}
            onChange={(e) => onClue(e.target.value)}
          />
          <div className="dx-cnt">
            {clue.length}/{DIXIT_CLUE_MAX}
          </div>
          <label className="dx-spoken">
            <input type="checkbox" checked={spoken} onChange={(e) => onSpoken(e.target.checked)} /> vou falar a dica na call
          </label>
        </div>
        {alertBox(clueWarn ? NEED_CLUE_MSG : '')}
      </>
    ) : (
      <>
        <h3>{teller ? `${name(teller)} narra` : 'narração'}</h3>
        <p>Esperando a carta e a dica…</p>
      </>
    );
  } else if (g.phase === 'submitting') {
    body = iAmTeller ? (
      <>
        <h3>dica dada ✓</h3>
        <p>Os outros estão escolhendo cartas que combinem com a sua dica ({done}/{others.length}).</p>
      </>
    ) : confirmed ? (
      <>
        <h3>pronto ✓</h3>
        <p>Sua carta está na mesa, virada. Esperando os outros ({done}/{others.length}).</p>
      </>
    ) : (
      <>
        <h3>engane a mesa</h3>
        <p>
          Arraste pra mesa {need === 1 ? 'a carta' : 'as 2 cartas'} da sua mão que mais combina{need === 1 ? '' : 'm'} com a dica.
          {need > 1 && pending > 0 && (
            <>
              {' '}
              <b>
                {pending} de {need}
              </b>{' '}
              na mesa (clique nela pra desfazer).
            </>
          )}
        </p>
      </>
    );
  } else if (g.phase === 'voting') {
    body = iAmTeller ? (
      <>
        <h3>votação</h3>
        <p>Todos estão tentando achar a sua carta ({done}/{others.length} votaram).</p>
      </>
    ) : confirmed ? (
      <>
        <h3>votou ✓</h3>
        <p>Esperando os outros ({done}/{others.length}).</p>
      </>
    ) : (
      <>
        <h3>qual é a do narrador?</h3>
        <p>Clique na carta que você acha que é de {teller ? name(teller) : 'quem narrou'}. Dá pra trocar até confirmar.</p>
        <button
          className="dx-btn"
          type="button"
          onClick={() => {
            if (!g.myVote) return setTried(true);
            actions.confirmVote();
          }}
        >
          confirmar voto
        </button>
        {alertBox(voteWarn ? 'Clique numa carta da mesa primeiro.' : '')}
      </>
    );
  } else if (g.phase === 'reveal') {
    const r = g.result;
    body = !revealDone || !r ? (
      <>
        <h3>revelando…</h3>
        <p>Quem votou em quê e de quem é cada carta.</p>
      </>
    ) : (
      <>
        <h3>{captionText(summaryParts(r, name))}</h3>
        <p>{me && r.gained[me] ? `você fez +${r.gained[me]}.` : 'você não pontuou nessa.'}</p>
        {host ? (
          <button className="dx-btn" type="button" onClick={actions.next}>
            {over ? 'ver quem venceu' : 'próxima rodada'}
          </button>
        ) : (
          <p>esperando o host…</p>
        )}
      </>
    );
  } else if (g.phase === 'gameover') {
    const w = g.winners;
    body = (
      <>
        <h3>fim de jogo!</h3>
        <p>
          {w.map(name).join(' e ')} {w.length > 1 ? 'venceram' : 'venceu'} com {g.scores[w[0] ?? ''] ?? 0} pontos.
        </p>
        {host ? (
          <>
            <button className="dx-btn" type="button" onClick={actions.again}>
              jogar de novo
            </button>
            <button className="dx-btn ghost" type="button" onClick={actions.lobby}>
              voltar pro lobby
            </button>
          </>
        ) : (
          <p>esperando o host…</p>
        )}
      </>
    );
  }
  return (
    <section className="dx-panel" aria-label="sua vez">
      {body}
    </section>
  );
}
