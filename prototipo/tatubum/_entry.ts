// Só para o protótipo: o que a página usa das regras reais do Tatubum.
export { applyKittensAction, initialKittensState } from '../../shared/src/games/kittens/rules';
export { settleKittens } from '../../shared/src/games/kittens/settle';
export { kittensViewFor } from '../../shared/src/games/kittens/view';
export { kittensActionSchema } from '../../shared/src/games/kittens/schema';
export { KITTENS_CARD_KINDS, KITTENS_CARD_NAMES, kittensKindOf } from '../../shared/src/games/kittens/cards';
export { KITTENS_CHOICE_MS, KITTENS_NOPE_MS } from '../../shared/src/games/kittens/types';
export { errorMessage } from '../../shared/src/protocol';
export { mulberry32 } from '../../shared/src/rng';
