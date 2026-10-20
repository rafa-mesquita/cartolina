import {
  COUP_BLOCKERS,
  COUP_CLAIM,
  COUP_COST,
  COUP_MUST_COUP_AT,
  COUP_TARGETED,
  COUP_TOTAL_COINS,
  type CoupActionKind,
  type CoupCharacter,
  type CoupDeclared,
  type CoupState,
} from './types';

/** Lê o registro só se a chave for própria (ids como '__proto__' não podem cair no protótipo). */
export function own<T>(record: Record<string, T>, key: string | null): T | undefined {
  return key !== null && Object.hasOwn(record, key) ? record[key] : undefined;
}

/** Cartas viradas pra baixo de `player` (as que ainda valem). */
export function hiddenOf(state: CoupState, player: string): CoupCharacter[] {
  return (own(state.hands, player)?.cards ?? []).filter((c) => !c.revealed).map((c) => c.character);
}

export function isAlive(state: CoupState, player: string): boolean {
  return hiddenOf(state, player).length > 0;
}

/** Quem ainda tem carta, na ordem dos assentos. */
export function alive(state: CoupState): string[] {
  return state.players.filter((p) => isAlive(state, p));
}

export function coinsOf(state: CoupState, player: string): number {
  return own(state.hands, player)?.coins ?? 0;
}

/** Moedas no tesouro: as 50 da caixa menos as dos jogadores. */
export function treasury(state: CoupState): number {
  return COUP_TOTAL_COINS - state.players.reduce((sum, p) => sum + coinsOf(state, p), 0);
}

/** Próximo vivo depois de `from`, na ordem dos assentos (dá a volta). */
export function nextAlive(state: CoupState, from: string): string | null {
  const n = state.players.length;
  const i = state.players.indexOf(from);
  for (let k = 1; k <= n; k++) {
    const p = state.players[(i + k) % n]!;
    if (isAlive(state, p)) return p;
  }
  return null;
}

/** Quem pode bloquear: na ajuda externa, qualquer outro vivo; em assassinar/extorquir, só o alvo (se vivo). */
export function blockersOf(state: CoupState, declared: CoupDeclared): string[] {
  if (COUP_BLOCKERS[declared.kind].length === 0) return [];
  if (declared.kind === 'foreignAid') return alive(state).filter((p) => p !== declared.actor);
  return declared.target !== null && isAlive(state, declared.target) ? [declared.target] : [];
}

/** Por que `actor` não pode declarar `kind` contra `target` (ou null se pode). Não confere fase nem vez. */
export function actError(state: CoupState, actor: string, kind: CoupActionKind, target: string | null): string | null {
  const coins = coinsOf(state, actor);
  if (coins >= COUP_MUST_COUP_AT && kind !== 'coup') return 'must_coup';
  if (coins < COUP_COST[kind]) return 'not_enough_coins';
  if (!COUP_TARGETED[kind]) return target === null ? null : 'bad_target';
  if (target === null || target === actor || !isAlive(state, target)) return 'bad_target';
  return null;
}

/** Dá pra duvidar na janela aberta? Do bloqueio, sempre; da ação, só se ela declara personagem. */
export function canChallenge(state: CoupState): boolean {
  const w = state.window;
  if (w === null || state.declared === null) return false;
  if (w.kind === 'block') return true;
  return w.kind === 'action' && COUP_CLAIM[state.declared.kind] !== null;
}

/** `player` pode bloquear na janela aberta? (na da ação ou na só de bloqueio, se é quem bloqueia essa ação) */
export function canBlock(state: CoupState, player: string): boolean {
  if (state.window === null || state.window.kind === 'block' || state.declared === null) return false;
  return blockersOf(state, state.declared).includes(player);
}

/** Tira de `pool` uma cópia de cada carta de `take`; null se alguma não estiver lá. */
export function without(pool: readonly CoupCharacter[], take: readonly CoupCharacter[]): CoupCharacter[] | null {
  const left = [...pool];
  for (const c of take) {
    const i = left.indexOf(c);
    if (i < 0) return null;
    left.splice(i, 1);
  }
  return left;
}
