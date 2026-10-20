import { COUP_WINDOW_MS, type CoupActionKind, type CoupCharacter, type CoupView, type CoupWindow } from '@cartolina/shared';
import type { WindowClock } from './clock';
import { MomentView } from './Moment';
import type { Moment } from './moments';
import { CHARACTER_NAMES } from './names';
import { PhraseView } from './Phrase';
import { reactionTip } from './rules';
import { useTip } from './Tip';
import { actionLabel, declaration, joinNames, type Names } from './texts';

/** Reações da janela (sempre com o id da janela vista). */
export type Reaction = { type: 'pass' } | { type: 'challenge' } | { type: 'block'; as: CoupCharacter };

/** "Ana deixou · faltam você e Caio" (quem vê vem primeiro entre os que faltam). */
export function passedLine(w: CoupWindow, names: Names): string {
  const rest = w.eligible.filter((p) => !w.passed.includes(p)).sort((a, b) => Number(names.isYou(b)) - Number(names.isYou(a)));
  const parts = w.passed.map((p) => `${names.nameOf(p)} deixou`);
  if (rest.length > 0) parts.push(`${rest.length > 1 ? 'faltam' : 'falta'} ${joinNames(rest.map(names.nameOf))}`);
  return parts.join(' · ');
}

/** Botão da janela (duvidar, bloquear como X, deixa), com a dica rápida do que ele faz. */
function ReactButton({ reaction, onReact }: { reaction: Reaction; onReact: (r: Reaction) => void }) {
  const r = reaction;
  const { props, tip } = useTip(r.type === 'block' ? reactionTip('block', r.as) : reactionTip(r.type));
  return (
    <>
      <button type="button" className={`cp-react${r.type === 'pass' ? '' : ' red'}`} onClick={() => onReact(r)} {...props}>
        {r.type === 'challenge' ? 'duvidar' : r.type === 'block' ? `bloquear como ${CHARACTER_NAMES[r.as]}` : 'deixa'}
      </button>
      {tip}
    </>
  );
}

interface Props {
  game: CoupView;
  names: Names;
  clock: WindowClock;
  /** Ação esperando o alvo (modo "escolher alvo"). */
  aiming: CoupActionKind | null;
  onCancelAim: () => void;
  onReact: (r: Reaction) => void;
  moment: Moment | null;
}

/** O palco (feltro): tesouro e baralho nos cantos; a vez, a janela de reação (declaração, barra, botões) ou quem está escolhendo. */
export function Stage({ game, names, clock, aiming, onCancelAim, onReact, moment }: Props) {
  // com a janela aberta pra você, o momento vira faixa no alto (a janela continua clicável)
  const band = game.phase === 'reaction' && game.can.pass;
  return (
    <div className={`cp-felt${moment && band ? ' has-band' : ''}`}>
      <div className="cp-corner treasury">
        <i className="ti ti-coin" aria-hidden="true" />
        tesouro <em>{game.treasury}</em>
      </div>
      <div className="cp-corner deck">
        baralho <em>{game.deckSize}</em>
        <i className="ti ti-cards" aria-hidden="true" />
      </div>
      <StageMain game={game} names={names} clock={clock} aiming={aiming} onCancelAim={onCancelAim} onReact={onReact} />
      {/* a região de aviso fica sempre na tela; só o conteúdo troca (como o toast) */}
      <div className="cp-moment-slot" role="status" aria-live="polite">
        {moment && <MomentView moment={moment} band={band} nameOf={names.nameOf} />}
      </div>
    </div>
  );
}

function StageMain({ game, names, clock, aiming, onCancelAim, onReact }: Omit<Props, 'moment'>) {
  const { nameOf, isYou } = names;
  switch (game.phase) {
    case 'turn': {
      if (game.turn === null) return null;
      if (isYou(game.turn)) {
        if (aiming) {
          return (
            <>
              <div className="cp-big me">{actionLabel(aiming).name}</div>
              <div className="cp-sub">
                escolha o alvo lá em cima ·{' '}
                <button type="button" onClick={onCancelAim}>
                  cancelar
                </button>
              </div>
            </>
          );
        }
        return (
          <>
            <div className="cp-big me">sua vez</div>
            <div className="cp-sub">escolha uma ação embaixo</div>
          </>
        );
      }
      const who = nameOf(game.turn);
      return (
        <>
          <div className="cp-big">vez de {who}</div>
          <div className="cp-sub">{who} está escolhendo a ação…</div>
        </>
      );
    }
    case 'reaction': {
      const w = game.window;
      if (!w) return null;
      const decl = declaration(game, names);
      const msLeft = clock?.msLeft ?? 0;
      const expired = clock === null || clock.expired;
      const c = game.can;
      return (
        <>
          {decl && (
            <div className="cp-decl">
              <PhraseView phrase={decl.main} />
              {decl.sub && (
                <small>
                  <PhraseView phrase={decl.sub} />
                </small>
              )}
            </div>
          )}
          <div className="cp-clock">
            <div className="cp-bar">
              <i style={{ width: `${((100 * msLeft) / COUP_WINDOW_MS).toFixed(2)}%` }} />
            </div>
            <div className="cp-secs">{Math.ceil(msLeft / 1000)}</div>
          </div>
          {expired ? (
            <div className="cp-wait">tempo esgotado…</div>
          ) : c.pass ? (
            <div className="cp-reacts">
              {c.challenge && <ReactButton reaction={{ type: 'challenge' }} onReact={onReact} />}
              {c.block.map((ch) => (
                <ReactButton key={ch} reaction={{ type: 'block', as: ch }} onReact={onReact} />
              ))}
              <ReactButton reaction={{ type: 'pass' }} onReact={onReact} />
            </div>
          ) : (
            <div className="cp-wait">esperando os outros…</div>
          )}
          <div className="cp-passed">{passedLine(w, names)}</div>
        </>
      );
    }
    case 'losing':
      if (!game.loss) return null;
      if (isYou(game.loss.player)) {
        return (
          <>
            <div className="cp-big me">você perde uma carta</div>
            <div className="cp-sub">escolha embaixo qual vai revelar</div>
          </>
        );
      }
      return <div className="cp-big mid">{nameOf(game.loss.player)} está escolhendo a carta que perde…</div>;
    case 'exchange':
      if (game.turn === null) return null;
      if (isYou(game.turn)) {
        return (
          <>
            <div className="cp-big me">troca de cartas</div>
            <div className="cp-sub">escolha embaixo com quais cartas você fica</div>
          </>
        );
      }
      return <div className="cp-big mid">{nameOf(game.turn)} está trocando cartas…</div>;
    case 'over':
      return (
        <>
          <div className="cp-big">fim da partida</div>
          <div className="cp-sub">{game.winner ? `${nameOf(game.winner)} tomou o poder` : ''}</div>
        </>
      );
    default:
      return null;
  }
}
