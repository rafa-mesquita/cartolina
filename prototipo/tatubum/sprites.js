'use strict';
/*
 * Sprites em pixel art do Tatubum, desenhados a partir de mapas de caracteres.
 * Cada letra é uma cor da paleta do sprite; 'k' é sempre o contorno escuro e '.' é transparente.
 * Arte provisória: a arte final das cartas vem do Flow (Plano T3).
 */
(function () {
  const K = '#2b1a10';

  const SPRITES = {
    tatubum: {
      pal: { b: '#a0703f', l: '#c8955a', y: '#f2c14e', o: '#e4572e', w: '#fff3c4' },
      rows: [
        '..........w.....',
        '.........yoy....',
        '........y.k.y...',
        '.........k......',
        '.....kkkkkk.....',
        '...kkbbkbbkkk...',
        '..kblbbkblbbbk..',
        '..kblbbkblbbbk..',
        '.kbblbbkblbbbbk.',
        '.kbblbbkblbbbbk.',
        '.kbblbbkblbbbbk.',
        '..kbbbbkbbbbbk..',
        '..kkbbbkbbbbkk..',
        '...kkkkkkkkkk...',
      ],
    },
    cafune: {
      pal: { p: '#ff8fab', d: '#e0567a', w: '#ffe1ea' },
      rows: [
        '................',
        '..kkk.....kkk...',
        '.kpppk...kpppk..',
        'kpwwppk.kpppppk.',
        'kpwpppppkppppdk.',
        'kpppppppppppddk.',
        'kppppppppppdddk.',
        '.kpppppppppddk..',
        '..kpppppppddk...',
        '...kpppppddk....',
        '....kpppddk.....',
        '.....kppdk......',
        '......kdk.......',
        '.......k........',
      ],
    },
    nemvem: {
      pal: { s: '#f2c79a', d: '#d9a06a', r: '#e4572e' },
      rows: [
        '.....k.k.k......',
        '....kskskskk....',
        '....kskskskdk...',
        '..k.kskskskdk...',
        '.ksk.kssssssk...',
        '.kssksssssssk...',
        '..ksssssssssk...',
        '...kssssssssk...',
        '...kssssssddk...',
        '....kssssddk....',
        '....ksssdddk....',
        '....kkkkkkkk....',
        '..rrrrrrrrrrrr..',
        '..rrrrrrrrrrrr..',
      ],
    },
    ataque: {
      pal: { w: '#d9e2ec', g: '#9aa8b8', y: '#f2c14e', r: '#c0392b' },
      rows: [
        '.............kk.',
        '............kwk.',
        '...........kwgk.',
        '..........kwgk..',
        '.........kwgk...',
        '........kwgk....',
        '...k...kwgk.....',
        '...kk.kwgk......',
        '....kkwgk.......',
        '.....kkk........',
        '....kykkk.......',
        '...kyk..kk......',
        '..krk...........',
        '.krk............',
        '.kk.............',
      ],
    },
    pular: {
      pal: { a: '#5aa0e6', d: '#2f6db0' },
      rows: [
        '................',
        '..kk....kk......',
        '..kak...kak.....',
        '..kaak..kaak....',
        '..kaaak.kaaak...',
        '..kaaaakkaaaak..',
        '..kaaaadkaaaadk.',
        '..kaaadkkaaadk..',
        '..kaadk.kaadk...',
        '..kadk..kadk....',
        '..kdk...kdk.....',
        '..kk....kk......',
      ],
    },
    favor: {
      pal: { y: '#f2c14e', d: '#c9962c', r: '#e4572e' },
      rows: [
        '....kk....kk....',
        '...krrk..krrk...',
        '....krrkkrrk....',
        '.kkkkkkkkkkkkkk.',
        '.kyyyyyrryyyyyk.',
        '.kyyyyyrryyyddk.',
        '.kkkkkkkkkkkkkk.',
        '..kyyyyrryyydk..',
        '..kyyyyrryyydk..',
        '..kyyyyrryyydk..',
        '..kyyyyrryyydk..',
        '..kddddrrddddk..',
        '..kkkkkkkkkkkk..',
      ],
    },
    embaralhar: {
      pal: { w: '#f4e9d0', v: '#8e5cc4', p: '#c9a8ee' },
      rows: [
        '.kkkkkkk........',
        '.kwwwwwk........',
        '.kwvvkkkkkk.....',
        '.kwvvkwwwwwk....',
        '.kwwwkwvvkkkkkk.',
        '.kkkkkwvvkwwwwwk',
        '.....kwwwkwppppk',
        '.....kkkkkwppppk',
        '.........kwppppk',
        '.........kwwwwwk',
        '.........kkkkkkk',
      ],
    },
    espiar: {
      pal: { w: '#f4e9d0', t: '#2f8f8f', d: '#1d5c5c', s: '#ffffff' },
      rows: [
        '................',
        '.....kkkkkk.....',
        '...kkwwwwwwkk...',
        '..kwwwwkkwwwwk..',
        '.kwwwkkttkkwwwk.',
        'kwwwkttttttkwwwk',
        'kwwwkttskdtkwwwk',
        'kwwwkttkkdtkwwwk',
        '.kwwwkttddkwwwk.',
        '..kwwwkkkkwwwk..',
        '...kkwwwwwwkk...',
        '.....kkkkkk.....',
      ],
    },
    capivara: {
      pal: { b: '#8a5a3a', l: '#b07a52', n: '#3b2412' },
      rows: [
        '....kk....kk....',
        '...kbbk..kbbk...',
        '..kbbbbkkbbbbk..',
        '.kbbbbbbbbbbbbk.',
        '.kbbkbbbbbbkbbk.',
        '.kbbbbbbbbbbbbk.',
        '.kbbbbbbbbbbbbk.',
        '.kbbbbllllbbbbk.',
        '..kbbllllllbbk..',
        '..kbblnllnlbbk..',
        '...kbllllllbk...',
        '....kkkkkkkk....',
      ],
    },
    mico: {
      pal: { o: '#f08a24', y: '#f7b955', f: '#6b3a2a', e: '#f2c14e' },
      rows: [
        '...oo.oooo.oo...',
        '..oyoooooooyoo..',
        '.oooookkkkooooo.',
        '.ooookffffkoooo.',
        'oooookfkkfkooooo',
        'ooyookffffkooyoo',
        '.ooookfkkfkoooo.',
        '.oooookffkooooo.',
        '..oooookkooooo..',
        '...oooooooooo...',
        '....oo....oo....',
      ],
    },
    quati: {
      pal: { b: '#9a6b45', w: '#e8d5b5', d: '#5a3a22' },
      rows: [
        '..kk........kk..',
        '.kbbk......kbbk.',
        '.kbbbkkkkkkbbbk.',
        '..kbbbbbbbbbbk..',
        '..kbwkbbbbkwbk..',
        '..kbwwkbbkwwbk..',
        '...kbbbbbbbbk...',
        '....kbbddbbk....',
        '.....kbwwbk.....',
        '......kwwk......',
        '.......kk.......',
      ],
    },
    tamandua: {
      pal: { g: '#8c8478', w: '#e8e0d0', d: '#3b342c' },
      rows: [
        '................',
        '.........kk.....',
        '........kggk....',
        '.......kggggkk..',
        '......kgggkgggk.',
        'kkkkkkggggggggk.',
        'kgggggggggggggk.',
        '.kkkkkggwwgggk..',
        '......kdwwddk...',
        '.......kdddk....',
        '........kkk.....',
      ],
    },
    preguica: {
      pal: { g: '#a8977a', w: '#d9ccb0', d: '#4a3a26' },
      rows: [
        '....kkkkkkkk....',
        '..kkggggggggkk..',
        '.kggggggggggggk.',
        '.kgwwwwggwwwwgk.',
        'kggwddwggwddwggk',
        'kggwdkwggwkdwggk',
        'kgggwwggggwwgggk',
        'kggggggkkggggggk',
        '.kggggggggggggk.',
        '.kgggkggggkgggk.',
        '..kggkkkkkkggk..',
        '...kkggggggkk...',
        '.....kkkkkk.....',
      ],
    },
  };

  /** Tatu-bola dos assentos (de lado, como a referência do Rafa); `b`/`l` mudam com a cor do jogador. */
  const SEAT_TATU = [
    '.......kkkkkkk......',
    '.....kkbbbkbbbkk....',
    '....kbblbbkblbbbk...',
    '.kk.kbblbbkblbbbbk..',
    'kpk.kbblbbkblbbbbbk.',
    '.kkkkbblbbkblbbbbbk.',
    'kllkebblbbkblbbbbbkk',
    'klllbbblbbkblbbbbbbk',
    'pllkbbbbbbkbbbbbbbbk',
    '.kkkbkkbbbbbkkbbbbkk',
    '....kk.kk...kk.kk...',
  ];

  /** Cor de destaque e frase curta de cada carta (provisórias, como a arte). */
  const CARD_STYLE = {
    tatubum: { band: '#e4572e', hint: 'BUM!' },
    cafune: { band: '#ff8fab', hint: 'desarma o tatu' },
    nemvem: { band: '#e4572e', hint: 'cancela a jogada' },
    ataque: { band: '#c0392b', hint: 'o próximo joga 2' },
    pular: { band: '#3f7fd0', hint: 'pula sem comprar' },
    favor: { band: '#d9a52c', hint: 'pede uma carta' },
    embaralhar: { band: '#8e5cc4', hint: 'mistura o monte' },
    espiar: { band: '#2f8f8f', hint: 'vê as 3 de cima' },
    capivara: { band: '#3b8a4a', hint: 'junte pares' },
    mico: { band: '#3b8a4a', hint: 'junte pares' },
    quati: { band: '#3b8a4a', hint: 'junte pares' },
    tamandua: { band: '#3b8a4a', hint: 'junte pares' },
    preguica: { band: '#3b8a4a', hint: 'junte pares' },
  };

  function render(rows, pal) {
    const h = rows.length;
    const w = Math.max(...rows.map((r) => r.length));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    rows.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        if (ch === '.' || ch === ' ') return;
        const col = ch === 'k' ? K : pal[ch];
        if (!col) return;
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      });
    });
    return { url: c.toDataURL(), w, h };
  }

  /** Clareia (t > 0) ou escurece (t < 0) uma cor #rrggbb. */
  function shade(hex, t) {
    const n = parseInt(hex.slice(1), 16);
    const ch = (v) => Math.round(t > 0 ? v + (255 - v) * t : v * (1 + t));
    const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }

  const cache = new Map();
  function cached(key, make) {
    if (!cache.has(key)) cache.set(key, make());
    return cache.get(key);
  }

  window.Sprites = {
    style: CARD_STYLE,
    /** Sprite da carta do tipo `kind`: { url, w, h }. */
    card(kind) {
      return cached('card:' + kind, () => render(SPRITES[kind].rows, SPRITES[kind].pal));
    },
    /** Tatu do assento na cor do jogador (cinza pra quem explodiu). */
    tatu(color) {
      return cached('tatu:' + color, () =>
        render(SEAT_TATU, { b: color, l: shade(color, 0.35), p: '#e8a0a0', e: '#111' }),
      );
    },
    shade,
  };
})();
