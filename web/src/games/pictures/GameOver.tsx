import { useId } from 'react';
import { Critter } from '../../screens/Critter';
import { listNames, ptsWord } from './status';

interface Props {
  players: readonly string[];
  scores: Readonly<Record<string, number>>;
  winners: readonly string[];
  me: string | null;
  name: (id: string) => string;
  color: (id: string) => string;
  host: boolean;
  onAgain: () => void;
  onLobby: () => void;
}

/** Posições com empate dividindo o lugar (1º, 1º, 3º), na ordem do placar. */
export function standings(players: readonly string[], scores: Readonly<Record<string, number>>): { id: string; pos: number }[] {
  const rows = [...players].sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0));
  let pos = 0;
  return rows.map((id, i) => {
    if (i === 0 || (scores[id] ?? 0) !== (scores[rows[i - 1]!] ?? 0)) pos = i + 1;
    return { id, pos };
  });
}

/** Fim de jogo: a página final do álbum. Só o host joga de novo ou volta pro lobby. */
export function GameOver({ players, scores, winners, me, name, color, host, onAgain, onLobby }: Props) {
  const titleId = useId();
  const sub =
    winners.length > 1 ? (
      <>
        empate! <b>{listNames(winners, name)}</b> dividem o álbum
      </>
    ) : winners[0] !== undefined ? (
      <>
        <b>{name(winners[0])}</b> venceu!
      </>
    ) : null;
  return (
    <main className="pc-final">
      <section className="pc-fin" aria-labelledby={titleId}>
        <span className="pc-tape" />
        <span className="pc-tape r" />
        <h2 id={titleId}>fim de jogo</h2>
        {sub && <p className="sub">{sub}</p>}
        {standings(players, scores).map(({ id, pos }) => {
          const w = winners.includes(id), tot = scores[id] ?? 0;
          return (
            <div key={id} className={`pc-fin-row${w ? ' win' : ''}${id === me ? ' me' : ''}`} data-p={id}>
              <span className="pos">{pos}º</span>
              <span className="cr">
                <Critter color={color(id)} />
              </span>
              <span className="nm">
                {name(id)}
                {w && <i className="ti ti-star-filled star" title="venceu" aria-label="venceu" />}
              </span>
              <span className="pts">
                {tot}
                <small>{ptsWord(tot)}</small>
              </span>
            </div>
          );
        })}
        <div className="acts">
          {host ? (
            <>
              <button className="pc-btn-big" type="button" onClick={onAgain}>
                jogar de novo
              </button>
              <button className="pc-btn-soft" type="button" onClick={onLobby}>
                voltar pro lobby
              </button>
            </>
          ) : (
            <span className="wait">esperando o host…</span>
          )}
        </div>
      </section>
    </main>
  );
}
