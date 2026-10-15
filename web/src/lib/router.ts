import { useEffect, useState } from 'react';

export type Route = { name: 'home' } | { name: 'room'; code: string };

export function parseHash(hash: string): Route {
  const match = hash.match(/^#\/sala\/([A-Za-z0-9]{4})$/);
  return match ? { name: 'room', code: match[1]!.toUpperCase() } : { name: 'home' };
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
