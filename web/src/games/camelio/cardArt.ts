import type { CamelioBack, CamelioCard, CamelioColor, CamelioKind } from '@cartolina/shared';

/** Cor de cada esfera/carta (identidade do protótipo aprovado). */
export const HEX: Record<CamelioColor, string> = {
  verde: '#4caf50',
  amarelo: '#f2c230',
  laranja: '#f08a24',
  vermelho: '#e04848',
  roxo: '#8e5cc7',
  azul: '#3a8fd8',
};

const KIND: Record<CamelioKind, string> = { normal: '', bicolor: ' (bicolor)', multi: ' (multicolor)' };

export const esferas = (n: number): string => `${n} ${n === 1 ? 'esfera' : 'esferas'}`;

/** Texto de acessibilidade da frente: "3 esferas vermelho (bicolor)". */
export const frontLabel = (card: CamelioCard): string => `${esferas(card.spheres)} ${card.color}${KIND[card.kind]}`;

/** Texto de acessibilidade do verso. */
export function backLabel(back: CamelioBack): string {
  if (back.kind === 'normal') return `carta ${back.color} virada`;
  if (back.kind === 'bicolor') return `${esferas(back.spheres)}, ${back.colors[0]} ou ${back.colors[1]}`;
  return `${esferas(back.spheres)}, qualquer cor`;
}

/** Frente: a cor de verdade e as esferas. `w` = largura em px. Mesma marcação de `CardFront`. */
export function frontHtml(card: CamelioCard, w = 64): string {
  const label = frontLabel(card);
  const pair = card.pair ? `;--a:${HEX[card.pair[0]]};--b:${HEX[card.pair[1]]}` : '';
  const badge = card.kind === 'normal' ? '' : `<span class="kind kind-${card.kind}" aria-hidden="true"></span>`;
  const sph = '<span class="sph"></span>'.repeat(card.spheres);
  return `<div class="card front n${card.spheres}" data-id="${card.id}" style="--w:${w}px;--c:${HEX[card.color]}${pair}" title="${label}" aria-label="${label}">${badge}<span class="sphs">${sph}</span></div>`;
}

/** Verso do topo do monte (`CamelioBack`): só o que dá pra ver. Mesma marcação de `CardBack`. */
export function backHtml(back: CamelioBack, w = 64): string {
  const label = backLabel(back);
  if (back.kind === 'normal') {
    return `<div class="card back normal" style="--w:${w}px;--c:${HEX[back.color]}" title="${label}" aria-label="${label}"></div>`;
  }
  if (back.kind === 'bicolor') {
    return `<div class="card back bicolor" style="--w:${w}px;--a:${HEX[back.colors[0]]};--b:${HEX[back.colors[1]]}" title="${label}" aria-label="${label}"><span class="num">${back.spheres}</span></div>`;
  }
  return `<div class="card back multi" style="--w:${w}px" title="${label}" aria-label="${label}"><span class="num">${back.spheres}</span></div>`;
}
