// Protótipo: as três identidades visuais. Cada tema desenha as mesmas coisas do seu jeito.

// ---------- ícones (caixa 100×100, centro 50,50) ----------
function icon(kind, s) {
  const st = `stroke="${s.ink}" stroke-width="${s.sw}" stroke-linejoin="round" stroke-linecap="round"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''}`;
  const f = s.fill;
  const f2 = s.fill2 ?? s.fill;
  switch (kind) {
    case 'mata':
    case 'madeira':
      return `<path d="M36 14 L54 44 H45 L58 66 H14 L27 44 H18 Z" fill="${f}" ${st}/><rect x="32" y="66" width="8" height="16" fill="${f}" ${st}/>
        <path d="M68 28 L82 52 H75 L86 70 H50 L61 52 H54 Z" fill="${f2}" ${st}/><rect x="65" y="70" width="7" height="12" fill="${f2}" ${st}/>`;
    case 'algodao':
      return `<path d="M50 88 V58" fill="none" ${st}/><path d="M50 70 Q34 70 30 58 M50 66 Q66 66 70 56" fill="none" ${st}/>
        <circle cx="38" cy="40" r="14" fill="${f2}" ${st}/><circle cx="62" cy="40" r="14" fill="${f2}" ${st}/><circle cx="50" cy="26" r="14" fill="${f2}" ${st}/><circle cx="50" cy="48" r="11" fill="${f2}" ${st}/>`;
    case 'peixe':
      return `<path d="M14 50 Q40 22 70 50 Q40 78 14 50 Z" fill="${f}" ${st}/><path d="M70 50 L88 34 L86 66 Z" fill="${f}" ${st}/>
        <circle cx="30" cy="46" r="3.5" fill="${s.ink}"/><path d="M44 38 Q50 50 44 62" fill="none" ${st}/>`;
    case 'la':
      return `<circle cx="38" cy="50" r="13" fill="${f2}" ${st}/><circle cx="56" cy="44" r="14" fill="${f2}" ${st}/><circle cx="62" cy="60" r="12" fill="${f2}" ${st}/><circle cx="42" cy="64" r="11" fill="${f2}" ${st}/>
        <ellipse cx="78" cy="44" rx="9" ry="11" fill="${f}" ${st}/><path d="M40 74 V86 M60 72 V86" fill="none" ${st}/>`;
    case 'milho':
      return `<path d="M50 90 V70" fill="none" ${st}/><ellipse cx="50" cy="44" rx="14" ry="30" fill="${f2}" ${st}/>
        <path d="M38 34 H62 M37 44 H63 M38 54 H62 M44 18 V68 M56 18 V68" fill="none" ${st} stroke-width="${s.sw * 0.6}"/>
        <path d="M50 88 Q26 76 24 46 Q38 62 50 70 M50 88 Q74 76 76 46 Q62 62 50 70" fill="${f}" ${st}/>`;
    case 'mandioca':
      return `<path d="M30 30 Q46 50 40 88 Q30 60 22 36 Z" fill="${f2}" ${st}/><path d="M50 30 Q62 56 62 90 Q48 62 42 34 Z" fill="${f2}" ${st}/><path d="M66 28 Q84 50 82 78 Q68 56 58 32 Z" fill="${f2}" ${st}/>
        <path d="M46 28 L30 10 M48 28 L50 6 M50 28 L70 10" fill="none" ${st}/>`;
    case 'barreiro':
    case 'barro':
      return `<rect x="16" y="58" width="32" height="16" fill="${f}" ${st}/><rect x="52" y="58" width="32" height="16" fill="${f}" ${st}/>
        <rect x="34" y="40" width="32" height="16" fill="${f2}" ${st}/><rect x="16" y="22" width="32" height="16" fill="${f}" ${st}/><rect x="52" y="22" width="32" height="16" fill="${f2}" ${st}/>`;
    case 'serra':
    case 'pedra':
      return `<path d="M8 80 L36 28 L50 50 L64 34 L92 80 Z" fill="${f}" ${st}/><path d="M28 42 L36 28 L44 42 L38 38 L33 44 Z M58 42 L64 34 L70 44 L64 41 Z" fill="${s.light}" ${st} stroke-width="${s.sw * 0.6}"/>`;
    case 'mandacaru':
      return `<path d="M44 86 V26 Q44 18 50 18 Q56 18 56 26 V86 Z" fill="${f}" ${st}/><path d="M44 58 H34 Q28 58 28 52 V38 Q28 33 32 33 Q36 33 36 38 V50 H44 M56 50 H64 V34 Q64 29 68 29 Q72 29 72 34 V50 Q72 58 66 58 H56" fill="${f}" ${st}/>
        <path d="M14 86 H86" fill="none" ${st}/>`;
    case 'duna':
      return `<circle cx="66" cy="34" r="12" fill="${f2}" ${st}/><path d="M8 72 Q30 50 52 66 Q70 52 92 70" fill="none" ${st}/><path d="M18 84 Q40 70 62 82 Q76 74 90 82" fill="none" ${st}/>`;
    case 'sol':
      return `<circle cx="50" cy="50" r="16" fill="${f2}" ${st}/><path d="M50 16 V26 M50 74 V84 M16 50 H26 M74 50 H84 M26 26 L33 33 M67 67 L74 74 M26 74 L33 67 M67 33 L74 26" fill="none" ${st}/>`;
    case 'causo':
      return `<rect x="22" y="14" width="56" height="72" rx="6" fill="${f2}" ${st}/><path d="M50 30 L56 44 L70 44 L59 53 L63 68 L50 59 L37 68 L41 53 L30 44 L44 44 Z" fill="${f}" ${st} stroke-width="${s.sw * 0.6}"/>`;
    case 'catingueira':
      // Árvore seca retorcida da caatinga, com folhinhas miúdas.
      return `<path d="M50 90 Q45 72 52 60 Q58 48 47 38 M52 60 Q66 52 72 36 M47 38 Q38 30 27 32 M47 38 Q50 25 58 16 M72 36 Q79 30 86 32 M27 32 Q20 28 17 19 M58 16 Q63 12 66 6" fill="none" stroke="${s.ink}" stroke-width="${s.sw * 1.5}" stroke-linecap="round"/>
        <g fill="${f}"><circle cx="17" cy="17" r="4"/><circle cx="66" cy="6" r="4"/><circle cx="87" cy="31" r="4"/><circle cx="27" cy="31" r="3.5"/><circle cx="72" cy="35" r="3.5"/><circle cx="58" cy="15" r="3.5"/></g>
        <path d="M30 90 H70" fill="none" ${st}/>`;
    case 'bode':
      return `<path d="M26 48 L19 41" fill="none" ${st}/><ellipse cx="46" cy="55" rx="22" ry="13" fill="${f2}" ${st}/>
        <path d="M34 66 V84 M42 67 V84 M54 67 V84 M61 65 V84" fill="none" ${st}/>
        <path d="M64 50 Q66 38 76 36 Q86 38 86 46 Q84 54 76 56 Q68 56 64 50 Z" fill="${f2}" ${st}/>
        <path d="M74 37 Q70 24 60 22 M80 37 Q80 26 72 20" fill="none" ${st}/><path d="M80 55 L79 66" fill="none" ${st}/>
        <circle cx="79" cy="44" r="2.6" fill="${s.ink}"/>`;
    case 'feijao':
      return `<path d="M50 90 V40 M50 62 Q36 58 30 46 M50 54 Q64 50 70 38" fill="none" ${st}/>
        <path d="M50 40 Q38 30 44 16 Q56 24 50 40 Z M30 46 Q16 42 16 28 Q30 30 30 46 Z M70 38 Q84 36 86 22 Q72 22 70 38 Z" fill="${f}" ${st}/>
        <path d="M50 70 Q30 72 22 88 Q40 86 50 72 Z" fill="${f2}" ${st}/><path d="M50 66 Q70 66 80 82 Q62 82 50 68 Z" fill="${f2}" ${st}/>`;
    case 'pote':
      return `<path d="M36 22 H64 V30 Q82 42 80 62 Q76 86 50 88 Q24 86 20 62 Q18 42 36 30 Z" fill="${f2}" ${st}/>
        <path d="M32 22 H68" fill="none" ${st}/><path d="M26 54 Q50 62 74 54" fill="none" ${st} stroke-width="${s.sw * 0.7}"/><path d="M28 64 Q50 72 72 64" fill="none" ${st} stroke-width="${s.sw * 0.7}"/>`;
    case 'lajedo':
      return `<path d="M8 84 Q10 58 34 56 Q46 40 64 48 Q88 50 92 84 Z" fill="${f}" ${st}/><path d="M40 56 Q48 46 58 50 M64 62 Q72 58 80 64 M22 70 Q28 66 34 70" fill="none" ${st} stroke-width="${s.sw * 0.7}"/>
        <path d="M58 48 Q60 30 74 28 Q84 32 82 46" fill="${f2}" ${st}/>`;
    case 'rachado':
      return `<circle cx="74" cy="24" r="11" fill="${f2}" ${st}/>
        <path d="M8 58 L28 52 L44 62 L62 52 L92 60 M28 52 L24 40 M44 62 L42 84 M62 52 L70 40 M62 52 L76 82 M44 62 L24 82" fill="none" ${st}/>`;
    default:
      return '';
  }
}

const pip = (n) => 6 - Math.abs(7 - n);

function hexPath(pts, k = 1, cx = 0, cy = 0) {
  return 'M' + pts.map((p) => `${cx + (p.x - cx) * k},${cy + (p.y - cy) * k}`).join(' L') + ' Z';
}

const svgIcon = (kind, s, size = 40) => `<svg viewBox="0 0 100 100" width="${size}" height="${size}">${icon(kind, s)}</svg>`;

function diceFace(n) {
  const P = { 1: [[50, 50]], 2: [[30, 30], [70, 70]], 3: [[28, 28], [50, 50], [72, 72]], 4: [[30, 30], [70, 30], [30, 70], [70, 70]], 5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]], 6: [[30, 26], [70, 26], [30, 50], [70, 50], [30, 74], [70, 74]] };
  return P[n].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9"/>`).join('');
}

// ============================================================
// A) Sertãozim — xilogravura de cordel
// ============================================================
const A = {
  id: 'a',
  nome: 'Sertãozim',
  sub: 'o sertão vai virar vila',
  fonts: 'family=Alfa+Slab+One&family=Bitter:wght@500;700',
  colors: ['#b3261e', '#2c4f86', '#3f7d3a', '#e2a51c'],
  terrenos: { mata: 'mata', pasto: 'algodoal', roca: 'milharal', barreiro: 'barreiro', serra: 'serra', deserto: 'lajedo' },
  recursos: { madeira: 'madeira', barro: 'barro', pasto: 'algodão', roca: 'milho', pedra: 'pedra' },
  icons: { pasto: 'algodao', roca: 'milho', deserto: 'mandacaru' },
  pecas: { estrada: 'estrada', aldeia: 'sítio', cidade: 'vila', carta: 'causo' },
  ladrao: 'Saci',
  defs: `
    <filter id="a-talho" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="3.2" xChannelSelector="R" yChannelSelector="G"/></filter>
    <pattern id="a-hach" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="none"/><path d="M0 0 V7" stroke="#1b1712" stroke-width="1.6" opacity=".55"/></pattern>
    <pattern id="a-risco" width="9" height="9" patternUnits="userSpaceOnUse"><path d="M0 4.5 H5" stroke="#1b1712" stroke-width="1.4" opacity=".45"/></pattern>
    <pattern id="a-ponto" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.3" fill="#1b1712" opacity=".4"/><circle cx="8" cy="8" r="1.3" fill="#1b1712" opacity=".4"/></pattern>
    <pattern id="a-vert" width="6" height="12" patternUnits="userSpaceOnUse"><path d="M3 0 V7" stroke="#1b1712" stroke-width="1.5" opacity=".4"/></pattern>
    <pattern id="a-onda" width="40" height="18" patternUnits="userSpaceOnUse"><path d="M0 9 Q10 2 20 9 T40 9" fill="none" stroke="#1b1712" stroke-width="2" opacity=".55"/></pattern>`,
  fill: { mata: '#4f6b3a', pasto: '#efe6cf', roca: '#d9a63a', barreiro: '#b5532f', serra: '#857d70', deserto: '#cfae72' },
  tex: { mata: 'a-hach', pasto: 'a-ponto', roca: 'a-vert', barreiro: 'a-risco', serra: 'a-hach', deserto: 'a-ponto' },
  iconStyle: { ink: '#1b1712', fill: '#1b1712', fill2: '#f3e7c9', light: '#f3e7c9', sw: 4 },
  hex(h) {
    const ic = this.icons[h.terrain] ?? h.terrain;
    return `<g filter="url(#a-talho)">
      <path d="${hexPath(h.pts)}" fill="${this.fill[h.terrain]}" stroke="#1b1712" stroke-width="5"/>
      <path d="${hexPath(h.pts, 0.84, h.x, h.y)}" fill="url(#${this.tex[h.terrain]})" stroke="#1b1712" stroke-width="1.6" stroke-dasharray="2 5"/>
      <g transform="translate(${h.x - 26},${h.y - (h.number ? 52 : 30)}) scale(.52)">${icon(ic, this.iconStyle)}</g></g>`;
  },
  ocean(o) {
    return `<path d="${hexPath(o.pts)}" fill="#e6d6b0" stroke="#1b1712" stroke-width="1.5" stroke-opacity=".25"/><path d="${hexPath(o.pts, 0.9, o.x, o.y)}" fill="url(#a-onda)"/>`;
  },
  token(h) {
    const red = h.number === 6 || h.number === 8;
    const dots = Array.from({ length: pip(h.number) }, (_, i) => `<circle cx="${h.x + (i - (pip(h.number) - 1) / 2) * 5}" cy="${h.y + 26}" r="1.8" fill="${red ? '#a8231b' : '#1b1712'}"/>`).join('');
    return `<g filter="url(#a-talho)"><circle cx="${h.x}" cy="${h.y + 10}" r="22" fill="#f3e7c9" stroke="#1b1712" stroke-width="4"/>
      <text x="${h.x}" y="${h.y + 18}" text-anchor="middle" font-family="Alfa Slab One" font-size="21" fill="${red ? '#a8231b' : '#1b1712'}">${h.number}</text>${dots}</g>`;
  },
  port(p, label) {
    return `<g filter="url(#a-talho)"><path d="M${p.a.x},${p.a.y} L${p.x},${p.y} L${p.b.x},${p.b.y}" fill="none" stroke="#1b1712" stroke-width="4" stroke-dasharray="7 4"/>
      <rect x="${p.x - 24}" y="${p.y - 15}" width="48" height="30" fill="#f3e7c9" stroke="#1b1712" stroke-width="3"/>
      ${p.type === '3:1' ? `<text x="${p.x}" y="${p.y + 7}" text-anchor="middle" font-family="Alfa Slab One" font-size="17" fill="#1b1712">3:1</text>`
        : `<text x="${p.x - 7}" y="${p.y + 6}" text-anchor="middle" font-family="Alfa Slab One" font-size="14" fill="#1b1712">2:1</text><g transform="translate(${p.x + 4},${p.y - 11}) scale(.22)">${icon(label, this.iconStyle)}</g>`}</g>`;
  },
  road(rd, c) {
    return `<line x1="${rd.a.x}" y1="${rd.a.y}" x2="${rd.b.x}" y2="${rd.b.y}" stroke="#1b1712" stroke-width="13" stroke-linecap="square"/><line x1="${rd.a.x}" y1="${rd.a.y}" x2="${rd.b.x}" y2="${rd.b.y}" stroke="${c}" stroke-width="7" stroke-linecap="square"/>`;
  },
  settle(x, y, c) {
    return `<g transform="translate(${x},${y})" filter="url(#a-talho)"><path d="M-12 9 V-4 L0 -15 L12 -4 V9 Z" fill="${c}" stroke="#1b1712" stroke-width="3.5"/><rect x="-3" y="1" width="6" height="8" fill="#1b1712"/></g>`;
  },
  city(x, y, c) {
    return `<g transform="translate(${x},${y})" filter="url(#a-talho)"><path d="M-18 11 V-3 L-8 -11 L0 -4 V-16 L7 -25 L14 -16 V11 Z" fill="${c}" stroke="#1b1712" stroke-width="3.5"/><path d="M5 -10 H9 M7 -12 V-6" stroke="#1b1712" stroke-width="2"/><rect x="-11" y="2" width="6" height="9" fill="#1b1712"/></g>`;
  },
  robber(x, y) {
    // Saci em silhueta de xilogravura: gorro vermelho, uma perna, cachimbo.
    return `<g transform="translate(${x - 22},${y - 34})" filter="url(#a-talho)">
      <ellipse cx="22" cy="66" rx="16" ry="4" fill="#1b1712" opacity=".35"/>
      <path d="M20 40 Q14 52 20 64 H26 Q24 52 26 40 Z" fill="#1b1712"/>
      <path d="M10 26 Q12 18 22 18 Q32 18 34 26 L32 44 H12 Z" fill="#1b1712"/>
      <circle cx="22" cy="12" r="9" fill="#1b1712"/>
      <path d="M12 8 Q16 -10 34 -6 Q26 -2 30 6 Z" fill="#b3261e" stroke="#1b1712" stroke-width="2"/>
      <circle cx="25" cy="11" r="1.8" fill="#f3e7c9"/>
      <path d="M28 16 H38 V12" stroke="#f3e7c9" stroke-width="2" fill="none"/>
      <path d="M38 8 Q42 2 38 -4" stroke="#1b1712" stroke-width="1.6" fill="none" opacity=".7"/></g>`;
  },
};

// ============================================================
// B) Ilhota — azulejo e aquarela
// ============================================================
const B = {
  id: 'b',
  nome: 'Ilhota',
  sub: 'uma ilha, quatro vilas de pescador',
  fonts: 'family=Fraunces:opsz,wght@9..144,600;9..144,800&family=Nunito:wght@600;800',
  colors: ['#e2577f', '#f0b53a', '#1f9e95', '#e8743b'],
  terrenos: { mata: 'mata', pasto: 'pesqueiro', roca: 'mandiocal', barreiro: 'barreiro', serra: 'pedreira', deserto: 'duna' },
  recursos: { madeira: 'madeira', barro: 'barro', pasto: 'peixe', roca: 'mandioca', pedra: 'pedra' },
  icons: { pasto: 'peixe', roca: 'mandioca', deserto: 'duna' },
  pecas: { estrada: 'trilha', aldeia: 'casinha', cidade: 'vila', carta: 'maré' },
  ladrao: 'Onça',
  defs: `
    <filter id="b-aq" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.022" numOctaves="3" seed="4" result="t"/>
      <feDisplacementMap in="SourceGraphic" in2="t" scale="8" xChannelSelector="R" yChannelSelector="G" result="d"/>
      <feTurbulence type="fractalNoise" baseFrequency="0.07" numOctaves="4" seed="9" result="g"/>
      <feColorMatrix in="g" type="matrix" values="0 0 0 0 0.2  0 0 0 0 0.18  0 0 0 0 0.3  0 0 0 .7 -.2" result="ga"/>
      <feComposite in="ga" in2="d" operator="in" result="gi"/>
      <feMerge><feMergeNode in="d"/><feMergeNode in="gi"/></feMerge></filter>
    <pattern id="b-azul" width="38" height="38" patternUnits="userSpaceOnUse">
      <rect width="38" height="38" fill="#f4f7fb"/>
      <path d="M0 0 H10 A10 10 0 0 1 0 10 Z M38 0 V10 A10 10 0 0 1 28 0 Z M0 38 V28 A10 10 0 0 1 10 38 Z M38 38 H28 A10 10 0 0 1 38 28 Z" fill="#1f4e9c"/>
      <circle cx="19" cy="19" r="4" fill="#1f4e9c"/><circle cx="19" cy="11" r="3" fill="none" stroke="#1f4e9c" stroke-width="1.6"/><circle cx="19" cy="27" r="3" fill="none" stroke="#1f4e9c" stroke-width="1.6"/>
      <circle cx="11" cy="19" r="3" fill="none" stroke="#1f4e9c" stroke-width="1.6"/><circle cx="27" cy="19" r="3" fill="none" stroke="#1f4e9c" stroke-width="1.6"/>
      <rect width="38" height="38" fill="none" stroke="#c9d6ea" stroke-width="1"/></pattern>`,
  fill: { mata: '#6f9a5b', pasto: '#7fb8c9', roca: '#cdb56a', barreiro: '#d2875e', serra: '#9aa1a8', deserto: '#efdcab' },
  iconStyle: { ink: '#1f4e9c', fill: 'rgba(255,255,255,.55)', fill2: 'rgba(255,255,255,.75)', light: '#fff', sw: 3.2 },
  hex(h) {
    const ic = this.icons[h.terrain] ?? h.terrain;
    return `<path d="${hexPath(h.pts)}" fill="#fbf7ee"/>
      <path d="${hexPath(h.pts, 0.95, h.x, h.y)}" fill="${this.fill[h.terrain]}" filter="url(#b-aq)" opacity=".92"/>
      <g transform="translate(${h.x - 24},${h.y - (h.number ? 52 : 28)}) scale(.48)">${icon(ic, this.iconStyle)}</g>`;
  },
  ocean(o) {
    return `<path d="${hexPath(o.pts)}" fill="url(#b-azul)" stroke="#1f4e9c" stroke-width="1" stroke-opacity=".3"/>`;
  },
  token(h) {
    const red = h.number === 6 || h.number === 8;
    const c = red ? '#c0392b' : '#1f4e9c';
    const dots = Array.from({ length: pip(h.number) }, (_, i) => `<circle cx="${h.x + (i - (pip(h.number) - 1) / 2) * 4.6}" cy="${h.y + 25}" r="1.7" fill="${c}"/>`).join('');
    return `<g transform="rotate(45 ${h.x} ${h.y + 10})"><rect x="${h.x - 18}" y="${h.y - 8}" width="36" height="36" rx="3" fill="#fff" stroke="${c}" stroke-width="2.5"/><rect x="${h.x - 14}" y="${h.y - 4}" width="28" height="28" fill="none" stroke="${c}" stroke-width="1" opacity=".5"/></g>
      <text x="${h.x}" y="${h.y + 17}" text-anchor="middle" font-family="Fraunces" font-weight="800" font-size="20" fill="${c}">${h.number}</text>${dots}`;
  },
  port(p, label) {
    return `<path d="M${p.a.x},${p.a.y} L${p.x},${p.y} L${p.b.x},${p.b.y}" fill="none" stroke="#8a5a3b" stroke-width="5" stroke-linecap="round"/>
      <circle cx="${p.x}" cy="${p.y}" r="19" fill="#fff" stroke="#1f4e9c" stroke-width="2.5"/>
      ${p.type === '3:1' ? `<text x="${p.x}" y="${p.y + 5}" text-anchor="middle" font-family="Fraunces" font-weight="800" font-size="14" fill="#1f4e9c">3:1</text>`
        : `<g transform="translate(${p.x - 11},${p.y - 15}) scale(.22)">${icon(label, this.iconStyle)}</g><text x="${p.x}" y="${p.y + 13}" text-anchor="middle" font-family="Fraunces" font-weight="800" font-size="10" fill="#1f4e9c">2:1</text>`}`;
  },
  road(rd, c) {
    return `<line x1="${rd.a.x}" y1="${rd.a.y}" x2="${rd.b.x}" y2="${rd.b.y}" stroke="#fff" stroke-width="12" stroke-linecap="round"/><line x1="${rd.a.x}" y1="${rd.a.y}" x2="${rd.b.x}" y2="${rd.b.y}" stroke="${c}" stroke-width="7" stroke-linecap="round"/>`;
  },
  settle(x, y, c) {
    return `<g transform="translate(${x},${y})"><path d="M-12 10 V-3 L0 -14 L12 -3 V10 Z" fill="${c}" stroke="#fff" stroke-width="3"/><path d="M-14 -2 L0 -16 L14 -2" fill="none" stroke="#b5452a" stroke-width="4" stroke-linecap="round"/><rect x="-3" y="2" width="6" height="8" rx="3" fill="#fff"/></g>`;
  },
  city(x, y, c) {
    return `<g transform="translate(${x},${y})"><path d="M-18 11 V-2 L-9 -10 L0 -2 V-14 L8 -22 L16 -14 V11 Z" fill="${c}" stroke="#fff" stroke-width="3"/><path d="M-1 -13 L8 -24 L18 -13" fill="none" stroke="#b5452a" stroke-width="4" stroke-linecap="round"/><rect x="-12" y="2" width="6" height="9" rx="3" fill="#fff"/><circle cx="8" cy="-6" r="3" fill="#fff"/></g>`;
  },
  robber(x, y) {
    // Onça: cabeça redonda com pintas.
    return `<g transform="translate(${x},${y - 4})">
      <ellipse cx="0" cy="30" rx="18" ry="4" fill="#1f4e9c" opacity=".25"/>
      <circle cx="-15" cy="-14" r="8" fill="#e3a23c" stroke="#3a2a1a" stroke-width="2.5"/><circle cx="15" cy="-14" r="8" fill="#e3a23c" stroke="#3a2a1a" stroke-width="2.5"/>
      <circle cx="0" cy="2" r="22" fill="#e3a23c" stroke="#3a2a1a" stroke-width="2.5"/>
      <ellipse cx="0" cy="12" rx="11" ry="8" fill="#f8ead0"/>
      <circle cx="-8" cy="-2" r="3" fill="#3a2a1a"/><circle cx="8" cy="-2" r="3" fill="#3a2a1a"/><path d="M-4 8 H4 L0 12 Z" fill="#3a2a1a"/>
      <g fill="none" stroke="#3a2a1a" stroke-width="2"><circle cx="-13" cy="-10" r="3"/><circle cx="12" cy="-11" r="3"/><circle cx="-16" cy="6" r="2.5"/><circle cx="16" cy="5" r="2.5"/><circle cx="0" cy="-13" r="2.5"/></g></g>`;
  },
};

// ============================================================
// C) Fuxico — colcha de retalhos
// ============================================================
const C = {
  id: 'c',
  nome: 'Fuxico',
  sub: 'costure sua vila, um retalho por vez',
  fonts: 'family=Fredoka:wght@500;700&family=Patrick+Hand',
  colors: ['#c8362f', '#3b5f8f', '#7a4a8c', '#e07b2a'],
  terrenos: { mata: 'mata', pasto: 'pasto', roca: 'milharal', barreiro: 'barreiro', serra: 'serra', deserto: 'terreiro' },
  recursos: { madeira: 'madeira', barro: 'barro', pasto: 'lã', roca: 'milho', pedra: 'pedra' },
  icons: { pasto: 'la', roca: 'milho', deserto: 'sol' },
  pecas: { estrada: 'estrada', aldeia: 'casinha', cidade: 'vila', carta: 'fuxico' },
  ladrao: 'Saci',
  defs: `
    <filter id="c-som" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="1.5" dy="3" stdDeviation="1.6" flood-color="#3a2a1a" flood-opacity=".35"/></filter>
    <pattern id="c-xadrez" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#e4eedb"/><rect width="8" height="16" fill="#4f8a4b" opacity=".5"/><rect width="16" height="8" fill="#4f8a4b" opacity=".5"/></pattern>
    <pattern id="c-chita" width="30" height="30" patternUnits="userSpaceOnUse"><rect width="30" height="30" fill="#e7b43a"/>
      <g><ellipse cx="4" cy="12" rx="3" ry="1.6" fill="#3f7d3a"/><circle cx="8" cy="8" r="5" fill="#c8362f"/><circle cx="8" cy="8" r="1.8" fill="#fff4d6"/></g>
      <g><ellipse cx="18" cy="26" rx="3" ry="1.6" fill="#3f7d3a"/><circle cx="23" cy="22" r="4" fill="#2f6aa6"/><circle cx="23" cy="22" r="1.5" fill="#fff4d6"/></g></pattern>
    <pattern id="c-miuda" width="18" height="18" patternUnits="userSpaceOnUse"><rect width="18" height="18" fill="#dbe7c2"/><g fill="#fffaf0"><circle cx="5" cy="4" r="1.6"/><circle cx="7" cy="6" r="1.6"/><circle cx="3" cy="6" r="1.6"/><circle cx="5" cy="8" r="1.6"/></g><circle cx="5" cy="6" r="1.2" fill="#e7b43a"/><circle cx="14" cy="14" r="1.4" fill="#c8362f" opacity=".7"/></pattern>
    <pattern id="c-poa" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill="#c2643f"/><circle cx="3.5" cy="3.5" r="2.6" fill="#f1d7c2"/><circle cx="10.5" cy="10.5" r="2.6" fill="#f1d7c2"/></pattern>
    <pattern id="c-jeans" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)"><rect width="8" height="8" fill="#6c7d93"/><path d="M0 2 H8 M0 6 H8" stroke="#8d9cb0" stroke-width="1.6"/></pattern>
    <pattern id="c-juta" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#c9aa79"/><path d="M0 1.5 H6 M1.5 0 V6" stroke="#a88855" stroke-width="1.3"/></pattern>
    <pattern id="c-mar" width="44" height="22" patternUnits="userSpaceOnUse"><rect width="44" height="22" fill="#5e88b2"/><path d="M0 11 Q11 3 22 11 T44 11" fill="none" stroke="#dfeaf5" stroke-width="2" stroke-dasharray="4 4" opacity=".75"/></pattern>`,
  tex: { mata: 'c-xadrez', pasto: 'c-miuda', roca: 'c-chita', barreiro: 'c-poa', serra: 'c-jeans', deserto: 'c-juta' },
  iconStyle: { ink: '#4a3424', fill: '#fff8ea', fill2: '#fff8ea', light: '#fff', sw: 3.5, dash: '' },
  hex(h) {
    const ic = this.icons[h.terrain] ?? h.terrain;
    return `<g filter="url(#c-som)"><path d="${hexPath(h.pts, 0.95, h.x, h.y)}" fill="url(#${this.tex[h.terrain]})" stroke="#5a3d2b" stroke-width="2"/></g>
      <path d="${hexPath(h.pts, 0.85, h.x, h.y)}" fill="none" stroke="#fff8e8" stroke-width="2.4" stroke-dasharray="7 5" stroke-linecap="round"/>
      <g transform="translate(${h.x - 22},${h.y - (h.number ? 50 : 26)})"><circle cx="22" cy="22" r="20" fill="#fff8ea" stroke="#5a3d2b" stroke-width="2" stroke-dasharray="4 3"/><g transform="translate(4,4) scale(.36)">${icon(ic, this.iconStyle)}</g></g>`;
  },
  ocean(o) {
    return `<path d="${hexPath(o.pts)}" fill="url(#c-mar)"/>`;
  },
  token(h) {
    const red = h.number === 6 || h.number === 8;
    const c = red ? '#c8362f' : '#4a3424';
    const dots = Array.from({ length: pip(h.number) }, (_, i) => `<circle cx="${h.x + (i - (pip(h.number) - 1) / 2) * 5}" cy="${h.y + 25}" r="1.7" fill="${c}"/>`).join('');
    return `<g filter="url(#c-som)"><circle cx="${h.x}" cy="${h.y + 11}" r="21" fill="#f6efe0" stroke="#8a6a4a" stroke-width="3"/></g>
      <circle cx="${h.x}" cy="${h.y + 11}" r="16.5" fill="none" stroke="#b39673" stroke-width="1.3" stroke-dasharray="3 2.5"/>
      <circle cx="${h.x - 4}" cy="${h.y - 3}" r="1.6" fill="#8a6a4a"/><circle cx="${h.x + 4}" cy="${h.y - 3}" r="1.6" fill="#8a6a4a"/>
      <text x="${h.x}" y="${h.y + 19}" text-anchor="middle" font-family="Fredoka" font-weight="700" font-size="18" fill="${c}">${h.number}</text>${dots}`;
  },
  port(p, label) {
    return `<path d="M${p.a.x},${p.a.y} L${p.x},${p.y} L${p.b.x},${p.b.y}" fill="none" stroke="#fff8e8" stroke-width="3" stroke-dasharray="5 4"/>
      <g filter="url(#c-som)"><rect x="${p.x - 23}" y="${p.y - 15}" width="46" height="30" rx="8" fill="#f6efe0" stroke="#5a3d2b" stroke-width="2"/></g>
      <rect x="${p.x - 19}" y="${p.y - 11}" width="38" height="22" rx="5" fill="none" stroke="#b39673" stroke-width="1.2" stroke-dasharray="3 2.5"/>
      ${p.type === '3:1' ? `<text x="${p.x}" y="${p.y + 6}" text-anchor="middle" font-family="Fredoka" font-weight="700" font-size="15" fill="#4a3424">3:1</text>`
        : `<text x="${p.x - 7}" y="${p.y + 5}" text-anchor="middle" font-family="Fredoka" font-weight="700" font-size="12" fill="#4a3424">2:1</text><g transform="translate(${p.x + 3},${p.y - 10}) scale(.2)">${icon(label, this.iconStyle)}</g>`}`;
  },
  road(rd, c) {
    // Fio de lã: grosso, arredondado, com torção tracejada por cima.
    return `<g filter="url(#c-som)"><line x1="${rd.a.x}" y1="${rd.a.y}" x2="${rd.b.x}" y2="${rd.b.y}" stroke="${c}" stroke-width="9" stroke-linecap="round"/></g><line x1="${rd.a.x}" y1="${rd.a.y}" x2="${rd.b.x}" y2="${rd.b.y}" stroke="#000" stroke-opacity=".25" stroke-width="9" stroke-dasharray="2 4" stroke-linecap="butt"/>`;
  },
  settle(x, y, c) {
    return `<g transform="translate(${x},${y})"><g filter="url(#c-som)"><path d="M-13 10 V-3 L0 -15 L13 -3 V10 Z" fill="${c}" stroke="#4a3424" stroke-width="2"/></g><path d="M-9 7 V-1.5 L0 -10 L9 -1.5 V7 Z" fill="none" stroke="#fff8e8" stroke-width="1.5" stroke-dasharray="3 2.5"/></g>`;
  },
  city(x, y, c) {
    return `<g transform="translate(${x},${y})"><g filter="url(#c-som)"><path d="M-19 11 V-2 L-9 -11 L0 -3 V-15 L8 -24 L17 -15 V11 Z" fill="${c}" stroke="#4a3424" stroke-width="2"/></g><path d="M-15 7.5 V-0.5 L-9 -6 L-3 -0.5 V7.5 Z M3 7.5 V-13 L8 -19 L13 -13 V7.5 Z" fill="none" stroke="#fff8e8" stroke-width="1.5" stroke-dasharray="3 2.5"/></g>`;
  },
  robber(x, y) {
    // Saci de pano: boneco costurado, gorro de chita, uma perna.
    return `<g transform="translate(${x - 22},${y - 30})">
      <g filter="url(#c-som)">
        <path d="M19 40 Q15 52 19 62 H26 Q24 52 26 40 Z" fill="#5a3d2b"/>
        <path d="M10 26 Q12 18 22 18 Q32 18 34 26 L32 44 H12 Z" fill="#7a5038" stroke="#3a2a1a" stroke-width="1.5"/>
        <circle cx="22" cy="12" r="9" fill="#7a5038" stroke="#3a2a1a" stroke-width="1.5"/>
        <path d="M12 8 Q16 -10 34 -6 Q26 -2 30 6 Z" fill="#c8362f" stroke="#3a2a1a" stroke-width="1.5"/></g>
      <path d="M14 26 Q22 30 30 26" fill="none" stroke="#fff8e8" stroke-width="1.3" stroke-dasharray="2.5 2"/>
      <circle cx="18" cy="5" r="1.6" fill="#fff4d6"/><circle cx="26" cy="0" r="1.4" fill="#fff4d6"/>
      <path d="M19 11 L22 14 M22 11 L19 14 M25 11 L28 14 M28 11 L25 14" stroke="#fff8e8" stroke-width="1.3"/>
      <path d="M28 17 H37 V13" stroke="#e7b43a" stroke-width="2.2" fill="none"/></g>`;
  },
};

// ============================================================
// D) Mandacaru — caatinga ao sol, ilustração chapada; a borda é terra rachada com feiras
// ============================================================
const D = {
  id: 'd',
  nome: 'Mandacaru',
  sub: 'faça a caatinga florir',
  fonts: 'family=Bree+Serif&family=Mulish:wght@600;800',
  colors: ['#b8321f', '#2f6fa8', '#7b4a9a', '#f4efe3'],
  terrenos: { mata: 'caatinga', pasto: 'malhada', roca: 'roçado', barreiro: 'barreiro', serra: 'lajedo', deserto: 'rio seco' },
  recursos: { madeira: 'madeira', barro: 'barro', pasto: 'couro', roca: 'feijão', pedra: 'pedra' },
  icons: { mata: 'catingueira', madeira: 'catingueira', pasto: 'bode', roca: 'feijao', barreiro: 'pote', barro: 'pote', serra: 'lajedo', pedra: 'lajedo', deserto: 'rachado' },
  pecas: { estrada: 'estrada', aldeia: 'casa', cidade: 'vila', carta: 'cordel' },
  ladrao: 'Carcará',
  defs: `
    <filter id="d-som" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="0" flood-color="#5b3a29" flood-opacity=".9"/></filter>
    <pattern id="d-grao" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="2" cy="3" r=".9" fill="#5b3a29" opacity=".18"/><circle cx="8" cy="9" r=".9" fill="#fff" opacity=".25"/><circle cx="9" cy="2" r=".7" fill="#5b3a29" opacity=".12"/></pattern>
    <pattern id="d-racha" width="70" height="60" patternUnits="userSpaceOnUse"><rect width="70" height="60" fill="#d9a56c"/>
      <path d="M0 18 L16 22 L24 10 L40 14 L52 4 M16 22 L20 38 L8 50 M20 38 L38 42 L50 30 L70 34 M38 42 L42 60 M50 30 L52 4 M52 30 L62 50 L70 52" fill="none" stroke="#a86d3c" stroke-width="2" stroke-linejoin="round"/></pattern>
    <linearGradient id="d-sol" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#5b3a29" stop-opacity=".12"/></linearGradient>`,
  fill: { mata: '#8f9c6c', pasto: '#d4b878', roca: '#9db35a', barreiro: '#c8643b', serra: '#aaa49a', deserto: '#e8cd96' },
  rim: { mata: '#67724a', pasto: '#a98c4f', roca: '#728a35', barreiro: '#963f22', serra: '#7c766c', deserto: '#bf9f62' },
  iconStyle: { ink: '#4a2e1f', fill: '#5f7a3a', fill2: '#fbf1dc', light: '#fbf1dc', sw: 3.6 },
  hex(h) {
    const ic = this.icons[h.terrain] ?? h.terrain;
    return `<g filter="url(#d-som)"><path d="${hexPath(h.pts, 0.97, h.x, h.y)}" fill="${this.rim[h.terrain]}" stroke="#5b3a29" stroke-width="2.5"/></g>
      <path d="${hexPath(h.pts, 0.88, h.x, h.y - 2)}" fill="${this.fill[h.terrain]}"/>
      <path d="${hexPath(h.pts, 0.88, h.x, h.y - 2)}" fill="url(#d-grao)"/>
      <path d="${hexPath(h.pts, 0.88, h.x, h.y - 2)}" fill="url(#d-sol)"/>
      <g transform="translate(${h.x - 25},${h.y - (h.number ? 54 : 30)}) scale(.5)">${icon(ic, this.iconStyle)}</g>`;
  },
  ocean(o) {
    return `<path d="${hexPath(o.pts)}" fill="url(#d-racha)"/>`;
  },
  token(h) {
    const red = h.number === 6 || h.number === 8;
    const c = red ? '#b8321f' : '#4a2e1f';
    const dots = Array.from({ length: pip(h.number) }, (_, i) => `<circle cx="${h.x + (i - (pip(h.number) - 1) / 2) * 5}" cy="${h.y + 25}" r="1.8" fill="${c}"/>`).join('');
    return `<g filter="url(#d-som)"><circle cx="${h.x}" cy="${h.y + 10}" r="21" fill="#fbf1dc" stroke="#5b3a29" stroke-width="2.5"/></g>
      <circle cx="${h.x}" cy="${h.y + 10}" r="17" fill="none" stroke="#c8643b" stroke-width="1.5"/>
      <text x="${h.x}" y="${h.y + 17}" text-anchor="middle" font-family="Bree Serif" font-size="20" fill="${c}">${h.number}</text>${dots}`;
  },
  port(p, label) {
    // Feira: barraca de toldo listrado na beira da estrada de terra.
    const x = p.x;
    const y = p.y;
    const stripes = [0, 1, 2, 3, 4, 5].map((i) => `<path d="M${x - 24 + i * 8} ${y - 14} h8 l-2 9 h-8 Z" fill="${i % 2 ? '#fbf1dc' : '#b8321f'}" stroke="#5b3a29" stroke-width="1.2"/>`).join('');
    return `<path d="M${p.a.x},${p.a.y} L${x},${y} L${p.b.x},${p.b.y}" fill="none" stroke="#7a4a2a" stroke-width="5" stroke-linecap="round" stroke-dasharray="1 8"/>
      <g filter="url(#d-som)"><rect x="${x - 23}" y="${y - 6}" width="44" height="22" rx="3" fill="#fbf1dc" stroke="#5b3a29" stroke-width="2"/></g>${stripes}
      ${p.type === '3:1' ? `<text x="${x - 1}" y="${y + 11}" text-anchor="middle" font-family="Bree Serif" font-size="14" fill="#4a2e1f">3:1</text>`
        : `<text x="${x - 9}" y="${y + 11}" text-anchor="middle" font-family="Bree Serif" font-size="12" fill="#4a2e1f">2:1</text><g transform="translate(${x + 2},${y - 5}) scale(.19)">${icon(label, this.iconStyle)}</g>`}`;
  },
  road(rd, c) {
    return `<line x1="${rd.a.x}" y1="${rd.a.y}" x2="${rd.b.x}" y2="${rd.b.y}" stroke="#5b3a29" stroke-width="12" stroke-linecap="round"/><line x1="${rd.a.x}" y1="${rd.a.y}" x2="${rd.b.x}" y2="${rd.b.y}" stroke="${c}" stroke-width="7" stroke-linecap="round"/>`;
  },
  settle(x, y, c) {
    // Casa de taipa: parede na cor do jogador, telhado de telha.
    return `<g transform="translate(${x},${y})"><g filter="url(#d-som)"><path d="M-12 10 V-3 H12 V10 Z" fill="${c}" stroke="#5b3a29" stroke-width="2.2"/></g>
      <path d="M-15 -2 L0 -14 L15 -2 Z" fill="#a4462a" stroke="#5b3a29" stroke-width="2.2" stroke-linejoin="round"/><rect x="-3" y="2" width="6" height="8" fill="#5b3a29"/></g>`;
  },
  city(x, y, c) {
    // Vila: casario com a torre da igrejinha.
    return `<g transform="translate(${x},${y})"><g filter="url(#d-som)"><path d="M-19 11 V-2 H0 V-16 H12 V11 Z" fill="${c}" stroke="#5b3a29" stroke-width="2.2"/></g>
      <path d="M-22 -1 L-10 -11 L2 -1 Z" fill="#a4462a" stroke="#5b3a29" stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M-2 -15 L6 -25 L14 -15 Z" fill="#a4462a" stroke="#5b3a29" stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M6 -10 V-4 M3 -7 H9" stroke="#5b3a29" stroke-width="2"/><rect x="-13" y="3" width="6" height="8" fill="#5b3a29"/></g>`;
  },
  robber(x, y) {
    // Carcará de pé: capuz preto, cara vermelha, peito claro listrado.
    return `<g transform="translate(${x},${y - 2})">
      <ellipse cx="0" cy="30" rx="16" ry="4" fill="#5b3a29" opacity=".3"/>
      <path d="M-4 18 V29 M4 18 V29" stroke="#e8b23a" stroke-width="3" stroke-linecap="round"/>
      <path d="M-8 18 L-13 34 L2 32 L1 18 Z" fill="#3e2a1d" stroke="#2a1c13" stroke-width="1.5"/>
      <path d="M-11 34 L-11 30 M-6 33 L-6 29" stroke="#efe2c4" stroke-width="1.4"/>
      <path d="M-14 4 Q-17 -14 -2 -17 Q13 -17 14 0 Q14 16 1 21 Q-11 18 -14 4 Z" fill="#5a3a26" stroke="#2a1c13" stroke-width="1.8"/>
      <path d="M-1 -15 Q11 -13 11 -1 Q8 7 -1 6 Q-6 -4 -1 -15 Z" fill="#efe2c4"/>
      <path d="M1 -8 H9 M0 -3 H9 M1 2 H8" stroke="#8a6a4a" stroke-width="1.3"/>
      <path d="M-12 -2 Q-8 8 -2 16" fill="none" stroke="#2a1c13" stroke-width="1.5"/>
      <circle cx="2" cy="-24" r="9.5" fill="#efe2c4" stroke="#2a1c13" stroke-width="1.8"/>
      <path d="M-7.5 -26 Q1 -38 11.5 -26 Q2 -30 -7.5 -26 Z" fill="#1d1a17"/>
      <path d="M4 -26 Q12 -27 12 -21 Q8 -18 4 -22 Z" fill="#e0582a"/>
      <circle cx="6" cy="-24" r="1.6" fill="#1d1a17"/>
      <path d="M11 -25 Q19 -23 15 -16 L12.5 -19 Z" fill="#cfc6b2" stroke="#2a1c13" stroke-width="1.2"/></g>`;
  },
};

window.TEMAS = { a: A, b: B, c: C, d: D };
window.HexaArt = { icon, svgIcon, diceFace };
