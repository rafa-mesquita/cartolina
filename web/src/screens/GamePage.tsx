import type { GameId } from '@cartolina/shared';
import { useState } from 'react';
import { catalogEntry } from '../games/catalog';
import { DixitHistory } from '../games/dixit/history/DixitHistory';
import { useIsPhone } from '../lib/device';
import { gameHash, goToRoom, type GameTab } from '../lib/router';
import { createRoom } from '../net/api';
import { TOO_MANY_MESSAGE, isTooMany } from '../net/errors';
import { HistoryPanel } from './history/HistoryPanel';
import { JoinByCode } from './JoinByCode';
import { PHONE_TEXT } from './PhoneNotice';
import './shelf.css';

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
        ) : phone && !entry.mobile ? (
          <p className="hint">{PHONE_TEXT}</p>
        ) : (
          <>
            <button className="btn play" type="button" onClick={() => void create()} disabled={busy}>
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

/** Histórico no formato de cada jogo (jogo novo no registro sem caso aqui não compila). */
function HistoryTab({ game }: { game: GameId }) {
  switch (game) {
    case 'ito':
      return <HistoryPanel game={game} />;
    case 'dixit':
      return <DixitHistory />;
    case 'pictures':
      // histórico e museu do Retratim vêm no R4
      return (
        <section className="panel">
          <p>O histórico do Retratim vem em breve.</p>
        </section>
      );
    case 'coup':
      // o histórico do Cúpi vem no Plano C4
      return (
        <section className="panel">
          <p>O histórico do Cúpi vem em breve.</p>
        </section>
      );
    default: {
      const _never: never = game;
      throw new Error(`jogo sem histórico: ${String(_never)}`);
    }
  }
}

export function GamePage({ game, tab, legacy = false }: { game: GameId; tab: GameTab; legacy?: boolean }) {
  const entry = catalogEntry(game)!;
  return (
    <main className={`screen game-page game-${game}`}>
      <h1 className="logo">
        cartolina<span>~</span>
      </h1>
      <header className="game-head">
        <a className="back-link" href="#/" data-sound="click">
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
      <nav className="tabs" aria-label="seções do jogo">
        {(['jogar', 'historico'] as const).map((t) => (
          <a key={t} data-sound="click" aria-current={tab === t ? 'page' : undefined} className={`tab ${tab === t ? 'on' : ''}`} href={gameHash(game, t)}>
            {t === 'jogar' ? 'jogar' : 'histórico'}
          </a>
        ))}
      </nav>
      {legacy && <p className="hint">Os grupos acabaram: agora todo o histórico fica aqui, dentro de cada jogo.</p>}
      {tab === 'jogar' ? (
        <PlayTab game={game} />
      ) : (
        <HistoryTab game={game} />
      )}
    </main>
  );
}
