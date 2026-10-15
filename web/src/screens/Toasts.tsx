import { useEffect, useState } from 'react';
import { JOIN_ERRORS, type GameConn } from '../net/connection';

export function Toasts({ conn }: { conn: Pick<GameConn, 'onError'> }) {
  const [items, setItems] = useState<{ id: number; text: string }[]>([]);
  useEffect(
    () =>
      conn.onError((code, message) => {
        if (JOIN_ERRORS.has(code)) return;
        const id = Date.now() + Math.random();
        setItems((xs) => [...xs, { id, text: message }]);
        setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3200);
      }),
    [conn],
  );
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="toast">
          {t.text}
        </div>
      ))}
    </div>
  );
}
