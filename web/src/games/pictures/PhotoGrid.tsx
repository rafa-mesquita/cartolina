import { COORDS, type Coord } from '@cartolina/shared';
import { Fragment } from 'react';
import { Photo } from './Photo';

const COLS = ['A', 'B', 'C', 'D'] as const;

interface Props {
  grid: readonly string[];
  /** Contorno tracejado azul (a sua foto secreta), ou null. */
  secret: Coord | null;
  /** Clique na foto (na montagem: zoom; no palpite: cola a fitinha). */
  onPhoto: (coord: Coord) => void;
  /** Lupinha (aparece ao passar o mouse). */
  onZoom: (coord: Coord) => void;
  /** Cursor de lupa na foto inteira (montagem). */
  zoomCursor?: boolean;
}

/** A grade 4×4 com as letras A–D em cima e os números 1–4 do lado. */
export function PhotoGrid({ grid, secret, onPhoto, onZoom, zoomCursor = false }: Props) {
  return (
    <div className={`pc-grid${zoomCursor ? ' zoomable' : ''}`}>
      <span />
      {COLS.map((c) => (
        <span key={c} className="pc-lbl">
          {c}
        </span>
      ))}
      {[0, 1, 2, 3].map((row) => (
        <Fragment key={row}>
          <span className="pc-lbl">{row + 1}</span>
          {COLS.map((_, col) => {
            const coord = COORDS[row * 4 + col]!, id = grid[row * 4 + col];
            return (
              <div key={coord} className={`pc-photo${coord === secret ? ' secret' : ''}`} data-coord={coord} onClick={() => onPhoto(coord)}>
                {id && <Photo id={id} />}
                <button
                  className="pc-zoom-btn"
                  type="button"
                  title="ver grande"
                  aria-label={`ver a foto ${coord} grande`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onZoom(coord);
                  }}
                >
                  <i className="ti ti-zoom-in" />
                </button>
              </div>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}
