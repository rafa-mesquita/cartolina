import { THEME_LIMITS, cleanTheme, type RoomView } from '@cartolina/shared';
import { useState, type FormEvent } from 'react';
import { isHost } from '../game/derive';
import type { GameConn } from '../net/connection';

export function ThemePanel({ view, conn }: { view: RoomView; conn: GameConn }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ titulo: '', min: '', max: '' });
  const [error, setError] = useState<string | null>(null);
  if (!isHost(view)) return null;

  function submit(e: FormEvent) {
    e.preventDefault();
    const theme = cleanTheme(draft);
    if (!theme) {
      setError('preenche o tema e os dois extremos');
      return;
    }
    conn.sendAction({ type: 'customTheme', theme });
    setEditing(false);
    setError(null);
  }

  const field = (key: 'titulo' | 'min' | 'max', label: string, placeholder: string, max: number) => (
    <input
      className="text-in"
      aria-label={label}
      placeholder={placeholder}
      maxLength={max}
      value={draft[key]}
      onChange={(e) => {
        setDraft({ ...draft, [key]: e.target.value });
        setError(null);
      }}
    />
  );

  return (
    <div className="theme-panel">
      {editing ? (
        <form onSubmit={submit}>
          {field('titulo', 'tema', 'tema (ex.: pizzas)', THEME_LIMITS.titulo)}
          {field('min', '1 =', '1 = …', THEME_LIMITS.extremo)}
          {field('max', '100 =', '100 = …', THEME_LIMITS.extremo)}
          <button className="sbtn solid" type="submit">
            usar esse tema
          </button>
          <button className="sbtn" type="button" onClick={() => {
              setEditing(false);
              setError(null);
            }}>
            cancelar
          </button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </form>
      ) : (
        <>
          <button className="sbtn" type="button" onClick={() => conn.sendAction({ type: 'rerollTheme' })}>
            sortear outro
          </button>
          <button className="sbtn" type="button" onClick={() => setEditing(true)}>
            escrever tema
          </button>
          <button className="btn" type="button" onClick={() => conn.sendAction({ type: 'beginRound' })}>
            dar as cartas
          </button>
        </>
      )}
    </div>
  );
}
