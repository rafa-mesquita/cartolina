import { MANDACARU_MAX_PLAYERS, MANDACARU_MIN_PLAYERS, type MandacaruRoomView } from '@cartolina/shared';
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { goHome, roomLink } from '../../lib/router';
import { JOIN_ERRORS, type GameConn } from '../../net/connection';
import { Critter } from '../../screens/Critter';
import { catalogEntry } from '../catalog';
import { SoundPill } from '../dixit/DixitTopBar';
import { useToast } from '../dixit/useToast';
import { MandacaruLogo } from './art';
import { installMandacaruAudioUnlock, playMandacaruSound } from './sounds';
import './mandacaru.css';

/** Bots para testar sozinho: só existe em dev; em produção o import some e o código não vai pro bundle. */
const BotControls = import.meta.env.DEV ? lazy(() => import('../../dev/BotControls')) : null;

const TOAST_MS = 3200;
/** "começar" destrava sozinho depois disso (ms), se nem a mesa nem uma recusa chegarem (o mesmo teto da mesa). */
const START_UNLOCK_MS = 4000;

/** Lobby do Mandacaru (estilo D, caatinga ao sol): quem está na mesa, como jogar e começar. */
export function MandacaruLobby({ view, conn }: { view: MandacaruRoomView; conn: GameConn }) {
  const host = view.hostId !== null && view.hostId === view.you;
  const connected = view.seats.filter((s) => s.connected).length;
  const enough = connected >= MANDACARU_MIN_PLAYERS && connected <= MANDACARU_MAX_PLAYERS;
  const full = view.seats.length >= MANDACARU_MAX_PLAYERS;
  // a sala não deixa entrar mais que 4; se ainda assim alguém ficou além da 4ª cadeira, só assiste
  const watching = view.you !== null && view.seats.findIndex((s) => s.id === view.you) >= MANDACARU_MAX_PLAYERS;
  const rules = catalogEntry('mandacaru')?.rules ?? [];
  const [copied, setCopied] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const { toast, say } = useToast(TOAST_MS);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  useEffect(() => installMandacaruAudioUnlock(), []);
  const link = roomLink(view.code);

  // "começar" trava depois do clique (clique duplo = um start só): a mesa troca de tela quando a fase muda; uma recusa
  // ou o teto de alguns segundos destravam.
  const [starting, setStarting] = useState(false);
  useEffect(() => {
    if (!starting) return undefined;
    const t = setTimeout(() => setStarting(false), START_UNLOCK_MS);
    return () => clearTimeout(t);
  }, [starting]);
  function start() {
    if (starting) return;
    setStarting(true);
    conn.sendAction({ type: 'start' });
  }

  // Recusas do servidor (que não são de entrada na sala) viram aviso na tela.
  useEffect(
    () =>
      conn.onError((code, message) => {
        if (JOIN_ERRORS.has(code)) return;
        setStarting(false);
        say(message);
        playMandacaruSound('error');
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

  return (
    <div className="mandacaru">
      <main className="mc-lobby">
        <header className="mc-head">
          <MandacaruLogo size={64} />
          <div>
            <h1>Mandacaru</h1>
            <div className="mc-sub">faça a caatinga florir</div>
          </div>
          <div className="mc-room">
            sala
            <br />
            <b className="mc-code">{view.code}</b>
          </div>
        </header>
        <section className="mc-sheet">
          <h2>na mesa</h2>
          <ul className="mc-people">
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
          {full && <p className="mc-note">{`a mesa está cheia (${view.seats.length})`}</p>}
          {watching && <p className="mc-note">a mesa é de até {MANDACARU_MAX_PLAYERS}: você assiste esta partida</p>}
          <div className="mc-row">
            <button className="mc-btn sec" type="button" onClick={() => void copy()}>
              {copied ? 'link copiado!' : 'copiar link da sala'}
            </button>
            <SoundPill />
          </div>
          {showLink && <input className="mc-link" readOnly value={link} aria-label="link da sala" onFocus={(e) => e.currentTarget.select()} />}
        </section>
        <section className="mc-sheet">
          <h2>como jogar</h2>
          <ul className="mc-rules">
            {rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>
        <section className="mc-sheet">
          {host ? (
            <button className="mc-btn grande" type="button" disabled={!enough || starting} onClick={start}>
              começar
            </button>
          ) : (
            <p>esperando o anfitrião começar…</p>
          )}
          {!enough && (
            <p className="mc-warn">
              precisa de {MANDACARU_MIN_PLAYERS} a {MANDACARU_MAX_PLAYERS} pessoas (tem {connected})
            </p>
          )}
        </section>
        <button className="mc-btn sec mc-home" type="button" onClick={goHome}>
          voltar pro início
        </button>
        {BotControls && (
          <Suspense fallback={null}>
            <BotControls code={view.code} seats={view.seats.length} game="mandacaru" />
          </Suspense>
        )}
      </main>
      <div role="status" aria-live="polite">
        {toast && (
          <div key={toast.id} className="mc-toast">
            {toast.text}
          </div>
        )}
      </div>
    </div>
  );
}
