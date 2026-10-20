import { useEffect, useRef } from 'react';
import type { CoupRoomView } from '@cartolina/shared';
import { playCoupSound, type CoupSound } from './sounds';

/**
 * Sons pelo que mudou na mesa do Cúpi (porte de "sons pelo que mudou" do protótipo).
 *
 * Uso (a `CoupTable` chama uma vez):
 *
 *     const clock = useWindowClock(view.game.window?.endsAt ?? null, snap.serverOffset);
 *     useCoupSounds(view, clock);
 *
 * `view` é a visão da sala (de lá sai quem é você: `view.you`; quem assiste ouve só `declare`, `challenge`/`reveal`/`bluff`,
 * `end` e o tique) e `clock` é o relógio da janela (`useWindowClock`, `null` sem janela). O hook não devolve nada.
 *
 * Compara cada visão nova com a anterior (guardada em refs) e toca, espaçando 260 ms os sons que saem juntos:
 * - `declare`: entrada nova `act` ou `block` de outro jogador (a sua você já ouve no clique);
 * - `challenge` + `reveal` (tinha a carta) ou `bluff` (blefe pego): dúvida nova, de qualquer um;
 * - `lose`: você perdeu uma carta;
 * - `turn`: a vez passou a ser sua; `coin`: suas moedas subiram;
 * - `win`: você venceu; `end`: outro venceu.
 * - `tick`: uma vez por segundo nos 3 últimos da janela, só se você ainda pode reagir (`can.pass`) e o prazo não passou.
 *
 * Nada toca na primeira visão (montagem da mesa ou reconexão): ela só vira a base de comparação. Partida nova
 * (`game.match` mudou) recomeça a conta: o diário zera, a vez conta como nova e as moedas não geram `coin`.
 * O áudio em si só nasce depois de um gesto (`installAudioUnlock` de `sounds.ts`, que a mesa instala ao montar).
 */
export type CoupClock = { msLeft: number; expired: boolean } | null;

/** Espaço entre sons que saem da mesma mudança. */
const GAP_MS = 260;
/** O tique só vale nos últimos segundos da janela. */
const TICK_SECONDS = 3;

interface Seen {
  match: number;
  log: number;
  myTurn: boolean;
  /** `null` = ainda sem base (partida nova): a primeira leitura não conta como "subiu". */
  coins: number | null;
}

export function useCoupSounds(view: CoupRoomView, clock: CoupClock): void {
  const seen = useRef<Seen | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastTick = useRef<string | null | undefined>(undefined);

  const { game, you } = view;

  // o que mudou entre a visão anterior e esta
  useEffect(() => {
    const seat = you === null ? undefined : game.seats.find((s) => s.id === you);
    const coins = seat ? seat.coins : 0;
    const myTurn = you !== null && game.phase === 'turn' && game.turn === you;
    const prev = seen.current;
    seen.current = { match: game.match, log: game.log.length, myTurn, coins };
    if (prev === null) return; // primeira visão: só vira base

    const before: Seen = prev.match === game.match ? prev : { match: game.match, log: 0, myTurn: false, coins: null };
    const names: CoupSound[] = [];
    for (const e of game.log.slice(before.log)) {
      switch (e.t) {
        case 'act':
          if (e.actor !== you) names.push('declare');
          break;
        case 'block':
          if (e.by !== you) names.push('declare');
          break;
        case 'challenge':
          names.push('challenge', e.had ? 'reveal' : 'bluff');
          break;
        case 'lose':
          if (e.player === you) names.push('lose');
          break;
        case 'win':
          names.push(e.player === you ? 'win' : 'end');
          break;
        default:
          break;
      }
    }
    if (myTurn && !before.myTurn) names.push('turn');
    if (before.coins !== null && coins > before.coins) names.push('coin');

    [...new Set(names)].forEach((name, i) => {
      if (i === 0) {
        playCoupSound(name);
        return;
      }
      const id = setTimeout(() => {
        timers.current = timers.current.filter((t) => t !== id);
        playCoupSound(name);
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

  // tique da contagem final: uma vez por segundo, só pra quem ainda pode reagir (os botões estão na tela)
  const windowId = game.window?.id ?? null;
  const sec = clock === null || clock.expired ? null : Math.ceil(clock.msLeft / 1000);
  const ticking = game.can.pass && sec !== null && sec >= 1 && sec <= TICK_SECONDS;
  useEffect(() => {
    const key = ticking ? `${windowId}:${sec}` : null;
    if (key === lastTick.current) return;
    const first = lastTick.current === undefined;
    lastTick.current = key;
    // a primeira leitura só vira base (nada toca na primeira visão)
    if (key !== null && !first) playCoupSound('tick');
  }, [ticking, windowId, sec]);
}
