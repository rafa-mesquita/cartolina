const stripSlashes = (url: string): string => url.replace(/\/+$/, '');

/** URL HTTP do servidor. Em dev, 127.0.0.1 evita o `localhost` resolver para IPv6 no Windows. */
export const SERVER_URL: string = stripSlashes((import.meta.env.VITE_SERVER_URL as string | undefined) || 'http://127.0.0.1:8787');

export function wsUrl(code: string, base: string = SERVER_URL): string {
  return `${stripSlashes(base).replace(/^http/, 'ws')}/rooms/${code}/ws`;
}
