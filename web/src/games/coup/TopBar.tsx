import { memo } from 'react';
import { SoundPill } from '../dixit/DixitTopBar';
import type { NameOf } from './texts';

/** Quem já ganhou alguma na noite, de quem tem mais pra quem tem menos. */
export function winners(wins: Record<string, number>): string[] {
  return Object.keys(wins)
    .filter((p) => (wins[p] ?? 0) > 0)
    .sort((a, b) => (wins[b] ?? 0) - (wins[a] ?? 0));
}

/** Placar resumido do celular: o seu e o de quem lidera (se estiver na sua frente). Quem assiste vê só o líder. */
export function shortScore(wins: Record<string, number>, me: string | null, nameOf: NameOf): string[] {
  const w = (p: string) => wins[p] ?? 0;
  const parts: string[] = [];
  if (me !== null) parts.push(`${nameOf(me)} ${w(me)}`);
  const lead = winners(wins)[0];
  if (lead !== undefined && lead !== me && w(lead) > (me === null ? 0 : w(me))) parts.push(`${nameOf(lead)} ${w(lead)}`);
  return parts;
}

interface Props {
  wins: Record<string, number>;
  nameOf: NameOf;
  /** Celular: placar resumido ("você 1 · Beto 2"). */
  phone: boolean;
  /** Seu id na partida (`null` = quem assiste). */
  me: string | null;
}

/** Topo da mesa: "CÚPI", o placar da noite ("Beto 2 · você 1", só quem já ganhou) e o som. A faixa vermelha é o fundo do palco. */
export const TopBar = memo(function TopBar({ wins, nameOf, phone, me }: Props) {
  const who = phone ? shortScore(wins, me, nameOf) : winners(wins).map((p) => `${nameOf(p)} ${wins[p]}`);
  return (
    <header className="cp-top">
      <h1>CÚPI</h1>
      <div className="cp-score">
        {phone ? 'placar ' : 'placar da noite: '}
        {who.length === 0
          ? 'ninguém ganhou ainda'
          : who.map((t, i) => (
              <span key={i}>
                {i > 0 && ' · '}
                <em>{t}</em>
              </span>
            ))}
      </div>
      <SoundPill />
    </header>
  );
});
