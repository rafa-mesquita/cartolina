import type { DixitRoomView } from '@cartolina/shared';
import { Critter } from '../../screens/Critter';
import { seatArc } from './geometry';
import { othersAfter, seatStatus } from './status';

interface Props {
  view: DixitRoomView;
  width: number;
  name: (id: string) => string;
  /** "+n" sobre o assento quando o peão começa a andar. */
  gained: Readonly<Record<string, number>>;
  /** Muda a cada revelação (reinicia a animação do "+n"). */
  floatKey: string;
}

/** Outros jogadores num arco acima da mesa; você embaixo à esquerda. `data-seat` é de onde as cartas voam. */
export function Seats({ view, width, name, gained, floatKey }: Props) {
  const g = view.game;
  const others = othersAfter(
    view.seats.map((s) => s.id),
    view.you,
  );
  const me = view.you ? view.seats.find((s) => s.id === view.you) : undefined;
  const myStatus = me ? seatStatus(g, me.id).text : '';
  return (
    <>
      {others.map((id, i) => {
        const seat = view.seats.find((s) => s.id === id);
        if (!seat) return null;
        const [x, y] = seatArc(i, others.length, width);
        const st = seatStatus(g, id);
        return (
          <div key={id} className={`dx-seat${seat.connected ? '' : ' off'}`} style={{ left: x, top: y }} title={`${seat.name}: ${g.scores[id] ?? 0} pontos`} data-seat={id}>
            <div className="dx-av">
              <Critter color={seat.color} />
              {g.storyteller === id && g.phase !== 'gameover' && (
                <span className="dx-badge" title="narrador">
                  ✎
                </span>
              )}
              {gained[id] ? (
                <span key={floatKey} className="dx-float">
                  +{gained[id]}
                </span>
              ) : null}
            </div>
            <div className="dx-nm">{seat.name}</div>
            <div className="dx-minis">
              {Array.from({ length: Math.min(g.handCounts[id] ?? 0, 7) }, (_, k) => (
                <i key={k} />
              ))}
            </div>
            {st.text && <div className={`dx-tag ${st.tone}`}>{st.text}</div>}
          </div>
        );
      })}
      {me && (
        <div className="dx-me" title={`você: ${g.scores[me.id] ?? 0} pontos`} data-seat={me.id}>
          <div className="dx-av">
            <Critter color={me.color} />
            {g.storyteller === me.id && g.phase !== 'gameover' && (
              <span className="dx-badge" title="narrador">
                ✎
              </span>
            )}
            {gained[me.id] ? (
              <span key={floatKey} className="dx-float">
                +{gained[me.id]}
              </span>
            ) : null}
          </div>
          <div>
            <div className="nm">{name(me.id)}</div>
            <div className="sub">
              {g.scores[me.id] ?? 0} pontos{myStatus ? ` · ${myStatus}` : ''}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
