import { CORDEIS, type CordelKind, type MandacaruView } from '@cartolina/shared';
import { memo } from 'react';
import { CordelIcon, ResIcon } from './art';
import { CORDEL_DESC, CORDEL_NAME, POINT_NAMES, RES_NAME, RES_ORDER } from './names';

export type PlayableCordel = Exclude<CordelKind, 'point'>;

interface Props {
  game: MandacaruView;
  /** "jogar" num cordel; `ready(kind)` diz se o cordel já tem como ser jogado aqui (os de janela chegam na Task 4). */
  onPlay: (kind: PlayableCordel) => void;
  ready: (kind: PlayableCordel) => boolean;
}

/**
 * Embaixo: sua mão. Os 5 recursos em cartas com a quantidade (zerados apagados) e os cordéis agrupados por tipo
 * ("×N"), com selo "novo" nos comprados agora e "jogar" nos que `can.play` deixa. Quem assiste vê o aviso.
 */
export const Hand = memo(function Hand({ game: g, onPlay, ready }: Props) {
  if (!g.myRes) {
    return (
      <section className="mc-hand">
        <p className="mc-watch">você está assistindo esta partida</p>
      </section>
    );
  }
  const res = g.myRes;
  const groups = CORDEIS.map((kind) => ({
    kind,
    n: g.myCordeis.filter((c) => c.kind === kind).length,
    fresh: g.myCordeis.filter((c) => c.kind === kind && c.fresh).length,
  })).filter((x) => x.n > 0);
  return (
    <section className="mc-hand" aria-label="sua mão">
      <div className="mc-grupo">
        {RES_ORDER.map((r) => (
          <div key={r} className={`mc-carta${res[r] ? '' : ' zero'}`} title={RES_NAME[r]} data-res={r}>
            <ResIcon kind={r} size={50} />
            <span className="mc-carta-nome">{RES_NAME[r]}</span>
            <span className="mc-qtd">{res[r]}</span>
          </div>
        ))}
      </div>
      <div className="mc-grupo">
        {groups.length === 0 ? (
          <span className="mc-vazio">sem cordéis</span>
        ) : (
          groups.map((x) => {
            const names = POINT_NAMES.slice(0, x.n);
            const title = x.kind === 'point' ? (x.n === 1 ? `Ponto · ${names[0]}` : 'Pontos') : CORDEL_NAME[x.kind];
            const desc = x.kind === 'point' ? `${names.join(', ')}: ${CORDEL_DESC.point}` : `${CORDEL_NAME[x.kind]}: ${CORDEL_DESC[x.kind]}`;
            const kind = x.kind === 'point' ? null : x.kind;
            const can = kind !== null && g.can.play.includes(kind);
            const ok = kind !== null && ready(kind);
            return (
              <div key={x.kind} className={`mc-cordel${can ? ' pode' : ''}`} title={desc} data-cordel={x.kind}>
                <span className="mc-cap">CORDEL</span>
                <span className="mc-xilo">
                  <CordelIcon kind={x.kind} size={44} />
                </span>
                <span className="mc-tit">{title}</span>
                {x.n > 1 && <span className="mc-cqtd">×{x.n}</span>}
                {x.fresh > 0 && <span className="mc-novo">{x.fresh === x.n ? 'novo' : `${x.fresh} novo${x.fresh > 1 ? 's' : ''}`}</span>}
                {can && kind && (
                  <button
                    type="button"
                    className="mc-btn mini mc-jogar"
                    disabled={!ok}
                    title={ok ? undefined : 'em breve'}
                    aria-label={`jogar ${CORDEL_NAME[kind]}`}
                    onClick={() => onPlay(kind)}
                  >
                    jogar
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
});
