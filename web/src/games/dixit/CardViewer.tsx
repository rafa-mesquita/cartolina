import { useEffect, useRef } from 'react';
import { CardArt } from './CardArt';

interface Props {
  ids: readonly string[];
  index: number;
  label: (id: string, index: number) => string;
  onIndex: (index: number) => void;
  onClose: () => void;
}

/** Carta ampliada: setas navegam; rodinha pra baixo, Esc ou clique fora fecham. */
export function CardViewer({ ids, index, label, onIndex, onClose }: Props) {
  const opened = useRef(Date.now());
  const id = ids[index];
  const go = (d: number) => onIndex((index + d + ids.length) % ids.length);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onIndex((index - 1 + ids.length) % ids.length);
      if (e.key === 'ArrowRight') onIndex((index + 1) % ids.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ids.length, index, onClose, onIndex]);
  if (!id) return null;
  return (
    <div
      className="dx-viewer"
      role="dialog"
      aria-label="carta ampliada"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onWheel={(e) => {
        // o resto do mesmo giro que abriu não fecha na hora
        if (e.deltaY > 0 && Date.now() - opened.current > 350) onClose();
      }}
    >
      <button className="dx-nav" type="button" aria-label="carta anterior" onClick={() => go(-1)}>
        ‹
      </button>
      <div className="dx-big">
        <CardArt id={id} />
      </div>
      <button className="dx-nav" type="button" aria-label="próxima carta" onClick={() => go(1)}>
        ›
      </button>
      <div className="dx-cap">
        <b>{label(id, index)}</b>setas ‹ › navegam · rodinha pra baixo, Esc ou clique fora fecha
      </div>
    </div>
  );
}
