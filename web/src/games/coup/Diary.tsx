import { memo, useEffect, useLayoutEffect, useRef } from 'react';
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

interface Props {
  log: readonly CoupLogEntry[];
  match: number;
  names: Names;
  /** Celular: o diário é uma folha que sobe de baixo (só existe aberta). */
  phone: boolean;
  open: boolean;
  onClose: () => void;
}

/**
 * Diário: uma linha por acontecimento, a mais nova embaixo (destacada); rola sozinho se você estava no fim.
 * No computador é a coluna da direita; no celular, uma folha com "fechar" (a faixa `LastLine` abre).
 */
export const Diary = memo(function Diary({ log, match, names, phone, open, onClose }: Props) {
  const lines = diaryLines(log, names);
  const box = useRef<HTMLOListElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const stick = useRef(true);
  const lastMatch = useRef<number | null>(null);
  const sheet = phone && open;
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    // partida nova (ou primeira vez, ou a folha acabou de abrir) sempre começa no fim
    if (stick.current || lastMatch.current !== match) el.scrollTop = el.scrollHeight;
    lastMatch.current = match;
  }, [log, match, sheet]);
  // a folha abre com o foco no "fechar"; fechada, a próxima abertura começa no fim
  useEffect(() => {
    if (sheet) close.current?.focus();
    else stick.current = true;
  }, [sheet]);
  if (phone && !open) return null;
  return (
    <aside
      className={`cp-diary${sheet ? ' open' : ''}`}
      role={sheet ? 'dialog' : undefined}
      aria-modal={sheet ? true : undefined}
      aria-label={sheet ? 'diário' : undefined}
    >
      <div className="cp-diary-head">
        <h2>diário</h2>
        {sheet && (
          <button ref={close} type="button" className="cp-close" onClick={onClose}>
            fechar
          </button>
        )}
      </div>
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

/** Celular: a última linha do diário numa faixa; o toque abre a folha do diário inteiro. */
export const LastLine = memo(function LastLine({ log, names, onOpen }: { log: readonly CoupLogEntry[]; names: Names; onOpen: () => void }) {
  const lines = diaryLines(log, names);
  const last = lines[lines.length - 1];
  return (
    <button type="button" className="cp-lastline" aria-label="abrir o diário" onClick={onOpen}>
      <span className="txt">{last && <PhraseView phrase={last} />}</span>
      <span className="more" aria-hidden="true">
        diário ›
      </span>
    </button>
  );
});
