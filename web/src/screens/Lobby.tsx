import { MIN_PLAYERS, type ItoMode, type RoomView } from '@cartolina/shared';
import { isHost } from '../game/derive';
import type { GameConn } from '../net/connection';
import { Avatar } from './Avatar';

const MODES: { mode: ItoMode; title: string; text: string }[] = [
  { mode: 'livre', title: 'livre', text: '1 carta por pessoa. Acertou a ordem, ganhou. Joga quantas rodadas quiser.' },
  { mode: 'campanha', title: 'campanha', text: '3 vidas e 3 níveis (1, 2 e 3 cartas por pessoa). Cada carta fora de ordem custa uma vida.' },
];

export function Lobby({ view, conn }: { view: RoomView; conn: GameConn }) {
  const host = isHost(view);
  const connected = view.seats.filter((s) => s.connected).length;
  const link = `${window.location.origin}${window.location.pathname}#/sala/${view.code}`;
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
              <Avatar name={s.name} color={s.color} />
              <span>
                {s.name}
                {s.id === view.you ? ' (você)' : ''}
                {s.id === view.hostId ? ' · host' : ''}
              </span>
            </li>
          ))}
        </ul>
        <button className="sbtn" type="button" onClick={() => void navigator.clipboard?.writeText(link)}>
          copiar link da sala
        </button>
      </section>
      <section className="panel">
        <h2>modo</h2>
        <div className="modes">
          {MODES.map((m) => (
            <button
              key={m.mode}
              type="button"
              className={`mode ${view.game.mode === m.mode ? 'on' : ''}`}
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
    </main>
  );
}
