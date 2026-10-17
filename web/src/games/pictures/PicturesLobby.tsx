import { PICTURES_MAX_PLAYERS, PICTURES_MIN_PLAYERS, PICTURES_ROUNDS, type PicturesRoomView } from '@cartolina/shared';
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { playSound } from '../../brand/sounds';
import { goHome, roomLink } from '../../lib/router';
import { JOIN_ERRORS, type GameConn } from '../../net/connection';
import { Critter } from '../../screens/Critter';
import { SoundPill } from '../dixit/DixitTopBar';
import { useToast } from '../dixit/useToast';
import './pictures.css';

/** Bots para testar sozinho: só existe em dev; em produção o import some e o código não vai pro bundle. */
const BotControls = import.meta.env.DEV ? lazy(() => import('../../dev/BotControls')) : null;

const TOAST_MS = 3200;

/** Lobby do Retratim (id interno `pictures`), na identidade de álbum: quem está na mesa e começar. */
export function PicturesLobby({ view, conn }: { view: PicturesRoomView; conn: GameConn }) {
  const host = view.hostId !== null && view.hostId === view.you;
  const connected = view.seats.filter((s) => s.connected).length;
  const [copied, setCopied] = useState(false);
  const [showLink, setShowLink] = useState(false);
  /** Tentou começar: o aviso de gente faltando aparece (e some sozinho quando a mesa completa). */
  const [tried, setTried] = useState(false);
  const { toast, say } = useToast(TOAST_MS);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const link = roomLink(view.code);
  const missing = tried && connected < PICTURES_MIN_PLAYERS;

  // Recusas do servidor (que não são de entrada na sala) viram aviso na tela.
  useEffect(
    () =>
      conn.onError((code, message) => {
        if (JOIN_ERRORS.has(code)) return;
        say(message);
        playSound('error');
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
    if (connected < PICTURES_MIN_PLAYERS) return playSound('error');
    conn.sendAction({ type: 'start' });
  }

  return (
    <div className="pictures">
      <main className="pc-lobby">
        <h1 className="pc-logo">
          Retratim <small>sala {view.code} · cartolina~</small>
        </h1>
        <section className="pc-sheet">
          <h2>na mesa</h2>
          <ul className="pc-people">
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
          <button className="pc-btn ghost" type="button" onClick={() => void copy()}>
            {copied ? 'link copiado!' : 'copiar link da sala'}
          </button>
          {showLink && <input className="pc-link" readOnly value={link} aria-label="link da sala" onFocus={(e) => e.currentTarget.select()} />}
          <SoundPill />
        </section>
        <section className="pc-sheet">
          <h2>partida</h2>
          <p>
            <b>{PICTURES_ROUNDS} rodadas</b>, cada uma com um kit diferente. De {PICTURES_MIN_PLAYERS} a {PICTURES_MAX_PLAYERS} pessoas.
          </p>
          {host ? (
            // sem o clique: com gente faltando só toca o erro
            <button className="pc-btn" type="button" data-sound={connected < PICTURES_MIN_PLAYERS ? 'none' : undefined} onClick={start}>
              começar
            </button>
          ) : (
            <p>esperando o host começar…</p>
          )}
          {missing && (
            <p className="pc-warn" role="status">
              precisa de pelo menos {PICTURES_MIN_PLAYERS} pessoas (tem {connected})
            </p>
          )}
        </section>
        <button className="pc-btn ghost pc-home" type="button" onClick={goHome}>
          voltar pro início
        </button>
        {BotControls && (
          <Suspense fallback={null}>
            <BotControls code={view.code} seats={view.seats.length} game="pictures" />
          </Suspense>
        )}
      </main>
      <div role="status" aria-live="polite">
        {toast && (
          <div key={toast.id} className="pc-toast">
            {toast.text}
          </div>
        )}
      </div>
    </div>
  );
}
