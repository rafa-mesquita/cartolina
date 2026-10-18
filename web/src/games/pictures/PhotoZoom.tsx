import { COORDS, type Coord } from '@cartolina/shared';
import { useEffect, useRef } from 'react';
import { Photo } from './Photo';

interface Props {
  grid: readonly string[];
  /** Índice da foto aberta (0–15, na ordem de COORDS). */
  index: number;
  /** A sua secreta (ganha o selo "sua foto"), ou null. */
  secret: Coord | null;
  onIndex: (index: number) => void;
  onClose: () => void;
}

/**
 * Foto da grade grande: ← → (e ‹ ›) passam pelas 16, Esc / clique fora / ✕ fecham. Ao abrir, o foco vai pro ✕;
 * ao fechar, volta pra quem abriu.
 */
export function PhotoZoom({ grid, index, secret, onIndex, onClose }: Props) {
  const step = (d: number) => onIndex((index + d + COORDS.length) % COORDS.length);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const opener = document.activeElement;
    closeRef.current?.focus();
    return () => {
      if (opener instanceof HTMLElement && opener !== document.body && opener.isConnected) opener.focus();
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') onIndex((index + COORDS.length - 1) % COORDS.length);
      else if (e.key === 'ArrowRight') onIndex((index + 1) % COORDS.length);
      else return;
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [index, onIndex, onClose]);

  const coord = COORDS[index]!, id = grid[index];
  return (
    <div
      className="pc-zoom"
      role="dialog"
      aria-modal="true"
      aria-label={`foto ${coord}`}
      onClick={(e) => {
        if (!(e.target as Element).closest('.pc-zoom-frame, button')) onClose();
      }}
    >
      <button className="pc-zoom-nav l" type="button" title="anterior (←)" aria-label="foto anterior" onClick={() => step(-1)}>
        <i className="ti ti-chevron-left" />
      </button>
      <div className="pc-zoom-frame">
        <div className="pic">{id && <Photo id={id} size="full" />}</div>
        <span className="co">{coord}</span>
        <span className="cap">← → pra ver as outras · Esc fecha</span>
        {coord === secret && <span className="mine">sua foto</span>}
      </div>
      <button className="pc-zoom-nav r" type="button" title="próxima (→)" aria-label="próxima foto" onClick={() => step(1)}>
        <i className="ti ti-chevron-right" />
      </button>
      <button ref={closeRef} className="pc-zoom-x" type="button" title="fechar (Esc)" aria-label="fechar" onClick={onClose}>
        ✕
      </button>
    </div>
  );
}
