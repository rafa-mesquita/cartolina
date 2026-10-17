import { COORDS, type Coord } from '@cartolina/shared';
import { Fragment } from 'react';
import { Critter } from '../../screens/Critter';
import { Photo } from './Photo';

const COLS = ['A', 'B', 'C', 'D'] as const;

/** Um bichinho marcado numa foto (galeria: as obras em que você colou essa coordenada). */
export interface PhotoMark {
  id: string;
  name: string;
  color: string;
}

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
  /** Galeria: a foto inteira cola a fitinha (cursor de mãozinha e realce ao passar o mouse). */
  pickable?: boolean;
  /** Galeria: contorno azul na foto do palpite da obra selecionada. */
  picked?: Coord | null;
  /** Galeria: bichinhos das obras em que você colou cada foto. */
  marks?: Partial<Record<Coord, readonly PhotoMark[]>>;
  /** Revelação: a foto que saiu da grade (fica o lugar vazio até a próxima obra). */
  lifted?: Coord | null;
}

/** A grade 4×4 com as letras A–D em cima e os números 1–4 do lado. */
export function PhotoGrid({ grid, secret, onPhoto, onZoom, zoomCursor = false, pickable = false, picked = null, marks, lifted = null }: Props) {
  return (
    <div className={`pc-grid${zoomCursor ? ' zoomable' : ''}${pickable ? ' pickable' : ''}`}>
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
            const coord = COORDS[row * 4 + col]!, id = grid[row * 4 + col], who = marks?.[coord];
            const cls = `pc-photo${coord === secret ? ' secret' : ''}${coord === picked ? ' picked' : ''}${coord === lifted ? ' lifted' : ''}`;
            return (
              <div key={coord} className={cls} data-coord={coord} onClick={() => onPhoto(coord)}>
                {id && <Photo id={id} />}
                {who && who.length > 0 && (
                  <div className="pc-used">
                    {who.map((m) => (
                      <span key={m.id} title={m.name}>
                        <Critter color={m.color} />
                      </span>
                    ))}
                  </div>
                )}
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
