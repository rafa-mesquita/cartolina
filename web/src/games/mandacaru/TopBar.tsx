import type { MandacaruView } from '@cartolina/shared';
import { memo, useEffect, useRef, useState } from 'react';
import { SoundPill } from '../dixit/DixitTopBar';
import { DiceFace, MandacaruLogo } from './art';
import { formatClock } from './clock';
import { LOW_MS } from './Seats';
import { YOU, type NameOf } from './texts';

/** Quem já ganhou alguma na noite, de quem tem mais pra quem tem menos. */
export function winners(wins: Record<string, number>): string[] {
  return Object.keys(wins)
    .filter((p) => (wins[p] ?? 0) > 0)
    .sort((a, b) => (wins[b] ?? 0) - (wins[a] ?? 0));
}

/** "sua vez · preparação", "vez de Bia", "Bia venceu!". */
export function turnText(g: MandacaruView, nameOf: NameOf): string {
  if (g.phase === 'over') {
    const w = g.winner === null ? 'alguém' : nameOf(g.winner);
    return w === YOU ? 'você venceu!' : `${w} venceu!`;
  }
  if (g.turn === null) return '';
  const who = nameOf(g.turn);
  const base = who === YOU ? 'sua vez' : `vez de ${who}`;
  return g.phase === 'setup' ? `${base} · preparação` : base;
}

interface Props {
  game: MandacaruView;
  nameOf: NameOf;
  /** Ms que faltam no relógio da fase (descarte na fase `discard`, turno nas outras); `null` = parado. */
  left: number | null;
  /** Muda a cada rolagem nova (reinicia a rolagem dos dados). */
  rollId: number;
  /** Os dados estão rolando agora (faces sorteadas até pousar no resultado); falso com movimento reduzido. */
  rolling: boolean;
  /** Abre/fecha a folha de regras. */
  onRules: () => void;
  rulesOpen: boolean;
  /** A vez de agir que é sua agora (`callOf`); mudou pra outra (não nula) = o topo dá uma piscada. */
  call?: string | null;
}

/** Quanto dura a piscada do topo quando passa a ser com você (2 piscadas de 0,6 s). */
export const CALL_BLINK_MS = 1200;

/**
 * Pisca quando `call` muda pra uma vez nova sua (não na montagem): devolve um número que muda a cada piscada (pra
 * reiniciar a animação) ou `null` sem piscada. Desliga sozinho por `setTimeout` (não depende do fim da animação).
 */
function useCallBlink(call: string | null): number | null {
  const prev = useRef(call);
  const [blink, setBlink] = useState<{ n: number; on: boolean }>({ n: 0, on: false });
  useEffect(() => {
    const before = prev.current;
    prev.current = call;
    if (call === null || call === before) return;
    setBlink((b) => ({ n: b.n + 1, on: true }));
  }, [call]);
  useEffect(() => {
    if (!blink.on) return undefined;
    const t = setTimeout(() => setBlink((b) => ({ ...b, on: false })), CALL_BLINK_MS);
    return () => clearTimeout(t);
  }, [blink]);
  return blink.on ? blink.n : null;
}

/** Topo: logo, de quem é a vez, relógio (vermelho no último minuto, "parado" sem prazo), placar da noite, regras, som e dados. */
export const TopBar = memo(function TopBar({ game: g, nameOf, left, rollId, rolling, onRules, rulesOpen, call = null }: Props) {
  const blink = useCallBlink(call);
  const chama = blink !== null ? ' chama' : '';
  const discard = g.phase === 'discard';
  const clock = left === null ? 'parado' : formatClock(left);
  const low = left !== null && left < LOW_MS && !discard;
  const score = winners(g.wins).map((p) => `${nameOf(p)} ${g.wins[p]}`);
  return (
    <header className="mc-top">
      <div className="mc-logo">
        <MandacaruLogo size={46} />
        <div>
          <h1>Mandacaru</h1>
          <div className="mc-sub">faça a caatinga florir</div>
        </div>
      </div>
      <div className="mc-turno">
        <div className="mc-vezbox">
          <span key={`v${blink ?? 0}`} className={`mc-vez${chama}`}>{turnText(g, nameOf)}</span>
          {score.length > 0 && <span className="mc-score">placar da noite: {score.join(' · ')}</span>}
        </div>
        {g.phase !== 'over' && (
          <span key={`r${blink ?? 0}`} className={`mc-relogio${low ? ' pouco' : ''}${chama}`} title={discard ? 'prazo do descarte' : 'tempo da vez'}>
            {discard ? `descarte ${clock}` : clock}
          </span>
        )}
      </div>
      <div className="mc-topo-dir">
        <button type="button" className={`mc-btn sec mini${rulesOpen ? ' on' : ''}`} aria-pressed={rulesOpen} onClick={onRules}>
          regras
        </button>
        <SoundPill />
        <Dice dice={g.dice} rollId={rollId} rolling={rolling} />
      </div>
    </header>
  );
});

/** Troca de face enquanto rola (ms). */
const FACE_MS = 75;
const randomFace = () => 1 + Math.floor(Math.random() * 6);

/** Faces sorteadas de novo a cada 75 ms enquanto `rolling` (o enfeite dos dados rolando, no topo e no centro). */
export function useRollingFaces(rolling: boolean, rollId: number): [number, number] {
  const [faces, setFaces] = useState<[number, number]>(() => [randomFace(), randomFace()]);
  useEffect(() => {
    if (!rolling) return undefined;
    const t = setInterval(() => setFaces([randomFace(), randomFace()]), FACE_MS);
    return () => clearInterval(t);
  }, [rolling, rollId]);
  return faces;
}

/**
 * Os dois dados do topo. Rolando: cambalhotas (CSS) com faces sorteadas a cada 75 ms; parou = o resultado de verdade,
 * com um quiquezinho. Sem rolagem nenhuma ainda (`rollId` 0), parados; sem dados na partida, apagados.
 */
function Dice({ dice, rollId, rolling }: { dice: [number, number] | null; rollId: number; rolling: boolean }) {
  const faces = useRollingFaces(rolling, rollId);
  const shown = rolling ? faces : (dice ?? [5, 2]);
  const fx = rollId > 0 ? (rolling ? ' rolando' : ' pousou') : '';
  // o nome é sempre o resultado de verdade (as faces que giram são só enfeite)
  return (
    <div className="mc-dados" aria-label={dice ? `dados: ${dice[0]} e ${dice[1]}` : 'dados'} role="img">
      {shown.map((n, i) => (
        <svg key={`${rollId}-${i}`} className={`mc-dado${fx}${dice ? '' : ' apagado'}`} viewBox="0 0 100 100" aria-hidden="true">
          <DiceFace n={n} />
        </svg>
      ))}
    </div>
  );
}
