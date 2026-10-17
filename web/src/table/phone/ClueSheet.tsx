import { CLUE_MAX, type ItoRoomView } from '@cartolina/shared';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { GameConn } from '../../net/connection';
import './phone.css';

const CLUE_DEBOUNCE_MS = 350;
/** `fx.activity` 'writing' no máximo uma vez a cada tanto (igual ao computador). */
const ACTIVITY_THROTTLE_MS = 1500;

export interface ClueSheetHandle {
  /** Manda agora a dica pendente (antes de a carta ir pra fila). */
  flush(): void;
}

/**
 * No iOS o teclado não encolhe a janela: ele cobre o painel fixo. Mede o quanto o `visualViewport` perdeu
 * embaixo e guarda em `--kb` (o CSS usa de `padding-bottom`). Sem `visualViewport`, fica em 0.
 */
function useKeyboardOffset(target: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const vv = window.visualViewport;
    const el = target.current;
    if (!vv || !el) return;
    const update = () => el.style.setProperty('--kb', `${Math.max(0, window.innerHeight - vv.height - vv.offsetTop)}px`);
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [target]);
}

export const ClueSheet = forwardRef<ClueSheetHandle, { view: ItoRoomView; cardId: string; conn: GameConn; onClose(): void }>(function ClueSheet(
  { view, cardId, conn, onClose },
  ref,
) {
  const card = view.game.cards[cardId];
  const [text, setText] = useState(card?.clue ?? '');
  const area = useRef<HTMLTextAreaElement>(null);
  const veil = useRef<HTMLDivElement>(null);
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

  useKeyboardOffset(veil);

  // Layout effect: no iOS o teclado só abre se o foco vem dentro do gesto de toque. Ao fechar, o foco volta a quem abriu.
  useLayoutEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    area.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
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
    <div ref={veil} className="p-sheet-veil" onClick={close}>
      <div className="p-sheet" role="dialog" aria-modal="true" aria-label="dica da carta" onClick={(e) => e.stopPropagation()}>
        <p className="p-sheet-num">{card?.value}</p>
        <textarea
          ref={area}
          aria-label={`dica do ${card?.value ?? ''}`}
          rows={3}
          maxLength={CLUE_MAX}
          placeholder="escreve uma dica…"
          spellCheck={false}
          value={text}
          readOnly={locked}
          onChange={(e) => onChange(e.target.value)}
        />
        {locked && <p className="p-sheet-note">tira a carta da fila pra mudar a dica</p>}
        <button type="button" className="btn" onClick={close}>
          ok
        </button>
      </div>
    </div>
  );
});
