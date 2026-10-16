import { useEffect, useState } from 'react';
import { fitStage } from './geometry';

/** Escala e largura do palco para a janela atual (acompanha o redimensionamento). */
export function useStageFit(): { scale: number; width: number } {
  const [fit, setFit] = useState(() => fitStage(window.innerWidth, window.innerHeight));
  useEffect(() => {
    // Só troca o estado se mudou (o resize dispara muito e o objeto novo re-renderizaria a mesa à toa).
    const onResize = () =>
      setFit((old) => {
        const next = fitStage(window.innerWidth, window.innerHeight);
        return next.scale === old.scale && next.width === old.width ? old : next;
      });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return fit;
}
