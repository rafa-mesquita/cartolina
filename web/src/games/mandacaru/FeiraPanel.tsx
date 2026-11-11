import type { MandacaruAction, MandacaruView, Resource } from '@cartolina/shared';
import { memo, useState } from 'react';
import { ResIcon } from './art';
import { RES_NAME, RES_ORDER } from './names';
import { Stepper, Window, none } from './widgets';

interface Props {
  game: MandacaruView;
  /** Devolve se mandou (`false` = a trava contra envio duplo segurou). */
  send: (a: MandacaruAction) => boolean;
  onClose: () => void;
}

interface Pick {
  give: Resource | null;
  want: Resource | null;
  count: number;
}

/**
 * Janela da feira (porte do `feiraHtml` do protótipo): "você dá" (com a taxa de `can.feira` e o que tem), "você quer"
 * (o que o banco tem) e "quantas?" (limitado pela mão e pelo banco). Depois de trocar, a janela fica aberta com o mesmo
 * "dá" pra trocar de novo.
 */
export const FeiraPanel = memo(function FeiraPanel({ game: g, send, onClose }: Props) {
  const [pick, setPick] = useState<Pick>({ give: null, want: null, count: 1 });
  const have = g.myRes ?? none();
  const rates = g.can.feira;
  const rate = (r: Resource) => rates[r] ?? 4;
  const canGive = (r: Resource) => rates[r] !== undefined && have[r] >= rate(r);
  // o que já foi escolhido e deixou de valer (a mão ou o banco mudaram) sai
  const give = pick.give !== null && canGive(pick.give) ? pick.give : null;
  const want = pick.want !== null && pick.want !== give && g.bank[pick.want] > 0 ? pick.want : null;
  const max = give && want ? Math.max(1, Math.min(Math.floor(have[give] / rate(give)), g.bank[want])) : 1;
  const count = Math.max(1, Math.min(pick.count, max));
  const ready = give !== null && want !== null;
  return (
    <Window title="feira" onClose={onClose}>
      <div className="mc-sub">Troca com o banco: 4 por 1; 3 por 1 com casa ou vila numa feira comum; 2 por 1 na feira do recurso.</div>
      <h4>você dá</h4>
      <div className="mc-escolha">
        {RES_ORDER.map((r) => (
          <button
            key={r}
            type="button"
            className={`mc-opc${give === r ? ' on' : ''}`}
            aria-label={`dar ${RES_NAME[r]}`}
            aria-pressed={give === r}
            disabled={!canGive(r)}
            onClick={() => setPick((p) => ({ ...p, give: r }))}
          >
            <ResIcon kind={r} size={34} />
            <span>{RES_NAME[r]}</span>
            <small className="mc-taxa">{rate(r)}:1</small>
            <small>tem {have[r]}</small>
          </button>
        ))}
      </div>
      <h4>você quer</h4>
      <div className="mc-escolha">
        {RES_ORDER.map((r) => (
          <button
            key={r}
            type="button"
            className={`mc-opc${want === r ? ' on' : ''}`}
            aria-label={`querer ${RES_NAME[r]}`}
            aria-pressed={want === r}
            disabled={g.bank[r] === 0 || r === give}
            onClick={() => setPick((p) => ({ ...p, want: r }))}
          >
            <ResIcon kind={r} size={34} />
            <span>{RES_NAME[r]}</span>
            <small>banco {g.bank[r]}</small>
          </button>
        ))}
      </div>
      <div className="mc-qtdlinha">
        quantas?{' '}
        <Stepper n={count} label="quantas" minus={ready && count > 1} plus={ready && count < max} onStep={(d) => setPick((p) => ({ ...p, count: Math.max(1, Math.min(p.count, max)) + d }))} />
      </div>
      <div className="mc-rodape">
        <span className="mc-resumo">
          {ready ? (
            <>
              você dá <b>{`${count * rate(give)} ${RES_NAME[give]}`}</b> e recebe <b>{`${count} ${RES_NAME[want]}`}</b>
            </>
          ) : (
            'escolha o que dá e o que quer'
          )}
        </span>
        <button
          type="button"
          className="mc-btn"
          disabled={!ready}
          onClick={() => {
            if (!give || !want) return;
            // segurada pela trava, a escolha fica pra tentar de novo
            if (send({ type: 'feira', give, want, count })) setPick({ give, want: null, count: 1 });
          }}
        >
          trocar na feira
        </button>
      </div>
    </Window>
  );
});
