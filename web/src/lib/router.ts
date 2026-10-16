import { isGameId, type GameId } from '@cartolina/shared';
import { useEffect, useState } from 'react';

export type GameTab = 'jogar' | 'historico';
export type Route =
  | { name: 'home' }
  | { name: 'room'; code: string }
  | { name: 'game'; game: GameId; tab: GameTab; legacy?: true };

export function parseHash(hash: string): Route {
  const room = hash.match(/^#\/sala\/([A-Za-z0-9]{4})$/);
  if (room) return { name: 'room', code: room[1]!.toUpperCase() };
  // Links antigos de grupo (#/g/<slug>): o histórico agora é do jogo.
  if (/^#\/g\/[^/]+$/.test(hash)) return { name: 'game', game: 'ito', tab: 'historico', legacy: true };
  const game = hash.match(/^#\/([a-z]+)(\/historico)?$/);
  if (game && isGameId(game[1])) return { name: 'game', game: game[1], tab: game[2] ? 'historico' : 'jogar' };
  return { name: 'home' };
}

export function gameHash(game: GameId, tab: GameTab = 'jogar'): string {
  return tab === 'historico' ? `#/${game}/historico` : `#/${game}`;
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
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

export function goToGame(game: GameId, tab: GameTab = 'jogar'): void {
  window.location.hash = gameHash(game, tab);
}

/** Link completo de uma sala (pra copiar e mandar pros amigos). */
export function roomLink(code: string): string {
  return `${window.location.origin}${window.location.pathname}#/sala/${code}`;
}
