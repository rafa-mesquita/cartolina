// Só para o protótipo: o que a página usa das regras reais do Cúpi.
export { applyCoupAction, initialCoupState, settleCoup } from '../../shared/src/games/coup/rules';
export { coupViewFor } from '../../shared/src/games/coup/view';
export { coupActionSchema } from '../../shared/src/games/coup/schema';
export {
  COUP_ACTION_KINDS,
  COUP_BLOCKERS,
  COUP_CHARACTERS,
  COUP_CLAIM,
  COUP_COST,
  COUP_GAIN,
  COUP_TARGETED,
  COUP_WINDOW_MS,
} from '../../shared/src/games/coup/types';
