import { PLAYER_COLORS, cleanName, errorMessage, NAME_MAX, type PlayerColor } from '@cartolina/shared';
import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import type { Profile } from '../net/identity';

/** Nomes em português das cores de jogador (mesma ordem de PLAYER_COLORS). */
export const COLOR_NAMES: Record<PlayerColor, string> = {
  '#8EC5FF': 'azul',
  '#FF8FAB': 'rosa',
  '#7EDDB5': 'verde',
  '#C7B3FF': 'lilás',
  '#FFD07A': 'amarelo',
  '#FFB38A': 'laranja',
  '#9EE6F0': 'ciano',
  '#E6B8E0': 'malva',
  '#C9E27A': 'lima',
  '#D9C2A0': 'areia',
};

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
        sua cor
        <div className="swatches">
          {PLAYER_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className="swatch"
              aria-label={`cor ${COLOR_NAMES[c]}`}
              aria-pressed={c === color}
              disabled={takenColors.includes(c)}
              style={{ '--c': c } as CSSProperties}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
      </div>
      {shown && <p className="error" role="alert">{shown}</p>}
      <button className="btn" type="submit" disabled={busy}>
        {busy ? 'entrando…' : 'entrar'}
      </button>
    </form>
  );
}
