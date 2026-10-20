import type { CoupMatchRecord } from '@cartolina/shared';
import { TOO_MANY_MESSAGE } from '../../../net/errors';
import { Critter } from '../../../screens/Critter';
import { CHARACTER_NAMES } from '../names';
import { useCoupHistory } from './useCoupHistory';
import './coup-history.css';

const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/** "Ana", "Ana e Beto", "Ana, Beto e Caio". */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

/** A frase inteira da partida, pra leitor de tela. */
function matchLabel(m: CoupMatchRecord, date: string): string {
  const cards = m.winnerCards.map((c) => CHARACTER_NAMES[c]);
  const parts = [date, `${m.winner.name} tomou o poder${cards.length ? ` com ${joinNames(cards)}` : ''}`];
  parts.push(`jogaram ${joinNames(m.players.map((p) => p.name))}`);
  if (m.out.length) parts.push(`saíram ${joinNames(m.out.map((p) => p.name))}`);
  return parts.join(' · ');
}

function MatchCard({ match: m }: { match: CoupMatchRecord }) {
  const date = dateFmt.format(new Date(m.playedAt));
  return (
    <li className="cph-match" aria-label={matchLabel(m, date)}>
      <p className="cph-meta">
        <span>{date}</span>
        <span>{m.players.length} jogadores</span>
      </p>
      <div className="cph-head">
        <h3 className="cph-title">
          <span className="cph-face">
            <Critter color={m.winner.color} />
          </span>
          <b>{m.winner.name}</b> tomou o poder
        </h3>
        <span className="cph-cards">
          {m.winnerCards.map((c, i) => (
            <span key={`${c}-${i}`} className="cph-seal">
              {CHARACTER_NAMES[c]}
            </span>
          ))}
        </span>
      </div>
      <div className="cph-who">
        <span className="cph-label">jogaram:</span>
        <ul className="cph-players">
          {m.players.map((p, i) => (
            <li key={`${p.name}-${i}`}>
              <span className="cph-face">
                <Critter color={p.color} />
              </span>
              {p.name}
            </li>
          ))}
        </ul>
      </div>
      {m.out.length > 0 && <p className="cph-out">{`saíram: ${m.out.map((p) => p.name).join(' → ')}`}</p>}
    </li>
  );
}

/** Aba histórico do Cúpi: as partidas gravadas, no visual de cartaz de propaganda. */
export function CoupHistory() {
  const { data, loadFailed, loadingMore, moreError, reload, loadMore } = useCoupHistory();

  if (data === undefined && loadFailed) {
    return (
      <div className="cph">
        <section className="cph-fail">
          <h2>{loadFailed === 'too_many' ? TOO_MANY_MESSAGE : 'não deu pra falar com o servidor'}</h2>
          <button className="cph-btn" type="button" onClick={reload}>
            tentar de novo
          </button>
        </section>
      </div>
    );
  }
  if (data === undefined) {
    return (
      <p className="hint" role="status">
        carregando…
      </p>
    );
  }
  if (data === null) {
    return (
      <section className="panel">
        <p>Esse jogo ainda não tem histórico.</p>
      </section>
    );
  }

  return (
    <div className="cph">
      {data.matches.length === 0 ? (
        <section className="cph-empty">
          <h2>Nenhuma partida de Cúpi ainda.</h2>
          <p>Joguem uma e ela aparece aqui.</p>
        </section>
      ) : (
        <section>
          <h2>partidas</h2>
          <ol className="cph-list">
            {data.matches.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </ol>
          {data.nextBefore !== null && (
            <button className="cph-btn cph-more" type="button" onClick={() => void loadMore()} disabled={loadingMore}>
              {loadingMore ? 'carregando…' : 'ver mais'}
            </button>
          )}
          {moreError && (
            <p className="cph-error" role="alert">
              {moreError}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
