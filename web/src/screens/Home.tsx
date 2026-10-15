import { useState, type FormEvent } from 'react';
import { goToRoom } from '../lib/router';
import { createRoom } from '../net/api';

export function Home() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      goToRoom(await createRoom());
    } catch {
      setError('Não deu pra criar a sala. O servidor tá ligado?');
    } finally {
      setBusy(false);
    }
  }

  function enter(e: FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (/^[A-Z0-9]{4}$/.test(c)) goToRoom(c);
    else setError('O código da sala tem 4 letras.');
  }

  return (
    <main className="screen">
      <h1 className="logo big">
        cartolina<span>~</span>
      </h1>
      <p className="tagline">jogos de tabuleiro pra jogar com a galera na call</p>
      <section className="panel">
        <h2>ITO</h2>
        <p>Cada um recebe um número secreto de 1 a 100. Sem dizer o número, use o tema pra dar dicas e coloquem as cartas em ordem juntos.</p>
        <button className="btn" onClick={create} disabled={busy}>
          {busy ? 'criando…' : 'criar sala'}
        </button>
        <form className="row-inline" onSubmit={enter}>
          <input
            className="text-in"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="KXQ7"
            maxLength={4}
            aria-label="código da sala"
          />
          <button className="sbtn solid" type="submit">
            entrar na sala
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </section>
    </main>
  );
}
