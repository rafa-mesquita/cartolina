import { useCallback, useReducer } from 'react';
import type { CamelioView } from '@cartolina/shared';
import { emptyPlayback, finish, receive, step, type Playback } from './playback';

interface Anim {
  prev: CamelioView;
  next: CamelioView;
  /** Incremental, novo a cada animação; fica igual enquanto ela durar. */
  id: number;
}

interface State {
  playback: Playback;
  anim: Anim | null;
  /** Última view recebida (por identidade): a view nova só entra na fila uma vez. */
  seen: CamelioView | null;
  /** Id da última animação começada. */
  lastId: number;
}

type Event = { type: 'view'; view: CamelioView } | { type: 'done'; id: number | undefined };

const initial: State = { playback: emptyPlayback, anim: null, seen: null, lastId: 0 };

/** `step` já com o id da animação (novo, se começou uma). */
function advance(state: State, playback: Playback): Pick<State, 'playback' | 'anim' | 'lastId'> {
  const { playback: next, anim } = step(playback);
  if (!anim) return { playback: next, anim: null, lastId: state.lastId };
  const id = state.lastId + 1;
  return { playback: next, anim: { ...anim, id }, lastId: id };
}

function reduce(state: State, event: Event): State {
  if (event.type === 'view') {
    if (state.seen === event.view) return state;
    const received = receive(state.playback, event.view);
    // Durante a animação a fila só cresce; a animação em curso segue com o `anim` que já tinha.
    if (received.animating) return { ...state, playback: received, seen: event.view };
    return { ...state, ...advance(state, received), seen: event.view };
  }
  if (!state.playback.animating || !state.anim) return state;
  // Com id, só termina a animação a que ele pertence (chamada repetida ou atrasada não pula a próxima).
  if (event.id !== undefined && event.id !== state.anim.id) return state;
  return { ...state, ...advance(state, finish(state.playback)) };
}

/**
 * Fila de animação do Cama-Leão: `shown` é o que se desenha; `anim` é a jogada a animar agora (ou null).
 * Quem anima chama `done(anim.id)` quando termina (ou é interrompido) pra seguir pra próxima;
 * `done()` sem id termina a animação em curso, seja qual for.
 */
export function usePlayback(view: CamelioView): {
  shown: CamelioView;
  anim: Anim | null;
  done: (id?: number) => void;
} {
  const [state, dispatch] = useReducer(reduce, initial);
  // A view nova entra no estado já durante o render (padrão "ajustar estado ao receber props"),
  // então `shown` nunca fica nulo nem um quadro atrás. O reducer ignora a mesma view reenviada.
  const synced = reduce(state, { type: 'view', view });
  if (synced !== state) dispatch({ type: 'view', view });
  const done = useCallback((id?: number) => dispatch({ type: 'done', id }), []);
  return { shown: synced.playback.shown ?? view, anim: synced.anim, done };
}
