import type { DixitRoomView } from '@cartolina/shared';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Critter } from '../../screens/Critter';
import { CardArt, CardBack } from './CardArt';
import { ROMAN, dropSpot, feltPoint, looseSpot, pawnSpots, tableSlots, trackPoints, type Spot } from './geometry';
import { allKeys, assignLoose, playedKeys } from './loose';
import type { RevealFrame } from './reveal';
import { playDixitSound } from './sounds';
import type { DropState } from './useHandDrag';

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
  /** Onde você soltou cada carta sua (tela), por chave `${você}:${k}`. */
  dropPoints: Readonly<Record<string, { x: number; y: number }>>;
  /** Narrador: já tem dica (escrita ou "vou falar na call"). */
  clueReady: boolean;
  onCard: (cardId: string) => void;
  onZoom: (cardId: string) => void;
  /** Clicou numa carta sua que espera a 2ª: devolve pra mão. */
  onUnpend: (k: number) => void;
}

/** Carta solta: lugar no feltro e altura na pilha. */
interface Loose {
  spot: Spot;
  z: number;
}

/**
 * Arrumação ao fechar a escolha: `hold` (espera a última carta cair), `move` (as soltas deslizam pras casas
 * da votação) e `flip` (viram uma a uma). `null` fora dela (as cartas já estão no lugar, viradas pra cima).
 */
type Step = 'hold' | 'move' | 'flip' | null;

/** Tempos (ms) aprovados no protótipo. */
const ARRANGE_MS = { lastLand: 750, move: 820, flipStep: 120, flipSound: 300, seatFly: 680, settle: 380, seatSound: 560, settleSound: 260 };

const clamp = (v: number, a: number, b: number): number => Math.min(Math.max(v, a), b);

/** Feltro em perspectiva: trilha de casas, peões e as cartas da rodada (soltas na escolha, em fileira depois). */
export function Felt({ view, name, color, frame, scores, dropState, pending, dropPoints, clueReady, onCard, onZoom, onUnpend }: Props) {
  const g = view.game;
  const you = view.you;
  const feltRef = useRef<HTMLDivElement>(null);
  /** Lugar de cada carta solta, por chave `${jogador}:${k}` (vale até a fase de votação acabar). */
  const spots = useRef(new Map<string, Loose>());
  const pile = useRef(0);
  /** Carta da votação → chave da solta que virou ela (mantém o mesmo elemento até a rodada acabar). */
  const assign = useRef(new Map<string, string>());
  const holdMs = useRef(0);
  /** Soltas que já pousaram (a animação de chegada roda uma vez só). */
  const landed = useRef(new Set<string>());
  const mounted = useRef(false);
  const timers = useRef<number[]>([]);

  // Fase anterior guardada no estado: ao passar da escolha pra votação, a arrumação começa já neste render.
  const [phaseSeen, setPhaseSeen] = useState(g.phase);
  const [stepState, setStep] = useState<Step>(null);
  let step = stepState;
  if (phaseSeen !== g.phase) {
    step = phaseSeen === 'submitting' && g.phase === 'voting' ? 'hold' : null;
    setPhaseSeen(g.phase);
    setStep(step);
  }

  if (g.phase !== 'submitting' && g.phase !== 'voting') {
    spots.current.clear();
    landed.current.clear();
    pile.current = 0;
  }
  if (g.phase === 'storytelling' || g.phase === 'lobby') assign.current.clear();

  /** Lugar da carta solta `key`: a sua onde você soltou; sem ponto (ou dos outros), longe das que já estão lá. */
  const spotFor = (key: string, player: string): Loose => {
    const known = spots.current.get(key);
    if (known) return known;
    const at = player === you ? dropPoints[key] : undefined;
    const rect = at ? feltRef.current?.getBoundingClientRect() : undefined;
    const fp = at && rect ? feltPoint(rect, at.x, at.y) : null;
    const used = [...spots.current.values()].map((l) => [l.spot[0], l.spot[1]] as const);
    const loose = { spot: fp ? dropSpot(fp, Math.random) : looseSpot(used, Math.random), z: ++pile.current };
    spots.current.set(key, loose);
    return loose;
  };

  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  };
  useEffect(
    () => () => {
      timers.current.forEach((t) => clearTimeout(t));
      timers.current = [];
    },
    [],
  );

  const cells = useMemo(() => trackPoints(g.target + 1), [g.target]);
  const pawns = pawnSpots(g.players, scores, cells);
  const faceUpPhase = g.phase === 'voting' || g.phase === 'reveal' || g.phase === 'gameover';
  const r = g.result;
  const over = g.phase === 'gameover';
  const votes = frame ? frame.votes : over && r ? Object.entries(r.votes).map(([voter, card]) => ({ voter, card })) : [];
  const owners = frame ? frame.owners : over && r ? r.table : [];
  const storyMarked = frame ? frame.storyMarked : over;
  const spotlight = !!frame?.spot;
  const myTurnToTell = g.phase === 'storytelling' && g.storyteller !== null && g.storyteller === you;
  const message = g.paused
    ? 'esperando gente: precisa de 3 pessoas na mesa'
    : g.phase === 'storytelling' && g.storyteller
      ? myTurnToTell
        ? clueReady
          ? 'arraste pra cá a carta da sua dica'
          : 'primeiro a dica: escreva ou marque “vou falar na call”'
        : `${name(g.storyteller)} está escolhendo a carta…`
      : null;

  let cards: ReactNode[] = [];
  if (g.phase === 'submitting') {
    const keys = playedKeys(g, you, pending.length);
    const wanted = new Set(keys.map((k) => k.key));
    // Carta devolvida pra mão (partida de 3) sai da mesa.
    for (const k of [...spots.current.keys()]) {
      if (!wanted.has(k)) {
        spots.current.delete(k);
        landed.current.delete(k);
      }
    }
    const minePending = you !== null && you !== g.storyteller && !g.confirmed.includes(you);
    cards = keys.map(({ key, player }) => {
      const { spot, z } = spotFor(key, player);
      const k = Number(key.slice(key.lastIndexOf(':') + 1));
      const canUndo = minePending && player === you;
      return (
        <div
          key={key}
          className={`dx-tcard loose down${canUndo ? ' pending' : ''}`}
          style={{ left: spot[0], top: spot[1], zIndex: 3 + z, '--rz': `${spot[2]}deg` } as CSSProperties}
          data-loose={key}
          {...(canUndo ? { role: 'button', tabIndex: 0, 'aria-label': 'devolver sua carta pra mão', onClick: () => onUnpend(k) } : {})}
        >
          <div className="dx-flip">
            <div className="dx-face dx-backside">
              <CardBack />
            </div>
          </div>
        </div>
      );
    });
  } else if (faceUpPhase) {
    // Fechou a escolha agora: completa as soltas que faltam (quem jogou por último) e decide quem vira o quê.
    if (step && assign.current.size === 0) {
      const before = spots.current.size;
      for (const { key, player } of allKeys(g)) {
        if (spots.current.size >= g.table.length) break;
        if (!spots.current.has(key)) spotFor(key, player);
      }
      holdMs.current = spots.current.size > before ? ARRANGE_MS.lastLand : 0;
      assign.current = assignLoose([...spots.current.keys()], g.table, you, Math.random);
    }
    const slots = tableSlots(g.table.length);
    const faceDown = step === 'hold' || step === 'move';
    cards = g.table.map((t, i) => {
      const [sx, sy] = slots[i]!;
      const looseKey = assign.current.get(t.cardId);
      const loose = looseKey !== undefined ? spots.current.get(looseKey) : undefined;
      const lying = step === 'hold' && !!loose;
      const [x, y, rz] = lying && loose ? loose.spot : [sx, sy, 0];
      const isStory = storyMarked && r?.storyCard === t.cardId;
      const tokens = votes.filter((v) => v.card === t.cardId);
      const owner = r && owners.includes(t.cardId) ? r.owners[t.cardId] : undefined;
      const cls = [
        'dx-tcard',
        lying && 'loose',
        step === 'move' && 'gather',
        faceDown && 'down',
        g.phase === 'voting' && !faceDown && 'flip-in',
        g.phase === 'voting' && g.myVote === t.cardId && 'voted',
        isStory && 'story',
        isStory && spotlight && 'spot',
        spotlight && !isStory && 'dim',
      ]
        .filter(Boolean)
        .join(' ');
      return (
        <div
          key={looseKey ?? t.cardId}
          className={cls}
          style={{ left: x, top: y, zIndex: lying && loose ? 3 + loose.z : undefined, '--rz': `${rz}deg`, '--i': i } as CSSProperties}
          role="button"
          tabIndex={0}
          aria-label={`carta ${ROMAN[i]}`}
          data-card-id={t.cardId}
          data-zoom="table"
          data-loose={looseKey !== undefined && g.phase === 'voting' ? looseKey : undefined}
          onClick={() => {
            if (!faceDown) onCard(t.cardId);
          }}
          onDoubleClick={() => {
            if (!faceDown) onZoom(t.cardId);
          }}
        >
          <div className="dx-flip">
            <div className="dx-face">
              <CardArt id={t.cardId} />
              {t.mine && !owner && <span className="dx-mine">sua</span>}
              {tokens.length > 0 && (
                <div className="dx-tokens">
                  {tokens.map((v) => (
                    <span key={v.voter} title={name(v.voter)}>
                      <Critter color={color(v.voter)} />
                    </span>
                  ))}
                </div>
              )}
              {owner && (
                <div className={`dx-owner${owner === you ? ' me' : ''}`}>
                  <Critter color={color(owner)} />
                  {owner === you ? 'você' : name(owner)}
                </div>
              )}
            </div>
            <div className="dx-face dx-backside">
              <CardBack />
            </div>
          </div>
          {isStory && <div className="dx-tag-story">carta do narrador</div>}
          <div className="dx-roman">{ROMAN[i]}</div>
          {!faceDown && (
            <button
              type="button"
              className="dx-zoom"
              aria-label="ampliar"
              onClick={(e) => {
                e.stopPropagation();
                onZoom(t.cardId);
              }}
            >
              ⤢
            </button>
          )}
        </div>
      );
    });
  }

  // A arrumação anda sozinha: espera a última cair, desliza, vira (com o som de cada carta).
  const tableLen = g.table.length;
  useEffect(() => {
    if (stepState === 'hold') {
      const t = window.setTimeout(() => setStep('move'), holdMs.current);
      return () => clearTimeout(t);
    }
    if (stepState === 'move') {
      const t = window.setTimeout(() => setStep('flip'), ARRANGE_MS.move);
      return () => clearTimeout(t);
    }
    if (stepState === 'flip') {
      const ts = Array.from({ length: tableLen }, (_, i) => window.setTimeout(() => playDixitSound('flip', i), ARRANGE_MS.flipSound + ARRANGE_MS.flipStep * i));
      return () => ts.forEach((t) => clearTimeout(t));
    }
    return undefined;
  }, [stepState, tableLen]);

  // Chegada das soltas novas: a dos outros voa do assento; a sua só assenta. As que já estavam ao montar só aparecem.
  useLayoutEffect(() => {
    const felt = feltRef.current;
    if (!felt) return;
    const rect = felt.getBoundingClientRect();
    for (const el of felt.querySelectorAll<HTMLElement>('[data-loose]')) {
      const key = el.dataset.loose!;
      if (landed.current.has(key)) continue;
      landed.current.add(key);
      if (!mounted.current) continue;
      const player = key.slice(0, key.lastIndexOf(':'));
      const rz = parseFloat(el.style.getPropertyValue('--rz')) || 0;
      const seat = player !== you ? [...document.querySelectorAll<HTMLElement>('[data-seat]')].find((s) => s.dataset.seat === player) : undefined;
      let dx = 0, dy = 0, z = 70, spin = rz - 6;
      if (seat) {
        const s = seat.getBoundingClientRect();
        const fp = feltPoint(rect, s.left + s.width / 2, s.top + s.height / 2);
        if (fp) {
          dx = clamp(fp[0], -120, 1120) - parseFloat(el.style.left);
          dy = clamp(fp[1], -120, 640) - parseFloat(el.style.top);
        }
        z = 150;
        spin = rz - 30;
      }
      el.animate?.(
        [
          { transform: `translate(-50%,-100%) translate(${dx}px,${dy}px) translateZ(${z}px) rotateZ(${spin}deg) rotateX(calc(var(--tilt) * -.6))`, opacity: seat ? 0 : 1, offset: 0 },
          { opacity: 1, offset: 0.3 },
        ],
        { duration: seat ? ARRANGE_MS.seatFly : ARRANGE_MS.settle, easing: 'cubic-bezier(.2,.9,.3,1)' },
      );
      later(seat ? ARRANGE_MS.seatSound : ARRANGE_MS.settleSound, () => playDixitSound('land'));
    }
    mounted.current = true;
  });

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
          return (
            <div key={p} className="dx-pawn" style={{ left: at[0], top: at[1], zIndex: 10 + Math.round(at[1]) }} title={`${name(p)}: ${g.scores[p] ?? 0} pontos`} aria-label={`${name(p)}: ${g.scores[p] ?? 0} pontos`}>
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
