// Fora de index.ts de propósito: todo export nomeado do módulo de entrada do Worker vira entrypoint,
// e um valor que não é handler/classe faz o `wrangler dev` falhar.
export const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_RE = new RegExp(`^[${ROOM_ALPHABET}]{4}$`);

export function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (b) => ROOM_ALPHABET[b % ROOM_ALPHABET.length]).join('');
}

/** Slug do grupo: 10 caracteres sem ambíguos (vai no link secreto `#/g/<slug>`). */
export const SLUG_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const SLUG_RE = new RegExp(`^[${SLUG_ALPHABET}]{10}$`);

export function randomSlug(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => SLUG_ALPHABET[b % SLUG_ALPHABET.length]).join('');
}
