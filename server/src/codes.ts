// Fora de index.ts de propósito: todo export nomeado do módulo de entrada do Worker vira entrypoint,
// e um valor que não é handler/classe faz o `wrangler dev` falhar.
export const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_RE = new RegExp(`^[${ROOM_ALPHABET}]{4}$`);

export function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (b) => ROOM_ALPHABET[b % ROOM_ALPHABET.length]).join('');
}
