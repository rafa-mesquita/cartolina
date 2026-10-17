'use strict';
/* Fotos provisórias do protótipo: ícone do tema sobre cor, variando por foto. A foto real, quando existir, ganha. */
(function () {
  const THEME = {
    bichos: { hue: 28, icons: ['ti-dog', 'ti-cat', 'ti-fish', 'ti-butterfly', 'ti-feather', 'ti-paw'] },
    casa: { hue: 200, icons: ['ti-armchair', 'ti-lamp', 'ti-cup', 'ti-bed', 'ti-key', 'ti-clock'] },
    comida: { hue: 8, icons: ['ti-pizza', 'ti-apple', 'ti-bread', 'ti-ice-cream', 'ti-coffee', 'ti-cheese'] },
    lugares: { hue: 260, icons: ['ti-building-lighthouse', 'ti-building-church', 'ti-building-bridge', 'ti-tent', 'ti-building-castle', 'ti-home'] },
    transporte: { hue: 220, icons: ['ti-car', 'ti-bike', 'ti-plane', 'ti-bus', 'ti-sailboat', 'ti-train'] },
    natureza: { hue: 110, icons: ['ti-tree', 'ti-mountain', 'ti-flower', 'ti-leaf', 'ti-sun', 'ti-cloud-rain'] },
    gente: { hue: 330, icons: ['ti-hand-stop', 'ti-walk', 'ti-run', 'ti-swimming', 'ti-yoga', 'ti-hand-finger'] },
  };
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
    const p = byId.get(id); const t = THEME[p.theme]; const h = hash(id);
    const icon = t.icons[h % t.icons.length];
    const light = 62 + (h >> 4) % 18, sat = 30 + (h >> 9) % 25;
    const size = 46 + (h >> 13) % 26, rot = ((h >> 17) % 31) - 15, dx = ((h >> 21) % 30) - 15, dy = ((h >> 25) % 20) - 10;
    const n = id.slice(1);
    return `<div class="ph" style="background:hsl(${t.hue} ${sat}% ${light}%)">`
      + `<i class="ti ${icon}" style="--s:${size};transform:translate(${dx}%,${dy}%) rotate(${rot}deg)"></i>`
      + `<span class="ph-cap">${p.theme} · ${n}</span>`
      + (missing.has(id) ? '' : `<img src="../../web/public/pictures/fotos/${id}.webp" alt="" data-id="${id}" onerror="photoMissing(this)">`)
      + `</div>`;
  };
})();
