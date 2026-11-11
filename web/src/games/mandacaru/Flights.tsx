import { mandacaruGeometry } from '@cartolina/shared';
import { memo, useLayoutEffect, useRef, useState } from 'react';
import { ResIcon, at } from './art';
import { arcPoint, type Flight } from './rollFlights';

/** Quanto cada carta leva no ar (ms). */
export const FLY_MS = 780;
/** Espaço entre a saída de uma carta e a da próxima (ms), encolhido se forem muitas. */
const STAGGER_MS = 110;
/** A saída da última carta nunca passa disso (ms). */
const MAX_STAGGER_MS = 700;
/** Cartas desenhadas por voo, no máximo (uma vila dá 2; com Chuva/Atravessador ninguém voa). */
const MAX_CARDS = 4;
/** Tamanho da cartinha que voa (px do palco). */
const CARD_W = 44;
const CARD_H = 56;
const STEPS = 12;

interface Props {
  flights: Flight[];
  /** Quem vê: as cartas dele vão pra mão embaixo; as dos outros, pra casinha deles na coluna da esquerda. */
  me: string | null;
}

interface Card {
  i: number;
  f: Flight;
  delay: number;
}

/** As cartas de cada voo, com a hora de saída (em fila). */
function cardsOf(flights: Flight[]): Card[] {
  const list: Omit<Card, 'delay'>[] = [];
  for (const f of flights) for (let k = 0; k < Math.min(f.n, MAX_CARDS); k++) list.push({ i: list.length, f });
  const step = list.length > 1 ? Math.min(STAGGER_MS, MAX_STAGGER_MS / (list.length - 1)) : 0;
  return list.map((c) => ({ ...c, delay: Math.round(c.i * step) }));
}

type XY = { x: number; y: number };
const center = (r: DOMRect): XY => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

/**
 * Camada por cima do palco (`pointer-events: none`, não mexe no layout) com as cartinhas de recurso voando em arco do
 * terreno que produziu pra quem ganhou. Monta já com as posições medidas na tela (tabuleiro, mão, assentos) e anima pelo
 * WAAPI; some sozinha por um `setTimeout` (o `finished` do WAAPI pode não resolver com a aba escondida). Sem `animate`
 * (testes), as cartas ficam paradas e invisíveis até sumir.
 */
export const Flights = memo(function Flights({ flights, me }: Props) {
  const layer = useRef<HTMLDivElement>(null);
  const [cards] = useState(() => cardsOf(flights));
  const [done, setDone] = useState(cards.length === 0);

  useLayoutEffect(() => {
    if (cards.length === 0) return undefined;
    const total = (cards[cards.length - 1]?.delay ?? 0) + FLY_MS + 150;
    const timer = setTimeout(() => setDone(true), total);
    const el = layer.current;
    const app = el?.parentElement;
    const anims: Animation[] = [];
    if (el && app && typeof el.animate === 'function') {
      const box = el.getBoundingClientRect();
      const k = el.offsetWidth > 0 && box.width > 0 ? box.width / el.offsetWidth : 1;
      const local = (p: XY): XY => ({ x: (p.x - box.left) / k, y: (p.y - box.top) / k });
      const svg = app.querySelector<SVGSVGElement>('svg.mc-board');
      const ctm = svg?.getScreenCTM?.() ?? null;
      const geo = mandacaruGeometry();
      const origin = (h: number): XY | null => {
        const p = at(geo.hexes[h]!);
        if (ctm) return local({ x: ctm.a * p.x + ctm.c * p.y + ctm.e, y: ctm.b * p.x + ctm.d * p.y + ctm.f });
        const hex = app.querySelector(`[data-hex="${h}"]`);
        return hex ? local(center(hex.getBoundingClientRect())) : null;
      };
      const target = (f: Flight): Element | null =>
        f.player === me
          ? app.querySelector(`.mc-hand .mc-carta[data-res="${f.resource}"]`)
          : app.querySelector(`.mc-seat[data-seat="${f.player}"] .mc-seat-house`);
      for (const c of cards) {
        const node = el.querySelector<HTMLElement>(`[data-voo-i="${c.i}"]`);
        const from = origin(c.f.hex);
        const dest = target(c.f);
        if (!node || !from || !dest) continue;
        const to = local(center(dest.getBoundingClientRect()));
        // cada carta com um tiquinho de desvio e de giro, pra não voarem uma em cima da outra
        const jitter = ((c.i % 3) - 1) * 7;
        const spin = ((c.i % 2) * 2 - 1) * 14;
        const frames: Keyframe[] = [];
        for (let s = 0; s <= STEPS; s++) {
          const t = s / STEPS;
          const p = arcPoint({ x: from.x + jitter, y: from.y }, to, t);
          const scale = t < 0.5 ? 0.55 + t * 1.2 : 1.15 - (t - 0.5) * 0.7;
          const opacity = t < 0.1 ? t * 10 : t > 0.92 ? (1 - t) * 10 + 0.2 : 1;
          frames.push({
            offset: t,
            opacity,
            transform: `translate(${(p.x - CARD_W / 2).toFixed(1)}px, ${(p.y - CARD_H / 2).toFixed(1)}px) rotate(${(spin * Math.sin(t * Math.PI)).toFixed(1)}deg) scale(${scale.toFixed(3)})`,
          });
        }
        anims.push(node.animate(frames, { duration: FLY_MS, delay: c.delay, easing: 'cubic-bezier(.4, .05, .45, 1)', fill: 'both' }));
        // quem recebe dá uma piscadinha quando a carta chega
        anims.push(
          dest.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(1.28)' }, { filter: 'brightness(1)' }], {
            duration: 280,
            delay: c.delay + FLY_MS - 60,
          }),
        );
      }
    }
    return () => {
      clearTimeout(timer);
      for (const a of anims) a.cancel();
    };
  }, [cards, me]);

  if (done) return null;
  return (
    <div ref={layer} className="mc-voos" aria-hidden="true">
      {cards.map((c) => (
        <div key={c.i} className="mc-voo" data-voo-i={c.i} data-voo={c.f.player} data-res={c.f.resource}>
          <ResIcon kind={c.f.resource} size={30} />
        </div>
      ))}
    </div>
  );
});
