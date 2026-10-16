import { useState } from 'react';
import { CARD_BACK_SVG, REAL_ART, cardArtSvg, cardImageUrl } from './art';

/** Frente da carta: a arte real (quando existir) ou a pintura provisória gerada pelo id. Se a imagem falhar, cai na pintura. */
export function CardArt({ id }: { id: string }) {
  const [failed, setFailed] = useState(false);
  if (REAL_ART && !failed) return <img className="dx-art" src={cardImageUrl(id)} alt="" draggable={false} onError={() => setFailed(true)} />;
  // SVG gerado localmente a partir do id (nada vindo de jogador): seguro como HTML.
  return <div className="dx-art" dangerouslySetInnerHTML={{ __html: cardArtSvg(id) }} />;
}

export function CardBack() {
  return <div className="dx-art" dangerouslySetInnerHTML={{ __html: CARD_BACK_SVG }} />;
}
