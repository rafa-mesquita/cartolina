import type { PicturesRoomView } from '@cartolina/shared';
import { useEffect, useRef } from 'react';
import { playPicturesSound } from './sounds';

type Game = PicturesRoomView['game'];

/**
 * Sons que vêm só da mudança da visão (valem pra qualquer pessoa da mesa, não só pra quem agiu):
 * - `ready` quando `ready` ou `confirmed` crescem (alguém ficou pronto ou confirmou os palpites; desfazer não toca);
 * - `round` quando a montagem de uma rodada começa (inclui a primeira, ao abrir a mesa na rodada 0; reabrir a mesa
 *   no meio de uma rodada fica quieto).
 */
export function useTableSounds(g: Game): void {
  const phase = useRef<Game['phase'] | null>(null);
  const round = useRef(g.round);
  const done = useRef(g.ready.length + g.confirmed.length);
  const total = g.ready.length + g.confirmed.length;

  useEffect(() => {
    const prevPhase = phase.current;
    const prevRound = round.current;
    const prevDone = done.current;
    phase.current = g.phase;
    round.current = g.round;
    done.current = total;
    if (g.phase === 'building' && (prevPhase === null ? g.round === 0 : prevPhase !== 'building' || prevRound !== g.round)) {
      playPicturesSound('round');
      return;
    }
    // Mesmo fase e rodada: só conta crescimento (na troca de fase os dois zeram).
    if (prevPhase === g.phase && prevRound === g.round && total > prevDone) playPicturesSound('ready');
  }, [g.phase, g.round, total]);
}
