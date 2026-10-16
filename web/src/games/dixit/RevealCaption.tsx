import { useEffect, useRef, useState } from 'react';
import type { Caption } from './reveal';

/** Legenda numerada da revelação. A caixa fica parada; só o texto troca, com fade. O "pular" fica fora da região viva. */
export function RevealCaption({ caption, onSkip }: { caption: Caption | null; onSkip: () => void }) {
  const [shown, setShown] = useState<Caption | null>(caption);
  const [swap, setSwap] = useState(false);
  const shownRef = useRef<Caption | null>(caption);
  useEffect(() => {
    const show = (c: Caption | null) => {
      shownRef.current = c;
      setShown(c);
      setSwap(false);
    };
    if (!caption) return show(null);
    if (!shownRef.current) return show(caption);
    // Voltou pra legenda que já está na tela (durante uma troca pendente): cancela o fade.
    if (shownRef.current === caption) return setSwap(false);
    setSwap(true);
    const t = setTimeout(() => show(caption), 180);
    return () => clearTimeout(t);
  }, [caption]);
  if (!shown) return null;
  return (
    <div className={`dx-step${swap ? ' swap' : ''}`}>
      <div className="live" role="status">
        <span className="n">{shown.step} de 4</span>
        <span className="t">{shown.parts.map((p, i) => (p.em ? <em key={i}>{p.text}</em> : <span key={i}>{p.text}</span>))}</span>
      </div>
      <button type="button" onClick={onSkip}>
        pular ›
      </button>
    </div>
  );
}
