import { MANDACARU_BANK_EACH, type MandacaruAction, type MandacaruView, type Resource, type Resources } from '@cartolina/shared';
import { memo, useState } from 'react';
import { RES_NAME, RES_ORDER } from './names';
import { resList, type NameOf } from './texts';
import { Chips, ResRow, Stepper, Window, covers, none, total } from './widgets';

/** Os dois lados de uma troca, do ponto de vista de quem monta: o que você dá e o que você quer. */
export interface TradeTerms {
  give: Resources;
  want: Resources;
}

/** Com o que o painel de troca abre: na sua vez, a oferta que está na mesa; na vez de outro, a sua proposta (se houver). */
export function tradeSeed(g: MandacaruView, me: string | null): TradeTerms | null {
  if (me === null) return null;
  const p = g.turn === me ? g.offer : g.proposals.find((x) => x.from === me);
  return p ? { give: { ...p.give }, want: { ...p.want } } : null;
}

interface Props {
  game: MandacaruView;
  me: string;
  nameOf: NameOf;
  /** Os números com que o painel abre (`null` = zerado). */
  seed: TradeTerms | null;
  send: (a: MandacaruAction) => void;
  onClose: () => void;
}

/**
 * Janela da troca (porte do `tradeHtml` do protótipo). Na sua vez: "troca com a mesa" (+/− dos dois lados, "mandar pra
 * mesa"), as respostas da oferta aberta (✓/✗/pensando, "fechar com X") e as propostas que chegaram ("aceitar"). Na vez
 * de outro: "proposta pra X" (o mesmo +/−, "mandar proposta") e a sua proposta que está valendo.
 */
export const TradePanel = memo(function TradePanel({ game: g, me, nameOf, seed, send, onClose }: Props) {
  const [terms, setTerms] = useState<TradeTerms>(() => seed ?? { give: none(), want: none() });
  const have = g.myRes ?? none();
  const mine = g.turn === me;
  // não dá mais do que tem (a mão pode ter mudado com o painel aberto)
  const capped = (x: Resources): Resources => {
    const out = { ...x };
    for (const r of RES_ORDER) out[r] = Math.min(out[r], have[r]);
    return out;
  };
  const give = capped(terms.give);
  const want = terms.want;
  const valid = total(give) > 0 && total(want) > 0;
  const stepTo = (side: 'give' | 'want', r: Resource, d: 1 | -1) =>
    setTerms((t) => {
      const next = { give: capped(t.give), want: { ...t.want } };
      next[side][r] = Math.max(0, next[side][r] + d);
      return next;
    });
  const rows = (side: 'give' | 'want') =>
    RES_ORDER.map((r) => {
      const n = side === 'give' ? give[r] : want[r];
      const other = side === 'give' ? want[r] : give[r];
      const max = side === 'give' ? have[r] : MANDACARU_BANK_EACH;
      return (
        <ResRow key={r} r={r} extra={side === 'give' ? `tem ${have[r]}` : undefined}>
          <Stepper
            n={n}
            label={`${RES_NAME[r]} que você ${side === 'give' ? 'dá' : 'quer'}`}
            minus={n > 0}
            plus={n < max && other === 0}
            onStep={(d) => stepTo(side, r, d)}
          />
        </ResRow>
      );
    });
  const turnName = g.turn === null ? 'alguém' : nameOf(g.turn);
  const title = mine ? 'troca com a mesa' : `proposta pra ${turnName}`;
  const o = mine ? g.offer : null;
  const myProposal = mine ? undefined : g.proposals.find((x) => x.from === me);
  return (
    <Window title={title} onClose={onClose}>
      <div className="mc-sub">
        {mine
          ? 'Monte o que você dá e o que quer. Os outros respondem; você fecha com quem aceitar.'
          : `É a vez de ${turnName}: ${turnName} aceita ou não a sua proposta.`}
      </div>
      <div className="mc-cols">
        <div className="mc-col">
          <h4>você dá</h4>
          {rows('give')}
        </div>
        <div className="mc-col">
          <h4>você quer</h4>
          {rows('want')}
        </div>
      </div>
      <div className="mc-rodape">
        <span className="mc-resumo">{valid ? `você dá ${resList(give)} e quer ${resList(want)}` : 'escolha pelo menos 1 carta de cada lado'}</span>
        <button
          type="button"
          className="mc-btn"
          disabled={!valid}
          onClick={() => send({ type: mine ? 'offer' : 'propose', give: { ...give }, want: { ...want } })}
        >
          {mine ? (g.offer ? 'trocar a oferta' : 'mandar pra mesa') : 'mandar proposta'}
        </button>
      </div>
      {o && (
        <div className="mc-respostas">
          <div className="mc-rtit">
            na mesa: você dá <Chips res={o.give} size={20} /> e quer <Chips res={o.want} size={20} />
          </div>
          {g.players
            .filter((p) => p !== me)
            .map((p) => (
              <div key={p} className="mc-resp">
                <span className="mc-quem">{nameOf(p)}</span>
                <span className="mc-meio" />
                {o.accepted.includes(p) ? (
                  <>
                    <span className="mc-st sim">✓ aceito</span>
                    <button
                      type="button"
                      className="mc-btn mini"
                      disabled={!covers(have, o.give)}
                      onClick={() => send({ type: 'close_deal', with: p, source: 'offer', id: o.id })}
                    >
                      fechar com {nameOf(p)}
                    </button>
                  </>
                ) : o.rejected.includes(p) ? (
                  <span className="mc-st nao">✗ não</span>
                ) : (
                  <span className="mc-st">pensando…</span>
                )}
              </div>
            ))}
          <div className="mc-rodape mc-rodape-mini">
            <button type="button" className="mc-btn sec mini" onClick={() => send({ type: 'cancel_offer' })}>
              retirar a oferta
            </button>
          </div>
        </div>
      )}
      {mine && g.proposals.length > 0 && (
        <div className="mc-respostas">
          <div className="mc-rtit">propostas pra você</div>
          {g.proposals.map((p) => {
            const ok = covers(have, p.want);
            return (
              <div key={p.id} className="mc-resp">
                <span className="mc-quem">{nameOf(p.from)}</span>
                <span className="mc-meio">
                  te dá <Chips res={p.give} size={20} /> e quer <Chips res={p.want} size={20} />
                </span>
                <button
                  type="button"
                  className="mc-btn mini"
                  disabled={!ok}
                  title={ok ? undefined : 'faltam cartas'}
                  aria-label={`aceitar a proposta de ${nameOf(p.from)}`}
                  onClick={() => send({ type: 'close_deal', with: p.from, source: 'proposal', id: p.id })}
                >
                  aceitar
                </button>
              </div>
            );
          })}
        </div>
      )}
      {myProposal && (
        <div className="mc-respostas">
          <div className="mc-resp">
            <span className="mc-meio">
              sua proposta: você dá <Chips res={myProposal.give} size={20} /> e quer <Chips res={myProposal.want} size={20} />
            </span>
            <span className="mc-st">esperando {turnName}…</span>
          </div>
        </div>
      )}
    </Window>
  );
});

