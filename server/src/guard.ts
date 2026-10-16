const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * Devolve a origem se ela pode falar com o servidor (o site publicado ou o dev local), ou null.
 * `allowed` é a var `ALLOWED_ORIGINS`: origens separadas por vírgula.
 */
export function allowedOrigin(origin: string | null, allowed: string): string | null {
  if (!origin) return null;
  if (LOCAL_ORIGIN.test(origin)) return origin;
  const list = allowed
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.includes(origin) ? origin : null;
}
