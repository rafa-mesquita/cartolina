import { canAfford, fail, grant, handSize, logged, ok, pay, portRates, type MandacaruResult } from './build';
import { MANDACARU_BANK_EACH, RESOURCES, noResources, type MandacaruState, type Resource, type Resources } from './types';

const isResource = (r: unknown): r is Resource => (RESOURCES as readonly unknown[]).includes(r);

/** Termos válidos: lados com 1+ carta, nenhum recurso nos dois lados, números inteiros ≥ 0. */
export function validTerms(give: Resources, want: Resources): boolean {
  const whole = (x: Resources) => RESOURCES.every((r) => Number.isInteger(x[r]) && x[r] >= 0);
  if (!whole(give) || !whole(want)) return false;
  if (handSize(give) < 1 || handSize(want) < 1) return false;
  return RESOURCES.every((r) => give[r] === 0 || want[r] === 0);
}

/** Por que `player` não pode mexer na troca agora: fase principal, e quem está na vez (`turn: true`) ou os outros. */
function tradeError(state: MandacaruState, player: string, turn: boolean): string | null {
  if (state.phase !== 'main') return 'bad_phase';
  if (!state.players.includes(player)) return 'not_player';
  if ((state.turn === player) !== turn) return 'not_your_turn';
  return null;
}

/** Copia só os 5 recursos (sem campos a mais vindos de fora). */
const clean = (x: Resources): Resources => {
  const out = noResources();
  for (const r of RESOURCES) out[r] = x[r];
  return out;
};

/** Quem está na vez manda "dou `give`, quero `want`" pra mesa (substitui a oferta anterior). */
export function makeOffer(state: MandacaruState, player: string, give: Resources, want: Resources): MandacaruResult {
  const e = tradeError(state, player, true);
  if (e) return fail(e);
  if (!validTerms(give, want)) return fail('bad_trade');
  if (!canAfford(state.hands[player]!.res, give)) return fail('cannot_afford');
  const id = state.tradeSeq + 1;
  return ok({ ...state, tradeSeq: id, offer: { id, give: clean(give), want: clean(want), accepted: [], rejected: [] } });
}

export function cancelOffer(state: MandacaruState, player: string): MandacaruResult {
  const e = tradeError(state, player, true);
  if (e) return fail(e);
  if (state.offer === null) return fail('stale_offer');
  return ok({ ...state, offer: null });
}

/** Os outros respondem à oferta aberta (aceito/não). Aceitar exige ter o que ela pede. */
export function respond(state: MandacaruState, player: string, offerId: number, accept: boolean): MandacaruResult {
  const e = tradeError(state, player, false);
  if (e) return fail(e);
  const offer = state.offer;
  if (offer === null || offer.id !== offerId) return fail('stale_offer');
  if (accept && !canAfford(state.hands[player]!.res, offer.want)) return fail('cannot_afford');
  const accepted = offer.accepted.filter((p) => p !== player);
  const rejected = offer.rejected.filter((p) => p !== player);
  (accept ? accepted : rejected).push(player);
  return ok({ ...state, offer: { ...offer, accepted, rejected } });
}

/** Contraproposta (ou proposta) de outro jogador pra quem está na vez: `give` é o que ele dá. Substitui a anterior dele. */
export function propose(state: MandacaruState, player: string, give: Resources, want: Resources): MandacaruResult {
  const e = tradeError(state, player, false);
  if (e) return fail(e);
  if (!validTerms(give, want)) return fail('bad_trade');
  if (!canAfford(state.hands[player]!.res, give)) return fail('cannot_afford');
  const id = state.tradeSeq + 1;
  const proposals = [...state.proposals.filter((x) => x.from !== player), { id, from: player, give: clean(give), want: clean(want) }];
  return ok({ ...state, tradeSeq: id, proposals });
}

/** Troca `aGives` de `a` por `bGives` de `b`. */
function swap(state: MandacaruState, a: string, b: string, aGives: Resources, bGives: Resources): MandacaruState {
  // Passa pelo banco e volta: pay + grant mantêm o banco igual no fim.
  let s = pay(state, a, aGives);
  s = pay(s, b, bGives);
  s = grant(s, a, bGives);
  return grant(s, b, aGives);
}

/**
 * Quem está na vez fecha com `other`: quem aceitou a oferta dele, ou aceitando a proposta de `other`.
 * `id` é o da oferta/proposta que ele viu: se ela mudou (ou sumiu) desde o clique, `stale_offer`.
 */
export function closeDeal(
  state: MandacaruState,
  player: string,
  other: string,
  source: 'offer' | 'proposal',
  id: number,
): MandacaruResult {
  const e = tradeError(state, player, true);
  if (e) return fail(e);
  let aGives: Resources;
  let bGives: Resources;
  if (source === 'offer') {
    if (state.offer === null || state.offer.id !== id) return fail('stale_offer');
    if (!state.offer.accepted.includes(other)) return fail('bad_target');
    aGives = state.offer.give;
    bGives = state.offer.want;
  } else {
    const proposal = state.proposals.find((x) => x.from === other);
    if (proposal === undefined) return fail('bad_target');
    if (proposal.id !== id) return fail('stale_offer');
    aGives = proposal.want;
    bGives = proposal.give;
  }
  if (!canAfford(state.hands[player]!.res, aGives) || !canAfford(state.hands[other]!.res, bGives)) return fail('cannot_afford');
  const s = swap(state, player, other, aGives, bGives);
  return ok(logged({ ...s, offer: null, proposals: [] }, { t: 'trade', a: player, b: other, aGives, bGives }));
}

/** Troca com o banco na taxa da feira (4, 3 ou 2 por 1), `count` vezes. */
export function feira(state: MandacaruState, player: string, give: Resource, want: Resource, count = 1): MandacaruResult {
  const e = tradeError(state, player, true);
  if (e) return fail(e);
  if (!isResource(give) || !isResource(want) || give === want) return fail('bad_trade');
  if (!Number.isInteger(count) || count < 1 || count > MANDACARU_BANK_EACH) return fail('bad_trade');
  const gave = count * portRates(state, player)[give];
  if (state.hands[player]!.res[give] < gave) return fail('cannot_afford');
  if (state.bank[want] < count) return fail('bank_empty');
  const cost = { ...noResources(), [give]: gave };
  const gain = { ...noResources(), [want]: count };
  const s = grant(pay(state, player, cost), player, gain);
  return ok(logged(s, { t: 'feira', player, give, gave, want, got: count }));
}
