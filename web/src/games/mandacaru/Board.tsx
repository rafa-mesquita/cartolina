import { mandacaruGeometry, type BoardLayout, type Building, type MandacaruView } from '@cartolina/shared';
import { memo, type KeyboardEvent, type ReactNode } from 'react';
import { BoardDefs, Border, Carcara, City, Hex, House, NumberToken, PLAYER_TINTS, Port, Road, at, corners, hexPath, portPlacement } from './art';

/** Peça escolhida pra construir na fase principal (os lugares dela pulsam). */
export type BuildMode = 'road' | 'house' | 'city';

/** O que pulsa agora: cantos pra casa (`v`), lados pra estrada (`e`), casas pra vila (`c`), terrenos pro Carcará (`h`). */
export interface Spots {
  v: number[];
  e: number[];
  c: number[];
  h: number[];
}

/** Ação que um clique num lugar manda. */
export type SpotAction =
  | { type: 'place_house'; vertex: number }
  | { type: 'place_road'; edge: number }
  | { type: 'build_house'; vertex: number }
  | { type: 'build_road'; edge: number }
  | { type: 'build_city'; vertex: number }
  | { type: 'move_carcara'; hex: number };

const NONE: Spots = { v: [], e: [], c: [], h: [] };

/**
 * Lugares clicáveis agora (porte do `spotsOf` do protótipo): preparação (casa, depois estrada), Carcará, Mutirão
 * (lados sempre) e, na fase principal, os da peça escolhida. Tudo vem de `can` (já é só de quem está na vez).
 */
export function spotsOf(g: MandacaruView, mode: BuildMode | null): Spots {
  const c = g.can;
  if (c.placeHouse.length) return { ...NONE, v: c.placeHouse };
  if (c.placeRoad.length) return { ...NONE, e: c.placeRoad };
  if (c.carcara.length) return { ...NONE, h: c.carcara };
  if (g.phase === 'mutirao') return { ...NONE, e: c.buildRoad };
  if (g.phase !== 'main') return NONE;
  if (mode === 'road') return { ...NONE, e: c.buildRoad };
  if (mode === 'house') return { ...NONE, v: c.buildHouse };
  if (mode === 'city') return { ...NONE, c: c.buildCity };
  return NONE;
}

/** A ação de cada tipo de lugar, conforme a fase. */
export function spotAction(g: MandacaruView, kind: 'v' | 'e' | 'c' | 'h', n: number): SpotAction {
  if (kind === 'v') return g.can.placeHouse.length ? { type: 'place_house', vertex: n } : { type: 'build_house', vertex: n };
  if (kind === 'e') return g.can.placeRoad.length ? { type: 'place_road', edge: n } : { type: 'build_road', edge: n };
  if (kind === 'c') return { type: 'build_city', vertex: n };
  return { type: 'move_carcara', hex: n };
}

/** A caixa do desenho (centrada; igual ao protótipo). */
const VIEWBOX = '-356 -324 712 648';

/** Terrenos, feiras e fichas: só muda quando o tabuleiro sorteado muda. */
const StaticBoard = memo(function StaticBoard({ layout }: { layout: BoardLayout | null }) {
  const geo = mandacaruGeometry();
  if (!layout) return <Border />;
  return (
    <g>
      <Border />
      {geo.hexes.map((h, i) => {
        const p = at(h);
        return <Hex key={`h${i}`} tile={layout.hexes[i]!} cx={p.x} cy={p.y} />;
      })}
      {geo.ports.map((_, i) => {
        const pl = portPlacement(i);
        return <Port key={`p${i}`} kind={layout.ports[i]!} x={pl.x} y={pl.y} a={pl.a} b={pl.b} />;
      })}
      {geo.hexes.map((h, i) => {
        const n = layout.hexes[i]!.number;
        if (n === null) return null;
        const p = at(h);
        return <NumberToken key={`n${i}`} number={n} cx={p.x} cy={p.y} />;
      })}
    </g>
  );
});

/** Lugar clicável: `role="button"` com Enter/Espaço (os testes e o E2E acham pelo `aria-label`). */
function Spot({ label, data, onPick, children }: { label: string; data: Record<string, number>; onPick: () => void; children: ReactNode }) {
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    onPick();
  };
  const attrs = Object.fromEntries(Object.entries(data).map(([k, v]) => [`data-${k}`, v]));
  return (
    <g role="button" tabIndex={0} aria-label={label} className="mc-spot" onClick={onPick} onKeyDown={onKey} {...attrs}>
      {children}
    </g>
  );
}

interface Props {
  game: MandacaruView;
  spots: Spots;
  onSpot: (kind: 'v' | 'e' | 'c' | 'h', n: number) => void;
}

/**
 * O tabuleiro em SVG (estilo D): terra rachada, terrenos, feiras, fichas, estradas, casas/vilas (cor pelo índice do
 * jogador em `players`), o Carcará (com o terreno dele escurecido) e, por cima, os lugares que pulsam.
 */
export const Board = memo(function Board({ game: g, spots, onSpot }: Props) {
  const geo = mandacaruGeometry();
  const tint = (owner: string) => PLAYER_TINTS[g.players.indexOf(owner)] ?? PLAYER_TINTS[3];
  let carcara: ReactNode = null;
  if (g.layout) {
    const c = at(geo.hexes[g.carcara]!);
    const desert = g.layout.hexes[g.carcara]?.number === null;
    carcara = (
      <g pointerEvents="none">
        <path d={hexPath(corners(c.x, c.y), 0.88, c.x, c.y - 2)} fill="#2a1c13" opacity=".22" />
        {desert ? <Carcara x={c.x} y={c.y - 4} k={0.95} /> : <Carcara x={c.x + 2} y={c.y - 31} k={0.78} />}
      </g>
    );
  }
  return (
    <svg className="mc-board" viewBox={VIEWBOX} preserveAspectRatio="xMidYMid meet" aria-label="tabuleiro">
      <BoardDefs />
      <StaticBoard layout={g.layout} />
      {g.layout && (
        <g>
          {g.roads.map((o, e) => {
            if (!o) return null;
            const ed = geo.edges[e]!;
            // `data-peca`: o E2E conta as peças na tela
            return (
              <g key={`r${e}`} data-peca="road">
                <Road a={at(geo.vertices[ed.a]!)} b={at(geo.vertices[ed.b]!)} color={tint(o)} />
              </g>
            );
          })}
          {g.buildings.map((b: Building | null, i) => {
            if (!b) return null;
            const p = at(geo.vertices[i]!);
            return (
              <g key={`b${i}`} data-peca={b.kind}>
                {b.kind === 'city' ? <City x={p.x} y={p.y} color={tint(b.owner)} /> : <House x={p.x} y={p.y} color={tint(b.owner)} />}
              </g>
            );
          })}
          {carcara}
          {spots.h.map((h) => {
            const c = at(geo.hexes[h]!);
            const d = hexPath(corners(c.x, c.y), 0.86, c.x, c.y - 2);
            return (
              <Spot key={`sh${h}`} label={`Carcará no terreno ${h}`} data={{ h }} onPick={() => onSpot('h', h)}>
                <path d={d} fill="#fff6e6" fillOpacity=".22" stroke="#fff6e6" strokeWidth="4" className="mc-pulse-o" />
                <path d={d} fill="transparent" />
              </Spot>
            );
          })}
          {spots.e.map((e) => {
            const ed = geo.edges[e]!;
            const a = at(geo.vertices[ed.a]!);
            const b = at(geo.vertices[ed.b]!);
            const ax = a.x + (b.x - a.x) * 0.18;
            const ay = a.y + (b.y - a.y) * 0.18;
            const bx = b.x + (a.x - b.x) * 0.18;
            const by = b.y + (a.y - b.y) * 0.18;
            return (
              <Spot key={`se${e}`} label={`estrada no lado ${e}`} data={{ e }} onPick={() => onSpot('e', e)}>
                <line x1={ax} y1={ay} x2={bx} y2={by} stroke="#5b3a29" strokeWidth="11" strokeLinecap="round" opacity=".5" className="mc-pulse-o" />
                <line x1={ax} y1={ay} x2={bx} y2={by} stroke="#fff6e6" strokeWidth="6" strokeLinecap="round" strokeDasharray="3 7" className="mc-pulse-o" />
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth="22" />
              </Spot>
            );
          })}
          {spots.v.map((v) => {
            const p = at(geo.vertices[v]!);
            return (
              <Spot key={`sv${v}`} label={`casa no canto ${v}`} data={{ v }} onPick={() => onSpot('v', v)}>
                <circle cx={p.x} cy={p.y} r="10" fill="#fff6e6" stroke="#b8321f" strokeWidth="3" className="mc-pulse" />
                <circle cx={p.x} cy={p.y} r="18" fill="transparent" />
              </Spot>
            );
          })}
          {spots.c.map((v) => {
            const p = at(geo.vertices[v]!);
            return (
              <Spot key={`sc${v}`} label={`vila no canto ${v}`} data={{ c: v }} onPick={() => onSpot('c', v)}>
                <circle cx={p.x} cy={p.y - 2} r="22" fill="#fff6e6" fillOpacity=".25" stroke="#fff6e6" strokeWidth="3.5" strokeDasharray="5 4" className="mc-pulse" />
                <circle cx={p.x} cy={p.y} r="22" fill="transparent" />
              </Spot>
            );
          })}
        </g>
      )}
    </svg>
  );
});
