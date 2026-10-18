'use strict';
/* Fotos provisórias do protótipo: ícone do tema sobre cor, variando por foto. A foto real, quando existir, ganha. */
(function () {
  /** Ícones de alguns temas; tema fora do mapa cai no ícone genérico (a cor sai do nome do tema). */
  const THEME = {
    cachorro: ['ti-dog', 'ti-paw'], gato: ['ti-cat', 'ti-paw'], pizza: ['ti-pizza'], farol: ['ti-building-lighthouse'],
    bicicleta: ['ti-bike'], arvore: ['ti-tree'], praia: ['ti-beach'], bola: ['ti-ball-football'], trem: ['ti-train'],
    onibus: ['ti-bus'], abajur: ['ti-lamp'], neve: ['ti-snowflake'], fogo: ['ti-flame'], relogio: ['ti-clock'],
  };
  const FALLBACK = ['ti-photo'];
  const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
  const byId = new Map(Retratim.PICTURES_DECK.map((p) => [p.id, p]));
  /** Fotos reais que já deram 404 nesta página: não pede de novo (menos ruído no console). */
  const missing = new Set();
  window.photoMissing = (img) => { missing.add(img.dataset.id); img.remove(); };
  /**
   * HTML de uma foto (placeholder + tentativa da real). Ocupa 100% do contêiner (que deve ser 4:3).
   * O ícone escala com a foto: `--s` é a altura do ícone em % da foto (o `.ph` é um contêiner de tamanho, `cqh`).
   */
  window.photoHTML = function (id) {
    const p = byId.get(id); const h = hash(id);
    const t = { hue: hash(p.theme) % 360, icons: THEME[p.theme] || FALLBACK };
    const icon = t.icons[h % t.icons.length];
    const light = 62 + (h >> 4) % 18, sat = 30 + (h >> 9) % 25;
    const size = 46 + (h >> 13) % 26, rot = ((h >> 17) % 31) - 15, dx = ((h >> 21) % 30) - 15, dy = ((h >> 25) % 20) - 10;
    const n = id.slice(1);
    return `<div class="ph" style="background:hsl(${t.hue} ${sat}% ${light}%)">`
      + `<i class="ti ${icon}" style="--s:${size};transform:translate(${dx}%,${dy}%) rotate(${rot}deg)"></i>`
      + `<span class="ph-cap">${(Retratim.PICTURES_THEME_NAMES || {})[p.theme] || p.theme} · ${n}</span>`
      + (missing.has(id) ? '' : `<img src="../../web/public/pictures/fotos/${id}.webp" alt="${(Retratim.PICTURES_THEME_NAMES || {})[p.theme] || ''}" data-id="${id}" onerror="photoMissing(this)">`)
      + `</div>`;
  };
})();
