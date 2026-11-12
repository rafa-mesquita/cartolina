import { useIsLandscapePhone, useIsPortraitPhone } from '../lib/device';

/**
 * Celular na orientação errada pro jogo (`phoneOrientation` do catálogo): o de jogar em pé pede pra ficar em pé, o de
 * jogar deitado (Tatubum) pede pra deitar. Fica por cima, sem desmontar nada.
 */
export function RotateNotice({ orientation = 'portrait' }: { orientation?: 'portrait' | 'landscape' }) {
  const lying = useIsLandscapePhone();
  const standing = useIsPortraitPhone();
  const wrong = orientation === 'landscape' ? standing : lying;
  if (!wrong) return null;
  return (
    <div className="rotate-notice" role="alert">
      <p>{orientation === 'landscape' ? 'vira o celular deitado 📱↔' : 'vira o celular em pé 📱'}</p>
    </div>
  );
}
