import { useSyncExternalStore } from 'react';

/** Tela estreita ou toque como ponteiro principal: por enquanto o jogo é só pra computador. */
export const PHONE_QUERY = '(max-width: 767px), (pointer: coarse)';

function media(): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(PHONE_QUERY) : null;
}

function subscribe(onChange: () => void): () => void {
  const m = media();
  m?.addEventListener('change', onChange);
  return () => m?.removeEventListener('change', onChange);
}

export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, () => media()?.matches ?? false, () => false);
}
