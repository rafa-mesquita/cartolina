import { memo, useEffect, useId, useRef } from 'react';
import type { CoupCharacter, CoupView } from '@cartolina/shared';
import { CHARACTER_ICONS, CHARACTER_NAMES } from './names';
import { LOSS_SUB, joinNames, lossTitle, type NameOf } from './texts';

interface Props {
  game: CoupView;
  nameOf: NameOf;
  /** Você é o anfitrião (só ele vê "jogar de novo"). */
  host: boolean;
  /** Perder carta: índice escolhido em `myCards` (-1 = nenhum). */
  loseSel: number;
  /** Troca: índices marcados em `[...myCards, ...myDrawn]`. */
  keepSel: readonly number[];
  onLoseSel: (i: number) => void;
  onLose: (card: CoupCharacter) => void;
  onKeepToggle: (i: number) => void;
  onExchange: (keep: CoupCharacter[]) => void;
  onRestart: () => void;
  /** Celular: o painel é uma folha que sobe de baixo (um diálogo com o título do painel). */
  sheet: boolean;
}

/** Carta clicável dos painéis (ícone + nome; "nova" nas compradas da troca). */
function PickCard({ card, on, fresh = false, onClick }: { card: CoupCharacter; on: boolean; fresh?: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`cp-card cp-pickc${on ? ' on' : ''}`} aria-pressed={on} onClick={onClick}>
      <i className={`ti ${CHARACTER_ICONS[card]}`} aria-hidden="true" />
      <em>{CHARACTER_NAMES[card]}</em>
      {fresh && <span className="cp-new">nova</span>}
    </button>
  );
}

/** Placar grande do fim: todos os jogadores, quem lidera em vermelho. */
function ScoreChips({ game, nameOf }: { game: CoupView; nameOf: NameOf }) {
  const w = (p: string) => game.wins[p] ?? 0;
  const best = Math.max(0, ...game.players.map(w));
  const order = [...game.players].sort((a, b) => w(b) - w(a));
  return (
    <div className="cp-pscore">
      <span>placar da noite</span>
      {order.map((p) => (
        <em key={p} className={best > 0 && w(p) === best ? 'lead' : undefined}>{`${nameOf(p)} ${w(p)}`}</em>
      ))}
    </div>
  );
}

/** Painéis sobre a sua área: perder carta, troca e fim da partida. `null` quando nenhum vale agora. */
export const Panels = memo(function Panels(p: Props) {
  const { game, nameOf } = p;
  const c = game.can;
  const titleId = useId();
  const box = p.sheet ? ({ role: 'dialog', 'aria-labelledby': titleId } as const) : {};
  // qual painel está aberto (a folha nova recebe o foco no título, pro leitor de tela perceber)
  const kind = game.phase === 'over' && game.winner !== null ? 'over' : c.lose && game.loss ? 'lose' : c.keep > 0 ? 'keep' : null;
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (p.sheet && kind !== null) title.current?.focus();
  }, [p.sheet, kind]);
  const head = { id: titleId, ref: title, tabIndex: -1 };
  if (game.phase === 'over' && game.winner !== null) {
    const outs = game.out.filter((id) => id !== game.winner).map(nameOf);
    return (
      <div className="cp-panel" {...box}>
        <div className="cp-info">
          <h3 className="win" {...head}>{nameOf(game.winner)} tomou o poder</h3>
          {game.winnerCards.length > 0 && (
            <p>
              ficou com <em>{joinNames(game.winnerCards.map((x) => CHARACTER_NAMES[x]))}</em>
            </p>
          )}
          {outs.length > 0 && (
            <p>
              saíram: <em>{outs.join(' → ')}</em>
            </p>
          )}
          <ScoreChips game={game} nameOf={nameOf} />
        </div>
        {p.host ? (
          <button type="button" className="cp-pbtn red huge" onClick={p.onRestart}>
            jogar de novo
          </button>
        ) : (
          <p className="cp-hostwait">esperando o anfitrião…</p>
        )}
      </div>
    );
  }
  if (c.lose && game.loss) {
    const chosen = p.loseSel >= 0 ? (game.myCards[p.loseSel] ?? null) : null;
    return (
      <div className="cp-panel" {...box}>
        <div className="cp-info">
          <h3 {...head}>{lossTitle(game.loss.reason)}</h3>
          <p>{LOSS_SUB}</p>
          <button type="button" className="cp-pbtn red" disabled={chosen === null} onClick={() => chosen && p.onLose(chosen)}>
            {chosen ? `revelar ${CHARACTER_NAMES[chosen]}` : 'revelar'}
          </button>
        </div>
        <div className="cp-pick">
          {game.myCards.map((ch, i) => (
            <PickCard key={i} card={ch} on={i === p.loseSel} onClick={() => p.onLoseSel(i)} />
          ))}
        </div>
      </div>
    );
  }
  if (c.keep > 0) {
    const pool = [...game.myCards, ...game.myDrawn];
    const ready = p.keepSel.length === c.keep;
    return (
      <div className="cp-panel" {...box}>
        <div className="cp-info">
          <h3 {...head}>
            Fique com {c.keep} das {pool.length} cartas
          </h3>
          <p>
            escolhidas {p.keepSel.length} de {c.keep}
          </p>
          <button
            type="button"
            className="cp-pbtn red"
            disabled={!ready}
            onClick={() => ready && p.onExchange([...p.keepSel].sort((a, b) => a - b).map((i) => pool[i]!))}
          >
            ficar com essas
          </button>
        </div>
        <div className="cp-pick">
          {pool.map((ch, i) => (
            <PickCard key={i} card={ch} on={p.keepSel.includes(i)} fresh={i >= game.myCards.length} onClick={() => p.onKeepToggle(i)} />
          ))}
        </div>
      </div>
    );
  }
  return null;
});
