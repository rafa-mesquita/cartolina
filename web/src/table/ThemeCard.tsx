import type { Theme } from '@cartolina/shared';

export function ThemeCard({ theme }: { theme: Theme | null }) {
  if (!theme) return null;
  return (
    <div className="theme">
      <div className="theme-title">{theme.titulo}</div>
      <div className="tscale">
        <b>1</b> {theme.min} · <b>100</b> {theme.max}
      </div>
    </div>
  );
}
