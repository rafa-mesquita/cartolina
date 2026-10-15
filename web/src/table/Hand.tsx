import { CLUE_MAX, type ItoCardView, type RoomView } from '@cartolina/shared';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { handCards, type CardPlace } from '../game/derive';
import { Critter } from '../screens/Critter';
import type { GameConn } from '../net/connection';
import type { EngineSnapshot, TableEngine } from './engine';

const CLUE_DEBOUNCE_MS = 350;
/** `fx.activity` 'writing' no máximo uma vez a cada tanto, por carta. */
const ACTIVITY_THROTTLE_MS = 1500;

function tiltOf(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return `${(Math.abs(h) % 50) / 10 - 2.5}deg`;
}

function HandSlot({ card, place, color, phase, engine, conn }: {
  card: ItoCardView;
  place: CardPlace;
  color: string;
  phase: string;
  engine: TableEngine | null;
  conn: GameConn;
}) {
  const [text, setText] = useState(card.clue);
  const ref = useRef<HTMLTextAreaElement>(null);
  const timer = useRef(0);
  const pending = useRef<string | null>(null);
  const lastActivity = useRef(-Infinity);
  /** Com a carta na mesa (ou sendo arrastada) a dica não muda: o servidor recusaria. */
  const locked = place !== 'hand';
  const latest = useRef({ clue: card.clue, id: card.id, conn, locked });
  useEffect(() => {
    latest.current = { clue: card.clue, id: card.id, conn, locked };
  });

  useEffect(() => {
    if (document.activeElement !== ref.current) setText(card.clue);
  }, [card.clue]);

  /** Manda a dica pendente agora. Dica igual à do servidor não vai (cada envio tira o autor do "pronto"). */
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const value = pending.current;
    pending.current = null;
    const { clue, id, conn: c, locked: isLocked } = latest.current;
    if (value !== null && !isLocked && value !== clue) c.sendAction({ type: 'clue', cardId: id, text: value });
  }, []);
  useEffect(() => flush, [flush]);

  const onChange = (value: string) => {
    if (locked) return;
    setText(value);
    const now = Date.now();
    if (now - lastActivity.current >= ACTIVITY_THROTTLE_MS) {
      lastActivity.current = now;
      conn.sendActivity('writing');
    }
    pending.current = value;
    clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, CLUE_DEBOUNCE_MS);
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
          <div className="badge">
            <Critter color={color} />
          </div>
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
            readOnly={locked}
            title={locked ? 'tira a carta da mesa pra mudar a dica' : undefined}
            onChange={(e) => onChange(e.target.value)}
            onBlur={flush}
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
        <HandSlot key={card.id} card={card} place={place} color={me.color} phase={view.game.phase} engine={engine} conn={conn} />
      ))}
    </div>
  );
}
