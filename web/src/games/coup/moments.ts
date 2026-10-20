import { useEffect, useRef, useState } from 'react';
import type { CoupCharacter, CoupLogEntry } from '@cartolina/shared';

/** Um momento narrado sobre o palco: o que o diário conta, mas com destaque. */
export type Moment =
  | { kind: 'challenge'; by: string; of: string; claim: CoupCharacter; had: boolean }
  | { kind: 'blocked'; by: string; as: CoupCharacter }
  | { kind: 'out'; player: string };

/** Quanto cada momento fica na tela (o `Moment.tsx` pode usar os últimos 250 ms pra sumir suave). */
export const MOMENT_MS = 2200;

/** Momentos das entradas novas do diário (de `from` em diante): dúvida, bloqueio que valeu, saída. */
export function momentsFrom(log: readonly CoupLogEntry[], from: number): Moment[] {
  const out: Moment[] = [];
  for (const e of log.slice(from)) {
    switch (e.t) {
      case 'challenge':
        out.push({ kind: 'challenge', by: e.by, of: e.of, claim: e.claim, had: e.had });
        break;
      case 'blocked':
        out.push({ kind: 'blocked', by: e.by, as: e.as });
        break;
      case 'out':
        out.push({ kind: 'out', player: e.player });
        break;
      default:
        break;
    }
  }
  return out;
}

interface Queue {
  match: number;
  items: Moment[];
}

/**
 * Fila de momentos: cada um fica 2,2 s; o próximo entra em seguida. Devolve o momento atual (ou null).
 * Só entram entradas que chegam depois da primeira visão (ao abrir a mesa, o diário antigo não vira momento).
 * Zera quando `match` muda (o diário recomeça) ou quando a partida acaba (`over`: o painel do fim já conta tudo,
 * então o "fora" do último não aparece por cima).
 */
export function useMoments(log: readonly CoupLogEntry[], match: number, over: boolean): Moment | null {
  const [queue, setQueue] = useState<Queue>({ match, items: [] });
  const seen = useRef<{ match: number; len: number } | null>(null);

  useEffect(() => {
    const prev = seen.current;
    seen.current = { match, len: log.length };
    if (over) {
      setQueue((q) => (q.items.length === 0 && q.match === match ? q : { match, items: [] }));
      return;
    }
    // primeira visão: o que já está no diário não conta; partida nova: o diário recomeça do zero
    const from = prev === null ? log.length : prev.match !== match ? 0 : prev.len;
    const fresh = momentsFrom(log, from);
    setQueue((q) => {
      if (q.match === match && fresh.length === 0) return q;
      return { match, items: [...(q.match === match ? q.items : []), ...fresh] };
    });
  }, [log, match, over]);

  const current = !over && queue.match === match ? (queue.items[0] ?? null) : null;
  useEffect(() => {
    if (current === null) return undefined;
    const id = setTimeout(() => {
      setQueue((q) => (q.items[0] === current ? { ...q, items: q.items.slice(1) } : q));
    }, MOMENT_MS);
    return () => clearTimeout(id);
  }, [current]);

  return current;
}
