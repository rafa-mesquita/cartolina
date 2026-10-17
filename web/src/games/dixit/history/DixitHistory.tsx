import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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

/** Rodinha até esse tempo depois de uma rolagem (página ou faixa) é rolagem, não pedido de ampliar. */
const WHEEL_AFTER_SCROLL_MS = 300;

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

  /** Abre a carta ampliada; devolve se abriu. */
  const open = (group: string, index: number): boolean => {
    if (!groups.get(group)?.[index]) return false;
    setViewer({ group, index });
    return true;
  };

  // O listener nativo da rodinha lê o estado por refs (registrado uma vez, não a cada render).
  const viewerOpen = useRef(false);
  const openRef = useRef(open);
  useLayoutEffect(() => {
    viewerOpen.current = viewer !== null;
    openRef.current = open;
  });
  /**
   * Horário da última rolagem (da página ou de uma faixa de cartas): a rodinha só amplia com o ponteiro parado.
   * `scroll` de elemento não sobe até a janela, então escuta na captura do document.
   */
  const lastScroll = useRef(-Infinity);
  useEffect(() => {
    const onScroll = () => {
      lastScroll.current = Date.now();
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => document.removeEventListener('scroll', onScroll, { capture: true });
  }, []);

  /**
   * Rodinha pra cima numa carta amplia (como na mesa); pra baixo, a própria carta ampliada fecha. Aqui a página rola
   * (na mesa não): quem está rolando não abre carta sem querer. O listener é nativo e não passivo (o `onWheel` do
   * React 19 é passivo) para segurar a página quando abre a carta e enquanto ela está aberta.
   * Callback ref, e não `useEffect`, porque o `.dxh` só aparece depois da carga.
   */
  const wheelRoot = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const onWheel = (e: globalThis.WheelEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (viewerOpen.current) {
        // no overlay, ou numa carta pelo resto do giro que abriu (antes de o overlay aparecer): a página não anda
        if (target?.closest('.dx-viewer, [data-card-id]')) e.preventDefault();
        return;
      }
      // deslize pro lado no trackpad (faixa de cartas) traz um deltaY pequeno e às vezes negativo: não é pedido de ampliar
      if (e.deltaY >= 0 || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      if (Date.now() - lastScroll.current < WHEEL_AFTER_SCROLL_MS) return;
      const card = target?.closest<HTMLElement>('[data-card-id][data-group]');
      if (!card?.dataset.group) return;
      if (openRef.current(card.dataset.group, Number(card.dataset.index))) {
        viewerOpen.current = true;
        e.preventDefault();
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

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
    <div className="dxh" ref={wheelRoot}>
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
