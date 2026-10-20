'use strict';
/* Cartas do Cama-Leão em HTML. Referência visual pro C3 (web/src/games/camelio). */
(function () {
  const HEX = { verde: '#4caf50', amarelo: '#f2c230', laranja: '#f08a24', vermelho: '#e04848', roxo: '#8e5cc7', azul: '#3a8fd8' };
  const KIND = { normal: '', bicolor: ' (bicolor)', multi: ' (multicolor)' };
  const esferas = (n) => `${n} ${n === 1 ? 'esfera' : 'esferas'}`;

  /** Frente: a cor de verdade e as esferas. `w` = largura em px. */
  function front(card, w = 64) {
    const label = `${esferas(card.spheres)} ${card.color}${KIND[card.kind]}`;
    const pair = card.pair ? `;--a:${HEX[card.pair[0]]};--b:${HEX[card.pair[1]]}` : '';
    const badge = card.kind === 'normal' ? '' : `<span class="kind kind-${card.kind}" aria-hidden="true"></span>`;
    const sph = '<span class="sph"></span>'.repeat(card.spheres);
    return `<div class="card front n${card.spheres}" data-id="${card.id}" style="--w:${w}px;--c:${HEX[card.color]}${pair}" title="${label}" aria-label="${label}">${badge}<span class="sphs">${sph}</span></div>`;
  }

  /** Verso do topo do monte (`CamelioBack`): só o que dá pra ver. */
  function back(b, w = 64) {
    if (b.kind === 'normal') {
      const label = `carta ${b.color} virada`;
      return `<div class="card back normal" style="--w:${w}px;--c:${HEX[b.color]}" title="${label}" aria-label="${label}"></div>`;
    }
    if (b.kind === 'bicolor') {
      const label = `${esferas(b.spheres)}, ${b.colors[0]} ou ${b.colors[1]}`;
      return `<div class="card back bicolor" style="--w:${w}px;--a:${HEX[b.colors[0]]};--b:${HEX[b.colors[1]]}" title="${label}" aria-label="${label}"><span class="num">${b.spheres}</span></div>`;
    }
    const label = `${esferas(b.spheres)}, qualquer cor`;
    return `<div class="card back multi" style="--w:${w}px" title="${label}" aria-label="${label}"><span class="num">${b.spheres}</span></div>`;
  }

  window.CardArt = { HEX, front, back };
})();
