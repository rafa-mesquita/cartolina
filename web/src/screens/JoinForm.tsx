import { PLAYER_COLORS, cleanName, errorMessage, NAME_MAX, type PlayerColor } from '@cartolina/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { critterOf } from '../brand/critters';
import type { Profile } from '../net/identity';
import { Critter } from './Critter';

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

  // Alguém pegou a cor que eu tinha selecionado enquanto eu preenchia: passa pra primeira livre.
  useEffect(() => {
    if (!takenColors.includes(color)) return;
    const free = PLAYER_COLORS.find((c) => !takenColors.includes(c));
    if (free) setColor(free);
  }, [takenColors, color]);

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
        seu personagem
        <div className="swatches">
          {PLAYER_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className="swatch"
              data-sound="pick"
              aria-label={critterOf(c).name}
              aria-pressed={c === color}
              disabled={takenColors.includes(c)}
              onClick={() => setColor(c)}
            >
              <Critter color={c} />
            </button>
          ))}
        </div>
      </div>
      {shown && <p className="error" role="alert">{shown}</p>}
      <button className="btn" type="submit" disabled={busy} data-sound="join">
        {busy ? 'entrando…' : 'entrar'}
      </button>
    </form>
  );
}
