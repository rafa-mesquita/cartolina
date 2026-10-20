import type { KittensRoomView } from '@cartolina/shared';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { JOIN_ERRORS, type GameConn } from '../../net/connection';
import { seedOf } from './KittensLobby';
import { createMesa, type Mesa } from './mesa';
import './kittens.css';

/**
 * A mesa do Tatubum na sala: o React só monta o <div> (tela toda, `.kittens`) e liga a "ilha" imperativa da mesa
 * (`mesa.ts`, porta do protótipo). Cada visão nova vai por `mesa.update()`; as jogadas saem por `conn.sendAction()`;
 * recusa do servidor vira o toast da mesa. O fundo do cerrado é da própria mesa (sem <Background> aqui).
 */
export function KittensTable({ view, conn, serverOffset }: { view: KittensRoomView; conn: GameConn; serverOffset: number }) {
  const root = useRef<HTMLDivElement>(null);
  const mesa = useRef<Mesa | null>(null);
  // A mesa vive enquanto a sala for a mesma: conexão e relógio entram por ref (sem recriar a mesa a cada render).
  const connRef = useRef(conn);
  const offsetRef = useRef(serverOffset);
  useLayoutEffect(() => {
    connRef.current = conn;
    offsetRef.current = serverOffset;
  });

  const code = view.code;
  useEffect(() => {
    const m = createMesa(root.current!, {
      send: (a) => connRef.current.sendAction(a),
      now: () => Date.now() + offsetRef.current,
      seed: seedOf(code),
    });
    mesa.current = m;
    return () => {
      m.destroy();
      if (mesa.current === m) mesa.current = null;
    };
  }, [code]);

  // Roda depois do efeito de cima (mesma ordem da declaração): a mesa já existe na primeira visão.
  useEffect(() => {
    mesa.current?.update({ view: view.game, you: view.you, hostId: view.hostId, seats: view.seats });
  }, [view]);

  // Recusas do servidor (que não são de entrada na sala) viram o toast da mesa, com o som de erro.
  useEffect(
    () =>
      conn.onError((errCode, message) => {
        if (JOIN_ERRORS.has(errCode)) return;
        mesa.current?.error(message);
      }),
    [conn],
  );

  return <div className="kittens" ref={root} />;
}
