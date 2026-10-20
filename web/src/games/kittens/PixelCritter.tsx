import { useEffect, useState } from 'react';
import { Sprites } from './sprites';

/** O bichinho do site (pela cor do jogador) em pixel art. */
export function PixelCritter({ color, className }: { color: string; className?: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let alive = true;
    void Sprites.critter(color).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [color]);
  return url ? <img className={className} src={url} alt="" /> : <span className={className} aria-hidden="true" />;
}
