import { KITTENS_MAX_PLAYERS, KITTENS_MIN_PLAYERS, type KittensRoomView } from '@cartolina/shared';
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { goHome, roomLink } from '../../lib/router';
import { JOIN_ERRORS, type GameConn } from '../../net/connection';
import { loadSoundPref, saveSoundPref } from '../../net/identity';
import { useToast } from '../dixit/useToast';
import { Background } from './Background';
import { PixelCritter } from './PixelCritter';
import './kittens.css';

/**
 * Bots (modo teste), também no site no ar: completam a mesa quando tem pouca gente. O código só baixa ao abrir o
 * lobby; os bots rodam no navegador do host e entram pelo mesmo servidor do site.
 */
const BotControls = lazy(() => import('../../dev/BotControls'));

const TOAST_MS = 3200;

/** Semente do cerrado por sala: todo mundo da mesma sala vê o mesmo cerrado. */
export function seedOf(code: string): number {
  let h = 2166136261;
  for (const ch of code) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Botão chanfrado em pixel art. */
export function PixelButton({ label, onClick, tone = '', small = false }: { label: string; onClick(): void; tone?: '' | 'yellow' | 'ghost'; small?: boolean }) {
  return (
    <button className={`kt-btn ${tone} ${small ? 'small' : ''}`} type="button" onClick={onClick}>
      <span>{label}</span>
    </button>
  );
}

/** Liga/desliga o som (a mesma preferência dos outros jogos). */
function SoundToggle() {
  const [on, setOn] = useState(loadSoundPref);
  return (
    <button
      className="kt-pill"
      type="button"
      aria-pressed={on}
      onClick={() => {
        saveSoundPref(!on);
        setOn(!on);
      }}
    >
      SOM: {on ? 'LIGADO' : 'DESLIGADO'}
    </button>
  );
}

/** Lobby do Tatubum (id interno `kittens`): quem está na mesa, link da sala e "começar" (só o host). */
export function KittensLobby({ view, conn }: { view: KittensRoomView; conn: GameConn }) {
  const host = view.hostId !== null && view.hostId === view.you;
  const connected = view.seats.filter((s) => s.connected).length;
  const [copied, setCopied] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [tried, setTried] = useState(false);
  const { toast, say } = useToast(TOAST_MS);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const link = roomLink(view.code);
  const missing = tried && connected < KITTENS_MIN_PLAYERS;

  // Recusas do servidor (que não são de entrada na sala) viram aviso na tela.
  useEffect(
    () =>
      conn.onError((code, message) => {
        if (JOIN_ERRORS.has(code)) return;
        say(message);
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
    if (connected < KITTENS_MIN_PLAYERS) return;
    conn.sendAction({ type: 'start' });
  }

  return (
    <div className="kittens">
      <Background seed={seedOf(view.code)} />
      <main className="kt-lobby">
        <h1 className="kt-logo">TATUBUM</h1>
        <p className="kt-sub">sala {view.code} · cartolina~</p>
        <section className="kt-panel">
          <h2>NA MESA</h2>
          <ul className="kt-people">
            {view.seats.map((s) => (
              <li key={s.id} className={s.connected ? '' : 'off'}>
                <PixelCritter color={s.color} />
                <span className="who">{s.name}</span>
                <span className="kt-tag">
                  {s.id === view.you ? 'você' : ''}
                  {s.id === view.you && s.id === view.hostId ? ' · ' : ''}
                  {s.id === view.hostId ? 'host' : ''}
                </span>
              </li>
            ))}
          </ul>
          <div className="kt-row">
            <PixelButton label={copied ? 'LINK COPIADO!' : 'COPIAR LINK DA SALA'} tone="ghost" small onClick={() => void copy()} />
            <SoundToggle />
          </div>
          {showLink && <input className="kt-link" readOnly value={link} aria-label="link da sala" onFocus={(e) => e.currentTarget.select()} />}
        </section>
        <section className="kt-panel">
          <h2>PARTIDA</h2>
          <p>
            Todo mundo compra do mesmo monte. Quem comprar o Tatubum sem Desarme explode. De {KITTENS_MIN_PLAYERS} a {KITTENS_MAX_PLAYERS}{' '}
            pessoas.
          </p>
          <div className="kt-row">
            {host ? <PixelButton label="COMEÇAR" tone="yellow" onClick={start} /> : <p>esperando o host começar…</p>}
            <PixelButton label="VOLTAR PRO INÍCIO" tone="ghost" small onClick={goHome} />
          </div>
          {missing && (
            <p className="kt-warn" role="status">
              precisa de pelo menos {KITTENS_MIN_PLAYERS} pessoas (tem {connected})
            </p>
          )}
        </section>
        {host && (
          <Suspense fallback={null}>
            <BotControls code={view.code} seats={view.seats.length} game="kittens" max={KITTENS_MAX_PLAYERS} />
          </Suspense>
        )}
      </main>
      <div role="status" aria-live="polite">
        {toast && (
          <div key={toast.id} className="kt-toast">
            {toast.text}
          </div>
        )}
      </div>
    </div>
  );
}
