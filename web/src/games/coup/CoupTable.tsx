import type { CoupRoomView } from '@cartolina/shared';
import type { GameConn } from '../../net/connection';
import './coup.css';

/** Mesa do Cúpi: por enquanto só um aviso com a fase (a mesa de verdade vem nas próximas tasks do Plano C2). */
export function CoupTable({ view }: { view: CoupRoomView; conn: GameConn; serverOffset: number }) {
  return (
    <div className="coup">
      <main className="cp-lobby">
        <h1 className="cp-logo">CÚPI</h1>
        <p>mesa em construção</p>
        <p>fase: {view.game.phase}</p>
      </main>
    </div>
  );
}
