import type { BoardLayout, MandacaruLogEntry } from '@cartolina/shared';
import { memo } from 'react';
import { logLine, type NameOf } from './texts';

/** Quantas linhas o diário mostra (as mais novas). */
export const DIARY_LINES = 8;

/** Quantas entradas do fim do diário velho precisam bater pra achar onde ele termina no novo. */
const TAIL = 6;
const same = (a: MandacaruLogEntry, b: MandacaruLogEntry) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Entradas novas do diário entre duas visões (as visões chegam como JSON novo, então compara pelo conteúdo).
 * O diário guardado tem limite (as últimas 80), então acha onde o fim do velho (até 6 entradas) aparece no novo.
 * Sem visão anterior = nada novo; partida nova ou fim do velho sumido = só a última.
 */
export function freshEntries(prev: MandacaruLogEntry[] | null, next: MandacaruLogEntry[]): MandacaruLogEntry[] {
  if (prev === null) return [];
  if (prev.length === 0) return next.slice();
  // o fim mais comprido que ainda aparece no novo (o começo do velho pode ter sido cortado)
  for (let k = Math.min(TAIL, prev.length); k >= 1; k--) {
    const tail = prev.slice(-k);
    for (let end = next.length; end >= k; end--) {
      if (tail.every((e, i) => same(e, next[end - k + i]!))) return next.slice(end);
    }
  }
  return next.slice(-1);
}

interface Props {
  log: MandacaruLogEntry[];
  nameOf: NameOf;
  layout: BoardLayout | null;
}

/** O diário: as 8 últimas frases, a mais nova em cima (e em negrito). */
export const Diary = memo(function Diary({ log, nameOf, layout }: Props) {
  const lines = log
    .slice(-DIARY_LINES)
    .reverse()
    .map((e) => logLine(e, nameOf, layout).text);
  return (
    <section className="mc-box mc-diario" aria-label="diário">
      <h3>diário</h3>
      <ol className="mc-log">
        {lines.map((t, i) => (
          <li key={`${log.length - i}`}>{t}</li>
        ))}
      </ol>
    </section>
  );
});
