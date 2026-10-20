import type { KittensPeek, KittensState } from './types';

/** Estado como pode ter sido salvo por versões anteriores: sem os campos novos, e com o Espiar antigo (`peek`). */
type SavedKittensState = Omit<KittensState, 'front' | 'blind' | 'peeks'> &
  Partial<Pick<KittensState, 'front' | 'blind' | 'peeks'>> & { peek?: KittensPeek | null };

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
 * Estado salvo antes das cartas novas (2026-10-20) não tem `front` nem `blind`: uma sala guardada no Durable Object no
 * meio de uma partida volta sem eles depois do deploy. Aqui eles entram vazios (ninguém tinha Latidor na frente nem
 * estava cego). Também a escolha do Favor de antes do trio de Favor (2026-10-20) não tem `left`: era sempre 1 carta.
 * E o Espiar de antes de ficar à mostra (2026-10-20) era um só, `peek: { who, cards } | null`: vira `peeks`
 * (`{ [who]: cards }` ou `{}`), e `peek` sai do estado.
 * Devolve o MESMO objeto quando o estado já está completo. Aplicado nas portas de entrada do motor
 * (`applyKittensAction`, `settleKittens`, `kittensViewFor`).
 */
export function kittensWithNewFields(state: KittensState): KittensState {
  const old = state as SavedKittensState;
  const c = old.choice;
  const oldFavor = c?.kind === 'favor' && (c as Partial<typeof c>).left === undefined;
  const oldPeek = old.peeks === undefined || 'peek' in old;
  if (old.front !== undefined && old.blind !== undefined && !oldFavor && !oldPeek) return state;
  const choice = oldFavor ? { ...c, left: 1 } : c;
  const { peek: _peek, ...rest } = old;
  void _peek;
  const peeks = old.peeks ?? peeksOf(old);
  return { ...rest, front: old.front ?? {}, blind: old.blind ?? [], choice, peeks };
}
