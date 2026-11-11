import { COSTS, type MandacaruView, type Piece } from '@cartolina/shared';
import { memo, type ReactNode } from 'react';
import { ResIcon } from './art';
import type { BuildMode } from './Board';
import { PIECE_NAME, RES_ORDER } from './names';
import { YOU, joinE, resList, type NameOf } from './texts';

/**
 * Janelas sobre a mesa que a Task 4 do plano M2 traz (troca, feira, Chuva no sertão, Atravessador).
 * O descarte, o cartão de oferta e o fim não precisam de botão: abrem sozinhos pela fase.
 */
export type Panel = 'trade' | 'feira' | 'chuva' | 'atravessador';

/** Ações simples que a coluna manda direto. */
export type SimpleAction = { type: 'roll' } | { type: 'buy_cordel' } | { type: 'end_turn' } | { type: 'steal'; from: string };

/** A dica que flutua no alto do tabuleiro quando há lugar pra clicar (ou `null`). */
export function hintFor(g: MandacaruView, mode: BuildMode | null): string | null {
  const c = g.can;
  if (c.placeHouse.length || (g.phase === 'main' && mode === 'house')) return 'clique num canto que pulsa';
  if (c.placeRoad.length || (g.phase === 'mutirao' && c.buildRoad.length) || (g.phase === 'main' && mode === 'road')) return 'clique num lado que pulsa';
  if (c.carcara.length) return 'clique num terreno pro Carcará';
  if (g.phase === 'main' && mode === 'city') return 'clique numa casa sua';
  return null;
}

const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

interface PromptProps {
  game: MandacaruView;
  me: string | null;
  nameOf: NameOf;
  mode: BuildMode | null;
  onSteal: (from: string) => void;
  /** "ver a troca" (só aparece quando a janela de troca já existe). */
  onTrade?: () => void;
}

/** O aviso da fase (porte do `promptFor` do protótipo): o que fazer agora ou o que a mesa está esperando. */
function Prompt({ game: g, me, nameOf, mode, onSteal, onTrade }: PromptProps): ReactNode {
  const c = g.can;
  const mine = me !== null && g.turn === me;
  const who = g.turn === null ? 'alguém' : nameOf(g.turn);
  switch (g.phase) {
    case 'setup':
      if (c.placeHouse.length)
        return (
          <>
            <b>Sua vez na preparação.</b> Escolha onde pôr a casa: os cantos que pulsam.
          </>
        );
      if (c.placeRoad.length)
        return (
          <>
            <b>Agora a estrada</b>, encostada na casa que você pôs.
          </>
        );
      return `${who} está escolhendo ${g.setup && g.setup.house !== null ? 'a estrada' : 'onde pôr a casa'}…`;
    case 'roll':
      if (!mine) return `${who} vai rolar os dados…`;
      return (
        <>
          <b>Sua vez!</b> Role os dados.
        </>
      );
    case 'discard': {
      const pend = Object.entries(g.discards)
        .filter(([p]) => p !== me)
        .map(([p, n]) => `${nameOf(p)} (${n})`);
      if (c.discard > 0)
        return (
          <>
            <b>Saiu 7!</b> Você tem mais de 7 cartas: precisa descartar <b>{c.discard}</b>.
          </>
        );
      return `Saiu 7: esperando o descarte${pend.length ? ` de ${joinE(pend)}` : ''}…`;
    }
    case 'carcara':
      if (!mine) return `${who} está levando o Carcará…`;
      return (
        <>
          <b>Leve o Carcará</b> pra outro terreno: clique num terreno aceso.
        </>
      );
    case 'steal':
      if (!c.steal.length) return `${who} está escolhendo de quem roubar…`;
      return (
        <>
          <b>De quem o Carcará rouba?</b>
          <div className="mc-alvos">
            {c.steal.map((p) => (
              <button key={p} type="button" className="mc-btn mini" onClick={() => onSteal(p)}>
                {nameOf(p)} · 🂠 {g.seats.find((s) => s.id === p)?.resCount ?? 0}
              </button>
            ))}
          </div>
        </>
      );
    case 'mutirao':
      if (!mine) return `${who} está fazendo um mutirão…`;
      return (
        <>
          <b>Mutirão!</b> Ponha {g.mutiraoLeft} estrada{g.mutiraoLeft > 1 ? 's' : ''} de graça.
        </>
      );
    case 'main': {
      if (!mine) {
        const o = g.offer;
        return (
          <>
            {cap(who === YOU ? 'sua vez' : `vez de ${who}`)}.
            {o && (
              <div className="mc-oferta">
                {who} oferece {resList(o.give)} por {resList(o.want)}
                {o.accepted.length > 0 && ` · aceitaram: ${joinE(o.accepted.map(nameOf))}`}
              </div>
            )}
          </>
        );
      }
      if (mode === 'road')
        return (
          <>
            <b>Estrada:</b> clique num lado que pulsa. (clique no botão de novo pra sair)
          </>
        );
      if (mode === 'house')
        return (
          <>
            <b>Casa:</b> clique num canto que pulsa.
          </>
        );
      if (mode === 'city')
        return (
          <>
            <b>Vila:</b> clique numa casa sua.
          </>
        );
      const st = g.offer
        ? `Sua oferta está na mesa (${g.offer.accepted.length ? `aceitaram: ${joinE(g.offer.accepted.map(nameOf))}` : 'esperando respostas'}).`
        : '';
      const pr = g.proposals.length ? ` ${g.proposals.length === 1 ? 'Chegou 1 proposta' : `Chegaram ${g.proposals.length} propostas`} pra você.` : '';
      return (
        <>
          <b>Sua vez.</b> Construa, troque, compre cordel ou passe a vez.
          {(st || pr) && (
            <div className="mc-oferta">
              {st}
              {pr}
              {onTrade && (
                <>
                  {' '}
                  <button type="button" className="mc-btn mini" onClick={onTrade}>
                    ver a troca
                  </button>
                </>
              )}
            </div>
          )}
        </>
      );
    }
    case 'over':
      return g.winner === null ? 'Fim da partida.' : `Fim da partida: ${nameOf(g.winner) === YOU ? 'você venceu' : `${nameOf(g.winner)} venceu`}!`;
    default:
      return '';
  }
}

/** Os ícones do custo de uma peça ("madeira + barro" vira 2 ícones). */
export function CostIcons({ piece, size = 20 }: { piece: Piece; size?: number }) {
  return (
    <>
      {RES_ORDER.flatMap((r) => Array.from({ length: COSTS[piece][r] }, (_, i) => <ResIcon key={`${r}${i}`} kind={r} size={size} />))}
    </>
  );
}

const PIECES: Piece[] = ['road', 'house', 'city', 'cordel'];

interface Props {
  game: MandacaruView;
  me: string | null;
  nameOf: NameOf;
  mode: BuildMode | null;
  onMode: (m: BuildMode) => void;
  onAction: (a: SimpleAction) => void;
  panel: Panel | null;
  /** Abre/fecha uma janela; os botões das janelas que ainda não existem ficam apagados com "em breve". */
  onPanel: (p: Panel) => void;
  panelReady: (p: Panel) => boolean;
}

/** Coluna da direita (em cima do diário): o aviso da fase, rolar, construir, cordel, trocar, feira, passar a vez e "quanto custa". */
export const Actions = memo(function Actions({ game: g, me, nameOf, mode, onMode, onAction, panel, onPanel, panelReady }: Props) {
  const c = g.can;
  const mine = me !== null && g.turn === me;
  const main = g.phase === 'main';
  const tradeOk = main && (c.offer || c.propose) && panelReady('trade');
  const feiraOk = main && mine && panelReady('feira');
  const soon = (ready: boolean) => (ready ? undefined : 'em breve');
  const modeBtn = (m: BuildMode, list: number[]) => (
    <button
      type="button"
      className={`mc-btn${mode === m ? ' on' : ''}`}
      aria-pressed={mode === m}
      disabled={!main || list.length === 0}
      onClick={() => onMode(m)}
    >
      {PIECE_NAME[m]}
    </button>
  );
  return (
    <>
      <div className="mc-box mc-prompt">
        <Prompt
          game={g}
          me={me}
          nameOf={nameOf}
          mode={mode}
          onSteal={(from) => onAction({ type: 'steal', from })}
          onTrade={panelReady('trade') && panel !== 'trade' ? () => onPanel('trade') : undefined}
        />
      </div>
      <div className="mc-acoes">
        <button type="button" className="mc-btn grande" disabled={!c.roll} onClick={() => onAction({ type: 'roll' })}>
          🎲 rolar os dados
        </button>
        <div className="mc-construir">
          {modeBtn('road', c.buildRoad)}
          {modeBtn('house', c.buildHouse)}
          {modeBtn('city', c.buildCity)}
          <button type="button" className="mc-btn" disabled={!c.buyCordel} onClick={() => onAction({ type: 'buy_cordel' })}>
            cordel
          </button>
        </div>
        <div className="mc-trocas">
          <button
            type="button"
            className={`mc-btn sec${panel === 'trade' ? ' on' : ''}`}
            disabled={!tradeOk}
            title={soon(panelReady('trade'))}
            onClick={() => onPanel('trade')}
          >
            {mine || !main ? '⇄ trocar' : '⇄ propor'}
          </button>
          <button
            type="button"
            className={`mc-btn sec${panel === 'feira' ? ' on' : ''}`}
            disabled={!feiraOk}
            title={soon(panelReady('feira'))}
            onClick={() => onPanel('feira')}
          >
            feira
          </button>
        </div>
        <button type="button" className="mc-btn sec" disabled={!c.endTurn} onClick={() => onAction({ type: 'end_turn' })}>
          passar a vez
        </button>
      </div>
      <div className="mc-box mc-custos">
        <h3>quanto custa</h3>
        {PIECES.map((k) => (
          <div key={k} className="mc-custo">
            <b>{PIECE_NAME[k]}</b>
            <CostIcons piece={k} />
          </div>
        ))}
      </div>
    </>
  );
});
