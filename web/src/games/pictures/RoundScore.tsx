import type { PicturesRoundResult } from '@cartolina/shared';
import { useId } from 'react';
import { Critter } from '../../screens/Critter';
import { ptsWord } from './status';

interface Props {
  result: PicturesRoundResult;
  players: readonly string[];
  scores: Readonly<Record<string, number>>;
  round: number;
  rounds: number;
  me: string | null;
  name: (id: string) => string;
  color: (id: string) => string;
  host: boolean;
  /** O host já mandou a ação: botão travado até chegar uma visão nova. */
  busy: boolean;
  onNext: () => void;
}

/** Placar da rodada (cartão de álbum), pelo total; só o host passa pra próxima (ou pro fim). */
export function RoundScore({ result: r, players, scores, round, rounds, me, name, color, host, busy, onNext }: Props) {
  const titleId = useId();
  const rows = [...players].sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0) || (r.gained[b] ?? 0) - (r.gained[a] ?? 0));
  const hits = r.order.reduce((s, a) => s + (r.correct[a]?.length ?? 0), 0);
  const last = round + 1 >= rounds;
  return (
    <div className="pc-reveal">
      <section className="pc-rv-board" aria-labelledby={titleId}>
        <span className="pc-tape" />
        <h2 id={titleId}>placar da rodada {round + 1}</h2>
        <p className="sum">
          {r.order.length ? (
            <>
              {r.order.length} {r.order.length === 1 ? 'obra' : 'obras'} · <b>{hits}</b> {hits === 1 ? 'acerto' : 'acertos'}
            </>
          ) : (
            'ninguém montou nada nesta rodada'
          )}
        </p>
        {rows.map((p) => {
          const g = r.gained[p] ?? 0, tot = scores[p] ?? 0;
          return (
            <div key={p} className={`pc-board-row${p === me ? ' me' : ''}`} data-p={p}>
              <span className="cr">
                <Critter color={color(p)} />
              </span>
              <span className="nm">{name(p)}</span>
              <span className={`g${g ? '' : ' zero'}`}>+{g}</span>
              <span className="tot">
                {tot}
                <small>{ptsWord(tot)}</small>
              </span>
            </div>
          );
        })}
        <div className="acts">
          {host ? (
            <button className="pc-btn-big" type="button" disabled={busy} onClick={onNext}>
              {last ? 'ver o fim do jogo' : 'próxima rodada'}
            </button>
          ) : (
            <span className="wait">esperando o host…</span>
          )}
        </div>
      </section>
    </div>
  );
}
