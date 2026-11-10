import { shuffle, type Rng } from '../../rng';
import { fail, grant, logged, ok, piecesLeft, roadSpots, type MandacaruResult } from './build';
import { CORDEIS, CORDEL_COUNTS, RESOURCES, noResources, type CordelKind, type MandacaruState, type Resource } from './types';

const isResource = (r: unknown): r is Resource => (RESOURCES as readonly unknown[]).includes(r);

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

/** Mutirão: até 2 estradas de graça (fase `mutirao`). Sem peça ou sem lugar de estrada, é recusado (`bad_spot`) e a carta fica. */
export function playMutirao(state: MandacaruState, player: string): MandacaruResult {
  const played = takeCordel(state, player, 'mutirao');
  if (!played.ok) return played;
  const left = Math.min(2, piecesLeft(state, player).road);
  if (left === 0 || roadSpots(state, player).length === 0) return fail('bad_spot');
  return ok({ ...played.state, phase: 'mutirao', mutiraoLeft: left });
}

/** Chuva no sertão: 2 recursos quaisquer do banco (podem ser iguais; o banco precisa ter). */
export function playChuva(state: MandacaruState, player: string, resources: [Resource, Resource]): MandacaruResult {
  if (resources.length !== 2 || !resources.every(isResource)) return fail('bad_trade');
  const gain = noResources();
  for (const r of resources) gain[r]++;
  const played = takeCordel(state, player, 'chuva', { resources: [...resources] });
  if (!played.ok) return played;
  if (RESOURCES.some((r) => state.bank[r] < gain[r])) return fail('bank_empty');
  return ok(grant(played.state, player, gain));
}

/** Atravessador: todos os outros entregam tudo que têm de `resource`. */
export function playAtravessador(state: MandacaruState, player: string, resource: Resource): MandacaruResult {
  if (!isResource(resource)) return fail('bad_trade');
  let total = 0;
  const hands = { ...state.hands };
  for (const p of state.players) {
    if (p === player) continue;
    const hand = hands[p]!;
    const n = hand.res[resource];
    if (n === 0) continue;
    total += n;
    hands[p] = { ...hand, res: { ...hand.res, [resource]: 0 } };
  }
  const mine = hands[player]!;
  hands[player] = { ...mine, res: { ...mine.res, [resource]: mine.res[resource] + total } };
  return takeCordel({ ...state, hands }, player, 'atravessador', { resources: [resource], total });
}
