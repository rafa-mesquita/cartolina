import type { GameContext } from '../../game';
import { shuffle } from '../../rng';
import { logged, nextAlive, passTo, spendTurn } from './turn';
import { KITTENS_CHOICE_MS, type KittensPlay, type KittensState } from './types';

/** O efeito da jogada que não foi cancelada. `before` = descarte de antes da jogada. */
function applyEffect(s: KittensState, by: string, play: KittensPlay, before: string[], ctx: GameContext): KittensState {
  switch (play.kind) {
    case 'ataque':
      // Quem estava sob ataque (owed ≥ 2) passa os turnos que devia + 2 (spec §2).
      return passTo(s, nextAlive(s, by), 2 + (s.owed >= 2 ? s.owed : 0));
    case 'pular':
      return spendTurn(s);
    case 'embaralhar':
      return { ...s, draw: shuffle(ctx.rng, s.draw), peek: null };
    case 'espiar':
      return { ...s, peek: { who: by, cards: s.draw.slice(-3).reverse() } };
    case 'favor':
      return { ...s, choice: { kind: 'favor', who: play.target!, to: by, deadline: ctx.now + KITTENS_CHOICE_MS } };
    case 'par':
    case 'trio':
      return s;
    case 'cinco':
      return before.length === 0
        ? s
        : { ...s, choice: { kind: 'cinco', who: by, options: before, deadline: ctx.now + KITTENS_CHOICE_MS } };
  }
}

/**
 * A carta no ar resolve (prazo vencido): Nem vem! em número ímpar cancela (spec §4.2). Também não vale se quem jogou
 * ou o alvo já saiu. A jogada e os Nem vem! vão pro descarte em qualquer caso.
 */
export function resolvePending(s: KittensState, ctx: GameContext): KittensState {
  const p = s.pending!;
  const { by, play } = p;
  const base: KittensState = { ...s, pending: null, discard: [...s.discard, ...play.cards, ...p.nopes.map((n) => n.card)] };
  const targetOk = play.target === null || (base.alive.includes(play.target) && (base.hands[play.target]?.length ?? 0) > 0);
  const canceled = p.nopes.length % 2 === 1 || !base.alive.includes(by) || !targetOk;
  const done = logged(base, { t: 'resolved', by, play: play.kind, canceled });
  return canceled ? done : applyEffect(done, by, play, s.discard, ctx);
}
