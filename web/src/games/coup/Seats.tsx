import { memo, type CSSProperties } from 'react';
import type { CoupSeat, CoupView, SeatView } from '@cartolina/shared';
import { Critter } from '../../screens/Critter';
import { CardBack, CardFace } from './CardFace';
import type { NameOf } from './texts';

/** Oponentes na ordem dos assentos, começando por quem vem depois de você (quem assiste vê todo mundo, na ordem). */
export function opponents(game: CoupView, you: string | null): CoupSeat[] {
  const i = you === null ? -1 : game.players.indexOf(you);
  const order = i < 0 ? game.players : [...game.players.slice(i + 1), ...game.players.slice(0, i)];
  return order.flatMap((id) => game.seats.find((s) => s.id === id) ?? []);
}

const coinsText = (n: number) => `${n} moeda${n === 1 ? '' : 's'}`;

interface Props {
  game: CoupView;
  /** Assentos da sala (nome, cor, conectado). */
  roomSeats: SeatView[];
  you: string | null;
  nameOf: NameOf;
  /** Modo "escolher alvo": os assentos de `game.can.targets` viram botões. */
  aiming: boolean;
  onTarget: (id: string) => void;
}

/** Os oponentes em linha (por dentro, só `<span>`: o assento-alvo é um `<button>`): nome, bichinho, 2 cartinhas e moedas; da vez em vermelho, fora apagado, desconectado "saiu". */
export const Seats = memo(function Seats({ game, roomSeats, you, nameOf, aiming, onTarget }: Props) {
  const targets = aiming ? game.can.targets : [];
  return (
    // celular: grade de até 5 colunas
    <div className="cp-opps" style={{ '--cols': Math.min(5, Math.max(1, game.players.length - 1)) } as CSSProperties}>
      {opponents(game, you).map((s) => {
        const room = roomSeats.find((r) => r.id === s.id);
        const turn = game.turn === s.id && game.phase !== 'over';
        const aim = targets.includes(s.id);
        const cls = ['cp-opp', turn ? 'turn' : '', s.out ? 'out' : '', aim ? 'aim' : ''].filter(Boolean).join(' ');
        const body = (
          <>
            <span className="cp-nm">
              {nameOf(s.id)}
              {room && !room.connected && !s.out && <span className="cp-tag">saiu</span>}
            </span>
            {room && <Critter color={room.color} />}
            <span className="cp-hand">
              {Array.from({ length: s.hidden }, (_, i) => (
                <CardBack key={`h${i}`} size="s" />
              ))}
              {s.revealed.map((c, i) => (
                <CardFace key={`r${i}`} card={c} size="s" dead />
              ))}
            </span>
            {s.out ? (
              <span className="cp-coins gone">fora</span>
            ) : (
              <span className="cp-coins" title={coinsText(s.coins)}>
                <i className="ti ti-coin" aria-hidden="true" />
                {s.coins}
              </span>
            )}
          </>
        );
        return aim ? (
          <button key={s.id} type="button" className={cls} aria-label={`mirar em ${nameOf(s.id)}, ${coinsText(s.coins)}, ${s.hidden} carta${s.hidden === 1 ? '' : 's'}`} onClick={() => onTarget(s.id)}>
            {body}
          </button>
        ) : (
          <div key={s.id} className={cls}>
            {body}
          </div>
        );
      })}
    </div>
  );
});
