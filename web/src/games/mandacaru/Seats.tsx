import type { MandacaruView, SeatView } from '@cartolina/shared';
import { memo } from 'react';
import { House, PLAYER_TINTS, ResIcon, SvgIcon } from './art';
import { formatClock } from './clock';
import { CostBox } from './Costs';
import { RES_NAME, RES_ORDER } from './names';
import type { NameOf } from './texts';

/** Um minuto: daí pra baixo o relógio fica vermelho. */
export const LOW_MS = 60_000;

interface Props {
  game: MandacaruView;
  /** Assentos da sala (nome, cor, conectado). */
  roomSeats: SeatView[];
  you: string | null;
  nameOf: NameOf;
  /** Ms que faltam no turno (`null` = parado). */
  turnLeft: number | null;
}

/**
 * Coluna da esquerda: os jogadores na ordem da partida (casinha na cor, nome, cartas, cordéis, Vaqueiros, vitórias da
 * noite, selos de maior estrada/comitiva, pontos e, de quem está na vez, o relógio), embaixo o banco e o monte e, por
 * último, o "quanto custa".
 */
export const Seats = memo(function Seats({ game: g, roomSeats, you, nameOf, turnLeft }: Props) {
  return (
    <aside className="mc-left">
      <div className="mc-players">
        {g.players.map((id, i) => {
          const s = g.seats.find((x) => x.id === id);
          if (!s) return null;
          const room = roomSeats.find((r) => r.id === id);
          const mine = id === you;
          const hidden = mine && g.myPoints !== null ? g.myPoints - s.points : 0;
          const turn = g.turn === id && g.phase !== 'over';
          const wins = g.wins[id] ?? 0;
          return (
            <div key={id} className={`mc-seat${turn ? ' vez' : ''}`} data-seat={id}>
              <svg className="mc-seat-house" width="38" height="38" viewBox="-23 -20 46 46" aria-hidden="true">
                <House x={0} y={0} color={PLAYER_TINTS[i] ?? PLAYER_TINTS[3]} />
              </svg>
              <div className="mc-seat-info">
                <div className="mc-seat-name">
                  {nameOf(id)}
                  {room && !room.connected && <small className="mc-gone">saiu</small>}
                </div>
                <div className="mc-seat-meta">
                  <span title="cartas de recurso">🂠 {s.resCount}</span>
                  <span title="cordéis na mão">📜 {s.cordelCount}</span>
                  <span title="Vaqueiros jogados">
                    <SvgIcon kind="chapeu" size={17} /> {s.knights}
                  </span>
                  {wins > 0 && <span title="vitórias da noite">🏆 {wins}</span>}
                </div>
                {(g.longestRoad === id || g.largestArmy === id) && (
                  <div className="mc-selos">
                    {g.longestRoad === id && <span className="mc-selo">maior estrada +2</span>}
                    {g.largestArmy === id && <span className="mc-selo comitiva">maior comitiva +2</span>}
                  </div>
                )}
              </div>
              <div className="mc-seat-pts">
                {s.points}
                <small>PONTOS</small>
                {hidden > 0 && <span className="mc-esc">+{hidden} escondido</span>}
              </div>
              {turn && turnLeft !== null && <span className={`mc-relo${turnLeft < LOW_MS ? ' pouco' : ''}`}>⏱ {formatClock(turnLeft)}</span>}
            </div>
          );
        })}
      </div>
      <div className="mc-box mc-bank">
        <h3>banco</h3>
        <div className="mc-bank-res">
          {RES_ORDER.map((r) => (
            <span key={r} title={RES_NAME[r]}>
              <ResIcon kind={r} size={21} />
              {g.bank[r]}
            </span>
          ))}
        </div>
        <div className="mc-deck">
          📜 monte de cordel: <b>{g.deckSize}</b>
        </div>
      </div>
      <CostBox />
    </aside>
  );
});
