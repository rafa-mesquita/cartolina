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

/** Maior corpo aceito num POST (o maior uso real é `{ "name": "<até 40 letras>" }`). */
export const MAX_BODY_BYTES = 1024;
export const TOO_LARGE = Symbol('too_large');

/** Lê um corpo JSON pequeno. Maior que o limite → `TOO_LARGE`; JSON inválido → null. */
export async function readSmallJson(request: Request, max = MAX_BODY_BYTES): Promise<unknown> {
  const text = await request.text();
  if (new TextEncoder().encode(text).length > max) return TOO_LARGE;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** O que usamos do binding de Rate Limiting da Cloudflare. */
export interface Limiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/**
 * true = pode seguir. Sem binding (ambiente sem o limitador) ou sem IP (testes, scripts): segue.
 * Em produção a Cloudflare sempre manda `CF-Connecting-IP`.
 */
export async function underLimit(limiter: Limiter | undefined, ip: string | null): Promise<boolean> {
  if (!limiter || !ip) return true;
  try {
    return (await limiter.limit({ key: ip })).success;
  } catch {
    return true; // limitador fora do ar não derruba o jogo: segue sem limite
  }
}
