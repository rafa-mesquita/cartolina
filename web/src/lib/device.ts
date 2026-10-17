import { useCallback, useSyncExternalStore } from 'react';

/** Aparelho de toque (sem hover, ponteiro grosso): só jogos `mobile` do catálogo ficam liberados nele. */
export const PHONE_QUERY = '(hover: none) and (pointer: coarse)';
/** Layout de celular: tela em pé e estreita (mede a largura, não o aparelho). */
export const PHONE_LAYOUT_QUERY = '(max-width: 640px)';
/** Celular deitado com a tela baixa: pede pra virar em pé. */
export const LANDSCAPE_PHONE_QUERY = '(pointer: coarse) and (orientation: landscape) and (max-height: 500px)';

function mediaOf(query: string): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(query) : null;
}

/** Acompanha uma media query; sem `matchMedia`, é sempre falso. */
export function useMedia(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const m = mediaOf(query);
      m?.addEventListener('change', onChange);
      return () => m?.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => mediaOf(query)?.matches ?? false,
    () => false,
  );
}

export function useIsPhone(): boolean {
  return useMedia(PHONE_QUERY);
}

export type Layout = 'phone' | 'desktop';

export function useLayout(): Layout {
  return useMedia(PHONE_LAYOUT_QUERY) ? 'phone' : 'desktop';
}

/**
 * Orientação física da tela, que não muda quando o teclado abre (a media query muda: com o teclado,
 * a área visível fica mais larga que alta). `null` quando o navegador não diz.
 */
function screenIsLandscape(): boolean | null {
  const type = window.screen?.orientation?.type;
  if (type) return type.startsWith('landscape');
  // iPhone antigo (antes do iOS 16.4): só tem o `window.orientation`, em graus.
  const deg = (window as { orientation?: unknown }).orientation;
  if (typeof deg === 'number') return Math.abs(deg) === 90;
  return null;
}

export function useIsLandscapePhone(): boolean {
  const lowAndWide = useMedia(LANDSCAPE_PHONE_QUERY);
  // Girar o celular também muda a media query, então ela já re-renderiza; aqui só se confirma a orientação.
  return lowAndWide && (screenIsLandscape() ?? true);
}
