/** Tipos de carta do Tatubum (id interno `kittens`). Cada carta física tem id `<tipo>-<n>` (ex.: `ataque-3`). */
export const KITTENS_CARD_KINDS = [
  'tatubum',
  'cafune',
  'nemvem',
  'ataque',
  'pular',
  'favor',
  'embaralhar',
  'espiar',
  'capivara',
  'mico',
  'quati',
  'tamandua',
  'preguica',
] as const;
export type KittensCardKind = (typeof KITTENS_CARD_KINDS)[number];

/** Nome que o jogador vê. */
export const KITTENS_CARD_NAMES: Record<KittensCardKind, string> = {
  tatubum: 'Tatubum',
  // Id interno `cafune` (o nome antigo); na tela é Desarme: o tatu das Forças Armadas (pedido do Rafa, 2026-10-19).
  cafune: 'Desarme',
  nemvem: 'Nem vem!',
  ataque: 'Ataque',
  pular: 'Pular',
  favor: 'Favor',
  embaralhar: 'Embaralhar',
  espiar: 'Espiar',
  capivara: 'Capivara',
  mico: 'Mico-leão',
  quati: 'Quati',
  tamandua: 'Tamanduá',
  preguica: 'Preguiça',
};

/** Cartas que fazem algo jogadas sozinhas (todas aceitam Nem vem!). */
export const KITTENS_ACTION_KINDS = ['ataque', 'pular', 'favor', 'embaralhar', 'espiar'] as const;
export type KittensActionKind = (typeof KITTENS_ACTION_KINDS)[number];

/** Os 5 bichos: sozinhos não fazem nada, só em combo. */
export const KITTENS_BICHOS = ['capivara', 'mico', 'quati', 'tamandua', 'preguica'] as const;

export function kittensCardId(kind: KittensCardKind, n: number): string {
  return `${kind}-${n}`;
}

/** Tipo de uma carta pelo id; `null` se o id não é de carta do Tatubum. */
export function kittensKindOf(id: string): KittensCardKind | null {
  const cut = id.lastIndexOf('-');
  if (cut <= 0) return null;
  const kind = id.slice(0, cut);
  return (KITTENS_CARD_KINDS as readonly string[]).includes(kind) ? (kind as KittensCardKind) : null;
}
