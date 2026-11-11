import type { MandacaruLogEntry, MandacaruPhase, MandacaruRoomView, MandacaruView } from '@cartolina/shared';
import { useEffect, useRef } from 'react';
import type { ConnStatus } from '../../net/connection';
import { freshEntries } from './Diary';
import { playMandacaruSound, type MandacaruSound } from './sounds';

/** Espaço entre sons que saem da mesma mudança (o mesmo do protótipo). */
const GAP_MS = 160;

interface Seen {
  match: number;
  log: MandacaruLogEntry[];
  /** Estradas + casas (1) + vilas (2): sobe com qualquer construção. */
  built: number;
  /** Cartas na sua mão (recursos + cordéis); `null` = quem assiste, ou sem base. */
  hand: number | null;
  carcara: number;
  myTurn: boolean;
  over: boolean;
}

function seenOf(g: MandacaruView, you: string | null): Seen {
  let built = 0;
  for (const r of g.roads) if (r !== null) built++;
  for (const b of g.buildings) if (b) built += b.kind === 'city' ? 2 : 1;
  const hand = g.myRes ? Object.values(g.myRes).reduce((a, b) => a + b, 0) + g.myCordeis.length : null;
  const playing = you !== null && g.players.includes(you);
  return {
    match: g.match,
    log: g.log,
    built,
    hand,
    carcara: g.carcara,
    myTurn: playing && g.turn === you && g.phase !== 'over' && g.phase !== 'lobby',
    over: g.phase === 'over',
  };
}

/**
 * Sons pelo que mudou na mesa do Mandacaru (porte do `changed()` do protótipo), no molde do `useCoupSounds`.
 *
 * Uso (a `MandacaruTable` chama uma vez): `useMandacaruSounds(view, status, fromPhase)`. Compara cada visão nova com a anterior e
 * toca, espaçando 160 ms os sons que saem juntos, nesta ordem:
 * - `dice`: linha nova de dados no diário;
 * - `build`: estrada, casa ou vila nova (de qualquer um);
 * - `card`: a sua mão ganhou carta (recurso ou cordel);
 * - `carcara`: o Carcará mudou de terreno;
 * - `win`: a partida acabou;
 * - `turn`: a vez passou a ser sua.
 *
 * Quem assiste não ouve `card` nem `turn`. Nada toca na primeira visão (só vira a base), nem na primeira visão depois
 * de uma reconexão (o que aconteceu na queda não toca atrasado). Partida nova (`match` mudou) também só vira base,
 * fora o `turn` se a primeira vez for sua. A exceção da primeira visão: vindo do lobby (`fromPhase === 'lobby'`, a mesa
 * monta já na primeira visão da partida), toca `turn` se a vez já é sua.
 */
export function useMandacaruSounds(view: MandacaruRoomView, status: ConnStatus, fromPhase?: MandacaruPhase): void {
  const seen = useRef<Seen | null>(null);
  // só a fase de quando a mesa montou importa
  const from = useRef(fromPhase);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const { game, you } = view;

  // saiu de 'reconnecting': a próxima visão é só a base
  const lastStatus = useRef(status);
  const rebase = useRef(false);
  useEffect(() => {
    if (lastStatus.current === 'reconnecting' && status !== 'reconnecting') rebase.current = true;
    lastStatus.current = status;
  }, [status]);

  useEffect(() => {
    const now = seenOf(game, you);
    const prev = seen.current;
    seen.current = now;
    if (prev === null) {
      if (from.current === 'lobby' && now.myTurn) playMandacaruSound('turn');
      return;
    }
    if (rebase.current) {
      rebase.current = false;
      return;
    }
    const before: Seen = prev.match === game.match ? prev : { ...now, myTurn: false };
    const names: MandacaruSound[] = [];
    if (freshEntries(before.log, game.log).some((e) => e.t === 'roll')) names.push('dice');
    if (now.built > before.built) names.push('build');
    if (now.hand !== null && before.hand !== null && now.hand > before.hand) names.push('card');
    if (now.carcara !== before.carcara) names.push('carcara');
    if (now.over && !before.over) names.push('win');
    if (now.myTurn && !before.myTurn) names.push('turn');

    names.forEach((name, i) => {
      if (i === 0) {
        playMandacaruSound(name);
        return;
      }
      const id = setTimeout(() => {
        timers.current = timers.current.filter((t) => t !== id);
        playMandacaruSound(name);
      }, i * GAP_MS);
      timers.current.push(id);
    });
  }, [game, you]);

  // desmontar cancela os sons que ainda esperavam na fila
  useEffect(
    () => () => {
      for (const id of timers.current) clearTimeout(id);
      timers.current = [];
    },
    [],
  );
}
