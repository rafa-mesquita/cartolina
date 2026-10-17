import type { ItoRoomView } from '@cartolina/shared';
import { useEffect, useRef, useState } from 'react';

// Mesmo ritmo do motor do computador (`engine.ts`, `syncReveal`/`flipCard`).
const FIRST_MS = 750;
const STEP_MS = 620;
const ERROR_MS = 330;
const END_MS = 500;

export type RevealSound = 'flip' | 'error' | 'win' | 'lose';

export interface PhoneReveal {
  /** Quantas cartas da revelação já viraram (na ordem de `game.reveal`). */
  shown: number;
  /** Terminou (mostra o resultado). */
  done: boolean;
}

/**
 * Revelação passo a passo, com o ritmo e os sons do computador. `instant`: a tela montou já com a revelação
 * pronta (recarregou), então mostra tudo sem som.
 */
export function usePhoneReveal(view: ItoRoomView, sound: (name: RevealSound, index?: number) => void, instant: boolean): PhoneReveal {
  const reveal = view.game.phase === 'reveal' ? (view.game.reveal ?? []) : [];
  // Ids se repetem entre rodadas: a chave leva o valor também (igual à mesa do computador).
  const key = reveal.map((e) => `${e.cardId}=${e.value}`).join('|');
  const [state, setState] = useState<{ key: string; shown: number; done: boolean }>(() =>
    instant && key ? { key, shown: reveal.length, done: true } : { key: '', shown: 0, done: false },
  );
  // Chave que já nasceu pronta (recarregou no meio): não toca a sequência. Fica no ref pra valer também
  // quando o StrictMode roda o efeito duas vezes.
  const instantKey = useRef(instant ? key : '');
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const outcome = view.game.outcome;
  const outcomeRef = useRef(outcome);
  outcomeRef.current = outcome;
  const revealRef = useRef(reveal);
  revealRef.current = reveal;

  useEffect(() => {
    if (!key) {
      instantKey.current = '';
      setState((s) => (s.key === '' && s.shown === 0 && !s.done ? s : { key: '', shown: 0, done: false }));
      return;
    }
    if (key === instantKey.current) return;
    setState({ key, shown: 0, done: false });
    const entries = revealRef.current;
    const o = outcomeRef.current;
    const won = o === 'round_won' || o === 'level_cleared' || o === 'won';
    const timers: number[] = [];
    let t = FIRST_MS;
    entries.forEach((e, i) => {
      timers.push(
        window.setTimeout(() => {
          setState((s) => (s.key === key ? { ...s, shown: i + 1 } : s));
          soundRef.current('flip', i);
        }, t),
      );
      if (e.error) timers.push(window.setTimeout(() => soundRef.current('error'), t + ERROR_MS));
      t += STEP_MS;
    });
    timers.push(
      window.setTimeout(() => {
        setState((s) => (s.key === key ? { ...s, done: true } : s));
        soundRef.current(won ? 'win' : 'lose');
      }, t + END_MS),
    );
    return () => timers.forEach((id) => clearTimeout(id));
  }, [key]);

  return state.key === key ? { shown: state.shown, done: state.done } : { shown: 0, done: false };
}
