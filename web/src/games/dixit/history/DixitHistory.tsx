import { useMemo, useState, type WheelEvent } from 'react';
import { TOO_MANY_MESSAGE } from '../../../net/errors';
import { Brushes } from '../Brushes';
import { CardViewer } from '../CardViewer';
import { EmptyHistory } from './EmptyHistory';
import { FamousCards } from './FamousCards';
import { GaleraBoards } from './GaleraBoards';
import { FAMOUS, famousItems, matchGroupKey, matchItems, type CardItem } from './groups';
import { MatchList } from './MatchList';
import { useDixitHistory } from './useDixitHistory';
import '../dixit.css';
import './dixit-history.css';

/** Aba histórico do Diquisti: a galera, cartas famosas e partidas, no visual da mesa. */
export function DixitHistory() {
  const { data, loadFailed, loadingMore, moreError, reload, loadMore } = useDixitHistory();
  const [viewer, setViewer] = useState<{ group: string; index: number } | null>(null);
  const famous = useMemo(() => (data?.stats ? famousItems(data.stats) : null), [data]);
  /** Cartas de cada faixa e de cada partida: a carta ampliada navega dentro do grupo de onde abriu. */
  const groups = useMemo(() => {
    const map = new Map<string, CardItem[]>();
    if (famous) for (const { key } of FAMOUS) map.set(key, famous[key]);
    for (const m of data?.matches ?? []) map.set(matchGroupKey(m.id), matchItems(m));
    return map;
  }, [data, famous]);

  const open = (group: string, index: number) => {
    if (groups.get(group)?.[index]) setViewer({ group, index });
  };

  // Rodinha pra cima numa carta amplia (como na mesa); pra baixo, a própria carta ampliada fecha.
  function onWheel(e: WheelEvent<HTMLDivElement>) {
    if (viewer || e.deltaY >= 0) return;
    const el = (e.target as Element).closest<HTMLElement>('[data-card-id][data-group]');
    if (el?.dataset.group) open(el.dataset.group, Number(el.dataset.index));
  }

  if (data === undefined && loadFailed) {
    return (
      <div className="dxh">
        <section className="dxh-fail">
          <h2>{loadFailed === 'too_many' ? TOO_MANY_MESSAGE : 'não deu pra falar com o servidor'}</h2>
          <button className="dx-btn" type="button" onClick={reload}>
            tentar de novo
          </button>
        </section>
      </div>
    );
  }
  if (data === undefined) {
    return (
      <p className="hint" role="status">
        carregando…
      </p>
    );
  }
  if (data === null) {
    return (
      <section className="panel">
        <p>Esse jogo ainda não tem histórico.</p>
      </section>
    );
  }

  const items = viewer ? (groups.get(viewer.group) ?? []) : [];
  return (
    <div className="dxh" onWheel={onWheel}>
      <Brushes width={760} height={1600} />
      {data.matches.length === 0 ? (
        <EmptyHistory />
      ) : (
        <>
          {data.stats && <GaleraBoards stats={data.stats} />}
          {famous && <FamousCards items={famous} onOpen={open} />}
          <section>
            <h2>partidas</h2>
            <MatchList matches={data.matches} onOpen={open} />
            {data.nextBefore !== null && (
              <button className="dxh-more" type="button" onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? 'carregando…' : 'carregar mais'}
              </button>
            )}
            {moreError && (
              <p className="dxh-error" role="alert">
                {moreError}
              </p>
            )}
          </section>
        </>
      )}
      {viewer && items.length > 0 && (
        <CardViewer
          ids={items.map((it) => it.card)}
          index={viewer.index}
          label={(_id, i) => items[i]?.label ?? ''}
          onIndex={(index) => setViewer((cur) => (cur ? { ...cur, index } : cur))}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}
