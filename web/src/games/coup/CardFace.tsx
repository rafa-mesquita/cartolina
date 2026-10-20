import type { CoupCharacter } from '@cartolina/shared';
import { CHARACTER_ICONS, CHARACTER_NAMES } from './names';

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
 * Frente de uma carta: ícone vermelho + nome. `dead` = perdida (papel riscado); a pequena perdida mostra só o ícone,
 * com o nome no `title`.
 */
export function CardFace({ card, size, dead = false }: { card: CoupCharacter; size: CardSize; dead?: boolean }) {
  const name = CHARACTER_NAMES[card];
  if (dead && size === 's') {
    return (
      <span className="cp-card s dead" title={`${name} (perdida)`}>
        <i className={`ti ${CHARACTER_ICONS[card]}`} aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className={`cp-card ${size}${dead ? ' dead' : ''}`} title={dead ? `${name} (perdida)` : undefined}>
      <i className={`ti ${CHARACTER_ICONS[card]}`} aria-hidden="true" />
      <em>{name}</em>
    </span>
  );
}
