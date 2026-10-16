import { useSyncExternalStore } from 'react';

/** Aparelho de toque (sem hover, ponteiro grosso): por enquanto o jogo é só pra computador. Janela estreita de PC não conta. */
export const PHONE_QUERY = '(hover: none) and (pointer: coarse)';

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
