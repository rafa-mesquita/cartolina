import type { ItoOutcome, RoundCard, RoundRecord } from '@cartolina/shared';
import { useId, type CSSProperties } from 'react';
import { critterSvg } from '../../brand/critters';

const OUTCOME: Record<ItoOutcome, { label: string; good: boolean }> = {
  round_won: { label: 'vitória', good: true },
  round_lost: { label: 'errou', good: false },
  level_cleared: { label: 'nível ✓', good: true },
  level_failed: { label: 'repetiu o nível', good: false },
  won: { label: 'zerou a campanha', good: true },
  lost: { label: 'acabaram as vidas', good: false },
};

const dateFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export function CritterIcon({ color, title, className = 'mini-avatar' }: { color: string; title?: string; className?: string }) {
  return <span className={className} title={title} dangerouslySetInnerHTML={{ __html: critterSvg(color) }} />;
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

function MiniCard({ card }: { card: RoundCard }) {
  return (
    <div className={`mini-card ${card.error ? 'err' : ''}`} style={{ '--c': card.color } as CSSProperties}>
      <CritterIcon color={card.color} className="mini-badge" />
      <div className="mini-num">{card.value}</div>
      <div className="mini-clue">{card.clue || '…'}</div>
      <div className="mini-name">{card.name}</div>
      {card.error && (
        <div className="mini-x" role="img" aria-label="fora de ordem">
          ✕
        </div>
      )}
    </div>
  );
}

export function RoundItem({ round, open, onToggle }: { round: RoundRecord; open: boolean; onToggle(): void }) {
  const outcome = OUTCOME[round.outcome];
  const bodyId = useId();
  return (
    <li className="round">
      <button type="button" className="round-head" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
        <span className="round-date">{dateFmt.format(new Date(round.playedAt))}</span>
        <span className="round-theme">{round.theme.titulo}</span>
        <span className="round-mode">{round.mode === 'livre' ? 'livre' : `campanha · nível ${round.level}`}</span>
        <span className={`round-outcome ${outcome.good ? 'good' : 'bad'}`}>{outcome.label}</span>
        <span className="round-players">
          {/* nomes podem repetir numa sala; cores não */}
          {round.players.map((p) => (
            <CritterIcon key={p.color} color={p.color} title={p.name} />
          ))}
        </span>
      </button>
      {open && (
        <div className="round-body" id={bodyId}>
          <p className="round-scale">
            <b>1</b> {round.theme.min} · <b>100</b> {round.theme.max}
          </p>
          <div className="mini-row">
            {round.cards.map((c, i) => (
              <MiniCard key={i} card={c} />
            ))}
          </div>
        </div>
      )}
    </li>
  );
}
