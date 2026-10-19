import { describe, expect, it } from 'vitest';
import type { GameContext } from '../src/game';
import { fullDeck } from '../src/games/coup/deck';
import { applyCoupAction, initialCoupState } from '../src/games/coup/rules';
import { treasury } from '../src/games/coup/table';
import { COUP_TARGETED, type CoupAction, type CoupState } from '../src/games/coup/types';
import { coupViewFor } from '../src/games/coup/view';
import { mulberry32, randomInt, shuffle, type Rng } from '../src/rng';
import { T0, cardsOf, ids } from './coup-helpers';

/** Uma jogada sorteada pra `me`, só com o que a visão dele mostra (como um bot faria); null = nada a fazer. */
function randomMove(state: CoupState, me: string, rng: Rng): CoupAction | null {
  const view = coupViewFor(state, me);
  const can = view.can;
  if (can.lose) return { type: 'lose', card: view.myCards[randomInt(rng, view.myCards.length)]! };
  if (can.keep > 0) return { type: 'exchange', keep: shuffle(rng, [...view.myCards, ...view.myDrawn]).slice(0, can.keep) };
  if (can.act.length > 0) {
    const kind = can.act[randomInt(rng, can.act.length)]!;
    if (!COUP_TARGETED[kind]) return { type: 'act', kind };
    return { type: 'act', kind, target: can.targets[randomInt(rng, can.targets.length)]! };
  }
  if (!can.pass) return null;
  // Como o site: a reação leva o id da janela que o jogador viu.
  const windowId = view.window!.id;
  const r = rng();
  if (can.challenge && r < 0.15) return { type: 'challenge', windowId };
  if (can.block.length > 0 && r < 0.35) return { type: 'block', as: can.block[randomInt(rng, can.block.length)]!, windowId };
  return { type: 'pass', windowId };
}

/** Quantas vezes cada situação apareceu nas partidas sorteadas (o último teste confere que nenhuma ficou de fora). */
const cobertura = { challenge: 0, block: 0, blocked: 0, lose: 0, blockOnly: 0 };

function playOut(n: number, seed: number): CoupState {
  const rng = mulberry32(seed);
  const ctx: GameContext = { hostId: 'p0', active: ids(n), rng, now: T0 };
  const start = applyCoupAction(initialCoupState(), 'p0', { type: 'start' }, ctx);
  if (!start.ok) throw new Error(`seed ${seed}: ${start.error}`);
  let state = start.state;
  let lastBlockOnly: number | null = null;
  const deck = [...fullDeck()].sort();
  for (let step = 0; step < 3000; step++) {
    if (state.phase === 'over') {
      for (const entry of state.log) if (entry.t in cobertura) cobertura[entry.t as keyof typeof cobertura]++;
      return state;
    }
    const moves = state.players.flatMap((p) => {
      const move = randomMove(state, p, rng);
      return move ? [{ p, move }] : [];
    });
    if (moves.length === 0) throw new Error(`seed ${seed}, passo ${step}: ninguém pode jogar na fase ${state.phase}`);
    const { p, move } = moves[randomInt(rng, moves.length)]!;
    const res = applyCoupAction(state, p, move, ctx);
    if (!res.ok) throw new Error(`seed ${seed}, passo ${step}: ${p} ${JSON.stringify(move)} recusada: ${res.error}`);
    state = res.state;
    // Cada janela blockOnly conta uma vez (o id muda quando abre outra).
    if (state.window?.kind === 'blockOnly' && state.window.id !== lastBlockOnly) {
      cobertura.blockOnly++;
      lastBlockOnly = state.window.id;
    }
    const onde = `seed ${seed} passo ${step}`;
    expect(cardsOf(state), onde).toEqual(deck);
    expect(treasury(state), onde).toBeGreaterThanOrEqual(0);
    for (const q of state.players) expect(state.hands[q]!.coins, `${onde} ${q}`).toBeGreaterThanOrEqual(0);
  }
  throw new Error(`seed ${seed}: a partida não acabou`);
}

describe('Cúpi: partidas sorteadas', () => {
  it.each([2, 3, 4, 5, 6])('com %i jogadores, 20 partidas terminam sem jogada recusada nem carta sumida', (n) => {
    for (let i = 1; i <= 20; i++) {
      const seed = i * 31 + n;
      const state = playOut(n, seed);
      expect(state.winner, `seed ${seed}`).not.toBeNull();
      expect(state.out, `seed ${seed}`).toHaveLength(n - 1);
      expect(state.wins[state.winner!], `seed ${seed}`).toBe(1);
    }
  });

  // Sem isso, uma mudança que faça a visão parar de oferecer dúvida ou bloqueio deixaria o teste passando sem testar nada.
  it('as 100 partidas passaram por dúvida, bloqueio, bloqueio barrado, perda de carta e janela só de bloqueio', () => {
    for (const [nome, vezes] of Object.entries(cobertura)) expect(vezes, nome).toBeGreaterThan(0);
  });
});
