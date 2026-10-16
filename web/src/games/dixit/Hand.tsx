import { useRef, type CSSProperties } from 'react';
import { CardArt } from './CardArt';
import { dragLayout, handX } from './handOrder';
import { useHandDrag, type DropState } from './useHandDrag';

interface Props {
  /** Cartas na ordem local (o pai usa `orderHand`). */
  ids: readonly string[];
  /** Cartas que já foram pra mesa (pendentes ou confirmadas): somem da mão na hora. */
  away: readonly string[];
  /** Pode jogar agora (sua vez de narrar ou de escolher). */
  canPlay: boolean;
  /** Narrador sem dica: soltar no feltro não joga (feltro vermelho, a carta volta). */
  blocked: boolean;
  /** Soltou no feltro podendo jogar. `at` = ponto da tela onde soltou (null pelo teclado). */
  onPlay: (id: string, at: { x: number; y: number } | null) => void;
  /** Soltou no feltro mas está bloqueado (falta a dica). */
  onBlocked: () => void;
  /** Nova ordem depois de arrastar dentro da mão. */
  onReorder: (order: string[]) => void;
  onZoom: (id: string) => void;
  /** Estado do feltro durante o arrasto, pro pai repassar ao `Felt`. */
  onDropState: (s: DropState) => void;
}

/** Sua mão, plana, em leque: arraste pra mesa pra jogar, dentro da mão pra arrumar; clique amplia. */
export function Hand({ ids, away, canPlay, blocked, onPlay, onBlocked, onReorder, onZoom, onDropState }: Props) {
  const handRef = useRef<HTMLDivElement>(null);
  const { drag, cardProps } = useHandDrag(handRef, { ids, away, canPlay, blocked, onPlay, onBlocked, onReorder, onZoom, onDropState });
  const awaySet = new Set(away);
  const visible = ids.filter((id) => !awaySet.has(id));
  const layout = drag ? dragLayout(visible, drag.id, drag.at) : visible;
  const n = layout.length;
  const mid = (n - 1) / 2;
  return (
    <div ref={handRef} className={`dx-hand${canPlay ? '' : ' off'}`}>
      {ids.map((id) => {
        if (awaySet.has(id)) {
          return (
            <div key={id} className="dx-hcard away" aria-hidden="true" data-card-id={id}>
              <CardArt id={id} />
            </div>
          );
        }
        const dragging = drag?.id === id;
        const i = layout.indexOf(id);
        const style = (
          dragging
            ? { left: handX(drag.from, n), transform: `translate(${drag.dx}px, ${drag.dy}px) rotate(${Math.min(Math.max(drag.dx / 25, -10), 10)}deg) scale(1.08)` }
            : { left: handX(i, n), '--rot': `${(i - mid) * 2.6}deg` }
        ) as CSSProperties;
        return (
          <div
            key={id}
            className={`dx-hcard${dragging ? ' dragging' : ''}`}
            style={style}
            role="button"
            tabIndex={0}
            aria-label={`sua carta ${visible.indexOf(id) + 1}`}
            data-card-id={id}
            data-zoom="hand"
            {...cardProps(id)}
          >
            <CardArt id={id} />
            <button
              type="button"
              className="dx-zoom"
              aria-label="ampliar"
              onClick={(e) => {
                e.stopPropagation();
                onZoom(id);
              }}
            >
              ⤢
            </button>
          </div>
        );
      })}
    </div>
  );
}
