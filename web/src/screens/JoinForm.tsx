import { PLAYER_COLORS, cleanName, errorMessage, NAME_MAX, type PlayerColor } from '@cartolina/shared';
import { useState, type CSSProperties, type FormEvent } from 'react';
import type { Profile } from '../net/identity';

interface Props {
  takenColors: readonly string[];
  initial: Profile | null;
  busy: boolean;
  error: string | null;
  onSubmit(profile: Profile): void;
}

export function JoinForm({ takenColors, initial, busy, error, onSubmit }: Props) {
  const firstFree = PLAYER_COLORS.find((c) => !takenColors.includes(c)) ?? PLAYER_COLORS[0];
  const [name, setName] = useState(initial?.name ?? '');
  const [color, setColor] = useState<PlayerColor>(
    initial && !takenColors.includes(initial.color) ? initial.color : firstFree,
  );
  const [localError, setLocalError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const clean = cleanName(name);
    if (!clean) {
      setLocalError(errorMessage('bad_name'));
      return;
    }
    setLocalError(null);
    onSubmit({ name: clean, color });
  }

  const shown = localError ?? (error ? errorMessage(error) : null);
  return (
    <form className="panel" onSubmit={submit}>
      <h2>quem é você?</h2>
      <label className="field">
        seu nome
        <input
          className="text-in"
          aria-label="seu nome"
          value={name}
          maxLength={NAME_MAX * 2}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ana"
          autoFocus
        />
      </label>
      <div className="field">
        sua cor
        <div className="swatches">
          {PLAYER_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className="swatch"
              aria-label={`cor ${c}`}
              aria-pressed={c === color}
              disabled={takenColors.includes(c)}
              style={{ '--c': c } as CSSProperties}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
      </div>
      {shown && <p className="error">{shown}</p>}
      <button className="btn" type="submit" disabled={busy}>
        {busy ? 'entrando…' : 'entrar'}
      </button>
    </form>
  );
}
