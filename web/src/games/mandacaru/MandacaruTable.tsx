import type { MandacaruRoomView } from '@cartolina/shared';
import type { ConnSnapshot, GameConn } from '../../net/connection';
import { MandacaruLogo } from './art';
import './mandacaru.css';

/**
 * Mesa do Mandacaru. Por enquanto só um aviso "mesa em construção" (Task 2 do plano M2);
 * a Task 3 troca isto pela mesa de verdade com estas mesmas props.
 */
export function MandacaruTable(_props: { view: MandacaruRoomView; conn: GameConn; serverOffset: number; status: ConnSnapshot['status'] }) {
  return (
    <div className="mandacaru">
      <div className="mc-building">
        <section className="mc-sheet">
          <div className="mc-row">
            <MandacaruLogo size={48} />
            <h2>mesa em construção</h2>
          </div>
          <p>a partida começou, mas a mesa do Mandacaru ainda está sendo montada.</p>
        </section>
      </div>
    </div>
  );
}
