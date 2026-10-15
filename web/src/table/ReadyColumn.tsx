import type { RoomView } from '@cartolina/shared';
import { allMineInRow, isHost, isPlaying, readyCount } from '../game/derive';
import type { GameConn } from '../net/connection';
import type { EngineSnapshot } from './engine';
import { ThemePanel } from './ThemePanel';

export function ReadyColumn({ view, snap, conn }: { view: RoomView; snap: EngineSnapshot; conn: GameConn }) {
  const { phase } = view.game;
  if (phase === 'theme') {
    // o host escolhe o tema aqui embaixo (a mão ainda está vazia), sem cobrir o tema no feltro
    if (isHost(view)) return <ThemePanel view={view} conn={conn} />;
    return (
      <div className="ready-col">
        <p className="ready-hint">o host tá escolhendo o tema…</p>
      </div>
    );
  }
  if (snap.revealing) {
    return (
      <div className="ready-col">
        <button className="btn" type="button" disabled>
          revelando…
        </button>
      </div>
    );
  }
  if (phase === 'reveal') {
    return (
      <div className="ready-col">
        <p className="ready-hint">rodada revelada</p>
      </div>
    );
  }
  if (!isPlaying(view)) {
    return (
      <div className="ready-col">
        <p className="ready-hint">você tá assistindo essa rodada</p>
      </div>
    );
  }
  const me = view.you!;
  const iAmReady = view.game.ready.includes(me);
  const placed = allMineInRow(view, snap.row);
  const { ready, total } = readyCount(view);
  const hint = !placed
    ? 'bota suas cartas na fila'
    : iAmReady
      ? `esperando a galera (${ready}/${total})… clica pra desfazer`
      : `${ready}/${total} prontos`;
  return (
    <div className="ready-col">
      <button
        className={`btn ${iAmReady ? 'ready' : ''}`}
        type="button"
        disabled={!placed}
        onClick={() => conn.sendAction({ type: 'ready', ready: !iAmReady })}
      >
        {iAmReady ? 'pronto ✓' : 'tô pronto'}
      </button>
      <p className="ready-hint">{hint}</p>
    </div>
  );
}
