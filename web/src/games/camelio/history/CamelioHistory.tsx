import type { CamelioKind, CamelioMatchRecord, CamelioOutcome, CamelioRecordCard, CamelioStats, CamelioTitle } from '@cartolina/shared';
import { useId, useState } from 'react';
import { TOO_MANY_MESSAGE } from '../../../net/errors';
import { Critter } from '../../../screens/Critter';
import { HEX, esferas } from '../cardArt';
import { givenText, joinNames, keyPlays, outcomeText, plural, reasonText, winnersText } from './texts';
import { useCamelioHistory } from './useCamelioHistory';
import './camelio-history.css';

const dateFmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const KIND: Record<CamelioKind, string> = { normal: '', bicolor: ' (bicolor)', multi: ' (multicolor)' };
const OUTCOME_CLASS: Record<Exclude<CamelioOutcome, 'none'>, string> = { scored: 'cl-hx-scored', bust: 'cl-hx-bust', lost: 'cl-hx-lost' };

/** O bichinho da cor, num tamanho fixo (o `Critter` ocupa 100% de quem o envolve). */
function Face({ color, big = false }: { color: string; big?: boolean }) {
  return (
    <span className={big ? 'cl-hx-face cl-hx-big' : 'cl-hx-face'} aria-hidden="true">
      <Critter color={color} />
    </span>
  );
}

/** Cartinha da jogada: a cor e o número de esferas; bicolor e multicolor ganham a marquinha da mesa. */
function Chip({ card }: { card: CamelioRecordCard }) {
  const label = `${esferas(card.spheres)} ${card.color}${KIND[card.kind]}`;
  return (
    <i className="cl-hx-chip" style={{ background: HEX[card.color] }} title={label}>
      {card.kind !== 'normal' && <span className={`cl-hx-kind cl-hx-kind-${card.kind}`} aria-hidden="true" />}
      <span className="cl-hx-num">{card.spheres}</span>
    </i>
  );
}

/** A frase inteira da partida, pra leitor de tela. */
function matchLabel(m: CamelioMatchRecord, date: string): string {
  return [date, winnersText(m), reasonText(m), `jogaram ${joinNames(m.players.map((p) => p.name))}`].join(' · ');
}

function MatchCard({ match: m }: { match: CamelioMatchRecord }) {
  const [open, setOpen] = useState(false);
  const timelineId = useId();
  const date = dateFmt.format(new Date(m.playedAt));
  const first = m.players[m.winners[0] ?? -1];
  const plays = keyPlays(m);
  const won = new Set(m.winners);
  // mais pontos primeiro; empate fica na ordem dos assentos (o sort é estável)
  const order = m.players
    .map((p, i) => ({ p, i, final: m.final[i] ?? { colors: [], spheres: 0 } }))
    .sort((a, b) => b.final.colors.length - a.final.colors.length);

  return (
    <li className="cl-hx-match" aria-label={matchLabel(m, date)}>
      <p className="cl-hx-meta">
        <span>{date}</span>
        <span>{m.players.length} jogadores</span>
        <span className="cl-hx-reason">{reasonText(m)}</span>
      </p>
      <h3 className="cl-hx-winner">
        {first && <Face color={first.color} big />}
        <span>{winnersText(m)}</span>
      </h3>
      <ol className="cl-hx-score" aria-label="placar">
        {order.map(({ p, i, final }) => (
          <li key={i} className={won.has(i) ? 'cl-hx-won' : undefined}>
            <Face color={p.color} />
            <b className="cl-hx-name">{p.name}</b>
            <span className="cl-hx-pts">{plural(final.colors.length, 'ponto', 'pontos')}</span>
            <span className="cl-hx-dots">
              {final.colors.map((c) => (
                <i key={c} className="cl-hx-dot" style={{ background: HEX[c] }} title={c} />
              ))}
            </span>
            {m.endReason === 'deck' && <span className="cl-hx-spheres">· {plural(final.spheres, 'esfera', 'esferas')} na mesa</span>}
          </li>
        ))}
      </ol>
      <button className="cl-hx-toggle" type="button" aria-expanded={open} aria-controls={open ? timelineId : undefined} onClick={() => setOpen((o) => !o)}>
        {open ? 'esconder os lances' : `ver os lances (${plays.length})`}
      </button>
      {open &&
        (plays.length === 0 ? (
          <p className="cl-hx-muted" id={timelineId}>
            nenhum lance marcante
          </p>
        ) : (
          <ol className="cl-hx-timeline" id={timelineId} aria-label="lances que importam">
            {plays.map(({ n, play }) => (
              <li key={n} className={OUTCOME_CLASS[play.outcome as Exclude<CamelioOutcome, 'none'>]}>
                <span className="cl-hx-n">{n}ª</span>
                <Chip card={play.card} />
                <span className="cl-hx-what">
                  <span>{givenText(m, play)}</span>
                  <b>{outcomeText(m, play)}</b>
                </span>
              </li>
            ))}
          </ol>
        ))}
    </li>
  );
}

/** Um título da galera como ingresso de circo. */
function Ticket({ title, about, value, unit }: { title: string; about: string; value: CamelioTitle | null; unit: [string, string] }) {
  const titleId = useId();
  return (
    <section className="cl-hx-ticket" aria-labelledby={titleId}>
      <h3 id={titleId}>{title}</h3>
      <p className="cl-hx-about">{about}</p>
      {value === null ? (
        <p className="cl-hx-muted">ninguém ainda</p>
      ) : (
        <div className="cl-hx-holders">
          <span className="cl-hx-faces">
            {value.holders.map((h) => (
              <Face key={h.name} color={h.color} />
            ))}
          </span>
          <b>{joinNames(value.holders.map((h) => h.name))}</b>
          <span className="cl-hx-count">{plural(value.count, unit[0], unit[1])}</span>
        </div>
      )}
    </section>
  );
}

/** Os quatro títulos e a lista de vitórias da galera inteira. */
function Galera({ stats }: { stats: CamelioStats }) {
  const titleId = useId();
  const times: [string, string] = ['vez', 'vezes'];
  return (
    <section className="cl-hx-galera" aria-labelledby={titleId}>
      <h2 id={titleId}>a galera</h2>
      <div className="cl-hx-titles">
        <Ticket title="domador" about="mais vitórias" value={stats.domador} unit={['vitória', 'vitórias']} />
        <Ticket title="sabotador" about="mais estouros causados nos outros" value={stats.sabotador} unit={times} />
        <Ticket title="palhaço" about="mais estouros na própria mesa" value={stats.palhaco} unit={times} />
        <Ticket title="Papai Noel" about="mais 5 de bandeja pros outros" value={stats.papaiNoel} unit={times} />
      </div>
      {stats.galera.length > 0 && (
        <ol className="cl-hx-wins" aria-label="vitórias">
          {stats.galera.map((g) => (
            <li key={g.name}>
              <Face color={g.color} />
              <b>{g.name}</b>
              <small>{`${plural(g.wins, 'vitória', 'vitórias')} em ${plural(g.matches, 'partida', 'partidas')}`}</small>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Aba histórico do Cama-Leão: a galera e as partidas gravadas, debaixo da lona do circo. */
export function CamelioHistory() {
  const { data, loadFailed, loadingMore, moreError, reload, loadMore } = useCamelioHistory();

  if (data === undefined && loadFailed) {
    return (
      <div className="cl-history">
        <section className="cl-hx-fail">
          <h2>{loadFailed === 'too_many' ? TOO_MANY_MESSAGE : 'não deu pra falar com o servidor'}</h2>
          <button className="cl-hx-btn" type="button" onClick={reload}>
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
    <div className="cl-history">
      {data.matches.length === 0 ? (
        <section className="cl-hx-empty">
          <h2>Nenhuma partida de Cama-Leão ainda.</h2>
          <p>O picadeiro está vazio. Joguem uma e ela aparece aqui.</p>
        </section>
      ) : (
        <>
          {data.stats && <Galera stats={data.stats} />}
          <section>
            <h2>partidas</h2>
            <ol className="cl-hx-list">
              {data.matches.map((m) => (
                <MatchCard key={m.id} match={m} />
              ))}
            </ol>
            {data.nextBefore !== null && (
              <button className="cl-hx-btn cl-hx-more" type="button" onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? 'carregando…' : 'carregar mais'}
              </button>
            )}
            {moreError && (
              <p className="cl-hx-error" role="alert">
                {moreError}
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
