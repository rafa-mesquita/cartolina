/** Pintura do fundo (óleo verde-floresta com espirais mostarda), gerada no Google Flow: `web/public/dixit/fundo.webp`. */
const PAINTING = `${import.meta.env.BASE_URL}dixit/fundo.webp`;

/**
 * Fundo pintado do Diquisti: cobre a área toda (`cover`, centralizado). `width`/`height` ficaram da versão em SVG
 * (pinceladas sorteadas) e são ignorados; quem chama não precisa mudar.
 */
export function Brushes(_props: { width?: number; height?: number } = {}) {
  return <div className="dx-bg dx-paint" style={{ backgroundImage: `url(${PAINTING})` }} aria-hidden="true" />;
}
