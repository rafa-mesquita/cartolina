import type { GroupResponse, ItoOutcome, RoundCard, RoundRecord } from '@cartolina/shared';
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { critterSvg } from '../brand/critters';
import { useIsPhone } from '../lib/device';
import { goHome, goToRoom, groupLink } from '../lib/router';
import { createGroupRoom, getGroup } from '../net/api';
import { TOO_MANY_MESSAGE, isTooMany } from '../net/errors';
import { rememberGroup } from '../net/identity';
import { PHONE_TEXT } from './PhoneNotice';
import './group.css';

const OUTCOME: Record<ItoOutcome, { label: string; good: boolean }> = {
  round_won: { label: 'vitória', good: true },
  round_lost: { label: 'errou', good: false },
  level_cleared: { label: 'nível ✓', good: true },
  level_failed: { label: 'repetiu o nível', good: false },
  won: { label: 'zerou a campanha', good: true },
  lost: { label: 'acabaram as vidas', good: false },
};

const COPY_MSG_MS = 2000;

const dateFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const dayFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' });

function CritterIcon({ color, title, className = 'mini-avatar' }: { color: string; title?: string; className?: string }) {
  return <span className={className} title={title} dangerouslySetInnerHTML={{ __html: critterSvg(color) }} />;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

function MiniCard({ card }: { card: RoundCard }) {
  return (
    <div className={`mini-card ${card.error ? 'err' : ''}`} style={{ '--c': card.color } as CSSProperties}>
      <CritterIcon color={card.color} className="mini-badge" />
      <div className="mini-num">{card.value}</div>
      <div className="mini-clue">{card.clue || '…'}</div>
      <div className="mini-name">{card.name}</div>
      {card.error && (
        <div className="mini-x" role="img" aria-label="fora de ordem">
          ✕
        </div>
      )}
    </div>
  );
}

function RoundItem({ round, open, onToggle }: { round: RoundRecord; open: boolean; onToggle(): void }) {
  const outcome = OUTCOME[round.outcome];
  const bodyId = useId();
  return (
    <li className="round">
      <button type="button" className="round-head" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
        <span className="round-date">{dateFmt.format(new Date(round.playedAt))}</span>
        <span className="round-theme">{round.theme.titulo}</span>
        <span className="round-mode">{round.mode === 'livre' ? 'livre' : `campanha · nível ${round.level}`}</span>
        <span className={`round-outcome ${outcome.good ? 'good' : 'bad'}`}>{outcome.label}</span>
        <span className="round-players">
          {/* nomes podem repetir numa sala; cores não */}
          {round.players.map((p) => (
            <CritterIcon key={p.color} color={p.color} title={p.name} />
          ))}
        </span>
      </button>
      {open && (
        <div className="round-body" id={bodyId}>
          <p className="round-scale">
            <b>1</b> {round.theme.min} · <b>100</b> {round.theme.max}
          </p>
          <div className="mini-row">
            {round.cards.map((c, i) => (
              <MiniCard key={i} card={c} />
            ))}
          </div>
        </div>
      )}
    </li>
  );
}

export function GroupPage({ slug }: { slug: string }) {
  const phone = useIsPhone();
  const [data, setData] = useState<GroupResponse | null | undefined>(undefined);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Geração das requisições: cada carga nova (ou a desmontagem) invalida as respostas que ainda estão a caminho. */
  const generation = useRef(0);

  const load = useCallback(() => {
    const gen = ++generation.current;
    setLoadFailed(false);
    getGroup(slug)
      .then((d) => {
        if (gen !== generation.current) return;
        setData(d);
        if (d) rememberGroup({ slug, name: d.group.name });
      })
      .catch(() => {
        if (gen === generation.current) setLoadFailed(true);
      });
  }, [slug]);

  useEffect(() => {
    load();
    return () => {
      generation.current++;
    };
  }, [load]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function loadMore() {
    if (!data || data.nextBefore === null) return;
    const gen = generation.current;
    const before = data.nextBefore;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const more = await getGroup(slug, before);
      if (gen !== generation.current) return;
      if (!more) {
        setMoreError('Não achei mais partidas desse grupo.');
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
    } catch {
      if (gen === generation.current) setMoreError('Não deu pra carregar mais partidas. Tenta de novo.');
    } finally {
      if (gen === generation.current) setLoadingMore(false);
    }
  }

  async function newRoom() {
    setCreating(true);
    setRoomError(null);
    try {
      goToRoom(await createGroupRoom(slug));
    } catch (err) {
      setRoomError(isTooMany(err) ? TOO_MANY_MESSAGE : 'Não deu pra criar a sala. Tenta de novo.');
    } finally {
      setCreating(false);
    }
  }

  async function copyLink() {
    let msg = 'link copiado!';
    try {
      await navigator.clipboard.writeText(groupLink(slug));
    } catch {
      msg = 'copia o link da barra de endereço'; // sem clipboard (http fora de localhost) ou sem permissão
    }
    setCopyMsg(msg);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopyMsg(null), COPY_MSG_MS);
  }

  const header = (
    <h1 className="logo">
      cartolina<span>~</span>
    </h1>
  );

  if (data === undefined && loadFailed) {
    return (
      <main className="screen">
        {header}
        <section className="panel">
          <h2>não deu pra falar com o servidor</h2>
          <button className="btn" type="button" onClick={load}>
            tentar de novo
          </button>
        </section>
      </main>
    );
  }
  if (data === undefined) {
    return (
      <main className="screen">
        {header}
        <p className="hint" role="status">
          carregando…
        </p>
      </main>
    );
  }
  if (data === null) {
    return (
      <main className="screen">
        {header}
        <section className="panel">
          <h2>grupo não encontrado</h2>
          <p>Confere se o link está completo.</p>
          <button className="btn" type="button" onClick={goHome}>
            voltar pro início
          </button>
        </section>
      </main>
    );
  }

  const { group, rounds, stats } = data;
  const winRate = stats?.livreRounds ? `${Math.round((stats.livreWins / stats.livreRounds) * 100)}%` : '—';
  return (
    <main className="screen group-page">
      {header}
      <section className="panel">
        <h2>{group.name}</h2>
        <p>grupo criado em {dayFmt.format(new Date(group.createdAt))}</p>
        <div className="row-inline">
          {!phone && (
            <button className="btn" type="button" onClick={() => void newRoom()} disabled={creating}>
              {creating ? 'criando…' : 'criar sala do grupo'}
            </button>
          )}
          <button className="sbtn" type="button" onClick={() => void copyLink()}>
            copiar link do grupo
          </button>
          <span className="copy-msg" aria-live="polite">
            {copyMsg}
          </span>
        </div>
        {roomError && (
          <p className="error" role="alert">
            {roomError}
          </p>
        )}
        {phone && <p className="hint">{PHONE_TEXT}</p>}
        <p className="hint">Quem tem o link do grupo vê o histórico. Partidas jogadas em salas criadas aqui entram sozinhas.</p>
      </section>

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
          <p>Nenhuma partida ainda. Crie uma sala do grupo e bora jogar!</p>
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
    </main>
  );
}
