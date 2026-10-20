import { memo } from 'react';
import { COUP_ACTION_KINDS, COUP_CLAIM, COUP_TARGETED, type CoupActionKind, type CoupView } from '@cartolina/shared';
import { CardFace } from './CardFace';
import { actionLabel } from './texts';

interface Props {
  game: CoupView;
  /** Seu id na partida (`null` = quem assiste). */
  me: string | null;
  /** Ação esperando o alvo (fica marcada). */
  aiming: CoupActionKind | null;
  onAct: (kind: CoupActionKind) => void;
}

/** Sua área: cartas viradas pra baixo (e as perdidas, riscadas), moedas e as 7 ações. Quem assiste vê só um aviso. */
export const MyArea = memo(function MyArea({ game, me, aiming, onAct }: Props) {
  if (me === null) {
    return (
      <div className="cp-me watching">
        <p className="cp-watch">você está assistindo — joga a próxima</p>
      </div>
    );
  }
  const seat = game.seats.find((s) => s.id === me);
  const myTurn = game.phase === 'turn' && game.turn === me;
  const coins = seat?.coins ?? 0;
  return (
    <div className={`cp-me${myTurn ? ' turn' : ''}`}>
      <div className="cp-myhand">
        {game.myCards.map((c, i) => (
          <CardFace key={`c${i}`} card={c} size="l" />
        ))}
        {seat?.revealed.map((c, i) => (
          <CardFace key={`r${i}`} card={c} size="m" dead />
        ))}
      </div>
      <div className="cp-myright">
        <div className="cp-myline">
          você · {coins} moeda{coins === 1 ? '' : 's'}
          {seat?.out && <span className="cp-tag">você está fora</span>}
        </div>
        <div className="cp-acts">
          {COUP_ACTION_KINDS.map((k) => {
            const { name, hint } = actionLabel(k);
            const claim = COUP_CLAIM[k];
            const has = claim !== null && game.myCards.includes(claim);
            return (
              <button
                key={k}
                type="button"
                className={`cp-act${aiming === k ? ' sel' : ''}`}
                disabled={!game.can.act.includes(k)}
                data-kind={k}
                aria-pressed={COUP_TARGETED[k] ? aiming === k : undefined}
                onClick={() => onAct(k)}
              >
                <span className="cp-an">{name}</span>
                <small>{hint}</small>
                {has && <span className="cp-has">você tem</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
});
