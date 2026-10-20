import { memo, useLayoutEffect, useRef } from 'react';
import type { CoupLogEntry } from '@cartolina/shared';
import { PhraseView } from './Phrase';
import { logLine, type Names, type Phrase } from './texts';

/** Perto assim do fim (px), o diário continua grudado embaixo quando chega linha nova. */
const STICK_PX = 40;

/** Linhas do diário (pula as entradas que outra linha já contou). */
export function diaryLines(log: readonly CoupLogEntry[], names: Names): Phrase[] {
  // (sem flatMap: a frase também é uma lista e seria achatada)
  return log.map((e) => logLine(e, names)).filter((l): l is Phrase => l !== null);
}

/** Coluna do diário: uma linha por acontecimento, a mais nova embaixo (destacada); rola sozinho se você estava no fim. */
export const Diary = memo(function Diary({ log, match, names }: { log: readonly CoupLogEntry[]; match: number; names: Names }) {
  const lines = diaryLines(log, names);
  const box = useRef<HTMLOListElement>(null);
  const stick = useRef(true);
  const lastMatch = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    // partida nova (ou primeira vez) sempre começa no fim
    if (stick.current || lastMatch.current !== match) el.scrollTop = el.scrollHeight;
    lastMatch.current = match;
  }, [log, match]);
  return (
    <aside className="cp-diary">
      <h2>diário</h2>
      <ol
        className="cp-log"
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX;
        }}
      >
        {lines.map((l, i) => (
          <li key={i} className={i === lines.length - 1 ? 'last' : undefined}>
            <PhraseView phrase={l} />
          </li>
        ))}
      </ol>
    </aside>
  );
});
