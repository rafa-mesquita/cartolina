import { isGameId, type GameId } from '@cartolina/shared';
import { useEffect, useState } from 'react';

export type GameTab = 'jogar' | 'historico';
export type Route =
  | { name: 'home' }
  | { name: 'room'; code: string }
  | { name: 'game'; game: GameId; tab: GameTab; legacy?: true };

/** Para onde os links antigos de grupo (#/g/...) são levados. */
const LEGACY_TARGET = '#/ito/historico';

export function parseHash(raw: string): Route {
  // Tolera barra no fim (`#/ito/`) e maiúsculas (`#/ITO`).
  const hash = raw.replace(/\/+$/, '');
  const room = hash.match(/^#\/sala\/([A-Za-z0-9]{4})$/);
  if (room) return { name: 'room', code: room[1]!.toUpperCase() };
  // Links antigos (#/g/<slug>): o histórico agora é do jogo.
  if (/^#\/g(\/[^/]+)?$/i.test(hash)) return { name: 'game', game: 'ito', tab: 'historico', legacy: true };
  const game = hash.toLowerCase().match(/^#\/([a-z]+)(\/historico)?$/);
  if (game && isGameId(game[1])) return { name: 'game', game: game[1], tab: game[2] ? 'historico' : 'jogar' };
  return { name: 'home' };
}

export function gameHash(game: GameId, tab: GameTab = 'jogar'): string {
  return tab === 'historico' ? `#/${game}/historico` : `#/${game}`;
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  // Link antigo de grupo: troca a URL pela nova sem recarregar (replaceState não dispara hashchange, então o aviso segue na tela).
  const legacy = route.name === 'game' && route.legacy === true;
  useEffect(() => {
    if (legacy) window.history.replaceState(null, '', LEGACY_TARGET);
  }, [legacy]);
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function goToRoom(code: string): void {
  window.location.hash = `#/sala/${code}`;
}

export function goHome(): void {
  window.location.hash = '#/';
}

/** Link completo de uma sala (pra copiar e mandar pros amigos). */
export function roomLink(code: string): string {
  return `${window.location.origin}${window.location.pathname}#/sala/${code}`;
}
