import type { DixitHistoryResponse } from '@cartolina/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getHistory } from '../../../net/api';
import { TOO_MANY_MESSAGE, isTooMany } from '../../../net/errors';

export interface DixitHistoryState {
  /** `undefined` carregando; `null` o servidor não tem histórico do Diquisti. */
  data: DixitHistoryResponse | null | undefined;
  /** Falha da primeira carga: `too_many` (429) ou `net` (servidor fora/rede). */
  loadFailed: false | 'net' | 'too_many';
  loadingMore: boolean;
  moreError: string | null;
  reload: () => void;
  loadMore: () => Promise<void>;
}

/** Carga do histórico do Diquisti, como a do DITU: geração invalida respostas velhas; "carregar mais" junta partidas. */
export function useDixitHistory(): DixitHistoryState {
  const [data, setData] = useState<DixitHistoryResponse | null | undefined>(undefined);
  const [loadFailed, setLoadFailed] = useState<false | 'net' | 'too_many'>(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  /** Cada carga nova (ou a desmontagem) invalida as respostas que ainda estão a caminho. */
  const generation = useRef(0);
  /** Trava síncrona: um segundo "carregar mais" antes do primeiro voltar é ignorado (o estado só vale no próximo render). */
  const loadingMoreRef = useRef(false);

  const reload = useCallback(() => {
    const gen = ++generation.current;
    setLoadFailed(false);
    getHistory('dixit')
      .then((d) => {
        if (gen === generation.current) setData(d);
      })
      .catch((err: unknown) => {
        if (gen === generation.current) setLoadFailed(isTooMany(err) ? 'too_many' : 'net');
      });
  }, []);

  // `reload` é estável (useCallback sem deps): o efeito roda uma vez (duas no StrictMode, e a geração cuida disso).
  useEffect(() => {
    reload();
    return () => {
      generation.current++;
    };
  }, [reload]);

  async function loadMore() {
    if (loadingMoreRef.current || !data || data.nextBefore === null) return;
    loadingMoreRef.current = true;
    const gen = generation.current;
    const before = data.nextBefore;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const more = await getHistory('dixit', before);
      if (gen !== generation.current) return;
      if (!more) {
        setMoreError('Não achei mais partidas.');
        return;
      }
      setData((prev) => {
        if (!prev) return prev;
        const seen = new Set(prev.matches.map((m) => m.id));
        return {
          ...prev,
          matches: [...prev.matches, ...more.matches.filter((m) => !seen.has(m.id))],
          nextBefore: more.nextBefore,
          // páginas seguintes vêm sem estatísticas: mantém as da primeira
          stats: prev.stats ?? more.stats,
        };
      });
    } catch (err) {
      if (gen === generation.current) setMoreError(isTooMany(err) ? TOO_MANY_MESSAGE : 'Não deu pra carregar mais partidas. Tenta de novo.');
    } finally {
      loadingMoreRef.current = false;
      if (gen === generation.current) setLoadingMore(false);
    }
  }

  return { data, loadFailed, loadingMore, moreError, reload, loadMore };
}
