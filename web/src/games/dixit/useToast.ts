import { useCallback, useEffect, useRef, useState } from 'react';

export interface Toast {
  text: string;
  /** Muda a cada aviso (o mesmo texto de novo reinicia o tempo e a animação). */
  id: number;
}

/** Aviso curto no palco do Diquisti: `say` mostra, e ele some sozinho depois de `ms`. */
export function useToast(ms: number): { toast: Toast | null; say: (text: string) => void } {
  const [toast, setToast] = useState<Toast | null>(null);
  const seq = useRef(0);
  const say = useCallback((text: string) => setToast({ text, id: ++seq.current }), []);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), ms);
    return () => clearTimeout(t);
  }, [toast, ms]);
  return { toast, say };
}
