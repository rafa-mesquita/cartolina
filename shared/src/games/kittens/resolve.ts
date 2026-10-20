import type { GameContext } from '../../game';
import { shuffle } from '../../rng';
import { kittensKindOf } from './cards';
import { latidoOf } from './choices';
import { applyPair, applyTrio } from './combos';
import { kittensIsFavorPlay } from './play';
import { clearPeeks, eliminate, logged, nextAlive, passTo, spendTurn } from './turn';
import { KITTENS_CHOICE_MS, type KittensPlay, type KittensState } from './types';

/**
 * Tatu Latidor `card` (já no descarte) jogado por `by`: outro vivo com o outro Latidor (na mão ou na frente) tem que se
 * defender com um Desarme (escolha `latido`); sem Desarme, explode na hora (mão e Latidor dele pra fora do jogo).
 * Ninguém tem: o Latidor sai do descarte e fica na frente de `by`.
 */
function bark(s: KittensState, by: string, card: string, deadline: number): KittensState {
  const target = s.alive.find((p) => p !== by && latidoOf(s, p) !== undefined) ?? null;
  if (target === null) {
    const front = { ...s.front, [by]: [...(s.front[by] ?? []), card] };
    return logged({ ...s, front, discard: s.discard.filter((c) => c !== card) }, { t: 'barked', by, target: null });
  }
  const next = logged(s, { t: 'barked', by, target });
  if (!next.hands[target]!.some((c) => kittensKindOf(c) === 'cafune')) {
    return eliminate(logged(next, { t: 'boom', by: target }), target);
  }
  return { ...next, choice: { kind: 'latido', who: target, deadline } };
}

/** Mau-olhado: a mão de `target` é embaralhada e ele fica cego até comprar (já cego: embaralha de novo). */
function curse(s: KittensState, by: string, target: string, ctx: GameContext): KittensState {
  const hands = { ...s.hands, [target]: shuffle(ctx.rng, s.hands[target]!) };
  const blind = s.blind.includes(target) ? s.blind : [...s.blind, target];
  return logged({ ...s, hands, blind }, { t: 'cursed', by, target });
}

/** O efeito da jogada que não foi cancelada. `before` = descarte de antes da jogada. */
function applyEffect(s: KittensState, by: string, play: KittensPlay, before: string[], ctx: GameContext): KittensState {
  const deadline = ctx.now + KITTENS_CHOICE_MS;
  switch (play.kind) {
    case 'ataque':
      // Quem estava sob ataque (owed ≥ 2) passa os turnos que devia + 2 (spec §2).
      return passTo(s, nextAlive(s, by), 2 + (s.owed >= 2 ? s.owed : 0));
    case 'pular':
      return spendTurn(s);
    case 'embaralhar':
      return clearPeeks({ ...s, draw: shuffle(ctx.rng, s.draw) });
    case 'espiar': {
      // Troca a espiada anterior de quem jogou; as dos outros ficam (pedido do Rafa, 2026-10-20).
      const cards = s.draw.slice(-3).reverse();
      return cards.length > 0 ? { ...s, peeks: { ...s.peeks, [by]: cards } } : s;
    }
    case 'favor':
      return { ...s, choice: { kind: 'favor', who: play.target!, to: by, left: 1, deadline } };
    case 'latido':
      return bark(s, by, play.cards[0]!, deadline);
    case 'olhado':
      return curse(s, by, play.target!, ctx);
    case 'feitico':
      return { ...s, choice: { kind: 'feitico', who: by, deadline } };
    case 'par':
      return applyPair(s, by, play, ctx);
    case 'trio':
      return applyTrio(s, by, play, ctx);
    case 'cinco':
      return before.length === 0
        ? s
        : { ...s, choice: { kind: 'cinco', who: by, options: before, left: Math.min(2, before.length), deadline } };
  }
}

/**
 * A carta no ar resolve (prazo vencido): Nem vem! em número ímpar cancela (spec §4.2). Também não vale se quem jogou
 * ou o alvo já saiu (e, no Favor e no trio de Favor, se o alvo ficou sem carta). A jogada e os Nem vem! vão pro descarte em qualquer caso
 * (o Latidor que ninguém responde sai de lá e vai pra frente de quem jogou).
 */
export function resolvePending(s: KittensState, ctx: GameContext): KittensState {
  const p = s.pending!;
  const { by, play } = p;
  const base: KittensState = { ...s, pending: null, discard: [...s.discard, ...play.cards, ...p.nopes.map((n) => n.card)] };
  const t = play.target;
  const targetOk = t === null || (base.alive.includes(t) && (!kittensIsFavorPlay(play) || (base.hands[t]?.length ?? 0) > 0));
  const canceled = p.nopes.length % 2 === 1 || !base.alive.includes(by) || !targetOk;
  const done = logged(base, { t: 'resolved', by, play: play.kind, canceled });
  return canceled ? done : applyEffect(done, by, play, s.discard, ctx);
}
