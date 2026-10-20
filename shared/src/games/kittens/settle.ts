import type { GameContext } from '../../game';
import { chooseAtRandom, leaveMicoWait } from './choices';
import { kittensWithNewFields } from './compat';
import { resolvePending } from './resolve';
import { eliminate, logged } from './turn';
import { KITTENS_CHOICE_MS, type KittensState } from './types';

/**
 * `p` caiu e não voltou em 30 s: a escolha dele é feita ao acaso e ele sai como se tivesse explodido (a mão e o que
 * estiver na frente dele vão pra fora do jogo; se estava cego, deixa de estar).
 */
function leave(state: KittensState, p: string, ctx: GameContext): KittensState {
  let s = state;
  const c = s.choice;
  if (c?.kind === 'mico') {
    // Quem estava na espera sai dela (a mão vai pra fora logo abaixo; se era o último, quem jogou pega uma das
    // descartadas); quem jogou o par pode sair, os outros seguem (e aí ninguém pega nada no fim).
    if (c.waiting.includes(p)) s = leaveMicoWait(s, c, p, null, ctx.now + KITTENS_CHOICE_MS);
  } else if (c?.who === p) s = chooseAtRandom(s, ctx.rng, ctx.now);
  else if (c?.kind === 'favor' && c.to === p) s = { ...s, choice: null };
  // A escolha ao acaso pode ter feito ele explodir (Desarme que sumiu da mão): já saiu.
  if (s.phase !== 'playing' || !s.alive.includes(p)) return s;
  return eliminate(logged(s, { t: 'left', by: p }), p);
}

/**
 * Presença e prazos. Roda antes de cada ação, a cada `tick` da sala e no alarme. Ordem: quem caiu de vez sai;
 * escolha vencida é feita ao acaso; carta no ar vencida resolve. Devolve o MESMO objeto quando nada muda (estado
 * salvo antes das cartas novas ganha `front`/`blind` vazios, e aí volta um objeto novo).
 */
export function settleKittens(saved: KittensState, ctx: GameContext): KittensState {
  const state = kittensWithNewFields(saved);
  if (state.phase !== 'playing') return state;
  let s = state;
  for (const p of state.alive.filter((x) => !ctx.active.includes(x))) {
    if (s.phase !== 'playing') break;
    if (!s.alive.includes(p)) continue;
    s = leave(s, p, ctx);
  }
  if (s.phase !== 'playing') return s;
  if (s.choice && ctx.now >= s.choice.deadline) s = chooseAtRandom(s, ctx.rng, ctx.now);
  if (s.pending && ctx.now >= s.pending.resolvesAt) s = resolvePending(s, ctx);
  return s;
}
