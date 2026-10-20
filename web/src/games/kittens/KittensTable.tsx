import type { KittensRoomView } from '@cartolina/shared';
import type { GameConn } from '../../net/connection';
import { Background } from './Background';
import { PixelButton, seedOf } from './KittensLobby';
import './kittens.css';

/**
 * PROVISÓRIO (Plano T2 em andamento): a partida já começa de verdade no servidor, mas a mesa ainda não foi
 * portada do protótipo. Mostra só o essencial e deixa o host voltar pro lobby.
 */
export function KittensTable({ view, conn }: { view: KittensRoomView; conn: GameConn }) {
  const host = view.hostId !== null && view.hostId === view.you;
  return (
    <div className="kittens">
      <Background seed={seedOf(view.code)} />
      <main className="kt-lobby">
        <h1 className="kt-logo">TATUBUM</h1>
        <section className="kt-panel">
          <h2>A MESA ESTÁ CHEGANDO</h2>
          <p>
            A partida começou no servidor: você tem {view.game.hand.length} cartas e o monte tem {view.game.drawCount}. A mesa de jogo (a do
            protótipo, com arrastar e animações) é o próximo passo.
          </p>
          {host && <PixelButton label="VOLTAR PRO LOBBY" tone="ghost" small onClick={() => conn.sendAction({ type: 'lobby' })} />}
        </section>
      </main>
    </div>
  );
}
