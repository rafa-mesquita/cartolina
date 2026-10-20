import type { CoupCharacter } from '@cartolina/shared';
import { characterArtUrl } from './art';
import { CHARACTER_NAMES } from './names';

/** Tamanhos das cartas: s = cartinha dos oponentes (52×72), m = perdida na sua mão (84×118), l = sua mão (120×168). */
export type CardSize = 's' | 'm' | 'l';

/** Verso: vermelho com um emblema (círculo e estrela). */
function Emblem() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="16" fill="none" stroke="#efe6d2" strokeWidth="2.5" />
      <path d="M20 8.5l3.2 7.6 8.2.6-6.3 5.3 2 8-7.1-4.4-7.1 4.4 2-8-6.3-5.3 8.2-.6z" fill="#efe6d2" />
    </svg>
  );
}

/** Verso de uma carta (as escondidas dos outros). */
export function CardBack({ size }: { size: CardSize }) {
  return (
    <span className={`cp-card back ${size}`} aria-hidden="true">
      <Emblem />
    </span>
  );
}

/**
 * Miolo da frente: a arte do Flow preenchendo a carta e, se `band`, o nome numa faixa preta embaixo (o leitor de tela
 * lê o `alt`, a faixa é só pros olhos). Também usado nas cartas clicáveis dos painéis.
 */
export function CardArt({ card, alt, band = true }: { card: CoupCharacter; alt: string; band?: boolean }) {
  return (
    <>
      <img className="cp-art" src={characterArtUrl(card)} alt={alt} draggable={false} loading="eager" decoding="async" />
      {band && <em aria-hidden="true">{CHARACTER_NAMES[card]}</em>}
    </>
  );
}

/**
 * Frente de uma carta: a arte do personagem com o nome na faixa de baixo. `dead` = perdida (arte apagada em cinza e um
 * risco vermelho na diagonal; o nome vai também no `title`). A pequena (`s`, dos oponentes) mostra só a arte.
 */
export function CardFace({ card, size, dead = false }: { card: CoupCharacter; size: CardSize; dead?: boolean }) {
  const name = CHARACTER_NAMES[card];
  const label = dead ? `${name} (perdida)` : name;
  return (
    <span className={`cp-card face ${size}${dead ? ' dead' : ''}`} title={dead || size === 's' ? label : undefined}>
      <CardArt card={card} alt={label} band={size !== 's'} />
    </span>
  );
}
