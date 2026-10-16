import type { DixitRoundResult } from '@cartolina/shared';
import { Critter } from '../../screens/Critter';
import { reasons, summaryParts } from './reveal';

interface Props {
  result: DixitRoundResult;
  players: readonly string[];
  scores: Readonly<Record<string, number>>;
  target: number;
  name: (id: string) => string;
  color: (id: string) => string;
  host: boolean;
  onNext: () => void;
  onHide: () => void;
}

/** Placar da rodada: quem fez quanto e por quê. Fica no centro, sem cobrir os assentos. */
export function RoundBoard({ result: r, players, scores, target, name, color, host, onNext, onHide }: Props) {
  const rows = [...players].sort((a, b) => (r.gained[b] ?? 0) - (r.gained[a] ?? 0) || Number(b === r.storyteller) - Number(a === r.storyteller));
  const over = Object.values(scores).some((s) => s >= target);
  return (
    <section className="dx-board" aria-label="placar da rodada">
      <h3>placar da rodada</h3>
      <p className="sum">
        {summaryParts(r, name).map((p, i) => (p.em ? <em key={i}>{p.text}</em> : <span key={i}>{p.text}</span>))}.
        {r.clue && (
          <>
            {' '}A dica era <em>“{r.clue}”</em>.
          </>
        )}
      </p>
      {rows.map((p) => {
        const g = r.gained[p] ?? 0;
        return (
          <div key={p} className={`dx-row${p === r.storyteller ? ' st' : ''}`}>
            <Critter color={color(p)} />
            <div>
              <div className="nm">{name(p)}</div>
              <div className="why">{reasons(r, p).map((x) => `${x.points ? `+${x.points} ` : ''}${x.text}`).join(' · ')}</div>
            </div>
            <div className={`g${g ? '' : ' zero'}`}>+{g}</div>
            <div className="tot">{scores[p] ?? 0} no total</div>
          </div>
        );
      })}
      <div className="acts">
        <button className="dx-btn ghost" type="button" onClick={onHide}>
          ver a mesa
        </button>
        {host && (
          <button className="dx-btn" type="button" onClick={onNext}>
            {over ? 'ver quem venceu' : 'próxima rodada'}
          </button>
        )}
      </div>
      {!host && <p className="wait">esperando o host passar pra próxima…</p>}
    </section>
  );
}
