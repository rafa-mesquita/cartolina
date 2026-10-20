import { useEffect, useState } from 'react';
import type { CamelioView } from '@cartolina/shared';

/** Uma frase do letreiro: pedaços de texto, alguns em destaque (`<b>`, dourado). Sem HTML: os nomes vêm dos jogadores. */
export type Line = readonly (string | { b: string })[];

/** O texto some em 120ms e o novo entra em 160ms (a transição do `.txt`). */
const FADE_MS = 120;

const keyOf = (line: Line): string => JSON.stringify(line);

/** Letreiro: a caixa fica parada; o texto troca com fade (a mesma frase de novo não pisca). */
export function Banner({ line }: { line: Line }) {
  const key = keyOf(line);
  const [cur, setCur] = useState({ key, line });
  const [fade, setFade] = useState(false);
  useEffect(() => {
    if (key === cur.key) {
      setFade(false);
      return undefined;
    }
    setFade(true);
    const t = setTimeout(() => {
      setCur({ key, line });
      setFade(false);
    }, FADE_MS);
    return () => clearTimeout(t);
    // Só quando a frase muda: `line` acompanha `key` (um array novo a cada render não reinicia o fade).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return (
    <div className="cl-banner">
      <span className={`txt${fade ? ' fade' : ''}`}>
        {cur.line.map((part, i) => (typeof part === 'string' ? part : <b key={i}>{part.b}</b>))}
      </span>
    </div>
  );
}

/** "a, b e c". */
const list = (xs: readonly string[]): string => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);

/** Quem ganhou, com quem vê por último ("Bia e você"). */
export function winnersTxt(v: CamelioView, me: string | null, name: (id: string) => string): string {
  const w = [...v.winners].sort((a, b) => Number(a === me) - Number(b === me)).map(name);
  return list(w);
}

/** Por que acabou: o mesmo texto no letreiro e no cartaz. */
export const endWhy = (v: CamelioView): string => (v.endReason === 'target' ? `chegou a ${v.target} cores` : 'o monte acabou');

/** O gesto em curso na sua vez: carta levantada pelo clique ou arrastada. */
export type Gesture = 'picked' | 'dragging' | null;

/** O letreiro fora da frase da jogada: fim, pausa, a sua vez (a dica, que acompanha o gesto) ou de quem é a vez. */
export function hintLine(v: CamelioView, me: string | null, name: (id: string) => string, gesture: Gesture = null): Line {
  if (v.phase === 'over') {
    const w = v.winners.map(name);
    if (v.endReason === 'target') return ['fim: ', { b: `${w[0] ?? ''} ganhou!` }, ` ${endWhy(v)}`];
    if (w.length > 1) return ['o monte acabou: ', { b: `empate entre ${winnersTxt(v, me, name)}` }];
    return ['o monte acabou: ', { b: `${w[0] ?? ''} ganhou!` }];
  }
  if (v.phase !== 'playing') return ['preparando a partida…'];
  if (v.paused) return ['pausado: esperando a galera voltar'];
  if (!v.turn) return ['preparando a partida…'];
  if (me !== null && v.turn === me) {
    if (gesture === 'dragging') return ['solte na mesa de alguém (a sua também vale) · ', { b: 'Esc' }, ' desfaz'];
    if (gesture === 'picked') return ['agora clique na mesa de alguém (a sua também vale) · ', { b: 'Esc' }, ' desfaz'];
    return [{ b: 'sua vez:' }, ' arraste uma carta até a mesa de alguém (ou clique nela e depois na mesa)'];
  }
  return ['vez de ', { b: name(v.turn) }];
}
