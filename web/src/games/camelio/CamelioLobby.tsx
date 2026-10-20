import { CAMELIO_MAX_PLAYERS, CAMELIO_MIN_PLAYERS, type CamelioRoomView } from '@cartolina/shared';
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { goHome, roomLink } from '../../lib/router';
import { JOIN_ERRORS, type GameConn } from '../../net/connection';
import { Critter } from '../../screens/Critter';
import { SoundPill } from '../dixit/DixitTopBar';
import { useToast } from '../dixit/useToast';
import { playCamelioSound } from './sounds';
import { useCamelioSounds } from './useButtonSounds';
import './lobby.css';

/** Bots para testar sozinho: só existe em dev; em produção o import some e o código não vai pro bundle. */
const BotControls = import.meta.env.DEV ? lazy(() => import('../../dev/BotControls')) : null;

const TOAST_MS = 3200;

/** Lobby do Cama-Leão (id interno `camelio`), na identidade de circo: quem está na mesa e começar. */
export function CamelioLobby({ view, conn }: { view: CamelioRoomView; conn: GameConn }) {
  const host = view.hostId !== null && view.hostId === view.you;
  const connected = view.seats.filter((s) => s.connected).length;
  const [copied, setCopied] = useState(false);
  const [showLink, setShowLink] = useState(false);
  /** Tentou começar: o aviso de gente faltando aparece (e some sozinho quando a mesa completa). */
  const [tried, setTried] = useState(false);
  const { toast, say } = useToast(TOAST_MS);
  const rootRef = useRef<HTMLDivElement>(null);
  useCamelioSounds(rootRef);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const link = roomLink(view.code);
  const missing = tried && connected < CAMELIO_MIN_PLAYERS;

  // Recusas do servidor (que não são de entrada na sala) viram aviso na tela.
  useEffect(
    () =>
      conn.onError((code, message) => {
        if (JOIN_ERRORS.has(code)) return;
        say(message);
        playCamelioSound('error');
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
    if (connected < CAMELIO_MIN_PLAYERS) return playCamelioSound('error');
    conn.sendAction({ type: 'start' });
  }

  return (
    <div className="camelio-lobby" ref={rootRef} data-button-sounds="">
      <main className="cl-lobby">
        <h1 className="cl-lobby-logo">
          Cama-Leão <small>sala {view.code} · cartolina~</small>
        </h1>
        <section className="cl-lobby-sheet">
          <h2>na mesa</h2>
          <ul className="cl-lobby-people">
            {view.seats.map((s) => (
              <li key={s.id} className={s.connected ? '' : 'off'}>
                <Critter color={s.color} />
                <span>
                  {s.name}
                  {s.id === view.you ? ' (você)' : ''}
                  {s.id === view.hostId ? ' · host' : ''}
                </span>
              </li>
            ))}
          </ul>
          <button className="cl-lobby-btn ghost" type="button" onClick={() => void copy()}>
            {copied ? 'link copiado!' : 'copiar link da sala'}
          </button>
          {showLink && <input className="cl-lobby-link" readOnly value={link} aria-label="link da sala" onFocus={(e) => e.currentTarget.select()} />}
          <SoundPill />
        </section>
        <section className="cl-lobby-sheet">
          <h2>partida</h2>
          <p>
            Junte <b>5 esferas certinhas</b> de uma cor e empurre o resto pros amigos. De {CAMELIO_MIN_PLAYERS} a {CAMELIO_MAX_PLAYERS} pessoas.
          </p>
          {host ? (
            // sem o clique: com gente faltando só toca o erro
            <button className="cl-lobby-btn" type="button" data-sound={connected < CAMELIO_MIN_PLAYERS ? 'none' : undefined} onClick={start}>
              começar
            </button>
          ) : (
            <p>esperando o host começar…</p>
          )}
          {missing && (
            <p className="cl-lobby-warn" role="status">
              precisa de pelo menos {CAMELIO_MIN_PLAYERS} pessoas (tem {connected})
            </p>
          )}
        </section>
        <button className="cl-lobby-btn ghost cl-lobby-home" type="button" onClick={goHome}>
          voltar pro início
        </button>
        {BotControls && host && (
          <Suspense fallback={null}>
            <BotControls code={view.code} seats={view.seats.length} game="camelio" max={CAMELIO_MAX_PLAYERS} />
          </Suspense>
        )}
      </main>
      <div role="status" aria-live="polite">
        {toast && (
          <div key={toast.id} className="cl-lobby-toast">
            {toast.text}
          </div>
        )}
      </div>
    </div>
  );
}
