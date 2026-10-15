import type { Activity, RoomView, SeatView } from '@cartolina/shared';
import type { CSSProperties } from 'react';
import { backsOf, seatStatus } from '../game/derive';
import { Avatar } from '../screens/Avatar';
import type { EngineSnapshot } from './engine';
import type { SeatSlot } from './seatLayout';

function positionOf(slot: SeatSlot): CSSProperties {
  if (slot.side === 'top') return { left: `${18 + slot.pos * 64}%`, top: 12 };
  const top = `${14 + slot.pos * 52}%`;
  return slot.side === 'left' ? { left: 20, top } : { right: 20, top };
}

export function Seat({ view, seat, slot, snap, activity }: { view: RoomView; seat: SeatView; slot: SeatSlot; snap: EngineSnapshot; activity: Activity | undefined }) {
  const status = seatStatus(view, seat, activity);
  return (
    <div className={`seat ${slot.side}`} style={positionOf(slot)}>
      <Avatar color={seat.color} anchor={seat.id} />
      <div className="meta">
        <div className="name">
          {seat.name}
          {seat.id === view.hostId ? ' ★' : ''}
        </div>
        <div className="tag" data-s={status.replace(/[^a-z]/g, '')}>
          {status}
        </div>
      </div>
      <div className="backs">
        {backsOf(view, seat.id, snap.row, snap.inFlight).map((inHand, i) => (
          <div key={i} className={`mback ${inHand ? '' : 'empty'}`} />
        ))}
      </div>
    </div>
  );
}
