import type { DixitHistoryStats } from '@cartolina/shared';
import { useId } from 'react';
import { Critter } from '../../../screens/Critter';
import { percent, plural } from './format';

interface Row {
  name: string;
  color: string;
  detail: string;
}

function Board({ title, rows }: { title: string; rows: Row[] }) {
  const titleId = useId();
  return (
    <section className="dxh-board" aria-labelledby={titleId}>
      <h3 id={titleId}>{title}</h3>
      {rows.length === 0 ? (
        <p className="muted">jogue mais umas rodadas</p>
      ) : (
        <ol>
          {rows.map((r) => (
            <li key={r.name}>
              <Critter color={r.color} />
              <span>
                <b>{r.name}</b>
                <small>{r.detail}</small>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Quatro quadros com o top 3 de cada estatística (abaixo do mínimo, o quadro pede mais rodadas). */
export function GaleraBoards({ stats }: { stats: DixitHistoryStats }) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId}>
      <h2 id={titleId}>a galera</h2>
      <div className="dxh-boards">
        <Board title="quem mais venceu" rows={stats.mostWins.map((e) => ({ ...e, detail: plural(e.wins, 'vitória', 'vitórias') }))} />
        <Board
          title="quem mais acha"
          rows={stats.bestFinders.map((e) => ({ ...e, detail: `${percent(e.rate)} · achou ${e.hits} de ${plural(e.total, 'voto', 'votos')}` }))}
        />
        <Board
          title="quem mais engana"
          rows={stats.bestFoolers.map((e) => ({ ...e, detail: `${plural(e.hits, 'voto', 'votos')} em ${plural(e.total, 'rodada', 'rodadas')}` }))}
        />
        <Board
          title="melhor narrador"
          rows={stats.bestTellers.map((e) => ({ ...e, detail: `${percent(e.rate)} · ${e.hits} de ${plural(e.total, 'narração', 'narrações')}` }))}
        />
      </div>
    </section>
  );
}
