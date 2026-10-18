import type { Coord, PicturesRoomView, Work } from '@cartolina/shared';
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { GameConn } from '../../net/connection';
import { Critter } from '../../screens/Critter';
import { KitShow } from './KitShow';
import { PhotoGrid, type PhotoMark } from './PhotoGrid';
import { SplitLayout } from './SplitLayout';
import { playPicturesSound } from './sounds';
import { KIT_NAMES } from './status';
import { DRAG_THRESHOLD, dropTarget, stickerMove } from './stickers';
import { useWheelClose, useWheelOpen } from './useWheelZoom';

interface Props {
  view: PicturesRoomView;
  conn: GameConn;
  /** A foto ampliada (da mesa) está aberta: o teclado da galeria fica quieto. */
  zoomOpen: boolean;
  /** Lupinha de uma foto da grade (e clique na foto sem adesivo na mão). */
  onZoom: (coord: Coord) => void;
}

/** Um leve giro por artista, sempre o mesmo (álbum colado à mão), o da fitinha da lupa e o do adesivo. */
const TILTS = [-0.7, 0.5, -0.3, 0.8, -0.5, 0.3];
const TAPE_ROTS = [-7, -4, -9, -5, -8, -3];
const STICKER_ROTS = [-8, 6, -4, 9, -6, 4];
const COLS = 'abcd', ROWS = '1234';
/** O adesivo voando segue o ponteiro um pouco maior que o da moldura. */
const FLY_GROW = 1.12;
/** Palpite mandado sem eco depois disso (ms): o envio se perdeu, vale o que a visão diz. */
const PENDING_MS = 3000;

/** A tecla foi num campo de texto (quem digita não está palpitando). */
const typing = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement &&
  (t instanceof HTMLInputElement ||
    t instanceof HTMLTextAreaElement ||
    t.isContentEditable ||
    t.closest('[contenteditable]:not([contenteditable="false"])') !== null);

/** `document.elementFromPoint` sem quebrar onde não existe (jsdom). */
const elementAt = (x: number, y: number): Element | null =>
  typeof document.elementFromPoint === 'function' ? document.elementFromPoint(x, y) : null;

type Seat = PhotoMark;

/** Fitinha com a coordenada (só na lupa da obra). */
function GuessTape({ coord, rot }: { coord: Coord; rot: number }) {
  return (
    <span className="pc-gtape" style={{ '--rot': `${rot}deg` } as CSSProperties}>
      {coord}
    </span>
  );
}

/**
 * A lupa da galeria: a obra grande, com o artista, o kit e o seu palpite (se tiver). Esc / rodinha pra baixo / clique
 * fora / ✕ fecham.
 * Ao abrir, o foco vai pro ✕; ao fechar, volta pra quem abriu (como no zoom das fotos).
 */
function WorkZoom({ seat, work, guess, rot, onClose }: { seat: Seat; work: Work; guess: Coord | null; rot: number; onClose: () => void }) {
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
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      ref={dialogRef}
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
        <span className="cap">rodinha pra baixo ou Esc fecha</span>
        {guess && <GuessTape coord={guess} rot={rot} />}
      </div>
      <button ref={closeRef} className="pc-zoom-x" type="button" title="fechar (Esc)" aria-label="fechar" onClick={onClose}>
        ✕
      </button>
    </div>
  );
}

/** Um arraste de adesivo em andamento (ou só o dedo apertado, antes de andar o bastante). */
interface DragSession {
  artist: string;
  pointerId: number;
  x0: number;
  y0: number;
  /** Tamanho do adesivo voando, em px de tela (o palco é escalado). */
  size: number;
  moving: boolean;
}
interface Flying {
  artist: string;
  x: number;
  y: number;
  size: number;
  over: Coord | null;
}

/**
 * Palpites: a grade à esquerda e as obras dos outros à direita, cada uma com o adesivo do artista num lugar marcado da
 * moldura. Arrastar o adesivo até uma foto cola o palpite (de uma foto pra outra troca; de volta pra moldura ou fora
 * da grade tira). Sem arrastar: clique no adesivo (seleciona) e depois na foto, ou letra + número no teclado.
 * Os palpites vêm da visão (`myGuesses`); só enquanto o eco não chega vale a posição otimista local (`pending`).
 */
export function Gallery({ view, conn, zoomOpen, onZoom }: Props) {
  const g = view.game, me = view.you;
  const playing = me !== null && g.inRound.includes(me);
  // Trava de envio: depois de mandar "confirmar", nada mais sai até o eco (clique duplo, foto logo depois…).
  // A galeria remonta a cada rodada (`key`), então a trava zera sozinha.
  const confirmSent = useRef(false);
  const [, setSent] = useState(false);
  const confirmedHere = me !== null && g.confirmed.includes(me);
  const locked = !playing || confirmedHere || confirmSent.current;
  // "Desconfirmar" mandado: o botão some até o eco (aí a galeria destrava).
  const [undoSent, setUndoSent] = useState(false);
  useEffect(() => {
    // O eco do "confirmar" chegou: a visão manda daqui pra frente (e o "desconfirmar" pode destravar).
    if (confirmedHere) confirmSent.current = false;
    else setUndoSent(false);
  }, [confirmedHere]);
  useEffect(() => conn.onError(() => setUndoSent(false)), [conn]);
  const others = g.inRound.filter((p) => p !== me && Object.hasOwn(g.works, p));
  const [picked, setPicked] = useState<string | null>(null);
  const sel = locked ? null : picked !== null && others.includes(picked) ? picked : null;
  const [workZoom, setWorkZoom] = useState<string | null>(null);
  const [fly, setFly] = useState<Flying | null>(null);
  const flying = locked ? null : fly;
  const keyBuf = useRef('');
  const rootRef = useRef<HTMLDivElement>(null);
  // o adesivo que você acabou de colar entra com o "pop" (só na montagem do elemento)
  const popped = useRef('');

  // Posição otimista: o palpite mandado aparece na hora; some quando a visão confirma (ou o servidor recusa).
  const [pending, setPending] = useState<Record<string, Coord | null>>({});
  const guesses = g.myGuesses;
  useEffect(() => {
    setPending((prev) => {
      const left = Object.entries(prev).filter(([a, c]) => (guesses[a] ?? null) !== c);
      return left.length === Object.keys(prev).length ? prev : Object.fromEntries(left);
    });
  }, [guesses]);
  useEffect(() => conn.onError(() => setPending({})), [conn]);
  // Envio perdido (conexão caiu no meio): sem eco, o otimista vence e o adesivo volta pro que a visão diz.
  const pendingTimers = useRef(new Set<number>());
  useEffect(() => {
    const timers = pendingTimers.current;
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);
  function expire(artist: string, coord: Coord | null) {
    const t = window.setTimeout(() => {
      pendingTimers.current.delete(t);
      setPending((prev) => {
        if (!Object.hasOwn(prev, artist) || prev[artist] !== coord) return prev;
        const rest = { ...prev };
        delete rest[artist];
        return rest;
      });
    }, PENDING_MS);
    pendingTimers.current.add(t);
  }
  const guessOf = (p: string): Coord | null => (playing ? (Object.hasOwn(pending, p) ? pending[p]! : (guesses[p] ?? null)) : null);

  const seatOf = (p: string): Seat => view.seats.find((s) => s.id === p) ?? { id: p, name: '?', color: '#A7A9AE' };
  const nth = (p: string) => Math.max(0, g.players.indexOf(p));
  const tilt = (p: string) => TILTS[nth(p) % TILTS.length]!;
  const tapeRot = (p: string) => TAPE_ROTS[nth(p) % TAPE_ROTS.length]!;
  const stickerRot = (p: string) => STICKER_ROTS[nth(p) % STICKER_ROTS.length]!;

  /** Põe (ou tira, com null) o adesivo de `artist`. Só manda se mudou. */
  function place(artist: string, coord: Coord | null) {
    if (locked || confirmSent.current) return;
    const move = stickerMove(guessOf(artist), coord);
    if (!move) return;
    if (coord) popped.current = `${artist}:${coord}`;
    setPending((prev) => ({ ...prev, [artist]: coord }));
    expire(artist, coord);
    conn.sendAction({ type: 'guess', artist, coord: move.coord });
    playPicturesSound(coord ? 'tape' : 'peel');
  }
  /** Clique na foto: com um adesivo na mão, cola; sem (ou depois de confirmar), amplia. */
  function photoClick(coord: Coord) {
    if (workZoom !== null) return;
    if (sel) place(sel, coord);
    else onZoom(coord);
  }
  function toggle(artist: string) {
    if (locked || confirmSent.current) return;
    setPicked(artist === sel ? null : artist);
    keyBuf.current = '';
  }
  function confirm() {
    if (locked || confirmSent.current) return;
    confirmSent.current = true;
    setSent(true);
    setFly(null);
    conn.sendAction({ type: 'confirm' });
  }
  function unconfirm() {
    if (!confirmedHere || undoSent) return;
    setUndoSent(true);
    conn.sendAction({ type: 'unconfirm' });
  }
  // Um zoom de cada vez: com a obra grande aberta a lupinha das fotos não abre outra por cima (e vice-versa).
  function zoomPhoto(coord: Coord) {
    if (workZoom === null) onZoom(coord);
  }
  function openWork(artist: string) {
    if (!zoomOpen) setWorkZoom(artist);
  }
  // Rodinha pra cima numa moldura abre a obra grande (as fotos da grade ficam com a mesa).
  useWheelOpen(rootRef, (t) => {
    const p = t.closest<HTMLElement>('.pc-wf[data-artist]')?.dataset.artist;
    if (!p || !others.includes(p) || zoomOpen || workZoom !== null) return false;
    setWorkZoom(p);
    return true;
  });

  // ---- arraste (pointer events na janela: o adesivo pode sair da moldura, da grade e até do palco) ----
  const session = useRef<DragSession | null>(null);
  const placeRef = useRef(place);
  placeRef.current = place;
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  // O clique que o navegador solta no fim de um arraste não pode selecionar adesivo nem colar foto.
  const eatClick = useRef(false);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!eatClick.current) return;
      eatClick.current = false;
      e.stopPropagation();
      e.preventDefault();
    };
    const onDown = () => {
      eatClick.current = false;
    };
    // Arraste por toque não solta clique nenhum: o próximo gesto (ponteiro ou tecla) zera, senão o Enter seria engolido.
    window.addEventListener('click', onClick, true);
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onDown, true);
    return () => {
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onDown, true);
    };
  }, []);
  const stopDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => stopDrag.current?.(), []);
  // Travou ou abriu um zoom por cima no meio do arraste: o adesivo volta sem mexer no palpite.
  useEffect(() => {
    if (locked || zoomOpen || workZoom !== null) stopDrag.current?.();
  }, [locked, zoomOpen, workZoom]);

  function startDrag(e: ReactPointerEvent<HTMLElement>, artist: string) {
    if (locked || confirmSent.current || e.button !== 0 || session.current) return;
    const stage = rootRef.current;
    const scale = stage && stage.offsetWidth > 0 ? stage.getBoundingClientRect().width / stage.offsetWidth : 1;
    session.current = { artist, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, size: 46 * scale * FLY_GROW, moving: false };
    const move = (ev: PointerEvent) => {
      const s = session.current;
      if (!s || ev.pointerId !== s.pointerId || lockedRef.current) return;
      if (!s.moving && Math.hypot(ev.clientX - s.x0, ev.clientY - s.y0) < DRAG_THRESHOLD) return;
      s.moving = true;
      ev.preventDefault();
      setFly({ artist: s.artist, x: ev.clientX, y: ev.clientY, size: s.size, over: dropTarget(elementAt(ev.clientX, ev.clientY)) });
    };
    const up = (ev: PointerEvent) => {
      const s = session.current;
      if (!s || ev.pointerId !== s.pointerId) return;
      end();
      if (!s.moving) return;
      eatClick.current = true;
      if (!lockedRef.current) placeRef.current(s.artist, dropTarget(elementAt(ev.clientX, ev.clientY)));
    };
    const cancel = (ev: PointerEvent) => {
      if (session.current && ev.pointerId === session.current.pointerId) end();
    };
    function end() {
      session.current = null;
      stopDrag.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      setFly(null);
    }
    stopDrag.current = end;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  }

  // Teclado: com um adesivo selecionado, "b" e depois "3" cola na B3; Delete/Backspace tira.
  const keyRef = useRef({ place, sel, guessOf });
  keyRef.current = { place, sel, guessOf };
  const keysOn = !zoomOpen && workZoom === null && sel !== null;
  useEffect(() => {
    keyBuf.current = '';
    if (!keysOn) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || typing(e.target)) return;
      const { place: put, sel: who, guessOf: at } = keyRef.current;
      if (!who) return;
      const k = e.key.toLowerCase();
      if (k.length === 1 && COLS.includes(k)) {
        keyBuf.current = k.toUpperCase();
        e.preventDefault();
      } else if (k.length === 1 && ROWS.includes(k) && keyBuf.current) {
        const c = (keyBuf.current + k) as Coord;
        keyBuf.current = '';
        e.preventDefault();
        put(who, c);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && at(who)) {
        keyBuf.current = '';
        e.preventDefault();
        put(who, null);
      } else keyBuf.current = '';
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [keysOn, sel]);

  /** O adesivo de `p` (na moldura ou na foto): botão enquanto dá pra mexer, senão só o desenho. */
  function sticker(p: string, where: 'slot' | 'photo'): ReactNode {
    const seat = seatOf(p), c = guessOf(p);
    const cls = `pc-stk${p === sel ? ' sel' : ''}${flying?.artist === p ? ' lifting' : ''}${
      where === 'photo' && c && popped.current === `${p}:${c}` ? ' pop' : ''
    }`;
    const style = { '--rot': `${stickerRot(p)}deg` } as CSSProperties;
    const face = <Critter color={seat.color} />;
    if (locked) {
      return (
        <span key={p} className={cls} style={style} title={`adesivo de ${seat.name}`}>
          {face}
        </span>
      );
    }
    return (
      <button
        key={p}
        className={cls}
        style={style}
        type="button"
        data-sound="none"
        aria-label={`adesivo de ${seat.name}`}
        aria-pressed={p === sel}
        title={c ? `adesivo de ${seat.name}: arraste pra outra foto, ou de volta pra obra` : `arraste o adesivo de ${seat.name} até uma foto`}
        onPointerDown={(e) => startDrag(e, p)}
        onClick={(e) => {
          e.stopPropagation();
          toggle(p);
        }}
      >
        {face}
      </button>
    );
  }

  /** O lugar marcado na moldura: o adesivo, ou a sombra apagada dele quando está numa foto (ou voando). */
  function slot(p: string): ReactNode {
    const c = guessOf(p), away = c !== null || flying?.artist === p;
    const seat = seatOf(p);
    const style = { '--rot': `${stickerRot(p)}deg` } as CSSProperties;
    let inner: ReactNode;
    if (!away) inner = sticker(p, 'slot');
    else if (c && !locked && flying?.artist !== p) {
      inner = (
        <button
          className="pc-stk ghost"
          style={style}
          type="button"
          data-sound="none"
          aria-label={`tirar o palpite de ${seat.name} (${c})`}
          title="devolver o adesivo (tira o palpite)"
          onClick={(e) => {
            e.stopPropagation();
            place(p, null);
          }}
        >
          <Critter color={seat.color} />
        </button>
      );
    } else {
      inner = (
        <span className="pc-stk ghost" style={style} aria-hidden="true">
          <Critter color={seat.color} />
        </span>
      );
    }
    return <span className="pc-stk-slot">{inner}</span>;
  }

  // na grade: os adesivos colados em cada foto, na ordem das obras
  const stickers: Partial<Record<Coord, ReactNode[]>> = {};
  for (const p of others) {
    const c = guessOf(p);
    if (c) (stickers[c] ??= []).push(sticker(p, 'photo'));
  }
  const missing = others.filter((p) => !guessOf(p)).length;
  const selGuess = sel ? guessOf(sel) : null;

  const left = (
    <>
      <PhotoGrid
        grid={g.grid}
        secret={playing ? g.mySecret : null}
        onPhoto={playing ? photoClick : zoomPhoto}
        onZoom={zoomPhoto}
        pickable={!locked && sel !== null}
        picked={selGuess}
        stickers={stickers}
        dropOn={flying?.over ?? null}
      />
      {g.round + 1 < g.rounds && <p className="pc-grid-note">As fotos secretas desta rodada trocam na próxima.</p>}
    </>
  );

  const right = (
    <div ref={rootRef} className={`pc-gallery${locked ? ' locked' : ''}${flying ? ' dragging' : ''}`}>
      <div className="pc-gal-head">
        <h2>de quem é qual foto?</h2>
        <span className="hint">
          {!playing ? (
            'você está assistindo esta rodada'
          ) : locked ? (
            'palpites confirmados ✓'
          ) : sel ? (
            <>
              adesivo de <b>{seatOf(sel).name}</b> na mão: clique na foto que você acha que é (ou digite <b>b3</b>)
            </>
          ) : (
            'arraste o adesivo de cada obra até a foto que você acha que é'
          )}
        </span>
      </div>
      <div className="pc-works">
        {others.length === 0 ? (
          <p className="pc-no-works">Ninguém mais montou nada nesta rodada. Confirme pra seguir.</p>
        ) : (
          others.map((p) => {
            const seat = seatOf(p), work = g.works[p]!, coord = guessOf(p);
            return (
              <div
                key={p}
                className={`pc-wf${p === sel ? ' sel' : ''}`}
                data-artist={p}
                style={{ '--tilt': `${tilt(p)}deg` } as CSSProperties}
              >
                <KitShow work={work} className="pc-wsheet" />
                <div className="cap">
                  {slot(p)}
                  <span className="who">
                    <span className="nm">{seat.name}</span>
                    <span className="kt">{KIT_NAMES[work.kit]}</span>
                  </span>
                  {playing && (
                    <span className={`pc-wf-guess${coord ? ' on' : ''}`}>
                      {coord ? (
                        <>
                          você acha que é a <b>{coord}</b>
                        </>
                      ) : (
                        'sem palpite'
                      )}
                    </span>
                  )}
                </div>
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
          {confirmedHere && !undoSent && (
            <button className="pc-btn-soft" type="button" title="volta a mexer nos palpites (a contagem não para)" onClick={unconfirm}>
              desconfirmar
            </button>
          )}
        </div>
      )}
    </div>
  );

  const zoomWork = workZoom !== null && Object.hasOwn(g.works, workZoom) ? g.works[workZoom]! : null;
  const flyRoot = rootRef.current?.closest('.pictures') ?? null;
  return (
    <>
      <SplitLayout left={left} right={right} />
      {flying &&
        flyRoot &&
        createPortal(
          <span
            className="pc-stk fly"
            aria-hidden="true"
            style={{ left: flying.x, top: flying.y, width: flying.size, height: flying.size, '--rot': `${stickerRot(flying.artist)}deg` } as CSSProperties}
          >
            <Critter color={seatOf(flying.artist).color} />
          </span>,
          flyRoot,
        )}
      {workZoom !== null && zoomWork && (
        <WorkZoom
          seat={seatOf(workZoom)}
          work={zoomWork}
          guess={guessOf(workZoom)}
          rot={tapeRot(workZoom)}
          onClose={() => setWorkZoom(null)}
        />
      )}
    </>
  );
}
