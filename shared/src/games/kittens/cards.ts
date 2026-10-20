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
  // Cartas novas (pedido do Rafa, 2026-10-20): Tatu Latidor, Mau-olhado e Feitiço são de ação; o Boto é o bicho coringa.
  'latido',
  'olhado',
  'feitico',
  'capivara',
  'mico',
  'quati',
  'tamandua',
  'preguica',
  'boto',
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
  latido: 'Tatu Latidor',
  olhado: 'Mau-olhado',
  feitico: 'Feitiço',
  capivara: 'Capivara',
  mico: 'Mico-leão',
  quati: 'Quati',
  tamandua: 'Tamanduá',
  preguica: 'Preguiça',
  boto: 'Boto',
};

/** Cartas que fazem algo jogadas sozinhas (todas aceitam Nem vem!). */
export const KITTENS_ACTION_KINDS = ['ataque', 'pular', 'favor', 'embaralhar', 'espiar', 'latido', 'olhado', 'feitico'] as const;
export type KittensActionKind = (typeof KITTENS_ACTION_KINDS)[number];

/**
 * Os 5 bichos: sozinhos não fazem nada; em par, cada um tem efeito próprio (spec "Par de cada bicho"). O Boto (coringa)
 * NÃO está aqui: ele não tem efeito próprio, só faz as vezes de um destes (e o par de Preguiça não pede Boto).
 */
export const KITTENS_BICHOS = ['capivara', 'mico', 'quati', 'tamandua', 'preguica'] as const;
export type KittensBicho = (typeof KITTENS_BICHOS)[number];

/** O bicho coringa: em par ou trio vale por qualquer bicho; nos 5 diferentes conta como o próprio nome. */
export const KITTENS_WILD = 'boto' as const;

export function kittensIsBicho(kind: KittensCardKind | null): kind is KittensBicho {
  return kind !== null && (KITTENS_BICHOS as readonly string[]).includes(kind);
}

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

/**
 * Mau-olhado: quem está "cego" vê, no lugar da mão, fichas `?0`, `?1`, … — a ficha `?i` é a i-ésima carta da mão no
 * estado (que foi embaralhada quando o olhado pegou). `null` se não é ficha.
 */
export function kittensTokenIndex(token: string): number | null {
  const m = /^\?(\d{1,3})$/.exec(token);
  return m ? Number(m[1]) : null;
}

export function kittensToken(i: number): string {
  return `?${i}`;
}
