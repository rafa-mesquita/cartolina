import type { MandacaruAction, MandacaruView, Resource, Resources } from '@cartolina/shared';
import { memo, useState } from 'react';
import { ResIcon } from './art';
import { RES_NAME, RES_ORDER } from './names';
import { resList } from './texts';
import { ResRow, Stepper, Window, none, total } from './widgets';

/** Artigo de cada recurso ("a madeira", "o couro"), pra frase do Atravessador. */
const RES_ART: Record<Resource, string> = { wood: 'a', brick: 'o', leather: 'o', beans: 'o', stone: 'a' };

interface Props {
  kind: 'chuva' | 'atravessador';
  game: MandacaruView;
  send: (a: MandacaruAction) => void;
  onClose: () => void;
}

/**
 * Janela dos cordéis que pedem escolha (porte do `chuvaHtml`/`atravHtml` do protótipo): Chuva no sertão (2 recursos do
 * banco, podem repetir, só o que o banco tem) e Atravessador (1 recurso). Vaqueiro e Mutirão se jogam direto.
 */
export const CordelChoice = memo(function CordelChoice({ kind, game, send, onClose }: Props) {
  return kind === 'chuva' ? <Chuva game={game} send={send} onClose={onClose} /> : <Atravessador send={send} onClose={onClose} />;
});

function Chuva({ game: g, send, onClose }: Omit<Props, 'kind'>) {
  const [pick, setPick] = useState<Resources>(none);
  const n = total(pick);
  const step = (r: Resource, d: 1 | -1) => setPick((p) => ({ ...p, [r]: Math.max(0, p[r] + d) }));
  return (
    <Window title="Chuva no sertão" className="estreita" onClose={onClose}>
      <div className="mc-sub">Pegue 2 recursos quaisquer do banco (podem ser iguais).</div>
      {RES_ORDER.map((r) => (
        <ResRow key={r} r={r} extra={`banco ${g.bank[r]}`}>
          <Stepper n={pick[r]} label={RES_NAME[r]} minus={pick[r] > 0} plus={n < 2 && pick[r] < g.bank[r]} onStep={(d) => step(r, d)} />
        </ResRow>
      ))}
      <div className="mc-rodape">
        <span className="mc-resumo">{n === 2 ? `você pega ${resList(pick)}` : `escolha mais ${2 - n}`}</span>
        <button
          type="button"
          className="mc-btn"
          disabled={n !== 2}
          onClick={() => {
            const rs = RES_ORDER.flatMap((r) => Array.from({ length: pick[r] }, () => r));
            if (rs.length === 2) send({ type: 'play_chuva', resources: [rs[0]!, rs[1]!] });
          }}
        >
          jogar a Chuva
        </button>
      </div>
    </Window>
  );
}

function Atravessador({ send, onClose }: Omit<Props, 'kind' | 'game'>) {
  const [pick, setPick] = useState<Resource | null>(null);
  return (
    <Window title="Atravessador" className="estreita" onClose={onClose}>
      <div className="mc-sub">Escolha um recurso: todo mundo te entrega o que tem dele.</div>
      <div className="mc-escolha">
        {RES_ORDER.map((r) => (
          <button
            key={r}
            type="button"
            className={`mc-opc${pick === r ? ' on' : ''}`}
            aria-label={`pedir ${RES_NAME[r]}`}
            aria-pressed={pick === r}
            onClick={() => setPick(r)}
          >
            <ResIcon kind={r} size={34} />
            <span>{RES_NAME[r]}</span>
          </button>
        ))}
      </div>
      <div className="mc-rodape">
        <span className="mc-resumo">{pick ? `todo mundo te entrega ${RES_ART[pick]} ${RES_NAME[pick]} que tem` : 'escolha um recurso'}</span>
        <button type="button" className="mc-btn" disabled={pick === null} onClick={() => pick && send({ type: 'play_atravessador', resource: pick })}>
          jogar o Atravessador
        </button>
      </div>
    </Window>
  );
}
