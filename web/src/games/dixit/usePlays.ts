import { dixitPicksPerPlayer, type DixitRoomView } from '@cartolina/shared';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { JOIN_ERRORS, type ConnStatus, type GameConn } from '../../net/connection';

export type Point = { x: number; y: number };

/** Códigos de recusa que só a jogada de carta da escolha recebe (rede de segurança quando o contador se perde). */
const PLAY_ERRORS: ReadonlySet<string> = new Set(['unknown_card', 'wrong_count', 'nothing_chosen', 'already_confirmed', 'not_player', 'is_storyteller', 'paused']);

interface Options {
  view: DixitRoomView;
  conn: GameConn;
  status: ConnStatus;
  /** Ação recusada que vale avisar (o eco de uma recusa já avisada não chega aqui). */
  onError: (message: string) => void;
}

export interface Plays {
  /**
   * Suas cartas já soltas no feltro na escolha: as que esperam a 2ª (partida de 3) e as já mandadas que
   * esperam o servidor. O narrador não usa: a carta dele fica na mão até o servidor responder.
   */
  pending: string[];
  /** As pendentes já foram mandadas (`submit` + `confirm`): não dá mais pra devolver. */
  sent: boolean;
  /** Onde você soltou cada carta (ponto da tela), pelo id da carta: o feltro põe a carta ali. */
  dropPoints: Record<string, Point>;
  /** É a sua vez de narrar (sem pausa). */
  telling: boolean;
  /** Pode soltar uma carta agora. */
  canPlay: boolean;
  /** Cartas que saíram da mão (pendentes e as confirmadas). */
  away: string[];
  /** Soltou `id` no feltro (`at` = ponto da tela; null pelo teclado). `clue` = a dica do narrador ('' = falada na call). */
  play: (id: string, at: Point | null, clue: string) => void;
  /** Devolve uma pendente (ainda não mandada) pra mão. */
  unpend: (id: string) => void;
}

/**
 * A máquina de jogadas da mesa: pendentes, pontos de soltura e o que está em voo. Zera na troca de fase ou
 * de narrador e ao reconectar (o servidor é a verdade). Recusa da jogada devolve as cartas pra mão.
 */
export function usePlays({ view, conn, status, onError }: Options): Plays {
  const g = view.game, me = view.you;
  const [pending, setPending] = useState<string[]>([]);
  const [sent, setSent] = useState(false);
  const [dropPoints, setDropPoints] = useState<Record<string, Point>>({});
  /** O `tell` foi mandado e o servidor ainda não respondeu: não manda outro. */
  const [tellSent, setTellSent] = useState(false);
  /** Ações da jogada de carta (`submit` + `confirm`) que ainda podem voltar recusadas. */
  const inFlight = useRef(0);
  /** A jogada em voo já foi devolvida por uma recusa: o `nothing_chosen` do `confirm` que vem atrás é eco. */
  const returned = useRef(false);
  const sentRef = useRef(sent);
  const onErrorRef = useRef(onError);
  useLayoutEffect(() => {
    sentRef.current = sent;
    onErrorRef.current = onError;
  });

  const confirmed = me !== null && g.confirmed.includes(me);
  // Fase ou narrador novos: zera o que era da fase (no próprio render, sem efeito e sem render a mais pintado).
  // Os pontos de soltura valem até a rodada acabar: o feltro ainda lê o do narrador quando a fase vira escolha.
  const phaseKey = `${g.phase}|${g.storyteller ?? ''}`;
  const [seenKey, setSeenKey] = useState(phaseKey);
  if (seenKey !== phaseKey) {
    setSeenKey(phaseKey);
    setPending([]);
    setSent(false);
    setTellSent(false);
    if (g.phase === 'storytelling' || g.phase === 'lobby') setDropPoints({});
  }
  // Reconectou: o que estava indo pra mesa pode ter se perdido (o socket fechado descarta o envio).
  const [seenStatus, setSeenStatus] = useState(status);
  if (seenStatus !== status) {
    setSeenStatus(status);
    if (status === 'joined') {
      setPending([]);
      setSent(false);
      setTellSent(false);
    }
  }
  // Nada mais da jogada pode voltar recusado: outra fase, reconexão, ou o servidor já confirmou.
  const joined = status === 'joined';
  useLayoutEffect(() => {
    inFlight.current = 0;
    returned.current = false;
  }, [phaseKey, joined, confirmed]);

  useEffect(
    () =>
      conn.onError((code, message) => {
        if (JOIN_ERRORS.has(code)) return;
        setTellSent(false);
        const ofPlay = inFlight.current > 0;
        if (ofPlay) inFlight.current--;
        if (ofPlay && returned.current && code === 'nothing_chosen') return;
        if (ofPlay || (sentRef.current && PLAY_ERRORS.has(code))) {
          returned.current = true;
          setPending([]);
          setSent(false);
        }
        onErrorRef.current(message);
      }),
    [conn],
  );

  const playing = me !== null && g.inRound.includes(me);
  const iAmTeller = me !== null && g.storyteller === me;
  const need = dixitPicksPerPlayer(g.inRound.length);
  const telling = !g.paused && playing && g.phase === 'storytelling' && iAmTeller;
  const canPlay = telling ? !tellSent : !g.paused && playing && g.phase === 'submitting' && !iAmTeller && !confirmed && pending.length < need;
  const away = [...new Set([...pending, ...(confirmed ? g.myPicks : [])])];

  // O ponto e a pendente mudam no mesmo evento (o feltro lê os dois quando a carta aparece).
  function play(id: string, at: Point | null, clue: string) {
    if (!canPlay || pending.includes(id)) return;
    if (at) setDropPoints((d) => ({ ...d, [id]: at }));
    if (telling) {
      // A carta fica na mão até o servidor responder: se o envio se perder, dá pra jogar de novo depois.
      setTellSent(true);
      conn.sendAction({ type: 'tell', cardId: id, clue });
      return;
    }
    const next = [...pending, id];
    setPending(next);
    inFlight.current = 0;
    returned.current = false;
    if (next.length === need) {
      setSent(true);
      // O rastreio vem antes do envio: a recusa pode chegar a qualquer momento depois dele.
      inFlight.current = 2;
      conn.sendAction({ type: 'submit', cardIds: next });
      conn.sendAction({ type: 'confirm' });
    }
  }

  function unpend(id: string) {
    if (sent) return;
    setPending((p) => p.filter((c) => c !== id));
    setDropPoints(({ [id]: _, ...rest }) => rest);
  }

  return { pending, sent, dropPoints, telling, canPlay, away, play, unpend };
}
