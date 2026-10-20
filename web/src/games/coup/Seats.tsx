import { memo } from 'react';
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

/** Os oponentes em linha: nome, bichinho, 2 cartinhas e moedas; da vez em vermelho, fora apagado, desconectado "saiu". */
export const Seats = memo(function Seats({ game, roomSeats, you, nameOf, aiming, onTarget }: Props) {
  const targets = aiming ? game.can.targets : [];
  return (
    <div className="cp-opps">
      {opponents(game, you).map((s) => {
        const room = roomSeats.find((r) => r.id === s.id);
        const turn = game.turn === s.id && game.phase !== 'over';
        const aim = targets.includes(s.id);
        const cls = ['cp-opp', turn ? 'turn' : '', s.out ? 'out' : '', aim ? 'aim' : ''].filter(Boolean).join(' ');
        const body = (
          <>
            <div className="cp-nm">
              {nameOf(s.id)}
              {room && !room.connected && !s.out && <span className="cp-tag">saiu</span>}
            </div>
            {room && <Critter color={room.color} />}
            <div className="cp-hand">
              {Array.from({ length: s.hidden }, (_, i) => (
                <CardBack key={`h${i}`} size="s" />
              ))}
              {s.revealed.map((c, i) => (
                <CardFace key={`r${i}`} card={c} size="s" dead />
              ))}
            </div>
            {s.out ? (
              <div className="cp-coins gone">fora</div>
            ) : (
              <div className="cp-coins" title={`${s.coins} moeda${s.coins === 1 ? '' : 's'}`}>
                <i className="ti ti-coin" aria-hidden="true" />
                {s.coins}
              </div>
            )}
          </>
        );
        return aim ? (
          <button key={s.id} type="button" className={cls} aria-label={`mirar em ${nameOf(s.id)}`} onClick={() => onTarget(s.id)}>
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
