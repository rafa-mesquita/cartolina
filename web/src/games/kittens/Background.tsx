import { useEffect, useRef } from 'react';
import { Cerrado } from './cerrado';

/** Cerrado com ciclo do dia atrás de tudo: a largura do desenho acompanha a proporção da janela (altura fixa de 180). */
export function Background({ seed }: { seed: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let width = 0;
    const draw = () => {
      const w = Math.max(288, Math.round((180 * window.innerWidth) / window.innerHeight));
      // O resize dispara muito: só redesenha quando a largura muda de verdade.
      if (Math.abs(w - width) <= 2) return;
      width = w;
      Cerrado.start(canvas, seed, w);
    };
    draw();
    window.addEventListener('resize', draw);
    return () => {
      window.removeEventListener('resize', draw);
      Cerrado.stop();
    };
  }, [seed]);
  return <canvas ref={ref} className="kt-bg" aria-hidden="true" />;
}
