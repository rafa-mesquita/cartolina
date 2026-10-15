import { MIN_PLAYERS, type ItoMode, type RoomView } from '@cartolina/shared';
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { isHost } from '../game/derive';
import { roomLink } from '../lib/router';
import type { GameConn } from '../net/connection';
import { Avatar } from './Avatar';
import { SoundToggle } from './SoundToggle';

/** Bots para testar sozinho: só existe em dev; em produção o import some e o código não vai pro bundle. */
const BotControls = import.meta.env.DEV ? lazy(() => import('../dev/BotControls')) : null;

const MODES: { mode: ItoMode; title: string; text: string }[] = [
  { mode: 'livre', title: 'livre', text: '1 carta por pessoa. Acertou a ordem, ganhou. Joga quantas rodadas quiser.' },
  { mode: 'campanha', title: 'campanha', text: '3 vidas e 3 níveis (1, 2 e 3 cartas por pessoa). Cada carta fora de ordem custa uma vida.' },
];

export function Lobby({ view, conn }: { view: RoomView; conn: GameConn }) {
  const host = isHost(view);
  const connected = view.seats.filter((s) => s.connected).length;
  const [copied, setCopied] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const linkInput = useRef<HTMLInputElement>(null);
  // seleciona o link uma vez quando o campo aparece (e de novo no foco), não a cada render
  useEffect(() => {
    if (showLink) linkInput.current?.select();
  }, [showLink]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const link = roomLink(view.code);
  async function copyLink() {
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
    <main className="screen">
      <h1 className="logo">
        cartolina<span>~</span>
      </h1>
      <section className="panel">
        <h2>sala {view.code}</h2>
        <ul className="seat-list">
          {view.seats.map((s) => (
            <li key={s.id} className={s.connected ? '' : 'off'}>
              <Avatar color={s.color} />
              <span>
                {s.name}
                {s.id === view.you ? ' (você)' : ''}
                {s.id === view.hostId ? ' · host' : ''}
              </span>
            </li>
          ))}
        </ul>
        <button className="sbtn" type="button" onClick={() => void copyLink()}>
          {copied ? 'link copiado!' : 'copiar link da sala'}
        </button>
        <SoundToggle />
        {showLink && (
          <input
            className="text-in"
            readOnly
            value={link}
            aria-label="link da sala"
            onFocus={(e) => e.currentTarget.select()}
            ref={linkInput}
          />
        )}
        {view.group && (
          <a className="sbtn" href={`#/g/${view.group.slug}`} target="_blank" rel="noopener">
            📜 histórico de {view.group.name}
          </a>
        )}
      </section>
      <section className="panel">
        <h2>modo</h2>
        <div className="modes">
          {MODES.map((m) => (
            <button
              key={m.mode}
              type="button"
              className={`mode ${view.game.mode === m.mode ? 'on' : ''}`}
              aria-pressed={view.game.mode === m.mode}
              disabled={!host}
              onClick={() => conn.sendAction({ type: 'setMode', mode: m.mode })}
            >
              <b>{m.title}</b>
              <span>{m.text}</span>
            </button>
          ))}
        </div>
        {host ? (
          <button className="btn" type="button" disabled={connected < MIN_PLAYERS} onClick={() => conn.sendAction({ type: 'start' })}>
            começar
          </button>
        ) : (
          <p className="hint">esperando o host começar…</p>
        )}
      </section>
      {BotControls && (
        <Suspense fallback={null}>
          <BotControls code={view.code} seats={view.seats.length} />
        </Suspense>
      )}
    </main>
  );
}
