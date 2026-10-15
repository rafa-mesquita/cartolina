import { CLUE_MAX, type ItoCardView, type RoomView } from '@cartolina/shared';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { handCards, initialOf, type CardPlace } from '../game/derive';
import type { GameConn } from '../net/connection';
import type { EngineSnapshot, TableEngine } from './engine';

const CLUE_DEBOUNCE_MS = 350;

function tiltOf(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return `${(Math.abs(h) % 50) / 10 - 2.5}deg`;
}

function HandSlot({ card, place, color, name, phase, engine, conn }: {
  card: ItoCardView;
  place: CardPlace;
  color: string;
  name: string;
  phase: string;
  engine: TableEngine | null;
  conn: GameConn;
}) {
  const [text, setText] = useState(card.clue);
  const ref = useRef<HTMLTextAreaElement>(null);
  const timer = useRef(0);

  useEffect(() => {
    if (document.activeElement !== ref.current) setText(card.clue);
  }, [card.clue]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onChange = (value: string) => {
    setText(value);
    conn.sendActivity('writing');
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => conn.sendAction({ type: 'clue', cardId: card.id, text: value }), CLUE_DEBOUNCE_MS);
  };

  return (
    <div className={`hslot ${place === 'row' ? 'away' : ''} ${place === 'drag' ? 'dragging' : ''}`} data-hand-slot={card.id}>
      <div
        className="card hcard"
        style={{ '--c': color, '--tilt': tiltOf(card.id) } as CSSProperties}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('textarea') || place !== 'hand') return;
          engine?.beginHandDrag(card.id, e.nativeEvent);
        }}
      >
        <div className="face a">
          <div className="badge">{initialOf(name)}</div>
          <div className="mynum">{card.value}</div>
          <textarea
            ref={ref}
            className="clue-in"
            rows={3}
            maxLength={CLUE_MAX}
            placeholder="escreve uma dica…"
            spellCheck={false}
            value={text}
            disabled={phase !== 'sorting'}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
          />
        </div>
      </div>
      <div className="slot-note">tá na mesa ↑</div>
    </div>
  );
}

export function Hand({ view, snap, engine, conn }: { view: RoomView; snap: EngineSnapshot; engine: TableEngine | null; conn: GameConn }) {
  const me = view.seats.find((s) => s.id === view.you);
  if (!me) return null;
  return (
    <div className="hand">
      {handCards(view, snap.row, snap.inFlight, snap.dragging).map(({ card, place }) => (
        <HandSlot key={card.id} card={card} place={place} color={me.color} name={me.name} phase={view.game.phase} engine={engine} conn={conn} />
      ))}
    </div>
  );
}
