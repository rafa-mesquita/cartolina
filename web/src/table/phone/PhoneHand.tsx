import type { ItoRoomView } from '@cartolina/shared';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { cardsOf } from '../../game/derive';
import { Critter } from '../../screens/Critter';
import './phone.css';

export function PhoneHand({
  view,
  row,
  selected,
  onPick,
  onEdit,
  onPointerDown,
}: {
  view: ItoRoomView;
  row: readonly string[];
  selected: string | null;
  onPick(cardId: string): void;
  onEdit(cardId: string): void;
  /** Liga o arrasto (Task 7). O toque curto continua sendo clique. */
  onPointerDown?(e: ReactPointerEvent, cardId: string): void;
}) {
  if (!view.you) return null;
  const color = view.seats.find((s) => s.id === view.you)?.color ?? '#D9C2A0';
  const sorting = view.game.phase === 'sorting';
  return (
    <div className="p-hand" style={{ '--c': color } as CSSProperties}>
      {cardsOf(view, view.you).map((card) => {
        const inRow = row.includes(card.id);
        const clue = card.clue.trim();
        return (
          <div key={card.id} className={`p-hcard ${inRow ? 'away' : ''} ${selected === card.id ? 'sel' : ''}`}>
            <button
              type="button"
              className="p-hnum"
              data-sound="none"
              data-card={card.id}
              aria-label={`${card.value}, ${inRow ? 'na fila' : clue || 'sem dica'}`}
              aria-pressed={selected === card.id}
              disabled={!sorting}
              onClick={() => onPick(card.id)}
              onPointerDown={onPointerDown ? (e) => onPointerDown(e, card.id) : undefined}
            >
              {card.value}
              <span className="p-hclue">{inRow ? 'tá na fila ↑' : clue || 'sem dica'}</span>
            </button>
            {!inRow && sorting && (
              <button type="button" className="p-edit" onClick={() => onEdit(card.id)}>
                ✎ dica
              </button>
            )}
            <span className="p-hbadge">
              <Critter color={color} />
            </span>
          </div>
        );
      })}
    </div>
  );
}
