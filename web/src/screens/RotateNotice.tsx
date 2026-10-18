import { useIsLandscapePhone } from '../lib/device';

/** Celular deitado: a mesa é feita pra jogar em pé. Fica por cima, sem desmontar nada. */
export function RotateNotice() {
  if (!useIsLandscapePhone()) return null;
  return (
    <div className="rotate-notice" role="alert">
      <p>vira o celular em pé 📱</p>
    </div>
  );
}
