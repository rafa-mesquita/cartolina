import type { PicturesAction, Work } from '@cartolina/shared';
import { useEffect, useMemo, useRef, useState } from 'react';

/** Rascunho vai pro servidor no máximo a cada tanto (os kits avisam a cada `pointermove`). */
export const DRAFT_INTERVAL_MS = 2000;

export interface Draft {
  /** A obra da bancada (só local). `null` = ainda não mexeu nesta rodada/kit. */
  readonly local: Work | null;
  /** Já mexeu nesta rodada/kit. */
  readonly touched: boolean;
  /** A bancada mudou: guarda e envia o rascunho (espaçado; a última mexida sempre sai). */
  onChange(work: Work): void;
  /** "estou pronto": cancela o rascunho pendente e manda uma só ação `ready` com a obra local. */
  markReady(): void;
  /** "desmarcar pronto": manda `ready` desligado e volta a enviar rascunhos. */
  unready(): void;
  /** O servidor recusou algo: volta a enviar rascunhos sem mandar nada agora. */
  release(): void;
}

interface Slot {
  key: string;
  local: Work | null;
  lastAt: number;
  timer: ReturnType<typeof setTimeout> | null;
  /** Mandou "pronto": mexidas não viram rascunho até desmarcar (ou o servidor recusar). */
  held: boolean;
}

const fresh = (key: string): Slot => ({ key, local: null, lastAt: Number.NEGATIVE_INFINITY, timer: null, held: false });

/**
 * Rascunho da bancada: o local manda; o servidor só serve pra reconectar (o eco nunca recria a bancada).
 * Trocar `key` (rodada:kit) zera tudo, inclusive o envio pendente.
 */
export function useDraft(key: string, send: (a: PicturesAction) => void): Draft {
  const slot = useRef<Slot>(fresh(key));
  // Zera já no render da chave nova: a bancada (filha) monta no efeito dela, antes dos efeitos de quem chama.
  if (slot.current.key !== key) {
    if (slot.current.timer) clearTimeout(slot.current.timer);
    slot.current = fresh(key);
  }
  const sendRef = useRef(send);
  sendRef.current = send;
  const [touchedKey, setTouchedKey] = useState<string | null>(null);

  useEffect(() => () => void (slot.current.timer && clearTimeout(slot.current.timer)), []);

  const api = useMemo(() => {
    const flush = (s: Slot) => {
      if (!s.local || s.held || slot.current !== s) return;
      s.lastAt = Date.now();
      sendRef.current({ type: 'draft', work: s.local });
    };
    return {
      onChange(work: Work) {
        const s = slot.current;
        s.local = work;
        setTouchedKey(s.key);
        if (s.held || s.timer) return;
        const wait = s.lastAt + DRAFT_INTERVAL_MS - Date.now();
        if (wait <= 0) return flush(s);
        s.timer = setTimeout(() => {
          s.timer = null;
          flush(s);
        }, wait);
      },
      markReady() {
        const s = slot.current;
        if (s.timer) clearTimeout(s.timer);
        s.timer = null;
        s.held = true;
        sendRef.current(s.local ? { type: 'ready', on: true, work: s.local } : { type: 'ready', on: true });
      },
      unready() {
        slot.current.held = false;
        sendRef.current({ type: 'ready', on: false });
      },
      release() {
        slot.current.held = false;
      },
    };
  }, []);

  return {
    get local() {
      return slot.current.local;
    },
    touched: touchedKey === key,
    ...api,
  };
}
