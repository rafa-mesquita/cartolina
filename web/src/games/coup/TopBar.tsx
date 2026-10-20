import { memo } from 'react';
import { SoundPill } from '../dixit/DixitTopBar';
import type { NameOf } from './texts';

/** Quem já ganhou alguma na noite, de quem tem mais pra quem tem menos. */
export function winners(wins: Record<string, number>): string[] {
  return Object.keys(wins)
    .filter((p) => (wins[p] ?? 0) > 0)
    .sort((a, b) => (wins[b] ?? 0) - (wins[a] ?? 0));
}

/** Topo da mesa: "CÚPI", o placar da noite ("Beto 2 · você 1", só quem já ganhou) e o som. A faixa vermelha é o fundo do palco. */
export const TopBar = memo(function TopBar({ wins, nameOf }: { wins: Record<string, number>; nameOf: NameOf }) {
  const who = winners(wins);
  return (
    <header className="cp-top">
      <h1>CÚPI</h1>
      <div className="cp-score">
        placar da noite:{' '}
        {who.length === 0
          ? 'ninguém ganhou ainda'
          : who.map((p, i) => (
              <span key={p}>
                {i > 0 && ' · '}
                <em>{`${nameOf(p)} ${wins[p]}`}</em>
              </span>
            ))}
      </div>
      <SoundPill />
    </header>
  );
});
