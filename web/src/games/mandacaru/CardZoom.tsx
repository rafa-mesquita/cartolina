import { COSTS, TERRAIN_RESOURCE, type CordelKind, type MandacaruView, type Resource, type Terrain } from '@cartolina/shared';
import { useEffect, useRef, type MouseEvent } from 'react';
import { CordelIcon, ResIcon } from './art';
import { PIECES } from './Costs';
import type { PlayableCordel } from './Hand';
import { CORDEL_DESC, CORDEL_NAME, PIECE_NAME, POINT_NAMES, RES_NAME, TERRAIN_NAME } from './names';
import { joinE } from './texts';

/** A carta da mão aberta grande: um recurso ou um tipo de cordel. */
export type ZoomCard = { type: 'res'; res: Resource } | { type: 'cordel'; kind: CordelKind };

/** De quais terrenos vem cada recurso ("caatinga"). */
export function resSources(r: Resource): string[] {
  return (Object.keys(TERRAIN_RESOURCE) as Terrain[]).filter((t) => TERRAIN_RESOURCE[t] === r).map((t) => TERRAIN_NAME[t]);
}

/** Em que peças cada recurso entra ("estrada, casa e cordel"), na ordem do "quanto custa". */
export function resUses(r: Resource): string[] {
  return PIECES.filter((p) => COSTS[p][r] > 0).map((p) => PIECE_NAME[p]);
}

interface Props {
  card: ZoomCard;
  game: MandacaruView;
  /** O mesmo "jogar" da mão (Chuva e Atravessador abrem a janela de escolha). */
  onPlay: (kind: PlayableCordel) => void;
  onClose: () => void;
}

/**
 * A carta da mão aberta grande no meio da mesa (estilo D: moldura creme, contorno marrom, sombra chapada), pra deixar
 * claro o que é cada uma. Recurso: arte, nome, quantas você tem, de qual terreno vem e em que entra. Cordel: arte, nome,
 * quantas, se é novo e o que faz (com "jogar" quando dá). Fecha clicando fora ou no ✕ (o Esc, a mesa cuida).
 */
export function CardZoom({ card, game: g, onPlay, onClose }: Props) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus({ preventScroll: true });
  }, []);
  const stop = (e: MouseEvent) => e.stopPropagation();
  let body;
  if (card.type === 'res') {
    const r = card.res;
    const n = g.myRes?.[r] ?? 0;
    const from = resSources(r);
    body = (
      <>
        <div className="mc-zoom-arte res">
          <ResIcon kind={r} size={150} />
        </div>
        <h3>{RES_NAME[r]}</h3>
        <p className="mc-zoom-qtd">{n === 1 ? 'você tem 1' : `você tem ${n}`}</p>
        <p>
          <b>vem de:</b> {joinE(from)}
        </p>
        <p>
          <b>entra em:</b> {joinE(resUses(r))}
        </p>
      </>
    );
  } else {
    const kind = card.kind;
    const mine = g.myCordeis.filter((c) => c.kind === kind);
    const fresh = mine.filter((c) => c.fresh).length;
    const playable = kind === 'point' ? null : kind;
    const can = playable !== null && g.can.play.includes(playable);
    const points = kind === 'point' ? POINT_NAMES.slice(0, Math.max(1, mine.length)) : [];
    const title = kind === 'point' ? (points.length === 1 ? `Ponto · ${points[0]}` : 'Pontos') : CORDEL_NAME[kind];
    body = (
      <>
        {kind === 'point' ? (
          <div className={`mc-zoom-pontos${points.length > 1 ? ' varios' : ''}`}>
            {points.map((name, i) => (
              <figure key={name} className="mc-zoom-arte cordel">
                <span className="mc-xilo">
                  <CordelIcon kind="point" point={i} size={points.length > 1 ? 120 : 220} />
                </span>
                {points.length > 1 && <figcaption>{name}</figcaption>}
              </figure>
            ))}
          </div>
        ) : (
          <div className="mc-zoom-arte cordel">
            <span className="mc-xilo">
              <CordelIcon kind={kind} size={220} />
            </span>
          </div>
        )}
        <h3>{title}</h3>
        <p className="mc-zoom-qtd">
          {mine.length === 1 ? 'você tem 1' : `você tem ${mine.length}`}
          {fresh > 0 && <span className="mc-novo">{fresh === mine.length ? 'novo' : `${fresh} novo${fresh > 1 ? 's' : ''}`}</span>}
        </p>
        <p>{CORDEL_DESC[kind]}.</p>
        {fresh > 0 && kind !== 'point' && <p className="mc-zoom-nota">comprado neste turno: só dá pra jogar a partir do próximo</p>}
        {can && playable && (
          <div className="mc-rodape">
            <button type="button" className="mc-btn" aria-label={`jogar ${CORDEL_NAME[playable]} (carta aberta)`} onClick={() => onPlay(playable)}>
              jogar
            </button>
          </div>
        )}
      </>
    );
  }
  const label = card.type === 'res' ? RES_NAME[card.res] : CORDEL_NAME[card.kind];
  return (
    <div className="mc-zoom-fundo" onClick={onClose}>
      <div className={`mc-zoom ${card.type}`} role="dialog" aria-label={`carta: ${label}`} onClick={stop}>
        <button ref={close} type="button" className="mc-x" aria-label="fechar a carta" title="fechar" onClick={onClose}>
          ✕
        </button>
        {body}
      </div>
    </div>
  );
}
