'use strict';
/* Desenho do estilo D · Mandacaru (portado de temas.js) nas coordenadas da geometria real.
   A geometria (Manda.geometry()) usa unidade = raio do hexágono; aqui tudo é multiplicado por R. */
(function () {
  const R = 58;
  const SQ3 = Math.sqrt(3);
  const INK = '#4a2e1f';
  const LINE = '#5b3a29';
  /** Cores dos jogadores por id (p0 vermelho, p1 azul, p2 roxo, p3 branco). */
  const COLORS = { p0: '#b8321f', p1: '#2f6fa8', p2: '#7b4a9a', p3: '#f4efe3' };

  const FILL = { forest: '#8f9c6c', pasture: '#d4b878', fields: '#9db35a', hills: '#c8643b', mountains: '#aaa49a', desert: '#e8cd96' };
  const RIM = { forest: '#67724a', pasture: '#a98c4f', fields: '#728a35', hills: '#963f22', mountains: '#7c766c', desert: '#bf9f62' };
  const TERRAIN_ICON = { forest: 'catingueira', pasture: 'bode', fields: 'feijao', hills: 'pote', mountains: 'lajedo', desert: 'rachado' };
  const RES_ICON = { wood: 'catingueira', brick: 'pote', leather: 'bode', beans: 'feijao', stone: 'lajedo' };
  const CORDEL_ICON = { vaqueiro: 'chapeu', point: 'igreja', mutirao: 'enxada', chuva: 'chuva', atravessador: 'saco' };
  /** Ícones na tinta do tabuleiro. */
  const STYLE = { ink: INK, fill: '#5f7a3a', fill2: '#fbf1dc', light: '#fbf1dc', sw: 3.6 };
  /** Ícones de xilogravura (creme sobre o bloco escuro do folheto de cordel). */
  const WOODCUT = { ink: '#fbf1dc', fill: '#fbf1dc', fill2: '#2a1c13', light: '#2a1c13', sw: 3.8 };

  const defs = `
    <filter id="d-som" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="0" flood-color="#5b3a29" flood-opacity=".9"/></filter>
    <filter id="d-sombra" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#2a1c13" flood-opacity=".45"/></filter>
    <pattern id="d-grao" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="2" cy="3" r=".9" fill="#5b3a29" opacity=".18"/><circle cx="8" cy="9" r=".9" fill="#fff" opacity=".25"/><circle cx="9" cy="2" r=".7" fill="#5b3a29" opacity=".12"/></pattern>
    <pattern id="d-racha" width="70" height="60" patternUnits="userSpaceOnUse"><rect width="70" height="60" fill="#d9a56c"/>
      <path d="M0 18 L16 22 L24 10 L40 14 L52 4 M16 22 L20 38 L8 50 M20 38 L38 42 L50 30 L70 34 M38 42 L42 60 M50 30 L52 4 M52 30 L62 50 L70 52" fill="none" stroke="#a86d3c" stroke-width="2" stroke-linejoin="round"/></pattern>
    <linearGradient id="d-sol" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#5b3a29" stop-opacity=".12"/></linearGradient>`;

  // ---------- ícones (caixa 100×100, centro 50,50) ----------
  function icon(kind, s) {
    const st = `stroke="${s.ink}" stroke-width="${s.sw}" stroke-linejoin="round" stroke-linecap="round"`;
    const f = s.fill;
    const f2 = s.fill2 ?? s.fill;
    switch (kind) {
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
      case 'causo':
        return `<rect x="22" y="14" width="56" height="72" rx="6" fill="${f2}" ${st}/><path d="M50 30 L56 44 L70 44 L59 53 L63 68 L50 59 L37 68 L41 53 L30 44 L44 44 Z" fill="${f}" ${st} stroke-width="${s.sw * 0.6}"/>`;
      case 'chapeu':
        // Chapéu de couro do vaqueiro, com a meia-lua na frente.
        return `<path d="M8 64 Q50 86 92 64 Q86 56 74 58 Q74 28 50 26 Q26 28 26 58 Q14 56 8 64 Z" fill="${f2}" ${st}/>
          <path d="M27 54 Q50 64 73 54" fill="none" ${st}/><path d="M44 42 Q50 34 56 42 Q50 39 44 42 Z" fill="${s.ink}" ${st} stroke-width="${s.sw * 0.6}"/>
          <path d="M30 34 L38 44 M70 34 L62 44" fill="none" ${st} stroke-width="${s.sw * 0.6}"/>`;
      case 'igreja':
        return `<path d="M16 86 V52 L36 36 L56 52 V86 Z" fill="${f2}" ${st}/><path d="M56 86 V34 L68 20 L80 34 V86 Z" fill="${f2}" ${st}/>
          <path d="M68 6 V16 M63 10 H73" fill="none" ${st}/><path d="M29 86 V72 Q36 62 43 72 V86" fill="none" ${st}/>
          <circle cx="68" cy="46" r="5" fill="none" ${st}/><path d="M8 86 H92" fill="none" ${st}/>`;
      case 'enxada':
        return `<path d="M22 88 L70 24 M78 88 L30 24" fill="none" ${st} stroke-width="${s.sw * 1.3}"/>
          <path d="M60 16 L84 30 L78 38 L58 26 Z" fill="${f2}" ${st}/><path d="M40 16 L16 30 L22 38 L42 26 Z" fill="${f2}" ${st}/>
          <path d="M14 90 H86" fill="none" ${st}/>`;
      case 'chuva':
        return `<path d="M26 56 Q12 56 12 43 Q12 30 28 30 Q32 14 50 14 Q64 14 68 27 Q88 25 88 42 Q88 56 72 56 Z" fill="${f2}" ${st}/>
          <path d="M30 66 L25 76 M50 66 L45 76 M70 66 L65 76 M40 82 L35 92 M60 82 L55 92" fill="none" ${st}/>`;
      case 'saco':
        return `<path d="M38 28 L30 14 H70 L62 28 Q88 44 84 68 Q80 90 50 90 Q20 90 16 68 Q12 44 38 28 Z" fill="${f2}" ${st}/>
          <path d="M36 30 H64" fill="none" ${st}/><circle cx="50" cy="62" r="12" fill="none" ${st}/><path d="M50 54 V70" fill="none" ${st} stroke-width="${s.sw * 0.7}"/>`;
      default:
        return '';
    }
  }

  const svgIcon = (kind, s = STYLE, size = 40) => `<svg viewBox="0 0 100 100" width="${size}" height="${size}">${icon(kind, s)}</svg>`;
  const resIcon = (res, size = 40, s = STYLE) => svgIcon(RES_ICON[res], s, size);
  const pipCount = (n) => 6 - Math.abs(7 - n);

  // ---------- geometria em pixels ----------
  const at = (o) => ({ x: o.x * R, y: o.y * R });
  /** Os 6 cantos de um hexágono em pé de centro (cx, cy) em pixels. */
  function corners(cx, cy) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i - 90);
      pts.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) });
    }
    return pts;
  }
  function hexPath(pts, k = 1, cx = 0, cy = 0) {
    return 'M' + pts.map((p) => `${(cx + (p.x - cx) * k).toFixed(1)},${(cy + (p.y - cy) * k).toFixed(1)}`).join(' L') + ' Z';
  }

  /** Um terreno: peça com borda em relevo, luz por cima, grão fino e o ícone do terreno. */
  function hex(h, tile) {
    const c = at(h);
    const pts = corners(c.x, c.y);
    const inner = hexPath(pts, 0.88, c.x, c.y - 2);
    const big = tile.number !== null;
    return `<g filter="url(#d-som)"><path d="${hexPath(pts, 0.97, c.x, c.y)}" fill="${RIM[tile.terrain]}" stroke="${LINE}" stroke-width="2.5"/></g>
      <path d="${inner}" fill="${FILL[tile.terrain]}"/><path d="${inner}" fill="url(#d-grao)"/><path d="${inner}" fill="url(#d-sol)"/>
      <g transform="translate(${c.x - 25},${c.y - (big ? 54 : 30)}) scale(.5)">${icon(TERRAIN_ICON[tile.terrain], STYLE)}</g>`;
  }

  /** O anel 3 (fora da ilha): terra rachada no lugar do mar. */
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  function ring(radius) {
    const out = [];
    let q = DIRS[4][0] * radius;
    let r = DIRS[4][1] * radius;
    for (let side = 0; side < 6; side++) {
      for (let step = 0; step < radius; step++) {
        out.push({ q, r });
        q += DIRS[side][0];
        r += DIRS[side][1];
      }
    }
    return out;
  }
  function border() {
    return ring(3).map(({ q, r }) => {
      const x = R * SQ3 * (q + r / 2);
      const y = R * 1.5 * r;
      return `<path d="${hexPath(corners(x, y), 1.01, x, y)}" fill="url(#d-racha)"/>`;
    }).join('');
  }

  /** Ficha do número: disco creme com aro terracota; 6 e 8 em vermelho; bolinhas de chance. */
  function token(h, number) {
    const { x, y } = at(h);
    const red = number === 6 || number === 8;
    const c = red ? '#b8321f' : INK;
    const n = pipCount(number);
    const dots = Array.from({ length: n }, (_, i) => `<circle cx="${x + (i - (n - 1) / 2) * 5}" cy="${y + 25}" r="1.8" fill="${c}"/>`).join('');
    return `<g filter="url(#d-som)"><circle cx="${x}" cy="${y + 10}" r="21" fill="#fbf1dc" stroke="${LINE}" stroke-width="2.5"/></g>
      <circle cx="${x}" cy="${y + 10}" r="17" fill="none" stroke="#c8643b" stroke-width="1.5"/>
      <text x="${x}" y="${y + 17}" text-anchor="middle" font-family="Bree Serif" font-size="20" fill="${c}">${number}</text>${dots}`;
  }

  /** Feira: barraca de toldo listrado a 0,55 R pra fora do meio do lado, com a estradinha de terra até as duas pontas. */
  function port(p, kind) {
    const g = Manda.geometry();
    const a = at(g.vertices[p.vertices[0]]);
    const b = at(g.vertices[p.vertices[1]]);
    const c = at(g.hexes[p.hex]);
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const len = Math.hypot(mx - c.x, my - c.y);
    const x = mx + ((mx - c.x) / len) * 0.55 * R;
    const y = my + ((my - c.y) / len) * 0.55 * R;
    const stripes = [0, 1, 2, 3, 4, 5].map((i) => `<path d="M${x - 24 + i * 8} ${y - 14} h8 l-2 9 h-8 Z" fill="${i % 2 ? '#fbf1dc' : '#b8321f'}" stroke="${LINE}" stroke-width="1.2"/>`).join('');
    const label = kind === 'generic'
      ? `<text x="${x - 1}" y="${y + 11}" text-anchor="middle" font-family="Bree Serif" font-size="14" fill="${INK}">3:1</text>`
      : `<text x="${x - 9}" y="${y + 11}" text-anchor="middle" font-family="Bree Serif" font-size="12" fill="${INK}">2:1</text><g transform="translate(${x + 2},${y - 5}) scale(.19)">${icon(RES_ICON[kind], STYLE)}</g>`;
    return `<path d="M${a.x},${a.y} L${x},${y} L${b.x},${b.y}" fill="none" stroke="#7a4a2a" stroke-width="5" stroke-linecap="round" stroke-dasharray="1 8"/>
      <g filter="url(#d-som)"><rect x="${x - 23}" y="${y - 6}" width="44" height="22" rx="3" fill="#fbf1dc" stroke="${LINE}" stroke-width="2"/></g>${stripes}${label}`;
  }

  /** Estrada entre dois pontos em pixels. */
  function road(a, b, color) {
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${LINE}" stroke-width="12" stroke-linecap="round"/><line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${color}" stroke-width="7" stroke-linecap="round"/>`;
  }

  /** Casa de taipa: parede na cor do jogador, telhado de telha. */
  function house(x, y, color) {
    return `<g transform="translate(${x},${y})"><g filter="url(#d-som)"><path d="M-12 10 V-3 H12 V10 Z" fill="${color}" stroke="${LINE}" stroke-width="2.2"/></g>
      <path d="M-15 -2 L0 -14 L15 -2 Z" fill="#a4462a" stroke="${LINE}" stroke-width="2.2" stroke-linejoin="round"/><rect x="-3" y="2" width="6" height="8" fill="${LINE}"/></g>`;
  }

  /** Vila: casario com a torre da igrejinha. */
  function city(x, y, color) {
    return `<g transform="translate(${x},${y})"><g filter="url(#d-som)"><path d="M-19 11 V-2 H0 V-16 H12 V11 Z" fill="${color}" stroke="${LINE}" stroke-width="2.2"/></g>
      <path d="M-22 -1 L-10 -11 L2 -1 Z" fill="#a4462a" stroke="${LINE}" stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M-2 -15 L6 -25 L14 -15 Z" fill="#a4462a" stroke="${LINE}" stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M6 -10 V-4 M3 -7 H9" stroke="${LINE}" stroke-width="2"/><rect x="-13" y="3" width="6" height="8" fill="${LINE}"/></g>`;
  }

  /** Carcará de pé: capuz preto, cara vermelha, peito claro listrado. (x, y) = onde ficam os pés. */
  function carcara(x, y, k = 1) {
    return `<g transform="translate(${x},${y}) scale(${k})">
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
  }

  function diceFace(n) {
    const P = { 1: [[50, 50]], 2: [[30, 30], [70, 70]], 3: [[28, 28], [50, 50], [72, 72]], 4: [[30, 30], [70, 30], [30, 70], [70, 70]], 5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]], 6: [[30, 26], [70, 26], [30, 50], [70, 50], [30, 74], [70, 74]] };
    return P[n].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9"/>`).join('');
  }

  window.Art = {
    R, COLORS, FILL, RIM, RES_ICON, CORDEL_ICON, STYLE, WOODCUT, INK, LINE,
    defs, icon, svgIcon, resIcon, at, corners, hexPath, hex, border, token, port, road, house, city, carcara, diceFace,
  };
})();
