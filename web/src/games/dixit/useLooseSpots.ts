import type { DixitRoomView } from '@cartolina/shared';
import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { dropSpot, feltPoint, looseSpot, type Spot } from './geometry';
import { assignLoose, playedKeys, roundKeys, type LooseKey } from './loose';
import { ARRANGE_MS, type Step } from './useArrange';

/** Carta solta no feltro: lugar, altura na pilha, de quem é e se chegou sem animação (já estava lá ao abrir). */
export interface Loose {
  spot: Spot;
  z: number;
  player: string;
  quiet: boolean;
}

interface State {
  /** Por chave (`${você}:${cardId}` ou `${jogador}:${k}`). Vale até a fase de votação acabar. */
  spots: Readonly<Record<string, Loose>>;
  pile: number;
  /** Carta da votação → chave da solta que virou ela. Vale até a rodada acabar (mantém o mesmo elemento). */
  assign: Readonly<Record<string, string>> | null;
}

const EMPTY: State = { spots: {}, pile: 0, assign: null };

interface Options {
  feltRef: RefObject<HTMLElement | null>;
  view: DixitRoomView;
  pending: readonly string[];
  /** Onde você soltou cada carta sua (tela), por id da carta. */
  dropPoints: Readonly<Record<string, { x: number; y: number }>>;
  step: Step;
  /** Quanto a arrumação espera a última carta cair (avisa o `useArrange`). */
  onHold: (ms: number) => void;
}

/**
 * Lugares das cartas soltas. Sortear e medir o feltro ficam num efeito de layout (antes da pintura): a carta
 * nova aparece já no lugar dela no render seguinte. Ao fechar a escolha, completa as que faltam e decide
 * qual solta vira qual carta da votação.
 */
export function useLooseSpots({ feltRef, view, pending, dropPoints, step, onHold }: Options): State {
  const g = view.game;
  const you = view.you;
  const [state, setState] = useState<State>(EMPTY);
  const stateRef = useRef(state);
  const mounted = useRef(false);

  const wanted: LooseKey[] | null = g.phase === 'submitting' ? playedKeys(g, you, pending) : g.phase === 'voting' && step === 'hold' ? roundKeys(g, you) : null;
  // Assinatura em texto (estável): o efeito só roda quando muda o que deve estar na mesa.
  const sig = [g.phase, step ?? '', wanted?.map((k) => k.key).join(',') ?? '', g.table.map((t) => t.cardId).join(',')].join('|');

  useLayoutEffect(() => {
    const cur = stateRef.current;
    const quiet = !mounted.current;
    mounted.current = true;
    let next = cur;

    if (g.phase !== 'submitting' && g.phase !== 'voting') {
      const assign = g.phase === 'storytelling' || g.phase === 'lobby' ? null : cur.assign;
      if (Object.keys(cur.spots).length || assign !== cur.assign) next = { spots: {}, pile: 0, assign };
    } else if (wanted) {
      const spots: Record<string, Loose> = {};
      let pile = cur.pile;
      const rect = feltRef.current?.getBoundingClientRect();
      const place = (k: LooseKey): Loose => {
        const at = k.cardId !== undefined ? dropPoints[k.cardId] : undefined;
        const fp = at && rect ? feltPoint(rect, at.x, at.y) : null;
        const used = Object.values(spots).map((l) => [l.spot[0], l.spot[1]] as const);
        return { spot: fp ? dropSpot(fp, Math.random) : looseSpot(used, Math.random), z: ++pile, player: k.player, quiet };
      };
      if (g.phase === 'submitting') {
        // Mantém as que continuam (pelo id, as suas), tira a devolvida, põe as novas.
        for (const k of wanted) if (cur.spots[k.key]) spots[k.key] = cur.spots[k.key]!;
        for (const k of wanted) if (!spots[k.key]) spots[k.key] = place(k);
        const same = Object.keys(spots).length === Object.keys(cur.spots).length && Object.keys(spots).every((k) => cur.spots[k]);
        if (!same) next = { ...cur, spots, pile };
      } else if (!cur.assign) {
        // Fechou a escolha: completa as que faltam (quem jogou por último) e decide quem vira o quê.
        Object.assign(spots, cur.spots);
        let added = 0;
        for (const k of wanted) {
          if (Object.keys(spots).length >= g.table.length) break;
          if (!spots[k.key]) {
            spots[k.key] = place(k);
            added++;
          }
        }
        const assign = Object.fromEntries(assignLoose(Object.keys(spots), g.table, you, Math.random));
        next = { spots, pile, assign };
        onHold(added ? ARRANGE_MS.lastLand : 0);
      }
    }
    if (next !== cur) {
      stateRef.current = next;
      setState(next);
    }
    // O efeito usa os valores deste render (`wanted`, `g`, `dropPoints`, `onHold`); `sig` resume quando muda o que importa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  return state;
}
