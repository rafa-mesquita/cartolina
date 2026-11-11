import type { MandacaruAction, MandacaruView } from '@cartolina/shared';
import { memo } from 'react';
import { resList, type NameOf } from './texts';
import { Chips, Window, covers } from './widgets';

interface Props {
  game: MandacaruView;
  me: string;
  nameOf: NameOf;
  send: (a: MandacaruAction) => void;
  /** "contraproposta": abre a troca com a oferta invertida. */
  onCounter: () => void;
  /** "✕": esconde este cartão (só desta oferta). */
  onHide: () => void;
}

/**
 * Cartão no alto do tabuleiro quando quem está na vez manda oferta pra mesa (porte do `offerCardHtml` do protótipo):
 * "X te dá … e quer …", com "aceito" (apagado sem as cartas), "não" e "contraproposta". Quem já respondeu vê a própria
 * resposta; embaixo, o que os outros responderam.
 */
export const OfferCard = memo(function OfferCard({ game: g, me, nameOf, send, onCounter, onHide }: Props) {
  const o = g.offer;
  if (!o || g.turn === null || !g.myRes) return null;
  const who = nameOf(g.turn);
  const can = covers(g.myRes, o.want);
  const yes = o.accepted.includes(me);
  const no = o.rejected.includes(me);
  const others = g.players.filter((p) => p !== me && p !== g.turn);
  const estado = yes ? `Você aceitou: esperando ${who} fechar…` : no ? 'Você disse não.' : can ? '' : `Você não tem ${resList(o.want)} pra dar.`;
  return (
    <Window title={null} label={`oferta de ${who}`} className="mc-cartao estreita" ribbon={`oferta de ${who}`} onClose={onHide} closeLabel="esconder a oferta" focus={false}>
      <div className="mc-termos">
        <div>
          <small>{who} te dá</small>
          <span>
            <Chips res={o.give} size={34} />
          </span>
        </div>
        <div className="mc-seta">⇄</div>
        <div>
          <small>e quer</small>
          <span>
            <Chips res={o.want} size={34} />
          </span>
        </div>
      </div>
      {estado && <div className="mc-estado">{estado}</div>}
      {others.length > 0 && (
        <div className="mc-estado mc-outros">
          {others.map((p) => (
            <span key={p}>
              {nameOf(p)}{' '}
              {o.accepted.includes(p) ? <span className="mc-st sim">✓</span> : o.rejected.includes(p) ? <span className="mc-st nao">✗</span> : <span className="mc-st">…</span>}
            </span>
          ))}
        </div>
      )}
      <div className="mc-botoes">
        <button type="button" className="mc-btn" disabled={!can || yes || !g.can.respond} onClick={() => send({ type: 'respond', offerId: o.id, accept: true })}>
          aceito
        </button>
        <button type="button" className="mc-btn sec" disabled={no || !g.can.respond} onClick={() => send({ type: 'respond', offerId: o.id, accept: false })}>
          não
        </button>
        <button type="button" className="mc-btn sec" disabled={!g.can.propose} onClick={onCounter}>
          contraproposta
        </button>
      </div>
    </Window>
  );
});
