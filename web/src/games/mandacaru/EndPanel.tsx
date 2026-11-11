import type { MandacaruView } from '@cartolina/shared';
import { memo, useEffect, useRef } from 'react';
import { House, PLAYER_TINTS, SvgIcon } from './art';
import { POINT_NAMES } from './names';
import { YOU, joinE, type NameOf } from './texts';

/** Uma fatia dos pontos de alguém ("2 casas +2", "maior estrada (6) +2", "Igrejinha +1"). */
export interface PointPart {
  text: string;
  points: number;
  /** Cordéis de Ponto (desenhados de outro jeito). */
  cordel?: boolean;
}

/**
 * De onde veio cada ponto de cada jogador, no fim. Os nomes dos cordéis de Ponto são distribuídos na ordem: os seus
 * primeiro (os mesmos da sua mão), depois os dos outros na ordem da partida.
 */
export function pointParts(g: MandacaruView, me: string | null): Record<string, PointPart[]> {
  const order = me !== null && g.players.includes(me) ? [me, ...g.players.filter((p) => p !== me)] : g.players;
  const names: Record<string, string[]> = {};
  let k = 0;
  for (const p of order) {
    const n = g.pointCards?.[p] ?? 0;
    names[p] = POINT_NAMES.slice(k, k + n);
    k += n;
  }
  const out: Record<string, PointPart[]> = {};
  for (const s of g.seats) {
    let houses = 0;
    let cities = 0;
    for (const b of g.buildings) {
      if (b?.owner !== s.id) continue;
      if (b.kind === 'house') houses++;
      else cities++;
    }
    const parts: PointPart[] = [];
    if (houses) parts.push({ text: `${houses} casa${houses > 1 ? 's' : ''}`, points: houses });
    if (cities) parts.push({ text: `${cities} vila${cities > 1 ? 's' : ''}`, points: 2 * cities });
    if (g.longestRoad === s.id) parts.push({ text: `maior estrada (${s.roadLength})`, points: 2 });
    if (g.largestArmy === s.id) parts.push({ text: `maior comitiva (${s.knights} Vaqueiros)`, points: 2 });
    const pn = names[s.id] ?? [];
    if (pn.length) parts.push({ text: joinE(pn), points: pn.length, cordel: true });
    out[s.id] = parts;
  }
  return out;
}

interface Props {
  game: MandacaruView;
  me: string | null;
  nameOf: NameOf;
  host: boolean;
  onRestart: () => void;
}

/**
 * O fim da partida (porte do `renderEnd` do protótipo): véu sobre a mesa, "X venceu!", cada jogador com os pontos e de
 * onde vieram (casas, vilas, selos, cordéis de Ponto revelados), vitórias da noite e "jogar de novo" só pro anfitrião.
 */
export const EndPanel = memo(function EndPanel({ game: g, me, nameOf, host, onRestart }: Props) {
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    head.current?.focus({ preventScroll: true });
  }, []);
  const winner = g.winner === null ? null : nameOf(g.winner);
  const title = winner === null ? 'Fim da partida' : winner === YOU ? 'Você venceu!' : `${winner} venceu!`;
  const parts = pointParts(g, me);
  const rows = [...g.seats].sort((a, b) => Number(b.id === g.winner) - Number(a.id === g.winner) || b.points - a.points);
  return (
    <div className="mc-veu">
      <div className="mc-painel largo" role="dialog" aria-label={title}>
        <h2 ref={head} tabIndex={-1}>
          {title}
        </h2>
        <div className="mc-sub">partida {g.match} · de onde veio cada ponto</div>
        <div className="mc-placar">
          {rows.map((s) => {
            const i = g.players.indexOf(s.id);
            const ps = parts[s.id] ?? [];
            return (
              <div key={s.id} className={`mc-lfim${s.id === g.winner ? ' venc' : ''}`} data-testid="mc-fim-linha">
                <svg width="34" height="34" viewBox="-19 -22 38 38" aria-hidden="true">
                  <House x={0} y={0} color={PLAYER_TINTS[i] ?? PLAYER_TINTS[3]} />
                </svg>
                <div className="mc-quem">
                  <div className="mc-nm">
                    {nameOf(s.id)}
                    {s.id === g.winner && <span className="mc-selo">venceu!</span>}
                    <span className="mc-noite" title="vitórias da noite">
                      🏆 {g.wins[s.id] ?? 0}
                    </span>
                  </div>
                  <div className="mc-de">
                    {ps.length === 0 ? (
                      <span>nenhum ponto</span>
                    ) : (
                      ps.map((p) => (
                        <span key={p.text} className={p.cordel ? 'pontos' : undefined}>
                          {p.cordel && <SvgIcon kind="igreja" size={16} />} {p.text} <b>+{p.points}</b>
                        </span>
                      ))
                    )}
                  </div>
                </div>
                <div className="mc-tot">
                  {s.points}
                  <small>PONTOS</small>
                </div>
              </div>
            );
          })}
        </div>
        {host ? (
          <button type="button" className="mc-btn grande" onClick={onRestart}>
            jogar de novo
          </button>
        ) : (
          <p className="mc-hostwait">esperando o anfitrião começar outra…</p>
        )}
      </div>
    </div>
  );
});
