import { useEffect, useState } from 'react';

export type Route = { name: 'home' } | { name: 'room'; code: string } | { name: 'group'; slug: string };

export function parseHash(hash: string): Route {
  const room = hash.match(/^#\/sala\/([A-Za-z0-9]{4})$/);
  if (room) return { name: 'room', code: room[1]!.toUpperCase() };
  const group = hash.match(/^#\/g\/([a-z0-9]{10})$/);
  if (group) return { name: 'group', slug: group[1]! };
  return { name: 'home' };
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

/** Link completo de uma sala (pra copiar e mandar pros amigos). */
export function roomLink(code: string): string {
  return `${window.location.origin}${window.location.pathname}#/sala/${code}`;
}

export function goToGroup(slug: string): void {
  window.location.hash = `#/g/${slug}`;
}

/** Link completo do grupo (é o segredo: quem tem vê o histórico). */
export function groupLink(slug: string): string {
  return `${window.location.origin}${window.location.pathname}#/g/${slug}`;
}
