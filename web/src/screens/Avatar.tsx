import { Critter } from './Critter';

export function Avatar({ color, anchor }: { color: string; anchor?: string }) {
  return (
    <div className="avatar" data-seat-anchor={anchor}>
      <Critter color={color} />
    </div>
  );
}
