import { shuffle, type Rng } from '../../rng';
import { fail, logged, ok, type MandacaruResult } from './build';
import { CORDEIS, CORDEL_COUNTS, type CordelKind, type MandacaruState, type Resource } from './types';

/** Os 25 cordéis embaralhados. */
export function shuffledCordelDeck(rng: Rng): CordelKind[] {
  return shuffle(
    rng,
    CORDEIS.flatMap((k) => Array<CordelKind>(CORDEL_COUNTS[k]).fill(k)),
  );
}

/**
 * Joga um cordel `kind` de `player`: confere 1 por turno (`cordel_used`) e que não é o comprado agora
 * (`cordel_fresh`); tira da mão, marca o cordel do turno e anota no diário.
 */
export function takeCordel(
  state: MandacaruState,
  player: string,
  kind: Exclude<CordelKind, 'point'>,
  extra: { resources?: Resource[]; total?: number } = {},
): MandacaruResult {
  if (state.cordelPlayed) return fail('cordel_used');
  const hand = state.hands[player]!;
  const i = hand.cordeis.findIndex((c) => c.kind === kind && !c.fresh);
  if (i < 0) return fail(hand.cordeis.some((c) => c.kind === kind) ? 'cordel_fresh' : 'no_cordel');
  const cordeis = hand.cordeis.filter((_, j) => j !== i);
  const s: MandacaruState = { ...state, cordelPlayed: true, hands: { ...state.hands, [player]: { ...hand, cordeis } } };
  return ok(logged(s, { t: 'play', player, kind, ...extra }));
}
