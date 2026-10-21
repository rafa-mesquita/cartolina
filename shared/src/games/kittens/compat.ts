import type { KittensExit, KittensExitHow, KittensPeek, KittensState } from './types';

/** Campos que versões anteriores não salvavam (sala guardada no Durable Object no meio de uma partida, no deploy). */
type NewFields = 'front' | 'blind' | 'peeks' | 'match' | 'exits' | 'stats';

/** Estado como pode ter sido salvo por versões anteriores: sem os campos novos, e com o Espiar antigo (`peek`). */
type SavedKittensState = Omit<KittensState, NewFields> & Partial<Pick<KittensState, NewFields>> & { peek?: KittensPeek | null };

/**
 * O Espiar antigo (um só, `peek`) vira a entrada de quem espiou em `peeks`, só com as cartas que ainda são o topo do
 * monte, na ordem (sempre eram; a conferência é por garantia), e só se ele ainda está vivo.
 */
function peeksOf(old: SavedKittensState): Record<string, string[]> {
  const peek = old.peek;
  if (!peek || !old.alive.includes(peek.who)) return {};
  let k = 0;
  while (k < peek.cards.length && peek.cards[k] === old.draw[old.draw.length - 1 - k]) k++;
  return k > 0 ? { [peek.who]: peek.cards.slice(0, k) } : {};
}

/**
 * Saídas de uma partida salva antes do histórico (2026-10-20): quem já saiu, na ordem do diário (explodiu ou caiu). Quem
 * saiu antes das entradas que o diário ainda guarda (só as últimas 30) vem primeiro, na ordem dos assentos, como
 * "explodiu" (não dá pra saber).
 */
function exitsOf(old: SavedKittensState): KittensExit[] {
  if (old.phase === 'lobby') return [];
  const gone = old.players.filter((p) => !old.alive.includes(p));
  const logged = new Map<string, KittensExitHow>();
  for (const { ev } of old.log) {
    if ((ev.t === 'boom' || ev.t === 'left') && gone.includes(ev.by) && !logged.has(ev.by)) logged.set(ev.by, ev.t);
  }
  const early = gone.filter((p) => !logged.has(p)).map((player): KittensExit => ({ player, how: 'boom' }));
  return [...early, ...[...logged].map(([player, how]) => ({ player, how }))];
}

/**
 * Estado salvo antes das cartas novas (2026-10-20) não tem `front` nem `blind`: uma sala guardada no Durable Object no
 * meio de uma partida volta sem eles depois do deploy. Aqui eles entram vazios (ninguém tinha Latidor na frente nem
 * estava cego). Também a escolha do Favor de antes do trio de Favor (2026-10-20) não tem `left`: era sempre 1 carta.
 * E o Espiar de antes de ficar à mostra (2026-10-20) era um só, `peek: { who, cards } | null`: vira `peeks`
 * (`{ [who]: cards }` ou `{}`), e `peek` sai do estado.
 * O par de Mico de antes da pegada no fim (2026-10-20) não tem `discarded`: entra vazio (o que já tinha sido
 * descartado antes do deploy não conta; quem jogou pega uma das que forem descartadas daqui pra frente).
 * O histórico (2026-10-20) trouxe `match` (entra 0), `exits` (refeitas pelo diário, ver `exitsOf`) e `stats` (entra
 * vazio: os Nem vem! e Desarmes de antes do deploy não contam).
 * Devolve o MESMO objeto quando o estado já está completo. Aplicado nas portas de entrada do motor
 * (`applyKittensAction`, `settleKittens`, `kittensViewFor`) e no registro do histórico.
 */
export function kittensWithNewFields(state: KittensState): KittensState {
  const old = state as SavedKittensState;
  const c = old.choice;
  const oldFavor = c?.kind === 'favor' && (c as Partial<typeof c>).left === undefined;
  const oldMico = c?.kind === 'mico' && (c as Partial<typeof c>).discarded === undefined;
  const oldPeek = old.peeks === undefined || 'peek' in old;
  const oldHistory = old.match === undefined || old.exits === undefined || old.stats === undefined;
  if (old.front !== undefined && old.blind !== undefined && !oldFavor && !oldMico && !oldPeek && !oldHistory) return state;
  const choice = oldFavor ? { ...c, left: 1 } : oldMico ? { ...c, discarded: [] } : c;
  const { peek: _peek, ...rest } = old;
  void _peek;
  const peeks = old.peeks ?? peeksOf(old);
  return {
    ...rest,
    front: old.front ?? {},
    blind: old.blind ?? [],
    choice,
    peeks,
    match: old.match ?? 0,
    exits: old.exits ?? exitsOf(old),
    stats: old.stats ?? {},
  };
}
