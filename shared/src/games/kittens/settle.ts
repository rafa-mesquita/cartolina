import type { GameContext } from '../../game';
import { chooseAtRandom } from './choices';
import { resolvePending } from './resolve';
import { eliminate, logged } from './turn';
import type { KittensState } from './types';

/**
 * `p` caiu e não voltou em 30 s: a escolha dele é feita ao acaso e ele sai como se tivesse explodido (a mão e o que
 * estiver na frente dele vão pra fora do jogo; se estava cego, deixa de estar).
 */
function leave(state: KittensState, p: string, ctx: GameContext): KittensState {
  let s = state;
  const c = s.choice;
  if (c?.kind === 'mico') {
    // Quem estava na espera sai dela (a mão vai pra fora logo abaixo); quem jogou o par pode sair, os outros seguem.
    const waiting = c.waiting.filter((x) => x !== p);
    if (waiting.length !== c.waiting.length) s = { ...s, choice: waiting.length > 0 ? { ...c, waiting } : null };
  } else if (c?.who === p) s = chooseAtRandom(s, ctx.rng);
  else if (c?.kind === 'favor' && c.to === p) s = { ...s, choice: null };
  // A escolha ao acaso pode ter feito ele explodir (Desarme que sumiu da mão): já saiu.
  if (s.phase !== 'playing' || !s.alive.includes(p)) return s;
  return eliminate(logged(s, { t: 'left', by: p }), p);
}

/**
 * Presença e prazos. Roda antes de cada ação, a cada `tick` da sala e no alarme. Ordem: quem caiu de vez sai;
 * escolha vencida é feita ao acaso; carta no ar vencida resolve. Devolve o MESMO objeto quando nada muda.
 */
export function settleKittens(state: KittensState, ctx: GameContext): KittensState {
  if (state.phase !== 'playing') return state;
  let s = state;
  for (const p of state.alive.filter((x) => !ctx.active.includes(x))) {
    if (s.phase !== 'playing') break;
    if (!s.alive.includes(p)) continue;
    s = leave(s, p, ctx);
  }
  if (s.phase !== 'playing') return s;
  if (s.choice && ctx.now >= s.choice.deadline) s = chooseAtRandom(s, ctx.rng);
  if (s.pending && ctx.now >= s.pending.resolvesAt) s = resolvePending(s, ctx);
  return s;
}
