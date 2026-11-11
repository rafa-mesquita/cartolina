import type { MandacaruView } from '@cartolina/shared';
import { memo } from 'react';
import { SoundPill } from '../dixit/DixitTopBar';
import { DiceFace, MandacaruLogo } from './art';
import { formatClock } from './clock';
import { LOW_MS } from './Seats';
import { YOU, type NameOf } from './texts';

/** Quem já ganhou alguma na noite, de quem tem mais pra quem tem menos. */
export function winners(wins: Record<string, number>): string[] {
  return Object.keys(wins)
    .filter((p) => (wins[p] ?? 0) > 0)
    .sort((a, b) => (wins[b] ?? 0) - (wins[a] ?? 0));
}

/** "sua vez · preparação", "vez de Bia", "Bia venceu!". */
export function turnText(g: MandacaruView, nameOf: NameOf): string {
  if (g.phase === 'over') {
    const w = g.winner === null ? 'alguém' : nameOf(g.winner);
    return w === YOU ? 'você venceu!' : `${w} venceu!`;
  }
  if (g.turn === null) return '';
  const who = nameOf(g.turn);
  const base = who === YOU ? 'sua vez' : `vez de ${who}`;
  return g.phase === 'setup' ? `${base} · preparação` : base;
}

interface Props {
  game: MandacaruView;
  nameOf: NameOf;
  /** Ms que faltam no relógio da fase (descarte na fase `discard`, turno nas outras); `null` = parado. */
  left: number | null;
  /** Muda a cada rolagem nova (reinicia a chacoalhada dos dados). */
  rollId: number;
  /** Abre/fecha a folha de regras. */
  onRules: () => void;
  rulesOpen: boolean;
}

/** Topo: logo, de quem é a vez, relógio (vermelho no último minuto, "parado" sem prazo), placar da noite, regras, som e dados. */
export const TopBar = memo(function TopBar({ game: g, nameOf, left, rollId, onRules, rulesOpen }: Props) {
  const discard = g.phase === 'discard';
  const clock = left === null ? 'parado' : formatClock(left);
  const low = left !== null && left < LOW_MS && !discard;
  const score = winners(g.wins).map((p) => `${nameOf(p)} ${g.wins[p]}`);
  const dice = g.dice ?? [5, 2];
  return (
    <header className="mc-top">
      <div className="mc-logo">
        <MandacaruLogo size={46} />
        <div>
          <h1>Mandacaru</h1>
          <div className="mc-sub">faça a caatinga florir</div>
        </div>
      </div>
      <div className="mc-turno">
        <div className="mc-vezbox">
          <span className="mc-vez">{turnText(g, nameOf)}</span>
          {score.length > 0 && <span className="mc-score">placar da noite: {score.join(' · ')}</span>}
        </div>
        {g.phase !== 'over' && (
          <span className={`mc-relogio${low ? ' pouco' : ''}`} title={discard ? 'prazo do descarte' : 'tempo da vez'}>
            {discard ? `descarte ${clock}` : clock}
          </span>
        )}
      </div>
      <div className="mc-topo-dir">
        <button type="button" className={`mc-btn sec mini${rulesOpen ? ' on' : ''}`} aria-pressed={rulesOpen} onClick={onRules}>
          regras
        </button>
        <SoundPill />
        <div className="mc-dados" aria-label={g.dice ? `dados: ${g.dice[0]} e ${g.dice[1]}` : 'dados'} role="img">
          {dice.map((n, i) => (
            <svg key={`${rollId}-${i}`} className={`mc-dado${rollId > 0 ? ' rolando' : ''}${g.dice ? '' : ' apagado'}`} viewBox="0 0 100 100" aria-hidden="true">
              <DiceFace n={n} />
            </svg>
          ))}
        </div>
      </div>
    </header>
  );
});
