import { useCallback, useReducer } from 'react';
import type { CamelioView } from '@cartolina/shared';
import { emptyPlayback, finish, receive, step, type Playback } from './playback';

interface Anim {
  prev: CamelioView;
  next: CamelioView;
}

interface State {
  playback: Playback;
  anim: Anim | null;
  /** Última view recebida (por identidade): a view nova só entra na fila uma vez. */
  seen: CamelioView | null;
}

type Event = { type: 'view'; view: CamelioView } | { type: 'done' };

const initial: State = { playback: emptyPlayback, anim: null, seen: null };

function reduce(state: State, event: Event): State {
  if (event.type === 'view') {
    if (state.seen === event.view) return state;
    const received = receive(state.playback, event.view);
    // Durante a animação a fila só cresce; a animação em curso segue com o `anim` que já tinha.
    if (received.animating) return { playback: received, anim: state.anim, seen: event.view };
    const { playback, anim } = step(received);
    return { playback, anim, seen: event.view };
  }
  if (!state.playback.animating) return state;
  const { playback, anim } = step(finish(state.playback));
  return { ...state, playback, anim };
}

/**
 * Fila de animação do Cama-Leão: `shown` é o que se desenha; `anim` é a jogada a animar agora (ou null).
 * Quem anima chama `done()` quando termina (ou é interrompido) pra seguir pra próxima.
 */
export function usePlayback(view: CamelioView): { shown: CamelioView; anim: Anim | null; done: () => void } {
  const [state, dispatch] = useReducer(reduce, initial);
  // A view nova entra no estado já durante o render (padrão "ajustar estado ao receber props"),
  // então `shown` nunca fica nulo nem um quadro atrás. O reducer ignora a mesma view reenviada.
  const synced = reduce(state, { type: 'view', view });
  if (synced !== state) dispatch({ type: 'view', view });
  const done = useCallback(() => dispatch({ type: 'done' }), []);
  return { shown: synced.playback.shown ?? view, anim: synced.anim, done };
}
