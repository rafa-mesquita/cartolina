import { CLUE_MAX, type ItoRoomView } from '@cartolina/shared';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { GameConn } from '../../net/connection';
import './phone.css';

const CLUE_DEBOUNCE_MS = 350;
/** `fx.activity` 'writing' no máximo uma vez a cada tanto (igual ao computador). */
const ACTIVITY_THROTTLE_MS = 1500;

export interface ClueSheetHandle {
  /** Manda agora a dica pendente (antes de a carta ir pra fila). */
  flush(): void;
}

export const ClueSheet = forwardRef<ClueSheetHandle, { view: ItoRoomView; cardId: string; conn: GameConn; onClose(): void }>(function ClueSheet(
  { view, cardId, conn, onClose },
  ref,
) {
  const card = view.game.cards[cardId];
  const [text, setText] = useState(card?.clue ?? '');
  const area = useRef<HTMLTextAreaElement>(null);
  const timer = useRef(0);
  const pending = useRef<string | null>(null);
  const lastActivity = useRef(-Infinity);
  /** Com a carta na fila a dica não muda: o servidor recusaria. */
  const locked = view.game.row.includes(cardId) || view.game.phase !== 'sorting';
  const latest = useRef({ clue: card?.clue ?? '', conn, locked, onClose });
  useEffect(() => {
    latest.current = { clue: card?.clue ?? '', conn, locked, onClose };
  });

  /** Manda a dica pendente agora. Dica igual à do servidor não vai (cada envio tira o autor do "pronto"). */
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const value = pending.current;
    pending.current = null;
    const { clue, conn: c, locked: isLocked } = latest.current;
    if (value !== null && !isLocked && value !== clue) c.sendAction({ type: 'clue', cardId, text: value });
  }, [cardId]);
  useImperativeHandle(ref, () => ({ flush }), [flush]);
  useEffect(() => flush, [flush]);

  const close = useCallback(() => {
    flush();
    latest.current.onClose();
  }, [flush]);

  useEffect(() => {
    area.current?.focus();
  }, []);

  // Esc fecha de qualquer ponto do painel (o foco pode ter saído do campo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

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
    <div className="p-sheet-veil" onClick={close}>
      <div className="p-sheet" role="dialog" aria-label="dica da carta" onClick={(e) => e.stopPropagation()}>
        <p className="p-sheet-num">{card?.value}</p>
        <textarea
          ref={area}
          rows={3}
          maxLength={CLUE_MAX}
          placeholder="escreve uma dica…"
          spellCheck={false}
          value={text}
          readOnly={locked}
          onChange={(e) => onChange(e.target.value)}
        />
        <button type="button" className="btn" onClick={close}>
          ok
        </button>
      </div>
    </div>
  );
});
