import { memo, type CSSProperties, type SyntheticEvent } from 'react';
import { photoPlaceholder, photoSrc, photoThemeName, type PhotoSize } from './photos';

/** Foto real que não carregou: some, e fica a provisória por baixo. */
const hide = (e: SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.style.display = 'none';
};

/**
 * Uma foto do baralho (ocupa o contêiner, que deve ser 4:3): a provisória por baixo e a real por cima quando existir.
 * `thumb` (grade, galeria) usa a miniatura; `full` (zoom, revelação) põe a miniatura embaixo, que costuma já estar no
 * cache, e a cheia por cima quando chegar.
 */
export const Photo = memo(function Photo({ id, size = 'thumb' }: { id: string; size?: PhotoSize }) {
  const p = photoPlaceholder(id);
  const thumb = photoSrc(id, 'thumb');
  const full = size === 'full' ? photoSrc(id, 'full') : null;
  const alt = photoThemeName(id);
  const icon = { '--s': p.size, transform: `translate(${p.dx}%, ${p.dy}%) rotate(${p.rot}deg)` } as CSSProperties;
  return (
    <div className="pc-ph" style={{ background: `hsl(${p.hue} ${p.sat}% ${p.light}%)` }}>
      <i className={`ti ti-${p.icon}`} style={icon} />
      <span className="pc-ph-cap">{p.label}</span>
      {thumb && (
        <img src={thumb} alt={full ? '' : alt} width={480} height={360} loading="lazy" decoding="async" draggable={false} onError={hide} />
      )}
      {full && <img src={full} alt={alt} width={1200} height={900} decoding="async" draggable={false} onError={hide} />}
    </div>
  );
});
