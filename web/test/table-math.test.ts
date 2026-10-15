import { describe, expect, it } from 'vitest';
import { CW, FH, FW, NAT_STEP, ROW_S, ROW_X0, ROW_X1, ROW_Y } from '../src/table/constants';
import { applyH, inv3, inv3Safe, solveH, solveHSafe } from '../src/table/homography';
import {
  INTENT_TTL_MS,
  cursorFromLocal,
  effectiveRow,
  inRowZone,
  insertIndex,
  intentSettled,
  rowEntries,
  toServerIndex,
  toVisibleIndex,
} from '../src/table/rowLayout';
import { Spring } from '../src/table/spring';

const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('Spring', () => {
  it('converge para o alvo e para', () => {
    const s = new Spring(0, 300, 0.8);
    s.t = 10;
    for (let i = 0; i < 300; i++) s.step(1 / 60);
    expect(s.v).toBe(10);
    expect(s.vel).toBe(0);
    expect(s.resting).toBe(true);
  });

  it('snap fixa valor e alvo', () => {
    const s = new Spring(0).snap(5);
    expect([s.v, s.t, s.vel]).toEqual([5, 5, 0]);
  });

  it('dt grande não explode (substeps)', () => {
    const s = new Spring(0, 1400, 0.92);
    s.t = 100;
    s.step(0.5);
    expect(Number.isFinite(s.v)).toBe(true);
    expect(Math.abs(s.v)).toBeLessThan(200);
  });
});

describe('homografia', () => {
  const src = [[0, 0], [FW, 0], [0, FH], [FW, FH]] as const;

  it('identidade', () => {
    const H = solveH(src, src);
    const [x, y] = applyH(H, 123, 45);
    close(x, 123);
    close(y, 45);
  });

  it('trapézio (mesa inclinada) e volta', () => {
    const dst = [[100, 50], [800, 50], [0, 400], [900, 400]] as const;
    const H = solveH(src, dst);
    const [x0, y0] = applyH(H, 0, 0);
    close(x0, 100, 1e-4);
    close(y0, 50, 1e-4);
    const [sx, sy] = applyH(H, 300, 200);
    const [lx, ly] = applyH(inv3(H), sx, sy);
    close(lx, 300, 1e-4);
    close(ly, 200, 1e-4);
  });
});

describe('versões seguras', () => {
  const src = [[0, 0], [FW, 0], [0, FH], [FW, FH]] as const;

  it('solveHSafe devolve a mesma homografia em entrada válida', () => {
    const dst = [[100, 50], [800, 50], [0, 400], [900, 400]] as const;
    expect(solveHSafe(src, dst)).toEqual(solveH(src, dst));
  });

  it('solveHSafe devolve null para pontos degenerados (colineares)', () => {
    const line = [[0, 0], [10, 0], [20, 0], [30, 0]] as const;
    expect(solveHSafe(src, line)).toBeNull();
    expect(solveHSafe(line, src)).toBeNull();
  });

  it('inv3Safe inverte matriz válida e devolve null se singular', () => {
    const H = solveH(src, [[100, 50], [800, 50], [0, 400], [900, 400]]);
    expect(inv3Safe(H)).toEqual(inv3(H));
    expect(inv3Safe([1, 2, 3, 2, 4, 6, 3, 6, 9])).toBeNull();
    expect(inv3Safe([0, 0, 0, 0, 0, 0, 0, 0, 0])).toBeNull();
  });
});

describe('rowEntries', () => {
  it('uma carta fica no centro', () => {
    expect(rowEntries(['a'], [])).toEqual([{ kind: 'card', id: 'a', x: FW / 2, slot: 0 }]);
  });

  it('poucas cartas ficam a NAT_STEP e centradas', () => {
    const xs = rowEntries(['a', 'b', 'c'], []).map((e) => e.x);
    close(xs[1]! - xs[0]!, NAT_STEP);
    close(xs[1]!, FW / 2);
  });

  it('muitas cartas comprimem dentro da faixa', () => {
    const row = Array.from({ length: 20 }, (_, i) => `c${i}`);
    const xs = rowEntries(row, []).map((e) => e.x);
    const w = CW * ROW_S;
    expect(xs[1]! - xs[0]!).toBeLessThan(NAT_STEP);
    expect(xs[0]!).toBeGreaterThanOrEqual(ROW_X0 + w / 2 - 1e-6);
    expect(xs[19]!).toBeLessThanOrEqual(ROW_X1 - w / 2 + 1e-6);
  });

  it('buraco entra no índice pedido e é limitado ao tamanho', () => {
    expect(rowEntries(['a', 'b'], [{ owner: 'x', index: 1 }]).map((e) => (e.kind === 'card' ? e.id : `gap:${e.owner}`))).toEqual(['a', 'gap:x', 'b']);
    expect(rowEntries(['a'], [{ owner: 'x', index: 9 }]).map((e) => e.kind)).toEqual(['card', 'gap']);
  });

  it('insertIndex conta cartas à esquerda do ponto', () => {
    const entries = rowEntries(['a', 'b', 'c'], []);
    expect(insertIndex(entries, 0)).toBe(0);
    expect(insertIndex(entries, (entries[1]!.x + entries[2]!.x) / 2)).toBe(2);
    expect(insertIndex(entries, FW)).toBe(3);
  });
});

describe('intenções otimistas', () => {
  it('place move a carta; return tira; em voo some da fila visível', () => {
    expect(effectiveRow(['a', 'b'], { kind: 'place', cardId: 'm', index: 1, after: 'a', at: 0 }, new Set())).toEqual(['a', 'm', 'b']);
    expect(effectiveRow(['a', 'm', 'b'], { kind: 'place', cardId: 'm', index: 0, after: null, at: 0 }, new Set())).toEqual(['m', 'a', 'b']);
    expect(effectiveRow(['a', 'm'], { kind: 'return', cardId: 'm', at: 0 }, new Set())).toEqual(['a']);
    expect(effectiveRow(['a', 'b'], null, new Set(['b']))).toEqual(['a']);
  });

  it('place ancorado: entra logo depois de `after` mesmo se a fila mudou; sem a âncora, usa o índice', () => {
    const place = { kind: 'place' as const, cardId: 'm', index: 1, after: 'a', at: 0 };
    expect(effectiveRow(['x', 'y', 'a', 'b'], place, new Set())).toEqual(['x', 'y', 'a', 'm', 'b']);
    expect(effectiveRow(['x', 'b'], place, new Set())).toEqual(['x', 'm', 'b']);
  });

  it('intenção resolve quando o servidor concorda ou expira', () => {
    const place = { kind: 'place' as const, cardId: 'm', index: 1, after: 'a', at: 0 };
    expect(intentSettled(['a', 'b'], place, 10)).toBe(false);
    expect(intentSettled(['a', 'm', 'b'], place, 10)).toBe(true);
    expect(intentSettled(['m', 'a', 'b'], place, 10)).toBe(false);
    expect(intentSettled(['a', 'b'], place, INTENT_TTL_MS + 1)).toBe(true);
    expect(intentSettled(['a'], { kind: 'return', cardId: 'm', at: 0 }, 10)).toBe(true);
    const first = { kind: 'place' as const, cardId: 'm', index: 0, after: null, at: 0 };
    expect(intentSettled(['m', 'a'], first, 10)).toBe(true);
    expect(intentSettled(['a', 'm'], first, 10)).toBe(false);
  });

  it('âncora movida por outra pessoa: assenta pelo índice', () => {
    // Pus `m` no índice 1 (depois de `p1`); antes de processar, alguém levou `p1` pro fim.
    const place = { kind: 'place' as const, cardId: 'm', index: 1, after: 'p1', at: 0 };
    expect(intentSettled(['p2', 'm', 'p1'], place, 10)).toBe(true);
    expect(intentSettled(['m', 'p2', 'p1'], place, 10)).toBe(false);
  });

  it('colocação concorrente antes da minha não prende a minha carta até o TTL', () => {
    // Eu pus `m` depois de `a` (índice 1); alguém pôs `x` no começo ao mesmo tempo.
    const place = { kind: 'place' as const, cardId: 'm', index: 1, after: 'a', at: 0 };
    const server = ['x', 'a', 'm', 'b'];
    expect(intentSettled(server, place, 10)).toBe(true);
    expect(effectiveRow(server, place, new Set())).toEqual(server);
  });

  it('toServerIndex compensa cartas escondidas (sendo carregadas por outros)', () => {
    const server = ['a', 'b', 'c'];
    const visible = ['a', 'c'];
    expect(toServerIndex(visible, server, 'm', 0)).toBe(0);
    expect(toServerIndex(visible, server, 'm', 1)).toBe(1);
    expect(toServerIndex(visible, server, 'm', 2)).toBe(3);
  });

  it('toServerIndex ignora a própria carta na fila do servidor', () => {
    expect(toServerIndex(['a', 'b'], ['m', 'a', 'b'], 'm', 2)).toBe(2);
  });

  it('toVisibleIndex é o inverso aproximado', () => {
    expect(toVisibleIndex(['a', 'c'], ['a', 'b', 'c'], 'm', 2)).toBe(1);
    expect(toVisibleIndex(['a', 'c'], ['a', 'b', 'c'], 'm', 3)).toBe(2);
  });

  it('toVisibleIndex conta a partir da última carta visível antes do ponto (com carta pendente minha na fila)', () => {
    // visível: m (minha, pendente) + a + b; servidor: a, b. Arrasto remoto depois de "a" (índice 1 no servidor).
    expect(toVisibleIndex(['m', 'a', 'b'], ['a', 'b'], 'x', 1)).toBe(2);
    expect(toVisibleIndex(['m', 'a', 'b'], ['a', 'b'], 'x', 0)).toBe(0);
  });

  it('toServerIndex pula cartas visíveis que ainda não estão no servidor (pendentes)', () => {
    expect(toServerIndex(['a', 'p', 'x'], ['a', 'x'], 'm', 2)).toBe(1);
    expect(toServerIndex(['p', 'a'], ['a'], 'm', 1)).toBe(0);
  });
});

describe('zonas', () => {
  it('cursor na mesa vira coordenada normalizada; fora vira mão', () => {
    expect(cursorFromLocal(FW / 2, FH / 2)).toEqual({ zone: 'table', x: 0.5, y: 0.5 });
    expect(cursorFromLocal(FW / 2, FH + 200)).toEqual({ zone: 'hand', x: 0, y: 0 });
  });

  it('zona da fila', () => {
    expect(inRowZone(FW / 2, ROW_Y)).toBe(true);
    expect(inRowZone(FW / 2, 20)).toBe(false);
  });
});
