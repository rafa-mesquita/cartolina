import { useState, type FormEvent } from 'react';
import { goToRoom } from '../lib/router';

/** "entrar com código": usado na estante (compacto, botão "entrar") e na aba jogar de cada jogo. */
export function JoinByCode({ compact = false }: { compact?: boolean }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  function enter(e: FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (/^[A-Z0-9]{4}$/.test(c)) goToRoom(c);
    else setError('O código da sala tem 4 letras.');
  }
  return (
    <form className={`row-inline ${compact ? 'join-compact' : ''}`} onSubmit={enter}>
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
        {compact ? 'entrar' : 'entrar na sala'}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
