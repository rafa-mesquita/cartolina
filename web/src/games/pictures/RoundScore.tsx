import { COORDS, isBlankWork, type Coord, type PicturesRoundResult, type Work } from '@cartolina/shared';
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { Critter } from '../../screens/Critter';
import { KitShow } from './KitShow';
import { Photo } from './Photo';
import { KIT_NAMES, listNames, ptsWord, tapeRotOf, tiltOf } from './status';
import { useWheelClose, useWheelOpen } from './useWheelZoom';

interface Props {
  result: PicturesRoundResult;
  players: readonly string[];
  /** Quem jogou a rodada (palpiteiros de cada obra, menos o artista). */
  inRound: readonly string[];
  scores: Readonly<Record<string, number>>;
  round: number;
  rounds: number;
  me: string | null;
  name: (id: string) => string;
  color: (id: string) => string;
  host: boolean;
  /** O host já mandou a ação: botão travado até chegar uma visão nova. */
  busy: boolean;
  onNext: () => void;
  /** Amplia uma foto (o zoom da mesa, com a grade desta rodada). */
  onZoomPhoto: (coord: Coord) => void;
}

/** Uma obra revista no placar: o artista, a obra, a foto verdadeira (da grade DAQUELA rodada) e os palpites. */
interface Review {
  artist: string;
  work: Work;
  coord: Coord;
  photoId: string | undefined;
  /** Os palpiteiros desta obra, com o palpite (ou null) e se acertou. */
  guesses: { guesser: string; coord: Coord | null; ok: boolean }[];
  right: string[];
}

function reviewsOf(r: PicturesRoundResult, inRound: readonly string[]): Review[] {
  const out: Review[] = [];
  for (const artist of r.order) {
    const work = Object.hasOwn(r.works, artist) ? r.works[artist]! : null;
    const coord = Object.hasOwn(r.secrets, artist) ? r.secrets[artist]! : null;
    if (!work || !coord || isBlankWork(work)) continue; // obra em branco não aparece
    const right = r.correct[artist] ?? [];
    const guesses = inRound
      .filter((p) => p !== artist)
      .map((guesser) => {
        const own = Object.hasOwn(r.guesses, guesser) ? r.guesses[guesser]! : {};
        return { guesser, coord: Object.hasOwn(own, artist) ? own[artist]! : null, ok: right.includes(guesser) };
      });
    out.push({ artist, work, coord, photoId: r.grid[COORDS.indexOf(coord)], guesses, right });
  }
  return out;
}

/** "P1 e P2 acertaram" / "ninguém acertou". */
const hitsText = (right: readonly string[], name: (id: string) => string): string =>
  right.length ? `${listNames(right, name)} ${right.length === 1 ? 'acertou' : 'acertaram'}` : 'ninguém acertou';

/**
 * A obra grande ao lado da foto verdadeira grande, pra comparar. ← → passam pelas obras; Esc, rodinha pra baixo,
 * clique fora e ✕ fecham. Ao abrir, o foco vai pro ✕; ao fechar, volta pra quem abriu.
 */
function ReviewZoom({
  rv,
  index,
  count,
  name,
  color,
  onIndex,
  onClose,
}: {
  rv: Review;
  index: number;
  count: number;
  name: (id: string) => string;
  color: (id: string) => string;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useWheelClose(dialogRef, onClose);
  useEffect(() => {
    const opener = document.activeElement;
    closeRef.current?.focus();
    return () => {
      if (opener instanceof HTMLElement && opener !== document.body && opener.isConnected) opener.focus();
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && count > 1) onIndex((index + count - 1) % count);
      else if (e.key === 'ArrowRight' && count > 1) onIndex((index + 1) % count);
      else return;
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [index, count, onIndex, onClose]);
  const step = (d: number) => onIndex((index + d + count) % count);
  return (
    <div
      ref={dialogRef}
      className="pc-zoom pc-rs-zoom"
      role="dialog"
      aria-modal="true"
      aria-label={`obra de ${name(rv.artist)}`}
      onClick={(e) => {
        if (!(e.target as Element).closest('.pc-zoom-frame, .pc-rs-zcap, button')) onClose();
      }}
    >
      {count > 1 && (
        <button className="pc-zoom-nav l" type="button" title="obra anterior (←)" aria-label="obra anterior" onClick={() => step(-1)}>
          <i className="ti ti-chevron-left" />
        </button>
      )}
      <div className="pc-rs-zpair">
        <div className="pc-zoom-frame work">
          <KitShow work={rv.work} className="pic" />
          <span className="who">
            <span className="cr">
              <Critter color={color(rv.artist)} />
            </span>
            <span>
              <span className="nm">{name(rv.artist)}</span>
              <span className="kt">{KIT_NAMES[rv.work.kit]}</span>
            </span>
          </span>
        </div>
        <div className="pc-zoom-frame photo">
          <div className="pic">{rv.photoId && <Photo id={rv.photoId} size="full" />}</div>
          <span className="co">
            <small>era a</small>
            {rv.coord}
          </span>
        </div>
      </div>
      <p className="pc-rs-zcap">
        <b>{hitsText(rv.right, name)}</b>
        <span>{count > 1 ? '← → passam pelas obras · ' : ''}rodinha pra baixo ou Esc fecha</span>
      </p>
      {count > 1 && (
        <button className="pc-zoom-nav r" type="button" title="próxima obra (→)" aria-label="próxima obra" onClick={() => step(1)}>
          <i className="ti ti-chevron-right" />
        </button>
      )}
      <button ref={closeRef} className="pc-zoom-x" type="button" title="fechar (Esc)" aria-label="fechar" onClick={onClose}>
        ✕
      </button>
    </div>
  );
}

/**
 * Placar da rodada: o cartão do placar numa coluna estreita (pelo total; só o host passa pra próxima ou pro fim) e,
 * ao lado, a revisão de todas as obras numa grade rolável — cada uma uma página de álbum com a obra, a foto verdadeira,
 * o artista, o kit, os palpites (✓ pra quem acertou) e o que o artista ganhou. Obra e foto ampliam com clique, lupinha
 * ou rodinha pra cima.
 */
export function RoundScore({ result: r, players, inRound, scores, round, rounds, me, name, color, host, busy, onNext, onZoomPhoto }: Props) {
  const titleId = useId();
  const worksId = useId();
  const rows = [...players].sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0) || (r.gained[b] ?? 0) - (r.gained[a] ?? 0));
  const hits = r.order.reduce((s, a) => s + (r.correct[a]?.length ?? 0), 0);
  const last = round + 1 >= rounds;
  const reviews = reviewsOf(r, inRound);
  const [zoom, setZoom] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const open = (artist: string) => {
    // um zoom de cada vez: com a foto ampliada aberta, a lupinha de uma obra (pelo Tab) não abre outro por cima
    if (listRef.current?.closest('.pictures')?.querySelector('.pc-zoom')) return;
    const i = reviews.findIndex((rv) => rv.artist === artist);
    if (i >= 0) setZoom(i);
  };
  // Rodinha pra cima numa obra abre a obra grande (as fotos ficam com o zoom da mesa).
  useWheelOpen(listRef, (t) => {
    const a = t.closest<HTMLElement>('[data-zoom-work]')?.dataset.zoomWork;
    if (!a || zoom !== null || !reviews.some((rv) => rv.artist === a)) return false;
    open(a);
    return true;
  });

  const board = (
    <section className="pc-rv-board" aria-labelledby={titleId}>
      <span className="pc-tape" />
      <h2 id={titleId}>placar da rodada {round + 1}</h2>
      <p className="sum">
        {r.order.length ? (
          <>
            {r.order.length} {r.order.length === 1 ? 'obra' : 'obras'} · <b>{hits}</b> {hits === 1 ? 'acerto' : 'acertos'}
          </>
        ) : (
          'ninguém montou nada nesta rodada'
        )}
      </p>
      {rows.map((p) => {
        const g = r.gained[p] ?? 0, tot = scores[p] ?? 0;
        return (
          <div key={p} className={`pc-board-row${p === me ? ' me' : ''}`} data-p={p}>
            <span className="cr">
              <Critter color={color(p)} />
            </span>
            <span className="nm">{name(p)}</span>
            <span className={`g${g ? '' : ' zero'}`}>+{g}</span>
            <span className="tot">
              {tot}
              <small>{ptsWord(tot)}</small>
            </span>
          </div>
        );
      })}
      <div className="acts">
        {host ? (
          <button className="pc-btn-big" type="button" disabled={busy} onClick={onNext}>
            {last ? 'ver o fim do jogo' : 'próxima rodada'}
          </button>
        ) : (
          <span className="wait">esperando o host…</span>
        )}
      </div>
    </section>
  );

  if (reviews.length === 0) {
    return (
      <main className="pc-page pc-rs empty">
        <div className="pc-rs-side">{board}</div>
      </main>
    );
  }

  const zrv = zoom !== null ? reviews[zoom] : undefined;
  return (
    <>
      <main className="pc-page pc-rs">
        <div className="pc-rs-side">{board}</div>
        <section className="pc-rs-works" aria-labelledby={worksId}>
          <div className="pc-rs-head">
            <h2 id={worksId}>as obras da rodada</h2>
            <span className="hint">clique, lupinha ou rodinha pra cima numa obra ou foto pra ver grande</span>
          </div>
          <div className="pc-rs-list" ref={listRef}>
            {reviews.map((rv) => {
              const nm = name(rv.artist);
              const gain = rv.right.length;
              return (
                <article
                  key={rv.artist}
                  className="pc-rs-page"
                  data-artist={rv.artist}
                  aria-label={`obra de ${nm}`}
                  style={{ '--tilt': `${tiltOf(players, rv.artist)}deg`, '--rot': `${tapeRotOf(players, rv.artist)}deg` } as CSSProperties}
                >
                  <span className="pc-tape" />
                  <div className="pair">
                    <div className="pc-rs-work" data-zoom-work={rv.artist} title="ver a obra grande" onClick={() => open(rv.artist)}>
                      <KitShow work={rv.work} className="pc-wsheet" />
                      <button
                        className="pc-wz"
                        type="button"
                        title="ver a obra grande"
                        aria-label={`ver a obra de ${nm} grande`}
                        onClick={(e) => {
                          e.stopPropagation();
                          open(rv.artist);
                        }}
                      >
                        <i className="ti ti-zoom-in" />
                      </button>
                    </div>
                    <div
                      className="pc-rs-photo"
                      data-zoom-photo={rv.coord}
                      data-photo={rv.photoId}
                      title="ver a foto grande"
                      onClick={() => onZoomPhoto(rv.coord)}
                    >
                      <div className="pic">{rv.photoId && <Photo id={rv.photoId} />}</div>
                      <span className="co">
                        <small>era a</small>
                        {rv.coord}
                      </span>
                      <button
                        className="pc-zoom-btn"
                        type="button"
                        title="ver a foto grande"
                        aria-label={`ver a foto ${rv.coord} grande`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onZoomPhoto(rv.coord);
                        }}
                      >
                        <i className="ti ti-zoom-in" />
                      </button>
                    </div>
                  </div>
                  <div className="cap">
                    <span className="cr">
                      <Critter color={color(rv.artist)} />
                    </span>
                    <span className="who">
                      <span className="nm">{nm}</span>
                      <span className="kt">{KIT_NAMES[rv.work.kit]}</span>
                    </span>
                    <span className={`gain${gain ? '' : ' zero'}`} title={`o que ${nm} ganhou com esta obra`}>
                      +{gain}
                      <small>{ptsWord(gain)}</small>
                    </span>
                  </div>
                  <div className="hits">
                    <span className="txt">{hitsText(rv.right, name)}</span>
                    <span className="chips">
                      {rv.guesses.map(({ guesser, coord, ok }) => (
                        <span
                          key={guesser}
                          className={`pc-rs-g${ok ? ' ok' : ' no'}`}
                          data-g={guesser}
                          title={`${name(guesser)}: ${coord ?? 'sem palpite'}${ok ? ' ✓' : ''}`}
                        >
                          <span className="cr">
                            <Critter color={color(guesser)} />
                          </span>
                          <span className="gc">{coord ?? '—'}</span>
                          {ok && (
                            <span className="tick" aria-label="acertou">
                              ✓
                            </span>
                          )}
                        </span>
                      ))}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </main>
      {zrv && zoom !== null && (
        <ReviewZoom rv={zrv} index={zoom} count={reviews.length} name={name} color={color} onIndex={setZoom} onClose={() => setZoom(null)} />
      )}
    </>
  );
}
