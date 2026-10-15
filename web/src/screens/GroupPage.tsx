import type { GroupResponse, ItoOutcome, RoundCard, RoundRecord } from '@cartolina/shared';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { critterSvg } from '../brand/critters';
import { goHome, goToRoom, groupLink } from '../lib/router';
import { createGroupRoom, getGroup } from '../net/api';
import { rememberGroup } from '../net/identity';
import './group.css';

const OUTCOME: Record<ItoOutcome, { label: string; good: boolean }> = {
  round_won: { label: 'vitória', good: true },
  round_lost: { label: 'errou', good: false },
  level_cleared: { label: 'nível ✓', good: true },
  level_failed: { label: 'repetiu o nível', good: false },
  won: { label: 'zerou a campanha', good: true },
  lost: { label: 'acabaram as vidas', good: false },
};

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
  return (
    <li className="round">
      <button type="button" className="round-head" aria-expanded={open} onClick={onToggle}>
        <span className="round-date">{dateFmt.format(new Date(round.playedAt))}</span>
        <span className="round-theme">{round.theme.titulo}</span>
        <span className="round-mode">{round.mode === 'livre' ? 'livre' : `campanha · nível ${round.level}`}</span>
        <span className={`round-outcome ${outcome.good ? 'good' : 'bad'}`}>{outcome.label}</span>
        <span className="round-players">
          {round.players.map((p) => (
            <CritterIcon key={p.name} color={p.color} title={p.name} />
          ))}
        </span>
      </button>
      {open && (
        <div className="round-body">
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
  const [data, setData] = useState<GroupResponse | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    setFailed(false);
    getGroup(slug)
      .then((d) => {
        setData(d);
        if (d) rememberGroup({ slug, name: d.group.name });
      })
      .catch(() => setFailed(true));
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function loadMore() {
    if (!data || data.nextBefore === null) return;
    setLoadingMore(true);
    try {
      const more = await getGroup(slug, data.nextBefore);
      // Páginas seguintes podem vir sem estatísticas (`stats: null`): mantém as da primeira página.
      if (more) setData({ ...data, rounds: [...data.rounds, ...more.rounds], nextBefore: more.nextBefore, stats: data.stats ?? more.stats });
    } catch {
      setFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }

  async function newRoom() {
    setCreating(true);
    try {
      goToRoom(await createGroupRoom(slug));
    } catch {
      setFailed(true);
    } finally {
      setCreating(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(groupLink(slug));
    } catch {
      return; // sem clipboard (http fora de localhost): o link está na barra de endereço
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  const header = (
    <h1 className="logo">
      cartolina<span>~</span>
    </h1>
  );

  if (data === undefined && failed) {
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
        <p className="hint">carregando…</p>
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
          <button className="btn" type="button" onClick={() => void newRoom()} disabled={creating}>
            {creating ? 'criando…' : 'criar sala do grupo'}
          </button>
          <button className="sbtn" type="button" onClick={() => void copyLink()}>
            {copied ? 'link copiado!' : 'copiar link do grupo'}
          </button>
        </div>
        <p className="hint">Quem tem o link do grupo vê o histórico. Partidas jogadas em salas criadas aqui entram sozinhas.</p>
        {failed && (
          <p className="error" role="alert">
            Algo deu errado agora há pouco. Tenta de novo.
          </p>
        )}
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
      </section>
    </main>
  );
}
