import { memo, type CSSProperties } from 'react';
import { photoPlaceholder, photoSrc } from './photos';

/** Uma foto do baralho (ocupa o contêiner, que deve ser 4:3): a provisória, e a real por cima quando existir. */
export const Photo = memo(function Photo({ id }: { id: string }) {
  const p = photoPlaceholder(id);
  const src = photoSrc(id);
  const icon = { '--s': p.size, transform: `translate(${p.dx}%, ${p.dy}%) rotate(${p.rot}deg)` } as CSSProperties;
  return (
    <div className="pc-ph" style={{ background: `hsl(${p.hue} ${p.sat}% ${p.light}%)` }}>
      <i className={`ti ti-${p.icon}`} style={icon} />
      <span className="pc-ph-cap">{p.label}</span>
      {src && <img src={src} alt="" draggable={false} />}
    </div>
  );
});
