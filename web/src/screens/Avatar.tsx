import type { CSSProperties } from 'react';
import { initialOf } from '../game/derive';

export function Avatar({ name, color, anchor }: { name: string; color: string; anchor?: string }) {
  return (
    <div className="avatar" style={{ '--c': color } as CSSProperties} data-seat-anchor={anchor}>
      {initialOf(name)}
    </div>
  );
}
