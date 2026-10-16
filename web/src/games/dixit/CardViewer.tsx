import { useEffect, useRef, type KeyboardEvent } from 'react';
import { CardArt } from './CardArt';

interface Props {
  ids: readonly string[];
  index: number;
  label: (id: string, index: number) => string;
  onIndex: (index: number) => void;
  onClose: () => void;
}

/** Carta ampliada: setas navegam; rodinha pra baixo, Esc ou clique fora fecham. O foco vai pro diálogo e volta ao fechar. */
export function CardViewer({ ids, index, label, onIndex, onClose }: Props) {
  const opened = useRef(Date.now());
  const dialog = useRef<HTMLDivElement>(null);
  const id = ids[index];
  const go = (d: number) => {
    if (ids.length > 0) onIndex((index + d + ids.length) % ids.length);
  };
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.focus();
    return () => before?.focus();
  }, []);
  if (!id) return null;
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'ArrowRight') go(1);
  };
  return (
    <div
      ref={dialog}
      className="dx-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={label(id, index)}
      tabIndex={-1}
      onKeyDown={onKeyDown}
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
