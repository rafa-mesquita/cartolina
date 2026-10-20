import type { CSSProperties } from 'react';
import type { CamelioBack, CamelioCard } from '@cartolina/shared';
import { HEX, backLabel, frontLabel } from './cardArt';

type Vars = CSSProperties & Record<`--${string}`, string>;

/** Frente da carta. A marcação é a mesma de `frontHtml` (o `anim.ts` usa a string). */
export function CardFront({ card, w = 64 }: { card: CamelioCard; w?: number }) {
  const label = frontLabel(card);
  const style: Vars = { '--w': `${w}px`, '--c': HEX[card.color] };
  if (card.pair) {
    style['--a'] = HEX[card.pair[0]];
    style['--b'] = HEX[card.pair[1]];
  }
  return (
    <div className={`card front n${card.spheres}`} data-id={card.id} style={style} title={label} aria-label={label}>
      {card.kind !== 'normal' && <span className={`kind kind-${card.kind}`} aria-hidden="true" />}
      <span className="sphs">
        {Array.from({ length: card.spheres }, (_, i) => (
          <span key={i} className="sph" />
        ))}
      </span>
    </div>
  );
}

/** Verso do topo do monte. A marcação é a mesma de `backHtml`. */
export function CardBack({ back, w = 64 }: { back: CamelioBack; w?: number }) {
  const label = backLabel(back);
  if (back.kind === 'normal') {
    const style: Vars = { '--w': `${w}px`, '--c': HEX[back.color] };
    return <div className="card back normal" style={style} title={label} aria-label={label} />;
  }
  if (back.kind === 'bicolor') {
    const style: Vars = { '--w': `${w}px`, '--a': HEX[back.colors[0]], '--b': HEX[back.colors[1]] };
    return (
      <div className="card back bicolor" style={style} title={label} aria-label={label}>
        <span className="num">{back.spheres}</span>
      </div>
    );
  }
  const style: Vars = { '--w': `${w}px` };
  return (
    <div className="card back multi" style={style} title={label} aria-label={label}>
      <span className="num">{back.spheres}</span>
    </div>
  );
}
