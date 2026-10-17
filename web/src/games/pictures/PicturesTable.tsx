import type { PicturesRoomView } from '@cartolina/shared';
import type { GameConn } from '../../net/connection';
import './pictures.css';

/** Mesa do Retratim. Provisória: a mesa de verdade chega na Task 6 do Plano R2. */
export function PicturesTable(_props: { view: PicturesRoomView; conn: GameConn; serverOffset: number }) {
  return (
    <div className="pictures">
      <div className="pc-building-site">mesa em construção</div>
    </div>
  );
}
