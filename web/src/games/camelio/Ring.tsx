import type { CamelioFrom, CamelioView } from '@cartolina/shared';
import { CardBack, CardFront } from './Card';

/** Largura das cartas do picadeiro. */
const RING_W = 92;

interface Props {
  v: CamelioView;
  /** É a sua vez de jogar (as cartas ganham o contorno dourado). */
  can: boolean;
  /** Carta levantada pelo clique. */
  picked?: CamelioFrom | null;
  /** Carta apagada enquanto o clone do arrasto viaja, volta ou espera o servidor. */
  dimmed?: CamelioFrom | null;
}

const pileClass = (from: CamelioFrom, has: boolean, { can, picked, dimmed }: Omit<Props, 'v'>): string | undefined => {
  const cls = [can && has ? 'can' : '', picked === from ? 'picked' : '', dimmed === from ? 'dragging' : ''].filter(Boolean).join(' ');
  return cls || undefined;
};

/** O picadeiro: monte (só o verso do topo, com até 2 cartas por baixo) à esquerda, a aberta à direita. */
export function Ring({ v, ...state }: Props) {
  const unders = Math.min(2, Math.max(0, v.deckCount - 1));
  return (
    <div className="cl-ring">
      <div className={pileClass('deck', !!v.top, state)} data-pile="deck" role="group" aria-label="monte">
        <div className="slot">
          {Array.from({ length: unders }, (_, i) => {
            const d = (unders - i) * 2;
            return <span key={i} className="under" style={{ transform: `translate(${d}px,${d}px)` }} />;
          })}
          {v.top ? (
            <div className="lift">
              <CardBack back={v.top} w={RING_W} />
            </div>
          ) : (
            <div className="none" />
          )}
        </div>
        <span className="cap">
          monte · <b>{v.deckCount}</b>
        </span>
      </div>
      <div className={pileClass('open', !!v.open, state)} data-pile="open" role="group" aria-label="carta aberta">
        <div className="slot">
          {v.open ? (
            <div className="lift">
              <CardFront card={v.open} w={RING_W} />
            </div>
          ) : (
            <div className="none" />
          )}
        </div>
        <span className="cap">aberta</span>
      </div>
    </div>
  );
}
