import type { GameId } from '@cartolina/shared';
import { useState, type FormEvent } from 'react';
import { catalogEntry } from '../games/catalog';
import { useIsPhone } from '../lib/device';
import { gameHash, goToRoom, type GameTab } from '../lib/router';
import { createRoom } from '../net/api';
import { TOO_MANY_MESSAGE, isTooMany } from '../net/errors';
import { HistoryPanel } from './history/HistoryPanel';
import { PHONE_TEXT } from './PhoneNotice';
import './shelf.css';

/** "entrar com código": usado na estante e na aba jogar de cada jogo. */
export function JoinByCode() {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  function enter(e: FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (/^[A-Z0-9]{4}$/.test(c)) goToRoom(c);
    else setError('O código da sala tem 4 letras.');
  }
  return (
    <form className="row-inline" onSubmit={enter}>
      <input
        className="text-in"
        value={code}
        onChange={(e) => {
          setCode(e.target.value);
          setError(null);
        }}
        placeholder="KXQ7"
        maxLength={4}
        aria-label="código da sala"
      />
      <button className="sbtn solid" type="submit">
        entrar na sala
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function PlayTab({ game }: { game: GameId }) {
  const entry = catalogEntry(game)!;
  const phone = useIsPhone();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      goToRoom(await createRoom(game));
    } catch (err) {
      setError(isTooMany(err) ? TOO_MANY_MESSAGE : 'Não deu pra criar a sala. Tenta de novo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="panel">
        {!entry.playable ? (
          <p className="hint">O {entry.name} tá chegando! Por enquanto dá pra ver as regras aqui embaixo.</p>
        ) : phone ? (
          <p className="hint">{PHONE_TEXT}</p>
        ) : (
          <>
            <button className="btn" type="button" onClick={() => void create()} disabled={busy}>
              {busy ? 'criando…' : 'criar sala'}
            </button>
            <JoinByCode />
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </>
        )}
      </section>
      <section className="panel">
        <h2>como jogar</h2>
        <ul className="rules">
          {entry.rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className="hint">{entry.players}</p>
      </section>
    </>
  );
}

export function GamePage({ game, tab, legacy = false }: { game: GameId; tab: GameTab; legacy?: boolean }) {
  const entry = catalogEntry(game)!;
  return (
    <main className={`screen game-page game-${game}`}>
      <h1 className="logo">
        cartolina<span>~</span>
      </h1>
      <header className="game-head">
        <a className="back-link" href="#/">
          ← jogos
        </a>
        <div className={`cover mini cover-${game}`} aria-hidden="true">
          {entry.name}
        </div>
        <div>
          <h2>{entry.name}</h2>
          <p className="tagline">{entry.tagline}</p>
        </div>
      </header>
      <nav className="tabs" role="tablist">
        {(['jogar', 'historico'] as const).map((t) => (
          <a key={t} role="tab" aria-selected={tab === t} className={`tab ${tab === t ? 'on' : ''}`} href={gameHash(game, t)}>
            {t === 'jogar' ? 'jogar' : 'histórico'}
          </a>
        ))}
      </nav>
      {legacy && <p className="hint">Os grupos acabaram: agora todo o histórico fica aqui, dentro de cada jogo.</p>}
      {tab === 'jogar' ? (
        <PlayTab game={game} />
      ) : entry.hasHistory ? (
        <HistoryPanel game={game} />
      ) : (
        <section className="panel">
          <p>O histórico do {entry.name} vem em breve.</p>
        </section>
      )}
    </main>
  );
}
