import { useState } from 'react';
import { camelioStandings, type CamelioView } from '@cartolina/shared';
import { Critter } from '../../screens/Critter';
import { endWhy, winnersTxt } from './Banner';
import { Flag, scoredColors } from './Seat';

export { endWhy };

/** Título do cartaz: "você ganhou!", "Bia ganhou!" ou "empate: Bia e você" (quem vê por último). */
export function endTitle(v: CamelioView, you: string | null, name: (id: string) => string): string {
  const w = winnersTxt(v, you, name);
  return v.winners.length > 1 ? `empate: ${w}` : `${w} ganhou!`;
}

export interface EndCardProps {
  /** Vista da partida acabada (`phase === 'over'`). */
  v: CamelioView;
  you: string | null;
  /** "você" pra quem vê. */
  name: (id: string) => string;
  color: (id: string) => string;
  host: boolean;
  /** Trava os botões do host depois do clique. */
  busy: boolean;
  onAgain: () => void;
  onLobby: () => void;
}

const ptsTxt = (n: number) => `${n} ${n === 1 ? 'ponto' : 'pontos'}`;

/** Cartaz do fim da partida: placar, motivo e botões do host. "ver a mesa" recolhe numa faixa; clicar na faixa reabre. */
export function EndCard({ v, you, name, color, host, busy, onAgain, onLobby }: EndCardProps) {
  const [mini, setMini] = useState(false);
  const ids = (cards: readonly { id: number }[]) => cards.map((c) => c.id);
  const table = Object.fromEntries(v.players.map((p) => [p, ids(v.table[p] ?? [])]));
  const scored = Object.fromEntries(v.players.map((p) => [p, ids(v.scored[p] ?? [])]));
  const rows = camelioStandings(v.players, table, scored);
  const title = endTitle(v, you, name);

  const buttons = host ? (
    <>
      <button type="button" className="main" disabled={busy} onClick={onAgain}>
        jogar de novo
      </button>
      <button type="button" disabled={busy} onClick={onLobby}>
        voltar pro lobby
      </button>
    </>
  ) : (
    <span className="why">esperando o host…</span>
  );

  const cls = ['cl-end', v.players.length >= 4 ? 'compact' : '', mini ? 'mini' : ''].filter(Boolean).join(' ');
  return (
    <div
      className={cls}
      role="region"
      aria-label="fim da partida"
      onClick={mini ? () => setMini(false) : undefined}
    >
      <div className="hd">
        <h2>{title}</h2>
        <span className="why">{endWhy(v)}</span>
      </div>
      <ol>
        {rows.map((r) => {
          const done = scoredColors(v.scored[r.player] ?? []);
          return (
            <li key={r.player} className={v.winners.includes(r.player) ? 'win' : undefined} data-pid={r.player} title={`${name(r.player)} · ${ptsTxt(r.points)}`}>
              <span className="rk">{r.place}º</span>
              <span className="cr">
                <Critter color={color(r.player)} />
              </span>
              <span className="nm">{name(r.player)}</span>
              <span className="flags">{done.length ? done.map((c) => <Flag key={c} color={c} />) : <span className="none">nenhuma cor</span>}</span>
              <span className="sph">
                {r.spheres} {r.spheres === 1 ? 'esfera' : 'esferas'} em jogo
              </span>
            </li>
          );
        })}
      </ol>
      <span className="reopen">
        <i className="ti ti-list-numbers" aria-hidden="true" />
        ver o placar
      </span>
      <div className="acts">
        {buttons}
        <button
          type="button"
          className="ghost"
          title="recolhe o placar pra ver a mesa"
          onClick={(e) => {
            e.stopPropagation();
            setMini(true);
          }}
        >
          <i className="ti ti-eye" aria-hidden="true" />
          ver a mesa
        </button>
      </div>
    </div>
  );
}
