import type { Coord, PicturesRoomView, Work } from '@cartolina/shared';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { GameConn } from '../../net/connection';
import { Critter } from '../../screens/Critter';
import { KitShow } from './KitShow';
import { PhotoGrid, type PhotoMark } from './PhotoGrid';
import { SplitLayout } from './SplitLayout';
import { playPicturesSound } from './sounds';
import { KIT_NAMES } from './status';

interface Props {
  view: PicturesRoomView;
  conn: GameConn;
  /** A foto ampliada (da mesa) está aberta: o teclado da galeria fica quieto. */
  zoomOpen: boolean;
  /** Lupinha de uma foto da grade. */
  onZoom: (coord: Coord) => void;
  /** Aviso no palco (com o som de erro). */
  onWarn: (text: string) => void;
}

/** Um leve giro por artista, sempre o mesmo (álbum colado à mão), e o da fitinha. */
const TILTS = [-0.7, 0.5, -0.3, 0.8, -0.5, 0.3];
const TAPE_ROTS = [-7, -4, -9, -5, -8, -3];
const COLS = 'abcd', ROWS = '1234';

/** A tecla foi num campo de texto (quem digita não está palpitando). */
const typing = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement &&
  (t instanceof HTMLInputElement ||
    t instanceof HTMLTextAreaElement ||
    t.isContentEditable ||
    t.closest('[contenteditable]:not([contenteditable="false"])') !== null);

type Seat = PhotoMark;

function GuessTape({ coord, rot, pop, onRemove }: { coord: Coord; rot: number; pop?: boolean; onRemove?: () => void }) {
  const style = { '--rot': `${rot}deg` } as CSSProperties;
  if (!onRemove) {
    return (
      <span className="pc-gtape" style={style}>
        {coord}
      </span>
    );
  }
  return (
    <button
      className={`pc-gtape${pop ? ' pop' : ''}`}
      type="button"
      data-sound="none"
      style={style}
      title="tirar o palpite"
      aria-label={`tirar o palpite ${coord}`}
      onClick={(e) => {
        e.stopPropagation();
        onRemove();
      }}
    >
      {coord}
    </button>
  );
}

/**
 * A lupa da galeria: a obra grande, com o artista, o kit e a sua fitinha (se tiver). Esc / clique fora / ✕ fecham.
 * Ao abrir, o foco vai pro ✕; ao fechar, volta pra quem abriu (como no zoom das fotos).
 */
function WorkZoom({ seat, work, guess, rot, onClose }: { seat: Seat; work: Work; guess: Coord | null; rot: number; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const opener = document.activeElement;
    closeRef.current?.focus();
    return () => {
      if (opener instanceof HTMLElement && opener !== document.body && opener.isConnected) opener.focus();
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="pc-zoom"
      role="dialog"
      aria-modal="true"
      aria-label={`obra de ${seat.name}`}
      onClick={(e) => {
        if (!(e.target as Element).closest('.pc-zoom-frame, button')) onClose();
      }}
    >
      <div className="pc-zoom-frame work">
        <KitShow work={work} className="pic" />
        <span className="who">
          <span className="cr">
            <Critter color={seat.color} />
          </span>
          <span>
            <span className="nm">{seat.name}</span>
            <span className="kt">{KIT_NAMES[work.kit]}</span>
          </span>
        </span>
        <span className="cap">Esc fecha</span>
        {guess && <GuessTape coord={guess} rot={rot} />}
      </div>
      <button ref={closeRef} className="pc-zoom-x" type="button" title="fechar (Esc)" aria-label="fechar" onClick={onClose}>
        ✕
      </button>
    </div>
  );
}

/**
 * Palpites: a grade à esquerda (clique na foto = cola a fitinha na obra selecionada; zoom só pela lupinha) e as obras
 * dos outros à direita. Os palpites mostrados são sempre os da visão (`myGuesses`), sem cópia local.
 */
export function Gallery({ view, conn, zoomOpen, onZoom, onWarn }: Props) {
  const g = view.game, me = view.you;
  const playing = me !== null && g.inRound.includes(me);
  // Trava de envio: depois de mandar "confirmar", nada mais sai até o eco (clique duplo, foto logo depois…).
  // A galeria remonta a cada rodada (`key`), então a trava zera sozinha.
  const confirmSent = useRef(false);
  const [, setSent] = useState(false);
  const locked = !playing || g.confirmed.includes(me) || confirmSent.current;
  const guesses = g.myGuesses;
  const others = g.inRound.filter((p) => p !== me && Object.hasOwn(g.works, p));
  const [picked, setPicked] = useState<string | null>(null);
  const sel = locked ? null : picked !== null && others.includes(picked) ? picked : (others[0] ?? null);
  const [workZoom, setWorkZoom] = useState<string | null>(null);
  // a fitinha que você acabou de colar entra com o "pop" (só na montagem do elemento)
  const popped = useRef('');
  const keyBuf = useRef('');

  const seatOf = (p: string): Seat => view.seats.find((s) => s.id === p) ?? { id: p, name: '?', color: '#A7A9AE' };
  const nth = (p: string) => Math.max(0, g.players.indexOf(p));
  const tilt = (p: string) => TILTS[nth(p) % TILTS.length]!;
  const tapeRot = (p: string) => TAPE_ROTS[nth(p) % TAPE_ROTS.length]!;

  function guessAt(coord: Coord) {
    if (!playing || workZoom !== null) return;
    if (locked || confirmSent.current) return onWarn('Você já confirmou.');
    if (!sel) return onWarn('Escolha uma obra primeiro.');
    if (guesses[sel] === coord) return;
    popped.current = `${sel}:${coord}`;
    conn.sendAction({ type: 'guess', artist: sel, coord });
    playPicturesSound('tape');
  }
  function unguess(artist: string) {
    if (locked || confirmSent.current) return;
    setPicked(artist);
    conn.sendAction({ type: 'guess', artist, coord: null });
    playPicturesSound('peel');
  }
  function select(artist: string) {
    if (locked || confirmSent.current || artist === sel) return;
    setPicked(artist);
    keyBuf.current = '';
  }
  function confirm() {
    if (locked || confirmSent.current) return;
    confirmSent.current = true;
    setSent(true);
    conn.sendAction({ type: 'confirm' });
  }
  // Um zoom de cada vez: com a obra grande aberta a lupinha das fotos não abre outra por cima (e vice-versa).
  function zoomPhoto(coord: Coord) {
    if (workZoom === null) onZoom(coord);
  }
  function openWork(artist: string) {
    if (!zoomOpen) setWorkZoom(artist);
  }

  // Teclado: com uma obra selecionada, "b" e depois "3" cola a fitinha B3.
  const guessRef = useRef(guessAt);
  guessRef.current = guessAt;
  const keysOn = !zoomOpen && workZoom === null && sel !== null;
  useEffect(() => {
    keyBuf.current = '';
    if (!keysOn) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || typing(e.target)) return;
      const k = e.key.toLowerCase();
      if (k.length === 1 && COLS.includes(k)) {
        keyBuf.current = k.toUpperCase();
        e.preventDefault();
      } else if (k.length === 1 && ROWS.includes(k) && keyBuf.current) {
        const c = (keyBuf.current + k) as Coord;
        keyBuf.current = '';
        e.preventDefault();
        guessRef.current(c);
      } else keyBuf.current = '';
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [keysOn, sel]);

  // na grade: os bichinhos das obras em que você colou cada foto
  const marks: Partial<Record<Coord, PhotoMark[]>> = {};
  for (const p of others) {
    const c = guesses[p];
    if (c) (marks[c] ??= []).push(seatOf(p));
  }
  const missing = others.filter((p) => !guesses[p]).length;

  const left = (
    <>
      <PhotoGrid
        grid={g.grid}
        secret={playing ? g.mySecret : null}
        onPhoto={playing ? guessAt : zoomPhoto}
        onZoom={zoomPhoto}
        pickable={!locked}
        picked={sel ? (guesses[sel] ?? null) : null}
        marks={marks}
      />
      <p className="pc-grid-note">A grade é a mesma a partida toda.</p>
    </>
  );

  const right = (
    <div className={`pc-gallery${locked ? ' locked' : ''}`}>
      <div className="pc-gal-head">
        <h2>de quem é qual foto?</h2>
        <span className="hint">
          {!playing ? (
            'você está assistindo esta rodada'
          ) : locked ? (
            'palpites confirmados ✓'
          ) : sel ? (
            <>
              obra de <b>{seatOf(sel).name}</b> selecionada: clique na foto que você acha que é (ou digite <b>b3</b>)
            </>
          ) : (
            'clique numa obra pra escolher'
          )}
        </span>
      </div>
      <div className="pc-works">
        {others.length === 0 ? (
          <p className="pc-no-works">Ninguém mais montou nada nesta rodada. Confirme pra seguir.</p>
        ) : (
          others.map((p) => {
            const seat = seatOf(p), work = g.works[p]!, coord = playing ? guesses[p] : undefined;
            return (
              <div
                key={p}
                className={`pc-wf${p === sel ? ' sel' : ''}`}
                data-artist={p}
                style={{ '--tilt': `${tilt(p)}deg` } as CSSProperties}
              >
                <button className="pc-wf-pick" type="button" aria-pressed={p === sel} aria-label={`obra de ${seat.name}`} onClick={() => select(p)}>
                  <KitShow work={work} className="pc-wsheet" />
                  <span className="cap">
                    <span className="cr">
                      <Critter color={seat.color} />
                    </span>
                    <span>
                      <span className="nm">{seat.name}</span>
                      <span className="kt">{KIT_NAMES[work.kit]}</span>
                    </span>
                  </span>
                </button>
                <button
                  className="pc-wz"
                  type="button"
                  title="ver a obra grande"
                  aria-label={`ver a obra de ${seat.name} grande`}
                  onClick={(e) => {
                    e.stopPropagation();
                    openWork(p);
                  }}
                >
                  <i className="ti ti-zoom-in" />
                </button>
                {coord ? (
                  <GuessTape
                    key={`${p}:${coord}`}
                    coord={coord}
                    rot={tapeRot(p)}
                    pop={popped.current === `${p}:${coord}`}
                    onRemove={locked ? undefined : () => unguess(p)}
                  />
                ) : (
                  playing && !locked && <span className="pc-empty-tag">sem palpite</span>
                )}
              </div>
            );
          })
        )}
      </div>
      {playing && (
        <div className="pc-gal-foot">
          <span className={`hint${locked ? ' ok' : ''}`}>
            {locked ? (
              'esperando a galera…'
            ) : missing ? (
              <>
                faltam <b>{missing}</b> {missing === 1 ? 'obra' : 'obras'} sem palpite · dá pra confirmar assim mesmo
              </>
            ) : (
              'todas as obras com palpite'
            )}
          </span>
          {!locked && (
            <button className="pc-btn-big" type="button" onClick={confirm}>
              confirmar palpites
            </button>
          )}
        </div>
      )}
    </div>
  );

  const zoomWork = workZoom !== null && Object.hasOwn(g.works, workZoom) ? g.works[workZoom]! : null;
  return (
    <>
      <SplitLayout left={left} right={right} />
      {workZoom !== null && zoomWork && (
        <WorkZoom
          seat={seatOf(workZoom)}
          work={zoomWork}
          guess={playing ? (guesses[workZoom] ?? null) : null}
          rot={tapeRot(workZoom)}
          onClose={() => setWorkZoom(null)}
        />
      )}
    </>
  );
}
