import { COUP_MAX_PLAYERS, COUP_MIN_PLAYERS, type CoupRoomView } from '@cartolina/shared';
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { goHome, roomLink } from '../../lib/router';
import { JOIN_ERRORS, type GameConn } from '../../net/connection';
import { Critter } from '../../screens/Critter';
import { catalogEntry } from '../catalog';
import { SoundPill } from '../dixit/DixitTopBar';
import { useToast } from '../dixit/useToast';
import { playCoupSound } from './sounds';
import { useCoupButtonSounds } from './useCoupButtonSounds';
import './coup.css';

/** Bots para testar sozinho: só existe em dev; em produção o import some e o código não vai pro bundle. */
const BotControls = import.meta.env.DEV ? lazy(() => import('../../dev/BotControls')) : null;

const TOAST_MS = 3200;

/** Lobby do Cúpi (id interno `coup`), na identidade de cartaz: quem está na mesa, como jogar e começar. */
export function CoupLobby({ view, conn }: { view: CoupRoomView; conn: GameConn }) {
  const host = view.hostId !== null && view.hostId === view.you;
  const connected = view.seats.filter((s) => s.connected).length;
  const full = view.seats.length >= COUP_MAX_PLAYERS;
  const rules = catalogEntry('coup')?.rules ?? [];
  const [copied, setCopied] = useState(false);
  const [showLink, setShowLink] = useState(false);
  /** Tentou começar: o aviso de gente faltando aparece (e some sozinho quando a mesa completa). */
  const [tried, setTried] = useState(false);
  const { toast, say } = useToast(TOAST_MS);
  const rootRef = useRef<HTMLDivElement>(null);
  useCoupButtonSounds(rootRef);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const link = roomLink(view.code);
  const missing = tried && connected < COUP_MIN_PLAYERS;

  // Recusas do servidor (que não são de entrada na sala) viram aviso na tela.
  useEffect(
    () =>
      conn.onError((code, message) => {
        if (JOIN_ERRORS.has(code)) return;
        say(message);
        playCoupSound('error');
      }),
    [conn, say],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setShowLink(false);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // sem permissão ou sem clipboard (http fora de localhost): mostra o link pra copiar na mão
      setShowLink(true);
    }
  }

  function start() {
    setTried(true);
    if (connected < COUP_MIN_PLAYERS) return playCoupSound('error');
    conn.sendAction({ type: 'start' });
  }

  return (
    <div className="coup" ref={rootRef} data-button-sounds="">
      <main className="cp-lobby">
        <header className="cp-poster">
          <div className="cp-band" aria-hidden="true" />
          <h1 className="cp-logo">CÚPI</h1>
          <p className="cp-room">
            sala <b className="cp-code">{view.code}</b>
          </p>
        </header>
        <section className="cp-sheet">
          <h2>na mesa</h2>
          <ul className="cp-people">
            {view.seats.map((s) => (
              <li key={s.id} className={s.connected ? '' : 'off'}>
                <Critter color={s.color} />
                <span>
                  {s.name}
                  {s.id === view.you ? ' (você)' : ''}
                  {s.id === view.hostId ? ' · anfitrião' : ''}
                </span>
              </li>
            ))}
          </ul>
          {full && <p className="cp-note">{`a mesa está cheia (${view.seats.length})`}</p>}
          <button className="cp-btn ghost" type="button" onClick={() => void copy()}>
            {copied ? 'link copiado!' : 'copiar link da sala'}
          </button>
          {showLink && <input className="cp-link" readOnly value={link} aria-label="link da sala" onFocus={(e) => e.currentTarget.select()} />}
          <SoundPill />
        </section>
        <section className="cp-sheet">
          <h2>como jogar</h2>
          <ul className="cp-rules">
            {rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>
        <section className="cp-sheet">
          {host ? (
            // sem o clique: com gente faltando só toca o erro
            <button className="cp-btn" type="button" data-sound={connected < COUP_MIN_PLAYERS ? 'none' : undefined} onClick={start}>
              começar
            </button>
          ) : (
            <p>esperando o anfitrião começar…</p>
          )}
          {missing && (
            <p className="cp-warn">
              precisa de pelo menos {COUP_MIN_PLAYERS} pessoas (tem {connected})
            </p>
          )}
        </section>
        <button className="cp-btn ghost cp-home" type="button" onClick={goHome}>
          voltar pro início
        </button>
        {BotControls && (
          <Suspense fallback={null}>
            <BotControls code={view.code} seats={view.seats.length} game="coup" />
          </Suspense>
        )}
      </main>
      <div role="status" aria-live="polite">
        {toast && (
          <div key={toast.id} className="cp-toast">
            {toast.text}
          </div>
        )}
      </div>
    </div>
  );
}
