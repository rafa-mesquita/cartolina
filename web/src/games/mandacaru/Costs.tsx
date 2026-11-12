import { COSTS, type Piece } from '@cartolina/shared';
import { memo } from 'react';
import { ResIcon } from './art';
import { PIECE_NAME, RES_NAME, RES_ORDER } from './names';

/** As peças na ordem do "quanto custa". */
export const PIECES: Piece[] = ['road', 'house', 'city', 'cordel'];

/**
 * Os ícones do custo de uma peça, com os repetidos agrupados ("2 ×" e o ícone do feijão, em vez de dois feijões).
 * Cada grupo tem o nome pro leitor de tela e pra dica do mouse ("2 × feijão").
 */
export function CostIcons({ piece, size = 22 }: { piece: Piece; size?: number }) {
  return (
    <>
      {RES_ORDER.filter((r) => COSTS[piece][r] > 0).map((r) => {
        const n = COSTS[piece][r];
        return (
          <span key={r} className="mc-custo-item" title={n > 1 ? `${n} × ${RES_NAME[r]}` : RES_NAME[r]}>
            {n > 1 && <i>{n}×</i>}
            <ResIcon kind={r} size={size} />
          </span>
        );
      })}
    </>
  );
}

/** Caixa "quanto custa" (coluna da esquerda, embaixo do banco): o nome da peça e o custo em ícones grandes. */
export const CostBox = memo(function CostBox() {
  return (
    <div className="mc-box mc-custos">
      <h3>quanto custa</h3>
      {PIECES.map((k) => (
        <div key={k} className="mc-custo">
          <b>{PIECE_NAME[k]}</b>
          <CostIcons piece={k} size={26} />
        </div>
      ))}
    </div>
  );
});
