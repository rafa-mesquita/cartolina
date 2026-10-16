import type { DixitRoomView } from '@cartolina/shared';
import { useMemo, useRef, type ReactNode } from 'react';
import { Critter } from '../../screens/Critter';
import { LooseCard, TableCard } from './FeltCards';
import { pawnSpots, tableSlots, trackPoints } from './geometry';
import { playedKeys } from './loose';
import type { RevealFrame } from './reveal';
import { useArrange } from './useArrange';
import type { DropState } from './useHandDrag';
import { useLooseArrival } from './useLooseArrival';
import { useLooseSpots } from './useLooseSpots';

interface Props {
  view: DixitRoomView;
  name: (id: string) => string;
  color: (id: string) => string;
  /** Quadro da revelação (null fora dela). */
  frame: RevealFrame | null;
  /** Pontos que os peões mostram (andam pulo a pulo na revelação). */
  scores: Readonly<Record<string, number>>;
  /** Estado do feltro durante o arrasto (classe no `.dx-felt`). */
  dropState: DropState;
  /** Suas cartas que esperam a 2ª (partida de 3), em ordem. */
  pending: readonly string[];
  /** Onde você soltou cada carta sua (tela), por id da carta. */
  dropPoints: Readonly<Record<string, { x: number; y: number }>>;
  /** Narrador: já tem dica (escrita ou "vou falar na call"). */
  clueReady: boolean;
  onCard: (cardId: string) => void;
  onZoom: (cardId: string) => void;
  /** Clicou numa carta sua que espera a 2ª: devolve pra mão. */
  onUnpend: (cardId: string) => void;
}

/** Feltro em perspectiva: trilha de casas, peões e as cartas da rodada (soltas na escolha, em fileira depois). */
export function Felt({ view, name, color, frame, scores, dropState, pending, dropPoints, clueReady, onCard, onZoom, onUnpend }: Props) {
  const g = view.game;
  const you = view.you;
  const feltRef = useRef<HTMLDivElement>(null);
  const { step, setHoldMs } = useArrange(g.phase, g.table.length);
  const { spots, assign } = useLooseSpots({ feltRef, view, pending, dropPoints, step, onHold: setHoldMs });
  useLooseArrival(feltRef, spots, you);

  const cells = useMemo(() => trackPoints(g.target + 1), [g.target]);
  const pawns = pawnSpots(g.players, scores, cells);
  const r = g.result;
  const over = g.phase === 'gameover';
  const votes = frame ? frame.votes : over && r ? Object.entries(r.votes).map(([voter, card]) => ({ voter, card })) : [];
  const owners = frame ? frame.owners : over && r ? r.table : [];
  const storyMarked = frame ? frame.storyMarked : over;
  const spotlight = !!frame?.spot;
  const message = g.paused
    ? 'esperando gente: precisa de 3 pessoas na mesa'
    : g.phase === 'storytelling' && g.storyteller
      ? g.storyteller === you
        ? clueReady
          ? 'arraste pra cá a carta da sua dica'
          : 'primeiro a dica: escreva ou marque “vou falar na call”'
        : `${name(g.storyteller)} está escolhendo a carta…`
      : null;

  let cards: ReactNode = null;
  if (g.phase === 'submitting') {
    const canUndo = you !== null && you !== g.storyteller && !g.confirmed.includes(you);
    // Só as que já têm lugar (a nova ganha o dela no efeito de layout, antes de pintar).
    cards = playedKeys(g, you, pending).map(({ key, player, cardId }) => {
      const loose = spots[key];
      if (!loose) return null;
      return <LooseCard key={key} looseKey={key} loose={loose} onUndo={canUndo && player === you && cardId !== undefined ? () => onUnpend(cardId) : undefined} />;
    });
  } else if ((g.phase === 'voting' || g.phase === 'reveal' || g.phase === 'gameover') && !(step === 'hold' && !assign)) {
    // (Na 1ª passada da arrumação ainda não se sabe qual solta vira qual carta: nada até o efeito decidir.)
    const slots = tableSlots(g.table.length);
    const faceDown = step === 'hold' || step === 'move';
    cards = g.table.map((t, i) => {
      const looseKey = assign?.[t.cardId];
      const loose = looseKey !== undefined ? spots[looseKey] : undefined;
      const lying = step === 'hold' && loose ? loose : null;
      const [sx, sy] = slots[i]!;
      const owner = r && owners.includes(t.cardId) ? r.owners[t.cardId] : undefined;
      return (
        <TableCard
          key={looseKey ?? t.cardId}
          cardId={t.cardId}
          index={i}
          at={lying ? lying.spot : [sx, sy, 0]}
          lying={lying}
          looseKey={g.phase === 'voting' ? looseKey : undefined}
          gather={step === 'move'}
          faceDown={faceDown}
          flipIn={g.phase === 'voting' && !faceDown}
          voted={g.phase === 'voting' && g.myVote === t.cardId}
          mine={t.mine}
          story={storyMarked && r?.storyCard === t.cardId}
          spotlight={spotlight}
          tokens={votes.filter((v) => v.card === t.cardId).map((v) => ({ voter: v.voter, color: color(v.voter), name: name(v.voter) }))}
          owner={owner ? { color: color(owner), name: owner === you ? 'você' : name(owner), me: owner === you } : null}
          onCard={onCard}
          onZoom={onZoom}
        />
      );
    });
  }

  return (
    <div className="dx-felt-wrap">
      <div ref={feltRef} className={`dx-felt${dropState ? ` drop-${dropState}` : ''}`}>
        {cells.map(([x, y], i) => (
          <div key={i} className={`dx-cell${i % 5 === 0 ? ' five' : ''}${i === g.target ? ' goal' : ''}`} style={{ left: x, top: y }}>
            {i % 5 === 0 || i === g.target ? i : ''}
          </div>
        ))}
        {g.players.map((p) => {
          const at = pawns[p];
          if (!at) return null;
          const label = `${name(p)}: ${g.scores[p] ?? 0} pontos`;
          return (
            <div key={p} className="dx-pawn" role="img" style={{ left: at[0], top: at[1], zIndex: 10 + Math.round(at[1]) }} title={label} aria-label={label}>
              <Critter color={color(p)} />
            </div>
          );
        })}
        {message && <div className="dx-felt-msg">{message}</div>}
        {cards}
      </div>
    </div>
  );
}
