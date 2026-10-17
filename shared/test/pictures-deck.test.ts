import { describe, expect, it } from 'vitest';
import { COPIES_PER_COORD, drawSecrets, fullBag } from '../src/games/pictures/bag';
import { drawGrid } from '../src/games/pictures/grid';
import { PICTURES_DECK, PICTURES_THEMES } from '../src/games/pictures/photos';
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
  it('100 fotos com ids p001…p100, todas com tema conhecido, pelo menos 4 por tema', () => {
    expect(PICTURES_DECK).toHaveLength(100);
    expect(PICTURES_DECK[0]!.id).toBe('p001');
    expect(PICTURES_DECK[99]!.id).toBe('p100');
    expect(new Set(PICTURES_DECK.map((p) => p.id)).size).toBe(100);
    for (const t of PICTURES_THEMES) expect(PICTURES_DECK.filter((p) => p.theme === t).length).toBeGreaterThanOrEqual(4);
  });

  it('a grade tem 16 fotos diferentes, de 4 temas com 4 fotos cada', () => {
    const themeOf = new Map(PICTURES_DECK.map((p) => [p.id, p.theme]));
    for (let seed = 1; seed <= 20; seed++) {
      const grid = drawGrid(mulberry32(seed));
      expect(grid).toHaveLength(16);
      expect(new Set(grid).size).toBe(16);
      const count = new Map<string, number>();
      for (const id of grid) count.set(themeOf.get(id)!, (count.get(themeOf.get(id)!) ?? 0) + 1);
      expect([...count.values()]).toEqual([4, 4, 4, 4]);
    }
  });

  it('baralho com menos de 4 temas utilizáveis: a grade se recusa a sair incompleta', () => {
    const deck = PICTURES_THEMES.slice(0, 3).flatMap((theme, t) =>
      Array.from({ length: 5 }, (_, i) => ({ id: `t${t}-${i}`, theme })),
    );
    expect(() => drawGrid(mulberry32(1), deck)).toThrow();
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
