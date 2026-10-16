import type { GameId, HistoryResponse } from '@cartolina/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { gameHash } from '../../lib/router';
import { getHistory } from '../../net/api';
import { TOO_MANY_MESSAGE, isTooMany } from '../../net/errors';
import { CritterIcon, RoundItem, Stat } from './RoundItem';
import './history.css';

export function HistoryPanel({ game }: { game: GameId }) {
  const [data, setData] = useState<HistoryResponse | null | undefined>(undefined);
  /** Falha da primeira carga: 	oo_many (429, pedidos demais) ou 
et (servidor fora/rede). */
  const [loadFailed, setLoadFailed] = useState<false | 'net' | 'too_many'>(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  /** Geração das requisições: cada carga nova (ou a desmontagem) invalida as respostas que ainda estão a caminho. */
  const generation = useRef(0);

  const load = useCallback(() => {
    const gen = ++generation.current;
    setLoadFailed(false);
    getHistory(game)
      .then((d) => {
        if (gen === generation.current) setData(d);
      })
      .catch((err: unknown) => {
        if (gen === generation.current) setLoadFailed(isTooMany(err) ? 'too_many' : 'net');
      });
  }, [game]);

  useEffect(() => {
    load();
    return () => {
      generation.current++;
    };
  }, [load]);

  async function loadMore() {
    if (!data || data.nextBefore === null) return;
    const gen = generation.current;
    const before = data.nextBefore;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const more = await getHistory(game, before);
      if (gen !== generation.current) return;
      if (!more) {
        setMoreError('Não achei mais partidas.');
        return;
      }
      setData((prev) => {
        if (!prev) return prev;
        const seen = new Set(prev.rounds.map((r) => r.id));
        return {
          ...prev,
          rounds: [...prev.rounds, ...more.rounds.filter((r) => !seen.has(r.id))],
          nextBefore: more.nextBefore,
          // páginas seguintes vêm sem estatísticas: mantém as da primeira
          stats: prev.stats ?? more.stats,
        };
      });
    } catch (err) {
      if (gen === generation.current) setMoreError(isTooMany(err) ? TOO_MANY_MESSAGE : 'Não deu pra carregar mais partidas. Tenta de novo.');
    } finally {
      if (gen === generation.current) setLoadingMore(false);
    }
  }

  if (data === undefined && loadFailed) {
    return (
      <section className="panel">
        <h2>{loadFailed === 'too_many' ? TOO_MANY_MESSAGE : 'não deu pra falar com o servidor'}</h2>
        <button className="btn" type="button" onClick={load}>
          tentar de novo
        </button>
      </section>
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

  const { rounds, stats } = data;
  const winRate = stats?.livreRounds ? `${Math.round((stats.livreWins / stats.livreRounds) * 100)}%` : '—';
  return (
    <div className="history-page">
      {stats && (
        <section className="panel">
          <h2>números</h2>
          <div className="stats">
            <Stat label="rodadas" value={String(stats.rounds)} />
            <Stat label="vitórias no livre" value={winRate} />
            <Stat label="campanhas zeradas" value={`${stats.campaignsWon}/${stats.campaigns}`} />
            <Stat label="maior sequência sem erro" value={String(stats.bestStreak)} />
          </div>
          {stats.sharpest && (
            <p className="highlight">
              <CritterIcon color={stats.sharpest.color} />
              <span>
                <b>{stats.sharpest.name}</b> é quem mais acerta a posição: {Math.round(stats.sharpest.accuracy * 100)}% de{' '}
                {stats.sharpest.cards} cartas
              </span>
            </p>
          )}
          {stats.topThemes.length > 0 && (
            <div>
              <h3>temas mais jogados</h3>
              <ol className="theme-list">
                {stats.topThemes.map((t) => (
                  <li key={t.titulo}>
                    {t.titulo} <span>({t.count})</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      )}

      <section className="panel">
        <h2>partidas</h2>
        {rounds.length === 0 ? (
          <p>
            Nenhuma partida ainda. <a href={gameHash(game)}>Crie uma sala</a> e bora jogar!
          </p>
        ) : (
          <ul className="round-list">
            {rounds.map((r) => (
              <RoundItem key={r.id} round={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} />
            ))}
          </ul>
        )}
        {data.nextBefore !== null && (
          <button className="sbtn" type="button" onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? 'carregando…' : 'carregar mais'}
          </button>
        )}
        {moreError && (
          <p className="error" role="alert">
            {moreError}
          </p>
        )}
      </section>
    </div>
  );
}
