import type { MandacaruAction, MandacaruView, Resource, Resources } from '@cartolina/shared';
import { memo, useState } from 'react';
import { formatClock } from './clock';
import { RES_NAME, RES_ORDER } from './names';
import { ResRow, Stepper, Window, none, total } from './widgets';

/** Daí pra baixo o relógio do descarte fica vermelho. */
const LOW_DISCARD_MS = 10_000;

/** Sugestão de descarte: tira primeiro dos recursos de que tem mais (a mesma escolha dos bots). */
export function suggestDiscard(have: Resources, count: number): Resources {
  const left = { ...have };
  const out = none();
  for (let i = 0; i < count; i++) {
    const r = RES_ORDER.reduce<Resource>((a, b) => (left[b] > left[a] ? b : a), RES_ORDER[0]!);
    if (left[r] === 0) break;
    left[r]--;
    out[r]++;
  }
  return out;
}

interface Props {
  game: MandacaruView;
  /** Ms que faltam no prazo do descarte (`null` = parado). */
  left: number | null;
  send: (a: MandacaruAction) => void;
}

/**
 * Janela do descarte quando sai 7 e você tem mais de 7 cartas (porte do `discardHtml` do protótipo): +/− por recurso até
 * o número pedido, o relógio do prazo, "sugerir" e "descartar" (só com o número exato). Não fecha: some quando o
 * servidor aceita (ou o prazo sorteia).
 */
export const DiscardPanel = memo(function DiscardPanel({ game: g, left, send }: Props) {
  const need = g.can.discard;
  const have = g.myRes ?? none();
  const [pick, setPick] = useState<Resources>(none);
  const n = total(pick);
  const missing = need - n;
  const step = (r: Resource, d: 1 | -1) => setPick((p) => ({ ...p, [r]: Math.max(0, p[r] + d) }));
  return (
    <Window title={`Saiu 7! Descarte ${need} ${need === 1 ? 'carta' : 'cartas'}`} className="meio estreita mc-descarte">
      <div className="mc-sub">
        Você tem {total(have)} cartas (mais de 7). Sem escolher, o descarte é sorteado em{' '}
        <b className={`mc-prazo${left !== null && left < LOW_DISCARD_MS ? ' pouco' : ''}`}>{left === null ? 'parado' : formatClock(left)}</b>.
      </div>
      {RES_ORDER.map((r) => (
        <ResRow key={r} r={r} extra={`tem ${have[r]}`}>
          <Stepper
            n={pick[r]}
            label={`${RES_NAME[r]} pra descartar`}
            minus={pick[r] > 0}
            plus={n < need && pick[r] < have[r]}
            onStep={(d) => step(r, d)}
          />
        </ResRow>
      ))}
      <div className="mc-rodape">
        <span className={`mc-resumo mc-falta${missing === 0 ? ' ok' : ''}`}>{missing === 0 ? 'pronto!' : `faltam ${missing}`}</span>
        <button type="button" className="mc-btn sec" onClick={() => setPick(suggestDiscard(have, need))}>
          sugerir
        </button>
        <button type="button" className="mc-btn" disabled={missing !== 0} onClick={() => send({ type: 'discard', cards: { ...pick } })}>
          descartar
        </button>
      </div>
    </Window>
  );
});
