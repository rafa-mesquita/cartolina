import type { KittensExitHow, KittensMatchRecord, KittensStatEntry, KittensStats } from '@cartolina/shared';
import { useId } from 'react';
import { TOO_MANY_MESSAGE } from '../../../net/errors';
import { PixelCritter } from '../PixelCritter';
import { useKittensHistory } from './useKittensHistory';
import './kittens-history.css';

const dateFmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const percent = (rate: number): string => `${Math.round(rate * 100)}%`;
const HOW: Record<KittensExitHow, string> = { boom: 'explodiu', left: 'caiu' };

/** "Ana", "Ana e Beto", "Ana, Beto e Caio". */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

/** A frase inteira da partida, pra leitor de tela. */
function matchLabel(m: KittensMatchRecord, date: string): string {
  const parts = [date, `${m.winner.name} venceu`, `jogaram ${joinNames(m.players.map((p) => p.name))}`];
  // em ordem: "saíram Caio (explodiu), depois Ana (caiu)"
  if (m.exits.length) parts.push(`saíram ${m.exits.map((e) => `${e.who.name} (${HOW[e.how]})`).join(', depois ')}`);
  return parts.join(' · ');
}

function MatchCard({ match: m }: { match: KittensMatchRecord }) {
  const date = dateFmt.format(new Date(m.playedAt));
  return (
    <li className="kt-hx-match" aria-label={matchLabel(m, date)}>
      <p className="kt-hx-meta">
        <span>{date}</span>
        <span>{m.players.length} jogadores</span>
      </p>
      <h3 className="kt-hx-winner">
        <PixelCritter className="kt-hx-face kt-hx-big" color={m.winner.color} />
        <span>
          <b>{m.winner.name}</b> venceu
        </span>
      </h3>
      {m.exits.length > 0 && (
        <ol className="kt-hx-exits" aria-label="quem saiu, na ordem">
          {m.exits.map((e, i) => (
            <li key={`${e.who.name}-${i}`} className={e.how === 'left' ? 'kt-hx-left' : undefined}>
              <span className="kt-hx-pos">{i + 1}º</span>
              <PixelCritter className="kt-hx-face" color={e.who.color} />
              <span className="kt-hx-name">{e.who.name}</span>
              <span className="kt-hx-how">{HOW[e.how]}</span>
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

function Board({
  title,
  rows,
  detail,
  empty = 'joguem mais umas partidas',
}: {
  title: string;
  rows: KittensStatEntry[];
  detail: (e: KittensStatEntry) => string;
  empty?: string;
}) {
  const titleId = useId();
  return (
    <section className="kt-hx-board" aria-labelledby={titleId}>
      <h3 id={titleId}>{title}</h3>
      {rows.length === 0 ? (
        <p className="kt-hx-muted">{empty}</p>
      ) : (
        <ol>
          {rows.map((r) => (
            <li key={r.name}>
              <PixelCritter className="kt-hx-face" color={r.color} />
              <span>
                <b>{r.name}</b>
                <small>{detail(r)}</small>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Um quadro com o top 3 de cada estatística (abaixo do mínimo de partidas, o quadro pede mais partidas). */
function GaleraBoards({ stats }: { stats: KittensStats }) {
  const titleId = useId();
  return (
    <section className="kt-hx-galera" aria-labelledby={titleId}>
      <h2 id={titleId}>a galera</h2>
      <div className="kt-hx-boards">
        <Board
          title="maior % de vitórias"
          rows={stats.bestRate}
          detail={(e) => `${percent(e.rate)} · ${e.count} de ${plural(e.matches, 'partida', 'partidas')}`}
          empty="só entra quem tem 10 partidas ou mais"
        />
        <Board
          title="mais vitórias"
          rows={stats.mostWins}
          detail={(e) => `${plural(e.count, 'vitória', 'vitórias')} em ${plural(e.matches, 'partida', 'partidas')}`}
        />
        <Board
          title="quem explode primeiro"
          rows={stats.firstOut}
          detail={(e) => `${plural(e.count, 'vez', 'vezes')} em ${plural(e.matches, 'partida', 'partidas')}`}
        />
        <Board
          title="rei do Nem vem!"
          rows={stats.nopeKings}
          detail={(e) => `${decimal.format(e.rate)} por partida · ${e.count} em ${plural(e.matches, 'partida', 'partidas')}`}
        />
      </div>
    </section>
  );
}

/** Aba histórico do Tatubum: estatísticas da galera e as partidas gravadas, na noite do cerrado em pixel art. */
export function KittensHistory() {
  const { data, loadFailed, loadingMore, moreError, reload, loadMore } = useKittensHistory();

  if (data === undefined && loadFailed) {
    return (
      <div className="kt-history">
        <section className="kt-hx-fail">
          <h2>{loadFailed === 'too_many' ? TOO_MANY_MESSAGE : 'não deu pra falar com o servidor'}</h2>
          <button className="kt-hx-btn" type="button" onClick={reload}>
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
    <div className="kt-history">
      {data.matches.length === 0 ? (
        <section className="kt-hx-empty">
          <h2>Nenhuma partida de Tatubum ainda.</h2>
          <p>O cerrado está quietinho. Joguem uma e ela aparece aqui.</p>
        </section>
      ) : (
        <>
          {data.stats && <GaleraBoards stats={data.stats} />}
          <section>
            <h2>partidas</h2>
            <ol className="kt-hx-list">
              {data.matches.map((m) => (
                <MatchCard key={m.id} match={m} />
              ))}
            </ol>
            {data.nextBefore !== null && (
              <button className="kt-hx-btn kt-hx-more" type="button" onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? 'carregando…' : 'carregar mais'}
              </button>
            )}
            {moreError && (
              <p className="kt-hx-error" role="alert">
                {moreError}
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
