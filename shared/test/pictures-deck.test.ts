import { describe, expect, it } from 'vitest';
import { COPIES_PER_COORD, drawSecrets, fullBag } from '../src/games/pictures/bag';
import { GRID_PER_THEME, GRID_THEMES, drawGrid } from '../src/games/pictures/grid';
import { PICTURES_DECK, PICTURES_THEME_NAMES, PICTURES_THEMES } from '../src/games/pictures/photos';
import { kitFor, kitsForRound } from '../src/games/pictures/rotation';
import { COORDS, PICTURES_COUNTDOWN_MS, PICTURES_MAX_PLAYERS, PICTURES_MIN_PLAYERS, PICTURES_ROUNDS } from '../src/games/pictures/types';
import { KITS } from '../src/games/pictures/works';
import { mulberry32 } from '../src/rng';

describe('Retratim: constantes e coordenadas', () => {
  it('3 a 6 pessoas, 6 rodadas, 30 s', () => {
    expect([PICTURES_MIN_PLAYERS, PICTURES_MAX_PLAYERS, PICTURES_ROUNDS, PICTURES_COUNTDOWN_MS]).toEqual([3, 6, 6, 30_000]);
  });

  it('16 coordenadas linha por linha: A1 é o índice 0, D1 o 3, A2 o 4, D4 o 15', () => {
    expect(COORDS).toHaveLength(16);
    expect(new Set(COORDS).size).toBe(16);
    expect([COORDS[0], COORDS[3], COORDS[4], COORDS[15]]).toEqual(['A1', 'D1', 'A2', 'D4']);
  });
});

describe('Retratim: baralho e grade', () => {
  it('150 fotos com ids p001…p150, únicos e em ordem', () => {
    expect(PICTURES_DECK).toHaveLength(150);
    expect(PICTURES_DECK.map((p) => p.id)).toEqual(Array.from({ length: 150 }, (_, i) => `p${String(i + 1).padStart(3, '0')}`));
    expect(new Set(PICTURES_DECK.map((p) => p.id)).size).toBe(150);
  });

  it('75 temas, cada um com exatamente 2 fotos (a dupla p001+p002, p003+p004…)', () => {
    expect(PICTURES_THEMES).toHaveLength(75);
    expect(new Set(PICTURES_THEMES).size).toBe(75);
    for (const [t, theme] of PICTURES_THEMES.entries()) {
      expect(PICTURES_DECK.filter((p) => p.theme === theme).map((p) => p.id)).toEqual([
        `p${String(2 * t + 1).padStart(3, '0')}`,
        `p${String(2 * t + 2).padStart(3, '0')}`,
      ]);
    }
    expect([PICTURES_THEMES[0], PICTURES_THEMES[49], PICTURES_THEMES[50], PICTURES_THEMES[74]]).toEqual(['cachorro', 'relogio', 'gamer', 'viagem']);
  });

  it('temas são slugs ASCII estáveis e cada um tem nome bonito em português', () => {
    for (const t of PICTURES_THEMES) {
      expect(t).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(PICTURES_THEME_NAMES[t]).toBeTruthy();
    }
    expect(Object.keys(PICTURES_THEME_NAMES)).toHaveLength(75);
    expect(PICTURES_THEME_NAMES['chao-da-mata']).toBe('chão da mata');
    expect(PICTURES_THEME_NAMES.onibus).toBe('ônibus');
  });

  it('a grade tem 16 fotos diferentes, de 8 temas com 2 fotos cada', () => {
    expect([GRID_THEMES, GRID_PER_THEME]).toEqual([8, 2]);
    const themeOf = new Map(PICTURES_DECK.map((p) => [p.id, p.theme]));
    for (let seed = 1; seed <= 30; seed++) {
      const grid = drawGrid(mulberry32(seed));
      expect(grid).toHaveLength(16);
      expect(new Set(grid).size).toBe(16);
      const count = new Map<string, number>();
      for (const id of grid) count.set(themeOf.get(id)!, (count.get(themeOf.get(id)!) ?? 0) + 1);
      expect([...count.values()]).toEqual([2, 2, 2, 2, 2, 2, 2, 2]);
    }
  });

  it('baralho com menos de 8 temas de 2 fotos: a grade se recusa a sair incompleta', () => {
    // 7 temas com 2 fotos + 1 tema com uma só: não dá
    const short = PICTURES_THEMES.slice(0, 8).flatMap((theme, t) =>
      Array.from({ length: t === 7 ? 1 : 2 }, (_, i) => ({ id: `t${t}-${i}`, theme })),
    );
    expect(() => drawGrid(mulberry32(1), short)).toThrow();
    // com 8 temas de 2 fotos, dá
    const enough = PICTURES_THEMES.slice(0, 8).flatMap((theme, t) =>
      Array.from({ length: 2 }, (_, i) => ({ id: `t${t}-${i}`, theme })),
    );
    expect(drawGrid(mulberry32(1), enough)).toHaveLength(16);
  });

  it('a grade muda com a semente', () => {
    expect(drawGrid(mulberry32(1))).not.toEqual(drawGrid(mulberry32(2)));
  });
});

describe('Retratim: saquinho de coordenadas', () => {
  it('48 fichas, 3 de cada coordenada', () => {
    const bag = fullBag();
    expect(bag).toHaveLength(COORDS.length * COPIES_PER_COORD);
    for (const c of COORDS) expect(bag.filter((x) => x === c)).toHaveLength(3);
  });

  it('cada tirada sai do saquinho; 6 rodadas com 6 pessoas não esvaziam', () => {
    const rng = mulberry32(3);
    let bag = fullBag();
    const players = ['a', 'b', 'c', 'd', 'e', 'f'];
    for (let r = 0; r < 6; r++) {
      const res = drawSecrets(rng, bag, players);
      expect(Object.keys(res.secrets)).toEqual(players);
      expect(res.bag).toHaveLength(bag.length - players.length);
      bag = res.bag;
    }
    expect(bag).toHaveLength(48 - 36);
  });

  it('a mesma foto pode sair pra duas pessoas (como no original)', () => {
    let repeated = false;
    for (let seed = 1; seed <= 50 && !repeated; seed++) {
      const { secrets } = drawSecrets(mulberry32(seed), fullBag(), ['a', 'b', 'c', 'd', 'e', 'f']);
      repeated = new Set(Object.values(secrets)).size < 6;
    }
    expect(repeated).toBe(true);
  });
});

describe('Retratim: rodízio de kits', () => {
  it('na rodada r o assento i usa KITS[(i + r) % 6]', () => {
    expect(kitFor(0, 0)).toBe('cubes');
    expect(kitFor(1, 0)).toBe('laces');
    expect(kitFor(0, 1)).toBe('laces');
    expect(kitFor(5, 1)).toBe('cubes');
  });

  it('com 3 a 6 pessoas, ninguém divide kit na rodada e cada um usa os 6 kits em 6 rodadas', () => {
    for (let n = 3; n <= 6; n++) {
      const players = Array.from({ length: n }, (_, i) => `p${i}`);
      const used = new Map<string, Set<string>>(players.map((p) => [p, new Set()]));
      for (let r = 0; r < PICTURES_ROUNDS; r++) {
        const kits = kitsForRound(players, players, r);
        expect(new Set(Object.values(kits)).size).toBe(n);
        for (const p of players) used.get(p)!.add(kits[p]!);
      }
      for (const p of players) expect(used.get(p)!.size).toBe(KITS.length);
    }
  });

  it('quem saiu da rodada não recebe kit, e os outros mantêm o kit do próprio assento', () => {
    const kits = kitsForRound(['p0', 'p1', 'p2', 'p3'], ['p0', 'p2', 'p3'], 0);
    expect(kits).toEqual({ p0: 'cubes', p2: 'sticks', p3: 'blocks' });
  });
});
