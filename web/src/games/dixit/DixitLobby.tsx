import { DIXIT_MIN_PLAYERS, DIXIT_TARGETS, type DixitRoomView } from '@cartolina/shared';
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { installButtonSounds } from '../../brand/buttonSounds';
import { goHome, roomLink } from '../../lib/router';
import { JOIN_ERRORS, type GameConn } from '../../net/connection';
import { Critter } from '../../screens/Critter';
import { Brushes } from './Brushes';
import { SoundPill } from './DixitTopBar';
import { playDixitSound } from './sounds';
import './dixit.css';

/** Bots para testar sozinho: só existe em dev; em produção o import some e o código não vai pro bundle. */
const BotControls = import.meta.env.DEV ? lazy(() => import('../../dev/BotControls')) : null;

const TOAST_MS = 3200;

/** Lobby do Diquisti, na identidade do jogo: quem está na mesa, meta (host) e começar. */
export function DixitLobby({ view, conn }: { view: DixitRoomView; conn: GameConn }) {
  const host = view.hostId !== null && view.hostId === view.you;
  const connected = view.seats.filter((s) => s.connected).length;
  const [copied, setCopied] = useState(false);
  const [showLink, setShowLink] = useState(false);
  /** Tentou começar: o aviso de gente faltando aparece (e some sozinho quando a mesa completa). */
  const [tried, setTried] = useState(false);
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const toastSeq = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const link = roomLink(view.code);
  const missing = tried && connected < DIXIT_MIN_PLAYERS;

  // Botões do lobby com o clique mais baixo do Diquisti (o listener do documento fica quieto aqui dentro).
  useEffect(() => {
    const root = rootRef.current;
    return root ? installButtonSounds(root, (s) => playDixitSound(s)) : undefined;
  }, []);

  // Recusas do servidor (que não são de entrada na sala) viram aviso na tela, como na mesa.
  useEffect(
    () =>
      conn.onError((code, message) => {
        if (JOIN_ERRORS.has(code)) return;
        setToast({ text: message, id: ++toastSeq.current });
        playDixitSound('error');
      }),
    [conn],
  );
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

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
    if (connected < DIXIT_MIN_PLAYERS) return playDixitSound('error');
    conn.sendAction({ type: 'start' });
  }

  return (
    <div className="dixit" ref={rootRef} data-button-sounds="">
      <Brushes width={1440} />
      <main className="dx-lobby">
        <h1 className="dx-logo">
          diquisti<small>sala {view.code} · cartolina~</small>
        </h1>
        <section className="dx-sheet">
          <h2>na mesa</h2>
          <ul className="dx-people">
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
          <button className="dx-btn ghost" type="button" onClick={() => void copy()}>
            {copied ? 'link copiado!' : 'copiar link da sala'}
          </button>
          {showLink && <input className="dx-link" readOnly value={link} aria-label="link da sala" onFocus={(e) => e.currentTarget.select()} />}
          <SoundPill />
        </section>
        <section className="dx-sheet">
          <h2>partida</h2>
          <p>Até quantos pontos?</p>
          <div className="dx-targets">
            {DIXIT_TARGETS.map((t) => (
              <button key={t} type="button" aria-pressed={view.game.target === t} disabled={!host} onClick={() => conn.sendAction({ type: 'setTarget', target: t })}>
                <b>{t}</b>
                {t === 30 ? 'normal (como a caixa)' : 'curta'}
              </button>
            ))}
          </div>
          {host ? (
            <button className="dx-btn" type="button" onClick={start}>
              começar
            </button>
          ) : (
            <p>esperando o host começar…</p>
          )}
          {missing && <p role="status">precisa de pelo menos {DIXIT_MIN_PLAYERS} pessoas (tem {connected})</p>}
        </section>
        <button className="dx-btn ghost dx-home" type="button" onClick={goHome}>
          voltar pro início
        </button>
        {BotControls && (
          <Suspense fallback={null}>
            <BotControls code={view.code} seats={view.seats.length} game="dixit" />
          </Suspense>
        )}
      </main>
      {toast && (
        <div key={toast.id} className="dx-toast dx-toast-lobby" role="status">
          {toast.text}
        </div>
      )}
    </div>
  );
}
