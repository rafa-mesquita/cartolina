import { COORDS, type Coord, type PicturesRoundResult } from '@cartolina/shared';
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Critter } from '../../screens/Critter';
import { KitShow } from './KitShow';
import { Photo } from './Photo';
import { workPoints, type RevealFrame } from './reveal';
import { KIT_NAMES, listNames, tapeRotOf, tiltOf } from './status';

interface Props {
  result: PicturesRoundResult;
  frame: RevealFrame;
  /** Quem jogou a rodada (palpiteiros). */
  inRound: readonly string[];
  /** Todos da partida (o giro de cada um vem do assento). */
  players: readonly string[];
  grid: readonly string[];
  me: string | null;
  name: (id: string) => string;
  color: (id: string) => string;
  onSkip: () => void;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Duração do voo da foto (cabe no passo de 1,2 s da foto). */
const FLY_MS = 820;

/** A frase da narração em cada passo. */
function caption(r: PicturesRoundResult, f: RevealFrame, guessers: number, me: string | null, name: (id: string) => string): ReactNode {
  const a = r.order[f.artistIndex];
  if (a === undefined) return '';
  const right = r.correct[a] ?? [];
  switch (f.step) {
    case 'grow':
      return (
        <>
          {a === me ? (
            <>
              a <b>sua</b> obra
            </>
          ) : (
            <>
              a obra de <b>{name(a)}</b>
            </>
          )}{' '}
          · {KIT_NAMES[r.kits[a]!]}
        </>
      );
    case 'tapes':
      return f.tapes.length === guessers && f.tapes.every((t) => !t.coord) ? 'ninguém palpitou nesta obra' : 'os palpites…';
    case 'photo':
      return (
        <>
          a foto era a <b>{r.secrets[a]}</b>!
        </>
      );
    case 'mark':
      return right.length ? (
        <>
          <b>{listNames(right, name)}</b> {right.length === 1 ? 'acertou' : 'acertaram'}
        </>
      ) : (
        'ninguém acertou'
      );
    case 'points': {
      const pts = workPoints(r, a);
      if (!pts.length) return 'ninguém pontua com esta obra';
      return pts.map(({ player, n }, i) => (
        <span key={player}>
          {i > 0 && ' · '}
          <b>+{n}</b> pra {name(player)}
        </span>
      ));
    }
    default:
      return '';
  }
}

/** A foto voando da miniatura na grade até o lado da obra: cresce, gira um pouco e pousa (papel). */
function FlyingPhoto({ id, from, to, onLanded }: { id: string; from: Box; to: Box; onLanded: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const landed = useRef(onLanded);
  landed.current = onLanded;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== 'function') {
      landed.current();
      return undefined;
    }
    const anim = el.animate(
      [
        { left: `${from.x}px`, top: `${from.y}px`, width: `${from.w}px`, height: `${from.h}px`, padding: '6px', transform: 'rotate(0deg) scale(1)', boxShadow: '0 1px 2px rgba(59,47,47,.25)' },
        { offset: 0.35, transform: 'rotate(-5deg) scale(1.14)', boxShadow: '0 22px 34px rgba(43,34,30,.32)' },
        { left: `${to.x}px`, top: `${to.y}px`, width: `${to.w}px`, height: `${to.h}px`, padding: '7px 7px 38px', transform: 'rotate(3deg) scale(1)', boxShadow: '0 2px 8px rgba(59,47,47,.25)' },
      ],
      { duration: FLY_MS, easing: 'cubic-bezier(.45,.05,.25,1)', fill: 'forwards' },
    );
    anim.finished.then(
      () => landed.current(),
      () => {},
    );
    return () => anim.cancel();
  }, [from, to]);
  const style = { left: from.x, top: from.y, width: from.w, height: from.h } as CSSProperties;
  return (
    <div className="pc-fly" ref={ref} style={style}>
      <div className="pc-rv-pic">
        <Photo id={id} />
      </div>
    </div>
  );
}

/**
 * Revelação narrada (coluna da direita): uma obra por vez cresce, ganha as fitinhas de palpite, a foto verdadeira
 * voa da grade até o lado dela, as fitinhas certas ganham ✓ e os pontos sobem (nos selinhos do topo). "pular ›" vai pro placar.
 */
export function RevealStage({ result: r, frame: f, inRound, players, grid, me, name, color, onSkip }: Props) {
  const k = f.artistIndex, artist = r.order[k];
  const coord: Coord | undefined = artist !== undefined ? r.secrets[artist] : undefined;
  const guessers = artist !== undefined ? inRound.filter((p) => p !== artist).length : 0;
  const rootRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const polRef = useRef<HTMLDivElement>(null);
  /** Obra cuja foto já pousou no lugar. */
  const [landed, setLanded] = useState(-1);
  const [fly, setFly] = useState<{ k: number; from: Box; to: Box } | null>(null);

  // A foto saiu da grade: mede a miniatura e o lugar ao lado da obra (em px do palco, que é escalado) e solta o voo.
  useLayoutEffect(() => {
    if (!f.photoShown || coord === undefined || landed === k || fly?.k === k) return;
    const root = rootRef.current, slot = slotRef.current, pol = polRef.current;
    const src = root?.closest('.pc-stage')?.querySelector(`.pc-grid .pc-photo[data-coord="${coord}"]`);
    if (!root || !slot || !pol || !src) {
      setLanded(k);
      return;
    }
    const rr = root.getBoundingClientRect();
    const sc = rr.width / root.offsetWidth || 1;
    const box = (r: DOMRect): Box => ({ x: (r.left - rr.left) / sc, y: (r.top - rr.top) / sc, w: r.width / sc, h: r.height / sc });
    const s = box(slot.getBoundingClientRect());
    // o destino é o polaroide "de pé" (o lugar não gira; o polaroide sim)
    const to = { x: s.x, y: s.y + (s.h - pol.offsetHeight) / 2, w: pol.offsetWidth, h: pol.offsetHeight };
    setFly({ k, from: box(src.getBoundingClientRect()), to });
  }, [f.photoShown, k, coord, landed, fly]);

  const on = landed === k;
  const n = r.order.length;
  const right = artist !== undefined ? (r.correct[artist] ?? []) : [];
  const text = n === 0 ? 'revelação' : caption(r, f, guessers, me, name);
  // a frase troca com um fade (a chave muda junto com ela)
  const capKey = `${k}:${f.step ?? ''}:${typeof text === 'string' ? text : ''}`;
  const photoId = coord !== undefined ? grid[COORDS.indexOf(coord)] : undefined;
  return (
    <div className="pc-reveal" ref={rootRef}>
      <div className="pc-rv-head">
        <span className="pc-rv-n">{artist !== undefined ? `obra ${k + 1} de ${n}` : ''}</span>
        <span className="pc-rv-t" key={capKey}>
          {text}
        </span>
        <button className="pc-rv-skip" type="button" title="vai direto pro placar da rodada" onClick={onSkip}>
          pular ›
        </button>
      </div>
      <div className={`pc-rv-stage${f.leaving ? ' out' : ''}`}>
        {n === 0 ? (
          <p className="pc-rv-empty">
            <i className="ti ti-photo-off" />
            Ninguém montou nada nesta rodada, então não tem obra pra revelar.
          </p>
        ) : (
          artist !== undefined && (
            <>
              <div className="pc-rv-pair" key={k}>
                <div className="pc-rv-work in">
                  <KitShow work={r.works[artist]!} className="pc-wsheet" />
                  <div className="cap">
                    <span className="cr">
                      <Critter color={color(artist)} />
                    </span>
                    <span>
                      <span className="nm">{name(artist)}</span>
                      <span className="kt">{KIT_NAMES[r.kits[artist]!]}</span>
                    </span>
                  </div>
                </div>
                <div className={`pc-rv-slot${on ? ' on' : ''}`} ref={slotRef}>
                  <div className="pc-rv-polaroid" ref={polRef}>
                    <div className="pc-rv-pic">{photoId && f.photoShown && <Photo id={photoId} />}</div>
                    <span className="pc-rv-co">
                      <small>era a</small>
                      {coord}
                    </span>
                  </div>
                </div>
              </div>
              <div className="pc-rv-guesses" key={`g${k}`}>
                {f.tapes.map(({ guesser, coord: c }) => {
                  const ok = right.includes(guesser);
                  const cls = f.marked ? (ok ? ' ok' : ' no') : ' in';
                  return (
                    <div key={guesser} className={`pc-rv-g${cls}`} data-g={guesser} style={{ '--tilt': `${tiltOf(players, guesser) * 2}deg` } as CSSProperties}>
                      <span className={`pc-rv-tape${c ? '' : ' none'}`} style={{ '--rot': `${tapeRotOf(players, guesser)}deg` } as CSSProperties}>
                        {c ?? 'sem palpite'}
                      </span>
                      <span className="cr">
                        <Critter color={color(guesser)} />
                      </span>
                      <span className="nm">{name(guesser)}</span>
                      {f.marked && ok && (
                        <span className="tick" aria-label="acertou">
                          ✓
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )
        )}
      </div>
      {fly && fly.k === k && !on && photoId && <FlyingPhoto id={photoId} from={fly.from} to={fly.to} onLanded={() => setLanded(k)} />}
    </div>
  );
}
