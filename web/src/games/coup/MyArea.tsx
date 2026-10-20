import { memo } from 'react';
import { COUP_ACTION_KINDS, COUP_CLAIM, COUP_TARGETED, type CoupActionKind, type CoupCharacter, type CoupView } from '@cartolina/shared';
import { CardFace } from './CardFace';
import { actionTip, characterTip } from './rules';
import { actionLabel } from './texts';
import { useTip } from './Tip';

interface Props {
  game: CoupView;
  /** Seu id na partida (`null` = quem assiste). */
  me: string | null;
  /** Ação esperando o alvo (fica marcada). */
  aiming: CoupActionKind | null;
  onAct: (kind: CoupActionKind) => void;
}

/** Uma carta sua, virada pra baixo, com a dica do personagem (o que faz na sua vez e o que bloqueia). */
function MyCard({ card }: { card: CoupCharacter }) {
  const { props, tip } = useTip(characterTip(card));
  return (
    <>
      <CardFace card={card} size="l" tip={props} />
      {tip}
    </>
  );
}

interface ActProps {
  kind: CoupActionKind;
  enabled: boolean;
  /** Esperando o alvo (marcada). */
  sel: boolean;
  /** Você tem o personagem que a ação diz ser. */
  has: boolean;
  onAct: (kind: CoupActionKind) => void;
}

/** Botão de uma ação, com a dica rápida (quem diz ser, o que faz, quem bloqueia). */
function ActButton({ kind, enabled, sel, has, onAct }: ActProps) {
  const { name, hint } = actionLabel(kind);
  const { props, tip } = useTip(actionTip(kind));
  return (
    <>
      <button
        type="button"
        className={`cp-act${sel ? ' sel' : ''}`}
        disabled={!enabled}
        data-kind={kind}
        aria-pressed={COUP_TARGETED[kind] ? sel : undefined}
        onClick={() => onAct(kind)}
        {...props}
      >
        <span className="cp-an">{name}</span>
        <small>{hint}</small>
        {has && <span className="cp-has">você tem</span>}
      </button>
      {tip}
    </>
  );
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
          <MyCard key={`c${i}`} card={c} />
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
            const claim = COUP_CLAIM[k];
            return (
              <ActButton
                key={k}
                kind={k}
                enabled={game.can.act.includes(k)}
                sel={aiming === k}
                has={claim !== null && game.myCards.includes(claim)}
                onAct={onAct}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
});
